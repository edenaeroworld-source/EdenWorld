/**
 * O corpo, desenhado como perfil em vez de montado como peças.
 *
 * Cada região do corpo aqui é uma lista curta de pontos de controle —
 * "no ombro o braço tem 6,5 cm de raio, no cotovelo 4,6, no punho
 * 3,6" — e a malha sai de varrer esses pontos. O resultado é uma
 * superfície contínua com cintura, panturrilha, deltoide e maxilar,
 * em vez de um cilindro com bolas nas pontas.
 *
 * Os pesos de esqueleto vão junto no perfil: a estação onde o osso
 * muda é a articulação, e a rampa entre uma estação e a outra é o que
 * o cotovelo usa para dobrar sem quina. Não há passo separado de
 * "pintar pesos" — o peso é parte da descrição do corpo.
 *
 * O que este módulo **não** faz: nada que dependa do estado do jogo.
 * Recebe aparência e medidas, devolve uma geometria. É por isso que
 * dois sistemas distintos podem pedir o corpo da Suki-Chan e receber,
 * byte a byte, a mesma coisa.
 */

import * as THREE from 'three';
import { Zone as MorphZone } from '../../afters/AftersMorph';
import { TAU } from '../../utils/math';
import type { AvatarAppearance } from '../AvatarAppearance';
import type { BodyProportions } from './BodyProportions';
import { Bone, type BodyDetail, type BodyMetrics, HEAD_CENTER, morphOrigins } from './BodyRig';
import { type FollowSpec, type SkinBinding, type Station, SurfaceBuilder, subdivideProfile } from './BodySurface';

type Hex = THREE.ColorRepresentation;

function shade(color: Hex, amount: number): number {
  const c = new THREE.Color(color);
  return c.lerp(new THREE.Color(amount >= 0 ? 0xffffff : 0x000000), Math.abs(amount)).getHex();
}

/** Atalho para um ponto de controle. */
interface Ctl {
  y: number;
  /** Raio lateral. */
  rx: number;
  /** Profundidade frontal; igual a `rx` quando omitida. */
  rz?: number;
  /** Profundidade traseira; igual a `rz` quando omitida. */
  rzBack?: number;
  x?: number;
  z?: number;
  color: Hex;
  bone: number;
  /** Osso secundário, para descrever a rampa de uma articulação. */
  bone2?: number;
  /** Fração do peso que vai para `bone2`. */
  blend?: number;
  zone?: number;
  origin?: readonly [number, number, number];
  follow?: FollowSpec;
}

function toStations(control: readonly Ctl[]): Station[] {
  return control.map((c) => ({
    y: c.y,
    rx: c.rx,
    rz: c.rz ?? c.rx,
    rzBack: c.rzBack ?? c.rz ?? c.rx,
    x: c.x,
    z: c.z,
    color: c.color,
    skin: c.bone2 === undefined ? { bone: c.bone } : { bone: c.bone, bone2: c.bone2, blend: c.blend ?? 0.5 },
    zone: c.zone,
    origin: c.origin,
    follow: c.follow,
  }));
}

/* ========================================================================= */
/* O corpo                                                                   */
/* ========================================================================= */

/**
 * Monta a malha completa do corpo no espaço de bind.
 *
 * Espaço de bind: origem na junta do quadril, y para cima, z para a
 * frente. O mesmo espaço do osso raiz, que é o que permite ao shader
 * dos Afters continuar medindo as bandas como sempre mediu.
 */
export function buildBodyGeometry(a: AvatarAppearance, p: BodyProportions, m: BodyMetrics, detail: BodyDetail): THREE.BufferGeometry {
  const b = new SurfaceBuilder();
  const origins = morphOrigins(m);

  const skin = a.skin;
  const top = a.topColor;
  const bottom = a.bottomColor;
  const shoe = a.shoeColor;
  const accent = 0x29c8ff;
  const outfit = a.outfit;

  const longSleeves = outfit === 'aero';
  const bareArms = outfit === 'esportivo' || outfit === 'vestido';
  const longPants = outfit === 'casual' || outfit === 'aero';
  const bareLegs = outfit === 'vestido';
  const dress = outfit === 'vestido';

  buildTorso(b, { m, detail, skin, top, bottom, accent, outfit, dress, origins });
  for (const side of [1, -1] as const) {
    buildArm(b, side, { m, detail, skin, top, accent, longSleeves, bareArms, outfit });
    buildLeg(b, side, { m, detail, skin, bottom, shoe, longPants, bareLegs, outfit, origins });
  }
  buildHead(b, a, p, m, detail);
  // Onde a saia começa no buffer: é assim que um teste separa o tecido
  // do corpo sem adivinhar por cor ou por raio.
  const skirtStart = b.vertexCount;
  if (dress) buildSkirt(b, m, detail, top, origins);

  const geometry = b.build();
  geometry.userData.parts = dress ? { saia: [skirtStart, b.vertexCount] } : {};
  return geometry;
}

/* ------------------------------- tronco ---------------------------------- */

interface TorsoCtx {
  m: BodyMetrics;
  detail: BodyDetail;
  skin: Hex;
  top: Hex;
  bottom: Hex;
  accent: Hex;
  outfit: string;
  dress: boolean;
  origins: ReturnType<typeof morphOrigins>;
}

/**
 * Do períneo ao alto do pescoço, numa varredura só.
 *
 * Não há "peça do quadril" encaixada numa "peça do tronco": há uma
 * cintura, que é o ponto em que o perfil afina e em que o peso de
 * esqueleto passa de um osso ao outro. Os dois acontecem na mesma
 * altura porque são a mesma coisa vista de dois ângulos.
 */
