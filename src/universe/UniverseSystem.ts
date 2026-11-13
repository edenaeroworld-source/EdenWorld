/**
 * O sistema que costura o universo.
 *
 * Cada parte da expansão — regiões, economia, moradia, bichos, fauna,
 * atividades, interiores — é um módulo puro que não conhece os outros.
 * É aqui que eles se encontram, e é de propósito: as regras que cruzam
 * sistemas ("comprar uma casa debita cristais", "viajar leva os bichos
 * junto", "adotar conta para a atividade da Saturno") vivem num lugar
 * só, em vez de espalhadas por sete módulos que passariam a depender
 * uns dos outros.
 *
 * Implementa `GameSystem`, então entra no `SystemRegistry` como
 * qualquer outro sistema do jogo.
 */

import type { GameSystem } from '../core/GameSystem';
import { Economy, type EconomySaveData } from '../economy/Economy';
import { type EdenStore, getItem, getStore } from '../economy/Items';
import { Housing, type HousingSaveData, getProperty } from '../housing/Housing';
import { InteriorManager, type InteriorSaveData } from '../interiors/InteriorManager';
import type { ExitPoint } from '../interiors/Interior';
import { MissionLog, type MissionCompletion, type MissionSaveData, type WorldFact, getMission } from '../missions/Missions';
import { PetManager, type PetNeed, type PetPersonality, type PetSaveData } from '../creatures/PetManager';
import { WildlifeGuide, type SightingSaveData } from '../creatures/Wildlife';
import { getSpecies } from '../creatures/Species';
import { RegionManager, type RegionPosition, type RegionSaveData, type TravelEvent } from '../regions/RegionManager';
import { REGIONS, getRegion } from '../regions/Region';

export interface UniverseSaveData {
  regions: RegionSaveData;
  economy: EconomySaveData;
  housing: HousingSaveData;
  pets: PetSaveData;
  sightings: SightingSaveData;
  missions: MissionSaveData;
  interiors: InteriorSaveData;
}

/** Aviso curto para mostrar ao jogador. */
export interface UniverseNotice {
  kind: 'descoberta' | 'viagem' | 'compra' | 'atividade' | 'bicho' | 'aviso';
  text: string;
}

export type NoticeListener = (notice: UniverseNotice) => void;

/** Minutos de jogo por segundo real, para o desgaste das necessidades. */
const GAME_MINUTES_PER_SECOND = 24 * 60 / (24 * 60);

export class UniverseSystem implements GameSystem {
  readonly id = 'universe';

  readonly regions: RegionManager;
  readonly economy: Economy;
  readonly housing: Housing;
  readonly pets: PetManager;
  readonly wildlife: WildlifeGuide;
  readonly missions: MissionLog;
  readonly interiors: InteriorManager;

  private readonly notices = new Set<NoticeListener>();
  /** Acumula tempo para não mexer nas necessidades a cada quadro. */
  private careTimer = 0;

  constructor(data: UniverseSaveData) {
    this.regions = new RegionManager(data.regions);
    this.economy = new Economy(data.economy);
    this.housing = new Housing(data.housing);
    this.pets = new PetManager(data.pets);
    this.wildlife = new WildlifeGuide(data.sightings);
    this.missions = new MissionLog(data.missions);
    this.interiors = new InteriorManager(data.interiors);

    // Viajar é um fato do mundo: os bichos acompanham e as atividades
    // que pediam para chegar a algum lugar avançam sozinhas.
    this.regions.onTravel((event) => this.afterTravel(event));
    this.regions.onDiscovery((region) => {
      this.notify({ kind: 'descoberta', text: `Você descobriu ${region.name}: ${region.tagline}` });
    });
  }

  onNotice(listener: NoticeListener): () => void {
    this.notices.add(listener);
    return () => this.notices.delete(listener);
  }

  private notify(notice: UniverseNotice): void {
    for (const listener of this.notices) listener(notice);
  }

  /** Registra um fato e entrega as recompensas das atividades fechadas. */
  private record(fact: WorldFact): MissionCompletion[] {
    const finished = this.missions.record(fact);
    for (const completion of finished) {
      if (completion.crystals > 0) this.economy.earn(completion.crystals, `Atividade: ${completion.mission.title}`);
      for (const itemId of completion.items) this.economy.restore(itemId, 1);
      this.notify({ kind: 'atividade', text: `Atividade concluída: ${completion.mission.title}` });
    }
    return finished;
  }

