import * as THREE from 'three';
import { DEFAULT_REGION_ID, getBlueprint } from '../cities';
import type { CityFrame } from '../cities/aurora-city/CityContext';
import { WildlifeView } from '../creatures/WildlifeView';
import type { WildAnimal } from '../creatures/Wildlife';
import type { SurfaceType } from '../physics/Collision';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { QualityProfile } from '../systems/QualitySystem';
import { Environment } from './Environment';
import { HeightField } from './HeightField';
import { MaterialLibrary } from './Materials';
import { Particles } from './Particles';
import type { NamedArea, RegionBlueprint, RegionScene } from './RegionScene';
import { Terrain } from './Terrain';
import { Vegetation } from './Vegetation';
import { Water } from './Water';
import { Zone, type ZoneMap } from './ZoneMap';

export type WorldProgress = (fraction: number, label: string) => void | Promise<void>;

/**
 * O mundo do EDENWORLD: terreno, água, céu, vegetação, partículas,
 * física e a **região ativa**.
 *
 * O mundo hospeda uma região por vez e não sabe qual é: lê tudo de um
 * `RegionBlueprint`. Viajar entre regiões com cenário construído é
 * `dispose()` seguido de `build(outraRegiao)` — o resto do jogo
 * (inventário, bichos, progresso, salvamento) atravessa intacto,
 * porque nada disso vive aqui.
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
  /** A região montada agora. */
  region!: RegionScene;
  /** Os bichos selvagens visíveis nesta região. */
  wildlife!: WildlifeView;
  ready = false;

  private blueprint!: RegionBlueprint;
  private controlMap: THREE.CanvasTexture | null = null;
  private frame: CityFrame | null = null;
  private detailDistance = 85;
  private quality: QualityProfile | null = null;

  constructor(
    readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {}

  /** Id da região ativa. */
  get regionId(): string {
    return this.blueprint?.id ?? DEFAULT_REGION_ID;
  }

  /** Nome da região ativa, para o HUD. */
  get regionName(): string {
    return this.blueprint?.name ?? 'Aurora City';
  }

  /** Sub-áreas nomeadas da região ativa. */
  get areas(): readonly NamedArea[] {
    return this.blueprint?.areas() ?? [];
  }

  /** Onde quem chega pela primeira vez nasce. */
  get spawn(): { x: number; z: number; heading: number } {
    return this.blueprint?.spawn ?? { x: 0, z: 30, heading: Math.PI };
  }

  get boundaryRadius(): number {
    return this.blueprint?.boundaryRadius ?? 268;
  }

  coastRadius(angle: number): number {
    return this.blueprint?.coastRadius(angle) ?? 232;
  }

  /** Em que sub-área da região está este ponto. */
  areaAt(x: number, z: number): NamedArea | null {
    for (const area of this.areas) {
      if (Math.hypot(x - area.x, z - area.z) <= area.radius) return area;
    }
    return null;
  }

  /**
   * Compatibilidade: o restante do motor chamava `world.city`.
   * Continua funcionando, agora apontando para a região ativa.
   */
  get city(): RegionScene {
    return this.region;
  }

  /** Constrói uma região em etapas, cedendo o controle para a tela de carregamento. */
  async build(onProgress: WorldProgress = () => undefined, regionId: string = DEFAULT_REGION_ID): Promise<void> {
    const blueprint = getBlueprint(regionId) ?? getBlueprint(DEFAULT_REGION_ID);
    if (!blueprint) throw new Error('[World] Nenhuma região construída disponível');
    this.blueprint = blueprint;
    const steps = blueprint.loadingSteps;

    await onProgress(0.04, steps[0]);
    this.heightField = new HeightField(blueprint.terrainSize, blueprint.terrainSegments, blueprint.height);

    await onProgress(0.2, steps[1]);
    this.zones = blueprint.buildZones(this.heightField);
    const controlCanvas = document.createElement('canvas');
    controlCanvas.width = controlCanvas.height = 1024;
    blueprint.paintControl(controlCanvas, this.zones, this.heightField);
    this.controlMap = new THREE.CanvasTexture(controlCanvas);
    this.controlMap.flipY = false;
    this.controlMap.colorSpace = THREE.NoColorSpace;
    this.terrain = new Terrain({ heightField: this.heightField, controlMap: this.controlMap, palette: blueprint.palette });
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
    this.physics.boundaryRadius = blueprint.boundaryRadius;

    await onProgress(0.34, steps[2]);
    this.water = new Water({ heightField: this.heightField, waterLevel: blueprint.waterLevel });
    this.scene.add(this.water.mesh);
    this.environment = new Environment(this.scene, this.renderer);

    await onProgress(0.46, steps[3]);
    this.materials = new MaterialLibrary(this.water.normalMap);
    this.vegetation = new Vegetation({ materials: this.materials, heightField: this.heightField, physics: this.physics });
    this.region = blueprint.create({
      materials: this.materials,
      physics: this.physics,
      heightField: this.heightField,
      zones: this.zones,
      vegetation: this.vegetation,
    });
    this.scene.add(this.region.group);

    await onProgress(0.74, 'Plantando árvores e flores…');
    this.vegetation.build();
    this.scene.add(this.vegetation.group);

    await onProgress(0.86, steps[4]);
    this.wildlife = new WildlifeView({
      groundY: (x, z) => field.getHeight(x, z),
      waterLevel: blueprint.waterLevel,
      anchors: blueprint.habitats(),
    });
    this.scene.add(this.wildlife.group);

    this.particles = new Particles();
    this.particles.setJets(this.region.jets);
    this.particles.setBubbles([...blueprint.bubbles()]);
    this.scene.add(this.particles.group);

    await onProgress(0.94, 'Acendendo a aurora…');
    this.ready = true;
    // Uma região reconstruída herda a qualidade já escolhida; sem isto
    // o jogador que viaja no celular volta para o perfil alto.
    if (this.quality) this.applyQuality(this.quality);
  }

  /** Aplica um perfil de qualidade a todos os subsistemas visuais. */
  applyQuality(profile: QualityProfile): void {
    this.quality = profile;
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
    this.particles.setEnvironmentEffects(profile.environmentEffects);
    this.region.setDetailScale(profile.lodBias);
    this.wildlife.setDetailScale(profile.lodBias);
    this.wildlife.setViewDistance(Math.min(profile.viewDistance, 120));
  }

  setViewport(width: number, height: number, pixelRatio: number, fovDegrees: number): void {
    if (!this.ready) return;
    this.water.setSize(width, height, pixelRatio);
    this.particles.setViewport(height * pixelRatio, fovDegrees);
  }

  /** Repovoa a fauna visível desta região. */
  setWildlife(animals: readonly WildAnimal[]): void {
    if (!this.ready) return;
    this.wildlife.populate(animals);
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
    frame.atmosphere = env.atmosphere;
    frame.cameraPosition.copy(camera.position);
    this.region.update(frame);
    this.wildlife.update(dt, elapsed, focus.x, focus.z, camera.position);
  }

  get grassDistance(): number {
    return this.detailDistance;
  }

  dispose(): void {
    if (!this.ready) return;
    this.ready = false;
    this.scene.remove(this.terrain.group, this.water.mesh, this.region.group, this.vegetation.group, this.particles.group, this.wildlife.group);
    this.wildlife.dispose();
    this.region.dispose();
    this.vegetation.dispose();
    this.particles.dispose();
    this.materials.dispose();
    this.water.dispose();
    this.terrain.dispose();
    this.environment.dispose();
    this.controlMap?.dispose();
    this.controlMap = null;
    this.frame = null;
    this.physics.clear();
  }
}
