/**
 * Rosto do avatar — expressões e boca que se mexe.
 *
 * O avatar do EDENWORLD é feito de primitivas fundidas em poucas malhas,
 * e não tem esqueleto facial nem arquivo de animação. Para dar expressão
 * sem quebrar esse desenho, as peças que se movem (sobrancelhas, pálpebras
 * e boca) saem da cabeça e viram **uma malha só com alvos de morph**:
 *
 * - uma chamada de desenho a mais por avatar, nada de material novo;
 * - cada alvo é a mesma malha em outra posição, então misturar dois alvos
 *   nunca rasga o rosto;
 * - a boca abre pelo alvo `fala`, que é o que a sincronia labial usa.
 *
 * As expressões são combinações de alvos — `animada` é sorriso com
 * sobrancelhas de surpresa, por exemplo. Quem pede uma expressão não
 * precisa saber disso.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Zone as MorphZone } from '../afters/AftersMorph';
import { clamp01, createRng, damp, type Rng } from '../utils/math';
import type { AvatarAppearance } from './AvatarAppearance';
import { EXPRESSION_WEIGHTS, type Expression, FACE_MORPHS, type FaceMorph } from './Expressions';

export type { Expression, FaceMorph } from './Expressions';
export { EXPRESSIONS, EXPRESSION_WEIGHTS, FACE_MORPHS, isExpression } from './Expressions';

/* -------------------------------------------------------------------------- */
/* Geometria                                                                   */
/* -------------------------------------------------------------------------- */

/** Centro da cabeça no espaço local da malha da cabeça. */
const HEAD_Y = 0.16;
const EYE_X = 0.064;
/**
 * A pálpebra vive à frente do olho inteiro (a pupila está em z = 0.167):
 * assim, quando desce, ela cobre — e não atravessa — o globo ocular.
 */
const LID_Z = 0.172;

interface FacePose {
  /** Deslocamento e giro das sobrancelhas (lado −1 = direita do avatar). */
  brow: (side: number) => { x: number; y: number; z: number; rz: number };
  /** Pálpebras. */
  lid: (side: number) => { x: number; y: number; z: number; sy: number };
  /** Boca: posição, escala e giro (giro 0 = arco para baixo). */
  mouth: { y: number; z: number; sx: number; sy: number; rz: number };
}

/** Rosto em repouso: é ele que define a contagem e a ordem dos vértices. */
const NEUTRAL: FacePose = {
  brow: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.078, z: 0.162, rz: side * -0.12 }),
  lid: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.062, z: LID_Z, sy: 1 }),
  mouth: { y: HEAD_Y - 0.05, z: 0.164, sx: 1, sy: 1, rz: Math.PI },
};

/** Cada alvo de morph é o mesmo rosto em outra posição. */
const MORPH_POSES: Readonly<Record<FaceMorph, FacePose>> = {
  // Sorriso aberto: boca maior, sobrancelhas relaxadas.
  sorriso: {
    brow: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.086, z: 0.162, rz: side * -0.22 }),
    lid: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.058, z: LID_Z, sy: 1.2 }),
    mouth: { y: HEAD_Y - 0.054, z: 0.164, sx: 1.3, sy: 1.5, rz: Math.PI },
  },
  // Tristeza: canto da boca para baixo e pontas internas da sobrancelha para cima.
  triste: {
    brow: (side) => ({ x: side * (EYE_X - 0.004), y: HEAD_Y + 0.072, z: 0.162, rz: side * 0.32 }),
    lid: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.054, z: LID_Z, sy: 1.3 }),
    mouth: { y: HEAD_Y - 0.044, z: 0.164, sx: 0.95, sy: 0.9, rz: 0 },
  },
  // Surpresa: olhos arregalados, sobrancelhas no alto, boca aberta.
  surpresa: {
    brow: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.098, z: 0.162, rz: side * -0.04 }),
    lid: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.072, z: LID_Z, sy: 0.8 }),
    mouth: { y: HEAD_Y - 0.064, z: 0.164, sx: 0.84, sy: 2.3, rz: Math.PI },
  },
  // Curiosidade: uma sobrancelha sobe, boca pequena de lado.
  curiosa: {
    brow: (side) => ({ x: side * EYE_X, y: HEAD_Y + (side > 0 ? 0.095 : 0.074), z: 0.162, rz: side * -0.26 }),
    lid: (side) => ({ x: side * EYE_X, y: HEAD_Y + (side > 0 ? 0.068 : 0.058), z: LID_Z, sy: 1 }),
    mouth: { y: HEAD_Y - 0.048, z: 0.164, sx: 0.78, sy: 0.85, rz: Math.PI },
  },
  // Fala: boca aberta no meio do caminho (a sincronia labial oscila este alvo).
  fala: {
    brow: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.08, z: 0.162, rz: side * -0.12 }),
    lid: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.062, z: LID_Z, sy: 1 }),
    mouth: { y: HEAD_Y - 0.058, z: 0.164, sx: 0.92, sy: 1.95, rz: Math.PI },
  },
  // Piscada: só as pálpebras descem.
  piscada: {
    brow: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.074, z: 0.162, rz: side * -0.12 }),
    lid: (side) => ({ x: side * EYE_X, y: HEAD_Y + 0.024, z: LID_Z, sy: 2.9 }),
    mouth: { y: HEAD_Y - 0.05, z: 0.164, sx: 1, sy: 1, rz: Math.PI },
  },
};

