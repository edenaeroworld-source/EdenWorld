/**
 * Renderiza os interiores construídos num PNG, sem navegador.
 *
 * **Isto não é uma captura de tela do jogo.** Esta máquina não tem
 * navegador nem WebGL, e dizer o contrário seria mentira. O que o
 * programa faz é montar o interior com exatamente o mesmo código que
 * o jogo usa (`InteriorScene`), ler os triângulos que saíram daquela
 * montagem e rasterizá-los à mão, em projeção isométrica, com o teto
 * cortado para dar para ver lá dentro.
 *
 * A diferença importa: a geometria é a de verdade. Se um cômodo
 * estiver vazio, ele aparece vazio aqui. Se um móvel estiver dentro da
 * parede, aparece dentro da parede.
 *
 * Uso: npx tsx tools/interiores-render.ts docs/
 */

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as THREE from 'three';
import { getInterior } from '../src/interiors/Interior';
import { FLOOR_HEIGHT } from '../src/interiors/InteriorKit';
import { INTERIOR_ORIGIN, InteriorScene } from '../src/interiors/InteriorScene';
import type { InteriorMaterials } from '../src/interiors/InteriorScene';
import { footprintOf } from '../src/interiors/InteriorShell';
import { roomsOnFloor } from '../src/interiors/Interior';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';

const WIDTH = 1280;
const HEIGHT = 860;

/* ------------------------------- PNG ---------------------------------- */

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

/* ---------------------------- rasterizador ------------------------------ */

interface Camera {
  ox: number;
  oz: number;
  scale: number;
  cx: number;
  cy: number;
}

/** Projeção isométrica: x para a direita-abaixo, z para a esquerda-abaixo. */
function project(camera: Camera, x: number, y: number, z: number): { sx: number; sy: number; depth: number } {
  const dx = x - camera.ox;
  const dz = z - camera.oz;
  const sx = camera.cx + (dx - dz) * camera.scale * 0.866;
  const sy = camera.cy + (dx + dz) * camera.scale * 0.5 - y * camera.scale;
  // A câmera está acima e a sudeste: quanto maior (x + z + y), mais
  // perto. Guardamos o negativo para o teste de profundidade manter
  // sempre o menor valor.
  return { sx, sy, depth: -(dx + dz + y * 1.4) };
}

