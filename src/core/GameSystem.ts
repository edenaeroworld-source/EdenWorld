/**
 * Contrato comum para sistemas plugáveis do jogo.
 *
 * É o principal ponto de extensão da arquitetura: novos sistemas do
 * universo Éden (cidadãos, transportes, EdenPawl, eventos, moradia...)
 * implementam esta interface e são registrados no `SystemRegistry`,
 * sem que o Engine precise conhecê-los individualmente.
 */
export interface GameSystem {
  /** Identificador único e estável (ex.: "wildlife", "citizens"). */
  readonly id: string;
  /** Atualização por quadro enquanto o mundo está em simulação. */
  update?(dt: number, elapsed: number): void;
  /** Liberação de recursos (GPU, áudio, listeners). */
  dispose?(): void;
}

export class SystemRegistry {
  private readonly systems = new Map<string, GameSystem>();
  private order: GameSystem[] = [];

  register<T extends GameSystem>(system: T): T {
    if (this.systems.has(system.id)) {
      throw new Error(`[SystemRegistry] Sistema já registrado: ${system.id}`);
    }
    this.systems.set(system.id, system);
    this.order.push(system);
    return system;
  }

  unregister(id: string): void {
    const system = this.systems.get(id);
    if (!system) return;
    system.dispose?.();
    this.systems.delete(id);
    this.order = this.order.filter((s) => s !== system);
  }

  get<T extends GameSystem = GameSystem>(id: string): T | undefined {
    return this.systems.get(id) as T | undefined;
  }

  has(id: string): boolean {
    return this.systems.has(id);
  }

  list(): readonly GameSystem[] {
    return this.order;
  }

  update(dt: number, elapsed: number): void {
    for (const system of this.order) {
      system.update?.(dt, elapsed);
    }
  }

  dispose(): void {
    for (const system of [...this.order].reverse()) {
      try {
        system.dispose?.();
      } catch (error) {
        console.warn(`[SystemRegistry] Falha ao liberar "${system.id}":`, error);
      }
    }
    this.systems.clear();
    this.order = [];
  }
}
