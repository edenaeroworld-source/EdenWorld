/**
 * As regras que cruzam sistemas.
 *
 * Os módulos puros já são testados em `universo.test.ts`. Aqui o alvo é
 * o `UniverseSystem`: o lugar onde comprar mexe na carteira *e* na
 * atividade, onde viajar leva os bichos *e* fecha o interior, onde
 * colocar um móvel tira do inventário *e* conta para a missão.
 *
 * É também onde se prova que o salvamento Genesis antigo continua
 * abrindo — a promessa mais importante desta expansão.
 */

import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, createNewSave, sanitizeSave } from '../../src/systems/SaveSystem';
import { UniverseSystem, type UniverseSaveData } from '../../src/universe/UniverseSystem';
import { getProperty } from '../../src/housing/Housing';
import { STARTING_CRYSTALS } from '../../src/economy/Economy';

const NOW = 1_700_000_000_000;

function universe(): UniverseSystem {
  return new UniverseSystem(createNewSave(NOW) as unknown as UniverseSaveData);
}

/* --------------------------- 1. Economia viva --------------------------- */

describe('universo integrado · dinheiro e coisas', () => {
  it('comprar debita de verdade e o item aparece no inventário', () => {
    const world = universe();
    expect(world.economy.crystals).toBe(STARTING_CRYSTALS);
    expect(world.buy('edenhome-aurora', 'luminaria-lumen', 1, 12)).toBe(true);
    expect(world.economy.crystals).toBe(STARTING_CRYSTALS - 140);
    expect(world.economy.countOf('luminaria-lumen')).toBe(1);
  });

  it('a loja fechada recusa, e o aviso chega a quem escuta', () => {
    const world = universe();
    const avisos: string[] = [];
    world.onNotice((notice) => avisos.push(notice.text));
    expect(world.buy('edenhome-aurora', 'sofa-nuvem', 1, 4)).toBe(false);
    expect(avisos.some((text) => text.includes('fechada'))).toBe(true);
    expect(world.economy.crystals).toBe(STARTING_CRYSTALS);
  });

  it('não dá para morar fiado — e o saldo não encolhe na tentativa', () => {
    const world = universe();
    // O loft custa 9200; o jogador começa com bem menos.
    expect(world.acquireHome('loft-zenite', 'comprada')).toBe(false);
    expect(world.economy.crystals).toBe(STARTING_CRYSTALS);
    expect(world.housing.owns('loft-zenite')).toBe(false);
  });

  it('comprar a casa debita o preço certo e deixa um registro no extrato', () => {
    const world = universe();
    world.economy.earn(10_000, 'teste');
    const price = getProperty('apto-aurora-12')?.price ?? 0;
    const before = world.economy.crystals;
    expect(world.acquireHome('apto-aurora-12', 'comprada')).toBe(true);
    expect(world.economy.crystals).toBe(before - price);
    expect(world.housing.activeHomeId).toBe('apto-aurora-12');
    expect(world.economy.transactions().some((entry) => entry.note.includes('Apartamento 12'))).toBe(true);
  });

  it('pôr um móvel tira do inventário; tirar devolve', () => {
    const world = universe();
    world.economy.earn(10_000, 'teste');
    world.acquireHome('apto-aurora-12', 'comprada');
    world.buy('edenhome-aurora', 'sofa-nuvem', 1, 12);
    expect(world.economy.countOf('sofa-nuvem')).toBe(1);

    expect(world.placeFurniture('apto-aurora-12', 'sofa-nuvem', 'sala', 0, 0)).toBe(true);
    expect(world.economy.countOf('sofa-nuvem')).toBe(0);

    const placed = world.housing.itemsIn('apto-aurora-12', 'sala')[0];
    expect(world.retrieveFurniture('apto-aurora-12', placed.id)).toBe(true);
    expect(world.economy.countOf('sofa-nuvem')).toBe(1);
  });

  it('não coloca o que não se tem, mesmo que caiba', () => {
    const world = universe();
    world.economy.earn(10_000, 'teste');
    world.acquireHome('apto-aurora-12', 'comprada');
    expect(world.placeFurniture('apto-aurora-12', 'cama-aurora', 'quarto', 0, 0)).toBe(false);
    expect(world.housing.itemsIn('apto-aurora-12', 'quarto')).toHaveLength(0);
  });
});

/* ---------------------------- 2. Bichos vivos --------------------------- */

