import { WORLD } from '../../core/Config';
import { type Point2, TAU, smoothPolyline } from '../../utils/math';

/**
 * Planta de Aurora City.
 *
 * Todas as coordenadas estão em metros, com a Praça Central na origem.
 * Norte = -Z, Leste = +X. Este módulo é somente dados + funções puras:
 * é consumido pelo terreno, pelos construtores da cidade, pela vegetação,
 * pelo mapa do EdenPhone e pelos testes.
 */

export const H0 = WORLD.plateauHeight;

export const PLAZA = {
  x: 0,
  z: 0,
  radius: 46,
  /** Altura do piso da praça em relação ao platô (um degrau baixo). */
  lift: 0.16,
} as const;

/** Raio do núcleo urbano perfeitamente plano. */
export const CORE_FLAT_RADIUS = 124;

export const RING = {
  radius: 112,
  width: 7,
  lift: 0.12,
} as const;

export interface Avenue {
  id: string;
  name: string;
  /** Ângulo do eixo no plano XZ (0 = +X/leste, PI/2 = +Z/sul). */
  angle: number;
  from: number;
  to: number;
  width: number;
}

export const AVENUE_LIFT = 0.12;

export const AVENUES: readonly Avenue[] = [
  { id: 'norte', name: 'Avenida Boreal', angle: -Math.PI / 2, from: PLAZA.radius - 1, to: RING.radius - RING.width / 2 + 0.5, width: 10 },
  { id: 'leste', name: 'Avenida Alvorada', angle: 0, from: PLAZA.radius - 1, to: RING.radius - RING.width / 2 + 0.5, width: 10 },
  { id: 'sul', name: 'Avenida das Marés', angle: Math.PI / 2, from: PLAZA.radius - 1, to: RING.radius - RING.width / 2 + 0.5, width: 10 },
  { id: 'oeste', name: 'Avenida do Orvalho', angle: Math.PI, from: PLAZA.radius - 1, to: RING.radius - RING.width / 2 + 0.5, width: 10 },
];

/* ------------------------------------------------------------------ */
/* Parque das Águas                                                    */
/* ------------------------------------------------------------------ */

export const LAKE = {
  x: -166,
  z: 34,
  radiusX: 38,
  radiusZ: 27,
  rotation: 0.3,
  depth: 3.3,
} as const;

export const LAKE_ISLAND = {
  x: LAKE.x + 2,
  z: LAKE.z + 1,
  radius: 7.5,
  height: 1.15,
} as const;

/** Leito do rio: do lago até o mar. */
export const RIVER: readonly Point2[] = smoothPolyline(
  [
    { x: -160, z: 56 },
    { x: -152, z: 86 },
    { x: -134, z: 118 },
    { x: -121, z: 152 },
    { x: -113, z: 190 },
    { x: -108, z: 226 },
    { x: -104, z: 262 },
  ],
  6,
);

/* ------------------------------------------------------------------ */
/* Marcos naturais                                                     */
/* ------------------------------------------------------------------ */

export const HANGING_GARDENS = {
  x: -128,
  z: -128,
  /** Raios externos de cada terraço (do mais baixo ao mais alto). */
  tiers: [46, 33, 20] as const,
  tierRise: 2.5,
  riserWidth: 5,
} as const;

export const MIRANTE = {
  x: 176,
  z: 72,
  radius: 54,
  topRadius: 11,
  height: 16,
} as const;

export const BEACH = {
  /** Centro da faixa de areia larga, ao sul. */
  z: 196,
  halfWidth: 78,
  level: 0.6,
} as const;

export const PIER = {
  x: 0,
  zStart: 207,
  zEnd: 257,
  width: 6,
  deckY: 1.25,
} as const;

export const STAGE = {
  x: 90,
  z: 168,
  radius: 9,
} as const;

/* ------------------------------------------------------------------ */
/* Edifícios                                                           */
/* ------------------------------------------------------------------ */

export type BuildingKind = 'spire' | 'tower' | 'terraces' | 'dome' | 'arch' | 'pavilion';

export interface BuildingLot {
  id: string;
  name: string;
  kind: BuildingKind;
  x: number;
  z: number;
  /** Raio aproximado da base (para terreno, colisão e vegetação). */
  radius: number;
  height: number;
  /** Rotação da fachada principal. */
  rotation: number;
  /** Semente para variações procedurais. */
  seed: number;
  /** Descrição curta exibida em placas e no mapa. */
  description: string;
}

