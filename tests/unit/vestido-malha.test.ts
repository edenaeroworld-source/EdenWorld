// @vitest-environment happy-dom
/**
 * O vestido no quadril: a malha, a costura e o que ela cobre.
 *
 * O defeito que originou estes testes aparecia parado, de frente: a
 * pele da coxa cortava a saia nos dois lados. A causa não era normal
 * invertida, vértice solto nem peso de esqueleto — era medida. A saia
 * era descrita em múltiplos de `hipWidth`, o raio da **pelve**; mas
 * na altura do quadril quem forma a silhueta são as **coxas**, que
 * ficam deslocadas `legX` do eixo. A roupa nascia 3,9 cm mais estreita
 * que o corpo e o corpo passava por ela.
 *
 * Daí a forma destes testes: um mede a malha (continuidade, costura,
 * ausência de buracos), outro mede o encontro entre roupa e corpo em
 * todos os estados de movimento que o jogo sabe produzir.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Avatar } from '../../src/player/Avatar';
import { AvatarAnimator, Ch, type Pose } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import type { MotionState } from '../../src/player/PlayerMotor';
import { DEFAULT_PROPORTIONS, type BodyProportions } from '../../src/player/body/BodyProportions';
import { type ClothVolume, beyondCloth, clothFrom, coverDepth, posedVertices, skinnedOf } from '../helpers/cloth';

/** Ossos cujos vértices são "corpo" para efeito de cobertura. */
const HIPS = 0;
const THIGH_L = 7;
const THIGH_R = 9;

function dressed(proportions: BodyProportions = DEFAULT_PROPORTIONS): {
  avatar: Avatar;
  mesh: THREE.SkinnedMesh;
  range: [number, number];
} {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' }, proportions);
  const mesh = skinnedOf(avatar.root);
  const range = mesh.geometry.userData.parts.saia as [number, number];
  return { avatar, mesh, range };
}

/**
 * A faixa que a saia tem de cobrir: do alto do quadril até 6 cm
 * acima da barra.
 *
 * O limite de baixo não é covardia, é a definição da peça. Uma saia
 * termina, e abaixo da barra a perna aparece — é para isso que serve
 * a abertura. Um vértice da coxa que desliza para fora por baixo da
 * barra não é rasgo nenhum; rasgo é o que atravessa o pano. Vigiar a
 * faixa inteira até a barra faria o teste reprovar justamente o
 * comportamento correto de um vestido.
 */
const BAND_TOP = 0.02;
const BAND_BOTTOM = -0.3;

/**
 * O ponto escapou **através** do pano?
 *
 * Duas perguntas, e as duas precisam dizer que sim. A paridade
 * responde se o ponto está fora da superfície; o alcance responde se
 * ele está além dela ou debaixo dela. Exigir as duas evita os dois
 * erros opostos: o teste que aceita um joelho atravessado porque o
 * setor vizinho tinha pano, e o teste que reprova a perna que apenas
 * saiu pela abertura da saia, como toda saia permite.
 */
function piercesCloth(cloth: ClothVolume, point: THREE.Vector3): boolean {
  if (coverDepth(cloth, point) > 0) return false;
  return beyondCloth(cloth, point);
}

/**
 * Os vértices de corpo que a saia tem de manter cobertos.
 *
 * Só corpo: a varredura para onde a saia começa, senão o teste
 * cobraria do tecido que ele estivesse dentro de si mesmo.
 */
function watchedVertices(mesh: THREE.SkinnedMesh, verts: readonly THREE.Vector3[], bodyEnd: number): number[] {
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const out: number[] = [];
  for (let i = 0; i < bodyEnd; i += 1) {
    const bone = skinIndex.getX(i);
    if (bone !== HIPS && bone !== THIGH_L && bone !== THIGH_R) continue;
    const v = verts[i];
    if (v.y > BAND_TOP || v.y < BAND_BOTTOM) continue;
    if (Math.hypot(v.x, v.z) < 0.05) continue;
    out.push(i);
  }
  return out;
}

function restPose(): Pose {
  const animator = new AvatarAnimator();
  return animator.update(1 / 60, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 0 });
}

