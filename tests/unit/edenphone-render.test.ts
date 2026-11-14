// @vitest-environment happy-dom
/**
 * Folha de conferência visual da prévia do EdenPhone.
 *
 * Não roda no portão de sempre: só com `EDEN_RENDER=1`, porque
 * desenhar custa segundos e o que ela entrega é uma imagem para olho
 * humano, não uma asserção. Serve para responder "o personagem está
 * bem enquadrado na janela do celular?" sem precisar de um navegador.
 *
 *   EDEN_RENDER=1 npx vitest run tests/unit/edenphone-render.test.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canvas, drawAvatar, png, stack, strip } from '../helpers/raster';
import { Avatar } from '../../src/player/Avatar';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { AvatarAnimator } from '../../src/player/AvatarAnimator';

/** Mesmas frações usadas por `CharacterPreview`. */
const FRAME_TOP = 1.1;
const FRAME_BOTTOM = 0.24;

const W = 230;
const H = 290;

/**
 * Reproduz, no rasterizador ortográfico, o recorte vertical da câmera
 * da prévia: do pé da janela (`FRAME_BOTTOM`) ao topo (`FRAME_TOP`).
 */
function previewView(top: number, turn: number) {
  const span = (FRAME_TOP - FRAME_BOTTOM) * top;
  const scale = H / span;
  return { scale, originX: W / 2, originY: H + FRAME_BOTTOM * top * scale, turn };
}

function panel(avatar: Avatar, turn: number, morph = { bust: 0, curve: 0, gestation: 0 }) {
  // Fundo bem claro: é o vidro aqua do aparelho, não um painel sólido.
  const target = canvas(W, H, [226, 248, 255], [182, 232, 245]);
  avatar.root.updateMatrixWorld(true);
  drawAvatar(target, avatar, previewView(avatar.topHeight, turn), morph);
  return target;
}

function posed(avatar: Avatar, elapsed: number): Avatar {
  const animator = new AvatarAnimator();
  for (let i = 0; i < 70; i++) {
    const pose = animator.update(1 / 60, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, slope: 0, elapsed: i / 60 });
    avatar.applyPose(pose, elapsed);
  }
  return avatar;
}

describe.runIf(process.env.EDEN_RENDER)('prévia do EdenPhone (visual)', () => {
  it('desenha a folha de conferência', () => {
    const turns = [0, Math.PI * 0.18, Math.PI * 0.5, -Math.PI * 0.18];

    // Linha 1: o enquadramento padrão, nos ângulos do giro de vitrine.
    const base = posed(new Avatar({ ...DEFAULT_APPEARANCE }), 0);
    const linha1 = strip(turns.map((t) => panel(base, t)));

    // Linha 2: alturas extremas — a composição tem de ser a mesma.
    const baixo = posed(new Avatar({ ...DEFAULT_APPEARANCE, height: 0.9 }), 0);
    const alto = posed(new Avatar({ ...DEFAULT_APPEARANCE, height: 1.1 }), 0);
    const vestido = posed(new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' }), 0);
    const aero = posed(new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'aero', hairStyle: 'longo' }), 0);
    const linha2 = strip([panel(baixo, 0), panel(alto, 0), panel(vestido, 0), panel(aero, 0)]);

    // Linha 3: Afters escritos pelo ator — o que a prévia mostra ao
    // arrastar os controles de AfterBust e AfterCurve.
    const linha3 = strip([
      panel(base, 0, { bust: 0, curve: 0, gestation: 0 }),
      panel(base, 0, { bust: 1.2, curve: 0, gestation: 0 }),
      panel(base, 0, { bust: 0, curve: 1.2, gestation: 0 }),
      panel(base, 0, { bust: 1.2, curve: 1.2, gestation: 0 }),
    ]);

    const sheet = stack([linha1, linha2, linha3]);
    const out = resolve(process.cwd(), 'docs/edenphone-previa.png');
    writeFileSync(out, png(sheet.width, sheet.height, sheet.rgb));
    expect(sheet.width).toBeGreaterThan(0);
  });
});
