/**
 * Rosas Park como `RegionBlueprint`.
 */

import type { BubbleZone, RegionBlueprint, RegionScene, RegionSceneOptions } from '../../world/RegionScene';
import type { HeightField } from '../../world/HeightField';
import type { ZoneMap } from '../../world/ZoneMap';
import { BASIN, LAKE, LAKE_ISLAND, PAVILIONS, ROSAS_BOUNDARY, ROSAS_TERRAIN_SIZE, ROSE_GARDEN, WATER, WATERFALLS, waterfallPosition } from './RosasLayout';
import { RosasPark } from './RosasPark';
import { rosasHeight } from './RosasTerrain';
import { buildRosasZoneMap, paintRosasControlMap } from './RosasZones';

export const rosasBlueprint: RegionBlueprint = {
  id: 'rosas-park',
  name: 'Rosas Park',
  terrainSize: ROSAS_TERRAIN_SIZE,
  terrainSegments: 288,
  boundaryRadius: ROSAS_BOUNDARY,
  waterLevel: WATER,
  loadingSteps: [
    'Abrindo os caminhos do parque…',
    'Plantando onze mil roseiras…',
    'Enchendo o lago das lontras…',
    'Acendendo as cascatas…',
    'Soltando borboletas…',
  ],
  // Verde mais vivo e areia mais clara: é parque, não cidade.
  palette: {
    grassA: 0x2f9e5e,
    grassB: 0x7fe08a,
    sand: 0xf3e7c4,
    path: 0xf2ece0,
    pavement: 0xf6fbff,
    soil: 0x3a6f45,
  },
  height: rosasHeight,
  buildZones(heightField: HeightField): ZoneMap {
    return buildRosasZoneMap(heightField);
  },
  paintControl(canvas: HTMLCanvasElement): void {
    paintRosasControlMap(canvas);
  },
  bubbles() {
    const zones: BubbleZone[] = [
      { x: LAKE.x, z: LAKE.z, y: 0.5, radius: 46, count: 40 },
      { x: BASIN.x, z: BASIN.z, y: 0.6, radius: 30, count: 34 },
      { x: ROSE_GARDEN.x, z: ROSE_GARDEN.z, y: 2.2, radius: 40, count: 46 },
    ];
    // Névoa luminosa no pé de cada cascata.
    for (const fall of WATERFALLS) {
      const { x, z } = waterfallPosition(fall);
      zones.push({ x, z, y: 1.6, radius: 18, count: 26 });
    }
    return zones;
  },
  habitats() {
    return [
      // Água: o lago das lontras e a lagoa ao pé das cascatas.
      { habitat: 'agua' as const, x: LAKE.x, z: LAKE.z, radius: 34 },
      { habitat: 'agua' as const, x: BASIN.x, z: BASIN.z, radius: 16 },
      // Jardim: o roseiral e as bordas dos caminhos.
      { habitat: 'jardim' as const, x: ROSE_GARDEN.x, z: ROSE_GARDEN.z, radius: 44 },
      { habitat: 'jardim' as const, x: 40, z: 40, radius: 30 },
      // Floresta: os bosques de sakura e a mata tropical.
      { habitat: 'floresta' as const, x: 84, z: 60, radius: 40 },
      { habitat: 'floresta' as const, x: -98, z: -58, radius: 36 },
      { habitat: 'floresta' as const, x: -112, z: 96, radius: 34 },
      // Ar: as borboletas cruzam o parque inteiro.
      { habitat: 'ar' as const, x: 0, z: 0, radius: 120 },
      // Pedra: o paredão das cascatas.
      { habitat: 'pedra' as const, x: -34, z: -40, radius: 30 },
      // Urbano: o pátio das construções é o que mais parece cidade aqui.
      { habitat: 'urbano' as const, x: 56, z: 30, radius: 26 },
      // Noturno: o bosque mais fechado, longe das luzes.
      { habitat: 'noturno' as const, x: 112, z: -22, radius: 32 },
    ];
  },
  areas() {
    return [
      { id: 'roseiral', name: 'Roseiral Maior', x: ROSE_GARDEN.x, z: ROSE_GARDEN.z, radius: ROSE_GARDEN.tiers[0] + 6 },
      { id: 'ilha-lago', name: 'Ilha das Lontras', x: LAKE_ISLAND.x, z: LAKE_ISLAND.z, radius: LAKE_ISLAND.radius + 4 },
      { id: 'lago', name: 'Lago das Lontras', x: LAKE.x, z: LAKE.z, radius: 58 },
      { id: 'cascatas', name: 'Cascatas de Rosas Park', x: BASIN.x, z: BASIN.z, radius: 40 },
      ...PAVILIONS.map((pavilion) => ({ id: pavilion.id, name: pavilion.name, x: pavilion.x, z: pavilion.z, radius: pavilion.radius + 9 })),
      { id: 'bosque-sakura', name: 'Bosque das Sakuras', x: 40, z: 12, radius: 36 },
      { id: 'mata-tropical', name: 'Mata Tropical', x: 84, z: 60, radius: 46 },
      { id: 'portal-rosas', name: 'Entrada do Parque', x: 0, z: 110, radius: 26 },
    ];
  },
  // Rosas Park não é ilha: a "costa" é o próprio limite do parque, de
  // onde se ouve a água do lago e das quedas.
  coastRadius() {
    return ROSAS_BOUNDARY + 20;
  },
  spawn: { x: 0, z: 96, heading: Math.PI },
  create(options: RegionSceneOptions): RegionScene {
    return new RosasPark(options);
  },
};