function buildTorso(b: SurfaceBuilder, ctx: TorsoCtx): void {
  const { m, detail, skin, top, bottom, accent, outfit, dress, origins } = ctx;
  const hip = origins.hips;
  const torso = origins.torso;

  // A barriga aparece em quem usa traje de praia; nos outros a cor da
  // roupa sobe desde o quadril.
  const belly = outfit === 'praia' ? skin : outfit === 'esportivo' ? skin : top;
  const lower = dress ? top : bottom;

  const control: Ctl[] = [
    // A pelve termina na altura da virilha, não abaixo dela: descer
    // mais criava uma cunha entre as coxas — a "fralda" que denuncia
    // um tronco modelado sem olhar para onde as pernas começam.
    //
    // Os quatro anéis da pelve vêm de `PELVIS_PROFILE`, a mesma tabela
    // que a saia consulta para saber o que precisa vestir. Fosse uma
    // cópia, bastaria mexer num dos dois lugares para a roupa deixar
    // de caber no corpo — foi exatamente assim que o vestido rachou.
    ...PELVIS_PROFILE.map((seg) => ({
      y: seg.y,
      rx: m.hipWidth * seg.w,
      rz: seg.rz,
      rzBack: seg.rzBack,
      color: lower,
      bone: Bone.Hips,
      zone: MorphZone.Curve,
      origin: hip,
    })),
    // A cintura: onde o perfil afina e onde o osso troca.
    { y: 0.1, rx: m.waistWidth, rz: 0.086, rzBack: 0.09, color: belly, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: 0.165, rx: m.waistWidth * 1.06, rz: 0.09, rzBack: 0.092, color: top, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: 0.235, rx: m.chestWidth * 0.97, rz: 0.104, rzBack: 0.096, color: top, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: 0.3, rx: m.chestWidth, rz: 0.102, rzBack: 0.094, color: top, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    // A linha dos ombros é larga e rasa: é o trapézio, não uma tampa.
    // E tem de subir **até a altura da junta do braço** (`waist +
    // shoulderY`): parando antes, o braço nascia no ar ao lado do
    // pescoço, com um vão de dois dedos na axila.
    { y: 0.365, rx: Math.max(m.chestWidth * 0.99, m.shoulderX * 0.88), rz: 0.096, rzBack: 0.09, color: top, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: m.waist + m.shoulderY, rx: Math.max(m.chestWidth * 0.8, m.shoulderX * 0.72), rz: 0.082, rzBack: 0.08, color: top, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    // Pescoço: sai do trapézio, não de um buraco.
    { y: m.waist + m.shoulderY + 0.028, rx: m.neckR * 1.5, rz: m.neckR * 1.42, color: skin, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: m.neckY - 0.015, rx: m.neckR * 1.04, rz: m.neckR * 1.02, color: skin, bone: Bone.Head },
    { y: m.neckY + 0.045, rx: m.neckR * 0.99, rz: m.neckR, color: skin, bone: Bone.Head },
  ];

  b.loft(subdivideProfile(toStations(control), detail.steps), {
    segments: detail.segments,
    capBottom: 0.055,
    capRings: 2,
  });

  // Ombro redondo: um leve empurrão para fora em cima da linha do
  // trapézio. É o que tira o aspecto de cabide sem alargar o peito.
  for (const side of [1, -1]) {
    b.feature([side * m.shoulderX * 0.8, m.waist + m.shoulderY - 0.02, 0], [0.08, 0.06, 0.09], 0.014);
  }
  // Peito e omoplatas: volumes rasos, na superfície que já existe.
  b.feature([0, 0.285, 0.09], [0.11, 0.07, 0.07], 0.01, [0, 0, 1]);
  b.feature([0, 0.3, -0.09], [0.12, 0.06, 0.06], 0.006, [0, 0, -1]);

  if (outfit === 'aero') {
    const ring = new THREE.TorusGeometry(m.neckR * 1.26, 0.015, 6, Math.max(10, detail.segments));
    b.addGeometry(ring, { color: accent, skin: { bone: Bone.Head } }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, m.neckY - 0.045, 0));
    b.ball([0, 0.3, 0.098], [0.026, 0.026, 0.012], { color: accent, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, 6);
  } else if (outfit === 'esportivo') {
    const stripe = new THREE.BoxGeometry(0.17, 0.03, 0.01);
    b.addGeometry(stripe, { color: shade(top, 0.5), skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeTranslation(0, 0.26, 0.1));
  } else if (outfit === 'vestido') {
    const sash = flatRing(m.waistWidth * 1.06, WAIST_DEPTH, 0.013, Math.max(12, detail.segments));
    b.addGeometry(sash, { color: shade(top, 0.35), skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.14, 0));
  }
  if (outfit === 'casual') {
    // A barra da camiseta, marcada por um degrau raso de cor.
    const hem = flatRing(m.waistWidth * 1.04, WAIST_DEPTH, 0.009, Math.max(10, detail.segments));
    b.addGeometry(hem, { color: shade(top, -0.14), skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.12, 0));
  }
  if (outfit === 'aero') {
    const belt = flatRing(m.hipWidth * 0.98, HIP_DEPTH, 0.012, Math.max(12, detail.segments));
    b.addGeometry(belt, { color: accent, skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.03, 0));
  }
  void bottom;
}

/**
 * Um anel horizontal achatado como o corpo que ele abraça.
 *
 * O tronco é um ovo visto de cima — mais largo de lado do que fundo
 * de frente para trás. Um cós redondo sobre um tronco oval sobra nas
 * pontas: de perfil, o cinto vira uma barra que atravessa a barriga.
 * `depth` é a razão entre o meio-eixo frontal e o lateral daquela
 * altura, e a escala é aplicada antes da rotação, quando o eixo Y da
 * rosca ainda é o que vai virar Z.
 */
function flatRing(radius: number, depth: number, tube: number, segments: number, arc?: number): THREE.TorusGeometry {
  const ring = new THREE.TorusGeometry(radius, tube, 6, segments, arc);
  ring.scale(1, depth, 1);
  return ring;
}

/** Razão fundo/largura do tronco na cintura e no quadril. */
const WAIST_DEPTH = 0.77;
const HIP_DEPTH = 0.66;

/* ------------------------------- a saia ---------------------------------- */

/**
 * O perfil da pelve, em frações de `hipWidth`.
 *
 * Fonte única: o tronco desenha estes anéis e a saia os consulta para
 * saber o que tem de vestir.
 */
const PELVIS_PROFILE: readonly { y: number; w: number; rz: number; rzBack: number }[] = [
  { y: -0.088, w: 0.78, rz: 0.086, rzBack: 0.094 },
  { y: -0.055, w: 0.93, rz: 0.098, rzBack: 0.112 },
  { y: -0.015, w: 1.0, rz: 0.104, rzBack: 0.118 },
  { y: 0.03, w: 0.95, rz: 0.1, rzBack: 0.106 },
];

/** Altura da junta do quadril (`BodyRig.place(Bone.ThighL, …)`). */
const HIP_JOINT_Y = -0.02;
/** Onde a barra da saia termina — acima do joelho. */
const SKIRT_HEM_Y = -0.36;

/**
 * O perfil da coxa, em frações de `legTop`, nas alturas de `buildLeg`.
 *
 * As entradas descem: a primeira é o topo da coxa, enterrado na
 * pelve. Os deslocamentos são relativos à junta do quadril, como em
 * `buildLeg`, para que mexer num perfil mexa nos dois.
 */
const THIGH_PROFILE: readonly { d: number; w: number }[] = [
  { d: 0.05, w: 0.98 },
  { d: -0.02, w: 1.02 },
  { d: -0.1, w: 0.96 },
];

function sampleFalling(table: readonly { at: number; v: number }[], y: number): number {
  if (y >= table[0].at) return table[0].v;
  const last = table[table.length - 1];
  if (y <= last.at) return last.v;
  for (let i = 0; i < table.length - 1; i += 1) {
    const a = table[i];
    const c = table[i + 1];
    if (y <= a.at && y >= c.at) return a.v + ((c.v - a.v) * (y - a.at)) / (c.at - a.at);
  }
  return last.v;
}

/** Raio lateral da coxa na altura `y` (espaço de bind). */
function thighRadiusAt(m: BodyMetrics, y: number): number {
  const kneeY = HIP_JOINT_Y - m.thigh;
  const table = [
    ...THIGH_PROFILE.map((seg) => ({ at: HIP_JOINT_Y + seg.d, v: m.legTop * seg.w })),
    { at: (HIP_JOINT_Y + kneeY) * 0.5, v: m.legTop * 0.86 },
    { at: kneeY + 0.1, v: m.legTop * 0.78 },
    { at: kneeY + 0.055, v: m.legTop * 0.735 },
  ];
  return sampleFalling(table, y);
}

/** Raio lateral da pelve na altura `y`; zero abaixo da virilha. */
function pelvisRadiusAt(m: BodyMetrics, y: number): number {
  if (y < PELVIS_PROFILE[0].y) return 0;
  const table = [
    { at: 0.1, v: m.waistWidth },
    ...[...PELVIS_PROFILE].reverse().map((seg) => ({ at: seg.y, v: m.hipWidth * seg.w })),
  ];
  return sampleFalling(table, y);
}

/** Profundidade da pelve (frente ou costas) na altura `y`. */
function pelvisDepthAt(m: BodyMetrics, y: number): number {
  if (y < PELVIS_PROFILE[0].y) return 0;
  void m;
  return sampleFalling(
    [{ at: 0.1, v: 0.09 }, ...[...PELVIS_PROFILE].reverse().map((seg) => ({ at: seg.y, v: seg.rzBack }))],
    y,
  );
}

/**
 * Por quanto é preciso esticar uma elipse para engolir um círculo.
 *
 * **É aqui que estava o segundo defeito.** Garantir que a elipse é
 * mais larga que a coxa e mais funda que a passada não garante que
 * ela contenha a coxa: na diagonal a elipse é mais estreita que nos
 * eixos, e a coxa em movimento está justamente na diagonal — larga em
 * x porque fica a `legX` do eixo, adiantada em z porque a perna
 * avançou. Era por essa quina que saíam os 2,7 cm de pele que
 * sobraram depois do primeiro acerto.
 *
 * Não existe fórmula fechada bonita para isto; amostrar o círculo
 * resolve, e são dez anéis vezes vinte e quatro pontos, uma vez, na
 * construção da malha.
 */
function swellFor(rx: number, rz: number, cx: number, cz: number, radius: number): number {
  let k = 1;
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const x = (cx + Math.cos(a) * radius) / rx;
    const z = (cz + Math.sin(a) * radius) / rz;
    k = Math.max(k, Math.hypot(x, z));
  }
  return k;
}

/**
 * Folga do tecido: justa na cintura, solta na barra.
 *
 * Um vestido encosta no corpo onde é costurado e se afasta à medida
 * que cai. Sem essa variação, ou a cintura fica inflada ou a barra
 * fica colada na perna.
 */
function skirtClearance(y: number): number {
  const drop = Math.max(0, Math.min(1, (HIP_JOINT_Y - y) / (HIP_JOINT_Y - SKIRT_HEM_Y)));
  return 0.009 + 0.023 * drop;
}

/**
 * Tangente do balanço de passada que a saia precisa comportar.
 *
 * A coxa gira em torno da junta do quadril. Um ponto que termina `h`
 * metros abaixo da junta veio de uma profundidade `h / cos θ` e está
 * afastado `h · tan θ` do eixo — **tangente, não seno**: é a conta
 * que me enganou na primeira tentativa, e a diferença chega a 40% no
 * ângulo da corrida.
 *
 * O animador chega a 29,8° caminhando e 44,6° correndo; 40° é o
 * ponto em que a peça cobre a passada inteira sem virar uma tenda.
 */
const STRIDE_TAN = Math.tan((40 * Math.PI) / 180);

/**
 * Peso com que a saia acompanha a coxa, e a curva com que ele cresce.
 *
 * Meio a meio na barra, zero na cintura. Mais que isso e a peça vira
 * calça — cada metade colada na sua perna; menos, e a forma precisa
 * engordar para compensar, porque é uma coisa ou outra (ver
 * `strideRoom`). Com 0,5 a varredura de paridade não acusa um único
 * vértice exposto e a silhueta continua a de um vestido.
 */
const SKIRT_FOLLOW = 0.5;
const FOLLOW_RAMP = 0.5;

/** Quanto do balanço a saia absorve sozinha na altura `y`. */
function followWeight(y: number): number {
  const drop = Math.max(0, Math.min(1, (HIP_JOINT_Y - y) / (HIP_JOINT_Y - SKIRT_HEM_Y)));
  return SKIRT_FOLLOW * drop ** FOLLOW_RAMP;
}

/**
 * Espaço que a passada exige do tecido na altura `y`.
 *
 * Folga e acompanhamento são a mesma grandeza vista duas vezes: o que
 * a saia **não** acompanha é exatamente o que ela precisa ter de
 * sobra na forma. Por isso o termo é `(1 − peso)` — perto da barra,
 * onde o tecido vai junto com a perna, ele quase desaparece, e é essa
 * compensação que impede a saia de inflar como um vestido de baile só
 * para cobrir um joelho que ela já está acompanhando.
 */
function strideRoom(y: number): number {
  return Math.max(0, HIP_JOINT_Y - y) * STRIDE_TAN * (1 - followWeight(y));
}

/**
 * A saia do vestido: um cone suave pendurado no quadril.
 *
 * Cada anel é o maior entre a forma desejada (a linha A, que é o que
 * faz a peça parecer uma saia) e o corpo que ele tem de vestir mais a
 * folga. A forma nunca ganha do corpo — é essa precedência que impede
 * o tecido de rachar quando as proporções mudam.
 *
 * O topo fica **dentro** do tronco de propósito: a borda some sob o
 * corpete em vez de aparecer como um degrau na cintura. Todos os
 * anéis pertencem ao osso do quadril, e só a ele: é o que mantém os
 * dois lados da saia rigidamente ligados, sem a tesoura que apareceria
 * se cada metade seguisse a sua coxa.
 */
function buildSkirt(b: SurfaceBuilder, m: BodyMetrics, detail: BodyDetail, top: Hex, origins: ReturnType<typeof morphOrigins>): void {
  const hip = origins.hips;
  // Forma desejada: largura da barra e como ela afunila subindo.
  const hemRx = m.hipWidth * 1.9;
  const want = (y: number): number => {
    const t = Math.max(0, Math.min(1, (y - SKIRT_HEM_Y) / (0.09 - SKIRT_HEM_Y)));
    // Curva suave: a saia abre devagar na cintura e acelera na barra.
    return m.waistWidth * 1.04 + (hemRx - m.waistWidth * 1.04) * (1 - t) ** 1.45;
  };

  // Da barra para cima: a varredura exige `y` crescente, e um perfil
  // escrito ao contrário sai com as normais para dentro — a saia
  // acende cinza, como se estivesse sempre na sombra.
  const heights = [SKIRT_HEM_Y, -0.28, -0.21, -0.15, -0.1, -0.06, -0.02, 0.02, 0.055, 0.09];
  const control: Ctl[] = heights.map((y, i) => {
    const clear = skirtClearance(y);

    // A forma desejada é o ponto de partida; o corpo é o piso.
    let rx = want(y);
    let rz = want(y) * 0.94;

    // Conter a pelve, que é uma elipse concêntrica — basta comparar
    // eixo a eixo.
    rx = Math.max(rx, pelvisRadiusAt(m, y) + clear);
    rz = Math.max(rz, pelvisDepthAt(m, y) + clear);

    // Conter as coxas, que são dois discos deslocados: `legX` para o
    // lado, e para a frente ou para trás o que a passada empurra e o
    // tecido não acompanha. A conta é feita nas quatro combinações
    // porque a saia é a mesma para os dois lados e para os dois
    // sentidos da passada.
    const thigh = thighRadiusAt(m, y) + clear;
    const reach = strideRoom(y);
    if (thigh > 0) {
      for (const dz of [reach, -reach]) {
        const k = swellFor(rx, rz, m.legX, dz, thigh);
        rx *= k;
        rz *= k;
      }
    }

    return {
      y,
      // O anel de cima mergulha no corpete: some a borda da costura.
      rx: i === heights.length - 1 ? Math.min(rx, m.waistWidth * 0.97) : rx,
      rz: i === heights.length - 1 ? Math.min(rz, m.waistWidth * 0.72) : rz,
      color: y <= SKIRT_HEM_Y ? shade(top, -0.1) : top,
      bone: Bone.Hips,
      zone: MorphZone.Curve,
      origin: hip,
      follow: { left: Bone.ThighL, right: Bone.ThighR, weight: followWeight(y) },
    };
  });

  b.loft(subdivideProfile(toStations(control), detail.steps), { segments: detail.segments });
}

/* -------------------------------- braço ---------------------------------- */

interface ArmCtx {
  m: BodyMetrics;
  detail: BodyDetail;
  skin: Hex;
  top: Hex;
  accent: Hex;
  longSleeves: boolean;
  bareArms: boolean;
  outfit: string;
}

/**
 * Deltoide, bíceps, cotovelo, antebraço, punho e mão — uma superfície.
 *
 * O perfil engrossa no deltoide, afina acima do cotovelo, engrossa de
 * novo no antebraço e afina até o punho. São seis números; é o que
 * separa um braço de um cano.
 *
 * O topo pertence ao tronco e a rampa de peso desce pelo deltoide: por
 * isso levantar o braço arrasta o ombro junto, em vez de abrir um
 * buraco na axila.
 */
function buildArm(b: SurfaceBuilder, side: 1 | -1, ctx: ArmCtx): void {
  const { m, detail, skin, top, accent, longSleeves, bareArms, outfit } = ctx;
  const armBone = side > 0 ? Bone.ArmL : Bone.ArmR;
  const foreBone = side > 0 ? Bone.ForeL : Bone.ForeR;
  const x = side * m.shoulderX;
  const shoulderY = m.waist + m.shoulderY;
  const elbowY = shoulderY - m.upperArm;
  const wristY = elbowY - m.forearm;

  const sleeve = bareArms ? skin : top;
  // Manga curta termina no meio do braço; manga comprida vai ao punho.
  const shortSleeve = outfit === 'casual' || outfit === 'praia';
  const lowerArmColor = longSleeves ? top : skin;
  const upperArmColor = shortSleeve ? sleeve : sleeve;
  const midArmColor = shortSleeve ? skin : sleeve;

  const r = m.armTop;
  const control: Ctl[] = [
    // O topo do deltoide nasce **dentro** do trapézio, puxado para o
    // eixo do corpo; é o que fecha a axila. Daí para baixo o perfil
    // volta ao eixo do osso.
    { y: shoulderY + 0.028, rx: r * 0.66, rz: r * 0.68, x: x - side * 0.032, color: upperArmColor, bone: Bone.Torso },
    { y: shoulderY + 0.004, rx: r * 0.98, rz: r * 0.98, x: x - side * 0.014, color: upperArmColor, bone: Bone.Torso },
    { y: shoulderY - 0.032, rx: r * 1.07, rz: r * 1.03, x, color: upperArmColor, bone: armBone },
    { y: shoulderY - 0.085, rx: r * 0.95, rz: r * 0.95, x, color: upperArmColor, bone: armBone },
    { y: (shoulderY + elbowY) * 0.5, rx: r * 0.87, rz: r * 0.88, x, color: midArmColor, bone: armBone },
    { y: elbowY + 0.07, rx: r * 0.79, rz: r * 0.81, x, color: midArmColor, bone: armBone },
    // A rampa do cotovelo: cinco anéis dividindo o peso entre os dois
    // ossos. Quanto mais larga a rampa, mais a dobra vira curva — e é
    // aqui, não na contagem de polígonos, que mora a diferença entre
    // carne e dobradiça.
    { y: elbowY + 0.035, rx: r * 0.77, rz: r * 0.79, x, color: midArmColor, bone: armBone, bone2: foreBone, blend: 0.18 },
    { y: elbowY, rx: r * 0.76, rz: r * 0.78, x, color: lowerArmColor, bone: armBone, bone2: foreBone, blend: 0.5 },
    { y: elbowY - 0.035, rx: r * 0.78, rz: r * 0.8, x, color: lowerArmColor, bone: armBone, bone2: foreBone, blend: 0.82 },
    { y: elbowY - 0.07, rx: r * 0.8, rz: r * 0.82, x, color: lowerArmColor, bone: foreBone },
    { y: elbowY - 0.13, rx: r * 0.68, rz: r * 0.7, x, color: lowerArmColor, bone: foreBone },
    { y: wristY + 0.015, rx: m.armWrist * 1.02, rz: m.armWrist * 1.06, x, color: skin, bone: foreBone },
    // A mão: fina de lado, larga de frente, como uma mão parada ao lado do corpo.
    { y: wristY - 0.025, rx: m.armWrist * 0.92, rz: m.armWrist * 1.38, x, color: skin, bone: foreBone },
    { y: wristY - 0.065, rx: m.armWrist * 0.88, rz: m.armWrist * 1.52, x, color: skin, bone: foreBone },
    { y: wristY - 0.105, rx: m.armWrist * 0.78, rz: m.armWrist * 1.4, x, color: skin, bone: foreBone },
    { y: wristY - 0.135, rx: m.armWrist * 0.6, rz: m.armWrist * 1.05, x, color: skin, bone: foreBone },
  ];

  b.loft(subdivideProfile(toStations(control), detail.steps), {
    segments: detail.segments,
    descending: true,
    capTop: 0.018,
    capBottom: 0.022,
    capRings: 2,
  });

  // O polegar, puxado da própria palma.
  b.feature([x - side * m.armWrist * 0.7, wristY - 0.052, m.armWrist * 0.5], [0.028, 0.034, 0.03], 0.016, [-side * 0.8, -0.2, 0.55]);
  // Dois sulcos rasos entre os dedos.
  if (detail.segments >= 14) {
    b.feature([x, wristY - 0.115, m.armWrist * 0.35], [0.03, 0.022, 0.016], -0.006, [0, 0, 1]);
    b.feature([x, wristY - 0.115, -m.armWrist * 0.2], [0.03, 0.022, 0.016], -0.005, [0, 0, -1]);
  }

  if (longSleeves) {
    const cuff = new THREE.TorusGeometry(m.armWrist * 1.16, 0.011, 5, Math.max(10, detail.segments));
    b.addGeometry(cuff, { color: accent, skin: { bone: foreBone } }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, wristY + 0.03, 0));
  }
  if (shortSleeve) {
    const hem = new THREE.TorusGeometry(r * 0.94, 0.009, 5, Math.max(10, detail.segments));
    b.addGeometry(hem, { color: shade(top, -0.14), skin: { bone: armBone } }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, (shoulderY + elbowY) * 0.5, 0));
  }
}

