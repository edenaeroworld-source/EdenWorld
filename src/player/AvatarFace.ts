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
import { FACE } from './body/BodyRig';
import { EXPRESSION_WEIGHTS, type Expression, FACE_MORPHS, type FaceMorph } from './Expressions';

export type { Expression, FaceMorph } from './Expressions';
export { EXPRESSIONS, EXPRESSION_WEIGHTS, FACE_MORPHS, isExpression } from './Expressions';

/* -------------------------------------------------------------------------- */
/* Geometria                                                                   */
/* -------------------------------------------------------------------------- */

/** Centro da cabeça no espaço local da malha da cabeça. */
const HEAD_Y = 0.16;
/** Raio da cabeça nesse mesmo espaço (`HEAD_R`, antes da escala). */
const R = 0.176;

const EYE_X = FACE.eyeX * R;
const EYE_Y = HEAD_Y + FACE.eyeY * R;
const EYE_Z = FACE.eyeZ * R;
/** Raio do globo. A pálpebra é uma calota um fio maior, concêntrica. */
const BALL = FACE.eyeBall * R;
const LID_R = BALL * 1.035;

const MOUTH_Y = HEAD_Y + FACE.mouthY * R;
/** A pele dos lábios fica um fio à frente do volume que o crânio dá. */
const MOUTH_Z = FACE.mouthZ * R + R * 0.035;
const BROW_Z = FACE.browZ * R;
/** Altura do arco acima do centro do olho, em raios de cabeça. */
const BROW_LIFT = 0.285;
const MOUTH_HALF = FACE.mouthHalf * R;

/**
 * Uma pose do rosto.
 *
 * As grandezas são anatômicas, não coordenadas soltas: a pálpebra é
 * **quanto do globo ela cobre**, em radianos a partir do polo; a boca
 * é o quanto abre e o quanto os cantos sobem. Foi o que permitiu
 * descrever seis expressões sem repetir posição nenhuma à mão — e é o
 * que impede uma expressão nova de descolar a pálpebra do olho.
 */
interface FacePose {
  /** Sobrancelha: altura acima do olho e inclinação. */
  brow: (side: number) => { lift: number; tilt: number };
  /** Pálpebras: quanto cada uma desce sobre o globo, em radianos. */
  lid: (side: number) => { upper: number; lower: number };
  /** Boca: abertura, largura, e quanto os cantos sobem (+) ou descem (−). */
  mouth: { open: number; wide: number; corner: number };
}

/**
 * Quanto cada pálpebra cobre do globo, em radianos a partir do polo.
 *
 * Com o globo de raio `BALL`, a borda da pálpebra de cima fica a
 * `BALL·cos(cover)` do centro do olho. Os valores saem daí: a abertura
 * tem de medir cerca de 0,18·R de altura, que é o que o cânone pede
 * para uma cabeça desta largura. A de cima cobre mais que a de baixo,
 * como num rosto real.
 */
const LID_OPEN = 1.15;
const LOWER_OPEN = 1.0;
/** Fechada, a de cima desce até encontrar a borda da de baixo. */
const LID_SHUT = 2.14;

/** Rosto em repouso: é ele que define a contagem e a ordem dos vértices. */
const NEUTRAL: FacePose = {
  brow: () => ({ lift: 0, tilt: 0 }),
  lid: () => ({ upper: LID_OPEN, lower: LOWER_OPEN }),
  mouth: { open: 0.1, wide: 1, corner: 0.18 },
};

