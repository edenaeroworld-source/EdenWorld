import type { SurfaceType } from '../physics/Collision';
import type { HeightSampler } from '../physics/PhysicsWorld';
import { clamp } from '../utils/math';

export type HeightFunction = (x: number, z: number) => number;

/**
 * Grade de alturas amostrada de uma função procedural.
 *
 * A malha visual do terreno e a física consultam exatamente os mesmos
 * dados (com a mesma triangulação), de modo que os pés do personagem
 * sempre tocam a superfície renderizada.
 */
export class HeightField implements HeightSampler {
  readonly data: Float32Array;
  readonly verticesPerSide: number;
  readonly cellSize: number;
  readonly origin: number;
  minHeight = Infinity;
  maxHeight = -Infinity;

  /** Altura abaixo da qual o terreno é considerado areia. */
  sandLevel = 0.9;
  waterLevel = 0;

  constructor(
    readonly size: number,
    readonly segments: number,
    heightFunction: HeightFunction,
  ) {
    this.verticesPerSide = segments + 1;
    this.cellSize = size / segments;
    this.origin = -size / 2;
    this.data = new Float32Array(this.verticesPerSide * this.verticesPerSide);

    const n = this.verticesPerSide;
    for (let j = 0; j < n; j++) {
      const z = this.origin + j * this.cellSize;
      for (let i = 0; i < n; i++) {
        const x = this.origin + i * this.cellSize;
        const h = heightFunction(x, z);
        this.data[j * n + i] = h;
        if (h < this.minHeight) this.minHeight = h;
        if (h > this.maxHeight) this.maxHeight = h;
      }
    }
  }

  /** Altura no vértice (i, j) da grade, com índices limitados às bordas. */
  at(i: number, j: number): number {
    const n = this.verticesPerSide;
    const ci = i < 0 ? 0 : i >= n ? n - 1 : i;
    const cj = j < 0 ? 0 : j >= n ? n - 1 : j;
    return this.data[cj * n + ci];
  }

  /** Altura interpolada com a mesma triangulação da malha renderizada. */
  getHeight(x: number, z: number): number {
    const max = this.segments - 1e-6;
    const gx = clamp((x - this.origin) / this.cellSize, 0, max);
    const gz = clamp((z - this.origin) / this.cellSize, 0, max);
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const n = this.verticesPerSide;
    const base = j * n + i;
    const h00 = this.data[base];
    const h10 = this.data[base + 1];
    const h01 = this.data[base + n];
    const h11 = this.data[base + n + 1];
    if (fx + fz <= 1) {
      return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    }
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  /** Normal aproximada (diferenças centrais). Retorna [nx, ny, nz]. */
  getNormal(x: number, z: number, out: [number, number, number] = [0, 1, 0]): [number, number, number] {
    const e = this.cellSize;
    const hl = this.getHeight(x - e, z);
    const hr = this.getHeight(x + e, z);
    const hd = this.getHeight(x, z - e);
    const hu = this.getHeight(x, z + e);
    const nx = hl - hr;
    const ny = 2 * e;
    const nz = hd - hu;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / len;
    out[1] = ny / len;
    out[2] = nz / len;
    return out;
  }

  /** Inclinação em [0, 1] (0 = plano, 1 = vertical). */
  getSlope(x: number, z: number): number {
    return 1 - this.getNormal(x, z)[1];
  }

  getSurface(x: number, z: number): SurfaceType {
    const h = this.getHeight(x, z);
    if (h < this.waterLevel - 0.05) return 'water';
    if (h < this.sandLevel) return 'sand';
    return 'grass';
  }
}
