/**
 * Função de altura de Rosas Park (pura e determinística).
 *
 * Compõe, nesta ordem: planície do parque → paredão das cascatas →
 * lagoa ao pé das quedas → lago das lontras e sua ilha → terraços do
 * roseiral → nivelamento dos caminhos e dos lotes das construções →
 * borda que desce para fora do limite jogável.
 *
 * A ordem importa: cada etapa pode ser desfeita pela seguinte. Os
 * caminhos vêm quase no fim de propósito — nenhum caminho pode virar
 * escada porque uma colina cresceu por baixo dele.
 */

import { distanceToPolyline, fbm2, lerp, smoothstep } from '../../utils/math';
import {
  BASIN,
  CLIFF,
  GROUND,
  LAKE,
  LAKE_ISLAND,
  PATHS,
  PATH_WIDTH,
  PAVILIONS,
  ROSAS_BOUNDARY,
  ROSE_GARDEN,
  basinEllipse,
  cliffLift,
  lakeEllipse,
} from './RosasLayout';

const SEED = 7781;

/** Margem elíptica em que o lago reencontra o nível do parque. */
const LAKE_BANK = 1.28;

/** Linha d'água da região (o mundo inteiro usa 0). */
const WATER_LEVEL = 0;

/** Distância ao caminho mais próximo. Infinita quando longe de todos. */
export function pathDistance(x: number, z: number): number {
  let best = Infinity;
  for (const path of PATHS) {
    const d = distanceToPolyline(x, z, path);
    if (d < best) best = d;
  }
  return best;
}

export function rosasHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // 1. Planície viva: ondulação suave, nunca o suficiente para cansar.
  let h = GROUND + (fbm2(x * 0.014, z * 0.014, 4, SEED) - 0.5) * 2.6 + (fbm2(x * 0.055, z * 0.055, 2, SEED + 17) - 0.5) * 0.55;

  // 2. Paredão das cascatas: a borda curva de um platô a noroeste.
  h += CLIFF.height * cliffLift(x, z);

  // 3. Lagoa ao pé das quedas: escavada antes do lago, pois o lago manda.
  {
    const e = basinEllipse(x, z);
    if (e < 1.35) {
      const depth = BASIN.depth * smoothstep(1.35, 0.15, e);
      h = Math.min(h, -depth + (1 - smoothstep(1.35, 0.6, e)) * 0.4);
    }
  }

  // 4. Lago das lontras: fundo visível, margens rasas para entrar andando.
  {
    const e = lakeEllipse(x, z);
    if (e < LAKE_BANK) {
      // Perfil suave: a profundidade cresce devagar do bordo ao centro.
      const t = smoothstep(LAKE_BANK, 0, e);
      const bed = -LAKE.depth * t * t;
      h = lerp(h, bed, smoothstep(LAKE_BANK, LAKE_BANK - 0.34, e));
    }
    // Ilha do lago: emerge de dentro da água.
    const di = Math.hypot(x - LAKE_ISLAND.x, z - LAKE_ISLAND.z);
    if (di < LAKE_ISLAND.radius + 8) {
      const island = smoothstep(LAKE_ISLAND.radius + 8, LAKE_ISLAND.radius - 4, di);
      h = lerp(h, LAKE_ISLAND.height, island);
    }
  }

  // 5. Roseiral: três terraços concêntricos e um mirante no centro.
  {
    const d = Math.hypot(x - ROSE_GARDEN.x, z - ROSE_GARDEN.z);
    const outer = ROSE_GARDEN.tiers[0];
    if (d < outer + 12) {
      let tier = GROUND;
      for (let i = 0; i < ROSE_GARDEN.tiers.length; i += 1) {
        const radius = ROSE_GARDEN.tiers[i];
        tier += ROSE_GARDEN.step * smoothstep(radius + 2.4, radius - 2.4, d);
      }
      tier += ROSE_GARDEN.step * 0.8 * smoothstep(ROSE_GARDEN.coreRadius + 2, ROSE_GARDEN.coreRadius - 2, d);
      h = lerp(h, tier, smoothstep(outer + 12, outer + 1, d));
    }
  }

  // 6 e 7. Lotes e caminhos.
  //
  // Os dois são nivelados contra o **mesmo** nível de projeto. Quando
  // cada um tinha o seu, o caminho que chegava à porta ficava meio
  // metro acima ou abaixo do pátio, e a construção parecia enterrada.
  for (const pavilion of PAVILIONS) {
    const d = Math.hypot(x - pavilion.x, z - pavilion.z);
    const pad = pavilion.radius + 7;
    if (d > pad + 8) continue;
    h = lerp(h, designLevel(pavilion.x, pavilion.z), smoothstep(pad + 8, pad, d));
  }

  {
    const d = pathDistance(x, z);
    if (d < PATH_WIDTH + 6) {
      // Em terra firme o nivelamento tem uma saia larga, para a calçada
      // não nascer de um barranco. Dentro do contorno de um lago ela
      // encolhe até a largura do próprio caminho: senão a trilha da
      // ilha aterraria o lago em volta dela, que foi o que aconteceu.
      const overWater = lakeEllipse(x, z) < 1 || basinEllipse(x, z) < 1;
      const edge = overWater ? PATH_WIDTH + 1 : PATH_WIDTH + 6;
      h = lerp(h, designLevel(x, z), smoothstep(edge, PATH_WIDTH * 0.6, d));
    }
  }

  // 8. Fora do limite jogável o chão desce: o parque tem fim visível,
  //    mas quem o alcança é parado pela física, não por uma parede
  //    invisível em terreno plano (que pareceria um defeito).
  if (r > ROSAS_BOUNDARY - 30) {
    h = lerp(h, -9, smoothstep(ROSAS_BOUNDARY - 30, ROSAS_BOUNDARY + 46, r));
  }

  return h;
}

