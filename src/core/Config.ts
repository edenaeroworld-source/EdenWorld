/**
 * Configuração central do EDENWORLD.
 * Constantes de identidade, mundo, jogador e câmera ficam aqui para que
 * nenhum sistema dependa de "números mágicos" espalhados pelo código.
 */

export const GAME = {
  name: 'EDENWORLD',
  universe: 'Éden Aero',
  versionLabel: 'Genesis 0.1',
  version: '0.1.0',
  tagline: 'A WORLD BEYOND IMAGINATION',
  locale: 'pt-BR',
} as const;

export const WORLD = {
  /** Altura (Y) da superfície de lagos, rio e oceano. */
  waterLevel: 0,
  /** Altura do platô urbano de Aurora City. */
  plateauHeight: 2.0,
  /** Extensão total do terreno (metros), centrado na origem. */
  terrainSize: 640,
  /** Raio máximo que o jogador pode alcançar (limite do cenário). */
  boundaryRadius: 268,
  /** Duração de um dia completo do mundo, em segundos reais. */
  dayLengthSeconds: 24 * 60,
  /** Hora inicial de um novo jogo. */
  startHour: 9.5,
} as const;

export const PLAYER = {
  radius: 0.34,
  height: 1.72,
  /** Altura máxima de degrau que o personagem sobe sem pular. */
  stepHeight: 0.42,
  walkSpeed: 3.3,
  runSpeed: 7.4,
  swimSpeed: 2.3,
  swimSprintSpeed: 3.4,
  acceleration: 26,
  deceleration: 20,
  airControl: 9,
  turnRate: 11,
  gravity: 24,
  jumpSpeed: 8.3,
  /** Tolerância (s) para pular logo após sair de uma borda. */
  coyoteTime: 0.12,
  /** Tolerância (s) para registrar o pulo um pouco antes de tocar o chão. */
  jumpBuffer: 0.14,
  maxFallSpeed: 40,
  /** Profundidade de água a partir da qual o personagem nada. */
  swimDepth: 1.05,
  /** Quanto do corpo fica submerso ao nadar. */
  swimSubmersion: 1.18,
  interactionRange: 2.6,
} as const;

export const CAMERA = {
  fov: 58,
  near: 0.12,
  far: 1600,
  minDistance: 2.2,
  maxDistance: 14,
  defaultDistance: 6.2,
  minPitch: -0.32,
  maxPitch: 1.28,
  defaultPitch: 0.3,
  targetHeight: 1.45,
  collisionMargin: 0.28,
} as const;

/** Identificadores de armazenamento local. Nunca guardar segredos aqui. */
export const STORAGE = {
  saveKey: 'edenworld.save.v1',
} as const;

/** Parâmetros de depuração lidos da URL (ex.: ?debug&quality=baixa). */
export interface DebugFlags {
  enabled: boolean;
  quality: string | null;
  skipMenu: boolean;
  noAudio: boolean;
}

export function readDebugFlags(search: string = typeof location !== 'undefined' ? location.search : ''): DebugFlags {
  const params = new URLSearchParams(search);
  return {
    enabled: params.has('debug'),
    quality: params.get('quality'),
    skipMenu: params.has('skipmenu'),
    noAudio: params.has('noaudio'),
  };
}
