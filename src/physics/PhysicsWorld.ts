import {
  type BoxCollider,
  type Collider,
  type CylinderCollider,
  type MutablePoint,
  type SurfaceType,
  colliderBounds,
  colliderTopAt,
  pushCircleOut,
  raycastCollider,
} from './Collision';

/** Fonte de altura do terreno (implementada por `Terrain`). */
export interface HeightSampler {
  getHeight(x: number, z: number): number;
  /** Tipo de superfície do terreno no ponto (para sons de passos). */
  getSurface?(x: number, z: number): SurfaceType;
}

export interface GroundInfo {
  height: number;
  surface: SurfaceType;
  /** `true` quando o apoio é um colisor (plataforma), não o terreno. */
  onPlatform: boolean;
}

export interface BoxOptions {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  rotation?: number;
  yMin: number;
  yMax: number;
  walkable?: boolean;
  solid?: boolean;
  blocksCamera?: boolean;
  surface?: SurfaceType;
  topAt?: (localX: number, localZ: number) => number;
  tag?: string;
}

export interface CylinderOptions {
  x: number;
  z: number;
  radius: number;
  innerRadius?: number;
  yMin: number;
  yMax: number;
  walkable?: boolean;
  solid?: boolean;
  blocksCamera?: boolean;
  surface?: SurfaceType;
  tag?: string;
}

const CELL_SIZE = 8;
/** Margem aplicada ao registrar colisores na grade (cobre o raio de consulta). */
const CELL_MARGIN = 1.0;
const KEY_OFFSET = 2048;
const KEY_STRIDE = 4096;

function cellKey(cx: number, cz: number): number {
  return (cx + KEY_OFFSET) * KEY_STRIDE + (cz + KEY_OFFSET);
}

/**
 * Mundo físico estático: terreno + colisores em uma grade espacial.
 * Responde a três perguntas do jogo:
 *  1. Qual é o chão sob o personagem? (`groundAt`)
 *  2. O personagem está atravessando algo? (`resolveCircle`)
 *  3. Há algo entre a câmera e o personagem? (`raycast`)
 */
export class PhysicsWorld {
  private readonly cells = new Map<number, Collider[]>();
  private readonly colliders: Collider[] = [];
  private stampCounter = 1;
  private readonly candidates: Collider[] = [];

  /** Raio do limite jogável (0 = sem limite). */
  boundaryRadius = 0;

  constructor(private heightSampler: HeightSampler) {}

  setHeightSampler(sampler: HeightSampler): void {
    this.heightSampler = sampler;
  }

  get colliderCount(): number {
    return this.colliders.length;
  }

  getColliders(): readonly Collider[] {
    return this.colliders;
  }

  addBox(options: BoxOptions): BoxCollider {
    const rotation = options.rotation ?? 0;
    const collider: BoxCollider = {
      kind: 'box',
      x: options.x,
      z: options.z,
      halfX: options.halfX,
      halfZ: options.halfZ,
      rotation,
      cos: Math.cos(rotation),
      sin: Math.sin(rotation),
      yMin: options.yMin,
      yMax: options.yMax,
      walkable: options.walkable ?? true,
      // Caixas com topo curvo (pontes, rampas) funcionam apenas como piso por padrão.
      solid: options.solid ?? !options.topAt,
      blocksCamera: options.blocksCamera ?? !options.topAt,
      surface: options.surface ?? 'stone',
      topAt: options.topAt,
      tag: options.tag,
      stamp: 0,
    };
    this.insert(collider);
    return collider;
  }

  addCylinder(options: CylinderOptions): CylinderCollider {
    const collider: CylinderCollider = {
      kind: 'cylinder',
      x: options.x,
      z: options.z,
      radius: options.radius,
      innerRadius: options.innerRadius ?? 0,
      yMin: options.yMin,
      yMax: options.yMax,
      walkable: options.walkable ?? true,
      solid: options.solid ?? true,
      blocksCamera: options.blocksCamera ?? true,
      surface: options.surface ?? 'stone',
      tag: options.tag,
      stamp: 0,
    };
    this.insert(collider);
    return collider;
  }

  remove(collider: Collider): void {
    const index = this.colliders.indexOf(collider);
    if (index >= 0) this.colliders.splice(index, 1);
    for (const list of this.cells.values()) {
      const i = list.indexOf(collider);
      if (i >= 0) list.splice(i, 1);
    }
  }

  clear(): void {
    this.cells.clear();
    this.colliders.length = 0;
  }

