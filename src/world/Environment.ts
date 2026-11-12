import * as THREE from 'three';
import { lerp } from '../utils/math';
import { AtmosphereState, computeAtmosphere } from './Atmosphere';
import { Lighting, type ShadowSettings } from './Lighting';
import { Sky } from './Sky';
import { Weather } from './Weather';
import { type SunState, WorldClock } from './WorldClock';

export interface EnvironmentQuality {
  shadows: ShadowSettings;
  cloudCount: number;
  cloudDetail: number;
  /** Distância de visão (m): controla névoa e plano distante da câmera. */
  viewDistance: number;
  /** Intervalo mínimo (em horas do mundo) entre capturas do mapa de ambiente. */
  envUpdateHours: number;
}

/**
 * Ambiente do mundo: relógio, atmosfera, céu, luzes, névoa, clima e o
 * mapa de ambiente usado nos reflexos de vidro e superfícies glossy.
 */
export class Environment {
  readonly clock = new WorldClock();
  readonly atmosphere = new AtmosphereState();
  readonly sky = new Sky();
  readonly weather = new Weather();
  readonly lighting: Lighting;
  readonly fog: THREE.Fog;

  private readonly sun: SunState = { x: 0, y: 1, z: 0, daylight: 1, twilight: 0 };
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly cubeTarget: THREE.WebGLCubeRenderTarget;
  private readonly cubeCamera: THREE.CubeCamera;
  private pmremTarget: THREE.WebGLRenderTarget | null = null;
  private lastEnvHours = -100;
  private lastEnvElapsed = -100;
  private envUpdateHours = 0.5;
  private viewDistance = 700;
  /** Duração (ms) da última captura do mapa de ambiente — útil para diagnóstico. */
  lastEnvCaptureMs = 0;
  envCaptureCount = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.lighting = new Lighting(scene);
    this.fog = new THREE.Fog(0xb4e6ff, 120, 900);
    scene.fog = this.fog;
    scene.add(this.sky.group);
    scene.add(this.sky.clouds);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
    this.cubeCamera = new THREE.CubeCamera(1, 1500, this.cubeTarget);
  }

  applyQuality(quality: EnvironmentQuality): void {
    this.lighting.configureShadows(quality.shadows);
    this.sky.setClouds(quality.cloudCount, quality.cloudDetail);
    this.envUpdateHours = quality.envUpdateHours;
    this.viewDistance = quality.viewDistance;
  }

  get viewRange(): number {
    return this.viewDistance;
  }

  /** Atualiza atmosfera, luzes, céu, névoa e (quando necessário) reflexos. */
  update(dt: number, elapsed: number, cameraPosition: THREE.Vector3, focus: THREE.Vector3, advanceClock: boolean): void {
    if (advanceClock) {
      this.clock.update(dt);
      this.weather.update(dt, this.clock.hours);
    }

    this.clock.getSun(this.sun);
    computeAtmosphere(this.sun, this.atmosphere);

    this.lighting.update(this.atmosphere, focus);
    this.sky.update(dt, elapsed, cameraPosition, this.atmosphere, this.weather.wind);

    // Névoa: perspectiva aérea suave, mais densa com neblina.
    const visibility = this.weather.visibility;
    this.fog.color.copy(this.atmosphere.fog);
    this.fog.near = lerp(18, this.viewDistance * 0.2, visibility);
    this.fog.far = lerp(170, this.viewDistance * 1.45, visibility);

    this.scene.environmentIntensity = this.atmosphere.environmentIntensity;
    this.maybeUpdateEnvironmentMap(elapsed);
  }

  private maybeUpdateEnvironmentMap(elapsed: number): void {
    let delta = Math.abs(this.clock.hours - this.lastEnvHours);
    if (delta > 12) delta = 24 - delta;
    const gliding = this.clock.isGliding;
    const minInterval = gliding ? 0.45 : 3;
    const threshold = gliding ? 0.2 : this.envUpdateHours;
    if (this.pmremTarget !== null && (delta < threshold || elapsed - this.lastEnvElapsed < minInterval)) return;
    this.captureEnvironmentMap(elapsed);
  }

  /** Captura o céu atual em um mapa de ambiente pré-filtrado (PMREM). */
  captureEnvironmentMap(elapsed = this.lastEnvElapsed): void {
    const start = performance.now();
    const envScene = this.sky.getEnvironmentScene();
    const previousTarget = this.renderer.getRenderTarget();

    this.sky.setDiscIntensity(0.15);
    this.cubeCamera.update(this.renderer, envScene);
    this.sky.setDiscIntensity(1);

    this.pmremTarget = this.pmrem.fromCubemap(this.cubeTarget.texture, this.pmremTarget as THREE.WebGLCubeRenderTarget | null);
    this.renderer.setRenderTarget(previousTarget);

    if (this.scene.environment !== this.pmremTarget.texture) {
      this.scene.environment = this.pmremTarget.texture;
    }
    this.lastEnvHours = this.clock.hours;
    this.lastEnvElapsed = elapsed;
    this.lastEnvCaptureMs = performance.now() - start;
    this.envCaptureCount += 1;
  }

  dispose(): void {
    this.scene.environment = null;
    this.scene.fog = null;
    this.pmremTarget?.dispose();
    this.cubeTarget.dispose();
    this.pmrem.dispose();
    this.sky.dispose();
    this.lighting.dispose();
    this.weather.dispose();
  }
}
