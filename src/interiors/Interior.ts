/**
 * Interiores: entrar nos prédios.
 *
 * Um interior é uma cena própria, carregada só quando alguém entra e
 * liberada quando sai. É isso que permite ter dezenas de portas no
 * mundo sem carregar dezenas de cenas na memória — especialmente no
 * celular, onde carregar tudo não é uma opção.
 *
 * O `InteriorManager` guarda o caminho de volta: ao sair, o jogador
 * reaparece na porta por onde entrou, virado para fora, e não no meio
 * da rua nem no centro da região.
 *
 * Módulo puro: sem Three.js, sem DOM. Quem instancia a geometria é a
 * camada de cenário, lendo `InteriorDef`.
 */

export type InteriorCategory =
  | 'casa'
  | 'apartamento'
  | 'shopping'
  | 'tecnologia'
  | 'jogos'
  | 'petshop'
  | 'restaurante'
  | 'escola'
  | 'hospital'
  | 'estudio'
  | 'cinema'
  | 'hotel'
  | 'santuario'
  | 'publico'
  | 'cultura';

/** Um cômodo do interior, em metros. */
export interface InteriorRoom {
  id: string;
  name: string;
  /** Canto inferior-esquerdo em coordenadas locais do interior. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Andar. 0 é o térreo. */
  floor: number;
}

/** Objeto com que dá para interagir dentro do interior. */
export interface InteriorProp {
  id: string;
  name: string;
  x: number;
  z: number;
  floor: number;
  /** O que acontece ao interagir. */
  action: 'sentar' | 'olhar' | 'comprar' | 'conversar' | 'usar' | 'subir' | 'descer';
  note: string;
}

export interface InteriorDef {
  id: string;
  name: string;
  category: InteriorCategory;
  /** Região e lugar onde fica a porta de entrada. */
  regionId: string;
  placeId: string;
  /** Quantos andares. */
  floors: number;
  rooms: readonly InteriorRoom[];
  props: readonly InteriorProp[];
  /** Moradores/atendentes de dentro (ids do panteão ou perfis). */
  residents: readonly string[];
  /** Loja que funciona aqui, quando há uma. */
  shopId?: string;
  /** Clima de iluminação interna. */
  lighting: 'quente' | 'fria' | 'neon' | 'natural' | 'penumbra';
  /** Onde o jogador aparece ao entrar, em coordenadas locais. */
  spawn: { x: number; z: number; heading: number };
  note: string;
}

