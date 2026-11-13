/**
 * Gestação — a silhueta de quem está grávida.
 *
 * Amara, Deusa da Maternidade, é uma deusa **grávida**, e isso faz parte
 * da identidade dela no cânone do Éden Aero. Identidade não se representa
 * com um texto de perfil: tem que estar no corpo que aparece na cidade.
 *
 * ## Por que não é um produto Afters®
 *
 * A tentação óbvia era reaproveitar o AfterBust®/AfterCurve® e chamar a
 * gravidez de "mais um canal". Seria errado por dois motivos. O primeiro
 * é de cânone: Afters é uma **tecnologia cosmética** assinada por Luma,
 * que o jogador liga, desliga e ajusta de 0% a 250%. Gravidez não é um
 * produto, não tem painel e ninguém a "aplica" em outra pessoa. O
 * segundo é prático: se fosse um canal Afters, a gravidez apareceria no
 * EdenPhone como um slider — e o jogo estaria oferecendo ao jogador
 * engravidar o próprio avatar com um arrastão de dedo.
 *
 * Então é uma camada **separada**, movida por um traço de personagem
 * (`EdenCharacter.gestation`), que nenhuma interface expõe.
 *
 * ## Como funciona
 *
 * A mesma ideia dos Afters, porque a ideia é boa: uma banda gaussiana em
 * altura, que multiplica o raio do vértice no plano XZ. A diferença está
 * nos ganhos — o ventre cresce **muito para a frente**, um pouco para os
 * lados e quase nada para trás. É essa assimetria que faz a silhueta ser
 * lida como gravidez e não como "personagem mais largo".
 *
 * O avatar é feito de primitivas estilizadas; aqui também não há
 * anatomia, só volume suave — e a roupa vai junto, porque roupa e corpo
 * estão na mesma malha fundida.
 *
 * Módulo puro: sem Three.js, sem DOM. A mesma conta roda em TypeScript
 * (testável) e em GLSL (na GPU), e um teste compara as duas.
 */

import { type MorphBand, type Vec3, Zone, bandWeight, bandWeightSlope } from '../afters/AftersMorph';

/**
 * Altura da junta do tronco sobre o quadril, em metros.
 *
 * O ventre é **uma** região do corpo, mas atravessa duas malhas que têm
 * origens diferentes. Esta constante é o que traduz uma altura na outra;
 * `Avatar.ts` a importa como a posição do tronco, então as duas não têm
 * como divergir (há teste).
 */
export const TORSO_JOINT_Y = 0.06;

/**
 * Ventre — espaço local do tronco.
 *
 * Centro na altura do umbigo. Queda curta para cima (o peito mal sente),
 * mais longa para baixo (o ventre desce até o quadril). O ganho para a
 * frente é dez vezes o ganho para trás: as costas quase não mudam.
 */
export const GESTATION_BAND: MorphBand = {
  center: 0.105,
  sigmaUp: 0.08,
  sigmaDown: 0.095,
  gainX: 0.22,
  gainFront: 1.05,
  gainBack: 0.06,
};

/**
 * Ventre — espaço local do quadril.
 *
 * Mesma banda, mesma altura física, centro deslocado para a origem da
 * outra malha. Sem isto, o ventre terminaria num degrau exatamente onde
 * o tronco encontra o quadril.
 */
export const GESTATION_HIP_BAND: MorphBand = {
  ...GESTATION_BAND,
  center: GESTATION_BAND.center + TORSO_JOINT_Y,
};

/**
 * Quanto do ventre chega ao quadril.
 *
 * Menos que 1 porque o baixo-ventre é mais contido que o ventre, e
 * porque o quadril carrega a saia do vestido: empurrá-la toda para a
 * frente faria a roupa flutuar.
 */
export const GESTATION_HIP_SCALE = 0.7;

/** Gestação plena. O campo é 0–1; não há "250%" aqui, de propósito. */
export const MAX_GESTATION = 1;

/** Banda do ventre para uma zona de vértice (ou `null` quando não há). */
export function gestationBandForZone(zone: number): { band: MorphBand; scale: number } | null {
  switch (Math.round(zone)) {
    case Zone.Bust:
      return { band: GESTATION_BAND, scale: 1 };
    case Zone.Curve:
      return { band: GESTATION_HIP_BAND, scale: GESTATION_HIP_SCALE };
    // Coxas, braços, canelas e cabeça: o ventre não os alcança.
    default:
      return null;
  }
}

/**
 * Implementação de referência: posição deformada de um vértice.
 *
 * @param zone valor do atributo `aZone` do vértice
 * @param gestation 0 (não gestante) a 1 (gestação plena)
 */
