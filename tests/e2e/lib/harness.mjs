/**
 * Utilitários dos testes de ponta a ponta do EDENWORLD.
 *
 * Abrem o jogo em um Chromium sem interface (via puppeteer-core) e o
 * controlam como um jogador faria: teclado, mouse, toque e controle.
 * O estado do jogo é lido pela API de depuração `window.__eden`, que só
 * existe quando a página é aberta com `?debug`.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const ARTIFACTS = path.resolve(process.env.EDEN_ARTIFACTS ?? path.join(ROOT, 'tests/e2e/artifacts'));
/** Endereço do jogo. O executor define `EDEN_URL` ao subir o próprio servidor. */
export const baseUrl = () => (process.env.EDEN_URL ?? 'http://localhost:5173/').replace(/\/*$/, '/');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SYSTEM_BROWSERS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** Argumentos que permitem WebGL2 por software em máquinas sem GPU. */
const SOFTWARE_GL_ARGS = [
  '--no-sandbox',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
];

async function resolveBrowser() {
  const explicit = process.env.EDEN_CHROME ?? process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROME_PATH;
  if (explicit) return { executablePath: explicit, args: SOFTWARE_GL_ARGS };

  // Opcional: binário do pacote @sparticuz/chromium (útil em contêineres sem navegador).
  for (const dir of [process.env.EDEN_SPARTICUZ_DIR, ROOT]) {
    if (!dir) continue;
    try {
      const entry = createRequire(path.join(dir, 'noop.js')).resolve('@sparticuz/chromium');
      const chromium = (await import(pathToFileURL(entry).href)).default;
      return { executablePath: await chromium.executablePath(), args: [...chromium.args, '--mute-audio'] };
    } catch {
      /* pacote ausente: tenta a próxima opção */
    }
  }

  for (const candidate of SYSTEM_BROWSERS) {
    if (existsSync(candidate)) return { executablePath: candidate, args: SOFTWARE_GL_ARGS };
  }
  throw new Error(
    'Nenhum Chrome/Chromium encontrado. Defina EDEN_CHROME com o caminho do executável ' +
      '(ou EDEN_SPARTICUZ_DIR com uma pasta que contenha node_modules/@sparticuz/chromium).',
  );
}

export async function launch() {
  const { executablePath, args } = await resolveBrowser();
  // O navegador às vezes falha ao abrir logo após outro ter sido fechado: tenta de novo.
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await puppeteer.launch({ executablePath, args, headless: 'shell', defaultViewport: null, protocolTimeout: 240_000 });
    } catch (error) {
      lastError = error;
      await sleep(1500 * attempt);
    }
  }
  throw lastError;
}

/** Confere se o servidor do jogo está no ar antes de abrir o navegador. */
export async function assertServer() {
  const url = baseUrl();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`O jogo não respondeu em ${url} (${error.message}). Confira o valor de EDEN_URL e se o servidor está no ar.`);
  }
}

/** Mensagens de console que não indicam defeito do jogo. */
const IGNORED_CONSOLE = [/KHR_parallel_shader_compile/, /\[vite\]/, /GPU stall due to ReadPixels/, /GL Driver Message/];

/**
 * Abre o jogo em uma aba nova.
 *
 * @param {import('puppeteer-core').Browser} browser
 * @param {object} [options]
 * @param {string} [options.query]   parâmetros extras da URL (ex.: "skipmenu&quality=media")
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {boolean} [options.touch]  emula uma tela de toque (celular/tablet)
 * @param {number} [options.dpr]     densidade de pixels do dispositivo
 * @param {string|null} [options.save] conteúdo inicial do salvamento (JSON); `null` = jogo novo
 * @param {(page: import('puppeteer-core').Page) => Promise<void>} [options.beforeLoad]
 * @param {boolean} [options.waitReady] espera o primeiro quadro (padrão: true)
 */
