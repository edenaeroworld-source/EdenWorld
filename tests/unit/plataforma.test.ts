import { describe, expect, it } from 'vitest';
import {
  CONTROL_SCHEMES,
  CONTROL_SCHEME_LABELS,
  type PlatformProbe,
  detectPlatform,
  isControlScheme,
  orientationOf,
  resolveScheme,
  shouldSuggestLandscape,
} from '../../src/core/Platform';
import { defaultInputSettings, sanitizeInputSettings } from '../../src/input/InputSettings';
import { defaultGraphicsSettings, suggestQualityLevel } from '../../src/systems/QualitySystem';

/**
 * Detecção de plataforma.
 *
 * As cadeias de identificação abaixo são reais, copiadas de aparelhos de
 * verdade. Detecção de aparelho é uma daquelas coisas que parecem simples
 * até o iPad resolver se chamar de Mac.
 */

const DESKTOP: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  platform: 'Win32',
  maxTouchPoints: 0,
  coarsePointer: false,
  hover: true,
  screenMin: 1080,
  screenMax: 1920,
};

const MAC: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 0,
  coarsePointer: false,
  hover: true,
  screenMin: 1080,
  screenMax: 1728,
};

const ANDROID_PHONE: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  platform: 'Linux armv81',
  maxTouchPoints: 5,
  coarsePointer: true,
  hover: false,
  screenMin: 360,
  screenMax: 780,
};

const ANDROID_TABLET: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  platform: 'Linux aarch64',
  maxTouchPoints: 10,
  coarsePointer: true,
  hover: false,
  screenMin: 800,
  screenMax: 1280,
};

const IPHONE: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
  maxTouchPoints: 5,
  coarsePointer: true,
  hover: false,
  screenMin: 393,
  screenMax: 852,
};

/** iPadOS 13+ se apresenta como Macintosh. A única pista é o toque. */
const IPAD: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5,
  coarsePointer: true,
  hover: false,
  screenMin: 834,
  screenMax: 1194,
};

const IPAD_ANTIGO: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  platform: 'iPad',
  maxTouchPoints: 5,
  coarsePointer: true,
  hover: false,
  screenMin: 768,
  screenMax: 1024,
};

/** Notebook com tela sensível ao toque: continua sendo um computador. */
const NOTEBOOK_TOQUE: PlatformProbe = {
  ...DESKTOP,
  maxTouchPoints: 10,
  coarsePointer: false,
  hover: true,
};

describe('detecção de plataforma', () => {
  it('reconhece um computador', () => {
    const platform = detectPlatform(DESKTOP);
    expect(platform.os).toBe('windows');
    expect(platform.form).toBe('computador');
    expect(platform.mobile).toBe(false);
    expect(platform.scheme).toBe('teclado');
  });

  it('reconhece um Mac — e não o confunde com iPad', () => {
    const platform = detectPlatform(MAC);
    expect(platform.os).toBe('macos');
    expect(platform.form).toBe('computador');
    expect(platform.touch).toBe(false);
  });

  it('reconhece celular Android pela palavra Mobile', () => {
    const platform = detectPlatform(ANDROID_PHONE);
    expect(platform.os).toBe('android');
    expect(platform.form).toBe('celular');
    expect(platform.scheme).toBe('toque');
    expect(platform.label).toBe('Android · celular');
  });

  it('reconhece tablet Android pela ausência de Mobile', () => {
    const platform = detectPlatform(ANDROID_TABLET);
    expect(platform.os).toBe('android');
    expect(platform.form).toBe('tablet');
    expect(platform.mobile).toBe(true);
  });

  it('reconhece iPhone', () => {
    const platform = detectPlatform(IPHONE);
    expect(platform.os).toBe('ios');
    expect(platform.form).toBe('celular');
    expect(platform.label).toBe('iPhone');
  });

  it('desmascara o iPad que se diz Macintosh', () => {
    const platform = detectPlatform(IPAD);
    expect(platform.os).toBe('ios');
    expect(platform.form).toBe('tablet');
    expect(platform.label).toBe('iPad');
    expect(platform.scheme).toBe('toque');
  });

  it('também reconhece o iPad antigo, que ainda se identificava', () => {
    const platform = detectPlatform(IPAD_ANTIGO);
    expect(platform.os).toBe('ios');
    expect(platform.form).toBe('tablet');
  });

  it('um notebook com tela de toque continua sendo computador', () => {
    const platform = detectPlatform(NOTEBOOK_TOQUE);
    expect(platform.form).toBe('computador');
    expect(platform.touch).toBe(true);
    // Tem teclado e cursor: o padrão é WASD, não analógico virtual.
    expect(platform.scheme).toBe('teclado');
  });

  it('não quebra quando o navegador não diz nada', () => {
    const platform = detectPlatform({ userAgent: '', platform: '', maxTouchPoints: 0, coarsePointer: false, hover: true, screenMin: 800, screenMax: 1280 });
    expect(platform.os).toBe('desconhecido');
    expect(platform.form).toBe('computador');
    expect(platform.label).toBe('Computador');
  });

  it('aparelho de toque sem identificação decide pelo tamanho da tela', () => {
    const base = { userAgent: 'Mozilla/5.0 (Unknown)', platform: '', maxTouchPoints: 5, coarsePointer: true, hover: false };
    expect(detectPlatform({ ...base, screenMin: 400, screenMax: 800 }).form).toBe('celular');
    expect(detectPlatform({ ...base, screenMin: 820, screenMax: 1180 }).form).toBe('tablet');
  });
});

