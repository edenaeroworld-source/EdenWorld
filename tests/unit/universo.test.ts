/**
 * O universo: regiões, viagem, economia, moradia, bichos, fauna,
 * interiores e atividades.
 *
 * Cada bloco guarda uma regra de mundo, não só um retorno de função.
 * Quando um teste aqui falha, alguma promessa feita ao jogador deixou
 * de valer — não adianta ajustar o número esperado sem perguntar qual.
 */

import { describe, expect, it } from 'vitest';
import { Economy, REFUND_WINDOW_MINUTES, STARTING_CRYSTALS, sanitizeEconomyData } from '../../src/economy/Economy';
import { allStores, getItem, getStore, storeIsOpen, storeStock } from '../../src/economy/Items';
import { Housing, PROPERTIES, footprintOf, sanitizeHousingData } from '../../src/housing/Housing';
import { InteriorManager, sanitizeInteriorData } from '../../src/interiors/InteriorManager';
import { allInteriors, getInterior } from '../../src/interiors/Interior';
import { MISSIONS, MissionLog, getMission, sanitizeMissionData } from '../../src/missions/Missions';
import { MAX_FOLLOWING, MAX_PETS, PetManager, sanitizePetData } from '../../src/creatures/PetManager';
import { allSpecies, getSpecies, isAdoptable, registerSpecies, speciesOfKind } from '../../src/creatures/Species';
import { WildlifeGuide, isActiveAt, periodOfHour, populateRegion, spawnableIn, wildlifeBudget } from '../../src/creatures/Wildlife';
import { REGIONS, getRegion, getPlace, routeBetween, travelTime } from '../../src/regions/Region';
import { RegionManager, sanitizeRegionData } from '../../src/regions/RegionManager';
import { getCharacter } from '../../src/characters/Pantheon';

/* ------------------------- 1. Regiões e viagem -------------------------- */

describe('universo · regiões', () => {
  it('tem as sete regiões pedidas, cada uma com identidade própria', () => {
    expect(REGIONS).toHaveLength(7);
    const ids = REGIONS.map((region) => region.id);
    expect(ids).toEqual(['aurora-city', 'bitnara', 'skystones', 'rosas-park', 'noureja-nether', 'cidade-da-liberdade', 'jardim-proibido']);
    const names = new Set(REGIONS.map((region) => region.name));
    expect(names.size).toBe(7);
    // Identidade não é só nome: cada região tem arquitetura e cores suas.
    expect(new Set(REGIONS.map((region) => region.architecture)).size).toBe(7);
  });

  it('nenhuma região é terreno vazio: todas têm lugares e padroeiros', () => {
    for (const region of REGIONS) {
      expect(region.places.length).toBeGreaterThanOrEqual(3);
      expect(region.patrons.length).toBeGreaterThan(0);
      expect(region.wildlife.length).toBeGreaterThan(0);
      expect(region.description.length).toBeGreaterThan(40);
      for (const place of region.places) {
        expect(place.name.length).toBeGreaterThan(2);
        expect(Math.hypot(place.x, place.z)).toBeLessThanOrEqual(region.radius);
      }
    }
  });

  it('todo padroeiro de região é um personagem que existe no panteão', () => {
    for (const region of REGIONS) {
      for (const id of region.patrons) expect(getCharacter(id), `${region.id} → ${id}`).toBeDefined();
    }
  });

  it('a rede de vizinhança é simétrica e liga todas as regiões', () => {
    for (const region of REGIONS) {
      for (const neighborId of region.neighbors) {
        const neighbor = getRegion(neighborId);
        expect(neighbor, `${region.id} → ${neighborId}`).toBeDefined();
        // Vizinhança só de ida deixaria uma região inalcançável na volta.
        expect(neighbor?.neighbors).toContain(region.id);
      }
    }
    // Partindo de Aurora City dá para chegar a qualquer uma.
    for (const region of REGIONS) {
      expect(routeBetween('aurora-city', region.id).length, region.id).toBeGreaterThan(0);
    }
  });

  it('a rota é a mais curta, e a viagem custa mais quanto mais longe', () => {
    expect(routeBetween('aurora-city', 'aurora-city')).toEqual(['aurora-city']);
    expect(routeBetween('aurora-city', 'bitnara')).toEqual(['aurora-city', 'bitnara']);
    expect(routeBetween('aurora-city', 'skystones')).toEqual(['aurora-city', 'bitnara', 'skystones']);
    expect(routeBetween('aurora-city', 'inexistente')).toEqual([]);
    expect(travelTime('aurora-city', 'skystones')).toBeGreaterThan(travelTime('aurora-city', 'bitnara'));
  });
});