describe('malha do vestido', () => {
  it('a saia é uma superfície só, sem fenda entre os lados', () => {
    const { mesh, range } = dressed();
    const index = mesh.geometry.getIndex()!;
    const [start, end] = range;

    // Une os vértices da saia que compartilham triângulo. Se as
    // metades esquerda e direita fossem peças separadas — a "fenda no
    // centro do quadril" do relato — sobrariam dois conjuntos.
    const parent = new Map<number, number>();
    const find = (a: number): number => {
      let r = a;
      while (parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    for (let i = start; i < end; i += 1) parent.set(i, i);

    const edges = new Map<string, number>();
    let triangles = 0;
    for (let i = 0; i < index.count; i += 3) {
      const t = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (t.some((v) => v < start || v >= end)) continue;
      triangles += 1;
      for (let k = 0; k < 3; k += 1) {
        const a = t[k];
        const b = t[(k + 1) % 3];
        parent.set(find(a), find(b));
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }

    expect(triangles).toBeGreaterThan(100);

    // Um só conjunto conexo: a saia é uma peça, não duas abas.
    const roots = new Set([...parent.keys()].map(find));
    expect(roots.size).toBe(1);

    // Quantos vértices tem cada anel: o perfil é um corpo de revolução.
    const pos = mesh.geometry.getAttribute('position');
    const rings = new Set<number>();
    for (let i = start; i < end; i += 1) rings.add(Math.round(pos.getY(i) * 1e5));
    const segments = (end - start) / rings.size;
    expect(Number.isInteger(segments)).toBe(true);

    // Toda aresta é de dois triângulos, menos as duas bordas livres —
    // barra e cintura —, que têm um anel de arestas cada. Aresta
    // sobrando no meio do pano é buraco; aresta de três triângulos é
    // malha não-manifold. Nem uma nem outra pode existir.
    const boundary = [...edges.values()].filter((n) => n === 1).length;
    const nonManifold = [...edges.values()].filter((n) => n > 2).length;
    expect(nonManifold).toBe(0);
    expect(boundary).toBe(2 * segments);
  });

  it('nenhum vértice da saia é duplicado nem degenerado', () => {
    const { mesh, range } = dressed();
    const pos = mesh.geometry.getAttribute('position');
    const seen = new Map<string, number>();
    for (let i = range[0]; i < range[1]; i += 1) {
      const key = `${pos.getX(i).toFixed(5)}|${pos.getY(i).toFixed(5)}|${pos.getZ(i).toFixed(5)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicated = [...seen.values()].filter((n) => n > 1).length;
    expect(duplicated).toBe(0);
  });

  it('as normais da saia apontam para fora', () => {
    const { mesh, range } = dressed();
    const geometry = mesh.geometry;
    const normal = geometry.getAttribute('normal');
    const pos = geometry.getAttribute('position');
    let outward = 0;
    let total = 0;
    for (let i = range[0]; i < range[1]; i += 1) {
      // O eixo da saia é vertical: para fora é para longe dele.
      const radial = new THREE.Vector2(pos.getX(i), pos.getZ(i));
      if (radial.length() < 1e-4) continue;
      radial.normalize();
      total += 1;
      if (radial.x * normal.getX(i) + radial.y * normal.getZ(i) > 0) outward += 1;
    }
    expect(total).toBeGreaterThan(100);
    expect(outward).toBe(total);
  });
});

describe('a saia veste o corpo', () => {
  it('em repouso, nenhuma parte do quadril ou da coxa fica de fora', () => {
    const { avatar, mesh, range } = dressed();
    avatar.applyPose(restPose());
    const { verts, toLocal } = posedVertices(mesh);
    const cloth = clothFrom(mesh, range, toLocal);

    const exposed: string[] = [];
    let covered = 0;
    for (const i of watchedVertices(mesh, verts, range[0])) {
      const v = verts[i];
      if (!piercesCloth(cloth, v)) covered += 1;
      else exposed.push(`(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`);
    }

    expect(covered).toBeGreaterThan(300);
    expect(exposed).toEqual([]);
  });

  it.each([
    ['walk', 2.3],
    ['run', 5.6],
    ['jump', 3.2],
    ['fall', 3.2],
    ['swim', 1.8],
    ['stairDown', 1.6],
  ] as const)('em movimento (%s) o que estava coberto continua coberto', (state, speed) => {
    const { avatar, mesh, range } = dressed();

    avatar.applyPose(restPose());
    const rest = posedVertices(mesh);
    const restCloth = clothFrom(mesh, range, rest.toLocal);
    const watched = watchedVertices(mesh, rest.verts, range[0]);
    expect(watched.length).toBeGreaterThan(300);
    for (const i of watched) expect(coverDepth(restCloth, rest.verts[i])).toBeGreaterThan(0);

    const animator = new AvatarAnimator();
    const failures: string[] = [];
    for (let f = 0; f < 48; f += 1) {
      const pose = animator.update(1 / 30, {
        state: state as MotionState,
        speed,
        stridePhase: f * 0.37,
        verticalSpeed: state === 'jump' ? 3 : state === 'fall' ? -3 : 0,
        elapsed: f / 30,
      });
      avatar.applyPose(pose, f / 30);
      const posed = posedVertices(mesh);
      const cloth = clothFrom(mesh, range, posed.toLocal);
      for (const i of watched) {
        const v = posed.verts[i];
        if (piercesCloth(cloth, v)) {
          const depth = coverDepth(cloth, v);
          failures.push(`quadro ${f}: (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}) ${(depth * 100).toFixed(1)}cm fora`);
        }
      }
      if (failures.length > 0) break;
    }
    expect(failures).toEqual([]);
  });

  it('com as pernas abertas e o tronco torcido, o tecido continua à frente da pele', () => {
    const { avatar, mesh, range } = dressed();

    avatar.applyPose(restPose());
    const rest = posedVertices(mesh);
    const restCloth = clothFrom(mesh, range, rest.toLocal);
    const watched = watchedVertices(mesh, rest.verts, range[0]);
    for (const i of watched) expect(coverDepth(restCloth, rest.verts[i])).toBeGreaterThan(0);

    // Mudança de direção: o quadril gira e as coxas abrem mais do que
    // em qualquer passada. É o pior caso para uma peça presa ao osso
    // do quadril.
    const failures: string[] = [];
    for (const spread of [0.12, 0.2, 0.26]) {
      const pose = restPose();
      pose[Ch.TorsoY] = 0.35;
      pose[Ch.LegLZ] = spread;
      pose[Ch.LegRZ] = -spread;
      pose[Ch.LegLX] = -0.3;
      pose[Ch.LegRX] = 0.18;
      avatar.applyPose(pose);
      const posed = posedVertices(mesh);
      const cloth = clothFrom(mesh, range, posed.toLocal);
      for (const i of watched) {
        const v = posed.verts[i];
        if (piercesCloth(cloth, v)) {
          const depth = coverDepth(cloth, v);
          failures.push(`abertura ${spread}: (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}) ${(depth * 100).toFixed(1)}cm fora`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it.each([
    ['walk', 2.3],
    ['run', 5.6],
  ] as const)('o tecido não rasga na costura (%s)', (state, speed) => {
    const { avatar, mesh, range } = dressed();
    const index = mesh.geometry.getIndex()!;
    const pos = mesh.geometry.getAttribute('position');

    const seen = new Set<string>();
    const edges: [number, number][] = [];
    for (let i = 0; i < index.count; i += 3) {
      const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (tri.some((v) => v < range[0] || v >= range[1])) continue;
      for (let k = 0; k < 3; k += 1) {
        const a = tri[k];
        const b = tri[(k + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([a, b]);
      }
    }
    const rest = edges.map(([a, b]) =>
      Math.hypot(pos.getX(a) - pos.getX(b), pos.getY(a) - pos.getY(b), pos.getZ(a) - pos.getZ(b)),
    );

    // Duas colunas vizinhas da saia não podem ser puxadas por pernas
    // opostas: o pano entre elas vira um leque esticado, e é esse
    // estiramento que a vista lê como a peça partida ao meio. A
    // mistura em volta da costura (`SEAM_BLEND`) existe para isso.
    //
    // Medido: com a mistura, 1,61× caminhando e 2,07× correndo; sem
    // ela, 2,61× e 3,51×. O limite fica no meio, onde separa um
    // tecido que acompanha de um tecido que rasga.
    const animator = new AvatarAnimator();
    let worst = 1;
    let where = '';
    for (let f = 0; f < 48; f += 1) {
      avatar.applyPose(
        animator.update(1 / 30, { state, speed, stridePhase: f * 0.37, verticalSpeed: 0, elapsed: f / 30 }),
      );
      const posed = posedVertices(mesh);
      for (let k = 0; k < edges.length; k += 1) {
        if (rest[k] < 1e-5) continue;
        const ratio = posed.verts[edges[k][0]].distanceTo(posed.verts[edges[k][1]]) / rest[k];
        if (ratio > worst) {
          worst = ratio;
          where = `quadro ${f}, aresta ${edges[k][0]}–${edges[k][1]}`;
        }
      }
    }
    expect(worst, `estiramento máximo ${worst.toFixed(2)}× em ${where}`).toBeLessThan(2.4);
  });

  it('cobre o corpo nas proporções extremas, não só nas médias', () => {
    const extremes: [string, Partial<BodyProportions>][] = [
      ['quadril largo', { hips: 1.22 }],
      ['quadril estreito', { hips: 0.85 }],
      ['corpo largo', { hips: 1.22, build: 1, waist: 1.25 }],
      ['corpo estreito', { hips: 0.85, build: 0, waist: 0.8 }],
      ['pernas longas', { legLength: 1.1, hips: 1.1 }],
    ];
    for (const [name, override] of extremes) {
      const { avatar, mesh, range } = dressed({ ...DEFAULT_PROPORTIONS, ...override });
      avatar.applyPose(restPose());
      const { verts, toLocal } = posedVertices(mesh);
      const cloth = clothFrom(mesh, range, toLocal);
      const exposed: string[] = [];
      for (const i of watchedVertices(mesh, verts, range[0])) {
        const v = verts[i];
        if (piercesCloth(cloth, v)) exposed.push(`${name}: (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`);
      }
      expect(exposed).toEqual([]);
    }
  });
});
