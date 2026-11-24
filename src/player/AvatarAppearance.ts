import { type Rng, clamp, pick } from '../utils/math';

/**
 * Aparência do avatar (dados puros, salvos junto com o jogo).
 * Novas opções podem ser acrescentadas às listas sem quebrar saves:
 * valores desconhecidos são substituídos pelo padrão em `sanitizeAppearance`.
 */

/**
 * O eixo de sexo do personagem.
 *
 * Mora nesta ficha, e não em `BodyProportions`, por três razões:
 *
 *  · esta ficha **já** é salva e `sanitizeAppearance` **já** cai no padrão
 *    campo a campo, então um save antigo abre sem o campo e vira `'fem'`
 *    sem precisar de `SAVE_VERSION` novo;
 *  · `BodyProportions` é numérica e tem `mixProportions`, que interpola
 *    dois corpos — e não se interpola um sexo pela metade;
 *  · deixar o módulo de proporções intocado preserva
 *    `proportionsFingerprint`, que é a prova de que o panteão não mudou.
 *
 * Quem lê este campo hoje (etapa 2): `makeCitizen`, para sortear peças
 * do catálogo certo e derivar o sexo do nome; `rollCitizenAfters`, que
 * não aplica silhueta Afters a personagem masculino; e
 * `CITIZEN_*_BY_SEX`, que parte os catálogos em dois.
 *
 * Quem **ainda não** lê: a malha, o rosto e o esqueleto. O corpo de um
 * personagem masculino continua sendo o mesmo corpo de sempre, com
 * penteado e roupa próprios por cima — a silhueta é a etapa seguinte.
 * O padrão é `'fem'`, que é o único corpo que o Éden teve até aqui.
 */
export const SEXES = ['fem', 'masc'] as const;
export type Sex = (typeof SEXES)[number];
export const SEX_LABELS: Record<Sex, string> = {
  fem: 'Feminino',
  masc: 'Masculino',
};

/**
 * As peças que são de um personagem só.
 *
 * O Éden já separava peça de deusa de peça de passante, e fazia isso
 * com três filtros espalhados por três listas. O problema de
 * espalhar é que cada peça nova precisa ser lembrada em cada lista, e
 * esquecer uma não quebra nada: só faz a peça aparecer na praça, que
 * é justamente o erro que ninguém vê em teste.
 *
 * Estas duas listas são a declaração única. Tudo o que sai de sorteio
 * deriva delas, e o teste de exclusividade lê daqui — então uma peça
 * exclusiva futura entra num lugar só e fica protegida nos três.
 *
 * A diferença entre estas peças e as de deusa é que as de deusa ainda
 * podem ser escolhidas **pelo jogador** no criador de avatar, que é
 * como sempre foi: quem quiser se vestir de Luma, que se vista. Estas
 * não aparecem nem lá. `criador` é o corpo do Aérion, não uma roupa;
 * e `cosmos` é o cabelo que o acompanha.
 */
export const AERION_ONLY_HAIR: ReadonlySet<string> = new Set(['cosmos']);
export const AERION_ONLY_OUTFIT: ReadonlySet<string> = new Set(['criador']);

/**
 * As peças das dez deusas.
 *
 * Existiam antes, mas espalhadas: eram cadeias de `!==` dentro dos
 * `.filter()` logo abaixo, uma por lista. Reuni-las aqui não muda o
 * que a cidade sorteia — é a mesma seleção, provada igual peça a peça
 * — e passa a permitir que **o criador de avatar** leia a mesma
 * declaração, em vez de oferecer ao jogador o que a praça recusa.
 *
 * Esta é a mudança de regra da Fase 1.1. Até aqui, peça de deusa saía
 * do sorteio mas continuava escolhível por quem criava o personagem
 * ("quem quiser se vestir de Luma, que se vista"). Agora não: o que é
 * de uma é dela. Um jogador que **já** esteja usando uma destas peças
 * não a perde — ver `catalogWithLegacy`.
 */
