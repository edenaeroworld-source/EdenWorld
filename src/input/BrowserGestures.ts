/**
 * Guarda de gestos do navegador.
 *
 * Num jogo em tela cheia, os gestos do sistema atrapalham: a pinça dá
 * zoom na página inteira, arrastar rola a tela, o toque longo abre o menu
 * de contexto e o toque duplo amplia. Nada disso pode acontecer **durante
 * o jogo**.
 *
 * Mas o contrário também importa: fora do jogo — nos menus, nas telas de
 * ajuste, no EdenOS — o navegador tem que voltar a se comportar como
 * navegador. Ampliar um texto, rolar uma lista e usar leitor de tela são
 * recursos de acessibilidade, e o jogo não tem o direito de desligá-los
 * permanentemente.
 *
 * Por isso a guarda **liga e desliga**: os ouvintes só existem enquanto o
 * personagem está sob comando. Quando o jogo sai do controle do jogador,
 * eles são removidos de verdade, não apenas ignorados.
 */

export interface GestureGuardTargets {
  /** Onde o mundo é desenhado: ali nenhum gesto do navegador é bem-vindo. */
  canvas: HTMLElement;
  /** Normalmente `document`. */
  root: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

/** Tipos de evento que o Safari dispara ao dar pinça na página. */
const SAFARI_GESTURES = ['gesturestart', 'gesturechange', 'gestureend'] as const;

export class BrowserGestures {
  private active = false;

  constructor(private readonly targets: GestureGuardTargets) {}

  get isActive(): boolean {
    return this.active;
  }

  /** Liga durante o jogo; desliga em menus, telas e no EdenOS. */
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) this.attach();
    else this.detach();
  }

  private attach(): void {
    const { canvas, root } = this.targets;
    for (const type of SAFARI_GESTURES) root.addEventListener(type, this.block as EventListener, { passive: false });
    root.addEventListener('touchmove', this.onTouchMove as EventListener, { passive: false });
    canvas.addEventListener('contextmenu', this.block as EventListener);
  }

  private detach(): void {
    const { canvas, root } = this.targets;
    for (const type of SAFARI_GESTURES) root.removeEventListener(type, this.block as EventListener);
    root.removeEventListener('touchmove', this.onTouchMove as EventListener);
    canvas.removeEventListener('contextmenu', this.block as EventListener);
  }

  private readonly block = (event: Event): void => {
    if (event.cancelable) event.preventDefault();
  };

  /**
   * Só bloqueia o que é gesto de página: pinça (dois dedos) e arrasto que
   * começa sobre o mundo 3D. Um dedo deslizando numa lista de ajustes
   * continua rolando a lista normalmente.
   */
  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!event.cancelable) return;
    const multi = (event.touches?.length ?? 0) > 1;
    const onCanvas = event.target === this.targets.canvas;
    if (multi || onCanvas) event.preventDefault();
  };

  dispose(): void {
    this.setActive(false);
  }
}