/**
 * Nível de projeto de um ponto: a altura em que uma calçada ou um
 * pátio devem ficar ali.
 *
 * Existe separado de `rosasHeight` porque aquela chama esta: se o
 * nivelamento lesse a altura já nivelada, a conta giraria em círculo.
 * É o terreno base mais o paredão, mais o terraço do roseiral — e
 * nunca os buracos de água, que uma calçada atravessa por ponte.
 */
function designLevel(x: number, z: number): number {
  // Dentro do pátio de uma construção, o nível é o do centro dela.
  for (const pavilion of PAVILIONS) {
    if (Math.hypot(x - pavilion.x, z - pavilion.z) < pavilion.radius + 7) {
      return terraceLevel(pavilion.x, pavilion.z);
    }
  }
  return terraceLevel(x, z);
}

/** Terreno base + paredão + terraços do roseiral, sem água nem caminhos. */
function terraceLevel(x: number, z: number): number {
  let level = GROUND + (fbm2(x * 0.014, z * 0.014, 4, SEED) - 0.5) * 2.6;

  level += CLIFF.height * cliffLift(x, z);

  // A ilha do lago é chão, não buraco d'água: uma trilha em cima dela
  // se nivela pela ilha, senão a trilha cavaria uma vala até a água.
  const di = Math.hypot(x - LAKE_ISLAND.x, z - LAKE_ISLAND.z);
  if (di < LAKE_ISLAND.radius + 8) {
    level = lerp(level, LAKE_ISLAND.height, smoothstep(LAKE_ISLAND.radius + 8, LAKE_ISLAND.radius - 4, di));
  }

  const d = Math.hypot(x - ROSE_GARDEN.x, z - ROSE_GARDEN.z);
  const outer = ROSE_GARDEN.tiers[0];
  if (d < outer + 12) {
    let tier = GROUND;
    for (const radius of ROSE_GARDEN.tiers) tier += ROSE_GARDEN.step * smoothstep(radius + 2.4, radius - 2.4, d);
    tier += ROSE_GARDEN.step * 0.8 * smoothstep(ROSE_GARDEN.coreRadius + 2, ROSE_GARDEN.coreRadius - 2, d);
    level = lerp(level, tier, smoothstep(outer + 12, outer + 1, d));
  }

  return level;
}

/**
 * Há água neste ponto?
 *
 * Não basta estar dentro do contorno do lago: a ilha fica dentro do
 * lago e é chão seco, e um caminho que atravessa a margem também. Por
 * isso a pergunta é respondida pelo relevo de verdade — estar no
 * contorno **e** abaixo da linha d'água.
 */
export function isWaterAt(x: number, z: number): boolean {
  if (lakeEllipse(x, z) >= 1 && basinEllipse(x, z) >= 1) return false;
  return rosasHeight(x, z) < WATER_LEVEL;
}