export const GODDESS_ONLY_HAIR: ReadonlySet<string> = new Set([
  'cascata', 'fluxo', 'onda', 'cachos', 'silvestre', 'fibra', 'copa', 'pincelada', 'nascente',
]);
export const GODDESS_ONLY_OUTFIT: ReadonlySet<string> = new Set([
  'aurora', 'docente', 'rede', 'sonora', 'cosplay', 'guardia', 'sistema', 'jardim', 'lumen', 'regaco',
]);
export const GODDESS_ONLY_ACCESSORY: ReadonlySet<string> = new Set(['lentes', 'atelie', 'nimbo']);

export const HAIR_STYLES = [
  // Os que já existiam. Nenhum saiu, nenhum mudou de nome.
  'curto',
  'longo',
  'ondulado',
  'cascata',
  'fluxo',
  'onda',
  'rabo',
  'coque',
  'cacheado',
  'cachos',
  'silvestre',
  'fibra',
  'copa',
  'pincelada',
  'nascente',
  'espetado',
  'careca',
  // Seis penteados masculinos, desenhados para este catálogo e não
  // adaptados de nada: o Éden só tinha oito cortes para a cidade
  // inteira, e três deles serviam a um homem.
  'social',
  'topete',
  'raspado',
  'samurai',
  'crespo',
  'franjado',
  // Três femininos genéricos. Os nove penteados fundos que havia eram
  // todos de deusa e saem do sorteio: sem estes, consertar o
  // vazamento deixaria a praça com seis opções femininas.
  'chanel',
  'tranca',
  'chiquinhas',
  // Exclusivo do Aérion. Não entra em sorteio nenhum nem no criador
  // de avatar do jogador — ver `AERION_ONLY_HAIR`, logo abaixo.
  // ---------------------------------------------------------------
  // Fase 1.1 — a reposição.
  //
  // Tirar as nove peças do Panteão do catálogo comum deixou o acervo
  // feminino com onze cabelos onde antes a tela mostrava vinte. A
  // conta de devolver é esta: nove cortes novos, nenhum deles com
  // dono, seis só dela e três para os dois. O catálogo dela volta a
  // vinte — e agora os vinte são mesmo dela.
  // ---------------------------------------------------------------
  'pixie',
  'rabolateral',
  'coques',
  'ondas',
  'meiopreso',
  'franjao',
  'repicado',
  'trancinhas',
  'moicano',
  'cosmos',
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HAIR_LABELS: Record<HairStyle, string> = {
  cosmos: 'Cosmos',
  curto: 'Curto',
  longo: 'Longo',
  ondulado: 'Longo ondulado',
  cascata: 'Cascata',
  fluxo: 'Fluxo',
  onda: 'Onda',
  rabo: 'Rabo de cavalo',
  coque: 'Coque',
  cacheado: 'Cacheado',
  cachos: 'Cachos',
  silvestre: 'Silvestre',
  fibra: 'Fibra Óptica',
  copa: 'Copa de Árvore',
  pincelada: 'Pincelada',
  nascente: 'Nascente',
  espetado: 'Espetado',
  careca: 'Sem cabelo',
  social: 'Social',
  topete: 'Topete',
  raspado: 'Raspado',
  samurai: 'Coque samurai',
  crespo: 'Crespo',
  franjado: 'Franjado',
  chanel: 'Chanel',
  tranca: 'Trança',
  chiquinhas: 'Maria-chiquinha',
  pixie: 'Pixie',
  rabolateral: 'Rabo lateral',
  coques: 'Coques duplos',
  ondas: 'Ondas longas',
  meiopreso: 'Meio preso',
  franjao: 'Franjão',
  repicado: 'Repicado',
  trancinhas: 'Trancinhas',
  moicano: 'Moicano',
};

/**
 * O que um habitante qualquer pode ter na cabeça.
 *
 * A Cascata não é só um cabelo comprido: ela traz o diadema da
 * Suki-Chan junto, porque a ficha tem um campo de acessório só e o
 * dela está ocupado pelos óculos. Sorteá-la para a praça poria
 * coroa em meia dúzia de passantes.
 *
 * O Fluxo é da Nexara pela mesma razão, e por uma a mais: ele carrega
 * os dois anéis de rede que orbitam a cabeça dela. Um habitante
 * qualquer com anéis orbitais não é um habitante com um penteado
 * bonito, é outra deusa.
 *
 * A Onda é da Lilly, e carrega os fones de frequência dela. O
 * acessório `fones` comum continua no sorteio e continua sendo o
 * mesmo de sempre — o que sai do sorteio é o par de vidro que acende,
 * que é peça de deusa.
 *
 * A Nascente é da Amara. É a queda mais longa do catálogo — desce
 * até a altura do quadril — e carrega o degradê de ponta dela. Num
 * habitante sorteado seria a Deusa da Maternidade passeando duplicada
 * pela praça.
 */
export const CITIZEN_HAIR_STYLES = HAIR_STYLES.filter((h) => !AERION_ONLY_HAIR.has(h) && !GODDESS_ONLY_HAIR.has(h));

export const OUTFITS = [
  'casual',
  'aero',
  'vestido',
  'esportivo',
  'praia',
  'aurora',
  'docente',
  'rede',
  'sonora',
  'cosplay',
  'guardia',
  'sistema',
  'jardim',
  'lumen',
  'regaco',
  // Os quatro trajes masculinos. Cada um é uma silhueta diferente, e
  // não a mesma roupa em quatro cores: manga curta com perna curta,
  // ombro nu com perna comprida, capuz com tudo coberto, e tronco nu.
  'camiseta',
  'regata',
  'moletom',
  'banho',
  // ---------------------------------------------------------------
  // Fase 1.1 — a reposição.
  //
  // Dez das quinze roupas que a tela feminina mostrava eram trajes de
  // deusa. Tirando-as sobravam cinco. Estas cinco são cortes que o
  // motor sabia desenhar mas que ninguém tinha pedido juntos: saia
  // com manga curta, túnica longa de manga comprida, macacão comum,
  // peça inteira de banho e manga comprida com bermuda. Duas são só
  // dela, três servem aos dois, e os dois catálogos fecham em dez.
  // ---------------------------------------------------------------
  'saia',
  'maio',
  'tunica',
  'macacao',
  'jaqueta',
  // Exclusivo do Aérion, pelo mesmo motivo e com as mesmas três
  // barreiras — ver `AERION_ONLY_OUTFIT`.
  'criador',
] as const;
export type Outfit = (typeof OUTFITS)[number];
/**
 * O que um habitante qualquer pode vestir.
 *
 * O Manto Aurora é de vidro líquido e existe para uma pessoa só: se
 * entrasse no sorteio, cinquenta e quatro habitantes apareceriam de
 * traje divino na praça — e o que é de uma deixaria de ser dela.
 *
 * O Vestido Docente é da Suki-Chan pela mesma razão, e o Traje Rede
 * da Nexara pela mesma razão outra vez — este com um véu que acende
 * sozinho, o que o torna ainda mais difícil de confundir com roupa
 * de passante.
 *
 * O Traje Sonora da Lilly fecha a lista: ele traz um equalizador
 * aceso em volta do quadril, e nada do que um habitante veste faz
 * barulho de luz.
 *
 * O Manto Regaço é da Amara, e sai do sorteio por um motivo a mais
 * que os outros: ele é desenhado para um corpo **gestante**. As abas
 * da frente contornam um ventre que, num habitante qualquer, não
 * existe — e pano que contorna o que não está lá fica solto no ar.
 */
export const CITIZEN_OUTFITS = OUTFITS.filter((o) => !AERION_ONLY_OUTFIT.has(o) && !GODDESS_ONLY_OUTFIT.has(o));
export const OUTFIT_LABELS: Record<Outfit, string> = {
  criador: 'Criador',
  casual: 'Casual',
  aero: 'Traje Aero',
  vestido: 'Vestido',
  esportivo: 'Esportivo',
  praia: 'Praia',
  aurora: 'Manto Aurora',
  docente: 'Vestido Docente',
  rede: 'Traje Rede',
  sonora: 'Traje Sonora',
  cosplay: 'Traje Cosplay',
  guardia: 'Traje Guardiã',
  sistema: 'Traje EdenOS',
  jardim: 'Traje Jardim',
  lumen: 'Traje Lumen',
  regaco: 'Manto Regaço',
  camiseta: 'Camiseta',
  regata: 'Regata',
  moletom: 'Moletom',
  banho: 'Bermuda de banho',
  saia: 'Saia e blusa',
  maio: 'Maiô',
  tunica: 'Túnica',
  macacao: 'Macacão',
  jaqueta: 'Jaqueta',
};

export const ACCESSORIES = ['nenhum', 'oculos', 'fones', 'chapeu', 'flor', 'cristal', 'aureola', 'lentes', 'atelie', 'nimbo'] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export const ACCESSORY_LABELS: Record<Accessory, string> = {
  nenhum: 'Nenhum',
  oculos: 'Óculos',
  fones: 'Fones',
  chapeu: 'Chapéu',
  flor: 'Flor',
  cristal: 'Brincos de cristal',
  aureola: 'Auréola',
  lentes: 'Óculos de lente de vidro',
  atelie: 'Ouro do Ateliê',
  nimbo: 'Nimbo Materno',
};

/**
 * O que um habitante qualquer pode usar no rosto.
 *
 * As lentes de vidro são as da Suki-Chan. O acessório `oculos`
 * comum continua inteiro e disponível para todo mundo — a lente
 * vazada é dela, e mexer no acessório compartilhado mudaria o rosto
 * de quem nunca pediu.
 *
 * O Nimbo Materno é da Amara. A auréola comum (`aureola`) continua no
 * sorteio e continua a mesma: o que sai é o nimbo de luz própria, que
 * é insígnia de divindade e não enfeite de passante.
 */
export const CITIZEN_ACCESSORIES = ACCESSORIES.filter((a) => !GODDESS_ONLY_ACCESSORY.has(a));

/* -------------------------------------------------------------------------- */
/* Separação por sexo                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A quem cada peça serve.
 *
 * É um `Record`, e não uma lista, de propósito: acrescentar um penteado
 * sem dizer a quem ele serve passa a ser **erro de compilação**. Era
 * assim que o catálogo deveria ter crescido desde o começo.
 *
 * `'ambos'` não é indecisão — é a afirmação de que a peça não carrega
 * leitura de gênero nenhuma. Cabelo curto é cabelo curto.
 *
 * Nada do que era feminino deixou de ser: toda peça que a cidade já
 * sorteava para uma habitante continua marcada `'fem'` ou `'ambos'`.
 */
export type SexAudience = Sex | 'ambos';

export const HAIR_AUDIENCE: Readonly<Record<HairStyle, SexAudience>> = {
  curto: 'ambos',
  longo: 'fem',
  ondulado: 'fem',
  cascata: 'fem',
  fluxo: 'fem',
  onda: 'fem',
  rabo: 'fem',
  coque: 'fem',
  cacheado: 'ambos',
  cachos: 'fem',
  silvestre: 'fem',
  fibra: 'fem',
  copa: 'fem',
  pincelada: 'fem',
  nascente: 'fem',
  espetado: 'ambos',
  careca: 'ambos',
  social: 'masc',
  topete: 'masc',
  raspado: 'masc',
  samurai: 'masc',
  crespo: 'masc',
  franjado: 'masc',
  chanel: 'fem',
  tranca: 'fem',
  chiquinhas: 'fem',
  pixie: 'fem',
  rabolateral: 'fem',
  coques: 'fem',
  ondas: 'fem',
  meiopreso: 'fem',
  franjao: 'fem',
  repicado: 'ambos',
  trancinhas: 'ambos',
  moicano: 'ambos',
  cosmos: 'masc',
};

export const OUTFIT_AUDIENCE: Readonly<Record<Outfit, SexAudience>> = {
  casual: 'ambos',
  aero: 'ambos',
  esportivo: 'ambos',
  vestido: 'fem',
  praia: 'fem',
  aurora: 'fem',
  docente: 'fem',
  rede: 'fem',
  sonora: 'fem',
  cosplay: 'fem',
  guardia: 'fem',
  sistema: 'fem',
  jardim: 'fem',
  lumen: 'fem',
  regaco: 'fem',
  camiseta: 'masc',
  regata: 'masc',
  moletom: 'masc',
  banho: 'masc',
  saia: 'fem',
  maio: 'fem',
  tunica: 'ambos',
  macacao: 'ambos',
  jaqueta: 'ambos',
  criador: 'masc',
};

function forSex<T extends string>(list: readonly T[], audience: Readonly<Record<T, SexAudience>>, sex: Sex): readonly T[] {
  return list.filter((item) => audience[item] === sex || audience[item] === 'ambos');
}

/**
 * O que a cidade pode sortear, por sexo.
 *
 * Duas camadas de filtro, nesta ordem: primeiro sai o que é de deusa
 * (`CITIZEN_*`), depois sai o que é do outro sexo. A primeira camada é
 * a que faltava ser respeitada — as listas existiam e ninguém as lia.
 */
export const CITIZEN_HAIR_BY_SEX: Readonly<Record<Sex, readonly HairStyle[]>> = {
  fem: forSex(CITIZEN_HAIR_STYLES, HAIR_AUDIENCE, 'fem'),
  masc: forSex(CITIZEN_HAIR_STYLES, HAIR_AUDIENCE, 'masc'),
};

export const CITIZEN_OUTFITS_BY_SEX: Readonly<Record<Sex, readonly Outfit[]>> = {
  fem: forSex(CITIZEN_OUTFITS, OUTFIT_AUDIENCE, 'fem'),
  masc: forSex(CITIZEN_OUTFITS, OUTFIT_AUDIENCE, 'masc'),
};

/**
 * O que o criador de avatar oferece ao jogador.
 *
 * É o catálogo inteiro **menos** as peças exclusivas do Aérion. Tudo
 * o mais continua exatamente como estava, inclusive as peças de
 * deusa: esta lista não é uma restrição nova, é a mesma de antes com
 * duas peças que nunca foram de ninguém mais fora dela.
 */
export const CREATOR_HAIR_STYLES = CITIZEN_HAIR_STYLES;
export const CREATOR_OUTFITS = CITIZEN_OUTFITS;

/**
 * O que o criador oferece, já separado por quem se está criando.
 *
 * Não é uma lista nova de peças: é exatamente o catálogo de habitante,
 * partido pelo público de cada peça. A igualdade é proposital e vale
 * como regra — **o jogador é um cidadão do Éden**, e o que ele pode
 * vestir é o que qualquer pessoa da praça pode vestir. Peça de deusa
 * não entra em nenhum dos dois; peça do Aérion, menos ainda.
 *
 * A separação é de **catálogo**, não de visual: esconder a peça na
 * tela e deixá-la selecionável por dentro seria o mesmo vazamento da
 * Etapa 1 com outra roupa. Quem valida uma escolha lê daqui.
 */
export const CREATOR_HAIR_BY_SEX: Readonly<Record<Sex, readonly HairStyle[]>> = CITIZEN_HAIR_BY_SEX;
export const CREATOR_OUTFITS_BY_SEX: Readonly<Record<Sex, readonly Outfit[]>> = CITIZEN_OUTFITS_BY_SEX;

/**
 * Acessórios do criador.
 *
 * Não há eixo de sexo aqui, e isso é uma afirmação, não um esquecimento:
 * óculos, fones, chapéu, flor, brincos e auréola não carregam leitura de
 * gênero nenhuma. O que sai são os três de deusa — as lentes da Suki, o
 * ouro do Ateliê da Júpiter e o Nimbo da Amara.
 */
export const CREATOR_ACCESSORIES = CITIZEN_ACCESSORIES;

/**
 * O catálogo a mostrar para quem **já** está usando uma peça que saiu dele.
 *
 * Um jogador que criou a personagem antes desta fase pode estar vestindo
 * o Manto Aurora. A peça continua válida — `OUTFITS` não encolheu, e
 * `sanitizeAppearance` continua aceitando — então o avatar dele abre
 * exatamente como estava. O que não pode acontecer é ele abrir o ateliê,
 * não ver a própria roupa na lista, trocar qualquer outra coisa e
 * descobrir que a roupa sumiu.
 *
 * Então a peça em uso entra no fim da lista, marcada como herança. Se
 * ele trocar, não volta: o catálogo é o catálogo.
 */
export function catalogWithLegacy<T extends string>(catalog: readonly T[], current: T): readonly T[] {
  return catalog.includes(current) ? catalog : [...catalog, current];
}

/**
 * A mesma pessoa, agora do outro lado do catálogo.
 *
 * Trocar de Ele para Ela no meio da criação não pode deixar um
 * penteado masculino numa ficha feminina. Esconder a peça na tela e
 * manter o valor na ficha seria o vazamento da Etapa 1 outra vez,
 * só que por dentro: a regra do item 3 da Fase 1.1 é explícita —
 * a separação acontece **também na lógica de seleção**.
 *
 * Então cada peça é conferida contra o catálogo do novo sexo, e a
 * incompatível cai na primeira opção dele. O que serve aos dois
 * (`'ambos'`) não se mexe: quem escolheu cabelo curto continua de
 * cabelo curto, porque cabelo curto é cabelo curto.
 *
 * Cor, altura e rosto nunca mudam: não têm sexo.
 */
export function coerceAppearanceToSex(appearance: AvatarAppearance, sex: Sex): AvatarAppearance {
  const cabelos = CREATOR_HAIR_BY_SEX[sex];
  const roupas = CREATOR_OUTFITS_BY_SEX[sex];
  return {
    ...appearance,
    sex,
    hairStyle: cabelos.includes(appearance.hairStyle) ? appearance.hairStyle : cabelos[0],
    outfit: roupas.includes(appearance.outfit) ? appearance.outfit : roupas[0],
    accessory: CREATOR_ACCESSORIES.includes(appearance.accessory) ? appearance.accessory : 'nenhum',
  };
}

/** Se a peça em uso é herança de um visual anterior a esta fase. */
export function isLegacyPiece<T extends string>(catalog: readonly T[], current: T): boolean {
  return !catalog.includes(current);
}

export const SKIN_TONES = ['#ffe0c8', '#f6c9a4', '#e8ab82', '#cf8f63', '#a96c45', '#7d4a2c', '#5a3320', '#f3d2c1'] as const;
export const HAIR_COLORS = ['#2b1d16', '#5a3a22', '#8a5a2b', '#d9a441', '#f3e3a6', '#c0392b', '#ff8fc0', '#7fd6ff', '#9a7bff', '#a855f7', '#f4f6fb'] as const;
export const EYE_COLORS = ['#3b2a20', '#2f6fb3', '#2f9a66', '#7a5cc9', '#1f1f24', '#c98a2b'] as const;
export const CLOTH_COLORS = [
  '#ffffff',
  '#29c8ff',
  '#1b82ea',
  '#24e08a',
  '#7ddc5a',
  '#ffd84a',
  '#ff9f43',
  '#ff6f91',
  '#c9a2ff',
  '#7a5cc9',
  '#2e3a4f',
  '#f3ead6',
] as const;

export interface AvatarAppearance {
  /** Sexo do personagem. Ver `SEXES`: padrão `'fem'`. Escolhe catálogo de peças e corta os Afters; ainda não muda a silhueta. */
  sex: Sex;
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeColor: string;
  outfit: Outfit;
  topColor: string;
  bottomColor: string;
  shoeColor: string;
  accessory: Accessory;
  /** Escala de altura (0,9–1,1). */
  height: number;
  /**
   * Os quatro eixos de rosto. Ver `faceDimsFor` em `BodyRig.ts`.
   *
   * São multiplicadores e **nascem todos em 1**: uma ficha que não os
   * declara — todo save anterior a esta fase — produz exatamente o
   * rosto de antes, sem migração e sem `SAVE_VERSION` nova.
   */
  /** Tamanho dos olhos (0,85–1,15). */
  faceEye: number;
  /** Afastamento entre os olhos (0,9–1,1). */
  faceEyeGap: number;
  /** Altura das sobrancelhas (0,8–1,2). */
  faceBrow: number;
  /** Largura da boca (0,85–1,15). */
  faceMouth: number;
}

/** Limites de cada eixo de rosto: mínimo, máximo e o neutro. */
export const FACE_RANGE = Object.freeze({
  faceEye: { min: 0.85, max: 1.15 },
  faceEyeGap: { min: 0.9, max: 1.1 },
  faceBrow: { min: 0.8, max: 1.2 },
  faceMouth: { min: 0.85, max: 1.15 },
} as const);
export type FaceAxis = keyof typeof FACE_RANGE;
export const FACE_AXES = Object.keys(FACE_RANGE) as readonly FaceAxis[];
export const FACE_AXIS_LABELS: Record<FaceAxis, string> = {
  faceEye: 'Tamanho dos olhos',
  faceEyeGap: 'Distância entre os olhos',
  faceBrow: 'Altura das sobrancelhas',
  faceMouth: 'Largura da boca',
};

export const DEFAULT_APPEARANCE: AvatarAppearance = {
  sex: 'fem',
  skin: SKIN_TONES[1],
  hairStyle: 'curto',
  hairColor: HAIR_COLORS[1],
  eyeColor: EYE_COLORS[1],
  outfit: 'aero',
  topColor: CLOTH_COLORS[0],
  bottomColor: CLOTH_COLORS[1],
  shoeColor: CLOTH_COLORS[0],
  accessory: 'nenhum',
  height: 1,
  faceEye: 1,
  faceEyeGap: 1,
  faceBrow: 1,
  faceMouth: 1,
};

const HEX = /^#[0-9a-f]{6}$/i;

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback;
}

