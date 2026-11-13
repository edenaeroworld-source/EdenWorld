import { PLAYER } from '../core/Config';
import { clamp, clamp01, damp, lerp } from '../utils/math';
import { GESTURES, GesturePlayback, type GestureId } from './Gestures';
import type { MotionState } from './PlayerMotor';

/** Canais da pose (ângulos em radianos, deslocamentos em metros). */
export enum Ch {
  HipsY,
  BodyPitch,
  TorsoX,
  TorsoY,
  TorsoZ,
  HeadX,
  HeadY,
  ArmLX,
  ArmLZ,
  ArmRX,
  ArmRZ,
  ForeL,
  ForeR,
  LegLX,
  LegRX,
  LegLZ,
  LegRZ,
  ShinL,
  ShinR,
  Count,
}

export type Pose = Float32Array;

export interface AnimatorInput {
  state: MotionState;
  /** Velocidade horizontal (m/s). */
  speed: number;
  /** Fase da passada acumulada pelo motor (rad). */
  stridePhase: number;
  /** Velocidade vertical (m/s). */
  verticalSpeed: number;
  /**
   * Inclinação do chão sob os pés (m subidos por m andado).
   *
   * É o que decide se o personagem anda ou sobe degrau. Uma rampa de
   * jardim fica perto de 0,15 e continua sendo caminhada; uma escada
   * fica perto de 0,74 e ganha a elevação de joelho. Entre as duas a
   * passagem é contínua, então nunca há uma troca brusca de animação.
   */
  slope?: number;
  elapsed: number;
}

function blend(out: Pose, target: Pose, weight: number): void {
  if (weight <= 0) return;
  for (let i = 0; i < Ch.Count; i++) out[i] = lerp(out[i], target[i], weight);
}

/**
 * Animação procedural do avatar: poses calculadas por funções e
 * misturadas por pesos suavizados (parado, andar, correr, pular, cair,
 * nadar, sentar e acenar). Não depende de arquivos de animação.
 *
 * Por cima da locomoção entram duas camadas de conversa, ambas com peso
 * suavizado — nada substitui a animação de base:
 *
 * - **gestos** (`playGesture`), que mexem só na metade de cima do corpo;
 * - **olhar** (`lookAt`), que vira a cabeça para um ponto de interesse.
 *
 * Convenção dos ângulos (personagem olhando para +Z): em braços e
 * pernas, rotação X positiva leva o membro para trás e rotação Z
 * positiva o leva para +X (lado esquerdo do personagem); em tronco e
 * cabeça, rotação X positiva inclina para a frente.
 */
export class AvatarAnimator {
  readonly pose: Pose = new Float32Array(Ch.Count);
  private readonly scratch: Pose = new Float32Array(Ch.Count);
  private readonly scratchB: Pose = new Float32Array(Ch.Count);

  private moveBlend = 0;
  private runBlend = 0;
  private airWeight = 0;
  private fallBlend = 0;
  private swimWeight = 0;
  private sitWeight = 0;
  private landKick = 0;
  /** Quanto da pose de escada está aplicada (0–1), subindo ou descendo. */
  private stairWeight = 0;
  /** +1 subindo, −1 descendo; suavizado para a virada no patamar não piscar. */
  private stairDir = 0;

  /** Gesto em execução (um por vez; o novo substitui o anterior com fade). */
  private gesture: GesturePlayback | null = null;
  /** Gesto que está saindo de cena enquanto o novo entra. */
  private fading: GesturePlayback | null = null;
  /** Quanto o personagem está falando agora (0–1), suavizado. */
  private talkLevel = 0;
  private talkTarget = 0;
  private talkClock = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookYawTarget = 0;
  private lookPitchTarget = 0;

  /** Dispara o aceno (atalho histórico para o gesto `acenar`). */
  wave(duration = 2.6): void {
    this.playGesture('acenar', { duration });
  }

  get isWaving(): boolean {
    return this.gesture?.id === 'acenar';
  }

