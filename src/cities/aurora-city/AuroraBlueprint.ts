/**
 * Aurora City como `RegionBlueprint`.
 *
 * Não muda nada de Aurora: só embrulha o que o `World` já fazia à mão,
 * para que a cidade passe a ser uma região entre outras em vez de ser
 * o único cenário que o motor sabe montar.
 */

import { WORLD } from '../../core/Config';
import type { RegionBlueprint, RegionScene, RegionSceneOptions } from '../../world/RegionScene';
import type { HeightField } from '../../world/HeightField';
import type { ZoneMap } from '../../world/ZoneMap';
import { AuroraCity } from './AuroraCity';
import { auroraHeight } from './AuroraTerrain';
import { AREAS, HANGING_GARDENS, LAKE, PIER, PLAZA, SPAWN, coastRadius } from './Layout';
import { type GardenBed, buildAuroraZoneMap, generateGardenBeds, paintControlMap } from './Zones';

/**
 * Os canteiros são gerados uma vez, no `buildZones`, e reaproveitados
 * pelo `paintControl` e pelo `create`. Guardá-los aqui evita gerar a
 * mesma lista três vezes — e evita que as três versões divirjam.
 */
let beds: readonly GardenBed[] = [];

export const auroraBlueprint: RegionBlueprint = {
  id: 'aurora-city',
  name: 'Aurora City',
  terrainSize: WORLD.terrainSize,
  terrainSegments: 320,
  boundaryRadius: WORLD.boundaryRadius,
  waterLevel: WORLD.waterLevel,
  loadingSteps: [
    'Modelando o relevo de Aurora…',
    'Traçando ruas, praças e jardins…',
    'Enchendo o lago, o rio e o mar…',
    'Erguendo as torres de cristal…',
    'Soltando bolhas e vaga-lumes…',
  ],
  height: auroraHeight,
  buildZones(heightField: HeightField): ZoneMap {
    const zones = buildAuroraZoneMap(heightField);
    beds = generateGardenBeds(zones, heightField);
    return zones;
  },
  paintControl(canvas: HTMLCanvasElement): void {
    paintControlMap(canvas, WORLD.terrainSize, beds);
  },
  bubbles() {
    return [
      { x: PLAZA.x, z: PLAZA.z, y: 2.4, radius: 44, count: 70 },
      { x: LAKE.x, z: LAKE.z, y: 0.4, radius: 40, count: 34 },
      { x: HANGING_GARDENS.x, z: HANGING_GARDENS.z, y: 4, radius: 36, count: 30 },
      { x: PIER.x, z: PIER.zStart, y: 0.6, radius: 34, count: 22 },
      { x: 0, z: -150, y: 2.4, radius: 34, count: 26 },
    ];
  },
  habitats() {
    return [
      { habitat: 'urbano' as const, x: PLAZA.x, z: PLAZA.z, radius: 56 },
      { habitat: 'urbano' as const, x: 90, z: 60, radius: 44 },
      { habitat: 'jardim' as const, x: HANGING_GARDENS.x, z: HANGING_GARDENS.z, radius: 40 },
      { habitat: 'jardim' as const, x: -120, z: -40, radius: 46 },
      { habitat: 'floresta' as const, x: 0, z: -170, radius: 60 },
      { habitat: 'agua' as const, x: LAKE.x, z: LAKE.z, radius: 30 },
      { habitat: 'ar' as const, x: PLAZA.x, z: PLAZA.z, radius: 90 },
      { habitat: 'pedra' as const, x: 150, z: -120, radius: 44 },
      { habitat: 'noturno' as const, x: -60, z: -150, radius: 50 },
    ];
  },
  areas() {
    return AREAS;
  },
  coastRadius,
  spawn: SPAWN,
  create(options: RegionSceneOptions): RegionScene {
    return new AuroraCity({ ...options, beds });
  },
};