function facingPlaza(x: number, z: number): number {
  // Fachada voltada para a praça central.
  return Math.atan2(-x, -z);
}

function lot(
  id: string,
  name: string,
  kind: BuildingKind,
  x: number,
  z: number,
  radius: number,
  height: number,
  seed: number,
  description: string,
): BuildingLot {
  return { id, name, kind, x, z, radius, height, rotation: facingPlaza(x, z), seed, description };
}

export const BUILDINGS: readonly BuildingLot[] = [
  // Núcleo — quadrante nordeste
  lot('torre-zenite', 'Torre Zênite', 'tower', 64, -64, 14, 62, 11, 'Escritórios de luz e jardins verticais.'),
  lot('pavilhao-lumen', 'Pavilhão Lumen', 'dome', 30, -86, 11, 15, 12, 'Galeria de arte holográfica.'),
  lot('casa-das-mares', 'Casa das Marés', 'terraces', 86, -30, 12, 30, 13, 'Residências com varandas-jardim.'),
  // Núcleo — quadrante noroeste
  lot('torre-brisa', 'Torre Brisa', 'tower', -64, -64, 13, 52, 21, 'Centro de pesquisa atmosférica.'),
  lot('estufa-celeste', 'Estufa Celeste', 'dome', -30, -86, 12, 17, 22, 'Jardim botânico sob uma cúpula de vidro.'),
  lot('residencial-orvalho', 'Residencial Orvalho', 'terraces', -86, -30, 12, 26, 23, 'Moradias cercadas de verde.'),
  // Núcleo — quadrante sudeste
  lot('biblioteca-cristal', 'Biblioteca de Cristal', 'arch', 64, 64, 14, 30, 31, 'Acervo do Éden — futura sede do EdenReads.'),
  lot('cafe-nuvem', 'Café Nuvem', 'pavilion', 30, 86, 9, 9, 32, 'Ponto de encontro com vista para a praça.'),
  lot('centro-edenconnect', 'Centro Éden Connect', 'tower', 86, 30, 11, 38, 33, 'Coração dos serviços digitais do Éden.'),
  // Núcleo — quadrante sudoeste
  lot('atelie-aero', 'Ateliê Aero', 'dome', -64, 64, 11, 14, 41, 'Estúdio de estilo: recrie o visual do seu avatar.'),
  lot('mercado-eden', 'Mercado Éden', 'terraces', -30, 86, 10, 18, 42, 'Feira permanente — futura EdenStore.'),
  lot('casa-edenpawl', 'Casa EdenPawl', 'pavilion', -86, 30, 9, 9, 43, 'Abrigo dos companheiros do Éden (em breve).'),
  // Distrito Cristal — norte
  lot('torre-aurora', 'Torre Aurora', 'spire', 0, -174, 26, 128, 51, 'O pináculo de cristal que dá nome à cidade.'),
  lot('agulha-oeste', 'Agulha Poente', 'spire', -54, -160, 10, 64, 52, 'Torre de observação do Distrito Cristal.'),
  lot('agulha-leste', 'Agulha Nascente', 'spire', 54, -160, 10, 72, 53, 'Torre de comunicação do Distrito Cristal.'),
  // Vila das Nuvens — nordeste
  lot('torre-nimbus', 'Torre Nimbus', 'tower', 120, -118, 13, 46, 61, 'Residencial da Vila das Nuvens.'),
  lot('terracos-cirrus', 'Terraços Cirrus', 'terraces', 152, -78, 13, 32, 62, 'Jardins em degraus sobre o mar.'),
  lot('agulha-estelar', 'Agulha Estelar', 'spire', 96, -166, 9, 54, 63, 'Farol de luz da costa norte.'),
  lot('torre-stratus', 'Torre Stratus', 'tower', 150, -128, 11, 38, 64, 'Estúdios criativos da Vila das Nuvens.'),
  // Leste e sul
  lot('observatorio', 'Observatório Alvorada', 'dome', 150, -18, 12, 16, 71, 'Planetário voltado para o nascer do sol.'),
  lot('hotel-mare', 'Hotel Maré Alta', 'terraces', 52, 144, 13, 28, 72, 'Hospedagem com vista para a orla.'),
  lot('clube-nautico', 'Clube Náutico', 'pavilion', -48, 150, 10, 9, 73, 'Casa de barcos e esportes aquáticos.'),
];

