import * as THREE from 'three';
import type { AftersBodySystem } from '../afters/AftersBodySystem';
import { type AftersBody, type AftersChannelId, clampIntensity, fromPercent, getAftersPreset, sanitizeAftersBody, toPercent } from '../afters/AftersState';
import type { CharacterGround } from '../characters/CharacterGround';
import { createOfficialAvatar } from '../characters/CharacterModels';
import { PANTHEON, type EdenCharacter } from '../characters/Pantheon';
import { characterPersona } from '../characters/Personas';
import type { GameSystem } from '../core/GameSystem';
import type { Interactable } from '../interactions/Interactable';
import { Avatar } from '../player/Avatar';
import { AvatarAnimator } from '../player/AvatarAnimator';
import type { QualityProfile } from '../systems/QualitySystem';
import { createRng, type Rng } from '../utils/math';
import type { DayPeriod } from '../world/WorldClock';
import { citizenAftersId, makeCitizen } from './CitizenData';
import { CitizenSim } from './CitizenSim';
import { DestinationBoard } from './DestinationBoard';
import { getRegion } from '../regions/Region';
import { KEEP_OUT_CLEARANCE, insideKeepOut, keepOutsFor, pushOutOfKeepOut } from '../world/KeepOut';
import { NpcLife } from './NpcLife';
import { buildAuroraWalkNetwork, buildRosasWalkNetwork, type WalkNetwork } from './WalkNetwork';
import { AREAS, type NamedArea } from '../cities/aurora-city/Layout';
import { BASIN as ROSAS_BASIN, LAKE_ISLAND as ROSAS_ISLAND, PAVILIONS as ROSAS_PAVILIONS, ROSE_GARDEN } from '../cities/rosas-park/RosasLayout';

/**
 * A população de Aurora City.
 *
 * - **Cidadãos**: simulados o tempo todo como dados leves (posição sobre a
 *   rede de caminhada) e desenhados com avatares completos apenas perto do
 *   jogador, por meio de um conjunto reutilizável ("pool").
 * - **Panteão**: personagens oficiais em pontos fixos da cidade, com aura,
 *   plaquinha de nome e conversa própria.
 */

export interface NpcSystemOptions {
  scene: THREE.Scene;
  /** Altura do terreno em um ponto. */
  ground: (x: number, z: number) => number;
  /** `true` onde ninguém pode andar (água, edifício, zona reservada). */
  blocked: (x: number, z: number) => boolean;
  /**
   * Chão e colisão da região montada.
   *
   * É o que faz os habitantes pisarem no estrado da praça e no
   * tabuleiro das pontes — e esbarrarem em árvore, banco e poste em
   * vez de atravessá-los. Opcional porque a simulação pura (sem cena
   * 3D) continua válida sem ele.
   */
  body?: CharacterGround;
  quality: QualityProfile;
  seed?: number;
  /**
   * Região em que a população começa.
   *
   * Dar a região já no construtor é o que faz a primeira carga e a
   * viagem percorrerem o mesmo caminho: abrir o jogo salvo em Rosas
   * Park monta Rosas Park, e não Aurora com o cenário de Rosas.
   */
  regionId?: string;
}

/*
 * Quantos habitantes aparecem ao mesmo tempo, a que distância e com que
 * frequência a simulação avança **não** se decide aqui: vem tudo do
 * `QualityProfile`. Já houve uma tabela local com esses números, e ter
 * dois lugares definindo "qualidade" é como ter dois relógios na parede.
 */

/** População simulada de Aurora City (custo desprezível: é só matemática). */
const CITIZEN_COUNT = 54;
/**
 * Máximo de lugares de desenho. Os pontos de conversa são criados aqui,
 * de uma vez, para que a lista entregue ao sistema de interação nunca mude.
 */
const MAX_SLOTS = 18;

/**
 * Distância mínima (m) entre dois personagens do panteão.
 *
 * Um pouco mais larga que o raio de conversa, para que dois deuses
 * próximos continuem sendo duas pessoas distintas na tela e no alvo
 * da interação — e não um dentro do outro.
 */
const PLACE_SPACING = 4.5;

/** Distância (m) em que um personagem do panteão aparece. */
const DEITY_RANGE = 150;
/** Distância (m) em que a plaquinha com o nome some. */
const LABEL_RANGE = 46;
/** Distância (m) entre dois habitantes para um bate-papo começar. */
const CHAT_RANGE = 2.6;
/** Distância (m) abaixo da qual dois habitantes se empurram. */
const PERSONAL_SPACE = 0.72;
/** Intervalo (s) entre tentativas de formar uma dupla de conversa. */
const CHAT_INTERVAL = 3.5;
/**
 * Folga do raio de desenho: entra em `npcRange`, sai só em `npcRange × isto`.
 * Impede que quem anda na borda entre e saia de cena a cada segundo.
 */
const VISIBLE_HYSTERESIS = 1.3;

interface VisualSlot {
  /** Criado sob demanda (um por quadro, no máximo). */
  avatar: Avatar | null;
  animator: AvatarAnimator;
  citizen: CitizenSim | null;
  interactable: Interactable;
  /** Ator Afters ligado ao avatar deste lugar, se houver. */
  aftersId: string | null;
}

interface DeityNpc {
  character: EdenCharacter;
  /** Expressão, gestos e atenção do personagem. */
  life: NpcLife;
  x: number;
  y: number;
  z: number;
  heading: number;
  avatar: Avatar | null;
  animator: AvatarAnimator;
  aura: THREE.Mesh | null;
  label: THREE.Sprite | null;
  interactable: Interactable;
  /** Ator Afters do personagem, quando ele usa a tecnologia. */
  aftersId: string | null;
}

/** Identificador do ator Afters de um personagem do panteão. */
export function characterAftersId(characterId: string): string {
  return `divino:${characterId}`;
}

/**
 * Eventos da cidade que mudam a silhueta de quem usa Afters.
 *
 * `noite` é disparado pelo relógio do mundo; os demais existem para
 * roteiro (uma cena, um show no Palco Aurora, uma conversa).
 */
export type AftersCityEvent = 'normal' | 'noite' | 'palco' | 'desligado';

function auraMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Plaquinha flutuante com o nome do personagem (textura de canvas). */
function nameSprite(name: string, title: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const radius = 26;
    ctx.fillStyle = 'rgba(8, 28, 48, 0.55)';
    ctx.beginPath();
    // `roundRect` é recente: sem ele, a plaquinha vira um retângulo simples.
    if (typeof ctx.roundRect === 'function') ctx.roundRect(8, 18, canvas.width - 16, 92, radius);
    else ctx.rect(8, 18, canvas.width - 16, 92);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 44px system-ui, sans-serif';
    ctx.fillText(name, canvas.width / 2, 66);
    ctx.fillStyle = color;
    ctx.font = '400 26px system-ui, sans-serif';
    ctx.fillText(title, canvas.width / 2, 98);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(2.4, 0.6, 1);
  sprite.renderOrder = 4;
  return sprite;
}