/** Cada alvo de morph é o mesmo rosto em outra posição. */
const MORPH_POSES: Readonly<Record<FaceMorph, FacePose>> = {
  // Sorriso: cantos bem para cima e pálpebras um pouco mais fechadas —
  // um sorriso que não chega aos olhos não parece um sorriso.
  sorriso: {
    brow: () => ({ lift: 0.1, tilt: -0.08 }),
    lid: () => ({ upper: LID_OPEN + 0.22, lower: LOWER_OPEN + 0.16 }),
    mouth: { open: 0.3, wide: 1.16, corner: 0.75 },
  },
  // Tristeza: cantos para baixo e pontas internas da sobrancelha para cima.
  triste: {
    brow: (side) => ({ lift: -0.06, tilt: side * 0.3 }),
    lid: () => ({ upper: LID_OPEN + 0.3, lower: LOWER_OPEN }),
    mouth: { open: 0.08, wide: 0.92, corner: -0.5 },
  },
  // Surpresa: olhos arregalados, sobrancelhas no alto, boca aberta.
  surpresa: {
    brow: () => ({ lift: 0.3, tilt: -0.02 }),
    lid: () => ({ upper: LID_OPEN - 0.3, lower: LOWER_OPEN - 0.18 }),
    mouth: { open: 1.15, wide: 0.86, corner: 0.05 },
  },
  // Curiosidade: uma sobrancelha sobe, boca pequena de lado.
  curiosa: {
    brow: (side) => ({ lift: side > 0 ? 0.26 : -0.04, tilt: side * -0.16 }),
    lid: (side) => ({ upper: side > 0 ? LID_OPEN - 0.12 : LID_OPEN + 0.12, lower: LOWER_OPEN }),
    mouth: { open: 0.14, wide: 0.88, corner: 0.3 },
  },
  // Fala: boca aberta no meio do caminho (a sincronia labial oscila este alvo).
  fala: {
    brow: () => ({ lift: 0.04, tilt: 0 }),
    lid: () => ({ upper: LID_OPEN, lower: LOWER_OPEN }),
    mouth: { open: 0.95, wide: 0.94, corner: 0.2 },
  },
  // Piscada: só as pálpebras se encontram.
  piscada: {
    brow: () => ({ lift: -0.02, tilt: 0 }),
    lid: () => ({ upper: LID_SHUT, lower: 1.48 }),
    mouth: { open: 0.1, wide: 1, corner: 0.18 },
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

/**
 * A pálpebra: uma calota sobre o globo cuja borda **desce até o
 * equador nos cantos**.
 *
 * Duas calotas concêntricas comuns nunca fecham a amêndoa. Para se
 * tocarem, a de cima e a de baixo teriam de somar 180° de cobertura —
 * e aí o olho estaria fechado. Era por isso que, por mais que se
 * cobrisse em cima e embaixo, o olho continuava um círculo branco com
 * uma fatia cortada: os cantos ficavam escancarados.
 *
 * A borda daqui não tem ângulo constante. Ela vale `cover` na frente,
 * no meio do olho, e vai a 90° nos extremos de x — onde a pálpebra de
 * cima encontra exatamente a de baixo. O resultado é a fenda em forma
 * de amêndoa, que é o que faz um olho parecer um olho.
 *
 * A contagem de vértices não depende de `cover`, só dos segmentos, e é
 * isso que deixa a abertura virar alvo de morph: a pálpebra gira sobre
 * o globo, como a de verdade, em vez de subir e descer na frente dele.
 */
const LID_SEGMENTS = 16;
const LID_RINGS = 4;

function lidCap(cover: number, radius: number, flip: boolean): THREE.BufferGeometry {
  const span = Math.min(Math.PI / 2, Math.max(0.04, cover));
  const position: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= LID_RINGS; r += 1) {
    for (let k = 0; k <= LID_SEGMENTS; k += 1) {
      const u = k / LID_SEGMENTS;
      const phi = u * Math.PI * 2;
      // Borda: `span` na frente e atrás, 90° nos cantos de x.
      const edge = Math.PI / 2 - (Math.PI / 2 - span) * Math.abs(Math.sin(phi));
      const theta = edge * (r / LID_RINGS);
      const s = Math.sin(theta);
      const y = Math.cos(theta) * radius;
      position.push(s * Math.cos(phi) * radius, flip ? -y : y, s * Math.sin(phi) * radius);
    }
  }
  const row = LID_SEGMENTS + 1;
  for (let r = 0; r < LID_RINGS; r += 1) {
    for (let k = 0; k < LID_SEGMENTS; k += 1) {
      const a = r * row + k;
      const b = a + row;
      // A ordem se inverte na pálpebra de baixo, senão ela fica do avesso.
      if (flip) index.push(a, a + 1, b, a + 1, b + 1, b);
      else index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Monta as peças móveis do rosto em uma pose. A ordem nunca muda. */
function buildPose(pose: FacePose, colors: { brow: number; skin: number; lip: number; lipTop: number; lash: number }): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // --- sobrancelhas: um arco que segue o osso, não uma barra reta ---
  for (const side of [1, -1]) {
    const { lift, tilt } = pose.brow(side);
    // O arco é um pedaço de toro, e o centro do toro **não** é o
    // centro do arco: ele fica a um raio de distância. Sem descontar
    // isso, a sobrancelha subia R·0,2 a mais e ia parar no cabelo.
    const arc = R * 0.185;
    const geometry = new THREE.TorusGeometry(arc, R * 0.02, 6, 14, 1.7);
    geometry.scale(1, 0.46, 0.5);
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.85 + tilt * side));
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(side * -0.3));
    geometry.translate(side * EYE_X, EYE_Y + BROW_LIFT * R + lift * R * 0.4 - arc * 0.46, BROW_Z);
    parts.push(tinted(geometry, colors.brow));
  }

  // --- pálpebras: calotas concêntricas ao globo ---
  for (const side of [1, -1]) {
    const { upper, lower } = pose.lid(side);
    for (const [cover, flip] of [
      [upper, false],
      [lower, true],
    ] as const) {
      const cap = lidCap(cover, LID_R, flip);
      // Um fio mais larga que o globo, para a borda não brigar com ele.
      cap.scale(1.04, 1, 1);
      cap.translate(side * EYE_X, EYE_Y, EYE_Z);
      parts.push(tinted(cap, colors.skin));
    }
    // Linha de cílios: a borda da pálpebra de cima, escura e fina. É o
    // que faz o olho ter contorno em vez de ser uma bola na cara.
    const { upper: u } = pose.lid(side);
    const lash = lidCap(u, LID_R * 1.045, false);
    // Só a faixa de baixo da calota: a borda, que é onde ficam os cílios.
    const lashEdge = new THREE.BufferGeometry();
    const src = lash.getAttribute('position') as THREE.BufferAttribute;
    const row = LID_SEGMENTS + 1;
    const keep: number[] = [];
    const idx: number[] = [];
    for (let r = LID_RINGS - 1; r <= LID_RINGS; r += 1) {
      for (let k = 0; k <= LID_SEGMENTS; k += 1) {
        const i = r * row + k;
        keep.push(src.getX(i), src.getY(i) * 1.0, src.getZ(i));
      }
    }
    for (let k = 0; k < LID_SEGMENTS; k += 1) idx.push(k, k + row, k + 1, k + 1, k + row, k + row + 1);
    lashEdge.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    lashEdge.setIndex(idx);
    lashEdge.computeVertexNormals();
    lashEdge.translate(side * EYE_X, EYE_Y, EYE_Z);
    lash.dispose();
    parts.push(tinted(lashEdge, colors.lash));
  }

  // --- boca: dois lábios cheios, não um anel ---
  //
  // Eram dois arcos de toro, um por cima do outro, e juntos fechavam
  // uma elipse: de longe parecia uma boca desenhada com caneta. Um
  // lábio não é um contorno, é um volume — e o de baixo é mais cheio
  // que o de cima, o que basta para a boca deixar de ser simétrica e
  // passar a parecer carne.
  const { open, wide, corner } = pose.mouth;
  const gap = open * R * 0.07;
  const half = MOUTH_HALF * wide;
  for (const [sign, tall, deep, tint] of [
    [1, 0.042, 0.042, colors.lipTop],
    [-1, 0.058, 0.05, colors.lip],
  ] as const) {
    const lip = new THREE.SphereGeometry(1, 18, 7);
    lip.scale(half, R * tall, R * deep);
    // Curva os cantos: para cima quando sorri, para baixo quando não.
    // O arco de cima é côncavo e o de baixo convexo, como numa boca.
    const pos = lip.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      const t = pos.getX(i) / half;
      pos.setY(i, pos.getY(i) + t * t * R * (0.05 * corner - 0.012) * sign);
      // Afina nas pontas: o lábio morre no canto, não termina cortado.
      pos.setZ(i, pos.getZ(i) * (1 - 0.55 * t * t));
    }
    lip.computeVertexNormals();
    lip.translate(0, MOUTH_Y + sign * gap + sign * R * 0.026, MOUTH_Z);
    parts.push(tinted(lip, tint));
  }
  // O vão: só aparece quando os lábios se afastam.
  const inner = new THREE.SphereGeometry(1, 14, 6);
  inner.scale(half * 0.88, Math.max(R * 0.003, gap * 1.1), R * 0.045);
  inner.translate(0, MOUTH_Y + R * 0.004, MOUTH_Z - R * 0.022);
  parts.push(tinted(inner, 0x47202a));

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
  const hair = new THREE.Color(appearance.hairStyle === 'careca' ? 0x5a3a22 : appearance.hairColor);
  const browColor = hair.clone().lerp(new THREE.Color(0x000000), 0.25).getHex();
  // A pálpebra é pele, e um tom abaixo: ela está sempre em sombra
  // própria, sob o arco da sobrancelha.
  const skin = new THREE.Color(appearance.skin);
  const colors = {
    brow: browColor,
    skin: skin.clone().lerp(new THREE.Color(0x000000), 0.07).getHex(),
    // Lábio: a própria pele puxada para o vermelho, não um batom chapado.
    lip: skin.clone().lerp(new THREE.Color(0xc2566a), 0.5).getHex(),
    // O de cima fica na sombra do próprio volume: um tom abaixo.
    lipTop: skin.clone().lerp(new THREE.Color(0xa8465a), 0.56).getHex(),
    lash: hair.clone().lerp(new THREE.Color(0x000000), 0.55).getHex(),
  };

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
