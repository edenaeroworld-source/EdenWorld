/**
 * Moradia: ter uma casa, entrar nela e arrumá-la.
 *
 * A casa é uma grade de células de 0,5 m. Um móvel ocupa um retângulo
 * de células e não pode sobrepor outro — é isto que impede o jogador de
 * empilhar o sofá dentro da cama. A grade também é o que torna o
 * salvamento barato: guardar `{item, x, z, rot}` por móvel, nada mais.
 *
 * Módulo puro: sem Three.js, sem DOM.
 */

import { type EdenItem, getItem } from '../economy/Items';

/** Lado de uma célula da grade, em metros. */
export const CELL = 0.5;

export type PropertyKind = 'apartamento' | 'casa' | 'estudio' | 'loft';

/** Um imóvel que existe no mundo e pode ser comprado ou alugado. */
export interface Property {
  id: string;
  name: string;
  kind: PropertyKind;
  regionId: string;
  /** Lugar da região onde fica a porta. */
  placeId: string;
  /** Preço de compra, em Cristais. */
  price: number;
  /** Aluguel por dia de jogo, para quem prefere não comprar. */
  rent: number;
  /** Cômodos, em células. */
  rooms: readonly { id: string; name: string; w: number; d: number }[];
  note: string;
}

export const PROPERTIES: readonly Property[] = Object.freeze([
  Object.freeze({
    id: 'apto-aurora-12',
    name: 'Apartamento 12 — Aurora',
    kind: 'apartamento' as PropertyKind,
    regionId: 'aurora-city',
    placeId: 'praca-central',
    price: 4800,
    rent: 60,
    rooms: Object.freeze([
      { id: 'sala', name: 'Sala', w: 16, d: 14 },
      { id: 'quarto', name: 'Quarto', w: 12, d: 12 },
    ]),
    note: 'Dois cômodos sobre a praça. A janela dá para o lago.',
  }),
  Object.freeze({
    id: 'loft-zenite',
    name: 'Loft Zênite',
    kind: 'loft' as PropertyKind,
    regionId: 'aurora-city',
    placeId: 'torre-zenite',
    price: 9200,
    rent: 130,
    rooms: Object.freeze([{ id: 'unico', name: 'Ambiente único', w: 24, d: 18 }]),
    note: 'Um andar inteiro, sem paredes. A cidade fica embaixo.',
  }),
  Object.freeze({
    id: 'casa-rosas-7',
    name: 'Casa 7 — Rosas Park',
    kind: 'casa' as PropertyKind,
    regionId: 'rosas-park',
    placeId: 'casa-rosas-7',
    price: 7400,
    rent: 95,
    rooms: Object.freeze([
      { id: 'sala', name: 'Sala', w: 18, d: 14 },
      { id: 'quarto', name: 'Quarto', w: 14, d: 12 },
      { id: 'varanda', name: 'Varanda', w: 18, d: 8 },
    ]),
    note: 'Com varanda para o roseiral. Os bichos entram sozinhos.',
  }),
  Object.freeze({
    id: 'estudio-bitnara-3',
    name: 'Estúdio 3 — Bitnara',
    kind: 'estudio' as PropertyKind,
    regionId: 'bitnara',
    placeId: 'estudio-bitnara',
    price: 5600,
    rent: 75,
    rooms: Object.freeze([{ id: 'unico', name: 'Estúdio', w: 16, d: 16 }]),
    note: 'Paredes tratadas. Dá para ensaiar de madrugada sem reclamação.',
  }),
]);

const PROPERTY_BY_ID = new Map(PROPERTIES.map((property) => [property.id, property]));

export function getProperty(id: string): Property | undefined {
  return PROPERTY_BY_ID.get(id);
}

export function propertiesInRegion(regionId: string): Property[] {
  return PROPERTIES.filter((property) => property.regionId === regionId);
}

/** Um móvel colocado: item, cômodo, canto superior-esquerdo e giro. */
export interface PlacedItem {
  id: string;
  itemId: string;
  roomId: string;
  /** Célula do canto. Inteiros. */
  x: number;
  z: number;
  /** Giro em quartos de volta (0–3). Troca largura por profundidade. */
  rotation: 0 | 1 | 2 | 3;
}

export interface OwnedHome {
  propertyId: string;
  /** `comprada` não cobra mais nada; `alugada` cobra por dia. */
  tenure: 'comprada' | 'alugada';
  since: number;
  items: PlacedItem[];
}

export interface HousingSaveData {
  homes: OwnedHome[];
  /** Casa em que o jogador mora agora (a "casa principal"). */
  activeHomeId: string | null;
}

export function emptyHousingData(): HousingSaveData {
  return { homes: [], activeHomeId: null };
}

