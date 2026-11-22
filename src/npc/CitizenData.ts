import {
  AFTERS_PRESETS,
  type AftersBody,
  applyPreset,
  defaultAftersBody,
  fromPercent,
  getAftersPreset,
  toPercent,
} from '../afters/AftersState';
import type { Accessory, AvatarAppearance, HairStyle, Outfit } from '../player/AvatarAppearance';
import {
  CITIZEN_ACCESSORIES,
  CITIZEN_HAIR_BY_SEX,
  HAIR_AUDIENCE,
  CLOTH_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  SKIN_TONES,
  type Sex,
} from '../player/AvatarAppearance';
import { createRng, pick, randInt, type Rng } from '../utils/math';
import type { DayPeriod } from '../world/WorldClock';

/**
 * Cidadãos de Aurora City: nomes, arquétipos, aparências e falas.
 *
 * Tudo é gerado a partir de uma semente, de forma determinística: o
 * mesmo cidadão sempre tem o mesmo nome, a mesma roupa e a mesma rotina.
 * Módulo puro (sem DOM e sem Three.js).
 */

export interface CitizenArchetype {
  id: string;
  /** Profissão/ocupação mostrada ao conversar. */
  label: string;
  /** Áreas preferidas por período do dia (ids de `AREAS`). */
  routine: Record<DayPeriod, readonly string[]>;
  /** Trajes do arquétipo para habitantes femininas. */
  outfits: readonly Outfit[];
  /**
   * Trajes do arquétipo para habitantes masculinos.
   *
   * Lista própria, e não um mapeamento automático do de cima: uma
   * jardineira de vestido não vira um jardineiro de vestido, e a
   * tradução certa depende da ocupação — o navegante ganha bermuda
   * de banho, o músico ganha moletom, e a atleta e o atleta
   * continuam os dois de esportivo.
   */
  outfitsMasc: readonly Outfit[];
  accessories: readonly Accessory[];
  /** Cores preferidas da parte de cima da roupa. */
  palette: readonly string[];
  /** Faixa de velocidade de caminhada (m/s). */
  speed: readonly [number, number];
  /** Falas típicas do arquétipo. */
  lines: readonly string[];
  /**
   * Perfil Afters do arquétipo.
   *
   * A tecnologia é de uso comum em Aurora City, mas não é uniforme: cada
   * ocupação tem a sua relação com ela. Isto é o que faz a multidão parecer
   * uma cidade, e não um desfile.
   */
  afters: AftersTaste;
}

/** Gosto de um arquétipo pela linha Afters. */
export interface AftersTaste {
  /** Chance (0–1) de um habitante deste arquétipo usar a tecnologia. */
  chance: number;
  /** Presets preferidos (ids de `AFTERS_PRESETS`). */
  presets: readonly string[];
  /** `true` quando o arquétipo sobe a intensidade na noite da cidade. */
  night: boolean;
}


/** Todas as áreas públicas: rotina padrão de quem não tem destino fixo. */
const DAY_ALL: readonly string[] = ['centro', 'praca', 'parque', 'orla', 'jardins', 'cristal', 'nuvens', 'mirante', 'pier', 'palco'];

/** Atalho: a mesma lista de áreas nos quatro períodos do dia. */
function always(areas: readonly string[]): Record<DayPeriod, readonly string[]> {
  return { madrugada: areas, manhã: areas, tarde: areas, noite: areas };
}

/**
 * Dez arquétipos de habitante. Cada um tem rotina, roupa e assunto próprios,
 * para que a multidão de Aurora City não pareça feita de cópias.
 */
