/**
 * Primitivas de colisão do EDENWORLD.
 *
 * A física da Genesis 0.1 é propositalmente simples e estável:
 * o personagem é um círculo no plano XZ com uma altura, e o cenário é
 * descrito por caixas orientadas e cilindros (ou anéis) com intervalo
 * vertical. Topos "caminháveis" funcionam como pisos (degraus, pontes,
 * plataformas); o restante funciona como parede.
 *
 * Este arquivo contém apenas funções puras — sem Three.js — para que
 * possam ser testadas isoladamente.
 */

export type SurfaceType = 'grass' | 'stone' | 'glass' | 'sand' | 'wood' | 'water';

export interface ColliderBase {
  /** Base do volume no eixo Y. */
  yMin: number;
  /** Topo do volume no eixo Y (para topos curvos, o valor máximo). */
  yMax: number;
  /** O topo pode ser pisado pelo personagem. */
  walkable: boolean;
  /** Empurra o personagem lateralmente (false = funciona só como piso). */
  solid: boolean;
  /** Bloqueia a linha de visão da câmera. */
  blocksCamera: boolean;
  /** Material do topo, usado para sons de passos. */
  surface: SurfaceType;
  /** Rótulo opcional para depuração. */
  tag?: string;
  /** Uso interno do PhysicsWorld (deduplicação de consultas). */
  stamp: number;
}

export interface CylinderCollider extends ColliderBase {
  kind: 'cylinder';
  x: number;
  z: number;
  radius: number;
  /** Maior que zero cria um anel: parede circular com interior livre. */
  innerRadius: number;
}

export interface BoxCollider extends ColliderBase {
  kind: 'box';
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  /** Rotação em torno de Y, mesma convenção de `Object3D.rotation.y`. */
  rotation: number;
  cos: number;
  sin: number;
  /** Topo curvo/inclinado opcional (ex.: ponte em arco), em coordenadas locais. */
  topAt?: (localX: number, localZ: number) => number;
}

export type Collider = CylinderCollider | BoxCollider;

export interface MutablePoint {
  x: number;
  z: number;
}

/** Converte um ponto do mundo para o espaço local de uma caixa. */
export function worldToBoxLocal(box: BoxCollider, px: number, pz: number, out: MutablePoint): MutablePoint {
  const dx = px - box.x;
  const dz = pz - box.z;
  out.x = dx * box.cos - dz * box.sin;
  out.z = dx * box.sin + dz * box.cos;
  return out;
}

/** Converte um ponto local de uma caixa para o mundo. */
export function boxLocalToWorld(box: BoxCollider, lx: number, lz: number, out: MutablePoint): MutablePoint {
  out.x = box.x + lx * box.cos + lz * box.sin;
  out.z = box.z - lx * box.sin + lz * box.cos;
  return out;
}

const _local: MutablePoint = { x: 0, z: 0 };

/**
 * Altura do topo do colisor sob o ponto (x, z), ou `null` se o ponto
 * estiver fora da área de apoio.
 */
export function colliderTopAt(collider: Collider, x: number, z: number): number | null {
  if (collider.kind === 'cylinder') {
    const d = Math.hypot(x - collider.x, z - collider.z);
    if (d > collider.radius) return null;
    if (collider.innerRadius > 0 && d < collider.innerRadius) return null;
    return collider.yMax;
  }
  worldToBoxLocal(collider, x, z, _local);
  if (Math.abs(_local.x) > collider.halfX || Math.abs(_local.z) > collider.halfZ) return null;
  return collider.topAt ? collider.topAt(_local.x, _local.z) : collider.yMax;
}

/**
 * Empurra um círculo (posição mutável) para fora do colisor.
 * Retorna `true` se houve penetração corrigida.
 */
