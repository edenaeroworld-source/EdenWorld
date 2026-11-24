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
import { Bone, type BodyDetail, type BodyMetrics, FACE, Finish, type FinishId, HEAD_CENTER, SKIRT_BREAK_Y, SKIRT_FOLLOW_WALK, SKIRT_HEM_QUADRANTS, SKIRT_QUADRANTS, faceDimsFor, morphOrigins } from './BodyRig';
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

/**
 * A raiz da Nascente, o cabelo da Amara: o tom médio da paleta dela.
 *
 * Cor fixa do módulo, e não derivada de `hairColor`, pela mesma razão
 * do degradê da Nexara: este é um degradê de **matiz**, de água-marinha
 * a quase branco, e `shade` só sabe andar para o branco ou para o
 * preto — um cabelo que já nasce claro não tem para onde clarear.
 */
const NASCENTE_RAIZ = 0x7fcfb8;

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
function withFinish(control: Ctl[], skin: Hex, shoe?: Hex, cloth: FinishId = Finish.Cloth, skinFinish: number = Finish.Skin): Ctl[] {
  for (const c of control) {
    c.finish = c.color === skin ? skinFinish : shoe !== undefined && c.color === shoe ? Finish.Rubber : cloth;
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
  // O Traje Sonora, da Lilly: jaqueta curta escura de gola sobre uma
  // saia longa translúcida. É o contraste que a arte dela mostra —
  // pano opaco em cima, luz embaixo —, e é também o que a separa das
  // outras três deusas, todas claras da cabeça aos pés.
  const sonora = outfit === 'sonora';
  // O Traje Cosplay, da Akemi-Chan: uniforme marinheiro — gola, laço
  // grande e saia plissada curta — sob um haori longo e aberto. Duas
  // camadas, como a arte dela mostra, e é a primeira vez que um traje
  // do Éden tem camada sobre camada.
  //
  // A saia fica **curta**: ela não entra na lista de barra longa
  // logo abaixo, e é isso que a separa do Manto Aurora e do Sonora.
  // A silhueta dela é ampla em cima (cachos) e leve embaixo, e saia
  // longa inverteria exatamente essa leitura.
  const cosplay = outfit === 'cosplay';
  // O Traje Guardiã, da Saturno: túnica dourada de base com um manto
  // de folhas de **vidro verde** nos ombros e nas costas, faixa de
  // cintura e saia longa aberta. No peito, o emblema de pata da Casa
  // EdenPawl, que é a casa dela.
  //
  // Braços nus de propósito: ela é a única deusa que trabalha com as
  // mãos — resgata bicho — e manga comprida esconderia justamente
  // isso. Também é o que mais a separa das outras, todas de manga.
  const guardia = outfit === 'guardia';
  // O Traje EdenOS, da Haru: macacão grafite de base com traços de
  // circuito acesos no tronco e nos braços, painéis prateados e o
  // emblema do infinito no peito.
  //
  // Manga e calça compridas, como no `aero` que ela usava: é uma
  // engenheira de sistemas, e perna de fora contaria outra história.
  // O que muda não é o corte — é que agora o pano é escuro e a luz
  // vem da emissão, o que a separa da Nexara, que é clara.
  const sistema = outfit === 'sistema';
  // O Traje Jardim, da Maze: drapeado branco translúcido com folhagem
  // verde por cima, vinhas na barra e gotas de água.
  //
  // Ombros e braços nus, como na arte — e pela mesma razão da
  // Saturno: ela planta, e manga comprida esconde a mão que planta.
  // Barra longa, a do Manto Aurora, porque a arte mostra um drapeado
  // que varre o chão; a `SKIRT_HEM_Y` do `vestido` que ela usava
  // parava no joelho.
  const jardim = outfit === 'jardim';
  // O Traje Lumen da Júpiter. Usa a barra curta `SKIRT_HEM_Y`, que é
  // a do `vestido` que ela deixou — a saia dela para no joelho, como
  // na arte, e não varre o chão como a da Maze.
  const lumen = outfit === 'lumen';
  // O Manto Regaço, da Amara: vestido de vidro água-marinha com gola
  // alta e um manto que desce dos ombros, contorna o ventre e fecha
  // abaixo dele.
  //
  // Ombros e braços nus, como a arte de referência mostra — e isso
  // também é o que deixa o abraço visível: manga comprida clara
  // encostaria no manto claro e as duas peças virariam uma mancha só.
  //
  // Barra longa, a do Manto Aurora, porque na arte o vestido varre o
  // chão. Ela é a única deusa grávida do Éden, e saia curta num corpo
  // que o morph empurra 9 cm para a frente sobe junto com o ventre.
  const regaco = outfit === 'regaco';
  // Os quatro trajes masculinos. Nenhum deles custa uma varredura
  // nova: a roupa comum do Éden sempre foi combinação destes quatro
  // sinalizadores com a cor por anel, e é essa máquina que eles usam.
  // O que cada um acrescenta de geometria é só o detalhe que o
  // identifica — gola, alça, capuz, cordão.
  // A camiseta não aparece em nenhum dos quatro sinalizadores abaixo, e
  // isso é o traje inteiro: manga curta é **não** estar em `longSleeves`
  // nem em `bareArms` (ver `shortSleeve`, em `buildArm`), e short é
  // **não** estar em `longPants` nem em `bareLegs`. Ela existe por
  // ausência, como a manga três-quartos do Vestido Docente.
  // O traje do criador do Éden — e a palavra "traje" só vale como
  // nome da configuração, porque não há peça nenhuma. A decisão A da
  // Etapa 3 é que o cosmos **é** o corpo: nada de pano, nada de
  // manto, nada de faixa. O que o diferencia de um corpo nu comum é
  // o acabamento, que deixa de ser pele e passa a ser campo estelar.
  //
  // Ele não desenha um vértice sequer de roupa, e é por isso que sai
  // mais barato que o Traje Aero que o Aérion usava.
  const criador = outfit === 'criador';
  const regata = outfit === 'regata';
  const moletom = outfit === 'moletom';
  const banho = outfit === 'banho';
  // ---------------------------------------------------------------
  // Fase 1.1 — as cinco roupas de reposição.
  //
  // Nenhuma traz pano novo: cada uma é uma combinação de cortes que o
  // motor já sabia desenhar e que ninguém tinha pedido junta. É de
  // propósito — corte é o que se lê de longe, e recolorir o `casual`
  // cinco vezes não teria devolvido variedade nenhuma.
  //
  //  · `saia`    saia curta com manga curta e braços vestidos — o
  //              `vestido` é peça única de braço nu, e esta é conjunto;
  //  · `tunica`  barra longa com manga comprida, sem ser de deusa;
  //  · `macacao` perna e manga compridas sem saia, o corte do `rede`
  //              devolvido à praça;
  //  · `maio`    peça inteira de braço e perna nus, o par feminino da
  //              bermuda de banho;
  //  · `jaqueta` manga comprida com perna curta, combinação que não
  //              existia em nenhuma das dezenove.
  const saia = outfit === 'saia';
  const maio = outfit === 'maio';
  const tunica = outfit === 'tunica';
  const macacao = outfit === 'macacao';
  const jaqueta = outfit === 'jaqueta';
  const longSleeves = outfit === 'aero' || aurora || rede || sonora || cosplay || sistema || moletom || tunica || macacao || jaqueta;
  const bareArms = outfit === 'esportivo' || outfit === 'vestido' || guardia || jardim || lumen || regaco || regata || banho || criador || maio;
  const longPants = outfit === 'casual' || outfit === 'aero' || rede || sistema || moletom || regata || macacao;
  const bareLegs = outfit === 'vestido' || docente || cosplay || guardia || jardim || lumen || regaco || criador || saia || tunica || maio;
  const dress = outfit === 'vestido' || aurora || docente || sonora || cosplay || guardia || jardim || lumen || regaco || saia || tunica;
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
  //
  // O Sonora segue o Manto Aurora e pela mesma lógica invertida: a
  // saia é vidro porque é camada de som, e a jaqueta é pano porque é
  // jaqueta. Um traje inteiro de vidro escuro vira plástico.
  // O Cosplay entra em vidro pelo haori: a arte mostra um casaco que
  // deixa ver o uniforme por baixo. Translucidez de verdade não
  // existe aqui — não há `transmission` em nenhuma das sete tabelas
  // de acabamento —, então o que sugere a camada é o reflexo do
  // vidro, como foi feito na saia da Lilly.
  // O Cosplay **não** entra aqui, e isso é uma correção.
  //
  // `cloth` é o acabamento de base do traje inteiro — torso, braços e
  // pernas. Pôr o Cosplay em vidro marcou a perna toda como `Glass`,
  // e o `subdivideProfile` (que descarta `finish` e trava o anel na
  // estação mais próxima) espalhou isso até sobre a pele: a coxa nua
  // renderizava envernizada. O vidro do haori é pedido peça a peça,
  // onde ele de fato existe, e a base continua sendo pano.
  const cloth: FinishId = aurora || rede || sonora ? Finish.Glass : Finish.Cloth;
  // A pele do criador é campo estelar, e isso vale para o corpo
  // inteiro — tronco, braços, pernas, mãos, pescoço e rosto. Um só
  // acabamento, porque a emenda apareceria exatamente onde a cabeça
  // encontra o pescoço se os dois divergissem.
  b.skinFinish = criador ? Finish.Cosmos : Finish.Skin;
  const suit: FinishId = criador ? Finish.Cosmos : rede ? Finish.Glass : Finish.Cloth;
  // O acabamento que as varreduras do corpo carregam.
  //
  // Tem de ser aqui, e não na cor de cada estação, porque
  // `subdivideProfile` descarta o `finish` das estações ao inserir os
  // anéis intermediários: o que sobrevive é o `b.surface` vigente. É
  // por isso que marcar as estações de pele não bastaria — o corpo
  // inteiro sairia com o acabamento do pano, como sempre saiu.
  const bodySurface: FinishId = criador ? Finish.Cosmos : cloth;

  // Cada parte declara o seu acabamento antes de ser varrida.
  b.surface = bodySurface;
  buildTorso(b, { m, detail, skin, top, bottom, accent, outfit, dress, origins, suit });
  for (const side of [1, -1] as const) {
    buildArm(b, side, { m, detail, skin, top, accent, longSleeves, bareArms, outfit, cloth: bodySurface, suit });
    buildLeg(b, side, { m, detail, skin, bottom, shoe, longPants, bareLegs, outfit, origins, suit });
  }
  b.surface = b.skinFinish;
  buildHead(b, a, p, m, detail);
  // Onde a saia começa no buffer: é assim que um teste separa o tecido
  // do corpo sem adivinhar por cor ou por raio.
  const skirtStart = b.vertexCount;
  b.surface = cloth;
  // A barra longa é a mesma do Manto Aurora: abaixo de `GOWN_HEM_Y` a
  // saia deixa de abrir como cone e vira coluna, que é o que separa
  // um vestido longo de uma tenda.
  if (dress) buildSkirt(b, m, detail, dress && (sonora || cosplay || guardia) ? bottom : top, origins, cosplay ? COSPLAY_HEM_Y : aurora || docente || sonora || guardia || jardim || regaco || tunica ? GOWN_HEM_Y : SKIRT_HEM_Y);

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

  // A bermuda de banho veste o quadril e mais nada: o tronco inteiro é
  // pele. O traje do criador nem isso — o corpo dele é cósmico de
  // ponta a ponta (ver `buildBodyGeometry`). Todos os outros sobem
  // com a cor do pano desde o quadril.
  const bareTorso = outfit === 'banho' || outfit === 'criador';
  // A regata cobre o peito e deixa o ombro de fora. A diferença entre
  // ela e uma camiseta sem manga está exatamente neste anel: a manga
  // curta termina **no** ombro, a alça passa **por cima** dele.
  const tank = outfit === 'regata';
  const chest = bareTorso ? skin : top;
  const shoulderColor = bareTorso || tank ? skin : top;

  // A barriga aparece em quem usa traje de praia; nos outros a cor da
  // roupa sobe desde o quadril.
  const belly = outfit === 'praia' || outfit === 'esportivo' || bareTorso ? skin : top;
  // A pelve é a última peça de guarda-roupa que sobrava no Criador: a
  // bermuda de banho pinta esta faixa com a cor de baixo porque ela
  // **é** uma bermuda, mas o traje do criador não é roupa nenhuma, e
  // um corpo cósmico de ponta a ponta não tem por que mudar de tom no
  // quadril. Sem isto, `bottomColor` — uma cor de guarda-roupa que
  // ninguém pode editar nele — continuava desenhada no corpo.
  // O maiô entra aqui pela mesma razão do vestido: ele é **uma peça
  // só**. A inspeção visual mostrou a pelve saindo com a cor de baixo,
  // o que lia como calcinha de outra cor por cima de um maiô.
  const lower = dress || outfit === 'maio' ? top : outfit === 'criador' ? skin : bottom;

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
    { y: 0.165, rx: m.waistWidth * 1.06, rz: 0.09, rzBack: 0.092, color: chest, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: 0.235, rx: m.chestWidth * 0.97, rz: 0.104, rzBack: 0.096, color: chest, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: 0.3, rx: m.chestWidth, rz: 0.102, rzBack: 0.094, color: chest, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    // A linha dos ombros é larga e rasa: é o trapézio, não uma tampa.
    // E tem de subir **até a altura da junta do braço** (`waist +
    // shoulderY`): parando antes, o braço nascia no ar ao lado do
    // pescoço, com um vão de dois dedos na axila.
    { y: 0.365, rx: Math.max(m.chestWidth * 0.99, m.shoulderX * 0.88), rz: 0.096, rzBack: 0.09, color: shoulderColor, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: m.waist + m.shoulderY, rx: Math.max(m.chestWidth * 0.8, m.shoulderX * 0.72), rz: 0.082, rzBack: 0.08, color: shoulderColor, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    // Pescoço: sai do trapézio, não de um buraco.
    { y: m.waist + m.shoulderY + 0.028, rx: m.neckR * 1.5, rz: m.neckR * 1.42, color: skin, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: m.neckY - 0.015, rx: m.neckR * 1.04, rz: m.neckR * 1.02, color: skin, bone: Bone.Head },
    { y: m.neckY + 0.045, rx: m.neckR * 0.99, rz: m.neckR, color: skin, bone: Bone.Head },
  ];

  b.loft(subdivideProfile(toStations(withFinish(control, skin, undefined, ctx.suit, b.skinFinish)), detail.steps), {
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

  if (outfit === 'aurora' || outfit === 'rede' || outfit === 'sonora' || outfit === 'sistema') {
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
  if (outfit === 'sonora') {
    buildSonoraSuit(b, m, detail, top, accent, torso, hip);
  }
  if (outfit === 'cosplay') {
    buildCosplaySuit(b, m, detail, top, accent, torso, hip);
  }
  if (outfit === 'guardia') {
    buildGuardiaSuit(b, m, detail, top, accent, torso, hip);
  }
  if (outfit === 'sistema') {
    buildSystemSuit(b, m, detail, torso, hip);
  }
  if (outfit === 'lumen') {
    buildLumenSuit(b, m, detail, torso, hip);
  }
  if (outfit === 'jardim') {
    buildGardenSuit(b, m, detail, torso, hip);
  }
  if (outfit === 'regaco') {
    buildRegacoSuit(b, m, detail, torso, hip);
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
  } else if (outfit === 'saia') {
    // O cós da saia, na cor de baixo: é o que separa a blusa da saia
    // num conjunto de duas peças. Sem ele, saia e blusa da mesma cor
    // leriam como vestido.
    const cos = flatRing(m.waistWidth * 1.07, WAIST_DEPTH, 0.02, Math.max(12, detail.segments));
    b.addGeometry(cos, { color: bottom, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.125, 0));
  } else if (outfit === 'jaqueta') {
    // O zíper aberto, de alto a baixo do tronco, na cor de acento: é
    // o traço que diz jaqueta e não moletom.
    b.addGeometry(new THREE.BoxGeometry(0.022, 0.3, 0.012), { color: accent, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeTranslation(0, 0.22, 0.098));
  } else if (outfit === 'macacao') {
    // Jardineira: peitilho e duas alças na cor de baixo, sobre a
    // blusa. A primeira versão era manga e perna compridas com uma
    // costura na cintura — no papel, uma silhueta nova; na tela, o
    // Traje Aero com uma linha a mais. A inspeção visual pegou, e o
    // peitilho é o que resolve: ele muda o que se lê de longe, que é
    // o critério que vale para roupa.
    const peito = new THREE.BoxGeometry(0.165, 0.15, 0.014);
    b.addGeometry(peito, { color: bottom, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeTranslation(0, 0.265, 0.094));
    for (const side of [1, -1] as const) {
      const alca = new THREE.BoxGeometry(0.032, 0.17, 0.014);
      b.addGeometry(
        alca,
        { color: bottom, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso },
        new THREE.Matrix4().makeRotationZ(side * 0.12).setPosition(side * 0.062, 0.398, 0.086),
      );
      // A alça continua nas costas, senão ela some ao virar o boneco.
      const atras = new THREE.BoxGeometry(0.032, 0.15, 0.014);
      b.addGeometry(
        atras,
        { color: bottom, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso },
        new THREE.Matrix4().makeRotationZ(side * 0.1).setPosition(side * 0.062, 0.385, -0.082),
      );
    }
    const fivela = flatRing(m.waistWidth * 1.04, WAIST_DEPTH, 0.012, Math.max(12, detail.segments));
    b.addGeometry(fivela, { color: bottom, skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.13, 0));
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

  /* -------------------------------------------------------------------- */
  /* Os quatro trajes masculinos                                           */
  /* -------------------------------------------------------------------- */

  const bustSkin: SkinBinding = { bone: Bone.Torso };
  const torsoStation = { skin: bustSkin, zone: MorphZone.Bust, origin: torso };

  if (outfit === 'camiseta') {
    // Gola redonda e barra. Duas linhas, e são elas que fazem o pano
    // ler como camiseta em vez de malha colada: sem a gola, o tecido
    // sobe até o queixo; sem a barra, desce até a virilha sem fim.
    const collar = flatRing(m.neckR * 1.62, 0.95, 0.013, Math.max(12, detail.segments));
    b.addGeometry(collar, { color: shade(top, -0.22), ...torsoStation }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, m.waist + m.shoulderY + 0.016, 0));
    const hem = flatRing(m.waistWidth * 1.05, WAIST_DEPTH, 0.01, Math.max(10, detail.segments));
    b.addGeometry(hem, { color: shade(top, -0.14), ...torsoStation }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.118, 0));
  }

  if (outfit === 'regata') {
    // As alças. O tronco já está com pano no peito e pele no ombro —
    // a alça é o que liga uma coisa à outra, e sem ela a regata vira
    // um tubo de pano flutuando sobre o peito.
    for (const side of [1, -1] as const) {
      b.ball([side * m.chestWidth * 0.58, m.waist + m.shoulderY - 0.026, 0], [0.027, 0.055, 0.072], { color: top, ...torsoStation }, 5);
    }
    const hem = flatRing(m.waistWidth * 1.05, WAIST_DEPTH, 0.01, Math.max(10, detail.segments));
    b.addGeometry(hem, { color: shade(top, -0.14), ...torsoStation }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.118, 0));
  }

  if (outfit === 'moletom') {
    // O capuz, caído nas costas. É meia casca atrás do pescoço, e não
    // um anel em volta dele: capuz que dá a volta completa deixa de
    // ser capuz e vira gola rulê — que já é de outro traje.
    b.ball([0, m.waist + m.shoulderY - 0.012, -0.082], [m.chestWidth * 0.74, 0.082, 0.062], { color: shade(top, -0.12), ...torsoStation }, 6);
    // O bolso canguru, raso, à frente da barriga.
    const pocket = new THREE.BoxGeometry(m.waistWidth * 1.15, 0.072, 0.012);
    b.addGeometry(pocket, { color: shade(top, -0.18), ...torsoStation }, new THREE.Matrix4().makeTranslation(0, 0.16, 0.094));
    // Os dois cordões do capuz.
    for (const side of [1, -1] as const) {
      b.ball([side * 0.026, m.waist + m.shoulderY - 0.072, 0.072], [0.008, 0.042, 0.008], { color: shade(top, 0.4), ...torsoStation }, 4);
    }
  }

  if (outfit === 'banho') {
    // O cós da bermuda e o cordão. O tronco é pele inteiro, então a
    // única coisa que diz onde a roupa começa é esta linha.
    const band = flatRing(m.hipWidth * 1.0, HIP_DEPTH, 0.012, Math.max(12, detail.segments));
    b.addGeometry(band, { color: shade(bottom, -0.22), skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.042, 0));
    for (const side of [1, -1] as const) {
      b.ball([side * 0.022, 0.016, m.hipWidth * 0.7], [0.011, 0.04, 0.011], { color: shade(bottom, 0.45), skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip }, 4);
    }
  }
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
 * O Traje Sonora, da Lilly — e por que o equalizador é uma coroa.
 *
 * O pedido listava várias formas possíveis para "música em três
 * dimensões": ondas orbitais, anéis de frequência, partículas,
 * cristais. Escolher importa mais do que parece, porque a Nexara já
 * tem **dois anéis orbitando a cabeça**. Pôr anéis luminosos numa
 * segunda deusa não dá a ela uma identidade — tira a da outra. Duas
 * personagens com o mesmo truque viram a mesma personagem vista de
 * ângulos diferentes.
 *
 * Então a vibração de Lilly é a imagem mais direta que a música tem:
 * um **equalizador**. Uma coroa de barras em volta do quadril, com
 * alturas diferentes, como um espectro congelado no instante em que
 * a música passou. É geometria, não efeito, e por isso aparece de
 * costas, de perfil e no escuro.
 *
 * Nada disso custa uma chamada de desenho: barras, cinto e costuras
 * entram por `addGeometry` na malha única, presos ao osso do quadril
 * e do tronco, e acompanham a animação sem uma linha de código.
 */
/**
 * O Traje Cosplay, da Akemi-Chan — uniforme marinheiro sob um haori.
 *
 * Duas camadas, que é o que a arte dela mostra e o que nenhum outro
 * traje do Éden tinha: por baixo um uniforme escolar com gola
 * marinheira e laço; por cima um casaco longo, aberto, de mangas
 * largas.
 *
 * O haori é a peça difícil. Na arte ele é translúcido, e translúcido
 * aqui não existe — não há `transmission`, `transparent` nem
 * `opacity` em nenhuma das sete tabelas de acabamento. O que o faz
 * ler como casaco por cima, e não como pintura no tronco, é a
 * **borda**: duas lapelas que descem do ombro à barra, afastadas do
 * corpo o suficiente para pegarem luz pela aresta. A silhueta faz o
 * trabalho que a transparência faria.
 */
function buildCosplaySuit(
  b: SurfaceBuilder,
  m: BodyMetrics,
  detail: BodyDetail,
  top: Hex,
  accent: Hex,
  torso: readonly [number, number, number],
  hip: readonly [number, number, number],
): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  const lilas = 0xc9a7ff;
  const rosa = 0xffc1d6;
  // O magenta canônico da ficha dela. A gola saiu branca na primeira
  // captura, sobre um torso branco: sumiu. Gola marinheira só existe
  // por contraste — é a cor dela que diz o que a peça é.
  const magenta = 0xe0417f;

  // --- a gola marinheira ---
  //
  // Ela é uma placa quadrada caída nas costas, não um anel: gola de
  // marinheiro é justamente isso, e um anel no pescoço já existe no
  // Aurora e no Rede. Três faixas achatadas, descendo do ombro.
  const golaY = m.waist + m.shoulderY - 0.035;
  b.addGeometry(
    new THREE.BoxGeometry(m.shoulderX * 1.42, 0.085, 0.012),
    { color: lilas, finish: Finish.Cloth, ...chest },
    new THREE.Matrix4().makeRotationX(-0.22).setPosition(0, golaY - 0.03, -m.waistWidth * WAIST_DEPTH - 0.008),
  );
  for (const side of [1, -1]) {
    // A tira que passa por cima do ombro.
    //
    // Sem ela a gola eram duas placas soltas grudadas no peito, que
    // foi exatamente como a captura leu: remendo, não gola. Gola
    // marinheira é **uma peça só** que desce das costas, cruza o
    // ombro e termina na frente — e é esse caminho contínuo que o
    // olho reconhece.
    b.addGeometry(
      new THREE.BoxGeometry(0.085, 0.013, 0.175),
      { color: lilas, finish: Finish.Cloth, ...chest },
      new THREE.Matrix4().makeRotationZ(side * 0.14).setPosition(side * 0.088, golaY + 0.012, -0.012),
    );
    // As duas pontas que caem na frente, convergindo para o laço: é
    // o V que fecha o desenho.
    b.addGeometry(
      new THREE.BoxGeometry(0.062, 0.145, 0.011),
      { color: lilas, finish: Finish.Cloth, ...chest },
      new THREE.Matrix4().makeRotationZ(-side * 0.38).setPosition(side * 0.064, golaY - 0.05, 0.113),
    );
  }
  // A listra da gola, que é o que diz "marinheiro" e não "colarinho".
  b.addGeometry(
    new THREE.BoxGeometry(m.shoulderX * 1.3, 0.014, 0.013),
    { color: magenta, finish: Finish.Cloth, ...chest },
    new THREE.Matrix4().makeRotationX(-0.22).setPosition(0, golaY - 0.062, -m.waistWidth * WAIST_DEPTH - 0.012),
  );

  // --- o laço ---
  //
  // Grande de propósito: na arte ele é o centro do peito, e é o que
  // o olho acha primeiro num traje claro. Duas alças e um nó.
  //
  // De perto ele é redondo; de longe, três caixas. Três `ball` de
  // cinco anéis custam mais de trezentos triângulos, e a silhueta de
  // um laço a três metros é a mesma com caixa ou com bola.
  // O peito dela tem frente em `z ≈ 0,111` nessa altura, medido na
  // malha. A primeira versão pôs o laço em `0,082`: ele existia,
  // ocupava triângulos e estava **enterrado dentro do torso**. Toda
  // cota aqui é maior que a frente medida, de propósito.
  const lacoY = golaY - 0.085;
  if (detail.segments >= 14) {
    for (const side of [1, -1]) {
      b.ball([side * 0.046, lacoY, 0.121], [0.04, 0.029, 0.017], { color: magenta, finish: Finish.Cloth, ...chest }, 5);
    }
    b.ball([0, lacoY, 0.132], [0.021, 0.021, 0.015], { color: top, finish: Finish.Cloth, ...chest }, 5);
  } else {
    for (const side of [1, -1]) {
      b.addGeometry(
        new THREE.BoxGeometry(0.07, 0.05, 0.03),
        { color: magenta, finish: Finish.Cloth, ...chest },
        new THREE.Matrix4().makeTranslation(side * 0.046, lacoY, 0.121),
      );
    }
    b.addGeometry(
      new THREE.BoxGeometry(0.034, 0.034, 0.026),
      { color: top, finish: Finish.Cloth, ...chest },
      new THREE.Matrix4().makeTranslation(0, lacoY, 0.132),
    );
  }

  // --- o haori ---
  //
  // Duas lapelas longas, do ombro à barra da saia, afastadas do
  // tronco. Em vidro: é a camada de cima, e é ela que reflete.
  for (const side of [1, -1]) {
    // Largas e para fora: em `waistWidth * 1,02` elas corriam por
    // dentro do contorno do tronco e liam como suspensório. O casaco
    // só existe como casaco quando **ultrapassa** a silhueta do
    // corpo — é a borda dele contra o fundo que conta a peça.
    const lapela = new THREE.BoxGeometry(0.085, 0.54, 0.014);
    b.addGeometry(
      lapela,
      { color: lilas, finish: Finish.Glass, ...chest },
      new THREE.Matrix4().makeRotationZ(side * 0.055).setPosition(side * (m.waistWidth * 1.38), 0.11, m.waistWidth * WAIST_DEPTH * 0.62),
    );
    // A barra do haori, atrás, onde o casaco abre.
    b.addGeometry(
      new THREE.BoxGeometry(0.09, 0.48, 0.013),
      { color: lilas, finish: Finish.Glass, ...chest },
      new THREE.Matrix4().makeRotationZ(side * 0.09).setPosition(side * (m.waistWidth * 1.42), 0.08, -m.waistWidth * WAIST_DEPTH * 0.72),
    );
  }

  // --- a faixa da cintura ---
  const faixa = flatRing(m.waistWidth * 1.06, WAIST_DEPTH, 0.022, Math.max(12, detail.segments));
  b.addGeometry(faixa, { color: accent, finish: Finish.Cloth, ...chest }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.14, 0));

  if (detail.segments < 14) return;

  // --- o plissado da saia ---
  //
  // Relevo, não geometria: a saia é compartilhada com o vestido comum
  // e não pode ser alterada, mas `feature()` empurra vértices que já
  // existem. Custa zero triângulo e é o que separa uma saia plissada
  // de um cone liso.
  //
  // O vinco precisa cair **sobre** o cone, e o cone muda de raio a
  // cada altura. A primeira versão usou um raio fixo (`hipWidth`
  // vezes 1,6 em x e 1,45 em z): na barra ficava para dentro do
  // tecido, no alto ficava para fora, e o plissado não apareceu em
  // lugar nenhum. Aqui o raio é recalculado por altura com a mesma
  // conta do `buildSkirt`, então o vinco acompanha a abertura.
  void hip;
  const hemRx = m.hipWidth * 1.9;
  const cintura = m.waistWidth * 1.04;
  const raioEm = (y: number): number => {
    const t = Math.max(0, Math.min(1, (y - COSPLAY_HEM_Y) / (0.09 - COSPLAY_HEM_Y)));
    return cintura + (hemRx - cintura) * (1 - t) ** 1.45;
  };
  const pregas = detail.segments >= 26 ? 18 : 10;
  for (let i = 0; i < pregas; i += 1) {
    const az = (i / pregas) * Math.PI * 2;
    for (let yy = -0.25; yy <= -0.07; yy += 0.04) {
      const r = raioEm(yy);
      b.feature([Math.sin(az) * r, yy, Math.cos(az) * r * 0.94], [0.021, 0.08, 0.021], -0.024);
    }
  }

  // --- os cartões holográficos ---
  //
  // Os mundos que a arte põe ao redor dela. Não viram anéis: anel
  // orbitando o corpo já é a assinatura da Nexara, e repetir o
  // recurso faria as duas lerem igual. Viram **cartões achatados**,
  // que é a outra coisa que a arte mostra flutuando ao lado dela —
  // painéis de interface com retratos e glifos.
  //
  // Abertos em leque atrás dos ombros e presos ao tronco: acompanham
  // a personagem, não flutuam soltos, e não custam chamada de
  // desenho porque são geometria mesclada no corpo.
  // Em leque atrás dos ombros eles ficavam **invisíveis**: o corpo
  // tapa de frente e a juba tapa o resto. Um detalhe que só existe
  // em código não melhora personagem nenhuma. Agora o leque sobe ao
  // lado dela, como uma mão de cartas aberta, onde a câmera o vê.
  //
  // Fora do corredor do braço de propósito: a varredura vai até
  // `|x| = 0,28`, e o leque começa em `0,31`.
  const cartoes = detail.segments >= 26 ? 5 : 3;
  for (let i = 0; i < cartoes; i += 1) {
    const t = i / (cartoes - 1);
    const card = new THREE.BoxGeometry(0.072, 0.092, 0.005);
    // Alterna a cor: um cartão rosa, um lilás. Dois tons bastam para
    // o leque não ler como uma placa só.
    const cor = i % 2 === 0 ? rosa : lilas;
    const place = new THREE.Matrix4()
      .makeRotationY(-0.55 - t * 0.3)
      .multiply(new THREE.Matrix4().makeRotationZ(-0.22 - t * 0.26))
      .setPosition(0.35 + t * 0.085, m.waist + 0.12 + t * 0.165, 0.045 - t * 0.02);
    b.addGeometry(card, { color: cor, finish: Finish.Holo, ...chest }, place);
  }
}

/**
 * O Traje Guardiã, da Saturno — e por que ele não é verde de pano.
 *
 * A Maze é a Deusa da Natureza e ainda não foi remasterizada. Se a
 * Saturno virar uma figura de folhagem verde, as duas passam a ler
 * igual e a Maze perde o território dela antes de existir. A divisão
 * que este traje sustenta: **a Maze terá vegetação de pano; a
 * Saturno tem folha de vidro sobre ouro.** O verde entra como
 * material translúcido e luminoso — nunca como o tecido da peça.
 *
 * A primeira versão errou exatamente isso: a saia saiu com o
 * verde-limão da ficha e a figura virou uma deusa-da-vegetação
 * genérica, que é o que o briefing proíbe. O ouro é o pano; o verde
 * é o vidro.
 *
 * A base é dourada e de **pano**. Isso é lição paga caro no marco da
 * Akemi: pôr o traje inteiro em `Finish.Glass` marcou a perna toda
 * como vidro, porque `subdivideProfile` descarta o acabamento e
 * trava o anel na estação mais próxima — a coxa nua renderizava
 * envernizada. Aqui o vidro é pedido peça a peça, onde ele existe.
 */
function buildGuardiaSuit(
  b: SurfaceBuilder,
  m: BodyMetrics,
  detail: BodyDetail,
  top: Hex,
  accent: Hex,
  torso: readonly [number, number, number],
  hip: readonly [number, number, number],
): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  const quadril = { skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip } as const;
  const ouro = 0xe0a83a;
  // Os dois verdes não são escolha livre. O `#9df0b0`/`#1fae6b` é da
  // Maze; um verde puro aqui encostaria no dela. Este par foge para
  // os lados: um verde-amarelado que faz ponte com o ouro e um
  // verde-azulado que traz o **aqua** pedido no briefing.
  const folha = 0xa8e86a;
  const folhaFunda = 0x5fcf9b;
  // O emblema é creme luminoso, não o ciano do `accent`: `accent` é
  // `0x29c8ff` para todo o elenco, e uma pata azul-piscina no peito
  // de uma deusa dourada lê como adesivo de outra personagem.
  const creme = 0xfff4dc;
  void accent;

  // --- a faixa de cintura ---
  //
  // Dourada e larga. É ela que separa a túnica da saia e desenha a
  // cintura: sem isso a peça lê como um saco comprido.
  b.addGeometry(
    flatRing(m.waistWidth * 1.07, WAIST_DEPTH, 0.028, Math.max(12, detail.segments)),
    { color: ouro, finish: Finish.Cloth, ...chest },
    new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.13, 0),
  );
  b.addGeometry(
    new THREE.BoxGeometry(0.052, 0.044, 0.016),
    { color: top, finish: Finish.Shine, ...chest },
    new THREE.Matrix4().makeTranslation(0, 0.13, m.waistWidth * WAIST_DEPTH + 0.012),
  );

  // --- o emblema de pata da Casa EdenPawl ---
  //
  // A marca dela, e o que diz "animais" sem depender de folha
  // nenhuma. Uma almofada e quatro dedos, em `Holo`: aceso.
  //
  // A frente do peito está em `z ≈ 0,111` nessa altura, medido na
  // malha antes de escrever esta linha. Na Akemi o laço foi parar em
  // `0,082` e ficou **enterrado dentro do torso** — existia, custava
  // triângulos e não aparecia. Toda cota aqui é maior que a medida.
  const pataY = 0.3;
  const pataZ = 0.1225;
  b.ball([0, pataY, pataZ], [0.039, 0.032, 0.013], { color: creme, finish: Finish.Holo, ...chest }, 5);
  if (detail.segments >= 14) {
    for (let i = 0; i < 4; i += 1) {
      const ang = -1.15 + (i / 3) * 2.3;
      b.ball(
        [Math.sin(ang) * 0.052, pataY + 0.05 + Math.cos(ang) * 0.022, pataZ - 0.004],
        [0.016, 0.018, 0.01],
        { color: creme, finish: Finish.Holo, ...chest },
        4,
      );
    }
  }

  if (detail.segments < 14) return;

  /** Uma folha pontuda: pirâmide de base losangular, achatada. */
  const folhaPontuda = (largura: number, comprimento: number): THREE.BufferGeometry => {
    const g = new THREE.ConeGeometry(largura * 0.5, comprimento, 4);
    g.scale(1, 1, 0.16);
    // Ponta para baixo: folha pendurada, presa pela base.
    g.rotateX(Math.PI);
    return g;
  };

  // --- a gola de folhas de vidro ---
  //
  // A camada Frutiger Aero da personagem, e o lugar onde o verde
  // ganha pé de igualdade com o ouro.
  //
  // Duas tentativas antes desta falharam na bancada e as duas pelo
  // mesmo motivo: folha espalhada pelo torso não lê como peça. A
  // primeira pôs folhas só nas costas e elas viraram lascas verdes
  // nas laterais; a segunda cruzou o ombro e virou ombreira. O que
  // lê é uma **gola fechada** — anel completo na linha do pescoço,
  // folhas quase deitadas sobre o peito e os ombros, como uma coroa
  // de louros usada no colo.
  //
  // Anel completo, inclusive atrás, mesmo com o cabelo cobrindo as
  // costas: a parte de trás é o que fecha a silhueta quando ela gira
  // e quando o cabelo balança.
  const folhas = detail.segments >= 26 ? 16 : 11;
  for (let i = 0; i < folhas; i += 1) {
    const az = (i / folhas) * Math.PI * 2;
    // Elipse colada no tronco na altura do colo. Medido na malha:
    // a frente do torso está em `z ≈ 0,085` nessa altura.
    const rx = 0.112;
    const rz = 0.082;
    b.addGeometry(
      folhaPontuda(0.062, 0.125),
      { color: i % 2 === 0 ? folha : folhaFunda, finish: Finish.Glass, ...chest },
      new THREE.Matrix4()
        .makeRotationY(az)
        // Quase deitada: é o que transforma espeto em pétala pousada.
        .multiply(new THREE.Matrix4().makeRotationX(-1.15))
        .setPosition(Math.sin(az) * rx, 0.425, Math.cos(az) * rz),
    );
  }
  for (const side of [1, -1]) {
    // A presilha dourada que prende a gola no ombro.
    b.addGeometry(
      new THREE.BoxGeometry(0.038, 0.038, 0.016),
      { color: ouro, finish: Finish.Shine, ...chest },
      new THREE.Matrix4().makeRotationZ(side * 0.32).setPosition(side * 0.125, 0.4, 0.052),
    );
  }

  // --- a barra de folhas de vidro ---
  //
  // Duas fileiras sobrepostas de folhas pontudas no terço de baixo
  // da saia. É aqui que o verde alcança o ouro em área, que foi o
  // pedido do Criador, e é o que dá à barra uma borda recortada —
  // silhueta, coisa que relevo não faz.
  //
  // Duas tentativas anteriores morreram na bancada. A primeira pôs
  // placas retangulares espetadas para fora e saiu como abas de
  // papel. A segunda levou lâminas do cós até a barra e a figura
  // virou um poste listrado de carnaval: faixa comprida sobre pano
  // liso lê como fita, não como folha. O que lê é folha **curta,
  // pontuda e sobreposta**, agrupada só onde a saia já é larga.
  //
  // Os raios são **medidos na malha**, não calculados. O perfil de
  // controle de `buildSkirt` diz que a barra está em 0,193; a saia
  // que sai do forno mede 0,41. A primeira versão confiou na fórmula
  // e enterrou as folhas dentro do pano — invisíveis e pagas. É o
  // mesmo erro do laço da Akemi, e o motivo de toda cota de adereço
  // deste arquivo sair de uma sonda.

  const porFileira = detail.segments >= 26 ? 16 : 11;
  for (const [fileira, raio, altura, largura, comprimento] of [
    [0, 0.362, -0.345, 0.088, 0.175],
    [1, 0.404, -0.425, 0.095, 0.2],
  ] as const) {
    for (let i = 0; i < porFileira; i += 1) {
      // A fileira de cima sai meio passo torta em relação à de
      // baixo: é a defasagem que faz as folhas se sobreporem em vez
      // de formarem duas cercas paralelas.
      const az = ((i + fileira * 0.5) / porFileira) * Math.PI * 2;
      b.addGeometry(
        folhaPontuda(largura, comprimento),
        { color: i % 2 === 0 ? folha : folhaFunda, finish: Finish.Glass, ...quadril },
        new THREE.Matrix4()
          .makeRotationY(az)
          .multiply(new THREE.Matrix4().makeRotationX(-0.45))
          .setPosition(Math.sin(az) * raio, altura, Math.cos(az) * raio),
      );
    }
  }
}

/**
 * O Traje EdenOS, da Haru — e por que o pano é escuro.
 *
 * A Nexara é a Deusa da Internet e já foi entregue: branca, lilás,
 * com anéis orbitando a cabeça. As duas são "deusas digitais" e o
 * risco de lerem igual é real. A separação que este traje sustenta:
 * **a Nexara é clara e flutua; a Haru é maquinário aceso.** O pano
 * dela é grafite justamente para que a emissão seja a luz — num
 * tecido branco, circuito ciano some.
 *
 * O traje que ela usava era o `aero`, e `aero` é dividido com o
 * **Aérion, o Criador do Éden Aero**, e com a Amara. Os três
 * desenhavam exatamente o mesmo número de triângulos. Remasterizar
 * o `aero` onde ele mora teria mudado o Criador junto — por isso
 * este arquivo existe e `aero` sai do marco intocado.
 *
 * A base é **pano**. Lição paga caro no marco da Akemi: pôr o traje
 * inteiro em `Finish.Glass` marcou a perna toda como vidro, porque
 * `subdivideProfile` descarta o acabamento e trava o anel na estação
 * mais próxima. Aqui o vidro e o holograma entram peça a peça.
 */
function buildSystemSuit(
  b: SurfaceBuilder,
  m: BodyMetrics,
  detail: BodyDetail,
  torso: readonly [number, number, number],
  hip: readonly [number, number, number],
): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  const quadril = { skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip } as const;
  const prata = 0xc9d8e8;
  const ciano = 0x45e7ff;
  // Azul fundo tirado da paleta canônica dela (`colors[1]`), não
  // inventado: é o que amarra o traje à ficha.
  const azul = 0x1b82ea;

  // --- o emblema do infinito ---
  //
  // A Haru é a primeira deusa autista do Panteão. O símbolo é o
  // **infinito**, que é o endossado pela comunidade autista. A peça
  // de quebra-cabeça não é usada aqui e não deve ser: boa parte da
  // comunidade a rejeita por associação histórica a campanhas de
  // "cura", e estampá-la numa personagem seria o oposto de
  // respeitoso.
  //
  // Discreto, do tamanho de um distintivo, e **vivo em todos os
  // níveis de LOD** — é marca de identidade, não ornamento, e segue
  // a mesma regra da pata da Saturno.
  //
  // Medido na malha: a frente do torso chega a `z = 0,1114` nesta
  // altura. No marco da Akemi o laço foi parar em `0,082` e ficou
  // enterrado dentro do tronco: existia, custava triângulos e não
  // aparecia. A cota abaixo sai da sonda, não de uma conta.
  // Fica **alto**, na linha da clavícula, como um distintivo de
  // uniforme. A primeira versão o pôs no meio do peito com traços de
  // circuito em volta, e o conjunto leu como uma carinha: os dois
  // aros viraram olhos e o traço horizontal virou boca.
  const emblemaY = 0.352;
  const emblemaZ = 0.1;
  const aro = Math.max(6, Math.round(detail.segments * 0.4));
  for (const side of [-1, 1]) {
    const anel = new THREE.TorusGeometry(0.019, 0.006, 4, aro);
    b.addGeometry(
      anel,
      { color: ciano, finish: Finish.Holo, ...chest },
      new THREE.Matrix4().makeTranslation(side * 0.017, emblemaY, emblemaZ),
    );
  }

  if (detail.segments < 14) return;

  // --- as ombreiras prateadas ---
  //
  // Dão a superfície dura de equipamento e impedem que o grafite
  // leia como moletom. Havia também uma placa no peito, removida: ela
  // atravessava o tronco de ombro a ombro e lia como babador.
  for (const side of [-1, 1]) {
    b.addGeometry(
      new THREE.BoxGeometry(0.075, 0.055, 0.095),
      { color: prata, finish: Finish.Shine, ...chest },
      new THREE.Matrix4().makeRotationZ(side * 0.22).setPosition(side * m.shoulderX * 0.82, 0.345, 0.0),
    );
  }

  /** Um traço de circuito: caixa fina e acesa, colada na superfície. */
  const traco = (
    x: number,
    y: number,
    z: number,
    comprimento: number,
    vertical: boolean,
    cor: Hex,
    origem: typeof chest | typeof quadril,
  ): void => {
    const g = vertical
      ? new THREE.BoxGeometry(0.009, comprimento, 0.008)
      : new THREE.BoxGeometry(comprimento, 0.009, 0.008);
    b.addGeometry(g, { color: cor, finish: Finish.Holo, ...origem }, new THREE.Matrix4().makeTranslation(x, y, z));
  };

  // --- os traços de circuito ---
  //
  // O pedido literal do briefing: circuitos luminosos integrados ao
  // vestuário. Eles correm em ângulos retos, como trilha de placa —
  // linha curva leria como costura, e costura não é circuito.
  //
  // Ficam na **frente** e nas laterais do tronco, onde a câmera do
  // jogo os vê. Atrás seria gasto puro.
  const zFrente = 0.098;
  // A trilha do peito corre **de um lado só**. Par simétrico de
  // traços em volta do emblema é exatamente o que a bancada leu como
  // rosto na primeira rodada: dois aros viraram olhos, o degrau
  // horizontal virou boca. Assimetria mata a leitura e ainda rima
  // com a mecha assimétrica do cabelo.
  const ladoTrilha = -1;
  traco(ladoTrilha * 0.086, 0.252, zFrente - 0.008, 0.132, true, ciano, chest);
  traco(ladoTrilha * 0.06, 0.186, zFrente - 0.004, 0.052, false, azul, chest);
  // O nó: um quadradinho aceso onde a trilha dobra.
  b.addGeometry(
    new THREE.BoxGeometry(0.015, 0.015, 0.009),
    { color: ciano, finish: Finish.Holo, ...chest },
    new THREE.Matrix4().makeTranslation(ladoTrilha * 0.086, 0.186, zFrente - 0.006),
  );
  for (const side of [-1, 1]) {
    // A trilha do braço, na face externa, onde ela aparece de frente
    // e de perfil. O corredor do braço vai de 0,13 a 0,28 em |x|.
    // Esta pode ser simétrica: longe do eixo, não forma cara.
    traco(side * 0.214, 0.26, 0.012, 0.15, true, ciano, chest);
    traco(side * 0.214, 0.335, 0.012, 0.042, false, azul, chest);
    // A trilha da coxa.
    traco(side * 0.105, -0.3, 0.052, 0.17, true, azul, quadril);
  }

  // A faixa da cintura, que separa o tronco da calça e fecha o
  // circuito dos dois lados.
  b.addGeometry(
    flatRing(m.waistWidth * 1.05, WAIST_DEPTH, 0.022, Math.max(12, detail.segments)),
    { color: prata, finish: Finish.Shine, ...chest },
    new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.135, 0),
  );
  b.addGeometry(
    new THREE.BoxGeometry(0.044, 0.016, 0.014),
    { color: ciano, finish: Finish.Holo, ...chest },
    new THREE.Matrix4().makeTranslation(0, 0.135, m.waistWidth * WAIST_DEPTH + 0.011),
  );
}