export const CITIZEN_ARCHETYPES: readonly CitizenArchetype[] = [
  {
    id: 'jardineiro',
    label: 'Jardinagem do Parque Aurora',
    routine: {
      madrugada: ['parque', 'jardins'],
      manhã: ['parque', 'jardins', 'praca'],
      tarde: ['parque', 'jardins'],
      noite: ['praca', 'centro'],
    },
    outfits: ['casual', 'esportivo'],
    outfitsMasc: ['camiseta', 'regata', 'esportivo'],
    accessories: ['nenhum', 'oculos', 'chapeu'],
    palette: ['#4fd6a8', '#7fe3c0', '#2fa37a', '#bdf3dd'],
    speed: [1.0, 1.4],
    lines: [
      'As bromélias de cristal abrem sozinhas quando o sol bate na água. Repare na próxima vez.',
      'Rego o jardim de madrugada. A planta gosta, e eu também.',
      'Essa cidade é um jardim que aprendeu a ter ruas.',
    ],
    afters: { chance: 0.16, presets: ['suave'], night: false },
  },
  {
    id: 'estudante',
    label: 'Estudante da Estufa Celeste',
    routine: {
      madrugada: ['nuvens', 'centro'],
      manhã: ['centro', 'praca', 'cristal'],
      tarde: ['parque', 'praca', 'orla'],
      noite: ['praca', 'palco', 'centro'],
    },
    outfits: ['casual', 'esportivo', 'vestido'],
    outfitsMasc: ['camiseta', 'casual', 'regata'],
    accessories: ['oculos', 'nenhum', 'fones'],
    palette: ['#8fd4ff', '#b7a8ff', '#ffd3ef', '#9ff2ff'],
    speed: [1.3, 1.9],
    lines: [
      'A Suki-Chan passou um trabalho sobre bioluminescência. Vim ver de perto.',
      'Dizem que a Estufa Celeste tem uma planta que só floresce de madrugada. Ainda não vi.',
      'Estou atrasado(a) para a aula, mas valeu a pena esse caminho.',
    ],
    afters: { chance: 0.3, presets: ['suave', 'aurora'], night: true },
  },
  {
    id: 'musico',
    label: 'Música de rua',
    routine: {
      madrugada: ['palco', 'orla'],
      manhã: ['praca', 'orla'],
      tarde: ['palco', 'praca', 'pier'],
      noite: ['palco', 'praca', 'orla'],
    },
    outfits: ['vestido', 'casual', 'aero'],
    outfitsMasc: ['moletom', 'casual', 'aero'],
    accessories: ['fones', 'nenhum', 'oculos'],
    palette: ['#ff9ecb', '#ffb37a', '#c6a1ff', '#7fe6ff'],
    speed: [1.1, 1.5],
    lines: [
      'Quando a Lilly sobe no Palco Aurora, a cidade inteira vira caixa de som.',
      'Toco no fim da tarde, quando o reflexo da água entra no tom certo.',
      'Se ouvir um acorde vindo da orla, provavelmente sou eu.',
    ],
    afters: { chance: 0.55, presets: ['aurora', 'palco'], night: true },
  },
  {
    id: 'tecnica',
    label: 'Manutenção do EdenOS',
    routine: {
      madrugada: ['centro', 'cristal'],
      manhã: ['centro', 'cristal', 'praca'],
      tarde: ['cristal', 'centro', 'mirante'],
      noite: ['centro', 'cristal'],
    },
    outfits: ['aero', 'casual'],
    outfitsMasc: ['aero', 'camiseta'],
    accessories: ['oculos', 'fones', 'nenhum'],
    palette: ['#7fd6ff', '#aef0ff', '#9ab6ff', '#d7e9ff'],
    speed: [1.4, 1.9],
    lines: [
      'Atualização do EdenOS saiu hoje. A Haru assina o registro de mudanças, sempre com um print("Hello Eden").',
      'Depois do BlueBloom, a gente testa tudo duas vezes. Deu certo: a cura chegou a cem por cento.',
      'Se o seu EdenPhone travar, é só desligar e ligar. Vale até para deuses.',
    ],
    afters: { chance: 0.2, presets: ['suave'], night: false },
  },
  {
    id: 'comerciante',
    label: 'Comércio do Mercado Éden',
    routine: {
      madrugada: ['centro'],
      manhã: ['centro', 'praca'],
      tarde: ['centro', 'praca', 'orla'],
      noite: ['praca', 'centro', 'palco'],
    },
    outfits: ['vestido', 'casual', 'aero'],
    outfitsMasc: ['camiseta', 'casual', 'aero'],
    accessories: ['nenhum', 'chapeu', 'oculos'],
    palette: ['#ffc98f', '#ffe0a3', '#ff9ea8', '#ffd84a'],
    speed: [1.1, 1.6],
    lines: [
      'Chegou fruta de vidro do Jardim Proibido. Doce, e brilha no escuro.',
      'A Akemi-Chan encomendou trinta caixas de mangá para a próxima convenção.',
      'Se procura lembrancinha de Aurora, é na banca da esquina.',
    ],
    afters: { chance: 0.3, presets: ['suave', 'aurora'], night: false },
  },
  {
    id: 'atleta',
    label: 'Corrida matinal',
    routine: {
      madrugada: ['orla', 'parque'],
      manhã: ['orla', 'parque', 'pier'],
      tarde: ['parque', 'orla'],
      noite: ['orla', 'praca'],
    },
    outfits: ['esportivo'],
    outfitsMasc: ['esportivo', 'regata', 'banho'],
    accessories: ['fones', 'nenhum'],
    palette: ['#5be0c0', '#8ef2ff', '#ffe27a', '#ff9ecb'],
    speed: [2.1, 2.8],
    lines: [
      'Dez voltas na orla antes do sol alto. Depois eu mergulho.',
      'Corro todo dia. Com duzentos anos de vida, dá tempo de criar o hábito.',
      'O calçadão do píer é o melhor trecho. Vento a favor na volta.',
    ],
    afters: { chance: 0.34, presets: ['aurora', 'palco'], night: false },
  },
  {
    id: 'artista',
    label: 'Ateliê Aero',
    routine: {
      madrugada: ['cristal', 'mirante'],
      manhã: ['praca', 'cristal'],
      tarde: ['mirante', 'cristal', 'parque'],
      noite: ['mirante', 'palco', 'praca'],
    },
    outfits: ['aero', 'casual', 'vestido'],
    outfitsMasc: ['aero', 'moletom', 'camiseta'],
    accessories: ['chapeu', 'nenhum', 'oculos'],
    palette: ['#ff8fb4', '#ffb37a', '#c6a1ff', '#7fe6ff'],
    speed: [0.9, 1.3],
    lines: [
      'O Júpiter diz que cor é memória. Estou tentando pintar o pôr do sol de ontem.',
      'Venho ao Mirante pela luz das seis. Nenhuma tela alcança aquilo.',
      'Se vir tinta no meu rosto, é porque o dia foi bom.',
    ],
    afters: { chance: 0.6, presets: ['aurora', 'palco', 'vice'], night: true },
  },
  {
    id: 'cuidador',
    label: 'Casa EdenPawl',
    routine: {
      madrugada: ['parque', 'jardins'],
      manhã: ['parque', 'praca', 'jardins'],
      tarde: ['parque', 'orla', 'jardins'],
      noite: ['parque', 'praca'],
    },
    outfits: ['casual', 'esportivo'],
    outfitsMasc: ['moletom', 'camiseta'],
    accessories: ['nenhum', 'chapeu', 'oculos'],
    palette: ['#9fe6b0', '#ffd3a8', '#bdf3dd', '#ffe6f2'],
    speed: [1.0, 1.4],
    lines: [
      'A Saturno diz que todo bicho de Éden entende o próprio nome. Eu acredito.',
      'Hoje acompanhei doze filhotes até o lago. Nenhum se perdeu.',
      'Se encontrar um bicho perdido, leve até a Casa EdenPawl.',
    ],
    afters: { chance: 0.15, presets: ['suave'], night: false },
  },
  {
    id: 'navegante',
    label: 'Píer das Marés',
    routine: {
      madrugada: ['pier', 'orla'],
      manhã: ['pier', 'orla'],
      tarde: ['pier', 'orla', 'praca'],
      noite: ['pier', 'orla', 'palco'],
    },
    outfits: ['casual', 'aero'],
    outfitsMasc: ['casual', 'banho'],
    accessories: ['chapeu', 'oculos', 'nenhum'],
    palette: ['#7fd6ff', '#5ec8e6', '#d7e9ff', '#9fe6d0'],
    speed: [1.0, 1.5],
    lines: [
      'A maré de Éden sobe devagar, em cem dias. Dá tempo de aprender a ler a água.',
      'Já vi o reflexo da Aérion no mar daqui. Uma vez só, e bastou.',
      'Barco bom é o que volta. O resto é enfeite.',
    ],
    afters: { chance: 0.24, presets: ['suave', 'aurora'], night: false },
  },
  {
    id: 'viajante',
    label: 'Visitante de outra cidade',
    routine: always(DAY_ALL),
    outfits: ['casual', 'aero', 'vestido', 'esportivo'],
    outfitsMasc: ['casual', 'aero', 'camiseta', 'regata'],
    accessories: ['nenhum', 'oculos', 'fones', 'chapeu'],
    palette: ['#b7a8ff', '#ff9ecb', '#ffd84a', '#7fe6ff', '#9fe6b0'],
    speed: [1.2, 1.7],
    lines: [
      'Vim de SkyStones. Lá a pedra canta; aqui a água. Gosto dos dois.',
      'Bitnara abre em 14 de novembro de 2026. Já estou com passagem marcada.',
      'Dez trilhões de pessoas em Éden, e a praça ainda parece acolhedora.',
    ],
    afters: { chance: 0.42, presets: ['aurora', 'vice'], night: true },
  },
];