function tinted(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute('uv');
  const tone = new THREE.Color(color);
  const count = flat.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = tone.r;
    colors[i * 3 + 1] = tone.g;
    colors[i * 3 + 2] = tone.b;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

/** Monta as cinco peças do rosto em uma pose. A ordem nunca muda. */
function buildPose(pose: FacePose, colors: { brow: number; skin: number; mouth: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const side of [1, -1]) {
    const brow = pose.brow(side);
    const geometry = new THREE.BoxGeometry(0.046, 0.008, 0.008);
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(brow.rz));
    geometry.translate(brow.x, brow.y, brow.z);
    parts.push(tinted(geometry, colors.brow));
  }

  for (const side of [1, -1]) {
    const lid = pose.lid(side);
    const geometry = new THREE.SphereGeometry(0.032, 8, 6);
    geometry.scale(1, 0.45 * lid.sy, 0.42);
    geometry.translate(lid.x, lid.y, lid.z);
    parts.push(tinted(geometry, colors.skin));
  }

  const mouth = new THREE.TorusGeometry(0.028, 0.006, 4, 10, Math.PI);
  mouth.scale(pose.mouth.sx, pose.mouth.sy, 1);
  mouth.applyMatrix4(new THREE.Matrix4().makeRotationZ(pose.mouth.rz));
  mouth.translate(0, pose.mouth.y, pose.mouth.z);
  parts.push(tinted(mouth, colors.mouth));

  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * Geometria do rosto, com um alvo de morph por expressão de base.
 *
 * Todos os alvos têm os mesmos vértices na mesma ordem — é a mesma
 * função que os constrói, só com outras posições.
 */
export function buildFaceGeometry(appearance: AvatarAppearance): THREE.BufferGeometry {
  const browColor = new THREE.Color(appearance.hairStyle === 'careca' ? 0x5a3a22 : appearance.hairColor).lerp(new THREE.Color(0x000000), 0.25).getHex();
  const colors = { brow: browColor, skin: new THREE.Color(appearance.skin).getHex(), mouth: 0xb8475a };

  const base = buildPose(NEUTRAL, colors);
  const count = base.getAttribute('position').count;
  // O rosto nunca deforma com os Afters®, mas o atributo tem de existir:
  // o material do avatar o declara no vertex shader.
  const zones = new Float32Array(count).fill(MorphZone.None);
  base.setAttribute('aZone', new THREE.BufferAttribute(zones, 1));
  base.morphAttributes.position = FACE_MORPHS.map((id) => {
    const variant = buildPose(MORPH_POSES[id], colors);
    const attribute = variant.getAttribute('position') as THREE.BufferAttribute;
    attribute.name = id;
    // A geometria auxiliar não vai para a GPU: só o atributo é aproveitado.
    variant.deleteAttribute('position');
    variant.dispose();
    return attribute;
  });
  base.morphTargetsRelative = false;
  base.computeBoundingSphere();
  return base;
}

/* -------------------------------------------------------------------------- */
/* Controle                                                                    */
/* -------------------------------------------------------------------------- */

/** Intervalo entre piscadas (s). */
const BLINK_MIN = 2.6;
const BLINK_MAX = 7.5;
const BLINK_TIME = 0.16;

/**
 * Mistura as expressões, a fala e as piscadas em pesos de morph.
 *
 * Classe pura: trabalha só com números, sem Three.js. O avatar copia o
 * resultado para `morphTargetInfluences` a cada quadro.
 */
export class FaceController {
  /** Peso em vigor de cada alvo, na ordem de `FACE_MORPHS`. */
  readonly weights = new Float32Array(FACE_MORPHS.length);

  private readonly target = new Float32Array(FACE_MORPHS.length);
  private readonly rng: Rng;
  private expressionId: Expression = 'neutra';
  private talkTarget = 0;
  private talkLevel = 0;
  private talkClock = 0;
  private blinkIn: number;
  private blinkLeft = 0;
  private enabled = true;

  /** @param seed desencontra as piscadas: dois habitantes nunca piscam juntos. */
  constructor(seed = 1) {
    this.rng = createRng(Math.floor(Math.abs(seed)) * 31 + 7);
    this.blinkIn = BLINK_MIN + this.rng() * (BLINK_MAX - BLINK_MIN);
    this.applyExpression();
  }

  get expression(): Expression {
    return this.expressionId;
  }

  /** `false` congela o rosto (habitante longe demais para alguém ver). */
  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  setExpression(expression: Expression): void {
    if (this.expressionId === expression) return;
    this.expressionId = expression;
    this.applyExpression();
  }

  /** Nível de fala (0–1): abre e fecha a boca enquanto a frase aparece. */
  setTalking(level: number): void {
    this.talkTarget = clamp01(level);
  }

  get talking(): number {
    return this.talkLevel;
  }

  /** Volta ao rosto neutro e calado (avatar devolvido ao conjunto). */
  reset(): void {
    this.expressionId = 'neutra';
    this.talkTarget = 0;
    this.talkLevel = 0;
    this.blinkLeft = 0;
    this.applyExpression();
    this.weights.set(this.target);
    this.weights[FACE_MORPHS.indexOf('fala')] = 0;
    this.weights[FACE_MORPHS.indexOf('piscada')] = 0;
  }

  private applyExpression(): void {
    const mix = EXPRESSION_WEIGHTS[this.expressionId] ?? {};
    for (let i = 0; i < FACE_MORPHS.length; i += 1) this.target[i] = mix[FACE_MORPHS[i]] ?? 0;
  }

  update(dt: number): void {
    if (!this.enabled || dt <= 0) return;
    const talkIndex = FACE_MORPHS.indexOf('fala');
    const blinkIndex = FACE_MORPHS.indexOf('piscada');

    this.talkLevel = damp(this.talkLevel, this.talkTarget, 10, dt);
    this.talkClock += dt;

    for (let i = 0; i < FACE_MORPHS.length; i += 1) {
      if (i === talkIndex || i === blinkIndex) continue;
      this.weights[i] = damp(this.weights[i], this.target[i], 9, dt);
    }

    // Boca: oscila enquanto fala, com duas frequências para não virar relógio.
    const wave = 0.55 + 0.45 * Math.abs(Math.sin(this.talkClock * 11.5) * 0.7 + Math.sin(this.talkClock * 7.1 + 1.3) * 0.3);
    this.weights[talkIndex] = this.talkLevel * wave;

    // Piscada: rápida, com intervalo sorteado por pessoa.
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
      const phase = clamp01(this.blinkLeft / BLINK_TIME);
      this.weights[blinkIndex] = Math.sin(phase * Math.PI);
      if (this.blinkLeft <= 0) {
        this.weights[blinkIndex] = 0;
        this.blinkIn = BLINK_MIN + this.rng() * (BLINK_MAX - BLINK_MIN);
      }
    } else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) this.blinkLeft = BLINK_TIME;
    }
  }
}