/**
 * O Traje Jardim, da Maze — Deusa da Natureza.
 *
 * A arte mostra um drapeado **branco translúcido** com folhagem verde
 * correndo por cima, e é essa a leitura: o pano é claro, a vida é que
 * é verde. O `vestido` que ela usava era verde-menta liso dos dois
 * lados, e o resultado era uma figura de uma cor só.
 *
 * A folha aqui é **pano** (`Finish.Cloth`), não vidro. Não é detalhe
 * de gosto: a Saturno já usa folha de **vidro** verde, e o relatório
 * do marco dela registrou a divisão por escrito — o eixo da Saturno é
 * animal e a vegetação dela é ornamento translúcido; o eixo da Maze é
 * vegetal e a folha dela é matéria viva. Duas deusas de natureza no
 * mesmo elenco só funcionam se o material separar as duas de perto,
 * já que de longe ambas são verdes.
 *
 * O pano claro não é pintado aqui: ele vem de `topColor`, pelas
 * varreduras do tronco e por `buildSkirt`. Esta função só acrescenta
 * a vida por cima, e as cores dela saem da paleta canônica da ficha
 * (`colors`), não dos campos de roupa — é o que garante que a
 * folhagem continue verde mesmo que alguém vista o traje noutra cor.
 *
 * O que acende é a **nervura** (`Finish.Holo`), fina, e as **gotas de
 * água** são o único vidro da peça. O briefing pede acabamento
 * Frutiger Aero e avisa contra transformá-la em personagem
 * tecnológica: a saída é que o brilho venha de seiva e de água, nunca
 * de circuito. Traço reto, placa e painel são vocabulário da Haru e
 * da Nexara, e não entram aqui.
 */
/**
 * O Traje Lumen — da Júpiter, Deusa da Arte e da Criação Estética.
 *
 * O nome vem do **Pavilhão Lumen**, a galeria holográfica dela, que
 * já estava na ficha e no diário muito antes deste marco. O traje é
 * a obra que ela veste.
 *
 * Ela usava o `vestido`, genérico, laranja chapado, com um
 * `bottomColor` azul-escuro que **não aparecia em lugar nenhum da
 * malha**. O `vestido` não foi tocado: é peça de habitante, e
 * continua inteiro para quem o herda.
 *
 * Três camadas, nesta ordem: o drapeado claro, que é a tela; as
 * **fitas de cor** enroladas no corpo, que são a assinatura escolhida
 * pelo Criador, carregando o gradiente pêssego → laranja → vermelho
 * da paleta canônica; e os fios de ouro que correm na borda delas.
 *
 * O ouro é fino por fronteira, não por gosto: ouro **em massa** —
 * galhada, folha, pata — é da Saturno, a vizinha quente dela no
 * elenco. Aqui ele é traço de tinta.
 */
function buildLumenSuit(
  b: SurfaceBuilder,
  _m: BodyMetrics,
  detail: BodyDetail,
  torso: readonly [number, number, number],
  hip: readonly [number, number, number],
): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  const quadril = { skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip } as const;
  // O gradiente sai da paleta canônica da ficha (`colors`), não dos
  // campos de roupa: é o que garante que ela siga sendo a deusa
  // vermelha mesmo que alguém vista o traje noutra cor.
  const pessego = 0xffb199;
  const laranja = 0xff8a4a;
  const vermelho = 0xc0392b;
  const ouro = 0xf0c95a;
  const gradiente = (t: number): Hex => (t < 0.4 ? pessego : t < 0.74 ? laranja : vermelho);

  /**
   * Uma fita enrolada no corpo.
   *
   * O primeiro esboço errou o eixo: pôs a largura da fita na tangente
   * do anel **horizontal**, não na perpendicular ao caminho que ela
   * percorre. Como o caminho desce em espiral, cada trecho projetava
   * uma aba para o lado, e a bancada devolveu uma serrilha que lia
   * como **folha de palmeira** — justamente a leitura que a fronteira
   * com a Saturno proíbe. A torção também reiniciava em cada trecho,
   * o que serrilhava as junções.
   *
   * Agora o perfil é carregado por um triedro montado no ponto: `T`
   * na direção de avanço, `N` radial (para fora do corpo), `W` no
   * plano tangente, perpendicular ao avanço. A torção gira `W` e `N`
   * em torno de `T`, e é **contínua** em `t`, de modo que os cantos
   * de um trecho são exatamente os do seguinte.
   */
  const fita = (
    aIni: number,
    yIni: number,
    aFim: number,
    yFim: number,
    passos: number,
    larg: number,
    raioEm: (y: number, a: number) => number,
    origem: typeof chest | typeof quadril,
    /** Fita de ouro: lisa, fina, sem gradiente. */
    ouroJunto: boolean,
    giro = 0.7,
    /** Deslocamento na direção da largura: põe o fio de ouro na borda da faixa. */
    lateral = 0,
    /** Cor própria, quando o gradiente de ponta a ponta não serve. */
    corDe?: (t: number) => Hex,
  ): void => {
    const esp = 0.008;
    const ponto = (t: number): readonly [number, number, number] => {
      const a = aIni + (aFim - aIni) * t;
      const y = yIni + (yFim - yIni) * t;
      const r = raioEm(y, a);
      return [Math.sin(a) * r, y, Math.cos(a) * r];
    };
    /** Os quatro cantos do perfil em `t` — só função de `t`, e por isso as junções fecham. */
    const cantos = (t: number, meiaLarg: number, desloc: number): number[][] => {
      const p = ponto(t);
      const q = ponto(Math.min(1, t + 0.004));
      const o = ponto(Math.max(0, t - 0.004));
      // Avanço.
      let tx = q[0] - o[0];
      let ty = q[1] - o[1];
      let tz = q[2] - o[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // Radial, para fora do corpo.
      const rl = Math.hypot(p[0], p[2]) || 1;
      const nx = p[0] / rl;
      const nz = p[2] / rl;
      // Largura = N × T, no plano tangente.
      let wx = -ty * nz;
      let wy = nz * tx - nx * tz;
      let wz = nx * ty;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl;
      wy /= wl;
      wz /= wl;
      // A torção acumula ao longo da fita: ela vira de lado no meio do
      // caminho, como tecido que escorrega no corpo.
      const tw = Math.sin(t * Math.PI) * giro;
      const c = Math.cos(tw);
      const sn = Math.sin(tw);
      const ux = wx * c + nx * sn;
      const uy = wy * c;
      const uz = wz * c + nz * sn;
      const vx = -wx * sn + nx * c;
      const vy = -wy * sn;
      const vz = -wz * sn + nz * c;
      return [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([u, w]) => [
        p[0] + ux * (u * meiaLarg + lateral) + vx * (w * esp + desloc),
        p[1] + uy * (u * meiaLarg + lateral) + vy * (w * esp + desloc),
        p[2] + uz * (u * meiaLarg + lateral) + vz * (w * esp + desloc),
      ]);
    };

    const tira = (meiaLarg: number, desloc: number, cor: (t: number) => Hex, acab: number): void => {
      for (let i = 0; i < passos; i += 1) {
        const t0 = i / passos;
        const t1 = (i + 1) / passos;
        const a = cantos(t0, meiaLarg, desloc);
        const z = cantos(t1, meiaLarg, desloc);
        const v: number[] = [];
        for (const c of [...a, ...z]) v.push(c[0], c[1], c[2]);
        const idx: number[] = [];
        for (let k = 0; k < 4; k += 1) {
          const k2 = (k + 1) % 4;
          // Prisma fechado: as quatro faces laterais bastam, e a fita
          // tem interior — não é um plano, que sob luz difusa leria
          // como cartolina em vez de pano.
          idx.push(k, k2, 4 + k2, k, 4 + k2, 4 + k);
        }
        // Tampas nas duas pontas, para a fita não mostrar o oco.
        if (i === 0) idx.push(0, 2, 1, 0, 3, 2);
        if (i === passos - 1) idx.push(4, 5, 6, 4, 6, 7);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        b.addGeometry(g, { color: cor(t0), finish: acab, ...origem }, new THREE.Matrix4());
      }
    };

    if (ouroJunto) tira(larg, 0, () => ouro, Finish.Shine);
    else tira(larg, 0, corDe ?? gradiente, Finish.Cloth);
  };

  // O torso do Éden é uma **elipse de 2,3 : 1** — varrido nesta malha
  // vestida, `rx = 0,2485` contra `rz = 0,1002` na altura do busto. A
  // primeira rodada usou raio circular, e a fita boiava à frente do
  // peito e afundava no pano nas laterais. Daí o raio por azimute.
  //
  // O `rx` usado é bem menor que o do pano, de propósito: os braços
  // caem ao lado do corpo em `|x| = 0,212`, e uma fita no raio real
  // do torso atravessaria os dois. Por dentro deles, ela desaparece
  // atrás do braço — que é o que o olho espera de uma fita enrolada.
  const elipse = (rx: number, rz: number, a: number): number => {
    const sx = Math.sin(a) / rx;
    const sz = Math.cos(a) / rz;
    return 1 / Math.sqrt(sx * sx + sz * sz);
  };
  const raioTronco = (y: number, a: number): number =>
    elipse(0.175, 0.1135 - 0.026 * smoothstep(0.3, 0.45, y) - 0.012 * smoothstep(0.18, 0.1, y), a) + 0.011;
  // A cintura é mais funda que o busto: 0,1484 contra 0,1002.
  const raioCintura = (y: number, a: number): number => elipse(0.19, 0.152 + 0.02 * smoothstep(0.08, 0.0, y), a) + 0.012;
  // Varrido na malha vestida, com a barra `SKIRT_HEM_Y`: o pano vai
  // de `0,2328 × 0,2164` em `y = −0,12` a `0,3497 × 0,3287` na barra.
  // Nunca tirar do perfil de controle de `buildSkirt`, que mente —
  // foi assim que as folhas da Saturno nasceram dentro do pano.
  const raioSaia = (y: number, a: number): number => {
    const k = Math.min(1, Math.max(0, (y - -0.1) / (-0.34 - -0.1)));
    return elipse(0.2328 + 0.1169 * k, 0.2164 + 0.1123 * k, a) + 0.006;
  };
  const passos = (n: number): number => Math.max(6, Math.round(n * Math.max(7, detail.segments * 0.34)));

  // --- a faixa do ombro ---
  //
  // Larga, diagonal, do ombro esquerdo ao quadril direito. Larga é o
  // que importa: na terceira rodada esta mesma diagonal tinha cinco
  // centímetros e lia como **alça de bolsa a tiracolo**, com o fio de
  // ouro correndo no meio dela a fazer de zíper.
  //
  // A quarta rodada tentou o oposto — uma espiral de duas voltas e
  // meia, horizontal — e saiu pior: cintas paralelas ao chão leem
  // como as argolas de um barril, e a deusa virou múmia. Era o risco
  // nº 1 anotado no plano, e ele se confirmou na bancada.
  // Termina em `y = 0,075`, **por baixo** da faixa de cintura: na
  // nona rodada ela parava em −0,04, por cima de tudo, e a ponta
  // ficava como um bloco vermelho solto na frente do quadril.
  const ombroFim = 2.35;
  fita(-0.85, 0.47, ombroFim, 0.075, passos(1.05), 0.052, raioTronco, chest, false, 0.45);

  if (detail.segments < 14) return;

  // --- a faixa de cintura ---
  //
  // Volta inteira, na emenda entre o corpete e a saia. Além de ser a
  // peça que amarra o traje, ela esconde o degrau que o drapeado
  // deixa ali.
  // Altura constante e volta exata, para que o fim encoste no
  // começo: na décima rodada ela descia enquanto girava, e as duas
  // pontas não se encontravam — sobrava uma tampa vermelha solta na
  // frente do quadril. A cor vai e volta pelo gradiente pelo mesmo
  // motivo: assim a emenda não tem degrau de cor.
  fita(0.2, 0.075, 0.2 + TAU, 0.075, passos(1.0), 0.032, raioCintura, chest, false, 0.18, 0, (t) =>
    gradiente(0.42 + 0.46 * Math.sin(t * Math.PI)),
  );

  // --- as pontas soltas ---
  //
  // Caem da cintura pela saia. São elas que impedem o traje de ler
  // como embalagem: alguma coisa tem de escapar do corpo. Cada uma
  // afasta-se um pouco do pano ao descer, como tecido que não cola.
  // Caem à frente e pelas costas, **nunca pelos lados**: ali é onde
  // os braços descem e as mãos param, e a rodada anterior pôs duas
  // abas de pano exatamente por cima delas.
  for (const [az, alc, larg] of [
    [0.33, -0.3, 0.021],
    [-0.42, -0.23, 0.015],
    [3.05, -0.27, 0.019],
  ] as const) {
    const solta = (y: number, a: number): number => raioSaia(y, a) + 0.014 * smoothstep(0.04, alc, y);
    fita(az, 0.035, az + 0.5, alc, passos(0.85), larg, solta, quadril, false, 1.15);
  }

  if (detail.segments < 20) return;

  // --- as fitas de ouro ---
  //
  // Finas por fronteira, não por gosto: ouro **em massa** — galhada,
  // folha, pata — é da Saturno, a vizinha quente dela no elenco.
  // Aqui ele é traço de tinta.
  // Debrum: o fio corre nas **bordas** da faixa, não no meio dela.
  // Na terceira rodada ele nascia no centro e lia como o zíper de uma
  // bolsa; na quinta, ainda era uma listra solta sobre o pano.
  for (const lado of [-1, 1]) {
    fita(-0.85, 0.47, ombroFim, 0.075, passos(1.05), 0.0055, raioTronco, chest, true, 0.45, lado * 0.0495);
  }
  fita(0.2, 0.075, 0.2 + TAU, 0.075, passos(1.0), 0.005, raioCintura, chest, true, 0.18, 0.0295);

  // --- as pregas da saia ---
  //
  // Relevo, que custa **zero** triângulo: `feature()` empurra
  // vértices que já existem. Sem elas o drapeado branco lê como um
  // abajur — superfície larga e lisa, sob luz difusa, não tem como
  // dizer que é pano.
  //
  // Ficam todas acima de `|x| = 0,2`, bem longe das pernas, que
  // correm em torno do eixo: na Akemi um campo de relevo largo
  // demais empurrou a cabeça 35 mm para fora.
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * TAU + 0.26;
    for (const y of [-0.13, -0.22, -0.31]) {
      const r = raioSaia(y, a) - 0.008;
      // Amplitude de 2,4 cm: o empurrão de `feature()` é pesado por
      // `exp(-d²·1,4)`, e a primeira tentativa, de 1,2 cm, não
      // apareceu em captura nenhuma.
      b.feature([Math.sin(a) * r, y, Math.cos(a) * r], [0.05, 0.09, 0.05], 0.024, [Math.sin(a), 0, Math.cos(a)]);
    }
  }

  // --- as nervuras de luz ---
  //
  // Curtas e poucas. É o que faz o traje acender à noite — a galeria
  // dela muda com a luz do dia, e a roupa faz o mesmo — sem virar
  // pisca-pisca.
  for (let i = 0; i < 5; i += 1) {
    const a = -0.75 + (i / 4) * 2.7;
    const y = 0.4 - (i / 4) * 0.22;
    const r = raioTronco(y, a) * 1.02;
    b.addGeometry(
      new THREE.BoxGeometry(0.045, 0.004, 0.005),
      { color: 0xffd1a8, finish: Finish.Holo, ...chest },
      new THREE.Matrix4().makeRotationY(a).setPosition(Math.sin(a) * r, y, Math.cos(a) * r),
    );
  }
}

