// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Avatar } from '../../src/player/Avatar';
import { AvatarAnimator } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { canvas, drawAvatar, strip, stack, png } from '../helpers/raster';

describe('densidade', () => {
  it('quanto custa e como fica', () => {
    const rows: { width: number; height: number; rgb: Uint8Array }[] = [];
    for (const d of ['alta', 'ultra'] as const) {
      const a = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' });
      a.setDetail(d);
      const an = new AvatarAnimator();
      let p = an.update(1/60, { state:'idle', speed:0, stridePhase:0, verticalSpeed:0, elapsed:0 });
      for (let i=1;i<=90;i++) p = an.update(1/60, { state:'idle', speed:0, stridePhase:0, verticalSpeed:0, elapsed:i/60 });
      a.applyPose(p, 1.5); a.root.updateMatrixWorld(true);
      let verts = 0, tris = 0;
      a.root.traverse((o) => { const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry) { const g = m.geometry as THREE.BufferGeometry;
          verts += g.getAttribute('position')?.count ?? 0;
          tris += (g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3; } });
      console.log(`${d} vertices=${verts} triangulos=${Math.round(tris)}`);
      const rosto = (turn: number) => { const c = canvas(440, 500); drawAvatar(c, a, { scale: 1600, originX: 220, originY: 2645, turn }); return c; };
      rows.push(strip([rosto(0), rosto(-0.5), rosto(Math.PI/2)]));
    }
    const sheet = stack(rows);
    writeFileSync(resolve(process.cwd(), '.tmp-dens.png'), png(sheet.width, sheet.height, sheet.rgb));
    expect(sheet.width).toBeGreaterThan(0);
  });
});
