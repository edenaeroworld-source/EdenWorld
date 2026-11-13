/**
 * A planta de Rosas Park.
 *
 * Mesmo papel que `Layout.ts` tem em Aurora City: um só lugar com as
 * coordenadas de tudo, para que relevo, zonas, geometria, colisão e
 * física leiam exatamente os mesmos números. Se o lago mudar de lugar,
 * muda aqui e o resto acompanha.
 *
 * A identidade é Frutiger Aero: vidro, água limpíssima, verde tropical,
 * cascatas que acendem e estruturas orgânicas que parecem crescidas em
 * vez de construídas. A paleta é azul, ciano, verde e branco.
 *
 * Módulo puro: só números e funções. Sem Three.js.
 */

import { TAU, type Point2 } from '../../utils/math';

/** Extensão do terreno de Rosas Park (metros). Menor que Aurora. */
export const ROSAS_TERRAIN_SIZE = 520;

/** Raio jogável. Casa com `radius` da região em `src/regions/Region.ts`. */
export const ROSAS_BOUNDARY = 200;

/** Altura do solo do parque (nível de referência). */
export const GROUND = 1.6;

/** Nível da água. Igual ao do mundo: o jogador nada do mesmo jeito. */
export const WATER = 0;

/* ------------------------------- o lago -------------------------------- */

/**
 * Lago das Lontras.
 *
 * Grande e raso nas margens: dá para entrar na água andando, em vez de
 * cair num poço. O fundo é visível — a água de Rosas Park é limpa, e
 * isso é parte da identidade da região.
 */
export const LAKE = {
  x: -96,
  z: 70,
  radiusX: 52,
  radiusZ: 38,
  rotation: -0.22,
  /** Profundidade no centro. */
  depth: 3.4,
} as const;

/**
 * Ilha do lago, ligada por duas pontes.
 *
 * Fica deslocada do centro de propósito: uma ilha no meio exato do
 * lago tapa o lago inteiro e não sobra água para ver.
 */
export const LAKE_ISLAND = { x: -78, z: 60, radius: 12, height: 2.4 } as const;

/* ----------------------------- as cascatas ------------------------------ */

/**
 * O paredão de onde caem as cascatas luminosas.
 *
 * É um degrau de relevo no norte do parque: a água desce dele para o
 * lago por três quedas, e à noite elas acendem. O degrau também é o que
 * dá relevo à região — sem ele, Rosas Park seria uma mesa plana.
 */
export const CLIFF = {
  /**
   * Centro do arco — **fora** do parque, a noroeste.
   *
   * Ficar fora é o truque: o terreno alto é o disco em volta deste
   * centro, e o que entra no parque é só a borda curva dele. Quando o
   * centro ficava dentro, o degrau era uma cunha pontiaguda com ápice
   * no meio do gramado, que é exatamente o que a planta mostrou.
   */
  x: -235,
  z: -235,
  /** Raio do disco alto e altura da encosta. */
  radius: 190,
  height: 15.5,
  /**
   * Espessura da transição.
   *
   * Larga de propósito: a encosta tem de ser **subível a pé**, senão
   * o bosque de sakuras lá em cima e a gruta atrás da água viram
   * cenário de vitrine. O paredão vertical das cascatas é geometria
   * construída (`drop`), não relevo.
   */
  blend: 40,
  /**
   * Distância do centro em que fica a crista das quedas.
   *
   * Menor que `radius`, portanto **encosta acima**: a água nasce lá em
   * cima e cai na direção do parque.
   */
  crestRadius: 172,
  /** Faixa de ângulos em que pode haver queda d'água. */
  arcFrom: 0.58,
  arcTo: 0.98,
} as const;

export interface Waterfall {
  id: string;
  /** Ângulo no arco do paredão. */
  angle: number;
  /** Largura da queda, em metros. */
  width: number;
  /** Altura da parede de rocha de onde a água cai. */
  drop: number;
  /** Cor da luz noturna. */
  color: number;
}

export const WATERFALLS: readonly Waterfall[] = Object.freeze([
  { id: 'queda-maior', angle: 0.78, width: 13, drop: 11, color: 0x8fe6ff },
  { id: 'queda-irma', angle: 0.64, width: 8.5, drop: 8.5, color: 0xa6ffe4 },
  { id: 'queda-menor', angle: 0.92, width: 6, drop: 6.5, color: 0xbfe9ff },
]);

/** Lagoa ao pé das cascatas, que escoa para o lago. */
/**
 * Lago do pé das quedas.
 *
 * Fica logo abaixo das três cascatas, com o eixo maior **ao longo**
 * do paredão (perpendicular ao raio do arco), para recolher as três.
 */