function buildGardenSuit(
  b: SurfaceBuilder,
  m: BodyMetrics,
  detail: BodyDetail,
  torso: readonly [number, number, number],
  hip: readonly [number, number, number],
): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  const quadril = { skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip } as const;
  // Verdes da paleta canônica dela (`colors`), não inventados: é o que
  // amarra o traje à ficha.
  const folha = 0x3fa96b;
  const folhaClara = 0x9df0b0;
  const seiva = 0x6cf5a8;

  /**
   * Uma folha: losango achatado, encostado na superfície.
   *
   * `rot` gira a folha no plano da peça, para que a nervura aponte
   * para onde o galho cresce. Folha toda na mesma direção lê como
   * escama.
   */
  const folhaEm = (
    x: number,
    y: number,
    z: number,
    comprimento: number,
    rot: number,
    cor: Hex,
    origem: typeof chest | typeof quadril,
  ): void => {
    const g = new THREE.BoxGeometry(comprimento * 0.42, comprimento, 0.008);
    // Os quatro cantos recuados: um losango lê como folha, uma caixa
    // lê como etiqueta costurada.
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const py = pos.getY(i);
      const k = 1 - Math.abs(py) / (comprimento * 0.5);
      pos.setX(i, pos.getX(i) * (0.25 + 0.75 * k));
    }
    pos.needsUpdate = true;
    b.addGeometry(
      g,
      { color: cor, finish: Finish.Cloth, ...origem },
      new THREE.Matrix4().makeRotationZ(rot).setPosition(x, y, z),
    );
  };

  /**
   * Uma folha assentada num corpo de revolução — a saia.
   *
   * Diferente de `folhaEm`, que encosta a folha num plano frontal:
   * aqui ela tem de girar com o azimute para acompanhar a curva, ou
   * nasce de perfil e some.
   */
  const folhaNaSaia = (
    az: number,
    y: number,
    raio: number,
    comprimento: number,
    inclina: number,
    cor: Hex,
  ): void => {
    const g = new THREE.BoxGeometry(comprimento * 0.6, comprimento, 0.009);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const k = Math.cos((pos.getY(i) / comprimento) * Math.PI) * 0.5 + 0.5;
      pos.setX(i, pos.getX(i) * (0.18 + 0.95 * k));
      pos.setZ(i, pos.getZ(i) + Math.abs(pos.getX(i)) * 0.35);
    }
    pos.needsUpdate = true;
    b.addGeometry(
      g,
      { color: cor, finish: Finish.Cloth, ...quadril },
      new THREE.Matrix4()
        .makeRotationY(az)
        .multiply(new THREE.Matrix4().makeRotationZ(inclina))
        .setPosition(Math.sin(az) * raio, y, Math.cos(az) * raio),
    );
  };

  // --- a faixa de folhagem no tronco ---
  //
  // Cruza o peito **na diagonal**, de um ombro à cintura oposta. A
  // assimetria é deliberada e foi aprendida caro no marco da Haru:
  // peça simétrica no meio do peito lê como rosto, e um par de folhas
  // em volta do esterno viraria dois olhos.
  //
  // Medido na malha: a frente do torso chega a `z = 0,1120` em
  // `y = 0,2744`. As folhas saem à frente disso.
  const zFrente = 0.104;
  const ombro = m.shoulderX * 0.78;
  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    // Do ombro esquerdo (alto) à cintura direita (baixo).
    const x = -ombro + (ombro * 1.5) * t;
    const y = 0.38 - 0.23 * t;
    const z = zFrente - 0.012 * Math.abs(x) * 6;
    const tamanho = 0.108 - 0.026 * t;
    folhaEm(x, y, z, tamanho, -0.95 + 0.5 * t, i % 2 === 0 ? folha : folhaClara, chest);
  }

  if (detail.segments < 14) return;

  // --- a gola de folhas ---
  //
  // Anel completo na linha do pescoço, à frente **e** atrás. Duas
  // placas soltas na frente do peito não são uma gola — foi a lição
  // do marco da Lilly, e a primeira versão da gola da Saturno repetiu
  // o erro ao contrário, pondo tudo nas costas.
  const golaR = m.neckR * 1.5;
  const golaN = Math.max(7, Math.round(detail.segments * 0.4));
  for (let i = 0; i < golaN; i += 1) {
    const a = (i / golaN) * TAU;
    folhaEm(
      Math.sin(a) * golaR,
      m.neckY - 0.052,
      Math.cos(a) * golaR * 0.72,
      0.052,
      Math.sin(a) * 0.7,
      i % 3 === 0 ? folhaClara : folha,
      chest,
    );
  }

  // --- as nervuras acesas ---
  //
  // Finas, correndo junto da faixa. São o que faz a folhagem ler como
  // viva à noite, quando o pano branco apaga.
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const x = -ombro * 0.92 + (ombro * 1.42) * t;
    const y = 0.365 - 0.215 * t;
    b.addGeometry(
      new THREE.BoxGeometry(0.052, 0.005, 0.006),
      { color: seiva, finish: Finish.Holo, ...chest },
      new THREE.Matrix4().makeRotationZ(-0.95 + 0.5 * t).setPosition(x, y, zFrente - 0.012 * Math.abs(x) * 6 + 0.006),
    );
  }

  // --- a cinta de vinha ---
  //
  // Marca a cintura e fecha a diagonal dos dois lados, para a faixa
  // não terminar no ar.
  b.addGeometry(
    flatRing(m.waistWidth * 1.05, WAIST_DEPTH, 0.016, Math.max(12, detail.segments)),
    { color: folha, finish: Finish.Cloth, ...chest },
    new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.142, 0),
  );

  // --- as vinhas da barra ---
  //
  // O erro mais caro do marco da Saturno, e a razão de a cota abaixo
  // ser medida e não calculada: `buildSkirt` escreve um perfil de
  // controle cuja barra vale `hipWidth · 1,22`, mas a saia que sai do
  // forno é muito maior — a varredura e a zona de morfologia abrem
  // mais que o perfil sugere. Lá as folhas nasceram enterradas dentro
  // do pano, invisíveis e pagas.
  //
  // E a medida tem de ser **desta** saia. A primeira versão herdou o
  // número do marco da Saturno — raio 0,3497 em `y = −0,36` — mas
  // aquilo era a barra `SKIRT_HEM_Y`. O Traje Jardim usa
  // `GOWN_HEM_Y`, que desce a −0,46 e abre muito mais. Varrido na
  // malha vestida, o raio real por altura é:
  //
  //     y −0,20 → 0,2758    y −0,32 → 0,3412
  //     y −0,24 → 0,2931    y −0,36 → 0,3797
  //     y −0,28 → 0,3113    y −0,44 → 0,4084
  //
  // As folhas da primeira versão, em 0,368 na altura −0,40, estavam
  // **dentro** do pano. O mesmo erro, na mesma peça, por confiar num
  // número de segunda mão.
  const raioDaSaia = (y: number): number =>
    0.2758 + (0.4084 - 0.2758) * smoothstep(-0.2, -0.44, y);

  if (detail.segments >= 14) {
    const vinhaN = Math.max(8, Math.round(detail.segments * 0.5));
    for (let i = 0; i < vinhaN; i += 1) {
      const a = (i / vinhaN) * TAU;
      const y = -0.395 - 0.045 * Math.abs(Math.sin(i * 1.7));
      const r = raioDaSaia(y) + 0.016 + 0.01 * Math.sin(i * 2.3);
      folhaEm(Math.sin(a) * r, y, Math.cos(a) * r, 0.082, Math.sin(a) * 0.5, i % 2 === 0 ? folha : folhaClara, quadril);
    }

    // --- a folhagem que cai sobre a saia ---
    //
    // Esta é a terceira versão desta peça, e as duas anteriores foram
    // descartadas na bancada, não no papel.
    //
    // A ideia original era um drapeado de pano: pregas de tecido
    // verde caindo da cintura sobre o branco, como na arte. Foi
    // tentada com trapézios planos (saiu uma saia de bandeirinhas de
    // festa junina), depois com pregas de barriga e bico (saiu uma
    // franja havaiana), depois com barra arredondada e frente aberta
    // (saíram placas de papel coladas no quadril).
    //
    // A conclusão é sobre o motor, não sobre a arte: superfície plana
    // e larga, sob luz difusa e sem textura, não lê como pano — lê
    // como cartolina. O vocabulário que este render desenha bem é o
    // que o resto do Éden usa, a **folha** de volume próprio. Então a
    // folhagem da arte vira folhagem de verdade: folhas grandes
    // caindo em camadas sobre o branco, densas atrás e nos lados,
    // ralas na frente, como hera crescendo por cima do vestido.
    //
    // Quarta versão, e a lição é de composição, não de geometria: a
    // terceira espalhou folhas em três anéis regulares por toda a
    // saia e a bancada devolveu confete verde — manchas sem desenho,
    // e um vazio branco no meio.
    //
    // A arte não tem folhagem distribuída. Tem uma **cascata**: a
    // vegetação desce por um lado, contínua, como hera que subiu pelo
    // vestido. Então é isso que ela ganha — uma linha só, grossa,
    // descendo em espiral do quadril à barra, do mesmo lado onde a
    // faixa do peito termina. Tronco e saia passam a ler como uma
    // peça, não duas.
    //
    // A contagem é baixa de propósito. A primeira cascata usou
    // `segments · 0,6` — vinte e seis nós espremidos em trinta
    // centímetros de queda — e virou um arbusto colado no quadril.
    // Hera tem espaço entre os nós.
    const cascataN = Math.max(7, Math.round(detail.segments * 0.25));
    for (let i = 0; i < cascataN; i += 1) {
      const t = i / (cascataN - 1);
      // Continua a diagonal do peito, que morre na cintura direita.
      // Começa quase de frente, onde a diagonal do peito morre, e
      // some girando para trás. A primeira volta começava em 0,95 e
      // escondia a cascata inteira atrás do quadril: de frente ela
      // era um vestido branco liso.
      // Giro curto. Com duas voltas e meia de espiral a cascata
      // enrolava no quadril e virava um buquê preso na cintura: os
      // nós da frente ficavam todos na mesma altura e nenhum descia.
      // Hera cai mais do que contorna.
      const az = 0.58 + t * 1.15;
      const y = -0.115 - t * 0.34;
      const jitter = Math.sin(i * 2.9);
      // Três folhas por nó, abertas em leque: hera cresce em tufo, e
      // folha solta em fila vira pontilhado.
      for (const ramo of [-1, 0, 1]) {
        if (ramo !== 0 && i % 2 === 1) continue;
        const azF = az + ramo * 0.3 + jitter * 0.06;
        const yF = y + ramo * 0.012 + jitter * 0.014;
        const tam = (0.185 - 0.06 * t) * (ramo === 0 ? 1 : 0.72);
        folhaNaSaia(
          azF,
          yF,
          raioDaSaia(yF) + 0.015 + 0.01 * Math.abs(ramo),
          tam,
          Math.PI + ramo * 0.5 + jitter * 0.3,
          (i + ramo) % 3 === 0 ? folhaClara : folha,
        );
      }
    }

    // Do lado oposto, três folhas soltas e pequenas: o bastante para
    // a cascata não parecer colada num manequim simétrico, longe de
    // encher o outro lado.
    for (const [az, y, tam] of [
      [-1.0, -0.18, 0.115],
      [-1.5, -0.27, 0.1],
      [-2.25, -0.34, 0.085],
      [-0.62, -0.33, 0.078],
    ] as const) {
      folhaNaSaia(az, y, raioDaSaia(y) + 0.015, tam, Math.PI + 0.4, folha);
    }

    // A nervura acesa que desce entre as folhas. Poucas: é o que
    // faz o pano ler como vivo sem virar pisca-pisca.
    if (detail.segments >= 20) {
      for (let i = 0; i < 4; i += 1) {
        const t = 0.12 + i * 0.26;
        const a = 1.15 + t * 2.0;
        const y = -0.125 - t * 0.3;
        const r = raioDaSaia(y) + 0.05;
        b.addGeometry(
          new THREE.BoxGeometry(0.006, 0.1, 0.005),
          { color: seiva, finish: Finish.Holo, ...quadril },
          new THREE.Matrix4().makeRotationY(a).setPosition(Math.sin(a) * r, y, Math.cos(a) * r),
        );
      }
    }
  }

  if (detail.segments < 20) return;

  // --- as gotas de água ---
  //
  // O único vidro da peça, e é **água**, não folha: a folha de vidro é
  // da Saturno. Poucas e pequenas — água em excesso vira lantejoula.
  const gota = (x: number, y: number, z: number, r: number, origem: typeof chest | typeof quadril): void => {
    b.ball([x, y, z], [r, r * 1.35, r], { color: 0xd6fff0, finish: Finish.Glass, ...origem }, 5);
  };
  for (const side of [-1, 1]) {
    gota(side * m.shoulderX * 0.74, 0.355, 0.028, 0.013, chest);
  }
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + 0.4;
    const y = -0.432;
    const r = raioDaSaia(y) + 0.022;
    gota(Math.sin(a) * r, y, Math.cos(a) * r, 0.013, quadril);
  }
}

function buildSonoraSuit(
  b: SurfaceBuilder,
  m: BodyMetrics,
  detail: BodyDetail,
  top: Hex,
  accent: Hex,
  torso: readonly [number, number, number],
  hip: readonly [number, number, number],
): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  const magenta = 0xff5ecf;
  const turquesa = 0x2ee8c0;

  // A costura da jaqueta: a linha acesa que desce do peito à cintura.
  // Fina de propósito — a arte mostra um fio de luz, não uma faixa.
  b.addGeometry(
    new THREE.BoxGeometry(0.011, 0.19, 0.008),
    { color: accent, finish: Finish.Holo, ...chest },
    new THREE.Matrix4().makeTranslation(0, 0.3, 0.084),
  );

  // Duas linhas curtas sobre os ombros, no mesmo fio de luz. Elas
  // fazem o contorno da jaqueta aparecer de costas, que é de onde a
  // silhueta escura some contra o fundo escuro.
  for (const side of [1, -1]) {
    b.addGeometry(
      new THREE.BoxGeometry(0.052, 0.009, 0.009),
      { color: accent, finish: Finish.Holo, ...chest },
      new THREE.Matrix4().makeTranslation(side * m.shoulderX * 0.62, m.waist + m.shoulderY - 0.012, 0.02),
    );
  }

  // O cinto de cristal, achatado como o tronco: um aro circular num
  // corpo elíptico ou enterra nos flancos ou flutua na barriga.
  const belt = flatRing(m.waistWidth * 1.07, WAIST_DEPTH, 0.015, Math.max(12, detail.segments));
  b.addGeometry(belt, { color: shade(top, 0.22), finish: Finish.Glass, ...chest }, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.15, 0));
  // O cristal da fivela: o ponto de magenta que a arte põe no centro.
  b.ball([0, 0.15, 0.085], [0.017, 0.024, 0.013], { color: magenta, finish: Finish.Holo, ...chest }, 6);

  // --- o equalizador radial ---
  //
  // Só de `segments >= 14` para cima. No LOD distante ele não seria
  // visto, e é lá que o orçamento aperta: dezenas de habitantes em
  // cena ao mesmo tempo.
  if (detail.segments < 14) return;
  // Densidade: com vinte barras a volta de dezessete centímetros
  // deixava seis centímetros de vão entre uma e outra, e o que
  // se via na tela era confete pregado na saia. Espectro se lê
  // quando barra e vão têm a mesma ordem de grandeza.
  const bars = detail.segments >= 26 ? 30 : 18;

  // Onde a coroa mora, e por que não no quadril.
  //
  // A primeira versão pôs as barras em `hipWidth * 1,1`, à altura do
  // cinto. Medido depois: nessa faixa a saia tem raio `0,24` e as
  // barras, `0,18`. O equalizador inteiro estava **dentro** do
  // tecido — construído, pago em triângulos, invisível.
  //
  // A coroa desceu para a linha da coxa e passou a sentar na
  // superfície do manto, que é um cone: entre `y = −0,14` e
  // `y = −0,30` o raio abre meio centímetro por centímetro descido.
  // Uma barra vertical encostada em cima desse cone afasta do pano
  // conforme desce; por isso cada barra é **inclinada** no mesmo
  // ângulo do cone e cresce rampa abaixo, e não para o chão.
  // Inclinação medida na malha pronta, não estimada: entre
  // `y = −0,15` e `y = −0,25` o manto abre `0,058` em `0,10` de
  // queda. Com `0,50` — o primeiro palpite — a ponta das barras
  // mais longas afundava no pano trinta centésimos abaixo.
  const slope = 0.62;
  const tilt = Math.atan(slope);
  const yTop = -0.12;
  // Raio do manto no topo da coroa, medido na malha construída.
  const rx0 = m.hipWidth * 1.496;
  const rz0 = m.hipWidth * 1.356;
  // Passo descido ao longo da geratriz, decomposto em raio e altura.
  const dr = slope / Math.hypot(slope, 1);
  const dy = 1 / Math.hypot(slope, 1);
  for (let i = 0; i < bars; i += 1) {
    const az = (i / bars) * Math.PI * 2;
    // A altura vem de uma onda amostrada, não de um sorteio: uma
    // coroa aleatória lê como cerca quebrada, e uma coroa de altura
    // constante lê como franja. O que lê como espectro é uma curva —
    // duas senoides de períodos diferentes, que é o suficiente para
    // nenhum vizinho repetir o vizinho e o conjunto ainda assim
    // parecer uma leitura, e não ruído.
    const onda = 0.5 + 0.5 * Math.sin(i * 2.399 + Math.cos(i * 1.1));
    const len = 0.035 + 0.085 * onda;
    // Largura: a barra tem de ser mais larga que o fio da costura,
    // senão a coroa lê como franja de cordinhas. Com vinte barras a
    // volta mede dezesseis centímetros, e `0,024` deixa vão visível
    // entre uma e outra — barra e silêncio, que é o que faz um
    // espectro ser lido como espectro.
    const bar = new THREE.BoxGeometry(0.03, len, 0.012);
    // A cor da barra, em três degraus — e por que não num degradê.
    //
    // A primeira versão interpolava ciano em magenta conforme a
    // altura. Mas o caminho entre essas duas cores no espaço RGB
    // passa pelo **cinza-lavanda**: metade das barras saía lilás
    // desbotado, e a coroa inteira lia como tule de tutu. Três
    // degraus discretos da paleta da personagem mantêm toda barra
    // saturada, e ainda separam melhor um nível do outro, que é o
    // que um analisador de espectro faz.
    //
    // Todas entram escurecidas: `Finish.Holo` soma `0,55` de emissão
    // sobre a cor difusa, e partindo das cores puras a soma estoura
    // para o branco-rosado. Escurecer a base é o que devolve a cor
    // cheia depois que a emissão a levanta.
    const viva = onda > 0.72 ? magenta : onda > 0.38 ? turquesa : accent;
    const cor = shade(viva, -0.3);
    // Centro da barra: meia rampa abaixo do topo, mais um milímetro
    // para fora, que é o que a mantém pousada sobre o pano em vez de
    // brigar com ele pelo mesmo plano.
    const mid = len * 0.5;
    const place = new THREE.Matrix4()
      .makeRotationY(az)
      .multiply(new THREE.Matrix4().makeRotationX(-tilt))
      .setPosition(
        Math.sin(az) * (rx0 + dr * mid + 0.014),
        yTop - dy * mid,
        Math.cos(az) * (rz0 + dr * mid + 0.014),
      );
    b.addGeometry(bar, { color: cor, finish: Finish.Holo, skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip }, place);
  }
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
/**
 * Manto Regaço, da Amara — e só dela.
 *
 * O Criador escolheu, entre quatro caminhos, que a maternidade dela
 * fosse dita por **um manto que envolve e protege**: nada de ventre
 * iluminado, nada de broto, nada de símbolo literal. Acolhimento é a
 * forma, não o desenho.
 *
 * ## O que manda neste traje é o ventre
 *
 * Amara é a única personagem do Éden com `gestation` (ver
 * `src/player/Gestation.ts`), e o morph **multiplica** o raio dos
 * vértices das zonas `Bust` e `Curve` por uma banda gaussiana.
 * Medido na malha real, descontando `aMorphOrigin` como o shader faz:
 *
 * | `y`    | fator em `z` (Bust) |
 * | ------ | ------------------- |
 * | 0,36   | 1,003               |
 * | 0,24   | 1,436               |
 * | 0,16   | **2,047**           |
 * | 0,08   | 1,472               |
 * | −0,04  | 1,010               |
 *
 * Duas consequências de projeto, e as duas estão no desenho abaixo:
 *
 *  1. **Geometria rígida só fora da banda** — acima de `y = 0,36` ou
 *     abaixo de `y = −0,04`. A gola e as gotas do colar ficam em
 *     cima; o fecho do manto, embaixo. Uma pedra no meio do ventre
 *     seria esticada ao dobro e viraria uma lasca.
 *  2. **Pano dentro da banda, com zona declarada.** Como o
 *     deslocamento é multiplicativo, uma camada desenhada com folga
 *     constante sobre o perfil **não deformado** mantém a folga
 *     depois do morph — ela cresce junto, na mesma proporção. É o que
 *     permite o manto abraçar o ventre sem o atravessar, e é por isso
 *     que o raio aqui sai das estações de `buildTorso` e da saia
 *     varrida, que são a superfície antes de crescer.
 *
 * ## O abraço é uma peça só
 *
 * O manto não são duas abas simétricas pregadas no peito: é **uma**
 * faixa contínua em U, que desce do ombro esquerdo, abre para
 * contornar o ventre pelo flanco, cruza a frente por baixo dele e
 * sobe de volta ao ombro direito. Peça partida em duas mostraria duas
 * pontas soltas no fundo, exatamente onde o olho procura o fecho.
 *
 * ## As costas ficam para o cabelo
 *
 * A lição do véu da Nexara é explícita: a malha é opaca, e pano largo
 * nas costas apaga o cabelo que desce por elas. A Nascente é a queda
 * mais longa do catálogo, e é peça principal deste marco — então
 * atrás só passam as duas tiras de ombro, que ancoram o manto e não
 * disputam espaço com nada.
 */
