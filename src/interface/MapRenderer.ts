import { TAU } from '../utils/math';

export interface MapSource {
  /** Altura do terreno (m); abaixo de zero é água. */
  getHeight(x: number, z: number): number;
  /** `true` se o ponto é calçada, rua ou trilha. */
  isPaved(x: number, z: number): boolean;
}

export interface MapBuilding {
  x: number;
  z: number;
  radius: number;
}

export interface MapMarker {
  x: number;
  z: number;
  unlocked: boolean;
}

/** Metade da extensão do mundo exibida no mapa (m). */
export const MAP_EXTENT = 300;

/** Converte coordenadas do mundo para pixels do mapa (norte = cima). */
export function worldToMap(x: number, z: number, size: number): { x: number; y: number } {
  return { x: (x / (MAP_EXTENT * 2) + 0.5) * size, y: (z / (MAP_EXTENT * 2) + 0.5) * size };
}

/** Desenha o mapa-base de Aurora City (terreno, água, ruas e edifícios). Feito uma única vez. */
export function renderBaseMap(size: number, source: MapSource, buildings: readonly MapBuilding[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const step = (MAP_EXTENT * 2) / size;
  for (let py = 0; py < size; py++) {
    const z = -MAP_EXTENT + (py + 0.5) * step;
    for (let px = 0; px < size; px++) {
      const x = -MAP_EXTENT + (px + 0.5) * step;
      const height = source.getHeight(x, z);
      let r: number;
      let g: number;
      let b: number;
      if (height < -1.2) {
        const depth = Math.min(1, (-height - 1.2) / 5);
        r = 58 - depth * 28;
        g = 160 - depth * 42;
        b = 236 - depth * 22;
      } else if (height < 0) {
        r = 120;
        g = 208;
        b = 246;
      } else if (height < 0.75) {
        r = 244;
        g = 232;
        b = 190;
      } else if (source.isPaved(x, z)) {
        r = 240;
        g = 247;
        b = 252;
      } else {
        const lift = Math.min(1, Math.max(0, (height - 2) / 16));
        r = 122 + lift * 40;
        g = 210 + lift * 18;
        b = 112 + lift * 30;
      }
      const i = (py * size + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const scale = size / (MAP_EXTENT * 2);
  for (const building of buildings) {
    const p = worldToMap(building.x, building.z, size);
    const radius = Math.max(2.5, building.radius * scale * 0.8);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(1, size / 360);
    ctx.strokeStyle = '#2aa7f2';
    ctx.stroke();
  }
  return canvas;
}

/** Desenha o mapa completo: base + portais + posição do jogador. */
export function drawMap(
  target: HTMLCanvasElement,
  base: HTMLCanvasElement,
  player: { x: number; z: number; heading: number },
  markers: readonly MapMarker[],
): void {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  const size = target.width;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(base, 0, 0, size, size);
  const unit = size / 360;

  for (const marker of markers) {
    const p = worldToMap(marker.x, marker.z, size);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 4.2 * unit, 6 * unit, 0, 0, TAU);
    ctx.fillStyle = marker.unlocked ? '#9b6bff' : 'rgba(110,120,150,0.75)';
    ctx.fill();
    ctx.lineWidth = 1.6 * unit;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // Seta do jogador (direção 0 = +Z = sul no mapa).
  const p = worldToMap(player.x, player.z, size);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.PI - player.heading);
  ctx.beginPath();
  ctx.moveTo(0, -9 * unit);
  ctx.lineTo(6.5 * unit, 7 * unit);
  ctx.lineTo(0, 3.5 * unit);
  ctx.lineTo(-6.5 * unit, 7 * unit);
  ctx.closePath();
  ctx.fillStyle = '#ff5c8a';
  ctx.fill();
  ctx.lineWidth = 2 * unit;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
}
