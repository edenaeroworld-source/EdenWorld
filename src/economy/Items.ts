/**
 * Catálogo de itens e lojas do Éden.
 *
 * Regra que organiza tudo aqui: **um item comprado tem efeito**. Se um
 * item não faz nada no jogo, ele não entra no catálogo. Por isso cada
 * item declara o que é capaz (`use`), e não apenas um preço e um ícone.
 *
 * Módulo puro: dados e consultas. Quem debita a carteira é `Wallet`,
 * quem guarda é `Inventory`, quem vende é `Store`.
 */

/** O que o item faz quando o jogador age sobre ele. */
export type ItemUse =
  /** Mobília: pode ser colocada numa casa. */
  | 'mobilia'
  /** Eletrônico: pode ser colocado e ligado (computador, console). */
  | 'eletronico'
  /** Roupa ou acessório: muda a aparência do avatar. */
  | 'vestuario'
  /** Cosmético Afters: ajusta a silhueta pelo painel existente. */
  | 'afters'
  /** Item de bicho: comida, brinquedo ou acessório. */
  | 'pet'
  /** Instrumento: toca, e serve para atividades de música. */
  | 'instrumento'
  /** Consumível: some depois de usado. */
  | 'consumivel'
  /** Guardado como lembrança. Não faz nada além de existir. */
  | 'lembranca';

export interface EdenItem {
  id: string;
  name: string;
  /** Descrição curta, do jeito que a loja anunciaria. */
  note: string;
  /** Preço em Cristais (a moeda do Éden). */
  price: number;
  use: ItemUse;
  /** Loja-marca que vende (ver `STORE_BRANDS`). */
  brand: string;
  /** Quantas unidades cabem numa pilha do inventário. */
  stack: number;
  /**
   * Para mobília e eletrônicos: espaço ocupado na casa, em células.
   * A grade da casa é de 0,5 m por célula (ver `src/housing`).
   */
  footprint?: { w: number; d: number };
  /** Para eletrônicos: que tela o objeto abre quando é usado. */
  opens?: 'edenphone' | 'computador' | 'console' | 'tv' | 'som';
  /** Para itens de bicho: que necessidade ele atende. */
  pet?: { need: 'fome' | 'diversao' | 'higiene' | 'carinho'; amount: number };
}

/** As marcas de loja do Éden. */
export const STORE_BRANDS = Object.freeze({
  edentech: { id: 'edentech', name: 'EdenTech', note: 'Tecnologia do Éden: EdenPhone, computadores e periféricos.', colors: ['#8fe6ff', '#1b82ea'] },
  edengame: { id: 'edengame', name: 'EdenGame', note: 'Consoles, jogos e o que for preciso para jogar.', colors: ['#c9a6ff', '#7a3fe0'] },
  afters: { id: 'afters', name: 'Afters Store', note: 'O catálogo da Luma. Silhueta é escolha.', colors: ['#ffc1d6', '#f0588c'] },
  edenpawl: { id: 'edenpawl', name: 'EdenPawl', note: 'Tudo para quem tem quatro patas, duas asas ou nenhuma perna.', colors: ['#ffd9a6', '#ef9a2e'] },
  edenhome: { id: 'edenhome', name: 'EdenHome', note: 'Móveis, eletrodomésticos e decoração.', colors: ['#b9f5c4', '#2f9e5e'] },
  edenfashion: { id: 'edenfashion', name: 'EdenFashion', note: 'Roupa e acessório para o avatar.', colors: ['#ffe28a', '#e0821b'] },
  edenmusic: { id: 'edenmusic', name: 'EdenMusic', note: 'Instrumentos, áudio e o que faz barulho bonito.', colors: ['#d6b8ff', '#8a5be0'] },
} as const);

export type StoreBrandId = keyof typeof STORE_BRANDS;

/**
 * Os itens do Éden.
 *
 * Lista aberta de propósito: `registerItem` deixa qualquer sistema
 * acrescentar catálogo sem editar este arquivo.
 */