/* -------------------------------- perna ---------------------------------- */

interface LegCtx {
  m: BodyMetrics;
  detail: BodyDetail;
  skin: Hex;
  bottom: Hex;
  shoe: Hex;
  longPants: boolean;
  bareLegs: boolean;
  outfit: string;
  origins: ReturnType<typeof morphOrigins>;
}

/**
 * Coxa, joelho, panturrilha, tornozelo e pé.
 *
 * A panturrilha é o detalhe que mais paga: sem ela a perna é um cone e
 * o personagem parece de plástico, por mais polígonos que tenha.
 */
function buildLeg(b: SurfaceBuilder, side: 1 | -1, ctx: LegCtx): void {
  const { m, detail, skin, bottom, shoe, longPants, bareLegs, outfit, origins } = ctx;
  const thighBone = side > 0 ? Bone.ThighL : Bone.ThighR;
  const shinBone = side > 0 ? Bone.ShinL : Bone.ShinR;
  const thighOrigin = side > 0 ? origins.thighL : origins.thighR;
  const x = side * m.legX;
  const hipY = -0.02;
  const kneeY = hipY - m.thigh;
  const ankleY = kneeY - m.shin;

  const thighColor = bareLegs ? skin : bottom;
  const shortPants = !longPants && !bareLegs;
  const kneeColor = longPants ? bottom : skin;
  const r = m.legTop;

  const control: Ctl[] = [
    { y: hipY + 0.05, rx: r * 0.98, rz: r * 0.96, x, color: thighColor, bone: Bone.Hips, zone: MorphZone.Thigh, origin: thighOrigin },
    { y: hipY - 0.02, rx: r * 1.02, rz: r, x, color: thighColor, bone: thighBone, zone: MorphZone.Thigh, origin: thighOrigin },
    { y: hipY - 0.1, rx: r * 0.96, rz: r * 0.95, x, color: thighColor, bone: thighBone, zone: MorphZone.Thigh, origin: thighOrigin },
    { y: (hipY + kneeY) * 0.5, rx: r * 0.86, rz: r * 0.86, x, color: shortPants ? thighColor : thighColor, bone: thighBone },
    { y: kneeY + 0.1, rx: r * 0.78, rz: r * 0.78, x, color: shortPants ? skin : thighColor, bone: thighBone },
    { y: kneeY + 0.055, rx: r * 0.735, rz: r * 0.755, x, color: kneeColor, bone: thighBone },
    // A mesma rampa do cotovelo, no joelho.
    { y: kneeY + 0.028, rx: r * 0.725, rz: r * 0.745, x, color: kneeColor, bone: thighBone, bone2: shinBone, blend: 0.2 },
    { y: kneeY, rx: r * 0.72, rz: r * 0.74, x, color: kneeColor, bone: thighBone, bone2: shinBone, blend: 0.5 },
    { y: kneeY - 0.03, rx: r * 0.73, rz: r * 0.73, rzBack: r * 0.78, x, color: kneeColor, bone: thighBone, bone2: shinBone, blend: 0.82 },
    // Panturrilha: o ventre do músculo fica atrás e um pouco abaixo do joelho.
    { y: kneeY - 0.085, rx: r * 0.76, rz: r * 0.7, rzBack: r * 0.86, x, color: kneeColor, bone: shinBone },
    { y: kneeY - 0.17, rx: r * 0.66, rz: r * 0.62, rzBack: r * 0.7, x, color: kneeColor, bone: shinBone },
    { y: ankleY + 0.055, rx: m.legAnkle * 1.12, rz: m.legAnkle * 1.1, x, color: kneeColor, bone: shinBone },
    { y: ankleY + 0.015, rx: m.legAnkle, rz: m.legAnkle * 1.05, x, color: shoe, bone: shinBone },
    // O pé, puxado para a frente enquanto desce.
    { y: ankleY - 0.025, rx: m.legAnkle * 1.12, rz: m.legAnkle * 1.75, z: 0.022, x, color: shoe, bone: shinBone },
    { y: ankleY - 0.05, rx: m.legAnkle * 1.18, rz: m.legAnkle * 2.5, z: 0.045, x, color: shoe, bone: shinBone },
  ];

  b.loft(subdivideProfile(toStations(control), detail.steps), {
    segments: detail.segments,
    descending: true,
    capTop: 0.03,
    capBottom: 0.018,
    capRings: 2,
  });

  // A sola: um plano, porque o personagem pisa nele.
  b.flattenBelow(ankleY - 0.062, [x, ankleY - 0.05, 0.045], 0.2);
  // O calcanhar, que o perfil sozinho não dá.
  b.feature([x, ankleY - 0.03, -m.legAnkle * 0.9], [0.05, 0.045, 0.04], 0.014, [0, 0, -1]);

  if (outfit !== 'praia') {
    // O cabedal do calçado, um degrau de cor sobre o mesmo volume.
    b.feature([x, ankleY - 0.012, m.legAnkle * 1.2], [0.055, 0.03, 0.06], 0.004, [0, 0, 1]);
  }
  void skin;
}

