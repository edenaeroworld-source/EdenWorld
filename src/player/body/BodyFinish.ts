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
export const FINISH_ROUGHNESS = [0.58, 0.88, 0.42, 0.08, 0.72, 0.22, 0.12] as const;
export const FINISH_METALNESS = [0.0, 0.0, 0.08, 0.0, 0.0, 0.55, 0.18] as const;
/** Brilho de tecido: só o pano tem. */
export const FINISH_SHEEN = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0] as const;
/** Verniz: o olho é molhado, o vidro líquido é envernizado por definição. */
export const FINISH_CLEARCOAT = [0.06, 0.0, 0.14, 1.0, 0.0, 0.35, 1.0] as const;
/** Quanto da irradiância do mapa de ambiente cada acabamento aceita. */
export const FINISH_ENV_DIFFUSE = [0.22, 0.26, 0.5, 1.0, 0.26, 1.0, 0.85] as const;
/**
 * Iridescência: a película fina que faz o vidro líquido virar
 * arco-íris no ângulo rasante. É o traço Frutiger Aero que não se
 * consegue com cor de vértice — depende do ângulo de visão.
 */
export const FINISH_IRIDESCENCE = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0] as const;

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
/**
 * Gera o seletor de uma propriedade a partir da sua tabela.
 *
 * `vFinish` chega interpolado entre vértices de acabamentos
 * diferentes, o que daria uma mistura sem sentido na fronteira entre
 * a manga e o braço. Por isso a leitura é por vizinhança: cada
 * acabamento contribui com peso `1 - |id - i|`, que é zero fora do
 * seu próprio anel.
 *
 * O corpo sai da tabela em vez de ser escrito à mão porque as duas
 * coisas já divergiram uma vez: acrescentar um acabamento exigia
 * lembrar de mexer em cinco funções com aridade fixa.
 */
function pick(name: string, table: readonly number[]): string {
  const linhas = table
    .map((v, i) => `  k = max(0.0, 1.0 - abs(id - ${i}.0)); v += ${v.toFixed(3)} * k; w += k;`)
    .join('\n');
  return `float ${name}(float id) {
  float w = 0.0;
  float v = 0.0;
  float k;
${linhas}
  return w > 0.0 ? v / w : ${table[0].toFixed(3)};
}`;
}

export function finishVertexGLSL(): string {
  return `
attribute float aFinish;
attribute float aAo;
varying float vFinish;
varying float vAo;
`;
}

export function finishVaryingGLSL(): string {
  return `
varying float vFinish;
varying float vAo;



${pick('edenRoughness', FINISH_ROUGHNESS)}

${pick('edenMetalness', FINISH_METALNESS)}

/** Quanto cada acabamento recebe de brilho de tecido. */
${pick('edenSheen', FINISH_SHEEN)}

/**
 * Aplica a oclusão assada — e só onde ela faz sentido.
 *
 * Oclusão ambiente mede quanta luz do céu chega a um ponto. O sol não
 * é céu: vem de uma direção só, e ou bate ou não bate. É por isso que
 * ela multiplica a luz **indireta** e deixa a direta em paz. Assar a
 * oclusão no albedo, como estava, apagava as duas juntas — a pele na
 * dobra perdia o sol também e saía cinza-oliva, que era o que restava
 * depois de o ambiente esverdeado do chão tomar conta.
 *
 * A oclusão especular é atenuada à parte: uma fresta pode estar
 * fechada para a luz difusa e ainda assim enxergar um pedaço de céu
 * no ângulo do reflexo, e tratá-las igual deixa o olho e o verniz
 * opacos sem motivo.
 */
float edenApplyOcclusion(float ao, float roughness, float dotNV) {
  return saturate(pow(dotNV + ao, exp2(-16.0 * roughness - 1.0)) - 1.0 + ao);
}

/**
 * Quanto da irradiância do mapa de ambiente cada acabamento aceita.
 *
 * A cena tem **duas** fontes de luz indireta difusa: a luz
 * hemisférica (céu azul em cima, chão verde embaixo) e o PMREM do
 * próprio céu, que o mundo captura para os reflexos. Para o avatar
 * isso é o mesmo ambiente contado duas vezes — e a segunda conta vem
 * tingida de verde, porque a captura inclui o chão.
 *
 * Medido na bancada, com o mapa ligado o queixo saía 158/162/134:
 * verde acima do vermelho, numa pele cujo albedo tem o vermelho 58%
 * acima do verde. Com o mapa desligado, 117/100/54. O personagem não
 * estava mal iluminado, estava iluminado duas vezes.
 *
 * Quem fica com a parcela difusa é a luz hemisférica, que é
 * explícita e ajustável pela atmosfera. Ao mapa de ambiente sobra o
 * que só ele sabe fazer — o reflexo especular, que continua inteiro
 * e é o que dá o molhado do olho e o lustro do cabelo.
 */
${pick('edenEnvDiffuse', FINISH_ENV_DIFFUSE)}

/** E de verniz — só o olho, que é molhado. */
${pick('edenClearcoat', FINISH_CLEARCOAT)}

/** E de película fina: só o vidro líquido. */
${pick('edenIridescence', FINISH_IRIDESCENCE)}
`;
}
