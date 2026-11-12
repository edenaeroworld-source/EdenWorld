import type { Interactable, InteractionPayload, InteractionType } from './Interactable';

export type InteractionHandler<T extends InteractionType = InteractionType> = (
  item: Interactable,
  payload: Extract<InteractionPayload, { type: T }>,
) => void;

const VERTICAL_REACH = 2.4;
const SWITCH_MARGIN = 0.3;

/**
 * Sistema de interação: encontra o objeto interativo mais adequado
 * perto do jogador e despacha a ação para o handler do seu tipo.
 * Novos tipos de interação só precisam de um `register`.
 */
export class InteractionSystem {
  private readonly handlers = new Map<InteractionType, InteractionHandler>();
  private items: readonly Interactable[] = [];
  private target: Interactable | null = null;
  /** Chamado quando o alvo de interação muda (para atualizar o HUD). */
  onTargetChange: ((item: Interactable | null) => void) | null = null;
  enabled = true;

  constructor(items: readonly Interactable[] = []) {
    this.items = items;
  }

  setItems(items: readonly Interactable[]): void {
    this.items = items;
    this.setTarget(null);
  }

  register<T extends InteractionType>(type: T, handler: InteractionHandler<T>): void {
    this.handlers.set(type, handler as unknown as InteractionHandler);
  }

  get current(): Interactable | null {
    return this.target;
  }

  private setTarget(item: Interactable | null): void {
    if (item === this.target) return;
    this.target = item;
    this.onTargetChange?.(item);
  }

  /**
   * @param facing direção (0 = +Z) para a qual o jogador olha; objetos à frente têm preferência.
   */
  update(x: number, y: number, z: number, facing: number, elapsed: number): void {
    if (!this.enabled) {
      this.setTarget(null);
      return;
    }
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    let currentScore = Infinity;
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item.enabled) continue;
      const dx = item.position.x - x;
      const dz = item.position.z - z;
      const distance = Math.hypot(dx, dz);
      if (distance > item.range) continue;
      const dy = item.position.y - y;
      if (dy > VERTICAL_REACH || dy < -VERTICAL_REACH) continue;
      if (item.cooldown !== undefined && item.lastUsedAt !== undefined && elapsed - item.lastUsedAt < item.cooldown) continue;
      const facingBonus = distance > 0.2 ? (dx * fx + dz * fz) / distance : 1;
      const score = distance / item.range - facingBonus * 0.35;
      if (item === this.target) currentScore = score;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    // Histerese: só troca de alvo se o novo for claramente melhor.
    if (best !== this.target && this.target !== null && currentScore !== Infinity && bestScore > currentScore - SWITCH_MARGIN) return;
    this.setTarget(best);
  }

  /** Executa a ação do alvo atual. Retorna `true` se algo aconteceu. */
  interact(elapsed: number): boolean {
    const item = this.target;
    if (!item || !this.enabled) return false;
    const handler = this.handlers.get(item.payload.type);
    if (!handler) return false;
    item.lastUsedAt = elapsed;
    handler(item, item.payload);
    if (item.cooldown !== undefined) this.setTarget(null);
    return true;
  }

  clearTarget(): void {
    this.setTarget(null);
  }
}
