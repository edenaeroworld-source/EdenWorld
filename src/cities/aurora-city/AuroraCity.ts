import * as THREE from 'three';
import type { Interactable } from '../../interactions/Interactable';
import type { PhysicsWorld } from '../../physics/PhysicsWorld';
import type { HeightField } from '../../world/HeightField';
import type { MaterialLibrary } from '../../world/Materials';
import type { Vegetation } from '../../world/Vegetation';
import type { ZoneMap } from '../../world/ZoneMap';
import { buildBuildings } from './Buildings';
import { buildTravelStation } from '../shared/TravelStation';
import { buildCentralPlaza } from './CentralPlaza';
import { CityContext, type CityFrame, type CollectibleSpot, type JetEmitter, type LightSpot, type PortalStation, type SphereController, type WaterSoundSource } from './CityContext';
import { Props } from './Decorations';
import { buildLandscape } from './Landscape';
import { BUILDINGS } from './Layout';
import { buildParks } from './Parks';
import { interiorsInRegion } from '../../interiors/Interior';
import type { GardenBed } from './Zones';
import { keepOutsFor } from '../../world/KeepOut';

export interface AuroraCityOptions {
  materials: MaterialLibrary;
  physics: PhysicsWorld;
  heightField: HeightField;
  zones: ZoneMap;
  vegetation: Vegetation;
  beds: readonly GardenBed[];
}

/**
 * Aurora City — a primeira cidade do EDENWORLD.
 * Monta praça, edifícios, parques e paisagismo a partir da planta
 * (`Layout.ts`) e expõe o que o restante do jogo precisa: interativos,
 * portais, colecionáveis, emissores de água e fontes sonoras.
 */
export class AuroraCity {
  readonly id = 'aurora-city';
  readonly name = 'Aurora City';
  readonly group: THREE.Group;
  private readonly context: CityContext;
  private detailScale = 1;

  constructor(options: AuroraCityOptions) {
    const ctx = new CityContext(options);
    this.context = ctx;
    this.group = ctx.root;

    const props = new Props(ctx);
    buildCentralPlaza(ctx, props);
    buildBuildings(ctx, props, BUILDINGS);
    buildParks(ctx, props);
    buildLandscape(ctx, props, options.beds);
    this.buildStation(ctx);
    this.buildDoors(ctx);
    props.finalize();
    // Aurora não tem nenhuma área proibida declarada hoje, e por isso
    // esta chamada não faz nada. Ela fica aqui mesmo assim: o dia em
    // que uma estrutura de Aurora precisar ser fechada, basta
    // declará-la em `keepOutsFor` — nenhuma linha de código a mais.
    ctx.sealKeepOuts(keepOutsFor(this.id));
  }

  /**
   * Portas dos prédios que têm interior construído.
   *
   * A posição vem do próprio lote: a porta fica na face voltada para a
   * praça, que é de onde todo mundo chega. Um interior novo declarado
   * em `Interior.ts` ganha porta sozinho.
   */
  /**
   * Estação do Éden, na praça central.
   *
   * Terceiro pilar do mesmo anel do holomapa e do painel de eventos —
   * 157,5°, raio 21,5 — para a praça continuar simétrica.
   */
  private buildStation(ctx: CityContext): void {
    const angle = (157.5 * Math.PI) / 180;
    const x = Math.cos(angle) * 21.5;
    const z = Math.sin(angle) * 21.5;
    buildTravelStation(ctx, { id: 'estacao-aurora', name: 'Estação do Éden · Aurora City', x, z, color: 0x8fe6ff });
  }

  private buildDoors(ctx: CityContext): void {
    for (const interior of interiorsInRegion('aurora-city')) {
      const lot = BUILDINGS.find((candidate) => candidate.id === interior.placeId);
      if (!lot) continue;
      // Virada para o centro da cidade.
      const angle = Math.atan2(-lot.z, -lot.x);
      const x = lot.x + Math.cos(angle) * (lot.radius + 1.6);
      const z = lot.z + Math.sin(angle) * (lot.radius + 1.6);
      const y = ctx.ground(x, z);
      ctx.addInteractable({
        id: `porta:${interior.id}`,
        name: interior.name,
        action: 'Entrar',
        x,
        y: y + 1,
        z,
        range: 3.2,
        payload: { type: 'porta', interiorId: interior.id, exit: { regionId: 'aurora-city', x, z, heading: angle } },
      });
      ctx.lightSpots.push({ x, y: y + 1.2, z, radius: 9, color: 0xa6ffe4 });
    }
  }

  get interactables(): readonly Interactable[] {
    return this.context.interactables;
  }

  get portals(): readonly PortalStation[] {
    return this.context.portals;
  }

  get collectibles(): readonly CollectibleSpot[] {
    return this.context.collectibles;
  }

  get jets(): readonly JetEmitter[] {
    return this.context.jets;
  }

  get waterSounds(): readonly WaterSoundSource[] {
    return this.context.waterSounds;
  }

  get lightSpots(): readonly LightSpot[] {
    return this.context.lightSpots;
  }

  get sphere(): SphereController | null {
    return this.context.sphere;
  }

  /** Multiplicador de distância dos detalhes (perfil de qualidade). */
  setDetailScale(scale: number): void {
    this.detailScale = scale;
  }

  update(frame: CityFrame): void {
    for (const animator of this.context.animators) animator(frame);
    const { x, z } = frame.cameraPosition;
    for (const detail of this.context.detailGroups) {
      detail.group.visible = Math.hypot(detail.x - x, detail.z - z) < detail.distance * this.detailScale;
    }
  }

  dispose(): void {
    // Materiais compartilhados pertencem à MaterialLibrary: libera apenas as geometrias.
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const item of this.context.disposables) item.dispose();
    this.group.clear();
    this.group.removeFromParent();
  }
}
