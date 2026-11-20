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
import { TAU, smoothstep } from '../../utils/math';
import type { AvatarAppearance } from '../AvatarAppearance';
import type { BodyProportions } from './BodyProportions';
import { Bone, type BodyDetail, type BodyMetrics, FACE, Finish, type FinishId, HEAD_CENTER, SKIRT_BREAK_Y, SKIRT_FOLLOW_WALK, SKIRT_HEM_QUADRANTS, SKIRT_QUADRANTS, morphOrigins } from './BodyRig';
import { type FollowSpec, type SkinBinding, type Station, SurfaceBuilder, subdivideProfile } from './BodySurface';

type Hex = THREE.ColorRepresentation;

function shade(color: Hex, amount: number): number {
  const c = new THREE.Color(color);
  return c.lerp(new THREE.Color(amount >= 0 ? 0xffffff : 0x000000), Math.abs(amount)).getHex();
}

/**
 * Mistura duas cores — o degradê que `shade` não sabe fazer.
 *
 * `shade` só anda na direção do branco ou do preto, e isso bastou
 * enquanto os degradês eram de **valor**: a ponta clara da Cascata, a
 * lapela do decote. O cabelo da Nexara é um degradê de **matiz**,
 * de branco a lavanda, e para esse não há como clarear nem escurecer
 * — um cabelo que já nasce quase branco não tem para onde clarear.
 */
function tint(color: Hex, target: Hex, amount: number): number {
  return new THREE.Color(color).lerp(new THREE.Color(target), amount).getHex();
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
  /** Acabamento (`Finish`). Omitido, vale o do construtor. */
  finish?: number;
  bone: number;
  /** Osso secundário, para descrever a rampa de uma articulação. */
  bone2?: number;
  /** Fração do peso que vai para `bone2`. */
  blend?: number;
  zone?: number;
  origin?: readonly [number, number, number];
  follow?: FollowSpec;
}

/**
 * Marca cada estação de uma varredura com o seu acabamento, a partir
 * da cor que ela já declara.
 *
 * O braço vai da manga ao pulso nu e à mão numa varredura só, e a
 * perna da calça ao tênis. Quem monta já escolheu `skin`, `shoe` ou a
 * cor da roupa para cada anel; isto só traduz essa escolha, em vez de
 * repetir o acabamento em trinta estações à mão.
 */
