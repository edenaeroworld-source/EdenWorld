import { icon } from '../interface/icons';
import type { GameAction, InputSettingsData } from './InputSettings';

export interface TouchHost {
  readonly settings: InputSettingsData;
  readonly gameplayEnabled: boolean;
  onAction(action: GameAction): void;
  onActivity(): void;
}

const STICK_RADIUS = 56;
const TOUCH_RADIANS_PER_PIXEL = 0.0052;

/**
 * Controles de toque: analógico virtual dinâmico no lado esquerdo,
 * arrastar para girar a câmera, pinça para zoom e botões de ação.
 */
export class TouchInput {
  moveX = 0;
  moveY = 0;
  jumpHeld = false;
  runToggle = false;

  private readonly layer: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly jumpButton: HTMLButtonElement;
  private readonly runButton: HTMLButtonElement;
  private readonly interactButton: HTMLButtonElement;
  private stickPointer = -1;
  private stickX = 0;
  private stickY = 0;
  private readonly lookPointers = new Map<number, { x: number; y: number }>();
  private lookX = 0;
  private lookY = 0;
  private pinchDistance = 0;
  private zoom = 0;
  private visible = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    private readonly host: TouchHost,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.layer.hidden = true;
    this.layer.setAttribute('aria-hidden', 'true');

    this.stick = document.createElement('div');
    this.stick.className = 'touch-stick';
    this.knob = document.createElement('div');
    this.knob.className = 'touch-stick__knob';
    this.stick.appendChild(this.knob);

    const buttons = document.createElement('div');
    buttons.className = 'touch-buttons';
    this.interactButton = this.makeButton('touch-btn touch-btn--interact', icon('hand', 30), 'Interagir');
    this.runButton = this.makeButton('touch-btn touch-btn--run', icon('run', 26), 'Correr');
    this.jumpButton = this.makeButton('touch-btn touch-btn--jump', icon('jump', 34), 'Pular');
    this.interactButton.hidden = true;
    buttons.append(this.interactButton, this.runButton, this.jumpButton);
    this.layer.append(this.stick, buttons);
    uiRoot.appendChild(this.layer);

    this.jumpButton.addEventListener('pointerdown', this.onJumpDown);
    this.jumpButton.addEventListener('pointerup', this.onJumpUp);
    this.jumpButton.addEventListener('pointercancel', this.onJumpUp);
    this.jumpButton.addEventListener('pointerleave', this.onJumpUp);
    this.runButton.addEventListener('pointerdown', this.onRunDown);
    this.interactButton.addEventListener('pointerdown', this.onInteractDown);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  private makeButton(className: string, content: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.innerHTML = content;
    button.setAttribute('aria-label', label);
    button.tabIndex = -1;
    return button;
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.layer.hidden = !visible;
    if (!visible) this.reset();
  }

  /** Mostra o botão de interação com o texto da ação disponível. */
  setInteraction(label: string | null): void {
    this.interactButton.hidden = label === null;
    if (label !== null) this.interactButton.setAttribute('aria-label', label);
  }

  consumeLook(out: { x: number; y: number }): void {
    const scale = TOUCH_RADIANS_PER_PIXEL * this.host.settings.touchSensitivity;
    out.x = this.lookX * scale;
    out.y = this.lookY * scale;
    this.lookX = 0;
    this.lookY = 0;
  }

  consumeZoom(): number {
    const value = this.zoom;
    this.zoom = 0;
    return value;
  }

  reset(): void {
    this.moveX = this.moveY = 0;
    this.jumpHeld = false;
    this.stickPointer = -1;
    this.lookPointers.clear();
    this.lookX = this.lookY = 0;
    this.zoom = 0;
    this.pinchDistance = 0;
    this.jumpButton.classList.remove('is-pressed');
    this.restStick();
  }

  /** Devolve o analógico à posição de descanso, com o botão centralizado. */
  private restStick(): void {
    this.stick.classList.remove('is-active');
    this.stick.style.left = '';
    this.stick.style.top = '';
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private setRun(value: boolean): void {
    this.runToggle = value;
    this.runButton.classList.toggle('is-on', value);
    this.runButton.setAttribute('aria-pressed', String(value));
  }

  private readonly onJumpDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.host.onActivity();
    if (!this.host.gameplayEnabled) return;
    this.jumpHeld = true;
    this.jumpButton.classList.add('is-pressed');
    this.host.onAction('jump');
  };

  private readonly onJumpUp = (): void => {
    this.jumpHeld = false;
    this.jumpButton.classList.remove('is-pressed');
  };

  private readonly onRunDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.host.onActivity();
    this.setRun(!this.runToggle);
  };

  private readonly onInteractDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.host.onActivity();
    if (this.host.gameplayEnabled) this.host.onAction('interact');
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    this.host.onActivity();
    if (!this.host.gameplayEnabled) return;
    event.preventDefault();
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* captura opcional */
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const inStickZone = x < rect.width * 0.42 && y > rect.height * 0.3;
    if (inStickZone && this.stickPointer < 0) {
      this.stickPointer = event.pointerId;
      this.stickX = x;
      this.stickY = y;
      this.stick.style.left = `${x}px`;
      this.stick.style.top = `${y}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.stick.classList.add('is-active');
      return;
    }
    this.lookPointers.set(event.pointerId, { x, y });
    if (this.lookPointers.size === 2) this.pinchDistance = this.currentPinch();
  };

  private currentPinch(): number {
    const points = [...this.lookPointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (event.pointerId === this.stickPointer) {
      let dx = x - this.stickX;
      let dy = y - this.stickY;
      const distance = Math.hypot(dx, dy);
      if (distance > STICK_RADIUS) {
        dx = (dx / distance) * STICK_RADIUS;
        dy = (dy / distance) * STICK_RADIUS;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / STICK_RADIUS;
      const ny = dy / STICK_RADIUS;
      // Pequena zona morta para o polegar em repouso.
      const magnitude = Math.hypot(nx, ny);
      if (magnitude < 0.14) {
        this.moveX = 0;
        this.moveY = 0;
      } else {
        const scaled = (magnitude - 0.14) / 0.86 / magnitude;
        this.moveX = nx * scaled;
        this.moveY = -ny * scaled;
      }
      return;
    }
    const point = this.lookPointers.get(event.pointerId);
    if (!point) return;
    if (this.lookPointers.size >= 2) {
      point.x = x;
      point.y = y;
      const distance = this.currentPinch();
      if (this.pinchDistance > 0 && distance > 0) this.zoom += (this.pinchDistance - distance) * 0.02;
      this.pinchDistance = distance;
      return;
    }
    this.lookX += x - point.x;
    this.lookY += y - point.y;
    point.x = x;
    point.y = y;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    if (event.pointerId === this.stickPointer) {
      this.stickPointer = -1;
      this.moveX = 0;
      this.moveY = 0;
      this.restStick();
      return;
    }
    this.lookPointers.delete(event.pointerId);
    this.pinchDistance = this.lookPointers.size === 2 ? this.currentPinch() : 0;
  };

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.layer.remove();
  }
}
