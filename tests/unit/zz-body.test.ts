// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Avatar } from '../../src/player/Avatar';
import { AvatarAnimator } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { canvas, drawAvatar, strip, stack, png } from '../helpers/raster';

describe('corpo', () => {
  it('folha', () => {
    const rows: { width: number; height: number; rgb: Uint8Array }[] = [];
    for (const outfit of ['vestido'] as const) {
      const a = new Avatar({ ...DEFAULT_APPEARANCE, outfit });
      a.setDetail('ultra');
      const an = new AvatarAnimator();
      let p = an.update(1/60, { state:'idle', speed:0, stridePhase:0, verticalSpeed:0, elapsed:0 });
      for (let i=1;i<=90;i++) p = an.update(1/60, { state:'idle', speed:0, stridePhase:0, verticalSpeed:0, elapsed:i/60 });
      a.applyPose(p, 1.5);
      const corpo = (turn: number) => { const c = canvas(300, 400); drawAvatar(c, a, { scale: 1750, originX: 150, originY: 2790, turn }); return c; };
      const rosto = (turn: number) => { const c = canvas(300, 400); drawAvatar(c, a, { scale: 1750, originX: 150, originY: 3010, turn }); return c; };
      rows.push(strip([rosto(0), rosto(-0.25), rosto(-0.55), corpo(0)]));
    }
    const sheet = stack(rows);
    writeFileSync(resolve(process.cwd(), '.tmp-body.png'), png(sheet.width, sheet.height, sheet.rgb));
    expect(sheet.width).toBeGreaterThan(0);
  });
});
