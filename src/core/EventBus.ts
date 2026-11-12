/**
 * Barramento de eventos tipado. Permite que sistemas se comuniquem
 * sem se conhecerem diretamente (HUD reage a eventos do InputManager,
 * do progresso, do salvamento etc.).
 */
export type Unsubscribe = () => void;

type Handler<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof Events>(event: K, handler: Handler<Events[K]>): Unsubscribe {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    // Cópia para permitir que handlers se removam durante a emissão.
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload);
      } catch (error) {
        console.error(`[EventBus] Erro no handler de "${String(event)}":`, error);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
