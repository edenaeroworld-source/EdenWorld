import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/core/Config';
import { CITIZEN_ARCHETYPES, citizenGreeting, makeCitizen } from '../../src/npc/CitizenData';
import { CitizenSim } from '../../src/npc/CitizenSim';
import { buildAuroraWalkNetwork, insideBuilding } from '../../src/npc/WalkNetwork';
import { createRng } from '../../src/utils/math';

/**
 * Rede de caminhada, cidadãos determinísticos e rotina diária.
 * Tudo aqui é matemática pura: nenhum teste precisa de DOM ou de WebGL.
 */

const network = buildAuroraWalkNetwork();

describe('WalkNetwork', () => {
  it('cobre a cidade com uma malha de nós conectados', () => {
    expect(network.size).toBeGreaterThan(120);
    for (let id = 0; id < network.size; id++) {
      expect(network.neighbors(id).length).toBeGreaterThan(0);
      expect(network.neighbors(id).length).toBeLessThanOrEqual(6);
    }
  });

  it('mantém todos os nós dentro do limite do mundo e fora dos prédios', () => {
    for (let id = 0; id < network.size; id++) {
      const node = network.node(id);
      expect(Math.hypot(node.x, node.z)).toBeLessThanOrEqual(WORLD.boundaryRadius);
      expect(insideBuilding(node.x, node.z)).toBe(false);
    }
  });

  it('não repete nós na mesma posição', () => {
    const seen = new Set<string>();
    for (let id = 0; id < network.size; id++) {
      const node = network.node(id);
      const key = `${node.x.toFixed(1)}:${node.z.toFixed(1)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('acha o nó mais próximo de um ponto qualquer', () => {
    const id = network.nearest(0, 0);
    const node = network.node(id);
    for (let other = 0; other < network.size; other++) {
      const candidate = network.node(other);
      expect(Math.hypot(node.x, node.z)).toBeLessThanOrEqual(Math.hypot(candidate.x, candidate.z) + 1e-6);
    }
  });

  it('traça caminhos ligados entre pontos distantes da cidade', () => {
    const from = network.nearest(0, 0);
    const to = network.nearest(140, 120);
    const path = network.path(from, to);
    expect(path.length).toBeGreaterThan(1);
    expect(path[0]).toBe(from);
    expect(path[path.length - 1]).toBe(to);
    for (let i = 1; i < path.length; i++) {
      expect(network.neighbors(path[i - 1])).toContain(path[i]);
    }
  });

  it('devolve um caminho de um nó só quando origem e destino coincidem', () => {
    const id = network.nearest(20, -20);
    expect(network.path(id, id)).toEqual([id]);
  });

  it('respeita o bloqueio de terreno ao construir a malha', () => {
    const blocked = buildAuroraWalkNetwork({ blocked: (x) => x > 0 });
    expect(blocked.size).toBeGreaterThan(0);
    for (let id = 0; id < blocked.size; id++) expect(blocked.node(id).x).toBeLessThanOrEqual(0);
  });
});

describe('cidadãos', () => {
  it('gera o mesmo habitante para a mesma semente', () => {
    const a = makeCitizen(42);
    const b = makeCitizen(42);
    expect(a).toEqual(b);
    const names = new Set(Array.from({ length: 40 }, (_, seed) => makeCitizen(seed).name));
    expect(names.size).toBeGreaterThan(20);
  });

  it('dá nome, arquétipo e velocidade plausíveis', () => {
    for (let seed = 0; seed < 60; seed++) {
      const citizen = makeCitizen(seed);
      expect(citizen.name.split(' ').length).toBeGreaterThanOrEqual(2);
      expect(CITIZEN_ARCHETYPES).toContain(citizen.archetype);
      expect(citizen.speed).toBeGreaterThan(0.5);
      expect(citizen.speed).toBeLessThan(3.2);
      expect(citizen.appearance.height).toBeGreaterThanOrEqual(0.9);
      expect(citizen.appearance.height).toBeLessThanOrEqual(1.1);
    }
  });

  it('nunca veste a auréola, que é marca do panteão', () => {
    for (let seed = 0; seed < 300; seed++) {
      expect(makeCitizen(seed).appearance.accessory).not.toBe('aureola');
    }
  });

  it('cobre os quatro períodos do dia em toda rotina', () => {
    for (const archetype of CITIZEN_ARCHETYPES) {
      for (const period of ['madrugada', 'manhã', 'tarde', 'noite'] as const) {
        expect(archetype.routine[period].length).toBeGreaterThan(0);
      }
    }
  });

  it('monta saudações contextuais sem linhas vazias', () => {
    const lines = citizenGreeting(makeCitizen(7), {
      period: 'manhã',
      weather: 'Céu limpo',
      area: 'Praça Central',
      playerName: 'Aurora',
      rng: createRng(1),
    });
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line.trim().length).toBeGreaterThan(0);
  });
});

describe('CitizenSim', () => {
  const makeSim = (seed: number) => {
    const rng = createRng(seed + 1);
    return new CitizenSim(makeCitizen(seed), network, network.randomNode(rng), rng, { ground: () => 0 });
  };

  it('começa sobre um nó da rede', () => {
    const sim = makeSim(3);
    expect(Number.isFinite(sim.x)).toBe(true);
    expect(Number.isFinite(sim.z)).toBe(true);
    expect(insideBuilding(sim.x, sim.z)).toBe(false);
  });

  it('caminha e permanece dentro da cidade', () => {
    const sim = makeSim(11);
    let moved = 0;
    let previous = { x: sim.x, z: sim.z };
    for (let step = 0; step < 600; step++) {
      sim.update(1 / 30);
      moved += Math.hypot(sim.x - previous.x, sim.z - previous.z);
      previous = { x: sim.x, z: sim.z };
      expect(Math.hypot(sim.x, sim.z)).toBeLessThanOrEqual(WORLD.boundaryRadius + 2);
    }
    expect(moved).toBeGreaterThan(5);
  });

  it('para para conversar e depois volta a andar', () => {
    const sim = makeSim(5);
    sim.startTalking(sim.x + 1, sim.z, 4);
    const start = { x: sim.x, z: sim.z };
    for (let step = 0; step < 30; step++) sim.update(1 / 30);
    expect(Math.hypot(sim.x - start.x, sim.z - start.z)).toBeLessThan(0.2);
    for (let step = 0; step < 300; step++) sim.update(1 / 30);
    expect(Math.hypot(sim.x - start.x, sim.z - start.z)).toBeGreaterThan(0.2);
  });

  it('mede distância e prioridade de desenho', () => {
    const sim = makeSim(9);
    expect(sim.distanceTo(sim.x, sim.z)).toBeCloseTo(0, 5);
    const near = sim.visualPriority(sim.x, sim.z, 60);
    const far = sim.visualPriority(sim.x + 300, sim.z, 60);
    expect(near).toBeGreaterThan(far);
  });

  it('troca de rotina quando o período do dia muda', () => {
    const sim = makeSim(13);
    sim.setRoutine('manhã');
    sim.setRoutine('noite');
    for (let step = 0; step < 120; step++) sim.update(1 / 30);
    expect(Math.hypot(sim.x, sim.z)).toBeLessThanOrEqual(WORLD.boundaryRadius + 2);
  });
});