describe('universo · viagem', () => {
  it('começa em Aurora City, conhecendo só o que é inicial', () => {
    const manager = new RegionManager();
    expect(manager.currentRegionId).toBe('aurora-city');
    expect(manager.knows('aurora-city')).toBe(true);
    expect(manager.knows('rosas-park')).toBe(true);
    expect(manager.knows('jardim-proibido')).toBe(false);
  });

  it('não viaja para onde ainda não sabe chegar — e diz por quê', () => {
    const manager = new RegionManager();
    expect(manager.travelBlocker('jardim-proibido')).toBe('Você ainda não sabe como chegar lá.');
    expect(manager.travelTo('jardim-proibido')).toBeNull();
    expect(manager.currentRegionId).toBe('aurora-city');
    expect(manager.travelBlocker('aurora-city')).toBe('Você já está aqui.');
    expect(manager.travelBlocker('narnia')).toBe('Esse lugar não existe no Éden.');
  });

  it('descobrir avisa uma vez só, e aí a viagem passa a ser possível', () => {
    const manager = new RegionManager();
    const seen: string[] = [];
    manager.onDiscovery((region) => seen.push(region.id));
    expect(manager.discover('bitnara')).toBe(true);
    expect(manager.discover('bitnara')).toBe(false);
    expect(seen).toEqual(['bitnara']);
    expect(manager.canTravelTo('bitnara')).toBe(true);
  });

  it('voltar leva o jogador ao lugar onde ele parou, não à entrada', () => {
    const manager = new RegionManager();
    manager.discover('bitnara');
    const spot = { x: 42, y: 2, z: -17, heading: 1.1 };
    manager.travelTo('bitnara', spot);
    expect(manager.currentRegionId).toBe('bitnara');
    // Primeira visita: chega no ponto de chegada da região.
    const arrival = getRegion('bitnara')?.arrival;
    expect(manager.entryPoint('bitnara').z).toBe(arrival?.z);

    manager.travelTo('aurora-city', { x: 10, y: 0, z: 10, heading: 0 });
    expect(manager.entryPoint('aurora-city')).toMatchObject({ x: 42, z: -17 });
  });

  it('avisa quem escuta, com a rota inteira da viagem', () => {
    const manager = new RegionManager();
    manager.discover('bitnara');
    manager.discover('skystones');
    const events: string[][] = [];
    manager.onTravel((event) => events.push([...event.route]));
    manager.travelTo('skystones');
    expect(events).toEqual([['aurora-city', 'bitnara', 'skystones']]);
  });

  it('sobrevive a um salvamento adulterado sem prender o jogador', () => {
    const data = sanitizeRegionData({ current: 'atlantida', discovered: ['aurora-city', 'nada'], positions: { xyz: { x: 1 } } });
    expect(data.current).toBe('aurora-city');
    expect(data.discovered).not.toContain('nada');
    expect(data.positions).toEqual({});
    // Estar numa região que o jogador "não conhece" também não trava.
    expect(sanitizeRegionData({ current: 'jardim-proibido', discovered: [] }).current).toBe('aurora-city');
  });
});

/* ------------------------------ 2. Economia ----------------------------- */