  /**
   * Toca um gesto por cima da animação atual.
   *
   * O gesto anterior não é cortado: ele sai suavemente enquanto o novo
   * entra, e as pernas seguem andando normalmente o tempo todo.
   */
  playGesture(id: GestureId, options: { duration?: number; strength?: number } = {}): void {
    const definition = GESTURES[id];
    if (!definition) return;
    if (this.gesture) {
      this.gesture.stop();
      this.fading = this.gesture;
    }
    this.gesture = new GesturePlayback(definition, options);
  }

  /** Encerra o gesto atual suavemente. */
  stopGesture(): void {
    if (!this.gesture) return;
    this.gesture.stop();
    this.fading = this.gesture;
    this.gesture = null;
  }

  /** Gesto em execução, ou `null`. */
  get currentGesture(): GestureId | null {
    return this.gesture?.id ?? null;
  }

  get isGesturing(): boolean {
    return this.gesture !== null;
  }

  /**
   * Nível de fala (0 = calado, 1 = falando).
   *
   * Mantido fora dos gestos de propósito: a pessoa pode estar falando e
   * acenando ao mesmo tempo, como acontece em qualquer conversa.
   */
  setTalking(level: number): void {
    this.talkTarget = clamp01(level);
  }

  get talking(): number {
    return this.talkLevel;
  }

  /**
   * Vira a cabeça para um ponto de interesse.
   *
   * @param yaw giro lateral em radianos, relativo à direção do corpo.
   * @param pitch inclinação vertical em radianos (positivo = olhar para baixo).
   */
  lookAt(yaw: number, pitch = 0): void {
    this.lookYawTarget = clamp(yaw, -1.1, 1.1);
    this.lookPitchTarget = clamp(pitch, -0.5, 0.5);
  }

  /** Devolve o olhar à posição neutra. */
  clearLook(): void {
    this.lookYawTarget = 0;
    this.lookPitchTarget = 0;
  }

  /** Pequena flexão dos joelhos ao aterrissar. */
  land(impactSpeed: number): void {
    this.landKick = clamp01(impactSpeed / 12);
  }