const INTERIORS: InteriorDef[] = [
  {
    id: 'atelie-aero',
    name: 'Ateliê Aero',
    category: 'tecnologia',
    regionId: 'aurora-city',
    placeId: 'atelie-aero',
    floors: 1,
    rooms: [
      { id: 'salao', name: 'Salão', x: 0, z: 0, w: 14, d: 10, floor: 0 },
      { id: 'cabine', name: 'Cabine de ajuste', x: 14, z: 2, w: 6, d: 6, floor: 0 },
    ],
    props: [
      { id: 'balcao', name: 'Balcão', x: 7, z: 2, floor: 0, action: 'comprar', note: 'O catálogo Afters inteiro.' },
      { id: 'espelho', name: 'Espelho de ajuste', x: 17, z: 5, floor: 0, action: 'usar', note: 'Abre o painel Afters.' },
      { id: 'sofa-espera', name: 'Sofá de espera', x: 3, z: 8, floor: 0, action: 'sentar', note: 'Confortável demais para a pressa de ninguém.' },
    ],
    residents: ['luma'],
    shopId: 'afters-atelie',
    lighting: 'quente',
    spawn: { x: 7, z: 9, heading: 0 },
    note: 'O ateliê onde os Afters foram inventados.',
  },
  {
    id: 'mercado-eden',
    name: 'Mercado Éden',
    category: 'shopping',
    regionId: 'aurora-city',
    placeId: 'mercado-eden',
    floors: 2,
    rooms: [
      { id: 'terreo', name: 'Térreo', x: 0, z: 0, w: 24, d: 18, floor: 0 },
      { id: 'galeria', name: 'Galeria', x: 0, z: 0, w: 24, d: 18, floor: 1 },
    ],
    props: [
      { id: 'banca-akemi', name: 'Banca da Akemi', x: 6, z: 4, floor: 0, action: 'comprar', note: 'Pão, fruta e conversa.' },
      { id: 'escada', name: 'Escada', x: 22, z: 16, floor: 0, action: 'subir', note: 'Leva à galeria.' },
      { id: 'edenhome-balcao', name: 'EdenHome', x: 8, z: 6, floor: 1, action: 'comprar', note: 'Móveis e decoração.' },
      { id: 'edengame-balcao', name: 'EdenGame', x: 16, z: 6, floor: 1, action: 'comprar', note: 'Consoles e jogos.' },
      { id: 'escada-desce', name: 'Escada', x: 22, z: 16, floor: 1, action: 'descer', note: 'Volta ao térreo.' },
    ],
    residents: ['akemi'],
    shopId: 'edenhome-aurora',
    lighting: 'natural',
    spawn: { x: 12, z: 17, heading: 0 },
    note: 'Dois andares. Cheira a pão quente no térreo.',
  },
  {
    id: 'edenpawl-aurora',
    name: 'Casa EdenPawl',
    category: 'petshop',
    regionId: 'aurora-city',
    placeId: 'casa-edenpawl',
    floors: 1,
    rooms: [
      { id: 'loja', name: 'Loja', x: 0, z: 0, w: 16, d: 12, floor: 0 },
      { id: 'adocao', name: 'Sala de adoção', x: 16, z: 1, w: 12, d: 10, floor: 0 },
    ],
    props: [
      { id: 'prateleiras', name: 'Prateleiras', x: 4, z: 3, floor: 0, action: 'comprar', note: 'Ração, brinquedo e escova.' },
      { id: 'saturno-mesa', name: 'Mesa de Saturno', x: 20, z: 3, floor: 0, action: 'conversar', note: 'Ela decide quem leva quem.' },
      { id: 'recanto', name: 'Recanto dos bichos', x: 22, z: 7, floor: 0, action: 'olhar', note: 'Quem está esperando uma casa.' },
    ],
    residents: ['saturno'],
    shopId: 'edenpawl-aurora',
    lighting: 'quente',
    spawn: { x: 8, z: 11, heading: 0 },
    note: 'A casa de Saturno. Entra bicho, sai bicho, entra gente.',
  },
  {
    id: 'torre-zenite',
    name: 'Torre Zênite',
    category: 'tecnologia',
    regionId: 'aurora-city',
    placeId: 'torre-zenite',
    floors: 3,
    rooms: [
      { id: 'recepcao', name: 'Recepção', x: 0, z: 0, w: 18, d: 12, floor: 0 },
      { id: 'edentech', name: 'EdenTech', x: 0, z: 0, w: 18, d: 12, floor: 1 },
      { id: 'laboratorio', name: 'Laboratório', x: 0, z: 0, w: 18, d: 12, floor: 2 },
    ],
    props: [
      { id: 'elevador', name: 'Elevador', x: 16, z: 10, floor: 0, action: 'subir', note: 'Três andares.' },
      { id: 'vitrine-tech', name: 'Vitrine EdenTech', x: 6, z: 4, floor: 1, action: 'comprar', note: 'Computadores, telas, EdenPhone.' },
      { id: 'nexara-posto', name: 'Posto da Nexara', x: 9, z: 4, floor: 2, action: 'conversar', note: 'Daqui ela cuida das redes do Éden.' },
    ],
    residents: ['nexara'],
    shopId: 'edentech-aurora',
    lighting: 'fria',
    spawn: { x: 9, z: 11, heading: 0 },
    note: 'A torre que mantém o Éden conectado.',
  },
  {
    id: 'estudio-bitnara',
    name: 'Estúdio Bitnara',
    category: 'estudio',
    regionId: 'bitnara',
    placeId: 'estudio-bitnara',
    floors: 1,
    rooms: [
      { id: 'sala-tecnica', name: 'Sala técnica', x: 0, z: 0, w: 10, d: 8, floor: 0 },
      { id: 'cabine-voz', name: 'Cabine de voz', x: 10, z: 1, w: 6, d: 6, floor: 0 },
    ],
    props: [
      { id: 'mesa-som', name: 'Mesa de som', x: 5, z: 2, floor: 0, action: 'usar', note: 'Grava o que estiver sendo cantado.' },
      { id: 'microfone', name: 'Microfone', x: 13, z: 4, floor: 0, action: 'usar', note: 'Acende quando alguém entra na cabine.' },
    ],
    residents: [],
    lighting: 'neon',
    spawn: { x: 5, z: 7, heading: 0 },
    note: 'Paredes tratadas. Nada vaza daqui.',
  },
  {
    id: 'santuario-rosas',
    name: 'Santuário de Rosas Park',
    category: 'santuario',
    regionId: 'rosas-park',
    placeId: 'santuario-rosas',
    floors: 1,
    rooms: [{ id: 'abrigo', name: 'Abrigo', x: 0, z: 0, w: 20, d: 16, floor: 0 }],
    props: [
      { id: 'posto-cuidados', name: 'Posto de cuidados', x: 5, z: 4, floor: 0, action: 'usar', note: 'Onde os bichos resgatados se recuperam.' },
      { id: 'saturno-rosas', name: 'Saturno', x: 12, z: 6, floor: 0, action: 'conversar', note: 'Ela passa mais tempo aqui do que admite.' },
    ],
    residents: ['saturno'],
    shopId: 'edenpawl-rosas',
    lighting: 'natural',
    spawn: { x: 10, z: 15, heading: 0 },
    note: 'Silêncio obrigatório. Os bichos agradecem.',
  },
];

const BY_ID = new Map(INTERIORS.map((interior) => [interior.id, interior]));

export function registerInterior(interior: InteriorDef): InteriorDef {
  if (BY_ID.has(interior.id)) throw new Error(`[Interior] Interior já registrado: ${interior.id}`);
  INTERIORS.push(interior);
  BY_ID.set(interior.id, interior);
  return interior;
}

export function getInterior(id: string): InteriorDef | undefined {
  return BY_ID.get(id);
}

export function allInteriors(): readonly InteriorDef[] {
  return INTERIORS;
}

export function interiorsInRegion(regionId: string): InteriorDef[] {
  return INTERIORS.filter((interior) => interior.regionId === regionId);
}

/** Cômodos de um andar. */
export function roomsOnFloor(interior: InteriorDef, floor: number): InteriorRoom[] {
  return interior.rooms.filter((room) => room.floor === floor);
}

/** O ponto no mundo exterior a que a saída deste interior devolve. */
export interface ExitPoint {
  regionId: string;
  x: number;
  z: number;
  heading: number;
}