/* -------------------------------- cabeça --------------------------------- */

/**
 * Crânio, maxilar, nariz, orelhas e olhos.
 *
 * O crânio é uma varredura com perfil próprio — largo nas têmporas,
 * estreito no queixo, mais fundo atrás que na frente. O nariz e o
 * queixo **não** são peças coladas: são empurrões na superfície que já
 * existe, o que resolve o problema de "esferas presas no rosto" na
 * origem, e não escondendo a emenda.
 *
 * Os olhos são bolas de verdade, assentadas em órbitas escavadas na
 * mesma malha. Um olho é um objeto separado num rosto real também; o
 * que faz parecer colado é não haver órbita.
 */
function buildHead(b: SurfaceBuilder, a: AvatarAppearance, p: BodyProportions, m: BodyMetrics, detail: BodyDetail): void {
  const skin = a.skin;
  const headJointY = m.waist + m.neckY;
  const cy = headJointY + HEAD_CENTER * p.headSize;
  const R = m.headR;
  // 0 = rosto alongado e queixo estreito; 1 = rosto redondo.
  const round = p.faceShape;
  const jaw = 0.56 + round * 0.22;
  const tall = 1.06 - round * 0.1;

  const control: Ctl[] = [
    { y: cy - 0.175 * tall, rx: R * 0.3 * jaw * 1.4, rz: R * 0.44, rzBack: R * 0.3, color: skin, bone: Bone.Head },
    { y: cy - 0.145 * tall, rx: R * jaw * 0.82, rz: R * 0.68, rzBack: R * 0.52, color: skin, bone: Bone.Head },
    { y: cy - 0.1 * tall, rx: R * jaw * 1.18, rz: R * 0.86, rzBack: R * 0.78, color: skin, bone: Bone.Head },
    { y: cy - 0.055 * tall, rx: R * 0.9, rz: R * 0.95, rzBack: R * 0.92, color: skin, bone: Bone.Head },
    { y: cy - 0.005 * tall, rx: R * 0.99, rz: R * 0.99, rzBack: R * 0.99, color: skin, bone: Bone.Head },
    { y: cy + 0.045 * tall, rx: R, rz: R * 0.97, rzBack: R * 1.02, color: skin, bone: Bone.Head },
    { y: cy + 0.095 * tall, rx: R * 0.94, rz: R * 0.88, rzBack: R * 1.0, color: skin, bone: Bone.Head },
    { y: cy + 0.14 * tall, rx: R * 0.8, rz: R * 0.74, rzBack: R * 0.86, color: skin, bone: Bone.Head },
    { y: cy + 0.172 * tall, rx: R * 0.56, rz: R * 0.52, rzBack: R * 0.6, color: skin, bone: Bone.Head },
  ];

  b.loft(subdivideProfile(toStations(control), Math.max(1, Math.round(detail.headRings / control.length) + 1)), {
    segments: detail.segments,
    capTop: R * 0.3,
    capBottom: R * 0.14,
    capRings: 2,
  });

  const eyeY = cy + 0.022;
  const eyeX = R * 0.37;
  const eyeZ = R * 0.78;

  // Órbitas: a superfície afunda onde o olho vai sentar. Sem isto o
  // olho fica pousado na bochecha, que é a cara de boneco de feira.
  for (const side of [-1, 1]) {
    b.feature([side * eyeX, eyeY, eyeZ], [R * 0.3, R * 0.2, R * 0.3], -R * 0.1, [0, 0, 1]);
  }
  // Nariz: puxado da testa para baixo, estreito, com a ponta curta.
  b.feature([0, cy + 0.012, R * 0.9], [R * 0.17, R * 0.3, R * 0.4], R * 0.17, [0, 0, 1]);
  b.feature([0, cy - 0.022, R * 0.92], [R * 0.2, R * 0.12, R * 0.35], R * 0.07, [0, 0, 1]);
  // Arco da sobrancelha.
  b.feature([0, cy + 0.058, R * 0.82], [R * 0.75, R * 0.1, R * 0.4], R * 0.045, [0, 0, 1]);
  // Queixo e maçãs do rosto.
  b.feature([0, cy - 0.125 * tall, R * 0.55], [R * 0.3, R * 0.14, R * 0.3], R * 0.08, [0, 0.1, 1]);
  for (const side of [-1, 1]) {
    b.feature([side * R * 0.62, cy - 0.045, R * 0.6], [R * 0.3, R * 0.22, R * 0.35], R * 0.05);
  }
  // Lábio superior, um degrau raso.
  b.feature([0, cy - 0.072, R * 0.82], [R * 0.3, R * 0.07, R * 0.3], R * 0.035, [0, 0, 1]);

  // Orelhas: varredura própria, rente ao crânio, achatada em x.
  for (const side of [-1, 1]) {
    const ex = side * R * 0.9;
    const ear: Ctl[] = [
      { y: cy - 0.042, rx: R * 0.06, rz: R * 0.11, x: ex, z: -R * 0.08, color: skin, bone: Bone.Head },
      { y: cy - 0.018, rx: R * 0.075, rz: R * 0.17, x: ex + side * R * 0.05, z: -R * 0.07, color: skin, bone: Bone.Head },
      { y: cy + 0.015, rx: R * 0.07, rz: R * 0.16, x: ex + side * R * 0.05, z: -R * 0.05, color: skin, bone: Bone.Head },
      { y: cy + 0.04, rx: R * 0.045, rz: R * 0.1, x: ex + side * R * 0.02, z: -R * 0.04, color: skin, bone: Bone.Head },
    ];
    b.loft(subdivideProfile(toStations(ear), 2), { segments: Math.max(8, Math.round(detail.segments * 0.6)), capTop: R * 0.03, capBottom: R * 0.03, capRings: 1 });
  }

  // Olhos: esclera, íris e pupila, assentados na órbita.
  const eyeRings = detail.segments >= 14 ? 7 : 5;
  for (const side of [-1, 1]) {
    const ex = side * eyeX;
    b.ball([ex, eyeY, eyeZ - R * 0.07], [R * 0.17, R * 0.2, R * 0.15], { color: 0xfdfdff, skin: { bone: Bone.Head } }, eyeRings);
    b.ball([ex, eyeY - R * 0.01, eyeZ + R * 0.04], [R * 0.11, R * 0.13, R * 0.07], { color: a.eyeColor, skin: { bone: Bone.Head } }, eyeRings);
    b.ball([ex, eyeY - R * 0.015, eyeZ + R * 0.08], [R * 0.055, R * 0.065, R * 0.04], { color: 0x14161c, skin: { bone: Bone.Head } }, 5);
    b.ball([ex + R * 0.05, eyeY + R * 0.07, eyeZ + R * 0.08], [R * 0.032, R * 0.032, R * 0.025], { color: 0xffffff, skin: { bone: Bone.Head } }, 4);
  }

  // Um toque de cor nas maçãs, que é metade da identidade Frutiger Aero.
  const blush = new THREE.Color(skin).lerp(new THREE.Color(0xff8fa8), 0.34).getHex();
  for (const side of [-1, 1]) {
    b.ball([side * R * 0.66, cy - 0.055, R * 0.66], [R * 0.17, R * 0.1, R * 0.05], { color: blush, skin: { bone: Bone.Head } }, 5);
  }

  buildHair(b, a, m, detail, cy, R);
  buildAccessory(b, a, m, detail, cy, R);
}