/**
 * Os lugares com nome de cada região, que é para onde as rotinas levam.
 *
 * Aurora já tinha a sua lista na planta da cidade. Rosas Park não
 * tinha nenhuma, e era por isso que as rotinas não pegavam lá: os
 * arquétipos pedem 'praca' ou 'mirante' e a busca não achava nada,
 * então ninguém no parque tinha hora nem lugar para estar. Aqui o
 * parque ganha a dele, tirada da própria planta — pavilhões,
 * roseiral, ilha do lago, bacia das quedas.
 */
function regionAreas(regionId: string): readonly NamedArea[] {
  return regionId === 'rosas-park' ? ROSAS_AREAS : AREAS;
}

const ROSAS_AREAS: readonly NamedArea[] = [
  { id: 'roseiral', name: 'Roseiral Maior', x: ROSE_GARDEN.x, z: ROSE_GARDEN.z, radius: 44 },
  { id: 'ilha-lago', name: 'Ilha das Lontras', x: ROSAS_ISLAND.x, z: ROSAS_ISLAND.z, radius: 20 },
  { id: 'quedas', name: 'Pé das Quedas', x: ROSAS_BASIN.x, z: ROSAS_BASIN.z, radius: 34 },
  ...ROSAS_PAVILIONS.map((pavilion) => ({
    id: pavilion.id,
    name: pavilion.name,
    x: pavilion.x,
    z: pavilion.z,
    radius: Math.max(16, pavilion.radius * 2),
  })),
];

export class NpcSystem implements GameSystem {
  readonly id = 'npcs';
  readonly group = new THREE.Group();
  network: WalkNetwork;
  /** Pontos de conversa (cidadãos próximos + panteão). */
  readonly interactables: Interactable[] = [];
  /** Desligado em menus e no criador de avatar. */
  enabled = true;

  private readonly scene: THREE.Scene;
  private readonly ground: (x: number, z: number) => number;
  private readonly blocked: (x: number, z: number) => boolean;
  private body: CharacterGround | null;
  private regionId = 'aurora-city';
  private readonly rng: Rng;
  private readonly citizens: CitizenSim[] = [];
  /** Quem está indo para onde — o que impede 54 pessoas no mesmo ponto. */
  private readonly board = new DestinationBoard();
  private readonly slots: VisualSlot[] = [];
  private readonly deities: DeityNpc[] = [];
  private readonly auraGeometry: THREE.RingGeometry;
  private readonly focus = new THREE.Vector3();
  private maxVisible: number;
  private visibleRange: number;
  private shadows: boolean;
  private assignTimer = 0;
  private chatTimer = 0;
  /** Passos por segundo da simulação dos habitantes (0 = todo quadro). */
  private simHz: number;
  private routinePerFrame: number;
  /** Tempo acumulado desde o último passo de simulação. */
  private simAccumulator = 0;
  /** Habitantes com avatar desenhado neste quadro (reutilizado, sem alocar). */
  private readonly drawn = new Set<CitizenSim>();
  private period: DayPeriod | null = null;
  private routineCursor = 0;
  /** Reconstruções de avatar pendentes (no máximo uma por quadro). */
  private readonly pending: { slot: VisualSlot; citizen: CitizenSim }[] = [];
  /** Sistema de silhueta compartilhado com o jogador (ligado pelo Engine). */
  private afters: AftersBodySystem | null = null;
  /** Habitantes cuja silhueta foi mudada por roteiro: eventos não os tocam. */
  private readonly aftersOverrides = new Map<string, AftersBody>();
  private aftersEvent: AftersCityEvent = 'normal';
  private disposed = false;

  constructor(options: NpcSystemOptions) {
    this.scene = options.scene;
    this.ground = options.ground;
    this.body = options.body ?? null;
    this.rng = createRng(options.seed ?? 20261114);
    this.maxVisible = Math.min(MAX_SLOTS, options.quality.npcVisible);
    this.visibleRange = options.quality.npcRange;
    this.simHz = options.quality.npcSimHz;
    this.routinePerFrame = options.quality.npcRoutinePerFrame;
    this.shadows = options.quality.shadows;
    this.group.name = 'habitantes';
    this.scene.add(this.group);
    this.auraGeometry = new THREE.RingGeometry(0.62, 1.05, 32);
    this.auraGeometry.rotateX(-Math.PI / 2);

    this.blocked = options.blocked;
    this.network = buildAuroraWalkNetwork({ blocked: options.blocked, edgeBlocked: this.edgeBlocked, pointBlocked: this.pointBlocked });
    this.createPantheon();
    this.createSlots();
    // Um único caminho de entrada numa região, usado aqui e na viagem.
    this.setRegion(options.regionId ?? this.regionId);
  }

  /**
   * Muda a região em que a população vive.
   *
   * Reconstrói a rede de caminhada e reposiciona habitantes e panteão
   * sobre ela. Os cidadãos são os mesmos — identidade, nome e perfil
   * são estáveis por semente, e não dependem da região. Quem muda de
   * lugar são eles, não quem eles são.
   */
  setRegion(regionId: string): void {
    const options = { blocked: this.blocked, edgeBlocked: this.edgeBlocked, pointBlocked: this.pointBlocked };
    this.network = regionId === 'rosas-park' ? buildRosasWalkNetwork(options) : buildAuroraWalkNetwork(options);
    this.regionId = regionId;
    for (const slot of this.slots) {
      this.resetSlotFace(slot);
      slot.citizen = null;
      this.releaseSlotAfters(slot);
      if (slot.avatar) slot.avatar.root.visible = false;
      slot.interactable.enabled = false;
    }
    this.pending.length = 0;
    this.citizens.length = 0;
    // O quadro de destinos fala de nós da rede, e a rede é outra.
    this.board.clear();
    this.spawnCitizens(CITIZEN_COUNT);
    this.placePantheon();
  }

  /**
   * Troca o chão/colisão usado pela população.
   *
   * Chamado quando a região é remontada: a física antiga foi embora
   * junto com a cidade antiga, e continuar consultando-a deixaria todo
   * mundo pisando em pontes que não existem mais.
   */
  setBody(body: CharacterGround | null): void {
    this.body = body;
  }

  /**
   * `true` se não há como ir de um ponto ao outro.
   *
   * A rede de caminhada nasce da planta da cidade — avenidas, anel,
   * trilhas —, e a planta não sabe onde o paisagismo pôs um plátano ou
   * um muro. Com esta consulta, um trecho sem passagem nenhuma não
   * vira aresta.
   *
   * O critério é corredor, não linha reta: um poste no meio da calçada
   * não fecha a calçada, e quem desvia dele é a direção em tempo real.
   * Cortar por linha reta apagaria o anel da praça inteiro.
   */
  private readonly edgeBlocked = (ax: number, az: number, bx: number, bz: number): boolean => {
    return this.body ? this.body.corridorBlocked(ax, az, bx, bz) : false;
  };