export function getBuilding(id: string): BuildingLot {
  const found = BUILDINGS.find((b) => b.id === id);
  if (!found) throw new Error(`[Layout] Edifício desconhecido: ${id}`);
  return found;
}

/** Raio do pátio pavimentado ao redor de um edifício. */
export function forecourtRadius(lot: BuildingLot): number {
  return lot.radius + (lot.kind === 'spire' && lot.radius > 20 ? 14 : 6);
}

/* ------------------------------------------------------------------ */
/* Caminhos pintados no terreno (fora do núcleo pavimentado)           */
/* ------------------------------------------------------------------ */

export interface TerrainPath {
  id: string;
  points: Point2[];
  width: number;
}

function lakeLoop(): Point2[] {
  const points: Point2[] = [];
  const steps = 40;
  const scale = 1.42;
  const cos = Math.cos(LAKE.rotation);
  const sin = Math.sin(LAKE.rotation);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const lx = Math.cos(a) * LAKE.radiusX * scale;
    const lz = Math.sin(a) * LAKE.radiusZ * scale;
    points.push({ x: LAKE.x + lx * cos + lz * sin, z: LAKE.z - lx * sin + lz * cos });
  }
  return points;
}

function spiral(cx: number, cz: number, r0: number, r1: number, a0: number, turns: number, steps: number): Point2[] {
  const points: Point2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = r0 + (r1 - r0) * t;
    const a = a0 + turns * TAU * t;
    points.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
  }
  return points;
}

const ringEdge = RING.radius + RING.width / 2 - 0.5;
const D = Math.SQRT1_2;

export const TERRAIN_PATHS: readonly TerrainPath[] = [
  { id: 'lago-volta', points: lakeLoop(), width: 3.2 },
  {
    id: 'parque-entrada',
    points: smoothPolyline(
      [
        { x: -ringEdge, z: 0 },
        { x: -128, z: 3 },
        { x: -140, z: -6 },
        { x: -152, z: -10 },
      ],
      5,
    ),
    width: 4,
  },
  {
    id: 'parque-jardim-leste',
    points: smoothPolyline(
      [
        { x: -ringEdge * Math.cos(0.42), z: ringEdge * Math.sin(0.42) },
        { x: -122, z: 52 },
        { x: -124, z: 70 },
        { x: -131, z: 82 },
      ],
      5,
    ),
    width: 3,
  },
  {
    id: 'rio-margem',
    points: smoothPolyline(
      [
        { x: -139, z: 84 },
        { x: -136, z: 100 },
        { x: -120, z: 124 },
        { x: -107, z: 154 },
        { x: -99, z: 186 },
        { x: -84, z: 200 },
        { x: -50, z: 204 },
        { x: -18, z: 205 },
        { x: 0, z: 205 },
      ],
      6,
    ),
    width: 3,
  },
  {
    id: 'orla-sul',
    points: smoothPolyline(
      [
        { x: 0, z: ringEdge },
        { x: 0, z: 140 },
        { x: 0, z: 172 },
        { x: 0, z: 208 },
      ],
      4,
    ),
    width: 5,
  },
  {
    id: 'orla-leste',
    points: smoothPolyline(
      [
        { x: 0, z: 205 },
        { x: 30, z: 203 },
        { x: 62, z: 194 },
        { x: 84, z: 182 },
      ],
      5,
    ),
    width: 3,
  },
  {
    id: 'palco',
    points: smoothPolyline(
      [
        { x: ringEdge * D, z: ringEdge * D },
        { x: 86, z: 112 },
        { x: 78, z: 134 },
        { x: 84, z: 156 },
      ],
      5,
    ),
    width: 3.4,
  },
  {
    id: 'hotel',
    points: [
      { x: 78, z: 134 },
      { x: 66, z: 140 },
    ],
    width: 3,
  },
  {
    id: 'clube',
    points: smoothPolyline(
      [
        { x: 0, z: 150 },
        { x: -20, z: 152 },
        { x: -36, z: 150 },
      ],
      4,
    ),
    width: 3,
  },
  {
    id: 'jardins-suspensos',
    points: smoothPolyline(
      [
        { x: -ringEdge * D, z: -ringEdge * D },
        { x: -96, z: -100 },
        { x: -110, z: -112 },
        { x: -128, z: -128 },
      ],
      5,
    ),
    width: 3.6,
  },
  {
    id: 'distrito-cristal',
    points: [
      { x: 0, z: -ringEdge },
      { x: 0, z: -136 },
    ],
    width: 7,
  },
  {
    id: 'agulhas',
    points: smoothPolyline(
      [
        { x: -44, z: -160 },
        { x: -34, z: -150 },
        { x: 0, z: -140 },
        { x: 34, z: -150 },
        { x: 44, z: -160 },
      ],
      5,
    ),
    width: 3,
  },
  {
    id: 'vila-nuvens',
    points: smoothPolyline(
      [
        { x: ringEdge * D, z: -ringEdge * D },
        { x: 100, z: -104 },
        { x: 110, z: -112 },
      ],
      4,
    ),
    width: 3.4,
  },
  {
    id: 'vila-nuvens-leste',
    points: smoothPolyline(
      [
        { x: 104, z: -106 },
        { x: 124, z: -96 },
        { x: 140, z: -84 },
      ],
      4,
    ),
    width: 3,
  },
  {
    id: 'vila-nuvens-norte',
    points: smoothPolyline(
      [
        { x: 104, z: -106 },
        { x: 104, z: -134 },
        { x: 100, z: -156 },
      ],
      4,
    ),
    width: 3,
  },
  {
    id: 'vila-stratus',
    points: smoothPolyline(
      [
        { x: 124, z: -96 },
        { x: 136, z: -108 },
        { x: 142, z: -120 },
      ],
      4,
    ),
    width: 3,
  },
  {
    id: 'observatorio',
    points: smoothPolyline(
      [
        { x: ringEdge, z: 0 },
        { x: 128, z: -6 },
        { x: 139, z: -13 },
      ],
      4,
    ),
    width: 3.4,
  },
  {
    id: 'mirante-acesso',
    points: smoothPolyline(
      [
        { x: ringEdge * Math.cos(0.3), z: ringEdge * Math.sin(0.3) },
        { x: 128, z: 44 },
        { x: 136, z: 56 },
      ],
      4,
    ),
    width: 3.4,
  },
  {
    id: 'mirante-espiral',
    points: spiral(MIRANTE.x, MIRANTE.z, 42, 8, Math.PI + 0.38, 1.15, 44),
    width: 3,
  },
];

