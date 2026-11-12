import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYS,
  DEFAULT_PAD,
  GAME_ACTIONS,
  KEY_ACTIONS,
  PAD,
  applyRadialDeadzone,
  bindKey,
  bindPadButton,
  defaultInputSettings,
  keyLabel,
  padButtonLabel,
  sanitizeInputSettings,
} from '../../src/input/InputSettings';

describe('configurações de entrada', () => {
  it('os padrões não têm teclas nem botões repetidos', () => {
    const codes = KEY_ACTIONS.flatMap((action) => DEFAULT_KEYS[action]);
    expect(new Set(codes).size).toBe(codes.length);
    const buttons = GAME_ACTIONS.map((action) => DEFAULT_PAD[action]);
    expect(new Set(buttons).size).toBe(buttons.length);
    for (const action of KEY_ACTIONS) expect(DEFAULT_KEYS[action].length).toBeGreaterThan(0);
  });

  it('defaultInputSettings devolve cópias independentes', () => {
    const a = defaultInputSettings();
    a.keys.jump.push('KeyZ');
    a.pad.jump = 9;
    const b = defaultInputSettings();
    expect(b.keys.jump).toEqual(DEFAULT_KEYS.jump);
    expect(b.pad.jump).toBe(DEFAULT_PAD.jump);
  });

  it('sanitiza dados inválidos e mantém os válidos', () => {
    const d = defaultInputSettings();
    expect(sanitizeInputSettings(null)).toEqual(d);
    expect(sanitizeInputSettings('texto')).toEqual(d);
    const s = sanitizeInputSettings({
      keys: { jump: ['KeyJ', 42, ''], run: 'ShiftLeft', pause: ['KeyP'] },
      pad: { jump: 3, run: -1, interact: 99, phone: 1.5 },
      mouseSensitivity: 99,
      padSensitivity: Number.NaN,
      padDeadzone: 0,
      invertY: 'sim',
      toggleRun: true,
    });
    expect(s.keys.jump).toEqual(['KeyJ']);
    expect(s.keys.run).toEqual(d.keys.run);
    expect(s.keys.pause).toEqual(['KeyP', 'Escape']);
    expect(s.pad.jump).toBe(3);
    expect(s.pad.run).toBe(d.pad.run);
    expect(s.pad.interact).toBe(d.pad.interact);
    expect(s.pad.phone).toBe(d.pad.phone);
    expect(s.mouseSensitivity).toBe(3);
    expect(s.padSensitivity).toBe(1);
    expect(s.padDeadzone).toBe(0.05);
    expect(s.invertY).toBe(false);
    expect(s.toggleRun).toBe(true);
  });

  it('a zona morta zera o ruído e reescala sem degrau', () => {
    expect(applyRadialDeadzone(0.1, 0.05, 0.16)).toEqual({ x: 0, y: 0 });
    const edge = applyRadialDeadzone(0.17, 0, 0.16);
    expect(edge.x).toBeGreaterThan(0);
    expect(edge.x).toBeLessThan(0.02);
    const full = applyRadialDeadzone(1, 0, 0.16);
    expect(full.x).toBeCloseTo(1, 6);
    const diagonal = applyRadialDeadzone(1, 1, 0.16);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 6);
  });

  it('remapear uma tecla remove o conflito com outra ação', () => {
    const keys = bindKey(DEFAULT_KEYS, 'interact', 'Space');
    expect(keys.interact[0]).toBe('Space');
    expect(keys.jump).not.toContain('Space');
    // O original não é alterado.
    expect(DEFAULT_KEYS.jump).toContain('Space');
    const second = bindKey(keys, 'interact', 'KeyF', 1);
    expect(second.interact).toEqual(['Space', 'KeyF']);
  });

  it('Esc permanece reservada para pausar', () => {
    const keys = bindKey(DEFAULT_KEYS, 'jump', 'Escape');
    expect(keys.jump).toEqual(DEFAULT_KEYS.jump);
    expect(keys.pause).toContain('Escape');
    const moved = bindKey(DEFAULT_KEYS, 'pause', 'KeyP');
    expect(moved.pause).toContain('Escape');
    expect(moved.pause).toContain('KeyP');
    expect(moved.phone).not.toContain('KeyP');
  });

  it('remapear um botão do controle troca as duas ações', () => {
    const pad = bindPadButton(DEFAULT_PAD, 'jump', DEFAULT_PAD.interact);
    expect(pad.jump).toBe(DEFAULT_PAD.interact);
    expect(pad.interact).toBe(DEFAULT_PAD.jump);
    const values = GAME_ACTIONS.map((action) => pad[action]);
    expect(new Set(values).size).toBe(values.length);
  });

  it('gera rótulos legíveis para teclas e botões', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Space')).toBe('Espaço');
    expect(keyLabel('Digit3')).toBe('3');
    expect(padButtonLabel(PAD.A)).toMatch(/A/);
    expect(padButtonLabel(77)).toMatch(/77/);
  });
});