const ITEMS: EdenItem[] = [
  // ---- EdenTech -------------------------------------------------------
  { id: 'edenphone-aero', name: 'EdenPhone Aero', note: 'O aparelho padrão do Éden. Você já tem um; este é reserva.', price: 420, use: 'eletronico', brand: 'edentech', stack: 1, opens: 'edenphone', footprint: { w: 1, d: 1 } },
  { id: 'computador-zenite', name: 'Computador Zênite', note: 'Mesa, tela e teclado. Liga de verdade quando colocado em casa.', price: 980, use: 'eletronico', brand: 'edentech', stack: 1, opens: 'computador', footprint: { w: 3, d: 2 } },
  { id: 'notebook-brisa', name: 'Notebook Brisa', note: 'Leve o bastante para levar ao mirante.', price: 720, use: 'eletronico', brand: 'edentech', stack: 1, opens: 'computador', footprint: { w: 2, d: 1 } },
  { id: 'tv-horizonte', name: 'TV Horizonte', note: 'Tela grande. Passa o que o Éden estiver transmitindo.', price: 640, use: 'eletronico', brand: 'edentech', stack: 1, opens: 'tv', footprint: { w: 4, d: 1 } },
  { id: 'fone-aurora', name: 'Fone Aurora', note: 'Abafa a cidade inteira se você quiser.', price: 180, use: 'vestuario', brand: 'edentech', stack: 1 },

  // ---- EdenGame -------------------------------------------------------
  { id: 'console-eden64', name: 'Console Éden 64', note: 'O console da casa. Colocado na sala, abre os jogos.', price: 890, use: 'eletronico', brand: 'edengame', stack: 1, opens: 'console', footprint: { w: 2, d: 1 } },
  { id: 'controle-extra', name: 'Controle extra', note: 'Para quando alguém aparecer.', price: 120, use: 'lembranca', brand: 'edengame', stack: 4 },
  { id: 'cadeira-gamer', name: 'Cadeira de jogo', note: 'Reclina mais do que deveria.', price: 460, use: 'mobilia', brand: 'edengame', stack: 1, footprint: { w: 2, d: 2 } },

  // ---- Afters Store ---------------------------------------------------
  { id: 'afters-sessao', name: 'Sessão Afters', note: 'Uma sessão no ateliê: ajusta AfterBust® e AfterCurve® como você quiser.', price: 250, use: 'afters', brand: 'afters', stack: 9 },
  { id: 'afters-brilho', name: 'Acabamento Brilho', note: 'Acabamento cosmético da linha Afters.', price: 150, use: 'afters', brand: 'afters', stack: 9 },

  // ---- EdenPawl -------------------------------------------------------
  { id: 'racao-comum', name: 'Ração do dia', note: 'Serve para quase todo bicho de casa.', price: 24, use: 'pet', brand: 'edenpawl', stack: 20, pet: { need: 'fome', amount: 0.45 } },
  { id: 'petisco-luar', name: 'Petisco Luar', note: 'O preferido. Use com parcimônia, ou não.', price: 48, use: 'pet', brand: 'edenpawl', stack: 20, pet: { need: 'carinho', amount: 0.3 } },
  { id: 'bolinha', name: 'Bolinha', note: 'Quica mais do que o esperado.', price: 36, use: 'pet', brand: 'edenpawl', stack: 5, pet: { need: 'diversao', amount: 0.5 } },
  { id: 'arranhador', name: 'Arranhador', note: 'Móvel de bicho. Vai na casa.', price: 210, use: 'mobilia', brand: 'edenpawl', stack: 1, footprint: { w: 2, d: 2 } },
  { id: 'caminha', name: 'Caminha', note: 'Macia. Eles dormem ali mesmo que você compre outra coisa.', price: 160, use: 'mobilia', brand: 'edenpawl', stack: 1, footprint: { w: 3, d: 2 } },
  { id: 'escova-macia', name: 'Escova macia', note: 'Para o pelo e para o sossego.', price: 54, use: 'pet', brand: 'edenpawl', stack: 3, pet: { need: 'higiene', amount: 0.6 } },

  // ---- EdenHome -------------------------------------------------------
  { id: 'sofa-nuvem', name: 'Sofá Nuvem', note: 'Três lugares. Afunda bem.', price: 540, use: 'mobilia', brand: 'edenhome', stack: 1, footprint: { w: 5, d: 2 } },
  { id: 'mesa-vidro', name: 'Mesa de vidro', note: 'Mostra tudo que você deixa em cima.', price: 320, use: 'mobilia', brand: 'edenhome', stack: 1, footprint: { w: 4, d: 2 } },
  { id: 'cama-aurora', name: 'Cama Aurora', note: 'O dia começa e termina aqui.', price: 760, use: 'mobilia', brand: 'edenhome', stack: 1, footprint: { w: 4, d: 5 } },
  { id: 'estante-livros', name: 'Estante', note: 'Cabe mais do que parece.', price: 280, use: 'mobilia', brand: 'edenhome', stack: 1, footprint: { w: 3, d: 1 } },
  { id: 'luminaria-lumen', name: 'Luminária Lúmen', note: 'Luz quente, do tipo que não cansa.', price: 140, use: 'mobilia', brand: 'edenhome', stack: 2, footprint: { w: 1, d: 1 } },
  { id: 'vaso-samambaia', name: 'Samambaia', note: 'Viva. Precisa de água de vez em quando.', price: 70, use: 'mobilia', brand: 'edenhome', stack: 4, footprint: { w: 1, d: 1 } },
  { id: 'tapete-aero', name: 'Tapete Aero', note: 'Padrão da casa. Fica bem em qualquer sala.', price: 190, use: 'mobilia', brand: 'edenhome', stack: 2, footprint: { w: 6, d: 4 } },

  // ---- EdenFashion ----------------------------------------------------
  { id: 'casaco-aurora', name: 'Casaco Aurora', note: 'Para as noites da cidade alta.', price: 340, use: 'vestuario', brand: 'edenfashion', stack: 1 },
  { id: 'tenis-brisa', name: 'Tênis Brisa', note: 'Leve. Não faz barulho no mármore.', price: 260, use: 'vestuario', brand: 'edenfashion', stack: 1 },
  { id: 'cachecol-lumen', name: 'Cachecol Lúmen', note: 'Brilha devagar no escuro.', price: 150, use: 'vestuario', brand: 'edenfashion', stack: 1 },

  // ---- EdenMusic ------------------------------------------------------
  { id: 'violao-eden', name: 'Violão Éden', note: 'Madeira clara, corda de náilon.', price: 580, use: 'instrumento', brand: 'edenmusic', stack: 1, footprint: { w: 1, d: 1 } },
  { id: 'guitarra-skystone', name: 'Guitarra SkyStone', note: 'Feita em SkyStones. Soa como lá.', price: 1240, use: 'instrumento', brand: 'edenmusic', stack: 1, footprint: { w: 1, d: 1 } },
  { id: 'teclado-bitnara', name: 'Teclado Bitnara', note: 'Oitenta e oito teclas e luzes demais.', price: 1100, use: 'instrumento', brand: 'edenmusic', stack: 1, footprint: { w: 4, d: 1 } },
  { id: 'microfone-encore', name: 'Microfone Encore', note: 'O mesmo modelo do Estúdio Bitnara.', price: 420, use: 'instrumento', brand: 'edenmusic', stack: 1, footprint: { w: 1, d: 1 } },
];

