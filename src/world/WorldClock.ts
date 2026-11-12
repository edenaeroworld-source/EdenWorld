import { WORLD } from '../core/Config';
import { clamp, smoothstep } from '../utils/math';

export type DayPeriod = 'madrugada' | 'manhã' | 'tarde' | 'noite';

export type TimePace = 'normal' | 'rapido' | 'parado';

export const TIME_PACE_SCALE: Record<TimePace, number> = {
  normal: 1,
  rapido: 12,
  parado: 0,
};

export interface SunState {
  /** Direção unitária apontando para o sol. */
  x: number;
  y: number;
  z: number;
  /** 0 = noite plena, 1 = dia pleno. */
  daylight: number;
  /** 0 = sol alto ou noite, 1 = auge do nascer/pôr do sol. */
  twilight: number;
}

/**
 * Relógio do mundo: converte tempo real em horário de Aurora City e
 * fornece a posição do sol para céu, luzes e som ambiente.
 */
export class WorldClock {
  /** Hora do dia em [0, 24). */
  hours: number;
  /** Dias completos decorridos (começa em 1). */
  day = 1;
  pace: TimePace = 'normal';
  dayLengthSeconds: number;

  /** Transição suave quando o jogador escolhe um horário (EdenPhone). */
  private glideTarget: number | null = null;

  constructor(startHour: number = WORLD.startHour, dayLengthSeconds: number = WORLD.dayLengthSeconds) {
    this.hours = WorldClock.wrap(startHour);
    this.dayLengthSeconds = dayLengthSeconds;
  }

  static wrap(hours: number): number {
    const h = hours % 24;
    return h < 0 ? h + 24 : h;
  }

  update(dt: number): void {
    if (this.glideTarget !== null) {
      // Avança (sempre para frente) até o horário escolhido em ~2,5 s.
      let remaining = this.glideTarget - this.hours;
      if (remaining < 0) remaining += 24;
      const step = Math.max(remaining * 2.2, 1.5) * dt;
      if (step >= remaining) {
        this.advance(remaining);
        this.glideTarget = null;
      } else {
        this.advance(step);
      }
      return;
    }
    const scale = TIME_PACE_SCALE[this.pace];
    if (scale === 0) return;
    this.advance((dt * 24 * scale) / this.dayLengthSeconds);
  }

  private advance(deltaHours: number): void {
    this.hours += deltaHours;
    while (this.hours >= 24) {
      this.hours -= 24;
      this.day += 1;
    }
  }

  setHours(hours: number): void {
    this.hours = WorldClock.wrap(hours);
    this.glideTarget = null;
  }

  /** Desliza suavemente até o horário indicado. */
  glideTo(hours: number): void {
    this.glideTarget = WorldClock.wrap(hours);
  }

  get isGliding(): boolean {
    return this.glideTarget !== null;
  }

  get label(): string {
    const totalMinutes = Math.floor(this.hours * 60 + 1e-6);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get period(): DayPeriod {
    const h = this.hours;
    if (h < 5) return 'madrugada';
    if (h < 12) return 'manhã';
    if (h < 18) return 'tarde';
    return 'noite';
  }

  get isNight(): boolean {
    return this.getSun().daylight < 0.35;
  }

  /** Posição do sol: nasce a leste (+X) às 6h, culmina ao meio-dia, põe-se a oeste às 18h. */
  getSun(out: SunState = { x: 0, y: 1, z: 0, daylight: 1, twilight: 0 }): SunState {
    const theta = ((this.hours - 6) / 12) * Math.PI;
    const x = Math.cos(theta);
    const y = Math.sin(theta);
    const z = 0.36;
    const len = Math.hypot(x, y, z);
    out.x = x / len;
    out.y = y / len;
    out.z = z / len;
    out.daylight = smoothstep(-0.1, 0.2, out.y);
    out.twilight = clamp(1 - Math.abs(out.y - 0.04) / 0.3, 0, 1);
    return out;
  }
}
