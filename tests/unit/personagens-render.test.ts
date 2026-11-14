// @vitest-environment happy-dom
/**
 * Cena de demonstração do Marco N — a prova visual possível aqui.
 *
 * Gera três folhas em `docs/`, desenhando a **geometria real** que a
 * GPU receberia: a mesma malha, os mesmos pesos de esqueleto, a mesma
 * conta de deformação, rasterizada por software com z-buffer.
 *
 *     EDEN_RENDER=1 npx vitest run tests/unit/personagens-render.test.ts
 *
 *  · `docs/personagens-marco-n.png` — Aérion, Suki-Chan, Saturno,
 *    Maze, um habitante comum e o corpo jogável, cada um de frente, de
 *    perfil, de costas e em três quartos.
 *  · `docs/personagens-animacao.png` — parado, caminhando, correndo e
 *    conversando.
 *  · `docs/personagens-articulacoes.png` — o cotovelo e o joelho
 *    dobrados, ao lado do mesmo corpo com os pesos arredondados para
 *    um osso só. É a comparação entre a dobra nova e a dobradiça
 *    antiga, no mesmo modelo.
 *
 * **O que esta prova não é.** Não há WebGL nem navegador neste
 * ambiente. Falta a iluminação do cenário, o mapa de sombras, o tone
 * mapping e os reflexos — tudo o que a tela de verdade acrescenta. A
 * folha serve para conferir **forma, proporção e deformação**, e não
 * para dar o resultado final por aprovado.
 */

import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { createOfficialAvatar } from '../../src/characters/CharacterModels';
import { getCharacter } from '../../src/characters/Pantheon';
import { makeCitizen } from '../../src/npc/CitizenData';
import { Avatar } from '../../src/player/Avatar';
import { AvatarAnimator, Ch, type Pose } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { proportionsFor } from '../../src/player/body/BodyProportions';
import { type Canvas, canvas, drawAvatar, png, stack, strip } from '../helpers/raster';

const W = 260;
const H = 420;
const SCALE = 212;

/** Roda o animador até a pose assentar e devolve o quadro pedido. */
function settle(state: 'idle' | 'walk' | 'run', speed: number, frames = 90): Pose {
  const animator = new AvatarAnimator();
  let pose = animator.update(1 / 60, { state, speed, stridePhase: 0, verticalSpeed: 0, elapsed: 0 });
  for (let i = 1; i <= frames; i += 1) {
    pose = animator.update(1 / 60, { state, speed, stridePhase: i * 0.21, verticalSpeed: 0, elapsed: i / 60 });
  }
  return pose;
}

/** Uma pose de conversa: tronco de lado, cabeça virada, mão no ar. */
function talking(): Pose {
  const pose = settle('idle', 0);
  pose[Ch.TorsoY] = 0.2;
  pose[Ch.HeadY] = -0.35;
  pose[Ch.HeadX] = -0.06;
  pose[Ch.ArmRX] = -0.55;
  pose[Ch.ArmRZ] = -0.42;
  pose[Ch.ForeR] = -1.15;
  pose[Ch.ArmLZ] = 0.12;
  return pose;
}

function panel(avatar: Avatar, pose: Pose, turn: number, gestation = 0): Canvas {
  const c = canvas(W, H);
  avatar.applyPose(pose);
  drawAvatar(c, avatar, { scale: SCALE, originX: W / 2, originY: H - 18, turn }, { bust: 0, curve: 0, gestation });
  return c;
}

