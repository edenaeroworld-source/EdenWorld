import { GAME_ACTIONS, type GameAction, type InputSettingsData, PAD, applyRadialDeadzone } from './InputSettings';
import type { GamepadSnapshot, GamepadStatus, NavCommand } from './InputTypes';

export interface GamepadHost {
  readonly settings: InputSettingsData;
  readonly gameplayEnabled: boolean;
  onAction(action: GameAction): void;
  onNav(command: NavCommand): void;
  onActivity(): void;
  onStatus(status: GamepadStatus): void;
}

const NAV_INITIAL_DELAY = 0.38;
const NAV_REPEAT = 0.13;
const LOOK_YAW_RATE = 2.9;
const LOOK_PITCH_RATE = 1.9;
const ZOOM_RATE = 5;

function pressed(button: GamepadButton | undefined): boolean {
  return !!button && (button.pressed || button.value > 0.5);
}

/**
 * Leitura de controles pela Gamepad API (Xbox, PlayStation e similares
 * com layout padrão): analógicos com zona morta, botões remapeáveis,
 * navegação de menus com repetição e vibração.
 */
export class GamepadInput {
  moveX = 0;
  moveY = 0;
  lookX = 0;
  lookY = 0;
  zoom = 0;
  runHeld = false;
  jumpHeld = false;
  status: GamepadStatus = { connected: false, id: '', standard: false };
  /** Quando definido, o próximo botão pressionado é entregue aqui (remapeamento). */
  captureButton: ((index: number) => void) | null = null;

  private activeIndex = -1;
  private previous: boolean[] = [];
  private navDirection: NavCommand | null = null;
  private navTimer = 0;
  private readonly stick = { x: 0, y: 0 };

  constructor(private readonly host: GamepadHost) {
    window.addEventListener('gamepadconnected', this.onConnected);
    window.addEventListener('gamepaddisconnected', this.onDisconnected);
  }

  private readonly onConnected = (event: GamepadEvent): void => {
    if (this.activeIndex < 0) this.activeIndex = event.gamepad.index;
    this.refreshStatus();
  };

  private readonly onDisconnected = (event: GamepadEvent): void => {
    if (event.gamepad.index === this.activeIndex) {
      this.activeIndex = -1;
      this.clear();
    }
    this.refreshStatus();
  };

