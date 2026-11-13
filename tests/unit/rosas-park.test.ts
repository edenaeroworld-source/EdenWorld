/**
 * Rosas Park: o relevo, a planta e as regras que tornam a região
 * caminhável de verdade.
 *
 * Estes testes são sobre geometria, não sobre dados: eles perguntam
 * "dá para andar aqui?", "o lago é mesmo fundo?", "o caminho vira
 * escada?" — que é o que diferencia uma região construída de uma
 * entrada no banco de dados.
 */

import { describe, expect, it } from 'vitest';
import {
  BASIN,
  BRIDGES,
  CLIFF,
  FLOATING_GARDENS,
  GROVES,
  GROUND,
  LAKE,
  LAKE_ISLAND,
  LANDMARKS,
  PATHS,
  PATH_WIDTH,
  PAVILIONS,
  ROSAS_BOUNDARY,
  ROSE_GARDEN,
  WATERFALLS,
  basinEllipse,
  cliffAngle,
  lakeEllipse,
  waterfallPosition,
} from '../../src/cities/rosas-park/RosasLayout';
import { isWaterAt, pathDistance, rosasHeight } from '../../src/cities/rosas-park/RosasTerrain';
import { getBlueprint, builtRegionIds, hasScene } from '../../src/cities';
import { getRegion } from '../../src/regions/Region';
import { getInterior, interiorsInRegion } from '../../src/interiors/Interior';

describe('planta de Rosas Park', () => {
  it('cabe dentro do raio que a região declara', () => {
    const radius = getRegion('rosas-park')?.radius ?? 0;
    expect(ROSAS_BOUNDARY).toBe(radius);

    const points = [
      ...PAVILIONS.map((p) => ({ x: p.x, z: p.z })),
      ...LANDMARKS.map((l) => ({ x: l.x, z: l.z })),
      ...FLOATING_GARDENS.map((g) => ({ x: g.x, z: g.z })),
      ...PATHS.flat(),
    ];
    for (const point of points) {
      expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(ROSAS_BOUNDARY);
    }
  });

  it('coloca cada construção onde o Atlas diz que ela fica', () => {
    const region = getRegion('rosas-park');
    expect(region).toBeDefined();
    for (const pavilion of PAVILIONS) {
      const place = region?.places.find((candidate) => candidate.id === pavilion.id);
      if (!place) continue;
      expect([place.x, place.z]).toEqual([pavilion.x, pavilion.z]);
    }
  });

  it('não sobrepõe duas construções', () => {
    for (let i = 0; i < PAVILIONS.length; i += 1) {
      for (let k = i + 1; k < PAVILIONS.length; k += 1) {
        const a = PAVILIONS[i];
        const b = PAVILIONS[k];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.radius + b.radius);
      }
    }
  });

  it('tem lugares escondidos fora dos caminhos e visíveis perto deles', () => {
    const hidden = LANDMARKS.filter((landmark) => landmark.hidden);
    expect(hidden.length).toBeGreaterThanOrEqual(3);
    for (const landmark of hidden) {
      // Um lugar escondido que fica em cima do caminho não está escondido.
      expect(pathDistance(landmark.x, landmark.z)).toBeGreaterThan(PATH_WIDTH * 2);
    }
  });

  it('põe as cascatas dentro do arco do paredão', () => {
    expect(WATERFALLS.length).toBe(3);
    for (const fall of WATERFALLS) {
      expect(fall.angle).toBeGreaterThanOrEqual(CLIFF.arcFrom);
      expect(fall.angle).toBeLessThanOrEqual(CLIFF.arcTo);
      const { x, z } = waterfallPosition(fall);
      expect(cliffAngle(x, z)).not.toBeNull();
    }
  });

  it('liga as duas margens do lago pela ilha', () => {
    const toIsland = BRIDGES.filter((bridge) => {
      const dFrom = Math.hypot(bridge.from.x - LAKE_ISLAND.x, bridge.from.z - LAKE_ISLAND.z);
      const dTo = Math.hypot(bridge.to.x - LAKE_ISLAND.x, bridge.to.z - LAKE_ISLAND.z);
      return Math.min(dFrom, dTo) < LAKE_ISLAND.radius + 26;
    });
    expect(toIsland.length).toBeGreaterThanOrEqual(2);
  });

  it('declara bosques de sakura e de mata tropical', () => {
    const kinds = new Set(GROVES.map((grove) => grove.kind));
    expect(kinds.has('sakura')).toBe(true);
    expect(kinds.has('tropical')).toBe(true);
  });
});

