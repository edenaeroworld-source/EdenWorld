import { type Rng, clamp, pick } from '../utils/math';

/**
 * Aparência do avatar (dados puros, salvos junto com o jogo).
 * Novas opções podem ser acrescentadas às listas sem quebrar saves:
 * valores desconhecidos são substituídos pelo padrão em `sanitizeAppearance`.
 */

export const HAIR_STYLES = ['curto', 'longo', 'rabo', 'coque', 'cacheado', 'espetado', 'careca'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HAIR_LABELS: Record<HairStyle, string> = {
  curto: 'Curto',
  longo: 'Longo',
  rabo: 'Rabo de cavalo',
  coque: 'Coque',
  cacheado: 'Cacheado',
  espetado: 'Espetado',
  careca: 'Sem cabelo',
};

export const OUTFITS = ['casual', 'aero', 'vestido', 'esportivo', 'praia'] as const;
export type Outfit = (typeof OUTFITS)[number];
export const OUTFIT_LABELS: Record<Outfit, string> = {
  casual: 'Casual',
  aero: 'Traje Aero',
  vestido: 'Vestido',
  esportivo: 'Esportivo',
  praia: 'Praia',
};

export const ACCESSORIES = ['nenhum', 'oculos', 'fones', 'chapeu', 'flor', 'aureola'] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export const ACCESSORY_LABELS: Record<Accessory, string> = {
  nenhum: 'Nenhum',
  oculos: 'Óculos',
  fones: 'Fones',
  chapeu: 'Chapéu',
  flor: 'Flor',
  aureola: 'Auréola',
};

export const SKIN_TONES = ['#ffe0c8', '#f6c9a4', '#e8ab82', '#cf8f63', '#a96c45', '#7d4a2c', '#5a3320', '#f3d2c1'] as const;
export const HAIR_COLORS = ['#2b1d16', '#5a3a22', '#8a5a2b', '#d9a441', '#f3e3a6', '#c0392b', '#ff8fc0', '#7fd6ff', '#9a7bff', '#f4f6fb'] as const;
export const EYE_COLORS = ['#3b2a20', '#2f6fb3', '#2f9a66', '#7a5cc9', '#1f1f24', '#c98a2b'] as const;
export const CLOTH_COLORS = [
  '#ffffff',
  '#29c8ff',
  '#1b82ea',
  '#24e08a',
  '#7ddc5a',
  '#ffd84a',
  '#ff9f43',
  '#ff6f91',
  '#c9a2ff',
  '#7a5cc9',
  '#2e3a4f',
  '#f3ead6',
] as const;

export interface AvatarAppearance {
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeColor: string;
  outfit: Outfit;
  topColor: string;
  bottomColor: string;
  shoeColor: string;
  accessory: Accessory;
  /** Escala de altura (0,9–1,1). */
  height: number;
}

export const DEFAULT_APPEARANCE: AvatarAppearance = {
  skin: SKIN_TONES[1],
  hairStyle: 'curto',
  hairColor: HAIR_COLORS[1],
  eyeColor: EYE_COLORS[1],
  outfit: 'aero',
  topColor: CLOTH_COLORS[0],
  bottomColor: CLOTH_COLORS[1],
  shoeColor: CLOTH_COLORS[0],
  accessory: 'nenhum',
  height: 1,
};

const HEX = /^#[0-9a-f]{6}$/i;

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback;
}

function option<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Valida dados vindos do armazenamento local (ou de qualquer fonte externa). */
export function sanitizeAppearance(raw: unknown): AvatarAppearance {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_APPEARANCE;
  const height = typeof src.height === 'number' && Number.isFinite(src.height) ? clamp(src.height, 0.9, 1.1) : d.height;
  return {
    skin: color(src.skin, d.skin),
    hairStyle: option(src.hairStyle, HAIR_STYLES, d.hairStyle),
    hairColor: color(src.hairColor, d.hairColor),
    eyeColor: color(src.eyeColor, d.eyeColor),
    outfit: option(src.outfit, OUTFITS, d.outfit),
    topColor: color(src.topColor, d.topColor),
    bottomColor: color(src.bottomColor, d.bottomColor),
    shoeColor: color(src.shoeColor, d.shoeColor),
    accessory: option(src.accessory, ACCESSORIES, d.accessory),
    height,
  };
}

export function randomAppearance(rng: Rng): AvatarAppearance {
  return {
    skin: pick(rng, SKIN_TONES),
    hairStyle: pick(rng, HAIR_STYLES),
    hairColor: pick(rng, HAIR_COLORS),
    eyeColor: pick(rng, EYE_COLORS),
    outfit: pick(rng, OUTFITS),
    topColor: pick(rng, CLOTH_COLORS),
    bottomColor: pick(rng, CLOTH_COLORS),
    shoeColor: pick(rng, CLOTH_COLORS),
    accessory: pick(rng, ACCESSORIES),
    height: Math.round((0.94 + rng() * 0.12) * 100) / 100,
  };
}

/** Limpa um nome de jogador: sem caracteres de controle, espaços normalizados, até 20 caracteres. */
export function sanitizePlayerName(raw: unknown, fallback = 'Viajante'): string {
  if (typeof raw !== 'string') return fallback;
  // Espaços primeiro: quebras de linha e tabulações viram um espaço em vez de sumirem.
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 20)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}