function buildRegacoSuit(
  b: SurfaceBuilder,
  m: BodyMetrics,
  detail: BodyDetail,
  torso: readonly [number, number, number],
  hip: readonly [number, number, number],
): void {
  const chest = { skin: { bone: Bone.Torso }, zone: MorphZone.Bust, origin: torso } as const;
  const quadril = { skin: { bone: Bone.Hips }, zone: MorphZone.Curve, origin: hip } as const;

  // A paleta sai da ficha (`colors`), não dos campos de roupa: é o que
  // garante que ela siga sendo a deusa de água-marinha mesmo que
  // alguém vista o traje noutra cor. Mesma regra do Lumen.
  const agua = 0xaef0dd;
  const teal = 0x2f9b8e;
  const vidro = 0xdcf8ef;
  const luz = 0xc4fff2;

  /**
   * O corpo **antes** do ventre, nas alturas que interessam.
   *
   * Em cima são as estações do próprio `buildTorso`, derivadas de
   * `m`: cópia de números daria uma roupa que deixa de caber no corpo
   * assim que alguém ajustar uma proporção, que foi como o vestido
   * rachou.
   *
   * Embaixo **não é o corpo, é a saia**. Na quinta rodada esta tabela
   * parava na pelve nua (`PELVIS_PROFILE`, raio 0,13 a 0,17) e o
   * fecho do abraço, desenhado em 0,12, nasceu **dentro do pano** da
   * saia — invisível e pago, que foi o erro das folhas da Saturno.
   * Os anéis de baixo são varridos na malha vestida:
   *
   *     y  0,00 → 0,2389 × 0,1540
   *     y −0,05 → 0,2378 × 0,1901
   *     y −0,10 → 0,2345 × 0,2181
   */
  const estacoes: readonly { y: number; rx: number; rz: number }[] = [
    { y: -0.1, rx: 0.2345, rz: 0.2181 },
    { y: -0.05, rx: 0.2378, rz: 0.1901 },
    { y: 0.0, rx: 0.2389, rz: 0.154 },
    { y: 0.055, rx: 0.19, rz: 0.12 },
    { y: 0.105, rx: m.waistWidth * 1.08, rz: 0.092 },
    { y: 0.165, rx: m.waistWidth * 1.06, rz: 0.09 },
    { y: 0.235, rx: m.chestWidth * 0.97, rz: 0.104 },
    { y: 0.3, rx: m.chestWidth, rz: 0.102 },
    { y: 0.365, rx: Math.max(m.chestWidth * 0.99, m.shoulderX * 0.88), rz: 0.096 },
    { y: m.waist + m.shoulderY, rx: Math.max(m.chestWidth * 0.8, m.shoulderX * 0.72), rz: 0.082 },
  ];
  const corpoEm = (y: number): { rx: number; rz: number } => {
    if (y <= estacoes[0].y) return estacoes[0];
    const ultima = estacoes[estacoes.length - 1];
    if (y >= ultima.y) return ultima;
    for (let i = 1; i < estacoes.length; i += 1) {
      const a = estacoes[i - 1];
      const c = estacoes[i];
      if (y <= c.y) {
        const k = (y - a.y) / (c.y - a.y);
        return { rx: a.rx + (c.rx - a.rx) * k, rz: a.rz + (c.rz - a.rz) * k };
      }
    }
    return ultima;
  };
  /** Raio da elipse do tronco num azimute — o torso é 2,3 : 1, não um cilindro. */
  const raioEm = (y: number, a: number, fora: number): number => {
    const { rx, rz } = corpoEm(y);
    const sx = Math.sin(a) / (rx + fora);
    const sz = Math.cos(a) / (rz + fora);
    return 1 / Math.sqrt(sx * sx + sz * sz);
  };

  /**
   * Uma faixa de pano que corre pelo corpo.
   *
   * Mesmo triedro do Manto Lumen: `T` no avanço, `N` radial para fora,
   * `W = N × T` no plano tangente. É a montagem que fecha as junções
   * sem serrilha — a primeira tentativa daquele marco pôs a largura
   * na tangente do anel horizontal e devolveu uma folha de palmeira.
   * Aqui ela é reescrita, e não importada: o Lumen é da Júpiter e não
   * se mexe num marco que não é o dela.
   */
  const faixa = (
    caminho: (t: number) => { y: number; az: number; fora: number },
    largura: (t: number) => number,
    cor: (t: number) => Hex,
    passos: number,
    esp: number,
    acab: FinishId,
    origem: typeof chest | typeof quadril,
    /** Desloca na direção da largura: é o que põe o fio de luz na **borda**. */
    desvio = 0,
  ): void => {
    const ponto = (t: number): readonly [number, number, number] => {
      const c = caminho(Math.min(1, Math.max(0, t)));
      const r = raioEm(c.y, c.az, c.fora);
      return [Math.sin(c.az) * r, c.y, Math.cos(c.az) * r];
    };
    const cantos = (t: number): number[][] => {
      const p = ponto(t);
      const q = ponto(t + 0.004);
      const o = ponto(t - 0.004);
      let tx = q[0] - o[0];
      let ty = q[1] - o[1];
      let tz = q[2] - o[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      const rl = Math.hypot(p[0], p[2]) || 1;
      const nx = p[0] / rl;
      const nz = p[2] / rl;
      let wx = -ty * nz;
      let wy = nz * tx - nx * tz;
      let wz = nx * ty;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl;
      wy /= wl;
      wz /= wl;
      const meia = largura(t) * 0.5;
      const d = desvio * largura(t);
      return [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([u, w]) => [
        p[0] + wx * (u * meia + d) + nx * w * esp,
        p[1] + wy * (u * meia + d) + w * esp * 0.2,
        p[2] + wz * (u * meia + d) + nz * w * esp,
      ]);
    };
    for (let i = 0; i < passos; i += 1) {
      const t0 = i / passos;
      const t1 = (i + 1) / passos;
      const a = cantos(t0);
      const z = cantos(t1);
      const v: number[] = [];
      for (const c of [...a, ...z]) v.push(c[0], c[1], c[2]);
      const idx: number[] = [];
      for (let k = 0; k < 4; k += 1) {
        const k2 = (k + 1) % 4;
        idx.push(k, k2, 4 + k2, k, 4 + k2, 4 + k);
      }
      if (i === 0) idx.push(0, 2, 1, 0, 3, 2);
      if (i === passos - 1) idx.push(4, 5, 6, 4, 6, 7);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      b.addGeometry(g, { color: cor(t0), finish: acab, ...origem }, new THREE.Matrix4());
    }
  };

  // --- o abraço ---
  //
  // `s` vale 1 nos dois ombros e 0 no fundo do U. O azimute é
  // `u · (0,44 + 0,83 · sen(π s) / s)`: a divisão por `s` é o que faz
  // a abertura **fechar sozinha** no fundo, em vez de dar um salto de
  // meio radiano ao trocar de lado. Com um termo constante ali, a
  // faixa se parte no meio da frente — foi o primeiro desenho, e não
  // passou do papel.
  //
  // A abertura máxima caiu de 60° para 44°, e isso é geometria, não
  // gosto: o tronco é uma elipse de 2,3 : 1, e um ponto a 60° nela
  // tem `z = 0,061` — está **ao lado** do corpo. O ventre empurra a
  // frente até `z = 0,19`, de modo que a sexta rodada devolveu um
  // manto passando atrás da barriga, engolido por ela, e no meio do
  // peito sobrou o que parecia uma gravata. A 44° o ponto fica em
  // `z = 0,098`, que depois do morph vai a `0,201` — à frente do
  // ventre, que vai a `0,168`.
  //
  //  · `s = 1`   → `y = 0,420`, azimute 25°  (ombro)
  //  · `s = 0,5` → `y = 0,168`, azimute 44°  (a volta do ventre)
  //  · `s = 0`   → `y = −0,085`, azimute 0°  (o fecho, fora da banda
  //    do ventre, e já sobre a saia — que é o que o manto veste ali)
  const abraco = (t: number): { y: number; az: number; fora: number } => {
    const u = t * 2 - 1;
    const s = Math.abs(u);
    const sino = 1 - (2 * s - 1) * (2 * s - 1);
    return {
      y: -0.085 + 0.505 * s,
      az: u * (0.44 + 0.55 * (s > 0.001 ? Math.sin(Math.PI * s) / s : Math.PI)),
      // Mais solto na volta do ventre, rente no ombro e no fecho.
      fora: 0.013 + 0.013 * sino,
    };
  };
  // A primeira rodada saiu com 0,034 a 0,082 de largura e a bancada
  // devolveu **dois suspensórios**: fita estreita sobre pano claro não
  // lê como manto, lê como alça. O pano de um manto tem de ter palmo.
  const larguraAbraco = (t: number): number => {
    const s = Math.abs(t * 2 - 1);
    return 0.07 + 0.14 * (1 - (2 * s - 1) * (2 * s - 1));
  };
  // O manto é mais escuro que o vestido, e isso é o que o faz existir:
  // na primeira rodada ele era claro sobre claro e sumiu dentro do
  // traje. O teal da ficha entra aqui como **recorte**, não como
  // enfeite.
  const corAbraco = (t: number): Hex => {
    const s = Math.abs(t * 2 - 1);
    // Mais escuro que o vestido em **toda** a extensão. Enquanto o
    // degradê subia até o branco no ombro, o manto sumia dentro do
    // traje justamente onde ele nasce.
    return tint(teal, agua, 0.3 + 0.35 * s);
  };
  // 0,8 por segmento, não 1,5: a faixa é uma banda lisa e longa, e
  // cada passo custa oito triângulos em quatro faces. A 66 passos o
  // manto sozinho passava de dois mil triângulos em ultra sem
  // mostrar uma dobra a mais que a 35.
  const passos = Math.max(14, Math.round(detail.segments * 0.8));
  // `Finish.Cloth`, e não `Finish.Glass`: envernizado, cada quadro
  // da varredura devolvia o sol com um ângulo diferente e o abraço
  // saía **facetado**, lido como placa de vidro em vez de pano. O
  // vidro líquido também é vocabulário da Luma. O brilho desta peça
  // vem do fio `Holo` na borda, que é de outra ordem — ele acende,
  // não espelha.
  faixa(abraco, larguraAbraco, corAbraco, passos, 0.0075, Finish.Cloth, chest);

  if (detail.segments >= 14) {
    // O fio de luz na borda de baixo do abraço: é ele que faz a peça
    // ler como vidro aceso e não como pano claro. `Finish.Holo` é o
    // único acabamento que emite, e por isso continua visível de
    // noite — uma deusa não apaga quando o sol se põe.
    faixa(
      (t) => {
        const c = abraco(t);
        return { y: c.y - 0.0, az: c.az, fora: c.fora + 0.004 };
      },
      (t) => larguraAbraco(t) * 0.1,
      () => luz,
      passos,
      0.0035,
      Finish.Holo,
      chest,
      // Na borda de fora, não no meio: a sexta rodada pôs o fio sobre
      // a linha central e a peça saiu **listrada**, como se o manto
      // tivesse uma costura no eixo.
      0.46,
    );

    // --- as duas tiras de ombro ---
    //
    // Passam por cima do trapézio e descem um palmo nas costas, que é
    // o que ancora o manto: sem elas, o abraço parece colado na
    // frente. Curtas de propósito — atrás é o lugar do cabelo.
    for (const lado of [-1, 1] as const) {
      faixa(
        (t) => ({ y: 0.42 - 0.1 * t * t, az: lado * (0.44 + 1.5 * t), fora: 0.012 + 0.006 * t }),
        () => 0.038,
        (t) => tint(vidro, agua, t),
        Math.max(5, Math.round(detail.segments * 0.4)),
        0.006,
        Finish.Glass,
        chest,
      );
    }
  }

  // --- a gola ---
  //
  // Alta e fechada, como na arte. Toda ela acima de `y = 0,43`, onde o
  // fator do ventre é 1,003: é a faixa do corpo em que pedraria pode
  // existir sem ser esticada.
  const golaBaixo = m.waist + m.shoulderY + 0.012;
  const gola: Ctl[] = [
    { y: golaBaixo, rx: m.neckR * 1.62, rz: m.neckR * 1.5, color: vidro, finish: Finish.Glass, bone: Bone.Torso, zone: MorphZone.Bust, origin: torso },
    { y: golaBaixo + 0.028, rx: m.neckR * 1.28, rz: m.neckR * 1.24, color: vidro, finish: Finish.Glass, bone: Bone.Head },
    { y: golaBaixo + 0.062, rx: m.neckR * 1.2, rz: m.neckR * 1.18, color: tint(vidro, agua, 0.5), finish: Finish.Glass, bone: Bone.Head },
    { y: golaBaixo + 0.085, rx: m.neckR * 1.26, rz: m.neckR * 1.24, color: agua, finish: Finish.Glass, bone: Bone.Head },
  ];
  // Subdivisão 3: a gola tem 8,5 cm de altura e quatro anéis de
  // controle. Com os sete de ultra eram 22 anéis para um tubo quase
  // reto — 1 900 triângulos num colarinho.
  b.loft(subdivideProfile(toStations(gola), Math.min(3, detail.steps)), { segments: Math.max(10, detail.segments) });

  if (detail.segments >= 14) {
    // O fio aceso na borda da gola.
    b.addGeometry(
      new THREE.TorusGeometry(m.neckR * 1.3, 0.0055, 4, Math.max(10, detail.segments)),
      { color: luz, finish: Finish.Holo, skin: { bone: Bone.Head } },
      new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, golaBaixo + 0.088, 0),
    );
  }

  if (detail.segments >= 20) {
    // As gotas do colar, descendo da gola ao alto do peito. Param em
    // `y = 0,372`: abaixo disso começa a banda do ventre, e pedra
    // dentro dela é pedra esticada.
    const gotas = 5;
    for (let i = 0; i < gotas; i += 1) {
      const k = i / (gotas - 1);
      const y = golaBaixo - 0.012 - k * 0.046;
      const { rz } = corpoEm(y);
      b.ball(
        [0, y, rz + 0.016 - k * 0.002],
        [0.0085 - k * 0.0012, 0.011 - k * 0.0015, 0.007],
        { color: k > 0.6 ? luz : tint(agua, luz, k), finish: Finish.Holo, ...chest },
        4,
      );
    }
  }

  if (detail.segments >= 20) {
    // --- as linhas de continuidade ---
    //
    // Nervuras acesas que descem pela saia. Vida que segue adiante,
    // dita como ritmo — sem nenhum símbolo literal, que foi o que o
    // Criador pediu ao escolher o manto.
    //
    // O raio é **medido na malha vestida**, nunca tirado do perfil de
    // controle de `buildSkirt`: aquele perfil mente, e foi por
    // confiar nele que as folhas da Saturno nasceram dentro do pano.
    // Varrido nesta saia, com a barra `GOWN_HEM_Y`:
    //
    //     y −0,10 → 0,2345 × 0,2181    y −0,30 → 0,3315 × 0,3116
    //     y −0,15 → 0,2669 × 0,2612    y −0,35 → 0,3543 × 0,3331
    //     y −0,20 → 0,2758 × 0,2593    y −0,45 → 0,4118 × 0,3871
    //
    // Presas a `Bone.Hips`, como as vinhas da barra da Maze: é o
    // osso que o repositório já usa para peça pregada em saia.
    const saiaRx = (y: number): number => 0.2345 + (0.3543 - 0.2345) * smoothstep(-0.12, -0.35, y);
    const saiaRz = (y: number): number => 0.2181 + (0.3331 - 0.2181) * smoothstep(-0.12, -0.35, y);
    const nervuras = 9;
    for (let i = 0; i < nervuras; i += 1) {
      const az = (i / nervuras) * TAU + 0.26;
      // Atrás não: é por ali que desce a Nascente.
      if (Math.cos(az) < -0.45) continue;
      const topo = -0.1;
      const base = -0.335;
      const passosN = 3;
      for (let j = 0; j < passosN; j += 1) {
        const y0 = topo + (base - topo) * (j / passosN);
        const y1 = topo + (base - topo) * ((j + 1) / passosN);
        const raio = (y: number): number => {
          const rx = saiaRx(y) + 0.008;
          const rz = saiaRz(y) + 0.008;
          const sx = Math.sin(az) / rx;
          const sz = Math.cos(az) / rz;
          return 1 / Math.sqrt(sx * sx + sz * sz);
        };
        const r0 = raio(y0);
        const r1 = raio(y1);
        const comp = Math.hypot(r1 - r0, y1 - y0);
        b.addGeometry(
          new THREE.BoxGeometry(0.0095, comp, 0.007),
          { color: tint(luz, agua, j / passosN), finish: Finish.Holo, ...quadril },
          new THREE.Matrix4()
            .makeRotationY(az)
            .multiply(new THREE.Matrix4().makeRotationX(Math.atan2(r1 - r0, y0 - y1)))
            .setPosition(Math.sin(az) * (r0 + r1) * 0.5, (y0 + y1) * 0.5, Math.cos(az) * (r0 + r1) * 0.5),
        );
      }
    }
  }
}

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
 * A barra da saia do Traje Cosplay.
 *
 * Dez centímetros acima da saia curta comum. Não é capricho: a meia
 * alta começa em `joelho + 0,10`, e com a barra em −0,36 a saia
 * terminava **abaixo** do cano da meia. O resultado era perna
 * inteiramente coberta — a silhueta sumia e a personagem lia como
 * vestido comprido. Com a barra em −0,26 sobra um vão de pele entre
 * a bainha e a meia, que é exatamente o que a arte mostra.
 */
