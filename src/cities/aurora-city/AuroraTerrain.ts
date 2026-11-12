import { WORLD } from '../../core/Config';
import { distanceToPolyline, fbm2, lerp, smoothstep } from '../../utils/math';
import {
  BEACH,
  BUILDINGS,
  CORE_FLAT_RADIUS,
  H0,
  HANGING_GARDENS,
  LAKE,
  LAKE_ISLAND,
  MIRANTE,
  RIVER,
  STAGE,
  coastRadius,
  forecourtRadius,
} from './Layout';

/**
 * Função de altura de Aurora City (pura e determinística).
 *
 * Compõe: ilha com costa orgânica → colinas suaves → lago, ilha do lago
 * e rio → Jardins Suspensos (terraços) → Mirante Celeste → praia larga
 * ao sul → nivelamento dos lotes dos edifícios.
 */

const SEABED = -7;
const SEED = 2031;

/** Distância elíptica em que a margem do lago reencontra o nível do parque. */
const LAKE_BANK = 1.3;

const lakeCos = Math.cos(LAKE.rotation);
const lakeSin = Math.sin(LAKE.rotation);

/** Distância elíptica normalizada ao lago (1 = linha d'água). */
export function lakeEllipse(x: number, z: number): number {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const lx = dx * lakeCos - dz * lakeSin;
  const lz = dx * lakeSin + dz * lakeCos;
  return Math.hypot(lx / LAKE.radiusX, lz / LAKE.radiusZ);
}

export function riverDistance(x: number, z: number): number {
  // Rejeição rápida: o rio ocupa apenas o sudoeste.
  if (x > -80 || z < 40) return Infinity;
  return distanceToPolyline(x, z, RIVER);
}

export function auroraHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const coast = coastRadius(angle);

  // 1. Ilha: platô → praia → fundo do mar.
  const land = smoothstep(coast + 26, coast - 40, r);
  let h = lerp(SEABED, H0, land);

  // 2. Relevo natural fora do núcleo urbano.
  const wild = smoothstep(CORE_FLAT_RADIUS, CORE_FLAT_RADIUS + 34, r) * smoothstep(coast + 4, coast - 30, r);
  if (wild > 0) {
    const rolling = (fbm2(x * 0.018, z * 0.018, 4, SEED) - 0.5) * 3.4 + (fbm2(x * 0.06, z * 0.06, 2, SEED + 9) - 0.5) * 0.7;
    h += rolling * wild;
  }

  // 3. Jardins Suspensos: terraços circulares.
  {
    const d = Math.hypot(x - HANGING_GARDENS.x, z - HANGING_GARDENS.z);
    const outer = HANGING_GARDENS.tiers[0];
    if (d < outer + 14) {
      const base = smoothstep(outer + 14, outer + 2, d);
      h = lerp(h, H0 + 0.2, base);
      const w = HANGING_GARDENS.riserWidth;
      for (const tier of HANGING_GARDENS.tiers) {
        h += HANGING_GARDENS.tierRise * smoothstep(tier, tier - w, d);
      }
    }
  }

  // 4. Mirante Celeste: colina com topo plano.
  {
    const d = Math.hypot(x - MIRANTE.x, z - MIRANTE.z);
    if (d < MIRANTE.radius) {
      const k = smoothstep(MIRANTE.radius, MIRANTE.topRadius, d);
      const hill = MIRANTE.height * Math.pow(k, 1.25);
      // Garante que o lado do mar também suba (falésia), não só o lado da cidade.
      h = Math.max(h, lerp(h, H0, k)) + hill;
    }
  }

  // 5. Praia larga ao sul.
  {
    const mask = smoothstep(BEACH.z - 16, BEACH.z + 2, z) * smoothstep(BEACH.halfWidth, BEACH.halfWidth - 24, Math.abs(x));
    if (mask > 0 && h > BEACH.level) {
      h = lerp(h, BEACH.level + (fbm2(x * 0.09, z * 0.09, 2, SEED + 3) - 0.5) * 0.18, mask);
    }
  }

  // 6. Lotes de edifícios fora do núcleo: terreno nivelado.
  if (r > CORE_FLAT_RADIUS - 8) {
    for (const b of BUILDINGS) {
      const fr = forecourtRadius(b);
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < fr + 12) {
        h = lerp(h, H0, smoothstep(fr + 12, fr + 1, d));
      }
    }
    const ds = Math.hypot(x - STAGE.x, z - STAGE.z);
    if (ds < STAGE.radius + 22) {
      h = lerp(h, H0 - 0.3, smoothstep(STAGE.radius + 22, STAGE.radius + 8, ds));
    }
  }

  // 7. Rio.
  {
    const d = riverDistance(x, z);
    if (d < 10) {
      const w = smoothstep(9.5, 2.5, d);
      h = lerp(h, Math.min(h, -1.7), w);
    }
  }

  // 8. Lago e ilha do gazebo.
  {
    const e = lakeEllipse(x, z);
    if (e < LAKE_BANK) {
      if (e >= 1) {
        const w = smoothstep(1.0, LAKE_BANK, e);
        h = lerp(Math.min(h, 0.14), h, w);
      } else {
        h = Math.min(h, 0.14 - (LAKE.depth + 0.14) * Math.pow(1 - e * e, 0.85));
      }
      const di = Math.hypot(x - LAKE_ISLAND.x, z - LAKE_ISLAND.z);
      if (di < LAKE_ISLAND.radius + 5) {
        const island = LAKE_ISLAND.height * smoothstep(LAKE_ISLAND.radius + 4.5, LAKE_ISLAND.radius - 1.5, di);
        h = Math.max(h, lerp(h, island, smoothstep(LAKE_ISLAND.radius + 5, LAKE_ISLAND.radius + 1, di)));
      }
    }
  }

  return h;
}

/** `true` se o ponto está sob água (lago, rio ou mar). */
export function isWaterAt(x: number, z: number): boolean {
  return auroraHeight(x, z) < WORLD.waterLevel;
}