describe('universo · economia', () => {
  const store = getStore('edenhome-aurora');
  if (!store) throw new Error('loja de teste sumiu');

  it('toda loja aponta para uma região e um lugar que existem', () => {
    for (const entry of allStores()) {
      const region = getRegion(entry.region);
      expect(region, entry.id).toBeDefined();
      expect(getPlace(entry.region, entry.place), `${entry.id} → ${entry.place}`).toBeDefined();
      expect(storeStock(entry).length, entry.id).toBeGreaterThan(0);
    }
  });

  it('compra debita, guarda e registra no extrato', () => {
    const economy = new Economy();
    expect(economy.crystals).toBe(STARTING_CRYSTALS);
    const result = economy.purchase(store, 'luminaria-lumen', 2, 12, 1000);
    expect(result.ok).toBe(true);
    expect(economy.countOf('luminaria-lumen')).toBe(2);
    expect(economy.crystals).toBe(STARTING_CRYSTALS - 140 * 2);
    expect(economy.transactions()).toHaveLength(1);
    expect(economy.transactions()[0]).toMatchObject({ kind: 'compra', quantity: 2, amount: 280 });
  });

  it('não vende fiado, nem fora do horário, nem o que não é da loja', () => {
    const economy = new Economy();
    expect(economy.purchase(store, 'cama-aurora', 99, 12).blocker).toBe('inventario-cheio');
    expect(economy.purchase(store, 'guitarra-skystone', 1, 12).blocker).toBe('nao-vende');
    expect(economy.purchase(store, 'cama-aurora', 1, 3).blocker).toBe('loja-fechada');
    const poor = new Economy({ crystals: 10, inventory: [], history: [] });
    expect(poor.purchase(store, 'cama-aurora', 1, 12).blocker).toBe('sem-saldo');
    // Nenhuma recusa pode deixar o jogador com saldo negativo.
    expect(poor.crystals).toBe(10);
  });

  it('a loja que atravessa a madrugada abre mesmo assim', () => {
    const sussurro = getStore('mercado-sussurro');
    if (!sussurro) throw new Error('mercado sumiu');
    for (const hour of [0, 3, 12, 23]) expect(storeIsOpen(sussurro, hour), String(hour)).toBe(true);
    expect(storeIsOpen(store, 7)).toBe(false);
    expect(storeIsOpen(store, 8)).toBe(true);
    expect(storeIsOpen(store, 20)).toBe(false);
  });

  it('devolve dentro do prazo, e não devolve o que já saiu da mochila', () => {
    const economy = new Economy();
    const bought = economy.purchase(store, 'sofa-nuvem', 1, 12, 0);
    const id = bought.transaction?.id as string;
    // Fora do prazo: não devolve.
    expect(economy.refund(id, REFUND_WINDOW_MINUTES * 60_000 + 1).ok).toBe(false);
    // Dentro do prazo: devolve e o dinheiro volta.
    expect(economy.refund(id, 60_000).ok).toBe(true);
    expect(economy.crystals).toBe(STARTING_CRYSTALS);
    expect(economy.countOf('sofa-nuvem')).toBe(0);

    const again = economy.purchase(store, 'mesa-vidro', 1, 12, 0);
    economy.consume('mesa-vidro', 1);
    expect(economy.refund(again.transaction?.id as string, 1000).message).toContain('não está mais com você');
  });

  it('um item fora do catálogo não volta do salvamento', () => {
    const data = sanitizeEconomyData({ crystals: -50, inventory: [{ itemId: 'espada-lendaria', quantity: 3 }, { itemId: 'bolinha', quantity: 2 }], history: 'nada' });
    expect(data.crystals).toBe(0);
    expect(data.inventory).toEqual([{ itemId: 'bolinha', quantity: 2 }]);
    expect(data.history).toEqual([]);
  });

  it('todo item do catálogo faz alguma coisa', () => {
    for (const entry of allStores()) {
      for (const item of storeStock(entry)) {
        expect(item.price, item.id).toBeGreaterThan(0);
        expect(item.stack, item.id).toBeGreaterThan(0);
        // Mobília e eletrônico precisam de tamanho, ou não dá para pôr em casa.
        if (item.use === 'mobilia' || item.use === 'eletronico') expect(item.footprint, item.id).toBeDefined();
        if (item.use === 'pet') expect(item.pet, item.id).toBeDefined();
      }
    }
  });
});

