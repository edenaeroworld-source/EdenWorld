import type { NavCommand } from '../input/InputTypes';

/** Uma tela modal da interface (menu, painel, diálogo). */
export interface Screen {
  readonly id: string;
  readonly element: HTMLElement;
  /** Ação de "voltar" (Esc, botão B). Se ausente, a tela não pode ser dispensada. */
  onBack?(): void;
  /** Troca de aba (LB/RB). */
  onTab?(direction: 1 | -1): void;
  /** Botão Start com a tela aberta (padrão: igual a voltar). */
  onMenu?(): void;
  onOpen?(): void;
  onClose?(): void;
  /** Atualização por quadro enquanto a tela é a do topo. */
  update?(): void;
  initialFocus?(): HTMLElement | null;
}

export type UiSoundHook = (kind: 'click' | 'open' | 'close' | 'toggle') => void;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Área rolável (vertical) mais próxima que contém o elemento, dentro de `root`. */
function scrollParent(element: HTMLElement, root: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node && root.contains(node); node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return node;
    }
  }
  return null;
}

/** `true` se ao menos metade do retângulo aparece na parte visível da área rolável. */
function isShownIn(rect: DOMRect, scroller: HTMLElement): boolean {
  const view = scroller.getBoundingClientRect();
  const visible = Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top);
  return visible >= rect.height * 0.5;
}

/**
 * Gerencia a pilha de telas modais, o foco e a navegação por teclado e
 * controle (navegação espacial entre elementos focáveis).
 */
export class UIManager {
  private readonly stack: Screen[] = [];
  private readonly lastFocus = new WeakMap<Screen, HTMLElement>();
  /** Chamado sempre que a pilha de telas muda. */
  onChange: (() => void) | null = null;
  sound: UiSoundHook = () => undefined;

