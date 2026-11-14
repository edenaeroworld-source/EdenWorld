import * as THREE from 'three';

/**
 * Medição de "o corpo está dentro da roupa?" numa malha posada.
 *
 * A pergunta parece simples e tem uma resposta enganosa. Comparar
 * raios por setor angular — o tecido está mais longe do eixo que a
 * perna? — erra sempre que a superfície entre duas colunas está
 * inclinada, que é o caso de uma saia em movimento: a coluna da
 * frente fica parada, a vizinha avança com a coxa, e o triângulo
 * entre as duas cobre um joelho que a comparação por setor jurava
 * estar de fora.
 *
 * O teste honesto é de paridade: parte-se do ponto, lança-se um raio
 * horizontal para fora e contam-se as travessias pelo tecido. Ímpar,
 * o ponto está dentro; par, está fora. Vale para superfície aberta —
 * uma saia não tem tampa nem fundo —, porque um ponto abaixo da barra
 * simplesmente não cruza nada, que é exatamente a resposta certa.
 */

/** Uma superfície de pano, já posada, pronta para ser consultada. */
export interface ClothVolume {
  /** Triângulos, três vértices por entrada. */
  readonly tris: readonly THREE.Vector3[];
  /** A barra, ordenada por azimute: a borda livre de baixo. */
  readonly hem: readonly THREE.Vector3[];
}

/**
 * O ponto está **radialmente além** do pano, naquela altura?
 *
 * A paridade diz se o ponto está fora da superfície, mas "fora" tem
 * dois sentidos muito diferentes para uma peça aberta embaixo: a pele
 * que furou o tecido e aparece, e a pele que está debaixo da saia,
 * entre as pernas, escondida de qualquer ângulo. As duas dão
 * paridade par; só a primeira é defeito, e o que as separa é a
 * distância ao eixo. Quem está além do pano aparece; quem está aquém
 * está embaixo dele.
 *
 * Devolve `false` também quando não há pano nenhum naquela altura e
 * naquele azimute: aí o ponto passou da barra, que é o que uma perna
 * faz quando a passada abre.
 */
export function beyondCloth(cloth: ClothVolume, point: THREE.Vector3): boolean {
  const target = Math.atan2(point.z, point.x);
  const radius = Math.hypot(point.x, point.z);
  let reach = -1;
  for (const v of cloth.tris) {
    if (Math.abs(v.y - point.y) > 0.025) continue;
    let d = Math.abs(Math.atan2(v.z, v.x) - target);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d > 0.26) continue;
    reach = Math.max(reach, Math.hypot(v.x, v.z));
  }
  return reach >= 0 && radius > reach;
}

/**
 * A altura da barra no azimute de um ponto.
 *
 * Serve para separar duas coisas que a paridade sozinha confunde: a
 * perna que **atravessou** o pano e a perna que **saiu por baixo
 * dele**. As duas aparecem como "fora do tecido"; só a primeira é
 * defeito. Uma saia tem uma abertura embaixo — é por ela que a perna
 * sai quando a passada abre, e exigir o contrário seria exigir uma
 * roupa que não existe.
 */
export function hemHeightAt(cloth: ClothVolume, point: THREE.Vector3): number {
  const hem = cloth.hem;
  if (hem.length === 0) return -Infinity;
  const target = Math.atan2(point.z, point.x);
  let best = 0;
  let bestDelta = Infinity;
  for (let i = 0; i < hem.length; i += 1) {
    let d = Math.abs(Math.atan2(hem[i].z, hem[i].x) - target);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  }
  // A barra é um anel fechado: a altura local é a média do vértice
  // mais próximo com os dois vizinhos, para não depender de cair
  // exatamente em cima de uma coluna.
  const prev = hem[(best - 1 + hem.length) % hem.length];
  const next = hem[(best + 1) % hem.length];
  return Math.max(hem[best].y, (prev.y + next.y) * 0.5);
}

/**
 * Direções de sonda.
 *
 * Um raio exatamente radial encontra arestas e vértices com
 * frequência desconfortável (a malha é um corpo de revolução, afinal)
 * e cada acerto de aresta é contado duas vezes ou nenhuma. A torção
 * lateral tira o raio desse alinhamento sem mudar a resposta.
 */
const SKEW = 0.1327;
/** Alturas de desempate: a resposta é o voto da maioria. */
const VOTE_OFFSETS = [-0.0023, 0.0017, 0.0051];

const EPS = 1e-9;