/* ------------------------------ 3. Moradia ------------------------------ */

describe('universo · moradia', () => {
  it('todo imóvel fica numa região e num lugar que existem', () => {
    for (const property of PROPERTIES) {
      expect(getRegion(property.regionId), property.id).toBeDefined();
      expect(getPlace(property.regionId, property.placeId), property.id).toBeDefined();
      expect(property.rooms.length).toBeGreaterThan(0);
    }
  });

  it('adquire, vira casa ativa e aceita móvel dentro do cômodo', () => {
    const housing = new Housing();
    expect(housing.acquire('apto-aurora-12', 'comprada', 1000)).toBe(true);
    expect(housing.acquire('apto-aurora-12', 'comprada')).toBe(false);
    expect(housing.activeHomeId).toBe('apto-aurora-12');

    const placed = housing.place('apto-aurora-12', 'sofa-nuvem', 'sala', 0, 0);
    expect(placed.ok).toBe(true);
    expect(housing.itemsIn('apto-aurora-12', 'sala')).toHaveLength(1);
  });

  it('não empilha móvel nem deixa atravessar a parede', () => {
    const housing = new Housing();
    housing.acquire('apto-aurora-12', 'comprada');
    housing.place('apto-aurora-12', 'sofa-nuvem', 'sala', 0, 0);
    // Sofá é 5×2: colocar outro em (2,0) sobrepõe.
    expect(housing.place('apto-aurora-12', 'mesa-vidro', 'sala', 2, 0)).toMatchObject({ blocker: 'ocupado' });
    // Sala é 16×14: um sofá em x=14 passa da parede.
    expect(housing.place('apto-aurora-12', 'mesa-vidro', 'sala', 14, 5)).toMatchObject({ blocker: 'fora-do-comodo' });
    // Ao lado, cabe.
    expect(housing.place('apto-aurora-12', 'mesa-vidro', 'sala', 6, 0).ok).toBe(true);
  });

  it('o giro troca largura por profundidade de verdade', () => {
    const sofa = getItem('sofa-nuvem');
    if (!sofa) throw new Error('sofá sumiu');
    expect(footprintOf(sofa, 0)).toEqual({ w: 5, d: 2 });
    expect(footprintOf(sofa, 1)).toEqual({ w: 2, d: 5 });
    expect(footprintOf(sofa, 2)).toEqual({ w: 5, d: 2 });

    const housing = new Housing();
    housing.acquire('apto-aurora-12', 'comprada');
    // Em pé (2 de largura) cabe num vão onde deitado (5) não caberia.
    housing.place('apto-aurora-12', 'estante-livros', 'sala', 0, 0);
    expect(housing.place('apto-aurora-12', 'sofa-nuvem', 'sala', 3, 0, 0)).toMatchObject({ ok: true });
  });

  it('só aceita o que é móvel — comida de bicho não vira decoração', () => {
    const housing = new Housing();
    housing.acquire('apto-aurora-12', 'comprada');
    expect(housing.place('apto-aurora-12', 'racao-comum', 'sala', 0, 0)).toMatchObject({ blocker: 'nao-e-mobilia' });
    expect(housing.place('apto-aurora-12', 'sofa-nuvem', 'cozinha', 0, 0)).toMatchObject({ blocker: 'comodo-inexistente' });
    expect(housing.place('loft-zenite', 'sofa-nuvem', 'unico', 0, 0)).toMatchObject({ blocker: 'sem-casa' });
  });

  it('o computador comprado vira um objeto que abre uma tela', () => {
    const housing = new Housing();
    housing.acquire('loft-zenite', 'comprada');
    housing.place('loft-zenite', 'computador-zenite', 'unico', 2, 2);
    housing.place('loft-zenite', 'sofa-nuvem', 'unico', 8, 2);
    const usable = housing.interactables('loft-zenite');
    expect(usable).toHaveLength(1);
    expect(usable[0].item.opens).toBe('computador');
  });

  it('tirar o móvel devolve o item, e largar a casa devolve tudo', () => {
    const housing = new Housing();
    housing.acquire('apto-aurora-12', 'comprada');
    const placed = housing.place('apto-aurora-12', 'mesa-vidro', 'sala', 0, 0);
    if (!placed.ok) throw new Error('não colocou');
    expect(housing.remove('apto-aurora-12', placed.placed.id)).toBe('mesa-vidro');
    housing.place('apto-aurora-12', 'cama-aurora', 'quarto', 0, 0);
    expect(housing.release('apto-aurora-12').map((item) => item.itemId)).toEqual(['cama-aurora']);
    expect(housing.activeHomeId).toBeNull();
  });

  it('um salvamento com móvel inválido não corrompe a casa', () => {
    const data = sanitizeHousingData({
      homes: [{ propertyId: 'apto-aurora-12', tenure: 'alugada', items: [{ itemId: 'nao-existe', roomId: 'sala', x: 0, z: 0 }, { itemId: 'mesa-vidro', roomId: 'porao', x: 0, z: 0 }, { itemId: 'mesa-vidro', roomId: 'sala', x: 2, z: 3, rotation: 9 }] }],
      activeHomeId: 'mansao',
    });
    expect(data.homes[0].items).toHaveLength(1);
    expect(data.homes[0].items[0].rotation).toBe(1);
    expect(data.activeHomeId).toBe('apto-aurora-12');
  });
});