  constructor(readonly root: HTMLElement) {
    root.addEventListener('click', this.onClick, true);
    window.addEventListener('pointerdown', this.onPointer, { capture: true, passive: true });
    window.addEventListener('keydown', this.onKey, true);
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement | null)?.closest?.('button');
    if (!target || (target as HTMLButtonElement).disabled) return;
    this.sound(target.getAttribute('role') === 'switch' || target.hasAttribute('aria-pressed') ? 'toggle' : 'click');
  };

  private readonly onPointer = (): void => {
    this.root.classList.remove('ui--nav');
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') this.root.classList.add('ui--nav');
  };

  get top(): Screen | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  /** `true` quando há alguma tela modal aberta (o jogo não recebe comandos). */
  get hasModal(): boolean {
    return this.stack.length > 0;
  }

  isOpen(id: string): boolean {
    return this.stack.some((screen) => screen.id === id);
  }

  open(screen: Screen, silent = false): void {
    if (this.stack.includes(screen)) return;
    const previous = this.top;
    if (previous) {
      const active = document.activeElement as HTMLElement | null;
      if (active && previous.element.contains(active)) this.lastFocus.set(previous, active);
      previous.element.inert = true;
    }
    this.stack.push(screen);
    screen.element.inert = false;
    this.root.appendChild(screen.element);
    screen.onOpen?.();
    if (!silent) this.sound('open');
    this.focusInitial(screen);
    this.onChange?.();
  }

  close(screen: Screen | string, silent = false): void {
    const target = typeof screen === 'string' ? this.stack.find((s) => s.id === screen) : screen;
    if (!target) return;
    const index = this.stack.indexOf(target);
    if (index < 0) return;
    this.stack.splice(index, 1);
    target.element.remove();
    target.onClose?.();
    if (!silent) this.sound('close');
    const top = this.top;
    if (top) {
      top.element.inert = false;
      const remembered = this.lastFocus.get(top);
      if (remembered && top.element.contains(remembered) && isVisible(remembered)) remembered.focus({ preventScroll: true });
      else this.focusInitial(top);
    } else {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    this.onChange?.();
  }

  closeAll(silent = true): void {
    while (this.stack.length > 0) this.close(this.stack[this.stack.length - 1], silent);
  }

  private focusInitial(screen: Screen): void {
    const preferred = screen.initialFocus?.();
    const element = preferred && isVisible(preferred) ? preferred : this.focusables(screen)[0];
    element?.focus({ preventScroll: true });
  }

  /** Reposiciona o foco após o conteúdo da tela do topo ser reconstruído. */
  refocus(preferred?: HTMLElement | null): void {
    const top = this.top;
    if (!top) return;
    if (preferred && top.element.contains(preferred) && isVisible(preferred)) preferred.focus({ preventScroll: true });
    else this.focusInitial(top);
  }

  private focusables(screen: Screen): HTMLElement[] {
    return Array.from(screen.element.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
  }

  update(): void {
    this.top?.update?.();
  }

  /** Processa um comando de navegação. Retorna `true` se foi consumido por uma tela. */
  handleNav(command: NavCommand): boolean {
    const top = this.top;
    if (!top) return false;
    if (command !== 'back' && command !== 'menu') this.root.classList.add('ui--nav');
    switch (command) {
      case 'back':
        top.onBack?.();
        return true;
      case 'menu':
        if (top.onMenu) top.onMenu();
        else top.onBack?.();
        return true;
      case 'prevTab':
        top.onTab?.(-1);
        return true;
      case 'nextTab':
        top.onTab?.(1);
        return true;
      case 'confirm': {
        const active = document.activeElement as HTMLElement | null;
        if (active && top.element.contains(active)) active.click();
        else this.focusInitial(top);
        return true;
      }
      default:
        this.moveFocus(top, command);
        return true;
    }
  }

  private moveFocus(screen: Screen, direction: 'up' | 'down' | 'left' | 'right'): void {
    const items = this.focusables(screen);
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    if (!active || !screen.element.contains(active)) {
      items[0].focus({ preventScroll: true });
      return;
    }

    // Controles deslizantes: esquerda/direita ajustam o valor.
    if (active instanceof HTMLInputElement && active.type === 'range' && (direction === 'left' || direction === 'right')) {
      const before = active.value;
      if (direction === 'left') active.stepDown();
      else active.stepUp();
      if (active.value !== before) {
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    const from = active.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    const horizontal = direction === 'left' || direction === 'right';
    const sign = direction === 'right' || direction === 'down' ? 1 : -1;
    const home = scrollParent(active, screen.element);

    // Dentro de uma área rolável, primeiro procura na própria área (o destino
    // pode estar fora da parte visível: ele é rolado até aparecer). Só depois
    // sai dela. Itens de outras áreas roláveis só contam se estiverem à vista.
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    let bestInside = false;
    for (const item of items) {
      if (item === active) continue;
      const rect = item.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const along = (horizontal ? cx - fx : cy - fy) * sign;
      if (along < 4) continue;
      const scroller = scrollParent(item, screen.element);
      const inside = home !== null && scroller === home;
      if (!inside && scroller !== null && !isShownIn(rect, scroller)) continue;
      if (bestInside && !inside) continue;
      // Distância lateral medida entre as bordas (elementos alinhados têm custo zero).
      const across = horizontal
        ? Math.max(0, Math.max(rect.top - from.bottom, from.top - rect.bottom))
        : Math.max(0, Math.max(rect.left - from.right, from.left - rect.right));
      const centerOffset = Math.abs(horizontal ? cy - fy : cx - fx);
      const score = along + across * 3 + centerOffset * 0.25;
      if ((inside && !bestInside) || score < bestScore) {
        bestScore = score;
        best = item;
        bestInside = inside;
      }
    }
    if (best) {
      best.focus({ preventScroll: true });
      best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  dispose(): void {
    this.closeAll();
    this.root.removeEventListener('click', this.onClick, true);
    window.removeEventListener('pointerdown', this.onPointer, { capture: true });
    window.removeEventListener('keydown', this.onKey, true);
  }
}
