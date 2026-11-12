import * as THREE from 'three';
import { WORLD } from '../core/Config';
import { AuroraCity } from '../cities/aurora-city/AuroraCity';
import type { CityFrame } from '../cities/aurora-city/CityContext';
import { auroraHeight } from '../cities/aurora-city/AuroraTerrain';
import { HANGING_GARDENS, LAKE, PIER, PLAZA } from '../cities/aurora-city/Layout';
import { buildAuroraZoneMap, generateGardenBeds, paintControlMap } from '../cities/aurora-city/Zones';
import type { SurfaceType } from '../physics/Collision';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { QualityProfile } from '../systems/QualitySystem';
import { Environment } from './Environment';
import { HeightField } from './HeightField';
import { MaterialLibrary } from './Materials';
import { Particles } from './Particles';
import { Terrain } from './Terrain';
import { Vegetation } from './Vegetation';
import { Water } from './Water';
import { Zone, type ZoneMap } from './ZoneMap';

export type WorldProgress = (fraction: number, label: string) => void | Promise<void>;

/**
 * O mundo do EDENWORLD: terreno, água, céu, vegetação, partículas,
 * física e a cidade ativa. Novas cidades entram aqui como novos módulos
 * em `src/cities/`.
 */
export class World {
  heightField!: HeightField;
  zones!: ZoneMap;
  physics!: PhysicsWorld;
  terrain!: Terrain;
  water!: Water;
  environment!: Environment;
  materials!: MaterialLibrary;
  vegetation!: Vegetation;
  particles!: Particles;
  city!: AuroraCity;
  ready = false;

  private controlMap: THREE.CanvasTexture | null = null;
  private frame: CityFrame | null = null;
  private detailDistance = 85;

  constructor(
    readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {}

  /** Constrói o mundo em etapas, cedendo o controle entre elas para a tela de carregamento. */
  async build(onProgress: WorldProgress = () => undefined): Promise<void> {
    await onProgress(0.04, 'Modelando o relevo de Aurora…');
    this.heightField = new HeightField(WORLD.terrainSize, 320, auroraHeight);

    await onProgress(0.2, 'Traçando ruas, praças e jardins…');
    this.zones = buildAuroraZoneMap(this.heightField);
    const beds = generateGardenBeds(this.zones, this.heightField);
    const controlCanvas = document.createElement('canvas');
    controlCanvas.width = controlCanvas.height = 1024;
    paintControlMap(controlCanvas, WORLD.terrainSize, beds);
    this.controlMap = new THREE.CanvasTexture(controlCanvas);
    this.controlMap.flipY = false;
    this.controlMap.colorSpace = THREE.NoColorSpace;
    this.terrain = new Terrain({ heightField: this.heightField, controlMap: this.controlMap });
    this.scene.add(this.terrain.group);

    const field = this.heightField;
    const zones = this.zones;
    this.physics = new PhysicsWorld({
      getHeight: (x, z) => field.getHeight(x, z),
      getSurface: (x, z): SurfaceType => {
        const flags = zones.flags(x, z);
        if (flags & (Zone.Paved | Zone.Path)) return 'stone';
        return field.getSurface(x, z);
      },
    });
    this.physics.boundaryRadius = WORLD.boundaryRadius;

    await onProgress(0.34, 'Enchendo o lago, o rio e o mar…');
    this.water = new Water({ heightField: this.heightField, waterLevel: WORLD.waterLevel });
    this.scene.add(this.water.mesh);
    this.environment = new Environment(this.scene, this.renderer);

    await onProgress(0.46, 'Erguendo as torres de cristal…');
    this.materials = new MaterialLibrary(this.water.normalMap);
    this.vegetation = new Vegetation({ materials: this.materials, heightField: this.heightField, physics: this.physics });
    this.city = new AuroraCity({
      materials: this.materials,
      physics: this.physics,
      heightField: this.heightField,
      zones: this.zones,
      vegetation: this.vegetation,
      beds,
    });
    this.scene.add(this.city.group);

    await onProgress(0.74, 'Plantando árvores e flores…');
    this.vegetation.build();
    this.scene.add(this.vegetation.group);

    await onProgress(0.86, 'Soltando bolhas e vaga-lumes…');
    this.particles = new Particles();
    this.particles.setJets(this.city.jets);
    this.particles.setBubbles([
      { x: PLAZA.x, z: PLAZA.z, y: 2.4, radius: 44, count: 70 },
      { x: LAKE.x, z: LAKE.z, y: 0.4, radius: 40, count: 34 },
      { x: HANGING_GARDENS.x, z: HANGING_GARDENS.z, y: 4, radius: 36, count: 30 },
      { x: PIER.x, z: PIER.zStart, y: 0.6, radius: 34, count: 22 },
      { x: 0, z: -150, y: 2.4, radius: 34, count: 26 },
    ]);
    this.scene.add(this.particles.group);

    await onProgress(0.94, 'Acendendo a aurora…');
    this.ready = true;
  }

  /** Aplica um perfil de qualidade a todos os subsistemas visuais. */
  applyQuality(profile: QualityProfile): void {
    if (!this.ready) return;
    this.environment.applyQuality({
      shadows: { enabled: profile.shadows, mapSize: profile.shadowMapSize, distance: profile.shadowDistance },
      cloudCount: profile.cloudCount,
      cloudDetail: profile.cloudDetail,
      viewDistance: profile.viewDistance,
      envUpdateHours: profile.envUpdateHours,
    });
    this.water.setReflections(profile.waterReflections);
    this.detailDistance = profile.detailDistance;
    this.vegetation.applyQuality(profile.vegetationDensity, profile.detailDistance, profile.lodBias);
    this.particles.setDensity(profile.particleDensity);
    this.city.setDetailScale(profile.lodBias);
  }

  setViewport(width: number, height: number, pixelRatio: number, fovDegrees: number): void {
    if (!this.ready) return;
    this.water.setSize(width, height, pixelRatio);
    this.particles.setViewport(height * pixelRatio, fovDegrees);
  }

  /**
   * @param focus ponto de interesse (jogador) — centro das sombras.
   * @param advanceClock `false` congela o relógio do mundo (menus, pausa).
   */
  update(dt: number, elapsed: number, camera: THREE.Camera, focus: THREE.Vector3, advanceClock: boolean): void {
    if (!this.ready) return;
    const env = this.environment;
    env.update(dt, elapsed, camera.position, focus, advanceClock);
    this.materials.update(elapsed, env.atmosphere, env.weather.wind);
    this.water.update(elapsed, env.atmosphere, env.weather.wind.z);
    this.vegetation.update(camera.position);
    this.particles.update(elapsed, env.atmosphere, camera.position);

    const frame = (this.frame ??= { dt, elapsed, atmosphere: env.atmosphere, cameraPosition: new THREE.Vector3() });
    frame.dt = dt;
    frame.elapsed = elapsed;
    frame.cameraPosition.copy(camera.position);
    this.city.update(frame);
  }

  get grassDistance(): number {
    return this.detailDistance;
  }

  dispose(): void {
    if (!this.ready) return;
    this.ready = false;
    this.scene.remove(this.terrain.group, this.water.mesh, this.city.group, this.vegetation.group, this.particles.group);
    this.city.dispose();
    this.vegetation.dispose();
    this.particles.dispose();
    this.materials.dispose();
    this.water.dispose();
    this.terrain.dispose();
    this.environment.dispose();
    this.controlMap?.dispose();
    this.physics.clear();
  }
}