const COSPLAY_HEM_Y = -0.26;
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
  const shortSleeve = outfit === 'casual' || outfit === 'praia' || outfit === 'camiseta' || outfit === 'saia';
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

  b.loft(subdivideProfile(toStations(withFinish(control, skin, undefined, ctx.suit, b.skinFinish)), detail.steps), {
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
  b.surface = b.skinFinish;
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
  // A meia alta do Traje Cosplay.
  //
  // Ela não é geometria: a perna já é uma varredura com cor por anel,
  // e a meia é um degrau nessa cor a partir do meio da coxa. Custa
  // zero triângulo e zero chamada de desenho — e `withFinish`
  // classifica sozinho, porque a cor deixa de ser a da pele e passa
  // a contar como pano.
  //
  // A arte põe a barra da meia bem acima do joelho, logo abaixo da
  // saia curta: é esse vão curto de pele que faz a silhueta dela.
  const stocking = outfit === 'cosplay' ? 0xf7f3ff : undefined;
  const kneeColor = stocking ?? (longPants ? bottom : skin);
  const r = m.legTop;

  const control: Ctl[] = [
    { y: hipY + 0.05, rx: r * 0.98, rz: r * 0.96, x, color: thighColor, bone: Bone.Hips, zone: MorphZone.Thigh, origin: thighOrigin },
    { y: hipY - 0.02, rx: r * 1.02, rz: r, x, color: thighColor, bone: thighBone, zone: MorphZone.Thigh, origin: thighOrigin },
    { y: hipY - 0.1, rx: r * 0.96, rz: r * 0.95, x, color: thighColor, bone: thighBone, zone: MorphZone.Thigh, origin: thighOrigin },
    { y: (hipY + kneeY) * 0.5, rx: r * 0.86, rz: r * 0.86, x, color: shortPants ? thighColor : thighColor, bone: thighBone },
    // A bermuda de banho desce mais que o short comum: a barra fica
    // logo acima do joelho, e é esse comprimento que a faz ler como
    // bermuda e não como calção de corrida.
    { y: kneeY + 0.1, rx: r * 0.78, rz: r * 0.78, x, color: shortPants && !stocking && outfit !== 'banho' ? skin : thighColor, bone: thighBone },
    // O cano da meia é um **degrau**, não um degradê. Entre a
    // estação de coxa e a do joelho havia sete centímetros e meio de
    // interpolação: a cor da pele virava a cor da meia aos poucos e
    // a perna inteira lia como coberta. Duas estações a dois
    // centímetros uma da outra dão a barra nítida que a arte tem.
    // Só nasce no Traje Cosplay; nenhum outro traje ganha anel.
    ...(stocking === undefined
      ? []
      : ([{ y: kneeY + 0.082, rx: r * 0.766, rz: r * 0.766, x, color: stocking, bone: thighBone }] as Ctl[])),
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

  b.loft(subdivideProfile(toStations(withFinish(control, skin, shoe, ctx.suit, b.skinFinish)), detail.steps), {
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

  // As medidas deste rosto, já com os quatro eixos da ficha aplicados
  // sobre o cânone. A mesma tabela que `AvatarFace` usa para pousar
  // pálpebra, cílio e lábio — é o que impede a pálpebra de descolar do
  // globo quando o olho muda de tamanho.
  const face = faceDimsFor(a, R, cy);
  const eyeY = face.eyeY;
  const eyeX = face.eyeX;
  const eyeZ = face.eyeZ;

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
  const my = face.mouthY;
  const mz = face.mouthZ;
  // Filtro: o sulco entre o nariz e o lábio de cima.
  b.feature([0, my + R * 0.16, mz + R * 0.1], [R * 0.06, R * 0.08, R * 0.2], -R * 0.03, [0, 0, 1]);
  // Lábio superior e inferior, com a linha da boca afundada entre eles.
  b.feature([0, my + R * 0.055, mz + R * 0.06], [R * 0.28, R * 0.055, R * 0.22], R * 0.055, [0, 0, 1]);
  b.feature([0, my - R * 0.075, mz + R * 0.06], [R * 0.26, R * 0.07, R * 0.22], R * 0.06, [0, 0, 1]);
  b.feature([0, my - R * 0.01, mz + R * 0.09], [R * 0.3, R * 0.025, R * 0.2], -R * 0.035, [0, 0, 1]);
  // Sulco sob o lábio de baixo, e os cantos da boca.
  b.feature([0, my - R * 0.17, mz + R * 0.04], [R * 0.16, R * 0.05, R * 0.2], -R * 0.025, [0, 0, 1]);
  for (const side of [-1, 1]) {
    b.feature([side * face.mouthHalf, my - R * 0.01, mz], [R * 0.06, R * 0.07, R * 0.18], -R * 0.03, [0, 0, 1]);
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
  const ball = face.ball;
  // O olho é molhado: quase sem rugosidade, e com verniz por cima.
  b.surface = Finish.Eye;
  for (const side of [-1, 1]) {
    const ex = side * eyeX;
    // Olhar levemente convergente, como o de quem olha para a frente.
    const toe = -side * R * 0.006;
    b.ball([ex, eyeY, eyeZ], [ball, ball, ball * 0.94], { color: 0xf6f4f2, skin: { bone: Bone.Head } }, eyeRings);
    b.ball(
      [ex + toe, eyeY, eyeZ + ball * 0.74],
      [face.iris, face.iris, ball * 0.3],
      { color: a.eyeColor, skin: { bone: Bone.Head } },
      eyeRings,
    );
    b.ball(
      [ex + toe, eyeY, eyeZ + ball * 0.9],
      [face.pupil, face.pupil, ball * 0.16],
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

  b.surface = b.skinFinish;
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
  b.surface = b.skinFinish;
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
  // A calota e a franja vêm antes do `switch`, e no penteado do
  // criador elas são da mesma matéria que o resto dele.
  if (a.hairStyle === 'cosmos') b.surface = Finish.Cosmos;
  // Quantos anéis cada volume de cabelo recebe.
  //
  // Fixo, um penteado feito de bolinhas custava o mesmo no celular e
  // no desktop — e foi exatamente assim que o `crespo` passou do
  // orçamento em `baixa`, onde o corpo inteiro cabe em quatro mil
  // vértices. Agora a densidade acompanha o nível, como o resto da
  // malha sempre acompanhou.
  const bolaG = detail.segments >= 40 ? 6 : detail.segments >= 20 ? 5 : detail.segments >= 14 ? 4 : 3;
  const bolaM = Math.max(3, bolaG - 1);
  const bolaP = Math.max(3, bolaG - 2);

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
    case 'cosmos': {
      // O cabelo do criador do Éden.
      //
      // Não é uma queda comprida a mais. O que o separa dos outros
      // dezesseis penteados longos do catálogo é a **direção**: o
      // cabelo das deusas cai, e este sobe antes de cair. Ele é
      // levado por um vento que não existe na praça — a mesma
      // corrente que arrasta a poeira das nebulosas —, e é isso que
      // se lê de longe, antes de qualquer detalhe de cor.
      //
      // Três peças, e nenhuma copiada:
      //
      //  · a juba, que **alarga** ao descer em vez de afinar. Toda
      //    queda do Éden termina em ponta, porque cabelo pesa; esta
      //    termina aberta, porque a dele não pesa;
      //  · a crista, três mechas que sobem do alto da cabeça e se
      //    inclinam para trás — o traço que nenhum outro tem;
      //  · a esteira, uma faixa estreita que continua atrás da juba
      //    e some, como o rastro de um cometa.
      //
      // O acabamento cósmico já está em vigor desde a calota.
      const aneis = segments >= 40 ? 9 : segments >= 20 ? 7 : segments >= 14 ? 5 : 4;
      const baseY = cy + 0.05;
      const fimY = cy - 0.46;
      const juba: Ctl[] = [];
      for (let i = 0; i < aneis; i += 1) {
        const t = i / (aneis - 1);
        // `t` = 0 na ponta de baixo, 1 na raiz: a lista sobe, que é
        // como `loft` espera as estações.
        const abre = 0.72 + 0.46 * (1 - t) * (1 - t);
        const fundo = 0.3 + 0.72 * t;
        juba.push({
          y: fimY + (baseY - fimY) * t,
          rx: R * 0.9 * abre,
          rz: R * 0.2 * fundo,
          rzBack: R * (0.5 + 0.56 * t) * (0.86 + 0.3 * (1 - t)),
          // Arrastado para trás na ponta: o vento vem da frente.
          z: -R * (0.1 + 0.42 * (1 - t)),
          color: i % 2 === 0 ? hair : dark,
          bone: Bone.Head,
        });
      }
      b.loft(subdivideProfile(toStations(juba), detail.steps), { segments, capBottom: R * 0.1, capRings: 2 });

      // A crista. Some no nível baixo: três mechas de quatro anéis
      // não sobrevivem a dez segmentos, e o orçamento de `baixa` é o
      // mais apertado do panteão.
      if (segments >= 14) {
        const mechas = segments >= 30 ? 3 : 2;
        const mechaAneis = segments >= 30 ? 5 : 4;
        for (let k = 0; k < mechas; k += 1) {
          const lado = mechas === 3 ? [-1, 0, 1][k] : [-1, 1][k];
          const alto = cy + 0.19 + 0.055 * (1 - Math.abs(lado));
          const mecha: Ctl[] = [];
          for (let i = 0; i < mechaAneis; i += 1) {
            const t = i / (mechaAneis - 1);
            // Afina e inclina para trás enquanto sobe.
            mecha.push({
              y: cy + 0.1 + (alto - cy - 0.1) * t + 0.12 * t * t,
              rx: R * (0.3 - 0.21 * t),
              rz: R * (0.17 - 0.12 * t),
              x: lado * R * 0.34 * (1 + 0.5 * t),
              z: -R * (0.12 + 0.75 * t * t),
              color: t > 0.5 ? hair : dark,
              bone: Bone.Head,
            });
          }
          b.loft(subdivideProfile(toStations(mecha), Math.max(1, detail.steps - 1)), {
            segments: Math.max(6, Math.round(segments * 0.42)),
            capTop: R * 0.04,
            capBottom: R * 0.03,
            capRings: 1,
          });
        }
      }

      // A esteira, só onde há resolução para ela ser vista.
      if (segments >= 26) {
        const esteira: Ctl[] = [
          { y: cy - 0.56, rx: R * 0.34, rz: R * 0.1, z: -R * 0.78, color: dark, bone: Bone.Head },
          { y: cy - 0.4, rx: R * 0.62, rz: R * 0.14, z: -R * 0.6, color: dark, bone: Bone.Head },
          { y: cy - 0.22, rx: R * 0.78, rz: R * 0.18, z: -R * 0.44, color: hair, bone: Bone.Head },
        ];
        b.loft(subdivideProfile(toStations(esteira), detail.steps), {
          segments: Math.max(8, Math.round(segments * 0.6)),
          capBottom: R * 0.06,
          capRings: 1,
        });
      }
      break;
    }
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
      // O topo entra fundo na calota — `0,085` deixava a borda do
      // tubo quase na mesma altura em que a calota começa, e o
      // traçado de raios achou dois que desciam pela fresta entre as
      // duas peças e batiam no crânio em `y = 0,743`.
      const topY = cy + 0.12;
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
      // O aperto dos últimos passos é o que impede o degrau: sem ele
      // a queda chega ao alto mais larga que a calota e o anel de
      // cima aparece como um friso em volta da cabeça.
      const rxOf = (t: number): number =>
        R *
        (0.62 + 0.22 * t + 0.26 * bump(t)) *
        (1 - 0.26 * smoothstep(0.1, 0, t)) *
        (1 - 0.13 * smoothstep(0.82, 1, t)) *
        (1 + 0.08 * Math.sin(t * Math.PI * 2.4 + 0.5));
      // Fundo na nuca — a profundidade tem de passar atrás do crânio,
      // senão sobra occipital, e o occipital desta cabeça chega a
      // `0,94·R`.
      //
      // A curva é de raiz, não reta, e a diferença é a silhueta de
      // perfil. Com `0,32 + 0,78·t` a profundidade caía por igual do
      // alto até a ponta, e o que a bancada mostrou de lado foi uma
      // **tábua**: uma cunha reta encostada nas costas, grossa em
      // cima, fina embaixo, sem nada que lembrasse cabelo. Cabelo
      // longo não faz isso — ele guarda corpo na descida e só afunila
      // de verdade perto da ponta, que é o que `t^0,8` e o
      // estreitamento final dos últimos doze por cento descrevem.
      const rzBackOf = (t: number): number =>
        R * (0.42 + 0.68 * t ** 0.8) * (1 - 0.26 * smoothstep(0.12, 0, t));
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
      // A amplitude é pequena de propósito. A primeira versão usava
      // `0,42·R` e, vista de trás, não lia como fluxo: lia como uma
      // massa torta, com o degradê de ponta escorrendo todo para um
      // lado só. Onda de dados é ondulação, não torcicolo.
      const xOf = (t: number): number =>
        Math.sin((1 - t) * Math.PI * 1.3) * R * 0.2 * (1 - t) * (1 - smoothstep(0.35, 0.75, t));

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
          color: tint(hair, tipColor, 0.72 * (1 - t) ** 1.7),
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
      if (detail.segments >= 14) b.feature([0, cy + 0.2, R * 0.1], [R * 0.1, R * 0.34, R * 1.0], -R * 0.085, [0, 1, 0]);

      // As ranhuras entre as mechas, na face de trás.
      //
      // Houve duas versões erradas antes desta, e as duas erraram por
      // motivos diferentes:
      //
      //  · a primeira usava `0,11·R` de raio lateral. O espaçamento
      //    entre vértices vizinhos do anel, nesta malha, é de cerca de
      //    `0,034` — maior que o sulco. Um relevo mais estreito que a
      //    distância entre dois vértices não afunda uma superfície,
      //    afunda **um vértice**, e o sombreamento suave apaga o resto;
      //  · a segunda tinha largura suficiente — a bancada mediu 27% de
      //    afundamento — e ainda assim as costas liam como um capuz de
      //    uma peça só. O erro era de arranjo: cada sulco ficava numa
      //    altura diferente, então **nenhuma altura tinha mais de um
      //    sulco por lado**. Seis covinhas espalhadas pelas costas não
      //    são mechas; mecha é um vinco que corre a queda inteira.
      //
      // Daí a forma atual: três canais verticais, cada um construído
      // por uma fila de depressões sobrepostas que acompanham a elipse
      // enquanto ela afunila, recua e serpenteia. O custo é tempo de
      // construção — nenhum vértice a mais, nenhuma chamada de desenho
      // a mais —, e só existe de `segments >= 14` para cima.
      //
      // Três, e não quatro, por conta da resolução: a face de trás tem
      // dez vértices, um a cada dezoito graus. Um sulco precisa ser
      // mais largo que esse passo para existir, e um sulco largo
      // alcança quase trinta graus para cada lado. Quatro canais
      // ficavam a vinte e oito graus um do outro, se sobrepunham e
      // afundavam as costas inteiras — o oposto de uma mecha, que só
      // se enxerga porque tem uma **crista** ao lado. A cinquenta
      // graus de distância sobra cabelo cheio entre um vinco e outro.
      // Os canais laterais ainda se abrem na descida, como mechas que
      // se separam ao cair.
      // Os dois últimos canais ficam quase na lateral, e existem por
      // causa da vista de frente: ali a queda passa por fora do rosto
      // e o emoldura: uma faixa clara, de espessura igual, dos dois
      // lados da cara. Lisa daquele jeito ela lia como **capuz**. Um
      // vinco de cada lado basta para virar mecha, e eles só descem
      // até a metade — abaixo disso a moldura já não existe, é só
      // cabelo caindo.
      if (detail.segments >= 14) {
        for (const base of [-1.95, -0.88, 0, 0.88, 1.95]) {
          const lateral = Math.abs(base) > 1.5;
          for (let t = lateral ? 0.5 : 0.1; t <= (lateral ? 0.8 : 0.86); t += 0.095) {
            const az = Math.PI + base * (1 + 0.22 * (1 - t));
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            {
              // Raso nas duas pontas: no alto o cabelo tem de encostar
              // liso na calota, embaixo a queda já é estreita e um
              // vinco fundo a cortaria em tiras.
              const fade = lateral
                ? smoothstep(0.5, 0.62, t) * (1 - smoothstep(0.68, 0.82, t))
                : smoothstep(0.06, 0.26, t) * (1 - smoothstep(0.72, 0.92, t));
              const raio = lateral ? rxOf(t) : rzBackOf(t);
              b.feature(
                [xOf(t) + sx * rxOf(t), yOf(t), zcOf(t) + sz * raio],
                [R * 0.24, R * 0.5, R * 0.24],
                -R * (lateral ? 0.085 : 0.17) * (0.45 + 0.55 * fade),
                [sx, 0, sz],
              );
            }
          }
        }
      }

      buildOrbitRings(b, detail, cy, R);
      break;
    }
    case 'onda': {
      // A queda da Lilly. Prima do Fluxo na construção — mesma casca
      // contínua, mesmo cuidado com a nuca — e oposta dele na
      // leitura, porque a personagem é outra:
      //
      //  · **a largura oscila**. Três ciclos rasos ao longo da
      //    descida, com amplitude o dobro da do Fluxo. É a envoltória
      //    de uma forma de onda, e é o que faz a silhueta dizer "som"
      //    antes de qualquer brilho — de longe, no escuro, contra o
      //    céu, a silhueta é a única coisa que sobra;
      //  · **o degradê acende**. Raiz quase preta, verde-limão no
      //    meio, turquesa nas pontas.
      //
      // E o degradê acende de verdade: os anéis de baixo trocam de
      // **acabamento**, não só de cor. `Ctl.finish` chega até a
      // estação, então a parte neon do cabelo é `Holo` e emite, e a
      // raiz continua sendo cabelo. Isso custa **zero triângulos** —
      // a alternativa seria desenhar mechas de luz por cima, e mecha
      // solta já foi rejeitada em três marcos seguidos.
      //
      // O comprimento para acima da Cascata: o cabelo mais longo do
      // Éden é o da Suki-Chan, há um teste que afirma isso, e nenhum
      // marco posterior tem o direito de tomar o que já era dela.
      const topY = cy + 0.12;
      const bottomY = cy - 0.6;
      // Por que esta varredura não passa por `subdivideProfile`.
      //
      // Duas coisas que a malha precisa aqui morrem na subdivisão.
      //
      // A primeira é a cor: `blendStations` **não interpola**, ela
      // trava na estação mais próxima (`t > 0.5 ? 1 : 0`). Faixa de
      // cor é anel de controle, e com dez anéis o degradê saiu na
      // tela como cinco listras horizontais de borda dura.
      //
      // A segunda é pior e levou um teste para aparecer: ela
      // **descarta `finish`**. Copia `zone` e `origin` da estação
      // vizinha e deixa o acabamento cair para o padrão da
      // superfície. Ou seja: declarar `Finish.Holo` num anel de
      // cabelo subdividido não acende nada — a cor neon ficava lá,
      // chapada, sem emissão nenhuma.
      //
      // Essa função é lida por todo corpo do Éden e não se toca. A
      // saída é não subdividir: o perfil já é analítico, então ele
      // nasce direto na densidade final. Sai mais barato, ainda por
      // cima — trinta anéis de controle custam menos que vinte
      // anéis subdivididos em quatro.
      // A contagem subiu depois do traçado de raios: com trinta
      // anéis apareceu uma fresta de pele num único azimute das
      // costas. Sem subdivisão, o perfil anda em corda entre um anel
      // e o seguinte, e a corda passa por dentro da curva — onde a
      // folga sobre o crânio já era pequena, ela zerava.
      const rings = segments >= 26 ? 38 : segments >= 14 ? 26 : 6;
      const limao = 0x9dfb57;
      const turquesa = 0x2ee8c0;
      const yOf = (t: number): number => bottomY + (topY - bottomY) * t;
      // Volume: ela é a mais cheia das quatro. A onda tem amplitude
      // `0,16` contra os `0,08` do Fluxo, e isso é deliberado — com
      // amplitude pequena a oscilação some a três metros e sobra um
      // cabelo liso e escuro, que é um borrão.
      // E ela não afunila. A primeira versão ia de `1,18·R` na
      // calota a `0,58·R` na ponta: de costas, isso é um balão —
      // largo no alto, fechando num bico na cintura. Cabelo comprido
      // mantém corpo até perto da ponta e só então recolhe. Agora a
      // largura é quase constante na descida (quem dá o movimento é
      // a onda) e o recolhimento vive no fim. Esse recolhimento
      // precisou de duas rodadas: com a ponta em 55% da largura o
      // cabelo terminava num bloco aceso de fundo chato, que de
      // costas parecia um babador luminoso. Em 28% ela fecha em
      // ponta e o brilho vira mecha.
      const rxOf = (t: number): number =>
        R *
        (0.96 + 0.1 * smoothstep(0.75, 1, t) + 0.16 * smoothstep(0.62, 0.2, t)) *
        (1 - 0.72 * smoothstep(0.26, 0, t)) *
        (1 - 0.14 * smoothstep(0.84, 1, t)) *
        (1 + 0.16 * Math.sin(t * Math.PI * 3.1 + 0.9));
      // Profundidade: curva de raiz, como a do Fluxo. A reta desenha
      // uma tábua encostada nas costas — já custou uma rodada.
      const rzBackOf = (t: number): number =>
        R * (0.44 + 0.66 * t ** 0.8) * (1 - 0.24 * smoothstep(0.12, 0, t));
      // Onde a queda mora em profundidade — a conta que decide se o
      // cabelo volumoso é possível neste corpo.
      //
      // Alargar a queda sem recuá-la fez o cabelo **atravessar os
      // braços**: medido, até quatro centímetros de interpenetração
      // entre `y = 0,10` e `y = 0,35`, que é justamente a faixa das
      // pontas acesas. Os braços caem em `x` de 0,13 a 0,28 e a sua
      // face de trás fica em `z ≈ −0,05`; qualquer mecha mais larga
      // que isso precisa passar atrás deles ou não passa.
      //
      // Então a metade de baixo recua para `−0,55·R` e só volta a
      // encostar na cabeça depois de `t = 0,45`, onde ela tem de
      // abraçar o crânio. É isto que permite cabelo largo aqui: ele
      // não disputa espaço com o braço, ele passa por trás.
      const zcOf = (t: number): number => -R * (0.55 - 0.47 * smoothstep(0.45, 1, t));

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        // Onde o neon entra. A primeira versão abria o degradê no
        // alto e chegava a noventa por cento de limão na altura do
        // pescoço: de frente, a personagem ganhava um capuz verde
        // que engolia o queixo e o ombro. A arte faz o contrário —
        // a massa é escura, e a luz é **ponta**.
        //
        // Então o neon só começa abaixo da linha do ombro e cresce
        // até as pontas, onde para em 0,88: mesmo na ponta sobra um
        // fundo escuro por baixo do verde, que é o que diferencia
        // mecha acesa de tinta chapada.
      //
      // A faixa acesa desceu mais uma vez depois do teste de frente:
      // com o neon começando na altura da cintura, ele vazava pelo
      // vão entre o braço e o tronco e virava uma mancha verde no
      // quadril — de frente parecia defeito, não cabelo. Agora o
      // brilho vive no terço final, que é onde a arte o põe.
      const neon = smoothstep(0.36, 0, t);
        // Dentro do neon, limão na transição e turquesa na ponta.
      const matiz = tint(limao, turquesa, smoothstep(0.24, 0, t));
        const cor = tint(hair, matiz, neon * 0.88);
        fall.push({
          y: yOf(t),
          rx: rxOf(t),
          rz: R * 0.2,
          rzBack: rzBackOf(t),
          z: zcOf(t),
          color: cor,
          // O neon emite; a raiz, não. O corte acompanha a rampa de
          // cor — acender um anel que ainda está escuro produz uma
          // faixa cinzenta brilhante no meio do cabelo, que é
          // emenda, não degradê.
          finish: neon > 0.3 ? Finish.Holo : Finish.Hair,
          bone: Bone.Head,
          bone2: Bone.Torso,
          blend: 0.88 * (1 - smoothstep(cy - 0.54, cy - 0.1, yOf(t))),
        });
      }
      b.loft(toStations(fall), { segments, capBottom: R * 0.07, capRings: 2 });

      // O risco no alto da cabeça: sem ele a calota é uma superfície
      // lisa e o penteado lê como touca. Vale para qualquer cabelo
      // longo, e custou uma rodada no marco da Nexara.
      if (detail.segments >= 14) b.feature([0, cy + 0.2, R * 0.1], [R * 0.1, R * 0.34, R * 1.0], -R * 0.08, [0, 1, 0]);

      // As ranhuras entre as mechas: três canais verticais contínuos
      // na face de trás. O número e o espaçamento não são estéticos —
      // a face de trás tem dez vértices, um a cada dezoito graus, e
      // um sulco precisa ser mais largo que esse passo para existir.
      // Quatro canais se sobrepunham e afundavam as costas inteiras;
      // três deixam crista entre um vinco e outro, que é o que faz
      // uma mecha ser vista.
      if (detail.segments >= 14) {
        for (const base of [-0.88, 0, 0.88]) {
          for (let t = 0.1; t <= 0.86; t += 0.095) {
            const az = Math.PI + base * (1 + 0.22 * (1 - t));
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            const fade = smoothstep(0.06, 0.26, t) * (1 - smoothstep(0.72, 0.92, t));
            b.feature(
              [sx * rxOf(t), yOf(t), zcOf(t) + sz * rzBackOf(t)],
              [R * 0.24, R * 0.5, R * 0.24],
              -R * 0.16 * (0.45 + 0.55 * fade),
              [sx, 0, sz],
            );
          }
        }
      }

      buildSonicHeadset(b, detail, cy, R);
      break;
    }
    case 'cachos': {
      // A juba da Akemi-Chan — e por que ela não é feita de bolas.
      //
      // O `cacheado` compartilhado resolve cacho com doze esferas
      // coladas na cabeça. Custa geometria e lê como amora. Aqui a
      // queda é uma varredura contínua, como a das outras deusas, e
      // o cacho é **relevo**: `feature()` empurra vértices que já
      // existem, então o campo inteiro de cachos custa **zero
      // triângulos**. Nenhuma outra deusa usa esse recurso.
      //
      // A silhueta é o oposto da Lilly de propósito: lá, massa
      // estreita e comprida; aqui, massa **larga e curta**, parando
      // no ombro. Ampla em cima e leve embaixo, que é a leitura da
      // arte dela e o que a saia plissada curta completa.
      const topY = cy + 0.1;
      const bottomY = cy - 0.3;
      const rings = segments >= 26 ? 22 : segments >= 14 ? 14 : 5;
      const yOf = (t: number): number => bottomY + (topY - bottomY) * t;
      // Larga: chega a `1,34·R`, contra `1,12·R` da Lilly. Cabelo
      // cacheado ocupa espaço, e é o volume que diz "cacheado" antes
      // de qualquer relevo.
      const rxOf = (t: number): number =>
        R * (1.34 - 0.3 * smoothstep(0.55, 1, t)) * (1 - 0.34 * smoothstep(0.2, 0, t));
      const rzBackOf = (t: number): number => R * (0.72 + 0.44 * t ** 0.8);
      const zcOf = (t: number): number => -R * (0.3 - 0.24 * smoothstep(0.45, 1, t));

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        fall.push({
          y: yOf(t),
          rx: rxOf(t),
          rz: R * 0.34,
          rzBack: rzBackOf(t),
          z: zcOf(t),
          // Castanho da arte, clareando de leve na ponta — é luz
          // batendo em cacho, não degradê de cor.
          color: tint(dark, hair, smoothstep(0.75, 0.1, t)),
          bone: Bone.Head,
          bone2: Bone.Torso,
          blend: 0.72 * (1 - smoothstep(cy - 0.26, cy + 0.02, yOf(t))),
        });
      }
      // Sem `subdivideProfile`: ela trava a cor na estação mais
      // próxima e descarta o acabamento. Lição do marco da Lilly.
      b.loft(toStations(fall), { segments, capBottom: R * 0.12, capRings: 2 });

      if (detail.segments >= 14) {
        // O campo de cachos.
        //
        // O raio de cada bolha precisa ser maior que o vão entre
        // vértices, senão o relevo não existe na tela — medido no
        // marco da Nexara. Com `segments` anéis na volta e raio
        // `1,3·R`, o passo lateral fica perto de `R·0,19`; as
        // bolhas saem em `R·0,3`, com folga.
        //
        // As posições vêm de uma espiral, não de um sorteio: cacho
        // sorteado agrupa e deixa calva. A espiral de ângulo áureo
        // distribui sem repetir vizinho.
        // O cacho precisa nascer **em cima da superfície**, e a
        // superfície não é um círculo. A primeira versão espalhou as
        // bolhas num círculo de raio `1,2·R` no plano XZ; a queda,
        // porém, é uma elipse rasa — `rz` vale `0,34·R` na frente
        // contra `1,16·R` atrás, e o centro dela ainda recua até
        // `−0,3·R`. Metade das bolhas caiu no ar, longe de qualquer
        // vértice, e o cabelo renderizou liso feito capacete. A
        // captura mostrou isso antes de qualquer outra coisa.
        //
        // Agora cada bolha é avaliada na mesma parametrização do
        // `loft`: escolhe-se o anel `t` e o azimute, e o ponto sai
        // da própria elipse daquele anel.
        // O relevo para antes da calota, e isso não é estética: é a
        // condição para o crânio continuar redondo.
        //
        // `feature()` empurra **todo** vértice ao alcance, e alcance
        // é três vezes o raio da bolha. No alto da queda o cabelo
        // encosta na cabeça — em `t = 0,95` o perfil vale `1,05·R`
        // contra um crânio de `0,90·R` a `1,01·R`, ou seja menos de
        // um centímetro de folga. Bolha ali empurrava o osso junto:
        // medidos 1 107 vértices de pele deslocados, calombo de até
        // 35 mm, e a variação de raio do crânio saltando de 20 mm
        // (normal) para 48 mm. A cabeça saía ovalada.
        //
        // Abaixo de `t = 0,74` a queda já se afastou: sobram mais de
        // sete centímetros até o crânio, e com raio `0,22·R` o peso
        // gaussiano que chega lá é da ordem de 0,007 — menos de um
        // décimo de milímetro. A coroa fica lisa, que é como cabelo
        // cacheado se comporta na raiz de todo modo.
        //
        // E limitar por altura não basta. A seção da queda é uma
        // elipse **rasa na frente**: nos azimutes frontais o ponto da
        // elipse cai dentro do crânio, não do lado de fora dele. Foi
        // assim que uma bolha nasceu em `x = 0,162 · y = 0,692 ·
        // z = 0,009` — a sete milímetros da orelha, com peso
        // gaussiano de 0,96 — e empurrou a lateral da cabeça 28 mm
        // para fora. A cabeça saía amassada de um lado.
        //
        // Então o critério não é altura nem azimute: é **distância
        // ao crânio**. Cada bolha é testada contra o elipsoide da
        // cabeça, medido na própria malha — meia-largura `1,05·R` de
        // lado, `1,12·R` de altura e `1,15·R` de frente a trás. Só
        // passa quem estiver a um quarto de raio da casca; mais perto
        // que isso, o relevo do cabelo vira relevo de osso.
        //
        // A meia-largura é `1,05·R`, e não a do crânio (`0,85·R`),
        // por causa da **orelha**: ela se projeta até `1,03·R` e foi
        // o último vazamento a cair. Com o elipsoide estreito a bolha
        // passava no teste e ainda assim parava a um centímetro da
        // orelha, amassando-a em 19 mm. O preço é que na faixa da
        // orelha não nasce cacho de lado — que é como cabelo se
        // comporta ali de todo modo, preso atrás dela.
        const dentro = (x: number, y: number, z: number): boolean => {
          const dx = x / (R * 1.05);
          const dy = (y - cy) / (R * 1.12);
          const dz = z / (R * 1.15);
          return Math.sqrt(dx * dx + dy * dy + dz * dz) < 1.25;
        };
        const bolhas = detail.segments >= 26 ? 38 : 22;
        for (let i = 0; i < bolhas; i += 1) {
          const t = 0.04 + ((i + 0.5) / bolhas) * 0.7;
          const az = i * 2.39996;
          const cz = Math.cos(az);
          const px = Math.sin(az) * rxOf(t);
          const py = yOf(t);
          const pz = zcOf(t) + cz * (cz >= 0 ? R * 0.34 : rzBackOf(t));
          if (dentro(px, py, pz)) continue;
          b.feature([px, py, pz], [R * 0.22, R * 0.22, R * 0.22], R * 0.17);
        }
      }

      buildAkemiGlasses(b, detail, cy, R);

      // As flores, no alto à direita, como na arte. Elas nascem aqui
      // e não no acessório `flor`, que é compartilhado com os
      // habitantes e não pode mudar.
      //
      // E só existem de perto. Uma flor são cinco `ball`, e `ball` é
      // caro: cada uma vira uma varredura de oito segmentos com duas
      // calotas, perto de oitenta triângulos. Medido, uma flor só
      // custava quatrocentos triângulos no LOD de longe — era ela,
      // sozinha, que estourava o teto. A três metros de distância
      // uma pétala de dois centímetros não chega a um pixel.
      const flores: Array<[number, number, number, number]> = detail.segments < 14 ? [] : [
        [0.62, 0.15, 0.3, 1.0],
        [0.9, 0.04, 0.12, 0.78],
        [0.5, 0.21, -0.1, 0.68],
      ];
      for (let f = 0; f < flores.length; f += 1) {
        const [fx, fy, fz, esc] = flores[f];
        const cx = R * fx;
        const cyf = cy + fy;
        const cz = R * fz;
        const petalas = detail.segments >= 26 ? 5 : 4;
        for (let i = 0; i < petalas; i += 1) {
          const angle = (i / petalas) * TAU;
          b.ball(
            [cx + Math.cos(angle) * R * 0.13 * esc, cyf + Math.sin(angle) * R * 0.13 * esc, cz],
            [R * 0.1 * esc, R * 0.1 * esc, R * 0.06 * esc],
            { color: 0xfff4fb, finish: Finish.Cloth, skin: { bone: Bone.Head } },
            4,
          );
        }
        b.ball([cx, cyf, cz + R * 0.04], [R * 0.07 * esc, R * 0.07 * esc, R * 0.05 * esc], { color: 0xffd84a, finish: Finish.Holo, skin: { bone: Bone.Head } }, 4);
      }
      break;
    }
    case 'silvestre': {
      // A queda da Saturno — longa, pesada e dourada na ponta.
      //
      // Ela é a Defensora dos Animais, e a arte de referência mostra
      // uma figura de floresta. O risco não é estético, é de elenco:
      // a Maze é a Deusa da Natureza e ainda não foi remasterizada.
      // Por isso o que esta personagem carrega de distintivo não é
      // folha — é **galhada**. Folha ela tem de vidro, no traje.
      //
      // A silhueta: mais longa que a da Akemi (que para no ombro) e
      // mais curta que a `cascata` da Suki (que vai à junta do
      // quadril). Esta morre no meio das costas.
      const topY = cy + 0.05;
      const bottomY = cy - 0.52;
      const rings = segments >= 26 ? 14 : segments >= 14 ? 10 : 5;
      // `t` 0 na ponta, 1 no couro cabeludo, como em `cascata`.
      const yOf = (t: number): number => bottomY + (topY - bottomY) * t;
      // Afunilamento contínuo, sem patamar: trecho de largura
      // constante desenha um cilindro, e cilindro com fundo abaulado
      // vira urna. Foi o que a bancada mostrou no marco da Suki, e
      // não há razão para redescobrir isso aqui.
      const rxOf = (t: number): number => R * (0.66 + 0.42 * t) * (1 - 0.26 * smoothstep(0.1, 0, t));
      const rzBackOf = (t: number): number => R * (0.6 + 0.48 * t ** 0.75);
      const zcOf = (t: number): number => -R * (0.26 - 0.2 * smoothstep(0.4, 1, t));

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        fall.push({
          y: yOf(t),
          rx: rxOf(t),
          rz: R * 0.36,
          rzBack: rzBackOf(t),
          z: zcOf(t),
          // Castanho na raiz, dourado na ponta. O dourado é o da
          // ficha dela, não um amarelo qualquer: é a mesma cor da
          // aura e da faixa do traje, e é o que amarra a figura.
          color: tint(tint(dark, hair, smoothstep(0.0, 0.5, t)), 0xe0a83a, 0.52 * (1 - smoothstep(0.08, 0.62, t))),
          bone: Bone.Head,
          bone2: Bone.Torso,
          blend: 0.8 * (1 - smoothstep(cy - 0.46, cy - 0.04, yOf(t))),
        });
      }
      // Sem `subdivideProfile`: ela trava a cor na estação mais
      // próxima e descarta o acabamento, e o degradê é por anel.
      b.loft(toStations(fall), { segments, capBottom: R * 0.12, capRings: 2 });

      if (detail.segments >= 14) {
        // As mechas trançadas, em relevo. Custo zero em triângulos.
        //
        // O guarda de elipsoide abaixo não é zelo excessivo: no marco
        // da Akemi um campo de relevo empurrou o crânio 35 mm para
        // fora e a cabeça saiu amassada. `feature()` não sabe o que é
        // cabelo — empurra todo vértice ao alcance, e alcance é três
        // vezes o raio. Bolha que nasça perto do osso esculpe o osso.
        const longeDaCabeca = (x: number, y: number, z: number): boolean => {
          const dx = x / (R * 1.05);
          const dy = (y - cy) / (R * 1.12);
          const dz = z / (R * 1.15);
          return Math.sqrt(dx * dx + dy * dy + dz * dz) >= 1.3;
        };
        for (const base of [-0.95, -0.32, 0.32, 0.95]) {
          for (let t = 0.08; t <= 0.9; t += 0.085) {
            const az = Math.PI + base * (1 + 0.18 * (1 - t));
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            const px = sx * rxOf(t);
            const pz = zcOf(t) + sz * rzBackOf(t);
            const py = yOf(t);
            if (!longeDaCabeca(px, py, pz)) continue;
            // Alterna vinco e crista: é o que faz trança em vez de
            // ranhura solta.
            const trancado = Math.sin(t * 26) * 0.5 + 0.5;
            b.feature([px, py, pz], [R * 0.22, R * 0.42, R * 0.22], -R * (0.07 + 0.1 * trancado), [sx, 0, sz]);
          }
        }
      }

      buildAntlers(b, detail, cy, R);
      break;
    }
    case 'fibra': {
      // A queda da Haru — Fibra Óptica.
      //
      // O nome não é enfeite: a Nexara é a Deusa da Internet e o
      // penteado dela chama `fluxo`. Fibra é a infraestrutura por
      // onde o tráfego passa, que é o domínio da Haru; fluxo é o
      // tráfego. As duas são deusas digitais e precisam de nomes e
      // silhuetas que não se confundam.
      //
      // O briefing listou "cabelo curto assimétrico" entre as
      // características a preservar, e a arte de referência enviada
      // no mesmo pedido mostra cabelo **muito longo**. Perguntado, o
      // Criador escolheu o longo — e a bio em `Pantheon.ts` foi
      // corrigida junto, porque deixar o texto prometendo chanel
      // enquanto a malha entrega outra coisa é como o modelo antigo
      // já estava errado.
      //
      // O que sobreviveu da característica oficial: **a franja**, que
      // a calota base já desenha, e **a assimetria**, abaixo.
      const topY = cy + 0.05;
      const bottomY = cy - 0.84;
      const rings = segments >= 26 ? 15 : segments >= 14 ? 11 : 5;
      // `t` 0 na ponta, 1 no couro cabeludo — convenção herdada da
      // `cascata` da Suki, que é a outra queda muito longa do Éden.
      const yOf = (t: number): number => bottomY + (topY - bottomY) * t;
      // Afunilamento contínuo, sem patamar. Trecho de largura
      // constante desenha um cilindro, e cilindro com fundo abaulado
      // vira urna — foi o que a bancada mostrou no marco da Suki.
      // Quase reta, afinando só no último quinto. A primeira versão
      // ia de `0,94R` no couro a `0,41R` na ponta e a bancada
      // devolveu um cone — leu como capa de chuva, não como cabelo.
      // Cabelo longo desce acompanhando a largura dos ombros e só a
      // ponta fecha.
      //
      // No couro ela precisa ser **maior que o crânio**, não menor:
      // com `0,92R` a queda nascia dentro da cabeça e a bancada
      // mostrou a nuca nua entre a calota e o cabelo. A `cascata` do
      // estilo `longo` usa `1,06R` pelo mesmo motivo.
      const rxOf = (t: number): number => R * (0.8 + 0.26 * t) * (1 - 0.42 * smoothstep(0.22, 0, t));
      const rzBackOf = (t: number): number => R * (0.44 + 0.64 * t ** 0.85);
      const zcOf = (t: number): number => -R * (0.3 - 0.22 * smoothstep(0.4, 1, t));

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        fall.push({
          y: yOf(t),
          rx: rxOf(t),
          rz: R * 0.34,
          rzBack: rzBackOf(t),
          z: zcOf(t),
          // Ciano na raiz, aqua claro na ponta: o cabelo acende para
          // baixo, como luz percorrendo a fibra.
          color: tint(tint(dark, hair, smoothstep(0, 0.45, t)), 0xd8fbff, 0.45 * (1 - smoothstep(0.05, 0.6, t))),
          bone: Bone.Head,
          bone2: Bone.Torso,
          blend: 0.85 * (1 - smoothstep(cy - 0.78, cy - 0.04, yOf(t))),
        });
      }
      // Sem `subdivideProfile`: ela trava a cor na estação mais
      // próxima e o degradê é por anel.
      b.loft(toStations(fall), { segments, capBottom: R * 0.1, capRings: 2 });

      if (detail.segments >= 14) {
        // --- a franja ---
        //
        // A calota base já traz uma, mas é **relevo**: `feature()`
        // empurra a casca e, nesta escala, o sulco desaparece no
        // sombreamento — na bancada a cabeça saiu como touca de
        // natação, testa lisa de orelha a orelha. A franja é a única
        // coisa que sobrou da característica oficial "chanel" depois
        // que o Criador escolheu o cabelo longo, então ela tem de
        // existir em geometria.
        //
        // São lâminas **largas e sobrepostas**, não mechas soltas: a
        // primeira tentativa usou tubos finos e espaçados e a bancada
        // devolveu uma fileira de dedos apontando para o rosto.
        //
        // E assentam na **casca do cabelo**, não no crânio. A segunda
        // tentativa mediu o raio da cabeça e as lâminas nasceram
        // dentro da calota, que é mais bojuda que o osso: a franja
        // existia, custava triângulos e não aparecia — o mesmo
        // engano do laço enterrado no marco da Akemi. A elipse abaixo
        // é a da calota, com uma folga de 2 % para fora.
        const frenteDaCalota = (h: number, x: number): number => {
          const rx = R * (1.0 - 0.42 * smoothstep(0.1, 0.18, h));
          const rz = R * (0.95 - 0.2 * smoothstep(0.11, 0.18, h));
          return rz * Math.sqrt(Math.max(0.05, 1 - (x / rx) ** 2)) + R * 0.02;
        };
        // Pontas desiguais e repartição fora do centro: franja de
        // comprimento igual lê como tigela. O lado direito é o mais
        // curto porque é onde mora o visor.
        // Largura irregular de propósito: sete lâminas idênticas e
        // igualmente espaçadas vincam a testa como as pregas de um
        // abajur. A linha mais baixa para na sobrancelha — a malha
        // põe o olho em `cy + 0,12R`, e franja abaixo disso rouba o
        // rosto.
        const pontas: readonly (readonly [number, number, number])[] = [
          [-0.128, 0.05, 0.2],
          [-0.088, 0.055, 0.15],
          [-0.046, 0.062, 0.215],
          [-0.004, 0.069, 0.155],
          [0.038, 0.077, 0.205],
          [0.079, 0.086, 0.16],
          [0.118, 0.095, 0.19],
        ];
        for (const [fx, fy, fw] of pontas) {
          const mecha: Ctl[] = [
            { y: cy + fy, x: fx, rx: R * fw * 0.85, rz: R * 0.04, z: frenteDaCalota(fy, fx), color: tint(hair, 0xd8fbff, 0.3), bone: Bone.Head },
            { y: cy + 0.11, x: fx * 0.98, rx: R * fw, rz: R * 0.055, z: frenteDaCalota(0.11, fx), color: hair, bone: Bone.Head },
            { y: cy + 0.165, x: fx * 0.86, rx: R * fw * 0.9, rz: R * 0.06, z: frenteDaCalota(0.165, fx), color: dark, bone: Bone.Head },
          ];
          b.loft(toStations(mecha), { segments: 6, capBottom: R * 0.03, capRings: 1 });
        }

        // --- a assimetria ---
        //
        // O briefing pedia assimetria e ela sobrevive à troca de
        // comprimento: uma mecha mais cheia desce só pelo lado
        // direito, à frente do ombro. É o que impede a queda de ler
        // como cortina simétrica.
        //
        // Ela passa **à frente** do ombro de propósito. Atrás seria
        // invisível: o resto do cabelo já cobre as costas inteiras.
        //
        // O deslocamento lateral vai no campo `x` de cada estação:
        // `LoftOptions` não aceita matriz, e empurrar a peça depois
        // exigiria uma segunda varredura.
        const mx = R * 0.76;
        const mecha: Ctl[] = [
          // A ponta afina de verdade. A primeira versão tinha raio
          // quase constante e a mecha saiu como cano de piscina.
          { y: cy - 0.5, x: mx, rx: R * 0.06, rz: R * 0.06, z: R * 0.27, color: tint(hair, 0xd8fbff, 0.5), bone: Bone.Head, bone2: Bone.Torso, blend: 0.65 },
          { y: cy - 0.3, x: mx, rx: R * 0.15, rz: R * 0.13, z: R * 0.33, color: tint(hair, 0xd8fbff, 0.3), bone: Bone.Head, bone2: Bone.Torso, blend: 0.45 },
          { y: cy - 0.08, x: mx, rx: R * 0.2, rz: R * 0.17, z: R * 0.34, color: hair, bone: Bone.Head, bone2: Bone.Torso, blend: 0.2 },
          { y: cy + 0.04, x: mx, rx: R * 0.22, rz: R * 0.2, z: R * 0.26, color: hair, bone: Bone.Head },
          { y: cy + 0.13, x: mx * 0.78, rx: R * 0.19, rz: R * 0.18, z: R * 0.14, color: dark, bone: Bone.Head },
        ];
        b.loft(toStations(mecha), { segments: Math.max(8, Math.round(segments * 0.5)), capBottom: R * 0.08, capRings: 2 });

        // --- os filamentos de dado ---
        //
        // Sulcos de relevo primeiro, que custam **zero**: `feature()`
        // empurra vértices que já existem. Eles dão a quebra de
        // superfície que impede a queda de ler como prancha.
        //
        // O guarda de elipsoide abaixo não é zelo excessivo: no marco
        // da Akemi um campo de relevo empurrou o crânio 35 mm para
        // fora e a cabeça saiu amassada. `feature()` não sabe o que é
        // cabelo — empurra todo vértice ao alcance, e alcance é três
        // vezes o raio. Bolha que nasça perto do osso esculpe o osso.
        const longeDaCabeca = (x: number, y: number, z: number): boolean => {
          const dx = x / (R * 1.05);
          const dy = (y - cy) / (R * 1.12);
          const dz = z / (R * 1.15);
          return Math.sqrt(dx * dx + dy * dy + dz * dz) >= 1.25;
        };
        for (const base of [-1.05, -0.45, 0.18, 0.78]) {
          for (let t = 0.06; t <= 0.9; t += 0.07) {
            const az = Math.PI + base * (1 + 0.16 * (1 - t));
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            const px = sx * rxOf(t);
            const pz = zcOf(t) + sz * rzBackOf(t);
            const py = yOf(t);
            if (!longeDaCabeca(px, py, pz)) continue;
            b.feature([px, py, pz], [R * 0.18, R * 0.44, R * 0.18], -R * 0.11, [sx, 0, sz]);
          }
        }
      }

      if (detail.segments >= 20) {
        // E as fitas acesas, que são o que de fato conta a fibra
        // óptica. Relevo sozinho não bastou: na bancada a queda saiu
        // como uma prancha azul lisa, porque a esta escala um sulco
        // de dois milímetros não sobrevive ao sombreamento.
        //
        // Elas correm **sobre** a superfície da queda, lendo a mesma
        // parametrização que a construiu. Adereço que não nasce da
        // superfície real flutua — lição do marco da Nexara.
        const fita = (a: THREE.Vector3, c: THREE.Vector3): void => {
          const eixo = new THREE.Vector3().subVectors(c, a);
          const meio = new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5);
          const cima = eixo.clone().normalize();
          const fora = new THREE.Vector3(meio.x, 0, meio.z - zcOf(0.5)).normalize();
          fora.addScaledVector(cima, -fora.dot(cima)).normalize();
          const lado = new THREE.Vector3().crossVectors(cima, fora).normalize();
          b.addGeometry(
            new THREE.BoxGeometry(R * 0.042, eixo.length(), 0.004),
            { color: 0x8fe6ff, finish: Finish.Holo, skin: { bone: Bone.Head } },
            new THREE.Matrix4().makeBasis(lado, cima, fora).setPosition(meio),
          );
        };
        const naQueda = (base: number, t: number): THREE.Vector3 => {
          const az = Math.PI + base;
          // 1,04 encosta a fita na casca sem afundar nela.
          return new THREE.Vector3(
            Math.sin(az) * rxOf(t) * 1.04,
            yOf(t),
            zcOf(t) + Math.cos(az) * rzBackOf(t) * 1.04,
          );
        };
        for (const base of [-0.66, -0.24, 0.1, 0.44, 0.78]) {
          for (const [de, ate] of [
            [0.12, 0.34],
            [0.34, 0.56],
            [0.56, 0.78],
          ] as const) {
            fita(naQueda(base, de), naQueda(base, ate));
          }
        }
      }

      buildHaruGear(b, detail, cy);
      break;
    }
    case 'copa': {
      // A juba da Maze — Copa de Árvore.
      //
      // O nome é literal: a arte mostra uma copa, não um penteado.
      // Volume enorme, luz filtrando por dentro, vida morando lá.
      //
      // A ficha dizia `longo` e `hairColor: '#3fcf86'` — liso, verde,
      // parando no ombro. A arte de referência mostra uma juba
      // cacheada castanha e larguíssima, e o Criador escolheu a arte.
      // O verde não se perdeu: virou a cor das folhas e dos brotos
      // que moram aqui dentro, e a paleta canônica `colors` da ficha
      // não foi tocada.
      //
      // `longo` sai do marco intacto: é o penteado do **Criador
      // Aérion** e da Amara.
      // A juba é uma **esfera**, não uma queda: cabelo cacheado
      // afro-texturado cresce para fora em todas as direções, e o
      // raio maior fica na altura das orelhas, não no couro cabeludo.
      // A primeira versão usou o perfil de uma queda longa e o
      // resultado foi um capuz que cortava o crânio no meio.
      const jubaY = cy - 0.01;
      const jubaR = R * 1.62;
      const topY = jubaY + jubaR * 0.8;
      const bottomY = jubaY - jubaR * 1.02;
      const rings = segments >= 26 ? 13 : segments >= 14 ? 9 : 5;
      // `t` 0 na ponta, 1 no alto, como na `cascata` e na `fibra` — é
      // a convenção dos penteados grandes do Éden.
      const yOf = (t: number): number => bottomY + (topY - bottomY) * t;
      const perfil = (t: number): number =>
        Math.sqrt(Math.max(0.02, 1 - ((yOf(t) - jubaY) / jubaR) ** 2));
      const rxOf = (t: number): number => R * 1.62 * perfil(t);
      const rzBackOf = (t: number): number => R * 1.5 * perfil(t);
      // A frente tem **duas alturas**, e é o que resolve dois
      // problemas opostos de uma vez.
      //
      // Rasa na linha dos olhos: a primeira versão deu à juba a mesma
      // profundidade na frente e atrás e a bancada devolveu uma bola
      // de cabelo com o rosto preso dentro. Medido, a frente do rosto
      // está em `z = 0,1808` e a juba precisa parar antes.
      //
      // Funda em cima: com a frente rasa em toda a altura, a calota
      // compartilhada de `buildHair` — que chega a `R · 0,92` e não é
      // minha para alterar — **furava** a juba e aparecia por fora,
      // lisa e polida, terminando numa aresta dura sobre as
      // sobrancelhas. Acima da testa o cabelo avança até cobri-la; na
      // altura do olhar ele recua. É o que uma franja faz.
      const rzFrenteOf = (t: number): number =>
        R * (0.55 + 0.95 * smoothstep(cy + 0.015, cy + 0.185, yOf(t))) * perfil(t);
      const zcOf = (): number => -R * 0.2;

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        fall.push({
          y: yOf(t),
          rx: rxOf(t),
          rz: rzFrenteOf(t),
          rzBack: rzBackOf(t),
          z: zcOf(),
          color: tint(dark, hair, smoothstep(0.08, 0.7, t)),
          bone: Bone.Head,
          bone2: Bone.Torso,
          blend: 0.5 * (1 - smoothstep(cy - 0.18, cy + 0.06, yOf(t))),
        });
      }
      b.loft(toStations(fall), { segments, capBottom: R * 0.2, capRings: 2 });

      if (detail.segments >= 14) {
        // --- o cacho ---
        //
        // Relevo, que custa **zero** em triângulos: `feature()` empurra
        // vértices que já existem. É o que quebra a casca lisa e a faz
        // ler como cabelo cacheado em vez de capacete.
        //
        // O guarda de elipsoide não é zelo: no marco da Akemi um campo
        // de relevo empurrou o crânio 35 mm para fora e a cabeça saiu
        // amassada. `feature()` não sabe o que é cabelo — empurra todo
        // vértice ao alcance, e alcance é três vezes o raio da bolha.
        const longeDaCabeca = (x: number, y: number, z: number): boolean => {
          const dx = x / (R * 1.05);
          const dy = (y - cy) / (R * 1.12);
          const dz = z / (R * 1.15);
          return Math.sqrt(dx * dx + dy * dy + dz * dz) >= 1.25;
        };
        //
        // A amplitude não é estética, é aritmética: `feature()` pesa
        // o empurrão por `exp(-d²·1,4)`, então o pico vale o que diz
        // o argumento e some em três desvios. A primeira versão pediu
        // `R·0,055` — onze milímetros — e a bancada devolveu uma
        // bola de plástico lisa. Cacho precisa de centímetros.
        //
        // A bolha é **pequena** de propósito: `feature()` varre a
        // geometria inteira, inclusive o crânio que já está lá. Com
        // raio `R·0,24` o alcance morre antes da cabeça, e o que
        // sobra no rosto vale dois milésimos do empurrão.
        //
        // Vai até o topo. A primeira versão parou em `t = 0,9` e
        // deixou uma **calota lisa** sobre a testa: de perto a Maze
        // usava um capacete polido com a juba começando numa aresta
        // dura. O alto da cabeça é a primeira coisa que se vê num
        // diálogo.
        for (let anel = 0; anel < 10; anel += 1) {
          const t = 0.1 + anel * 0.1;
          const n = anel >= 8 ? 8 : 11;
          for (let i = 0; i < n; i += 1) {
            // Deslocamento por anel: cachos alinhados em colunas leem
            // como as pregas de um abajur.
            const az = (i / n) * TAU + anel * 0.47;
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            const raio = sz < 0 ? rzBackOf(t) : rzFrenteOf(t);
            const px = sx * rxOf(t);
            const pz = zcOf() + sz * raio;
            const py = yOf(t);
            if (!longeDaCabeca(px, py, pz)) continue;
            b.feature([px, py, pz], [R * 0.21, R * 0.23, R * 0.21], R * 0.3, [sx, 0.12, sz]);
          }
        }

        // --- as folhas na juba ---
        //
        // Assentadas na **casca do cabelo**, não no crânio. No marco da
        // Haru a franja mediu o raio da cabeça e nasceu dentro da
        // calota: existia, custava triângulos e não aparecia. A conta
        // abaixo é a mesma elipse que construiu a juba.
        const naJuba = (t: number, az: number, fora: number): [number, number, number] => {
          const sx = Math.sin(az);
          const sz = Math.cos(az);
          const raio = sz < 0 ? rzBackOf(t) : rzFrenteOf(t);
          return [sx * rxOf(t) * fora, yOf(t), zcOf() + sz * raio * fora];
        };
        const folha = (t: number, az: number, tam: number, cor: Hex): void => {
          const [px, py, pz] = naJuba(t, az, 1.02);
          // Larga. A primeira versão fez `tam·0,4` e afinou as
          // pontas a 25%: na bancada saíram palitos verdes. Folha lê
          // como folha quando tem barriga no meio.
          const g = new THREE.BoxGeometry(tam * 0.66, tam, 0.008);
          const pos = g.getAttribute('position');
          for (let i = 0; i < pos.count; i += 1) {
            const k = Math.cos((pos.getY(i) / tam) * Math.PI) * 0.5 + 0.5;
            pos.setX(i, pos.getX(i) * (0.2 + 0.9 * k));
            // Vinco: a folha dobra pela nervura, não fica chapada.
            pos.setZ(i, pos.getZ(i) + Math.abs(pos.getX(i)) * 0.3);
          }
          pos.needsUpdate = true;
          b.addGeometry(
            g,
            { color: cor, finish: Finish.Cloth, skin: { bone: Bone.Head } },
            new THREE.Matrix4()
              .makeRotationY(az)
              .multiply(new THREE.Matrix4().makeRotationZ(Math.sin(az * 2.1) * 0.9))
              .setPosition(px, py, pz),
          );
        };
        // Espalhadas sem padrão. Folha em fileira regular lê como
        // guirlanda de festa.
        const espalhadas: readonly (readonly [number, number, number])[] = [
          [0.8, -2.6, 0.105],
          [0.66, -1.5, 0.088],
          [0.84, -0.55, 0.078],
          [0.58, 0.72, 0.112],
          [0.74, 1.95, 0.094],
          [0.46, 2.8, 0.1],
          [0.38, -2.1, 0.082],
          [0.3, 1.25, 0.09],
          [0.52, -0.12, 0.07],
          [0.88, 2.45, 0.084],
          [0.62, -3.0, 0.092],
          [0.44, 0.3, 0.076],
        ];
        for (const [t, az, tam] of espalhadas) {
          // Nada na frente abaixo da testa. Na bancada uma folha
          // nasceu pendurada sobre a bochecha: a frente da juba é
          // rasa de propósito, e o que é posto nela encosta no rosto.
          if (Math.cos(az) > 0.72 && yOf(t) < cy + 0.1) continue;
          folha(t, az, tam, (az * 7) % 2 > 1 ? 0x9df0b0 : 0x3fa96b);
        }

        // --- a coroa ---
        //
        // Substitui o acessório `flor`, a pedido do Criador. A flor
        // antiga custava **912 triângulos idênticos nos quatro
        // LODs** — nunca cortava, nem a cinquenta metros — e era uma
        // florzinha rosa de um centímetro numa têmpora só, numa
        // personagem de paleta verde.
        //
        // Esta é um **anel**, em volta da cabeça, e corta por
        // distância como tudo o mais.
        //
        // A altura sai de uma conta, não de um palpite: `tDaTesta`
        // resolve `yOf(t) = cy + 0,13`, que é a linha da testa. A
        // primeira versão usou `t = 0,9` direto e a coroa caiu em
        // `cy + 0,02` — que é onde `FACE.eyeY` põe o olho. Na bancada
        // ela atravessou o rosto na altura das sobrancelhas.
        const tDaTesta = (cy + 0.145 - bottomY) / (topY - bottomY);
        const coroaN = Math.max(9, Math.round(segments * 0.45));
        for (let i = 0; i < coroaN; i += 1) {
          const az = (i / coroaN) * TAU;
          folha(tDaTesta, az, 0.058, i % 3 === 0 ? 0x9df0b0 : 0x3fa96b);
        }
        // As três flores da coroa, à frente e nas têmporas.
        for (const az of [-0.75, 0, 0.75]) {
          const [px, py, pz] = naJuba(tDaTesta, az, 1.04);
          for (let i = 0; i < 5; i += 1) {
            const a = (i / 5) * TAU;
            b.ball(
              [px + Math.cos(a) * R * 0.05, py + Math.sin(a) * R * 0.05, pz],
              [R * 0.042, R * 0.042, R * 0.028],
              { color: 0xfdf6e3, finish: Finish.Cloth, skin: { bone: Bone.Head } },
              4,
            );
          }
          b.ball([px, py, pz + R * 0.02], [R * 0.03, R * 0.03, R * 0.024], { color: 0xffd84a, finish: Finish.Shine, skin: { bone: Bone.Head } }, 4);
        }
      }

      if (detail.segments >= 20) {
        // --- os tufos ---
        //
        // O relevo sozinho não bastou: `feature()` empurra a casca,
        // mas a casca continua contínua, e na bancada a juba leu como
        // uma bola de madeira polida. Cacho tem **silhueta** — o
        // contorno precisa ser recortado, e isso só vem de volume
        // novo na borda.
        //
        // Só nos dois níveis de perto. De longe o relevo basta, e a
        // silhueta de uma esfera cacheada e de uma esfera lisa é a
        // mesma a vinte metros.
        for (let anel = 0; anel < 6; anel += 1) {
          const t = 0.2 + anel * 0.157;
          const n = anel >= 4 ? 7 : 10;
          for (let i = 0; i < n; i += 1) {
            const az = (i / n) * TAU + anel * 0.6;
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            // Nada de tufo na frente abaixo da testa: ali está o rosto.
            if (sz > 0.72 && yOf(t) < cy + 0.1) continue;
            const raio = sz < 0 ? rzBackOf(t) : rzFrenteOf(t);
            const rr = R * (0.17 + 0.05 * Math.sin(i * 2.1 + anel));
            // No alto o perfil fecha e os tufos se amontoam no eixo:
            // menores, ou viram uma bola de massa no topo da cabeça.
            const encolhe = 1 - 0.35 * smoothstep(0.78, 1, t);
            b.ball(
              [sx * rxOf(t) * 0.97, yOf(t), zcOf() + sz * raio * 0.97],
              [rr * encolhe, rr * 0.92 * encolhe, rr * encolhe],
              { color: tint(dark, hair, 0.35 + 0.5 * t), finish: Finish.Hair, skin: { bone: Bone.Head } },
              4,
            );
          }
        }

        // --- as pontas sobre a testa ---
        //
        // Mesmo com a franja cobrindo a calota, a borda onde ela sai
        // da testa é uma **linha reta**: é a interseção de duas
        // superfícies suaves, e interseção limpa lê como aresta de
        // plástico. Cabelo cacheado não tem linha de corte — tem
        // pontas que descem desiguais.
        //
        // Pousadas na superfície da testa (`z ≈ R · 0,9`, medido) e
        // acima da sobrancelha, que `buildFace` põe em `cy + 0,058`.
        for (let i = 0; i < 9; i += 1) {
          const u = (i / 8) * 2 - 1;
          const az = u * 1.2;
          const desce = Math.sin(i * 2.3) * 0.5 + 0.5;
          const rr = R * (0.1 + 0.042 * desce);
          b.ball(
            [
              Math.sin(az) * R * 0.72,
              cy + 0.108 - 0.03 * desce - 0.016 * u * u,
              // À frente **das duas** superfícies: a testa está em
              // `R · 0,90` e a franja chega ao mesmo ponto. A
              // primeira tentativa pôs as pontas em `R · 0,84` e
              // elas nasceram dentro da cabeça — a captura saiu
              // idêntica à anterior, sem nenhuma ponta à vista.
              Math.cos(az) * R * 0.99,
            ],
            [rr * 1.1, rr, rr],
            { color: tint(dark, hair, 0.58), finish: Finish.Hair, skin: { bone: Bone.Head } },
            4,
          );
        }

        // E um anel extra bem no alto, onde a casca fechava lisa.
        for (let i = 0; i < 9; i += 1) {
          const az = (i / 9) * TAU + 0.31;
          const sx = Math.sin(az);
          const sz = Math.cos(az);
          const t = 0.95;
          const raio = sz < 0 ? rzBackOf(t) : rzFrenteOf(t);
          const rr = R * 0.13;
          b.ball(
            [sx * rxOf(t) * 0.94, yOf(t) - R * 0.03, zcOf() + sz * raio * 0.94],
            [rr, rr * 0.86, rr],
            { color: tint(dark, hair, 0.82), finish: Finish.Hair, skin: { bone: Bone.Head } },
            4,
          );
        }

        // --- os brotos acesos ---
        //
        // Pequenos, sem simetria, espalhados pela juba. São o que a
        // faz parecer viva à noite, quando o castanho apaga — e são a
        // bioluminescência que o briefing pede, vinda de **seiva**,
        // não de circuito.
        const brotos: readonly (readonly [number, number])[] = [
          [0.76, -2.9],
          [0.64, -1.9],
          [0.88, -1.1],
          [0.52, -0.3],
          [0.72, 0.4],
          [0.44, 1.1],
          [0.8, 1.6],
          [0.6, 2.3],
          [0.36, 3.0],
          [0.68, -0.9],
        ];
        for (const [t, az] of brotos) {
          if (Math.cos(az) > 0.72 && yOf(t) < cy + 0.1) continue;
          const sx = Math.sin(az);
          const sz = Math.cos(az);
          const raio = sz < 0 ? rzBackOf(t) : rzFrenteOf(t);
          b.ball(
            [sx * rxOf(t) * 1.02, yOf(t), zcOf() + sz * raio * 1.02],
            [R * 0.026, R * 0.026, R * 0.026],
            { color: 0x6cf5a8, finish: Finish.Holo, skin: { bone: Bone.Head } },
            4,
          );
        }
      }
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
    case 'pincelada': {
      // A juba da Júpiter — Pincelada.
      //
      // O nome é literal. Ela é a Deusa da Arte, e a arte de
      // referência mostra o cabelo como um traço de tinta vermelha
      // suspenso no ar: longo, ondulado, com movimento.
      //
      // A ficha dizia `cacheado`, que na malha é um capacete de oito
      // a doze esferas de subdivisão **fixa** — 1 170 triângulos no
      // LOD baixo, três vezes a média do catálogo, e só 4 284 em
      // ultra: caro de longe, pobre de perto. Ele não foi corrigido,
      // porque é penteado de habitante e continua inteiro para quem o
      // herda. A Júpiter é que saiu dele.
      const bottomY = cy - 0.6;
      // O topo vai até o alto do crânio de propósito. `buildHair`
      // desenha uma calota antes do `switch`, comum aos treze
      // penteados, e a primeira rodada de bancada deixou essa calota
      // à mostra: uma cúpula lisa e polida no alto da cabeça, sem
      // onda nenhuma. A queda agora passa por cima dela. Cobrir,
      // nunca alterar — a calota é de todo mundo.
      const topY = cy + R * 0.99;
      const rings = segments >= 26 ? 12 : segments >= 14 ? 9 : 6;
      // Ruído determinístico: as ondas da primeira rodada tinham
      // todas a mesma amplitude e, de perfil, o cabelo lia como uma
      // escada de costelas. Cabelo de verdade é irregular.
      const sz2 = (a: number): number => Math.cos(a);
      const ruido = (n: number): number => {
        const v = Math.sin(n * 12.9898) * 43758.5453;
        return v - Math.floor(v);
      };
      /** Perfil do volume em cada altura, já com a ondulação da queda. */
      const perfil = (y: number): number => {
        if (y >= cy) {
          // Domo: acompanha o crânio um fio por fora, afinando no alto.
          const k = Math.min(1, (y - cy) / (R * 0.99));
          return Math.max(R * 0.13, R * 1.02 * Math.sqrt(Math.max(0, 1 - k * k)));
        }
        const d = cy - y;
        // Abre no ombro, afina na ponta — e ondula no caminho.
        // Abre no ombro, afina na ponta. A quarta rodada abriu até
        // `R · 1,40` e, de costas, a massa lia como uma **colmeia**.
        // A ponta não pode afinar demais: na oitava rodada ela
        // fechava em `R · 0,60` e, apesar de a sonda medir cabelo até
        // `y = 0,158` — quase na cintura —, nas capturas a deusa
        // parecia de cabelo curto. Comprimento que não se vê não é
        // comprimento.
        const base = R * (1.0 + 0.2 * smoothstep(0, 0.16, d) - 0.34 * smoothstep(0.26, 0.6, d));
        return base * (1 + 0.09 * Math.sin(d * 19 + 0.7));
      };
      // Rasa na linha do olhar: cabelo que avança ali engole o rosto.
      // Medido nesta malha, a frente do rosto está em `z = 0,2089`.
      const frente = (y: number): number => perfil(y) * (0.26 + 0.62 * smoothstep(cy - 0.04, cy + 0.22, y));
      const zcOf = (y: number): number => -R * (0.3 - 0.16 * smoothstep(cy - 0.5, cy, y));

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        // Anéis um pouco mais juntos na ponta, onde a silhueta
        // fecha; o domo já é curto e não precisa de muitos.
        const y = bottomY + (topY - bottomY) * Math.pow(t, 0.85);
        fall.push({
          y,
          rx: perfil(y),
          rz: frente(y),
          rzBack: perfil(y) * 1.04,
          z: zcOf(y),
          // O vermelho não é chapado: escurece na raiz e acende na
          // ponta, como tinta que seca mais fina na borda.
          color: tint(dark, hair, smoothstep(cy - 0.48, cy - 0.04, y) * 0.85),
          bone: Bone.Head,
          bone2: Bone.Torso,
          blend: 0.6 * (1 - smoothstep(cy - 0.38, cy - 0.04, y)),
        });
      }
      b.loft(subdivideProfile(toStations(fall), detail.steps), { segments, capBottom: R * 0.14, capRings: 2 });

      if (detail.segments >= 14) {
        // --- as ondas ---
        //
        // Relevo, que custa **zero** triângulo: `feature()` empurra
        // vértices que já existem. A amplitude é aritmética, não
        // gosto: o empurrão é pesado por `exp(-d²·1,4)`, então o valor
        // pedido é o pico. No marco da Maze um relevo de `R · 0,055`
        // — onze milímetros — simplesmente não apareceu.
        //
        // A bolha é pequena porque `feature()` varre a geometria
        // **inteira**, inclusive o crânio que já está lá: na Akemi um
        // campo de relevo de cabelo empurrou a cabeça 35 mm para fora.
        // Daí o `longeDaCabeca`, que é a cerca.
        const longeDaCabeca = (x: number, y: number, z: number): boolean => {
          const dx = x / (R * 1.06);
          const dy = (y - cy) / (R * 1.1);
          const dz = z / (R * 1.16);
          return Math.sqrt(dx * dx + dy * dy + dz * dz) >= 1.1;
        };
        for (let anel = 0; anel < 10; anel += 1) {
          const n = 7;
          for (let i = 0; i < n; i += 1) {
            // Cada onda sobe ou desce um pouco em relação às vizinhas.
            // Sem isso elas formam anéis fechados em volta da cabeça, e
            // de costas o cabelo lê como uma colmeia — foi o que a
            // sétima rodada devolveu.
            const y = cy + R * 0.5 - anel * 0.064 - ruido(anel * 13 + i * 5) * 0.045;
            // Deslocamento por anel: ondas alinhadas em colunas leem
            // como as pregas de um abajur.
            const az = (i / n) * TAU + anel * 0.72 + ruido(anel * 3 + i) * 0.5;
            const sx = Math.sin(az);
            const sz = Math.cos(az);
            const raio = sz < 0 ? perfil(y) * 1.04 : frente(y);
            const px = sx * perfil(y);
            const pz = zcOf(y) + sz * raio;
            if (!longeDaCabeca(px, y, pz)) continue;
            const amp = R * (0.15 + 0.13 * ruido(anel * 7 + i * 2));
            b.feature([px, y, pz], [R * 0.3, R * 0.19, R * 0.3], amp, [sx, 0.12, sz]);
          }
        }
      }

      if (detail.segments >= 20) {
        // --- o volume do alto ---
        //
        // Sem isto o alto da cabeça lê como uma **touca**: a calota
        // que `buildHair` desenha antes do `switch` é lisa, e a queda
        // passa por cima dela igualmente lisa. As bolhas aqui são
        // pequenas e ficam todas acima de `cy + R · 0,3` — o
        // empurrão alcança o topo do crânio, que está coberto, e
        // nunca o rosto, que é o erro que deformou a Akemi.
        for (let anel = 0; anel < 3; anel += 1) {
          const y = cy + R * (0.42 + anel * 0.22);
          const n = anel === 2 ? 4 : 6;
          for (let i = 0; i < n; i += 1) {
            const az = (i / n) * TAU + anel * 0.8;
            const r = perfil(y) * (sz2(az) < 0 ? 1.1 : 1.0);
            b.feature(
              [Math.sin(az) * r, y, zcOf(y) + Math.cos(az) * r],
              [R * 0.34, R * 0.26, R * 0.34],
              // A amplitude é aritmética, não gosto: o empurrão é
              // pesado por `exp(-d²·1,4)`, e no marco da Maze um
              // relevo de `R · 0,055` — onze milímetros — não
              // apareceu na captura. Este é o triplo disso.
              R * (0.17 + 0.07 * ruido(anel * 11 + i)),
              [Math.sin(az), 0.3, Math.cos(az)],
            );
          }
        }

        // As **mechas douradas** foram tentadas duas vezes e saíram
        // nas duas. Na primeira, plantadas em toda a volta, uma
        // atravessou a boca — o raio da frente é raso de propósito na
        // altura do rosto, e o que nasce ali nasce dentro da cara. Na
        // segunda, recuadas para os lados e para trás, apareceram nas
        // capturas como riscos **esverdeados** sobre o vermelho, que é
        // cor proibida pela fronteira com a Saturno. O ouro dela vive
        // no traje e no acessório, onde tem superfície para brilhar.
      }
      break;
    }
    case 'nascente': {
      // A Nascente — da Amara, e só dela.
      //
      // Água que brota: a arte de referência mostra um cabelo
      // clarís­simo, liso e longuíssimo, que desce em corrente pelas
      // costas e passa à frente dos ombros. É a **massa de cabelo**
      // mais longa do catálogo — desce a `y = −0,10`, contra os
      // `0,01` da `cascata` da Suki-Chan, que tinha o título — e é de
      // propósito: ela é a Deusa da Maternidade, e comprimento aqui é
      // continuidade, não enfeite. Mais fundo que ela só a `fibra` da
      // Akemi-Chan, e aquilo são filamentos ópticos soltos.
      //
      // A ficha dizia `longo`, que é a peça do Aérion: 380 triângulos
      // no LOD baixo, uma casca de quatro anéis que para no ombro. Ele
      // não foi tocado, porque é o cabelo do Criador e o de meia
      // cidade. A Amara é que saiu dele.
      const bottomY = cy - 0.78;
      // Até o alto do crânio: a calota que `buildHair` desenha antes
      // do `switch` é comum aos dezesseis penteados, e aparecer por
      // baixo da queda foi o que a bancada da Júpiter flagrou. Cobrir,
      // nunca alterar.
      // O domo é uma elipse **medida no crânio**, não um múltiplo de
      // `R` escolhido no olho, e é por isso que a bancada devolveu
      // capuz quatro rodadas seguidas. `cy` não é o centro da cabeça:
      // é `headJointY + 0,16 · headSize`, que neste corpo cai em
      // 0,636 — a altura da **boca**. A orelha está em `cy + 0,27 R`
      // e o alto do crânio em `cy + 1,71 R`. Com `topY = cy + 1,08 R`
      // o cabelo inteiro acabava em 0,82, meio crânio abaixo do topo,
      // e tudo que se via no alto da cabeça era a calota lisa que
      // `buildHair` desenha para os dezesseis penteados.
      //
      // Pele nua varrida nesta malha (`maxX` por altura):
      //
      //     y 0,80 → 0,1654   y 0,88 → 0,0986
      //     y 0,84 → 0,1446   y 0,92 → 0,0493   topo 0,929
      //
      // O domo abaixo passa por fora disso em toda altura, de modo
      // que a calota fica coberta — nunca alterada — e o volume do
      // alto passa a ser desta peça.
      //
      // E `cy` vale **0,716**, não 0,636: `headJointY` não é
      // `neckY`. Uma rodada inteira saiu com a cabeça medida meio
      // crânio abaixo de onde ela está, e foi por isso que o domo
      // nasceu em cima do avatar como um chapéu — a verificação é
      // `domoY + domoH` contra o topo varrido, e os dois têm de
      // bater na quarta casa.
      // O topo fica em `domoY + domoH = cy + 1,34 R = 0,945`, um
      // centímetro e meio acima do crânio (0,929) e não mais.
      const domoY = cy + R * 0.42;
      const domoH = R * 0.92;
      const domoW = R * 1.15;
      const topY = domoY + domoH;
      // 11 anéis em ultra, não 15: `subdivideProfile` ainda os
      // multiplica por `detail.steps` (7 em ultra), de modo que cada
      // anel de controle custa sete anéis de malha × 44 segmentos ×
      // 2 triângulos ≈ 616. Quatro a menos devolvem ~2 500
      // triângulos sem que a queda perca uma curva sequer — o que
      // precisava de anel era o **domo**, e o domo cabe em quatro.
      const rings = segments >= 26 ? 11 : segments >= 14 ? 9 : 6;
      const ruido = (n: number): number => {
        const v = Math.sin(n * 12.9898) * 43758.5453;
        return v - Math.floor(v);
      };
      /**
       * Volume em cada altura.
       *
       * Liso, não ondulado: a referência é cabelo de água corrente, e
       * a Pincelada da Júpiter já ocupa o lugar da juba com onda. O
       * que dá vida aqui é o afinamento lento e a mecha, não a
       * costela.
       */
      const perfil = (y: number): number => {
        if (y >= cy) {
          // Até o centro do domo a massa só engrossa; daí para cima
          // é a elipse. A junção é contínua por construção: em
          // `domoY` os dois ramos valem `domoW`.
          // 1,09 R na base do domo, não 0,9 R: a pele na altura de
          // `cy` mede 0,18 de raio, e `0,9 R = 0,154` punha o cabelo
          // **dentro do crânio** — a massa sumia justamente na
          // altura da orelha. O valor casa com o da queda logo
          // abaixo de `cy`, para não haver degrau na emenda.
          if (y <= domoY) return R * (1.09 + 0.06 * smoothstep(cy, domoY, y));
          const k = Math.min(1, (y - domoY) / domoH);
          return Math.max(R * 0.06, domoW * Math.sqrt(Math.max(0, 1 - k * k)));
        }
        const d = cy - y;
        // Abre pouco no ombro e afina devagar: a queda tem de chegar
        // **larga** na ponta, ou o comprimento não se lê. A lição da
        // oitava rodada da Júpiter foi essa — a sonda media cabelo na
        // cintura e a captura mostrava cabelo curto.
        // Estreita na altura do rosto (`d < 0,1`), abre no ombro,
        // afina devagar na ponta: é esse estrangulamento que faz o
        // cabelo **emoldurar** em vez de engolir.
        // O ombro mede `|x| = 0,1768`. A queda chegava a `1,40 R`
        // (0,239) — mais larga que a dona — e de costas a bancada
        // devolveu um **casulo**: uma massa de cabelo tapando o
        // vestido inteiro, de ombro a ombro. Cabelo comprido é mais
        // estreito que os ombros, e é a silhueta do pano atrás dele
        // que diz que há uma pessoa ali.
        // Estreita na têmpora (1,09 R = 0,186, contra a orelha em
        // 0,1804) e larga no ombro (1,26 R): silhueta em **A**. Com
        // 1,14 R chapado da têmpora ao ombro a massa descia reta
        // como a lateral de um capacete, e foi isso que o close do
        // rosto acusou — duas placas lisas ladeando a cara.
        return R * (1.09 + 0.17 * smoothstep(0.02, 0.34, d) - 0.3 * smoothstep(0.4, 0.78, d));
      };
      // Rasa na linha do olhar: a frente do rosto está em `z = 0,2089`
      // nesta malha, e cabelo que avança ali engole a cara.
      // A quarta rodada enquadrou o rosto num **elmo**: a massa
      // chegava rente à bochecha dos dois lados e a testa ficava
      // dentro de uma viseira. O raio frontal cai pela metade na
      // altura do olhar, e o centro da queda recua junto.
      // A entrada do cabelo fica em `y ≈ 0,83`, medida contra a
      // testa varrida (`z` da pele: 0,1549 em 0,80; 0,1426 em 0,82;
      // 0,1341 em 0,84). Abaixo disso o raio frontal é pequeno e a
      // testa aparece; acima, o domo passa à frente da pele e a
      // coroa é cabelo. Com o fator antigo (0,62 no alto) o domo
      // corria **atrás** da testa e quem aparecia no alto da cabeça
      // era a calota clara — a touca que a bancada acusou.
      //
      // A rampa é longa — `cy + 0,03` a `cy + 0,15` — porque com
      // uma curta (`+0,06` a `+0,13`) a frente do cabelo saltava de
      // 0,045 para 0,18 em quatro centímetros de altura, e a bancada
      // mostrou uma **aba** atravessada na testa, como a pala de um
      // boné. Linha de cabelo é curva, não degrau.
      //
      // E o teto é 1,17 e não 0,98: `buildHair` empurra a franja
      // para `z ≈ 0,177` na altura de 0,84 (um `feature` de
      // `R · 0,075` sobre a calota), e qualquer teto menor deixava
      // esse **rolo claro** aparecendo à frente da massa, atravessado
      // na testa como uma tiara. A coroa fica um pouco mais funda que
      // larga, que é o perfil certo para cabelo que vem para a
      // frente.
      const frente = (y: number): number => perfil(y) * (0.12 + 1.05 * smoothstep(cy + 0.03, cy + 0.15, y));
      // O recuo do centro também tem de afrouxar na coroa: 0,18 R
      // de recuo somados ao raio frontal ainda deixavam o domo atrás
      // da pele da testa.
      const zcOf = (y: number): number =>
        -R * (0.4 - 0.22 * smoothstep(cy - 0.6, cy, y) - 0.13 * smoothstep(cy, cy + 0.14, y));

      const fall: Ctl[] = [];
      for (let i = 0; i < rings; i += 1) {
        const t = i / (rings - 1);
        // Expoente 0,45, e isto é aritmética, não gosto. Com 0,82 só
        // **dois** dos treze anéis caíam acima de `cy`: o domo inteiro
        // do cabelo tinha dois anéis de vértices, `feature()` não
        // tinha o que empurrar, e a bancada devolveu touca de natação
        // duas rodadas seguidas. Com 0,45, mais de um terço dos anéis
        // fica no alto da cabeça, que é onde o volume se vê.
        const y = bottomY + (topY - bottomY) * Math.pow(t, 0.45);
        fall.push({
          y,
          rx: perfil(y),
          rz: frente(y),
          rzBack: perfil(y) * 0.98,
          z: zcOf(y),
          // Degradê de **matiz**, como o da Nexara: a raiz é a cor da
          // ficha e a ponta acende no verde-água da paleta dela. Um
          // cabelo que já nasce quase branco não tem para onde
          // clarear, e `shade` só anda para o branco ou para o preto.
          // Raiz verde-água, ponta quase branca. Na quarta rodada o
          // degradê ia de claro a claro, e a captura de costas
          // devolveu um **casulo**: cabelo e vestido na mesma cor,
          // sem silhueta no meio. Agora a raiz é `NASCENTE_RAIZ`, que
          // é o tom médio da paleta dela, e a ponta é a cor da ficha
          // clareada — é o degradê da arte, e é o que separa a massa
          // do cabelo do pano do traje.
          // Três paradas, não duas: claro na coroa, verde no meio da
          // queda, claro na ponta. Com duas, o alto da cabeça saía no
          // verde cheio da raiz — e como a calota de `buildHair` é
          // sempre `hairColor`, a emenda virava uma **linha de
          // chapéu** no meio da testa, tom escuro por cima do claro.
          // Aqui a coroa termina na cor da calota e a emenda some.
          color: tint(
            tint(NASCENTE_RAIZ, shade(hair, 0.22), smoothstep(0, 0.62, cy - y)),
            hair,
            smoothstep(0.0, -0.2, cy - y),
          ),
          bone: Bone.Head,
          bone2: Bone.Torso,
          blend: 0.68 * (1 - smoothstep(cy - 0.52, cy - 0.02, y)),
        });
      }
      // Subdivisão 4, não `detail.steps` (que é 7 em ultra): os
      // penteados do catálogo têm quatro anéis de controle e
      // precisam da interpolação para não facetar. Este tem onze —
      // a curva já está nos anéis, e multiplicar por sete só pagava
      // 2 600 triângulos de malha lisa. Com 4 são 41 anéis ao longo
      // de 85 cm de cabelo, um a cada dois centímetros.
      b.loft(subdivideProfile(toStations(fall), Math.min(4, detail.steps)), {
        segments,
        capTop: R * 0.04,
        capBottom: R * 0.12,
        capRings: 2,
      });

      if (detail.segments >= 14) {
        // --- as duas mechas da frente ---
        //
        // Caem sobre o ombro, à frente do corpo, como na arte. Nenhum
        // penteado do catálogo tem isso hoje, e é o que separa a
        // Nascente de "mais uma queda comprida" vista de frente.
        //
        // Elas nascem **atrás da linha da orelha** (medida nesta
        // malha em `|x| = 0,1804`, `y = 0,6820`) e passam por fora
        // dela: nascendo na frente, a mecha sai do meio da bochecha.
        for (const lado of [-1, 1] as const) {
          const mecha: Ctl[] = [];
          const nos = segments >= 26 ? 5 : 4;
          for (let i = 0; i < nos; i += 1) {
            const t = i / (nos - 1);
            const y = cy + R * 0.42 - t * 0.74;
            mecha.push({
              y,
              // Achatadas contra o corpo: a primeira rodada fez os
              // dois raios quase iguais e a mecha saiu **cilíndrica**,
              // como um tubo pendurado na orelha. Cabelo que cai sobre
              // o ombro é uma cortina — larga de frente, fina de lado.
              rx: R * (0.3 - 0.1 * t),
              rz: R * (0.12 - 0.04 * t),
              // Por **fora** da orelha, que esta malha põe em
              // `|x| = 0,1804` — isto é, `R · 1,05`. A rodada
              // anterior usou `R · 0,92` e as duas mechas nasceram
              // por dentro da orelha, cobrindo a bochecha: de frente
              // pareciam duas tiras coladas na cara.
              // Para a **frente**. Na quinta rodada elas desciam em
              // `|x| = R · 1,07` com `z` quase nulo — isto é, na
              // linha do ombro (`shoulderX = 0,1768`) e dentro do
              // braço, que cai exatamente ali. Sumiram as duas.
              // Agora a mecha vem para cima do peito, que é onde a
              // arte de referência a mostra.
              x: lado * R * (1.0 - 0.14 * smoothstep(0.1, 0.9, t)),
              // O `smoothstep` começa em 0,3 e não em 0: na sétima
              // rodada a mecha vinha para a frente já na altura da
              // orelha e passava **por cima da bochecha**. Ela só
              // cruza para o peito depois do queixo.
              z: R * (-0.12 + 1.1 * smoothstep(0.3, 0.8, t)),
              color: tint(NASCENTE_RAIZ, shade(hair, 0.22), 0.25 + 0.7 * t),
              bone: Bone.Head,
              bone2: Bone.Torso,
              blend: 0.6 * smoothstep(0.1, 0.9, t),
            });
          }
          b.loft(subdivideProfile(toStations(mecha), detail.steps), { segments: Math.max(6, Math.round(segments * 0.5)), capBottom: R * 0.07, capRings: 2 });
        }
      }

      if (detail.segments >= 20) {
        // --- o volume do alto ---
        //
        // Sem isto o alto da cabeça lê como touca: a calota é lisa e a
        // queda passa por cima dela igualmente lisa. As bolhas ficam
        // todas acima de `cy + R · 0,38`, longe do rosto — o empurrão
        // de `feature()` varre a malha inteira, e foi assim que um
        // relevo de cabelo deformou a cara da Akemi em 35 mm.
        // A cerca tem **duas** portas, e a primeira rodada só tinha
        // uma. Medido: uma bolha no alto da cabeça, em
        // `cy + R · 0,38`, dá distância normalizada 0,77 — era
        // descartada pelo limiar de 1,08, e a bancada devolveu uma
        // calota lisa que lia como **touca de natação**.
        //
        // O limiar existe para proteger o **rosto** (foi um relevo de
        // cabelo que empurrou a cara da Akemi 35 mm), e rosto é coisa
        // que está abaixo da testa. Acima de `cy + R · 0,45` não há o
        // que proteger: ali é crânio, e crânio está coberto.
        const longeDaCabeca = (x: number, y: number, z: number): boolean => {
          if (y >= cy + R * 0.45) return true;
          const dx = x / (R * 1.06);
          const dy = (y - cy) / (R * 1.1);
          const dz = z / (R * 1.16);
          return Math.sqrt(dx * dx + dy * dy + dz * dz) >= 1.08;
        };
        // --- as divisões da coroa ---
        //
        // Sem isto o alto da cabeça é casca lisa, e casca lisa lê
        // como touca por mais volume que tenha — foi o laudo de
        // cinco rodadas seguidas. São **vales**, não bolhas:
        // amplitude negativa, na direção do próprio raio, descendo
        // em meridiano da coroa até a altura da testa.
        for (let col = 0; col < (segments >= 26 ? 9 : 6); col += 1) {
          const nCol = segments >= 26 ? 9 : 6;
          const az = (col / nCol) * TAU + 0.35;
          // A frente recebe um vale a mais e mais fundo, descendo
          // até a linha do cabelo: é o que transforma a borda de
          // baixo do domo numa **franja recortada** em vez de uma
          // aba lisa. O domo cobre o rolo que `buildHair` levanta
          // sobre a testa, mas cobrir com casca lisa só trocava um
          // rolo por outro — a borda precisa ter dentes.
          const frontal = Math.cos(az) > 0.45;
          const passos = frontal ? 4 : 3;
          for (let passo = 0; passo < passos; passo += 1) {
            const y = cy + R * (1.18 - passo * 0.34);
            const r = perfil(y) * 0.98;
            b.feature(
              [Math.sin(az) * r, y, Math.cos(az) * r + zcOf(y)],
              // Rasos de propósito. Foram fundos numa rodada
              // (`−R · 0,2`, meia-altura `R · 0,26`) e a bancada
              // mostrou o preço: as cristas entre os vales passaram
              // a pender **sobre o olho**. Na frente de um rosto o
              // relevo tem de ser leitura, não volume.
              [R * 0.14, R * (frontal ? 0.24 : 0.3), R * 0.14],
              -R * ((frontal ? 0.14 : 0.09) + 0.04 * ruido(col * 7 + passo)),
              [Math.sin(az), 0.25, Math.cos(az)],
            );
          }
        }

        // --- a risca ---
        //
        // Um vale fundo em `az = 0`, da coroa até a linha do cabelo.
        // Sem ela a franja fecha um **anel contínuo** de têmpora a
        // têmpora e a cabeça inteira vira um casco com pala; com
        // ela a frente se parte em duas mechas, que é como cabelo
        // cai. Custa zero triângulo: empurra vértice que já existe.
        for (let passo = 0; passo < 5; passo += 1) {
          const y = cy + R * (1.32 - passo * 0.3);
          const r = perfil(y) * 0.98;
          b.feature([0, y, r + zcOf(y)], [R * 0.1, R * 0.26, R * 0.12], -R * 0.2, [0, 0.2, 1]);
        }

        for (let anel = 0; anel < 3; anel += 1) {
          // Na coroa — `cy + 0,5 R` a `cy + 1,1 R`, ou seja 0,80 a
          // 0,90, que é a calota inteira. Enquanto estavam em
          // `cy + 0,26 R` empurravam a massa na altura da **orelha**,
          // e o alto da cabeça, que era o defeito, continuava liso.
          const y = cy + R * (0.5 + anel * 0.3);
          const n = anel === 2 ? 5 : 7;
          for (let i = 0; i < n; i += 1) {
            const az = (i / n) * TAU + anel * 0.7;
            const r = perfil(y) * (Math.cos(az) < 0 ? 1.06 : 0.98);
            const px = Math.sin(az) * r;
            const pz = zcOf(y) + Math.cos(az) * r;
            if (!longeDaCabeca(px, y, pz)) continue;
            // A amplitude é aritmética, não gosto: `feature()` pesa o
            // empurrão por `exp(-d²·1,4)`, e no marco da Maze um
            // relevo de onze milímetros simplesmente não apareceu.
            b.feature([px, y, pz], [R * 0.33, R * 0.25, R * 0.33], R * (0.1 + 0.05 * ruido(anel * 11 + i)), [Math.sin(az), 0.3, Math.cos(az)]);
          }
        }

        // --- o fio de água na queda ---
        //
        // Sulcos verticais rasos e irregulares, que custam **zero**
        // triângulo: empurram vértices que já existem. Verticais, e
        // não em anel, porque anel em volta da cabeça lê como colmeia
        // — foi a sétima rodada da Júpiter.
        for (let col = 0; col < 9; col += 1) {
          const az = (col / 9) * TAU + 0.4;
          // Seis sulcos, não quatro, e começando em `cy + 0,08` em
          // vez de `cy − 0,1`: os dois primeiros caem na altura do
          // **rosto**, que é onde o close mostrou placa lisa. A
          // frente fica de fora (`cos(az) > 0,35`) — ali o raio da
          // peça é o da testa, e empurrar para fora é furar a pele
          // da bochecha com uma mecha.
          if (Math.cos(az) > 0.35) continue;
          for (let passo = 0; passo < 6; passo += 1) {
            const y = cy + 0.08 - passo * 0.17 - ruido(col * 5 + passo) * 0.05;
            if (y < bottomY + 0.06) continue;
            const raio = Math.cos(az) < 0 ? perfil(y) * 1.05 : frente(y);
            const px = Math.sin(az) * perfil(y);
            const pz = zcOf(y) + Math.cos(az) * raio;
            // Fundos de propósito: a primeira rodada usou `R · 0,07`
            // — doze milímetros — e de perfil a queda continuou um
            // bloco retangular. O empurrão de `feature()` é pesado
            // por `exp(-d²·1,4)`, e amplitude pedida não é amplitude
            // entregue.
            b.feature([px, y, pz], [R * 0.3, R * 0.52, R * 0.3], R * (0.16 + 0.1 * ruido(col * 3 + passo)), [Math.sin(az), 0, Math.cos(az)]);
          }
        }
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

    /* ------------------------------------------------------------------ */
    /* Os seis cortes masculinos                                           */
    /* ------------------------------------------------------------------ */

    case 'social': {
      // A varredura do pente: o volume sobe de um lado e desce no
      // outro. Três calotas achatadas em diagonal dão isso sem custar
      // um loft inteiro — e são achatadas em `y` de propósito, porque
      // esfera inteira em cima da cabeça lê como touca.
      for (const [sx, sy, w] of [
        [-R * 0.3, 0.152, 0.92],
        [0, 0.168, 0.84],
        [R * 0.34, 0.152, 0.7],
      ] as const) {
        b.ball([sx, cy + sy, -R * 0.06], [R * 0.6 * w, R * 0.29, R * 0.74], { color: hair, skin: { bone: Bone.Head } }, bolaG);
      }
      // A risca. Sem ela o volume acima vira "curto com cabeça
      // grande": é o sulco que diz que alguém penteou isto.
      b.ball([-R * 0.4, cy + 0.166, -R * 0.04], [R * 0.034, R * 0.1, R * 0.6], { color: shade(hair, -0.5), skin: { bone: Bone.Head } }, bolaP);
      // Costeletas, à frente da orelha: fecham a lateral e dão o
      // contorno baixo que o corte social tem.
      for (const side of [1, -1] as const) {
        b.ball([side * R * 0.9, cy + 0.005, R * 0.12], [R * 0.11, R * 0.16, R * 0.19], { color: hair, skin: { bone: Bone.Head } }, bolaM);
      }
      break;
    }
    case 'topete': {
      // Sobe na frente e tomba para trás. A inclinação é tudo: cada
      // mecha nasce mais atrás e mais baixa que a anterior, e é isso
      // que separa um topete de um bloco plantado sobre a testa.
      for (const [sx, sy, sz, s] of [
        [0, 0.212, 0.46, 1.0],
        [-R * 0.3, 0.2, 0.4, 0.84],
        [R * 0.3, 0.2, 0.4, 0.84],
        [-R * 0.56, 0.18, 0.26, 0.62],
        [R * 0.56, 0.18, 0.26, 0.62],
      ] as const) {
        b.ball([sx, cy + sy, R * sz], [R * 0.33 * s, R * 0.44 * s, R * 0.3 * s], { color: hair, skin: { bone: Bone.Head } }, bolaG);
      }
      // Laterais rentes: o topete só existe por contraste com elas.
      for (const side of [1, -1] as const) {
        b.ball([side * R * 0.87, cy + 0.04, -R * 0.06], [R * 0.16, R * 0.28, R * 0.56], { color: shade(hair, -0.3), skin: { bone: Bone.Head } }, bolaM);
      }
      break;
    }
    case 'raspado': {
      // Corte de máquina. A calota compartilhada já é a casca rente;
      // o que faz isto ler como cabelo raspado e não como touca são
      // as duas marcas que a máquina deixa: o degradê nas laterais e
      // a linha reta da nuca.
      for (const side of [1, -1] as const) {
        b.ball([side * R * 0.87, cy + 0.035, -R * 0.02], [R * 0.19, R * 0.29, R * 0.5], { color: shade(hair, -0.42), skin: { bone: Bone.Head } }, bolaM);
        b.ball([side * R * 0.85, cy - 0.012, R * 0.14], [R * 0.09, R * 0.13, R * 0.13], { color: shade(hair, -0.26), skin: { bone: Bone.Head } }, bolaP);
      }
      b.ball([0, cy - 0.008, -R * 0.82], [R * 0.48, R * 0.11, R * 0.15], { color: shade(hair, -0.36), skin: { bone: Bone.Head } }, bolaM);
      break;
    }
    case 'samurai': {
      // Nó alto e apertado, preso bem atrás. O que o separa do
      // `coque` são o tamanho e a altura: aquele é largo e baixo na
      // nuca, este é pequeno e no alto.
      b.ball([0, cy + 0.198, -R * 0.6], [R * 0.29, R * 0.29, R * 0.29], { color: hair, skin: { bone: Bone.Head } }, bolaG);
      b.ball([0, cy + 0.206, -R * 0.84], [R * 0.11, R * 0.11, R * 0.13], { color: dark, skin: { bone: Bone.Head } }, bolaP);
      // A ponta que escapa do nó e cai. Sem ela o coque lê como bola
      // colada atrás da cabeça.
      b.ball([0, cy + 0.13, -R * 0.94], [R * 0.09, R * 0.19, R * 0.2], { color: dark, skin: { bone: Bone.Head } }, bolaP);
      // Laterais puxadas para trás, rentes.
      for (const side of [1, -1] as const) {
        b.ball([side * R * 0.84, cy + 0.065, -R * 0.18], [R * 0.15, R * 0.29, R * 0.58], { color: hair, skin: { bone: Bone.Head } }, bolaM);
      }
      break;
    }
    case 'crespo': {
      // Cacho pequeno e apertado, em casca densa. O `cacheado` tem
      // doze bolas grandes e soltas; este tem quase o triplo de
      // volumes, menores, em duas fileiras — é a diferença entre
      // cacho solto e crespo.
      // A contagem **tem** de descer com o nível de detalhe. Fixa, ela
      // custava mil e quinhentos vértices em `baixa` — mais do que o
      // corpo inteiro naquele nível — e estourava o orçamento do
      // aparelho mais fraco, que é justamente quem não pode pagar.
      const n = detail.segments >= 40 ? 13 : detail.segments >= 20 ? 10 : detail.segments >= 14 ? 8 : 6;
      const rings = bolaP;
      for (let i = 0; i < n; i += 1) {
        const angle = (i / n) * TAU;
        for (const [yy, rr, ss] of [
          [0.152, 0.6, 0.29],
          [0.056, 0.94, 0.33],
        ] as const) {
          const z = Math.cos(angle) * R * rr - R * 0.1;
          // A fileira de baixo não fecha na frente: ali está a testa.
          if (yy < 0.1 && z > R * 0.56) continue;
          b.ball([Math.sin(angle) * R * rr, cy + yy, z], [R * ss, R * ss, R * ss], { color: i % 3 === 0 ? dark : hair, skin: { bone: Bone.Head } }, rings);
        }
      }
      break;
    }
    case 'franjado': {
      // Franja reta na testa e laterais até o maxilar. A franja é uma
      // placa larga e baixa: sem ela, o corte é `curto` com duas
      // cortinas penduradas.
      b.ball([0, cy + 0.086, R * 0.74], [R * 0.76, R * 0.13, R * 0.33], { color: hair, skin: { bone: Bone.Head } }, bolaG);
      for (const side of [1, -1] as const) {
        const curtain: Ctl[] = [
          { y: cy - 0.088, rx: R * 0.19, rz: R * 0.25, x: side * R * 0.74, z: R * 0.08, color: dark, bone: Bone.Head },
          { y: cy - 0.02, rx: R * 0.25, rz: R * 0.33, x: side * R * 0.83, z: R * 0.05, color: hair, bone: Bone.Head },
          { y: cy + 0.055, rx: R * 0.29, rz: R * 0.43, x: side * R * 0.87, z: 0, color: hair, bone: Bone.Head },
        ];
        b.loft(subdivideProfile(toStations(curtain), detail.steps), {
          segments: Math.max(8, Math.round(segments * 0.55)),
          capBottom: R * 0.1,
          capRings: 2,
        });
      }
      break;
    }

    /* ------------------------------------------------------------------ */
    /* Os três cortes femininos genéricos                                  */
    /* ------------------------------------------------------------------ */

    case 'chanel': {
      // O corte reto na altura do maxilar. A barra é a peça inteira:
      // a queda mantém largura quase constante e termina numa linha,
      // em vez de afinar como o `longo`.
      const bob: Ctl[] = [
        { y: cy - 0.135, rx: R * 1.0, rz: R * 0.25, rzBack: R * 0.78, z: -R * 0.16, color: dark, bone: Bone.Head },
        { y: cy - 0.07, rx: R * 1.07, rz: R * 0.33, rzBack: R * 0.9, z: -R * 0.12, color: hair, bone: Bone.Head },
        { y: cy, rx: R * 1.09, rz: R * 0.45, rzBack: R * 1.0, z: -R * 0.08, color: hair, bone: Bone.Head },
        { y: cy + 0.055, rx: R * 1.05, rz: R * 0.59, rzBack: R * 1.04, z: -R * 0.04, color: hair, bone: Bone.Head },
      ];
      b.loft(subdivideProfile(toStations(bob), detail.steps), { segments, capBottom: R * 0.2, capRings: 2 });
      break;
    }
    case 'tranca': {
      // A trança desce pelas costas em nós alternados. É a
      // alternância que lê como trançado — uma queda lisa no mesmo
      // lugar seria um rabo de cavalo mal centrado.
      //
      // A auditoria da Fase 1.1 mediu o que a imagem já mostrava: os
      // nós **nunca se tocaram**. Com `headR` em 0,176, o passo entre
      // centros era 0,0607 e a soma dos raios vizinhos 0,0491 — um
      // vão de 24 % em `ultra`, `alta` e `media`, e de 80 % em
      // `baixa`, onde a peça cai para cinco nós e o passo cresce sem
      // que o raio cresça junto. O resultado era um colar de contas
      // penduradas, e não uma trança.
      //
      // São duas coisas que faltavam, e a correção não é a mesma que
      // as `trancinhas` receberam: lá o fio é fino e liso, e um loft
      // sozinho resolve; aqui o traço da peça **é** o nó alternado, e
      // trocá-lo por um loft liso apagaria a identidade dela.
      //
      //  · um miolo contínuo — a corda que atravessa os nós de ponta
      //    a ponta, e que sozinha já garante que nunca haja buraco;
      //  · o raio vertical do nó derivado do **passo**, e não de um
      //    número fixo, para a sobreposição valer em qualquer
      //    contagem de nós — que é o que muda entre os níveis.
      const nos = detail.segments >= 14 ? 7 : 5;
      const topo = cy + 0.055;
      const queda = 0.33;
      const passo = queda / (nos - 1);

      // O miolo nasce **dentro** da calota: a trança tem de sair do
      // cabelo, e antes ela começava solta a um raio de distância.
      // Três estações, não quatro: o perfil já é subdividido por
      // `detail.steps`, e a estação a mais só acrescentava anéis
      // dentro de um volume que ninguém vê.
      const miolo: Ctl[] = [
        { y: topo - queda - 0.012, rx: R * 0.055, rz: R * 0.055, z: -R * 1.25, color: dark, bone: Bone.Head },
        { y: topo - queda * 0.5, rx: R * 0.105, rz: R * 0.105, z: -R * 1.13, color: hair, bone: Bone.Head },
        { y: topo + 0.025, rx: R * 0.14, rz: R * 0.14, z: -R * 0.94, color: hair, bone: Bone.Head },
      ];
      // O miolo é barato de propósito: fora a ponta, ele passa a vida
      // inteira coberto pelos nós, e gastar nele a densidade do resto
      // do penteado punha a trança acima do `cacheado`, que é o teto
      // de vértices do acervo. Com 0,22 do anel e uma só carreira de
      // tampa a peça volta para debaixo do teto (35 160 contra 35 176
      // em `ultra`) sem que a imagem mude: medido em quatro vistas.
      b.loft(subdivideProfile(toStations(miolo), detail.steps), {
        segments: Math.max(6, Math.round(segments * 0.22)),
        capTop: R * 0.1,
        capBottom: R * 0.05,
        capRings: 1,
      });

      for (let i = 0; i < nos; i += 1) {
        const t = i / (nos - 1);
        const s = 1 - t * 0.45;
        // 0,62 do passo é o que põe o nó seguinte dentro do anterior
        // com folga, sem engordar a trança: a largura continua sendo
        // a de origem.
        const ry = Math.max(R * 0.145 * s, passo * 0.62);
        b.ball(
          [(i % 2 === 0 ? 1 : -1) * R * 0.07 * s, topo - t * queda, -R * (1.0 + t * 0.24)],
          [R * 0.2 * s, ry, R * 0.19 * s],
          { color: i % 2 === 0 ? hair : shade(hair, -0.13), skin: { bone: Bone.Head } },
          bolaM,
        );
      }
      b.ball([0, cy - 0.295, -R * 1.26], [R * 0.085, R * 0.065, R * 0.085], { color: dark, skin: { bone: Bone.Head } }, bolaP);
      break;
    }
    case 'chiquinhas': {
      // Dois rabos presos acima da orelha. Ficam altos de propósito:
      // presos baixo, encostam no ombro e somem na silhueta de longe.
      for (const side of [1, -1] as const) {
        b.ball([side * R * 0.92, cy + 0.1, -R * 0.08], [R * 0.15, R * 0.15, R * 0.15], { color: dark, skin: { bone: Bone.Head } }, bolaP);
        const tail: Ctl[] = [
          { y: cy - 0.145, rx: R * 0.15, rz: R * 0.15, x: side * R * 1.2, z: -R * 0.28, color: dark, bone: Bone.Head },
          { y: cy - 0.04, rx: R * 0.26, rz: R * 0.26, x: side * R * 1.16, z: -R * 0.22, color: hair, bone: Bone.Head },
          { y: cy + 0.06, rx: R * 0.29, rz: R * 0.29, x: side * R * 1.05, z: -R * 0.14, color: hair, bone: Bone.Head },
        ];
        b.loft(subdivideProfile(toStations(tail), detail.steps), {
          segments: Math.max(8, Math.round(segments * 0.6)),
          capTop: R * 0.1,
          capBottom: R * 0.14,
          capRings: 2,
        });
      }
      break;
    }
    // -----------------------------------------------------------------
    // Fase 1.1 — os nove cortes de reposição.
    //
    // Cada um existe por uma silhueta que o catálogo não tinha, nunca
    // por uma cor: é a leitura de longe que distingue um penteado, e
    // duas quedas iguais em tons diferentes são o mesmo penteado.
    // -----------------------------------------------------------------
    case 'pixie': {
      // Curtíssimo, com a mecha lateral mais longa que o resto. A
      // assimetria é a peça inteira — simétrico, isto vira a calota
      // pelada que o `curto` já é.
      b.feature([R * 0.72, cy + 0.072, R * 0.52], [R * 0.46, R * 0.2, R * 0.42], R * 0.07, [0.4, -0.2, 0.7]);
      b.feature([-R * 0.86, cy + 0.015, R * 0.2], [R * 0.3, R * 0.26, R * 0.34], R * 0.05, [-1, -0.2, 0.2]);
      // A nuca é relevo na própria casca, não uma bola solta atrás. A
      // primeira versão punha um elipsoide achatado a 0,96 R do centro:
      // colado demais, ele recebia oclusão por todos os lados e lia
      // como uma mancha preta chapada na vista de costas.
      b.feature([0, cy - 0.055, -R * 0.88], [R * 0.56, R * 0.3, R * 0.42], R * 0.055, [0, -0.35, -1]);
      break;
    }
    case 'rabolateral': {
      // O rabo preso baixo, caindo **sobre o ombro** e não pelas
      // costas: é o único do acervo que aparece pela frente, e é essa
      // a diferença dele para o `rabo`.
      b.ball([R * 0.78, cy - 0.085, -R * 0.52], [R * 0.19, R * 0.17, R * 0.19], { color: dark, skin: { bone: Bone.Head } }, bolaP);
      const queda: Ctl[] = [
        { y: cy - 0.36, rx: R * 0.1, rz: R * 0.1, x: R * 0.96, z: R * 0.12, color: dark, bone: Bone.Head },
        { y: cy - 0.25, rx: R * 0.21, rz: R * 0.21, x: R * 0.98, z: R * 0.02, color: hair, bone: Bone.Head },
        { y: cy - 0.14, rx: R * 0.27, rz: R * 0.26, x: R * 0.92, z: -R * 0.16, color: hair, bone: Bone.Head },
        { y: cy - 0.055, rx: R * 0.26, rz: R * 0.25, x: R * 0.84, z: -R * 0.4, color: hair, bone: Bone.Head },
      ];
      b.loft(subdivideProfile(toStations(queda), detail.steps), {
        segments: Math.max(8, Math.round(segments * 0.65)),
        capTop: R * 0.12,
        capBottom: R * 0.09,
        capRings: 2,
      });
      break;
    }
    case 'coques': {
      // Dois coques no alto. O `samurai` tem um atrás e o `coque` um
      // na nuca; dois em cima, afastados, é a terceira leitura.
      for (const side of [1, -1] as const) {
        b.ball([side * R * 0.5, cy + 0.235, -R * 0.1], [R * 0.3, R * 0.28, R * 0.3], { color: hair, skin: { bone: Bone.Head } }, bolaG);
        b.ball([side * R * 0.46, cy + 0.165, -R * 0.08], [R * 0.17, R * 0.1, R * 0.17], { color: dark, skin: { bone: Bone.Head } }, bolaP);
      }
      break;
    }
    case 'ondas': {
      // Queda longa em ondas de raio alternado. O `ondulado` é da Luma
      // e saiu do catálogo comum com ela; esta é a onda da praça, mais
      // larga e sem o degradê de ponta.
      const onda: Ctl[] = [
        { y: cy - 0.55, rx: R * 0.62, rz: R * 0.3, rzBack: R * 0.78, z: -R * 0.3, color: dark, bone: Bone.Head },
        { y: cy - 0.43, rx: R * 0.88, rz: R * 0.36, rzBack: R * 1.04, z: -R * 0.26, color: hair, bone: Bone.Head },
        { y: cy - 0.31, rx: R * 0.76, rz: R * 0.34, rzBack: R * 0.94, z: -R * 0.24, color: hair, bone: Bone.Head },
        { y: cy - 0.18, rx: R * 1.02, rz: R * 0.42, rzBack: R * 1.14, z: -R * 0.18, color: hair, bone: Bone.Head },
        { y: cy - 0.06, rx: R * 0.94, rz: R * 0.46, rzBack: R * 1.06, z: -R * 0.12, color: hair, bone: Bone.Head },
        { y: cy + 0.05, rx: R * 1.06, rz: R * 0.6, rzBack: R * 1.08, z: -R * 0.05, color: hair, bone: Bone.Head },
      ];
      b.loft(subdivideProfile(toStations(onda), detail.steps), { segments, capBottom: R * 0.26, capRings: 2 });
      break;
    }
    case 'meiopreso': {
      // Metade presa atrás, metade solta. Lê-se pelo nó no meio da
      // nuca com queda larga embaixo — nenhum outro tem as duas coisas.
      b.ball([0, cy - 0.035, -R * 1.0], [R * 0.24, R * 0.2, R * 0.2], { color: dark, skin: { bone: Bone.Head } }, bolaM);
      const solto: Ctl[] = [
        // A ponta afina: terminada reta, a queda lia como uma placa
        // retangular pendurada na nuca.
        { y: cy - 0.5, rx: R * 0.36, rz: R * 0.2, rzBack: R * 0.62, z: -R * 0.32, color: dark, bone: Bone.Head },
        { y: cy - 0.42, rx: R * 0.66, rz: R * 0.26, rzBack: R * 0.8, z: -R * 0.3, color: dark, bone: Bone.Head },
        { y: cy - 0.26, rx: R * 0.92, rz: R * 0.3, rzBack: R * 1.0, z: -R * 0.26, color: hair, bone: Bone.Head },
        { y: cy - 0.1, rx: R * 1.0, rz: R * 0.4, rzBack: R * 1.06, z: -R * 0.16, color: hair, bone: Bone.Head },
        { y: cy + 0.04, rx: R * 1.04, rz: R * 0.58, rzBack: R * 1.06, z: -R * 0.06, color: hair, bone: Bone.Head },
      ];
      b.loft(subdivideProfile(toStations(solto), detail.steps), { segments, capBottom: R * 0.22, capRings: 2 });
      break;
    }
    case 'franjao': {
      // Franja reta e pesada até a sobrancelha, com o corte na altura
      // do ombro. A franja da calota comum para no terço de cima; esta
      // desce, e é por isso que ela é o penteado e não um detalhe.
      b.feature([0, cy + 0.088, R * 0.92], [R * 0.98, R * 0.17, R * 0.56], R * 0.1, [0, -0.5, 1]);
      const corte: Ctl[] = [
        { y: cy - 0.235, rx: R * 1.0, rz: R * 0.3, rzBack: R * 0.92, z: -R * 0.16, color: dark, bone: Bone.Head },
        { y: cy - 0.12, rx: R * 1.08, rz: R * 0.38, rzBack: R * 1.0, z: -R * 0.12, color: hair, bone: Bone.Head },
        { y: cy - 0.01, rx: R * 1.1, rz: R * 0.5, rzBack: R * 1.04, z: -R * 0.07, color: hair, bone: Bone.Head },
        { y: cy + 0.06, rx: R * 1.05, rz: R * 0.62, rzBack: R * 1.04, z: -R * 0.03, color: hair, bone: Bone.Head },
      ];
      b.loft(subdivideProfile(toStations(corte), detail.steps), { segments, capBottom: R * 0.24, capRings: 2 });
      break;
    }
    case 'repicado': {
      // Camadas desiguais: pontas em alturas diferentes em volta da
      // cabeça. O `espetado` sobe; este cai em degraus.
      // Relevos maiores e mais fundos que os da primeira versão, que
      // mal se distinguia do `curto`: o degrau precisa aparecer na
      // silhueta, não só no relevo.
      const pontas = detail.segments >= 14 ? 7 : 5;
      for (let i = 0; i < pontas; i += 1) {
        const ang = Math.PI * (0.12 + (i / (pontas - 1)) * 0.76);
        const alt = i % 2 === 0 ? 0.06 : 0.15;
        b.ball(
          [Math.cos(ang) * R * 0.86, cy + 0.02 - alt, -Math.sin(ang) * R * 0.86],
          [R * 0.26, R * 0.2 + (i % 2 === 0 ? R * 0.08 : 0), R * 0.26],
          { color: i % 2 === 0 ? hair : dark, skin: { bone: Bone.Head } },
          bolaM,
        );
      }
      b.feature([0, cy - 0.06, -R * 0.95], [R * 0.72, R * 0.3, R * 0.44], R * 0.07, [0, -0.45, -1]);
      break;
    }
    case 'trancinhas': {
      // Tranças finas rentes ao crânio, em leque. É o único penteado
      // do acervo com relevo **sobre** a calota em vez de volume em
      // volta dela.
      //
      // Terceira forma, e as duas anteriores estão registradas aqui
      // porque o erro se repete fácil: contas soltas em arco esférico
      // afundam no crânio no meio do caminho, e contas soltas atrás
      // da nuca ficam **boiando no ar** entre a cabeça e o ombro. Fio
      // trançado é fio: um corpo contínuo do alto à ponta. Cada um é
      // um loft de quatro estações que nasce no alto da testa e
      // termina na nuca, encostado na casca o tempo todo, com as
      // cores alternando de estação em estação — é a alternância que
      // lê como trançado.
      const fios = detail.segments >= 20 ? 5 : detail.segments >= 14 ? 4 : 3;
      for (let i = 0; i < fios; i += 1) {
        const lado = -0.6 + (i / (fios - 1)) * 1.2;
        const lx = Math.sin(lado);
        // O sulco rente, do alto da testa ao cocuruto: o fio precisa
        // começar em algum lugar, e na frente não há espaço para
        // volume sem cobrir a testa.
        b.feature([lx * R * 0.62, cy + 0.15, R * 0.42], [R * 0.16, R * 0.14, R * 0.3], R * 0.03, [lx * 0.6, 0.8, 0.5]);
        const fio: Ctl[] = [
          { y: cy - 0.125, rx: R * 0.055, rz: R * 0.055, x: lx * R * 0.72, z: -R * 1.0, color: dark, bone: Bone.Head },
          { y: cy - 0.02, rx: R * 0.085, rz: R * 0.085, x: lx * R * 0.76, z: -R * 1.04, color: hair, bone: Bone.Head },
          { y: cy + 0.075, rx: R * 0.09, rz: R * 0.09, x: lx * R * 0.72, z: -R * 0.94, color: dark, bone: Bone.Head },
          { y: cy + 0.15, rx: R * 0.085, rz: R * 0.085, x: lx * R * 0.5, z: -R * 0.42, color: hair, bone: Bone.Head },
        ];
        b.loft(subdivideProfile(toStations(fio), detail.steps), {
          segments: Math.max(6, Math.round(segments * 0.4)),
          capTop: R * 0.06,
          capBottom: R * 0.05,
          capRings: 2,
        });
      }
      break;
    }
    case 'moicano': {
      // A crista central, com as laterais raspadas. Sobe mais que o
      // `espetado` e some dos lados, que é o contrário do que todos os
      // outros fazem.
      // A crista acompanha a curva do crânio em vez de pairar sobre
      // ele: a primeira versão punha o cume em cy + 0,27 com a calota
      // terminando em cy + 0,176, e o resultado lia como um tufo solto
      // e não como moicano. Agora cada bola nasce **dentro** da casca e
      // sai por cima, com sobreposição garantida entre vizinhas.
      const altos = detail.segments >= 14 ? 8 : 5;
      for (let i = 0; i < altos; i += 1) {
        const t = i / (altos - 1);
        // Arco de testa a nuca; o cume fica sobre o meio da cabeça.
        const z = R * (0.66 - t * 1.58);
        const curva = Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.92));
        // A base entra na calota e o topo sobe bem acima dela: é a
        // altura que faz um moicano, e a versão anterior, rente, só
        // engrossava o cocuruto.
        const y = cy + 0.115 + curva * 0.115;
        b.ball(
          [0, y, z],
          [R * 0.12, R * 0.16 + curva * R * 0.2, R * 0.17],
          { color: i % 2 === 0 ? hair : shade(hair, 0.12), skin: { bone: Bone.Head } },
          bolaM,
        );
      }
      for (const side of [1, -1] as const) {
        b.feature([side * R * 0.9, cy + 0.02, -R * 0.1], [R * 0.3, R * 0.34, R * 0.5], R * 0.018, [side, 0, 0]);
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
/**
 * Os fones de frequência da Lilly.
 *
 * Os fones são a assinatura dela desde sempre — e é justamente por
 * isso que **não** foi o acessório `fones` que mudou. Aquele está em
 * `CITIZEN_ACCESSORIES`: remasterizá-lo poria vidro aceso na cabeça
 * de todo habitante que passa de fone na praça. O que é de uma deusa
 * não pode estar no sorteio.
 *
 * Então existe este par, que é dela: arco de vidro, conchas com uma
 * fresta acesa, presos ao osso da cabeça dentro da malha única. Vêm
 * com o penteado, como o diadema da Suki-Chan vem com a Cascata e os
 * anéis da Nexara vêm com o Fluxo.
 */
/**
 * Os óculos da Akemi-Chan — e por que eles não são o acessório comum.
 *
 * `oculos` está em `CITIZEN_ACCESSORIES`: é armação que habitante
 * herda. Remasterizá-la onde ela mora mudaria o rosto de todo
 * habitante sorteado com óculos.
 *
 * E há um segundo motivo, que decide sozinho: `appearance.accessory`
 * é **um campo só**. Ela usa óculos *e* flores no cabelo. Nem que os
 * dois fossem exclusivos caberiam os dois ali. Nascendo no penteado,
 * cabem.
 *
 * A armação é redonda e lilás, como a arte mostra, e a lente é
 * **vazada** — o aro sem disco opaco dentro. O acessório comum põe
 * uma bola dentro do aro e lê como óculos de natação; o `lentes` do
 * Haru já tinha descoberto isso, e aqui a lição se aproveita.
 */
function buildAkemiGlasses(b: SurfaceBuilder, detail: BodyDetail, cy: number, R: number): void {
  const head: SkinBinding = { bone: Bone.Head };
  const segs = Math.max(8, Math.round(detail.segments * 0.6));
  const armacao = 0xc9a7ff;

  for (const side of [-1, 1]) {
    // O aro. Tubo fino: vidro grosso vira aro de natação, reprovado
    // no marco da Suki.
    const ring = new THREE.TorusGeometry(R * 0.27, R * 0.028, 4, segs);
    b.addGeometry(
      ring,
      { color: armacao, finish: Finish.Glass, skin: head },
      new THREE.Matrix4().makeTranslation(side * R * 0.37, cy + 0.022, R * 0.95),
    );
  }
  // A ponte entre os dois aros.
  b.addGeometry(
    new THREE.BoxGeometry(R * 0.22, R * 0.035, R * 0.035),
    { color: armacao, finish: Finish.Glass, skin: head },
    new THREE.Matrix4().makeTranslation(0, cy + 0.03, R * 0.95),
  );
  if (detail.segments < 14) return;
  // As hastes, que só aparecem de perfil — e é de perfil que um
  // óculos sem haste denuncia que está flutuando no rosto.
  for (const side of [-1, 1]) {
    b.addGeometry(
      new THREE.BoxGeometry(R * 0.5, R * 0.03, R * 0.03),
      { color: armacao, finish: Finish.Glass, skin: head },
      new THREE.Matrix4().makeRotationY(side * 0.38).setPosition(side * R * 0.62, cy + 0.03, R * 0.68),
    );
  }
}

/**
 * A galhada da Saturno — a assinatura dela, e a razão de existir.
 *
 * Ela é a **Defensora dos Animais**. A Maze é a Deusa da Natureza e
 * ainda não foi remasterizada: se a Saturno virar uma figura de
 * folhagem, as duas leem igual e a Maze perde o território antes de
 * ter vez. Galhada resolve isso numa peça só — é inequivocamente
 * animal, vem do cervo, e nenhuma outra figura do Panteão tem nada
 * parecido.
 *
 * Nasce **dentro do penteado**, não como acessório, e por dois
 * motivos. `flor`, `chapeu` e `oculos` são acessórios que os
 * habitantes herdam — mexer neles mexe em gente sorteada pelo mundo
 * todo, e a `flor` ainda é da Maze. E `appearance.accessory` é um
 * campo só: pelo caminho do acessório ela não poderia ter galhada e
 * mais nada.
 *
 * Em vidro dourado: é a leitura Frutiger Aero pedida para o marco —
 * chifre que é ao mesmo tempo osso e luz.
 */
function buildAntlers(b: SurfaceBuilder, detail: BodyDetail, cy: number, R: number): void {
  // A galhada é detalhe de perto. No LOD de longe ela não existe, e
  // isso não é preguiça: a Saturno **já chegava estourada** no teto
  // do nível baixo — 7 630 triângulos contra 7 145,6 — por causa de
  // duas peças compartilhadas que nunca cortaram por LOD.
  if (detail.segments < 14) return;

  const material = { color: 0xffd98a, finish: Finish.Glass, skin: { bone: Bone.Head } };
  const cheia = detail.segments >= 20;

  /**
   * Um ramo **entre dois pontos**.
   *
   * A primeira versão posicionava cada galho por ângulo e
   * comprimento, e na bancada a galhada saiu **solta no ar, acima da
   * cabeça**: a base caía em `x = 0,134` numa altura onde o crânio
   * mede `0,105` de raio. Ligar ponta a ponta tira o arbítrio da
   * conta — se o primeiro ponto está dentro do couro cabeludo, o
   * ramo nasce dentro do couro cabeludo.
   */
  const ramo = (a: THREE.Vector3, c: THREE.Vector3, grossura: number): void => {
    const eixo = new THREE.Vector3().subVectors(c, a);
    const comprimento = eixo.length();
    const giro = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      eixo.clone().normalize(),
    );
    b.addGeometry(
      new THREE.BoxGeometry(grossura, comprimento, grossura),
      material,
      new THREE.Matrix4().compose(
        new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5),
        giro,
        new THREE.Vector3(1, 1, 1),
      ),
    );
  };

  for (const side of [1, -1]) {
    const v = (x: number, y: number, z: number): THREE.Vector3 =>
      new THREE.Vector3(side * R * x, cy + y, R * z);

    // A haste, em três trechos que vão endireitando conforme sobem.
    // É a curva que faz galhada: a versão reta anterior saiu de
    // perfil como dois gravetos de capim espetados no crânio.
    const base = v(0.46, 0.07, -0.07);
    const p1 = v(0.78, 0.2, -0.13);
    const p2 = v(0.93, 0.35, -0.17);
    const p3 = v(1.0, 0.47, -0.19);
    // Grossa na base e afinando: galhada é osso, não arame. A
    // primeira versão tinha 19 mm na base e sumia de perfil.
    ramo(base, p1, 0.032);
    ramo(p1, p2, 0.024);
    ramo(p2, p3, 0.017);

    // As pontas, que são o que distingue galhada de chifre.
    ramo(p1.clone().lerp(p2, 0.2), v(1.46, 0.27, 0.1), 0.019);
    if (cheia) {
      ramo(p2, v(1.52, 0.46, -0.12), 0.015);
      ramo(p2.clone().lerp(p3, 0.4), v(0.62, 0.5, -0.78), 0.013);
    }
  }
}

/**
 * O equipamento da Haru: abafadores e o visor do EdenOS.
 *
 * ## Os abafadores
 *
 * A Haru é a **primeira deusa autista do Panteão**, e este é o
 * elemento que representa isso no corpo. Ele entra como
 * **equipamento de trabalho**, não como marcador médico: regulação
 * sensorial é prática cotidiana e real, e numa Deusa da Tecnologia a
 * concha sobre a orelha lê como ferramenta de quem opera
 * infraestrutura. Ela os usa porque funcionam — do mesmo jeito que a
 * Saturno tem os braços nus porque trabalha com as mãos.
 *
 * Nada aqui infantiliza nem estampa diagnóstico. O símbolo da
 * identidade dela é o **infinito** no peito, que é o endossado pela
 * comunidade autista, e está em `buildSystemSuit`. A peça de
 * quebra-cabeça não é usada e não deve ser.
 *
 * ## Por que nascem no penteado
 *
 * `fones`, `oculos` e `chapeu` são acessórios que os **habitantes
 * herdam**: remasterizar qualquer um deles mexeria em gente sorteada
 * pelo mundo inteiro. E `appearance.accessory` é um campo só — pelo
 * caminho do acessório ela não poderia ter abafadores **e** visor.
 *
 * O acessório `oculos` que ela usava custava **524 triângulos** no
 * LOD baixo e era construído inteiro mesmo a três metros, onde uma
 * armação não chega a um pixel. Sozinho comia toda a folga de
 * orçamento dela. Tudo aqui corta por distância.
 */
function buildHaruGear(b: SurfaceBuilder, detail: BodyDetail, cy: number): void {
  // Detalhe de perto. A três metros nada disto chega a um pixel, e é
  // esse corte que paga o marco — o acessório antigo não cortava.
  if (detail.segments < 14) return;

  const head: SkinBinding = { bone: Bone.Head };
  const casco = 0x2b3a52;
  const prata = 0xc9d8e8;
  const ciano = 0x45e7ff;
  const segs = Math.max(8, Math.round(detail.segments * 0.5));

  // --- os abafadores ---
  //
  // Medido na malha: a orelha está em `|x| = 0,1804`, `y = 0,682`,
  // `z = −0,0123`. A concha fica um pouco por fora disso, senão
  // nasce dentro do crânio em vez de cobrir a orelha.
  const orelhaY = cy - 0.018;
  for (const side of [-1, 1]) {
    // A concha.
    b.ball([side * 0.197, orelhaY, -0.012], [0.031, 0.056, 0.05], { color: casco, finish: Finish.Cloth, skin: head }, 6);
    // O anel prateado que contorna a concha, para ela não ler como
    // bolha de massa colada na cabeça.
    const anel = new THREE.TorusGeometry(0.046, 0.007, 4, segs);
    b.addGeometry(
      anel,
      { color: prata, finish: Finish.Shine, skin: head },
      new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(side * 0.212, orelhaY, -0.012),
    );
    // A luz de estado: acesa, discreta, do tamanho de um LED.
    b.addGeometry(
      new THREE.BoxGeometry(0.008, 0.016, 0.016),
      { color: ciano, finish: Finish.Holo, skin: head },
      new THREE.Matrix4().makeTranslation(side * 0.219, orelhaY + 0.022, -0.012),
    );
  }

  // O arco que liga as duas conchas por cima da cabeça. Sem ele são
  // dois caroços soltos nas laterais, não um par de abafadores.
  //
  // Meia volta **no plano XY**, que é o plano das duas orelhas: as
  // pontas caem exatamente em `|x| = 0,198`, onde as conchas estão.
  // A primeira versão girava o arco 90° em Y e com isso o punha no
  // plano da nuca e da testa — na bancada ele atravessou o rosto
  // acima dos olhos e leu como uma monocelha escura.
  const arco = new THREE.TorusGeometry(0.198, 0.012, 4, segs * 2, Math.PI);
  b.addGeometry(
    arco,
    { color: casco, finish: Finish.Cloth, skin: head },
    new THREE.Matrix4().makeTranslation(0, orelhaY, -0.012),
  );

  // --- o visor do EdenOS ---
  //
  // Substitui os óculos redondos, a pedido do Criador e seguindo a
  // arte de referência: a peça nasce na têmpora e projeta uma lâmina
  // de interface à frente do olho.
  //
  // Medido na malha: a frente do rosto na linha dos olhos está em
  // `z ≈ 0,173`, e o nariz avança até `0,208`. O visor fica à frente
  // disso, e na altura `cy + 0,12R` — que é onde `FACE.eyeY` põe o
  // olho. A primeira versão o pôs 2 cm acima e a lâmina cobriu a
  // sobrancelha em vez da vista. No marco da Akemi um adereço frontal foi parar atrás da
  // superfície e sumiu — aqui a cota sai da sonda.
  const ladoVisor = 1;
  // O corpo da peça, encostado na têmpora.
  b.addGeometry(
    new THREE.BoxGeometry(0.03, 0.026, 0.044),
    { color: casco, finish: Finish.Shine, skin: head },
    new THREE.Matrix4().makeRotationY(-0.34).setPosition(ladoVisor * 0.146, cy + 0.042, 0.073),
  );
  // A haste que leva da têmpora ao olho.
  b.addGeometry(
    new THREE.BoxGeometry(0.052, 0.009, 0.009),
    { color: prata, finish: Finish.Shine, skin: head },
    new THREE.Matrix4().makeRotationY(-0.38).setPosition(ladoVisor * 0.123, cy + 0.036, 0.142),
  );
  // A lâmina de interface, em vidro aceso, à frente do olho.
  b.addGeometry(
    new THREE.BoxGeometry(0.088, 0.046, 0.005),
    { color: ciano, finish: Finish.Holo, skin: head },
    new THREE.Matrix4().makeRotationY(-0.2).setPosition(ladoVisor * 0.064, cy + 0.029, 0.196),
  );

  if (detail.segments < 20) return;

  // As linhas de leitura dentro da lâmina — o que faz a peça ler
  // como tela, e não como placa de acrílico colorida.
  for (let i = 0; i < 3; i += 1) {
    b.addGeometry(
      new THREE.BoxGeometry(0.05 - i * 0.012, 0.005, 0.004),
      { color: 0xd8fbff, finish: Finish.Holo, skin: head },
      new THREE.Matrix4().makeRotationY(-0.2).setPosition(ladoVisor * (0.055 - i * 0.004), cy + 0.052 - i * 0.012, 0.2),
    );
  }
}

function buildSonicHeadset(b: SurfaceBuilder, detail: BodyDetail, cy: number, R: number): void {
  const head: SkinBinding = { bone: Bone.Head };
  const segs = Math.max(8, Math.round(detail.segments * 0.8));
  const ciano = 0x29c8ff;

  // Por que o fone é escuro.
  //
  // A primeira versão usou gelo (`0xdff3ff`) no arco e nas conchas.
  // Renderizado: duas bolas brancas nas orelhas e uma tira branca no
  // alto, a coisa mais clara da personagem inteira — num traje
  // escuro, o acessório virou o assunto. O Criador pediu **vidro e
  // luz**, e vidro escuro com uma fresta acesa é exatamente isso:
  // o casco recua, e o que brilha é só o anel ciano.
  const casco = 0x1b2030;

  // O arco, por cima da calota. Meia volta basta: a outra metade
  // ficaria enterrada no cabelo, custando triângulos que ninguém vê.
  // Tubo fino — vidro grosso já foi reprovado por ler como aro de
  // natação, no marco da Suki.
  const band = new THREE.TorusGeometry(R * 1.14, R * 0.038, 4, segs, Math.PI);
  b.addGeometry(band, { color: casco, finish: Finish.Glass, skin: head }, new THREE.Matrix4().makeTranslation(0, cy + 0.02, 0));

  for (const side of [-1, 1]) {
    // A concha: achatada contra a orelha, não uma lata pregada na
    // cabeça. A orelha desta cabeça chega a `1,025·R` — medido no
    // marco da Nexara —, então a concha começa fora disso.
    const cup = new THREE.CylinderGeometry(R * 0.3, R * 0.27, R * 0.13, segs);
    b.addGeometry(
      cup,
      { color: casco, finish: Finish.Glass, skin: head },
      new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(side * R * 1.08, cy + 0.012, 0),
    );
    // A fresta acesa na face externa da concha: é o que transforma
    // vidro em equipamento ligado. Um anel fino, só para fora, com
    // raio menor que o da concha — assim sobra borda escura em
    // volta e a luz fica contida, em vez de virar um disco aceso do
    // tamanho da orelha.
    if (detail.segments >= 14) {
      const slit = new THREE.CylinderGeometry(R * 0.17, R * 0.17, R * 0.03, segs);
      b.addGeometry(
        slit,
        { color: ciano, finish: Finish.Holo, skin: head },
        new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(side * R * 1.15, cy + 0.012, 0),
      );
    }
  }
}

function buildOrbitRings(b: SurfaceBuilder, detail: BodyDetail, cy: number, R: number): void {
  const head: SkinBinding = { bone: Bone.Head };
  const segs = Math.max(10, Math.round(detail.segments * 0.85));
  // A altura não é escolha de gosto: o alto da cabeça está a
  // `cy + 0,229` e a primeira versão pôs os anéis em `cy + 0,2`, ou
  // seja, **dentro do crânio**. Com raio maior que a cabeça eles
  // ainda apareciam, mas atravessando a calota, e o que a bancada
  // mostrou foi um bolo de camadas em vez de uma órbita. Agora eles
  // passam por cima, e o raio encolheu junto: um aro bem maior que a
  // cabeça lê como chapéu, não como halo.
  const baseY = cy + 0.245;
  const orbits: readonly { r: number; tube: number; tilt: number; spin: number; y: number; color: number }[] = [
    { r: R * 1.06, tube: R * 0.026, tilt: 0.2, spin: 0.35, y: baseY, color: 0x9fe8ff },
    { r: R * 0.78, tube: R * 0.022, tilt: -0.42, spin: -0.6, y: baseY + R * 0.1, color: 0xc9b6ff },
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
    case 'atelie': {
      // O Ouro do Ateliê — da Júpiter, e só dela.
      //
      // A arte mostra gargantilha, braceletes e brincos. O campo de
      // acessório dela estava **livre** (`nenhum`), ao contrário do
      // da Maze, que estava ocupado pela `flor` — então aqui o ouro
      // pôde morar onde é o lugar dele, em vez de ser enfiado dentro
      // do penteado.
      //
      // Tudo é fio fino. Ouro em massa — galhada, folha, pata — é da
      // Saturno.
      const ouro = 0xf0c95a;
      // A gargantilha é um **anel completo**. Peça só na frente do
      // pescoço não lê como colar: foi a lição do marco da Lilly, e
      // o primeiro esboço da Saturno repetiu o erro ao contrário,
      // pondo tudo nas costas.
      b.addGeometry(
        new THREE.TorusGeometry(m.neckR * 1.12, 0.0075, 5, Math.max(10, segs)),
        { color: ouro, finish: Finish.Shine, skin: { bone: Bone.Torso } },
        new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, m.neckY - 0.028, 0),
      );
      if (detail.segments >= 14) {
        // Os braceletes.
        //
        // A posição sai das **mesmas fórmulas de `buildArm`** —
        // `x = side · shoulderX`, e o punho em
        // `waist + shoulderY − upperArm − forearm`. A primeira versão
        // chutou o lugar a partir de `m.legX`, que é a abertura das
        // **pernas**, e o resultado só apareceu na captura com a
        // deusa andando: um aro dourado solto no meio da saia.
        //
        // O par de ossos também segue `buildArm`: lá, `side > 0` é o
        // braço **esquerdo**. Trocar os dois faz o bracelete cruzar
        // para o outro lado assim que ela gesticula.
        const pulsoY = m.waist + m.shoulderY - m.upperArm - m.forearm;
        for (const side of [-1, 1] as const) {
          b.addGeometry(
            new THREE.TorusGeometry(m.armWrist * 1.22, 0.0065, 5, Math.max(8, Math.round(segs * 0.7))),
            { color: ouro, finish: Finish.Shine, skin: { bone: side > 0 ? Bone.ForeL : Bone.ForeR } },
            new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(side * m.shoulderX, pulsoY + 0.035, 0),
          );
        }
      }
      if (detail.segments >= 20) {
        // Os brincos: curtos, rente à orelha, que a malha põe em
        // `|x| = 0,1804` na altura `y = 0,6820`.
        for (const side of [-1, 1]) {
          b.addGeometry(
            new THREE.BoxGeometry(0.006, 0.03, 0.006),
            { color: ouro, finish: Finish.Shine, skin: head },
            new THREE.Matrix4().makeTranslation(side * R * 0.98, cy - 0.072, R * 0.06),
          );
        }
      }
      break;
    }
    case 'nimbo': {
      // O Nimbo Materno — da Amara, e só dela.
      //
      // Todo o Panteão já tem uma auréola: um toro dourado que
      // `Avatar.ts` cria para qualquer divindade (`HALO_DEFAULT`).
      // Ela é compartilhada e continua intacta — o que a Amara faz é
      // usar o campo `halo` da ficha, previsto desde sempre e até
      // hoje vazio, para que a dela seja água-marinha.
      //
      // Este acessório é outra peça. A auréola comum é um aro
      // **horizontal** flutuando acima da cabeça; o nimbo é o disco
      // **vertical** da pintura sacra, no plano do rosto: de frente
      // emoldura a cabeça inteira, de perfil é um traço fino.
      //
      // Não são os anéis da Nexara. Aqueles orbitam, são vários e
      // vêm inclinados em ângulos diferentes; este é um só, parado e
      // frontal, e é insígnia, não órbita.
      const aro = R * 1.32;
      // Atrás do centro da cabeça: o rosto tem de ficar livre, e o
      // nimbo nasce **por fora** da queda do cabelo, que nesta malha
      // abre até `R · 1,2`.
      const atras = -R * 0.3;
      // Aberto embaixo, 250°: o quarto de baixo seria enterrado no
      // cabelo e nos ombros, onde um arco não se vê e só custa.
      const arco = (250 * Math.PI) / 180;
      const anel = new THREE.TorusGeometry(aro, R * 0.035, 4, Math.max(14, segs), arco);
      b.addGeometry(
        anel,
        { color: 0xc4fff2, finish: Finish.Holo, skin: head },
        // Girado para que a abertura fique embaixo.
        new THREE.Matrix4().makeRotationZ(Math.PI / 2 - arco / 2).setPosition(0, cy + R * 0.12, atras),
      );
      if (detail.segments >= 14) {
        // Um segundo fio, por dentro e mais apagado: dá espessura de
        // luz ao nimbo. Um aro sozinho lê como argola de metal.
        b.addGeometry(
          new THREE.TorusGeometry(aro * 0.86, R * 0.016, 4, Math.max(12, segs), arco),
          { color: 0xaef0dd, finish: Finish.Holo, skin: head },
          new THREE.Matrix4().makeRotationZ(Math.PI / 2 - arco / 2).setPosition(0, cy + R * 0.12, atras - 0.004),
        );
      }
      if (detail.segments >= 20) {
        // As contas de luz no aro. Sete, espaçadas no arco de cima —
        // criação, proteção, vida e continuidade ditas como ritmo, e
        // não como desenho de nada.
        const contas = 7;
        for (let i = 0; i < contas; i += 1) {
          const a = -arco / 2 + (arco * (i + 0.5)) / contas;
          b.ball(
            [Math.sin(a) * aro, cy + R * 0.12 + Math.cos(a) * aro, atras],
            [R * 0.045, R * 0.045, R * 0.026],
            { color: 0xeafff9, finish: Finish.Holo, skin: head },
            4,
          );
        }
      }
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
