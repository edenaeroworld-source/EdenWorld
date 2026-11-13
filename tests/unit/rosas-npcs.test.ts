/**
 * Gente andando em Rosas Park.
 *
 * O marco pede que a região seja habitada, não decorada. O que se
 * verifica aqui: existe uma malha de caminhada ligada (ninguém nasce
 * numa ilha de onde não sai), ela segue os caminhos do parque e não
 * atravessa parede nem lago.
 */

import { describe, expect, it } from 'vitest';
import { LAKE_ISLAND, PATHS, PAVILIONS, ROSAS_BOUNDARY } from '../../src/cities/rosas-park/RosasLayout';
import { isWaterAt } from '../../src/cities/rosas-park/RosasTerrain';
import { buildAuroraWalkNetwork, buildRosasWalkNetwork, type WalkNetwork } from '../../src/npc/WalkNetwork';

/** Quantos nós são alcançáveis a partir do primeiro. */
function reachable(network: WalkNetwork): number {
  if (network.nodes.length === 0) return 0;
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    for (const next of network.neighbors(current)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size;
}

describe('malha de caminhada de Rosas Park', () => {
  const network = buildRosasWalkNetwork();

  it('existe e tem nós suficientes para a região ser habitada', () => {
    expect(network.nodes.length).toBeGreaterThan(40);
  });

  it('é uma peça só: de qualquer nó se chega a qualquer outro', () => {
    expect(reachable(network)).toBe(network.nodes.length);
  });

  it('não tem nó solto, sem vizinho', () => {
    for (const node of network.nodes) {
      expect(network.neighbors(node.id).length, `nó isolado em ${node.x},${node.z}`).toBeGreaterThan(0);
    }
  });

  it('mantém todo mundo dentro do limite jogável', () => {
    for (const node of network.nodes) {
      expect(Math.hypot(node.x, node.z)).toBeLessThan(ROSAS_BOUNDARY);
    }
  });

  it('não passa por dentro da água nem por dentro das construções', () => {
    for (const node of network.nodes) {
      if (node.kind === 'ponte') continue;
      expect(isWaterAt(node.x, node.z), `nó dentro d'água em ${node.x},${node.z}`).toBe(false);
      for (const pavilion of PAVILIONS) {
        const inside = Math.hypot(node.x - pavilion.x, node.z - pavilion.z) < pavilion.radius - 0.5;
        expect(inside, `nó dentro de ${pavilion.id}`).toBe(false);
      }
    }
  });

  it('acompanha os caminhos desenhados na planta', () => {
    // Cada ponta de caminho tem nó por perto: é por ali que se anda.
    for (const path of PATHS) {
      for (const point of [path[0], path[path.length - 1]]) {
        const near = network.nodes.some((node) => Math.hypot(node.x - point.x, node.z - point.z) < 14);
        expect(near, `caminho sem malha em ${point.x},${point.z}`).toBe(true);
      }
    }
  });

  it('respeita obstáculos informados por quem construiu a região', () => {
    const open = buildRosasWalkNetwork();
    const blocked = buildRosasWalkNetwork({
      blocked: (x, z) => Math.hypot(x, z) < 60,
    });
    expect(blocked.nodes.length).toBeLessThan(open.nodes.length);
    for (const node of blocked.nodes) {
      expect(Math.hypot(node.x, node.z)).toBeGreaterThanOrEqual(60);
    }
    // Mesmo cortada ao meio, continua sendo uma peça só.
    expect(reachable(blocked)).toBe(blocked.nodes.length);
  });

  it('é uma malha diferente da de Aurora: outra região, outro traçado', () => {
    const aurora = buildAuroraWalkNetwork();
    expect(network.nodes.length).not.toBe(aurora.nodes.length);
    const sameSpot = network.nodes.filter((node) =>
      aurora.nodes.some((other) => Math.hypot(node.x - other.x, node.z - other.z) < 0.01),
    );
    expect(sameSpot.length).toBeLessThan(network.nodes.length * 0.2);
  });

  it('chega à ilha do lago: as pontes servem para alguma coisa', () => {
    const onIsland = network.nodes.filter(
      (node) => Math.hypot(node.x - LAKE_ISLAND.x, node.z - LAKE_ISLAND.z) < LAKE_ISLAND.radius,
    );
    expect(onIsland.length).toBeGreaterThan(0);
    // E a ilha está no mesmo pedaço que o resto: dá para chegar lá a pé.
    expect(reachable(network)).toBe(network.nodes.length);
    expect(network.nodes.some((node) => node.kind === 'ponte')).toBe(true);
  });

  it('encosta na porta de cada construção', () => {
    for (const pavilion of PAVILIONS) {
      let closest = Infinity;
      for (const node of network.nodes) {
        closest = Math.min(closest, Math.hypot(node.x - pavilion.x, node.z - pavilion.z) - pavilion.radius);
      }
      // Há nó livre a poucos passos do lote: ninguém fica preso no pátio.
      expect(closest, `${pavilion.id} sem acesso`).toBeLessThan(6);
      expect(closest).toBeGreaterThan(0);
    }
  });

  it('é determinística: duas construções dão a mesma malha', () => {
    const again = buildRosasWalkNetwork();
    expect(again.nodes.length).toBe(network.nodes.length);
    for (let i = 0; i < again.nodes.length; i += 1) {
      expect(again.nodes[i].x).toBeCloseTo(network.nodes[i].x, 6);
      expect(again.nodes[i].z).toBeCloseTo(network.nodes[i].z, 6);
    }
  });
});