describe('relevo de Rosas Park', () => {
  it('escava o lago abaixo da linha d’água e o deixa raso na margem', () => {
    const center = rosasHeight(LAKE.x, LAKE.z);
    expect(center).toBeLessThan(-2);
    expect(center).toBeGreaterThan(-LAKE.depth - 1);

    // Na margem o fundo já subiu: dá para entrar andando.
    const bank = rosasHeight(LAKE.x + LAKE.radiusX * 0.95, LAKE.z);
    expect(bank).toBeGreaterThan(center);
    expect(lakeEllipse(LAKE.x, LAKE.z)).toBeLessThan(1);
  });

  it('faz a ilha do lago emergir da água', () => {
    // A ilha é chão seco **dentro** do contorno do lago.
    expect(rosasHeight(LAKE_ISLAND.x, LAKE_ISLAND.z)).toBeGreaterThan(1);
    expect(lakeEllipse(LAKE_ISLAND.x, LAKE_ISLAND.z)).toBeLessThan(1);
    expect(isWaterAt(LAKE_ISLAND.x, LAKE_ISLAND.z)).toBe(false);

    // E tem água em volta: a ilha é ilha, não península.
    const ring = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const radius = LAKE_ISLAND.radius + 6;
      return isWaterAt(LAKE_ISLAND.x + Math.cos(angle) * radius, LAKE_ISLAND.z + Math.sin(angle) * radius);
    });
    // Sobra o ponto onde a ponte encosta; o resto é água em volta.
    expect(ring.filter(Boolean).length).toBeGreaterThanOrEqual(7);
  });

  it('levanta o paredão só dentro do arco', () => {
    const inside = CLIFF.arcFrom + (CLIFF.arcTo - CLIFF.arcFrom) * 0.5;
    const high = rosasHeight(CLIFF.x + Math.cos(inside) * (CLIFF.radius - 24), CLIFF.z + Math.sin(inside) * (CLIFF.radius - 24));
    // Logo depois do fim do arco o degrau já não existe.
    const outside = CLIFF.arcTo + 0.6;
    const low = rosasHeight(CLIFF.x + Math.cos(outside) * (CLIFF.radius - 24), CLIFF.z + Math.sin(outside) * (CLIFF.radius - 24));
    expect(high).toBeGreaterThan(low + 6);
  });

  it('dá altura à lagoa das quedas e ao roseiral em terraços', () => {
    expect(rosasHeight(BASIN.x, BASIN.z)).toBeLessThan(0);
    expect(basinEllipse(BASIN.x, BASIN.z)).toBeLessThan(1);

    const core = rosasHeight(ROSE_GARDEN.x, ROSE_GARDEN.z);
    const outerRing = rosasHeight(ROSE_GARDEN.x + ROSE_GARDEN.tiers[0] - 4, ROSE_GARDEN.z);
    // O mirante central é o ponto mais alto do jardim.
    expect(core).toBeGreaterThan(outerRing);
  });

  it('nivela os caminhos: nenhum vira escada', () => {
    for (const path of PATHS) {
      for (let i = 0; i < path.length - 1; i += 1) {
        const a = path[i];
        const b = path[i + 1];
        const steps = 24;
        let previous = rosasHeight(a.x, a.z);
        for (let k = 1; k <= steps; k += 1) {
          const t = k / steps;
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          const y = rosasHeight(x, z);
          const run = Math.hypot(b.x - a.x, b.z - a.z) / steps;
          // Inclinação máxima aceitável: menos de 45°, sem degrau.
          expect(Math.abs(y - previous)).toBeLessThan(Math.max(1.2, run));
          previous = y;
        }
      }
    }
  });

  it('nunca deixa um caminho submerso', () => {
    for (const path of PATHS) {
      for (const point of path) {
        expect(rosasHeight(point.x, point.z)).toBeGreaterThan(0.2);
      }
    }
  });

  it('aplaina o lote de cada construção', () => {
    for (const pavilion of PAVILIONS) {
      const center = rosasHeight(pavilion.x, pavilion.z);
      for (const angle of [0, 1.6, 3.1, 4.7]) {
        const x = pavilion.x + Math.cos(angle) * pavilion.radius;
        const z = pavilion.z + Math.sin(angle) * pavilion.radius;
        expect(Math.abs(rosasHeight(x, z) - center)).toBeLessThan(0.6);
      }
    }
  });

  it('é determinístico: a mesma coordenada devolve sempre a mesma altura', () => {
    for (const [x, z] of [
      [0, 0],
      [-70, 44],
      [96, -62],
      [123.5, -8.25],
    ]) {
      expect(rosasHeight(x, z)).toBe(rosasHeight(x, z));
    }
  });

  it('desce o terreno fora do limite jogável', () => {
    expect(rosasHeight(0, ROSAS_BOUNDARY + 50)).toBeLessThan(GROUND);
  });
});