export const BASIN = { x: -82, z: -88, radiusX: 40, radiusZ: 21, rotation: 0.79, depth: 2.2 } as const;

/* ------------------------------ o roseiral ------------------------------ */

/**
 * Roseiral Maior: terraços circulares concêntricos.
 *
 * Três anéis de canteiro com um mirante no centro. É o ponto de
 * referência do parque — dá para se localizar de qualquer lugar.
 */
export const ROSE_GARDEN = {
  x: 0,
  z: -24,
  tiers: [46, 34, 22] as readonly number[],
  /** Altura ganha por terraço. */
  step: 1.35,
  /** Raio do mirante central. */
  coreRadius: 12,
} as const;

/* --------------------------- jardins flutuantes ------------------------- */

export interface FloatingGarden {
  id: string;
  x: number;
  z: number;
  radius: number;
  /** Altura acima do solo. */
  height: number;
  /** Quanto sobe e desce, e em quanto tempo. */
  bob: number;
  period: number;
}

/**
 * Jardins flutuantes.
 *
 * Discos de vidro e terra suspensos sobre o lago e o roseiral. Sobem e
 * descem devagar. São alcançáveis pelas pontes-rampa e têm colisão
 * própria, então dá para andar em cima.
 */
export const FLOATING_GARDENS: readonly FloatingGarden[] = Object.freeze([
  { id: 'jardim-alto', x: -18, z: 10, radius: 11, height: 11.5, bob: 0.5, period: 17 },
  { id: 'jardim-lago', x: -100, z: 86, radius: 8.5, height: 9, bob: 0.42, period: 21 },
  { id: 'jardim-leste', x: 56, z: -4, radius: 9.5, height: 13, bob: 0.38, period: 24 },
]);

/* ------------------------------ edifícios ------------------------------- */

export interface Pavilion {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Raio da planta (as construções daqui são redondas ou ovais). */
  radius: number;
  height: number;
  /** Forma: define como a geometria é montada. */
  shape: 'estufa' | 'pavilhao' | 'abrigo' | 'torre' | 'casa';
  /** Interior que a porta abre, quando há um. */
  interiorId?: string;
  /** Direção da porta (rad). */
  doorAngle: number;
}

/**
 * As construções de Rosas Park.
 *
 * Arquitetura de vidro e estrutura orgânica: nada tem quina reta. Três
 * delas têm interior construído de verdade.
 */
export const PAVILIONS: readonly Pavilion[] = Object.freeze([
  { id: 'casa-de-cha', name: 'Casa de Chá', x: 52, z: 36, radius: 11, height: 7.5, shape: 'pavilhao' as const, interiorId: 'casa-de-cha', doorAngle: Math.PI },
  { id: 'santuario-rosas', name: 'Santuário de Rosas Park', x: 96, z: -62, radius: 14, height: 8.5, shape: 'abrigo' as const, interiorId: 'santuario-rosas', doorAngle: Math.PI * 1.1 },
  { id: 'viveiro-eden', name: 'Viveiro Éden', x: -28, z: -96, radius: 15, height: 10, shape: 'estufa' as const, interiorId: 'viveiro-eden', doorAngle: Math.PI * 0.5 },
  { id: 'casa-rosas-7', name: 'Casa 7', x: 76, z: 16, radius: 9, height: 6, shape: 'casa' as const, interiorId: 'casa-rosas-7', doorAngle: Math.PI },
  { id: 'torre-mirante', name: 'Mirante das Águas', x: 24, z: 84, radius: 7, height: 17, shape: 'torre' as const, doorAngle: Math.PI * 1.5 },
]);

/* -------------------------------- caminhos ------------------------------ */

export type Path = readonly Point2[];

/**
 * Caminhos do parque.
 *
 * Ligam chegada, roseiral, lago, cascatas e as construções. O relevo é
 * nivelado sob eles, então nenhum caminho vira escada por acidente.
 */