export function pushCircleOut(collider: Collider, pos: MutablePoint, radius: number): boolean {
  if (collider.kind === 'cylinder') {
    let dx = pos.x - collider.x;
    let dz = pos.z - collider.z;
    let d = Math.hypot(dx, dz);
    const outer = collider.radius + radius;
    if (d >= outer) return false;

    if (collider.innerRadius > 0) {
      const innerFree = collider.innerRadius - radius;
      if (d <= innerFree) return false;
      const mid = (collider.innerRadius + collider.radius) * 0.5;
      if (d < mid && innerFree > 0) {
        // Dentro do anel: empurra de volta para o interior livre.
        if (d < 1e-6) return false;
        const scale = innerFree / d;
        pos.x = collider.x + dx * scale;
        pos.z = collider.z + dz * scale;
        return true;
      }
    }

    if (d < 1e-6) {
      dx = 1;
      dz = 0;
      d = 1;
    }
    const scale = outer / d;
    pos.x = collider.x + dx * scale;
    pos.z = collider.z + dz * scale;
    return true;
  }

  worldToBoxLocal(collider, pos.x, pos.z, _local);
  let lx = _local.x;
  let lz = _local.z;
  const hx = collider.halfX;
  const hz = collider.halfZ;
  const nearestX = lx < -hx ? -hx : lx > hx ? hx : lx;
  const nearestZ = lz < -hz ? -hz : lz > hz ? hz : lz;
  const dx = lx - nearestX;
  const dz = lz - nearestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius) return false;

  if (distSq > 1e-10) {
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    lx += (dx / dist) * push;
    lz += (dz / dist) * push;
  } else {
    // Centro dentro da caixa: sai pelo eixo de menor penetração.
    const penX = hx - Math.abs(lx);
    const penZ = hz - Math.abs(lz);
    if (penX < penZ) lx = (lx >= 0 ? 1 : -1) * (hx + radius);
    else lz = (lz >= 0 ? 1 : -1) * (hz + radius);
  }
  boxLocalToWorld(collider, lx, lz, pos);
  return true;
}

/**
 * Interseção raio × colisor. Retorna a distância de entrada ao longo do
 * raio ou `Infinity` se não houver interseção em [0, maxDistance].
 * Origens dentro do volume são ignoradas (evita travar a câmera).
 */
export function raycastCollider(
  collider: Collider,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
): number {
  let tMin = -Infinity;
  let tMax = Infinity;

  // Intervalo vertical (slab em Y).
  if (Math.abs(dy) < 1e-9) {
    if (oy < collider.yMin || oy > collider.yMax) return Infinity;
  } else {
    let t0 = (collider.yMin - oy) / dy;
    let t1 = (collider.yMax - oy) / dy;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    tMin = t0;
    tMax = t1;
  }

  if (collider.kind === 'cylinder') {
    const fx = ox - collider.x;
    const fz = oz - collider.z;
    const a = dx * dx + dz * dz;
    const r = collider.radius;
    if (a < 1e-12) {
      if (fx * fx + fz * fz > r * r) return Infinity;
    } else {
      const b = 2 * (fx * dx + fz * dz);
      const c = fx * fx + fz * fz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return Infinity;
      const sq = Math.sqrt(disc);
      const t0 = (-b - sq) / (2 * a);
      const t1 = (-b + sq) / (2 * a);
      if (t0 > tMin) tMin = t0;
      if (t1 < tMax) tMax = t1;
    }
  } else {
    // Raio no espaço local da caixa.
    const rx = ox - collider.x;
    const rz = oz - collider.z;
    const lox = rx * collider.cos - rz * collider.sin;
    const loz = rx * collider.sin + rz * collider.cos;
    const ldx = dx * collider.cos - dz * collider.sin;
    const ldz = dx * collider.sin + dz * collider.cos;

    if (Math.abs(ldx) < 1e-9) {
      if (Math.abs(lox) > collider.halfX) return Infinity;
    } else {
      let t0 = (-collider.halfX - lox) / ldx;
      let t1 = (collider.halfX - lox) / ldx;
      if (t0 > t1) {
        const tmp = t0;
        t0 = t1;
        t1 = tmp;
      }
      if (t0 > tMin) tMin = t0;
      if (t1 < tMax) tMax = t1;
    }
    if (Math.abs(ldz) < 1e-9) {
      if (Math.abs(loz) > collider.halfZ) return Infinity;
    } else {
      let t0 = (-collider.halfZ - loz) / ldz;
      let t1 = (collider.halfZ - loz) / ldz;
      if (t0 > t1) {
        const tmp = t0;
        t0 = t1;
        t1 = tmp;
      }
      if (t0 > tMin) tMin = t0;
      if (t1 < tMax) tMax = t1;
    }
  }

  if (tMin > tMax) return Infinity;
  if (tMin < 0) return Infinity; // origem dentro do volume (ou volume atrás do raio)
  if (tMin > maxDistance) return Infinity;
  return tMin;
}

/** Caixa delimitadora alinhada aos eixos (XZ) de um colisor. */
export function colliderBounds(collider: Collider): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (collider.kind === 'cylinder') {
    return {
      minX: collider.x - collider.radius,
      maxX: collider.x + collider.radius,
      minZ: collider.z - collider.radius,
      maxZ: collider.z + collider.radius,
    };
  }
  const ex = Math.abs(collider.cos) * collider.halfX + Math.abs(collider.sin) * collider.halfZ;
  const ez = Math.abs(collider.sin) * collider.halfX + Math.abs(collider.cos) * collider.halfZ;
  return { minX: collider.x - ex, maxX: collider.x + ex, minZ: collider.z - ez, maxZ: collider.z + ez };
}
