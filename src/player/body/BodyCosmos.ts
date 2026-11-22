/**
 * Campo cósmico procedural — a pele-galáxia do Criador.
 *
 * O C2 deu ao Aérion um acabamento próprio (`Finish.Cosmos`) e um
 * corpo sem roupa nenhuma para ele ocupar. O que falta é o que se vê:
 * estrelas, nebulosas, braços de galáxia e fluxos de energia correndo
 * pela pele. Este módulo é só isso — **nenhuma geometria**. O
 * princípio da Etapa 3 continua valendo: o cósmico é acabamento, não
 * forma.
 *
 * ## Por que em espaço de ligação (`vBind`)
 *
 * O campo é calculado sobre a posição do vértice **antes da pele e
 * antes das deformações** (`position`, o atributo cru). Fosse em
 * espaço de mundo, a galáxia ficaria parada no ar e o corpo passaria
 * por dentro dela — o personagem andaria e a pele mudaria de
 * desenho. Fosse depois da deformação, levantar o braço faria as
 * estrelas escorrerem. Em espaço de ligação a nebulosa é *dele*: fica
 * pintada no corpo, acompanha a pose e ignora o AfterBust®.
 *
 * ## Por que ele não custa nada a quem não é o Aérion
 *
 * Este GLSL **só é injetado no material de quem tem o sinalizador
 * cósmico** (`Avatar.cosmos`), e a chave de cache de programa muda
 * junto. O habitante comum não roda um `if` a mais: o código não
 * existe no shader dele. O uniforme `uCosmos` nasce zero em todos os
 * avatares e é o segundo cadeado — se um dia alguém injetar o bloco
 * por engano, ele continua desligado.
 *
 * ## Custo declarado
 *
 * Por fragmento cósmico, no material físico: 36 picadas de ruído
 * (`edenHash13`) — 8 da dobra de domínio, 24 das três oitavas da
 * nebulosa e 4 das estrelas. No material simples, que é o que as
 * máquinas fracas rodam: **20**, sem a dobra e com duas oitavas.
 * Mais um `atan` e as misturas de cor. É caro por pixel e barato no
 * quadro: um personagem em cena, nunca cinquenta e quatro.
 */

/** Índice de `Finish.Cosmos` — ver `BodyRig.ts`. */
const COSMOS_FINISH = 8;

/** Quantos acabamentos existem (o campo só pinta o último). */
const FINISH_COUNT = 9;

/**
 * Peso do campo por acabamento: 1 no cósmico, 0 em todos os outros.
 *
 * A tabela é lida com a **mesma** máquina de vizinhança que a
 * rugosidade e o metal usam (`BodyFinish.ts`): cada acabamento
 * contribui com `1 - |id - i|`. Isso importa na fronteira — o olho do
 * Aérion é `Finish.Eye`, e sem a leitura por vizinhança o anel entre
 * o olho e a pele sairia com meia galáxia dentro.
 */
export const COSMOS_MASK: readonly number[] = Array.from({ length: FINISH_COUNT }, (_, i) =>
  i === COSMOS_FINISH ? 1 : 0,
);

/** A varying que leva a posição de ligação ao fragmento. */
export function cosmosVertexGLSL(): string {
  return `
varying vec3 vBind;
`;
}

/** O que o vértice escreve nela. */
export const COSMOS_VERTEX_WRITE = 'vBind = position;';

/**
 * O campo propriamente dito.
 *
 * Quatro camadas, na ordem em que o olho as lê:
 *
 * 1. **vazio** — o fundo quase preto, azul-violeta;
 * 2. **nebulosa** — ruído de valor em três oitavas, com dobra de
 *    domínio, que faz as nuvens terem borda de nuvem e não de ruído;
 * 3. **braços de galáxia** — uma espiral em torno do eixo do corpo,
 *    que dá direção ao que senão seria mancha;
 * 4. **estrelas** — pontos por célula, com cintilação própria.
 *
 * O quarto canal do retorno é o brilho das estrelas, que sai do campo
 * e entra na emissão: estrela que não acende é poeira.
 */
