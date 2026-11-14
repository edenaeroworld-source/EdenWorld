/**
 * O esqueleto e as medidas que saem dele.
 *
 * Os onze ossos têm exatamente os nomes que as onze malhas rígidas
 * tinham antes — `quadril`, `tronco`, `cabeca`, `braco-e` … — e ficam
 * exatamente nas mesmas posições relativas. Isso não é nostalgia: é o
 * contrato com o animador. `AvatarAnimator` escreve dezenove canais de
 * pose, `Gestures` toca por cima deles, `PlayerMotor` decide o estado,
 * e nada disso precisou mudar de uma linha, porque do outro lado o que
 * gira continua sendo uma junta com o mesmo nome no mesmo lugar.
 *
 * O que mudou é o que está **pendurado** nas juntas. Antes, um bloco
 * rígido por junta. Agora, uma única malha cujos vértices pertencem a
 * um osso, a outro, ou aos dois ao mesmo tempo.
 */

import * as THREE from 'three';
import { TORSO_JOINT_Y } from '../Gestation';
import type { BodyProportions } from './BodyProportions';

/** Índice de cada osso no `skinIndex`. A ordem é o contrato da malha. */
export const Bone = {
  Hips: 0,
  Torso: 1,
  Head: 2,
  ArmL: 3,
  ForeL: 4,
  ArmR: 5,
  ForeR: 6,
  ThighL: 7,
  ShinL: 8,
  ThighR: 9,
  ShinR: 10,
} as const;

export const BONE_COUNT = 11;

/** Nome de cada osso — os mesmos das malhas antigas. */
export const BONE_NAMES: readonly string[] = Object.freeze([
  'quadril',
  'tronco',
  'cabeca',
  'braco-e',
  'antebraco-e',
  'braco-d',
  'antebraco-d',
  'coxa-e',
  'perna-e',
  'coxa-d',
  'perna-d',
]);

/* ------------------------- medidas de referência ------------------------- */

/** Coxa do corpo de referência (metros). */
export const THIGH = 0.41;
/** Canela do corpo de referência. */
export const SHIN = 0.385;
export const UPPER_ARM = 0.27;
export const FOREARM = 0.23;
/** Do calcanhar ao tornozelo: o que sobra abaixo da canela. */
export const ANKLE = 0.05;
/** Altura da junta do tronco sobre o quadril. */
export const WAIST = TORSO_JOINT_Y;
export const SHOULDER_Y = 0.37;
export const SHOULDER_X = 0.2;
export const NECK_Y = 0.48;
/** Afastamento lateral do quadril para cada perna. */
export const LEG_X = 0.095;
/** Raio da cabeça de referência. */
export const HEAD_R = 0.176;
/**
 * Altura do centro da cabeça sobre a junta do pescoço.
 *
 * `AvatarFace` autora sobrancelhas, pálpebras e boca em volta deste
 * mesmo número (`HEAD_Y`), e é por isso que ele não pode mudar sem
 * mudar lá também: o rosto é uma malha à parte, pendurada no osso da
 * cabeça, e precisa pousar na superfície do crânio.
 */
export const HEAD_CENTER = 0.16;

/** Altura da articulação do quadril no corpo de referência. */
export const HIP_HEIGHT = THIGH + SHIN + ANKLE;

/**
 * Medidas de um corpo concreto, em metros, no espaço de bind.
 *
 * Espaço de bind: origem na junta do quadril, y para cima. É o espaço
 * em que a malha é autorada e em que as bandas dos Afters e da
 * gestação continuam sendo medidas — por isso `morphOrigin*` existe.
 */
export interface BodyMetrics {
  thigh: number;
  shin: number;
  upperArm: number;
  forearm: number;
  hipHeight: number;
  waist: number;
  shoulderY: number;
  shoulderX: number;
  neckY: number;
  legX: number;
  /** Raio lateral do quadril. */
  hipWidth: number;
  /** Raio lateral do peito. */
  chestWidth: number;
  /** Raio lateral da cintura. */
  waistWidth: number;
  /** Raio do braço no ombro e no punho. */
  armTop: number;
  armWrist: number;
  /** Raio da perna na virilha e no tornozelo. */
  legTop: number;
  legAnkle: number;
  /** Raio do pescoço. */
  neckR: number;
  /** Raio da cabeça. */
  headR: number;
  /** Altura do topo da cabeça acima do quadril. */
  crown: number;
}

/**
 * Converte as medidas relativas em metros.
 *
 * `build` engrossa tudo junto porque é assim que um corpo engrossa:
 * ninguém tem braço de halterofilista e pescoço de pássaro. Os outros
 * parâmetros ajustam uma região de cada vez por cima disso.
 */