function axis(value: unknown, name: FaceAxis): number {
  const { min, max } = FACE_RANGE[name];
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : 1;
}

function option<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Valida dados vindos do armazenamento local (ou de qualquer fonte externa). */
export function sanitizeAppearance(raw: unknown): AvatarAppearance {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_APPEARANCE;
  const height = typeof src.height === 'number' && Number.isFinite(src.height) ? clamp(src.height, 0.9, 1.1) : d.height;
  return {
    // Ausente, nulo, número, maiúsculo ou qualquer palavra fora da lista
    // caem em `'fem'` — é o mesmo tratamento que as outras opções já
    // recebiam, e é o que faz um save de v1 abrir sem saber que este
    // campo passou a existir.
    sex: option(src.sex, SEXES, d.sex),
    skin: color(src.skin, d.skin),
    hairStyle: option(src.hairStyle, HAIR_STYLES, d.hairStyle),
    hairColor: color(src.hairColor, d.hairColor),
    eyeColor: color(src.eyeColor, d.eyeColor),
    outfit: option(src.outfit, OUTFITS, d.outfit),
    topColor: color(src.topColor, d.topColor),
    bottomColor: color(src.bottomColor, d.bottomColor),
    shoeColor: color(src.shoeColor, d.shoeColor),
    accessory: option(src.accessory, ACCESSORIES, d.accessory),
    height,
    // Ausente em todo save anterior a esta fase: cai em 1, que é o
    // rosto que a pessoa já tinha. Fora da faixa, é preso na faixa.
    faceEye: axis(src.faceEye, 'faceEye'),
    faceEyeGap: axis(src.faceEyeGap, 'faceEyeGap'),
    faceBrow: axis(src.faceBrow, 'faceBrow'),
    faceMouth: axis(src.faceMouth, 'faceMouth'),
  };
}