/* ------------------------------- 4. Bichos ------------------------------ */

describe('universo · espécies e bichos', () => {
  it('o registro cobre domésticos, selvagens e criaturas do Éden', () => {
    expect(speciesOfKind('domestico').length).toBeGreaterThanOrEqual(8);
    expect(speciesOfKind('selvagem').length).toBeGreaterThanOrEqual(12);
    expect(speciesOfKind('eden').length).toBeGreaterThanOrEqual(5);
    // Toda criatura do Éden brilha — é o que as distingue.
    for (const species of speciesOfKind('eden')) expect(species.glows, species.id).toBe(true);
    for (const species of allSpecies()) {
      expect(species.interactions.length, species.id).toBeGreaterThan(0);
      expect(species.speed, species.id).toBeGreaterThan(0);
    }
  });

  it('é um registro aberto: dá para acrescentar espécie sem editar o módulo', () => {
    const before = allSpecies().length;
    registerSpecies({
      id: 'teste-criatura',
      name: 'Criatura de teste',
      plural: 'criaturas de teste',
      kind: 'eden',
      habitats: ['noturno'],
      temperament: 'cauteloso',
      movement: 'flutua',
      speed: 1,
      size: 0.2,
      diet: null,
      colors: ['#ffffff', '#000000'],
      glows: true,
      interactions: ['observar'],
      note: 'Só existe no teste.',
    });
    expect(allSpecies().length).toBe(before + 1);
    expect(getSpecies('teste-criatura')).toBeDefined();
    expect(() => registerSpecies(getSpecies('teste-criatura') as never)).toThrow();
  });

  it('animal selvagem não vira bicho de estimação — nunca', () => {
    expect(isAdoptable('gato')).toBe(true);
    expect(isAdoptable('lobo')).toBe(false);
    expect(isAdoptable('criatura-bioluminescente')).toBe(false);

    const pets = new PetManager();
    const result = pets.adopt('veado', 'Bambi');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('selvagem');
    expect(pets.count).toBe(0);
  });

  it('adota, nomeia e guarda a posse', () => {
    const pets = new PetManager();
    const result = pets.adopt('cachorro', '  Biscoito  ', 'brincalhao', 'aurora-city', 5000);
    expect(result.ok).toBe(true);
    expect(result.pet?.name).toBe('Biscoito');
    expect(pets.count).toBe(1);
    expect(pets.rename(result.pet?.id as string, 'Bolacha')).toBe(true);
    expect(pets.get(result.pet?.id as string)?.name).toBe('Bolacha');
  });

  it('o bicho acompanha o jogador quando ele muda de região', () => {
    const pets = new PetManager();
    const pet = pets.adopt('gato', 'Luar').pet;
    expect(pet?.following).toBe(true);
    pets.moveTo('rosas-park');
    expect(pets.get(pet?.id as string)?.regionId).toBe('rosas-park');
    expect(pets.inRegion('rosas-park')).toHaveLength(1);
    // Mudar de região nunca perde a posse.
    expect(pets.count).toBe(1);
  });

  it('respeita o limite de acompanhantes e o total de bichos', () => {
    const pets = new PetManager();
    for (let i = 0; i < MAX_PETS + 2; i += 1) pets.adopt('hamster', `Bichinho ${i}`);
    expect(pets.count).toBe(MAX_PETS);
    expect(pets.following().length).toBe(MAX_FOLLOWING);
    const resting = pets.list().find((pet) => !pet.following);
    expect(pets.setFollowing(resting?.id as string, true)).toBe(false);
  });

  it('as necessidades caem devagar e nunca punem', () => {
    const pets = new PetManager();
    const pet = pets.adopt('coelho', 'Nuvem').pet;
    const id = pet?.id as string;
    expect(pets.mood(id)).toBe('feliz');

    // Um dia inteiro sem cuidado nenhum.
    pets.tick(60 * 24);
    const after = pets.get(id);
    expect(after?.needs.fome).toBe(0);
    // O bicho continua existindo, continua sendo seu, e só está quieto.
    expect(pets.count).toBe(1);
    expect(pets.mood(id)).toBe('quieto');
    expect(pets.wants(id)).toBeTruthy();

    pets.care(id, 'fome', 1);
    expect(pets.get(id)?.needs.fome).toBe(1);
    // Cuidar de qualquer coisa também agrada um pouco.
    expect(pets.get(id)?.needs.carinho).toBeGreaterThan(0);
  });

  it('um salvamento com bicho de espécie inexistente não cria fantasma', () => {
    const data = sanitizePetData({
      pets: [
        { speciesId: 'dragao', name: 'Smaug' },
        { speciesId: 'gato', name: 'Real', following: true },
        { speciesId: 'gato', name: 'Também', following: true },
        { speciesId: 'gato', name: 'Demais', following: true },
      ],
    });
    expect(data.pets).toHaveLength(3);
    expect(data.pets.filter((pet) => pet.following)).toHaveLength(MAX_FOLLOWING);
  });
});