export const FIRST_NAMES: readonly string[] = [
  'Alícia',
  'Benício',
  'Cauã',
  'Dandara',
  'Enzo',
  'Fernanda',
  'Gael',
  'Helena',
  'Ícaro',
  'Joana',
  'Kauê',
  'Lorena',
  'Miguel',
  'Nina',
  'Otávio',
  'Priscila',
  'Rafael',
  'Sofia',
  'Théo',
  'Valentina',
  'Yuri',
  'Zara',
  'Aiko',
  'Noor',
  'Kai',
  'Mio',
  'Lior',
  'Sena',
  'Taís',
  'Vega',
  'Zuri',
  'Íris',
  'Nael',
  'Suri',
  'Oona',
  'Elian',
  'Maya',
  'Davi',
  'Kira',
  'Teo',
];

/**
 * O sexo de cada nome próprio.
 *
 * O sexo do habitante **sai daqui**, e não de um sorteio. Dois motivos:
 *
 *  · sortear o sexo separado do nome produzia o que a cidade tinha —
 *    Rafael de cabelo ondulado, Benício de vestido. O nome já dizia a
 *    resposta e ninguém perguntava a ele;
 *  · um sorteio a mais no meio de `makeCitizen` deslocaria a sequência
 *    inteira do gerador.
 *
 * A tabela é `Record<string, Sex>` e está travada por teste contra
 * `FIRST_NAMES`: acrescentar um nome sem classificá-lo quebra a suíte.
 * O equilíbrio é exatamente vinte para vinte — é assim que a cidade
 * chega perto de metade e metade sem ninguém forçar uma proporção.
 *
 * Os nomes que não carregam gênero em português — Noor, Mio, Sena,
 * Vega, Zuri — foram distribuídos para fechar essa conta.
 */
