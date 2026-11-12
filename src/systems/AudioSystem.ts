import type { SurfaceType } from '../physics/Collision';
import { clamp01, createRng } from '../utils/math';
import type { AudioSettings } from './SaveSystem';

export interface WaterSource {
  x: number;
  z: number;
  radius: number;
  gain: number;
}

/** Estado do mundo que influencia o som ambiente. */
export interface AudioWorldState {
  x: number;
  z: number;
  /** 0 = dia, 1 = noite. */
  night: number;
  /** Força do vento (0–1). */
  wind: number;
  /** Proximidade do mar (0–1). */
  coast: number;
  swimming: boolean;
  waterSources: readonly WaterSource[];
}

export type UiSound = 'click' | 'hover' | 'open' | 'close' | 'toggle' | 'error' | 'confirm';

type AudioContextCtor = typeof AudioContext;

const midi = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/** Progressão de acordes da trilha ambiente (notas MIDI). */
const CHORDS: readonly (readonly number[])[] = [
  [48, 55, 64, 71, 74],
  [45, 52, 60, 67, 71],
  [41, 48, 57, 64, 71],
  [43, 50, 59, 64, 69],
];
const BELL_SCALE = [72, 74, 76, 79, 81, 84, 86, 88] as const;

/**
 * Áudio 100% procedural (Web Audio API), sem arquivos: trilha ambiente
 * generativa, vento, mar, fontes, pássaros, grilos, passos por tipo de
 * piso e sons de interface. Só inicia após um gesto do usuário, como
 * exigem os navegadores.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private ambienceBus!: GainNode;
  private effectsBus!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private seaGain!: GainNode;
  private waterGain!: GainNode;
  private ambienceFilter!: BiquadFilterNode;
  private settings: AudioSettings;
  private readonly rng = createRng(4242);
  private nextChordAt = 0;
  private chordIndex = 0;
  private nextBellAt = 0;
  private nextBirdAt = 0;
  private nextCricketAt = 0;
  private night = 0;
  private musicActive = false;
  private lastStepAt = 0;
  private suspendedByPage = false;

  constructor(
    settings: AudioSettings,
    private readonly enabled = true,
  ) {
    this.settings = { ...settings };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get isUnlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get available(): boolean {
    return this.enabled && typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  /** Deve ser chamado dentro de um gesto do usuário (clique, tecla, toque). */
  unlock(): void {
    if (!this.available) return;
    if (!this.ctx) {
      try {
        const Ctor: AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.buildGraph(this.ctx);
      } catch (error) {
        console.warn('[Áudio] Não foi possível iniciar o áudio:', error);
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume().catch(() => undefined);
  }

  private readonly onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === 'running') {
        this.suspendedByPage = true;
        void ctx.suspend().catch(() => undefined);
      }
    } else if (this.suspendedByPage) {
      this.suspendedByPage = false;
      void ctx.resume().catch(() => undefined);
    }
  };

  private buildGraph(ctx: AudioContext): void {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;
    compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(compressor);

    this.musicBus = ctx.createGain();
    this.ambienceBus = ctx.createGain();
    this.effectsBus = ctx.createGain();
    this.ambienceFilter = ctx.createBiquadFilter();
    this.ambienceFilter.type = 'lowpass';
    this.ambienceFilter.frequency.value = 18000;
    this.musicBus.connect(this.master);
    this.ambienceBus.connect(this.ambienceFilter).connect(this.master);
    this.effectsBus.connect(this.master);

    // Reverberação sintética: ruído com decaimento exponencial.
    const seconds = 2.4;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (this.rng() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse;
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.5;
    this.reverb.connect(reverbGain).connect(this.master);

    // Ruído branco compartilhado.
    const noiseLength = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const noiseData = this.noise.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) noiseData[i] = this.rng() * 2 - 1;

    this.windGain = this.noiseBed(ctx, 'bandpass', 420, 0.5);
    this.seaGain = this.noiseBed(ctx, 'lowpass', 520, 0.4);
    this.waterGain = this.noiseBed(ctx, 'bandpass', 2300, 0.45);

    // Ondas do mar: vai e vem lento.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.35;
    const seaSwell = ctx.createGain();
    seaSwell.gain.value = 0.65;
    lfo.connect(lfoDepth).connect(seaSwell.gain);
    lfo.start();
    this.seaGain.disconnect();
    this.seaGain.connect(seaSwell).connect(this.ambienceBus);

    this.applyVolumes(0.05);
    const now = ctx.currentTime;
    this.nextChordAt = now + 0.4;
    this.nextBellAt = now + 4;
    this.nextBirdAt = now + 2;
    this.nextCricketAt = now + 1;
  }

  private noiseBed(ctx: AudioContext, type: BiquadFilterType, frequency: number, q: number): GainNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = 0.9 + this.rng() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.ambienceBus);
    source.start(0, this.rng() * 1.5);
    return gain;
  }

  applySettings(settings: AudioSettings): void {
    this.settings = { ...settings };
    this.applyVolumes(0.08);
  }

  private applyVolumes(timeConstant: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.settings;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, now, timeConstant);
    this.musicBus.gain.setTargetAtTime(s.music * 0.9, now, timeConstant);
    this.ambienceBus.gain.setTargetAtTime(s.ambience, now, timeConstant);
    this.effectsBus.gain.setTargetAtTime(s.effects, now, timeConstant);
  }

  /** Liga ou desliga a trilha ambiente (ex.: silenciosa na tela de carregamento). */
  setMusicActive(active: boolean): void {
    this.musicActive = active;
  }

  update(state: AudioWorldState): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    this.night = state.night;

    this.windGain.gain.setTargetAtTime(0.012 + state.wind * 0.075, now, 0.6);
    this.seaGain.gain.setTargetAtTime(0.02 + state.coast * 0.26, now, 0.5);
    let water = 0;
    for (const source of state.waterSources) {
      const d = Math.hypot(source.x - state.x, source.z - state.z);
      if (d < source.radius) {
        const k = 1 - d / source.radius;
        water += source.gain * k * k;
      }
    }
    this.waterGain.gain.setTargetAtTime(Math.min(0.16, water * 0.16), now, 0.25);
    this.ambienceFilter.frequency.setTargetAtTime(state.swimming ? 2600 : 18000, now, 0.2);

    if (this.musicActive) {
      if (now >= this.nextChordAt - 0.3) this.scheduleChord(ctx);
      if (now >= this.nextBellAt) this.scheduleBell(ctx);
    } else {
      this.nextChordAt = Math.max(this.nextChordAt, now + 0.3);
      this.nextBellAt = Math.max(this.nextBellAt, now + 1.5);
    }
    if (now >= this.nextBirdAt) {
      this.nextBirdAt = now + 2.2 + this.rng() * 6;
      if (state.night < 0.55) this.bird(ctx, (1 - state.night) * 0.5);
    }
    if (now >= this.nextCricketAt) {
      this.nextCricketAt = now + 0.5 + this.rng() * 1.3;
      if (state.night > 0.5) this.cricket(ctx, (state.night - 0.5) * 0.5);
    }
  }

  /* ----------------------------- Música ----------------------------- */

  private scheduleChord(ctx: AudioContext): void {
    const start = Math.max(ctx.currentTime + 0.05, this.nextChordAt);
    const duration = 11 + this.rng() * 3;
    this.nextChordAt = start + duration;
    const chord = CHORDS[this.chordIndex % CHORDS.length];
    this.chordIndex += this.rng() < 0.8 ? 1 : 2;
    const nightShift = this.night > 0.6 ? -12 : 0;
    const voices = this.night > 0.6 ? chord.slice(0, 4) : chord;
    for (let i = 0; i < voices.length; i++) {
      const frequency = midi(voices[i] + (i > 1 ? nightShift : 0));
      for (const detune of [-5, 6]) {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'sine' : 'triangle';
        osc.frequency.value = frequency;
        osc.detune.value = detune + (this.rng() - 0.5) * 3;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700 + (1 - this.night) * 900;
        const gain = ctx.createGain();
        const peak = (i < 2 ? 0.05 : 0.03) / (1 + i * 0.12);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + 3.2);
        gain.gain.setValueAtTime(peak, start + duration - 1);
        gain.gain.linearRampToValueAtTime(0, start + duration + 4.5);
        osc.connect(filter).connect(gain);
        gain.connect(this.musicBus);
        if (i >= 2) gain.connect(this.reverb);
        osc.start(start);
        osc.stop(start + duration + 4.6);
      }
    }
  }

  private scheduleBell(ctx: AudioContext): void {
    const now = ctx.currentTime;
    this.nextBellAt = now + 1.6 + this.rng() * (this.night > 0.6 ? 6.5 : 3.6);
    const note = BELL_SCALE[Math.floor(this.rng() * BELL_SCALE.length)] - (this.night > 0.6 ? 12 : 0);
    this.bell(ctx, midi(note), 0.045 + this.rng() * 0.03, 2.6, this.musicBus, (this.rng() - 0.5) * 1.2);
    if (this.rng() < 0.35) this.bell(ctx, midi(note + 7), 0.03, 2.2, this.musicBus, (this.rng() - 0.5) * 1.2, 0.28);
  }

  private bell(ctx: AudioContext, frequency: number, volume: number, decay: number, bus: GainNode, pan = 0, delay = 0): void {
    const start = ctx.currentTime + delay;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    for (const [ratio, level] of [
      [1, 1],
      [2.01, 0.32],
      [3.02, 0.1],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency * ratio;
      const partial = ctx.createGain();
      partial.gain.value = level;
      osc.connect(partial).connect(gain);
      osc.start(start);
      osc.stop(start + decay + 0.05);
    }
    gain.connect(panner);
    panner.connect(bus);
    panner.connect(this.reverb);
  }

  /* ---------------------------- Ambiente ---------------------------- */

  private bird(ctx: AudioContext, volume: number): void {
    const notes = 2 + Math.floor(this.rng() * 4);
    const base = 2300 + this.rng() * 1900;
    const panner = ctx.createStereoPanner();
    panner.pan.value = this.rng() * 1.6 - 0.8;
    panner.connect(this.ambienceBus);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < notes; i++) {
      const length = 0.05 + this.rng() * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = base * (0.85 + this.rng() * 0.4);
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * (0.75 + this.rng() * 0.7), t + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05 * volume + 0.0002, t + length * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.connect(gain).connect(panner);
      osc.start(t);
      osc.stop(t + length + 0.02);
      t += length + 0.03 + this.rng() * 0.07;
    }
  }

  private cricket(ctx: AudioContext, volume: number): void {
    const pulses = 3 + Math.floor(this.rng() * 4);
    const frequency = 4000 + this.rng() * 700;
    const panner = ctx.createStereoPanner();
    panner.pan.value = this.rng() * 1.8 - 0.9;
    panner.connect(this.ambienceBus);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < pulses; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.022 * volume + 0.0002, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.034);
      osc.connect(gain).connect(panner);
      osc.start(t);
      osc.stop(t + 0.05);
      t += 0.052;
    }
  }

  /* ----------------------------- Efeitos ---------------------------- */

  private burst(
    ctx: AudioContext,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    duration: number,
    volume: number,
    options: { sweepTo?: number; delay?: number; reverb?: boolean } = {},
  ): void {
    const start = ctx.currentTime + (options.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.8 + this.rng() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (options.sweepTo) filter.frequency.exponentialRampToValueAtTime(options.sweepTo, start + duration);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.effectsBus);
    if (options.reverb) gain.connect(this.reverb);
    source.start(start, this.rng() * 1.5, duration + 0.05);
  }

  private tone(
    ctx: AudioContext,
    from: number,
    to: number,
    duration: number,
    volume: number,
    options: { type?: OscillatorType; delay?: number; reverb?: boolean } = {},
  ): void {
    const start = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.015, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.effectsBus);
    if (options.reverb) gain.connect(this.reverb);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  private get live(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  step(surface: SurfaceType, running: boolean): void {
    const ctx = this.live;
    if (!ctx) return;
    // Evita rajadas de passos em quadros muito próximos.
    if (ctx.currentTime - this.lastStepAt < 0.09) return;
    this.lastStepAt = ctx.currentTime;
    const v = (running ? 1.25 : 1) * (0.85 + this.rng() * 0.3);
    const pitch = 0.9 + this.rng() * 0.22;
    switch (surface) {
      case 'grass':
        this.burst(ctx, 'bandpass', 950 * pitch, 0.7, 0.09, 0.075 * v);
        break;
      case 'sand':
        this.burst(ctx, 'lowpass', 780 * pitch, 0.5, 0.12, 0.09 * v);
        break;
      case 'wood':
        this.burst(ctx, 'bandpass', 430 * pitch, 3, 0.07, 0.11 * v);
        this.tone(ctx, 170 * pitch, 110, 0.06, 0.06 * v);
        break;
      case 'glass':
        this.burst(ctx, 'highpass', 2600, 0.6, 0.035, 0.04 * v);
        this.tone(ctx, 1900 * pitch, 1750 * pitch, 0.09, 0.02 * v, { reverb: true });
        break;
      case 'water':
        this.burst(ctx, 'bandpass', 1300 * pitch, 0.5, 0.16, 0.085 * v, { sweepTo: 600 });
        break;
      default:
        this.burst(ctx, 'bandpass', 1750 * pitch, 1.1, 0.05, 0.07 * v);
        this.tone(ctx, 210 * pitch, 150, 0.04, 0.03 * v);
        break;
    }
  }

  jump(): void {
    const ctx = this.live;
    if (ctx) this.tone(ctx, 300, 560, 0.13, 0.05);
  }

  land(impact: number, surface: SurfaceType): void {
    const ctx = this.live;
    if (!ctx) return;
    const v = 0.5 + clamp01(impact / 14) * 0.9;
    this.tone(ctx, 130, 62, 0.14, 0.09 * v);
    this.lastStepAt = 0;
    this.step(surface, true);
  }

  splash(strength: number): void {
    const ctx = this.live;
    if (!ctx) return;
    const s = clamp01(strength);
    this.burst(ctx, 'lowpass', 3200, 0.4, 0.55 + s * 0.3, 0.12 + s * 0.14, { sweepTo: 380, reverb: true });
    this.burst(ctx, 'bandpass', 1800, 0.8, 0.25, 0.06, { delay: 0.12 });
  }

  ui(kind: UiSound): void {
    const ctx = this.live;
    if (!ctx) return;
    switch (kind) {
      case 'hover':
        this.tone(ctx, 1320, 1320, 0.03, 0.012);
        break;
      case 'open':
        this.tone(ctx, 620, 620, 0.07, 0.035);
        this.tone(ctx, 930, 930, 0.1, 0.035, { delay: 0.06, reverb: true });
        break;
      case 'close':
        this.tone(ctx, 930, 930, 0.06, 0.03);
        this.tone(ctx, 620, 620, 0.09, 0.03, { delay: 0.055 });
        break;
      case 'toggle':
        this.tone(ctx, 990, 1180, 0.05, 0.03);
        break;
      case 'confirm':
        this.tone(ctx, 784, 784, 0.08, 0.04);
        this.tone(ctx, 1046, 1046, 0.09, 0.04, { delay: 0.07 });
        this.tone(ctx, 1568, 1568, 0.16, 0.035, { delay: 0.14, reverb: true });
        break;
      case 'error':
        this.tone(ctx, 196, 180, 0.16, 0.05, { type: 'triangle' });
        break;
      default:
        this.tone(ctx, 880, 860, 0.045, 0.035);
        break;
    }
  }

  /** Cristal de Luz coletado: arpejo ascendente (sobe a cada cristal). */
  pickup(index = 0): void {
    const ctx = this.live;
    if (!ctx) return;
    const root = 84 + (index % 5) * 2;
    [0, 4, 7, 12].forEach((interval, i) => this.bell(ctx, midi(root + interval), 0.07, 1.6, this.effectsBus, (i - 1.5) * 0.3, i * 0.075));
  }

  portal(): void {
    const ctx = this.live;
    if (!ctx) return;
    this.burst(ctx, 'bandpass', 300, 1.4, 0.9, 0.12, { sweepTo: 3600, reverb: true });
    this.tone(ctx, 180, 880, 0.75, 0.06, { reverb: true });
    this.bell(ctx, midi(88), 0.05, 1.8, this.effectsBus, 0, 0.6);
  }

  wish(): void {
    const ctx = this.live;
    if (!ctx) return;
    this.bell(ctx, midi(91), 0.06, 1.2, this.effectsBus, -0.2);
    this.bell(ctx, midi(96), 0.05, 1.4, this.effectsBus, 0.2, 0.09);
    this.burst(ctx, 'bandpass', 1600, 0.7, 0.3, 0.07, { delay: 0.3, sweepTo: 700 });
  }

  sphere(mode: number): void {
    const ctx = this.live;
    if (!ctx) return;
    const root = 60 + [0, 2, 4, 7, 9][mode % 5];
    [0, 7, 12, 16].forEach((interval, i) => this.bell(ctx, midi(root + interval), 0.06, 3, this.effectsBus, (i - 1.5) * 0.35, i * 0.11));
    this.tone(ctx, midi(root - 12), midi(root - 12), 1.6, 0.05, { reverb: true });
  }

  shutter(): void {
    const ctx = this.live;
    if (!ctx) return;
    this.burst(ctx, 'highpass', 3000, 0.7, 0.03, 0.08);
    this.burst(ctx, 'highpass', 2200, 0.7, 0.05, 0.07, { delay: 0.07 });
  }

  sit(): void {
    const ctx = this.live;
    if (ctx) this.burst(ctx, 'lowpass', 500, 0.6, 0.14, 0.06);
  }

  discovery(): void {
    const ctx = this.live;
    if (!ctx) return;
    [0, 7, 12].forEach((interval, i) => this.bell(ctx, midi(76 + interval), 0.045, 2.2, this.effectsBus, 0, i * 0.14));
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
