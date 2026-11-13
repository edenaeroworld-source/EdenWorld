/**
 * Vocabulário de expressões faciais.
 *
 * Módulo puro — sem Three.js e sem DOM — porque tanto o rosto (que é
 * geometria) quanto as árvores de diálogo (que são dados) precisam
 * nomear as mesmas expressões.
 */

/** Alvos de morph do rosto, na ordem em que entram na malha. */
export const FACE_MORPHS = ['sorriso', 'triste', 'surpresa', 'curiosa', 'fala', 'piscada'] as const;
export type FaceMorph = (typeof FACE_MORPHS)[number];

/** Expressões disponíveis para falas, escolhas e reações. */
export const EXPRESSIONS = ['neutra', 'feliz', 'curiosa', 'surpresa', 'pensativa', 'triste', 'animada'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/**
 * Quanto de cada alvo entra em cada expressão.
 *
 * As expressões não são alvos próprios: são misturas. `animada` é um
 * sorriso com as sobrancelhas de surpresa, `pensativa` é a sobrancelha
 * curiosa com um toque de tristeza. Dá sete rostos com seis alvos, e
 * qualquer mistura intermediária continua um rosto.
 */
export const EXPRESSION_WEIGHTS: Readonly<Record<Expression, Partial<Record<FaceMorph, number>>>> = Object.freeze({
  neutra: {},
  feliz: { sorriso: 1 },
  curiosa: { curiosa: 1, sorriso: 0.3 },
  surpresa: { surpresa: 1 },
  pensativa: { curiosa: 0.6, triste: 0.3 },
  triste: { triste: 1 },
  animada: { sorriso: 1, surpresa: 0.5 },
});

export function isExpression(value: string): value is Expression {
  return (EXPRESSIONS as readonly string[]).includes(value);
}