describe('Rosas Park como região construída', () => {
  it('consta do registro de cenários 3D', () => {
    expect(hasScene('rosas-park')).toBe(true);
    expect(builtRegionIds()).toContain('aurora-city');
    expect(builtRegionIds()).toContain('rosas-park');
    // Uma região sem cenário continua dizendo a verdade.
    expect(hasScene('noureja-nether')).toBe(false);
  });

  it('está marcada como jogável, e só as que têm cenário estão', () => {
    expect(getRegion('rosas-park')?.playable).toBe(true);
    for (const id of ['bitnara', 'skystones', 'noureja-nether', 'cidade-da-liberdade', 'jardim-proibido']) {
      expect(getRegion(id)?.playable).toBe(false);
      expect(hasScene(id)).toBe(false);
    }
  });

  it('entrega um blueprint completo', () => {
    const blueprint = getBlueprint('rosas-park');
    expect(blueprint).not.toBeNull();
    expect(blueprint?.terrainSize).toBeGreaterThan(ROSAS_BOUNDARY * 2);
    expect(blueprint?.boundaryRadius).toBe(ROSAS_BOUNDARY);
    expect(blueprint?.loadingSteps).toHaveLength(5);
    expect(blueprint?.areas().length).toBeGreaterThan(5);
    expect(blueprint?.bubbles().length).toBeGreaterThan(3);
  });

  it('o ponto de partida fica em terra firme e dentro do limite', () => {
    const spawn = getBlueprint('rosas-park')?.spawn;
    expect(spawn).toBeDefined();
    if (!spawn) return;
    expect(Math.hypot(spawn.x, spawn.z)).toBeLessThan(ROSAS_BOUNDARY);
    expect(rosasHeight(spawn.x, spawn.z)).toBeGreaterThan(0.3);
    expect(isWaterAt(spawn.x, spawn.z)).toBe(false);
  });

  it('dá a cada habitat um lugar de verdade dentro do parque', () => {
    const anchors = getBlueprint('rosas-park')?.habitats() ?? [];
    const habitats = new Set(anchors.map((anchor) => anchor.habitat));
    for (const habitat of ['agua', 'jardim', 'floresta', 'ar']) {
      expect(habitats.has(habitat as never)).toBe(true);
    }
    // A âncora de água está mesmo na água.
    for (const anchor of anchors.filter((candidate) => candidate.habitat === 'agua')) {
      expect(isWaterAt(anchor.x, anchor.z)).toBe(true);
    }
    for (const anchor of anchors) {
      expect(Math.hypot(anchor.x, anchor.z)).toBeLessThan(ROSAS_BOUNDARY);
    }
  });

  it('tem interior residencial, de loja e público, cada um atrás de uma porta', () => {
    const interiors = interiorsInRegion('rosas-park');
    const categories = interiors.map((interior) => interior.category);
    expect(categories).toContain('casa');
    expect(categories).toContain('shopping');
    expect(categories).toContain('santuario');

    // Toda porta declarada na planta abre um interior que existe.
    for (const pavilion of PAVILIONS) {
      if (!pavilion.interiorId) continue;
      const interior = getInterior(pavilion.interiorId);
      expect(interior, `interior ausente: ${pavilion.interiorId}`).toBeDefined();
      expect(interior?.regionId).toBe('rosas-park');
    }
    // E todo interior da região tem uma porta no mundo.
    for (const interior of interiors) {
      expect(PAVILIONS.some((pavilion) => pavilion.interiorId === interior.id)).toBe(true);
    }
  });
});