  private afterTravel(event: TravelEvent): void {
    this.pets.moveTo(event.to);
    // Sair de um interior é obrigatório ao trocar de região: o prédio
    // fica na região que o jogador acabou de deixar.
    if (this.interiors.isInside) this.interiors.leave();
    const region = getRegion(event.to);
    if (region) this.notify({ kind: 'viagem', text: `Você chegou a ${region.name}.` });
    this.record({ kind: 'visitar-regiao', target: event.to });
  }

  /* ------------------------------ viagem ------------------------------ */

  /** Viaja, guardando onde o jogador estava. */
  travelTo(regionId: string, from?: RegionPosition): TravelEvent | null {
    const blocker = this.regions.travelBlocker(regionId);
    if (blocker) {
      this.notify({ kind: 'aviso', text: blocker });
      return null;
    }
    return this.regions.travelTo(regionId, from);
  }

  discoverRegion(regionId: string): boolean {
    return this.regions.discover(regionId);
  }

  /* ------------------------------ compras ----------------------------- */

  /** Compra um item numa loja, pela hora atual do mundo. */
  buy(storeId: string, itemId: string, quantity = 1, hour = 12): boolean {
    const store = getStore(storeId);
    if (!store) return false;
    const result = this.economy.purchase(store, itemId, quantity, hour);
    this.notify({ kind: result.ok ? 'compra' : 'aviso', text: result.message });
    if (result.ok) this.record({ kind: 'comprar', target: itemId });
    return result.ok;
  }

  /** Lojas abertas agora na região em que o jogador está. */
  openStoresHere(hour: number): EdenStore[] {
    const region = this.regions.current;
    return region.shops
      .map((id) => getStore(id))
      .filter((store): store is EdenStore => Boolean(store))
      .filter((store) => {
        const h = ((hour % 24) + 24) % 24;
        if (store.opens === 0 && store.closes === 24) return true;
        return store.opens <= store.closes ? h >= store.opens && h < store.closes : h >= store.opens || h < store.closes;
      });
  }

  /* ------------------------------ moradia ----------------------------- */

  /**
   * Compra ou aluga um imóvel.
   *
   * O pagamento acontece aqui, e não em `Housing`: a casa não conhece a
   * carteira, e é por isso que a regra de "não dá para morar fiado"
   * precisa de alguém que conheça as duas.
   */
  acquireHome(propertyId: string, tenure: 'comprada' | 'alugada' = 'comprada'): boolean {
    const property = getProperty(propertyId);
    if (!property) return false;
    if (this.housing.owns(propertyId)) {
      this.notify({ kind: 'aviso', text: 'Você já mora aqui.' });
      return false;
    }
    const price = tenure === 'comprada' ? property.price : property.rent;
    if (this.economy.crystals < price) {
      this.notify({ kind: 'aviso', text: `Faltam ${price - this.economy.crystals} cristais.` });
      return false;
    }

    // Debita primeiro: se o débito falhar, ninguém ganha casa de graça.
    if (!this.economy.spend(price, `${tenure === 'comprada' ? 'Compra' : 'Aluguel'} · ${property.name}`)) return false;
    if (!this.housing.acquire(propertyId, tenure)) {
      // Não deveria acontecer (já checamos acima), mas se acontecer o
      // dinheiro volta: o jogador não paga por nada.
      this.economy.earn(price, `Estorno · ${property.name}`);
      return false;
    }
    this.notify({ kind: 'compra', text: `${property.name} agora é seu endereço.` });
    this.record({ kind: 'morar', target: propertyId });
    return true;
  }

  /** Coloca um móvel do inventário na casa. Tira do inventário ao colocar. */
  placeFurniture(propertyId: string, itemId: string, roomId: string, x: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): boolean {
    if (!this.economy.has(itemId, 1)) {
      this.notify({ kind: 'aviso', text: 'Você não tem esse item.' });
      return false;
    }
    const result = this.housing.place(propertyId, itemId, roomId, x, z, rotation);
    if (!result.ok) {
      this.notify({ kind: 'aviso', text: result.message });
      return false;
    }
    this.economy.consume(itemId, 1);
    this.record({ kind: 'decorar', target: itemId });
    return true;
  }

  /** Tira o móvel da casa e devolve ao inventário. */
  retrieveFurniture(propertyId: string, placedId: string): boolean {
    const itemId = this.housing.remove(propertyId, placedId);
    if (!itemId) return false;
    this.economy.restore(itemId, 1);
    return true;
  }

