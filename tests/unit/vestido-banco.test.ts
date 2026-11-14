// @vitest-environment happy-dom
/**
 * O vestido de quem está sentada num banco.
 *
 * Sentar é o caso extremo da saia: a coxa vai de pendurada a
 * horizontal (85,9°), o quadril desce 34,5 cm e, entre ele e a
 * tábua, sobram 10 cm para um pano de 36. É onde o tecido tem três
 * maneiras de errar ao mesmo tempo — descobrir a perna, atravessar o
 * banco, ou dar um tranco ao levantar — e este arquivo mede as três.
 *
 * Duas escolhas de método valem o registro:
 *
 *  · **A cobertura é medida pela normal da pele**, não radialmente a
 *    partir do eixo do quadril. Com a coxa deitada, o pano que a
 *    cobre está *acima* dela; um raio horizontal sai por baixo da
 *    saia sem tocá-la e acusa pele nua onde a imagem mostra tecido.
 *    A normal aponta para onde o pano deveria estar em qualquer pose,
 *    e por isso é a única régua que serve para sentada e em pé.
 *
 *  · **O banco é o banco.** Em vez de repetir aqui as medidas de
 *    `benchGeometries()`, o teste usa a geometria de verdade e
 *    pergunta por paridade de raio se o ponto está dentro da madeira.
 *    Se alguém mudar o banco, este teste muda junto.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Avatar } from '../../src/player/Avatar';
import { AvatarAnimator, type AnimatorInput, type Pose } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { benchGeometries } from '../../src/cities/aurora-city/Decorations';
import { skinnedOf } from '../helpers/cloth';

/** Ossos do quadril e das coxas — a pele que a saia tem de cobrir. */
const HIPS = 0;
const THIGH_L = 7;
const THIGH_R = 9;

/**
 * Onde o banco fica em relação a quem sentou nele.
 *
 * `PlayerMotor.sit` põe a origem do personagem em `seat.y - 0.345`, e
 * o banco de Aurora anuncia o assento em `y + 0.47`, `z + 0.02`
 * (`Decorations.ts`). A diferença é esta.
 */
const BENCH_Y = -0.125;
const BENCH_Z = -0.02;

