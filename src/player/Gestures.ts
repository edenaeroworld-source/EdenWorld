/**
 * Gestos do EDENWORLD — a camada de expressão corporal.
 *
 * O jogo não usa arquivos de animação: a pose é calculada por funções
 * (`AvatarAnimator`). Os gestos seguem a mesma ideia e entram como uma
 * **camada por cima** da pose atual, com peso que sobe e desce suave.
 *
 * Regra que mantém tudo compatível: um gesto só escreve nos canais da
 * metade de cima (tronco, cabeça, braços). As pernas continuam com a
 * animação de andar, correr ou parar — ninguém trava no meio do passo
 * para acenar.
 *
 * Módulo puro: sem Three.js e sem DOM, para poder ser testado quadro a
 * quadro.
 */

import { clamp01, lerp } from '../utils/math';
import { Ch, type Pose } from './AvatarAnimator';

export type GestureId =
  | 'acenar'
  | 'cumprimentar'
  | 'falar'
  | 'concordar'
  | 'negar'
  | 'pensar'
  | 'apontar'
  | 'rir'
  | 'surpresa'
  | 'despedir'
  | 'aplaudir'
  | 'espreguicar';

export interface GestureDefinition {
  id: GestureId;
  /** Nome curto para depuração e para o diário de testes. */
  label: string;
  /** Duração padrão, em segundos. */
  duration: number;
  /** Tempo de entrada e de saída da mistura (s). */
  fade: number;
  /**
   * Escreve o gesto na pose.
   *
   * @param pose pose já calculada (parado, andar, nadar…), a ser misturada.
   * @param t tempo decorrido do gesto, em segundos.
   * @param w peso da mistura (0–1), já suavizado pela entrada e saída.
   */
  apply(pose: Pose, t: number, w: number): void;
}

/** Mistura um canal só, respeitando o peso. */
function mix(pose: Pose, channel: Ch, value: number, w: number): void {
  pose[channel] = lerp(pose[channel], value, w);
}

/** Soma no canal (para acentos que não apagam a animação de base). */
function add(pose: Pose, channel: Ch, value: number, w: number): void {
  pose[channel] += value * w;
}

