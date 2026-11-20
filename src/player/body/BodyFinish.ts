/**
 * Acabamento por vértice — a parte PBR do avatar.
 *
 * O avatar inteiro sai num desenho só, com um material só. Isso é bom
 * para o desempenho e era ruim para a aparência: a pele recebia o
 * mesmo brilho da borracha do tênis, o olho o mesmo da camiseta, e o
 * cabelo o mesmo da pele. Um `MeshStandardMaterial` com
 * `roughness: 0.52` para tudo é, literalmente, uma superfície só.
 *
 * Partir a malha em cinco materiais resolveria e custaria cinco
 * chamadas de desenho por personagem — com cinquenta e quatro
 * habitantes em cena, é o orçamento inteiro. A saída é um número por
 * vértice: o shader lê dele a rugosidade, o metal, o brilho de tecido
 * e o verniz de cada fragmento, e continua sendo um desenho só.
 *
 * Os valores são de referência física, não escolhidos a olho:
 *
 * | superfície | rugosidade | por quê |
 * |---|---|---|
 * | pele     | 0,58 | difusa, com um realce largo e fraco |
 * | tecido   | 0,88 | quase sem realce, mas com brilho de borda |
 * | cabelo   | 0,42 | realce alongado, é o que dá o lustro |
 * | olho     | 0,08 | molhado, com verniz por cima |
 * | borracha | 0,72 | fosca, um pouco mais que tecido |
 * | brilhante| 0,22 | enfeites, fivelas, metal leve |
 */

/** Rugosidade e metal de cada acabamento, na ordem de `Finish`. */
export const FINISH_ROUGHNESS = [0.58, 0.88, 0.42, 0.08, 0.72, 0.22] as const;
export const FINISH_METALNESS = [0.0, 0.0, 0.08, 0.0, 0.0, 0.55] as const;

/**
 * GLSL que traduz o atributo em parâmetros do material.
 *
 * `vFinish` chega interpolado entre vértices de acabamentos
 * diferentes, o que daria uma mistura sem sentido na fronteira entre
 * a manga e o braço. Por isso a leitura é por vizinhança: o valor é
 * arredondado, e a transição acontece em um anel de vértices, que é
 * estreito o bastante para ninguém ver e largo o bastante para não
 * serrilhar.
 */
export function finishVertexGLSL(): string {
  return `
attribute float aFinish;
varying float vFinish;
`;
}

export function finishVaryingGLSL(): string {
  return `
varying float vFinish;

float edenFinishPick(float id, float a, float b, float c, float d, float e, float f) {
  float w = 0.0;
  float v = 0.0;
  float k;
  k = max(0.0, 1.0 - abs(id - 0.0)); v += a * k; w += k;
  k = max(0.0, 1.0 - abs(id - 1.0)); v += b * k; w += k;
  k = max(0.0, 1.0 - abs(id - 2.0)); v += c * k; w += k;
  k = max(0.0, 1.0 - abs(id - 3.0)); v += d * k; w += k;
  k = max(0.0, 1.0 - abs(id - 4.0)); v += e * k; w += k;
  k = max(0.0, 1.0 - abs(id - 5.0)); v += f * k; w += k;
  return w > 0.0 ? v / w : a;
}

float edenRoughness(float id) {
  return edenFinishPick(id, ${FINISH_ROUGHNESS.map((v) => v.toFixed(3)).join(', ')});
}

float edenMetalness(float id) {
  return edenFinishPick(id, ${FINISH_METALNESS.map((v) => v.toFixed(3)).join(', ')});
}

/** Quanto cada acabamento recebe de brilho de tecido. */
float edenSheen(float id) {
  return edenFinishPick(id, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0);
}

/** E de verniz — só o olho, que é molhado. */
float edenClearcoat(float id) {
  return edenFinishPick(id, 0.06, 0.0, 0.14, 1.0, 0.0, 0.35);
}
`;
}