  private pads(): (Gamepad | null)[] {
    try {
      return typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()) : [];
    } catch {
      return [];
    }
  }

  private current(): Gamepad | null {
    const pads = this.pads();
    let pad = this.activeIndex >= 0 ? (pads[this.activeIndex] ?? null) : null;
    if (!pad || !pad.connected) {
      pad = null;
      for (const candidate of pads) {
        if (candidate && candidate.connected) {
          pad = candidate;
          break;
        }
      }
      this.activeIndex = pad ? pad.index : -1;
    }
    return pad;
  }

  private refreshStatus(): void {
    const pad = this.current();
    const next: GamepadStatus = pad ? { connected: true, id: pad.id, standard: pad.mapping === 'standard' } : { connected: false, id: '', standard: false };
    const changed = next.connected !== this.status.connected || next.id !== this.status.id;
    this.status = next;
    if (changed) this.host.onStatus(next);
  }

  private clear(): void {
    this.moveX = this.moveY = this.lookX = this.lookY = this.zoom = 0;
    this.runHeld = false;
    this.jumpHeld = false;
    this.previous = [];
    this.navDirection = null;
  }

  /** Leitura bruta para a tela de teste do controle. */
  snapshot(): GamepadSnapshot | null {
    const pad = this.current();
    if (!pad) return null;
    return { axes: pad.axes.map((v) => v), buttons: pad.buttons.map((b) => b.value) };
  }

  vibrate(strong: number, weak: number, milliseconds: number): void {
    if (!this.host.settings.vibration) return;
    const pad = this.current();
    const actuator = pad?.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== 'function') return;
    try {
      void actuator.playEffect('dual-rumble', { duration: milliseconds, strongMagnitude: strong, weakMagnitude: weak }).catch(() => undefined);
    } catch {
      /* vibração é opcional */
    }
  }

  update(dt: number): void {
    const pad = this.current();
    if (!pad) {
      if (this.status.connected) {
        this.clear();
        this.refreshStatus();
      }
      return;
    }
    if (!this.status.connected || this.status.id !== pad.id) this.refreshStatus();

    const settings = this.host.settings;
    const buttons = pad.buttons;
    const count = buttons.length;
    const previous = this.previous;
    let activity = false;

    // Bordas de pressionamento.
    const justPressed: number[] = [];
    for (let i = 0; i < count; i++) {
      const isDown = pressed(buttons[i]);
      if (isDown && !previous[i]) justPressed.push(i);
      if (isDown) activity = true;
      previous[i] = isDown;
    }
    previous.length = count;

    const deadzone = settings.padDeadzone;
    const left = applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, deadzone, this.stick);
    const lx = left.x;
    const ly = left.y;
    const right = applyRadialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, deadzone, this.stick);
    const rx = right.x;
    const ry = right.y;
    if (Math.abs(lx) > 0.3 || Math.abs(ly) > 0.3 || Math.abs(rx) > 0.3 || Math.abs(ry) > 0.3) activity = true;
    if (activity) this.host.onActivity();

    if (this.captureButton && justPressed.length > 0) {
      const capture = this.captureButton;
      this.captureButton = null;
      capture(justPressed[0]);
      this.resetContinuous();
      return;
    }

    if (!this.host.gameplayEnabled) {
      this.resetContinuous();
      this.updateNavigation(dt, buttons, lx, ly, justPressed);
      return;
    }
    this.navDirection = null;

    const bindings = settings.pad;
    for (const index of justPressed) {
      for (const action of GAME_ACTIONS) {
        if (bindings[action] === index) this.host.onAction(action);
      }
    }

    this.moveX = lx;
    this.moveY = -ly;
    // Curva quadrática: precisão em movimentos pequenos, rapidez nos grandes.
    const sensitivity = settings.padSensitivity;
    this.lookX = rx * Math.abs(rx) * LOOK_YAW_RATE * sensitivity * dt;
    this.lookY = ry * Math.abs(ry) * LOOK_PITCH_RATE * sensitivity * dt;
    this.runHeld = pressed(buttons[bindings.run]);
    this.jumpHeld = pressed(buttons[bindings.jump]);

    // LB/RB controlam o zoom, salvo se tiverem sido atribuídos a outra ação.
    let zoom = 0;
    if (!this.isBound(PAD.LB) && pressed(buttons[PAD.LB])) zoom -= 1;
    if (!this.isBound(PAD.RB) && pressed(buttons[PAD.RB])) zoom += 1;
    this.zoom = zoom * ZOOM_RATE * dt;
  }

  private isBound(index: number): boolean {
    const bindings = this.host.settings.pad;
    for (const action of GAME_ACTIONS) if (bindings[action] === index) return true;
    return false;
  }

  private resetContinuous(): void {
    this.moveX = this.moveY = this.lookX = this.lookY = this.zoom = 0;
    this.runHeld = false;
    this.jumpHeld = false;
  }

  private updateNavigation(dt: number, buttons: readonly GamepadButton[], lx: number, ly: number, justPressed: readonly number[]): void {
    for (const index of justPressed) {
      if (index === PAD.A) this.host.onNav('confirm');
      else if (index === PAD.B) this.host.onNav('back');
      else if (index === PAD.LB) this.host.onNav('prevTab');
      else if (index === PAD.RB) this.host.onNav('nextTab');
      else if (index === PAD.START) this.host.onNav('menu');
    }

    let direction: NavCommand | null = null;
    if (pressed(buttons[PAD.UP]) || ly < -0.6) direction = 'up';
    else if (pressed(buttons[PAD.DOWN]) || ly > 0.6) direction = 'down';
    else if (pressed(buttons[PAD.LEFT]) || lx < -0.6) direction = 'left';
    else if (pressed(buttons[PAD.RIGHT]) || lx > 0.6) direction = 'right';

    if (direction === null) {
      this.navDirection = null;
      return;
    }
    if (direction !== this.navDirection) {
      this.navDirection = direction;
      this.navTimer = NAV_INITIAL_DELAY;
      this.host.onNav(direction);
      return;
    }
    this.navTimer -= dt;
    if (this.navTimer <= 0) {
      this.navTimer = NAV_REPEAT;
      this.host.onNav(direction);
    }
  }

  dispose(): void {
    window.removeEventListener('gamepadconnected', this.onConnected);
    window.removeEventListener('gamepaddisconnected', this.onDisconnected);
  }
}
