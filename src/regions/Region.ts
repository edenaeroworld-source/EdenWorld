/**
 * Regiões do universo Éden Aero.
 *
 * Uma região **não é uma fase**. É um pedaço permanente do mesmo mundo,
 * com identidade própria, gente própria e lugares próprios. O jogador
 * viaja entre elas levando tudo: dinheiro, inventário, bichos, casa e
 * progresso. Nada é "concluído" e nada é "destravado por vitória" — o
 * que existe é descobrir que o lugar está ali.
 *
 * Módulo puro: só dados e funções. Sem Three.js, sem DOM. Quem desenha
 * a região em 3D é a camada de cenário; quem decide onde o jogador está
 * é o `RegionManager`.
 */

/** Como se chega a uma região pela primeira vez. */
export type RegionAccess =
  /** Already known when the game begins. */
  | 'inicial'
  /** Discovered by talking to someone who mentions it. */
  | 'indicacao'
  /** Discovered by finding the way in. */
  | 'exploracao';

/** Clima predominante — alimenta o sistema de tempo já existente. */
export type RegionClimate = 'temperado' | 'ameno' | 'umido' | 'seco' | 'frio' | 'magico';

/** Identidade visual da arquitetura, para a camada de cenário. */
export type RegionArchitecture = 'aero' | 'pop' | 'industrial' | 'organico' | 'sombrio' | 'colonial' | 'primordial';

/** Um lugar dentro de uma região: onde o jogador pode chegar e parar. */
export interface RegionPlace {
  id: string;
  name: string;
  /** Posição no espaço local da região (metros, origem no centro). */
  x: number;
  z: number;
  /** O que é: define ícone no mapa e que tipo de interação esperar. */
  kind: 'praca' | 'loja' | 'casa' | 'cultura' | 'natureza' | 'servico' | 'transporte' | 'estudio' | 'santuario';
  /** Descrição curta, mostrada no mapa e no diário. */
  note: string;
  /** Interior que esta porta abre, quando há um (ver `src/interiors`). */
  interiorId?: string;
}

export interface WorldRegion {
  id: string;
  name: string;
  /** Subtítulo curto: o que a região é, em poucas palavras. */
  tagline: string;
  /** Texto do diário quando a região é descoberta. */
  description: string;
  access: RegionAccess;
  climate: RegionClimate;
  architecture: RegionArchitecture;
  /** Cores de identidade: céu/destaque. Usadas no mapa e na interface. */
  colors: readonly [string, string];
  /** Raio jogável, em metros. Aurora City usa o `WORLD.boundaryRadius`. */
  radius: number;
  /** Quantos moradores a região simula quando o jogador está nela. */
  population: number;
  /** Onde o jogador aparece ao chegar. */
  arrival: { x: number; z: number; heading: number };
  places: readonly RegionPlace[];
  /** Lojas presentes aqui (ids do catálogo de `src/economy`). */
  shops: readonly string[];
  /** Espécies que aparecem na natureza daqui (ids de `src/creatures`). */
  wildlife: readonly string[];
  /** Personagens do panteão que costumam estar aqui. */
  patrons: readonly string[];
  /**
   * Regiões vizinhas por terra. Viajar entre vizinhas é direto; entre
   * não-vizinhas passa pela rede de transporte (ver `travelTime`).
   */
  neighbors: readonly string[];
  /** `false` enquanto a região ainda não tem conteúdo jogável de verdade. */
  playable: boolean;
}

/**
 * As sete regiões do universo.
 *
 * Aurora City é a única com cenário 3D completo hoje — ela é a cidade
 * que o jogo já tinha. As outras seis existem como regiões de verdade
 * (descobríveis, viajáveis, com lugares, lojas, bichos e padroeiros),
 * mas o cenário tridimensional de cada uma ainda será construído. O
 * campo `playable` diz a verdade sobre isso, e a interface mostra.
 */
