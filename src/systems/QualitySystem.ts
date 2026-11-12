import { clamp } from '../utils/math';

export type QualityLevel = 'baixa' | 'media' | 'alta';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['baixa', 'media', 'alta'];

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

/** Parâmetros concretos aplicados aos sistemas de renderização. */
export interface QualityProfile {
  level: QualityLevel;
  pixelRatioCap: number;
  resolutionScale: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowDistance: number;
  viewDistance: number;
  /** Fração (0–1) das instâncias de grama/flores/arbustos desenhadas. */
  vegetationDensity: number;
  /** Distância máxima (m) de desenho da grama e flores pequenas. */
  detailDistance: number;
  /** Fração (0–1) das partículas ambientes. */
  particleDensity: number;
  waterReflections: boolean;
  cloudCount: number;
  cloudDetail: number;
  /** Multiplicador das distâncias de LOD (maior = detalhes visíveis mais longe). */
  lodBias: number;
  /** Intervalo em horas do mundo entre atualizações dos reflexos do céu. */
  envUpdateHours: number;
}

const PRESETS: Record<QualityLevel, QualityProfile> = {
  baixa: {
    level: 'baixa',
    pixelRatioCap: 1,
    resolutionScale: 0.8,
    shadows: false,
    shadowMapSize: 0,
    shadowDistance: 40,
    viewDistance: 420,
    vegetationDensity: 0.3,
    detailDistance: 55,
    particleDensity: 0.35,
    waterReflections: false,
    cloudCount: 10,
    cloudDetail: 1,
    lodBias: 0.6,
    envUpdateHours: 2,
  },
  media: {
    level: 'media',
    pixelRatioCap: 1.5,
    resolutionScale: 1,
    shadows: true,
    shadowMapSize: 1024,
    shadowDistance: 48,
    viewDistance: 620,
    vegetationDensity: 0.65,
    detailDistance: 85,
    particleDensity: 0.7,
    waterReflections: false,
    cloudCount: 18,
    cloudDetail: 2,
    lodBias: 1,
    envUpdateHours: 0.5,
  },
  alta: {
    level: 'alta',
    pixelRatioCap: 2,
    resolutionScale: 1,
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 70,
    viewDistance: 820,
    vegetationDensity: 1,
    detailDistance: 120,
    particleDensity: 1,
    waterReflections: true,
    cloudCount: 26,
    cloudDetail: 2,
    lodBias: 1.5,
    envUpdateHours: 0.25,
  },
};

/** Preferências gráficas persistidas pelo jogador. */
export interface GraphicsSettings {
  quality: QualityLevel;
  /** Sombras ligadas quando o nível de qualidade as suporta. */
  shadows: boolean;
  /** Reflexos planares na água (apenas na qualidade Alta). */
  waterReflections: boolean;
  /** Escala de resolução escolhida pelo jogador (0,5–1). */
  resolutionScale: number;
  /** Reduz a resolução automaticamente quando o FPS cai. */
  dynamicResolution: boolean;
  showFps: boolean;
}

export function defaultGraphicsSettings(level: QualityLevel): GraphicsSettings {
  return {
    quality: level,
    shadows: true,
    waterReflections: true,
    resolutionScale: 1,
    dynamicResolution: level !== 'alta',
    showFps: false,
  };
}

export interface DeviceHints {
  isTouchDevice: boolean;
  hardwareConcurrency: number;
  deviceMemory: number | undefined;
  gpuName: string;
}

/** Sugere um nível inicial com base no dispositivo (sem medir FPS). */
export function suggestQualityLevel(hints: DeviceHints): QualityLevel {
  const gpu = hints.gpuName.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'baixa';
  if (hints.isTouchDevice) {
    const strong = hints.hardwareConcurrency >= 8 && (hints.deviceMemory ?? 4) >= 6;
    return strong ? 'media' : 'baixa';
  }
  if (hints.hardwareConcurrency >= 8) return 'alta';
  if (hints.hardwareConcurrency >= 4) return 'media';
  return 'baixa';
}

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

type QualityListener = (profile: QualityProfile) => void;

const DYNAMIC_MIN_SCALE = 0.55;

/**
 * Sistema de qualidade gráfica: converte as preferências do jogador em
 * um `QualityProfile` e, opcionalmente, ajusta a resolução interna em
 * tempo real para sustentar a taxa de quadros.
 */
export class QualitySystem {
  private settings: GraphicsSettings;
  private profile: QualityProfile;
  private readonly listeners = new Set<QualityListener>();
  /** Fator aplicado pela resolução dinâmica (1 = sem redução). */
  private dynamicScale = 1;
  private lowFpsTime = 0;
  private highFpsTime = 0;

  constructor(settings: GraphicsSettings) {
    this.settings = { ...settings };
    this.profile = this.compute();
  }

  get current(): QualityProfile {
    return this.profile;
  }

  get graphics(): Readonly<GraphicsSettings> {
    return this.settings;
  }

  get dynamicResolutionScale(): number {
    return this.dynamicScale;
  }

  static preset(level: QualityLevel): Readonly<QualityProfile> {
    return PRESETS[level];
  }

  onChange(listener: QualityListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<GraphicsSettings>): void {
    const next = { ...this.settings, ...patch };
    next.resolutionScale = clamp(next.resolutionScale, 0.5, 1);
    if (patch.quality !== undefined && patch.quality !== this.settings.quality) {
      this.dynamicScale = 1;
    }
    if (!next.dynamicResolution) this.dynamicScale = 1;
    this.settings = next;
    this.apply();
  }

  private compute(): QualityProfile {
    const base = PRESETS[this.settings.quality];
    return {
      ...base,
      shadows: base.shadows && this.settings.shadows,
      waterReflections: base.waterReflections && this.settings.waterReflections,
      resolutionScale: clamp(base.resolutionScale * this.settings.resolutionScale * this.dynamicScale, 0.35, 1),
    };
  }

  private apply(): void {
    this.profile = this.compute();
    for (const listener of this.listeners) listener(this.profile);
  }

  /**
   * Resolução dinâmica: se o FPS ficar abaixo de ~27 por alguns segundos,
   * reduz a escala interna; se sobrar desempenho, restaura aos poucos.
   */
  monitor(dt: number, fps: number): void {
    if (!this.settings.dynamicResolution || fps <= 0) return;
    if (fps < 27) {
      this.lowFpsTime += dt;
      this.highFpsTime = 0;
      if (this.lowFpsTime > 2.5 && this.dynamicScale > DYNAMIC_MIN_SCALE) {
        this.dynamicScale = Math.max(DYNAMIC_MIN_SCALE, this.dynamicScale - 0.1);
        this.lowFpsTime = 0;
        this.apply();
      }
    } else if (fps > 50) {
      this.highFpsTime += dt;
      this.lowFpsTime = 0;
      if (this.highFpsTime > 6 && this.dynamicScale < 1) {
        this.dynamicScale = Math.min(1, this.dynamicScale + 0.05);
        this.highFpsTime = 0;
        this.apply();
      }
    } else {
      this.lowFpsTime = 0;
      this.highFpsTime = 0;
    }
  }
}