const GESTURE_LIST: readonly GestureDefinition[] = [
  {
    id: 'acenar',
    label: 'Aceno',
    duration: 2.6,
    fade: 0.25,
    apply(pose, t, w) {
      const swing = Math.sin(t * 9.5);
      mix(pose, Ch.ArmRZ, -2.35 + swing * 0.3, w);
      mix(pose, Ch.ArmRX, -0.15, w);
      mix(pose, Ch.ForeR, -0.45 + Math.sin(t * 9.5 + 0.8) * 0.25, w);
      mix(pose, Ch.HeadY, -0.1, w * 0.6);
      mix(pose, Ch.TorsoZ, 0.05, w);
    },
  },
  {
    id: 'cumprimentar',
    label: 'Cumprimento',
    duration: 1.8,
    fade: 0.3,
    apply(pose, t, w) {
      // Mão ao peito e uma leve inclinação: um "olá" mais contido.
      const bow = Math.sin(clamp01(t / 1.4) * Math.PI);
      mix(pose, Ch.ArmRZ, -0.95, w);
      mix(pose, Ch.ArmRX, -0.55, w);
      mix(pose, Ch.ForeR, -1.5, w);
      add(pose, Ch.TorsoX, 0.16 * bow, w);
      add(pose, Ch.HeadX, 0.12 * bow, w);
    },
  },
  {
    id: 'falar',
    label: 'Fala',
    duration: 1.1,
    fade: 0.35,
    apply(pose, t, w) {
      // Mãos acompanhando a frase, com dois ritmos para não ficar mecânico.
      const a = Math.sin(t * 4.3);
      const b = Math.sin(t * 2.7 + 1.1);
      mix(pose, Ch.ArmLZ, 0.42 + a * 0.12, w * 0.85);
      mix(pose, Ch.ArmRZ, -0.38 - b * 0.1, w * 0.7);
      mix(pose, Ch.ArmLX, -0.5 + b * 0.14, w * 0.85);
      mix(pose, Ch.ArmRX, -0.42 + a * 0.12, w * 0.7);
      mix(pose, Ch.ForeL, -1.12 - a * 0.2, w * 0.85);
      mix(pose, Ch.ForeR, -1.02 - b * 0.18, w * 0.7);
      add(pose, Ch.HeadX, a * 0.045, w);
      add(pose, Ch.HeadY, b * 0.06, w);
      add(pose, Ch.TorsoY, b * 0.03, w);
    },
  },
  {
    id: 'concordar',
    label: 'Aceno de cabeça',
    duration: 1.2,
    fade: 0.18,
    apply(pose, t, w) {
      const nod = Math.sin(t * 7.4) * Math.exp(-t * 1.1);
      add(pose, Ch.HeadX, nod * 0.3, w);
      add(pose, Ch.TorsoX, nod * 0.05, w);
    },
  },
  {
    id: 'negar',
    label: 'Negativa',
    duration: 1.3,
    fade: 0.18,
    apply(pose, t, w) {
      const shake = Math.sin(t * 6.6) * Math.exp(-t * 1.0);
      add(pose, Ch.HeadY, shake * 0.42, w);
      add(pose, Ch.TorsoY, shake * 0.06, w);
    },
  },
  {
    id: 'pensar',
    label: 'Reflexão',
    duration: 2.4,
    fade: 0.35,
    apply(pose, t, w) {
      // Mão ao queixo, olhar subindo para o lado.
      mix(pose, Ch.ArmRZ, -0.72, w);
      mix(pose, Ch.ArmRX, -0.62, w);
      mix(pose, Ch.ForeR, -2.0, w);
      add(pose, Ch.HeadY, 0.26 + Math.sin(t * 1.3) * 0.05, w);
      add(pose, Ch.HeadX, -0.14, w);
      add(pose, Ch.TorsoZ, -0.03, w);
    },
  },
  {
    id: 'apontar',
    label: 'Indicação',
    duration: 1.9,
    fade: 0.22,
    apply(pose, t, w) {
      const reach = clamp01(t / 0.35);
      mix(pose, Ch.ArmRX, -1.35 * reach, w);
      mix(pose, Ch.ArmRZ, -0.3 * reach, w);
      mix(pose, Ch.ForeR, -0.1, w);
      add(pose, Ch.TorsoY, -0.09 * reach, w);
      add(pose, Ch.HeadY, -0.12 * reach, w);
    },
  },
  {
    id: 'rir',
    label: 'Risada',
    duration: 1.8,
    fade: 0.2,
    apply(pose, t, w) {
      const bounce = Math.sin(t * 11) * Math.exp(-t * 0.8);
      add(pose, Ch.HipsY, bounce * 0.018, w);
      add(pose, Ch.TorsoX, 0.14 + bounce * 0.05, w);
      add(pose, Ch.HeadX, -0.2 + bounce * 0.06, w);
      mix(pose, Ch.ArmLZ, 0.3, w * 0.6);
      mix(pose, Ch.ArmRZ, -0.3, w * 0.6);
      mix(pose, Ch.ForeL, -1.3, w * 0.6);
      mix(pose, Ch.ForeR, -1.3, w * 0.6);
    },
  },
  {
    id: 'surpresa',
    label: 'Surpresa',
    duration: 1.5,
    fade: 0.12,
    apply(pose, t, w) {
      const pop = Math.exp(-t * 2.2);
      mix(pose, Ch.ArmLZ, 0.62 + pop * 0.35, w);
      mix(pose, Ch.ArmRZ, -0.62 - pop * 0.35, w);
      mix(pose, Ch.ArmLX, -0.5, w);
      mix(pose, Ch.ArmRX, -0.5, w);
      mix(pose, Ch.ForeL, -1.25, w);
      mix(pose, Ch.ForeR, -1.25, w);
      add(pose, Ch.TorsoX, -0.1 * pop, w);
      add(pose, Ch.HeadX, -0.16 * pop, w);
      add(pose, Ch.HipsY, 0.02 * pop, w);
    },
  },
  {
    id: 'despedir',
    label: 'Despedida',
    duration: 2.2,
    fade: 0.3,
    apply(pose, t, w) {
      const swing = Math.sin(t * 6.2);
      mix(pose, Ch.ArmRZ, -1.95 + swing * 0.22, w);
      mix(pose, Ch.ArmRX, -0.25, w);
      mix(pose, Ch.ForeR, -0.6 + swing * 0.18, w);
      add(pose, Ch.HeadX, 0.06, w);
      add(pose, Ch.TorsoZ, 0.03, w);
    },
  },
  {
    id: 'aplaudir',
    label: 'Palmas',
    duration: 1.8,
    fade: 0.18,
    apply(pose, t, w) {
      const clap = Math.abs(Math.sin(t * 8.5));
      mix(pose, Ch.ArmLZ, 0.5 + clap * 0.2, w);
      mix(pose, Ch.ArmRZ, -0.5 - clap * 0.2, w);
      mix(pose, Ch.ArmLX, -0.75, w);
      mix(pose, Ch.ArmRX, -0.75, w);
      mix(pose, Ch.ForeL, -1.45, w);
      mix(pose, Ch.ForeR, -1.45, w);
      add(pose, Ch.HeadX, -0.05, w);
    },
  },
  {
    id: 'espreguicar',
    label: 'Espreguiçada',
    duration: 2.6,
    fade: 0.4,
    apply(pose, t, w) {
      const rise = Math.sin(clamp01(t / 1.6) * Math.PI);
      mix(pose, Ch.ArmLZ, 0.35 + rise * 1.6, w);
      mix(pose, Ch.ArmRZ, -0.35 - rise * 1.6, w);
      mix(pose, Ch.ArmLX, -0.3 * rise, w);
      mix(pose, Ch.ArmRX, -0.3 * rise, w);
      mix(pose, Ch.ForeL, -0.3, w);
      mix(pose, Ch.ForeR, -0.3, w);
      add(pose, Ch.TorsoX, -0.12 * rise, w);
      add(pose, Ch.HeadX, -0.18 * rise, w);
      add(pose, Ch.HipsY, 0.015 * rise, w);
    },
  },
];