describe('preferência de comando', () => {
  it('o padrão é automático e segue a plataforma', () => {
    expect(defaultInputSettings().scheme).toBe('auto');
    expect(resolveScheme('auto', detectPlatform(IPHONE))).toBe('toque');
    expect(resolveScheme('auto', detectPlatform(DESKTOP))).toBe('teclado');
  });

  it('a escolha do jogador vence a detecção', () => {
    const phone = detectPlatform(ANDROID_PHONE);
    // Tablet com teclado Bluetooth: o jogador quer WASD.
    expect(resolveScheme('teclado', phone)).toBe('teclado');
    // Notebook com tela de toque: o jogador quer o analógico virtual.
    expect(resolveScheme('toque', detectPlatform(NOTEBOOK_TOQUE))).toBe('toque');
    expect(resolveScheme('controle', phone)).toBe('controle');
  });

  it('a preferência sobrevive ao salvamento, e lixo volta ao automático', () => {
    expect(sanitizeInputSettings({ scheme: 'toque' }).scheme).toBe('toque');
    expect(sanitizeInputSettings({ scheme: 'kinect' }).scheme).toBe('auto');
    // Salvamento anterior a este recurso: sem o campo, continua no automático.
    expect(sanitizeInputSettings({ invertY: true }).scheme).toBe('auto');
  });

  it('todos os esquemas têm rótulo, e o validador conhece todos', () => {
    for (const scheme of CONTROL_SCHEMES) {
      expect(CONTROL_SCHEME_LABELS[scheme].length).toBeGreaterThan(0);
      expect(isControlScheme(scheme)).toBe(true);
    }
    expect(isControlScheme('volante')).toBe(false);
  });
});

describe('orientação', () => {
  it('distingue em pé de deitado', () => {
    expect(orientationOf(390, 844)).toBe('retrato');
    expect(orientationOf(844, 390)).toBe('paisagem');
    // Quadrado conta como deitado: cabe a interface larga.
    expect(orientationOf(800, 800)).toBe('paisagem');
  });

  it('sugere deitar só no aparelho de mão, e só em pé', () => {
    const phone = detectPlatform(IPHONE);
    expect(shouldSuggestLandscape(phone, 'retrato')).toBe(true);
    expect(shouldSuggestLandscape(phone, 'paisagem')).toBe(false);
    // Num computador em janela alta, ninguém precisa girar o monitor.
    expect(shouldSuggestLandscape(detectPlatform(DESKTOP), 'retrato')).toBe(false);
  });
});

describe('qualidade sugerida por aparelho', () => {
  const base = { hardwareConcurrency: 8, deviceMemory: 8, gpuName: 'Apple GPU', isTouchDevice: false };

  it('um computador forte começa em Ultra', () => {
    expect(suggestQualityLevel({ ...base, hardwareConcurrency: 16, deviceMemory: 16, platform: detectPlatform(DESKTOP) })).toBe('ultra');
  });

  it('um celular nunca começa em Ultra', () => {
    const phone = detectPlatform(ANDROID_PHONE);
    for (const cores of [4, 6, 8, 12]) {
      const level = suggestQualityLevel({ ...base, isTouchDevice: true, hardwareConcurrency: cores, deviceMemory: 8, platform: phone });
      expect(level === 'baixa' || level === 'media').toBe(true);
    }
  });

  it('um tablet forte pode chegar a Alta', () => {
    expect(suggestQualityLevel({ ...base, isTouchDevice: true, hardwareConcurrency: 8, deviceMemory: 8, platform: detectPlatform(IPAD) })).toBe('alta');
  });

  it('renderização por software cai para Baixa em qualquer aparelho', () => {
    expect(suggestQualityLevel({ ...base, hardwareConcurrency: 32, deviceMemory: 64, gpuName: 'Google SwiftShader' })).toBe('baixa');
  });

  it('o aparelho de mão nasce mirando 30 FPS; o computador, 60', () => {
    expect(defaultGraphicsSettings('media', true).fpsTarget).toBe(30);
    expect(defaultGraphicsSettings('alta', false).fpsTarget).toBe(60);
  });
});