/** Möller–Trumbore. Devolve a distância ao longo do raio, ou `null`. */
function rayTriangle(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): number | null {
  const e1x = b.x - a.x;
  const e1y = b.y - a.y;
  const e1z = b.z - a.z;
  const e2x = c.x - a.x;
  const e2y = c.y - a.y;
  const e2z = c.z - a.z;
  const px = dir.y * e2z - dir.z * e2y;
  const py = dir.z * e2x - dir.x * e2z;
  const pz = dir.x * e2y - dir.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < EPS) return null;
  const inv = 1 / det;
  const tx = origin.x - a.x;
  const ty = origin.y - a.y;
  const tz = origin.z - a.z;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dir.x * qx + dir.y * qy + dir.z * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-6 ? t : null;
}

/** As distâncias em que um raio atravessa o pano, em ordem. */
function crossings(cloth: ClothVolume, origin: THREE.Vector3, dir: THREE.Vector3): number[] {
  const out: number[] = [];
  for (let i = 0; i < cloth.tris.length; i += 3) {
    const t = rayTriangle(origin, dir, cloth.tris[i], cloth.tris[i + 1], cloth.tris[i + 2]);
    if (t !== null) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

const DIR = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();

/**
 * Quanto de pano há entre o ponto e o lado de fora.
 *
 * Positivo: o ponto está coberto, e o número é a distância até o
 * tecido. Negativo: o ponto está exposto, e o número é a distância
 * que ele avançou para além do pano — ou seja, o tamanho do defeito.
 */
export function coverDepth(cloth: ClothVolume, point: THREE.Vector3): number {
  const radial = Math.hypot(point.x, point.z) || 1e-6;
  let covered = 0;
  let best = 0;
  for (const dy of VOTE_OFFSETS) {
    DIR.set(point.x / radial - (SKEW * point.z) / radial, 0, point.z / radial + (SKEW * point.x) / radial).normalize();
    ORIGIN.set(point.x, point.y + dy, point.z);
    const hits = crossings(cloth, ORIGIN, DIR);
    if (hits.length % 2 === 1) {
      covered += 1;
      best = Math.max(best, hits[0]);
    }
  }
  if (covered >= 2) return Math.max(best, 0);
  // Exposto: o tamanho do defeito é a distância até o pano mais
  // próximo. Serve para a mensagem de falha dizer se o que escapou
  // foi um milímetro de vértice ou um joelho inteiro.
  let near = Infinity;
  for (const v of cloth.tris) {
    const d = (v.x - point.x) ** 2 + (v.y - point.y) ** 2 + (v.z - point.z) ** 2;
    if (d < near) near = d;
  }
  return -Math.sqrt(near);
}

/** Extrai os triângulos de um intervalo de vértices, já posados. */
export function clothFrom(mesh: THREE.SkinnedMesh, range: readonly [number, number], toLocal: THREE.Matrix4): ClothVolume {
  const index = mesh.geometry.getIndex();
  const pos = mesh.geometry.getAttribute('position');
  if (index === null) throw new Error('a malha precisa ser indexada');
  const cache = new Map<number, THREE.Vector3>();
  const at = (i: number): THREE.Vector3 => {
    let v = cache.get(i);
    if (v === undefined) {
      v = new THREE.Vector3().fromBufferAttribute(pos, i);
      mesh.applyBoneTransform(i, v);
      v.applyMatrix4(toLocal);
      cache.set(i, v);
    }
    return v;
  };
  // A barra é o anel mais baixo do perfil em espaço de bind: a
  // varredura começa por ela.
  let lowest = Infinity;
  for (let i = range[0]; i < range[1]; i += 1) lowest = Math.min(lowest, pos.getY(i));
  const hem: THREE.Vector3[] = [];
  for (let i = range[0]; i < range[1]; i += 1) {
    if (pos.getY(i) <= lowest + 1e-6) hem.push(at(i));
  }
  hem.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));

  const tris: THREE.Vector3[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    if (a < range[0] || a >= range[1]) continue;
    if (b < range[0] || b >= range[1]) continue;
    if (c < range[0] || c >= range[1]) continue;
    tris.push(at(a), at(b), at(c));
  }
  return { tris, hem };
}

/** Posa a malha e devolve os vértices no espaço do quadril. */
export function posedVertices(mesh: THREE.SkinnedMesh): { verts: THREE.Vector3[]; toLocal: THREE.Matrix4 } {
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const toLocal = mesh.skeleton.bones[0].matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const pos = mesh.geometry.getAttribute('position');
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i += 1) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, v);
    verts.push(v.applyMatrix4(toLocal));
  }
  return { verts, toLocal };
}

/** Acha a `SkinnedMesh` dentro de um avatar. */
export function skinnedOf(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  if (found === null) throw new Error('avatar sem malha');
  return found;
}
