/**
 * Rasterizador de software para os avatares, com pele.
 *
 * Não há WebGL neste ambiente, e o Marco N mexeu justamente no que só
 * se vê olhando. Este módulo é a resposta possível: aplica **a mesma
 * conta que o shader aplica**, na mesma ordem — deformação dos Afters
 * e da gestação no espaço de bind, depois a matriz de pele de cada
 * osso — e desenha o resultado num PNG com z-buffer.
 *
 * A imagem que sai daqui é a geometria real que a GPU receberia, não
 * uma ilustração do que ela deveria ser. O que falta em relação ao
 * jogo é a iluminação do cenário, o mapa de sombras e o tone mapping:
 * por isso ela serve para conferir **forma**, e não para declarar o
 * resultado final aprovado.
 */

import { deflateSync } from 'node:zlib';
import * as THREE from 'three';
import { displaceNormal, displaceVertex } from '../../src/afters/AftersMorph';
import { displaceGestation, gestationNormal } from '../../src/player/Gestation';
import type { Avatar } from '../../src/player/Avatar';

/* ------------------------------- PNG ------------------------------------ */

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

export function png(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------- tela e cena ------------------------------- */

export interface Canvas {
  width: number;
  height: number;
  rgb: Uint8Array;
  depth: Float32Array;
}

export function canvas(width: number, height: number, top = [228, 246, 255], bottom = [168, 206, 255]): Canvas {
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const t = y / height;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      rgb[i] = Math.round(top[0] + (bottom[0] - top[0]) * t);
      rgb[i + 1] = Math.round(top[1] + (bottom[1] - top[1]) * t);
      rgb[i + 2] = Math.round(top[2] + (bottom[2] - top[2]) * t);
    }
  }
  return { width, height, rgb, depth: new Float32Array(width * height).fill(-Infinity) };
}

export interface View {
  /** Metros por pixel, invertido: quanto maior, maior o personagem. */
  scale: number;
  /** Onde fica o pé do personagem na tela. */
  originX: number;
  originY: number;
  /** Giro do personagem em torno do próprio eixo (rad). */
  turn: number;
}

const LIGHT = new THREE.Vector3(-0.45, 0.72, 0.85).normalize();
const RIM = new THREE.Vector3(0.6, 0.25, -0.75).normalize();

/**
 * Desenha um avatar na tela.
 *
 * A pose já tem de estar aplicada — este módulo não anima, só mostra.
 */