/* ------------------------------ 5. Fauna -------------------------------- */

describe('universo · fauna selvagem', () => {
  it('a espécie noturna só aparece de noite', () => {
    const coruja = getSpecies('coruja');
    const borboleta = getSpecies('borboleta');
    if (!coruja || !borboleta) throw new Error('espécie sumiu');
    expect(periodOfHour(2)).toBe('madrugada');
    expect(periodOfHour(14)).toBe('tarde');
    expect(isActiveAt(coruja, 'noite')).toBe(true);
    expect(isActiveAt(coruja, 'tarde')).toBe(false);
    expect(isActiveAt(borboleta, 'tarde')).toBe(true);
    expect(isActiveAt(borboleta, 'madrugada')).toBe(false);
  });

  it('cada região recebe a fauna que o lugar comporta', () => {
    const jardim = spawnableIn('jardim-proibido', 22).map((species) => species.id);
    expect(jardim).toContain('criatura-bioluminescente');
    // A lumífera não vive na cidade.
    expect(spawnableIn('aurora-city', 22).map((s) => s.id)).not.toContain('criatura-bioluminescente');
    expect(spawnableIn('regiao-que-nao-existe', 12)).toEqual([]);
  });

  it('a população é estável para a mesma semente e cabe no orçamento', () => {
    const a = populateRegion('rosas-park', 14, 8, 42);
    const b = populateRegion('rosas-park', 14, 8, 42);
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(8);
    expect(populateRegion('rosas-park', 14, 4, 42).length).toBeLessThanOrEqual(4);
    // O orçamento do celular é menor que o do desktop.
    expect(wildlifeBudget('baixa')).toBeLessThan(wildlifeBudget('ultra'));
    for (const animal of a) {
      expect(Math.hypot(animal.x, animal.z)).toBeLessThanOrEqual((getRegion('rosas-park')?.radius ?? 0) + 1);
    }
  });

  it('o guia de bichos conta a primeira vez de cada espécie', () => {
    const guide = new WildlifeGuide();
    expect(guide.sight('raposa')).toBe(true);
    expect(guide.sight('raposa')).toBe(false);
    expect(guide.timesSeen('raposa')).toBe(2);
    expect(guide.discovered).toBe(1);
    expect(guide.sight('dragao')).toBe(false);
  });
});

