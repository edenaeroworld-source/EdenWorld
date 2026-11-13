import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { Avatar } from '../../src/player/Avatar';
import { AvatarAnimator, type Pose } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { buildFaceGeometry } from '../../src/player/AvatarFace';
import { EXPRESSIONS, EXPRESSION_WEIGHTS, FACE_MORPHS, type Expression } from '../../src/player/Expressions';
import type { GestureId } from '../../src/player/Gestures';

/**
 * Prova visual das expressões, sem GPU.
 *
 * Faz na CPU a mesma conta que a placa de vídeo faz com os alvos de
 * morph (`transformado = posição + Σ peso × (alvo − posição)`) e desenha
 * o rosto resultante num PNG. Não roda no `npm test` do dia a dia: é um
 * gerador de artefato, ligado por variável de ambiente.
 *
 *     EDEN_RENDER=1 npx vitest run tests/unit/rosto-render.test.ts
 *
 * Saída: `docs/rosto-expressoes.png` — as sete expressões lado a lado,
 * mais a boca aberta da fala. Serve para conferir o rosto quando não há
 * navegador à mão.
 */

const W = Number(process.env.EDEN_FACE_W ?? 180);
const H = Number(process.env.EDEN_FACE_H ?? 200);
const SCALE = Number(process.env.EDEN_FACE_SCALE ?? 620);
const FACE_Y = Number(process.env.EDEN_FACE_Y ?? 1.517);
const BODY_W = Number(process.env.EDEN_BODY_W ?? 190);
const BODY_H = Number(process.env.EDEN_BODY_H ?? 330);
const BODY_SCALE = Number(process.env.EDEN_BODY_SCALE ?? 150);

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

/** Pesos de morph de uma expressão, com a boca de fala e a piscada por cima. */
function weightsFor(expression: Expression, talk: number, blink = 0): number[] {
  const mix = EXPRESSION_WEIGHTS[expression];
  return FACE_MORPHS.map((morph) => {
    if (morph === 'fala') return talk;
    if (morph === 'piscada') return blink;
    return mix[morph] ?? 0;
  });
}

interface Piece {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  weights: number[] | null;
}

interface Shot {
  /** Largura e altura do quadro. */
  width: number;
  height: number;
  /** Pixels por metro. */
  scale: number;
  /** Altura do mundo no centro do quadro. */
  originY: number;
  /** `true` desenha o corpo inteiro; `false`, só a cabeça e o rosto. */
  whole?: boolean;
  /** Pose aplicada ao rig antes de desenhar. */
  pose?: Pose;
  /** Giro do corpo (rad) — de três quartos os braços aparecem melhor. */
  turn?: number;
  weights: number[];
}

/** Desenha um avatar — rosto, corpo, ou os dois. */
function render(shot: Shot): Uint8Array {
  const { width, height, scale } = shot;
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const t = y / height;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      rgb[i] = Math.round(226 - 54 * t);
      rgb[i + 1] = Math.round(245 - 36 * t);
      rgb[i + 2] = 255;
    }
  }

  const avatar = new Avatar({ ...DEFAULT_APPEARANCE });
  if (shot.pose) avatar.applyPose(shot.pose, 0);
  avatar.root.rotation.y = shot.turn ?? 0;
  avatar.root.updateMatrixWorld(true);

  const pieces: Piece[] = [];
  avatar.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh.material as THREE.Material).name !== 'avatar') return;
    if (!shot.whole && mesh.name !== 'cabeca' && mesh.name !== 'rosto') return;
    pieces.push({ geometry: mesh.geometry, matrix: mesh.matrixWorld.clone(), weights: mesh.name === 'rosto' ? shot.weights : null });
  });
  // A malha do rosto é criada no construtor; se por acaso não estiver no
  // grafo, a prova ainda monta com uma cópia direta.
  if (!pieces.some((piece) => piece.weights)) {
    const head = pieces[0];
    pieces.push({ geometry: buildFaceGeometry(DEFAULT_APPEARANCE), matrix: head.matrix.clone(), weights: shot.weights });
  }

  const depth = new Float32Array(width * height).fill(-Infinity);
  const light = new THREE.Vector3(-0.35, 0.6, 1).normalize();
  const normalMatrix = new THREE.Matrix3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const originY = shot.originY;
  const W = width;
  const H = height;
  const SCALE = scale;

  for (const piece of pieces) {
    const geometry = piece.geometry;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const colors = geometry.getAttribute('color');
    if (!positions) continue;
    const targets = (geometry.morphAttributes.position ?? []) as THREE.BufferAttribute[];
    normalMatrix.getNormalMatrix(piece.matrix);
    const index = geometry.getIndex();
    const count = index ? index.count : positions.count;

    const vx: number[] = [];
    const vy: number[] = [];
    const vz: number[] = [];
    const shade: number[] = [];
    for (let i = 0; i < positions.count; i += 1) {
      let x = positions.getX(i);
      let y = positions.getY(i);
      let z = positions.getZ(i);
      // A mesma soma que o shader faz com `morphTargetsRelative = false`.
      if (piece.weights) {
        for (let t = 0; t < targets.length; t += 1) {
          const w = piece.weights[t] ?? 0;
          if (w === 0) continue;
          x += (targets[t].getX(i) - positions.getX(i)) * w;
          y += (targets[t].getY(i) - positions.getY(i)) * w;
          z += (targets[t].getZ(i) - positions.getZ(i)) * w;
        }
      }
      p.set(x, y, z).applyMatrix4(piece.matrix);
      if (normals) n.set(normals.getX(i), normals.getY(i), normals.getZ(i)).applyMatrix3(normalMatrix).normalize();
      else n.set(0, 1, 0);
      vx.push(W / 2 + p.x * SCALE);
      vy.push(H / 2 - (p.y - originY) * SCALE);
      vz.push(p.z);
      shade.push(0.46 + 0.54 * Math.max(0, n.dot(light)));
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
  }

  avatar.dispose();
  return rgb;
}

