/**
 * Detecção de plataforma.
 *
 * O EDENWORLD é **um** jogo só: a mesma Aurora City, os mesmos habitantes e
 * o mesmo progresso no computador e no celular. O que muda é a camada de
 * comando e o peso dos gráficos — e quem decide isso é este arquivo.
 *
 * Tudo aqui é função pura sobre uma `PlatformProbe`: nada lê `navigator`
 * por conta própria, para que a detecção possa ser testada com as cadeias
 * de identificação reais de cada aparelho.
 */

/** Sistema operacional reconhecido. */
export type PlatformOS = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'desconhecido';

/** Formato do aparelho. Define o desenho da interface, não o conteúdo. */
export type PlatformForm = 'computador' | 'celular' | 'tablet';

/** Esquema de comando. `auto` segue a detecção; os outros são escolha do jogador. */
export type ControlScheme = 'auto' | 'teclado' | 'toque' | 'controle';

export const CONTROL_SCHEMES: readonly ControlScheme[] = ['auto', 'teclado', 'toque', 'controle'];

export const CONTROL_SCHEME_LABELS: Record<ControlScheme, string> = {
  auto: 'Automático',
  teclado: 'Teclado e mouse',
  toque: 'Tela de toque',
  controle: 'Controle',
};

/** Leitura bruta do ambiente. Montada uma vez, em `probePlatform()`. */
export interface PlatformProbe {
  userAgent: string;
  /** `navigator.platform` (ainda é o jeito mais confiável de ver um Mac). */
  platform: string;
  maxTouchPoints: number;
  /** `matchMedia('(pointer: coarse)')` — o dedo é um ponteiro grosso. */
  coarsePointer: boolean;
  /** `matchMedia('(hover: hover)')` — existe cursor que passa por cima. */
  hover: boolean;
  /** Menor e maior lado da tela, em pixels CSS. */
  screenMin: number;
  screenMax: number;
}

export interface PlatformInfo {
  os: PlatformOS;
  form: PlatformForm;
  /** Há tela sensível ao toque. */
  touch: boolean;
  /** Celular ou tablet — o que normalmente se chama de "aparelho móvel". */
  mobile: boolean;
  /** Esquema de comando sugerido (nunca `'auto'`). */
  scheme: Exclude<ControlScheme, 'auto'>;
  /** Nome curto, para a tela de ajustes e o relatório de depuração. */
  label: string;
}

const EMPTY: PlatformProbe = {
  userAgent: '',
  platform: '',
  maxTouchPoints: 0,
  coarsePointer: false,
  hover: true,
  screenMin: 1080,
  screenMax: 1920,
};

/** Lê o ambiente atual. Em teste (sem `navigator`), devolve um computador. */
export function probePlatform(): PlatformProbe {
  if (typeof navigator === 'undefined') return { ...EMPTY };
  const media = (query: string, fallback: boolean): boolean => {
    try {
      return typeof matchMedia === 'function' ? matchMedia(query).matches : fallback;
    } catch {
      return fallback;
    }
  };
  const width = typeof screen !== 'undefined' ? screen.width : EMPTY.screenMax;
  const height = typeof screen !== 'undefined' ? screen.height : EMPTY.screenMin;
  return {
    userAgent: navigator.userAgent ?? '',
    platform: (navigator as Navigator & { platform?: string }).platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: media('(pointer: coarse)', false),
    hover: media('(hover: hover)', true),
    screenMin: Math.min(width, height),
    screenMax: Math.max(width, height),
  };
}

/** Menor lado (px CSS) a partir do qual um aparelho de toque é tratado como tablet. */
const TABLET_MIN_SIDE = 600;

/**
 * Identifica o aparelho.
 *
 * Dois detalhes que derrubam quase toda detecção ingênua:
 *
 * 1. **iPad desde o iPadOS 13 se apresenta como Macintosh.** A única pista
 *    confiável é `maxTouchPoints > 1` num "Mac": nenhum Mac de verdade
 *    (nem os com Touch Bar) reporta pontos de toque.
 * 2. **Tablet Android não diz "Tablet".** Diz `Android` *sem* a palavra
 *    `Mobile`. Quando nem isso aparece, o tamanho da tela decide.
 */