export function drawAvatar(target: Canvas, avatar: Avatar, view: View, morph = { bust: 0, curve: 0, gestation: 0 }): void {
  avatar.root.rotation.y = view.turn;
  avatar.root.updateMatrixWorld(true);

  const { width: W, height: H, rgb, depth } = target;
  const normalMatrix = new THREE.Matrix3();
  const world = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const normal = new THREE.Vector3();

  avatar.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const material = mesh.material as THREE.Material;
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    if (!positions) return;
    const normals = geometry.getAttribute('normal');
    const colors = geometry.getAttribute('color');
    const zones = geometry.getAttribute('aZone');
    const origins = geometry.getAttribute('aMorphOrigin');
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
    const emissive = material.name !== 'avatar';
    normalMatrix.getNormalMatrix(mesh.matrixWorld);

    const vx: number[] = [];
    const vy: number[] = [];
    const vz: number[] = [];
    const shade: number[] = [];

    for (let i = 0; i < positions.count; i += 1) {
      const zone = zones ? zones.getX(i) : 0;
      const ox = origins ? origins.getX(i) : 0;
      const oy = origins ? origins.getY(i) : 0;
      const oz = origins ? origins.getZ(i) : 0;
      const bind = { x: positions.getX(i) - ox, y: positions.getY(i) - oy, z: positions.getZ(i) - oz };

      // A ordem do shader: silhueta, ventre, e só então a pele.
      const moved = displaceGestation(displaceVertex(bind, zone, morph.bust, morph.curve), zone, morph.gestation);
      world.set(moved.x + ox, moved.y + oy, moved.z + oz);

      const rawNormal = normals ? { x: normals.getX(i), y: normals.getY(i), z: normals.getZ(i) } : { x: 0, y: 1, z: 0 };
      const deformed = gestationNormal(bind, displaceNormal(bind, rawNormal, zone, morph.bust, morph.curve), zone, morph.gestation);

      if (skinned) {
        // A normal depois da pele: mede-se andando um passo curto na
        // direção dela e vendo para onde o passo foi parar.
        probe.set(world.x + deformed.x * 0.004, world.y + deformed.y * 0.004, world.z + deformed.z * 0.004);
        skinned.applyBoneTransform(i, world);
        skinned.applyBoneTransform(i, probe);
        normal.subVectors(probe, world).normalize();
      } else {
        normal.set(deformed.x, deformed.y, deformed.z);
      }

      world.applyMatrix4(mesh.matrixWorld);
      normal.applyMatrix3(normalMatrix).normalize();

      vx.push(view.originX + world.x * view.scale);
      vy.push(view.originY - world.y * view.scale);
      vz.push(world.z);
      const key = Math.max(0, normal.dot(LIGHT));
      const rim = Math.pow(Math.max(0, normal.dot(RIM)), 2.5) * 0.28;
      shade.push(emissive ? 1.25 : 0.46 + 0.62 * key + rim);
    }

    const index = geometry.getIndex();
    const count = index ? index.count : positions.count;
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
          const lit = w0 * shade[a] + w1 * shade[b] + w2 * shade[c];
          const i = slot * 3;
          const red = colors ? w0 * colors.getX(a) + w1 * colors.getX(b) + w2 * colors.getX(c) : 0.8;
          const green = colors ? w0 * colors.getY(a) + w1 * colors.getY(b) + w2 * colors.getY(c) : 0.8;
          const blue = colors ? w0 * colors.getZ(a) + w1 * colors.getZ(b) + w2 * colors.getZ(c) : 0.8;
          rgb[i] = Math.min(255, Math.round(255 * Math.sqrt(red) * lit));
          rgb[i + 1] = Math.min(255, Math.round(255 * Math.sqrt(green) * lit));
          rgb[i + 2] = Math.min(255, Math.round(255 * Math.sqrt(blue) * lit));
        }
      }
    }
  });
}

/** Emenda painéis lado a lado numa tira. */
export function strip(panels: Canvas[]): { width: number; height: number; rgb: Uint8Array } {
  const height = panels[0].height;
  const width = panels.reduce((sum, p) => sum + p.width, 0);
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    for (const panel of panels) {
      for (let px = 0; px < panel.width; px += 1) {
        const from = (y * panel.width + px) * 3;
        const to = (y * width + x + px) * 3;
        rgb[to] = panel.rgb[from];
        rgb[to + 1] = panel.rgb[from + 1];
        rgb[to + 2] = panel.rgb[from + 2];
      }
      x += panel.width;
    }
  }
  return { width, height, rgb };
}

/** Empilha tiras uma sobre a outra. */
export function stack(rows: { width: number; height: number; rgb: Uint8Array }[]): { width: number; height: number; rgb: Uint8Array } {
  const width = Math.max(...rows.map((r) => r.width));
  const height = rows.reduce((sum, r) => sum + r.height, 0);
  const rgb = new Uint8Array(width * height * 3).fill(255);
  let y = 0;
  for (const row of rows) {
    for (let ry = 0; ry < row.height; ry += 1) {
      for (let x = 0; x < row.width; x += 1) {
        const from = (ry * row.width + x) * 3;
        const to = ((y + ry) * width + x) * 3;
        rgb[to] = row.rgb[from];
        rgb[to + 1] = row.rgb[from + 1];
        rgb[to + 2] = row.rgb[from + 2];
      }
    }
    y += row.height;
  }
  return { width, height, rgb };
}
