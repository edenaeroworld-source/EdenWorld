import type { Accessory, AvatarAppearance, HairStyle, Outfit } from '../player/AvatarAppearance';
import { ACCESSORIES, CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from '../player/AvatarAppearance';
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
  outfits: readonly Outfit[];
  accessories: readonly Accessory[];
  /** Cores preferidas da parte de cima da roupa. */
  palette: readonly string[];
  /** Faixa de velocidade de caminhada (m/s). */
  speed: readonly [number, number];
  /** Falas típicas do arquétipo. */
  lines: readonly string[];
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
    accessories: ['nenhum', 'oculos', 'chapeu'],
    palette: ['#4fd6a8', '#7fe3c0', '#2fa37a', '#bdf3dd'],
    speed: [1.0, 1.4],
    lines: [
      'As bromélias de cristal abrem sozinhas quando o sol bate na água. Repare na próxima vez.',
      'Rego o jardim de madrugada. A planta gosta, e eu também.',
      'Essa cidade é um jardim que aprendeu a ter ruas.',
    ],
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
    accessories: ['oculos', 'nenhum', 'fones'],
    palette: ['#8fd4ff', '#b7a8ff', '#ffd3ef', '#9ff2ff'],
    speed: [1.3, 1.9],
    lines: [
      'A Suki-Chan passou um trabalho sobre bioluminescência. Vim ver de perto.',
      'Dizem que a Estufa Celeste tem uma planta que só floresce de madrugada. Ainda não vi.',
      'Estou atrasado(a) para a aula, mas valeu a pena esse caminho.',
    ],
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
    accessories: ['fones', 'nenhum', 'oculos'],
    palette: ['#ff9ecb', '#ffb37a', '#c6a1ff', '#7fe6ff'],
    speed: [1.1, 1.5],
    lines: [
      'Quando a Lilly sobe no Palco Aurora, a cidade inteira vira caixa de som.',
      'Toco no fim da tarde, quando o reflexo da água entra no tom certo.',
      'Se ouvir um acorde vindo da orla, provavelmente sou eu.',
    ],
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
    accessories: ['oculos', 'fones', 'nenhum'],
    palette: ['#7fd6ff', '#aef0ff', '#9ab6ff', '#d7e9ff'],
    speed: [1.4, 1.9],
    lines: [
      'Atualização do EdenOS saiu hoje. A Haru assina o registro de mudanças, sempre com um print("Hello Eden").',
      'Depois do BlueBloom, a gente testa tudo duas vezes. Deu certo: a cura chegou a cem por cento.',
      'Se o seu EdenPhone travar, é só desligar e ligar. Vale até para deuses.',
    ],
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
    accessories: ['nenhum', 'chapeu', 'oculos'],
    palette: ['#ffc98f', '#ffe0a3', '#ff9ea8', '#ffd84a'],
    speed: [1.1, 1.6],
    lines: [
      'Chegou fruta de vidro do Jardim Proibido. Doce, e brilha no escuro.',
      'A Akemi-Chan encomendou trinta caixas de mangá para a próxima convenção.',
      'Se procura lembrancinha de Aurora, é na banca da esquina.',
    ],
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
    accessories: ['fones', 'nenhum'],
    palette: ['#5be0c0', '#8ef2ff', '#ffe27a', '#ff9ecb'],
    speed: [2.1, 2.8],
    lines: [
      'Dez voltas na orla antes do sol alto. Depois eu mergulho.',
      'Corro todo dia. Com duzentos anos de vida, dá tempo de criar o hábito.',
      'O calçadão do píer é o melhor trecho. Vento a favor na volta.',
    ],
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
    accessories: ['chapeu', 'nenhum', 'oculos'],
    palette: ['#ff8fb4', '#ffb37a', '#c6a1ff', '#7fe6ff'],
    speed: [0.9, 1.3],
    lines: [
      'O Júpiter diz que cor é memória. Estou tentando pintar o pôr do sol de ontem.',
      'Venho ao Mirante pela luz das seis. Nenhuma tela alcança aquilo.',
      'Se vir tinta no meu rosto, é porque o dia foi bom.',
    ],
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
    accessories: ['nenhum', 'chapeu', 'oculos'],
    palette: ['#9fe6b0', '#ffd3a8', '#bdf3dd', '#ffe6f2'],
    speed: [1.0, 1.4],
    lines: [
      'A Saturno diz que todo bicho de Éden entende o próprio nome. Eu acredito.',
      'Hoje acompanhei doze filhotes até o lago. Nenhum se perdeu.',
      'Se encontrar um bicho perdido, leve até a Casa EdenPawl.',
    ],
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
    accessories: ['chapeu', 'oculos', 'nenhum'],
    palette: ['#7fd6ff', '#5ec8e6', '#d7e9ff', '#9fe6d0'],
    speed: [1.0, 1.5],
    lines: [
      'A maré de Éden sobe devagar, em cem dias. Dá tempo de aprender a ler a água.',
      'Já vi o reflexo da Aérion no mar daqui. Uma vez só, e bastou.',
      'Barco bom é o que volta. O resto é enfeite.',
    ],
  },
  {
    id: 'viajante',
    label: 'Visitante de outra cidade',
    routine: always(DAY_ALL),
    outfits: ['casual', 'aero', 'vestido', 'esportivo'],
    accessories: ['nenhum', 'oculos', 'fones', 'chapeu'],
    palette: ['#b7a8ff', '#ff9ecb', '#ffd84a', '#7fe6ff', '#9fe6b0'],
    speed: [1.2, 1.7],
    lines: [
      'Vim de SkyStones. Lá a pedra canta; aqui a água. Gosto dos dois.',
      'Bitnara abre em 14 de novembro de 2026. Já estou com passagem marcada.',
      'Dez trilhões de pessoas em Éden, e a praça ainda parece acolhedora.',
    ],
  },
];