/* --------------------------- cabelo e acessório --------------------------- */

/**
 * O cabelo, como casca contínua em vez de bolas empilhadas.
 *
 * A base é sempre a mesma calota varrida sobre o crânio; o estilo
 * acrescenta volume. A calota segue o perfil da cabeça com uma folga
 * de poucos milímetros, então não há aquele vão entre o cabelo e a
 * testa que denuncia duas malhas diferentes.
 */
function buildHair(b: SurfaceBuilder, a: AvatarAppearance, m: BodyMetrics, detail: BodyDetail, cy: number, R: number): void {
  if (a.hairStyle === 'careca') return;
  const hair = a.hairColor;
  const dark = shade(hair, -0.18);
  const segments = detail.segments;
  const gap = 1.045;

  // Calota: cobre da nuca ao alto, deixando a testa livre na frente.
  const cap: Ctl[] = [
    { y: cy + 0.02, rx: R * 1.0 * gap, rz: R * 0.5, rzBack: R * 1.02 * gap, color: hair, bone: Bone.Head },
    { y: cy + 0.062, rx: R * 1.01 * gap, rz: R * 0.86 * gap, rzBack: R * 1.04 * gap, color: hair, bone: Bone.Head },
    { y: cy + 0.1, rx: R * 0.96 * gap, rz: R * 0.92 * gap, rzBack: R * 1.02 * gap, color: hair, bone: Bone.Head },
    { y: cy + 0.142, rx: R * 0.83 * gap, rz: R * 0.78 * gap, rzBack: R * 0.89 * gap, color: hair, bone: Bone.Head },
    { y: cy + 0.176, rx: R * 0.58 * gap, rz: R * 0.55 * gap, rzBack: R * 0.63 * gap, color: hair, bone: Bone.Head },
  ];
  b.loft(subdivideProfile(toStations(cap), detail.steps), { segments, capTop: R * 0.3, capRings: 2 });

  // Franja: uma aba que desce sobre a testa, na própria casca.
  b.feature([0, cy + 0.075, R * 0.95], [R * 0.9, R * 0.08, R * 0.5], R * 0.08, [0, -0.35, 1]);

  switch (a.hairStyle) {
    case 'longo': {
      const fall: Ctl[] = [
        { y: cy - 0.26, rx: R * 0.86, rz: R * 0.16, rzBack: R * 0.62, z: -R * 0.3, color: dark, bone: Bone.Head },
        { y: cy - 0.16, rx: R * 1.0, rz: R * 0.22, rzBack: R * 0.78, z: -R * 0.26, color: hair, bone: Bone.Head },
        { y: cy - 0.05, rx: R * 1.06, rz: R * 0.36, rzBack: R * 0.95, z: -R * 0.18, color: hair, bone: Bone.Head },
        { y: cy + 0.04, rx: R * 1.06, rz: R * 0.52, rzBack: R * 1.04, z: -R * 0.1, color: hair, bone: Bone.Head },
      ];
      b.loft(subdivideProfile(toStations(fall), detail.steps), { segments, capBottom: R * 0.14, capRings: 2 });
      break;
    }
    case 'rabo': {
      const tail: Ctl[] = [
        { y: cy - 0.17, rx: R * 0.1, rz: R * 0.1, z: -R * 1.42, color: dark, bone: Bone.Head },
        { y: cy - 0.08, rx: R * 0.21, rz: R * 0.21, z: -R * 1.5, color: hair, bone: Bone.Head },
        { y: cy + 0.03, rx: R * 0.26, rz: R * 0.26, z: -R * 1.32, color: hair, bone: Bone.Head },
        { y: cy + 0.075, rx: R * 0.22, rz: R * 0.22, z: -R * 1.05, color: hair, bone: Bone.Head },
      ];
      b.loft(subdivideProfile(toStations(tail), detail.steps), { segments: Math.max(8, Math.round(segments * 0.7)), capTop: R * 0.1, capBottom: R * 0.16, capRings: 2 });
      break;
    }
    case 'coque': {
      b.ball([0, cy + 0.215, -R * 0.42], [R * 0.44, R * 0.4, R * 0.44], { color: hair, skin: { bone: Bone.Head } }, 7);
      b.ball([0, cy + 0.16, -R * 0.82], [R * 0.13, R * 0.13, R * 0.13], { color: dark, skin: { bone: Bone.Head } }, 5);
      break;
    }
    case 'cacheado': {
      const n = detail.segments >= 14 ? 12 : 8;
      for (let i = 0; i < n; i += 1) {
        const angle = (i / n) * TAU;
        const high = i % 2 === 0;
        const r = high ? R * 0.72 : R * 0.98;
        const y = cy + (high ? 0.13 : 0.02);
        const z = Math.cos(angle) * r - R * 0.15;
        if (z > R * 0.5 && !high) continue;
        b.ball([Math.sin(angle) * r, y, z], [R * 0.4, R * 0.38, R * 0.4], { color: i % 3 === 0 ? dark : hair, skin: { bone: Bone.Head } }, 5);
      }
      break;
    }
    case 'espetado': {
      const spikes: [number, number, number, number, number][] = [
        [0, 0.2, 0.04, 0.5, 0],
        [-0.08, 0.18, -0.01, 0.1, 0.5],
        [0.08, 0.18, -0.01, 0.1, -0.5],
        [0, 0.19, -0.08, -0.5, 0],
        [-0.1, 0.12, -0.1, -0.7, 0.7],
        [0.1, 0.12, -0.1, -0.7, -0.7],
      ];
      for (const [sx, sy, sz, rx, rz] of spikes) {
        const cone = new THREE.ConeGeometry(0.05, 0.16, Math.max(6, Math.round(segments * 0.4)));
        const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz, 'YXZ')).setPosition(sx, cy + sy, sz);
        b.addGeometry(cone, { color: hair, skin: { bone: Bone.Head } }, matrix);
      }
      break;
    }
    default:
      break;
  }
  void m;
}