export async function openGame(browser, options = {}) {
  const { query = '', width = 960, height = 540, touch = false, dpr = 1, save = null, beforeLoad, waitReady = true } = options;
  // Uma aba por cenário no contexto padrão (o Chromium de processo único não
  // aceita contextos anônimos); o armazenamento da origem é limpo antes de abrir.
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: touch, hasTouch: touch });
  const cdp = await page.createCDPSession();
  const BASE_URL = baseUrl();
  await cdp.send('Storage.clearDataForOrigin', { origin: new URL(BASE_URL).origin, storageTypes: 'local_storage' }).catch(() => {});

  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  page.on('console', (message) => {
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    if (message.type() === 'error') errors.push(`[console.error] ${text}`);
    else if (message.type() === 'warn' || message.type() === 'warning') warnings.push(`[console.warn] ${text}`);
  });
  page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
  page.on('requestfailed', (request) => errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`[http ${response.status()}] ${response.url()}`);
  });

  if (save !== null) {
    await page.evaluateOnNewDocument((text) => {
      try {
        if (!sessionStorage.getItem('__eden_seeded')) {
          localStorage.setItem('edenworld.save.v1', text);
          sessionStorage.setItem('__eden_seeded', '1');
        }
      } catch {
        /* armazenamento bloqueado */
      }
    }, save);
  }
  if (beforeLoad) await beforeLoad(page);

  const url = `${BASE_URL}?debug${query ? `&${query}` : ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });

  const session = {
    page,
    errors,
    warnings,
    url,

    /** Estado atual do jogo (ver `Engine.installDebugApi`). */
    state: () => page.evaluate(() => window.__eden.state()),

    /** Chama um método da API de depuração. */
    eden: (method, ...args) => page.evaluate((name, list) => window.__eden[name](...list), method, args),

    frames: () => page.evaluate(() => window.__frames ?? 0),

    /** Espera o jogo desenhar `count` quadros novos. */
    async waitFrames(count = 2, timeout = 120_000) {
      const start = await session.frames();
      await page.waitForFunction((target) => (window.__frames ?? 0) >= target, { timeout, polling: 100 }, start + count);
    },

    /**
     * Espera até que `predicate(state)` seja verdadeiro; devolve o estado.
     * `predicate` roda no navegador e recebe `window.__eden.state()`.
     */
    async waitState(predicate, label = 'condição', timeout = 60_000) {
      try {
        await page.waitForFunction(
          (source) => {
            if (!window.__eden) return false;
            return Boolean(new Function('s', `return (${source})(s);`)(window.__eden.state()));
          },
          { timeout, polling: 120 },
          predicate.toString(),
        );
      } catch (error) {
        const current = await session.state().catch(() => null);
        throw new Error(`Tempo esgotado esperando: ${label}\nEstado: ${JSON.stringify(current)}\n${error.message}`);
      }
      return session.state();
    },

    /** Espera um seletor ficar visível. */
    async waitVisible(selector, timeout = 30_000) {
      await page.waitForSelector(selector, { visible: true, timeout });
    },

    /**
     * Espera aparecer na tela um aviso temporário contendo `text`.
     * Os avisos somem em poucos segundos, por isso a espera começa logo
     * depois da ação que os provoca. Devolve o texto completo do aviso.
     */
    async waitToast(text, timeout = 15_000) {
      try {
        const handle = await page.waitForFunction(
          (expected) => {
            const toast = [...document.querySelectorAll('.toast')].find((el) => {
              const rect = el.getBoundingClientRect();
              return (el.textContent ?? '').includes(expected) && Number(getComputedStyle(el).opacity) > 0.5 && rect.width > 0 && rect.height > 0;
            });
            return toast ? toast.textContent : false;
          },
          { timeout, polling: 100 },
          text,
        );
        return await handle.jsonValue();
      } catch {
        const seen = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((el) => el.textContent));
        throw new Error(`Aviso não apareceu: "${text}" (avisos na tela: ${JSON.stringify(seen)})`);
      }
    },

    async shot(name) {
      mkdirSync(ARTIFACTS, { recursive: true });
      const file = path.join(ARTIFACTS, name.endsWith('.png') ? name : `${name}.png`);
      await page.screenshot({ path: file });
      return file;
    },

    press: (code) => page.keyboard.press(code),
    down: (code) => page.keyboard.down(code),
    up: (code) => page.keyboard.up(code),

    /** Mantém uma ou mais teclas pressionadas por `frames` quadros do jogo. */
    async hold(codes, frames = 10) {
      const list = Array.isArray(codes) ? codes : [codes];
      for (const code of list) await page.keyboard.down(code);
      await session.waitFrames(frames);
      for (const code of [...list].reverse()) await page.keyboard.up(code);
    },

    click: (selector) => page.click(selector),
    tap: (selector) => page.tap(selector),

    /** Localiza um botão visível pelo texto ou pelo rótulo acessível. */
    async findButton(label) {
      const handle = await page.evaluateHandle((text) => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const all = [...document.querySelectorAll('button, [role="button"], [role="tab"]')];
        return all.find((el) => visible(el) && ((el.textContent ?? '').trim() === text || el.getAttribute('aria-label') === text)) ?? null;
      }, label);
      const element = handle.asElement();
      if (!element) throw new Error(`Botão não encontrado: "${label}"`);
      return element;
    },

    /** Clica (mouse real, no centro do elemento) em um botão pelo rótulo. */
    async clickButton(label) {
      const element = await session.findButton(label);
      await element.click();
    },

    /** Toca (tela de toque) em um botão pelo rótulo. */
    async tapButton(label) {
      const element = await session.findButton(label);
      await element.tap();
    },

    /** Rótulos de todos os botões visíveis (para diagnósticos). */
    buttons: () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button, [role="tab"]')]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
          })
          .map((el) => (el.textContent ?? '').trim() || el.getAttribute('aria-label') || '?'),
      ),

    /** Texto visível de um elemento (ou `null`). */
    text: (selector) => page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? null, selector),

    /** `true` se o elemento existe e está visível na tela. */
    visible: (selector) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05 && rect.width > 0 && rect.height > 0;
      }, selector),

    sleep,

    /** Rótulo do elemento com foco (texto ou rótulo acessível), ou `null`. */
    focused: () =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.tagName.toLowerCase();
      }),

    /** `true` se a página não tem rolagem horizontal (nada vaza para fora da tela). */
    fitsViewport: () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.documentElement.scrollHeight <= window.innerHeight + 1),

    /** Retângulo de um elemento na tela (ou `null`). */
    rect: (selector) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }, selector),

    /** Espera o jogo terminar de carregar e desenhar os primeiros quadros. */
    async ready() {
      await page.waitForFunction(() => (window.__frames ?? 0) >= 2 && Boolean(window.__eden), { timeout: 180_000, polling: 200 });
    },

    /** Recarrega a página mantendo o salvamento (como fechar e reabrir o jogo). */
    async reload(newQuery) {
      const target = newQuery === undefined ? url : `${BASE_URL}?debug${newQuery ? `&${newQuery}` : ''}`;
      await page.goto(target, { waitUntil: 'load', timeout: 120_000 });
      await session.ready();
    },

    /** Conteúdo bruto do salvamento no navegador (ou `null`). */
    savedData: () =>
      page.evaluate(() => {
        const text = localStorage.getItem('edenworld.save.v1');
        return text ? JSON.parse(text) : null;
      }),

    async close() {
      await page.close();
    },
  };

  if (waitReady) await session.ready();
  return session;
}

/** Instala um controle (gamepad) simulado, controlável por `window.__pad`. */
export async function installFakeGamepad(page) {
  await page.evaluateOnNewDocument(() => {
    const pad = {
      id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
      index: 0,
      connected: false,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      vibrationActuator: {
        type: 'dual-rumble',
        calls: 0,
        playEffect() {
          this.calls += 1;
          return Promise.resolve('complete');
        },
        reset: () => Promise.resolve('complete'),
      },
    };
    const fire = (type) => {
      const event = new Event(type);
      Object.defineProperty(event, 'gamepad', { value: pad });
      window.dispatchEvent(event);
    };
    window.__pad = {
      pad,
      connect() {
        pad.connected = true;
        pad.timestamp = performance.now();
        fire('gamepadconnected');
      },
      disconnect() {
        pad.connected = false;
        fire('gamepaddisconnected');
      },
      button(index, pressed) {
        pad.buttons[index] = { pressed, touched: pressed, value: pressed ? 1 : 0 };
        pad.timestamp = performance.now();
      },
      axis(index, value) {
        pad.axes[index] = value;
        pad.timestamp = performance.now();
      },
    };
    navigator.getGamepads = () => (pad.connected ? [pad, null, null, null] : [null, null, null, null]);
  });
}

/** Índices dos botões no layout padrão da Gamepad API. */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

/** Controla o gamepad simulado instalado por `installFakeGamepad`. */
export function gamepad(session) {
  const { page } = session;
  const pad = {
    connect: () => page.evaluate(() => window.__pad.connect()),
    disconnect: () => page.evaluate(() => window.__pad.disconnect()),
    set: (index, pressed) => page.evaluate((i, v) => window.__pad.button(i, v), index, pressed),
    axis: (index, value) => page.evaluate((i, v) => window.__pad.axis(i, v), index, value),
    vibrations: () => page.evaluate(() => window.__pad.pad.vibrationActuator.calls),
    /** Aperta e solta um botão, dando tempo para o jogo ler os dois estados. */
    async press(index) {
      await pad.set(index, true);
      await session.waitFrames(2);
      await pad.set(index, false);
      await session.waitFrames(2);
    },
  };
  return pad;
}

/**
 * Coloca o jogador ao redor de um objeto interativo até ele virar o alvo da
 * interação (como alguém que caminha até o objeto e olha para ele).
 * `item` vem de `session.eden('interactables')`.
 */
export async function approach(session, item) {
  for (const distance of [1.3, 2.0, 0.8, 2.8]) {
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      await session.eden('teleport', item.x + Math.sin(angle) * distance, item.z + Math.cos(angle) * distance, angle + Math.PI);
      await session.waitFrames(2);
      const state = await session.state();
      if (state.target === item.id && Math.abs(state.player.y - item.y) < 2.5) return state;
    }
  }
  throw new Error(`Não foi possível mirar o interativo ${item.id} (${item.type})`);
}

/** Fecha telas e modos especiais até o jogador estar de volta ao jogo. */
export async function ensurePlaying(session) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const state = await session.state();
    if (state.mode === 'play' && state.modal === null) return state;
    if (state.modal === 'pausa') await session.clickButton('Continuar');
    else await session.press('Escape');
    await session.waitFrames(2);
  }
  throw new Error(`Não foi possível voltar ao jogo: ${JSON.stringify(await session.state())}`);
}

/** Passa pelo menu e pelo criador de avatar até entrar em Aurora City. */
export async function startNewGame(session, { name = '', tap = false } = {}) {
  const press = (label) => (tap ? session.tapButton(label) : session.clickButton(label));
  await press('Jogar');
  await session.waitState((s) => s.mode === 'creator', 'criador de avatar aberto');
  if (name) await session.page.type('.text-input', name);
  await press('Entrar em Aurora City');
  return session.waitState((s) => s.mode === 'play' && s.modal === null, 'entrada em Aurora City');
}

/** Salvamento mínimo válido para começar direto com um jogo em andamento. */
export function makeSave(overrides = {}) {
  return JSON.stringify({ version: 1, profile: { name: 'Teste', created: true }, ...overrides });
}

/* ------------------------------------------------------------------ */
/* Mini-executor de testes                                             */
/* ------------------------------------------------------------------ */

export class Checks {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    /** @type {string[]} */
    this.failures = [];
  }

  ok(condition, message) {
    if (condition) {
      this.passed += 1;
      console.log(`    ✓ ${message}`);
    } else {
      this.failures.push(message);
      console.log(`    ✗ ${message}`);
    }
  }

  equal(actual, expected, message) {
    this.ok(Object.is(actual, expected), `${message} (esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)})`);
  }

  near(actual, expected, tolerance, message) {
    this.ok(Math.abs(actual - expected) <= tolerance, `${message} (esperado ≈${expected}, obtido ${Number(actual).toFixed(3)})`);
  }

  noErrors(session, label = 'sem erros no console') {
    this.ok(session.errors.length === 0, `${label}${session.errors.length ? `: ${session.errors.slice(0, 5).join(' | ')}` : ''}`);
  }

  /**
   * Espera o jogo chegar a um estado e registra isso como verificação.
   * Se o tempo esgotar, a exceção é registrada como falha pela etapa.
   */
  async reach(session, predicate, label, timeout) {
    const state = await session.waitState(predicate, label, timeout);
    this.ok(true, label);
    return state;
  }

  /** Espera um aviso temporário com o texto indicado e registra a verificação. */
  async toast(session, text, label) {
    await session.waitToast(text);
    this.ok(true, label);
  }

  /**
   * Executa uma etapa do cenário. Uma exceção (tempo esgotado, botão
   * ausente...) vira falha registrada e o cenário segue para a próxima etapa.
   */
  async step(title, fn) {
    console.log(`  • ${title}`);
    try {
      await fn();
    } catch (error) {
      const message = String(error?.message ?? error).split('\n').slice(0, 2).join(' — ').slice(0, 600);
      this.failures.push(`${title}: ${message}`);
      console.log(`    ✗ ${title}: ${message}`);
    }
  }
}