  private insert(collider: Collider): void {
    this.colliders.push(collider);
    const b = colliderBounds(collider);
    const minCx = Math.floor((b.minX - CELL_MARGIN) / CELL_SIZE);
    const maxCx = Math.floor((b.maxX + CELL_MARGIN) / CELL_SIZE);
    const minCz = Math.floor((b.minZ - CELL_MARGIN) / CELL_SIZE);
    const maxCz = Math.floor((b.maxZ + CELL_MARGIN) / CELL_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const key = cellKey(cx, cz);
        let list = this.cells.get(key);
        if (!list) {
          list = [];
          this.cells.set(key, list);
        }
        list.push(collider);
      }
    }
  }

  /** Reúne (sem duplicatas) os colisores das células tocadas pelo retângulo. */
  private gather(minX: number, maxX: number, minZ: number, maxZ: number): Collider[] {
    const out = this.candidates;
    out.length = 0;
    const stamp = ++this.stampCounter;
    const minCx = Math.floor(minX / CELL_SIZE);
    const maxCx = Math.floor(maxX / CELL_SIZE);
    const minCz = Math.floor(minZ / CELL_SIZE);
    const maxCz = Math.floor(maxZ / CELL_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const list = this.cells.get(cellKey(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.stamp !== stamp) {
            c.stamp = stamp;
            out.push(c);
          }
        }
      }
    }
    return out;
  }

  terrainHeight(x: number, z: number): number {
    return this.heightSampler.getHeight(x, z);
  }

  /**
   * Chão sob o ponto (x, z) para um personagem com os pés em `feetY`.
   * Só considera superfícies caminháveis cujo topo esteja até
   * `stepHeight` acima dos pés — acima disso é parede, não degrau.
   */
  groundAt(x: number, z: number, feetY: number, stepHeight: number, out: GroundInfo): GroundInfo {
    const terrain = this.heightSampler.getHeight(x, z);
    out.height = terrain;
    out.onPlatform = false;
    out.surface = this.heightSampler.getSurface ? this.heightSampler.getSurface(x, z) : 'grass';

    const list = this.cells.get(cellKey(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)));
    if (!list) return out;
    const limit = feetY + stepHeight;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.walkable) continue;
      if (c.yMin > limit) continue;
      const top = colliderTopAt(c, x, z);
      if (top === null || top > limit) continue;
      if (top > out.height) {
        out.height = top;
        out.surface = c.surface;
        out.onPlatform = true;
      }
    }
    return out;
  }

  /**
   * Resolve penetrações laterais de um círculo (personagem) contra os
   * colisores sólidos que se sobrepõem verticalmente ao corpo.
   * Retorna `true` se a posição foi corrigida.
   */
  resolveCircle(pos: MutablePoint, radius: number, feetY: number, bodyHeight: number, stepHeight: number): boolean {
    let collided = false;
    const headY = feetY + bodyHeight;
    const stepLimit = feetY + stepHeight;

    for (let iteration = 0; iteration < 3; iteration++) {
      let any = false;
      const list = this.gather(pos.x - radius, pos.x + radius, pos.z - radius, pos.z + radius);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.solid) continue;
        if (c.yMin >= headY) continue; // acima da cabeça
        if (c.walkable) {
          // Topo ao alcance de um passo: o personagem sobe em vez de colidir.
          if (c.yMax <= stepLimit) continue;
        } else if (c.yMax <= feetY) {
          continue; // totalmente abaixo dos pés
        }
        if (pushCircleOut(c, pos, radius)) any = true;
      }
      if (!any) break;
      collided = true;
    }

    if (this.boundaryRadius > 0) {
      const limit = this.boundaryRadius - radius;
      const d = Math.hypot(pos.x, pos.z);
      if (d > limit) {
        const scale = limit / d;
        pos.x *= scale;
        pos.z *= scale;
        collided = true;
      }
    }
    return collided;
  }

  /** `true` se o ponto está a menos de `margin` do limite jogável. */
  isNearBoundary(x: number, z: number, margin: number): boolean {
    return this.boundaryRadius > 0 && Math.hypot(x, z) > this.boundaryRadius - margin;
  }

  /**
   * Lança um raio contra colisores e terreno. Retorna a distância livre
   * (≤ maxDistance). Usado pela câmera de terceira pessoa.
   *
   * @param includeAll considera também colisores que não bloqueiam a câmera
   *   (postes, grades...), para testes de linha de visão.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number, includeAll = false): number {
    let best = maxDistance;
    const ex = ox + dx * maxDistance;
    const ez = oz + dz * maxDistance;
    const list = this.gather(Math.min(ox, ex), Math.max(ox, ex), Math.min(oz, ez), Math.max(oz, ez));
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!includeAll && !c.blocksCamera) continue;
      const t = raycastCollider(c, ox, oy, oz, dx, dy, dz, best);
      if (t < best) best = t;
    }

    // Terreno: marcha em passos curtos e refina por bisseção.
    const step = 0.6;
    let prevT = 0;
    for (let t = step; t <= best + step; t += step) {
      const tt = Math.min(t, best);
      const y = oy + dy * tt;
      const ground = this.heightSampler.getHeight(ox + dx * tt, oz + dz * tt);
      if (y < ground) {
        let lo = prevT;
        let hi = tt;
        for (let k = 0; k < 5; k++) {
          const mid = (lo + hi) * 0.5;
          const my = oy + dy * mid;
          const mg = this.heightSampler.getHeight(ox + dx * mid, oz + dz * mid);
          if (my < mg) hi = mid;
          else lo = mid;
        }
        best = lo;
        break;
      }
      prevT = tt;
      if (tt >= best) break;
    }
    return best;
  }
}
