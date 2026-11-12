import * as THREE from 'three';
import { TAU, createRng, damp } from '../utils/math';

export type WeatherKind = 'limpo' | 'brisa' | 'neblina';

export interface WeatherPreset {
  id: WeatherKind;
  label: string;
  /** Força do vento em [0, 1]. */
  wind: number;
  /** Visibilidade em [0, 1] (1 = atmosfera limpa). */
  visibility: number;
}

export const WEATHER_PRESETS: Record<WeatherKind, WeatherPreset> = {
  limpo: { id: 'limpo', label: 'Céu limpo', wind: 0.28, visibility: 1 },
  brisa: { id: 'brisa', label: 'Brisa do mar', wind: 0.7, visibility: 0.92 },
  neblina: { id: 'neblina', label: 'Neblina suave', wind: 0.12, visibility: 0.42 },
};

/**
 * Ponto de extensão para efeitos climáticos futuros (chuva, arco-íris,
 * tempestades de pétalas...). Um efeito recebe o estado do clima a cada
 * quadro e decide o que renderizar.
 */
export interface WeatherEffect {
  readonly id: string;
  update(dt: number, weather: Weather): void;
  dispose?(): void;
}

/**
 * Clima de Aurora City. A Genesis 0.1 implementa vento e neblina com
 * variação automática; chuva e arco-íris entram como `WeatherEffect`.
 */
export class Weather {
  /** x, y = direção do vento no plano XZ; z = força atual em [0, 1]. */
  readonly wind = new THREE.Vector3(1, 0, WEATHER_PRESETS.limpo.wind);
  visibility = 1;
  current: WeatherKind = 'limpo';
  /** Quando `true`, o clima varia sozinho ao longo do tempo. */
  automatic = true;

  private windAngle = 0.4;
  private windAngleTarget = 0.4;
  private nextChange = 90;
  private timer = 0;
  private gustPhase = 0;
  private readonly rng = createRng(90210);
  private readonly effects: WeatherEffect[] = [];

  setWeather(kind: WeatherKind, immediate = false): void {
    this.current = kind;
    if (immediate) {
      const preset = WEATHER_PRESETS[kind];
      this.wind.z = preset.wind;
      this.visibility = preset.visibility;
    }
  }

  registerEffect(effect: WeatherEffect): void {
    this.effects.push(effect);
  }

  /** @param hours hora do mundo, usada para favorecer neblina ao amanhecer. */
  update(dt: number, hours: number): void {
    const preset = WEATHER_PRESETS[this.current];

    if (this.automatic) {
      this.timer += dt;
      if (this.timer >= this.nextChange) {
        this.timer = 0;
        this.nextChange = 80 + this.rng() * 140;
        const roll = this.rng();
        const dawn = hours > 4.5 && hours < 7.5;
        if (dawn && roll < 0.55) this.current = 'neblina';
        else if (roll < 0.5) this.current = 'limpo';
        else if (roll < 0.9) this.current = 'brisa';
        else this.current = 'neblina';
        this.windAngleTarget = this.windAngle + (this.rng() - 0.5) * 1.6;
      }
    }

    this.gustPhase += dt;
    const gust = 0.12 * Math.sin(this.gustPhase * 0.37) + 0.08 * Math.sin(this.gustPhase * 0.91 + 1.7);
    this.wind.z = damp(this.wind.z, Math.max(0, preset.wind * (1 + gust)), 0.5, dt);
    this.visibility = damp(this.visibility, preset.visibility, 0.22, dt);

    this.windAngle = damp(this.windAngle, this.windAngleTarget, 0.1, dt);
    const a = this.windAngle % TAU;
    this.wind.x = Math.cos(a);
    this.wind.y = Math.sin(a);

    for (const effect of this.effects) effect.update(dt, this);
  }

  get label(): string {
    return WEATHER_PRESETS[this.current].label;
  }

  dispose(): void {
    for (const effect of this.effects) effect.dispose?.();
    this.effects.length = 0;
  }
}
