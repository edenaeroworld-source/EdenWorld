import * as THREE from 'three';
import type { Interactable, InteractionPayload } from '../../interactions/Interactable';
import type { PhysicsWorld } from '../../physics/PhysicsWorld';
import { GeometryBatcher } from '../../utils/geometry';
import { type Rng, createRng } from '../../utils/math';
import type { AtmosphereState } from '../../world/Atmosphere';
import type { HeightField } from '../../world/HeightField';
import type { KeepOutZone } from '../../world/KeepOut';
import type { MaterialLibrary } from '../../world/Materials';
import type { Vegetation } from '../../world/Vegetation';
import { Zone, type ZoneMap } from '../../world/ZoneMap';

/** Estado por quadro entregue aos elementos animados da cidade. */
export interface CityFrame {
  dt: number;
  elapsed: number;
  atmosphere: AtmosphereState;
  cameraPosition: THREE.Vector3;
}

export type CityAnimator = (frame: CityFrame) => void;

/** Emissor de jato de água (fontes): partículas balísticas. */
export interface JetEmitter {
  x: number;
  y: number;
  z: number;
  /** Velocidade inicial média. */
  vx: number;
  vy: number;
  vz: number;
  /** Variação aleatória da velocidade (0–1). */
  spread: number;
  /** Quantidade de partículas. */
  count: number;
  size: number;
}

/** Fonte sonora de água (para o áudio ambiente por proximidade). */
export interface WaterSoundSource {
  x: number;
  z: number;
  /** Raio em que o som é audível. */
  radius: number;
  /** Volume relativo (0–1). */
  gain: number;
}

/** Ponto de luz decorativo (poste, cristal): gera um halo de luz no chão à noite. */
export interface LightSpot {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: number;
}

/** Cristal de Luz colecionável. */
export interface CollectibleSpot {
  id: string;
  x: number;
  y: number;
  z: number;
  hint: string;
}

export interface PortalStation {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Direção para a qual o jogador sai do portal. */
  heading: number;
}

/** Controle da Esfera Aurora (praça central). */
export interface SphereController {
  readonly center: THREE.Vector3;
  /** Índice do modo de cor atual. */
  readonly mode: number;
  /** Avança para o próximo modo de cor e retorna seu nome. */
  cycleMode(): string;
  setMode(index: number): void;
  /** Dispara um pulso de luz. */
  pulse(): void;
}

export interface CityContextOptions {
  materials: MaterialLibrary;
  physics: PhysicsWorld;
  heightField: HeightField;
  zones: ZoneMap;
  vegetation: Vegetation;
}

/**
 * Contexto compartilhado pelos construtores de Aurora City: materiais,
 * física, vegetação e os registros do que foi criado (interativos,
 * animações, emissores, luzes, portais, colecionáveis).
 */
export class CityContext {
  readonly materials: MaterialLibrary;
  readonly physics: PhysicsWorld;
  readonly heightField: HeightField;
  readonly zones: ZoneMap;
  readonly vegetation: Vegetation;
  readonly root = new THREE.Group();
  readonly rng: Rng = createRng(2026);

  readonly interactables: Interactable[] = [];
  readonly animators: CityAnimator[] = [];
  readonly jets: JetEmitter[] = [];
  readonly waterSounds: WaterSoundSource[] = [];
  readonly lightSpots: LightSpot[] = [];
  readonly collectibles: CollectibleSpot[] = [];
  readonly portals: PortalStation[] = [];
  /** Grupos de detalhe ocultados à distância (LOD simples). */
  readonly detailGroups: { group: THREE.Object3D; x: number; z: number; distance: number }[] = [];
  /** Recursos criados fora dos lotes (liberados em dispose). */
  readonly disposables: { dispose(): void }[] = [];
  sphere: SphereController | null = null;

  constructor(options: CityContextOptions) {
    this.materials = options.materials;
    this.physics = options.physics;
    this.heightField = options.heightField;
    this.zones = options.zones;
    this.vegetation = options.vegetation;
    this.root.name = 'AuroraCity';
  }