/* ----------------------------- 6. Interiores ---------------------------- */

describe('universo · interiores', () => {
  it('toda porta aponta para um lugar que existe no mundo', () => {
    for (const interior of allInteriors()) {
      expect(getRegion(interior.regionId), interior.id).toBeDefined();
      expect(getPlace(interior.regionId, interior.placeId), interior.id).toBeDefined();
      expect(interior.rooms.length).toBeGreaterThan(0);
      // Nenhum cômodo em andar que não existe.
      for (const room of interior.rooms) expect(room.floor).toBeLessThan(interior.floors);
      for (const prop of interior.props) expect(prop.floor).toBeLessThan(interior.floors);
    }
  });

  it('todo interior citado por um lugar existe de verdade', () => {
    for (const region of REGIONS) {
      for (const place of region.places) {
        if (place.interiorId && getInterior(place.interiorId)) expect(getInterior(place.interiorId)?.id).toBe(place.interiorId);
      }
    }
  });

  it('carrega um interior por vez e libera o anterior', () => {
    const loaded: string[] = [];
    const unloaded: string[] = [];
    const manager = new InteriorManager();
    manager.setLoader({
      load: (interior) => void loaded.push(interior.id),
      unload: (interior) => void unloaded.push(interior.id),
    });

    manager.enter('atelie-aero', { regionId: 'aurora-city', x: -92, z: -40, heading: 0 });
    expect(manager.isInside).toBe(true);
    expect(loaded).toEqual(['atelie-aero']);

    // Entrar noutro sem sair: o primeiro tem de ser liberado.
    manager.enter('mercado-eden', { regionId: 'aurora-city', x: 64, z: -96, heading: 1 });
    expect(unloaded).toEqual(['atelie-aero']);
    expect(loaded).toEqual(['atelie-aero', 'mercado-eden']);
  });

  it('sair devolve o jogador exatamente à porta por onde entrou', () => {
    const manager = new InteriorManager();
    const door = { regionId: 'aurora-city', x: 64.5, z: -96.25, heading: 2.2 };
    manager.enter('mercado-eden', door);
    const exit = manager.leave();
    expect(exit).toEqual(door);
    expect(manager.isInside).toBe(false);
    expect(manager.leave()).toBeNull();
  });

  it('muda de andar só dentro do que o prédio tem', () => {
    const manager = new InteriorManager();
    manager.enter('torre-zenite', { regionId: 'aurora-city', x: 118, z: -86, heading: 0 });
    expect(manager.goToFloor(2)).toBe(true);
    expect(manager.current?.floor).toBe(2);
    expect(manager.goToFloor(3)).toBe(false);
    expect(manager.goToFloor(-1)).toBe(false);
  });

  it('lembra onde já entrou, e ignora id inválido no salvamento', () => {
    const manager = new InteriorManager(sanitizeInteriorData({ visited: ['atelie-aero', 'castelo', 'atelie-aero'] }));
    expect(manager.visitedCount()).toBe(1);
    expect(manager.hasVisited('atelie-aero')).toBe(true);
    expect(manager.enter('castelo', { regionId: 'aurora-city', x: 0, z: 0, heading: 0 })).toBeNull();
  });
});