export function displaceGestation(position: Vec3, zone: number, gestation: number): Vec3 {
  const entry = gestationBandForZone(zone);
  if (!entry || gestation <= 0) return { ...position };
  const weight = bandWeight(entry.band, position.y) * gestation * entry.scale;
  if (weight <= 0) return { ...position };
  const gainZ = position.z >= 0 ? entry.band.gainFront : entry.band.gainBack;
  return {
    x: position.x * (1 + entry.band.gainX * weight),
    y: position.y,
    z: position.z * (1 + gainZ * weight),
  };
}

/** Normal corrigida para a deformação do ventre (mesma conta do GLSL). */
export function gestationNormal(position: Vec3, normal: Vec3, zone: number, gestation: number): Vec3 {
  const entry = gestationBandForZone(zone);
  if (!entry || gestation <= 0) return { ...normal };
  const scaled = gestation * entry.scale;
  const weight = bandWeight(entry.band, position.y) * scaled;
  const slope = bandWeightSlope(entry.band, position.y) * scaled;
  const gainZ = position.z >= 0 ? entry.band.gainFront : entry.band.gainBack;
  const sx = 1 + entry.band.gainX * weight;
  const sz = 1 + gainZ * weight;
  const tilt = slope * (entry.band.gainX * position.x * normal.x + gainZ * position.z * normal.z);
  const x = normal.x / sx;
  const y = normal.y - tilt;
  const z = normal.z / sz;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

/** Até onde o ventre avança à frente, numa altura. Para testes e provas. */
export function bellyDepth(zone: number, radius: number, y: number, gestation: number): number {
  return displaceGestation({ x: 0, y, z: radius }, zone, gestation).z;
}

function glslBand(name: string, band: MorphBand): string {
  const f = (value: number): string => value.toFixed(5);
  return (
    `  ${name} = EdenBand(${f(band.center)}, ${f(band.sigmaUp)}, ${f(band.sigmaDown)}, ` +
    `${f(band.gainX)}, ${f(band.gainFront)}, ${f(band.gainBack)});`
  );
}

/**
 * GLSL do ventre, para injetar no shader do avatar.
 *
 * **Depende de `aftersMorphGLSL()` ter sido injetado antes**: reaproveita
 * a struct `EdenBand`, as funções `edenBandWeight`/`edenBandSlope` e o
 * atributo `aZone`. É de propósito — a matemática da banda é a mesma, e
 * duplicá-la no shader seria criar duas versões para divergirem. Um
 * teste verifica a ordem da injeção.
 */
export function gestationGLSL(): string {
  return `
uniform float uGestation;

// Banda do ventre para a zona deste vértice. Devolve false onde o ventre
// não chega (cabeça, braços, coxas, canelas) ou quando não há gestação.
bool edenGestationBand(out EdenBand band, out float intensity) {
  float zone = floor(aZone + 0.5);
${glslBand('  band', GESTATION_BAND)}
  intensity = 0.0;
  if (zone == 1.0) {
${glslBand('    band', GESTATION_BAND)}
    intensity = uGestation;
  } else if (zone == 2.0) {
${glslBand('    band', GESTATION_HIP_BAND)}
    intensity = uGestation * ${GESTATION_HIP_SCALE.toFixed(5)};
  }
  return intensity > 0.0;
}

vec3 edenGestationPosition(vec3 pos) {
  EdenBand band;
  float intensity;
  if (!edenGestationBand(band, intensity)) return pos;
  float weight = edenBandWeight(band, pos.y) * intensity;
  if (weight <= 0.0) return pos;
  float gainZ = pos.z >= 0.0 ? band.gainFront : band.gainBack;
  return vec3(pos.x * (1.0 + band.gainX * weight), pos.y, pos.z * (1.0 + gainZ * weight));
}

vec3 edenGestationNormal(vec3 pos, vec3 nrm) {
  EdenBand band;
  float intensity;
  if (!edenGestationBand(band, intensity)) return nrm;
  float weight = edenBandWeight(band, pos.y) * intensity;
  float slope = edenBandSlope(band, pos.y) * intensity;
  float gainZ = pos.z >= 0.0 ? band.gainFront : band.gainBack;
  float sx = 1.0 + band.gainX * weight;
  float sz = 1.0 + gainZ * weight;
  float tilt = slope * (band.gainX * pos.x * nrm.x + gainZ * pos.z * nrm.z);
  return normalize(vec3(nrm.x / sx, nrm.y - tilt, nrm.z / sz));
}
`;
}

/** Constantes expostas para os testes compararem TS e GLSL. */
export const GESTATION_BANDS: Readonly<Record<'torso' | 'hip', MorphBand>> = {
  torso: GESTATION_BAND,
  hip: GESTATION_HIP_BAND,
};
