// @vitest-environment happy-dom
/**
 * Marco N — o corpo é orgânico, e continua sendo.
 *
 * Estes testes guardam as propriedades que separam uma malha de carne
 * de um boneco articulado. Quase todos nasceram de um defeito real
 * visto durante o marco: normais invertidas, axila aberta, cunha entre
 * as coxas, peso de osso saltando na fronteira de uma rampa.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createOfficialAvatar, officialFingerprint, officialProportions } from '../../src/characters/CharacterModels';
import { getCharacter } from '../../src/characters/Pantheon';
import { Avatar } from '../../src/player/Avatar';
import { Ch, type Pose } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import {
  DEFAULT_PROPORTIONS,
  PROPORTION_RANGE,
  proportionsFingerprint,
  proportionsFor,
  sanitizeProportions,
} from '../../src/player/body/BodyProportions';
import { BONE_NAMES, BODY_DETAIL, type BodyDetailLevel } from '../../src/player/body/BodyRig';

function bodyOf(avatar: Avatar): THREE.SkinnedMesh {
  const mesh = avatar.root.getObjectByName('corpo') as THREE.SkinnedMesh;
  expect(mesh).toBeTruthy();
  return mesh;
}

/** Conta malhas desenháveis sob a raiz. */
function meshes(avatar: Avatar): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  avatar.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