export function cosmosFragmentGLSL(rico = true): string {
  // Na máquina fraca o campo roda enxuto: duas oitavas e sem dobra de
  // domínio, que são 20 picadas de ruído por fragmento em vez de 36.
  // O degrau é o mesmo que já separa o material físico do simples
  // (`Avatar.setMaterialTier`), movido pelo nível gráfico — não é um
  // botão novo, é o botão que já existe sendo obedecido por mais uma
  // coisa. A nebulosa perde um pouco de recorte na borda; as
  // estrelas, os braços e os fluxos ficam inteiros.
  const oitavas = rico ? 3 : 2;
  const mask = COSMOS_MASK.map(
    (v, i) => `  k = max(0.0, 1.0 - abs(id - ${i}.0)); v += ${v.toFixed(1)} * k; w += k;`,
  ).join('\n');
  return `
varying vec3 vBind;
uniform float uCosmos;
uniform float uCosmosTime;

/**
 * Peso do campo por acabamento — 1 só no cósmico.
 *
 * O valor de reserva (quando nenhum acabamento pesa) sai da **própria
 * tabela**, e não de um literal escrito à mão: é inalcançável com
 * acabamento válido, e um número solto ali seria uma porta que
 * ninguém jamais abriria para conferir se está trancada.
 */
float edenCosmosMask(float id) {
  float w = 0.0;
  float v = 0.0;
  float k;
${mask}
  return w > 0.0 ? v / w : ${COSMOS_MASK[0].toFixed(1)};
}

/** Picada de ruído de três entradas. Base de tudo o que vem abaixo. */
float edenHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Ruído de valor, interpolado com suavização de Hermite. */
float edenValue3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = edenHash13(i);
  float n100 = edenHash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = edenHash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = edenHash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = edenHash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = edenHash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = edenHash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = edenHash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

/** Oitavas de ruído. Mais que três não se vê na pele e cobra caro. */
float edenFbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < ${oitavas}; i++) {
    v += a * edenValue3(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}

/**
 * O campo. \`p\` em espaço de ligação (metros), \`t\` em segundos.
 *
 * Retorna a cor em \`rgb\` e o brilho estelar em \`a\`.
 */
vec4 edenCosmosField(vec3 p, float t) {
  // O campo escorre de baixo para cima, devagar: é o Criador
  // respirando, não um protetor de tela.
  vec3 q = p * 2.6;
  q.y -= t * 0.07;

  // Dobra de domínio: uma oitava só, que é o que separa nuvem de
  // ruído e custa oito picadas em vez de vinte e quatro. É a
  // primeira coisa a cair na máquina fraca.
${rico
  ? `  float warp = edenValue3(q * 0.9 + vec3(0.0, t * 0.04, 0.0));
  float neb = edenFbm3(q + warp * 1.4);`
  : '  float neb = edenFbm3(q);'}

  // Braços de galáxia em torno do eixo do corpo: dão direção ao que
  // senão seria mancha. O termo em \`p.y\` inclina a espiral, para ela
  // não virar um anel de barril na cintura.
  float ang = atan(p.z, p.x);
  float rad = length(p.xz);
  float arms = 0.5 + 0.5 * sin(ang * 2.0 + rad * 9.0 - p.y * 1.6 - t * 0.25);
  arms = arms * arms * arms;

  // Fluxos de energia: cristas finas nas curvas de nível da nebulosa.
  float dobra = abs(fract(neb * 3.0 + t * 0.08) - 0.5) * 3.2;
  float flow = max(0.0, 1.0 - dobra);
  flow = flow * flow * flow * flow;

  // O vazio tem de dominar. Com o limiar baixo a nebulosa cobria o
  // corpo inteiro e o resultado era leitoso — um manto claro, não um
  // céu. O quadrado da máscara abre buracos de espaço profundo entre
  // as nuvens, que é o que faz as estrelas aparecerem.
  float mascara = smoothstep(0.40, 0.78, neb);
  mascara *= mascara;
  vec3 vazio = vec3(0.010, 0.008, 0.038);
  vec3 nebula = mix(vec3(0.16, 0.05, 0.42), vec3(0.62, 0.18, 0.70), smoothstep(0.45, 0.85, neb));
  vec3 cor = mix(vazio, nebula, mascara);
  // Os braços e os fluxos moram **dentro** da nebulosa: soltos no
  // vazio, viravam uma grade azul por cima do corpo todo.
  cor += vec3(0.24, 0.42, 0.85) * arms * mascara * 0.85;
  cor += vec3(0.80, 0.58, 1.00) * flow * (0.25 + 0.75 * mascara) * 0.55;

  // Estrelas: uma por célula, em um décimo das células, com o ponto
  // sorteado dentro dela — senão a estrela é o cubo inteiro.
  vec3 grade = p * 48.0;
  vec3 cel = floor(grade);
  vec3 dentro = fract(grade);
  float semente = edenHash13(cel);
  vec3 centro = vec3(
    edenHash13(cel + vec3(1.7, 0.0, 0.0)),
    edenHash13(cel + vec3(0.0, 3.1, 0.0)),
    edenHash13(cel + vec3(0.0, 0.0, 5.3))
  );
  float d = length(dentro - centro);
  float ponto = max(0.0, 1.0 - d * 2.2);
  ponto = ponto * ponto * ponto * ponto * ponto * ponto;
  float cintila = 0.55 + 0.45 * sin(t * 2.3 + semente * 40.0);
  float estrela = ponto * cintila * step(0.88, semente);
  cor += vec3(0.90, 0.93, 1.00) * estrela * 1.5;

  return vec4(cor, estrela);
}
`;
}

/**
 * O que entra depois de `#include <color_fragment>`.
 *
 * O campo substitui o albedo **só** onde a máscara manda, e o resto
 * do shader segue igual: a emissão, o verniz e a rugosidade do
 * cósmico continuam vindo das tabelas do C2. O brilho das estrelas
 * fica guardado em `edenStarGlow` e é somado na emissão mais abaixo —
 * é a mesma passagem de luz própria que o holograma já usava, sem
 * passe novo e sem material novo.
 */
export const COSMOS_COLOR_FRAGMENT = `vec3 edenStarGlow = vec3( 0.0 );
{
\tfloat edenCosmicAmount = edenCosmosMask( vFinish ) * uCosmos;
\tif ( edenCosmicAmount > 0.0 ) {
\t\tvec4 edenCosmicField = edenCosmosField( vBind, uCosmosTime );
\t\tdiffuseColor.rgb = mix( diffuseColor.rgb, edenCosmicField.rgb, edenCosmicAmount );
\t\tedenStarGlow = vec3( 0.55, 0.60, 0.85 ) * edenCosmicField.a * edenCosmicAmount;
\t}
}`;

/** O termo de estrela somado à emissão que já existia. */
export const COSMOS_EMISSIVE_TERM = ' + edenStarGlow';