function withFinish(control: Ctl[], skin: Hex, shoe?: Hex, cloth: FinishId = Finish.Cloth): Ctl[] {
  for (const c of control) {
    c.finish = c.color === skin ? Finish.Skin : shoe !== undefined && c.color === shoe ? Finish.Rubber : cloth;
  }
  return control;
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
    finish: c.finish,
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

  // O Manto Aurora: vestido longo de mangas compridas em vidro
  // líquido. É o traje da Luma na arte oficial — gola alta, cauda, e
  // um acabamento que não é pano.
  const aurora = outfit === 'aurora';
  // O Vestido Docente, da Suki-Chan: vestido longo, decote em V e
  // manga três-quartos.
  //
  // A manga não custa uma linha de geometria. Quem não está em
  // `shortSleeve` veste o braço até o cotovelo; quem não está em
  // `longSleeves` deixa o antebraço nu. Estar fora das duas listas
  // **é** a manga três-quartos — a tabela de cores do braço já
  // sabia descrevê-la, faltava alguém pedir.
  const docente = outfit === 'docente';
  // O Traje Rede, da Nexara: macacão branco de gola alta, ombreiras
  // de vidro e um véu holográfico curto. Veste o corpo inteiro —
  // manga comprida e perna comprida —, que é o que faz um macacão
  // ser um macacão e não um conjunto.
  const rede = outfit === 'rede';
  const longSleeves = outfit === 'aero' || aurora || rede;
  const bareArms = outfit === 'esportivo' || outfit === 'vestido';
  const longPants = outfit === 'casual' || outfit === 'aero' || rede;
  const bareLegs = outfit === 'vestido' || docente;
  const dress = outfit === 'vestido' || aurora || docente;
  // Dois acabamentos, e a diferença entre eles é deliberada.
  //
  // `cloth` é o que vale para o que se **acrescenta** por cima do
  // corpo — a gola, a faixa, a saia. `suit` é o que as varreduras do
  // tronco, dos braços e das pernas pintam onde há pano.
  //
  // Eles divergem no Manto Aurora, e divergem de propósito: o manto
  // é de vidro líquido na saia e na gola desde a remasterização da
  // Luma, e o corpo dele é pano. Mudar isso agora mudaria a Luma,
  // que está pronta e integrada. O Traje Rede é de vidro nos dois,
  // porque é um macacão inteiriço e não um vestido sobre um corpo.
  const cloth: FinishId = aurora || rede ? Finish.Glass : Finish.Cloth;
  const suit: FinishId = rede ? Finish.Glass : Finish.Cloth;

  // Cada parte declara o seu acabamento antes de ser varrida.
  b.surface = cloth;
  buildTorso(b, { m, detail, skin, top, bottom, accent, outfit, dress, origins, suit });
  for (const side of [1, -1] as const) {
    buildArm(b, side, { m, detail, skin, top, accent, longSleeves, bareArms, outfit, cloth, suit });
    buildLeg(b, side, { m, detail, skin, bottom, shoe, longPants, bareLegs, outfit, origins, suit });
  }
  b.surface = Finish.Skin;
  buildHead(b, a, p, m, detail);
  // Onde a saia começa no buffer: é assim que um teste separa o tecido
  // do corpo sem adivinhar por cor ou por raio.
  const skirtStart = b.vertexCount;
  b.surface = cloth;
  // A barra longa é a mesma do Manto Aurora: abaixo de `GOWN_HEM_Y` a
  // saia deixa de abrir como cone e vira coluna, que é o que separa
  // um vestido longo de uma tenda.
  if (dress) buildSkirt(b, m, detail, top, origins, aurora || docente ? GOWN_HEM_Y : SKIRT_HEM_Y);

  // A oclusão é a última coisa antes de fechar a malha: ela precisa do
  // corpo inteiro montado para saber o que esconde o quê. É daqui que
  // sai a sombra na órbita, sob o queixo, na dobra do pescoço, entre
  // as pernas e por baixo da saia.
  if (detail.occlusion > 0) b.occlude(m.headR * 0.55, 2.4 * detail.occlusion, 0.38);

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
  /** Acabamento do pano nas varreduras do corpo (ver `buildBodyGeometry`). */
  suit: FinishId;
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

  b.loft(subdivideProfile(toStations(withFinish(control, skin, undefined, ctx.suit)), detail.steps), {
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

  if (outfit === 'aurora' || outfit === 'rede') {
    // Gola alta: o manto fecha no pescoço, como na arte oficial. Sobe
    // pelo próprio pescoço, sem folga, para não flutuar quando a
    // cabeça gira — pertence ao osso da cabeça, como a gola Aero.
    //
    // O Traje Rede usa a mesma gola, e usa de propósito: as duas
    // deusas têm gola alta na arte oficial, e duplicar a peça só
    // para escrever os mesmos seis números outra vez é como nascem
    // as divergências que ninguém revisa.
    const collar: Ctl[] = [
      { y: m.neckY - 0.03, rx: m.neckR * 1.1, rz: m.neckR * 1.1, color: top, bone: Bone.Head },
      { y: m.neckY + 0.025, rx: m.neckR * 1.14, rz: m.neckR * 1.14, color: top, bone: Bone.Head },
      { y: m.neckY + 0.07, rx: m.neckR * 1.2, rz: m.neckR * 1.2, color: shade(top, 0.3), bone: Bone.Head },
    ];
    b.loft(subdivideProfile(toStations(collar), detail.steps), { segments: Math.max(12, detail.segments) });
  }
  if (outfit === 'aurora') {
    // O fecho luminoso que desce do queixo ao peito.
    b.addGeometry(new THREE.BoxGeometry(0.012, 0.17, 0.008), { color: 0x9ff4ff, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeTranslation(0, 0.33, 0.082));
  }
  if (outfit === 'rede') {
    buildNetSuit(b, m, detail, top, bottom, accent, torso, hip);
  }

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
  if (outfit === 'docente') {
    // A faixa que marca a cintura do Vestido Docente, no magenta
    // escuro da ficha. Achatada como o tronco, senão sobra nas
    // pontas e vira barra atravessada na barriga.
    const sash = flatRing(m.waistWidth * 1.07, WAIST_DEPTH, 0.014, Math.max(12, detail.segments));
    b.addGeometry(sash, { color: bottom, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.15, 0));
    buildVNeck(b, m, detail, skin, top, torso);
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
 * As três peças que fazem o Traje Rede ser dela.
 *
 * O macacão em si sai de graça: gola alta emprestada do Manto
 * Aurora, manga e perna compridas pelas listas que já existiam, e o
 * acabamento de vidro líquido no lugar do pano. O que precisa de
 * geometria é o resto.
 *
 *  · **As ombreiras.** Duas placas de vidro pousadas sobre o
 *    deltoide. Pertencem ao tronco, não ao braço: é no tronco que
 *    nasce o alto do deltoide, e uma ombreira que gira com o braço
 *    levantado descola do ombro na hora.
 *  · **A gema da gola.** O fecho luminoso do Manto Aurora desce do
 *    queixo ao peito como uma barra; aqui ele é um ponto só, na
 *    base do pescoço, como na arte oficial.
 *  · **O véu.** Meia casca cônica pendurada dos ombros até os
 *    quadris, aberta na frente. É a peça que exigia o acabamento
 *    novo: um véu que apaga junto com o resto na sombra é um
 *    pedaço de pano claro, não um holograma.
 *
 * O véu **não** é um anel fechado em volta do tronco, e essa foi a
 * primeira ideia a ser descartada: a malha é opaca, e um cilindro
 * completo esconderia o macacão inteiro por baixo de si mesmo. Meia
 * volta e meia — 200 graus — cobre as costas e os flancos e deixa a
 * frente livre, que é como o véu aparece na referência.
 */
function buildNetSuit(
  b: SurfaceBuilder,
  m: BodyMetrics,
  detail: BodyDetail,
  top: Hex,
  bottom: Hex,
  accent: Hex,
  torso: readonly [number, number, number],
  hip: readonly [number, number, number],
): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  const shoulderY = m.waist + m.shoulderY;

  // Ombreiras: largas no eixo do corpo, fundas de frente para trás e
  // baixas — placa, não bola. Vidro de verdade, que é o que a arte
  // oficial mostra e o que o acabamento da Luma já sabia fazer.
  const rings = detail.segments >= 26 ? 7 : detail.segments >= 14 ? 5 : 4;
  for (const side of [1, -1]) {
    // Baixa e larga: **placa**, não bola. A primeira tentativa tinha
    // meio raio de altura e saiu como manga bufante — o ombro ficou
    // com uma bolha em cima, que é o oposto de uma ombreira rígida.
    b.ball(
      [side * m.shoulderX * 0.8, shoulderY + 0.024, -0.004],
      [m.shoulderX * 0.46, 0.03, 0.105],
      { color: shade(top, 0.12), finish: Finish.Glass, ...chest },
      rings,
    );
  }

  // A gema da gola, na base do pescoço.
  b.ball([0, 0.395, 0.088], [0.019, 0.026, 0.014], { color: accent, finish: Finish.Glass, ...chest }, 4);

  // O véu holográfico — e por que ele acabou no quadril.
  //
  // A primeira versão pendurava dos ombros às ancas, que é o que a
  // palavra "véu" sugere. A bancada mostrou por que isso não existe
  // neste corpo: entre os ombros e a cintura, as costas inteiras são
  // cabelo (a queda desce até abaixo da cintura) e os flancos
  // inteiros são braço — medido, o braço ocupa de `x = 0,15` para
  // fora em toda a altura do tronco. Sobra uma faixa de meio
  // centímetro entre a borda do cabelo e a face interna do braço, e
  // meio centímetro de véu não se vê de lugar nenhum. O que se via,
  // na captura, era um lençol branco por cima do cabelo.
  //
  // E não há como resolver por transparência: o avatar inteiro é uma
  // malha opaca com um material só. Véu opaco sobre cabelo opaco
  // significa que um dos dois some — e não vai ser o cabelo.
  //
  // Então o véu desce da cintura e termina logo abaixo da anca:
  // curto, aberto atrás — onde o cabelo passa, sem disputa — e
  // fechado na frente e nos flancos, que é de onde se olha para ela.
  const waistY = 0.165;
  const hemY = -0.085;
  const arc = (215 * Math.PI) / 180;
  const segs = Math.max(10, Math.round(detail.segments * 0.7));
  const veil = new THREE.CylinderGeometry(1, 1.34, waistY - hemY, segs, detail.segments >= 14 ? 2 : 1, true, -arc / 2, arc);
  // Achatado por matriz: o quadril é uma elipse (0,158 de lado por
  // 0,10 de frente), e uma casca circular ou enterra nos flancos ou
  // flutua um palmo à frente da barriga.
  const place = new THREE.Matrix4().makeScale(0.133, 1, 0.1).setPosition(0, (waistY + hemY) * 0.5, 0);
  b.addGeometry(
    veil,
    { color: tint(bottom, accent, 0.58), finish: Finish.Holo, skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip },
    place,
  );
}

/**
 * O decote em V — e por que ele é geometria, e não cor.
 *
 * A cor desta malha é **por anel**: `Ctl.color` pinta a volta
 * inteira do tronco naquela altura. Não existe "pintar só a frente
 * do peito de pele", e foi por isso que o decote não saiu de graça
 * como a manga saiu.
 *
 * Então o V é posto por cima: duas lapelas finas em pano escuro
 * descendo da clavícula ao esterno, e entre elas uma placa de pele
 * que sobressai oito milímetros da superfície do peito. De longe o
 * que se lê são as duas linhas das lapelas, que é como um decote se
 * lê mesmo ao vivo; de perto aparece o vão.
 */
function buildVNeck(b: SurfaceBuilder, m: BodyMetrics, detail: BodyDetail, skin: Hex, top: Hex, torso: readonly [number, number, number]): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  // Largura do vão, no alto. Três tentativas ensinaram que esta é a
  // medida que decide tudo: estreito, o decote deixa de ser decote.
  // Com um terço disto saiu um buraco de fechadura; com dois terços,
  // um laço pregado no peito. Decote em V começa **no ombro**.
  const half = m.chestWidth * 0.46;
  const topY = 0.396;
  const tipY = 0.248;

  // Onde está a frente do peito, **medido** na malha e não deduzido
  // do perfil: o tronco leva um realce em `0,285` que o empurra para
  // a frente, e a elipse do papel fica 6 mm atrás da superfície real.
  // Foi assim que a primeira versão deste painel nasceu enterrada,
  // aparecendo só como duas listras.
  const rzTop = 0.0909;
  const rxTop = 0.175;
  const rzTip = 0.1112;
  const folga = 0.0025;
  const zTop = (x: number): number => rzTop * Math.sqrt(Math.max(0, 1 - (x / rxTop) ** 2)) + folga;

  // O vão é um leque triangular que acompanha a curva do peito. Um
  // triângulo de três pontos afundaria no meio de cada metade,
  // porque o peito é convexo e a aresta de cima seria uma corda.
  const topN = 5;
  const pos: number[] = [];
  for (let i = 0; i < topN; i += 1) {
    const x = ((i / (topN - 1)) * 2 - 1) * half;
    pos.push(x, topY, zTop(x));
  }
  pos.push(0, tipY, rzTip + folga);
  const index: number[] = [];
  for (let i = 0; i < topN - 1; i += 1) index.push(i, topN, i + 1);
  const panel = new THREE.BufferGeometry();
  panel.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  panel.setIndex(index);
  panel.computeVertexNormals();
  // Um grau mais escuro que a pele: o painel é quase plano e recebe
  // a luz de frente inteira, enquanto o peito ao redor é curvo e
  // sombreia. Na mesma cor exata, ele acende e vira babador.
  b.addGeometry(panel, { color: shade(skin, -0.07), finish: Finish.Skin, ...chest });

  // As duas bordas do V, no magenta claro do vestido — escuras,
  // viram a sombra de um rasgo. Elas saem das próprias arestas do
  // painel: uma barra reta em z constante ficaria 3 mm à frente em
  // cima e 17 mm atrás embaixo, que é dizer enterrada na metade de
  // baixo.
  const tip = new THREE.Vector3(0, tipY, rzTip + folga);
  for (const side of [1, -1] as const) {
    const corner = new THREE.Vector3(side * half, topY, zTop(half));
    const dir = tip.clone().sub(corner);
    const bar = new THREE.BoxGeometry(0.014, dir.length(), 0.009);
    const giro = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const meio = corner.clone().add(tip).multiplyScalar(0.5);
    b.addGeometry(bar, { color: shade(top, 0.3), ...chest }, new THREE.Matrix4().makeRotationFromQuaternion(giro).setPosition(meio.x, meio.y, meio.z + 0.003));
  }
  void detail;
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
 * A barra do Manto Aurora, que é um vestido longo.
 *
 * O comprimento não é escolha de gosto: é o que a folga de passada
 * permite. Ela cresce com a distância à junta do quadril, e a peça
 * precisa ser larga o bastante para a coxa balançar dentro dela —
 * medido com a própria conta de `strideRoom`:
 *
 * | barra  | folga exigida |
 * |--------|---------------|
 * | −0,36 (saia curta) | 214 mm |
 * | −0,46 (abaixo do joelho) | 277 mm |
 * | −0,62 (meia canela) | 378 mm |
 * | −0,80 (chão) | 491 mm |
 *
 * A −0,62 o manto precisa abrir 38 cm de cada lado e deixa de ser
 * coluna: vira crinolina. A −0,46 ele custa 6 cm a mais que a saia
 * que já existia, e a silhueta continua reta. O vestido que varre o
 * chão da arte oficial exigiria que a barra acompanhasse a perna
 * (ver o relatório), o que é mudança no contrato da animação.
 */
const GOWN_HEM_Y = -0.46;

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
function skirtClearance(y: number, hemY: number): number {
  const drop = Math.max(0, Math.min(1, (HIP_JOINT_Y - y) / (HIP_JOINT_Y - hemY)));
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
 * Quem move o pano é `poseSkirt`; aqui o valor serve para o inverso —
 * saber quanto do balanço **não** é acompanhado, e portanto quanta
 * folga a forma precisa ter (ver `strideRoom`). Os dois lados têm de
 * ler a mesma constante: se a forma for dimensionada para um peso e
 * o osso girar com outro, sobra coxa de fora exatamente na diferença.
 */
const SKIRT_FOLLOW = SKIRT_FOLLOW_WALK;
const FOLLOW_RAMP = 0.5;

/**
 * Quanto de um anel pertence ao pano, e não ao quadril.
 *
 * Zero na cintura — ali a saia é costura, e costura não se mexe — e
 * um na barra, que é pano solto. O mesmo degradê de sempre; o que
 * mudou é o significado: antes ele dizia *quanto* a saia seguia a
 * coxa, agora diz quanto dela está livre para seguir seja lá o que
 * os ossos do pano fizerem.
 */
function clothShare(y: number, hemY: number): number {
  const drop = Math.max(0, Math.min(1, (HIP_JOINT_Y - y) / (HIP_JOINT_Y - hemY)));
  return drop ** FOLLOW_RAMP;
}

/**
 * A partição entre quadrantes no pior azimute.
 *
 * Em cima da coxa o pano é todo do osso daquele lado e acompanha o
 * balanço inteiro; na diagonal ele é meio a meio com o osso da
 * frente ou o de trás, que na passada não saem do lugar. A forma tem
 * de ser dimensionada pelo pior caso, que é a diagonal — foi lá que
 * a coxa de trás apareceu quando os quadrantes entraram.
 */
const QUADRANT_WORST = 0.5;

/**
 * Quanto do balanço a saia absorve sozinha na altura `y`.
 *
 * `SKIRT_FOLLOW` é o fator que `Avatar` aplica aos ossos do pano ao
 * caminhar; multiplicado pela fração de pano do anel e pela pior
 * partição, dá o quanto aquele anel de fato acompanha a perna — que
 * é o que `strideRoom` precisa saber para reservar o resto na forma.
 */
function followWeight(y: number, hemY: number): number {
  return SKIRT_FOLLOW * QUADRANT_WORST * clothShare(y, hemY);
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
function strideRoom(y: number, hemY: number): number {
  return Math.max(0, HIP_JOINT_Y - y) * STRIDE_TAN * (1 - followWeight(y, hemY));
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
function buildSkirt(b: SurfaceBuilder, m: BodyMetrics, detail: BodyDetail, top: Hex, origins: ReturnType<typeof morphOrigins>, hemY: number): void {
  const hip = origins.hips;
  // Forma desejada: largura da barra e como ela afunila subindo.
  // Quanto a barra abre. A saia curta é um cone (1,9× o quadril); o
  // manto longo é uma coluna — se abrisse na mesma proporção, 26 cm
  // mais abaixo, viraria uma tenda.
  const hemRx = m.hipWidth * (hemY <= GOWN_HEM_Y ? 1.22 : 1.9);
  const want = (y: number): number => {
    const t = Math.max(0, Math.min(1, (y - hemY) / (0.09 - hemY)));
    // Curva suave: a saia abre devagar na cintura e acelera na barra.
    return m.waistWidth * 1.04 + (hemRx - m.waistWidth * 1.04) * (1 - t) ** 1.45;
  };

  // Da barra para cima: a varredura exige `y` crescente, e um perfil
  // escrito ao contrário sai com as normais para dentro — a saia
  // acende cinza, como se estivesse sempre na sombra.
  // As alturas da saia curta, reescaladas para a barra pedida: a
  // parte de cima (o corpete, acima da junta) não se mexe, e só o
  // trecho pendurado estica. Assim o manto longo ganha anéis no
  // comprimento novo em vez de esticar os que já existiam.
  const base = [SKIRT_HEM_Y, -0.28, -0.21, -0.15, -0.1, -0.06, -0.02, 0.02, 0.055, 0.09];
  const stretch = (HIP_JOINT_Y - hemY) / (HIP_JOINT_Y - SKIRT_HEM_Y);
  const heights = base.map((y) => (y < HIP_JOINT_Y ? HIP_JOINT_Y + (y - HIP_JOINT_Y) * stretch : y));
  const control: Ctl[] = heights.map((y, i) => {
    const clear = skirtClearance(y, hemY);

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
    const reach = strideRoom(y, hemY);
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
      color: y <= hemY ? shade(top, -0.1) : top,
      bone: Bone.Hips,
      zone: MorphZone.Curve,
      origin: hip,
      // O peso é só quanto do vértice é saia; **quanto** a saia anda
      // é decisão de quem posa, não da malha (ver `Avatar.applyPose`).
      // Abaixo da quebra o pano pertence à segunda dobradiça. A troca
      // é por anel, e não precisa de mistura: a barra gira em torno
      // da própria quebra, então o anel que está nela não se move e a
      // costura entre as duas fileiras continua fechada.
      follow: { quadrants: y < SKIRT_BREAK_Y ? SKIRT_HEM_QUADRANTS : SKIRT_QUADRANTS, weight: clothShare(y, hemY) },
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
  /** `Finish.Cloth` para pano, `Finish.Glass` para o Manto Aurora. */
  cloth: FinishId;
  /** Acabamento do pano na varredura do braço. */
  suit: FinishId;
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

  b.loft(subdivideProfile(toStations(withFinish(control, skin, undefined, ctx.suit)), detail.steps), {
    segments: detail.segments,
    descending: true,
    capTop: 0.018,
    capBottom: 0.022,
    capRings: 2,
  });

  // Dedos. A mão era uma pá — larga de frente, fina de lado, e sem
  // nada na ponta. De longe não faz diferença; de perto é a primeira
  // coisa que denuncia um modelo cru, porque a mão é a parte do corpo
  // que o olho mais conhece depois do rosto.
  b.surface = Finish.Skin;
  if (detail.segments >= 26) buildFingers(b, side, x, wristY, m, skin, detail, foreBone);
  b.surface = ctx.cloth;

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
  /** Acabamento do pano na varredura da perna. */
  suit: FinishId;
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

  b.loft(subdivideProfile(toStations(withFinish(control, skin, shoe, ctx.suit)), detail.steps), {
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
 * Os quatro dedos e o polegar.
 *
 * Cada dedo é uma varredura curta com três falanges sugeridas pelo
 * perfil — grossa na base, um estreitamento no meio, arredondada na
 * ponta. Eles saem da borda da palma, que é larga em z e fina em x,
 * então se espalham em z e apontam para baixo.
 *
 * Só nos níveis densos: `baixa` e `media` continuam com a pá de
 * antes, que a essa distância é indistinguível e custa um quinto.
 */
function buildFingers(
  b: SurfaceBuilder,
  side: number,
  x: number,
  wristY: number,
  m: BodyMetrics,
  skin: THREE.ColorRepresentation,
  detail: BodyDetail,
  foreBone: number,
): void {
  const w = m.armWrist;
  const palmY = wristY - 0.1;
  const segments = Math.max(6, Math.round(detail.segments * 0.34));

  // Comprimento relativo: indicador, médio, anelar, mínimo.
  const plan: readonly { z: number; length: number; thick: number }[] = [
    { z: 0.82, length: 0.9, thick: 0.95 },
    { z: 0.3, length: 1, thick: 1 },
    { z: -0.26, length: 0.94, thick: 0.95 },
    { z: -0.76, length: 0.78, thick: 0.84 },
  ];

  for (const finger of plan) {
    const fz = finger.z * w * 1.12;
    const r = w * 0.3 * finger.thick;
    const len = 0.062 * finger.length;
    // Leve curvatura para a frente, como uma mão relaxada.
    const curl = 0.1;
    const control: Ctl[] = [
      { y: palmY, rx: r * 1.1, rz: r * 1.12, x, z: fz, color: skin, bone: foreBone },
      { y: palmY - len * 0.36, rx: r, rz: r * 1.02, x, z: fz + len * curl * 0.4, color: skin, bone: foreBone },
      { y: palmY - len * 0.68, rx: r * 0.92, rz: r * 0.94, x, z: fz + len * curl, color: skin, bone: foreBone },
      { y: palmY - len, rx: r * 0.72, rz: r * 0.74, x, z: fz + len * curl * 1.5, color: skin, bone: foreBone },
    ];
    b.loft(subdivideProfile(toStations(control), 2), {
      segments,
      descending: true,
      capTop: r * 0.3,
      capBottom: r * 0.7,
      capRings: 2,
    });
  }

  // Polegar: sai do lado de dentro da palma, mais alto e mais grosso,
  // e aponta para a frente em vez de para baixo.
  const tr = w * 0.36;
  const thumb: Ctl[] = [
    { y: wristY - 0.028, rx: tr * 1.05, rz: tr * 1.05, x: x - side * w * 0.2, z: w * 0.55, color: skin, bone: foreBone },
    { y: wristY - 0.052, rx: tr * 0.98, rz: tr, x: x - side * w * 0.34, z: w * 0.95, color: skin, bone: foreBone },
    { y: wristY - 0.076, rx: tr * 0.84, rz: tr * 0.86, x: x - side * w * 0.42, z: w * 1.3, color: skin, bone: foreBone },
    { y: wristY - 0.094, rx: tr * 0.62, rz: tr * 0.64, x: x - side * w * 0.46, z: w * 1.5, color: skin, bone: foreBone },
  ];
  b.loft(subdivideProfile(toStations(thumb), 2), {
    segments,
    descending: true,
    capTop: tr * 0.3,
    capBottom: tr * 0.7,
    capRings: 2,
  });
}

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

  const eyeY = cy + FACE.eyeY * R;
  const eyeX = FACE.eyeX * R;
  const eyeZ = FACE.eyeZ * R;

  // Órbitas: a superfície afunda onde o olho vai sentar. Sem isto o
  // olho fica pousado na bochecha, que é a cara de boneco de feira.
  // Fundas o bastante para o globo entrar — antes a cova era rasa e o
  // olho ficava proeminente, de boneco assustado.
  for (const side of [-1, 1]) {
    b.feature([side * eyeX, eyeY, eyeZ + R * 0.1], [R * 0.27, R * 0.2, R * 0.3], -R * 0.28, [0, 0, 1]);
    // Canto interno, mais fundo: é o que dá a forma de amêndoa.
    b.feature([side * (eyeX - R * 0.17), eyeY - R * 0.02, eyeZ + R * 0.12], [R * 0.1, R * 0.1, R * 0.2], -R * 0.07, [0, 0, 1]);
  }
  // Nariz: esculpido na própria pele do crânio.
  //
  // Duas tentativas ficaram pelo caminho e vale dizer por quê. Foram
  // quatro gaussianas somadas na casca: uma gaussiana é um morro
  // liso, serve para levantar massa, não para desenhar dorso, ponta e
  // asa. Depois virou uma varredura própria, como a orelha — tinha a
  // forma certa, mas era **outra superfície atravessando esta**, e na
  // base, onde o crânio está em 0,937R e o anel da base chegava a
  // 0,955R, ela furava a pele e deixava uma borda visível sobre o
  // lábio. Afundar o anel esconderia a borda sem resolver nada: as
  // duas superfícies continuariam duas.
  //
  // Agora o nariz é a mesma malha do rosto. A pele é refinada só
  // nesta bola e levantada até um campo de altura com união suave —
  // onde o nariz avança mais que o crânio, a pele sobe; onde ele é
  // mais fundo (a raiz, entre os olhos), nada acontece e o traço
  // acaba sozinho. Não existe junção porque não existem duas peças.
  // Perfil do nariz, tudo em múltiplos do raio da cabeça: altura a
  // partir do centro, meia-largura, meia-profundidade e o centro em
  // z. A frente do traço naquela altura é `z0 + rz`. Em metros
  // absolutos, como estava, o nariz não acompanharia `headSize` — e o
  // resto do rosto (olho em +0,12R, boca em −0,44R) já fala em R.
  // Referência: a frente do crânio aqui está medida em 0,97R, então
  // uma ponta em 1,19R avança um quarto de raio além do plano do
  // rosto, que é o que um nariz faz.
  const noseProfile: readonly (readonly [number, number, number, number])[] = [
    // Abaixo da base o campo mergulha para dentro do crânio: é isso
    // que faz o nariz terminar sem degrau em cima do lábio (−0,44R).
    [-0.41, 0.15, 0.02, 0.78],
    [-0.375, 0.19, 0.055, 0.82],
    [-0.33, 0.215, 0.11, 0.86],
    // Asas: o ponto mais largo.
    [-0.278, 0.235, 0.17, 0.93],
    // Ponta.
    [-0.193, 0.175, 0.22, 0.97],
    // Supraponta: o degrau que separa a ponta do dorso, e que é o que
    // faz um nariz parecer um nariz em vez de um cone.
    [-0.091, 0.12, 0.17, 0.945],
    [0.045, 0.098, 0.135, 0.875],
    // Raiz, logo acima da linha dos olhos. A frente aqui (0,88R) já
    // está atrás do crânio (0,97R), então a união suave não levanta
    // nada e o dorso se dissolve na testa por conta própria.
    [0.17, 0.085, 0.1, 0.78],
  ];
  const noseLow = cy + noseProfile[0][0] * R;
  const noseHigh = cy + noseProfile[noseProfile.length - 1][0] * R;
  const noseHeight = (x: number, y: number): number => {
    if (y < noseLow || y > noseHigh) return -Infinity;
    let k = 0;
    while (k < noseProfile.length - 2 && y > cy + noseProfile[k + 1][0] * R) k += 1;
    const [y0, rx0, rz0, z0] = noseProfile[k];
    const [y1, rx1, rz1, z1] = noseProfile[k + 1];
    const raw = (y - (cy + y0 * R)) / Math.max(1e-6, (y1 - y0) * R);
    // Suavizado entre estações: interpolar reto deixaria uma faixa
    // facetada por estação, que a luz especular denuncia na hora.
    const t = raw * raw * (3 - 2 * raw);
    const rx = (rx0 + (rx1 - rx0) * t) * R;
    const u = Math.abs(x) / rx;
    if (u >= 1) return -Infinity;
    const rz = (rz0 + (rz1 - rz0) * t) * R;
    const z = (z0 + (z1 - z0) * t) * R;
    // Superelipse em vez de círculo: deixa o dorso com topo mais chato
    // e as laterais mais verticais, que é o corte de um nariz.
    return z + rz * Math.pow(1 - Math.pow(u, 2.8), 1 / 2.8);
  };
  const noseCenter: readonly [number, number, number] = [0, cy - 0.02, R * 0.88];
  // O alvo de aresta acompanha o nível, e não é fixo.
  //
  // A primeira versão usava R·0,05 nos quatro níveis, com o argumento
  // de que assim o rosto chegava refinado ao mesmo ponto partindo de
  // malhas diferentes. Como meta de aparência fazia sentido; como
  // orçamento, não: em `baixa` o nariz passava a concentrar 21% dos
  // vértices do corpo inteiro e estourava o teto de malha do nível —
  // um quinto do personagem gasto num traço que, a 55 m de distância
  // de detalhe, ninguém vê. O teste `a malha baixa é mais leve que o
  // avatar antigo inteiro` pegou exatamente isso.
  //
  // Agora o alvo é uma fração do próprio anel do nível: o nariz fica
  // sempre umas três vezes mais fino que o corpo ao redor, e nunca
  // mais fino que R·0,05, que é o que `ultra` precisa para ter asa e
  // dorso. Quem roda em aparelho fraco recebe um nariz grosseiro, que
  // é o certo — é o mesmo lugar onde a mão não tem dedos.
  const noseEdge = Math.max(R * 0.05, ((2 * Math.PI * R) / detail.segments) * 0.38);
  b.refine(noseCenter, R * 0.5, noseEdge, 4);
  // A largura da união decide se o nariz lê como nariz. Em R·0,05 ela
  // era do tamanho da própria ponta (R·0,19) e dissolvia o traço num
  // morro; R·0,018 mantém a continuidade na primeira derivada e ainda
  // deixa a asa e o dorso com contorno.
  b.sculptFront(noseCenter, R * 0.5, noseHeight, R * 0.018);
  for (const side of [-1, 1]) {
    // Narina: um sulco por baixo da asa, não um furo. Furo de verdade
    // exigiria abrir a malha e, à distância de câmera do jogo, não se
    // ganharia nada.
    b.feature([side * R * 0.12, cy - R * 0.345, R * 1.0], [R * 0.05, R * 0.028, R * 0.09], -R * 0.022, [0, -1, 0.3]);
    // Sulco que separa a asa da bochecha.
    b.feature([side * R * 0.26, cy - R * 0.28, R * 0.82], [R * 0.05, R * 0.1, R * 0.18], -R * 0.042, [0, 0, 1]);
    // Filtro: a calha entre a base do nariz e o lábio. Anatomia, não
    // mais o remendo que tapava a borda da varredura antiga.
    b.feature([side * R * 0.05, cy - R * 0.41, R * 0.92], [R * 0.07, R * 0.035, R * 0.14], R * 0.018, [0, 0, 1]);
  }
  // Arco da sobrancelha.
  b.feature([0, cy + 0.058, R * 0.82], [R * 0.75, R * 0.1, R * 0.4], R * 0.045, [0, 0, 1]);
  // Queixo e maçãs do rosto.
  b.feature([0, cy - 0.125 * tall, R * 0.55], [R * 0.3, R * 0.14, R * 0.3], R * 0.08, [0, 0.1, 1]);
  for (const side of [-1, 1]) {
    b.feature([side * R * 0.62, cy - 0.045, R * 0.6], [R * 0.3, R * 0.22, R * 0.35], R * 0.05);
  }

  // Boca: o volume dos lábios vem da própria pele, e não de uma peça
  // colada. O arco vermelho que havia antes era um anel pousado na
  // bochecha; o que faz um lábio é o degrau à volta dele.
  const my = cy + FACE.mouthY * R;
  const mz = FACE.mouthZ * R;
  // Filtro: o sulco entre o nariz e o lábio de cima.
  b.feature([0, my + R * 0.16, mz + R * 0.1], [R * 0.06, R * 0.08, R * 0.2], -R * 0.03, [0, 0, 1]);
  // Lábio superior e inferior, com a linha da boca afundada entre eles.
  b.feature([0, my + R * 0.055, mz + R * 0.06], [R * 0.28, R * 0.055, R * 0.22], R * 0.055, [0, 0, 1]);
  b.feature([0, my - R * 0.075, mz + R * 0.06], [R * 0.26, R * 0.07, R * 0.22], R * 0.06, [0, 0, 1]);
  b.feature([0, my - R * 0.01, mz + R * 0.09], [R * 0.3, R * 0.025, R * 0.2], -R * 0.035, [0, 0, 1]);
  // Sulco sob o lábio de baixo, e os cantos da boca.
  b.feature([0, my - R * 0.17, mz + R * 0.04], [R * 0.16, R * 0.05, R * 0.2], -R * 0.025, [0, 0, 1]);
  for (const side of [-1, 1]) {
    b.feature([side * FACE.mouthHalf * R, my - R * 0.01, mz], [R * 0.06, R * 0.07, R * 0.18], -R * 0.03, [0, 0, 1]);
  }

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

  // Olhos: um globo esférico de verdade, com íris e pupila assentadas
  // na superfície dele. Antes a esclera era mais alta que larga
  // (0,17 × 0,20) e a íris ocupava dois terços da sua largura — um
  // olho que nenhuma pálpebra conseguiria fechar. Agora o globo é
  // redondo, entra na órbita, e quem define a abertura é a pálpebra,
  // que vem de `AvatarFace`.
  const eyeRings = detail.segments >= 30 ? 11 : detail.segments >= 14 ? 8 : 5;
  const ball = FACE.eyeBall * R;
  // O olho é molhado: quase sem rugosidade, e com verniz por cima.
  b.surface = Finish.Eye;
  for (const side of [-1, 1]) {
    const ex = side * eyeX;
    // Olhar levemente convergente, como o de quem olha para a frente.
    const toe = -side * R * 0.006;
    b.ball([ex, eyeY, eyeZ], [ball, ball, ball * 0.94], { color: 0xf6f4f2, skin: { bone: Bone.Head } }, eyeRings);
    b.ball(
      [ex + toe, eyeY, eyeZ + ball * 0.74],
      [FACE.iris * R, FACE.iris * R, ball * 0.3],
      { color: a.eyeColor, skin: { bone: Bone.Head } },
      eyeRings,
    );
    b.ball(
      [ex + toe, eyeY, eyeZ + ball * 0.9],
      [FACE.pupil * R, FACE.pupil * R, ball * 0.16],
      { color: 0x0d0f14, skin: { bone: Bone.Head } },
      Math.max(5, eyeRings - 3),
    );
    // Brilho pequeno, no alto e para dentro — onde o céu bate.
    b.ball(
      [ex + toe - side * R * 0.022, eyeY + R * 0.03, eyeZ + ball * 0.93],
      [FACE.spark * R, FACE.spark * R, ball * 0.1],
      { color: 0xffffff, skin: { bone: Bone.Head } },
      4,
    );
  }

  b.surface = Finish.Skin;
  // Um toque de cor nas maçãs, que é metade da identidade Frutiger Aero
  // — mas pintado, não colado. Eram duas bolas achatadas, e de perfil
  // apareciam como abas rosa saindo da bochecha.
  const blush = new THREE.Color(skin).lerp(new THREE.Color(0xff8fa8), 0.5).getHex();
  for (const side of [-1, 1]) {
    b.paint([side * R * 0.62, cy - 0.08, R * 0.62], [R * 0.3, R * 0.19, R * 0.3], blush, 0.5);
  }
  // Pálpebra e canto do olho um tom abaixo: é sombra própria, e é o
  // que tira o ar de bola pousada no rosto.
  const socket = new THREE.Color(skin).lerp(new THREE.Color(0x6b4433), 0.3).getHex();
  for (const side of [-1, 1]) {
    b.paint([side * eyeX, eyeY + R * 0.11, eyeZ + R * 0.16], [R * 0.21, R * 0.1, R * 0.2], socket, 0.5);
    b.paint([side * (eyeX - R * 0.16), eyeY, eyeZ + R * 0.16], [R * 0.08, R * 0.1, R * 0.18], socket, 0.45);
  }
  // Sombra sob o lábio e nas asas do nariz, pelo mesmo motivo.
  b.paint([0, my - R * 0.15, mz + R * 0.12], [R * 0.18, R * 0.06, R * 0.16], socket, 0.3);
  for (const side of [-1, 1]) {
    b.paint([side * R * 0.25, cy - 0.052, R * 0.8], [R * 0.07, R * 0.1, R * 0.16], socket, 0.35);
  }

  b.surface = Finish.Hair;
  buildHair(b, a, m, detail, cy, R);
  b.surface = Finish.Shine;
  buildAccessory(b, a, m, detail, cy, R);
  b.surface = Finish.Skin;
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
    { y: cy + 0.055, rx: R * 1.0 * gap, rz: R * 0.42, rzBack: R * 1.02 * gap, color: hair, bone: Bone.Head },
    { y: cy + 0.062, rx: R * 1.01 * gap, rz: R * 0.86 * gap, rzBack: R * 1.04 * gap, color: hair, bone: Bone.Head },
    { y: cy + 0.1, rx: R * 0.96 * gap, rz: R * 0.92 * gap, rzBack: R * 1.02 * gap, color: hair, bone: Bone.Head },
    { y: cy + 0.142, rx: R * 0.83 * gap, rz: R * 0.78 * gap, rzBack: R * 0.89 * gap, color: hair, bone: Bone.Head },
    { y: cy + 0.176, rx: R * 0.58 * gap, rz: R * 0.55 * gap, rzBack: R * 0.63 * gap, color: hair, bone: Bone.Head },
  ];
  b.loft(subdivideProfile(toStations(cap), detail.steps), { segments, capTop: R * 0.3, capRings: 2 });

  // Franja: uma aba que desce sobre a testa, na própria casca. Ela
  // existe de propósito e faz parte do penteado — mas descia até a
  // altura dos olhos, e um rosto sem testa não tem onde pôr a
  // sobrancelha. Agora para no terço de cima, como uma franja de
  // verdade.
  b.feature([0, cy + 0.125, R * 0.95], [R * 0.9, R * 0.085, R * 0.5], R * 0.075, [0, -0.3, 1]);

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
    case 'ondulado': {
      // A queda da Luma. Três coisas a separam de `longo`, e nenhuma
      // é o comprimento:
      //
      //  · a seção é funda **atrás** e rasa **na frente**. Os dois
      //    erros opostos já aconteceram: 1,4·R de largura virou aba
      //    de faraó, e 0,8·R de profundidade frontal virou capuz
      //    fechado sobre as bochechas;
      //  · o raio de cada anel ondula ±12%, que é o que faz a
      //    silhueta entrar e sair — a onda tem de estar no contorno,
      //    senão some a três metros;
      //  · as mechas são sulcos esculpidos na própria massa, não
      //    tubos pendurados. Tubo solto ao lado da cabeça lê como
      //    palito, e ainda custa anéis.
      const bottomY = cy - 0.52;
      const topY = cy + 0.045;
      // Os anéis são o custo da onda: sem eles a queda é um cone, com
      // nove ela ondula duas vezes e meia. No nível baixo a onda não
      // sobrevive à resolução de qualquer jeito, e o orçamento manda
      // — a malha baixa não pode pesar mais que o avatar antigo
      // inteiro (6 496 triângulos).
      const rings = detail.segments >= 26 ? 9 : detail.segments >= 14 ? 7 : 4;
      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        const y = bottomY + (topY - bottomY) * t;
        // Cheio no ombro, arredondando na ponta: nem cone, nem tubo.
        const grow = 0.74 + 0.3 * smoothstep(-0.1, 0.8, t) - 0.12 * smoothstep(0.75, 1, t);
        const wave = 1 + Math.sin(t * Math.PI * 2.5 + 0.6) * 0.16;
        fall.push({
          y,
          rx: R * 1.06 * grow * wave,
          rz: R * (0.2 + 0.16 * t) * grow,
          rzBack: R * (1.0 + 0.2 * t) * grow * wave,
          z: -R * 0.24,
          color: i % 2 === 0 ? dark : hair,
          bone: Bone.Head,
        });
      }
      b.loft(subdivideProfile(toStations(fall), detail.steps), { segments, capBottom: R * 0.14, capRings: 2 });

      // Os sulcos entre as mechas: afundam a massa em seis pontos,
      // alternando altura, sem acrescentar um único vértice. É o que
      // dá leitura de fio no contorno e na sombra.
      if (detail.segments >= 14) {
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i += 1) {
            const azimuth = side * (1.15 + i * 0.5);
            const y = cy - 0.34 + i * 0.13;
            const radius = R * 1.0;
            b.feature(
              [Math.sin(azimuth) * radius, y, Math.cos(azimuth) * radius - R * 0.2],
              [R * 0.12, R * 0.3, R * 0.12],
              -R * 0.1,
              [Math.sin(azimuth), 0, Math.cos(azimuth)],
            );
          }
        }
      }
      break;
    }
    case 'cascata': {
      // A queda da Suki-Chan. É o cabelo mais longo do Éden: termina
      // perto da junta do quadril.
      //
      // Quatro coisas foram aprendidas construindo esta peça, todas
      // na bancada e todas a partir de um defeito visto:
      //
      //  · **afunilar o tempo todo**. Cabelo solto é mais largo na
      //    cabeça e vai fechando até a ponta. Inchar no meio e
      //    fechar embaixo desenha uma urna, e foi o que apareceu;
      //  · **fundo na nuca, raso nas costas**. A profundidade tem de
      //    casar com a calota lá em cima, senão sobra um crescente
      //    de occipital entre as duas — a nuca careca da segunda
      //    tentativa. Mais abaixo ela cai, e o cabelo se deita nas
      //    costas em vez de sair como quilha;
      //  · **sulcos pousados na superfície**. Escavar não adianta se
      //    o centro da escavação estiver dentro da massa: o perfil é
      //    calculado por função, e os sulcos leem a mesma função
      //    para saber onde a superfície está naquela altura;
      //  · **nada de mecha solta ao lado do rosto**. Tubo separado
      //    lê como palito pendurado — já custou duas tentativas,
      //    aqui e no cabelo da Luma.
      const topY = cy + 0.045;
      const bottomY = cy - 0.68;
      const rings = segments >= 26 ? 10 : segments >= 14 ? 8 : 4;
      // `t` 0 na ponta, 1 no couro cabeludo — como em `ondulado`.
      // O afunilamento é **contínuo**, sem patamar. Um trecho de
      // largura constante no alto das costas desenha um cilindro, e
      // um cilindro com fundo abaulado é uma urna — foi o que a
      // bancada mostrou nas duas primeiras tentativas.
      const rxOf = (t: number): number => R * (0.62 + 0.46 * t) * (1 - 0.28 * smoothstep(0.1, 0, t));
      const rzBackOf = (t: number): number => R * (0.32 + 0.75 * t);
      const zcOf = (t: number): number => -R * (0.16 + 0.12 * (1 - t));
      const yOf = (t: number): number => bottomY + (topY - bottomY) * t;

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        fall.push({
          y: yOf(t),
          rx: rxOf(t),
          rz: R * 0.18,
          rzBack: rzBackOf(t),
          z: zcOf(t),
          // O degradê vai contínuo em `t` — alternar cor por anel vira
          // zebra — e clareia **para baixo**. Uma massa quase preta
          // de meio metro não tem forma nenhuma: sem variação de
          // valor, a silhueta é tudo o que se vê, e o volume some.
          // As pontas de um cabelo comprido são mesmo as que pegam
          // luz. Treze por cento: com trinta, o preto virava um rabo
          // cinzento e ela deixava de ser morena de cabelo escuro.
          color: shade(hair, 0.13 * (1 - t) ** 1.5),
          bone: Bone.Head,
          bone2: Bone.Torso,
          // Um cabelo deste tamanho não pode girar inteiro com o
          // pescoço: a ponta pertence às costas. A rampa passa o peso
          // para o tronco à medida que desce.
          blend: 0.88 * (1 - smoothstep(cy - 0.6, cy - 0.1, yOf(t))),
        });
      }
      b.loft(subdivideProfile(toStations(fall), detail.steps), { segments, capBottom: R * 0.07, capRings: 2 });

      // Os sulcos entre as mechas, na face de trás — que é a que se
      // vê. Azimute 0 é a FRENTE, então eles moram em torno de π, e
      // cada um é posto no ponto da elipse daquela altura.
      if (detail.segments >= 14) {
        for (const side of [-1, 1]) {
          for (let i = 0; i < 4; i += 1) {
            const az = Math.PI + side * (0.26 + i * 0.36);
            const t = 0.34 + i * 0.13;
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            b.feature(
              [sx * rxOf(t), yOf(t), zcOf(t) + sz * rzBackOf(t)],
              [R * 0.1, R * 0.46, R * 0.1],
              -R * 0.13,
              [sx, 0, sz],
            );
          }
        }
      }

      buildDiadem(b, detail, cy, R);
      break;
    }
    case 'fluxo': {
      // A queda da Nexara. É prima da Cascata e herda dela tudo o
      // que a bancada ensinou — afunilamento contínuo, profundidade
      // casada com a calota na nuca, sulcos pousados na superfície,
      // nenhuma mecha solta. O que a separa são duas coisas, e as
      // duas são a personagem:
      //
      //  · **a massa serpenteia**. O eixo da queda desliza para um
      //    lado no meio das costas e volta na ponta, num S longo.
      //    Cabelo que escorre, não cabelo que pendura — é a leitura
      //    de fluxo que a deusa das redes pede, e sai de um número
      //    por anel, sem um vértice a mais;
      //  · **o degradê é de matiz**. Branco no couro cabeludo,
      //    lavanda na ponta. Clarear não serviria: este cabelo já
      //    nasce quase branco, e não há para onde clarear. É por
      //    isso que existe `tint`.
      //
      // E uma decisão que não é estética: ela para **acima** da
      // Cascata. O cabelo mais longo do Éden é o da Suki-Chan, tem
      // um teste que afirma isso, e remasterizar uma deusa não é
      // motivo para tomar da outra o que já era dela.
      // O topo entra **dentro** da calota, e não encostado nela: a
      // primeira captura mostrou uma linha de couro cabeludo onde as
      // duas peças se encontravam na nuca. Com o cabelo quase branco
      // qualquer fresta acende; com o preto da Suki-Chan a mesma
      // fresta passava despercebida.
      const topY = cy + 0.085;
      const bottomY = cy - 0.62;
      const rings = segments >= 26 ? 10 : segments >= 14 ? 8 : 4;
      const tipColor = 0xc9a2ff;
      const yOf = (t: number): number => bottomY + (topY - bottomY) * t;
      // Largura: afunila o tempo todo, com uma onda rasa por cima —
      // a onda tem de estar no **contorno**, senão some a três metros.
      // A largura tem um **ressalto na altura da orelha**, e ele não é
      // enfeite. A orelha é uma varredura à parte que chega a
      // `1,025·R` — medido, não estimado —, e a primeira versão da
      // queda passava ali com `0,976·R`. O resultado, na captura de
      // costas, eram três triângulos de pele atravessando o cabelo:
      // não uma orelha à mostra, que seria normal, mas a malha da
      // orelha cortada ao meio pela malha do cabelo.
      //
      // No topo o ressalto desaparece de novo, porque ali o que
      // manda é caber **dentro** da calota: uma queda mais larga que
      // a calota deixa o anel de cima à mostra como um degrau.
      const bump = (t: number): number => smoothstep(0.45, 0.85, t);
      const rxOf = (t: number): number =>
        R * (0.62 + 0.22 * t + 0.26 * bump(t)) * (1 - 0.26 * smoothstep(0.1, 0, t)) * (1 + 0.08 * Math.sin(t * Math.PI * 2.4 + 0.5));
      // Fundo na nuca — a profundidade tem de passar atrás do crânio,
      // senão sobra occipital —, e enxuto no último anel, pela mesma
      // razão que a largura.
      const rzBackOf = (t: number): number => R * (0.32 + 0.78 * t);
      // O centro recua enquanto desce: no alto o cabelo está colado à
      // calota (e tem de caber **dentro** dela), mais abaixo ele se
      // afasta e cai pelas costas.
      const zcOf = (t: number): number => -R * (0.3 - 0.24 * t);
      // O S. Zero no couro cabeludo, onde o cabelo nasce centrado na
      // cabeça, e cresce para baixo: é o único jeito de a onda não
      // arrancar o penteado da calota.
      // A onda só começa **abaixo do maxilar**. Enquanto o cabelo
      // ainda está sobre o crânio ele não pode escorregar para lado
      // nenhum: dois centímetros de desvio na altura da orelha
      // descobriram o lado esquerdo da cabeça, e o traçado de raios
      // apontou a falha num azimute só — assimétrica, como têm de
      // ser as falhas de uma onda que começa cedo demais.
      const xOf = (t: number): number =>
        Math.sin((1 - t) * Math.PI * 1.3) * R * 0.42 * (1 - t) * (1 - smoothstep(0.35, 0.75, t));

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        fall.push({
          y: yOf(t),
          rx: rxOf(t),
          rz: R * 0.18,
          rzBack: rzBackOf(t),
          x: xOf(t),
          z: zcOf(t),
          color: tint(hair, tipColor, 0.8 * (1 - t) ** 1.25),
          bone: Bone.Head,
          bone2: Bone.Torso,
          blend: 0.88 * (1 - smoothstep(cy - 0.55, cy - 0.1, yOf(t))),
        });
      }
      b.loft(subdivideProfile(toStations(fall), detail.steps), { segments, capBottom: R * 0.07, capRings: 2 });

      // O risco no alto da cabeça. Sem ele a calota é uma superfície
      // lisa de meio metro quadrado e o penteado lê como touca —
      // foi o que a primeira captura de frente mostrou. Um vinco
      // raso da testa à coroa basta: é por onde o cabelo se divide.
      if (detail.segments >= 14) b.feature([0, cy + 0.19, 0], [R * 0.09, R * 0.3, R * 0.95], -R * 0.045, [0, 1, 0]);

      // Os sulcos entre as mechas, na face de trás. Cada um é posto
      // no ponto da elipse daquela altura — incluindo o desvio do S,
      // senão o sulco do meio das costas cava o ar ao lado do cabelo.
      //
      // Largos de propósito: a primeira versão tinha `0,11·R` de
      // raio lateral, e o espaçamento entre vértices do anel, nesta
      // malha, é maior que isso. Um sulco mais estreito que a
      // distância entre dois vértices não afunda uma superfície —
      // afunda **um vértice**, e o sombreamento suave apaga o que
      // sobrou. Não apareceu nada na captura, e não tinha como
      // aparecer.
      if (detail.segments >= 14) {
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i += 1) {
            const az = Math.PI + side * (0.34 + i * 0.42);
            const t = 0.32 + i * 0.17;
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            b.feature(
              [xOf(t) + sx * rxOf(t), yOf(t), zcOf(t) + sz * rzBackOf(t)],
              [R * 0.22, R * 0.4, R * 0.22],
              -R * 0.14,
              [sx, 0, sz],
            );
          }
        }
      }

      buildOrbitRings(b, detail, cy, R);
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

/**
 * O diadema da Suki-Chan — e por que ele mora no cabelo.
 *
 * A ficha tem **um** campo de acessório, e o dela está ocupado pelos
 * óculos, que são metade da leitura da personagem. Então o diadema
 * não é acessório: é parte do penteado, como os anéis orbitais da
 * Nexara. Quem escolhe a Cascata leva a coroa junto, e é por isso
 * que a Cascata está fora do sorteio dos habitantes.
 *
 * A armadilha aqui é conhecida: peça rígida sobre crânio curvo
 * atravessa na testa. O aro fica em `R·1,09` — a calota do cabelo
 * chega a `R·1,03` naquela altura, então sobra folga em vez de
 * interseção.
 */
function buildDiadem(b: SurfaceBuilder, detail: BodyDetail, cy: number, R: number): void {
  const head: SkinBinding = { bone: Bone.Head };
  const segs = Math.max(8, Math.round(detail.segments * 0.8));
  const gold = 0xf0c95a;
  const baseY = cy + 0.122;
  // A cabeça é um ovo visto de cima: medida na bancada, a calota tem
  // 0,96·R de lado e 0,98·R de frente nesta altura. Um aro circular
  // ou enterra nas têmporas ou flutua na testa — este é elíptico,
  // pelos mesmos números.
  const sideR = R * 1.0;
  const frontR = R * 1.01;

  // Meia-volta só. Uma tiara atravessa a testa e termina nas
  // orelhas; o anel inteiro passa por trás, onde não há nada que o
  // sustente, e lê como arco flutuando sobre o cabelo.
  const band = flatRing(sideR, frontR / sideR, R * 0.032, segs, Math.PI);
  b.addGeometry(band, { color: gold, finish: Finish.Shine, skin: head }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, baseY, 0));

  // As pontas: a central mais alta, as laterais descendo. Azimute 0 é
  // a FRENTE.
  const peaks: readonly (readonly [number, number])[] =
    detail.segments >= 14
      ? [[0, 1], [-0.46, 0.76], [0.46, 0.76], [-0.9, 0.52], [0.9, 0.52]]
      : [[0, 1], [-0.54, 0.7], [0.54, 0.7]];
  for (const [az, h] of peaks) {
    const height = R * 0.17 * h;
    const spike = new THREE.ConeGeometry(R * 0.043, height, 4);
    const matrix = new THREE.Matrix4()
      .makeRotationY(az)
      .setPosition(Math.sin(az) * sideR, baseY + height * 0.44, Math.cos(az) * frontR);
    b.addGeometry(spike, { color: gold, finish: Finish.Shine, skin: head }, matrix);
  }

  // As gemas em gota, entre as pontas. Vidro de verdade — o
  // acabamento chegou com a Luma, e é o que separa uma pedra de uma
  // bolinha pintada.
  if (detail.segments >= 14) {
    for (const az of [-0.23, 0.23] as const) {
      b.ball(
        [Math.sin(az) * sideR, baseY + R * 0.02, Math.cos(az) * frontR],
        [R * 0.042, R * 0.06, R * 0.03],
        { color: 0x8fe3ff, finish: Finish.Glass, skin: head },
        4,
      );
    }
  }
}

/**
 * Os dois anéis de rede da Nexara — e por que eles moram no cabelo.
 *
 * Mesma razão do diadema da Suki-Chan: a ficha tem **um** campo de
 * acessório, e dois anéis orbitais não cabem nele junto com mais
 * nada. Quem escolhe o Fluxo leva os anéis junto, e é por isso que
 * o Fluxo está fora do sorteio dos habitantes.
 *
 * Eles entram na malha única, como tudo o mais: um anel orbital que
 * fosse um objeto à parte custaria uma chamada de desenho por
 * personagem e teria de ser reposicionado a cada quadro. Preso ao
 * osso da cabeça, ele acompanha sem uma linha de código de
 * animação — e a cabeça já balança sozinha quando ela anda, o que
 * dá a oscilação de órbita de graça.
 *
 * Os dois são inclinados em eixos diferentes de propósito. Dois
 * anéis paralelos lêem como um aro grosso mal desenhado; cruzados,
 * lêem como órbita — é o mesmo truque do átomo de livro escolar, e
 * funciona pela mesma razão.
 */
function buildOrbitRings(b: SurfaceBuilder, detail: BodyDetail, cy: number, R: number): void {
  const head: SkinBinding = { bone: Bone.Head };
  const segs = Math.max(10, Math.round(detail.segments * 0.85));
  const baseY = cy + 0.2;
  const orbits: readonly { r: number; tube: number; tilt: number; spin: number; y: number; color: number }[] = [
    { r: R * 1.34, tube: R * 0.028, tilt: 0.24, spin: 0.42, y: baseY, color: 0x9fe8ff },
    { r: R * 1.04, tube: R * 0.024, tilt: -0.33, spin: -0.5, y: baseY + R * 0.19, color: 0xc9b6ff },
  ];
  for (const o of orbits) {
    const ring = new THREE.TorusGeometry(o.r, o.tube, 4, segs);
    const place = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(Math.PI / 2 + o.tilt, o.spin, 0, 'YXZ'))
      .setPosition(0, o.y, 0);
    b.addGeometry(ring, { color: o.color, finish: Finish.Holo, skin: head }, place);
  }
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
    case 'lentes': {
      // Os óculos dela, com a lente **vazada**.
      //
      // O acessório `oculos` comum põe uma bola opaca dentro do aro:
      // 160 triângulos cada, medidos, e a leitura de um disco de
      // plástico. Aqui a bola sai e entra um anel de vidro, que é o
      // que uma lente é. Este acessório é só dela justamente para
      // que o rosto de quem usa `oculos` não mude sem ter pedido.
      for (const side of [-1, 1]) {
        const rim = new THREE.TorusGeometry(R * 0.26, 0.005, 6, segs);
        b.addGeometry(rim, { color: 0x3b2f2a, finish: Finish.Shine, skin: head }, new THREE.Matrix4().makeTranslation(side * R * 0.37, cy + 0.022, R * 0.95));
        // O anel de vidro é fino de propósito: grosso, ele vira aro
        // de natação e engorda o olho que deveria deixar passar.
        const lens = new THREE.TorusGeometry(R * 0.243, 0.0045, 4, segs);
        b.addGeometry(lens, { color: 0xbfeaff, finish: Finish.Glass, skin: head }, new THREE.Matrix4().makeTranslation(side * R * 0.37, cy + 0.022, R * 0.945));
      }
      b.addGeometry(new THREE.BoxGeometry(R * 0.26, 0.007, 0.007), { color: 0x3b2f2a, finish: Finish.Shine, skin: head }, new THREE.Matrix4().makeTranslation(0, cy + 0.028, R * 0.97));
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
    case 'cristal': {
      // Brincos de gota: pendem da orelha, em duas peças, para ler
      // como cristal lapidado e não como bolinha.
      for (const side of [-1, 1]) {
        // Na frente da massa do cabelo, na linha do maxilar: dentro
        // dela o brinco desaparece, e foi o que aconteceu na
        // primeira tentativa.
        const ex = side * R * 0.9;
        b.ball([ex, cy - 0.01, R * 0.46], [R * 0.06, R * 0.06, R * 0.06], { color: 0xbff4ff, skin: head }, 5);
        b.ball([ex, cy - 0.085, R * 0.46], [R * 0.085, R * 0.15, R * 0.085], { color: 0x3fd8e8, skin: head }, 6);
      }
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