export function sanitizeHousingData(raw: unknown): HousingSaveData {
  if (!raw || typeof raw !== 'object') return emptyHousingData();
  const value = raw as Record<string, unknown>;
  const homes: OwnedHome[] = [];

  if (Array.isArray(value.homes)) {
    for (const raw2 of value.homes) {
      if (!raw2 || typeof raw2 !== 'object') continue;
      const entry = raw2 as Record<string, unknown>;
      const property = typeof entry.propertyId === 'string' ? getProperty(entry.propertyId) : undefined;
      if (!property || homes.some((home) => home.propertyId === property.id)) continue;

      const items: PlacedItem[] = [];
      if (Array.isArray(entry.items)) {
        for (const raw3 of entry.items) {
          if (!raw3 || typeof raw3 !== 'object') continue;
          const placed = raw3 as Record<string, unknown>;
          const item = typeof placed.itemId === 'string' ? getItem(placed.itemId) : undefined;
          const room = property.rooms.find((r) => r.id === placed.roomId);
          if (!item || !room) continue;
          const rotation = ((Math.floor(Number(placed.rotation) || 0) % 4) + 4) % 4;
          items.push({
            id: typeof placed.id === 'string' ? placed.id : `p-${items.length}`,
            itemId: item.id,
            roomId: room.id,
            x: Math.max(0, Math.floor(Number(placed.x) || 0)),
            z: Math.max(0, Math.floor(Number(placed.z) || 0)),
            rotation: rotation as 0 | 1 | 2 | 3,
          });
        }
      }

      homes.push({
        propertyId: property.id,
        tenure: entry.tenure === 'alugada' ? 'alugada' : 'comprada',
        since: typeof entry.since === 'number' ? entry.since : 0,
        items,
      });
    }
  }

  const activeHomeId = typeof value.activeHomeId === 'string' && homes.some((home) => home.propertyId === value.activeHomeId) ? value.activeHomeId : (homes[0]?.propertyId ?? null);
  return { homes, activeHomeId };
}

/** Tamanho que um item ocupa, já considerando o giro. */
export function footprintOf(item: EdenItem, rotation: 0 | 1 | 2 | 3): { w: number; d: number } {
  const base = item.footprint ?? { w: 1, d: 1 };
  return rotation % 2 === 0 ? { ...base } : { w: base.d, d: base.w };
}

export type PlacementBlocker = 'sem-casa' | 'comodo-inexistente' | 'nao-e-mobilia' | 'fora-do-comodo' | 'ocupado';

const PLACEMENT_MESSAGES: Record<PlacementBlocker, string> = {
  'sem-casa': 'Você não mora aqui.',
  'comodo-inexistente': 'Esse cômodo não existe.',
  'nao-e-mobilia': 'Isso não é um móvel.',
  'fora-do-comodo': 'Não cabe aí: passa da parede.',
  ocupado: 'Já tem alguma coisa nesse lugar.',
};

export class Housing {
  private readonly homes: OwnedHome[];
  private activeId: string | null;
  private sequence = 0;

  constructor(data: HousingSaveData = emptyHousingData()) {
    this.homes = data.homes.map((home) => ({ ...home, items: [...home.items] }));
    this.activeId = data.activeHomeId;
  }

  list(): readonly OwnedHome[] {
    return this.homes;
  }

  get activeHomeId(): string | null {
    return this.activeId;
  }

  owns(propertyId: string): boolean {
    return this.homes.some((home) => home.propertyId === propertyId);
  }

  home(propertyId: string): OwnedHome | undefined {
    return this.homes.find((home) => home.propertyId === propertyId);
  }

  activeHome(): OwnedHome | undefined {
    return this.activeId ? this.home(this.activeId) : undefined;
  }

  /** Casas do jogador numa região. */
  inRegion(regionId: string): OwnedHome[] {
    return this.homes.filter((home) => getProperty(home.propertyId)?.regionId === regionId);
  }

  /**
   * Registra a aquisição. O pagamento é feito por quem chama (a
   * `Economy`): este módulo não mexe em dinheiro, só em posse.
   */
  acquire(propertyId: string, tenure: 'comprada' | 'alugada', at: number = Date.now()): boolean {
    if (!getProperty(propertyId) || this.owns(propertyId)) return false;
    this.homes.push({ propertyId, tenure, since: at, items: [] });
    if (!this.activeId) this.activeId = propertyId;
    return true;
  }

  /** Larga o imóvel. Os móveis colocados voltam para quem chamou tratar. */
  release(propertyId: string): PlacedItem[] {
    const index = this.homes.findIndex((home) => home.propertyId === propertyId);
    if (index < 0) return [];
    const [home] = this.homes.splice(index, 1);
    if (this.activeId === propertyId) this.activeId = this.homes[0]?.propertyId ?? null;
    return home.items;
  }

