/**
 * Matemática da transformação de silhueta dos Afters®.
 *
 * Este módulo é a **única** fonte de verdade: as mesmas constantes
 * alimentam a implementação de referência em TypeScript (testável, sem
 * GPU) e o GLSL injetado no shader do avatar. Um teste compara as duas
 * para impedir que divirjam.
 *
 * ## O que mudou no BET Geometry Remaster 2.0
 *
 * A primeira versão era **uma só conta**: escalar o anel inteiro do
 * tronco em X e Z, com peso gaussiano na altura. Isso é um corpo de
 * revolução — o peito inteiro crescia como um barril, a axila inflava
 * junto, e não existia separação nenhuma entre um lado e o outro,
 * porque nada na fórmula sabia que existem dois lados. Era
 * escalonamento, e escalonamento não tem anatomia.
 *
 * Agora a deformação é a soma de **dois campos**:
 *
 * 1. **Sustentação** — a banda radial de antes, muito reduzida. Ela é o
 *    que carrega o tecido largo junto: a saia do vestido precisa abrir
 *    quando o quadril abre, e isso é um movimento de revolução mesmo.
 * 2. **Volume** — pares de lobos. Cada lobo empurra a superfície para
 *    fora *a partir de uma âncora interna ao corpo*, com peso gaussiano
 *    anisotrópico. Perto do centro do lobo a superfície tende a uma
 *    calota esférica em volta da âncora; longe, o peso cai a zero e
 *    sobra o corpo original, sem emenda. É isso que dá volume orgânico
 *    em vez de uma esfera colada: a esfera colada tem borda, e um campo
 *    que decai suavemente não tem.
 *
 * Os lobos são declarados só do lado `x > 0` e aplicados duas vezes,
 * espelhados. A simetria bilateral é estrutural, não uma conta que pode
 * sair torta.
 *
 * A normal não é mais derivada à mão. Ela sai de **diferenças centrais**
 * sobre o próprio campo de posição: desloca-se o vértice em duas
 * tangentes, mede-se o que o campo fez com elas e tira-se o produto
 * vetorial. Custa quatro avaliações do campo por vértice e dispensa
 * jacobiano — e, o que importa mais, continua certa sozinha quando
 * alguém mexer no campo. A versão anterior tinha um jacobiano aproximado
 * escrito à mão que precisaria ser reescrito a cada ajuste.
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

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/* ========================================================================
 * 1. Sustentação — a banda radial
 * ===================================================================== */

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
 * AfterBust® — sustentação do tronco.
 *
 * Era aqui que morava o volume inteiro, com `gainFront` em 0,5: em 250%
 * o peito ia a 2,25× a profundidade original, e o resultado era um
 * barril. Agora a banda só faz o que uma banda sabe fazer bem — alargar
 * de leve a caixa torácica para o corpete não ficar apertado sob o
 * volume — e quem desenha a forma são os lobos.
 */
export const BUST_BAND: MorphBand = {
  center: 0.235,
  sigmaUp: 0.07,
  sigmaDown: 0.125,
  gainX: 0.055,
  gainFront: 0.1,
  gainBack: 0.028,
};

/**
 * AfterCurve® — sustentação do quadril.
 *
 * Esta continua forte, e de propósito: abaixo do quadril o que existe é
 * a saia do vestido, que é uma superfície de revolução de verdade. Uma
 * saia abre em volta do corpo inteiro; não faria sentido abrir em dois
 * lobos. A cauda longa para baixo (`sigmaDown`) é o que leva o tecido.
 */
export const CURVE_BAND: MorphBand = {
  center: -0.03,
  sigmaUp: 0.075,
  sigmaDown: 0.26,
  gainX: 0.17,
  gainFront: 0.07,
  gainBack: 0.12,
};

/**
 * AfterCurve® — topo da coxa.
 *
 * A coxa desce de y = 0 até y ≈ -0,41. Sem esta banda a junção quadril →
 * perna ficaria estrangulada quando o quadril cresce.
 *
 * Continua sendo escala radial, e aqui isso é o certo: a coxa é um
 * tronco de cone em volta do próprio eixo, e engrossa em volta dele. Um
 * lobo não serviria — o espaço local da coxa está centrado na perna, não
 * no corpo, então nem dá para escrever um par espelhado aqui.
 */
