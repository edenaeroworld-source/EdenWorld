/**
 * As peças com que um interior é construído.
 *
 * Antes deste módulo, a geometria de interior era um `switch` sobre o
 * tipo de móvel: todo "sentar" virava o mesmo banco, em todo prédio.
 * Cinco ambientes construídos assim seriam a mesma sala cinco vezes.
 *
 * Aqui estão as peças reaproveitáveis — piso, parede, teto, porta,
 * janela, móvel, luz, decoração e colisão — e o contexto que as
 * posiciona. Cada ambiente combina as mesmas peças de um jeito
 * diferente, que é como prédios de verdade são feitos.
 *
 * **Coordenadas locais.** Quem decora pensa em metros a partir do
 * canto do prédio: `(0, 0)` é o canto, `x` cresce para leste, `z` para
 * o sul. A conversão para o mundo (que fica a 4 km dali) acontece
 * aqui dentro, uma vez só.
 *
 * **Direção.** Uma peça é desenhada de frente para +Z e depois girada
 * por `yaw`. Assim um balcão, um sofá ou uma geladeira podem ser
 * encostados em qualquer parede sem reescrever a peça.
 */

import * as THREE from 'three';
import type { Interactable } from '../interactions/Interactable';
import type { Collider, SurfaceType } from '../physics/Collision';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { GeometryBatcher } from '../utils/geometry';
import type { InteriorPalette } from './InteriorPalette';

/** Pé-direito de um andar, em metros. */
export const FLOOR_HEIGHT = 3.4;
/** Espessura das paredes. */
export const WALL_THICKNESS = 0.22;
/** Largura livre de uma porta interna. */
export const DOOR_WIDTH = 1.6;
/** Altura de uma porta interna. */
export const DOOR_HEIGHT = 2.35;

/** Um retângulo em planta, em coordenadas locais. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface InteriorBuildOptions {
  origin: { x: number; z: number };
  palette: InteriorPalette;
  physics: PhysicsWorld;
  /** Altura do piso deste andar. */
  baseY: number;
  /** Prefixo das etiquetas de colisão, para rastrear o que é de quem. */
  tag: string;
}

/**
 * Uma peça posicionada: tudo que for desenhado a partir daqui nasce
 * relativo ao ponto e à direção escolhidos.
 */
export class Placement {
  private readonly cos: number;
  private readonly sin: number;

  constructor(
    private readonly build: InteriorBuild,
    readonly x: number,
    readonly z: number,
    readonly yaw: number,
  ) {
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
  }

  /** Converte um deslocamento local da peça para coordenadas do interior. */
  local(dx: number, dz: number): { x: number; z: number } {
    return { x: this.x + dx * this.cos + dz * this.sin, z: this.z - dx * this.sin + dz * this.cos };
  }

  /** Caixa: a peça mais usada de todas. */
  box(w: number, h: number, d: number, material: THREE.Material, dx = 0, dy = 0, dz = 0, spin = 0): this {
    const at = this.local(dx, dz);
    this.build.mesh(new THREE.BoxGeometry(w, h, d), material, at.x, dy, at.z, this.yaw + spin);
    return this;
  }

  /** Cilindro: pés, canos, vasos, postes. */
  cyl(radiusTop: number, radiusBottom: number, h: number, segments: number, material: THREE.Material, dx = 0, dy = 0, dz = 0): this {
    const at = this.local(dx, dz);
    this.build.mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments), material, at.x, dy, at.z, this.yaw);
    return this;
  }

  /** Esfera: puxadores, frutas, bolhas. */
  sph(radius: number, material: THREE.Material, dx = 0, dy = 0, dz = 0, segments = 10): this {
    const at = this.local(dx, dz);
    this.build.mesh(new THREE.SphereGeometry(radius, segments, Math.max(6, segments - 2)), material, at.x, dy, at.z, this.yaw);
    return this;
  }

  /** Volume sólido: o móvel ocupa espaço e o jogador contorna. */
  solid(halfX: number, halfZ: number, height: number, suffix: string, dx = 0, dz = 0, yMin = 0): this {
    const at = this.local(dx, dz);
    this.build.collide(at.x, at.z, halfX, halfZ, yMin, height, this.yaw, `movel:${suffix}`);
    return this;
  }

  /** Superfície pisável: degrau, estrado, palco. */
  walkable(halfX: number, halfZ: number, top: number, suffix: string, dx = 0, dz = 0, surface: SurfaceType = 'stone'): this {
    const at = this.local(dx, dz);
    this.build.step(at.x, at.z, halfX, halfZ, top, this.yaw, suffix, surface);
    return this;
  }

  /** Ponto de luz da peça (abajur, vitrine, geladeira aberta). */
  lamp(color: number, intensity: number, distance: number, dx = 0, dy = 1.6, dz = 0): this {
    const at = this.local(dx, dz);
    this.build.light(at.x, dy, at.z, color, intensity, distance);
    return this;
  }
}