/* ------------------------------------------------------------------ */
/* Pontos nomeados                                                     */
/* ------------------------------------------------------------------ */

export interface NamedArea {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

/** Subáreas exibidas no HUD conforme a posição do jogador (ordem = prioridade). */
export const AREAS: readonly NamedArea[] = [
  { id: 'praca', name: 'Praça Central', x: 0, z: 0, radius: PLAZA.radius + 4 },
  { id: 'ilha', name: 'Ilha do Gazebo', x: LAKE_ISLAND.x, z: LAKE_ISLAND.z, radius: LAKE_ISLAND.radius + 3 },
  { id: 'parque', name: 'Parque das Águas', x: LAKE.x + 8, z: LAKE.z + 6, radius: 76 },
  { id: 'jardins', name: 'Jardins Suspensos', x: HANGING_GARDENS.x, z: HANGING_GARDENS.z, radius: 52 },
  { id: 'mirante', name: 'Mirante Celeste', x: MIRANTE.x, z: MIRANTE.z, radius: 52 },
  { id: 'pier', name: 'Píer da Orla', x: PIER.x, z: (PIER.zStart + PIER.zEnd) / 2, radius: 27 },
  { id: 'palco', name: 'Palco Aurora', x: STAGE.x, z: STAGE.z, radius: 22 },
  { id: 'cristal', name: 'Distrito Cristal', x: 0, z: -168, radius: 74 },
  { id: 'nuvens', name: 'Vila das Nuvens', x: 130, z: -112, radius: 62 },
  { id: 'orla', name: 'Orla Cristalina', x: 0, z: 214, radius: 96 },
  { id: 'centro', name: 'Centro de Aurora', x: 0, z: 0, radius: CORE_FLAT_RADIUS },
];

export function areaAt(x: number, z: number): NamedArea | null {
  for (const area of AREAS) {
    if (Math.hypot(x - area.x, z - area.z) <= area.radius) return area;
  }
  return null;
}

/** Raio da linha de costa em função do ângulo (ilha de contorno orgânico). */
export function coastRadius(angle: number): number {
  return 232 + 10 * Math.sin(2 * angle + 0.6) + 6 * Math.sin(3 * angle + 2.1) + 3 * Math.sin(5 * angle + 4.0);
}

/** Ponto de partida de um novo jogador: borda sul da praça, olhando para a esfera. */
export const SPAWN = { x: 0, z: 30, heading: Math.PI } as const;
