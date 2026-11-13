/**
 * Desenha a planta de Rosas Park num PNG, a partir da mesma função de
 * altura que o jogo usa.
 *
 * Não é uma captura de tela do jogo: esta máquina não tem navegador
 * nem WebGL, e fingir o contrário seria mentira. É uma leitura direta
 * do relevo e da planta — serve para conferir que o lago está onde se
 * diz, que o paredão não corta o parque e que os caminhos ligam o que
 * deveriam ligar.
 *
 * Uso: npx tsx tools/mapa-rosas.ts docs/rosas-park-planta.png
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import {
  BRIDGES,
  CLIFF,
  FLOATING_GARDENS,
  LANDMARKS,
  PATHS,
  PATH_WIDTH,
  PAVILIONS,
  ROSAS_BOUNDARY,
  WATERFALLS,
  waterfallFoot,
  waterfallPosition,
} from '../src/cities/rosas-park/RosasLayout';
import { isWaterAt, pathDistance, rosasHeight } from '../src/cities/rosas-park/RosasTerrain';

const SIZE = 900;
const EXTENT = 230;

function png(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.subarray(y * width * 3, (y + 1) * width * 3).forEach((value, i) => {
      raw[y * (width * 3 + 1) + 1 + i] = value;
    });
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const pixels = new Uint8Array(SIZE * SIZE * 3);
const toWorld = (p: number): number => ((p / SIZE) * 2 - 1) * EXTENT;
const toPixel = (w: number): number => Math.round(((w / EXTENT + 1) / 2) * SIZE);

function set(px: number, py: number, r: number, g: number, b: number): void {
  if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return;
  const i = (py * SIZE + px) * 3;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
}

function disc(wx: number, wz: number, radius: number, r: number, g: number, b: number): void {
  const pr = Math.max(1, Math.round((radius / EXTENT) * (SIZE / 2)));
  const cx = toPixel(wx);
  const cy = toPixel(wz);
  for (let y = -pr; y <= pr; y += 1) {
    for (let x = -pr; x <= pr; x += 1) {
      if (x * x + y * y > pr * pr) continue;
      set(cx + x, cy + y, r, g, b);
    }
  }
}

function line(ax: number, az: number, bx: number, bz: number, r: number, g: number, b: number, width = 2): void {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 3);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    disc(ax + (bx - ax) * t, az + (bz - az) * t, width, r, g, b);
  }
}

// Relevo sombreado.
for (let py = 0; py < SIZE; py += 1) {
  for (let px = 0; px < SIZE; px += 1) {
    const x = toWorld(px);
    const z = toWorld(py);
    const h = rosasHeight(x, z);
    const outside = Math.hypot(x, z) > ROSAS_BOUNDARY;

    // Sombreado: inclinação em relação a uma luz vinda do noroeste.
    const step = 1.2;
    const dx = rosasHeight(x + step, z) - rosasHeight(x - step, z);
    const dz = rosasHeight(x, z + step) - rosasHeight(x, z - step);
    const shade = Math.max(0.35, Math.min(1.35, 1 - (dx * 0.6 + dz * 0.6) * 0.5));

    let r: number;
    let g: number;
    let b: number;
    if (isWaterAt(x, z) || h < 0.05) {
      // Água: mais funda, mais escura. É limpa, então o fundo aparece.
      const depth = Math.max(0, Math.min(1, -h / 3.4));
      r = 120 - depth * 70;
      g = 205 - depth * 90;
      b = 235 - depth * 45;
    } else if (h > 12) {
      r = 196;
      g = 204;
      b = 206;
    } else {
      const t = Math.max(0, Math.min(1, (h - 0.5) / 12));
      r = 86 + t * 100;
      g = 170 - t * 20;
      b = 96 + t * 40;
    }
    if (outside) {
      r = Math.round(r * 0.35 + 30);
      g = Math.round(g * 0.35 + 34);
      b = Math.round(b * 0.35 + 40);
    }
    set(px, py, Math.min(255, r * shade), Math.min(255, g * shade), Math.min(255, b * shade));
  }
}

// Caminhos.
for (let py = 0; py < SIZE; py += 1) {
  for (let px = 0; px < SIZE; px += 1) {
    const x = toWorld(px);
    const z = toWorld(py);
    if (pathDistance(x, z) < PATH_WIDTH * 0.5) set(px, py, 242, 236, 224);
  }
}

// Paredão e quedas.
for (let i = 0; i <= 400; i += 1) {
  const angle = (i / 400) * Math.PI * 0.5;
  for (const radius of [CLIFF.radius, CLIFF.crestRadius]) {
    const x = CLIFF.x + Math.cos(angle) * radius;
    const z = CLIFF.z + Math.sin(angle) * radius;
    if (Math.hypot(x, z) > ROSAS_BOUNDARY) continue;
    disc(x, z, 1.1, radius === CLIFF.radius ? 150 : 190, 160, 168);
  }
}
for (const fall of WATERFALLS) {
  const crest = waterfallPosition(fall);
  const foot = waterfallFoot(fall);
  line(crest.x, crest.z, foot.x, foot.z, 180, 240, 255, fall.width * 0.4);
}

// Pontes, construções, jardins flutuantes e marcos.
for (const bridge of BRIDGES) line(bridge.from.x, bridge.from.z, bridge.to.x, bridge.to.z, 198, 150, 96, bridge.width * 0.5);
for (const pavilion of PAVILIONS) {
  disc(pavilion.x, pavilion.z, pavilion.radius, 250, 250, 252);
  disc(pavilion.x, pavilion.z, pavilion.radius * 0.55, 150, 220, 240);
}
for (const garden of FLOATING_GARDENS) disc(garden.x, garden.z, garden.radius, 166, 255, 228);
for (const landmark of LANDMARKS) disc(landmark.x, landmark.z, 2.6, landmark.hidden ? 255 : 255, landmark.hidden ? 210 : 150, landmark.hidden ? 100 : 190);

// Limite jogável.
for (let i = 0; i <= 900; i += 1) {
  const angle = (i / 900) * Math.PI * 2;
  disc(Math.cos(angle) * ROSAS_BOUNDARY, Math.sin(angle) * ROSAS_BOUNDARY, 0.9, 255, 255, 255);
}

const out = process.argv[2] ?? 'docs/rosas-park-planta.png';
writeFileSync(out, png(SIZE, SIZE, pixels));
console.log(`planta escrita em ${out}`);
