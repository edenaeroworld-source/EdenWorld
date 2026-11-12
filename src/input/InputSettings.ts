import { clamp } from '../utils/math';

/**
 * Configuração de controles (dados puros): teclas, botões do controle,
 * sensibilidades e zonas mortas. Tudo aqui é serializável e validado.
 */

export const GAME_ACTIONS = ['jump', 'run', 'interact', 'phone', 'pause', 'emote', 'cameraReset'] as const;
export type GameAction = (typeof GAME_ACTIONS)[number];

export const MOVE_KEYS = ['forward', 'back', 'left', 'right'] as const;
export type MoveKey = (typeof MOVE_KEYS)[number];

export type KeyAction = MoveKey | GameAction;
export const KEY_ACTIONS: readonly KeyAction[] = [...MOVE_KEYS, ...GAME_ACTIONS];

export const ACTION_LABELS: Record<KeyAction, string> = {
  forward: 'Andar para frente',
  back: 'Andar para trás',
  left: 'Andar para a esquerda',
  right: 'Andar para a direita',
  jump: 'Pular',
  run: 'Correr',
  interact: 'Interagir',
  phone: 'EdenPhone',
  pause: 'Pausar / Menu',
  emote: 'Acenar',
  cameraReset: 'Centralizar câmera',
};

export type KeyBindings = Record<KeyAction, string[]>;
export type PadBindings = Record<GameAction, number>;

export const DEFAULT_KEYS: KeyBindings = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE', 'Enter'],
  phone: ['Tab', 'KeyP'],
  pause: ['Escape'],
  emote: ['KeyG'],
  cameraReset: ['KeyC'],
};

/** Índices do mapeamento padrão da Gamepad API. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  HOME: 16,
} as const;

export const DEFAULT_PAD: PadBindings = {
  jump: PAD.A,
  run: PAD.RT,
  interact: PAD.X,
  phone: PAD.Y,
  pause: PAD.START,
  emote: PAD.UP,
  cameraReset: PAD.R3,
};

const PAD_LABELS: Record<number, string> = {
  0: 'A / Cruz',
  1: 'B / Círculo',
  2: 'X / Quadrado',
  3: 'Y / Triângulo',
  4: 'LB / L1',
  5: 'RB / R1',
  6: 'LT / L2',
  7: 'RT / R2',
  8: 'Select / Share',
  9: 'Start / Options',
  10: 'L3 (analógico esq.)',
  11: 'R3 (analógico dir.)',
  12: 'Direcional ↑',
  13: 'Direcional ↓',
  14: 'Direcional ←',
  15: 'Direcional →',
  16: 'Home',
};

export function padButtonLabel(index: number): string {
  return PAD_LABELS[index] ?? `Botão ${index}`;
}

/** Rótulo curto para o indicador de ação no HUD. */
export function padButtonGlyph(index: number): string {
  const glyphs: Record<number, string> = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Select', 9: 'Start', 10: 'L3', 11: 'R3', 12: '↑', 13: '↓', 14: '←', 15: '→' };
  return glyphs[index] ?? `B${index}`;
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Espaço',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift dir.',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl dir.',
  AltLeft: 'Alt',
  AltRight: 'Alt dir.',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: 'Backspace',
  CapsLock: 'Caps Lock',
  Backquote: "'",
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
};

