/**
 * Canal de transformação dos Afters® — um por produto de silhueta.
 *
 * Cada canal guarda três coisas: o valor **alvo** (o que o jogador pediu),
 * o valor **atual** (o que o avatar está mostrando agora) e a animação que
 * leva de um ao outro. Intensidade e duração são parâmetros separados: subir
 * para 250% com transição de 0,4 s ou de 6 s dá o mesmo destino, em tempos
 * diferentes.
 *
 * Módulo puro: sem Three.js e sem DOM, para poder ser testado quadro a quadro.
 */

import { clamp01 } from '../utils/math';
import { type AftersChannelId, DEFAULT_DURATION, clampDuration, clampIntensity, toPercent } from './AftersState';

/** Suavização em S: começa e termina devagar, sem solavanco no meio. */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export interface ChannelSnapshot {
  id: AftersChannelId;
  /** Intensidade mostrada agora (0–2.5). */
  current: number;
  /** Intensidade pedida (0–2.5). */
  target: number;
  /** `true` enquanto a transição está correndo. */
  animating: boolean;
  /** Progresso da transição (0–1). */
  progress: number;
  active: boolean;
}

/**
 * Um canal animado. `AfterBustController` e `AfterCurveController` são
 * apenas este controlador com identidades diferentes — a mecânica é a mesma
 * e fica em um lugar só.
 */
export class AftersChannel {
  readonly id: AftersChannelId;
  private currentValue = 0;
  private fromValue = 0;
  private targetValue = 0;
  private durationValue = DEFAULT_DURATION;
  private elapsed = 0;
  private running = false;
  private activeFlag = false;
  /** Intensidade escolhida no slider, preservada ao desligar o canal. */
  private storedValue = 0;

  constructor(id: AftersChannelId) {
    this.id = id;
  }

  get current(): number {
    return this.currentValue;
  }

  get target(): number {
    return this.targetValue;
  }

  get stored(): number {
    return this.storedValue;
  }

  get active(): boolean {
    return this.activeFlag;
  }

  get animating(): boolean {
    return this.running;
  }

  get duration(): number {
    return this.durationValue;
  }

  set duration(value: number) {
    this.durationValue = clampDuration(value);
  }

  get progress(): number {
    if (!this.running) return 1;
    return this.durationValue <= 0 ? 1 : clamp01(this.elapsed / this.durationValue);
  }

  /** Porcentagem mostrada agora (0–250), arredondada para exibição. */
  get percent(): number {
    return toPercent(this.currentValue);
  }

  /**
   * Define a intensidade desejada. O valor fica guardado mesmo com o canal
   * desligado, para que religar devolva exatamente o que o jogador escolheu.
   */
  setIntensity(value: number, animate = true): void {
    this.storedValue = clampIntensity(value);
    this.retarget(this.activeFlag ? this.storedValue : 0, animate);
  }

  /** Liga ou desliga o canal sem perder a intensidade escolhida. */
  setActive(active: boolean, animate = true): void {
    if (this.activeFlag === active) return;
    this.activeFlag = active;
    this.retarget(active ? this.storedValue : 0, animate);
  }

  /** Aplica intensidade e ativação de uma vez (usado ao carregar o jogo). */
  apply(value: number, active: boolean, animate = true): void {
    this.storedValue = clampIntensity(value);
    this.activeFlag = active;
    this.retarget(active ? this.storedValue : 0, animate);
  }

  private retarget(target: number, animate: boolean): void {
    const next = clampIntensity(target);
    if (!animate || this.durationValue <= 0) {
      this.fromValue = next;
      this.currentValue = next;
      this.targetValue = next;
      this.elapsed = 0;
      this.running = false;
      return;
    }
    if (Math.abs(next - this.currentValue) < 1e-4) {
      this.targetValue = next;
      this.currentValue = next;
      this.running = false;
      return;
    }
    this.fromValue = this.currentValue;
    this.targetValue = next;
    this.elapsed = 0;
    this.running = true;
  }

  /** Avança a transição. Seguro com `dt` zero, negativo ou gigante. */
  update(dt: number): void {
    if (!this.running) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.elapsed += dt;
    const t = this.durationValue <= 0 ? 1 : clamp01(this.elapsed / this.durationValue);
    this.currentValue = this.fromValue + (this.targetValue - this.fromValue) * easeInOutCubic(t);
    if (t >= 1) {
      this.currentValue = this.targetValue;
      this.running = false;
    }
  }

  /** Salta para o destino (teleporte, carregamento, trocar de avatar). */
  snap(): void {
    this.currentValue = this.targetValue;
    this.fromValue = this.targetValue;
    this.elapsed = 0;
    this.running = false;
  }

  snapshot(): ChannelSnapshot {
    return {
      id: this.id,
      current: this.currentValue,
      target: this.targetValue,
      animating: this.running,
      progress: this.progress,
      active: this.activeFlag,
    };
  }
}

/** AfterBust® — silhueta superior. */
export class AfterBustController extends AftersChannel {
  constructor() {
    super('bust');
  }
}

/** AfterCurve® — silhueta inferior. */
export class AfterCurveController extends AftersChannel {
  constructor() {
    super('curve');
  }
}
