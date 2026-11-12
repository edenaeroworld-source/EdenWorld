import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { displaceNormal, displaceVertex } from '../../src/afters/AftersMorph';
import { Avatar } from '../../src/player/Avatar';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';

/**
 * Prova visual da transformação, sem GPU.
 *
 * Aplica a mesma conta do shader (`AftersMorph`) à geometria real do avatar
 * e desenha o resultado num PNG. Não roda no `npm test` do dia a dia: é um
 * gerador de artefato, ligado por variável de ambiente.
 *
 *     EDEN_RENDER=1 npx vitest run tests/unit/afters-render.test.ts
 *
 * Saída: `docs/afters-silhueta.png` (0%, 125%, 250% de frente e 250% de
 * perfil). Serve para conferir a silhueta quando não há navegador à mão.
 */

/** Rasterizador mínimo, só para gerar a prova visual da silhueta. */
const W = Number(process.env.EDEN_W ?? 300);
const H = Number(process.env.EDEN_H ?? 460);
const SCALE = Number(process.env.EDEN_SCALE ?? 230);

function crc32(buffer: Buffer): number {
  let c = ~0;
  for (const byte of buffer) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
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

interface Panel {
  rgb: Uint8Array;
  depth: Float32Array;
}

function renderPanel(bust: number, curve: number, turn = 0): Panel {
  const rgb = new Uint8Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(-Infinity);
  // Fundo em degradê aqua, a identidade do Éden Aero.
  for (let y = 0; y < H; y += 1) {
    const t = y / H;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      rgb[i] = Math.round(228 - 60 * t);
      rgb[i + 1] = Math.round(246 - 40 * t);
      rgb[i + 2] = 255;
    }
  }

  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'aero' });
  avatar.setMorph(bust, curve);
  avatar.root.rotation.y = turn;
  avatar.root.updateMatrixWorld(true);

  const light = new THREE.Vector3(-0.4, 0.75, 0.9).normalize();
  const normalMatrix = new THREE.Matrix3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  avatar.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh.material as THREE.Material).name !== 'avatar') return;
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const colors = geometry.getAttribute('color');
    const zones = geometry.getAttribute('aZone');
    if (!positions || !zones) return;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const index = geometry.getIndex();
    const count = index ? index.count : positions.count;

    const vx: number[] = [];
    const vy: number[] = [];
    const vz: number[] = [];
    const shade: number[] = [];
    for (let i = 0; i < positions.count; i += 1) {
      const zone = zones.getX(i);
      const moved = displaceVertex({ x: positions.getX(i), y: positions.getY(i), z: positions.getZ(i) }, zone, bust, curve);
      p.set(moved.x, moved.y, moved.z).applyMatrix4(mesh.matrixWorld);
      const base = normals
        ? displaceNormal(
            { x: positions.getX(i), y: positions.getY(i), z: positions.getZ(i) },
            { x: normals.getX(i), y: normals.getY(i), z: normals.getZ(i) },
            zone,
            bust,
            curve,
          )
        : { x: 0, y: 1, z: 0 };
      n.set(base.x, base.y, base.z).applyMatrix3(normalMatrix).normalize();
      vx.push(W / 2 + p.x * SCALE);
      vy.push(H - 24 - p.y * SCALE);
      vz.push(p.z);
      shade.push(0.42 + 0.58 * Math.max(0, n.dot(light)));
    }

    for (let t = 0; t < count; t += 3) {
      const a = index ? index.getX(t) : t;
      const b = index ? index.getX(t + 1) : t + 1;
      const c = index ? index.getX(t + 2) : t + 2;
      const minX = Math.max(0, Math.floor(Math.min(vx[a], vx[b], vx[c])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(vx[a], vx[b], vx[c])));
      const minY = Math.max(0, Math.floor(Math.min(vy[a], vy[b], vy[c])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(vy[a], vy[b], vy[c])));
      const area = (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vx[c] - vx[a]) * (vy[b] - vy[a]);
      if (Math.abs(area) < 1e-9) continue;
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((vx[b] - px) * (vy[c] - py) - (vx[c] - px) * (vy[b] - py)) / area;
          const w1 = ((vx[c] - px) * (vy[a] - py) - (vx[a] - px) * (vy[c] - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * vz[a] + w1 * vz[b] + w2 * vz[c];
          const slot = y * W + x;
          if (z <= depth[slot]) continue;
          depth[slot] = z;
          const light0 = w0 * shade[a] + w1 * shade[b] + w2 * shade[c];
          const i = slot * 3;
          const red = colors ? w0 * colors.getX(a) + w1 * colors.getX(b) + w2 * colors.getX(c) : 0.8;
          const green = colors ? w0 * colors.getY(a) + w1 * colors.getY(b) + w2 * colors.getY(c) : 0.8;
          const blue = colors ? w0 * colors.getZ(a) + w1 * colors.getZ(b) + w2 * colors.getZ(c) : 0.8;
          rgb[i] = Math.min(255, Math.round(255 * Math.sqrt(red) * light0));
          rgb[i + 1] = Math.min(255, Math.round(255 * Math.sqrt(green) * light0));
          rgb[i + 2] = Math.min(255, Math.round(255 * Math.sqrt(blue) * light0));
        }
      }
    }
  });

  avatar.dispose();
  return { rgb, depth };
}

describe.runIf(process.env.EDEN_RENDER)('prova visual da silhueta', () => {
  it('gera o comparativo 0% / 125% / 250%', () => {
    const panels = process.env.EDEN_SIDE
      ? [renderPanel(0, 0, Math.PI / 2), renderPanel(1.25, 1.25, Math.PI / 2), renderPanel(2.5, 2.5, Math.PI / 2)]
      : [renderPanel(0, 0), renderPanel(1.25, 1.25), renderPanel(2.5, 2.5), renderPanel(2.5, 2.5, Math.PI / 2)];
    const total = new Uint8Array(W * panels.length * H * 3);
    for (let y = 0; y < H; y += 1) {
      for (let panel = 0; panel < panels.length; panel += 1) {
        for (let x = 0; x < W; x += 1) {
          const src = (y * W + x) * 3;
          const dst = (y * W * panels.length + panel * W + x) * 3;
          total[dst] = panels[panel].rgb[src];
          total[dst + 1] = panels[panel].rgb[src + 1];
          total[dst + 2] = panels[panel].rgb[src + 2];
        }
      }
      // Separador entre os painéis.
      for (let panel = 1; panel < panels.length; panel += 1) {
        const dst = (y * W * panels.length + panel * W) * 3;
        total[dst] = 20;
        total[dst + 1] = 110;
        total[dst + 2] = 180;
      }
    }
    writeFileSync(process.env.EDEN_OUT ?? 'docs/afters-silhueta.png', png(W * panels.length, H, total));
  });
});
