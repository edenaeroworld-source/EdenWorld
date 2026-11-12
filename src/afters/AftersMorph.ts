/**
 * Matemática da transformação de silhueta dos Afters®.
 *
 * Este módulo é a **única** fonte de verdade: as mesmas constantes
 * alimentam a implementação de referência em TypeScript (testável, sem
 * GPU) e o GLSL injetado no shader do avatar. Um teste compara as duas
 * para impedir que divirjam.
 *
 * O avatar do EDENWORLD é feito de primitivas estilizadas (cápsulas e
 * esferas) sem detalhe anatômico. O que a transformação faz é mudar o
 * **volume suave** de uma região, de forma radial no plano XZ, levando a
 * roupa junto — porque roupa e corpo estão na mesma malha fundida.
 *
 * Módulo puro: sem Three.js, sem DOM.
 */

/** Zona de deformação gravada por vértice no atributo `aZone`. */
export const Zone = {
  /** Cabeça, braços, antebraços e canelas: nunca deformam. */
  None: 0,
  /** Tronco — AfterBust®. */
  Bust: 1,
  /** Quadril, incluindo a saia do vestido — AfterCurve®. */
  Curve: 2,
  /** Coxa — AfterCurve® atenuado, só no topo. */
  Thigh: 3,
} as const;

export type ZoneId = (typeof Zone)[keyof typeof Zone];

/**
 * Parâmetros de uma banda de deformação.
 *
 * O peso em Y é uma gaussiana assimétrica: `sigmaUp` controla a queda
 * acima do centro e `sigmaDown` abaixo. Isso permite, por exemplo, que o
 * tronco cresça no peito sem engrossar o pescoço, e que o quadril leve a
 * saia junto sem inflar a cintura.
 */
export interface MorphBand {
  /** Centro da banda no espaço local da junta (metros). */
  center: number;
  /** Queda acima do centro. Quanto menor, mais localizado. */
  sigmaUp: number;
  /** Queda abaixo do centro. */
  sigmaDown: number;
  /** Ganho radial lateral por unidade de intensidade. */
  gainX: number;
  /** Ganho radial para a frente (z > 0) por unidade de intensidade. */
  gainFront: number;
  /** Ganho radial para trás (z < 0) por unidade de intensidade. */
  gainBack: number;
}

/**
 * AfterBust® — tronco.
 *
 * Centro um pouco acima da cintura, queda curta para cima (o pescoço e os
 * ombros quase não sentem) e mais longa para baixo, crescendo mais para a
 * frente do que para trás.
 */
export const BUST_BAND: MorphBand = {
  center: 0.235,
  sigmaUp: 0.07,
  sigmaDown: 0.125,
  // O ganho é bem maior para a frente do que para os lados: assim o volume
  // cresce na direção certa e os braços não são engolidos pelo tronco.
  gainX: 0.2,
  gainFront: 0.5,
  gainBack: 0.1,
};

/**
 * AfterCurve® — quadril.
 *
 * Centro na altura da junta do quadril, com cauda longa para baixo para
 * levar a saia do vestido junto. Cresce mais para os lados e para trás.
 */
export const CURVE_BAND: MorphBand = {
  center: -0.03,
  sigmaUp: 0.075,
  sigmaDown: 0.26,
  gainX: 0.22,
  gainFront: 0.1,
  gainBack: 0.24,
};

/**
 * AfterCurve® — topo da coxa.
 *
 * A coxa desce de y = 0 até y ≈ -0,41. Sem esta banda a junção quadril →
 * perna ficaria estrangulada quando o quadril cresce.
 */
export const THIGH_BAND: MorphBand = {
  center: -0.03,
  sigmaUp: 0.07,
  sigmaDown: 0.26,
  gainX: 0.3,
  gainFront: 0.16,
  gainBack: 0.32,
};

/** Intensidade mínima aceita pelo sistema (0 = desligado). */
export const MIN_INTENSITY = 0;
/** Intensidade máxima: 250% vira 2.5. */
export const MAX_INTENSITY = 2.5;

/** Peso gaussiano assimétrico da banda na altura `y`. */
export function bandWeight(band: MorphBand, y: number): number {
  const delta = y - band.center;
  const sigma = delta >= 0 ? band.sigmaUp : band.sigmaDown;
  const t = delta / sigma;
  return Math.exp(-t * t);
}

/** Derivada do peso em relação a y (usada para corrigir a normal). */
export function bandWeightSlope(band: MorphBand, y: number): number {
  const delta = y - band.center;
  const sigma = delta >= 0 ? band.sigmaUp : band.sigmaDown;
  const t = delta / sigma;
  return (-2 * t * Math.exp(-t * t)) / sigma;
}