export function detectPlatform(probe: PlatformProbe = probePlatform()): PlatformInfo {
  const ua = probe.userAgent;
  const lower = ua.toLowerCase();
  const touchPoints = probe.maxTouchPoints > 0;
  const touch = touchPoints || probe.coarsePointer;

  let os: PlatformOS = 'desconhecido';
  if (/android/i.test(ua)) os = 'android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
  else if (/windows|win32|win64/i.test(ua) || /^win/i.test(probe.platform)) os = 'windows';
  else if (/mac/i.test(ua) || /^mac/i.test(probe.platform)) os = 'macos';
  else if (/linux|x11|cros/i.test(ua)) os = 'linux';

  // iPad moderno: diz Macintosh, mas tem toque. Nenhum Mac tem.
  if (os === 'macos' && probe.maxTouchPoints > 1) os = 'ios';

  let form: PlatformForm;
  if (os === 'ios') {
    if (/ipad/i.test(ua)) form = 'tablet';
    else if (/iphone|ipod/i.test(ua)) form = 'celular';
    // iPad disfarçado de Mac.
    else form = 'tablet';
  } else if (os === 'android') {
    // "Mobile" no identificador é o sinal oficial de celular.
    if (/mobile/i.test(ua)) form = 'celular';
    else if (lower.includes('tablet') || probe.screenMin >= TABLET_MIN_SIDE) form = 'tablet';
    else form = 'celular';
  } else if (touch && !probe.hover && probe.coarsePointer) {
    // Aparelho de toque que não se identifica: decide pelo tamanho.
    form = probe.screenMin >= TABLET_MIN_SIDE ? 'tablet' : 'celular';
  } else {
    form = 'computador';
  }

  const mobile = form !== 'computador';
  // Um notebook com tela sensível ao toque continua sendo um computador:
  // tem teclado e cursor, então o esquema padrão é teclado e mouse.
  const scheme: Exclude<ControlScheme, 'auto'> = mobile ? 'toque' : 'teclado';

  return { os, form, touch, mobile, scheme, label: platformLabel(os, form) };
}

const OS_LABELS: Record<PlatformOS, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  desconhecido: 'Sistema desconhecido',
};

const FORM_LABELS: Record<PlatformForm, string> = {
  computador: 'computador',
  celular: 'celular',
  tablet: 'tablet',
};

export function platformLabel(os: PlatformOS, form: PlatformForm): string {
  if (os === 'ios' && form === 'tablet') return 'iPad';
  if (os === 'ios' && form === 'celular') return 'iPhone';
  if (os === 'desconhecido') return FORM_LABELS[form].replace(/^./, (c) => c.toUpperCase());
  return `${OS_LABELS[os]} · ${FORM_LABELS[form]}`;
}

/** Esquema efetivo: a preferência do jogador, ou a detecção quando ela é `auto`. */
export function resolveScheme(preference: ControlScheme, platform: PlatformInfo): Exclude<ControlScheme, 'auto'> {
  return preference === 'auto' ? platform.scheme : preference;
}

export function isControlScheme(value: unknown): value is ControlScheme {
  return typeof value === 'string' && (CONTROL_SCHEMES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Orientação                                                          */
/* ------------------------------------------------------------------ */

export type Orientation = 'retrato' | 'paisagem';

export function orientationOf(width: number, height: number): Orientation {
  return height > width ? 'retrato' : 'paisagem';
}

/**
 * Em pé o jogo funciona inteiro — só rende menos mundo por tela. Deitado é
 * a orientação recomendada, e o aviso aparece uma vez por sessão.
 */
export function shouldSuggestLandscape(platform: PlatformInfo, orientation: Orientation): boolean {
  return platform.mobile && orientation === 'retrato';
}
