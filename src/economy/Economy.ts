/**
 * Carteira, inventário e compras.
 *
 * A moeda do Éden é o **Cristal**. O jogador começa com um pouco, e o
 * resto vem de atividades — nunca de uma loja de dinheiro real, que não
 * existe e não vai existir neste projeto.
 *
 * Regras que valem aqui:
 * - Nenhuma compra acontece sem saldo. Não há dívida.
 * - Toda compra vira um registro no extrato, com hora e preço.
 * - Devolução só dentro da janela, e só do que não foi usado.
 *
 * Módulo puro: sem Three.js, sem DOM.
 */

import { type EdenItem, type EdenStore, getItem, storeIsOpen, storeStock } from './Items';

/** Quanto o jogador tem ao começar. Dá para o essencial, não para tudo. */
export const STARTING_CRYSTALS = 1200;

/** Por quantos minutos de jogo uma compra pode ser devolvida. */
export const REFUND_WINDOW_MINUTES = 30;

export interface Transaction {
  id: string;
  /** `compra` tira cristais, `venda` e `ganho` devolvem. */
  kind: 'compra' | 'devolucao' | 'ganho';
  itemId?: string;
  storeId?: string;
  /** Sempre positivo: o sinal vem do `kind`. */
  amount: number;
  quantity: number;
  /** Momento em que aconteceu (ms do relógio real, como o salvamento). */
  at: number;
  note: string;
}

export interface InventoryStack {
  itemId: string;
  quantity: number;
}

export interface EconomySaveData {
  crystals: number;
  inventory: InventoryStack[];
  history: Transaction[];
}

/** Quantos registros de extrato ficam guardados. */
const HISTORY_LIMIT = 80;

export function emptyEconomyData(): EconomySaveData {
  return { crystals: STARTING_CRYSTALS, inventory: [], history: [] };
}

export function sanitizeEconomyData(raw: unknown): EconomySaveData {
  const fallback = emptyEconomyData();
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Record<string, unknown>;

  const crystals = typeof value.crystals === 'number' && Number.isFinite(value.crystals) ? Math.max(0, Math.floor(value.crystals)) : STARTING_CRYSTALS;

  const inventory: InventoryStack[] = [];
  if (Array.isArray(value.inventory)) {
    for (const raw2 of value.inventory) {
      if (!raw2 || typeof raw2 !== 'object') continue;
      const stack = raw2 as Record<string, unknown>;
      const item = typeof stack.itemId === 'string' ? getItem(stack.itemId) : undefined;
      // Item que saiu do catálogo não volta: descartar é melhor que
      // carregar um id órfão que nenhuma tela sabe desenhar.
      if (!item) continue;
      const quantity = typeof stack.quantity === 'number' ? Math.floor(stack.quantity) : 0;
      if (quantity > 0) inventory.push({ itemId: item.id, quantity: Math.min(quantity, item.stack) });
    }
  }

  const history: Transaction[] = [];
  if (Array.isArray(value.history)) {
    for (const raw2 of value.history.slice(-HISTORY_LIMIT)) {
      if (!raw2 || typeof raw2 !== 'object') continue;
      const entry = raw2 as Record<string, unknown>;
      if (entry.kind !== 'compra' && entry.kind !== 'devolucao' && entry.kind !== 'ganho') continue;
      history.push({
        id: typeof entry.id === 'string' ? entry.id : `t-${history.length}`,
        kind: entry.kind,
        itemId: typeof entry.itemId === 'string' ? entry.itemId : undefined,
        storeId: typeof entry.storeId === 'string' ? entry.storeId : undefined,
        amount: typeof entry.amount === 'number' ? Math.max(0, Math.floor(entry.amount)) : 0,
        quantity: typeof entry.quantity === 'number' ? Math.max(1, Math.floor(entry.quantity)) : 1,
        at: typeof entry.at === 'number' ? entry.at : 0,
        note: typeof entry.note === 'string' ? entry.note : '',
      });
    }
  }

  return { crystals, inventory, history };
}

/** Por que uma compra não pode acontecer, ou `null` se pode. */
export type PurchaseBlocker = 'sem-saldo' | 'loja-fechada' | 'nao-vende' | 'inventario-cheio' | 'quantidade-invalida';

export interface PurchaseResult {
  ok: boolean;
  blocker?: PurchaseBlocker;
  /** Mensagem pronta para mostrar ao jogador, em português. */
  message: string;
  transaction?: Transaction;
}

const BLOCKER_MESSAGES: Record<PurchaseBlocker, string> = {
  'sem-saldo': 'Cristais insuficientes.',
  'loja-fechada': 'A loja está fechada agora.',
  'nao-vende': 'Esta loja não vende isso.',
  'inventario-cheio': 'Você já carrega o máximo desse item.',
  'quantidade-invalida': 'Quantidade inválida.',
};

export class Economy {
  private crystalsValue: number;
  private readonly stacks = new Map<string, number>();
  private history: Transaction[];
  private sequence = 0;

  constructor(data: EconomySaveData = emptyEconomyData()) {
    this.crystalsValue = data.crystals;
    for (const stack of data.inventory) this.stacks.set(stack.itemId, stack.quantity);
    this.history = [...data.history];
  }

  get crystals(): number {
    return this.crystalsValue;
  }

  /** Quantas unidades deste item o jogador tem. */
  countOf(itemId: string): number {
    return this.stacks.get(itemId) ?? 0;
  }

  has(itemId: string, quantity = 1): boolean {
    return this.countOf(itemId) >= quantity;
  }