  /* ------------------------------- bichos ----------------------------- */

  adoptPet(speciesId: string, name: string, personality: PetPersonality = 'tranquilo'): boolean {
    const result = this.pets.adopt(speciesId, name, personality, this.regions.currentRegionId);
    this.notify({ kind: result.ok ? 'bicho' : 'aviso', text: result.message });
    if (result.ok) this.record({ kind: 'adotar', target: speciesId });
    return result.ok;
  }

  /**
   * Usa um item de bicho: a comida some, a necessidade sobe.
   *
   * Brinquedo e escova não somem — são objetos, não consumo. É a
   * diferença entre dar ração e jogar bola.
   */
  usePetItem(petId: string, itemId: string): boolean {
    const item = getItem(itemId);
    if (!item?.pet || !this.economy.has(itemId, 1)) {
      this.notify({ kind: 'aviso', text: 'Você não tem isso.' });
      return false;
    }
    if (!this.pets.care(petId, item.pet.need as PetNeed, item.pet.amount)) return false;
    if (item.pet.need === 'fome') this.economy.consume(itemId, 1);
    this.record({ kind: 'cuidar', target: petId });
    return true;
  }

  /** Carinho: não gasta nada, e é o que mais funciona. */
  petPet(petId: string): boolean {
    if (!this.pets.care(petId, 'carinho', 0.35)) return false;
    this.record({ kind: 'cuidar', target: petId });
    return true;
  }

  /* -------------------------------- fauna ----------------------------- */

  /** Registra um avistamento. Avisa só na primeira vez da espécie. */
  sightSpecies(speciesId: string): boolean {
    const first = this.wildlife.sight(speciesId);
    if (first) {
      const species = getSpecies(speciesId);
      if (species) this.notify({ kind: 'descoberta', text: `Novo no guia: ${species.name}. ${species.note}` });
      this.record({ kind: 'avistar', target: speciesId });
    }
    return first;
  }

  /* ----------------------------- interiores --------------------------- */

  enterInterior(interiorId: string, exit: ExitPoint): boolean {
    const visit = this.interiors.enter(interiorId, exit);
    if (!visit) return false;
    this.record({ kind: 'entrar-interior', target: interiorId });
    return true;
  }

  leaveInterior(): ExitPoint | null {
    return this.interiors.leave();
  }

  /* ---------------------------- atividades ---------------------------- */

  startMission(missionId: string): boolean {
    const ok = this.missions.start(missionId);
    if (!ok) return false;
    this.notify({ kind: 'atividade', text: 'Atividade aceita.' });
    // Quem pede que você vá a um lugar diz onde ele fica. Sem isto, uma
    // atividade poderia exigir uma viagem que o jogo recusa — foi
    // exatamente o que um teste de tela pegou.
    for (const objective of getMission(missionId)?.objectives ?? []) {
      if (objective.kind === 'visitar-regiao' && objective.target) this.regions.discover(objective.target);
    }
    return true;
  }

  /**
   * Conversar com alguém é um fato do mundo como qualquer outro.
   *
   * E é também como se descobre o Éden: quem cuida de uma região fala
   * dela. É assim que as regiões de indicação entram no mapa — Lilly
   * conta de Bitnara e SkyStones, Saturno conta de Rosas Park.
   *
   * As regiões de exploração ficam de fora de propósito: Noureja Nether
   * e o Jardim Proibido têm de ser achados, não contados.
   */
  talkedTo(characterId: string): void {
    for (const region of REGIONS) {
      if (region.access === 'indicacao' && region.patrons.includes(characterId)) this.regions.discover(region.id);
    }
    this.record({ kind: 'conversar', target: characterId });
  }

  /* ------------------------------- ciclo ------------------------------ */

  update(dt: number): void {
    if (this.pets.count === 0) return;
    this.careTimer += dt;
    // Uma vez por segundo é suficiente: as necessidades levam horas.
    if (this.careTimer < 1) return;
    this.pets.tick(this.careTimer * GAME_MINUTES_PER_SECOND);
    this.careTimer = 0;
  }

  toJSON(): UniverseSaveData {
    return {
      regions: this.regions.toJSON(),
      economy: this.economy.toJSON(),
      housing: this.housing.toJSON(),
      pets: this.pets.toJSON(),
      sightings: this.wildlife.toJSON(),
      missions: this.missions.toJSON(),
      interiors: this.interiors.toJSON(),
    };
  }
}
