import { TAU, createRng, randRange } from '../../utils/math';
import type { HeightField } from '../../world/HeightField';
import { Zone, ZONE_BLOCKING, ZoneMap } from '../../world/ZoneMap';
import { lakeEllipse } from './AuroraTerrain';
import {
  AVENUES,
  BUILDINGS,
  CORE_FLAT_RADIUS,
  HANGING_GARDENS,
  LAKE,
  LAKE_ISLAND,
  MIRANTE,
  PLAZA,
  RING,
  STAGE,
  TERRAIN_PATHS,
  forecourtRadius,
} from './Layout';

export type BedTheme = 'flores' | 'lumen' | 'tropical';

export interface GardenBed {
  x: number;
  z: number;
  radius: number;
  theme: BedTheme;
}

export interface PavedDisc {
  x: number;
  z: number;
  radius: number;
}

/** Discos de pavimento pintados no terreno (pátios, mirantes, palco). */
export function getPavedDiscs(): PavedDisc[] {
  const discs: PavedDisc[] = BUILDINGS.map((b) => ({ x: b.x, z: b.z, radius: forecourtRadius(b) }));
  discs.push({ x: PLAZA.x, z: PLAZA.z, radius: PLAZA.radius + 1.5 });
  discs.push({ x: STAGE.x, z: STAGE.z, radius: STAGE.radius + 7 });
  discs.push({ x: MIRANTE.x, z: MIRANTE.z, radius: MIRANTE.topRadius - 1.5 });
  discs.push({ x: HANGING_GARDENS.x, z: HANGING_GARDENS.z, radius: 11 });
  discs.push({ x: LAKE_ISLAND.x, z: LAKE_ISLAND.z, radius: LAKE_ISLAND.radius - 2 });
  return discs;
}

/** Constrói a grade de ocupação de Aurora City (sem canteiros). */
export function buildAuroraZoneMap(heightField: HeightField): ZoneMap {
  const zones = new ZoneMap(heightField.size, 1);

  zones.stampWhere((x, z) => heightField.getHeight(x, z) < 0.3, Zone.Water);
  zones.stampWhere((x, z) => {
    const h = heightField.getHeight(x, z);
    return h >= 0.3 && h < 0.95;
  }, Zone.Sand);

  for (const disc of getPavedDiscs()) zones.stampCircle(disc.x, disc.z, disc.radius, Zone.Paved);
  zones.stampRing(0, 0, RING.radius - RING.width / 2 - 0.6, RING.radius + RING.width / 2 + 0.6, Zone.Paved);
  for (const avenue of AVENUES) {
    const cos = Math.cos(avenue.angle);
    const sin = Math.sin(avenue.angle);
    zones.stampSegment(cos * avenue.from, sin * avenue.from, cos * avenue.to, sin * avenue.to, avenue.width / 2 + 0.6, Zone.Paved);
  }
  for (const b of BUILDINGS) zones.stampCircle(b.x, b.z, b.radius + 0.5, Zone.Building);
  for (const path of TERRAIN_PATHS) zones.stampPolyline(path.points, path.width / 2 + 0.5, Zone.Path);

  return zones;
}

