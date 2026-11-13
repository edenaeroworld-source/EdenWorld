import type { PlatformInfo } from '../core/Platform';
import { clamp } from '../utils/math';

export type QualityLevel = 'baixa' | 'media' | 'alta' | 'ultra';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['baixa', 'media', 'alta', 'ultra'];

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  ultra: 'Ultra',
};

/** Taxa de quadros que o jogo tenta sustentar. */
export type FpsTarget = 30 | 60;

export const FPS_TARGETS: readonly FpsTarget[] = [30, 60];

export function isFpsTarget(value: unknown): value is FpsTarget {
  return value === 30 || value === 60;
}

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
  /** Quantos habitantes ganham avatar desenhado ao mesmo tempo. */
  npcVisible: number;
  /** Raio (m) dentro do qual um habitante pode ganhar avatar. */
  npcRange: number;
  /**
   * Quantas vezes por segundo a simulação dos 54 habitantes é avançada.
   * Abaixo da taxa de quadros, o passo é acumulado e aplicado de uma vez —
   * ninguém muda de rota nem perde o destino, só anda em passos maiores.
   * `0` significa "todo quadro".
   */
  npcSimHz: number;
  /** Quantas rotinas de habitante são replanejadas por quadro. */
  npcRoutinePerFrame: number;
  /** Efeitos de ambiente (brilho do sol na água, poeira luminosa, auras densas). */
  environmentEffects: boolean;
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
    npcVisible: 7,
    npcRange: 48,
    npcSimHz: 12,
    npcRoutinePerFrame: 1,
    environmentEffects: false,
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
    npcVisible: 12,
    npcRange: 70,
    npcSimHz: 20,
    npcRoutinePerFrame: 2,
    environmentEffects: true,
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
    npcVisible: 18,
    npcRange: 95,
    npcSimHz: 30,
    npcRoutinePerFrame: 2,
    environmentEffects: true,
  },
  ultra: {
    level: 'ultra',
    pixelRatioCap: 2,
    resolutionScale: 1,
    shadows: true,
    shadowMapSize: 4096,
    shadowDistance: 95,
    viewDistance: 1100,
    vegetationDensity: 1,
    detailDistance: 170,
    particleDensity: 1,
    waterReflections: true,
    cloudCount: 34,
    cloudDetail: 3,
    lodBias: 2.2,
    envUpdateHours: 0.12,
    npcVisible: 18,
    npcRange: 130,
    npcSimHz: 0,
    npcRoutinePerFrame: 3,
    environmentEffects: true,
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
  /** Taxa de quadros perseguida pela resolução dinâmica. */
  fpsTarget: FpsTarget;
  showFps: boolean;
}

export function defaultGraphicsSettings(level: QualityLevel, mobile = false): GraphicsSettings {
  return {
    quality: level,
    shadows: true,
    waterReflections: true,
    resolutionScale: 1,
    dynamicResolution: level !== 'ultra',
    // Em aparelho de mão, 30 estáveis valem mais do que 60 instáveis.
    fpsTarget: mobile ? 30 : 60,
    showFps: false,
  };
}

export interface DeviceHints {
  isTouchDevice: boolean;
  hardwareConcurrency: number;
  deviceMemory: number | undefined;
  gpuName: string;
  /** Detecção de plataforma, quando disponível (refina a sugestão). */
  platform?: PlatformInfo;
}

/**
 * Sugere um nível inicial com base no aparelho, **sem medir FPS**.
 *
 * É um palpite conservador: o jogo começa onde provavelmente roda, e a
 * resolução dinâmica corrige o resto em tempo real. O jogador pode subir
 * ou descer o nível a qualquer momento.
 */
export function suggestQualityLevel(hints: DeviceHints): QualityLevel {
  const gpu = hints.gpuName.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'baixa';
  const cores = hints.hardwareConcurrency;
  const memory = hints.deviceMemory ?? 4;
  const mobile = hints.platform?.mobile ?? hints.isTouchDevice;

  if (mobile) {
    // Tablets costumam ter mais folga térmica que celulares do mesmo chip.
    const tablet = hints.platform?.form === 'tablet';
    if (cores >= 8 && memory >= 6) return tablet ? 'alta' : 'media';
    if (cores >= 6 && memory >= 4) return 'media';
    return 'baixa';
  }
  if (cores >= 12 && memory >= 8) return 'ultra';
  if (cores >= 8) return 'alta';
  if (cores >= 4) return 'media';
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

  get fpsTarget(): FpsTarget {
    return this.settings.fpsTarget;
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
   * Resolução dinâmica, medida contra a **meta escolhida**.
   *
   * Abaixo de 90% da meta por alguns segundos, a resolução interna cai um
   * degrau; a partir de 98% da meta, volta a subir devagar. A faixa entre
   * as duas é zona morta — sem ela, a resolução oscilaria sozinha.
   *
   * O teto é 98% da meta, e não um número acima dela, por causa do
   * **vsync**: numa tela de 60 Hz com meta de 60, o jogo nunca passa de
   * 60 — exigir folga acima disso deixaria a resolução presa embaixo
   * para sempre.
   */
  monitor(dt: number, fps: number): void {
    if (!this.settings.dynamicResolution || fps <= 0) return;
    const target = this.settings.fpsTarget;
    const floor = target * 0.9;
    const ceiling = target * 0.98;
    if (fps < floor) {
      this.lowFpsTime += dt;
      this.highFpsTime = 0;
      if (this.lowFpsTime > 2.5 && this.dynamicScale > DYNAMIC_MIN_SCALE) {
        this.dynamicScale = Math.max(DYNAMIC_MIN_SCALE, this.dynamicScale - 0.1);
        this.lowFpsTime = 0;
        this.apply();
      }
    } else if (fps >= ceiling) {
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