describe('universo integrado · bichos', () => {
  it('a ração some ao ser usada; a bolinha não', () => {
    const world = universe();
    world.buy('edenpawl-aurora', 'racao-comum', 2, 12);
    world.buy('edenpawl-aurora', 'bolinha', 1, 12);
    world.adoptPet('cachorro', 'Biscoito');
    const pet = world.pets.list()[0];
    world.pets.tick(600);

    expect(world.usePetItem(pet.id, 'racao-comum')).toBe(true);
    expect(world.economy.countOf('racao-comum')).toBe(1);
    // Brinquedo é objeto, não consumo: continua na mochila.
    expect(world.usePetItem(pet.id, 'bolinha')).toBe(true);
    expect(world.economy.countOf('bolinha')).toBe(1);
  });

  it('os bichos acompanham o jogador na viagem e nunca se perdem', () => {
    const world = universe();
    world.adoptPet('gato', 'Luar');
    world.travelTo('rosas-park');
    expect(world.regions.currentRegionId).toBe('rosas-park');
    expect(world.pets.count).toBe(1);
    expect(world.pets.inRegion('rosas-park')).toHaveLength(1);
  });

  it('o tempo passa e as necessidades caem, mas o bicho continua seu', () => {
    const world = universe();
    world.adoptPet('coelho', 'Nuvem');
    // Vinte minutos de jogo em passos de um segundo.
    for (let i = 0; i < 1200; i += 1) world.update(1);
    expect(world.pets.count).toBe(1);
    expect(world.pets.list()[0].needs.fome).toBeLessThan(1);
    expect(world.pets.list()[0].needs.fome).toBeGreaterThanOrEqual(0);
  });

  it('o selvagem continua selvagem, mesmo passando pelo sistema inteiro', () => {
    const world = universe();
    const avisos: string[] = [];
    world.onNotice((notice) => avisos.push(notice.text));
    expect(world.adoptPet('lobo', 'Fiel')).toBe(false);
    expect(world.pets.count).toBe(0);
    expect(avisos.some((text) => text.includes('selvagem'))).toBe(true);
  });

  it('avistar uma espécie entra no guia uma única vez', () => {
    const world = universe();
    expect(world.sightSpecies('raposa')).toBe(true);
    expect(world.sightSpecies('raposa')).toBe(false);
    expect(world.wildlife.discovered).toBe(1);
  });
});

/* -------------------------- 3. Atividades vivas ------------------------- */

describe('universo integrado · atividades', () => {
  it('a atividade da Saturno fecha jogando o jogo, não entregando quest', () => {
    const world = universe();
    world.startMission('companhia');

    world.enterInterior('edenpawl-aurora', { regionId: 'aurora-city', x: -138, z: 78, heading: 0 });
    world.adoptPet('gato', 'Luar');
    const pet = world.pets.list()[0];
    world.petPet(pet.id);
    world.petPet(pet.id);

    const before = world.economy.crystals;
    world.petPet(pet.id);

    expect(world.missions.isComplete('companhia')).toBe(true);
    // A recompensa cai na carteira sozinha.
    expect(world.economy.crystals).toBe(before + 250);
    // E os itens prometidos aparecem no inventário.
    expect(world.economy.countOf('racao-comum')).toBeGreaterThan(0);
  });

  it('conversar com quem cuida de uma região revela a região no mapa', () => {
    const world = universe();
    expect(world.regions.knows('bitnara')).toBe(false);
    // Lilly é padroeira de Bitnara e SkyStones: falar com ela conta delas.
    world.talkedTo('lilly');
    expect(world.regions.knows('bitnara')).toBe(true);
    expect(world.regions.knows('skystones')).toBe(true);
    // Mas o que é de exploração continua escondido: tem de ser achado.
    expect(world.regions.knows('jardim-proibido')).toBe(false);
    expect(world.regions.knows('noureja-nether')).toBe(false);
  });

  it('aceitar uma atividade revela os lugares que ela manda visitar', () => {
    const world = universe();
    expect(world.regions.canTravelTo('bitnara')).toBe(false);
    world.startMission('turne');
    // Sem isto, a atividade pediria uma viagem que o próprio jogo recusa.
    expect(world.regions.canTravelTo('bitnara')).toBe(true);
    world.travelTo('bitnara');
    expect(world.missions.countOf('turne', 'ir-bitnara')).toBe(1);
  });

  it('viajar conta para a atividade que pedia para chegar lá', () => {
    const world = universe();
    world.startMission('primeiros-passos');
    world.talkedTo('aerion');
    expect(world.missions.isComplete('primeiros-passos')).toBe(false);
    world.travelTo('rosas-park');
    expect(world.missions.isComplete('primeiros-passos')).toBe(true);
  });

  it('decorar conta, e a atividade da casa fecha sozinha', () => {
    const world = universe();
    world.economy.earn(20_000, 'teste');
    world.startMission('casa-propria');
    world.acquireHome('apto-aurora-12', 'comprada');
    world.buy('edenhome-aurora', 'luminaria-lumen', 2, 12);
    world.buy('edenhome-aurora', 'vaso-samambaia', 1, 12);

    world.placeFurniture('apto-aurora-12', 'luminaria-lumen', 'sala', 0, 0);
    world.placeFurniture('apto-aurora-12', 'luminaria-lumen', 'sala', 2, 0);
    expect(world.missions.isComplete('casa-propria')).toBe(false);
    world.placeFurniture('apto-aurora-12', 'vaso-samambaia', 'sala', 4, 0);
    expect(world.missions.isComplete('casa-propria')).toBe(true);
  });
});