/**
 * O canteiro de obras de um andar.
 *
 * Acumula geometria num único batcher (uma malha por material, o que
 * mantém as chamadas de desenho baixas), registra colisão na física e
 * junta luzes e interativos para quem chamou.
 */
export class InteriorBuild {
  readonly batch = new GeometryBatcher();
  readonly palette: InteriorPalette;
  readonly colliders: Collider[] = [];
  readonly lights: THREE.Light[] = [];
  readonly interactables: Interactable[] = [];
  readonly baseY: number;
  private readonly origin: { x: number; z: number };
  private readonly physics: PhysicsWorld;
  private readonly tag: string;

  constructor(options: InteriorBuildOptions) {
    this.origin = options.origin;
    this.palette = options.palette;
    this.physics = options.physics;
    this.baseY = options.baseY;
    this.tag = options.tag;
  }

  /** Coordenada local → mundo. */
  worldX(x: number): number {
    return this.origin.x + x;
  }

  worldZ(z: number): number {
    return this.origin.z + z;
  }

  worldY(y: number): number {
    return this.baseY + y;
  }

  /** Começa uma peça em (x, z) virada para `yaw`. */
  at(x: number, z: number, yaw = 0): Placement {
    return new Placement(this, x, z, yaw);
  }

  /* ------------------------- peças elementares ------------------------- */

