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
export const CITIZEN_HAIR_STYLES = HAIR_STYLES.filter((h) => !AERION_ONLY_HAIR.has(h) && h !== 'cascata' && h !== 'fluxo' && h !== 'onda' && h !== 'cachos' && h !== 'silvestre' && h !== 'fibra' && h !== 'copa' && h !== 'pincelada' && h !== 'nascente');

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
export const CITIZEN_OUTFITS = OUTFITS.filter((o) => !AERION_ONLY_OUTFIT.has(o) && o !== 'aurora' && o !== 'docente' && o !== 'rede' && o !== 'sonora' && o !== 'cosplay' && o !== 'guardia' && o !== 'sistema' && o !== 'jardim' && o !== 'lumen' && o !== 'regaco');
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
export const CITIZEN_ACCESSORIES = ACCESSORIES.filter((a) => a !== 'lentes' && a !== 'atelie' && a !== 'nimbo');

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
export const CREATOR_HAIR_STYLES = HAIR_STYLES.filter((h) => !AERION_ONLY_HAIR.has(h));
export const CREATOR_OUTFITS = OUTFITS.filter((o) => !AERION_ONLY_OUTFIT.has(o));

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
}

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
};

const HEX = /^#[0-9a-f]{6}$/i;

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback;
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
  };
}

export function randomAppearance(rng: Rng): AvatarAppearance {
  return {
    // Fixo de propósito, e não `pick(rng, SEXES)`: sortear aqui gastaria
    // um número do gerador e deslocaria toda a sequência seguinte, o que
    // trocaria o resultado do botão "Aleatório" para quem já o conhece.
    //
    // Quem escolhe o sexo é a pessoa, na tela de criação — não o dado.
    // Enquanto essa tela não oferece a escolha, o botão sorteia dentro
    // do sexo que a ficha já declara, e nunca peça do outro.
    sex: 'fem',
    skin: pick(rng, SKIN_TONES),
    // Sorteia do catálogo **do sexo declarado acima**, e não da lista
    // de habitante inteira. Enquanto só havia peças femininas as duas
    // listas davam no mesmo; agora que o catálogo tem bermuda de banho
    // e topete, sortear da lista cheia devolveria uma avatar marcada
    // `fem` vestindo peça masculina. Continua sendo um `pick` por
    // campo, então a sequência do gerador não anda.
    hairStyle: pick(rng, CITIZEN_HAIR_BY_SEX.fem),
    hairColor: pick(rng, HAIR_COLORS),
    eyeColor: pick(rng, EYE_COLORS),
    outfit: pick(rng, CITIZEN_OUTFITS_BY_SEX.fem),
    topColor: pick(rng, CLOTH_COLORS),
    bottomColor: pick(rng, CLOTH_COLORS),
    shoeColor: pick(rng, CLOTH_COLORS),
    accessory: pick(rng, CITIZEN_ACCESSORIES),
    height: Math.round((0.94 + rng() * 0.12) * 100) / 100,
  };
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