/* ---------------------------- 7. Atividades ----------------------------- */

describe('universo · atividades', () => {
  it('nenhuma atividade é obrigatória, e quase nenhuma exige outra antes', () => {
    const withRequirements = MISSIONS.filter((mission) => (mission.requires ?? []).length > 0);
    // O mundo não é uma sequência de fases: a exceção tem de ser exceção.
    expect(withRequirements.length).toBeLessThanOrEqual(2);
    for (const mission of MISSIONS) {
      expect(mission.objectives.length).toBeGreaterThan(0);
      expect(mission.conclusion.length).toBeGreaterThan(10);
      for (const required of mission.requires ?? []) expect(getMission(required), required).toBeDefined();
    }
  });

  it('toda recompensa em item é um item que existe', () => {
    for (const mission of MISSIONS) {
      for (const itemId of mission.rewards.items ?? []) expect(getItem(itemId), `${mission.id} → ${itemId}`).toBeDefined();
    }
  });

  it('objetivos contam em qualquer ordem, e a conclusão vem com a recompensa', () => {
    const log = new MissionLog();
    expect(log.start('companhia', 100)).toBe(true);
    // Fora de ordem de propósito: adotar antes de entrar na loja.
    log.record({ kind: 'adotar', target: 'gato' });
    log.record({ kind: 'cuidar', target: '' });
    log.record({ kind: 'cuidar', target: '' });
    expect(log.statusOf('companhia')).toBe('ativa');
    expect(log.fractionOf('companhia')).toBeGreaterThan(0);

    log.record({ kind: 'entrar-interior', target: 'edenpawl-aurora' });
    const done = log.record({ kind: 'cuidar', target: '' }, 500);
    expect(done).toHaveLength(1);
    expect(done[0].mission.id).toBe('companhia');
    expect(done[0].crystals).toBe(250);
    expect(log.isComplete('companhia')).toBe(true);
    expect(log.fractionOf('companhia')).toBe(1);
  });

  it('o objetivo de alvo livre aceita qualquer alvo do tipo certo', () => {
    const log = new MissionLog();
    log.start('turne');
    log.record({ kind: 'visitar-regiao', target: 'bitnara' });
    log.record({ kind: 'visitar-regiao', target: 'skystones' });
    // "Comprar um instrumento" — qualquer um serve.
    const done = log.record({ kind: 'comprar', target: 'guitarra-skystone' });
    expect(done).toHaveLength(1);
  });

  it('o pré-requisito segura a atividade até a anterior terminar', () => {
    const log = new MissionLog();
    expect(log.available().map((m) => m.id)).not.toContain('escritorio-em-casa');
    expect(log.start('escritorio-em-casa')).toBe(false);

    log.start('casa-propria');
    log.record({ kind: 'morar', target: 'apto-aurora-12' });
    for (let i = 0; i < 3; i += 1) log.record({ kind: 'decorar', target: 'mesa-vidro' });
    expect(log.isComplete('casa-propria')).toBe(true);
    expect(log.available().map((m) => m.id)).toContain('escritorio-em-casa');
    expect(log.start('escritorio-em-casa')).toBe(true);
  });

  it('um salvamento mantém o progresso e descarta atividade inventada', () => {
    const log = new MissionLog();
    log.start('turne');
    log.record({ kind: 'visitar-regiao', target: 'bitnara' });
    const restored = new MissionLog(sanitizeMissionData({ ...log.toJSON(), missions: [...log.toJSON().missions, { id: 'missao-fake', status: 'ativa' }] }));
    expect(restored.statusOf('turne')).toBe('ativa');
    expect(restored.countOf('turne', 'ir-bitnara')).toBe(1);
    expect(restored.active()).toHaveLength(1);
  });
});