  /** Altura do terreno no ponto. */
  ground(x: number, z: number): number {
    return this.heightField.getHeight(x, z);
  }

  /** Reserva uma área circular: a vegetação aleatória não cresce ali. */
  reserve(x: number, z: number, radius: number): void {
    this.zones.stampCircle(x, z, radius, Zone.Reserved);
  }

  /**
   * Fecha as áreas proibidas desta região com barreiras invisíveis.
   *
   * Uma única chamada por região, no fim da construção: tudo o que a
   * região tiver declarado em `keepOutsFor` vira colisor sólido. Quem
   * não declarou nada não paga nada.
   *
   * A barreira é **a estrutura inteira**, não um anel em volta dela:
   * o disco maciço é o que garante que não há fresta nem abertura por
   * onde entrar, que é o pedido. Nada de geometria é criado — o
   * colisor não tem malha, então a estrutura continua exatamente com
   * a aparência que tinha.
   *
   * A altura vem do terreno **medido**, não do centro: o chão do
   * roseiral é em terraços e sobe para dentro. Mede-se o ponto mais
   * baixo e o mais alto sob o disco, enterra-se a base dois metros
   * abaixo do mais baixo (para não sobrar um vão por onde escorregar)
   * e leva-se o topo a `zone.height` acima do mais alto.
   */
  sealKeepOuts(zones: readonly KeepOutZone[]): void {
    for (const zone of zones) {
      let lowest = Infinity;
      let highest = -Infinity;
      // Centro mais quatro anéis de oito amostras: o bastante para
      // acompanhar um terraço sem transformar isto num laço caro.
      for (const ring of [0, 0.25, 0.5, 0.75, 1]) {
        const samples = ring === 0 ? 1 : 8;
        for (let i = 0; i < samples; i += 1) {
          const angle = (i / samples) * Math.PI * 2;
          const y = this.ground(zone.x + Math.cos(angle) * zone.radius * ring, zone.z + Math.sin(angle) * zone.radius * ring);
          lowest = Math.min(lowest, y);
          highest = Math.max(highest, y);
        }
      }
      this.physics.addCylinder({
        x: zone.x,
        z: zone.z,
        radius: zone.radius,
        yMin: lowest - 2,
        yMax: highest + zone.height,
        // Sólido e **não caminhável**: não se entra por baixo nem se
        // fica de pé em cima. Um topo caminhável transformaria a
        // barreira num pedestal, e subir nela também é entrar.
        solid: true,
        walkable: false,
        surface: 'stone',
        tag: `keep-out:${zone.id}`,
      });
    }
  }

  /** Cria um lote de geometria estática; chame `commit` ao terminar. */
  batch(): GeometryBatcher {
    return new GeometryBatcher();
  }

  /** Funde o lote e o adiciona à cidade. */
  commit(batcher: GeometryBatcher, name: string, options: { castShadow?: boolean; receiveShadow?: boolean; parent?: THREE.Object3D } = {}): THREE.Group {
    const group = batcher.build(name, { castShadow: options.castShadow ?? true, receiveShadow: options.receiveShadow ?? true });
    (options.parent ?? this.root).add(group);
    return group;
  }

  /** Registra um grupo de detalhes que some além de `distance` metros (ajustado pela qualidade). */
  addDetailGroup(group: THREE.Object3D, x: number, z: number, distance: number): void {
    this.detailGroups.push({ group, x, z, distance });
  }

  addInteractable(spec: {
    id: string;
    name: string;
    action: string;
    x: number;
    y: number;
    z: number;
    range?: number;
    cooldown?: number;
    payload: InteractionPayload;
  }): Interactable {
    const interactable: Interactable = {
      id: spec.id,
      name: spec.name,
      action: spec.action,
      position: new THREE.Vector3(spec.x, spec.y, spec.z),
      range: spec.range ?? 2.6,
      enabled: true,
      payload: spec.payload,
      cooldown: spec.cooldown,
    };
    this.interactables.push(interactable);
    return interactable;
  }

  animate(animator: CityAnimator): void {
    this.animators.push(animator);
  }
}