const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

/** Acrescenta um item ao catálogo. Erra alto se o id repetir. */
export function registerItem(item: EdenItem): EdenItem {
  if (ITEM_BY_ID.has(item.id)) throw new Error(`[Items] Item já registrado: ${item.id}`);
  ITEMS.push(item);
  ITEM_BY_ID.set(item.id, item);
  return item;
}

export function getItem(id: string): EdenItem | undefined {
  return ITEM_BY_ID.get(id);
}

export function allItems(): readonly EdenItem[] {
  return ITEMS;
}

export function itemsOfBrand(brand: string): EdenItem[] {
  return ITEMS.filter((item) => item.brand === brand);
}

/* ------------------------------ as lojas ------------------------------- */

export interface EdenStore {
  id: string;
  /** Marca a que a loja pertence. */
  brand: StoreBrandId;
  name: string;
  /** Região onde fica. */
  region: string;
  /** Lugar dentro da região (`RegionPlace.id`). */
  place: string;
  /** Hora de abrir e de fechar (0–24). Fora disso, a porta está trancada. */
  opens: number;
  closes: number;
  /** Itens à venda. Vazio = tudo da marca. */
  stock: readonly string[];
  /** Quem atende. Pode ser um personagem do panteão ou um morador. */
  keeper?: string;
}