  /**
   * `true` quando o ponto de passagem é inalcançável para quem anda.
   *
   * A planta da cidade põe o anel da praça em r=35,9 m e o paisagismo
   * põe oito canteiros de 50 cm de altura em r=37 m. Quatro nós caíam
   * dentro deles. Em cima do canteiro não há colisão, então o ponto
   * parecia bom; quem chega anda 50 cm abaixo e 50 cm é mais que o
   * passo de 42 cm. A pessoa encostava na borda e ficava ali. Oito
   * canteiros, oito rodas de gente em volta de uma árvore.
   */
  private readonly pointBlocked = (x: number, z: number, fromX: number, fromZ: number): boolean => {
    return this.body ? !this.body.reachableFrom(x, z, fromX, fromZ) : false;
  };

  /* ----------------------------- Criação ----------------------------- */

  private spawnCitizens(count: number): void {
    if (this.network.size === 0) return;
    // Nascer espalhado é metade do problema resolvido. Sorteio puro
    // repete nó com frequência (aniversário: 54 sorteios em ~300 nós
    // dão cinco pares em média), e duas pessoas no mesmo ponto já
    // começam o dia empurrando uma à outra.
    const taken = new Set<number>();
    for (let i = 0; i < count; i++) {
      const profile = makeCitizen(i + 1);
      let node = this.network.randomNode(this.rng);
      for (let attempt = 0; attempt < 8 && taken.has(node); attempt += 1) node = this.network.randomNode(this.rng);
      taken.add(node);
      this.citizens.push(
        new CitizenSim(profile, this.network, node, createRng(i * 977 + 31), {
          ground: this.ground,
          body: this.body ?? undefined,
          areas: regionAreas(this.regionId),
          board: this.board,
        }),
      );
    }
  }

  /**
   * Reposiciona o panteão na região atual.
   *
   * Em Aurora cada deus tem o seu ponto oficial. Fora dela, só aparecem
   * os que a região reconhece como seus (`patrons`), e no lugar da
   * região que mais combina com eles. Um deus não é teleportado para
   * uma região que não é dele só porque o jogador viajou.
   */
  /**
   * Põe o panteão de pé na região montada.
   *
   * Vale para **qualquer** região, inclusive a primeira que abre: é o
   * mesmo método no arranque e na viagem, e é isso que faz uma cidade
   * voltar igual a como ficou. Antes, começar em Rosas Park deixava o
   * panteão nas coordenadas de Aurora, porque só a viagem reposicionava.
   *
   * Três regras, nesta ordem:
   *
   * 1. **Quem mora aqui.** Em Aurora, todos. Fora dela, só os
   *    `patrons` da região — um deus não é arrastado para uma cidade
   *    que não é dele porque o jogador viajou.
   * 2. **Um lugar para cada um.** Os lugares são tomados sem repetir.
   *    Dois deuses com nomes do mesmo tamanho caíam no mesmo ponto —
   *    era por isso que Suki-Chan e Maze apareciam dentro um do outro
   *    em Rosas Park.
   * 3. **Pé no chão.** A altura vem da física da região recém-montada,
   *    nunca de um valor guardado da região anterior.
   */
  private placePantheon(): void {
    const region = getRegion(this.regionId);
    const places = region?.places ?? [];
    const home = this.deities.filter(
      (deity) => this.regionId === 'aurora-city' || (region?.patrons.includes(deity.character.id) ?? false),
    );

    for (const deity of this.deities) {
      const isHome = home.includes(deity);
      deity.interactable.enabled = isHome;
      if (isHome) continue;
      if (deity.avatar) deity.avatar.root.visible = false;
      if (deity.label) deity.label.visible = false;
      if (deity.aura) deity.aura.visible = false;
    }

    // Ordem estável por id: a mesma distribuição em toda sessão, sem
    // depender de como o panteão foi carregado.
    const ordered = [...home].sort((a, b) => (a.character.id < b.character.id ? -1 : a.character.id > b.character.id ? 1 : 0));
    const taken: { x: number; z: number }[] = [];

    for (const deity of ordered) {
      const spot =
        this.regionId === 'aurora-city'
          ? { x: deity.character.place.x, z: deity.character.place.z }
          : this.claimPlace(places, taken, deity.character.id);
      const settled = this.settlePlacement(spot.x, spot.z, taken);
      taken.push({ x: settled.x, z: settled.z });
      deity.x = settled.x;
      deity.y = settled.y;
      deity.z = settled.z;
      deity.interactable.position.set(settled.x, settled.y, settled.z);
      if (deity.avatar) deity.avatar.root.position.set(settled.x, settled.y, settled.z);
    }
  }

  /**
   * Escolhe um lugar da região ainda livre para este personagem.
   *
   * O ponto de partida continua sendo estável por id — o mesmo deus
   * procura sempre na mesma ordem —, mas um lugar já tomado faz a
   * busca andar para o próximo em vez de empilhar dois personagens no
   * mesmo canteiro.
   */
  private claimPlace(
    places: readonly { x: number; z: number }[],
    taken: readonly { x: number; z: number }[],
    characterId: string,
  ): { x: number; z: number } {
    if (places.length === 0) return { x: 0, z: 0 };
    let seed = 0;
    for (let i = 0; i < characterId.length; i += 1) seed = (seed * 31 + characterId.charCodeAt(i)) >>> 0;
    const start = seed % places.length;
    for (let step = 0; step < places.length; step += 1) {
      const place = places[(start + step) % places.length];
      const clash = taken.some((other) => Math.hypot(other.x - place.x, other.z - place.z) < PLACE_SPACING);
      if (!clash) return { x: place.x, z: place.z };
    }
    return { x: places[start].x, z: places[start].z };
  }

