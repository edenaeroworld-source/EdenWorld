/**
 * Silhueta — o eixo de forma do corpo, separado das medidas.
 *
 * `BodyProportions` responde "quanto": ombros mais largos, pernas mais
 * longas, cintura mais fina. É um eixo **contínuo**, vem de um hash do
 * id do personagem e é interpolável (`mixProportions`).
 *
 * `BodyShape` responde outra coisa: **que corpo é este**. Não é uma
 * medida a mais na mesma régua — é o conjunto de razões que fazem uma
 * silhueta ser lida como masculina ou feminina antes de qualquer
 * detalhe. Ombro contra quadril, peito contra cintura. Duas pessoas
 * podem ter exatamente as mesmas `BodyProportions` e silhuetas
 * diferentes, e é por isso que os dois eixos não podem ser um só.
 *
 * ## Por que multiplicadores, e não medidas absolutas
 *
 * Porque `BodyProportions` já é a camada das medidas, e ela é
 * **compartilhada com o save** e entra em `proportionsFingerprint` —
 * que é a prova de que o panteão não mudou. Mexer nela para dar
 * ombro a um personagem moveria a impressão digital de um sistema
 * inteiro para resolver um caso. Aqui a forma entra depois, por
 * razão, sobre as medidas que o personagem já tem: o Aérion continua
 * tendo o corpo que o hash do nome dele deu, visto por outra forma.
 *
 * ## Por que `SHAPE_FEM` é a identidade
 *
 * Todos os fatores de `SHAPE_FEM` valem exatamente 1. Não é um
 * descuido nem um lugar reservado: é a garantia **por construção** de
 * que acrescentar este eixo não move um vértice de quem já existia.
 * `bodyMetrics(p)` sem segundo argumento multiplica tudo por 1 e
 * devolve, número a número, o que devolvia antes — as dez deusas, os
 * cinquenta e quatro habitantes e o jogador inclusive. A prova não
 * depende de nenhum teste passar; depende de 1 × x = x.
 *
 * O mesmo vale para o dia em que alguém quiser um terceiro corpo: a
 * forma nova entra como uma tabela a mais, e as duas que existem não
 * são tocadas.
 */

/** Identificador da silhueta. Vai para a impressão digital do corpo. */
export const BODY_SHAPE_IDS = ['fem', 'masc'] as const;
export type BodyShapeId = (typeof BODY_SHAPE_IDS)[number];

/**
 * Fatores de forma, aplicados sobre as medidas já calculadas.
 *
 * Só larguras e grossuras. **Nenhum comprimento entra aqui** — altura,
 * braço, perna, pescoço e cabeça continuam sendo assunto de
 * `BodyProportions`, porque "mais alto" não é um traço de sexo e
 * tratá-lo como se fosse produziria o erro clássico de todo homem do
 * jogo ser mais alto que toda mulher.
 *
 * `crown` e `hipHeight` também ficam de fora de propósito: a câmera, a
 * etiqueta de nome e o assentamento no chão leem esses dois números, e
 * mudá-los deslocaria a interface junto com o corpo.
 */
export interface BodyShape {
  readonly id: BodyShapeId;
  /** Largura dos ombros. */
  readonly shoulderX: number;
  /** Largura da caixa torácica. */
  readonly chestWidth: number;
  /** Largura da cintura. */
  readonly waistWidth: number;
  /** Largura do quadril. */
  readonly hipWidth: number;
  /** Afastamento lateral das pernas. */
  readonly legX: number;
  /** Grossura do pescoço. */
  readonly neckR: number;
  /** Grossura do braço no ombro. */
  readonly armTop: number;
  /** Grossura da coxa. */
  readonly legTop: number;
}

/**
 * A forma de referência do Éden — e a identidade matemática.
 *
 * Todo fator vale 1. Ver o cabeçalho deste arquivo.
 */
export const SHAPE_FEM: BodyShape = Object.freeze({
  id: 'fem',
  shoulderX: 1,
  chestWidth: 1,
  waistWidth: 1,
  hipWidth: 1,
  legX: 1,
  neckR: 1,
  armTop: 1,
  legTop: 1,
});

/**
 * A forma masculina, escrita para o Aérion.
 *
 * Os números não são um palpite estético: saem da razão que se queria
 * corrigir. O corpo dele, derivado do hash de `'aerion'`, tinha peito
 * 0,94 contra cintura 1,15 — ou seja **peito/cintura = 1,01**. Não é
 * uma silhueta masculina nem feminina: é um tubo, e era isso que
 * estava no lugar do criador do Éden.
 *
 * Os fatores abaixo levam essa razão a ~1,26 e a de ombro/quadril de
 * 1,52 a ~1,79. São valores de pessoa, não de desenho animado — o
 * Éden não é um jogo de fisiculturismo, e a leitura tem de funcionar
 * de longe, na praça, sem o personagem precisar fazer pose.
 *
 * A cintura desce mais (0,90) do que o peito sobe (1,12) porque é o
 * estreitamento que o olho lê como V; alargar o peito sozinho engorda
 * o personagem em vez de afinar o tronco.
 */
export const SHAPE_MASC: BodyShape = Object.freeze({
  id: 'masc',
  shoulderX: 1.07,
  chestWidth: 1.12,
  waistWidth: 0.9,
  hipWidth: 0.91,
  // Pernas um pouco mais juntas: o afastamento acompanha o quadril, e
  // deixá-lo parado com o quadril mais estreito abriria um vão entre
  // as coxas que não existe em corpo nenhum.
  legX: 0.96,
  neckR: 1.07,
  armTop: 1.06,
  legTop: 0.99,
});

export const BODY_SHAPES: Readonly<Record<BodyShapeId, BodyShape>> = Object.freeze({
  fem: SHAPE_FEM,
  masc: SHAPE_MASC,
});

/** A forma de um identificador, caindo na de referência quando não há. */
export function shapeFor(id: BodyShapeId | undefined): BodyShape {
  return id ? BODY_SHAPES[id] : SHAPE_FEM;
}