/** Nome legível de uma tecla a partir de `KeyboardEvent.code`. */
export function keyLabel(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export interface InputSettingsData {
  keys: KeyBindings;
  pad: PadBindings;
  /** Multiplicadores de sensibilidade (1 = padrão). */
  mouseSensitivity: number;
  padSensitivity: number;
  touchSensitivity: number;
  invertY: boolean;
  /** Zona morta dos analógicos (0,05–0,5). */
  padDeadzone: number;
  /** Correr alterna com um toque em vez de exigir segurar. */
  toggleRun: boolean;
  /** Vibração do controle em eventos do jogo (quando suportada). */
  vibration: boolean;
}

export function defaultInputSettings(): InputSettingsData {
  return {
    keys: structuredCloneSafe(DEFAULT_KEYS),
    pad: { ...DEFAULT_PAD },
    mouseSensitivity: 1,
    padSensitivity: 1,
    touchSensitivity: 1,
    invertY: false,
    padDeadzone: 0.16,
    toggleRun: false,
    vibration: true,
  };
}

function structuredCloneSafe(keys: KeyBindings): KeyBindings {
  const out = {} as KeyBindings;
  for (const action of KEY_ACTIONS) out[action] = [...keys[action]];
  return out;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

/** Valida e completa configurações vindas do armazenamento local. */
export function sanitizeInputSettings(raw: unknown): InputSettingsData {
  const d = defaultInputSettings();
  if (!raw || typeof raw !== 'object') return d;
  const src = raw as Record<string, unknown>;

  const keysSrc = (src.keys && typeof src.keys === 'object' ? src.keys : {}) as Record<string, unknown>;
  for (const action of KEY_ACTIONS) {
    const list = keysSrc[action];
    if (Array.isArray(list)) {
      const codes = list.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length < 32).slice(0, 3);
      if (codes.length > 0) d.keys[action] = codes;
    }
  }
  // "Pausar" precisa sempre de uma tecla para o jogador nunca ficar preso.
  if (!d.keys.pause.includes('Escape')) d.keys.pause.push('Escape');

  const padSrc = (src.pad && typeof src.pad === 'object' ? src.pad : {}) as Record<string, unknown>;
  for (const action of GAME_ACTIONS) {
    const index = padSrc[action];
    if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= 31) d.pad[action] = index;
  }

  d.mouseSensitivity = num(src.mouseSensitivity, d.mouseSensitivity, 0.2, 3);
  d.padSensitivity = num(src.padSensitivity, d.padSensitivity, 0.2, 3);
  d.touchSensitivity = num(src.touchSensitivity, d.touchSensitivity, 0.2, 3);
  d.padDeadzone = num(src.padDeadzone, d.padDeadzone, 0.05, 0.5);
  if (typeof src.invertY === 'boolean') d.invertY = src.invertY;
  if (typeof src.toggleRun === 'boolean') d.toggleRun = src.toggleRun;
  if (typeof src.vibration === 'boolean') d.vibration = src.vibration;
  return d;
}

/**
 * Zona morta radial com reescala: abaixo de `deadzone` o resultado é zero;
 * acima, cresce suavemente de 0 a 1 (sem "degrau" na borda).
 */
export function applyRadialDeadzone(x: number, y: number, deadzone: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone || magnitude === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  out.x = (x / magnitude) * scaled;
  out.y = (y / magnitude) * scaled;
  return out;
}

/** Atribui uma tecla a uma ação, removendo-a de qualquer outra (sem conflitos). */
export function bindKey(keys: KeyBindings, action: KeyAction, code: string, slot = 0): KeyBindings {
  const next = structuredCloneSafe(keys);
  // Esc é reservada para pausar: nunca pode ser atribuída a outra ação.
  if (code === 'Escape' && action !== 'pause') return next;
  for (const other of KEY_ACTIONS) {
    if (other !== action) next[other] = next[other].filter((c) => c !== code);
  }
  const list = next[action].filter((c) => c !== code);
  list[Math.min(slot, list.length)] = code;
  next[action] = list.slice(0, 3);
  if (!next.pause.includes('Escape')) next.pause.push('Escape');
  return next;
}

/** Atribui um botão do controle a uma ação; se já estiver em uso, troca as duas ações. */
export function bindPadButton(pad: PadBindings, action: GameAction, button: number): PadBindings {
  const next = { ...pad };
  const previous = next[action];
  for (const other of GAME_ACTIONS) {
    if (other !== action && next[other] === button) next[other] = previous;
  }
  next[action] = button;
  return next;
}
