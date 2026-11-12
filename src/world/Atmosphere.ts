import * as THREE from 'three';
import { smoothstep } from '../utils/math';
import type { SunState } from './WorldClock';

/**
 * Estado atmosférico derivado da posição do sol: cores do céu, da luz
 * solar/lunar, da luz ambiente e da névoa. Calculado uma vez por quadro
 * e compartilhado entre céu, iluminação, água, nuvens e partículas.
 */
export class AtmosphereState {
  readonly zenith = new THREE.Color();
  readonly horizon = new THREE.Color();
  readonly ground = new THREE.Color();
  readonly fog = new THREE.Color();
  /** Cor do disco solar no céu. */
  readonly sunDisc = new THREE.Color();
  /** Cor da luz direcional (sol de dia, lua à noite). */
  readonly lightColor = new THREE.Color();
  readonly ambientSky = new THREE.Color();
  readonly ambientGround = new THREE.Color();
  readonly cloudLight = new THREE.Color();
  readonly cloudShadow = new THREE.Color();
  /** Direção unitária para a fonte de luz direcional ativa. */
  readonly lightDirection = new THREE.Vector3(0, 1, 0);
  readonly sunDirection = new THREE.Vector3(0, 1, 0);
  readonly moonDirection = new THREE.Vector3(0, -1, 0);
  lightIntensity = 1;
  ambientIntensity = 1;
  /** 0 = dia, 1 = noite plena. */
  night = 0;
  daylight = 1;
  twilight = 0;
  /** Intensidade da aurora no céu noturno. */
  aurora = 0;
  /** Intensidade dos reflexos do mapa de ambiente. */
  environmentIntensity = 1;
}

const DAY = {
  zenith: new THREE.Color(0x1b82ea),
  horizon: new THREE.Color(0xb4e6ff),
  ground: new THREE.Color(0x8ecfe0),
  // Preenchimento quente: equilibra o azul vindo do mapa de ambiente do céu.
  ambientSky: new THREE.Color(0xfff4e0),
  ambientGround: new THREE.Color(0xb6e6a8),
  light: new THREE.Color(0xfff0d6),
  cloudLight: new THREE.Color(0xffffff),
  cloudShadow: new THREE.Color(0xb8d6f2),
};

const DUSK = {
  zenith: new THREE.Color(0x4b6ec6),
  horizon: new THREE.Color(0xffc199),
  ground: new THREE.Color(0xc79aa4),
  ambientSky: new THREE.Color(0xffd6c2),
  ambientGround: new THREE.Color(0xb59aa0),
  light: new THREE.Color(0xffae66),
  cloudLight: new THREE.Color(0xffd2b0),
  cloudShadow: new THREE.Color(0x8f7fc0),
};

const NIGHT = {
  zenith: new THREE.Color(0x07173f),
  horizon: new THREE.Color(0x14577a),
  ground: new THREE.Color(0x0c2f48),
  ambientSky: new THREE.Color(0x6c8fe0),
  ambientGround: new THREE.Color(0x1f5266),
  light: new THREE.Color(0xa9c8ff),
  cloudLight: new THREE.Color(0x5f7fc2),
  cloudShadow: new THREE.Color(0x1c2f66),
};

function blend(out: THREE.Color, night: THREE.Color, day: THREE.Color, dusk: THREE.Color, daylight: number, twilight: number): void {
  out.copy(night).lerp(day, daylight).lerp(dusk, twilight);
}

export function computeAtmosphere(sun: SunState, out: AtmosphereState): AtmosphereState {
  const daylight = sun.daylight;
  const twilight = sun.twilight * 0.78;

  out.daylight = daylight;
  out.twilight = sun.twilight;
  out.night = 1 - daylight;
  out.aurora = smoothstep(0.55, 0.95, out.night);

  blend(out.zenith, NIGHT.zenith, DAY.zenith, DUSK.zenith, daylight, twilight * 0.55);
  blend(out.horizon, NIGHT.horizon, DAY.horizon, DUSK.horizon, daylight, twilight);
  blend(out.ground, NIGHT.ground, DAY.ground, DUSK.ground, daylight, twilight * 0.6);
  blend(out.ambientSky, NIGHT.ambientSky, DAY.ambientSky, DUSK.ambientSky, daylight, twilight * 0.7);
  blend(out.ambientGround, NIGHT.ambientGround, DAY.ambientGround, DUSK.ambientGround, daylight, twilight * 0.5);
  blend(out.cloudLight, NIGHT.cloudLight, DAY.cloudLight, DUSK.cloudLight, daylight, twilight);
  blend(out.cloudShadow, NIGHT.cloudShadow, DAY.cloudShadow, DUSK.cloudShadow, daylight, twilight);

  out.fog.copy(out.horizon).lerp(out.zenith, 0.12);
  out.sunDisc.copy(DAY.light).lerp(DUSK.light, sun.twilight);

  out.sunDirection.set(sun.x, sun.y, sun.z);
  out.moonDirection.set(-sun.x, -sun.y, -sun.z * 0.4).normalize();

  const sunPower = smoothstep(0.0, 0.3, sun.y);
  const moonPower = smoothstep(0.0, -0.25, sun.y);
  if (sun.y >= 0) {
    out.lightDirection.copy(out.sunDirection);
    out.lightColor.copy(DAY.light).lerp(DUSK.light, sun.twilight);
    out.lightIntensity = 3.1 * sunPower;
  } else {
    out.lightDirection.copy(out.moonDirection);
    out.lightColor.copy(NIGHT.light);
    out.lightIntensity = 0.62 * moonPower;
  }
  // Evita luz rasante demais (sombras infinitas) perto do horizonte.
  if (out.lightDirection.y < 0.12) {
    out.lightDirection.y = 0.12;
    out.lightDirection.normalize();
  }

  out.ambientIntensity = 0.66 + 0.06 * daylight - 0.08 * twilight;
  out.environmentIntensity = 0.3 + 0.34 * daylight;
  return out;
}