/** Os seis corpos da cena de demonstração, na ordem pedida. */
function cast(): { name: string; avatar: Avatar; gestation: number }[] {
  const out: { name: string; avatar: Avatar; gestation: number }[] = [];
  for (const id of ['aerion', 'suki', 'saturno', 'maze']) {
    const character = getCharacter(id);
    const avatar = createOfficialAvatar(id);
    if (!character || !avatar) continue;
    avatar.setProportions(proportionsFor(id, character.appearance.height));
    out.push({ name: character.name, avatar, gestation: character.gestation ?? 0 });
  }
  // Um habitante comum, com o corpo que o id dele sorteou.
  const citizen = makeCitizen(7);
  const npc = new Avatar(citizen.appearance, proportionsFor(`cidadao-${citizen.seed}`, citizen.appearance.height));
  out.push({ name: citizen.name, avatar: npc, gestation: 0 });
  // E o corpo jogável, no padrão da criação de personagem.
  out.push({ name: 'jogador', avatar: new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'aero' }), gestation: 0 });
  return out;
}

const ANGLES = [0, Math.PI / 2, Math.PI, Math.PI * 1.75];

describe.runIf(process.env.EDEN_RENDER)('cena de demonstração · Marco N', () => {
  it('os seis corpos, em quatro ângulos cada', () => {
    const rows = cast().map(({ avatar, gestation }) => {
      const row = strip(ANGLES.map((turn) => panel(avatar, settle('idle', 0), turn, gestation)));
      avatar.dispose();
      return row;
    });
    const image = stack(rows);
    writeFileSync(process.env.EDEN_CAST_OUT ?? 'docs/personagens-marco-n.png', png(image.width, image.height, image.rgb));
  });

  it('parado, caminhando, correndo e conversando', () => {
    const poses: [string, Pose][] = [
      ['parado', settle('idle', 0)],
      ['andando', settle('walk', 2.3)],
      ['correndo', settle('run', 5.6)],
      ['conversando', talking()],
    ];
    const rows = ['suki', 'aerion'].map((id) => {
      const character = getCharacter(id);
      const avatar = createOfficialAvatar(id);
      if (!character || !avatar) return strip([canvas(W, H)]);
      avatar.setProportions(proportionsFor(id, character.appearance.height));
      const row = strip(poses.map(([, pose]) => panel(avatar, pose, Math.PI * 1.78, character.gestation ?? 0)));
      avatar.dispose();
      return row;
    });
    const image = stack(rows);
    writeFileSync(process.env.EDEN_ANIM_OUT ?? 'docs/personagens-animacao.png', png(image.width, image.height, image.rgb));
  });

  it('cotovelos e joelhos dobrados, de perto', () => {
    // Enquadramento fechado em cada articulação: é a escala em que se
    // vê se a dobra é uma curva ou um vinco. A mira sai do **osso**,
    // não de uma altura escrita à mão — assim a folha continua
    // apontada para o cotovelo se as medidas do corpo mudarem.
    const bent = new Float32Array(Ch.Count) as Pose;
    bent[Ch.ArmLX] = -1.25;
    bent[Ch.ForeL] = -2.1;
    bent[Ch.ArmRX] = -0.5;
    bent[Ch.ForeR] = -1.2;
    bent[Ch.LegLX] = -1.15;
    bent[Ch.ShinL] = 1.95;

    const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'esportivo' });
    avatar.applyPose(bent);
    avatar.root.updateMatrixWorld(true);

    const SIZE = 300;
    const ZOOM = 560;
    const aim = (boneName: string, turn: number) => {
      // A junta é a origem do osso de baixo: o cotovelo é o antebraço,
      // o joelho é a canela.
      const joint = avatar.root.getObjectByName(boneName)!.getWorldPosition(new THREE.Vector3());
      const c = canvas(SIZE, SIZE);
      drawAvatar(c, avatar, {
        scale: ZOOM,
        originX: SIZE / 2 - joint.x * Math.cos(turn) * ZOOM,
        originY: SIZE / 2 + joint.y * ZOOM,
        turn,
      });
      return c;
    };

    const turns = [0.25, Math.PI / 2, Math.PI * 1.8];
    const image = stack([strip(turns.map((t) => aim('antebraco-e', t))), strip(turns.map((t) => aim('perna-e', t)))]);
    avatar.dispose();
    writeFileSync(process.env.EDEN_JOINT_OUT ?? 'docs/personagens-articulacoes.png', png(image.width, image.height, image.rgb));
  });
});
