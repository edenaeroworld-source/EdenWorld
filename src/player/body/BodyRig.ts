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
  /**
   * Os quatro ossos da saia, pendurados no quadril.
   *
   * Uma saia não é pele: ela cai do quadril e se apoia no que
   * encontrar — a perna que avança, o colo de quem senta, o banco. O
   * corpo não tem osso que descreva isso, e usar a coxa no lugar
   * obriga o pano a escolher entre ficar parado (e ser atravessado) e
   * colar na perna (e virar calça).
   *
   * São quatro porque o pano precisa responder por direção: o da
   * frente deita no colo, os dos lados acompanham cada perna, o de
   * trás se recolhe sobre o assento. Cada vértice pertence aos dois
   * vizinhos que o cercam, então a peça continua sendo uma superfície
   * só.
   */
  SkirtL: 11,
  SkirtF: 12,
  SkirtR: 13,
  SkirtB: 14,
} as const;

export const BONE_COUNT = 15;

/** Os ossos da saia, na ordem dos azimutes que `FollowSpec` espera. */
export const SKIRT_QUADRANTS: readonly [number, number, number, number] = [
  Bone.SkirtL,
  Bone.SkirtF,
  Bone.SkirtR,
  Bone.SkirtB,
];

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
  'saia-e',
  'saia-f',
  'saia-d',
  'saia-t',
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

/* ---------------------------- a saia em pose ----------------------------- */

/**
 * Quanto a saia acompanha a perna ao andar, e quanto ao sentar.
 *
 * Andando, o pano fica para trás da perna: segue metade do balanço e
 * o resto a forma da peça absorve (ver `strideRoom`, em
 * `BodyBuilder`). Sentada, não há balanço nenhum — a coxa vira uma
 * prateleira horizontal e o tecido **deita** nela. Por isso o fator
 * sobe quase a um: o que antes era folga agora é apoio.
 */
export const SKIRT_FOLLOW_WALK = 0.5;
/**
 * Sentada, cada quadrante faz uma coisa diferente — é para isso que
 * eles existem. A frente deita sobre o colo; as laterais quase não
 * giram, porque a saia de quem senta não vai para a frente, ela
 * desce ao lado, e ainda se recolhe para dentro, espremida entre o
 * quadril e a tábua. Seguir tudo junto a 0,92 inflava a saia num
 * balão — número nenhum acusou isso, só a imagem.
 */
export const SKIRT_FOLLOW_LAP = 0.6;
export const SKIRT_SIDE_LAP = 0.25;
export const SKIRT_TUCK = 0.25;

/** Fração da abertura lateral da perna que a saia acompanha. */
export const SKIRT_SPREAD = 0.5;

/**
 * A janela de flexão em que a saia entende que virou colo.
 *
 * O sinal é a **média** das duas coxas, não cada uma: caminhando, uma
 * perna vai e a outra vem, e a média fica em zero por mais larga que
 * seja a passada. Só quando as duas dobram juntas — sentar, agachar —
 * é que a média cresce. Assim a regra não precisa saber se existe um
 * banco embaixo: ela lê a postura, e vale para o jogador, para as
 * NPCs e para o Panteão sem combinar nada com ninguém.
 *
 * A média máxima medida por estado é 0,000 rad caminhando, correndo,
 * nadando e descendo escada — as pernas se cancelam exatamente —,
 * 0,220 pulando e subindo escada, e 1,500 sentada. A janela fica
 * entre os dois grupos, e é larga de propósito: quanto mais estreita,
 * mais rápido o pano se mexe no quadro em que ela é atravessada, e
 * foi assim que apareceu um tranco de 13 cm ao levantar.
 */
export const LAP_FROM = 0.4;
export const LAP_TO = 1.45;

/**
 * Quanto a saia inteira sobe ao sentar, em metros.
 *
 * Uma saia de 36 cm não cabe entre o quadril e o assento, onde sobram
 * 10: o banco empurra o pano para cima, e é por isso que toda saia
 * sobe um pouco quando a gente senta. Sem isso a barra atravessa a
 * tábua — eram 55 vértices dentro da madeira, agora são 32.
 */
