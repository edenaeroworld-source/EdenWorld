/**
 * A camada que faltava: geometria de verdade dentro dos prédios.
 *
 * `InteriorManager` sempre soube entrar, sair e garantir que só um
 * interior esteja carregado. O que nunca existiu foi quem construísse
 * a cena. Este módulo é esse `InteriorLoader`.
 *
 * É **genérico de propósito**: lê `InteriorDef` — cômodos, móveis,
 * iluminação, moradores — e monta piso, paredes, teto, portas, luzes,
 * colisão e móveis interativos a partir dos dados. Um interior novo
 * passa a existir só por ser declarado; não precisa de código novo.
 *
 * Coordenadas: o interior é montado num canto do mundo bem longe do
 * exterior (`INTERIOR_ORIGIN`), e a câmera é levada até lá. É mais
 * simples e mais seguro do que descarregar o exterior — e, como o
 * exterior fica oculto, não custa quadro nenhum.
 */

import * as THREE from 'three';
import type { Interactable, InteractionPayload } from '../interactions/Interactable';
import type { Collider } from '../physics/Collision';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { GeometryBatcher } from '../utils/geometry';
import { createRng, randRange } from '../utils/math';
import type { MaterialLibrary } from '../world/Materials';

/**
 * Os materiais de que um interior precisa.
 *
 * É um recorte da biblioteca do mundo, e não a biblioteca inteira, por
 * um motivo prático: assim esta camada pode ser montada e medida em
 * teste sem precisar de um canvas com contexto 2D.
 */
export type InteriorMaterials = Pick<MaterialLibrary, 'wood' | 'stone' | 'white' | 'facade' | 'glass' | 'crystal' | 'metal'>;
import type { InteriorDef, InteriorProp, InteriorRoom } from './Interior';
import { roomsOnFloor } from './Interior';
import type { InteriorLoader } from './InteriorManager';

/** Onde os interiores são montados, longe de qualquer terreno. */
export const INTERIOR_ORIGIN = { x: 4000, z: 4000 };

/** Altura livre de um andar e espessura das paredes. */
const FLOOR_HEIGHT = 3.4;
const WALL = 0.22;

/** Cor e intensidade de cada clima de iluminação. */
const LIGHTING: Record<InteriorDef['lighting'], { color: number; intensity: number; ambient: number }> = {
  quente: { color: 0xffd9a6, intensity: 1.5, ambient: 0.55 },
  fria: { color: 0xcfe8ff, intensity: 1.4, ambient: 0.6 },
  neon: { color: 0xff7ad9, intensity: 1.8, ambient: 0.4 },
  natural: { color: 0xffffff, intensity: 1.2, ambient: 0.85 },
  penumbra: { color: 0xffc98f, intensity: 0.9, ambient: 0.28 },
};

/** Verbo mostrado no HUD para cada tipo de móvel. */
const ACTION_LABEL: Record<InteriorProp['action'], string> = {
  sentar: 'Sentar',
  olhar: 'Examinar',
  comprar: 'Comprar',
  conversar: 'Conversar',
  usar: 'Usar',
  subir: 'Subir',
  descer: 'Descer',
};

export interface InteriorSceneOptions {
  scene: THREE.Scene;
  materials: InteriorMaterials;
  physics: PhysicsWorld;
  /** Chamado quando a cena muda, para o motor reapontar os interativos. */
  onInteractables: (items: readonly Interactable[]) => void;
  /** Resolve o id de um morador no interativo de conversa correspondente. */
  resolvePerson?: (residentId: string, prop: InteriorProp) => { personId: string; divino: boolean } | null;
}

/** Onde o jogador nasce dentro do interior, já em coordenadas do mundo. */
export interface InteriorSpawn {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/**
 * Constrói e destrói a cena de um interior.
 *
 * Implementa `InteriorLoader`, então é só entregá-lo ao
 * `InteriorManager.setLoader` e as portas passam a levar a algum
 * lugar.
 */
export class InteriorScene implements InteriorLoader {
  readonly group = new THREE.Group();
  private readonly options: InteriorSceneOptions;
  private readonly interactables: Interactable[] = [];
  private readonly colliders: Collider[] = [];
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly lights: THREE.Light[] = [];
  private readonly ownMaterials: THREE.Material[] = [];
  private current: InteriorDef | null = null;
  private spawn: InteriorSpawn | null = null;
  private floorY = 0;

