/**
 * As medidas de um corpo do Éden.
 *
 * Antes havia um corpo só. Todo habitante saía do mesmo molde de
 * primitivas, e a única coisa que mudava de pessoa para pessoa era a
 * escala geral (`appearance.height`) e as cores. Duas pessoas de 1,70 m
 * eram a mesma pessoa pintada de outra cor — o que, numa praça com
 * cinquenta habitantes, é exatamente o que o olho percebe primeiro.
 *
 * Este módulo é o conjunto de medidas que distingue um corpo de outro.
 * São onze números, todos relativos (1 = a medida de referência), e
 * todos multiplicando um raio ou um comprimento na hora de gerar a
 * malha. Nenhum deles mexe no esqueleto de forma que a animação precise
 * saber: os ossos continuam nos mesmos lugares proporcionais, então uma
 * pose serve para qualquer corpo.
 *
 * Módulo puro: sem Three.js, sem DOM. É dado, e dado entra em save.
 */

/** Medidas relativas de um corpo. 1 = referência. */
export interface BodyProportions {
  /** Escala geral do corpo. Vem de `AvatarAppearance.height`. */
  height: number;
  /**
   * Compleição: 0 = esguio, 1 = robusto.
   *
   * Engrossa tudo de uma vez — membros, tronco, pescoço — na medida em
   * que cada parte costuma engrossar junto num corpo real. É o
   * parâmetro mais barato para fazer uma multidão parecer uma
   * multidão.
   */
  build: number;
  /** Largura dos ombros. */
  shoulders: number;
  /** Volume do tronco (caixa torácica). */
  chest: number;
  /** Cintura. Abaixo de 1 marca a curva; acima, apaga. */
  waist: number;
  /** Quadril. */
  hips: number;
  /** Comprimento dos braços. */
  armLength: number;
  /** Comprimento das pernas. */
  legLength: number;
  /** Comprimento e grossura do pescoço. */
  neck: number;
  /** Tamanho da cabeça. */
  headSize: number;
  /**
   * Formato do rosto: 0 = queixo estreito e alongado, 1 = redondo.
   *
   * Afeta a largura da mandíbula e a altura do crânio em sentidos
   * opostos, que é como um rosto muda de formato sem mudar de tamanho.
   */
  faceShape: number;
}

export const DEFAULT_PROPORTIONS: Readonly<BodyProportions> = Object.freeze({
  height: 1,
  build: 0.5,
  shoulders: 1,
  chest: 1,
  waist: 1,
  hips: 1,
  armLength: 1,
  legLength: 1,
  neck: 1,
  headSize: 1,
  faceShape: 0.5,
});

/**
 * Limites de cada medida.
 *
 * Estreitos de propósito. Um corpo com o quadril no dobro da largura
 * não é variedade, é defeito: a malha se auto-intersecta e a roupa
 * descola. O intervalo aqui é o que cabe sem quebrar a silhueta.
 */
export const PROPORTION_RANGE: Readonly<Record<keyof BodyProportions, readonly [number, number]>> = Object.freeze({
  height: [0.86, 1.14],
  build: [0, 1],
  shoulders: [0.84, 1.18],
  chest: [0.85, 1.2],
  waist: [0.8, 1.25],
  hips: [0.85, 1.22],
  armLength: [0.9, 1.1],
  legLength: [0.9, 1.1],
  neck: [0.85, 1.15],
  headSize: [0.9, 1.1],
  faceShape: [0, 1],
});