  /**
   * Leva um ponto pretendido até onde dá para ficar de pé.
   *
   * Encosta na rede de caminhada quando o ponto oficial caiu em água
   * ou dentro de uma construção, afasta de quem já está no lugar e só
   * então pergunta à física qual é a altura. Nenhum deslocamento é
   * aleatório: o anel de desempate é fixo, então a cidade monta igual
   * todas as vezes.
   */
  private settlePlacement(x: number, z: number, taken: readonly { x: number; z: number }[]): { x: number; y: number; z: number } {
    const forbidden = keepOutsFor(this.regionId);

    // Primeiro de tudo: o ponto pretendido não pode ser dentro de uma
    // área proibida.
    //
    // Era exatamente este o buraco. O ponto oficial do Roseiral Maior
    // é (0, −24), que é o centro exato do Coração do Roseiral, e
    // **nada neste método olhava para ele** — `blocked` só era
    // consultado no anel de desempate, que nem chega a rodar quando
    // ninguém mais disputa o lugar. O ponto entrava como veio e o
    // personagem pousava dentro da estrutura. Trocar quem recebe o
    // lugar passaria a vez para o próximo da fila; o que faltava era
    // esta linha.
    let { x: px, z: pz } = pushOutOfKeepOut(forbidden, x, z);

    const nodeId = this.network.nearest(px, pz);
    if (nodeId >= 0) {
      const node = this.network.node(nodeId);
      if (Math.hypot(node.x - px, node.z - pz) > 18) {
        px = node.x;
        pz = node.z;
      }
    }
    const clashes = (cx: number, cz: number): boolean =>
      taken.some((other) => Math.hypot(other.x - cx, other.z - cz) < PLACE_SPACING);
    if (clashes(px, pz)) {
      // Anel de desempate: oito direções fixas, raios crescentes.
      outer: for (const radius of [PLACE_SPACING, PLACE_SPACING * 1.8, PLACE_SPACING * 2.6]) {
        for (let i = 0; i < 8; i += 1) {
          const angle = (i / 8) * Math.PI * 2;
          const cx = px + Math.cos(angle) * radius;
          const cz = pz + Math.sin(angle) * radius;
          if (clashes(cx, cz) || this.blocked(cx, cz)) continue;
          if (insideKeepOut(forbidden, cx, cz, KEEP_OUT_CLEARANCE)) continue;
          px = cx;
          pz = cz;
          break outer;
        }
      }
    }

    // E por último, de novo: o salto para a rede e o anel de desempate
    // mexeram no ponto depois da primeira conferência. Repetir é
    // barato e fecha a porta — um empurrão que caísse dentro da
    // estrutura desfaria tudo o que veio antes.
    ({ x: px, z: pz } = pushOutOfKeepOut(forbidden, px, pz));

    // A altura só é perguntada no fim, com o ponto já definitivo. Com
    // o ponto dentro da barreira, a física devolveria o topo dela —
    // seis metros no ar.
    return { x: px, y: this.groundFor(px, pz), z: pz };
  }

  /**
   * Tira de dentro das áreas proibidas quem tiver entrado nelas.
   *
   * O último recurso do bloqueio, e o que responde à exigência de
   * "mesmo que algum sistema tente posicionar um personagem lá
   * dentro". Vale para habitantes e para o panteão, sem exceção e sem
   * citar ninguém pelo nome: um personagem criado amanhã é empurrado
   * pela mesma linha.
   *
   * O empurrão é radial e determinístico, então um personagem
   * encostado na borda não oscila entre dois pontos a cada quadro.
   */
  enforceKeepOuts(): void {
    const forbidden = keepOutsFor(this.regionId);
    if (forbidden.length === 0) return;

    for (const citizen of this.citizens) {
      if (!insideKeepOut(forbidden, citizen.x, citizen.z)) continue;
      const out = pushOutOfKeepOut(forbidden, citizen.x, citizen.z);
      citizen.x = out.x;
      citizen.z = out.z;
    }

    for (const deity of this.deities) {
      if (!deity.interactable.enabled) continue;
      if (!insideKeepOut(forbidden, deity.x, deity.z)) continue;
      const out = pushOutOfKeepOut(forbidden, deity.x, deity.z);
      deity.x = out.x;
      deity.z = out.z;
      deity.y = this.groundFor(out.x, out.z);
      deity.interactable.position.set(deity.x, deity.y, deity.z);
      if (deity.avatar) deity.avatar.root.position.set(deity.x, deity.y, deity.z);
    }
  }

  /**
   * Onde cada personagem do panteão ficou, para a conferência da
   * transição. Só os que esta região mostra entram na lista.
   */
  placedCharacters(): { id: string; x: number; y: number; z: number; active: boolean }[] {
    return this.deities.map((deity) => ({
      id: deity.character.id,
      x: deity.x,
      y: deity.y,
      z: deity.z,
      active: deity.interactable.enabled,
    }));
  }

  /**
   * Altura em que um personagem pousa.
   *
   * Pela física quando há cidade montada — é o que põe Aérion em cima
   * do estrado da Praça Central (2,16 m) em vez de 16 cm dentro dele,
   * e Lilly sobre o tablado do Palco Aurora (2,60 m) em vez de
   * enterrada até a cintura. Pelo relevo puro quando não há.
   */
  private groundFor(x: number, z: number): number {
    return this.body ? this.body.settle(x, z) : this.ground(x, z);
  }

  /**
   * Cria o panteão — identidade, não posição.
   *
   * Quem cada personagem é não muda com a região: o nome, o modelo
   * oficial, a persona e o ponto de conversa são os mesmos em todo o
   * Éden. **Onde** ele está é assunto de `placePantheon`, que roda a
   * cada região montada. Separar as duas coisas é o que garante que
   * viajar não cria um segundo Saturno nem perde o original.
   */
  private createPantheon(): void {
    for (const character of PANTHEON) {
      const interactable: Interactable = {
        id: `divino:${character.id}`,
        name: character.name,
        action: 'Conversar',
        position: new THREE.Vector3(character.place.x, 0, character.place.z),
        range: 3.2,
        enabled: true,
        payload: { type: 'conversa', personId: character.id, divino: true },
      };
      this.interactables.push(interactable);
      this.deities.push({
        character,
        x: character.place.x,
        y: 0,
        z: character.place.z,
        heading: character.place.heading,
        life: new NpcLife(characterPersona(character.id), character.id.length * 31 + character.name.length),
        avatar: null,
        animator: new AvatarAnimator(),
        aura: null,
        label: null,
        interactable,
        aftersId: character.afters ? characterAftersId(character.id) : null,
      });
    }
  }