export const SKIRT_LIFT = 0.24;

/**
 * O recolhimento a mais do pano de trás, em metros e radianos.
 *
 * Atrás não é só o assento que empurra: o corpo senta em cima do
 * pano. Ele se junta entre as costas e a tábua, sobe mais que o
 * resto e tomba para a frente — para trás encostaria no espaldar,
 * que fica a 30 cm do centro e inclinado 0,18 rad.
 */
export const SKIRT_GATHER = 0.06;
export const SKIRT_BACK_TILT = 0.35;

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** O quanto a pose é um colo: 0 em pé, 1 sentada. */
export function lapAmount(legLX: number, legRX: number): number {
  return smoothstep(LAP_FROM, LAP_TO, -(legLX + legRX) * 0.5);
}

/**
 * Põe os quatro ossos da saia de acordo com as pernas.
 *
 * Quem decide o quanto o pano anda é esta função, não os pesos da
 * malha: os pesos dizem apenas que a barra é pano solto e a cintura
 * é costura. Essa separação é o que permite a mesma saia cair reta
 * em pé, balançar na corrida e deitar no colo — sem tocar na
 * geometria, que continua a mesma em todas as três.
 */
export function poseSkirt(bones: readonly THREE.Bone[], legLX: number, legRX: number, legLZ: number, legRZ: number): void {
  const average = (legLX + legRX) * 0.5;
  const lap = lapAmount(legLX, legRX);
  const front = mix(SKIRT_FOLLOW_WALK, SKIRT_FOLLOW_LAP, lap);
  const side = mix(SKIRT_FOLLOW_WALK, SKIRT_SIDE_LAP, lap);
  const tuck = SKIRT_TUCK * lap;
  const lift = SKIRT_LIFT * lap;

  // Cada lado segue a sua própria perna, e se recolhe para dentro ao
  // sentar: a saia de quem senta não vai para a frente, ela desce ao
  // lado, espremida entre o quadril e a tábua.
  bones[Bone.SkirtL].rotation.set(side * legLX, 0, SKIRT_SPREAD * legLZ - tuck);
  bones[Bone.SkirtR].rotation.set(side * legRX, 0, SKIRT_SPREAD * legRZ + tuck);
  // A frente segue a média: zero na passada, o colo inteiro ao sentar.
  bones[Bone.SkirtF].rotation.set(front * average, 0, 0);
  // As costas não giram com perna nenhuma: elas se recolhem. O tombo
  // é para a frente, trazendo a barra para cima do assento; para trás
  // ela entraria no espaldar.
  bones[Bone.SkirtB].rotation.set(-SKIRT_BACK_TILT * lap, 0, 0);

  bones[Bone.SkirtL].position.y = lift;
  bones[Bone.SkirtR].position.y = lift;
  bones[Bone.SkirtF].position.y = lift;
  bones[Bone.SkirtB].position.y = lift + SKIRT_GATHER * lap;
}

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
  // Os ossos da saia giram em torno da origem do quadril: é de lá que
  // o pano pende, não da junta da perna.
  for (const index of SKIRT_QUADRANTS) place(index, 0, 0, 0);

  bones[Bone.Hips].add(bones[Bone.Torso], bones[Bone.ThighL], bones[Bone.ThighR]);
  for (const index of SKIRT_QUADRANTS) bones[Bone.Hips].add(bones[index]);
  bones[Bone.Torso].add(bones[Bone.Head], bones[Bone.ArmL], bones[Bone.ArmR]);
  bones[Bone.ArmL].add(bones[Bone.ForeL]);
  bones[Bone.ArmR].add(bones[Bone.ForeR]);
  bones[Bone.ThighL].add(bones[Bone.ShinL]);
  bones[Bone.ThighR].add(bones[Bone.ShinR]);

  const root = bones[Bone.Hips];
  root.updateMatrixWorld(true);
  return { bones, root, skeleton: new THREE.Skeleton(bones) };
}