export const PATHS: readonly Path[] = Object.freeze([
  // Chegada → roseiral.
  Object.freeze([
    { x: 0, z: 110 },
    { x: 0, z: 72 },
    { x: 4, z: 48 },
    { x: 0, z: 20 },
    { x: 0, z: -6 },
  ]),
  // Roseiral → pé das cascatas (noroeste).
  Object.freeze([
    { x: -14, z: -14 },
    { x: -36, z: -36 },
    { x: -48, z: -50 },
    { x: -60, z: -66 },
  ]),
  // Roseiral → margem do lago → cabeceira da ponte norte.
  Object.freeze([
    { x: -20, z: 10 },
    { x: -40, z: 24 },
    { x: -60, z: 40 },
    { x: -70, z: 36 },
    { x: -78, z: 30 },
  ]),
  // Roseiral → santuário (leste), terminando na porta.
  Object.freeze([
    { x: 18, z: -32 },
    { x: 46, z: -40 },
    { x: 70, z: -52 },
    { x: 80, z: -67 },
  ]),
  // Roseiral → viveiro (sul), terminando na porta.
  Object.freeze([
    { x: -16, z: -40 },
    { x: -22, z: -62 },
    { x: -28, z: -78 },
  ]),
  // Alameda da chegada → casa de chá.
  Object.freeze([
    { x: 6, z: 40 },
    { x: 20, z: 38 },
    { x: 38, z: 36 },
  ]),
  // Alameda da chegada → Casa 7, passando ao sul da casa de chá.
  Object.freeze([
    { x: 20, z: 38 },
    { x: 36, z: 28 },
    { x: 52, z: 20 },
    { x: 64, z: 16 },
  ]),
  // Roseiral → mirante das águas (sul).
  Object.freeze([
    { x: 10, z: 46 },
    { x: 18, z: 66 },
    { x: 24, z: 74 },
  ]),
  // Margem do lago → cabeceira da ponte leste.
  Object.freeze([
    { x: -58, z: 40 },
    { x: -50, z: 50 },
    { x: -42, z: 62 },
  ]),
  // Trilha da ilha: liga as duas pontes. Sem ela a ilha teria dois
  // acessos e nenhum jeito de ir de um ao outro.
  Object.freeze([
    { x: -66, z: 60 },
    { x: -74, z: 56 },
    { x: -78, z: 48 },
  ]),
]);

/** Largura dos caminhos (metros). */
export const PATH_WIDTH = 3.6;

/* --------------------------------- pontes -------------------------------- */

export interface Bridge {
  id: string;
  from: Point2;
  to: Point2;
  width: number;
  /** Altura do arco no meio do vão. */
  arch: number;
  /** `vidro` é translúcida; `madeira` é a ponte rústica do lago. */
  style: 'vidro' | 'madeira';
}

export const BRIDGES: readonly Bridge[] = Object.freeze([
  // Margem leste → ilha do lago.
  { id: 'ponte-ilha-leste', from: { x: -42, z: 62 }, to: { x: -66, z: 60 }, width: 3.2, arch: 1.5, style: 'madeira' as const },
  // Ilha do lago → margem norte.
  { id: 'ponte-ilha-norte', from: { x: -78, z: 48 }, to: { x: -78, z: 30 }, width: 3.2, arch: 1.5, style: 'madeira' as const },
  // Rampa de vidro para o jardim flutuante central.
  { id: 'rampa-jardim-alto', from: { x: -6, z: 2 }, to: { x: -18, z: 10 }, width: 2.8, arch: 0, style: 'vidro' as const },
]);

/* ---------------------------- pontos de parada --------------------------- */

export interface Landmark {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Texto da placa / do diário. */
  note: string;
  /** `true` quando é um lugar escondido, que conta como descoberta. */
  hidden?: boolean;
}

/**
 * Pontos de interesse.
 *
 * Cada um vira um interativo de verdade no mundo: aproximar e apertar
 * o botão registra no diário e, nos escondidos, conta como descoberta.
 */
export const LANDMARKS: readonly Landmark[] = Object.freeze([
  { id: 'chegada-rosas', name: 'Portal de Rosas Park', x: 0, z: 110, note: 'A entrada do parque. O ar muda aqui — é mais úmido, e cheira a terra molhada.' },
  { id: 'coracao-roseiral', name: 'Coração do Roseiral', x: 0, z: -24, note: 'Onze mil roseiras em três terraços. Alguém contou uma vez e nunca mais quis repetir.' },
  { id: 'pe-da-queda', name: 'Pé da Queda Maior', x: -56, z: -62, note: 'A água bate na pedra e sobe de volta como névoa. À noite, a névoa brilha.' },
  { id: 'ilha-lontras', name: 'Ilha das Lontras', x: -78, z: 60, note: 'As lontras daqui não têm o menor medo de gente. Elas é que vêm olhar você.' },
  { id: 'banco-do-sakura', name: 'Banco sob a Sakura', x: 34, z: 14, note: 'Uma sakura sozinha, fora de época o ano inteiro. Ninguém explica, ninguém reclama.' },
  { id: 'estufa-viveiro', name: 'Viveiro Éden', x: -28, z: -96, note: 'Mudas de tudo que cresce no Éden, inclusive do que ainda não tem nome.' },
  // Escondidos: fora dos caminhos, só para quem sai deles.
  { id: 'gruta-atras-da-agua', name: 'Gruta atrás da Água', x: -118, z: -122, note: 'Há espaço seco atrás da queda. Alguém deixou um banco aqui, faz tempo.', hidden: true },
  { id: 'clareira-silenciosa', name: 'Clareira Silenciosa', x: 124, z: 40, note: 'Nenhum caminho leva até aqui. O som do parque não chega, e isso é proposital.', hidden: true },
  { id: 'raiz-antiga', name: 'Raiz Antiga', x: -150, z: -20, note: 'A árvore caiu antes de o parque existir. Deixaram onde estava, e virou ponte.', hidden: true },
]);

