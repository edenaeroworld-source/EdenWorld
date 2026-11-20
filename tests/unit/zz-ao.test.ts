import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Avatar } from '../../src/player/Avatar';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';

function region(a: Avatar, box: [number, number, number, number, number, number]) {
  const geo = (a as any).body.geometry as THREE.BufferGeometry;
  const p = geo.getAttribute('position');
  const c = geo.getAttribute('color');
  let sum = 0, n = 0; const vals: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x < box[0] || x > box[1] || y < box[2] || y > box[3] || z < box[4] || z > box[5]) continue;
    const l = (c.getX(i) + c.getY(i) + c.getZ(i)) / 3; sum += l; n++; vals.push(l);
  }
  const avg = n ? sum / n : 0;
  const sd = n ? Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / n) : 0;
  return { avg, n, sd };
}

describe('ao', () => {
  it('mede', () => {
    for (const d of ['ultra', 'alta', 'media'] as const) {
      const a = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' });
      a.setDetail(d);
      const cheek = region(a, [0.05, 0.12, 0.60, 0.66, 0.10, 0.18]);
      const corner = region(a, [0.04, 0.09, 0.68, 0.73, 0.10, 0.17]);
      const chin = region(a, [-0.04, 0.04, 0.53, 0.57, 0.05, 0.14]);
      console.log(d, 'bochecha', cheek.avg.toFixed(3), '+-', cheek.sd.toFixed(3), '| canto', corner.avg.toFixed(3), '+-', corner.sd.toFixed(3), '| queixo', chin.avg.toFixed(3), '+-', chin.sd.toFixed(3));
      a.dispose();
    }
    expect(1).toBe(1);
  }, 120000);
});
