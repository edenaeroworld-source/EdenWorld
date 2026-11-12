import { describe, expect, it } from 'vitest';
import {
  TAU,
  angleDelta,
  clamp,
  clamp01,
  createRng,
  damp,
  dampAngle,
  distanceToPolyline,
  distanceToSegment,
  fbm2,
  formatDistance,
  formatDuration,
  hash2,
  inverseLerp,
  lerp,
  moveTowards,
  pick,
  randInt,
  remap,
  smoothPolyline,
  smoothstep,
  valueNoise2,
  wrapAngle,
} from '../../src/utils/math';

describe('utilitários matemáticos', () => {
  it('limita e interpola valores', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-2, 0, 3)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(inverseLerp(10, 20, 15)).toBe(0.5);
    expect(inverseLerp(4, 4, 9)).toBe(0);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
  });

  it('smoothstep aceita bordas invertidas', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(1, 0, 0.25)).toBeGreaterThan(0.5);
    expect(smoothstep(2, 2, 3)).toBe(1);
  });

  it('damp converge sem depender da taxa de quadros', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 20; i++) b = damp(b, 1, 5, 1 / 20);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(0.99);
  });

  it('normaliza ângulos e escolhe o menor caminho', () => {
    expect(wrapAngle(TAU + 0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(angleDelta(3, -3)).toBeCloseTo(TAU - 6);
    const next = dampAngle(3.1, -3.1, 100, 1);
    expect(wrapAngle(next)).toBeCloseTo(-3.1, 3);
  });

  it('moveTowards nunca ultrapassa o alvo', () => {
    expect(moveTowards(0, 10, 3)).toBe(3);
    expect(moveTowards(9, 10, 3)).toBe(10);
    expect(moveTowards(0, -10, 4)).toBe(-4);
  });

  it('gera números pseudoaleatórios determinísticos', () => {
    const a = createRng(123);
    const b = createRng(123);
    const c = createRng(124);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(Array.from({ length: 8 }, () => c()));
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const n = randInt(rng, 2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      expect(['a', 'b', 'c']).toContain(pick(rng, ['a', 'b', 'c']));
    }
  });

  it('ruídos ficam em [0, 1] e são contínuos', () => {
    expect(hash2(3, 9, 1)).toBe(hash2(3, 9, 1));
    for (let i = 0; i < 100; i++) {
      const v = valueNoise2(i * 0.37, i * 0.91, 5);
      const f = fbm2(i * 0.21, i * 0.13, 4, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(valueNoise2(1.5, 2.5) - valueNoise2(1.5001, 2.5))).toBeLessThan(0.001);
  });

  it('mede distâncias a segmentos e polilinhas', () => {
    expect(distanceToSegment(0, 5, -10, 0, 10, 0)).toEqual({ distance: 5, t: 0.5 });
    expect(distanceToSegment(20, 0, -10, 0, 10, 0).distance).toBe(10);
    const line = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
    ];
    expect(distanceToPolyline(12, 5, line)).toBe(2);
    const smooth = smoothPolyline(line, 4);
    expect(smooth.length).toBe(9);
    expect(smooth[0]).toEqual({ x: 0, z: 0 });
    expect(smooth[smooth.length - 1]).toEqual({ x: 10, z: 10 });
  });

  it('formata duração e distância em pt-BR', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(12 * 60)).toBe('12min');
    expect(formatDuration(3900)).toBe('1h 05min');
    expect(formatDistance(850.4)).toBe('850 m');
    expect(formatDistance(1234)).toBe('1,2 km');
  });
});