/** Monta os painéis lado a lado, com um fio de luz entre eles. */
function strip(panels: Uint8Array[], width: number, height: number, out: string): void {
  const total = new Uint8Array(width * panels.length * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let panel = 0; panel < panels.length; panel += 1) {
      for (let x = 0; x < width; x += 1) {
        const src = (y * width + x) * 3;
        const dst = (y * width * panels.length + panel * width + x) * 3;
        total[dst] = panels[panel][src];
        total[dst + 1] = panels[panel][src + 1];
        total[dst + 2] = panels[panel][src + 2];
      }
    }
    for (let panel = 1; panel < panels.length; panel += 1) {
      const dst = (y * width * panels.length + panel * width) * 3;
      total[dst] = 20;
      total[dst + 1] = 110;
      total[dst + 2] = 180;
    }
  }
  writeFileSync(out, png(width * panels.length, height, total));
}

/** Rosto em close, com uma expressão. */
function renderFace(expression: Expression, talk: number, blink = 0): Uint8Array {
  return render({ width: W, height: H, scale: SCALE, originY: FACE_Y, weights: weightsFor(expression, talk, blink) });
}

/**
 * Corpo inteiro no meio de um gesto.
 *
 * O animador roda de verdade — mesma classe do jogo — até o instante
 * pedido, com o personagem **andando**: é a prova de que o gesto entra
 * por cima da locomoção em vez de substituí-la.
 */
function renderGesture(id: GestureId | null, at: number, expression: Expression = 'feliz'): Uint8Array {
  const animator = new AvatarAnimator();
  if (id) animator.playGesture(id);
  const dt = 1 / 60;
  let pose = animator.update(0, { state: 'walk', speed: 2, stridePhase: 0, verticalSpeed: 0, elapsed: 0 });
  for (let t = 0; t < Math.round(at / dt); t += 1) {
    pose = animator.update(dt, { state: 'walk', speed: 2, stridePhase: t * dt * 6, verticalSpeed: 0, elapsed: t * dt });
  }
  return render({ width: BODY_W, height: BODY_H, scale: BODY_SCALE, originY: 0.95, whole: true, turn: -0.62, pose, weights: weightsFor(expression, 0) });
}

describe.runIf(process.env.EDEN_RENDER)('prova visual do rosto e dos gestos', () => {
  it('gera o quadro com as sete expressões, a boca da fala e a piscada', () => {
    const panels = [...EXPRESSIONS.map((expression) => renderFace(expression, 0)), renderFace('feliz', 1), renderFace('feliz', 0, 1)];
    strip(panels, W, H, process.env.EDEN_FACE_OUT ?? 'docs/rosto-expressoes.png');
  });

  it('gera a faixa de gestos sobre a caminhada', () => {
    const panels = [
      renderGesture(null, 0.5, 'neutra'),
      renderGesture('acenar', 0.42),
      renderGesture('cumprimentar', 0.9),
      renderGesture('apontar', 0.6),
      renderGesture('pensar', 0.9, 'pensativa'),
      renderGesture('rir', 0.6),
      renderGesture('surpresa', 0.3, 'surpresa'),
      renderGesture('aplaudir', 0.6),
    ];
    strip(panels, BODY_W, BODY_H, process.env.EDEN_GESTO_OUT ?? 'docs/gestos.png');
  });
});