/** Banda correspondente a cada zona (ou `null` quando a zona não deforma). */
export function bandForZone(zone: number): { band: MorphBand; channel: 'bust' | 'curve'; scale: number } | null {
  switch (Math.round(zone)) {
    case Zone.Bust:
      return { band: BUST_BAND, channel: 'bust', scale: 1 };
    case Zone.Curve:
      return { band: CURVE_BAND, channel: 'curve', scale: 1 };
    case Zone.Thigh:
      return { band: THIGH_BAND, channel: 'curve', scale: 1 };
    default:
      return null;
  }
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Implementação de referência: devolve a posição deformada de um vértice.
 *
 * É a mesma conta que o GLSL faz na GPU. Serve para testar a transformação
 * sem depender de WebGL.
 *
 * @param zone valor do atributo `aZone` do vértice
 * @param bust intensidade do AfterBust® (0–2.5)
 * @param curve intensidade do AfterCurve® (0–2.5)
 */
export function displaceVertex(position: Vec3, zone: number, bust: number, curve: number): Vec3 {
  const entry = bandForZone(zone);
  if (!entry) return { ...position };
  const intensity = entry.channel === 'bust' ? bust : curve;
  if (intensity <= 0) return { ...position };
  const { band } = entry;
  const weight = bandWeight(band, position.y) * intensity * entry.scale;
  if (weight <= 0) return { ...position };
  const gainZ = position.z >= 0 ? band.gainFront : band.gainBack;
  return {
    x: position.x * (1 + band.gainX * weight),
    y: position.y,
    z: position.z * (1 + gainZ * weight),
  };
}

/** Normal corrigida para a deformação (mesma aproximação usada no GLSL). */
export function displaceNormal(position: Vec3, normal: Vec3, zone: number, bust: number, curve: number): Vec3 {
  const entry = bandForZone(zone);
  if (!entry) return { ...normal };
  const intensity = entry.channel === 'bust' ? bust : curve;
  if (intensity <= 0) return { ...normal };
  const { band } = entry;
  const scaled = intensity * entry.scale;
  const weight = bandWeight(band, position.y) * scaled;
  const slope = bandWeightSlope(band, position.y) * scaled;
  const gainZ = position.z >= 0 ? band.gainFront : band.gainBack;
  const sx = 1 + band.gainX * weight;
  const sz = 1 + gainZ * weight;
  // Jacobiano aproximado: o termo em `slope` inclina a normal onde a banda
  // cresce ou decresce rápido, evitando o aspecto de "cilindro colado".
  const tilt = slope * (band.gainX * position.x * normal.x + gainZ * position.z * normal.z);
  const x = normal.x / sx;
  const y = normal.y - tilt;
  const z = normal.z / sz;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

/** Meia-largura (em X) da silhueta de um anel da zona, para testes e HUD. */
export function silhouetteHalfWidth(zone: number, radius: number, y: number, bust: number, curve: number): number {
  return displaceVertex({ x: radius, y, z: 0 }, zone, bust, curve).x;
}

function glslBand(name: string, band: MorphBand): string {
  const f = (value: number): string => value.toFixed(5);
  return (
    `  ${name} = EdenBand(${f(band.center)}, ${f(band.sigmaUp)}, ${f(band.sigmaDown)}, ` +
    `${f(band.gainX)}, ${f(band.gainFront)}, ${f(band.gainBack)});`
  );
}

/**
 * GLSL com a mesma matemática, para injetar no shader do avatar.
 *
 * Declara `uBust`, `uCurve`, o atributo `aZone` e duas funções:
 * `edenAftersPosition()` e `edenAftersNormal()`.
 */
export function aftersMorphGLSL(): string {
  return `
uniform float uBust;
uniform float uCurve;
attribute float aZone;

struct EdenBand {
  float center;
  float sigmaUp;
  float sigmaDown;
  float gainX;
  float gainFront;
  float gainBack;
};

// Peso gaussiano assimétrico da banda na altura y.
float edenBandWeight(EdenBand band, float y) {
  float delta = y - band.center;
  float sigma = delta >= 0.0 ? band.sigmaUp : band.sigmaDown;
  float t = delta / sigma;
  return exp(-t * t);
}

float edenBandSlope(EdenBand band, float y) {
  float delta = y - band.center;
  float sigma = delta >= 0.0 ? band.sigmaUp : band.sigmaDown;
  float t = delta / sigma;
  return (-2.0 * t * exp(-t * t)) / sigma;
}

// Banda e intensidade da zona deste vértice. Devolve false quando a zona
// não deforma (cabeça, braços, canelas) ou a intensidade é zero.
bool edenAftersBand(out EdenBand band, out float intensity) {
  float zone = floor(aZone + 0.5);
${glslBand('  band', BUST_BAND)}
  intensity = 0.0;
  if (zone == 1.0) {
${glslBand('    band', BUST_BAND)}
    intensity = uBust;
  } else if (zone == 2.0) {
${glslBand('    band', CURVE_BAND)}
    intensity = uCurve;
  } else if (zone == 3.0) {
${glslBand('    band', THIGH_BAND)}
    intensity = uCurve;
  }
  return intensity > 0.0;
}

vec3 edenAftersPosition(vec3 pos) {
  EdenBand band;
  float intensity;
  if (!edenAftersBand(band, intensity)) return pos;
  float weight = edenBandWeight(band, pos.y) * intensity;
  if (weight <= 0.0) return pos;
  float gainZ = pos.z >= 0.0 ? band.gainFront : band.gainBack;
  return vec3(pos.x * (1.0 + band.gainX * weight), pos.y, pos.z * (1.0 + gainZ * weight));
}

vec3 edenAftersNormal(vec3 pos, vec3 nrm) {
  EdenBand band;
  float intensity;
  if (!edenAftersBand(band, intensity)) return nrm;
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
export const MORPH_BANDS: Readonly<Record<'bust' | 'curve' | 'thigh', MorphBand>> = {
  bust: BUST_BAND,
  curve: CURVE_BAND,
  thigh: THIGH_BAND,
};