  /** Cria os lugares de desenho e seus pontos de conversa (lista estável). */
  private createSlots(): void {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const interactable: Interactable = {
        id: `cidadao:${i}`,
        name: 'Habitante',
        action: 'Conversar',
        position: new THREE.Vector3(),
        range: 2.8,
        enabled: false,
        payload: { type: 'conversa', personId: '', divino: false },
      };
      this.interactables.push(interactable);
      this.slots.push({ avatar: null, animator: new AvatarAnimator(), citizen: null, interactable, aftersId: null });
    }
  }

  /** Garante que o lugar tenha um avatar pronto para desenhar. */
  private ensureAvatar(slot: VisualSlot): Avatar {
    if (slot.avatar) return slot.avatar;
    const avatar = new Avatar();
    avatar.fill = 0.1;
    avatar.setShadows(this.shadows);
    avatar.root.visible = false;
    this.group.add(avatar.root);
    slot.avatar = avatar;
    return avatar;
  }

  /* ------------------------------ Afters ----------------------------- */

  /**
   * Liga a população ao sistema de silhueta do jogo.
   *
   * Cada habitante ganha um ator Afters com a configuração do seu perfil —
   * o mesmo tipo de ator usado pelo jogador. Nada é desenhado aqui: os
   * atores só escrevem nos avatares quando o habitante está à vista.
   */
  attachAfters(system: AftersBodySystem): void {
    this.afters = system;
    for (const citizen of this.citizens) {
      system.actor(citizenAftersId(citizen.profile.seed), citizen.profile.afters);
    }
    for (const deity of this.deities) {
      if (deity.aftersId && deity.character.afters) system.actor(deity.aftersId, deity.character.afters);
    }
    // Avatares já desenhados (troca de qualidade, recarga) recebem o estado.
    for (const slot of this.slots) {
      if (slot.citizen && slot.avatar) {
        slot.aftersId = citizenAftersId(slot.citizen.profile.seed);
        system.bindAvatar(slot.aftersId, slot.avatar);
      }
    }
    for (const deity of this.deities) {
      if (deity.aftersId && deity.avatar) system.bindAvatar(deity.aftersId, deity.avatar);
    }
    this.applyAftersEvent(this.aftersEvent, true);
  }

  /** Configuração Afters em vigor para um habitante (ou `null`). */
  aftersOf(id: string): AftersBody | null {
    return this.afters?.findActor(id)?.current ?? null;
  }

  /**
   * Muda a silhueta de um habitante por roteiro.
   *
   * Aceita porcentagens (0–250) para quem chama de fora, e marca a pessoa
   * como "dirigida por roteiro": eventos automáticos da cidade deixam de
   * mexer nela, e o estado entra no salvamento.
   */
  setAftersFor(id: string, patch: { bust?: number; curve?: number; bustActive?: boolean; curveActive?: boolean; duration?: number }): AftersBody | null {
    if (!this.afters) return null;
    const actor = this.afters.findActor(id);
    if (!actor) return null;
    const current = actor.current;
    const next: AftersBody = {
      bust: patch.bust === undefined ? current.bust : fromPercent(patch.bust),
      curve: patch.curve === undefined ? current.curve : fromPercent(patch.curve),
      bustActive: patch.bustActive === undefined ? (patch.bust === undefined ? current.bustActive : patch.bust > 0) : patch.bustActive,
      curveActive: patch.curveActive === undefined ? (patch.curve === undefined ? current.curveActive : patch.curve > 0) : patch.curveActive,
      duration: patch.duration === undefined ? current.duration : patch.duration,
      preset: null,
    };
    actor.setBody(next);
    this.aftersOverrides.set(id, actor.current);
    return actor.current;
  }

  /** Liga ou desliga a transformação de um habitante (evento de roteiro). */
  setAftersActiveFor(id: string, active: boolean, channel?: AftersChannelId): AftersBody | null {
    if (!this.afters) return null;
    const actor = this.afters.findActor(id);
    if (!actor) return null;
    if (channel) actor.setActive(channel, active);
    else actor.setCombined(active);
    this.aftersOverrides.set(id, actor.current);
    return actor.current;
  }

  /** Aplica um preset a um habitante (roteiro ou evento). */
  setAftersPresetFor(id: string, presetId: string): AftersBody | null {
    const preset = getAftersPreset(presetId);
    if (!preset || !this.afters) return null;
    const actor = this.afters.findActor(id);
    if (!actor) return null;
    actor.applyPreset(preset);
    this.aftersOverrides.set(id, actor.current);
    return actor.current;
  }

  /** Devolve um habitante dirigido por roteiro ao perfil original dele. */
  clearAftersOverride(id: string): void {
    if (!this.aftersOverrides.delete(id)) return;
    const actor = this.afters?.findActor(id);
    if (!actor) return;
    actor.setBody(this.profileAfters(id));
  }

  /**
   * Evento da cidade.
   *
   * Quando a noite cai, quem tem esse gosto no perfil reforça a silhueta;
   * de dia, volta ao normal. Quem foi dirigido por roteiro não é tocado.
   */
  applyAftersEvent(event: AftersCityEvent, force = false): void {
    if (event === this.aftersEvent && !force) return;
    this.aftersEvent = event;
    if (!this.afters) return;
    for (const citizen of this.citizens) {
      const id = citizenAftersId(citizen.profile.seed);
      if (this.aftersOverrides.has(id)) continue;
      const actor = this.afters.findActor(id);
      if (!actor) continue;
      actor.setBody(this.eventBody(citizen.profile.afters, citizen.profile.aftersNight, event));
    }
  }

  /** Ids dos habitantes dirigidos por roteiro (para rede e salvamento). */
  aftersOverrideIds(): string[] {
    return [...this.aftersOverrides.keys()];
  }

  /** Estado dos habitantes dirigidos por roteiro, para o salvamento. */
  aftersOverridesData(): Record<string, AftersBody> {
    const out: Record<string, AftersBody> = {};
    for (const [id, body] of this.aftersOverrides) out[id] = body;
    return out;
  }

  /** Recarrega do salvamento os habitantes dirigidos por roteiro. */
  restoreAftersOverrides(data: Record<string, AftersBody> | undefined | null): void {
    this.aftersOverrides.clear();
    if (!data) return;
    for (const [id, raw] of Object.entries(data)) {
      const body = sanitizeAftersBody(raw);
      this.aftersOverrides.set(id, body);
      this.afters?.findActor(id)?.setBody(body, false);
    }
  }

  /** Liga o ator do habitante ao avatar que ele acabou de ocupar. */
  private bindSlotAfters(slot: VisualSlot, citizen: CitizenSim): void {
    if (!this.afters || !slot.avatar) return;
    const id = citizenAftersId(citizen.profile.seed);
    if (slot.aftersId && slot.aftersId !== id) this.afters.unbindAvatar(slot.aftersId);
    slot.aftersId = id;
    this.afters.bindAvatar(id, slot.avatar, citizen.profile.afters);
  }

  /** Solta o ator do avatar — e zera a silhueta, porque o avatar é reusado. */
  private releaseSlotAfters(slot: VisualSlot): void {
    if (!slot.aftersId) return;
    this.afters?.unbindAvatar(slot.aftersId);
    slot.aftersId = null;
  }

  /** Configuração de perfil (sem evento e sem roteiro) de um habitante. */
  private profileAfters(id: string): AftersBody {
    for (const citizen of this.citizens) {
      if (citizenAftersId(citizen.profile.seed) === id) {
        return this.eventBody(citizen.profile.afters, citizen.profile.aftersNight, this.aftersEvent);
      }
    }
    for (const deity of this.deities) {
      if (deity.aftersId === id && deity.character.afters) return { ...deity.character.afters };
    }
    return { bust: 0, curve: 0, bustActive: false, curveActive: false, duration: 1.6, preset: null };
  }

  /** Perfil + evento da cidade, sem mexer no estado guardado da pessoa. */
  private eventBody(base: AftersBody, night: boolean, event: AftersCityEvent): AftersBody {
    if (event === 'desligado') return { ...base, bustActive: false, curveActive: false };
    const boost = event === 'palco' ? 75 : event === 'noite' && night ? 50 : 0;
    if (boost === 0) return { ...base };
    const lift = (value: number, active: boolean): number =>
      active && value > 0 ? clampIntensity(fromPercent(Math.min(250, toPercent(value) + boost))) : value;
    return {
      ...base,
      bust: lift(base.bust, base.bustActive),
      curve: lift(base.curve, base.curveActive),
      preset: null,
    };
  }

  /* ---------------------------- Consultas ---------------------------- */

  /** Cidadão atualmente ligado a um ponto de conversa (ou `null`). */
  citizenOf(interactableId: string): CitizenSim | null {
    const slot = this.slots.find((candidate) => candidate.interactable.id === interactableId);
    return slot?.citizen ?? null;
  }

  /**
   * Alguém acenou para a cidade: quem está perto e desenhado responde.
   *
   * Nem todo mundo acena de volta — cada pessoa tem seu intervalo de
   * cumprimento e o seu jeito. Uma praça inteira acenando em uníssono
   * seria estranho.
   */
  greetBack(x: number, z: number, range = 12): void {
    for (const slot of this.slots) {
      const citizen = slot.citizen;
      if (!citizen || !slot.avatar) continue;
      if (citizen.life.inConversation) continue;
      if (citizen.distanceTo(x, z) > range) continue;
      citizen.life.greetBack(x, z);
    }
    for (const deity of this.deities) {
      if (deity.life.inConversation) continue;
      if (Math.hypot(deity.x - x, deity.z - z) > range) continue;
      deity.life.greetBack(x, z);
    }
  }

  /** Vida (expressão, gestos, atenção) de quem está em um ponto de conversa. */
  lifeOf(interactableId: string): NpcLife | null {
    return this.citizenOf(interactableId)?.life ?? null;
  }

  /** Vida de um personagem do panteão. */
  characterLife(characterId: string): NpcLife | null {
    return this.deityOf(characterId)?.life ?? null;
  }

  deityOf(characterId: string): DeityNpc | undefined {
    return this.deities.find((deity) => deity.character.id === characterId);
  }

  /** Faz o personagem acenar de volta, com o rosto que ele usa para isso. */
  waveBack(characterId: string): void {
    const deity = this.deityOf(characterId);
    if (!deity) return;
    deity.life.setExpression(deity.life.persona.greetMood);
    deity.life.request('acenar', deity.life.persona.energy);
  }

  /** Posição do personagem no mundo (para câmera e olhares). */
  characterPosition(characterId: string): { x: number; y: number; z: number } | null {
    const deity = this.deityOf(characterId);
    return deity ? { x: deity.x, y: deity.y, z: deity.z } : null;
  }

  /** Vira um personagem do panteão para olhar um ponto. */
  lookAt(characterId: string, x: number, z: number): void {
    const deity = this.deityOf(characterId);
    if (deity) deity.heading = Math.atan2(x - deity.x, z - deity.z);
  }

  get population(): number {
    return this.citizens.length;
  }

  /** Habitantes simulados — leitura para roteiro, depuração e testes. */
  get people(): readonly CitizenSim[] {
    return this.citizens;
  }

  /* ---------------------------- Simulação ---------------------------- */

  setFocus(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
  }

  /** Troca a rotina dos cidadãos quando o período do dia muda. */
  setPeriod(period: DayPeriod): void {
    if (period === this.period) return;
    this.period = period;
    this.routineCursor = 0;
  }

  applyQuality(profile: QualityProfile): void {
    this.maxVisible = Math.min(MAX_SLOTS, profile.npcVisible);
    this.visibleRange = profile.npcRange;
    this.simHz = profile.npcSimHz;
    this.routinePerFrame = profile.npcRoutinePerFrame;
    this.shadows = profile.shadows;
    for (const slot of this.slots) slot.avatar?.setShadows(profile.shadows);
    for (const deity of this.deities) deity.avatar?.setShadows(profile.shadows);
    // Excedente de avatares (qualidade reduzida): libera os últimos.
    for (let i = this.maxVisible; i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot.citizen = null;
      this.releaseSlotAfters(slot);
      slot.interactable.enabled = false;
      slot.avatar?.dispose();
      slot.avatar = null;
    }
  }

  update(dt: number, elapsed: number): void {
    if (this.disposed || dt <= 0) return;
    if (!this.enabled) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const focus = this.focus;

    // 1. Simulação dos habitantes, em dois ritmos.
    //
    //    Quem está desenhado anda **todo quadro**: qualquer economia ali
    //    viraria engasgo visível. O resto da cidade — a maioria, que
    //    ninguém está vendo — avança em passos maiores, na frequência que
    //    o nível de qualidade pedir. O tempo é acumulado e entregue
    //    inteiro, então a distância percorrida é a mesma e ninguém perde
    //    o destino: só dá passos mais longos enquanto está fora de vista.
    this.drawn.clear();
    for (const slot of this.slots) {
      if (slot.citizen && slot.avatar) this.drawn.add(slot.citizen);
    }
    const step = this.simHz > 0 ? 1 / this.simHz : 0;
    let batchDt = 0;
    if (step > 0) {
      this.simAccumulator += dt;
      if (this.simAccumulator >= step) {
        batchDt = this.simAccumulator;
        this.simAccumulator = 0;
      }
    }
    // Espaço pessoal entre habitantes: calculado antes do passo e
    // entregue como empurrão, para que o passo já saia desviado — e
    // depois peneirado pela colisão, que não deixa o empurrão jogar
    // ninguém para dentro de uma parede.
    this.separate(step <= 0 || batchDt > 0);

    for (const citizen of this.citizens) {
      const slice = step <= 0 || this.drawn.has(citizen) ? dt : batchDt;
      if (slice <= 0) continue;
      citizen.update(slice);
      // Espaço pessoal: ninguém atravessa o jogador.
      const dx = citizen.x - focus.x;
      const dz = citizen.z - focus.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.9 && distance > 1e-3) {
        const push = (0.9 - distance) * Math.min(1, slice * 12);
        citizen.x += (dx / distance) * push;
        citizen.z += (dz / distance) * push;
      }
    }

    // 1b. Rede de segurança das áreas proibidas.
    //
    //     As três defesas anteriores — barreira sólida, rede de
    //     caminhada e posicionamento — cobrem os caminhos conhecidos.
    //     Esta cobre os que ainda não existem: um empurrão de espaço
    //     pessoal, uma correção de rota, um sistema futuro que mova
    //     alguém à força. Nenhum deles sabe da estrutura; este laço
    //     sabe, e roda depois de todos.
    //
    //     Custa um `hypot` por pessoa e por zona, e só mexe em quem
    //     está de fato dentro. Numa região sem zona declarada o laço
    //     não roda.
    this.enforceKeepOuts();

    // 2. Rotinas: alguns cidadãos por quadro, para diluir o custo.
    if (this.period) {
      for (let i = 0; i < this.routinePerFrame && this.citizens.length > 0; i++) {
        const citizen = this.citizens[this.routineCursor % this.citizens.length];
        this.routineCursor += 1;
        if (this.routineCursor <= this.citizens.length) citizen.setRoutine(this.period);
      }
    }

    // 3. Quem ganha avatar visível.
    this.assignTimer += dt;
    if (this.assignTimer >= 0.4) {
      this.assignTimer = 0;
      this.assignVisuals();
    }

    // 3b. Duplas de conversa entre habitantes (de poucos em poucos segundos).
    this.chatTimer += dt;
    if (this.chatTimer >= CHAT_INTERVAL) {
      this.chatTimer = 0;
      this.pairChats();
    }

    // 4. Uma reconstrução de avatar por quadro (evita engasgos).
    const next = this.pending.shift();
    if (next && next.slot.citizen === next.citizen) {
      const avatar = this.ensureAvatar(next.slot);
      avatar.setAppearance(next.citizen.profile.appearance);
      // Mesmo quadro da aparência: a silhueta entra junto, de uma vez, sem
      // reconstruir malha nenhuma e sem ninguém ver a transformação crescer.
      this.bindSlotAfters(next.slot, next.citizen);
      avatar.root.visible = true;
      next.slot.interactable.name = next.citizen.profile.name;
      next.slot.interactable.enabled = true;
      next.slot.interactable.payload = { type: 'conversa', personId: String(next.citizen.profile.seed), divino: false };
    }

    // 5. Desenho dos cidadãos visíveis.
    for (const slot of this.slots) {
      const citizen = slot.citizen;
      if (!citizen || !slot.avatar) {
        if (slot.avatar) slot.avatar.root.visible = false;
        if (!citizen) slot.interactable.enabled = false;
        continue;
      }
      // A vida da pessoa decide; o avatar só executa.
      const distance = citizen.distanceTo(focus.x, focus.z);
      citizen.life.update(dt, { playerX: focus.x, playerZ: focus.z, distance, period: this.period, visible: true });
      this.perform(slot.animator, slot.avatar, citizen.life, citizen.x, citizen.z, citizen.heading);

      const pose = slot.animator.update(dt, {
        state: citizen.activity === 'andando' && citizen.speed > 0.15 ? (citizen.speed > 2.4 ? 'run' : 'walk') : 'idle',
        speed: citizen.speed,
        stridePhase: citizen.stridePhase,
        verticalSpeed: 0,
        elapsed,
      });
      slot.avatar.applyPose(pose, elapsed);
      slot.avatar.updateFace(dt);
      slot.avatar.root.position.set(citizen.x, citizen.y, citizen.z);
      slot.avatar.root.rotation.y = citizen.heading;
      slot.interactable.position.set(citizen.x, citizen.y, citizen.z);
    }

    // 6. Panteão.
    this.updateDeities(dt, elapsed);
  }

  /**
   * Afasta quem está perto demais de quem.
   *
   * Vale para a população inteira, não só para quem está desenhado.
   * Enquanto valeu só para os desenhados, quem estava fora de vista
   * podia empilhar-se à vontade — e empilhava, porque é fora de vista
   * que a cidade passa a maior parte do tempo. O jogador só via o
   * resultado ao chegar perto: um monte de gente no mesmo metro
   * quadrado, que então começava a se separar tarde demais.
   *
   * São 54 pessoas: 1431 pares por quadro, uns 10 µs. O custo que
   * justificava a restrição não existe nesta escala.
   */
  private separate(everyoneSteps: boolean): void {
    const list = this.citizens;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= PERSONAL_SPACE || distance < 1e-4) continue;
        const push = (PERSONAL_SPACE - distance) * 0.5;
        const nx = (dx / distance) * push;
        const nz = (dz / distance) * push;
        // Só empurra quem vai andar neste quadro. Quem está fora de
        // vista avança em passos maiores, de tempos em tempos; somar
        // um empurrão por quadro a quem só anda a cada quatro
        // multiplicaria a separação por quatro e catapultaria a
        // pessoa quando chegasse a vez dela.
        if (everyoneSteps || this.drawn.has(a)) a.pushAway(nx, nz);
        if (everyoneSteps || this.drawn.has(b)) b.pushAway(-nx, -nz);
      }
    }
  }

  /**
   * Devolve o avatar do conjunto ao estado neutro.
   *
   * Sem isto, a próxima pessoa a usar este avatar herdaria o sorriso (ou
   * o gesto a meio caminho) de quem saiu de vista.
   */
  private resetSlotFace(slot: VisualSlot): void {
    slot.animator.stopGesture();
    slot.animator.setTalking(0);
    slot.animator.clearLook();
    slot.avatar?.face.reset();
  }

  /**
   * Passa a intenção de uma pessoa para o avatar que a desenha.
   *
   * Três camadas, todas somadas por cima da locomoção: gesto, olhar e
   * fala. Nenhuma delas substitui a animação de andar — é por isso que
   * um habitante pode acenar enquanto atravessa a praça.
   */
  private perform(animator: AvatarAnimator, avatar: Avatar, life: NpcLife, x: number, z: number, heading: number): void {
    const gesture = life.takeGesture();
    if (gesture) animator.playGesture(gesture.id, { strength: gesture.strength });

    const look = life.lookTarget;
    if (look) {
      const yaw = Math.atan2(look.x - x, look.z - z) - heading;
      animator.lookAt(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
    } else {
      animator.clearLook();
    }

    animator.setTalking(life.talking);
    avatar.setExpression(life.expression);
    avatar.setTalking(life.talking);
  }

  /**
   * Conversas entre habitantes.
   *
   * Só vale para quem está desenhado (no máximo 18 pessoas) e parado:
   * duas pessoas paradas perto uma da outra começam um papo curto, se
   * viram e gesticulam. Ninguém interrompe caminhada por isso, e quem
   * está conversando com o jogador fica de fora.
   */
  private pairChats(): void {
    const candidates: CitizenSim[] = [];
    for (const slot of this.slots) {
      const citizen = slot.citizen;
      if (!citizen || !slot.avatar) continue;
      if (citizen.life.inConversation || citizen.life.chatting) continue;
      if (!citizen.idleHere) continue;
      candidates.push(citizen);
    }
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i];
      if (a.life.chatting) continue;
      for (let j = i + 1; j < candidates.length; j++) {
        const b = candidates[j];
        if (b.life.chatting) continue;
        if (a.distanceTo(b.x, b.z) > CHAT_RANGE) continue;
        a.life.startChat(b.x, b.z);
        b.life.startChat(a.x, a.z);
        a.faceTowards(b.x, b.z);
        b.faceTowards(a.x, a.z);
        a.pause(CHAT_INTERVAL + 3);
        b.pause(CHAT_INTERVAL + 3);
        break;
      }
    }
  }

  /**
   * Decide quem tem avatar.
   *
   * O raio de entrada e o de saída são **diferentes** de propósito. Um
   * morador entra em cena ao cruzar `visibleRange` e só é dispensado
   * depois de passar de `visibleRange × HYSTERESIS`. Sem essa folga, quem
   * caminha junto do limite entra e sai a cada segundo — e cada entrada é
   * uma reconstrução de avatar, de longe a coisa mais cara deste sistema.
   *
   * A armadilha é que o problema **piora** na qualidade baixa, onde o raio
   * é menor e a borda passa mais perto de todo mundo: sem histerese, o
   * aparelho mais fraco é o que mais reconstrói malha.
   */
  private assignVisuals(): void {
    const focus = this.focus;
    const range = this.visibleRange;
    const release = range * VISIBLE_HYSTERESIS;
    const nearby = this.citizens
      .map((citizen) => ({ citizen, distance: citizen.distanceTo(focus.x, focus.z) }))
      .filter((entry) => entry.distance <= range)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.maxVisible);
    const wanted = new Set(nearby.map((entry) => entry.citizen));
    // Quem já está em cena continua enquanto estiver dentro da folga.
    for (const slot of this.slots) {
      const citizen = slot.citizen;
      if (citizen && !wanted.has(citizen) && wanted.size < this.maxVisible && citizen.distanceTo(focus.x, focus.z) <= release) {
        wanted.add(citizen);
      }
    }

    // Libera quem saiu do alcance.
    for (const slot of this.slots) {
      if (slot.citizen && !wanted.has(slot.citizen)) {
        this.resetSlotFace(slot);
        slot.citizen = null;
        this.releaseSlotAfters(slot);
        if (slot.avatar) slot.avatar.root.visible = false;
        slot.interactable.enabled = false;
      }
    }

    const assigned = new Set(this.slots.map((slot) => slot.citizen).filter((citizen): citizen is CitizenSim => citizen !== null));
    for (const entry of nearby) {
      if (assigned.has(entry.citizen)) continue;
      const slot = this.slots.slice(0, this.maxVisible).find((candidate) => candidate.citizen === null);
      if (!slot) break;
      this.resetSlotFace(slot);
      slot.citizen = entry.citizen;
      // O avatar é reaproveitado: zera a silhueta de quem estava nele.
      this.releaseSlotAfters(slot);
      if (slot.avatar) slot.avatar.root.visible = false;
      slot.interactable.enabled = false;
      assigned.add(entry.citizen);
      this.pending.push({ slot, citizen: entry.citizen });
    }
  }

  private updateDeities(dt: number, elapsed: number): void {
    const focus = this.focus;
    for (const deity of this.deities) {
      // `placePantheon` já decidiu quem é desta região. Sem esta
      // checagem, um deus de Aurora reaparecia em Rosas assim que o
      // jogador passasse a 150 m das **coordenadas antigas** dele —
      // com a altura do terreno de Aurora, portanto no ar ou enterrado.
      if (!deity.interactable.enabled) {
        if (deity.avatar) deity.avatar.root.visible = false;
        if (deity.label) deity.label.visible = false;
        if (deity.aura) deity.aura.visible = false;
        const sleeping = deity.aftersId ? this.afters?.findActor(deity.aftersId) : null;
        if (sleeping) sleeping.visible = false;
        continue;
      }
      const distance = Math.hypot(deity.x - focus.x, deity.z - focus.z);
      const active = distance <= DEITY_RANGE;
      if (active && !deity.avatar) this.materializeDeity(deity);
      if (!deity.avatar) continue;
      deity.avatar.root.visible = active;
      if (deity.aftersId) {
        const actor = this.afters?.findActor(deity.aftersId);
        if (actor) actor.visible = active;
      }
      if (deity.aura) deity.aura.visible = active;
      if (deity.label) {
        deity.label.visible = active && distance < LABEL_RANGE;
        (deity.label.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, (LABEL_RANGE - distance) / 10));
      }
      if (!active) continue;

      // Vida própria: cumprimenta quem chega, gesticula, muda de rosto.
      deity.life.update(dt, { playerX: focus.x, playerZ: focus.z, distance, period: this.period, visible: true });
      // Olha para o jogador quando ele está perto.
      if (distance < 9) {
        const target = Math.atan2(focus.x - deity.x, focus.z - deity.z);
        let delta = target - deity.heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        deity.heading += delta * Math.min(1, dt * 3);
      } else {
        let delta = deity.character.place.heading - deity.heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        deity.heading += delta * Math.min(1, dt * 1.2);
      }

      this.perform(deity.animator, deity.avatar, deity.life, deity.x, deity.z, deity.heading);
      const pose = deity.animator.update(dt, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed });
      deity.avatar.applyPose(pose, elapsed);
      deity.avatar.updateFace(dt);
      deity.avatar.root.position.set(deity.x, deity.y, deity.z);
      deity.avatar.root.rotation.y = deity.heading;
      if (deity.aura) {
        const pulse = 1 + Math.sin(elapsed * 1.6 + deity.x) * 0.06;
        deity.aura.position.set(deity.x, deity.y + 0.035, deity.z);
        deity.aura.scale.setScalar(pulse);
        (deity.aura.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(elapsed * 2.1 + deity.z) * 0.08;
      }
      if (deity.label) deity.label.position.set(deity.x, deity.y + 2.35 + Math.sin(elapsed * 1.3 + deity.x) * 0.03, deity.z);
    }
  }

  private materializeDeity(deity: DeityNpc): void {
    // Modelo oficial, da fábrica compartilhada: o mesmo corpo em
    // Aurora City, em Rosas Park e dentro de qualquer prédio. Aparência,
    // escala e gestação de cânone saem todas do mesmo lugar — era a
    // falta disso que deixava Saturno diferente de si mesma.
    const avatar = createOfficialAvatar(deity.character.id, { fill: 0.16, shadows: this.shadows }) ?? new Avatar(deity.character.appearance);
    this.group.add(avatar.root);
    deity.avatar = avatar;
    if (deity.aftersId) this.afters?.bindAvatar(deity.aftersId, avatar, deity.character.afters);

    const aura = new THREE.Mesh(this.auraGeometry, auraMaterial(deity.character.aura));
    aura.renderOrder = 2;
    this.group.add(aura);
    deity.aura = aura;

    const label = nameSprite(deity.character.name, deity.character.title, deity.character.colors[0]);
    this.group.add(label);
    deity.label = label;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      this.releaseSlotAfters(slot);
      slot.avatar?.dispose();
    }
    for (const deity of this.deities) {
      if (deity.aftersId) this.afters?.unbindAvatar(deity.aftersId);
    }
    this.afters = null;
    this.slots.length = 0;
    for (const deity of this.deities) {
      deity.avatar?.dispose();
      if (deity.aura) (deity.aura.material as THREE.Material).dispose();
      if (deity.label) {
        const material = deity.label.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      }
    }
    this.deities.length = 0;
    this.auraGeometry.dispose();
    this.pending.length = 0;
    this.citizens.length = 0;
    this.group.clear();
    this.group.removeFromParent();
    this.interactables.length = 0;
  }
}