const STORES: EdenStore[] = [
  { id: 'edentech-aurora', brand: 'edentech', name: 'EdenTech Aurora', region: 'aurora-city', place: 'torre-zenite', opens: 9, closes: 21, stock: [], keeper: 'nexara' },
  { id: 'edenhome-aurora', brand: 'edenhome', name: 'EdenHome Aurora', region: 'aurora-city', place: 'mercado-eden', opens: 8, closes: 20, stock: [], keeper: 'akemi' },
  { id: 'edenpawl-aurora', brand: 'edenpawl', name: 'EdenPawl Aurora', region: 'aurora-city', place: 'casa-edenpawl', opens: 7, closes: 19, stock: [], keeper: 'saturno' },
  { id: 'afters-atelie', brand: 'afters', name: 'Afters Store — Ateliê Aero', region: 'aurora-city', place: 'atelie-aero', opens: 10, closes: 22, stock: [], keeper: 'luma' },
  { id: 'edenmusic-bitnara', brand: 'edenmusic', name: 'EdenMusic Bitnara', region: 'bitnara', place: 'loja-edenmusic-bit', opens: 11, closes: 23, stock: [] },
  { id: 'edenfashion-bitnara', brand: 'edenfashion', name: 'EdenFashion Bitnara', region: 'bitnara', place: 'praca-dos-idolos', opens: 10, closes: 22, stock: [] },
  { id: 'edenmusic-skystones', brand: 'edenmusic', name: 'EdenMusic SkyStones', region: 'skystones', place: 'oficina-amp', opens: 10, closes: 22, stock: [] },
  { id: 'edenpawl-rosas', brand: 'edenpawl', name: 'EdenPawl Rosas Park', region: 'rosas-park', place: 'santuario-rosas', opens: 7, closes: 18, stock: [], keeper: 'saturno' },
  { id: 'edenhome-rosas', brand: 'edenhome', name: 'EdenHome Rosas Park', region: 'rosas-park', place: 'casa-de-cha', opens: 9, closes: 19, stock: [] },
  { id: 'mercado-sussurro', brand: 'edentech', name: 'Mercado Sussurro', region: 'noureja-nether', place: 'mercado-sussurro', opens: 0, closes: 24, stock: ['edenphone-aero', 'notebook-brisa', 'fone-aurora'] },
  { id: 'edenfashion-liberdade', brand: 'edenfashion', name: 'EdenFashion Liberdade', region: 'cidade-da-liberdade', place: 'feira-da-liberdade', opens: 9, closes: 21, stock: [] },
  { id: 'feira-liberdade', brand: 'edenhome', name: 'Feira da Liberdade', region: 'cidade-da-liberdade', place: 'feira-da-liberdade', opens: 8, closes: 17, stock: [] },
  { id: 'edengame-aurora', brand: 'edengame', name: 'EdenGame Aurora', region: 'aurora-city', place: 'mercado-eden', opens: 10, closes: 22, stock: [] },
];

const STORE_BY_ID = new Map(STORES.map((store) => [store.id, store]));

export function registerStore(store: EdenStore): EdenStore {
  if (STORE_BY_ID.has(store.id)) throw new Error(`[Items] Loja já registrada: ${store.id}`);
  STORES.push(store);
  STORE_BY_ID.set(store.id, store);
  return store;
}

export function getStore(id: string): EdenStore | undefined {
  return STORE_BY_ID.get(id);
}

export function allStores(): readonly EdenStore[] {
  return STORES;
}

export function storesInRegion(regionId: string): EdenStore[] {
  return STORES.filter((store) => store.region === regionId);
}

/** O que esta loja tem à venda hoje. */
export function storeStock(store: EdenStore): EdenItem[] {
  if (store.stock.length > 0) return store.stock.map((id) => getItem(id)).filter((item): item is EdenItem => Boolean(item));
  return itemsOfBrand(store.brand);
}

/**
 * A loja está aberta a esta hora?
 *
 * Lojas que atravessam a meia-noite (`opens` > `closes`) são tratadas
 * corretamente — o Mercado Sussurro de Noureja abre sempre.
 */
export function storeIsOpen(store: EdenStore, hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  if (store.opens === 0 && store.closes === 24) return true;
  if (store.opens <= store.closes) return h >= store.opens && h < store.closes;
  return h >= store.opens || h < store.closes;
}