export const REGIONS: readonly WorldRegion[] = Object.freeze([
  Object.freeze({
    id: 'aurora-city',
    name: 'Aurora City',
    tagline: 'A metrópole onde o Éden acorda.',
    description:
      'A cidade principal do Éden Aero: praça central, lago, mirante, palco e as torres que se acendem ao anoitecer. É daqui que se chega a todo o resto.',
    access: 'inicial' as RegionAccess,
    climate: 'temperado' as RegionClimate,
    architecture: 'aero' as RegionArchitecture,
    colors: ['#8fe6ff', '#1b82ea'] as readonly [string, string],
    radius: 268,
    population: 54,
    arrival: { x: 0, z: 30, heading: Math.PI },
    places: Object.freeze([
      { id: 'praca-central', name: 'Praça Central', x: 0, z: 0, kind: 'praca' as const, note: 'O coração da cidade. Todo caminho passa por aqui.' },
      { id: 'mirante-celeste', name: 'Mirante Celeste', x: 176, z: 60, kind: 'natureza' as const, note: 'O ponto mais alto. Amara costuma estar aqui.' },
      { id: 'atelie-aero', name: 'Ateliê Aero', x: -92, z: -48, kind: 'loja' as const, note: 'O ateliê de Luma, onde os Afters nasceram.', interiorId: 'atelie-aero' },
      { id: 'mercado-eden', name: 'Mercado Éden', x: 64, z: -104, kind: 'loja' as const, note: 'Akemi-Chan atende aqui. Cheira a pão quente.', interiorId: 'mercado-eden' },
      { id: 'casa-edenpawl', name: 'Casa EdenPawl', x: -138, z: 72, kind: 'santuario' as const, note: 'Saturno cuida dos bichos daqui.', interiorId: 'edenpawl-aurora' },
      { id: 'palco-aurora', name: 'Palco Aurora', x: 0, z: -150, kind: 'cultura' as const, note: 'Lilly toca aqui quando a noite chega.' },
      { id: 'torre-zenite', name: 'Torre Zênite', x: 118, z: -92, kind: 'servico' as const, note: 'Nexara mantém as redes do Éden funcionando.', interiorId: 'torre-zenite' },
      { id: 'estacao-aurora', name: 'Estação Aurora', x: -20, z: 120, kind: 'transporte' as const, note: 'De onde partem as viagens para as outras regiões.' },
      { id: 'residencial-orvalho', name: 'Residencial Orvalho', x: -86, z: -30, kind: 'casa' as const, note: 'Moradias cercadas de verde. O Apartamento 12 fica no térreo.', interiorId: 'apto-aurora-12' },
      { id: 'centro-edenconnect', name: 'Centro Éden Connect', x: 86, z: 30, kind: 'servico' as const, note: 'Registros, moradia e tudo que a cidade resolve no balcão.', interiorId: 'centro-edenconnect' },
    ]),
    shops: Object.freeze(['edentech-aurora', 'edenhome-aurora', 'edenpawl-aurora', 'afters-atelie']),
    wildlife: Object.freeze(['borboleta', 'passaro-cristal', 'esquilo']),
    patrons: Object.freeze(['aerion', 'amara', 'luma', 'nexara', 'akemi', 'lilly', 'saturno']),
    neighbors: Object.freeze(['rosas-park', 'bitnara']),
    playable: true,
  }),
  Object.freeze({
    id: 'bitnara',
    name: 'Bitnara',
    tagline: 'A capital do K-pop do Éden.',
    description:
      'Luzes, ensaios e palcos que nunca esfriam. Bitnara vive em contagem regressiva para o próximo show, e aceita qualquer um que queira ensaiar junto.',
    access: 'indicacao' as RegionAccess,
    climate: 'ameno' as RegionClimate,
    architecture: 'pop' as RegionArchitecture,
    colors: ['#ffc1d6', '#f0588c'] as readonly [string, string],
    radius: 180,
    population: 36,
    arrival: { x: 0, z: 24, heading: Math.PI },
    places: Object.freeze([
      { id: 'praca-dos-idolos', name: 'Praça dos Ídolos', x: 0, z: 0, kind: 'praca' as const, note: 'Sete telas gigantes e um chão que reflete tudo.' },
      { id: 'estudio-bitnara', name: 'Estúdio Bitnara', x: -60, z: -40, kind: 'estudio' as const, note: 'Onde se grava. Dá para entrar e ensaiar.', interiorId: 'estudio-bitnara' },
      { id: 'arena-neon', name: 'Arena Neon', x: 70, z: -70, kind: 'cultura' as const, note: 'O palco maior do Éden. Cabe gente demais.' },
      { id: 'loja-edenmusic-bit', name: 'EdenMusic Bitnara', x: 40, z: 30, kind: 'loja' as const, note: 'Instrumentos, microfones e tudo que faz barulho bonito.', interiorId: 'edenmusic-bitnara' },
      { id: 'cafe-encore', name: 'Café Encore', x: -34, z: 48, kind: 'servico' as const, note: 'Abre depois dos ensaios e fecha quando o último sai.', interiorId: 'cafe-encore' },
    ]),
    shops: Object.freeze(['edenmusic-bitnara', 'edenfashion-bitnara']),
    wildlife: Object.freeze(['borboleta-luminosa', 'passaro-cristal']),
    patrons: Object.freeze(['lilly', 'akemi']),
    neighbors: Object.freeze(['aurora-city', 'skystones']),
    playable: false,
  }),
  Object.freeze({
    id: 'skystones',
    name: 'SkyStones',
    tagline: 'A capital do rock, construída na pedra.',
    description:
      'Pedra, amplificador e vento. SkyStones cresceu em volta de um anfiteatro natural, e a cidade inteira treme quando alguém liga a guitarra.',
    access: 'indicacao' as RegionAccess,
    climate: 'seco' as RegionClimate,
    architecture: 'industrial' as RegionArchitecture,
    colors: ['#ffb37a', '#b3431a'] as readonly [string, string],
    radius: 190,
    population: 30,
    arrival: { x: 0, z: 26, heading: Math.PI },
    places: Object.freeze([
      { id: 'anfiteatro-pedra', name: 'Anfiteatro de Pedra', x: 0, z: -30, kind: 'cultura' as const, note: 'Escavado na rocha. A acústica é natural e é absurda.' },
      { id: 'oficina-amp', name: 'Oficina dos Amplificadores', x: -55, z: 20, kind: 'loja' as const, note: 'Consertam qualquer coisa que faça barulho.', interiorId: 'oficina-amp' },
      { id: 'mirante-das-lajes', name: 'Mirante das Lajes', x: 88, z: -58, kind: 'natureza' as const, note: 'Pedras planas sobre o vale. Bom lugar para não falar nada.' },
      { id: 'estudio-granito', name: 'Estúdio Granito', x: 30, z: 54, kind: 'estudio' as const, note: 'Paredes de um metro. Nada vaza daqui.', interiorId: 'estudio-granito' },
    ]),
    shops: Object.freeze(['edenmusic-skystones']),
    wildlife: Object.freeze(['coruja', 'gato-selvagem', 'lagarto']),
    patrons: Object.freeze(['lilly', 'jupiter']),
    neighbors: Object.freeze(['bitnara', 'noureja-nether']),
    playable: false,
  }),
  Object.freeze({
    id: 'rosas-park',
    name: 'Rosas Park',
    tagline: 'Jardins, lagos e nenhuma pressa.',
    description:
      'A região onde o Éden descansa. Caminhos de água, roseirais enormes e bichos que já se acostumaram com gente. Dá para passar o dia sem fazer nada e ainda assim ter feito algo.',
    access: 'inicial' as RegionAccess,
    climate: 'umido' as RegionClimate,
    architecture: 'organico' as RegionArchitecture,
    colors: ['#b9f5c4', '#2f9e5e'] as readonly [string, string],
    radius: 200,
    population: 24,
    arrival: { x: 0, z: 96, heading: Math.PI },
    places: Object.freeze([
      { id: 'roseiral-maior', name: 'Roseiral Maior', x: 0, z: -24, kind: 'natureza' as const, note: 'Onze mil roseiras. Alguém contou uma vez.' },
      { id: 'lago-das-lontras', name: 'Lago das Lontras', x: -96, z: 70, kind: 'natureza' as const, note: 'As lontras daqui não têm o menor medo de ninguém.' },
      { id: 'casa-de-cha', name: 'Casa de Chá', x: 52, z: 36, kind: 'servico' as const, note: 'Chá, bolo e silêncio. Nessa ordem.', interiorId: 'casa-de-cha' },
      { id: 'santuario-rosas', name: 'Santuário de Rosas Park', x: 96, z: -62, kind: 'santuario' as const, note: 'Saturno cuida dos bichos que precisam de sossego.', interiorId: 'santuario-rosas' },
      { id: 'viveiro-eden', name: 'Viveiro Éden', x: -28, z: -96, kind: 'natureza' as const, note: 'Mudas de tudo que cresce no Éden.', interiorId: 'viveiro-eden' },
      { id: 'casa-rosas-7', name: 'Casa 7', x: 76, z: 16, kind: 'casa' as const, note: 'De madeira clara e vidro, de frente para o roseiral. Está à venda.', interiorId: 'casa-rosas-7' },
      { id: 'mirante-das-aguas', name: 'Mirante das Águas', x: 24, z: 84, kind: 'cultura' as const, note: 'Sobe-se por dentro. Lá de cima dá para ver as três cascatas de uma vez.' },
    ]),
    shops: Object.freeze(['edenpawl-rosas', 'edenhome-rosas']),
    wildlife: Object.freeze(['lontra', 'capivara', 'veado', 'borboleta', 'esquilo', 'passaro-cristal', 'tartaruga']),
    patrons: Object.freeze(['saturno', 'suki', 'maze']),
    neighbors: Object.freeze(['aurora-city', 'jardim-proibido']),
    playable: true,
  }),
  Object.freeze({
    id: 'noureja-nether',
    name: 'Noureja Nether',
    tagline: 'A região que não explica o que é.',
    description:
      'Ruas que mudam de ordem, luz que vem de baixo e gente que fala por meias-frases. Noureja Nether é a parte do Éden que o próprio Éden não terminou de entender.',
    access: 'exploracao' as RegionAccess,
    climate: 'magico' as RegionClimate,
    architecture: 'sombrio' as RegionArchitecture,
    colors: ['#c9a6ff', '#5b2ea8'] as readonly [string, string],
    radius: 170,
    population: 18,
    arrival: { x: 0, z: 22, heading: Math.PI },
    places: Object.freeze([
      { id: 'praca-invertida', name: 'Praça Invertida', x: 0, z: 0, kind: 'praca' as const, note: 'A fonte corre para cima. Ninguém comenta.' },
      { id: 'biblioteca-nether', name: 'Biblioteca do Nether', x: -48, z: -52, kind: 'cultura' as const, note: 'Livros que só abrem para quem já leu.', interiorId: 'biblioteca-nether' },
      { id: 'mercado-sussurro', name: 'Mercado Sussurro', x: 58, z: 28, kind: 'loja' as const, note: 'Fecha quando quer. Hoje parece aberto.', interiorId: 'mercado-sussurro' },
    ]),
    shops: Object.freeze(['mercado-sussurro']),
    wildlife: Object.freeze(['criatura-bioluminescente', 'coruja', 'anfibio-lumen']),
    patrons: Object.freeze(['haru', 'nexara']),
    neighbors: Object.freeze(['skystones', 'cidade-da-liberdade']),
    playable: false,
  }),
  Object.freeze({
    id: 'cidade-da-liberdade',
    name: 'Cidade da Liberdade',
    tagline: 'Arte em todo lugar, inclusive no chão.',
    description:
      'Uma região inteira feita por quem mora nela: muros pintados, oficinas abertas, música de rua e nenhuma licença pedida. O que estiver feio hoje provavelmente muda amanhã.',
    access: 'indicacao' as RegionAccess,
    climate: 'temperado' as RegionClimate,
    architecture: 'colonial' as RegionArchitecture,
    colors: ['#ffe28a', '#e0821b'] as readonly [string, string],
    radius: 185,
    population: 32,
    arrival: { x: 0, z: 22, heading: Math.PI },
    places: Object.freeze([
      { id: 'largo-das-mãos', name: 'Largo das Mãos', x: 0, z: 0, kind: 'praca' as const, note: 'O chão é um mosaico que cresce todo mês.' },
      { id: 'oficina-aberta', name: 'Oficina Aberta', x: -44, z: 36, kind: 'cultura' as const, note: 'Entra quem quiser, trabalha quem quiser.', interiorId: 'oficina-aberta' },
      { id: 'galeria-livre', name: 'Galeria Livre', x: 62, z: -40, kind: 'cultura' as const, note: 'Júpiter expõe aqui quando está por perto.', interiorId: 'galeria-livre' },
      { id: 'feira-da-liberdade', name: 'Feira da Liberdade', x: 24, z: 58, kind: 'loja' as const, note: 'Roupa, comida e coisas sem nome.', interiorId: 'feira-liberdade' },
    ]),
    shops: Object.freeze(['edenfashion-liberdade', 'feira-liberdade']),
    wildlife: Object.freeze(['passaro-cristal', 'borboleta', 'gato-selvagem']),
    patrons: Object.freeze(['jupiter', 'maze']),
    neighbors: Object.freeze(['noureja-nether', 'jardim-proibido']),
    playable: false,
  }),
  Object.freeze({
    id: 'jardim-proibido',
    name: 'Jardim Proibido',
    tagline: 'Protegido — e não é com você que ele se preocupa.',
    description:
      'A região mais antiga do Éden, deixada em paz de propósito. Tem bicho que não existe em nenhum outro lugar, e entrar aqui é um acordo: observar sem pegar, passar sem marcar.',
    access: 'exploracao' as RegionAccess,
    climate: 'magico' as RegionClimate,
    architecture: 'primordial' as RegionArchitecture,
    colors: ['#a6ffe4', '#108d79'] as readonly [string, string],
    radius: 210,
    population: 8,
    arrival: { x: 0, z: 28, heading: Math.PI },
    places: Object.freeze([
      { id: 'portao-vivo', name: 'Portão Vivo', x: 0, z: 26, kind: 'transporte' as const, note: 'Não é feito de madeira. É feito de árvore.' },
      { id: 'clareira-primeira', name: 'Clareira Primeira', x: 0, z: -40, kind: 'natureza' as const, note: 'Dizem que foi o primeiro lugar do Éden a existir.' },
      { id: 'lago-espelho', name: 'Lago Espelho', x: -76, z: -20, kind: 'natureza' as const, note: 'A água não se mexe nem com vento.' },
      { id: 'santuario-maior', name: 'Santuário Maior', x: 60, z: -86, kind: 'santuario' as const, note: 'A casa de Saturno quando ela não quer ser achada.', interiorId: 'santuario-maior' },
    ]),
    shops: Object.freeze([]),
    wildlife: Object.freeze([
      'criatura-bioluminescente',
      'passaro-cristal',
      'borboleta-luminosa',
      'peixe-aurora',
      'veado',
      'lobo',
      'urso',
      'coruja',
      'anfibio-lumen',
    ]),
    patrons: Object.freeze(['saturno', 'aerion']),
    neighbors: Object.freeze(['rosas-park', 'cidade-da-liberdade']),
    playable: false,
  }),
]);

