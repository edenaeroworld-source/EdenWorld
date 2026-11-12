import { EventBus } from '../core/EventBus';
import { GamepadInput } from './GamepadInput';
import { type GameAction, type InputSettingsData, type KeyAction, keyLabel, padButtonGlyph } from './InputSettings';
import type { GamepadStatus, InputDevice, InputEvents, InputFrame, NavCommand } from './InputTypes';
import { KeyboardMouseInput } from './KeyboardMouseInput';
import { TouchInput } from './TouchInput';

function detectInitialDevice(): InputDevice {
  try {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const touch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
    if (coarse && touch) return 'toque';
  } catch {
    /* ambiente sem matchMedia */
  }
  return 'teclado';
}

/**
 * Central de comandos: combina teclado/mouse, toque e controle em um
 * único estado por quadro, acompanha o dispositivo em uso e publica
 * ações e navegação de menus.
 */
export class InputManager {
  readonly events = new EventBus<InputEvents>();
  readonly frame: InputFrame = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, zoom: 0, run: false, jumpHeld: false };
  readonly keyboard: KeyboardMouseInput;
  readonly gamepad: GamepadInput;
  readonly touch: TouchInput;
  settings: InputSettingsData;
  device: InputDevice;
  /** `true` enquanto os comandos controlam o personagem (sem menus abertos). */
  gameplayEnabled = false;

  private pendingDevice: InputDevice | null = null;
  private runToggled = false;
  private stillTime = 0;
  private readonly look = { x: 0, y: 0 };
  private touchControlsAllowed = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, settings: InputSettingsData) {
    this.settings = settings;
    this.device = detectInitialDevice();

    const base = {
      onAction: (action: GameAction) => this.handleAction(action),
      onNav: (command: NavCommand) => this.events.emit('nav', command),
    };
    const self = this;
    this.keyboard = new KeyboardMouseInput(canvas, {
      get settings() {
        return self.settings;
      },
      get gameplayEnabled() {
        return self.gameplayEnabled;
      },
      ...base,
      onActivity: () => this.noteDevice('teclado'),
      onPointerUnlock: () => this.events.emit('pointerUnlock', undefined),
    });
    this.gamepad = new GamepadInput({
      get settings() {
        return self.settings;
      },
      get gameplayEnabled() {
        return self.gameplayEnabled;
      },
      ...base,
      onActivity: () => this.noteDevice('controle'),
      onStatus: (status: GamepadStatus) => {
        if (!status.connected && this.device === 'controle') this.noteDevice(detectInitialDevice());
        this.events.emit('gamepad', status);
      },
    });
    this.touch = new TouchInput(canvas, uiRoot, {
      get settings() {
        return self.settings;
      },
      get gameplayEnabled() {
        return self.gameplayEnabled;
      },
      onAction: base.onAction,
      onActivity: () => this.noteDevice('toque'),
    });

    window.addEventListener('pointerdown', this.onGlobalPointer, { capture: true, passive: true });
  }

  private readonly onGlobalPointer = (event: PointerEvent): void => {
    this.noteDevice(event.pointerType === 'mouse' ? 'teclado' : 'toque');
  };

  private noteDevice(device: InputDevice): void {
    if (device !== this.device) this.pendingDevice = device;
  }

  private handleAction(action: GameAction): void {
    if (action === 'run') {
      if (this.settings.toggleRun) this.runToggled = !this.runToggled;
      return;
    }
    this.events.emit('action', action);
  }

  applySettings(settings: InputSettingsData): void {
    this.settings = settings;
    if (!settings.toggleRun) this.runToggled = false;
  }

  setGameplayEnabled(enabled: boolean): void {
    if (this.gameplayEnabled === enabled) return;
    this.gameplayEnabled = enabled;
    this.keyboard.reset();
    this.touch.reset();
    if (!enabled) {
      this.keyboard.releasePointer();
      this.frame.moveX = this.frame.moveY = this.frame.lookX = this.frame.lookY = this.frame.zoom = 0;
      this.frame.run = false;
      this.frame.jumpHeld = false;
    }
    this.refreshTouchVisibility();
  }

  /** Permite (ou não) exibir os controles de toque — ex.: ocultos em vistas panorâmicas. */
  setTouchControlsAllowed(allowed: boolean): void {
    this.touchControlsAllowed = allowed;
    this.refreshTouchVisibility();
  }

  private refreshTouchVisibility(): void {
    this.touch.setVisible(this.device === 'toque' && this.gameplayEnabled && this.touchControlsAllowed);
  }

  update(dt: number): InputFrame {
    this.gamepad.update(dt);

    if (this.pendingDevice && this.pendingDevice !== this.device) {
      this.device = this.pendingDevice;
      this.refreshTouchVisibility();
      this.events.emit('device', this.device);
    }
    this.pendingDevice = null;

    const frame = this.frame;
    if (!this.gameplayEnabled) {
      frame.moveX = frame.moveY = frame.lookX = frame.lookY = frame.zoom = 0;
      frame.run = false;
      frame.jumpHeld = false;
      return frame;
    }

    const keyboard = this.keyboard;
    let mx = (keyboard.isDown('right') ? 1 : 0) - (keyboard.isDown('left') ? 1 : 0);
    let my = (keyboard.isDown('forward') ? 1 : 0) - (keyboard.isDown('back') ? 1 : 0);
    mx += this.gamepad.moveX + this.touch.moveX;
    my += this.gamepad.moveY + this.touch.moveY;
    const magnitude = Math.hypot(mx, my);
    if (magnitude > 1) {
      mx /= magnitude;
      my /= magnitude;
    }
    frame.moveX = mx;
    frame.moveY = my;

    const invert = this.settings.invertY ? -1 : 1;
    keyboard.consumeLook(this.look);
    let lookX = this.look.x;
    let lookY = this.look.y;
    this.touch.consumeLook(this.look);
    lookX += this.look.x;
    lookY += this.look.y;
    lookX += this.gamepad.lookX;
    lookY += this.gamepad.lookY;
    frame.lookX = lookX;
    frame.lookY = lookY * invert;

    frame.zoom = keyboard.consumeWheel() + this.touch.consumeZoom() + this.gamepad.zoom;

    // Correr: segurar (padrão) ou alternar; no toque é sempre um botão liga/desliga.
    this.stillTime = magnitude > 0.1 ? 0 : this.stillTime + dt;
    if (this.stillTime > 0.6) this.runToggled = false;
    const held = keyboard.isDown('run') || this.gamepad.runHeld;
    frame.run = (this.settings.toggleRun ? this.runToggled : held) || this.touch.runToggle;
    frame.jumpHeld = keyboard.isDown('jump') || this.gamepad.jumpHeld || this.touch.jumpHeld;
    return frame;
  }

  /** Rótulo curto do comando de uma ação no dispositivo atual (para dicas do HUD). */
  actionHint(action: KeyAction): string {
    if (this.device === 'controle') {
      if (action === 'forward' || action === 'back' || action === 'left' || action === 'right') return 'L';
      return padButtonGlyph(this.settings.pad[action]);
    }
    if (this.device === 'toque') return '';
    const codes = this.settings.keys[action];
    return codes.length > 0 ? keyLabel(codes[0]) : '?';
  }

  /** Aguarda a próxima tecla (remapeamento). Resolve `null` se cancelado. */
  captureKey(): Promise<string | null> {
    this.cancelCapture();
    return new Promise((resolve) => {
      this.captureResolve = resolve as (value: string | number | null) => void;
      this.keyboard.captureKey = (code) => {
        this.captureResolve = null;
        resolve(code);
      };
    });
  }

  /** Aguarda o próximo botão do controle (remapeamento). Resolve `null` se cancelado. */
  capturePadButton(): Promise<number | null> {
    this.cancelCapture();
    return new Promise((resolve) => {
      this.captureResolve = resolve as (value: string | number | null) => void;
      this.gamepad.captureButton = (index) => {
        this.captureResolve = null;
        resolve(index);
      };
    });
  }

  private captureResolve: ((value: string | number | null) => void) | null = null;

  get isCapturing(): boolean {
    return this.captureResolve !== null;
  }

  cancelCapture(): void {
    this.keyboard.captureKey = null;
    this.gamepad.captureButton = null;
    const resolve = this.captureResolve;
    this.captureResolve = null;
    resolve?.(null);
  }

  vibrate(strong: number, weak: number, milliseconds: number): void {
    if (this.device === 'controle') this.gamepad.vibrate(strong, weak, milliseconds);
  }

  dispose(): void {
    this.cancelCapture();
    window.removeEventListener('pointerdown', this.onGlobalPointer, { capture: true });
    this.keyboard.dispose();
    this.gamepad.dispose();
    this.touch.dispose();
    this.events.clear();
  }
}