const FIRST_NAMES: readonly string[] = [
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
}

/** Cria um cidadão determinístico a partir de uma semente. */
export function makeCitizen(seed: number): CitizenProfile {
  const rng = createRng(seed * 7919 + 13);
  const archetype = CITIZEN_ARCHETYPES[randInt(rng, 0, CITIZEN_ARCHETYPES.length - 1)];
  const name = `${pick(rng, FIRST_NAMES)} ${pick(rng, SURNAMES)}`;
  const hairStyle: HairStyle = pick(rng, HAIR_STYLES);
  const appearance: AvatarAppearance = {
    skin: pick(rng, SKIN_TONES),
    hairStyle,
    hairColor: pick(rng, HAIR_COLORS),
    eyeColor: pick(rng, EYE_COLORS),
    outfit: pick(rng, archetype.outfits),
    topColor: pick(rng, archetype.palette),
    bottomColor: pick(rng, CLOTH_COLORS),
    shoeColor: pick(rng, CLOTH_COLORS),
    accessory: rng() < 0.65 ? pick(rng, archetype.accessories) : pick(rng, ACCESSORIES),
    height: Math.round((0.93 + rng() * 0.14) * 100) / 100,
  };
  // A auréola é marca dos seres divinos: cidadãos comuns não a usam.
  if (appearance.accessory === 'aureola') appearance.accessory = 'nenhum';
  const [minSpeed, maxSpeed] = archetype.speed;
  return {
    seed,
    name,
    archetype,
    appearance,
    speed: minSpeed + rng() * (maxSpeed - minSpeed),
    line: pick(rng, archetype.lines),
  };
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

/** Saudação contextual de um cidadão (período, clima, lugar e nome). */
export function citizenGreeting(profile: CitizenProfile, context: GreetingContext): string[] {
  const rng = context.rng ?? createRng(profile.seed * 31 + Math.floor(Date.now() / 60000));
  const hello = pick(rng, PERIOD_LINES[context.period]);
  const nameLine = rng() < 0.45 ? `Prazer, ${context.playerName}.` : null;
  const place = rng() < 0.4 ? `${context.area} com ${context.weather.toLowerCase()} é difícil de superar.` : null;
  return [hello, nameLine, profile.line, place].filter((line): line is string => line !== null);
}