/** Gera os canteiros de flores e os registra na grade de ocupação. */
export function generateGardenBeds(zones: ZoneMap, heightField: HeightField): GardenBed[] {
  const rng = createRng(5150);
  const beds: GardenBed[] = [];

  const tryAdd = (x: number, z: number, radius: number, theme: BedTheme, minGap = 3): boolean => {
    if (!zones.isFree(x, z, radius + 1.2, ZONE_BLOCKING | Zone.Sand)) return false;
    if (heightField.getSlope(x, z) > 0.12) return false;
    for (const bed of beds) {
      if (Math.hypot(bed.x - x, bed.z - z) < bed.radius + radius + minGap) return false;
    }
    beds.push({ x, z, radius, theme });
    return true;
  };

  // 1. Anel de canteiros ao redor da praça.
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    tryAdd(Math.cos(a) * 60, Math.sin(a) * 60, 5.5, k % 2 === 0 ? 'flores' : 'lumen');
  }

  // 2. Canteiros nos gramados do núcleo.
  for (let attempt = 0, added = 0; attempt < 400 && added < 22; attempt++) {
    const a = rng() * TAU;
    const r = randRange(rng, 54, CORE_FLAT_RADIUS - 22);
    if (tryAdd(Math.cos(a) * r, Math.sin(a) * r, randRange(rng, 2.6, 4.6), rng() < 0.6 ? 'flores' : 'lumen', 6)) added++;
  }

  // 3. Parque das Águas: canteiros tropicais ao redor do lago.
  for (let attempt = 0, added = 0; attempt < 500 && added < 16; attempt++) {
    const x = LAKE.x + randRange(rng, -78, 78);
    const z = LAKE.z + randRange(rng, -62, 62);
    const e = lakeEllipse(x, z);
    if (e < 1.72 || e > 3.1) continue;
    if (tryAdd(x, z, randRange(rng, 2.8, 5), rng() < 0.5 ? 'tropical' : 'lumen', 5)) added++;
  }

  // 4. Jardins Suspensos: anéis de flores em cada terraço.
  const tierRings = [
    { radius: (HANGING_GARDENS.tiers[0] + HANGING_GARDENS.tiers[1]) / 2 - 2, count: 12 },
    { radius: (HANGING_GARDENS.tiers[1] + HANGING_GARDENS.tiers[2]) / 2 - 2.2, count: 8 },
    { radius: 8.5, count: 5 },
  ];
  tierRings.forEach((ring, tier) => {
    for (let k = 0; k < ring.count; k++) {
      const a = (k / ring.count) * TAU + tier * 0.4;
      tryAdd(
        HANGING_GARDENS.x + Math.cos(a) * ring.radius,
        HANGING_GARDENS.z + Math.sin(a) * ring.radius,
        tier === 2 ? 2.2 : 2.9,
        (k + tier) % 2 === 0 ? 'flores' : 'lumen',
        1.2,
      );
    }
  });

  // 5. Mirante e áreas naturais.
  for (let attempt = 0, added = 0; attempt < 500 && added < 16; attempt++) {
    const a = rng() * TAU;
    const r = randRange(rng, CORE_FLAT_RADIUS + 10, 215);
    if (tryAdd(Math.cos(a) * r, Math.sin(a) * r, randRange(rng, 2.4, 4.2), rng() < 0.5 ? 'tropical' : 'flores', 12)) added++;
  }

  for (const bed of beds) zones.stampCircle(bed.x, bed.z, bed.radius, Zone.Bed);
  return beds;
}

/**
 * Pinta o mapa de controle do terreno.
 * Canais: R = caminhos, G = canteiros, B = pavimento.
 */
export function paintControlMap(canvas: HTMLCanvasElement, terrainSize: number, beds: readonly GardenBed[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[Zones] Canvas 2D indisponível para o mapa de controle');
  const scale = canvas.width / terrainSize;
  const toPx = (v: number): number => (v + terrainSize / 2) * scale;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const softDisc = (x: number, z: number, radius: number, color: string): void => {
    // Borda suave: discos concêntricos com alfa crescente.
    const passes = [
      { grow: 1.0, alpha: 0.34 },
      { grow: 0.5, alpha: 0.33 },
      { grow: 0, alpha: 0.33 },
    ];
    ctx.fillStyle = color;
    for (const pass of passes) {
      ctx.globalAlpha = pass.alpha;
      ctx.beginPath();
      ctx.arc(toPx(x), toPx(z), Math.max(0.5, (radius + pass.grow) * scale), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // Pavimento (azul).
  for (const disc of getPavedDiscs()) softDisc(disc.x, disc.z, disc.radius, '#0000ff');
  ctx.strokeStyle = '#0000ff';
  ctx.lineWidth = (RING.width + 2) * scale;
  ctx.beginPath();
  ctx.arc(toPx(0), toPx(0), RING.radius * scale, 0, TAU);
  ctx.stroke();
  for (const avenue of AVENUES) {
    const cos = Math.cos(avenue.angle);
    const sin = Math.sin(avenue.angle);
    ctx.lineWidth = (avenue.width + 2) * scale;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(toPx(cos * (avenue.from - 2)), toPx(sin * (avenue.from - 2)));
    ctx.lineTo(toPx(cos * (avenue.to + 2)), toPx(sin * (avenue.to + 2)));
    ctx.stroke();
    ctx.lineCap = 'round';
  }

  // Caminhos (vermelho), com borda suave.
  ctx.strokeStyle = '#ff0000';
  for (const path of TERRAIN_PATHS) {
    const passes = [
      { grow: 1.4, alpha: 0.34 },
      { grow: 0.7, alpha: 0.33 },
      { grow: 0, alpha: 0.33 },
    ];
    for (const pass of passes) {
      ctx.globalAlpha = pass.alpha;
      ctx.lineWidth = Math.max(1, (path.width + pass.grow) * scale);
      ctx.beginPath();
      path.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(toPx(p.x), toPx(p.z));
        else ctx.lineTo(toPx(p.x), toPx(p.z));
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Canteiros (verde).
  for (const bed of beds) softDisc(bed.x, bed.z, bed.radius, '#00ff00');

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
