import { type AftersConfig, defaultAftersConfig, sanitizeAftersConfig } from '../afters/AftersCatalog';
import { STORAGE, WORLD } from '../core/Config';
import { type SocialData, emptySocialData, sanitizeSocialData } from '../edenos/EdenSocial';
import { type InputSettingsData, defaultInputSettings, sanitizeInputSettings } from '../input/InputSettings';
import { type AvatarAppearance, DEFAULT_APPEARANCE, sanitizeAppearance, sanitizePlayerName } from '../player/AvatarAppearance';
import { clamp } from '../utils/math';
import { type GraphicsSettings, isQualityLevel } from './QualitySystem';

export const SAVE_VERSION = 2;

/** Versões anteriores que ainda são carregadas e convertidas. */
export const MIN_SAVE_VERSION = 1;

export interface AudioSettings {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  muted: boolean;
}

export type TimePaceSetting = 'normal' | 'rapido' | 'parado';

export interface GameplaySettings {
  /** A câmera se realinha atrás do personagem ao andar. */
  autoCamera: boolean;
  /** Captura o cursor do mouse ao clicar no jogo. */
  pointerLock: boolean;
  /** Mostra as dicas de controles no HUD. */
  hints: boolean;
  timePace: TimePaceSetting;
}

export interface ProgressData {
  /** Cristais de Luz coletados. */
  crystals: string[];
  /** Registros do diário (placas lidas). */
  entries: string[];
  /** Áreas já visitadas. */
  areas: string[];
  /** Portais ativados (viagem rápida). */
  portals: string[];
  wishes: number;
  photos: number;
  /** Distância percorrida (m). */
  distance: number;
  playSeconds: number;
  sphereMode: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  profile: {
    name: string;
    appearance: AvatarAppearance;
    /** `true` depois que o jogador concluiu o criador de avatar. */
    created: boolean;
  };
  player: { x: number; y: number; z: number; heading: number } | null;
  world: { hours: number; day: number };
  progress: ProgressData;
  /** Bandeiras de história marcadas nas conversas. */
  flags: string[];
  /** EdenOS: contatos, conversas e fotos (tudo local). */
  social: SocialData;
  /** Preferências dos Afters (BET). */
  afters: AftersConfig;
  settings: {
    /** `null` = ainda não escolhido (detectar pelo dispositivo). */
    graphics: GraphicsSettings | null;
    audio: AudioSettings;
    input: InputSettingsData;
    gameplay: GameplaySettings;
  };
}

export function defaultAudioSettings(): AudioSettings {
  return { master: 0.8, music: 0.55, ambience: 0.7, effects: 0.8, muted: false };
}

export function defaultGameplaySettings(): GameplaySettings {
  return { autoCamera: true, pointerLock: true, hints: true, timePace: 'normal' };
}

export function emptyProgress(): ProgressData {
  return { crystals: [], entries: [], areas: [], portals: [], wishes: 0, photos: 0, distance: 0, playSeconds: 0, sphereMode: 0 };
}