  /** O inventário inteiro, ordenado por nome do item. */
  inventory(): { item: EdenItem; quantity: number }[] {
    const list: { item: EdenItem; quantity: number }[] = [];
    for (const [itemId, quantity] of this.stacks) {
      const item = getItem(itemId);
      if (item && quantity > 0) list.push({ item, quantity });
    }
    return list.sort((a, b) => a.item.name.localeCompare(b.item.name, 'pt-BR'));
  }

  transactions(): readonly Transaction[] {
    return this.history;
  }

  private record(entry: Omit<Transaction, 'id'>): Transaction {
    this.sequence += 1;
    const transaction: Transaction = { ...entry, id: `t${entry.at.toString(36)}-${this.sequence}` };
    this.history.push(transaction);
    if (this.history.length > HISTORY_LIMIT) this.history = this.history.slice(-HISTORY_LIMIT);
    return transaction;
  }

  /**
   * Débito direto, sem item: aluguel, compra de imóvel, taxa.
   *
   * Separado de `purchase` porque não há item nem loja envolvidos — e
   * porque a devolução não se aplica: ninguém devolve um apartamento
   * pelo extrato.
   */
  spend(amount: number, note: string, at: number = Date.now()): boolean {
    const value = Math.floor(amount);
    if (value <= 0 || this.crystalsValue < value) return false;
    this.crystalsValue -= value;
    this.record({ kind: 'compra', amount: value, quantity: 1, at, note });
    return true;
  }

  /** Crédito por uma atividade concluída, uma venda, um presente. */
  earn(amount: number, note: string, at: number = Date.now()): Transaction | null {
    const value = Math.floor(amount);
    if (value <= 0) return null;
    this.crystalsValue += value;
    return this.record({ kind: 'ganho', amount: value, quantity: 1, at, note });
  }

  /** Por que esta compra não pode acontecer, ou `null`. */
  purchaseBlocker(store: EdenStore, itemId: string, quantity: number, hour: number): PurchaseBlocker | null {
    if (!Number.isInteger(quantity) || quantity < 1) return 'quantidade-invalida';
    if (!storeIsOpen(store, hour)) return 'loja-fechada';
    const item = getItem(itemId);
    if (!item || !storeStock(store).some((entry) => entry.id === itemId)) return 'nao-vende';
    if (this.countOf(itemId) + quantity > item.stack) return 'inventario-cheio';
    if (this.crystalsValue < item.price * quantity) return 'sem-saldo';
    return null;
  }

  /**
   * Compra. Debita, guarda no inventário e registra no extrato.
   *
   * Nunca lança: devolve um resultado com a razão em português, porque
   * quem chama é a interface da loja e ela precisa dizer algo ao jogador.
   */
  purchase(store: EdenStore, itemId: string, quantity = 1, hour = 12, at: number = Date.now()): PurchaseResult {
    const blocker = this.purchaseBlocker(store, itemId, quantity, hour);
    if (blocker) return { ok: false, blocker, message: BLOCKER_MESSAGES[blocker] };

    const item = getItem(itemId) as EdenItem;
    const total = item.price * quantity;
    this.crystalsValue -= total;
    this.stacks.set(itemId, this.countOf(itemId) + quantity);
    const transaction = this.record({
      kind: 'compra',
      itemId,
      storeId: store.id,
      amount: total,
      quantity,
      at,
      note: `${item.name} · ${store.name}`,
    });
    return { ok: true, message: `${item.name} comprado(a).`, transaction };
  }

  /**
   * Devolução de uma compra, dentro da janela e com o item ainda guardado.
   *
   * O item precisa continuar no inventário: o que já foi colocado numa
   * casa ou dado a um bicho não volta para a loja.
   */
  refund(transactionId: string, now: number = Date.now()): PurchaseResult {
    const transaction = this.history.find((entry) => entry.id === transactionId);
    if (!transaction || transaction.kind !== 'compra') return { ok: false, message: 'Compra não encontrada.' };
    if (now - transaction.at > REFUND_WINDOW_MINUTES * 60_000) return { ok: false, message: 'O prazo de devolução passou.' };
    if (!transaction.itemId || !this.has(transaction.itemId, transaction.quantity)) {
      return { ok: false, message: 'O item não está mais com você.' };
    }

    this.crystalsValue += transaction.amount;
    this.consume(transaction.itemId, transaction.quantity);
    const item = getItem(transaction.itemId);
    const entry = this.record({
      kind: 'devolucao',
      itemId: transaction.itemId,
      storeId: transaction.storeId,
      amount: transaction.amount,
      quantity: transaction.quantity,
      at: now,
      note: `Devolução · ${item?.name ?? transaction.itemId}`,
    });
    return { ok: true, message: `${item?.name ?? 'Item'} devolvido(a).`, transaction: entry };
  }

  /**
   * Tira unidades do inventário sem devolver dinheiro.
   *
   * É o que acontece quando o item sai de cena: colocado numa casa,
   * comido por um bicho, usado numa atividade.
   */
  consume(itemId: string, quantity = 1): boolean {
    const have = this.countOf(itemId);
    if (have < quantity) return false;
    if (have === quantity) this.stacks.delete(itemId);
    else this.stacks.set(itemId, have - quantity);
    return true;
  }

  /** Devolve ao inventário algo que tinha saído (móvel retirado da casa). */
  restore(itemId: string, quantity = 1): boolean {
    const item = getItem(itemId);
    if (!item) return false;
    this.stacks.set(itemId, Math.min(item.stack, this.countOf(itemId) + quantity));
    return true;
  }

  toJSON(): EconomySaveData {
    return {
      crystals: this.crystalsValue,
      inventory: [...this.stacks].map(([itemId, quantity]) => ({ itemId, quantity })),
      history: [...this.history],
    };
  }
}