export function bodyMetrics(p: BodyProportions): BodyMetrics {
  // -1 … 1 em volta da compleição média.
  const bulk = (p.build - 0.5) * 2;
  const thick = 1 + bulk * 0.16;

  const thigh = THIGH * p.legLength;
  const shin = SHIN * p.legLength;
  const upperArm = UPPER_ARM * p.armLength;
  const forearm = FOREARM * p.armLength;

  return {
    thigh,
    shin,
    upperArm,
    forearm,
    hipHeight: thigh + shin + ANKLE,
    waist: WAIST,
    shoulderY: SHOULDER_Y,
    shoulderX: SHOULDER_X * p.shoulders,
    neckY: NECK_Y * (0.94 + 0.06 * p.neck),
    legX: LEG_X * (0.85 + 0.15 * p.hips),
    hipWidth: 0.158 * p.hips * thick,
    chestWidth: 0.158 * p.chest * thick,
    waistWidth: 0.128 * p.waist * thick,
    armTop: 0.062 * thick * (0.9 + 0.1 * p.shoulders),
    armWrist: 0.036 * thick,
    legTop: 0.088 * thick * (0.9 + 0.1 * p.hips),
    legAnkle: 0.044 * thick,
    neckR: 0.049 * p.neck * (0.95 + 0.05 * thick),
    headR: HEAD_R * p.headSize,
    // Cintura + pescoço + o centro da cabeça + meia cabeça. É o número
    // que a câmera e as etiquetas de nome usam para achar o topo.
    crown: WAIST + NECK_Y * (0.94 + 0.06 * p.neck) + (HEAD_CENTER + HEAD_R * 1.08) * p.headSize,
  };
}

/** Quanto detalhe a malha recebe. Um nível por faixa de aparelho. */
export interface BodyDetail {
  /** Vértices por anel. */
  segments: number;
  /** Anéis gerados entre dois pontos de controle do perfil. */
  steps: number;
  /** Anéis do crânio. */
  headRings: number;
}

export const BODY_DETAIL: Readonly<Record<'alta' | 'media' | 'baixa', BodyDetail>> = Object.freeze({
  alta: { segments: 20, steps: 4, headRings: 14 },
  media: { segments: 14, steps: 3, headRings: 11 },
  baixa: { segments: 10, steps: 2, headRings: 8 },
});

export type BodyDetailLevel = keyof typeof BODY_DETAIL;

/**
 * As origens de junta que as bandas de deformação usam.
 *
 * As bandas dos Afters e da gestação foram escritas no espaço de cada
 * junta, quando cada junta era uma malha. A malha agora é uma só, e os
 * vértices vivem no espaço do quadril — então cada vértice carrega,
 * num atributo, a origem da junta a que a banda dele se refere. O
 * shader subtrai, deforma, soma de volta.
 *
 * Essa indireção é o que permitiu reescrever o corpo inteiro sem tocar
 * em uma linha de `AftersMorph.ts` nem de `Gestation.ts` — os dois
 * módulos com testes que comparam TypeScript e GLSL vértice a vértice.
 */
export interface MorphOrigins {
  /** Zona Bust: origem do tronco. */
  torso: readonly [number, number, number];
  /** Zona Curve: origem do quadril. */
  hips: readonly [number, number, number];
  /** Zona Thigh: origem da coxa, lado esquerdo e direito. */
  thighL: readonly [number, number, number];
  thighR: readonly [number, number, number];
}

export function morphOrigins(m: BodyMetrics): MorphOrigins {
  return {
    torso: [0, m.waist, 0],
    hips: [0, 0, 0],
    thighL: [m.legX, -0.02, 0],
    thighR: [-m.legX, -0.02, 0],
  };
}

/** O esqueleto montado, pronto para `SkinnedMesh.bind`. */
export interface BodySkeleton {
  bones: THREE.Bone[];
  root: THREE.Bone;
  skeleton: THREE.Skeleton;
}

/**
 * Monta os ossos na pose de repouso.
 *
 * A hierarquia é a mesma de sempre: o quadril carrega o tronco e as
 * coxas, o tronco carrega a cabeça e os braços. Quem já sabia girar
 * `tronco` continua girando `tronco`.
 */
export function createSkeleton(m: BodyMetrics): BodySkeleton {
  const bones: THREE.Bone[] = [];
  for (const name of BONE_NAMES) {
    const bone = new THREE.Bone();
    bone.name = name;
    bones.push(bone);
  }

  const place = (index: number, x: number, y: number, z = 0): void => {
    bones[index].position.set(x, y, z);
  };

  place(Bone.Hips, 0, 0, 0);
  place(Bone.Torso, 0, m.waist, 0);
  place(Bone.Head, 0, m.neckY, 0);
  place(Bone.ArmL, m.shoulderX, m.shoulderY, 0);
  place(Bone.ArmR, -m.shoulderX, m.shoulderY, 0);
  place(Bone.ForeL, 0, -m.upperArm, 0);
  place(Bone.ForeR, 0, -m.upperArm, 0);
  place(Bone.ThighL, m.legX, -0.02, 0);
  place(Bone.ThighR, -m.legX, -0.02, 0);
  place(Bone.ShinL, 0, -m.thigh, 0);
  place(Bone.ShinR, 0, -m.thigh, 0);

  bones[Bone.Hips].add(bones[Bone.Torso], bones[Bone.ThighL], bones[Bone.ThighR]);
  bones[Bone.Torso].add(bones[Bone.Head], bones[Bone.ArmL], bones[Bone.ArmR]);
  bones[Bone.ArmL].add(bones[Bone.ForeL]);
  bones[Bone.ArmR].add(bones[Bone.ForeR]);
  bones[Bone.ThighL].add(bones[Bone.ShinL]);
  bones[Bone.ThighR].add(bones[Bone.ShinR]);

  const root = bones[Bone.Hips];
  root.updateMatrixWorld(true);
  return { bones, root, skeleton: new THREE.Skeleton(bones) };
}