/** Região onde um jogo novo começa. */
export const DEFAULT_REGION_ID = 'aurora-city';

const BY_ID = new Map(REGIONS.map((region) => [region.id, region]));

export function getRegion(id: string): WorldRegion | undefined {
  return BY_ID.get(id);
}

export function isRegionId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Regiões que o jogador já conhece quando começa um jogo novo. */
export function initialRegions(): string[] {
  return REGIONS.filter((region) => region.access === 'inicial').map((region) => region.id);
}

/** Um lugar específico, por região e id. */
export function getPlace(regionId: string, placeId: string): RegionPlace | undefined {
  return getRegion(regionId)?.places.find((place) => place.id === placeId);
}

/**
 * Menor número de trechos entre duas regiões, pela rede de vizinhança.
 *
 * Busca em largura: o grafo tem sete nós, então o custo é irrelevante e
 * a resposta é sempre a menor. Devolve `-1` quando não há caminho.
 */
export function routeBetween(fromId: string, toId: string): string[] {
  if (!BY_ID.has(fromId) || !BY_ID.has(toId)) return [];
  if (fromId === toId) return [fromId];
  const previous = new Map<string, string>([[fromId, fromId]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of BY_ID.get(current)?.neighbors ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      if (next === toId) {
        const path = [next];
        let step = current;
        while (step !== fromId) {
          path.unshift(step);
          step = previous.get(step) as string;
        }
        path.unshift(fromId);
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

/**
 * Tempo de viagem em segundos de jogo.
 *
 * Vizinhas são perto; o resto custa por trecho. Não é uma barreira — é
 * só a duração da tela de viagem, para a chegada ter algum peso.
 */
export function travelTime(fromId: string, toId: string): number {
  const route = routeBetween(fromId, toId);
  if (route.length <= 1) return 0;
  return 1.6 + (route.length - 2) * 0.9;
}
