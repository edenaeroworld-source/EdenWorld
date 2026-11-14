// @vitest-environment happy-dom
/**
 * Folha de conferência do vestido na região do quadril.
 *
 * Desenha o **mesmo** personagem nas seis situações pedidas — parado
 * de frente, de perfil, de costas, caminhando, correndo e com o
 * quadril em movimento — rasterizando a geometria real, com os pesos
 * de esqueleto reais e a mesma conta de deformação que a GPU faria.
 *
 *     EDEN_RENDER=1 npx vitest run tests/unit/vestido-render.test.ts
 *
 * Saídas em `docs/`:
 *
 *  · `vestido-depois.png` — o estado atual do código.
 *  · `vestido-antes.png`  — o registro do defeito, desenhado por
 *    este mesmo arquivo com o código **anterior** em árvore:
 *
 *        git stash && EDEN_RENDER=1 EDEN_VESTIDO_ANTES=1 \
 *          npx vitest run tests/unit/vestido-render.test.ts; git stash pop
 *
 *    `EDEN_VESTIDO_ANTES` só troca o nome do arquivo de saída — quem
 *    muda a geometria é a árvore de trabalho. Guardar a saia velha
 *    aqui dentro seria guardar código morto que ninguém executa e
 *    que, por isso mesmo, deixa de corresponder ao que foi medido.
 *
 * A folha não substitui o navegador: falta iluminação de cena, sombra
 * e tone mapping. Ela serve para responder uma pergunta objetiva —
 * **a silhueta da saia é contínua, ou a pele da coxa a corta?**
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Avatar } from '../../src/player/Avatar';
import { AvatarAnimator, Ch, type Pose } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { type Canvas, canvas, drawAvatar, png, stack, strip } from '../helpers/raster';

const W = 250;
const H = 400;
const SCALE = 205;

/** Roda o animador até a pose assentar e devolve o quadro pedido. */
function settle(state: 'idle' | 'walk' | 'run', speed: number, frames = 90): Pose {
  const animator = new AvatarAnimator();
  let pose = animator.update(1 / 60, { state, speed, stridePhase: 0, verticalSpeed: 0, elapsed: 0 });
  for (let i = 1; i <= frames; i += 1) {
    pose = animator.update(1 / 60, { state, speed, stridePhase: i * 0.21, verticalSpeed: 0, elapsed: i / 60 });
  }
  return pose;
}

/**
 * Pernas abertas e tronco torcido: o pior caso para uma saia presa só
 * ao quadril. É a "mudança de direção" do pedido — o momento em que a
 * coxa sai mais para o lado do que em qualquer passada.
 */
function hipTwist(): Pose {
  const pose = settle('idle', 0);
  pose[Ch.TorsoY] = 0.35;
  pose[Ch.LegLZ] = 0.26;
  pose[Ch.LegRZ] = -0.26;
  pose[Ch.LegLX] = -0.3;
  pose[Ch.LegRX] = 0.18;
  return pose;
}

function panel(avatar: Avatar, pose: Pose, turn: number): Canvas {
  const c = canvas(W, H);
  avatar.applyPose(pose);
  drawAvatar(c, avatar, { scale: SCALE, originX: W / 2, originY: H - 16, turn });
  return c;
}

describe.runIf(process.env.EDEN_RENDER)('vestido no quadril (visual)', () => {
  it('desenha a folha de conferência', () => {
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' });

    // Linha 1: parado — de frente, de perfil e de costas.
    const parado = settle('idle', 0);
    const linha1 = strip([panel(avatar, parado, 0), panel(avatar, parado, Math.PI / 2), panel(avatar, parado, Math.PI)]);

    // Linha 2: caminhando, de frente e de perfil; correndo, de frente.
    const andando = settle('walk', 2.3);
    const correndo = settle('run', 5.6);
    const linha2 = strip([panel(avatar, andando, 0), panel(avatar, andando, Math.PI / 2), panel(avatar, correndo, 0)]);

    // Linha 3: correndo de perfil, e o quadril torcido de dois ângulos.
    const torcido = hipTwist();
    const linha3 = strip([panel(avatar, correndo, Math.PI / 2), panel(avatar, torcido, 0), panel(avatar, torcido, Math.PI * 0.3)]);

    const sheet = stack([linha1, linha2, linha3]);
    const name = process.env.EDEN_VESTIDO_ANTES ? 'vestido-antes.png' : 'vestido-depois.png';
    writeFileSync(resolve(process.cwd(), 'docs', name), png(sheet.width, sheet.height, sheet.rgb));
    expect(sheet.width).toBeGreaterThan(0);
  });
});