/* --------------------------- 4. Interiores ----------------------------- */

describe('universo integrado · interiores', () => {
  it('viajar de região fecha o interior em que o jogador estava', () => {
    const world = universe();
    world.enterInterior('atelie-aero', { regionId: 'aurora-city', x: -92, z: -40, heading: 0 });
    expect(world.interiors.isInside).toBe(true);
    world.travelTo('rosas-park');
    // O prédio ficou em Aurora City: não dá para continuar dentro dele.
    expect(world.interiors.isInside).toBe(false);
  });

  it('sair devolve à porta de entrada', () => {
    const world = universe();
    const door = { regionId: 'aurora-city', x: -92, z: -40, heading: 1.5 };
    world.enterInterior('atelie-aero', door);
    expect(world.leaveInterior()).toEqual(door);
  });
});

/* --------------------- 5. Salvamento e compatibilidade ------------------ */

describe('universo integrado · salvamento', () => {
  it('guarda e recupera o universo inteiro, sem perder nada pelo caminho', () => {
    const world = universe();
    world.economy.earn(20_000, 'teste');
    world.discoverRegion('bitnara');
    world.travelTo('bitnara');
    world.adoptPet('gato', 'Luar');
    world.acquireHome('apto-aurora-12', 'comprada');
    world.buy('edenhome-aurora', 'mesa-vidro', 1, 12);
    world.startMission('turne');
    world.sightSpecies('borboleta');

    const data = world.toJSON();
    const restored = new UniverseSystem(data);

    expect(restored.regions.currentRegionId).toBe('bitnara');
    expect(restored.regions.knows('bitnara')).toBe(true);
    expect(restored.pets.count).toBe(1);
    expect(restored.pets.list()[0].name).toBe('Luar');
    expect(restored.housing.owns('apto-aurora-12')).toBe(true);
    expect(restored.economy.countOf('mesa-vidro')).toBe(1);
    expect(restored.economy.crystals).toBe(world.economy.crystals);
    expect(restored.missions.statusOf('turne')).toBe('ativa');
    expect(restored.wildlife.hasSeen('borboleta')).toBe(true);
  });

  it('um salvamento Genesis v1 antigo continua abrindo, e ganha o universo vazio', () => {
    const genesis = {
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      profile: { name: 'Viajante', appearance: {}, created: true },
      player: { x: 12, y: 2, z: -30, heading: 1 },
      world: { hours: 10, day: 3 },
      progress: { crystals: ['c1'], entries: [], areas: [], portals: [], wishes: 2, photos: 1, distance: 500, playSeconds: 900, sphereMode: 0 },
    };
    const save = sanitizeSave(genesis, NOW);
    expect(save).not.toBeNull();
    if (!save) return;

    // O progresso antigo sobrevive inteiro.
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.progress.wishes).toBe(2);
    expect(save.progress.distance).toBe(500);
    expect(save.player).toMatchObject({ x: 12, z: -30 });

    // E o universo entra no estado inicial, sem nada inventado.
    expect(save.regions.current).toBe('aurora-city');
    expect(save.regions.discovered).toContain('aurora-city');
    expect(save.economy.crystals).toBe(STARTING_CRYSTALS);
    expect(save.pets.pets).toEqual([]);
    expect(save.housing.homes).toEqual([]);
    expect(save.missions.missions).toEqual([]);

    // E o sistema sobe em cima dele sem reclamar.
    const world = new UniverseSystem(save);
    expect(world.regions.current.name).toBe('Aurora City');
  });

  it('uma posição válida numa região maior que Aurora não é descartada', () => {
    // Jardim Proibido tem raio 210; Aurora, 268. Uma posição a 200 m é
    // válida nas duas. O caso que importa é a ordem de leitura: as
    // regiões precisam ser lidas antes da posição.
    const save = sanitizeSave(
      {
        ...createNewSave(NOW),
        regions: { current: 'rosas-park', discovered: ['aurora-city', 'rosas-park'], positions: {} },
        player: { x: 150, y: 0, z: 100, heading: 0 },
      },
      NOW,
    );
    expect(save?.regions.current).toBe('rosas-park');
    expect(save?.player).toMatchObject({ x: 150, z: 100 });
  });

  it('um salvamento adulterado não trava o jogador fora do mundo', () => {
    const save = sanitizeSave({ ...createNewSave(NOW), regions: { current: 'mordor', discovered: ['mordor'], positions: {} } }, NOW);
    expect(save?.regions.current).toBe('aurora-city');
    const world = new UniverseSystem(save as unknown as UniverseSaveData);
    expect(world.regions.current.id).toBe('aurora-city');
  });
});