export const NAME_SEX: Readonly<Record<string, Sex>> = {
  Alícia: 'fem',
  Benício: 'masc',
  Cauã: 'masc',
  Dandara: 'fem',
  Enzo: 'masc',
  Fernanda: 'fem',
  Gael: 'masc',
  Helena: 'fem',
  Ícaro: 'masc',
  Joana: 'fem',
  Kauê: 'masc',
  Lorena: 'fem',
  Miguel: 'masc',
  Nina: 'fem',
  Otávio: 'masc',
  Priscila: 'fem',
  Rafael: 'masc',
  Sofia: 'fem',
  Théo: 'masc',
  Valentina: 'fem',
  Yuri: 'masc',
  Zara: 'fem',
  Aiko: 'fem',
  Noor: 'fem',
  Kai: 'masc',
  Mio: 'fem',
  Lior: 'masc',
  Sena: 'masc',
  Taís: 'fem',
  Vega: 'masc',
  Zuri: 'masc',
  Íris: 'fem',
  Nael: 'masc',
  Suri: 'fem',
  Oona: 'fem',
  Elian: 'masc',
  Maya: 'fem',
  Davi: 'masc',
  Kira: 'fem',
  Teo: 'masc',
};

/**
 * Peso de cada penteado no sorteio. O que não aparece aqui vale 1.
 *
 * Cabeça raspada é um traço real e fica no catálogo — mas com peso
 * igual ao dos outros ela saía em um habitante a cada dez, e a praça
 * virava um batalhão.
 */
const HAIR_WEIGHT: Partial<Readonly<Record<HairStyle, number>>> = {
  // 0,6 e não 0,3: `careca` serve aos dois sexos, então leva também a
  // metade de `hairWeight` logo abaixo. Com 0,3 os dois efeitos se
  // somavam e a cidade ficava sem nenhum habitante de cabeça raspada.
  careca: 0.6,
};