export const THIGH_BAND: MorphBand = {
  center: -0.03,
  sigmaUp: 0.07,
  sigmaDown: 0.26,
  gainX: 0.24,
  gainFront: 0.14,
  gainBack: 0.26,
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

/** Derivada do peso em relação a y (usada pela gestação). */
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

/* ========================================================================
 * 2. Volume — os lobos
 * ===================================================================== */

/**
 * Um par de volumes espelhados.
 *
 * Declarado **só do lado positivo de X**. Quem avalia aplica duas vezes,
 * trocando o sinal de `center.x` e de `anchor.x`. Simetria bilateral por
 * construção: não há como os dois lados divergirem, porque são o mesmo
 * número.
 *
 * A direção do empurrão não é constante nem radial: é a direção que sai
 * da **âncora**, um ponto dentro do corpo, atrás do volume. Empurrar
 * todo mundo para o mesmo lado dá uma colina com ponta; empurrar a
 * partir de um ponto interno dá uma calota, porque todo vértice afastado
 * de uma distância igual da âncora acaba na mesma esfera em volta dela.
 * A diferença entre as duas coisas é a diferença entre um cone e um
 * seio.
 */
export interface BetLobe {
  /** Centro do volume no espaço local da junta, lado positivo (metros). */
  center: Vec3;
  /** Ponto interno de onde a superfície é empurrada. */
  anchor: Vec3;
  /** Raios de queda do peso em cada eixo (metros). */
  falloff: Vec3;
  /**
   * Quanto a queda abaixo do centro é mais curta que acima.
   *
   * Maior que 1 cria a dobra de baixo — a prega inframamária no peito, o
   * sulco glúteo atrás. É o detalhe que separa um volume anatômico de
   * uma bola: por cima o volume nasce devagar do tórax, por baixo ele
   * termina numa dobra.
   */
  below: number;
  /** Avanço do centro do volume, em metros por unidade de intensidade. */
  gain: number;
}

/**
 * AfterBust® — o par de volumes do peito.
 *
 * Espaço do tronco (y = 0 na cintura). O anel do peito está em y = 0,235
 * com meia-largura 0,153 e frente em z = 0,104; o centro de cada lobo
 * fica na metade da meia-largura e logo abaixo do anel mais largo.
 *
 * A âncora está acima e atrás do centro, o que inclina o empurrão para
 * baixo e para fora: o volume cresce caindo, como peso. Se a âncora
 * ficasse no eixo do corpo, o empurrão seria radial puro e a silhueta
 * voltaria a ser a de um barril, só que com dois caroços.
 */
export const BUST_LOBE: BetLobe = {
  center: { x: 0.068, y: 0.238, z: 0.088 },
  anchor: { x: 0.042, y: 0.268, z: -0.018 },
  falloff: { x: 0.062, y: 0.057, z: 0.086 },
  below: 1.5,
  gain: 0.044,
};

/**
 * AfterCurve® — o par de volumes do glúteo.
 *
 * Espaço do quadril (y = 0 na junta da perna). A pelve é mais funda
 * atrás que na frente (`rzBack` 0,118 contra `rz` 0,104), e é nessa
 * parte de trás que o volume entra. A âncora fica à frente e acima, de
 * modo que o empurrão sai para trás e para baixo.
 */
export const GLUTE_LOBE: BetLobe = {
  center: { x: 0.07, y: -0.052, z: -0.098 },
  anchor: { x: 0.04, y: 0.004, z: 0.012 },
  falloff: { x: 0.072, y: 0.072, z: 0.094 },
  below: 1.25,
  gain: 0.042,
};

/**
 * Lobos de cada zona.
 *
 * A coxa não tem: o espaço local dela está centrado na perna, e um par
 * espelhado em volta de `x = 0` ali significaria dois volumes por perna,
 * um deles no vão entre as duas. A coxa fica com a banda radial.
 */
export function lobeForZone(zone: number): { lobe: BetLobe; channel: 'bust' | 'curve' } | null {
  switch (Math.round(zone)) {
    case Zone.Bust:
      return { lobe: BUST_LOBE, channel: 'bust' };
    case Zone.Curve:
      return { lobe: GLUTE_LOBE, channel: 'curve' };
    default:
      return null;
  }
}

/** Abaixo deste peso o lobo não mexe no vértice — corta a conta cedo. */
const LOBE_CUTOFF = 1e-4;

/**
 * Peso do lobo num ponto: gaussiana anisotrópica, mais curta por baixo.
 *
 * @param side +1 para o lobo direito, -1 para o espelhado
 */
export function lobeWeight(lobe: BetLobe, position: Vec3, side: number): number {
  const dx = position.x - side * lobe.center.x;
  const dy = position.y - lobe.center.y;
  const dz = position.z - lobe.center.z;
  const qx = dx / lobe.falloff.x;
  const qy = lobeHeightTerm(lobe, dy);
  const qz = dz / lobe.falloff.z;
  return Math.exp(-(qx * qx + qy * qy + qz * qz));
}

/**
 * Coordenada vertical normalizada do lobo, com assimetria **suave**.
 *
 * A forma óbvia de fazer a queda de baixo mais curta que a de cima é
 * trocar o sigma conforme o sinal de `dy`. Ela é contínua — nos dois
 * ramos o peso vale o mesmo em dy = 0 —, e mesmo assim produz um
 * defeito visível: a *derivada* salta ali, e a normal é feita da
 * derivada. O resultado é um vinco horizontal atravessando exatamente a
 * parte mais cheia do volume, que foi medido em 0,29 de giro de normal
 * num passo de 4 mm, no centro do lobo, contra 0,02 na vizinhança.
 *
 * Em vez do degrau, os dois inversos de sigma são misturados por um
 * `smoothstep` numa janela estreita em volta do centro. Longe da janela
 * o comportamento é idêntico ao de antes; dentro dela a transição é
 * derivável.
 *
 * Registro honesto: este salto de derivada existe, mas **não** era a
 * causa do giro de 0,29 medido acima. Isolando os dois campos, a banda
 * respondeu por 0,016 e o lobo por 0,175, e suavizar a assimetria não
 * mudou o número. O giro grande no centro é a curvatura do ápice da
 * cúpula — numa gaussiana ela é máxima no topo, 2A/σ² ≈ 27 m⁻¹, uns 6°
 * a cada 4 mm —, ou seja, é a forma pedida, não um defeito. A correção
 * ficou porque continua certa; a hipótese que a motivou é que estava
 * errada.
 */
function lobeHeightTerm(lobe: BetLobe, dy: number): number {
  const invUp = 1 / lobe.falloff.y;
  const invDown = lobe.below / lobe.falloff.y;
  const w = lobe.falloff.y * ASYMMETRY_WINDOW;
  const t = smoothstep(-w, w, dy);
  return dy * (invDown + (invUp - invDown) * t);
}

/** Largura da janela de mistura, em frações do raio de queda vertical. */
export const ASYMMETRY_WINDOW = 0.3;

/** `smoothstep` do GLSL, para a conta ser a mesma dos dois lados. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Deslocamento que um lobo impõe a um ponto. */
export function lobeOffset(lobe: BetLobe, position: Vec3, side: number, intensity: number): Vec3 {
  const weight = lobeWeight(lobe, position, side);
  if (weight <= LOBE_CUTOFF) return { x: 0, y: 0, z: 0 };
  const ux = position.x - side * lobe.anchor.x;
  const uy = position.y - lobe.anchor.y;
  const uz = position.z - lobe.anchor.z;
  const length = Math.hypot(ux, uy, uz);
  if (length < 1e-6) return { x: 0, y: 0, z: 0 };
  const k = (lobe.gain * intensity * weight) / length;
  return { x: ux * k, y: uy * k, z: uz * k };
}

/* ========================================================================
 * 3. O campo completo
 * ===================================================================== */

/**
 * Implementação de referência: devolve a posição deformada de um vértice.
 *
 * É a mesma conta que o GLSL faz na GPU. Serve para testar a
 * transformação sem depender de WebGL.
 *
 * Os dois campos são somados a partir da **posição original**, não em
 * cascata. Somar campos independentes é comutativo e simétrico; aplicar
 * um sobre o resultado do outro faria o volume do lobo depender de
 * quanto a banda já tinha esticado aquele ponto, e a forma mudaria de
 * jeito difícil de prever a cada ajuste de ganho.
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

  // Sustentação: escala radial com peso em altura.
  const weight = bandWeight(entry.band, position.y) * intensity * entry.scale;
  const gainZ = position.z >= 0 ? entry.band.gainFront : entry.band.gainBack;
  let x = position.x * (1 + entry.band.gainX * weight);
  let y = position.y;
  let z = position.z * (1 + gainZ * weight);

  // Volume: o par de lobos espelhados.
  const pair = lobeForZone(zone);
  if (pair) {
    const right = lobeOffset(pair.lobe, position, 1, intensity);
    const left = lobeOffset(pair.lobe, position, -1, intensity);
    x += right.x + left.x;
    y += right.y + left.y;
    z += right.z + left.z;
  }

  return { x, y, z };
}

/** Passo das diferenças centrais que levantam a normal (metros). */
export const NORMAL_EPSILON = 0.005;

/**
 * Normal corrigida para a deformação (mesma conta do GLSL).
 *
 * Diferenças centrais sobre `displaceVertex`: duas tangentes ortogonais
 * à normal original, deslocadas para os dois lados, e o produto vetorial
 * do que sobrou. Com campo identidade o resultado é exatamente a normal
 * de entrada, então o caminho sem Afters não muda nada.
 */
export function displaceNormal(position: Vec3, normal: Vec3, zone: number, bust: number, curve: number): Vec3 {
  const entry = bandForZone(zone);
  if (!entry) return { ...normal };
  const intensity = entry.channel === 'bust' ? bust : curve;
  if (intensity <= 0) return { ...normal };

  const nl = Math.hypot(normal.x, normal.y, normal.z) || 1;
  const n = { x: normal.x / nl, y: normal.y / nl, z: normal.z / nl };

  // Uma tangente qualquer, desde que não seja paralela à normal.
  const helper = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let t1 = {
    x: n.y * helper.z - n.z * helper.y,
    y: n.z * helper.x - n.x * helper.z,
    z: n.x * helper.y - n.y * helper.x,
  };
  const t1l = Math.hypot(t1.x, t1.y, t1.z) || 1;
  t1 = { x: t1.x / t1l, y: t1.y / t1l, z: t1.z / t1l };
  // t2 = n × t1, de modo que t1 × t2 = n.
  const t2 = {
    x: n.y * t1.z - n.z * t1.y,
    y: n.z * t1.x - n.x * t1.z,
    z: n.x * t1.y - n.y * t1.x,
  };

  const e = NORMAL_EPSILON;
  const at = (t: Vec3, s: number): Vec3 =>
    displaceVertex({ x: position.x + t.x * s, y: position.y + t.y * s, z: position.z + t.z * s }, zone, bust, curve);
  const a = at(t1, e);
  const b = at(t1, -e);
  const c = at(t2, e);
  const d = at(t2, -e);

  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const uz = a.z - b.z;
  const vx = c.x - d.x;
  const vy = c.y - d.y;
  const vz = c.z - d.z;

  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  const length = Math.hypot(cx, cy, cz);
  // Campo degenerado (um ponto onde tudo colapsa): fica a normal original.
  if (length < 1e-12) return n;
  return { x: cx / length, y: cy / length, z: cz / length };
}

/** Meia-largura (em X) da silhueta de um anel da zona, para testes e HUD. */
export function silhouetteHalfWidth(zone: number, radius: number, y: number, bust: number, curve: number): number {
  return displaceVertex({ x: radius, y, z: 0 }, zone, bust, curve).x;
}

/**
 * Até onde o volume avança à frente numa altura, medido no plano do lobo.
 *
 * O que um teste quer saber sobre o AfterBust® não é a meia-largura em
 * z = 0 — é o quanto o peito avançou. Esta é a medida dessa pergunta.
 */
export function bustProjection(y: number, surfaceZ: number, bust: number): number {
  return displaceVertex({ x: BUST_LOBE.center.x, y, z: surfaceZ }, Zone.Bust, bust, 0).z;
}

/** Até onde o glúteo avança para trás numa altura. Valor negativo. */
export function glutenProjection(y: number, surfaceZ: number, curve: number): number {
  return displaceVertex({ x: GLUTE_LOBE.center.x, y, z: surfaceZ }, Zone.Curve, 0, curve).z;
}

/* ========================================================================
 * 4. O mesmo campo em GLSL
 * ===================================================================== */

const f = (value: number): string => value.toFixed(5);

function glslBand(name: string, band: MorphBand): string {
  return (
    `  ${name} = EdenBand(${f(band.center)}, ${f(band.sigmaUp)}, ${f(band.sigmaDown)}, ` +
    `${f(band.gainX)}, ${f(band.gainFront)}, ${f(band.gainBack)});`
  );
}

function glslLobe(name: string, lobe: BetLobe): string {
  return (
    `  ${name} = EdenLobe(vec3(${f(lobe.center.x)}, ${f(lobe.center.y)}, ${f(lobe.center.z)}), ` +
    `vec3(${f(lobe.anchor.x)}, ${f(lobe.anchor.y)}, ${f(lobe.anchor.z)}), ` +
    `vec3(${f(lobe.falloff.x)}, ${f(lobe.falloff.y)}, ${f(lobe.falloff.z)}), ` +
    `${f(lobe.below)}, ${f(lobe.gain)});`
  );
}

/**
 * GLSL com a mesma matemática, para injetar no shader do avatar.
 *
 * Declara `uBust`, `uCurve`, o atributo `aZone` e duas funções:
 * `edenAftersPosition()` e `edenAftersNormal()`.
 *
 * As constantes são formatadas a partir das mesmas variáveis que o
 * TypeScript usa. Não existe um número digitado duas vezes neste
 * arquivo: é por isso que os dois caminhos não divergem.
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

struct EdenLobe {
  vec3 center;
  vec3 anchor;
  vec3 falloff;
  float below;
  float gain;
};

// Peso gaussiano assimétrico da banda na altura y.
float edenBandWeight(EdenBand band, float y) {
  float delta = y - band.center;
  float sigma = delta >= 0.0 ? band.sigmaUp : band.sigmaDown;
  float t = delta / sigma;
  return exp(-t * t);
}

// Derivada do peso da banda em relação a y.
//
// Os Afters não usam mais: a normal deles sai de diferença central. Quem
// usa é a gestação, que injeta o GLSL dela **depois** deste e conta com a
// struct e as duas funções de banda já declaradas. Apagar daqui quebra o
// ventre, e quebra calado — o shader só falha ao compilar, em tempo de
// execução, com o avatar invisível.
float edenBandSlope(EdenBand band, float y) {
  float delta = y - band.center;
  float sigma = delta >= 0.0 ? band.sigmaUp : band.sigmaDown;
  float t = delta / sigma;
  return (-2.0 * t * exp(-t * t)) / sigma;
}

// Peso do lobo: gaussiana anisotrópica, mais curta abaixo do centro.
float edenLobeWeight(EdenLobe lobe, vec3 pos, float side) {
  vec3 d = pos - vec3(side * lobe.center.x, lobe.center.y, lobe.center.z);
  // Assimetria suave: trocar o sigma pelo sinal de d.y deixa a derivada
  // saltar no centro do lobo, e a normal com ela — um vinco horizontal
  // bem no meio do volume. Os dois inversos são misturados numa janela.
  float invUp = 1.0 / lobe.falloff.y;
  float invDown = lobe.below / lobe.falloff.y;
  float w = lobe.falloff.y * ${f(ASYMMETRY_WINDOW)};
  float qy = d.y * mix(invDown, invUp, smoothstep(-w, w, d.y));
  vec3 q = vec3(d.x / lobe.falloff.x, qy, d.z / lobe.falloff.z);
  return exp(-dot(q, q));
}

// Empurrão de um lobo: direção saindo da âncora interna, peso gaussiano.
vec3 edenLobeOffset(EdenLobe lobe, vec3 pos, float side, float intensity) {
  float weight = edenLobeWeight(lobe, pos, side);
  if (weight <= ${f(LOBE_CUTOFF)}) return vec3(0.0);
  vec3 u = pos - vec3(side * lobe.anchor.x, lobe.anchor.y, lobe.anchor.z);
  float len = length(u);
  if (len < 1e-6) return vec3(0.0);
  return u * (lobe.gain * intensity * weight / len);
}

// Banda, lobo e intensidade da zona deste vértice. Devolve false quando a
// zona não deforma (cabeça, braços, canelas) ou a intensidade é zero.
bool edenAftersSetup(out EdenBand band, out EdenLobe lobe, out bool hasLobe, out float intensity) {
  float zone = floor(aZone + 0.5);
${glslBand('  band', BUST_BAND)}
${glslLobe('  lobe', BUST_LOBE)}
  hasLobe = false;
  intensity = 0.0;
  if (zone == 1.0) {
${glslBand('    band', BUST_BAND)}
${glslLobe('    lobe', BUST_LOBE)}
    hasLobe = true;
    intensity = uBust;
  } else if (zone == 2.0) {
${glslBand('    band', CURVE_BAND)}
${glslLobe('    lobe', GLUTE_LOBE)}
    hasLobe = true;
    intensity = uCurve;
  } else if (zone == 3.0) {
${glslBand('    band', THIGH_BAND)}
    hasLobe = false;
    intensity = uCurve;
  }
  return intensity > 0.0;
}

vec3 edenAftersDisplace(EdenBand band, EdenLobe lobe, bool hasLobe, float intensity, vec3 pos) {
  float weight = edenBandWeight(band, pos.y) * intensity;
  float gainZ = pos.z >= 0.0 ? band.gainFront : band.gainBack;
  vec3 out3 = vec3(pos.x * (1.0 + band.gainX * weight), pos.y, pos.z * (1.0 + gainZ * weight));
  if (hasLobe) {
    out3 += edenLobeOffset(lobe, pos, 1.0, intensity);
    out3 += edenLobeOffset(lobe, pos, -1.0, intensity);
  }
  return out3;
}

// Folga do braço: o membro não engorda, ele sai do caminho do tecido.
vec3 edenAftersPosition(vec3 pos) {
  EdenBand band;
  EdenLobe lobe;
  bool hasLobe;
  float intensity;
  if (!edenAftersSetup(band, lobe, hasLobe, intensity)) return pos;
  return edenAftersDisplace(band, lobe, hasLobe, intensity, pos);
}

// Normal por diferenças centrais sobre o campo de posição. Quatro
// avaliações: nenhum jacobiano escrito à mão para sair de sincronia com
// a forma quando alguém ajustar um ganho.
vec3 edenAftersNormal(vec3 pos, vec3 nrm) {
  EdenBand band;
  EdenLobe lobe;
  bool hasLobe;
  float intensity;
  if (!edenAftersSetup(band, lobe, hasLobe, intensity)) return nrm;
  vec3 n = normalize(nrm);
  vec3 helper = abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(n, helper));
  vec3 t2 = cross(n, t1);
  float e = ${f(NORMAL_EPSILON)};
  vec3 a = edenAftersDisplace(band, lobe, hasLobe, intensity, pos + t1 * e);
  vec3 b = edenAftersDisplace(band, lobe, hasLobe, intensity, pos - t1 * e);
  vec3 c = edenAftersDisplace(band, lobe, hasLobe, intensity, pos + t2 * e);
  vec3 d = edenAftersDisplace(band, lobe, hasLobe, intensity, pos - t2 * e);
  vec3 crossed = cross(a - b, c - d);
  float len = length(crossed);
  if (len < 1e-12) return n;
  return crossed / len;
}
`;
}

/** Constantes expostas para os testes compararem TS e GLSL. */
export const MORPH_BANDS: Readonly<Record<'bust' | 'curve' | 'thigh', MorphBand>> = {
  bust: BUST_BAND,
  curve: CURVE_BAND,
  thigh: THIGH_BAND,
};

/** Lobos expostos para os testes compararem TS e GLSL. */
export const BET_LOBES: Readonly<Record<'bust' | 'curve', BetLobe>> = {
  bust: BUST_LOBE,
  curve: GLUTE_LOBE,
};