describe('Marco N · a malha', () => {
  it('é uma pele só, indexada, e não um monte de peças', () => {
    const avatar = new Avatar();
    const list = meshes(avatar);
    // Corpo, rosto e halo. O corpo antigo tinha treze peças rígidas.
    expect(list.length).toBeLessThanOrEqual(3);
    const body = bodyOf(avatar);
    expect(body.isSkinnedMesh).toBe(true);
    expect(body.geometry.getIndex()).not.toBeNull();
    avatar.dispose();
  });

  it('compartilha vértices entre faces — é isso que suaviza o sombreamento', () => {
    // O defeito original: `toNonIndexed()` duplicava cada vértice por
    // face, então `computeVertexNormals()` não tinha o que mediar e
    // toda aresta virava quina. A razão vértices/triângulo denuncia.
    const body = bodyOf(new Avatar());
    const triangles = body.geometry.getIndex()!.count / 3;
    const vertices = body.geometry.getAttribute('position').count;
    expect(vertices / triangles).toBeLessThan(1.2);
  });

  it('nenhuma normal é degenerada', () => {
    const body = bodyOf(new Avatar());
    const normals = body.geometry.getAttribute('normal');
    const n = new THREE.Vector3();
    for (let i = 0; i < normals.count; i += 1) {
      n.set(normals.getX(i), normals.getY(i), normals.getZ(i));
      expect(n.length()).toBeCloseTo(1, 3);
    }
  });

  it('nenhum membro tem a superfície virada para dentro', () => {
    // Um membro descrito da ponta para a raiz sai com a varredura ao
    // contrário e as normais apontando para o eixo: na tela ele acende
    // escuro, como se vivesse na sombra. Olhando o corpo inteiro o
    // defeito se dilui — por isso a conta é **por osso**.
    const avatar = new Avatar();
    const body = bodyOf(avatar);
    const normals = body.geometry.getAttribute('normal');
    const position = body.geometry.getAttribute('position');
    const index = body.geometry.getAttribute('skinIndex');
    const weight = body.geometry.getAttribute('skinWeight');

    // O eixo de cada membro sai do rig, não de um número escrito à mão.
    const axis = new Float32Array(BONE_NAMES.length);
    const world = new THREE.Vector3();
    avatar.root.updateMatrixWorld(true);
    BONE_NAMES.forEach((name, i) => {
      const bone = avatar.root.getObjectByName(name);
      axis[i] = bone ? bone.getWorldPosition(world).x / avatar.proportions.height : 0;
    });

    const out = new Map<number, number>();
    const total = new Map<number, number>();
    for (let i = 0; i < normals.count; i += 1) {
      const bone = weight.getY(i) > weight.getX(i) ? index.getY(i) : index.getX(i);
      // Só membros. O tronco e a pelve têm tampas e um vão entre as
      // pernas: ali a normal aponta para baixo, não para fora, e a
      // conta radial não diz nada.
      if (bone < 3 || bone > 10) continue;
      // Distância ao eixo do **próprio** osso, não ao do corpo: um
      // braço caído vive longe do centro e falsearia a conta radial.
      const rx = position.getX(i) - axis[bone];
      const rz = position.getZ(i);
      if (Math.hypot(rx, rz) < 0.03) continue;
      total.set(bone, (total.get(bone) ?? 0) + 1);
      if (normals.getX(i) * rx + normals.getZ(i) * rz > 0) out.set(bone, (out.get(bone) ?? 0) + 1);
    }
    for (const [bone, count] of total) {
      if (count < 60) continue;
      const fraction = (out.get(bone) ?? 0) / count;
      // Meio a meio é o limiar porque um membro honesto fica entre 70%
      // e 95% (a mão é uma pá e o pé tem sola: nem toda normal deles
      // aponta para fora do eixo), enquanto um membro invertido dá
      // **zero**. A separação é larga; o número exato, não.
      expect(fraction, `osso ${bone} (${BONE_NAMES[bone]})`).toBeGreaterThan(0.5);
    }
    avatar.dispose();
  });

  it('carrega os atributos de que os shaders dependem', () => {
    const body = bodyOf(new Avatar());
    for (const name of ['position', 'normal', 'color', 'skinIndex', 'skinWeight', 'aZone', 'aMorphOrigin']) {
      expect(body.geometry.getAttribute(name), name).toBeTruthy();
    }
  });

  it('tem as quatro zonas de deformação representadas', () => {
    const zones = new Set<number>();
    const attribute = bodyOf(new Avatar()).geometry.getAttribute('aZone');
    for (let i = 0; i < attribute.count; i += 1) zones.add(attribute.getX(i));
    expect([...zones].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('Marco N · o esqueleto', () => {
  it('mantém os onze ossos, com os nomes que os outros sistemas procuram', () => {
    const avatar = new Avatar();
    for (const name of BONE_NAMES) {
      expect(avatar.root.getObjectByName(name), name).toBeTruthy();
    }
    // Dois testes antigos dependem deste, por nome.
    expect(avatar.root.getObjectByName('braco-e')).toBeTruthy();
    avatar.dispose();
  });

  it('a matriz de bind é a identidade — o corpo é ligado fora da cena', () => {
    const body = bodyOf(new Avatar());
    expect(body.bindMatrix.equals(new THREE.Matrix4())).toBe(true);
  });

  it('os pesos de cada vértice somam um', () => {
    const weight = bodyOf(new Avatar()).geometry.getAttribute('skinWeight');
    for (let i = 0; i < weight.count; i += 1) {
      const sum = weight.getX(i) + weight.getY(i) + weight.getZ(i) + weight.getW(i);
      expect(sum).toBeCloseTo(1, 4);
    }
  });

  it('as articulações repartem peso entre dois ossos', () => {
    // Sem vértices de peso repartido não há dobra suave: é a definição
    // geométrica da dobradiça que o marco veio eliminar.
    const weight = bodyOf(new Avatar()).geometry.getAttribute('skinWeight');
    let blended = 0;
    for (let i = 0; i < weight.count; i += 1) if (weight.getY(i) > 0.01) blended += 1;
    expect(blended).toBeGreaterThan(weight.count * 0.02);
  });
});

/**
 * Mede a linha de centro de um membro, anel por anel.
 *
 * Agrupa os vértices do braço por altura de bind, transforma cada um
 * pela pele e tira a média: o resultado é a curva que o membro
 * descreve. O ângulo entre segmentos vizinhos diz se a dobra é uma
 * curva ou um vinco.
 */
function armCenterline(avatar: Avatar): THREE.Vector3[] {
  const body = bodyOf(avatar);
  const position = body.geometry.getAttribute('position');
  const index = body.geometry.getAttribute('skinIndex');
  const weight = body.geometry.getAttribute('skinWeight');
  const rings = new Map<string, THREE.Vector3[]>();
  const v = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    // Só o braço esquerdo: ossos 3 (braço) e 4 (antebraço).
    let share = 0;
    for (const [bone, w] of [
      [index.getX(i), weight.getX(i)],
      [index.getY(i), weight.getY(i)],
    ]) {
      if (bone === 3 || bone === 4) share += w;
    }
    if (share < 0.999) continue;
    const y = position.getY(i);
    if (y < -0.03 || y > 0.44) continue; // nem a mão, nem o deltoide
    v.set(position.getX(i), y, position.getZ(i));
    body.applyBoneTransform(i, v);
    const key = y.toFixed(5);
    if (!rings.has(key)) rings.set(key, []);
    rings.get(key)!.push(v.clone());
  }

  return [...rings.entries()]
    .filter(([, members]) => members.length >= 16)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([, members]) => members.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(members.length));
}

/** Maior virada, em graus, entre segmentos vizinhos de uma linha. */
function sharpestTurn(line: THREE.Vector3[]): number {
  let worst = 0;
  for (let i = 1; i + 1 < line.length; i += 1) {
    const a = new THREE.Vector3().subVectors(line[i], line[i - 1]);
    const b = new THREE.Vector3().subVectors(line[i + 1], line[i]);
    if (a.length() < 1e-6 || b.length() < 1e-6) continue;
    worst = Math.max(worst, a.angleTo(b) * (180 / Math.PI));
  }
  return worst;
}

describe('Marco N · o cotovelo dobra como carne', () => {
  it('em repouso o braço é reto', () => {
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'esportivo' });
    avatar.applyPose(new Float32Array(Ch.Count) as Pose);
    avatar.root.updateMatrixWorld(true);
    const line = armCenterline(avatar);
    expect(line.length).toBeGreaterThan(12);
    expect(sharpestTurn(line)).toBeLessThan(1);
    avatar.dispose();
  });

  it('dobrado a 90°, a curva se reparte por vários anéis', () => {
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'esportivo' });
    const pose = new Float32Array(Ch.Count) as Pose;
    pose[Ch.ForeL] = -Math.PI / 2;
    avatar.applyPose(pose);
    avatar.root.updateMatrixWorld(true);

    const line = armCenterline(avatar);
    const turn = sharpestTurn(line);
    // Uma dobradiça concentraria os 90° num anel só. A rampa de cinco
    // pontos de controle espalha a virada; qualquer coisa acima de 35°
    // num anel já é um vinco visível na silhueta.
    expect(turn).toBeGreaterThan(2);
    expect(turn).toBeLessThan(35);

    // E a dobra chega aonde devia: a ponta do antebraço sai do eixo.
    const drift = Math.abs(line[line.length - 1].z - line[0].z);
    expect(drift).toBeGreaterThan(0.1);
    avatar.dispose();
  });
});