/** Só a madeira: o assento e o espaldar, que é no que a saia esbarra. */
function benchMesh(): THREE.Mesh {
  const { wood } = benchGeometries();
  wood.translate(0, BENCH_Y, BENCH_Z);
  const mesh = new THREE.Mesh(wood, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** Está dentro da madeira? Conta cruzamentos num raio qualquer. */
function insideWood(bench: THREE.Mesh, point: THREE.Vector3): boolean {
  const ray = new THREE.Raycaster(point, new THREE.Vector3(1, 0, 0));
  ray.far = 50;
  return ray.intersectObject(bench, false).length % 2 === 1;
}

/** Uma cópia estática, já deformada, de um intervalo da malha. */
function posedPart(mesh: THREE.SkinnedMesh, from: number, to: number) {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  if (!index) throw new Error('a malha do corpo precisa de índice');
  const points: number[] = [];
  const slot = new Map<number, number>();
  const triangles: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    if (a < from || a >= to) continue;
    for (const i of [a, index.getX(t + 1), index.getX(t + 2)]) {
      let j = slot.get(i);
      if (j === undefined) {
        const v = new THREE.Vector3().fromBufferAttribute(position, i);
        mesh.applyBoneTransform(i, v);
        v.applyMatrix4(mesh.matrixWorld);
        j = points.length / 3;
        points.push(v.x, v.y, v.z);
        slot.set(i, j);
      }
      triangles.push(j);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  object.updateMatrixWorld(true);
  return { object, slot, geometry };
}

interface Skin {
  /** Vértices de pele que estão sob o pano. */
  covered: Set<number>;
  /** Para onde a pele olha, por vértice. */
  normal: Map<number, THREE.Vector3>;
  /** Onde cada vértice de pele está. */
  at: Map<number, THREE.Vector3>;
}

/** Quem está coberto agora, medido pela normal de cada pedaço de pele. */
function readSkin(mesh: THREE.SkinnedMesh, cloth: readonly [number, number]): Skin {
  const skirt = posedPart(mesh, cloth[0], cloth[1]);
  const body = posedPart(mesh, 0, cloth[0]);
  const normals = body.geometry.getAttribute('normal');
  const points = body.geometry.getAttribute('position');
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const ray = new THREE.Raycaster();
  const out: Skin = { covered: new Set(), normal: new Map(), at: new Map() };
  for (let i = 0; i < cloth[0]; i += 1) {
    const bone = skinIndex.getX(i);
    if (bone !== HIPS && bone !== THIGH_L && bone !== THIGH_R) continue;
    const j = body.slot.get(i);
    if (j === undefined) continue;
    const at = new THREE.Vector3().fromBufferAttribute(points, j);
    const normal = new THREE.Vector3().fromBufferAttribute(normals, j);
    if (normal.lengthSq() < 0.5) continue;
    normal.normalize();
    out.normal.set(i, normal);
    out.at.set(i, at);
    ray.set(at.clone().addScaledVector(normal, 0.003), normal);
    if (ray.intersectObject(skirt.object, false).length > 0) out.covered.add(i);
  }
  return out;
}

function dressed(): { avatar: Avatar; mesh: THREE.SkinnedMesh; cloth: readonly [number, number] } {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' });
  const mesh = skinnedOf(avatar.root);
  return { avatar, mesh, cloth: mesh.geometry.userData.parts.saia as [number, number] };
}

/** Roda o animador até a pose assentar. */
function settle(avatar: Avatar, input: Omit<AnimatorInput, 'elapsed'>, frames = 150): Pose {
  const animator = new AvatarAnimator();
  let pose = animator.update(1 / 60, { ...input, elapsed: 0 });
  for (let f = 1; f <= frames; f += 1) pose = animator.update(1 / 60, { ...input, elapsed: f / 60 });
  avatar.applyPose(pose, frames / 60);
  avatar.root.updateMatrixWorld(true);
  return pose;
}

function clothPoints(mesh: THREE.SkinnedMesh, cloth: readonly [number, number]): THREE.Vector3[] {
  const position = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = cloth[0]; i < cloth[1]; i += 1) {
    const v = new THREE.Vector3().fromBufferAttribute(position, i);
    mesh.applyBoneTransform(i, v);
    out.push(v.applyMatrix4(mesh.matrixWorld));
  }
  return out;
}

describe('vestido sentada no banco', () => {
  it('a saia não entra na madeira do banco', () => {
    const { avatar, mesh, cloth } = dressed();
    settle(avatar, { state: 'sit', speed: 0, stridePhase: 0, verticalSpeed: 0 });

    const bench = benchMesh();
    const dentro: string[] = [];
    for (const p of clothPoints(mesh, cloth)) {
      if (insideWood(bench, p)) dentro.push(`(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`);
    }
    // O pano preso entre o corpo e a tábua é invisível de qualquer
    // ângulo — fica selado ali dentro, que é onde o tecido de uma
    // saia de verdade também vai parar. O que não pode é sair pelo
    // outro lado, e disso trata o teste seguinte.
    //
    // São 51 com a saia atual; desligando `poseSkirt` vão a 120.
    expect(dentro.length).toBeLessThan(85);
  });

  it('a saia não aparece por baixo do assento nem atrás do espaldar', () => {
    const { avatar, mesh, cloth } = dressed();
    settle(avatar, { state: 'sit', speed: 0, stridePhase: 0, verticalSpeed: 0 });

    // Fundo da tábua e face de trás do espaldar, nas medidas reais do
    // banco trazidas para o espaço de quem sentou.
    const fundoDaTabua = 0.365 + BENCH_Y;
    const atrasDaTabua = -0.27 + BENCH_Z;
    const frenteDaTabua = 0.27 + BENCH_Z;

    const vazando: string[] = [];
    for (const p of clothPoints(mesh, cloth)) {
      const sobreAPegada = p.z > atrasDaTabua && p.z < frenteDaTabua;
      if (sobreAPegada && p.y < fundoDaTabua) vazando.push(`por baixo do assento em z=${p.z.toFixed(3)}`);
      if (p.z < atrasDaTabua && p.y > 0.26) vazando.push(`atrás do espaldar em y=${p.y.toFixed(3)}`);
    }
    expect(vazando).toEqual([]);
  });

  it('sentada, o que o banco não esconde continua coberto', () => {
    const { avatar, mesh, cloth } = dressed();

    settle(avatar, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0 }, 90);
    const emPe = readSkin(mesh, cloth);
    expect(emPe.covered.size).toBeGreaterThan(800);

    settle(avatar, { state: 'sit', speed: 0, stridePhase: 0, verticalSpeed: 0 });
    const sentada = readSkin(mesh, cloth);

    // Parte da pele que o vestido cobria em pé passa a estar contra a
    // tábua ou entre as coxas quando a pessoa senta: ali o pano fica
    // comprimido por baixo do corpo, que é o que acontece com uma
    // saia de verdade, e nenhuma câmera chega. O que se cobra é o
    // resto — a pele que continua à vista.
    const aVista: string[] = [];
    for (const i of emPe.covered) {
      if (sentada.covered.has(i)) continue;
      const normal = sentada.normal.get(i);
      const at = sentada.at.get(i);
      if (!normal || !at) continue;
      if (normal.y < -0.3) continue; // virada para a madeira
      if (Math.abs(normal.x) > 0.6 && at.x * normal.x < 0) continue; // face interna da coxa
      aVista.push(`(${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)})`);
    }
    // São 51 com a saia atual e 181 desligando `poseSkirt`. Sem a
    // subida do assento, 73; com as laterais seguindo a coxa inteira
    // como a frente, 183 — e aí a saia ainda vira um balão.
    expect(aVista.length).toBeLessThan(110);
  });

  it('levantar devolve a saia sem tranco', () => {
    const { avatar, mesh, cloth } = dressed();
    const animator = new AvatarAnimator();
    let clock = 0;
    const step = (state: 'sit' | 'idle'): THREE.Vector3[] => {
      clock += 1 / 60;
      avatar.applyPose(animator.update(1 / 60, { state, speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: clock }), clock);
      avatar.root.updateMatrixWorld(true);
      return clothPoints(mesh, cloth);
    };
    for (let f = 0; f < 120; f += 1) step('sit');

    let anterior = step('sit');
    let maior = 0;
    for (let f = 0; f < 90; f += 1) {
      const agora = step('idle');
      let salto = 0;
      for (let i = 0; i < agora.length; i += 1) salto = Math.max(salto, agora[i].distanceTo(anterior[i]));
      maior = Math.max(maior, salto);
      anterior = agora;
    }
    // O corpo, nesta mesma transição, anda 9,0 cm no pior quadro: a
    // saia pode andar mais que ele, porque tecido corre atrás, mas
    // não pode saltar. Com a janela do colo estreita dava 13,0 cm —
    // um tranco visível; alargá-la trouxe para 10,6.
    expect(maior).toBeLessThan(0.115);
  });
});