  constructor(options: InteriorSceneOptions) {
    this.options = options;
    this.group.name = 'Interior';
    this.group.visible = false;
    options.scene.add(this.group);
  }

  get active(): InteriorDef | null {
    return this.current;
  }

  /** O que dá para fazer lá dentro. */
  get items(): readonly Interactable[] {
    return this.interactables;
  }

  /** Onde o jogador aparece ao entrar (coordenadas do mundo). */
  get spawnPoint(): InteriorSpawn | null {
    return this.spawn;
  }

  /** Altura do piso do interior ativo. */
  get groundY(): number {
    return this.floorY;
  }

  load(interior: InteriorDef): void {
    // Garantia dura: nunca dois ao mesmo tempo, mesmo que alguém chame
    // `load` duas vezes seguidas sem passar pelo manager.
    if (this.current) this.unload(this.current);
    this.current = interior;

    const origin = INTERIOR_ORIGIN;
    const light = LIGHTING[interior.lighting];
    this.floorY = 0;

    const batch = new GeometryBatcher();
    const rooms = roomsOnFloor(interior, 0);
    const bounds = boundsOf(rooms);

    for (const room of rooms) this.buildRoom(batch, room, origin, interior);

    // Porta de saída: um vão no muro externo, junto ao ponto de entrada.
    const spawnX = origin.x + interior.spawn.x;
    const spawnZ = origin.z + interior.spawn.z;
    this.spawn = { x: spawnX, y: this.floorY, z: spawnZ, heading: interior.spawn.heading };
    this.buildDoor(batch, spawnX, spawnZ, interior);

    const built = batch.build(`interior:${interior.id}`, { castShadow: true, receiveShadow: true });
    this.group.add(built);
    built.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) this.geometries.add(mesh.geometry);
    });

    // Luzes: uma ambiente e uma por cômodo.
    const ambient = new THREE.HemisphereLight(light.color, 0x404048, light.ambient * 2);
    ambient.position.set(origin.x + bounds.cx, this.floorY + FLOOR_HEIGHT, origin.z + bounds.cz);
    this.group.add(ambient);
    this.lights.push(ambient);
    for (const room of rooms) {
      const lamp = new THREE.PointLight(light.color, light.intensity * 6, Math.max(room.w, room.d) * 1.6, 1.8);
      lamp.position.set(origin.x + room.x + room.w / 2, this.floorY + FLOOR_HEIGHT - 0.5, origin.z + room.z + room.d / 2);
      this.group.add(lamp);
      this.lights.push(lamp);
    }

    // Móveis: geometria, colisão e interação.
    for (const prop of interior.props) {
      if (prop.floor !== 0) continue;
      this.buildProp(prop, origin, interior);
    }

    // Andares de cima: uma escada e o aviso honesto de que o andar
    // existe nos dados. Subir troca o andar no manager.
    if (interior.floors > 1) this.buildStairs(bounds, origin, interior);

    this.group.visible = true;
    this.options.onInteractables(this.interactables);
  }

  unload(_interior: InteriorDef): void {
    this.group.visible = false;
    for (const id of this.colliders) this.options.physics.remove(id);
    this.colliders.length = 0;
    for (const light of this.lights) {
      light.removeFromParent();
      light.dispose?.();
    }
    this.lights.length = 0;
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear();
    for (const material of this.ownMaterials) material.dispose();
    this.ownMaterials.length = 0;
    this.group.clear();
    this.interactables.length = 0;
    this.current = null;
    this.spawn = null;
    this.options.onInteractables(this.interactables);
  }

  dispose(): void {
    if (this.current) this.unload(this.current);
    this.group.removeFromParent();
  }

  /* ------------------------------- cômodos ------------------------------ */

  private buildRoom(batch: GeometryBatcher, room: InteriorRoom, origin: { x: number; z: number }, interior: InteriorDef): void {
    const materials = this.options.materials;
    const x0 = origin.x + room.x;
    const z0 = origin.z + room.z;
    const cx = x0 + room.w / 2;
    const cz = z0 + room.d / 2;
    const top = this.floorY + FLOOR_HEIGHT;

    // Piso.
    const floor = new THREE.BoxGeometry(room.w, 0.2, room.d);
    batch.add(floor, interior.category === 'casa' ? materials.wood : materials.stone, new THREE.Matrix4().makeTranslation(cx, this.floorY - 0.1, cz));
    this.colliders.push(
      this.options.physics.addBox({
        x: cx,
        z: cz,
        halfX: room.w / 2,
        halfZ: room.d / 2,
        yMin: this.floorY - 0.2,
        yMax: this.floorY,
        walkable: true,
        solid: false,
        blocksCamera: false,
        surface: interior.category === 'casa' ? 'wood' : 'stone',
        topAt: () => this.floorY,
        tag: `interior:piso:${room.id}`,
      }),
    );

    // Teto.
    const ceiling = new THREE.BoxGeometry(room.w, 0.18, room.d);
    batch.add(ceiling, materials.white, new THREE.Matrix4().makeTranslation(cx, top, cz));

    // Paredes: quatro, cada uma com vidro na metade de cima quando a
    // iluminação é natural (estufa, viveiro) — é o Frutiger Aero.
    const glassy = interior.lighting === 'natural';
    const sides: { x: number; z: number; w: number; d: number }[] = [
      { x: cx, z: z0 - WALL / 2, w: room.w + WALL * 2, d: WALL },
      { x: cx, z: z0 + room.d + WALL / 2, w: room.w + WALL * 2, d: WALL },
      { x: x0 - WALL / 2, z: cz, w: WALL, d: room.d },
      { x: x0 + room.w + WALL / 2, z: cz, w: WALL, d: room.d },
    ];
    for (const side of sides) {
      // Não erguer parede onde outro cômodo encosta: senão os cômodos
      // ficam incomunicáveis e o interior vira um conjunto de caixas.
      if (this.touchesAnotherRoom(side, room, interior, origin)) continue;
      const lower = new THREE.BoxGeometry(side.w, glassy ? FLOOR_HEIGHT * 0.45 : FLOOR_HEIGHT, side.d);
      batch.add(lower, materials.facade, new THREE.Matrix4().makeTranslation(side.x, this.floorY + (glassy ? FLOOR_HEIGHT * 0.225 : FLOOR_HEIGHT / 2), side.z));
      if (glassy) {
        const upper = new THREE.BoxGeometry(side.w, FLOOR_HEIGHT * 0.55, side.d);
        batch.add(upper, materials.glass, new THREE.Matrix4().makeTranslation(side.x, this.floorY + FLOOR_HEIGHT * 0.725, side.z));
      }
      this.colliders.push(
        this.options.physics.addBox({
          x: side.x,
          z: side.z,
          halfX: side.w / 2,
          halfZ: side.d / 2,
          yMin: this.floorY,
          yMax: top,
          walkable: false,
          tag: `interior:parede:${room.id}`,
        }),
      );
    }

    // Rodapé de luz: a assinatura visual dos interiores do Éden.
    const strip = new THREE.BoxGeometry(room.w - 0.4, 0.06, 0.08);
    batch.add(strip, materials.crystal, new THREE.Matrix4().makeTranslation(cx, this.floorY + 0.12, z0 + 0.2));
  }

  /** Há outro cômodo encostado deste lado? */
  private touchesAnotherRoom(side: { x: number; z: number; w: number; d: number }, room: InteriorRoom, interior: InteriorDef, origin: { x: number; z: number }): boolean {
    for (const other of interior.rooms) {
      if (other === room || other.floor !== room.floor) continue;
      const ox0 = origin.x + other.x;
      const oz0 = origin.z + other.z;
      // O centro da parede cai dentro do outro cômodo (com folga)?
      if (side.x > ox0 - 0.4 && side.x < ox0 + other.w + 0.4 && side.z > oz0 - 0.4 && side.z < oz0 + other.d + 0.4) return true;
    }
    return false;
  }

  /* -------------------------------- porta ------------------------------- */

  private buildDoor(batch: GeometryBatcher, x: number, z: number, interior: InteriorDef): void {
    const materials = this.options.materials;
    const frame = new THREE.BoxGeometry(2.2, 2.6, 0.3);
    batch.add(frame, materials.crystal, new THREE.Matrix4().makeTranslation(x, this.floorY + 1.3, z));
    const glow = new THREE.BoxGeometry(1.7, 2.2, 0.12);
    batch.add(glow, materials.glass, new THREE.Matrix4().makeTranslation(x, this.floorY + 1.1, z));

    this.interactables.push({
      id: `interior:saida:${interior.id}`,
      name: interior.name,
      action: 'Sair',
      position: new THREE.Vector3(x, this.floorY + 1.2, z),
      range: 3,
      enabled: true,
      payload: { type: 'porta', interiorId: interior.id, exit: { regionId: interior.regionId, x: 0, z: 0, heading: 0 } },
    });
  }

  /* -------------------------------- móveis ------------------------------ */

  private buildProp(prop: InteriorProp, origin: { x: number; z: number }, interior: InteriorDef): void {
    const materials = this.options.materials;
    const x = origin.x + prop.x;
    const z = origin.z + prop.z;
    const rng = createRng(prop.id.length * 131 + prop.x * 7 + prop.z * 13);
    const batch = new GeometryBatcher();
    const place = (geometry: THREE.BufferGeometry, material: THREE.Material, dx: number, dy: number, dz: number): void => {
      batch.add(geometry, material, new THREE.Matrix4().makeTranslation(x + dx, this.floorY + dy, z + dz));
    };

    let height = 0.9;
    let halfX = 0.6;
    let halfZ = 0.6;

    switch (prop.action) {
      case 'sentar': {
        // Banco/sofá/cama: assento, encosto e pés.
        const wide = prop.name.toLowerCase().includes('cama') || prop.name.toLowerCase().includes('sofá');
        halfX = wide ? 1.1 : 0.7;
        halfZ = wide ? 0.95 : 0.6;
        height = 0.55;
        place(new THREE.BoxGeometry(halfX * 2, 0.22, halfZ * 2), materials.facade, 0, 0.45, 0);
        place(new THREE.BoxGeometry(halfX * 2, 0.7, 0.18), materials.wood, 0, 0.8, -halfZ + 0.12);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            place(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 8), materials.wood, sx * (halfX - 0.16), 0.21, sz * (halfZ - 0.14));
          }
        }
        break;
      }
      case 'comprar': {
        // Balcão com tampo de vidro e frente iluminada.
        halfX = 1.4;
        halfZ = 0.6;
        height = 1.1;
        place(new THREE.BoxGeometry(halfX * 2, 1.0, halfZ * 2), materials.wood, 0, 0.5, 0);
        place(new THREE.BoxGeometry(halfX * 2 + 0.2, 0.1, halfZ * 2 + 0.2), materials.glass, 0, 1.05, 0);
        place(new THREE.BoxGeometry(halfX * 2 - 0.2, 0.1, 0.06), materials.crystal, 0, 0.3, halfZ);
        break;
      }
      case 'olhar': {
        // Estante/bancada: prateleiras com miudezas.
        halfX = 1.0;
        halfZ = 0.4;
        height = 2.0;
        place(new THREE.BoxGeometry(halfX * 2, 2.0, halfZ * 2), materials.wood, 0, 1.0, 0);
        for (let i = 0; i < 3; i += 1) {
          place(new THREE.BoxGeometry(halfX * 2 - 0.1, 0.06, halfZ * 2 - 0.08), materials.white, 0, 0.5 + i * 0.5, 0.04);
          for (let k = 0; k < 4; k += 1) {
            const s = randRange(rng, 0.1, 0.2);
            place(new THREE.BoxGeometry(s, s * 2, s), materials.crystal, -halfX + 0.3 + k * 0.5, 0.6 + i * 0.5, 0.05);
          }
        }
        break;
      }
      case 'conversar': {
        // Quem atende fica num ponto marcado; a pessoa em si é um NPC.
        halfX = 0.45;
        halfZ = 0.45;
        height = 0.1;
        place(new THREE.CylinderGeometry(0.7, 0.75, 0.06, 20), materials.crystal, 0, 0.04, 0);
        break;
      }
      case 'usar': {
        halfX = 0.8;
        halfZ = 0.6;
        height = 1.2;
        place(new THREE.BoxGeometry(halfX * 2, 0.9, halfZ * 2), materials.metal, 0, 0.45, 0);
        place(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 16), materials.glass, 0, 1.15, 0);
        break;
      }
      default: {
        // Escadas declaradas nos dados.
        halfX = 0.9;
        halfZ = 1.4;
        height = 1.6;
        for (let i = 0; i < 6; i += 1) {
          place(new THREE.BoxGeometry(halfX * 2, 0.16, 0.44), materials.stone, 0, 0.16 + i * 0.26, -halfZ + 0.3 + i * 0.44);
        }
        break;
      }
    }

    const mesh = batch.build(`interior:movel:${prop.id}`, { castShadow: true, receiveShadow: true });
    mesh.traverse((object) => {
      const m = object as THREE.Mesh;
      if (m.geometry) this.geometries.add(m.geometry);
    });
    this.group.add(mesh);

    // Colisão: o móvel ocupa espaço de verdade.
    if (prop.action !== 'conversar') {
      this.colliders.push(
        this.options.physics.addBox({
          x,
          z,
          halfX,
          halfZ,
          yMin: this.floorY,
          yMax: this.floorY + height,
          walkable: false,
          blocksCamera: false,
          tag: `interior:movel:${prop.id}`,
        }),
      );
    }

    this.interactables.push({
      id: `interior:${interior.id}:${prop.id}`,
      name: prop.name,
      action: ACTION_LABEL[prop.action],
      position: new THREE.Vector3(x, this.floorY + Math.min(height, 1.3), z),
      range: 2.6,
      enabled: true,
      payload: this.payloadFor(prop, interior, x, z),
    });
  }

  private payloadFor(prop: InteriorProp, interior: InteriorDef, x: number, z: number): InteractionPayload {
    if (prop.action === 'sentar') {
      return { type: 'assento', seat: { x, y: this.floorY + 0.6, z, heading: 0 } };
    }
    if (prop.action === 'conversar') {
      const resolved = this.options.resolvePerson?.(interior.residents[0] ?? prop.id, prop);
      if (resolved) return { type: 'conversa', personId: resolved.personId, divino: resolved.divino };
    }
    return {
      type: 'placa',
      title: prop.name,
      paragraphs: [prop.note],
      entryId: `interior:${interior.id}:${prop.id}`,
    };
  }

  /* -------------------------------- escada ------------------------------ */

  private buildStairs(bounds: { cx: number; cz: number; maxX: number; maxZ: number }, origin: { x: number; z: number }, interior: InteriorDef): void {
    const materials = this.options.materials;
    const x = origin.x + bounds.maxX - 2;
    const z = origin.z + bounds.maxZ - 2;
    const batch = new GeometryBatcher();
    for (let i = 0; i < 10; i += 1) {
      const step = new THREE.BoxGeometry(1.8, 0.16, 0.4);
      batch.add(step, materials.stone, new THREE.Matrix4().makeTranslation(x, this.floorY + 0.16 + i * 0.3, z - i * 0.4));
    }
    const mesh = batch.build(`interior:escada:${interior.id}`, { castShadow: true, receiveShadow: true });
    mesh.traverse((object) => {
      const m = object as THREE.Mesh;
      if (m.geometry) this.geometries.add(m.geometry);
    });
    this.group.add(mesh);

    this.interactables.push({
      id: `interior:${interior.id}:escada`,
      name: 'Escada',
      action: 'Subir',
      position: new THREE.Vector3(x, this.floorY + 1, z),
      range: 2.8,
      enabled: true,
      payload: {
        type: 'placa',
        title: 'Escada',
        paragraphs: [`${interior.name} tem ${interior.floors} andares. Os outros ainda não têm móveis colocados — por enquanto, só o térreo está montado.`],
      },
    });
  }
}

function boundsOf(rooms: readonly InteriorRoom[]): { cx: number; cz: number; maxX: number; maxZ: number } {
  if (rooms.length === 0) return { cx: 0, cz: 0, maxX: 0, maxZ: 0 };
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const room of rooms) {
    minX = Math.min(minX, room.x);
    minZ = Math.min(minZ, room.z);
    maxX = Math.max(maxX, room.x + room.w);
    maxZ = Math.max(maxZ, room.z + room.d);
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, maxX, maxZ };
}