describe('Marco N · proporções', () => {
  it('o mesmo id devolve sempre o mesmo corpo', () => {
    const a = proportionsFor('suki', 0.97);
    const b = proportionsFor('suki', 0.97);
    expect(proportionsFingerprint(a)).toBe(proportionsFingerprint(b));
  });

  it('ids diferentes devolvem corpos diferentes', () => {
    const prints = new Set(
      ['suki', 'saturno', 'maze', 'aerion', 'haru', 'luma', 'cidadao:3', 'cidadao:11'].map((id) =>
        proportionsFingerprint(proportionsFor(id, 1)),
      ),
    );
    expect(prints.size).toBeGreaterThan(6);
  });

  it('toda variação cabe na faixa declarada', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const p = proportionsFor(`teste-${seed}`, 1);
      for (const [field, [min, max]] of Object.entries(PROPORTION_RANGE)) {
        const value = p[field as keyof typeof p];
        expect(value, `${field} do ${seed}`).toBeGreaterThanOrEqual(min);
        expect(value, `${field} do ${seed}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('um save antigo, sem proporções, abre no corpo padrão', () => {
    // Campo a campo: um valor corrompido não contamina os vizinhos.
    const recovered = sanitizeProportions({ shoulders: Number.NaN, waist: 99, hips: undefined } as never);
    expect(recovered.shoulders).toBe(DEFAULT_PROPORTIONS.shoulders);
    expect(recovered.hips).toBe(DEFAULT_PROPORTIONS.hips);
    expect(recovered.waist).toBeLessThanOrEqual(PROPORTION_RANGE.waist[1]);
    expect(sanitizeProportions(undefined as never)).toEqual(DEFAULT_PROPORTIONS);
  });

  it('corpos diferentes produzem malhas diferentes, no mesmo rig', () => {
    const slim = new Avatar(DEFAULT_APPEARANCE, proportionsFor('alguem', 1));
    const broad = new Avatar(DEFAULT_APPEARANCE, proportionsFor('outro', 1));
    const width = (avatar: Avatar) => {
      const box = new THREE.Box3().setFromObject(bodyOf(avatar));
      return box.max.x - box.min.x;
    };
    expect(width(slim)).not.toBeCloseTo(width(broad), 3);
    // Mas o esqueleto continua o mesmo, osso por osso.
    for (const name of BONE_NAMES) expect(broad.root.getObjectByName(name)).toBeTruthy();
    slim.dispose();
    broad.dispose();
  });
});

describe('Marco N · níveis de detalhe', () => {
  const levels: BodyDetailLevel[] = ['alta', 'media', 'baixa'];

  it('menos detalhe é menos geometria, nunca outra silhueta', () => {
    const counts: number[] = [];
    const heights: number[] = [];
    for (const level of levels) {
      const avatar = new Avatar();
      avatar.setDetail(level);
      const body = bodyOf(avatar);
      counts.push(body.geometry.getAttribute('position').count);
      heights.push(new THREE.Box3().setFromObject(body).max.y);
      avatar.dispose();
    }
    expect(counts[0]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    // A altura do topo não muda: ninguém encolhe ao se afastar.
    expect(heights[1]).toBeCloseTo(heights[0], 2);
    expect(heights[2]).toBeCloseTo(heights[0], 2);
  });

  it('a malha baixa é mais leve que o avatar antigo inteiro', () => {
    // O corpo de treze peças tinha 6 496 triângulos e 18 405 vértices.
    const avatar = new Avatar();
    avatar.setDetail('baixa');
    const body = bodyOf(avatar);
    expect(body.geometry.getAttribute('position').count).toBeLessThan(18_405);
    expect(body.geometry.getIndex()!.count / 3).toBeLessThanOrEqual(6_496 * 1.1);
    avatar.dispose();
  });

  it('trocar de nível preserva os ossos e o estado de silhueta', () => {
    const avatar = new Avatar();
    avatar.setMorph(1.4, 0.9);
    avatar.setGestation(0.5);
    avatar.setDetail('media');
    expect(avatar.detail).toBe('media');
    expect(avatar.root.getObjectByName('antebraco-d')).toBeTruthy();
    // Os uniformes vivem no avatar, não na malha: reconstruir a
    // geometria não pode zerar a silhueta de ninguém.
    expect(avatar.morph.bust).toBeCloseTo(1.4, 3);
    expect(avatar.morph.curve).toBeCloseTo(0.9, 3);
    expect(avatar.gestation).toBeCloseTo(0.5, 3);
    avatar.dispose();
  });

  it('cada nível declara mais lados que o seguinte', () => {
    expect(BODY_DETAIL.alta.segments).toBeGreaterThan(BODY_DETAIL.media.segments);
    expect(BODY_DETAIL.media.segments).toBeGreaterThan(BODY_DETAIL.baixa.segments);
  });
});

describe('Marco N · identidade entre regiões', () => {
  it('o corpo oficial sai do id, não do lugar', () => {
    for (const id of ['suki', 'saturno', 'maze', 'aerion', 'amara']) {
      const character = getCharacter(id);
      if (!character) continue;
      const proportions = officialProportions(id);
      expect(proportions).toBeTruthy();
      expect(proportionsFingerprint(proportions!)).toBe(
        proportionsFingerprint(proportionsFor(id, character.appearance.height)),
      );
    }
  });

  it('a impressão digital oficial inclui o corpo', () => {
    const print = officialFingerprint('suki');
    expect(print).toContain(proportionsFingerprint(officialProportions('suki')!));
  });

  it('dois pedidos do mesmo personagem produzem o mesmo corpo', () => {
    // É o teste de Aurora City contra Rosas Park: duas construções
    // independentes, nenhuma cópia de valores entre elas.
    const aurora = createOfficialAvatar('suki')!;
    const rosas = createOfficialAvatar('suki')!;
    const count = (a: Avatar) => bodyOf(a).geometry.getAttribute('position').count;
    expect(count(aurora)).toBe(count(rosas));
    const box = (a: Avatar) => new THREE.Box3().setFromObject(bodyOf(a));
    expect(box(aurora).max.y).toBeCloseTo(box(rosas).max.y, 6);
    aurora.dispose();
    rosas.dispose();
  });

  it('Amara continua gestante em qualquer região', () => {
    const amara = createOfficialAvatar('amara');
    expect(amara).toBeTruthy();
    expect(getCharacter('amara')?.gestation).toBe(1);
    amara!.dispose();
  });
});

describe('Marco N · animação', () => {
  it('todas as poses mantêm a malha finita e o corpo inteiro', () => {
    const avatar = new Avatar();
    const body = bodyOf(avatar);
    const v = new THREE.Vector3();
    const position = body.geometry.getAttribute('position');

    for (const bend of [0, -0.8, -1.9]) {
      const pose = new Float32Array(Ch.Count) as Pose;
      pose[Ch.ForeL] = bend;
      pose[Ch.ForeR] = bend;
      pose[Ch.LegLX] = bend * 0.5;
      pose[Ch.ShinL] = -bend;
      avatar.applyPose(pose);
      avatar.root.updateMatrixWorld(true);
      for (let i = 0; i < position.count; i += 37) {
        v.set(position.getX(i), position.getY(i), position.getZ(i));
        body.applyBoneTransform(i, v);
        expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
        expect(v.length()).toBeLessThan(5);
      }
    }
    avatar.dispose();
  });

  it('os braços não atravessam o tronco quando descem', () => {
    const avatar = new Avatar();
    const body = bodyOf(avatar);
    avatar.applyPose(new Float32Array(Ch.Count) as Pose);
    avatar.root.updateMatrixWorld(true);

    const index = body.geometry.getAttribute('skinIndex');
    const weight = body.geometry.getAttribute('skinWeight');
    const position = body.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let inside = 0;
    let arm = 0;
    for (let i = 0; i < position.count; i += 1) {
      const dominant = weight.getY(i) > weight.getX(i) ? index.getY(i) : index.getX(i);
      if (dominant !== 3 && dominant !== 4) continue;
      arm += 1;
      v.set(position.getX(i), position.getY(i), position.getZ(i));
      body.applyBoneTransform(i, v);
      // O tronco é bem mais estreito que a linha dos ombros; um braço
      // caído que invada o eixo central está dentro do peito.
      if (Math.abs(v.x) < 0.05) inside += 1;
    }
    expect(arm).toBeGreaterThan(100);
    expect(inside / arm).toBeLessThan(0.02);
    avatar.dispose();
  });
});
