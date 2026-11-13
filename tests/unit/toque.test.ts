// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserGestures } from '../../src/input/BrowserGestures';
import { InputManager } from '../../src/input/InputManager';
import { defaultInputSettings } from '../../src/input/InputSettings';
import { type PlatformProbe, detectPlatform } from '../../src/core/Platform';

/**
 * Um jogo, dois jeitos de jogar.
 *
 * O ponto destes testes não é que o toque funcione: é que ele funcione
 * **pelo mesmo caminho** que o teclado. Toda lógica de movimento, câmera,
 * interação e personagem vive atrás de `InputFrame` e de `GameAction`;
 * teclado, dedo e controle só enchem esse mesmo formulário. Se um dia
 * alguém duplicar a lógica de movimento "para o celular", estes testes
 * não vão perceber — mas a comparação direta de um contra o outro, sim.
 */

const PHONE: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  platform: 'Linux armv81',
  maxTouchPoints: 5,
  coarsePointer: true,
  hover: false,
  screenMin: 412,
  screenMax: 915,
};

const DESKTOP: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  platform: 'Win32',
  maxTouchPoints: 0,
  coarsePointer: false,
  hover: true,
  screenMin: 1080,
  screenMax: 1920,
};

/** Tudo que ouve `window` precisa ser desligado entre um teste e outro. */
const open: { dispose(): void }[] = [];

function setup(probe: PlatformProbe = PHONE) {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0, toJSON: () => ({}) }),
  });
  const uiRoot = document.createElement('div');
  document.body.append(canvas, uiRoot);
  const input = new InputManager(canvas, uiRoot, defaultInputSettings(), detectPlatform(probe));
  input.setGameplayEnabled(true);
  input.setTouchControlsAllowed(true);
  open.push(input);
  return { canvas, uiRoot, input };
}

function guardOn(canvas: HTMLCanvasElement): BrowserGestures {
  const guard = new BrowserGestures({ canvas, root: document });
  guard.setActive(true);
  open.push(guard);
  return guard;
}

/** Dispara um evento de ponteiro de toque. */
function touch(target: EventTarget, type: string, pointerId: number, x: number, y: number): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent & { pointerId: number; pointerType: string; clientX: number; clientY: number };
  Object.assign(event, { pointerId, pointerType: 'touch', clientX: x, clientY: y });
  target.dispatchEvent(event);
}

function key(type: 'keydown' | 'keyup', code: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  // Sem isto, o gerenciador do teste anterior continua ouvindo o teclado
  // da página e responde junto com o do teste atual.
  while (open.length) open.pop()!.dispose();
});

describe('o dedo e o teclado preenchem o mesmo formulário', () => {
  it('andar para a frente dá o mesmo quadro de comando nos dois', () => {
    const viaTeclado = setup(DESKTOP);
    key('keydown', 'KeyW');
    const keyboardFrame = { ...viaTeclado.input.update(1 / 60) };
    key('keyup', 'KeyW');

    const viaToque = setup(PHONE);
    // Polegar esquerdo: encosta e arrasta para cima até o limite do analógico.
    touch(viaToque.canvas, 'pointerdown', 1, 120, 300);
    touch(viaToque.canvas, 'pointermove', 1, 120, 300 - 56);
    const touchFrame = { ...viaToque.input.update(1 / 60) };

    expect(keyboardFrame.moveY).toBeCloseTo(1, 5);
    expect(touchFrame.moveY).toBeCloseTo(1, 5);
    expect(touchFrame.moveX).toBeCloseTo(keyboardFrame.moveX, 5);
  });

  it('girar a câmera chega pelo mesmo campo, venha do mouse ou do arrasto', () => {
    const { canvas, input } = setup(PHONE);
    // Dedo direito arrastando: só gira a câmera, não anda.
    touch(canvas, 'pointerdown', 2, 600, 200);
    touch(canvas, 'pointermove', 2, 660, 220);
    const frame = input.update(1 / 60);
    expect(frame.lookX).toBeGreaterThan(0);
    expect(frame.lookY).toBeGreaterThan(0);
    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
  });

  it('a pinça dá zoom pelo mesmo campo da roda do mouse', () => {
    const { canvas, input } = setup(PHONE);
    touch(canvas, 'pointerdown', 3, 500, 200);
    touch(canvas, 'pointerdown', 4, 700, 200);
    // Dedos se aproximando: afasta a câmera.
    touch(canvas, 'pointermove', 3, 560, 200);
    const frame = input.update(1 / 60);
    expect(frame.zoom).toBeGreaterThan(0);
  });

  it('os botões de toque emitem as mesmas ações das teclas', () => {
    const { uiRoot, input } = setup(PHONE);
    const seen: string[] = [];
    input.events.on('action', (action) => seen.push(action));

    const press = (label: string): void => {
      const button = uiRoot.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      expect(button, `botão "${label}" não existe na camada de toque`).toBeTruthy();
      touch(button!, 'pointerdown', 9, 0, 0);
    };
    press('Pular');
    press('Abrir o EdenPhone');
    press('Pausar e abrir o menu');
    const viaToque = [...seen];
    expect(viaToque).toEqual(['jump', 'phone', 'pause']);

    // As mesmas ações, pelo teclado — com a camada de toque já desligada.
    input.dispose();
    const keyboard = setup(DESKTOP);
    const viaKeys: string[] = [];
    keyboard.input.events.on('action', (action) => viaKeys.push(action));
    key('keydown', 'Space');
    key('keydown', 'KeyP');
    key('keydown', 'Escape');
    expect(viaKeys).toEqual(viaToque);
  });

  it('correr é um botão que alterna, e chega no mesmo campo `run`', () => {
    const { uiRoot, input } = setup(PHONE);
    const run = uiRoot.querySelector<HTMLButtonElement>('[aria-label="Correr"]')!;
    expect(input.update(1 / 60).run).toBe(false);
    touch(run, 'pointerdown', 7, 0, 0);
    expect(input.update(1 / 60).run).toBe(true);
    expect(run.getAttribute('aria-pressed')).toBe('true');
    touch(run, 'pointerdown', 7, 0, 0);
    expect(input.update(1 / 60).run).toBe(false);
  });

  it('o analógico tem zona morta: encostar o polegar não anda', () => {
    const { canvas, input } = setup(PHONE);
    touch(canvas, 'pointerdown', 1, 120, 300);
    touch(canvas, 'pointermove', 1, 124, 302);
    const frame = input.update(1 / 60);
    expect(Math.hypot(frame.moveX, frame.moveY)).toBe(0);
  });

  it('com o jogo parado, nenhum comando passa', () => {
    const { canvas, input } = setup(PHONE);
    touch(canvas, 'pointerdown', 1, 120, 300);
    touch(canvas, 'pointermove', 1, 120, 244);
    input.setGameplayEnabled(false);
    const frame = input.update(1 / 60);
    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
    expect(frame.run).toBe(false);
  });
});