export function randomAppearance(rng: Rng, sex: Sex = 'fem'): AvatarAppearance {
  return {
    // Nunca sorteado, sempre recebido. Quem escolhe Ele ou Ela é a
    // pessoa, na primeira tela do criador — o dado não opina sobre
    // isso. Sortear aqui também gastaria um número do gerador e
    // deslocaria toda a sequência seguinte, trocando o resultado do
    // botão "Aleatório" para quem já o conhece.
    //
    // O padrão continua `'fem'` para que toda chamada antiga de uma
    // só linha siga devolvendo exatamente o que devolvia.
    sex,
    skin: pick(rng, SKIN_TONES),
    // Sorteia do catálogo **do sexo declarado acima**, e não da lista
    // de habitante inteira. Enquanto só havia peças femininas as duas
    // listas davam no mesmo; agora que o catálogo tem bermuda de banho
    // e topete, sortear da lista cheia devolveria uma avatar marcada
    // `fem` vestindo peça masculina. Continua sendo um `pick` por
    // campo, então a sequência do gerador não anda.
    hairStyle: pick(rng, CITIZEN_HAIR_BY_SEX[sex]),
    hairColor: pick(rng, HAIR_COLORS),
    eyeColor: pick(rng, EYE_COLORS),
    outfit: pick(rng, CITIZEN_OUTFITS_BY_SEX[sex]),
    topColor: pick(rng, CLOTH_COLORS),
    bottomColor: pick(rng, CLOTH_COLORS),
    shoeColor: pick(rng, CLOTH_COLORS),
    accessory: pick(rng, CITIZEN_ACCESSORIES),
    height: Math.round((0.94 + rng() * 0.12) * 100) / 100,
    // Os eixos de rosto são sorteados **depois** da altura, de
    // propósito: assim nenhum `pick` anterior muda de posição na
    // sequência do gerador, e o botão continua devolvendo pele, cabelo
    // e roupa exatamente iguais aos de antes desta fase. O que entra é
    // só o rosto, que antes não existia.
    //
    // A faixa sorteada é mais estreita que a faixa que a pessoa pode
    // escolher à mão: o dado dá um rosto diferente, não um rosto
    // esquisito.
    faceEye: rollAxis(rng, 'faceEye', 0.7),
    faceEyeGap: rollAxis(rng, 'faceEyeGap', 0.7),
    faceBrow: rollAxis(rng, 'faceBrow', 0.7),
    faceMouth: rollAxis(rng, 'faceMouth', 0.7),
  };
}

/** Sorteia um eixo de rosto dentro de uma fração da faixa permitida. */
function rollAxis(rng: Rng, name: FaceAxis, span: number): number {
  const { min, max } = FACE_RANGE[name];
  const meio = (min + max) / 2;
  const raio = ((max - min) / 2) * span;
  return Math.round((meio + (rng() * 2 - 1) * raio) * 100) / 100;
}

/** Limpa um nome de jogador: sem caracteres de controle, espaços normalizados, até 20 caracteres. */
export function sanitizePlayerName(raw: unknown, fallback = 'Viajante'): string {
  if (typeof raw !== 'string') return fallback;
  // Espaços primeiro: quebras de linha e tabulações viram um espaço em vez de sumirem.
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 20)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}
