import type { Point2 } from '../utils/math';

/** Marcadores de ocupação do solo (combináveis por OU binário). */
export const Zone = {
  Paved: 1,
  Path: 2,
  Building: 4,
  Bed: 8,
  Water: 16,
  Reserved: 32,
  Sand: 64,
} as const;

export const ZONE_BLOCKING = Zone.Paved | Zone.Path | Zone.Building | Zone.Water | Zone.Reserved;

/**
 * Grade de ocupação do solo (1 célula = 1 m por padrão).
 * Usada para distribuir vegetação e decoração sem invadir praças,
 * caminhos, edifícios ou água, e para consultas rápidas de zona.
 */
export class ZoneMap {
  readonly data: Uint8Array;
  readonly cells: number;
  readonly origin: number;

  constructor(
    readonly size: number,
    readonly cellSize = 1,
  ) {
    this.cells = Math.ceil(size / cellSize);
    this.origin = -size / 2;
    this.data = new Uint8Array(this.cells * this.cells);
  }

  private index(x: number, z: number): number {
    const i = Math.floor((x - this.origin) / this.cellSize);
    const j = Math.floor((z - this.origin) / this.cellSize);
    if (i < 0 || j < 0 || i >= this.cells || j >= this.cells) return -1;
    return j * this.cells + i;
  }

  flags(x: number, z: number): number {
    const index = this.index(x, z);
    return index < 0 ? Zone.Water : this.data[index];
  }

  has(x: number, z: number, mask: number): boolean {
    return (this.flags(x, z) & mask) !== 0;
  }

  /** `true` se o ponto e seu entorno (raio) estão livres das zonas da máscara. */
  isFree(x: number, z: number, radius = 0, mask: number = ZONE_BLOCKING): boolean {
    if (this.has(x, z, mask)) return false;
    if (radius <= 0) return true;
    const d = radius * 0.7071;
    return !(
      this.has(x + radius, z, mask) ||
      this.has(x - radius, z, mask) ||
      this.has(x, z + radius, mask) ||
      this.has(x, z - radius, mask) ||
      this.has(x + d, z + d, mask) ||
      this.has(x - d, z + d, mask) ||
      this.has(x + d, z - d, mask) ||
      this.has(x - d, z - d, mask)
    );
  }

  stampCircle(x: number, z: number, radius: number, flag: number): void {
    const minI = Math.max(0, Math.floor((x - radius - this.origin) / this.cellSize));
    const maxI = Math.min(this.cells - 1, Math.floor((x + radius - this.origin) / this.cellSize));
    const minJ = Math.max(0, Math.floor((z - radius - this.origin) / this.cellSize));
    const maxJ = Math.min(this.cells - 1, Math.floor((z + radius - this.origin) / this.cellSize));
    const r2 = radius * radius;
    for (let j = minJ; j <= maxJ; j++) {
      const cz = this.origin + (j + 0.5) * this.cellSize - z;
      for (let i = minI; i <= maxI; i++) {
        const cx = this.origin + (i + 0.5) * this.cellSize - x;
        if (cx * cx + cz * cz <= r2) this.data[j * this.cells + i] |= flag;
      }
    }
  }

  stampRing(x: number, z: number, innerRadius: number, outerRadius: number, flag: number): void {
    const minI = Math.max(0, Math.floor((x - outerRadius - this.origin) / this.cellSize));
    const maxI = Math.min(this.cells - 1, Math.floor((x + outerRadius - this.origin) / this.cellSize));
    const minJ = Math.max(0, Math.floor((z - outerRadius - this.origin) / this.cellSize));
    const maxJ = Math.min(this.cells - 1, Math.floor((z + outerRadius - this.origin) / this.cellSize));
    const inner2 = innerRadius * innerRadius;
    const outer2 = outerRadius * outerRadius;
    for (let j = minJ; j <= maxJ; j++) {
      const cz = this.origin + (j + 0.5) * this.cellSize - z;
      for (let i = minI; i <= maxI; i++) {
        const cx = this.origin + (i + 0.5) * this.cellSize - x;
        const d2 = cx * cx + cz * cz;
        if (d2 >= inner2 && d2 <= outer2) this.data[j * this.cells + i] |= flag;
      }
    }
  }

  stampSegment(ax: number, az: number, bx: number, bz: number, halfWidth: number, flag: number): void {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / (this.cellSize * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.stampCircle(ax + (bx - ax) * t, az + (bz - az) * t, halfWidth, flag);
    }
  }

  stampPolyline(points: readonly Point2[], halfWidth: number, flag: number): void {
    for (let i = 0; i < points.length - 1; i++) {
      this.stampSegment(points[i].x, points[i].z, points[i + 1].x, points[i + 1].z, halfWidth, flag);
    }
  }

  /** Marca células a partir de um predicado avaliado no centro de cada célula. */
  stampWhere(predicate: (x: number, z: number) => boolean, flag: number): void {
    for (let j = 0; j < this.cells; j++) {
      const z = this.origin + (j + 0.5) * this.cellSize;
      for (let i = 0; i < this.cells; i++) {
        const x = this.origin + (i + 0.5) * this.cellSize;
        if (predicate(x, z)) this.data[j * this.cells + i] |= flag;
      }
    }
  }
}
