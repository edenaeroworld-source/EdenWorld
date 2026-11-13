/**
 * Grade de ocupação de Rosas Park.
 *
 * Diz onde a vegetação aleatória **não** pode crescer: dentro d'água,
 * em cima dos caminhos, sob as construções e nas pontes. Sem isto, o
 * parque nasce com árvore no meio da calçada.
 */

import type { HeightField } from '../../world/HeightField';
import { Zone, ZoneMap } from '../../world/ZoneMap';
import { BRIDGES, GROVES, LAKE_ISLAND, PATHS, PATH_WIDTH, PAVILIONS, ROSAS_TERRAIN_SIZE, ROSE_GARDEN, basinEllipse, lakeEllipse } from './RosasLayout';

export function buildRosasZoneMap(heightField: HeightField): ZoneMap {
  const zones = new ZoneMap(ROSAS_TERRAIN_SIZE, 1);

  // Água: o lago, a lagoa das quedas e tudo que ficou abaixo do nível.
  zones.stampWhere((x, z) => lakeEllipse(x, z) < 1 || basinEllipse(x, z) < 1 || heightField.getHeight(x, z) < 0.25, Zone.Water);

  // A ilha do lago é terra outra vez, no meio da água.
  zones.stampCircle(LAKE_ISLAND.x, LAKE_ISLAND.z, LAKE_ISLAND.radius - 1.5, Zone.Bed);

  // Caminhos.
  for (const path of PATHS) zones.stampPolyline(path, PATH_WIDTH * 0.5 + 0.6, Zone.Path);

  // Pontes.
  for (const bridge of BRIDGES) {
    zones.stampSegment(bridge.from.x, bridge.from.z, bridge.to.x, bridge.to.z, bridge.width * 0.5 + 0.5, Zone.Path);
  }

  // Lotes das construções, com um pátio em volta.
  for (const pavilion of PAVILIONS) {
    zones.stampCircle(pavilion.x, pavilion.z, pavilion.radius + 5, Zone.Building);
  }

  // Mirante do roseiral: piso, não canteiro.
  zones.stampCircle(ROSE_GARDEN.x, ROSE_GARDEN.z, ROSE_GARDEN.coreRadius, Zone.Paved);

  return zones;
}

/**
 * Canteiros do roseiral: anéis entre os terraços.
 *
 * Devolvidos à parte porque a vegetação os planta com flores densas,
 * e não com a dispersão aleatória do resto do parque.
 */
export function roseBeds(): { x: number; z: number; radius: number; inner: number }[] {
  const beds: { x: number; z: number; radius: number; inner: number }[] = [];
  const tiers = ROSE_GARDEN.tiers;
  for (let i = 0; i < tiers.length; i += 1) {
    const outer = tiers[i];
    const inner = i + 1 < tiers.length ? tiers[i + 1] : ROSE_GARDEN.coreRadius;
    beds.push({ x: ROSE_GARDEN.x, z: ROSE_GARDEN.z, radius: outer - 1.5, inner: inner + 1.5 });
  }
  return beds;
}

/**
 * Mapa de controle do terreno de Rosas Park.
 *
 * R = caminho, G = canteiro, B = pavimento. É o que faz a calçada
 * aparecer no chão como textura, em vez de só como geometria solta.
 */
export function paintRosasControlMap(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[RosasZones] Canvas 2D indisponível para o mapa de controle');
  const scale = canvas.width / ROSAS_TERRAIN_SIZE;
  const toPx = (v: number): number => (v + ROSAS_TERRAIN_SIZE / 2) * scale;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const softDisc = (x: number, z: number, radius: number, color: string): void => {
    ctx.fillStyle = color;
    for (const pass of [
      { grow: 1.0, alpha: 0.34 },
      { grow: 0.5, alpha: 0.33 },
      { grow: 0, alpha: 0.33 },
    ]) {
      ctx.globalAlpha = pass.alpha;
      ctx.beginPath();
      ctx.arc(toPx(x), toPx(z), Math.max(0.5, (radius + pass.grow) * scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // Caminhos (vermelho).
  ctx.strokeStyle = '#ff0000';
  for (const path of PATHS) {
    for (const pass of [
      { grow: 1.4, alpha: 0.34 },
      { grow: 0.7, alpha: 0.33 },
      { grow: 0, alpha: 0.33 },
    ]) {
      ctx.globalAlpha = pass.alpha;
      ctx.lineWidth = Math.max(1, (PATH_WIDTH + pass.grow) * scale);
      ctx.beginPath();
      path.forEach((p, i) => {
        if (i === 0) ctx.moveTo(toPx(p.x), toPx(p.z));
        else ctx.lineTo(toPx(p.x), toPx(p.z));
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Pavimento (azul): pátios das construções e mirante do roseiral.
  for (const pavilion of PAVILIONS) softDisc(pavilion.x, pavilion.z, pavilion.radius + 2.4, '#0000ff');
  softDisc(ROSE_GARDEN.x, ROSE_GARDEN.z, ROSE_GARDEN.coreRadius, '#0000ff');

  // Canteiros (verde): os anéis do roseiral e os bosques.
  for (const bed of roseBeds()) {
    ctx.strokeStyle = '#00ff00';
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1, (bed.radius - bed.inner) * scale);
    ctx.beginPath();
    ctx.arc(toPx(bed.x), toPx(bed.z), ((bed.radius + bed.inner) / 2) * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const grove of GROVES) softDisc(grove.x, grove.z, grove.radius * 0.75, '#00ff00');

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