/**
 * O peso com que um penteado entra no baralho de um sexo.
 *
 * Peça que serve aos dois é sorteada em **dois** baralhos, e por isso
 * sai com o dobro da presença na cidade: medindo, `espetado` apareceu
 * nove vezes em cinquenta e quatro habitantes enquanto cada corte
 * exclusivo aparecia três. Meio peso em cada baralho devolve a ela a
 * mesma frequência de uma peça de um sexo só.
 */
function hairWeight(style: HairStyle): number {
  const shared = HAIR_AUDIENCE[style] === 'ambos' ? 0.5 : 1;
  return shared * (HAIR_WEIGHT[style] ?? 1);
}

/**
 * Sorteia um penteado do catálogo do sexo, respeitando os pesos.
 *
 * Gasta **uma** chamada do gerador, exatamente como `pick`: a conta do
 * peso é feita sobre o número já sorteado, não com sorteios extras.
 */
function pickHair(rng: Rng, sex: Sex): HairStyle {
  const list = CITIZEN_HAIR_BY_SEX[sex];
  let total = 0;
  for (const style of list) total += hairWeight(style);
  let mark = rng() * total;
  for (const style of list) {
    mark -= hairWeight(style);
    if (mark < 0) return style;
  }
  return list[list.length - 1];
}

const SURNAMES: readonly string[] = [
  'Aurora',
  'Cristal',
  'das Águas',
  'do Orvalho',
  'Luz',
  'Nimbus',
  'Mares',
  'Brisa',
  'Lumen',
  'Zênite',
  'Sereno',
  'Alvorada',
];

export interface CitizenProfile {
  seed: number;
  name: string;
  archetype: CitizenArchetype;
  appearance: AvatarAppearance;
  /** Velocidade base de caminhada (m/s). */
  speed: number;
  /** Fala pessoal, escolhida do arquétipo. */
  line: string;
  /**
   * Configuração Afters pessoal: AfterBust® e AfterCurve® deste habitante,
   * de 0% a 250%, com a mesma estrutura usada pelo jogador.
   */
  afters: AftersBody;
  /** `true` se esta pessoa reforça a silhueta quando a noite cai. */
  aftersNight: boolean;
}

/** Identificador do ator Afters de um cidadão (`cidadao:12`). */
export function citizenAftersId(seed: number): string {
  return `cidadao:${seed}`;
}

/**
 * Sorteia a configuração Afters de um habitante.
 *
 * Determinística: a mesma semente devolve sempre a mesma pessoa, com a
 * mesma silhueta. É o que mantém a cidade reconhecível entre sessões, sem
 * precisar gravar nada.
 */
export function rollCitizenAfters(rng: Rng, archetype: CitizenArchetype, sex: Sex = 'fem'): AftersBody {
  const base = defaultAftersBody();
  // Os Afters moldam busto e quadril: é um sistema de silhueta
  // feminina, e aplicá-lo a um habitante masculino dava exatamente o
  // que se esperaria — quatro homens de busto 0,85 a 2,05 andando pela
  // praça assim que metade da cidade passou a ser masculina.
  //
  // A saída é antecipada, e não um zeramento depois do sorteio, porque
  // esta é a **última** chamada de `makeCitizen`: não consumir os
  // números não desloca campo nenhum. O padrão `'fem'` mantém idêntica
  // qualquer chamada antiga de dois argumentos.
  if (sex === 'masc') return base;
  if (rng() >= archetype.afters.chance) return base;
  const preset = getAftersPreset(pick(rng, archetype.afters.presets)) ?? AFTERS_PRESETS[1];
  const body = applyPreset(base, preset);
  // Variação de até ±25 pontos: ninguém usa exatamente o mesmo número.
  const vary = (value: number): number => {
    const percent = toPercent(value);
    if (percent <= 0) return 0;
    const shifted = Math.round((percent + (rng() * 50 - 25)) / 5) * 5;
    return fromPercent(Math.max(25, Math.min(250, shifted)));
  };
  body.bust = vary(body.bust);
  body.curve = vary(body.curve);
  // Um canal sozinho acontece: nem todo mundo usa os dois.
  const solo = rng();
  if (solo < 0.18) {
    body.curve = 0;
    body.curveActive = false;
  } else if (solo < 0.34) {
    body.bust = 0;
    body.bustActive = false;
  }
  body.duration = 1.1 + rng() * 1.4;
  body.preset = null;
  return body;
}