  setActive(propertyId: string): boolean {
    if (!this.owns(propertyId)) return false;
    this.activeId = propertyId;
    return true;
  }

  /** Células ocupadas por um retângulo, para testar sobreposição. */
  private overlaps(home: OwnedHome, roomId: string, x: number, z: number, w: number, d: number, ignoreId?: string): boolean {
    for (const placed of home.items) {
      if (placed.roomId !== roomId || placed.id === ignoreId) continue;
      const item = getItem(placed.itemId);
      if (!item) continue;
      const other = footprintOf(item, placed.rotation);
      const apart = x + w <= placed.x || placed.x + other.w <= x || z + d <= placed.z || placed.z + other.d <= z;
      if (!apart) return true;
    }
    return false;
  }

  /** Por que o móvel não cabe aí, ou `null` se cabe. */
  placementBlocker(propertyId: string, itemId: string, roomId: string, x: number, z: number, rotation: 0 | 1 | 2 | 3, ignoreId?: string): PlacementBlocker | null {
    const home = this.home(propertyId);
    const property = getProperty(propertyId);
    if (!home || !property) return 'sem-casa';
    const room = property.rooms.find((r) => r.id === roomId);
    if (!room) return 'comodo-inexistente';
    const item = getItem(itemId);
    if (!item || (item.use !== 'mobilia' && item.use !== 'eletronico' && item.use !== 'instrumento')) return 'nao-e-mobilia';
    const { w, d } = footprintOf(item, rotation);
    if (x < 0 || z < 0 || x + w > room.w || z + d > room.d) return 'fora-do-comodo';
    if (this.overlaps(home, roomId, x, z, w, d, ignoreId)) return 'ocupado';
    return null;
  }

  /**
   * Coloca um móvel. Devolve o móvel colocado, ou a razão da recusa.
   *
   * Quem chama é responsável por tirar o item do inventário: a casa não
   * conhece a carteira, e é bom que continue assim.
   */
  place(
    propertyId: string,
    itemId: string,
    roomId: string,
    x: number,
    z: number,
    rotation: 0 | 1 | 2 | 3 = 0,
  ): { ok: true; placed: PlacedItem } | { ok: false; blocker: PlacementBlocker; message: string } {
    const blocker = this.placementBlocker(propertyId, itemId, roomId, x, z, rotation);
    if (blocker) return { ok: false, blocker, message: PLACEMENT_MESSAGES[blocker] };
    const home = this.home(propertyId) as OwnedHome;
    this.sequence += 1;
    const placed: PlacedItem = { id: `ph-${this.sequence}-${home.items.length}`, itemId, roomId, x, z, rotation };
    home.items.push(placed);
    return { ok: true, placed };
  }

  /** Move um móvel que já está na casa. Testa o novo lugar antes. */
  move(propertyId: string, placedId: string, roomId: string, x: number, z: number, rotation: 0 | 1 | 2 | 3): boolean {
    const home = this.home(propertyId);
    const placed = home?.items.find((entry) => entry.id === placedId);
    if (!home || !placed) return false;
    if (this.placementBlocker(propertyId, placed.itemId, roomId, x, z, rotation, placedId)) return false;
    placed.roomId = roomId;
    placed.x = x;
    placed.z = z;
    placed.rotation = rotation;
    return true;
  }

  /** Tira o móvel da casa. Devolve o id do item, para voltar ao inventário. */
  remove(propertyId: string, placedId: string): string | null {
    const home = this.home(propertyId);
    if (!home) return null;
    const index = home.items.findIndex((entry) => entry.id === placedId);
    if (index < 0) return null;
    const [placed] = home.items.splice(index, 1);
    return placed.itemId;
  }

  /** Móveis de um cômodo. */
  itemsIn(propertyId: string, roomId: string): PlacedItem[] {
    return this.home(propertyId)?.items.filter((placed) => placed.roomId === roomId) ?? [];
  }

  /** Eletrônicos colocados que abrem alguma tela quando usados. */
  interactables(propertyId: string): { placed: PlacedItem; item: EdenItem }[] {
    const home = this.home(propertyId);
    if (!home) return [];
    const list: { placed: PlacedItem; item: EdenItem }[] = [];
    for (const placed of home.items) {
      const item = getItem(placed.itemId);
      if (item?.opens) list.push({ placed, item });
    }
    return list;
  }

  toJSON(): HousingSaveData {
    return { homes: this.homes.map((home) => ({ ...home, items: home.items.map((item) => ({ ...item })) })), activeHomeId: this.activeId };
  }
}