function clampTo(key: keyof BodyProportions, value: unknown, fallback: number): number {
  const [min, max] = PROPORTION_RANGE[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Lê medidas de uma fonte não confiável — um save antigo, por exemplo.
 *
 * Saves gravados antes deste sistema não têm campo nenhum, e é por isso
 * que cada medida cai no padrão individualmente em vez de o objeto
 * inteiro ser rejeitado: um save do Marco L abre com o corpo de
 * referência e nada se perde.
 */
export function sanitizeProportions(input: unknown): BodyProportions {
  const source = (input ?? {}) as Partial<Record<keyof BodyProportions, unknown>>;
  const out = {} as BodyProportions;
  for (const key of Object.keys(DEFAULT_PROPORTIONS) as (keyof BodyProportions)[]) {
    out[key] = clampTo(key, source[key], DEFAULT_PROPORTIONS[key]);
  }
  return out;
}

/** `true` quando as duas medidas são iguais em todos os campos. */
export function sameProportions(a: BodyProportions, b: BodyProportions): boolean {
  for (const key of Object.keys(DEFAULT_PROPORTIONS) as (keyof BodyProportions)[]) {
    if (Math.abs(a[key] - b[key]) > 1e-6) return false;
  }
  return true;
}

/**
 * Ruído determinístico a partir de um texto.
 *
 * O mesmo id devolve sempre o mesmo corpo, em qualquer máquina, em
 * qualquer região, antes e depois de viajar. É isso que impede um
 * habitante de mudar de físico ao atravessar um portal — e é por isso
 * que não há `Math.random()` em lugar nenhum deste arquivo.
 */
function hash(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Para [0, 1) com boa dispersão nos bits altos.
  return ((h >>> 8) & 0xffffff) / 0x1000000;
}

/** Valor no intervalo da medida, a partir do id. */
function vary(key: keyof BodyProportions, id: string, salt: number, spread: number): number {
  const [min, max] = PROPORTION_RANGE[key];
  const center = DEFAULT_PROPORTIONS[key];
  const t = hash(id, salt) * 2 - 1; // -1 … 1
  const reach = t >= 0 ? max - center : center - min;
  return center + t * reach * spread;
}

/**
 * O corpo de um habitante qualquer, deduzido do id.
 *
 * Determinístico e sem estado: dois sistemas que perguntem pelo mesmo
 * id — o `NpcSystem` na rua e o `InteriorScene` atrás de um balcão —
 * recebem o mesmo corpo sem precisar combinar nada entre si.
 *
 * @param height escala geral já conhecida (vem da aparência); entra sem
 *   sorteio, porque é identidade declarada, não variação.
 */
export function proportionsFor(id: string, height = 1): BodyProportions {
  return sanitizeProportions({
    height,
    build: 0.5 + (hash(id, 11) - 0.5) * 0.9,
    shoulders: vary('shoulders', id, 23, 0.85),
    chest: vary('chest', id, 37, 0.8),
    waist: vary('waist', id, 41, 0.8),
    hips: vary('hips', id, 53, 0.85),
    armLength: vary('armLength', id, 67, 0.7),
    legLength: vary('legLength', id, 71, 0.7),
    neck: vary('neck', id, 83, 0.6),
    headSize: vary('headSize', id, 97, 0.6),
    faceShape: hash(id, 103),
  });
}

/**
 * Mistura duas medidas. Serve para transições e para testes de limite.
 *
 * @param t 0 devolve `a`, 1 devolve `b`.
 */
export function mixProportions(a: BodyProportions, b: BodyProportions, t: number): BodyProportions {
  const k = Math.min(1, Math.max(0, t));
  const out = {} as BodyProportions;
  for (const key of Object.keys(DEFAULT_PROPORTIONS) as (keyof BodyProportions)[]) {
    out[key] = a[key] + (b[key] - a[key]) * k;
  }
  return sanitizeProportions(out);
}

/**
 * Impressão digital das medidas.
 *
 * Duas impressões iguais significam dois corpos idênticos. É assim que
 * um teste prova que Suki-Chan em Rosas Park tem o corpo de Suki-Chan
 * em Aurora City, sem precisar comparar malha vértice a vértice.
 */
export function proportionsFingerprint(p: BodyProportions): string {
  return (Object.keys(DEFAULT_PROPORTIONS) as (keyof BodyProportions)[]).map((key) => `${key}:${p[key].toFixed(4)}`).join('|');
}