/** Cria um cidadão determinístico a partir de uma semente. */
export function makeCitizen(seed: number): CitizenProfile {
  const rng = createRng(seed * 7919 + 13);
  const archetype = CITIZEN_ARCHETYPES[randInt(rng, 0, CITIZEN_ARCHETYPES.length - 1)];
  const first = pick(rng, FIRST_NAMES);
  const name = `${first} ${pick(rng, SURNAMES)}`;
  // O sexo sai do nome que acabou de ser sorteado. Ver `NAME_SEX`.
  const sex: Sex = NAME_SEX[first] ?? 'fem';
  const hairStyle: HairStyle = pickHair(rng, sex);
  const appearance: AvatarAppearance = {
    sex,
    skin: pick(rng, SKIN_TONES),
    hairStyle,
    hairColor: pick(rng, HAIR_COLORS),
    eyeColor: pick(rng, EYE_COLORS),
    outfit: pick(rng, sex === 'masc' ? archetype.outfitsMasc : archetype.outfits),
    topColor: pick(rng, archetype.palette),
    bottomColor: pick(rng, CLOTH_COLORS),
    shoeColor: pick(rng, CLOTH_COLORS),
    // O ramo de 35% sorteava de `ACCESSORIES` **cheia** — e era por
    // ele que o Ouro do Ateliê da Júpiter, as lentes da Suki-Chan e o
    // Nimbo Materno da Amara apareciam na praça. A lista de habitante
    // existia desde sempre; faltava alguém lê-la.
    accessory: rng() < 0.65 ? pick(rng, archetype.accessories) : pick(rng, CITIZEN_ACCESSORIES),
    height: Math.round((0.93 + rng() * 0.14) * 100) / 100,
  };
  // A auréola é marca dos seres divinos: cidadãos comuns não a usam.
  if (appearance.accessory === 'aureola') appearance.accessory = 'nenhum';
  const [minSpeed, maxSpeed] = archetype.speed;
  // A ordem dos sorteios importa: o bloco Afters vem por último para que os
  // habitantes já existentes continuem idênticos aos de antes.
  const speed = minSpeed + rng() * (maxSpeed - minSpeed);
  const line = pick(rng, archetype.lines);
  const afters = rollCitizenAfters(rng, archetype, sex);
  return { seed, name, archetype, appearance, speed, line, afters, aftersNight: archetype.afters.night };
}

export interface GreetingContext {
  period: DayPeriod;
  /** Rótulo curto do clima (ex.: "Céu limpo"). */
  weather: string;
  /** Nome da área onde a conversa acontece. */
  area: string;
  playerName: string;
  rng?: Rng;
}

const PERIOD_LINES: Record<DayPeriod, readonly string[]> = {
  madrugada: ['A cidade é toda sua a esta hora.', 'Madrugada em Aurora tem outro silêncio.', 'Ainda acordado(a)? Eu também.'],
  manhã: ['Bom dia! O vidro ainda está com orvalho.', 'Manhã boa para andar a pé.', 'Bom dia. A cidade acabou de acordar.'],
  tarde: ['Boa tarde! A luz agora é a melhor do dia.', 'Boa tarde. Está um clima ótimo para o parque.', 'Boa tarde!'],
  noite: ['Boa noite! Repare no néon, acabou de acender.', 'À noite Aurora vira outra cidade. Gosto mais assim.', 'Boa noite por aqui.'],
};

/** Respostas a um aceno do jogador. */
const WAVE_BACK: readonly string[] = [
  'Oi! Bom te ver por aqui.',
  'Ei! Bom passeio por Aurora.',
  'Tchau! Aparece de novo.',
  'Oi, oi! Até a próxima.',
];

/**
 * Resposta a um aceno.
 * A escolha é estável por pessoa: a mesma sempre responde igual.
 */
export function citizenWaveBack(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return WAVE_BACK[hash % WAVE_BACK.length];
}

/** Saudação contextual de um cidadão (período, clima, lugar e nome). */
export function citizenGreeting(profile: CitizenProfile, context: GreetingContext): string[] {
  const rng = context.rng ?? createRng(profile.seed * 31 + Math.floor(Date.now() / 60000));
  const hello = pick(rng, PERIOD_LINES[context.period]);
  const nameLine = rng() < 0.45 ? `Prazer, ${context.playerName}.` : null;
  const place = rng() < 0.4 ? `${context.area} com ${context.weather.toLowerCase()} é difícil de superar.` : null;
  return [hello, nameLine, profile.line, place].filter((line): line is string => line !== null);
}