describe('a interface segue o aparelho — e a escolha do jogador', () => {
  it('num celular, os controles de toque aparecem sozinhos', () => {
    const { uiRoot, input } = setup(PHONE);
    expect(input.device).toBe('toque');
    const layer = uiRoot.querySelector<HTMLDivElement>('.touch-layer')!;
    expect(layer.hidden).toBe(false);
  });

  it('num computador, não há camada de toque na tela', () => {
    const { uiRoot, input } = setup(DESKTOP);
    expect(input.device).toBe('teclado');
    expect(uiRoot.querySelector<HTMLDivElement>('.touch-layer')!.hidden).toBe(true);
  });

  it('no automático, encostar na tela de um notebook troca para o toque', () => {
    const { canvas, input } = setup(DESKTOP);
    expect(input.schemeLocked).toBe(false);
    touch(canvas, 'pointerdown', 1, 120, 300);
    input.update(1 / 60);
    expect(input.device).toBe('toque');
  });

  it('com o esquema fixado, encostar na tela não muda mais nada', () => {
    const { canvas, input } = setup(DESKTOP);
    input.applySettings({ ...defaultInputSettings(), scheme: 'teclado' });
    expect(input.schemeLocked).toBe(true);
    touch(canvas, 'pointerdown', 1, 120, 300);
    input.update(1 / 60);
    expect(input.device).toBe('teclado');
  });

  it('o jogador pode pedir o analógico virtual num computador', () => {
    const { uiRoot, input } = setup(DESKTOP);
    input.applySettings({ ...defaultInputSettings(), scheme: 'toque' });
    input.update(1 / 60);
    expect(input.device).toBe('toque');
    expect(uiRoot.querySelector<HTMLDivElement>('.touch-layer')!.hidden).toBe(false);
  });

  it('a orientação muda só o desenho, nunca o conteúdo', () => {
    const { uiRoot, input } = setup(PHONE);
    const layer = uiRoot.querySelector<HTMLDivElement>('.touch-layer')!;
    const before = layer.querySelectorAll('button').length;
    input.touch.setOrientation('retrato');
    expect(layer.dataset.orientation).toBe('retrato');
    expect(layer.querySelectorAll('button').length).toBe(before);
    input.touch.setOrientation('paisagem');
    expect(layer.dataset.orientation).toBe('paisagem');
    expect(layer.querySelectorAll('button').length).toBe(before);
  });
});

describe('os gestos do navegador ficam de fora — só durante o jogo', () => {
  it('a guarda liga com os controles e desliga quando eles saem', () => {
    const { input } = setup(PHONE);
    expect(input.touch.gesturesBlocked).toBe(true);
    input.setTouchControlsAllowed(false);
    expect(input.touch.gesturesBlocked).toBe(false);
  });

  it('bloqueia a pinça do Safari e o menu de toque longo', () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    guardOn(canvas);

    const pinch = new Event('gesturestart', { bubbles: true, cancelable: true });
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);

    const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('um dedo rolando uma lista de ajustes continua rolando', () => {
    const canvas = document.createElement('canvas');
    const list = document.createElement('div');
    document.body.append(canvas, list);
    guardOn(canvas);

    // Um dedo, fora do mundo 3D: a rolagem é do navegador.
    const scroll = new Event('touchmove', { bubbles: true, cancelable: true }) as TouchEvent & { touches: unknown };
    Object.assign(scroll, { touches: { length: 1 } });
    list.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);

    // Dois dedos: é pinça de página, e essa não passa.
    const pinch = new Event('touchmove', { bubbles: true, cancelable: true }) as TouchEvent & { touches: unknown };
    Object.assign(pinch, { touches: { length: 2 } });
    list.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
  });

  it('fora do jogo o navegador volta ao normal, sem ouvintes pendurados', () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const remove = vi.spyOn(document, 'removeEventListener');
    const guard = guardOn(canvas);
    guard.setActive(false);
    expect(remove).toHaveBeenCalled();

    const pinch = new Event('gesturestart', { bubbles: true, cancelable: true });
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(false);
    remove.mockRestore();
  });
});