  /** Põe uma geometria no lote. `x`/`z` locais, `y` relativo ao piso. */
  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, yaw = 0): void {
    const matrix = new THREE.Matrix4().makeRotationY(yaw);
    matrix.setPosition(this.worldX(x), this.worldY(y), this.worldZ(z));
    this.batch.add(geometry, material, matrix);
  }

  /** `InteriorCollision`: volume sólido que barra o jogador. */
  collide(x: number, z: number, halfX: number, halfZ: number, yMin: number, yMax: number, yaw: number, suffix: string): void {
    this.colliders.push(
      this.physics.addBox({
        x: this.worldX(x),
        z: this.worldZ(z),
        halfX,
        halfZ,
        rotation: yaw,
        yMin: this.worldY(yMin),
        yMax: this.worldY(yMax),
        walkable: false,
        blocksCamera: false,
        tag: `${this.tag}:${suffix}`,
      }),
    );
  }

  /** `InteriorCollision`: superfície em que se pisa. */
  step(x: number, z: number, halfX: number, halfZ: number, top: number, yaw: number, suffix: string, surface: SurfaceType = 'stone'): void {
    const topY = this.worldY(top);
    this.colliders.push(
      this.physics.addBox({
        x: this.worldX(x),
        z: this.worldZ(z),
        halfX,
        halfZ,
        rotation: yaw,
        yMin: topY - 0.4,
        yMax: topY,
        walkable: true,
        solid: false,
        blocksCamera: false,
        surface,
        topAt: () => topY,
        tag: `${this.tag}:${suffix}`,
      }),
    );
  }

  /** `InteriorLighting`: um ponto de luz. */
  light(x: number, y: number, z: number, color: number, intensity: number, distance: number): THREE.PointLight {
    const lamp = new THREE.PointLight(color, intensity, distance, 1.8);
    lamp.position.set(this.worldX(x), this.worldY(y), this.worldZ(z));
    this.lights.push(lamp);
    return lamp;
  }

  /** Registra algo com que dá para interagir. */
  interact(item: Omit<Interactable, 'position'> & { x: number; y: number; z: number }): void {
    const { x, y, z, ...rest } = item;
    this.interactables.push({ ...rest, position: new THREE.Vector3(this.worldX(x), this.worldY(y), this.worldZ(z)) });
  }

  /* ------------------------ componentes do prédio ---------------------- */

  /**
   * `InteriorFloor`: laje pisável com acabamento.
   *
   * O piso é uma laje só por retângulo, e o colisor cobre **todo** o
   * retângulo. É o que garante que não exista buraco entre dois
   * cômodos — o antigo motivo de o jogador despencar para o relevo.
   */
  floor(rect: Rect, material: THREE.Material, surface: SurfaceType = 'stone', suffix = 'piso'): void {
    const cx = rect.x + rect.w / 2;
    const cz = rect.z + rect.d / 2;
    this.mesh(new THREE.BoxGeometry(rect.w, 0.2, rect.d), material, cx, -0.1, cz);
    this.step(cx, cz, rect.w / 2, rect.d / 2, 0, 0, suffix, surface);
  }

  /**
   * `InteriorCeiling`: forro com uma leve sanca de luz na borda.
   *
   * Em andar que tem outro por cima, `panel: false` dispensa o forro —
   * a laje de cima já é o teto, e duas superfícies no mesmo plano
   * brigariam por profundidade.
   */
  ceiling(rect: Rect, options: { height?: number; cove?: boolean; panel?: boolean } = {}): void {
    const height = options.height ?? FLOOR_HEIGHT;
    const cove = options.cove ?? true;
    const cx = rect.x + rect.w / 2;
    const cz = rect.z + rect.d / 2;
    if (options.panel !== false) {
      this.mesh(new THREE.BoxGeometry(rect.w, 0.18, rect.d), this.palette.ceiling, cx, height + 0.09, cz);
    }
    if (!cove) return;
    // Sanca: a faixa de luz que corre junto ao teto. É a assinatura
    // visual dos interiores do Éden e custa quatro caixas.
    const inset = 0.25;
    for (const [w, d, dx, dz] of [
      [rect.w - inset * 2, 0.12, 0, -rect.d / 2 + inset],
      [rect.w - inset * 2, 0.12, 0, rect.d / 2 - inset],
      [0.12, rect.d - inset * 2, -rect.w / 2 + inset, 0],
      [0.12, rect.d - inset * 2, rect.w / 2 - inset, 0],
    ] as const) {
      this.mesh(new THREE.BoxGeometry(w, 0.07, d), this.palette.neonAqua, cx + dx, height - 0.14, cz + dz);
    }
  }

  /**
   * `InteriorWall`: parede sólida entre dois pontos.
   *
   * Aceita um vão (`gap`) para virar porta ou passagem: a parede é
   * construída em dois trechos com uma verga por cima, e a colisão
   * acompanha — o buraco é atravessável de verdade.
   */
  wall(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    options: { height?: number; material?: THREE.Material; gap?: { at: number; width: number }; suffix?: string } = {},
  ): void {
    const height = options.height ?? FLOOR_HEIGHT;
    const material = options.material ?? this.palette.wall;
    const suffix = options.suffix ?? 'parede';
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return;
    const yaw = Math.atan2(-dz, dx);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;

    const segment = (offset: number, span: number, from = 0, to = height): void => {
      if (span <= 0.01 || to - from <= 0.01) return;
      const along = offset + span / 2 - length / 2;
      const px = cx + Math.cos(yaw) * along;
      const pz = cz - Math.sin(yaw) * along;
      this.mesh(new THREE.BoxGeometry(span, to - from, WALL_THICKNESS), material, px, (from + to) / 2, pz, yaw);
      if (from < 0.05) this.collide(px, pz, span / 2, WALL_THICKNESS / 2, from, to, yaw, suffix);
    };

    if (!options.gap) {
      segment(0, length);
      return;
    }
    const half = options.gap.width / 2;
    const start = Math.max(0, options.gap.at - half);
    const end = Math.min(length, options.gap.at + half);
    segment(0, start);
    segment(end, length - end);
    // Verga sobre o vão: fecha o buraco visualmente sem fechar a passagem.
    const lintel = end - start;
    if (lintel > 0.01 && height > DOOR_HEIGHT) {
      const along = start + lintel / 2 - length / 2;
      const px = cx + Math.cos(yaw) * along;
      const pz = cz - Math.sin(yaw) * along;
      this.mesh(new THREE.BoxGeometry(lintel, height - DOOR_HEIGHT, WALL_THICKNESS), material, px, (DOOR_HEIGHT + height) / 2, pz, yaw);
      // Batente iluminado, para a passagem ser legível de longe.
      this.mesh(new THREE.BoxGeometry(lintel, 0.06, WALL_THICKNESS + 0.04), this.palette.neonAqua, px, DOOR_HEIGHT - 0.04, pz, yaw);
    }
  }

  /**
   * `InteriorWindow`: janela de vidro num trecho de parede.
   *
   * Vidro do peitoril para cima, parede embaixo, moldura em volta. A
   * colisão vai do chão ao teto: vidro é parede, não buraco.
   */
  window(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    options: { sill?: number; top?: number; height?: number; suffix?: string } = {},
  ): void {
    const sill = options.sill ?? 0.95;
    const topY = options.top ?? FLOOR_HEIGHT - 0.5;
    const height = options.height ?? FLOOR_HEIGHT;
    const suffix = options.suffix ?? 'janela';
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return;
    const yaw = Math.atan2(-dz, dx);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;

    // Peitoril, vidro e bandeira acima.
    this.mesh(new THREE.BoxGeometry(length, sill, WALL_THICKNESS), this.palette.wall, cx, sill / 2, cz, yaw);
    this.mesh(new THREE.BoxGeometry(length, topY - sill, WALL_THICKNESS * 0.5), this.palette.window, cx, (sill + topY) / 2, cz, yaw);
    if (height > topY) {
      this.mesh(new THREE.BoxGeometry(length, height - topY, WALL_THICKNESS), this.palette.wall, cx, (topY + height) / 2, cz, yaw);
    }
    // Moldura: peitoril saliente e montantes.
    this.mesh(new THREE.BoxGeometry(length, 0.1, WALL_THICKNESS + 0.16), this.palette.trim, cx, sill, cz, yaw);
    this.mesh(new THREE.BoxGeometry(length, 0.08, WALL_THICKNESS + 0.1), this.palette.trim, cx, topY, cz, yaw);
    const mullions = Math.max(1, Math.round(length / 1.8));
    for (let i = 1; i < mullions; i += 1) {
      const along = (i / mullions) * length - length / 2;
      this.mesh(
        new THREE.BoxGeometry(0.07, topY - sill, WALL_THICKNESS + 0.08),
        this.palette.trim,
        cx + Math.cos(yaw) * along,
        (sill + topY) / 2,
        cz - Math.sin(yaw) * along,
        yaw,
      );
    }
    this.collide(cx, cz, length / 2, WALL_THICKNESS / 2, 0, height, yaw, suffix);
  }

  /** `InteriorDoor`: uma porta de vidro no vão, com moldura acesa. */
  door(x: number, z: number, yaw: number, options: { width?: number; label?: 'entrada' | 'interna' } = {}): void {
    const width = options.width ?? DOOR_WIDTH;
    const place = this.at(x, z, yaw);
    const jamb = this.palette.trim;
    place.box(0.12, DOOR_HEIGHT, 0.3, jamb, -width / 2 - 0.06, DOOR_HEIGHT / 2, 0);
    place.box(0.12, DOOR_HEIGHT, 0.3, jamb, width / 2 + 0.06, DOOR_HEIGHT / 2, 0);
    place.box(width + 0.24, 0.14, 0.3, jamb, 0, DOOR_HEIGHT + 0.07, 0);
    // Duas folhas de vidro, entreabertas: dá para ver que é porta.
    place.box(width / 2 - 0.06, DOOR_HEIGHT - 0.12, 0.08, this.palette.glass, -width / 4 - 0.03, DOOR_HEIGHT / 2 - 0.06, 0.04);
    place.box(width / 2 - 0.06, DOOR_HEIGHT - 0.12, 0.08, this.palette.glass, width / 4 + 0.03, DOOR_HEIGHT / 2 - 0.06, -0.04);
    place.box(width + 0.24, 0.07, 0.1, this.palette.neonAqua, 0, DOOR_HEIGHT + 0.16, 0.12);
    if (options.label === 'entrada') {
      // Tapete de entrada: marca o ponto de saída no chão.
      place.box(width + 1, 0.03, 1.2, this.palette.carpet, 0, 0.015, 0.8);
    }
  }

  /** Entrega o que foi construído como uma única malha agrupada. */
  finish(name: string): THREE.Group {
    return this.batch.build(name, { castShadow: true, receiveShadow: true });
  }
}