/* ------------------------------- bosques --------------------------------- */

export interface Grove {
  x: number;
  z: number;
  radius: number;
  /** Que tipo de árvore domina. */
  kind: 'sakura' | 'tropical' | 'mista';
  density: number;
}

export const GROVES: readonly Grove[] = Object.freeze([
  { x: 40, z: 12, radius: 34, kind: 'sakura' as const, density: 0.55 },
  { x: -130, z: -110, radius: 38, kind: 'sakura' as const, density: 0.42 },
  { x: 84, z: 60, radius: 44, kind: 'tropical' as const, density: 0.62 },
  { x: -140, z: 118, radius: 36, kind: 'tropical' as const, density: 0.5 },
  { x: 112, z: -22, radius: 36, kind: 'mista' as const, density: 0.45 },
  { x: -10, z: 132, radius: 42, kind: 'mista' as const, density: 0.4 },
]);

/* ------------------------------- ajudantes -------------------------------- */

const lakeCos = Math.cos(LAKE.rotation);
const lakeSin = Math.sin(LAKE.rotation);

/** Distância elíptica normalizada ao lago (1 = linha d'água). */
export function lakeEllipse(x: number, z: number): number {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const lx = dx * lakeCos - dz * lakeSin;
  const lz = dx * lakeSin + dz * lakeCos;
  return Math.hypot(lx / LAKE.radiusX, lz / LAKE.radiusZ);
}

const basinCos = Math.cos(BASIN.rotation);
const basinSin = Math.sin(BASIN.rotation);

/** Distância elíptica normalizada à lagoa das cascatas. */
export function basinEllipse(x: number, z: number): number {
  const dx = x - BASIN.x;
  const dz = z - BASIN.z;
  const lx = dx * basinCos - dz * basinSin;
  const lz = dx * basinSin + dz * basinCos;
  return Math.hypot(lx / BASIN.radiusX, lz / BASIN.radiusZ);
}

/**
 * Ângulo de um ponto visto do centro do paredão, quando ele está na
 * faixa em que há queda d'água.
 *
 * Serve às cascatas e às pedras da encosta. O **relevo** não usa isto:
 * lá o degrau é o disco inteiro, senão ele vira uma cunha.
 */
export function cliffAngle(x: number, z: number): number | null {
  const angle = Math.atan2(z - CLIFF.z, x - CLIFF.x);
  const normalized = angle < 0 ? angle + TAU : angle;
  return normalized >= CLIFF.arcFrom && normalized <= CLIFF.arcTo ? normalized : null;
}

/** Quanto o paredão levanta o terreno num ponto (0 a 1). */
export function cliffLift(x: number, z: number): number {
  const d = Math.hypot(x - CLIFF.x, z - CLIFF.z);
  if (d > CLIFF.radius + CLIFF.blend) return 0;
  if (d < CLIFF.radius - CLIFF.blend) return 1;
  const t = (d - (CLIFF.radius + CLIFF.blend)) / (CLIFF.radius - CLIFF.blend - (CLIFF.radius + CLIFF.blend));
  return t * t * (3 - 2 * t);
}

/** Posição no mundo de uma queda d'água, na borda do paredão. */
export function waterfallPosition(fall: Waterfall): { x: number; z: number } {
  return { x: CLIFF.x + Math.cos(fall.angle) * CLIFF.crestRadius, z: CLIFF.z + Math.sin(fall.angle) * CLIFF.crestRadius };
}

/**
 * Pé de uma queda: onde a água bate e a espuma sobe.
 *
 * É **encosta abaixo** da crista, isto é, mais longe do centro do
 * paredão. Confundir os dois sentidos põe a cachoeira caindo morro
 * acima — que foi o que a planta mostrou antes desta função existir.
 */
export function waterfallFoot(fall: Waterfall): { x: number; z: number } {
  const radius = CLIFF.crestRadius + 33;
  return { x: CLIFF.x + Math.cos(fall.angle) * radius, z: CLIFF.z + Math.sin(fall.angle) * radius };
}