function buildAccessory(b: SurfaceBuilder, a: AvatarAppearance, m: BodyMetrics, detail: BodyDetail, cy: number, R: number): void {
  const head: SkinBinding = { bone: Bone.Head };
  const segs = Math.max(8, Math.round(detail.segments * 0.8));
  switch (a.accessory) {
    case 'oculos': {
      for (const side of [-1, 1]) {
        const ring = new THREE.TorusGeometry(R * 0.26, 0.006, 6, segs);
        b.addGeometry(ring, { color: 0x24323f, skin: head }, new THREE.Matrix4().makeTranslation(side * R * 0.37, cy + 0.022, R * 0.95));
        b.ball([side * R * 0.37, cy + 0.022, R * 0.93], [R * 0.24, R * 0.24, R * 0.012], { color: 0xbfeaff, skin: head }, 5);
      }
      b.addGeometry(new THREE.BoxGeometry(R * 0.26, 0.007, 0.007), { color: 0x24323f, skin: head }, new THREE.Matrix4().makeTranslation(0, cy + 0.028, R * 0.97));
      break;
    }
    case 'fones': {
      const band = new THREE.TorusGeometry(R * 1.14, 0.014, 6, segs, Math.PI);
      b.addGeometry(band, { color: 0xf7fbff, skin: head }, new THREE.Matrix4().makeTranslation(0, cy + 0.015, 0));
      for (const side of [-1, 1]) {
        const cup = new THREE.CylinderGeometry(R * 0.34, R * 0.34, 0.042, segs);
        b.addGeometry(cup, { color: 0x29c8ff, skin: head }, new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(side * R * 1.08, cy + 0.01, 0));
      }
      break;
    }
    case 'chapeu': {
      b.addGeometry(new THREE.CylinderGeometry(R * 1.68, R * 1.74, 0.016, segs), { color: 0xf3ead6, skin: head }, new THREE.Matrix4().makeRotationX(-0.1).setPosition(0, cy + 0.14, -0.005));
      b.addGeometry(new THREE.CylinderGeometry(R * 0.78, R * 0.96, 0.12, segs), { color: 0xf3ead6, skin: head }, new THREE.Matrix4().makeRotationX(-0.1).setPosition(0, cy + 0.205, -0.012));
      b.addGeometry(new THREE.CylinderGeometry(R * 0.98, R * 0.99, 0.032, segs), { color: a.topColor, skin: head }, new THREE.Matrix4().makeRotationX(-0.1).setPosition(0, cy + 0.165, -0.008));
      break;
    }
    case 'flor': {
      const fx = R * 0.78;
      const fy = cy + 0.12;
      const fz = R * 0.48;
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * TAU;
        b.ball([fx + Math.cos(angle) * R * 0.19, fy + Math.sin(angle) * R * 0.19, fz], [R * 0.15, R * 0.15, R * 0.08], { color: 0xff8fc0, skin: head }, 5);
      }
      b.ball([fx, fy, fz + R * 0.05], [R * 0.11, R * 0.11, R * 0.08], { color: 0xffd84a, skin: head }, 4);
      break;
    }
    default:
      break;
  }
  void m;
}