function renderInterior(id: string, floor: number, file: string): void {
  const interior = getInterior(id);
  if (!interior) throw new Error(`interior desconhecido: ${id}`);

  const make = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial();
  const materials = { wood: make(), stone: make(), white: make(), facade: make(), glass: make(), crystal: make(), metal: make() } as unknown as InteriorMaterials;
  const physics = new PhysicsWorld({ getHeight: () => -7, getSurface: () => 'grass' });
  const scene = new THREE.Scene();
  const interiors = new InteriorScene({ scene, materials, physics, onInteractables: () => {} });
  interiors.load(interior);

  const rooms = roomsOnFloor(interior, floor);
  const area = footprintOf(rooms);
  const baseY = floor * FLOOR_HEIGHT;
  // Corte: tudo acima de 2,3 m do piso deste andar some, para a
  // câmera entrar no prédio. É o mesmo truque de maquete.
  const cutY = baseY + 2.3;
  const floorY = baseY - 0.4;

  // Enquadramento automático: projeta os oito cantos do volume do
  // andar e ajusta escala e centro ao que couber na imagem.
  const camera: Camera = {
    ox: INTERIOR_ORIGIN.x + area.x + area.w / 2,
    oz: INTERIOR_ORIGIN.z + area.z + area.d / 2,
    scale: 1,
    cx: 0,
    cy: 0,
  };
  let minSX = Infinity;
  let maxSX = -Infinity;
  let minSY = Infinity;
  let maxSY = -Infinity;
  for (const cx of [area.x, area.x + area.w]) {
    for (const cz of [area.z, area.z + area.d]) {
      for (const cy of [baseY - 0.2, cutY]) {
        const p = project(camera, INTERIOR_ORIGIN.x + cx, cy, INTERIOR_ORIGIN.z + cz);
        minSX = Math.min(minSX, p.sx);
        maxSX = Math.max(maxSX, p.sx);
        minSY = Math.min(minSY, p.sy);
        maxSY = Math.max(maxSY, p.sy);
      }
    }
  }
  camera.scale = Math.min((WIDTH - 90) / (maxSX - minSX), (HEIGHT - 110) / (maxSY - minSY));
  camera.cx = WIDTH / 2 - ((minSX + maxSX) / 2) * camera.scale;
  camera.cy = HEIGHT / 2 - ((minSY + maxSY) / 2) * camera.scale;

  const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  const depth = new Float32Array(WIDTH * HEIGHT).fill(Infinity);
  // Céu em gradiente, atrás de tudo.
  for (let y = 0; y < HEIGHT; y += 1) {
    const t = y / HEIGHT;
    const r = Math.round(176 + t * 36);
    const g = Math.round(214 + t * 28);
    const b = Math.round(238 + t * 14);
    for (let x = 0; x < WIDTH; x += 1) {
      const i = (y * WIDTH + x) * 3;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
    }
  }

  const colour = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const light = new THREE.Vector3(0.45, 0.82, 0.35).normalize();
  let triangles = 0;

  const paint = (object: THREE.Object3D): void => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    colour.copy(material.color ?? new THREE.Color(0xcccccc));
    const opacity = material.transparent ? material.opacity : 1;
    const position = mesh.geometry.getAttribute('position');
    if (!position) return;
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : position.count;
    mesh.updateWorldMatrix(true, false);

    for (let t = 0; t < count; t += 3) {
      const i0 = index ? index.getX(t) : t;
      const i1 = index ? index.getX(t + 1) : t + 1;
      const i2 = index ? index.getX(t + 2) : t + 2;
      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld);
      // Corte de maquete: o que passa da altura do corte é rebaixado
      // até ela, em vez de descartado. Uma parede inteira sumiria se o
      // triângulo fosse jogado fora só por ter um vértice no alto —
      // assim ela aparece serrada na altura certa.
      if (a.y > cutY && b.y > cutY && c.y > cutY) continue;
      if (a.y < floorY && b.y < floorY && c.y < floorY) continue;
      a.y = Math.min(a.y, cutY);
      b.y = Math.min(b.y, cutY);
      c.y = Math.min(c.y, cutY);

      edge1.subVectors(b, a);
      edge2.subVectors(c, a);
      normal.crossVectors(edge1, edge2).normalize();
      const lambert = 0.42 + Math.max(0, normal.dot(light)) * 0.72;

      const pa = project(camera, a.x, a.y, a.z);
      const pb = project(camera, b.x, b.y, b.z);
      const pc = project(camera, c.x, c.y, c.z);
      const minX = Math.max(0, Math.floor(Math.min(pa.sx, pb.sx, pc.sx)));
      const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(pa.sx, pb.sx, pc.sx)));
      const minY = Math.max(0, Math.floor(Math.min(pa.sy, pb.sy, pc.sy)));
      const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(pa.sy, pb.sy, pc.sy)));
      if (minX > maxX || minY > maxY) continue;
      const det = (pb.sy - pc.sy) * (pa.sx - pc.sx) + (pc.sx - pb.sx) * (pa.sy - pc.sy);
      if (Math.abs(det) < 1e-9) continue;
      triangles += 1;

      const r = Math.min(255, colour.r * 255 * lambert);
      const g = Math.min(255, colour.g * 255 * lambert);
      const bl = Math.min(255, colour.b * 255 * lambert);

      for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
          const w0 = ((pb.sy - pc.sy) * (px + 0.5 - pc.sx) + (pc.sx - pb.sx) * (py + 0.5 - pc.sy)) / det;
          const w1 = ((pc.sy - pa.sy) * (px + 0.5 - pc.sx) + (pa.sx - pc.sx) * (py + 0.5 - pc.sy)) / det;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.0005 || w1 < -0.0005 || w2 < -0.0005) continue;
          const d = w0 * pa.depth + w1 * pb.depth + w2 * pc.depth;
          const slot = py * WIDTH + px;
          if (d >= depth[slot]) continue;
          const i = slot * 3;
          if (opacity >= 0.99) {
            depth[slot] = d;
            pixels[i] = r;
            pixels[i + 1] = g;
            pixels[i + 2] = bl;
          } else {
            // Vidro: mistura sem escrever profundidade, para o que
            // está atrás continuar visível.
            pixels[i] = pixels[i] * (1 - opacity) + r * opacity;
            pixels[i + 1] = pixels[i + 1] * (1 - opacity) + g * opacity;
            pixels[i + 2] = pixels[i + 2] * (1 - opacity) + bl * opacity;
          }
        }
      }
    }
  };

  interiors.group.traverse(paint);
  writeFileSync(file, png(WIDTH, HEIGHT, pixels));
  const label = interior.floors > 1 ? `${interior.name} — andar ${floor}` : interior.name;
  console.log(`${file}  ${label}  (${triangles} triângulos desenhados)`);
  interiors.unload(interior);
}

const outDir = process.argv[2] ?? 'docs';
const targets: [string, number, string][] = [
  ['atelie-aero', 0, 'interior-atelie-aero'],
  ['apto-aurora-12', 0, 'interior-apartamento-aurora'],
  ['torre-zenite', 0, 'interior-zenite-recepcao'],
  ['torre-zenite', 1, 'interior-edentech'],
  ['torre-zenite', 2, 'interior-zenite-laboratorio'],
  ['mercado-eden', 0, 'interior-edenstore'],
  ['mercado-eden', 1, 'interior-edenstore-galeria'],
  ['edenpawl-aurora', 0, 'interior-edenpawl'],
  ['centro-edenconnect', 0, 'interior-centro-connect'],
  // Rosas Park, a região de referência: entra na mesma lista para a
  // comparação entre as duas ser feita com a mesma régua.
  ['casa-de-cha', 0, 'interior-casa-de-cha'],
];
for (const [id, floor, name] of targets) renderInterior(id, floor, `${outDir.replace(/\/$/, '')}/${name}.png`);