  update(dt: number, input: AnimatorInput): Pose {
    const { state, speed, stridePhase: phase, elapsed: t } = input;
    const k = 12;
    // Escada é caminhada: o ciclo de passada continua rodando e na
    // velocidade real. O que muda é a altura do joelho e a postura,
    // aplicadas por cima — nunca uma animação de escalar no lugar do
    // andar.
    const onStairs = state === 'stairUp' || state === 'stairDown';
    const moving = state === 'walk' || state === 'run' || onStairs || (state === 'swim' && speed > 0.4);
    this.moveBlend = damp(this.moveBlend, moving ? clamp01(speed / 1.6) : 0, k, dt);
    this.runBlend = damp(this.runBlend, clamp01((speed - PLAYER.walkSpeed) / (PLAYER.runSpeed - PLAYER.walkSpeed)), 8, dt);
    this.airWeight = damp(this.airWeight, state === 'jump' || state === 'fall' ? 1 : 0, 14, dt);
    this.fallBlend = damp(this.fallBlend, input.verticalSpeed < -1 ? 1 : 0, 7, dt);
    this.swimWeight = damp(this.swimWeight, state === 'swim' ? 1 : 0, 7, dt);
    this.sitWeight = damp(this.sitWeight, state === 'sit' ? 1 : 0, 9, dt);
    // A pose de escada entra na medida da inclinação: 0 numa rampa
    // suave, cheia num degrau. `slope` ausente (rede, testes antigos)
    // cai no estado, que já é só escada quando a inclinação é de escada.
    const slope = input.slope ?? (state === 'stairUp' ? 0.74 : state === 'stairDown' ? -0.74 : 0);
    const steepness = onStairs ? clamp01((Math.abs(slope) - 0.26) / 0.34) : 0;
    this.stairWeight = damp(this.stairWeight, moving ? steepness : 0, 9, dt);
    if (Math.abs(slope) > 0.26) this.stairDir = damp(this.stairDir, slope > 0 ? 1 : -1, 9, dt);
    this.landKick = damp(this.landKick, 0, 9, dt);
    this.talkLevel = damp(this.talkLevel, this.talkTarget, 6, dt);
    this.talkClock += dt;
    this.lookYaw = damp(this.lookYaw, this.lookYawTarget, 6, dt);
    this.lookPitch = damp(this.lookPitch, this.lookPitchTarget, 6, dt);

    const pose = this.pose;
    const a = this.scratch;
    const b = this.scratchB;

    // Parado: respiração e olhar tranquilo.
    pose.fill(0);
    const breath = Math.sin(t * 1.7);
    pose[Ch.HipsY] = breath * 0.004;
    pose[Ch.TorsoX] = breath * 0.014;
    pose[Ch.HeadY] = Math.sin(t * 0.43) * 0.14;
    pose[Ch.HeadX] = Math.sin(t * 0.31 + 1) * 0.04;
    pose[Ch.ArmLZ] = 0.09 + breath * 0.012;
    pose[Ch.ArmRZ] = -0.09 - breath * 0.012;
    pose[Ch.ArmLX] = 0.03;
    pose[Ch.ArmRX] = 0.03;
    pose[Ch.ForeL] = -0.12;
    pose[Ch.ForeR] = -0.12;

    // Andar / correr.
    if (this.moveBlend > 0.001 && this.swimWeight < 0.999) {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const r = this.runBlend;
      a.fill(0);
      const legAmp = lerp(0.52, 0.98, r);
      const armAmp = lerp(0.42, 0.95, r);
      a[Ch.LegLX] = -s * legAmp;
      a[Ch.LegRX] = s * legAmp;
      // O joelho dobra enquanto a perna vem de trás para a frente.
      a[Ch.ShinL] = Math.max(0, -c) * lerp(0.85, 1.55, r) + 0.08;
      a[Ch.ShinR] = Math.max(0, c) * lerp(0.85, 1.55, r) + 0.08;
      a[Ch.ArmLX] = s * armAmp;
      a[Ch.ArmRX] = -s * armAmp;
      a[Ch.ArmLZ] = lerp(0.07, 0.16, r);
      a[Ch.ArmRZ] = -lerp(0.07, 0.16, r);
      a[Ch.ForeL] = -lerp(0.28, 1.25, r) - Math.max(0, -s) * 0.25;
      a[Ch.ForeR] = -lerp(0.28, 1.25, r) - Math.max(0, s) * 0.25;
      a[Ch.HipsY] = -Math.abs(c) * lerp(0.022, 0.05, r) + lerp(0.012, 0.03, r);
      a[Ch.TorsoX] = lerp(0.04, 0.16, r);
      a[Ch.BodyPitch] = lerp(0.02, 0.09, r);
      a[Ch.TorsoY] = s * lerp(0.07, 0.14, r);
      a[Ch.TorsoZ] = c * 0.02;
      a[Ch.HeadX] = -lerp(0.02, 0.14, r);
      a[Ch.HeadY] = -s * 0.05;
      blend(pose, a, this.moveBlend);
    }

    // Escada, por cima do andar: é a mesma passada, com o joelho mais
    // alto para passar do degrau e o corpo compensando a inclinação.
    // Subindo, o peso vai à frente e a mão procura o corrimão; descendo,
    // o passo é curto, o tronco recua e o joelho de apoio amortece.
    if (this.stairWeight > 0.001 && this.swimWeight < 0.999) {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      const up = clamp01(this.stairDir);
      const down = clamp01(-this.stairDir);
      a.fill(0);
      // Joelho que sobe: alto na subida, moderado na descida.
      const lift = lerp(0.55, 1.15, up);
      a[Ch.LegLX] = -s * lift - up * 0.22 + down * 0.1;
      a[Ch.LegRX] = s * lift - up * 0.22 + down * 0.1;
      a[Ch.ShinL] = Math.max(0, -c) * lerp(1.2, 1.9, up) + lerp(0.3, 0.14, up);
      a[Ch.ShinR] = Math.max(0, c) * lerp(1.2, 1.9, up) + lerp(0.3, 0.14, up);
      // O corpo se inclina para dentro da escada nos dois sentidos:
      // para a frente subindo, recuado e atento descendo.
      a[Ch.BodyPitch] = lerp(-0.06, 0.2, up);
      a[Ch.TorsoX] = lerp(0.02, 0.12, up);
      a[Ch.HipsY] = -Math.abs(c) * 0.035 + 0.02;
      a[Ch.TorsoY] = s * 0.06;
      // Braços: um busca o corrimão subindo; descendo ficam baixos e
      // ligeiramente abertos, para equilíbrio.
      a[Ch.ArmLX] = s * 0.36 - up * 0.3;
      a[Ch.ArmRX] = -s * 0.36 - up * 0.3;
      a[Ch.ArmLZ] = lerp(0.2, 0.34, up);
      a[Ch.ArmRZ] = -lerp(0.2, 0.34, up);
      a[Ch.ForeL] = -lerp(0.4, 0.95, up) - Math.max(0, -s) * 0.2;
      a[Ch.ForeR] = -lerp(0.4, 0.95, up) - Math.max(0, s) * 0.2;
      // Olhando onde pisa, principalmente na descida.
      a[Ch.HeadX] = lerp(0.2, 0.06, up);
      blend(pose, a, this.stairWeight * this.moveBlend);
    }

    // No ar: subida (pernas recolhidas) e queda (braços abertos).
    if (this.airWeight > 0.001) {
      a.fill(0);
      a[Ch.LegLX] = -0.62;
      a[Ch.LegRX] = 0.18;
      a[Ch.ShinL] = 1.05;
      a[Ch.ShinR] = 0.55;
      a[Ch.ArmLX] = -0.5;
      a[Ch.ArmRX] = -0.5;
      a[Ch.ArmLZ] = 0.75;
      a[Ch.ArmRZ] = -0.75;
      a[Ch.ForeL] = -0.35;
      a[Ch.ForeR] = -0.35;
      a[Ch.TorsoX] = -0.08;
      b.fill(0);
      const flutter = Math.sin(t * 9) * 0.06;
      b[Ch.LegLX] = -0.24 + flutter;
      b[Ch.LegRX] = 0.2 - flutter;
      b[Ch.ShinL] = 0.4;
      b[Ch.ShinR] = 0.5;
      b[Ch.ArmLZ] = 1.35 + flutter;
      b[Ch.ArmRZ] = -1.35 - flutter;
      b[Ch.ArmLX] = -0.15;
      b[Ch.ArmRX] = -0.15;
      b[Ch.ForeL] = -0.25;
      b[Ch.ForeR] = -0.25;
      b[Ch.TorsoX] = 0.06;
      b[Ch.HeadX] = 0.12;
      blend(a, b, this.fallBlend);
      blend(pose, a, this.airWeight);
    }

    // Nadando: boiando no lugar ou em nado crawl.
    if (this.swimWeight > 0.001) {
      a.fill(0);
      const tread = t * 2.6;
      a[Ch.BodyPitch] = 0.16;
      a[Ch.ArmLZ] = 1.05 + Math.sin(tread) * 0.28;
      a[Ch.ArmRZ] = -1.05 - Math.sin(tread) * 0.28;
      a[Ch.ArmLX] = -0.35 + Math.cos(tread) * 0.25;
      a[Ch.ArmRX] = -0.35 + Math.cos(tread) * 0.25;
      a[Ch.ForeL] = -0.5;
      a[Ch.ForeR] = -0.5;
      a[Ch.LegLX] = Math.sin(tread * 1.3) * 0.32;
      a[Ch.LegRX] = -Math.sin(tread * 1.3) * 0.32;
      a[Ch.ShinL] = 0.35 + Math.max(0, Math.cos(tread * 1.3)) * 0.4;
      a[Ch.ShinR] = 0.35 + Math.max(0, -Math.cos(tread * 1.3)) * 0.4;
      a[Ch.HipsY] = Math.sin(t * 1.9) * 0.03;
      a[Ch.HeadX] = -0.12;

      b.fill(0);
      const stroke = phase * 0.9;
      b[Ch.BodyPitch] = 1.08;
      b[Ch.HeadX] = -0.74;
      b[Ch.TorsoY] = Math.sin(stroke) * 0.22;
      b[Ch.ArmLX] = -Math.PI * 0.5 + Math.sin(stroke) * 1.5 - 1.2;
      b[Ch.ArmRX] = -Math.PI * 0.5 - Math.sin(stroke) * 1.5 - 1.2;
      b[Ch.ArmLZ] = 0.16;
      b[Ch.ArmRZ] = -0.16;
      b[Ch.ForeL] = -0.25 - Math.max(0, Math.cos(stroke)) * 0.6;
      b[Ch.ForeR] = -0.25 - Math.max(0, -Math.cos(stroke)) * 0.6;
      const kick = t * 11;
      b[Ch.LegLX] = Math.sin(kick) * 0.3;
      b[Ch.LegRX] = -Math.sin(kick) * 0.3;
      b[Ch.ShinL] = 0.16 + Math.max(0, Math.sin(kick)) * 0.3;
      b[Ch.ShinR] = 0.16 + Math.max(0, -Math.sin(kick)) * 0.3;
      // No crawl o corpo sobe: costas e cabeça ficam fora d'água.
      b[Ch.HipsY] = 0.17 + Math.sin(t * 2.2) * 0.02;
      blend(a, b, this.moveBlend);
      blend(pose, a, this.swimWeight);
    }

    // Sentado.
    if (this.sitWeight > 0.001) {
      a.fill(0);
      a[Ch.HipsY] = -0.4;
      a[Ch.LegLX] = -1.5;
      a[Ch.LegRX] = -1.5;
      a[Ch.LegLZ] = 0.07;
      a[Ch.LegRZ] = -0.07;
      a[Ch.ShinL] = 1.42 + Math.sin(t * 1.1) * 0.05;
      a[Ch.ShinR] = 1.42 + Math.sin(t * 1.1 + 2) * 0.05;
      a[Ch.TorsoX] = 0.07 + breath * 0.012;
      a[Ch.ArmLX] = -0.5;
      a[Ch.ArmRX] = -0.5;
      a[Ch.ArmLZ] = 0.1;
      a[Ch.ArmRZ] = -0.1;
      a[Ch.ForeL] = -0.75;
      a[Ch.ForeR] = -0.75;
      a[Ch.HeadY] = Math.sin(t * 0.36) * 0.3;
      a[Ch.HeadX] = Math.sin(t * 0.27 + 0.6) * 0.07 - 0.03;
      blend(pose, a, this.sitWeight);
    }

    // Fala: mãos e cabeça acompanham a frase enquanto o texto aparece.
    if (this.talkLevel > 0.002) {
      GESTURES.falar.apply(pose, this.talkClock, this.talkLevel * 0.9);
    }

    // Gestos (aceno, concordar, apontar…), misturados por cima.
    if (this.fading) {
      this.fading.update(dt);
      this.fading.apply(pose);
      if (this.fading.finished) this.fading = null;
    }
    if (this.gesture) {
      this.gesture.update(dt);
      this.gesture.apply(pose);
      if (this.gesture.finished) this.gesture = null;
    }

    // Olhar: a cabeça vira para o ponto de interesse sem girar o corpo.
    if (Math.abs(this.lookYaw) > 0.001 || Math.abs(this.lookPitch) > 0.001) {
      pose[Ch.HeadY] = clamp(pose[Ch.HeadY] * 0.4 + this.lookYaw, -1.2, 1.2);
      pose[Ch.HeadX] = clamp(pose[Ch.HeadX] + this.lookPitch, -0.7, 0.7);
      pose[Ch.TorsoY] += this.lookYaw * 0.18;
    }

    // Amortecimento ao tocar o chão.
    if (this.landKick > 0.01) {
      const kick = this.landKick;
      pose[Ch.HipsY] -= kick * 0.16;
      pose[Ch.LegLX] -= kick * 0.5;
      pose[Ch.LegRX] -= kick * 0.5;
      pose[Ch.ShinL] += kick * 1.0;
      pose[Ch.ShinR] += kick * 1.0;
      pose[Ch.TorsoX] += kick * 0.22;
    }

    // Joelhos só dobram para trás.
    pose[Ch.ShinL] = Math.max(0, pose[Ch.ShinL]);
    pose[Ch.ShinR] = Math.max(0, pose[Ch.ShinR]);
    return pose;
  }
}
