// @vitest-environment happy-dom
/**
 * As telas do universo, desenhadas de verdade num DOM.
 *
 * O pedido foi explícito: nada de botão decorativo. Cada caso aqui
 * desenha a tela, clica num botão real e confere que o **estado do
 * jogo** mudou — não que a tela ficou bonita.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createNewSave } from '../../src/systems/SaveSystem';
import { UniverseSystem, type UniverseSaveData } from '../../src/universe/UniverseSystem';
import { type UniverseAppHost, buildActivities, buildAtlas, buildHomes, buildPets, buildStores, buildWallet } from '../../src/interface/UniverseApps';

const NOW = 1_700_000_000_000;

function makeHost(hour = 12) {
  const world = new UniverseSystem(createNewSave(NOW) as unknown as UniverseSaveData);
  const travelled: string[] = [];
  let refreshes = 0;
  const host: UniverseAppHost = {
    universe: () => world,
    worldHour: () => hour,
    requestTravel: (regionId) => {
      travelled.push(regionId);
      world.travelTo(regionId);
    },
    refresh: () => {
      refreshes += 1;
    },
  };
  return { host, world, travelled, refreshes: () => refreshes };
}

let content: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  content = document.createElement('div');
  document.body.appendChild(content);
});

const text = (): string => content.textContent ?? '';
const buttons = (): HTMLButtonElement[] => [...content.querySelectorAll('button')];
const buttonWith = (needle: string): HTMLButtonElement | undefined => buttons().find((b) => (b.textContent ?? '').includes(needle));

/* ------------------------------ Mapa do Éden ---------------------------- */

describe('tela · Mapa do Éden', () => {
  it('mostra as regiões conhecidas e esconde as que não foram descobertas', () => {
    const { host } = makeHost();
    buildAtlas(host, content);
    expect(text()).toContain('Aurora City');
    expect(text()).toContain('Rosas Park');
    // Jardim Proibido é de exploração: não começa conhecido.
    expect(text()).toContain('Região não descoberta');
    expect(text()).not.toContain('Jardim Proibido');
  });

  it('o botão de viajar viaja mesmo — e o jogador muda de região', () => {
    const { host, world } = makeHost();
    buildAtlas(host, content);
    const travel = buttonWith('Viajar para cá');
    expect(travel).toBeDefined();
    travel?.click();
    expect(world.regions.currentRegionId).toBe('rosas-park');
  });

  it('diz a verdade sobre as regiões cujo cenário ainda não existe', () => {
    const { host, world } = makeHost();
    world.discoverRegion('bitnara');
    buildAtlas(host, content);
    expect(text()).toContain('cenário desta região ainda está em construção');
  });

  it('não oferece viagem para onde o jogador está, e explica o bloqueio', () => {
    const { host } = makeHost();
    buildAtlas(host, content);
    expect(text()).toContain('Você está aqui.');
  });
});

/* -------------------------------- Lojas --------------------------------- */

describe('tela · Lojas', () => {
  it('comprar pelo botão debita a carteira e guarda o item', () => {
    const { host, world } = makeHost(12);
    buildStores(host, content);
    const before = world.economy.crystals;
    const buy = buttonWith('Comprar');
    expect(buy).toBeDefined();
    buy?.click();
    expect(world.economy.crystals).toBeLessThan(before);
    expect(world.economy.inventory().length).toBe(1);
  });

  it('de madrugada a loja aparece fechada e não vende', () => {
    const { host, world } = makeHost(4);
    buildStores(host, content);
    expect(text()).toContain('Abre às');
    const before = world.economy.crystals;
    buttonWith('Comprar')?.click();
    expect(world.economy.crystals).toBe(before);
  });
});

/* ------------------------------- Carteira -------------------------------- */

describe('tela · Carteira', () => {
  it('mostra saldo, inventário e extrato reais', () => {
    const { host, world } = makeHost();
    world.buy('edenhome-aurora', 'luminaria-lumen', 1, 12);
    buildWallet(host, content);
    expect(text()).toContain('Luminária Lúmen');
    expect(text()).toContain('Extrato');
    expect(text()).toContain(world.economy.crystals.toLocaleString('pt-BR'));
  });

  it('sem nada comprado, diz que está vazio em vez de inventar itens', () => {
    const { host } = makeHost();
    buildWallet(host, content);
    expect(text()).toContain('Nada guardado ainda');
  });
});

/* -------------------------------- Bichos --------------------------------- */

describe('tela · EdenPawl', () => {
  it('adotar pelo botão cria o bicho de verdade', () => {
    const { host, world } = makeHost();
    buildPets(host, content);
    expect(world.pets.count).toBe(0);
    buttonWith('Adotar')?.click();
    expect(world.pets.count).toBe(1);
  });

  it('só oferece animal doméstico para adoção', () => {
    const { host } = makeHost();
    buildPets(host, content);
    expect(text()).toContain('Gato');
    expect(text()).toContain('Cachorro');
    // Selvagens não entram na lista de adoção.
    expect(text()).not.toContain('Lobo');
    expect(text()).not.toContain('Capivara');
    expect(text()).toContain('continua selvagem');
  });

  it('fazer carinho muda a necessidade do bicho', () => {
    const { host, world } = makeHost();
    world.adoptPet('gato', 'Luar');
    world.pets.tick(600);
    const before = world.pets.list()[0].needs.carinho;
    buildPets(host, content);
    buttonWith('Fazer carinho')?.click();
    expect(world.pets.list()[0].needs.carinho).toBeGreaterThan(before);
  });
});

/* ------------------------------- Imóveis --------------------------------- */

describe('tela · Imóveis', () => {
  it('sem dinheiro, comprar não dá casa a ninguém', () => {
    const { host, world } = makeHost();
    buildHomes(host, content);
    buttonWith('Comprar')?.click();
    expect(world.housing.list()).toHaveLength(0);
  });

  it('com dinheiro, o botão compra e a casa aparece na lista', () => {
    const { host, world } = makeHost();
    world.economy.earn(20_000, 'teste');
    buildHomes(host, content);
    buttonWith('Comprar')?.click();
    expect(world.housing.list().length).toBeGreaterThan(0);
  });
});

/* ----------------------------- Atividades -------------------------------- */

describe('tela · Atividades', () => {
  it('aceitar pelo botão deixa a atividade em andamento', () => {
    const { host, world } = makeHost();
    buildActivities(host, content);
    expect(world.missions.active()).toHaveLength(0);
    buttonWith('Aceitar')?.click();
    expect(world.missions.active().length).toBe(1);
  });

  it('deixa claro que nada é obrigatório', () => {
    const { host } = makeHost();
    buildActivities(host, content);
    expect(text()).toContain('Nada aqui é obrigatório');
    expect(text()).toContain('não tem fases');
  });

  it('mostra o andamento objetivo a objetivo', () => {
    const { host, world } = makeHost();
    world.startMission('turne');
    world.travelTo('bitnara');
    buildActivities(host, content);
    expect(text()).toContain('Em andamento');
    expect(text()).toContain('(1/1)');
  });
});