export const GESTURES: Readonly<Record<GestureId, GestureDefinition>> = Object.freeze(
  Object.fromEntries(GESTURE_LIST.map((gesture) => [gesture.id, gesture])) as Record<GestureId, GestureDefinition>,
);

export const GESTURE_IDS: readonly GestureId[] = GESTURE_LIST.map((gesture) => gesture.id);

export function getGesture(id: string): GestureDefinition | undefined {
  return (GESTURES as Record<string, GestureDefinition | undefined>)[id];
}

/**
 * Uma execução de gesto: tempo, peso de entrada e de saída.
 *
 * O peso sobe durante `fade`, fica cheio e desce no fim. É isso que evita
 * o "corte" entre animações: nada é trocado, tudo é misturado.
 */
export class GesturePlayback {
  readonly definition: GestureDefinition;
  /** Intensidade máxima (um personagem contido gesticula menos). */
  readonly strength: number;
  private elapsed = 0;
  private readonly duration: number;
  private stopping = false;

  constructor(definition: GestureDefinition, options: { duration?: number; strength?: number } = {}) {
    this.definition = definition;
    this.duration = Math.max(0.1, options.duration ?? definition.duration);
    this.strength = clamp01(options.strength ?? 1);
  }

  get id(): GestureId {
    return this.definition.id;
  }

  get finished(): boolean {
    return this.weight <= 0.0001 && (this.stopping || this.elapsed >= this.duration);
  }

  /** Pede o encerramento suave (o gesto some em `fade` segundos). */
  stop(): void {
    this.stopping = true;
    // Salta para a parte final da curva, preservando o peso atual.
    const remaining = this.definition.fade * this.weight;
    this.elapsed = Math.max(this.elapsed, this.duration - remaining);
  }

  /** Peso atual da mistura (0–1). */
  get weight(): number {
    const fade = this.definition.fade;
    const inWeight = fade > 0 ? clamp01(this.elapsed / fade) : 1;
    const left = this.duration - this.elapsed;
    const outWeight = fade > 0 ? clamp01(left / fade) : left > 0 ? 1 : 0;
    return Math.min(inWeight, outWeight) * this.strength;
  }

  update(dt: number): void {
    this.elapsed += Math.max(0, dt);
  }

  apply(pose: Pose): void {
    const w = this.weight;
    if (w <= 0.0001) return;
    this.definition.apply(pose, this.elapsed, w);
  }
}
