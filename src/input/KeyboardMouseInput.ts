import { GAME_ACTIONS, type GameAction, type InputSettingsData } from './InputSettings';
import type { NavCommand } from './InputTypes';

export interface KeyboardMouseHost {
  readonly settings: InputSettingsData;
  readonly gameplayEnabled: boolean;
  onAction(action: GameAction): void;
  onNav(command: NavCommand): void;
  onActivity(): void;
  onPointerUnlock(): void;
}

const NAV_KEYS: Record<string, NavCommand> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const MOUSE_RADIANS_PER_PIXEL = 0.0026;

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type === 'text' || type === 'search' || type === 'email' || type === 'password' || type === 'number';
}

/**
 * `true` quando o foco está dentro de uma interface que convive com a
 * gameplay — hoje, o EdenPhone lateral.
 *
 * Essas interfaces ficam abertas com o jogo rodando, então as teclas
 * precisam de dono: quem está ajustando um controle deslizante de
 * AfterCurve com as setas não pode sair andando junto. O que continua
 * passando são os atalhos de abrir e fechar, para o jogador nunca
 * ficar preso dentro do aparelho.
 */
function inLiveSurface(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && typeof el.closest === 'function' && el.closest('[data-live-ui]') !== null;
}

/** Teclado e mouse: teclas remapeáveis, captura do cursor e zoom pela roda. */
export class KeyboardMouseInput {
  private readonly down = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private wheel = 0;
  private dragging = false;
  private expectedUnlock = false;
  /** Quando definido, a próxima tecla pressionada é entregue aqui (remapeamento). */
  captureKey: ((code: string) => void) | null = null;
  /** Capturar o cursor ao clicar no jogo (recomendado no computador). */
  usePointerLock = true;
  /**
   * `false` enquanto alguma interface conviva precisa do cursor livre.
   *
   * Com o EdenPhone lateral a gameplay continua ligada, mas o mouse
   * tem de poder clicar nos aplicativos: capturar o cursor aqui
   * esconderia o ponteiro e tornaria o celular inalcançável.
   */
  private pointerLockAllowed = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: KeyboardMouseHost,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  isDown(action: keyof InputSettingsData['keys']): boolean {
    const codes = this.host.settings.keys[action];
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i])) return true;
    return false;
  }

  /** Lê e zera o giro acumulado do mouse (radianos). */
  consumeLook(out: { x: number; y: number }): void {
    const scale = MOUSE_RADIANS_PER_PIXEL * this.host.settings.mouseSensitivity;
    out.x = this.lookX * scale;
    out.y = this.lookY * scale;
    this.lookX = 0;
    this.lookY = 0;
  }

  consumeWheel(): number {
    const value = this.wheel;
    this.wheel = 0;
    return value;
  }

  /** Libera (ou devolve) o direito de capturar o cursor. */
  setPointerLockAllowed(allowed: boolean): void {
    if (this.pointerLockAllowed === allowed) return;
    this.pointerLockAllowed = allowed;
    if (!allowed) this.releasePointer();
  }

  releasePointer(): void {
    this.dragging = false;
    if (this.pointerLocked) {
      this.expectedUnlock = true;
      document.exitPointerLock();
    }
  }

  private requestPointer(): void {
    if (!this.usePointerLock || !this.pointerLockAllowed || this.pointerLocked || typeof this.canvas.requestPointerLock !== 'function') return;
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {
          /* captura recusada: segue no modo de arrastar */
        });
      }
    } catch {
      /* navegador sem suporte: segue no modo de arrastar */
    }
  }

  private actionFor(code: string): GameAction | null {
    const keys = this.host.settings.keys;
    for (const action of GAME_ACTIONS) {
      if (keys[action].includes(code)) return action;
    }
    return null;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    const code = event.code;
    if (this.captureKey) {
      event.preventDefault();
      event.stopPropagation();
      const capture = this.captureKey;
      this.captureKey = null;
      capture(code);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    this.host.onActivity();

    if (!this.host.gameplayEnabled) {
      if (code === 'Escape') {
        event.preventDefault();
        if (!event.repeat) this.host.onNav('back');
        return;
      }
      if (isTextField(event.target)) return;
      const nav = NAV_KEYS[code];
      if (nav) {
        const target = event.target as HTMLInputElement | null;
        // Controles deslizantes usam as setas horizontais nativamente.
        if (target && target.tagName === 'INPUT' && target.type === 'range' && (nav === 'left' || nav === 'right')) return;
        event.preventDefault();
        this.host.onNav(nav);
      }
      return;
    }

    if (isTextField(event.target)) return;
    const action = this.actionFor(code);
    if (inLiveSurface(event.target)) {
      // Dentro do celular só valem os atalhos de sair. Tudo o mais é da
      // interface: setas movem o controle deslizante, Tab troca o foco.
      if ((action === 'phone' || action === 'pause') && !event.repeat) {
        event.preventDefault();
        this.host.onAction(action);
      }
      return;
    }
    this.down.add(code);
    const isMove = this.isMoveKey(code);
    if (action || isMove) event.preventDefault();
    if (action && !event.repeat) this.host.onAction(action);
  };

  private isMoveKey(code: string): boolean {
    const keys = this.host.settings.keys;
    return keys.forward.includes(code) || keys.back.includes(code) || keys.left.includes(code) || keys.right.includes(code);
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
    this.dragging = false;
  };

  private readonly onPointerLockChange = (): void => {
    if (this.pointerLocked) return;
    if (this.expectedUnlock) {
      this.expectedUnlock = false;
      return;
    }
    this.down.clear();
    this.host.onPointerUnlock();
  };

  private readonly onPointerLockError = (): void => {
    this.expectedUnlock = false;
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    this.host.onActivity();
    if (!this.host.gameplayEnabled) return;
    this.dragging = true;
    if (event.button === 0) this.requestPointer();
  };

  private readonly onMouseUp = (): void => {
    this.dragging = false;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.host.gameplayEnabled) return;
    if (this.pointerLocked || this.dragging) {
      // Alguns navegadores entregam saltos enormes ao capturar o cursor.
      const dx = Math.max(-220, Math.min(220, event.movementX || 0));
      const dy = Math.max(-220, Math.min(220, event.movementY || 0));
      this.lookX += dx;
      this.lookY += dy;
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.host.gameplayEnabled) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    this.wheel += Math.max(-3, Math.min(3, (event.deltaY * unit) / 100));
    this.host.onActivity();
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  /** Solta todas as teclas (ao abrir menus). */
  reset(): void {
    this.down.clear();
    this.dragging = false;
    this.lookX = this.lookY = 0;
    this.wheel = 0;
  }

  dispose(): void {
    this.releasePointer();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}