export function createNewSave(now: number = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    profile: { name: 'Viajante', appearance: { ...DEFAULT_APPEARANCE }, created: false },
    player: null,
    world: { hours: WORLD.startHour, day: 1 },
    progress: emptyProgress(),
    flags: [],
    social: emptySocialData(),
    afters: defaultAftersConfig(),
    settings: {
      graphics: null,
      audio: defaultAudioSettings(),
      input: defaultInputSettings(),
      gameplay: defaultGameplaySettings(),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function idList(value: unknown, limit = 512): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && item.length <= 64 && /^[\w\-.:]+$/.test(item)) seen.add(item);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function sanitizeGraphicsSettings(raw: unknown): GraphicsSettings | null {
  if (!isRecord(raw) || !isQualityLevel(raw.quality)) return null;
  return {
    quality: raw.quality,
    shadows: bool(raw.shadows, true),
    waterReflections: bool(raw.waterReflections, true),
    resolutionScale: num(raw.resolutionScale, 1, 0.5, 1),
    dynamicResolution: bool(raw.dynamicResolution, raw.quality !== 'alta'),
    showFps: bool(raw.showFps, false),
  };
}

export function sanitizeAudioSettings(raw: unknown): AudioSettings {
  const d = defaultAudioSettings();
  if (!isRecord(raw)) return d;
  return {
    master: num(raw.master, d.master, 0, 1),
    music: num(raw.music, d.music, 0, 1),
    ambience: num(raw.ambience, d.ambience, 0, 1),
    effects: num(raw.effects, d.effects, 0, 1),
    muted: bool(raw.muted, d.muted),
  };
}

export function sanitizeGameplaySettings(raw: unknown): GameplaySettings {
  const d = defaultGameplaySettings();
  if (!isRecord(raw)) return d;
  const pace = raw.timePace;
  return {
    autoCamera: bool(raw.autoCamera, d.autoCamera),
    pointerLock: bool(raw.pointerLock, d.pointerLock),
    hints: bool(raw.hints, d.hints),
    timePace: pace === 'normal' || pace === 'rapido' || pace === 'parado' ? pace : d.timePace,
  };
}

/**
 * Valida e completa um salvamento vindo de fonte não confiável
 * (armazenamento local ou arquivo importado). Retorna `null` quando o
 * conteúdo não é um salvamento do EDENWORLD.
 */
export function sanitizeSave(raw: unknown, now: number = Date.now()): SaveData | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.version !== 'number' || raw.version < MIN_SAVE_VERSION || raw.version > SAVE_VERSION) return null;
  const base = createNewSave(now);

  const profile = isRecord(raw.profile) ? raw.profile : {};
  const world = isRecord(raw.world) ? raw.world : {};
  const progress = isRecord(raw.progress) ? raw.progress : {};
  const settings = isRecord(raw.settings) ? raw.settings : {};

  // Uma posição fora do limite jogável só pode vir de dados danificados ou
  // adulterados: nesse caso o jogador recomeça no ponto inicial da cidade.
  let player: SaveData['player'] = null;
  if (isRecord(raw.player)) {
    const { x, z } = raw.player;
    if (typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z) && Math.hypot(x, z) <= WORLD.boundaryRadius) {
      player = {
        x,
        y: num(raw.player.y, 0, -50, 500),
        z,
        heading: num(raw.player.heading, 0, -Math.PI * 2, Math.PI * 2),
      };
    }
  }

  return {
    version: SAVE_VERSION,
    createdAt: num(raw.createdAt, base.createdAt, 0, Number.MAX_SAFE_INTEGER),
    updatedAt: num(raw.updatedAt, base.updatedAt, 0, Number.MAX_SAFE_INTEGER),
    profile: {
      name: sanitizePlayerName(profile.name),
      appearance: sanitizeAppearance(profile.appearance),
      created: bool(profile.created, false),
    },
    player,
    world: {
      hours: num(world.hours, base.world.hours, 0, 23.999),
      day: Math.floor(num(world.day, 1, 1, 1e6)),
    },
    progress: {
      crystals: idList(progress.crystals),
      entries: idList(progress.entries),
      areas: idList(progress.areas),
      portals: idList(progress.portals),
      wishes: Math.floor(num(progress.wishes, 0, 0, 1e6)),
      photos: Math.floor(num(progress.photos, 0, 0, 1e6)),
      distance: num(progress.distance, 0, 0, 1e9),
      playSeconds: num(progress.playSeconds, 0, 0, 1e9),
      sphereMode: Math.floor(num(progress.sphereMode, 0, 0, 16)),
    },
    // Campos novos da versão 2: salvamentos antigos entram com o padrão.
    flags: idList(raw.flags, 256),
    social: sanitizeSocialData(raw.social),
    afters: sanitizeAftersConfig(raw.afters),
    settings: {
      graphics: sanitizeGraphicsSettings(settings.graphics),
      audio: sanitizeAudioSettings(settings.audio),
      input: sanitizeInputSettings(settings.input),
      gameplay: sanitizeGameplaySettings(settings.gameplay),
    },
  };
}

/** Subconjunto de `Storage` usado pelo jogo (facilita testes). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadStatus = 'novo' | 'carregado' | 'corrompido' | 'indisponivel';

export interface LoadResult {
  data: SaveData;
  status: LoadStatus;
}

/** Tenta obter o `localStorage`; devolve `null` se estiver bloqueado. */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage;
    const probe = '__edenworld_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * Salvamento local do jogo. Nunca guarda dados sensíveis: apenas
 * progresso, aparência e preferências. Se o navegador bloquear o
 * armazenamento, o jogo continua funcionando só em memória.
 */
export class SaveSystem {
  /** `false` quando a última gravação falhou (armazenamento cheio ou bloqueado). */
  lastWriteOk = true;

  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly key: string = STORAGE.saveKey,
  ) {}

  get persistent(): boolean {
    return this.storage !== null;
  }

  load(now: number = Date.now()): LoadResult {
    if (!this.storage) return { data: createNewSave(now), status: 'indisponivel' };
    let text: string | null = null;
    try {
      text = this.storage.getItem(this.key);
    } catch {
      return { data: createNewSave(now), status: 'indisponivel' };
    }
    if (text === null) return { data: createNewSave(now), status: 'novo' };
    const data = SaveSystem.parse(text, now);
    if (!data) {
      this.backupCorrupted(text);
      return { data: createNewSave(now), status: 'corrompido' };
    }
    return { data, status: 'carregado' };
  }

  /** Chave onde fica a cópia de um salvamento que não pôde ser lido. */
  get backupKey(): string {
    return `${this.key}.corrompido`;
  }

  /**
   * Guarda o texto ilegível antes que o próximo salvamento o substitua,
   * para que o progresso ainda possa ser recuperado manualmente.
   */
  private backupCorrupted(text: string): void {
    if (text.length > 1_000_000) return;
    try {
      this.storage?.setItem(this.backupKey, text);
    } catch {
      /* sem espaço: segue sem a cópia */
    }
  }

  save(data: SaveData, now: number = Date.now()): boolean {
    data.updatedAt = now;
    if (!this.storage) {
      this.lastWriteOk = false;
      return false;
    }
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
      this.lastWriteOk = true;
    } catch {
      this.lastWriteOk = false;
    }
    return this.lastWriteOk;
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      /* nada a fazer */
    }
  }

  /** Interpreta um texto JSON como salvamento (ou `null` se inválido). */
  static parse(text: string, now: number = Date.now()): SaveData | null {
    if (typeof text !== 'string' || text.length === 0 || text.length > 2_000_000) return null;
    try {
      return sanitizeSave(JSON.parse(text) as unknown, now);
    } catch {
      return null;
    }
  }

  static serialize(data: SaveData): string {
    return JSON.stringify(data, null, 2);
  }
}
