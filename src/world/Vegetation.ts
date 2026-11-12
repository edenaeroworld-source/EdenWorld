import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { TAU, type Rng, createRng, pick, randRange } from '../utils/math';
import { blob, mergeAll, paintVerticalGradient } from '../cities/aurora-city/Kit';
import type { HeightField } from './HeightField';
import type { MaterialLibrary } from './Materials';
import { DETAIL_LAYER } from './Water';

export type TreeKind = 'frondosa' | 'palmeira' | 'cipreste' | 'bananeira';

export interface TreePlacement {
  kind: TreeKind;
  x: number;
  z: number;
  /** Altura da base; se omitida, usa o terreno. */
  y?: number;
  scale: number;
  rotation: number;
  color: THREE.Color;
  /** Registra colisão do tronco (padrão: sim, exceto bananeiras). */
  collide?: boolean;
}

export interface BushPlacement {
  x: number;
  z: number;
  y?: number;
  scale: number;
  color: THREE.Color;
}

export interface FlowerPatch {
  x: number;
  z: number;
  radius: number;
  /** Flores por metro quadrado. */
  density: number;
  palette: readonly number[];
  luminous: boolean;
  y?: number;
}

/** Predicado: o ponto (com folga `radius`) pode receber vegetação? */
export type GroundPredicate = (x: number, z: number, radius: number) => boolean;

export const LEAF_GREENS = [0x3fae49, 0x57c24f, 0x2f9e58, 0x79d65a, 0x46b86a] as const;
export const BLOSSOM_COLORS = [0xff9fc6, 0xffffff, 0xffd95a, 0xffb3d9, 0xc9a2ff] as const;
export const PALM_GREENS = [0x49b84f, 0x62c956, 0x3aa85a] as const;
export const BUSH_GREENS = [0x3aa64b, 0x58c455, 0x2f9a5c, 0x7bd35c, 0x45b073] as const;

/* ------------------------------------------------------------------ */
/* Geometrias                                                          */
/* ------------------------------------------------------------------ */

/** Folha arqueada (palmeiras e plantas tropicais), nascendo na origem em direção a +Z. */
function frondGeometry(length: number, width: number, lift: number, droop: number, segments = 6): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, length, 2, segments);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const side = position.getX(i) / (width / 2); // -1..1
    const t = position.getY(i) / length + 0.5; // 0..1 ao longo da folha
    const taper = Math.sin(Math.min(1, t * 1.05 + 0.08) * Math.PI) * 0.9 + 0.1;
    const out = length * t;
    // Arco: sobe e depois pende com a gravidade.
    const y = lift * Math.sin(t * Math.PI * 0.62) * length - droop * t * t * length;
    position.setXYZ(i, side * (width / 2) * taper, y - Math.abs(side) * width * 0.22 * taper, out);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function buildBroadleaf(rng: Rng): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.17, 0.34, 3.4, 8, 1, true);
  trunk.translate(0, 1.7, 0);
  const parts: THREE.BufferGeometry[] = [];
  const main = blob(2.25, 1, rng, 0.12);
  main.scale(1, 0.86, 1);
  main.translate(0, 4.7, 0);
  parts.push(main);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + rng() * 0.6;
    const part = blob(randRange(rng, 1.35, 1.7), 1, rng, 0.14);
    part.scale(1, 0.82, 1);
    part.translate(Math.cos(a) * 1.5, randRange(rng, 3.5, 4.3), Math.sin(a) * 1.5);
    parts.push(part);
  }
  const canopy = mergeAll(parts);
  paintVerticalGradient(canopy, 0x8f9a8f, 0xffffff, 2.6, 6.6);
  return { trunk, canopy };
}

function buildCypress(rng: Rng): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.16, 0.22, 1.4, 7, 1, true);
  trunk.translate(0, 0.7, 0);
  const canopy = blob(1, 2, rng, 0.07);
  const position = canopy.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    // Perfil em chama: mais largo embaixo, afilado no topo.
    const k = y > 0 ? 1 - y * 0.42 : 1;
    position.setXYZ(i, position.getX(i) * 1.05 * k, y * 3.2 + 4.0, position.getZ(i) * 1.05 * k);
  }
  canopy.computeVertexNormals();
  const merged = mergeAll([canopy]);
  paintVerticalGradient(merged, 0x7f8f84, 0xffffff, 0.8, 7.2);
  return { trunk, canopy: merged };
}

function buildPalm(rng: Rng): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const height = 7.6;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.22, height * 0.35, 0.05),
    new THREE.Vector3(0.62, height * 0.72, 0.1),
    new THREE.Vector3(0.82, height, 0.12),
  ]);
  const trunk = new THREE.TubeGeometry(curve, 8, 0.2, 6, false);
  // Base mais larga.
  const tp = trunk.getAttribute('position');
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    if (y < 1.2) {
      const k = 1 + (1 - y / 1.2) * 0.55;
      tp.setX(i, tp.getX(i) * k);
      tp.setZ(i, tp.getZ(i) * k);
    }
  }
  trunk.computeVertexNormals();

  const parts: THREE.BufferGeometry[] = [];
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const upper = i % 2 === 0;
    const frond = frondGeometry(randRange(rng, 3.0, 3.7), 1.1, upper ? 0.42 : 0.2, upper ? 0.5 : 0.78, 5);
    frond.rotateY((i / fronds) * TAU + rng() * 0.3);
    frond.translate(0.82, height - 0.05, 0.12);
    parts.push(frond);
  }
  // Coração da copa.
  const heart = new THREE.IcosahedronGeometry(0.36, 0);
  heart.translate(0.82, height - 0.1, 0.12);
  parts.push(heart);
  const canopy = mergeAll(parts);
  paintVerticalGradient(canopy, 0x9fb09a, 0xffffff, height - 2.2, height + 1.4);
  return { trunk, canopy };
}

function buildBanana(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const leaf = frondGeometry(randRange(rng, 1.9, 2.6), 0.82, randRange(rng, 0.7, 1.0), randRange(rng, 0.25, 0.5), 5);
    leaf.rotateY((i / leaves) * TAU + rng() * 0.5);
    parts.push(leaf);
  }
  const canopy = mergeAll(parts);
  paintVerticalGradient(canopy, 0x8fa88f, 0xffffff, 0, 2.2);
  return canopy;
}

function buildBush(rng: Rng): THREE.BufferGeometry {
  const a = blob(0.62, 1, rng, 0.16);
  a.scale(1, 0.78, 1);
  a.translate(0, 0.42, 0);
  const b = blob(0.44, 0, rng, 0.12);
  b.scale(1, 0.8, 1);
  b.translate(0.45, 0.32, 0.2);
  const merged = mergeAll([a, b]);
  paintVerticalGradient(merged, 0x8a988a, 0xffffff, 0, 0.95);
  return merged;
}

function buildGrassTuft(rng: Rng): THREE.BufferGeometry {
  const blades = 9;
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const base = new THREE.Color(0xc4dcb4);
  const tip = new THREE.Color(0xffffee);
  for (let i = 0; i < blades; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * 0.5;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const facing = rng() * TAU;
    const half = randRange(rng, 0.03, 0.05);
    const height = randRange(rng, 0.18, 0.4);
    const lean = randRange(rng, 0.03, 0.16);
    const leanDir = rng() * TAU;
    const px = Math.cos(facing) * half;
    const pz = Math.sin(facing) * half;
    positions.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(leanDir) * lean, height, cz + Math.sin(leanDir) * lean);
    colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    // Normais para cima: a grama recebe a mesma luz do terreno.
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function buildFlowerCluster(rng: Rng): { stems: THREE.BufferGeometry; heads: THREE.BufferGeometry } {
  const stems: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [];
  const count = 2;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng();
    const r = randRange(rng, 0.1, 0.2);
    const height = randRange(rng, 0.32, 0.56);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const stem = new THREE.CylinderGeometry(0.012, 0.018, height, 3, 1, true);
    stem.translate(x, height / 2, z);
    stems.push(stem);

    // Corola: cone aberto invertido + miolo.
    const corolla = new THREE.ConeGeometry(0.135, 0.085, 5, 1, true);
    corolla.rotateX(Math.PI);
    corolla.translate(x, height + 0.035, z);
    paintVerticalGradient(corolla, 0xffffff, 0xffffff);
    const core = new THREE.OctahedronGeometry(0.045, 0);
    core.translate(x, height + 0.04, z);
    paintVerticalGradient(core, 0xffe9a0, 0xffe9a0);
    heads.push(corolla, core);
  }
  return { stems: mergeAll(stems), heads: mergeAll(heads) };
}

/** Versões simplificadas das árvores, usadas a distância (um único desenho por bloco). */
function buildFarTree(kind: 'frondosa' | 'cipreste' | 'palmeira', rng: Rng): THREE.BufferGeometry {
  const trunkColor = 0x8a6a4c;
  if (kind === 'palmeira') {
    const height = 7.6;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const frond = frondGeometry(3.4, 1.3, i % 2 === 0 ? 0.42 : 0.2, i % 2 === 0 ? 0.5 : 0.78, 3);
      frond.rotateY((i / 6) * TAU);
      frond.translate(0.82, height - 0.05, 0.12);
      parts.push(frond);
    }
    const canopy = mergeAll(parts);
    paintVerticalGradient(canopy, 0x9fb09a, 0xffffff, height - 2.2, height + 1.4);
    const trunk = new THREE.CylinderGeometry(0.2, 0.3, height, 4, 1, true);
    trunk.translate(0, height / 2, 0);
    trunk.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.82 / height, 0.12 / height, 0, 0));
    paintVerticalGradient(trunk, trunkColor, trunkColor);
    return mergeAll([canopy, trunk]);
  }
  if (kind === 'cipreste') {
    const canopy = blob(1, 1, rng, 0.06);
    const position = canopy.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const k = y > 0 ? 1 - y * 0.42 : 1;
      position.setXYZ(i, position.getX(i) * 1.05 * k, y * 3.2 + 4.0, position.getZ(i) * 1.05 * k);
    }
    canopy.computeVertexNormals();
    const merged = mergeAll([canopy]);
    paintVerticalGradient(merged, 0x7f8f84, 0xffffff, 0.8, 7.2);
    return merged;
  }
  const canopy = blob(2.7, 1, rng, 0.14);
  canopy.scale(1.12, 0.8, 1.12);
  canopy.translate(0, 4.5, 0);
  paintVerticalGradient(canopy, 0x8f9a8f, 0xffffff, 2.6, 6.6);
  const trunk = new THREE.CylinderGeometry(0.2, 0.34, 3.2, 4, 1, true);
  trunk.translate(0, 1.6, 0);
  paintVerticalGradient(trunk, trunkColor, trunkColor);
  return mergeAll([canopy, trunk]);
}

/* ------------------------------------------------------------------ */
/* Instanciamento em blocos                                            */
/* ------------------------------------------------------------------ */

interface ChunkPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  /** `false` ignora a cor da instância (ex.: troncos). */
  tint?: boolean;
}

interface ChunkMeshes {
  cx: number;
  cz: number;
  radius: number;
  meshes: THREE.InstancedMesh[];
  /** Malhas simplificadas exibidas a distância. */
  farMeshes: THREE.InstancedMesh[];
  total: number;
}

/**
 * Instâncias agrupadas em blocos espaciais: cada bloco é um conjunto de
 * `InstancedMesh` com volume próprio, permitindo descarte por frustum,
 * por distância, troca de nível de detalhe e redução de densidade.
 */
class ChunkedInstances {
  readonly group = new THREE.Group();
  private readonly pending = new Map<string, { matrices: THREE.Matrix4[]; colors: THREE.Color[] }>();
  private readonly chunks: ChunkMeshes[] = [];
  private density = 1;
  /** 0 = sem limite de distância. */
  maxDistance = 0;
  /** Distância a partir da qual o bloco usa a versão simplificada (se existir). */
  lodDistance = 120;

  constructor(
    name: string,
    private readonly parts: ChunkPart[],
    private readonly cellSize: number,
    private readonly layer: number | null,
    private readonly farParts: ChunkPart[] = [],
  ) {
    this.group.name = name;
  }

  add(matrix: THREE.Matrix4, color: THREE.Color): void {
    const e = matrix.elements;
    const key = `${Math.floor(e[12] / this.cellSize)}:${Math.floor(e[14] / this.cellSize)}`;
    let bucket = this.pending.get(key);
    if (!bucket) {
      bucket = { matrices: [], colors: [] };
      this.pending.set(key, bucket);
    }
    bucket.matrices.push(matrix);
    bucket.colors.push(color);
  }

  private createMesh(part: ChunkPart, matrices: THREE.Matrix4[], colors: THREE.Color[]): THREE.InstancedMesh {
    const count = matrices.length;
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, matrices[i]);
      if (part.tint !== false) mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = part.castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    if (this.layer !== null) mesh.layers.set(this.layer);
    this.group.add(mesh);
    return mesh;
  }

  build(shuffleRng: Rng): void {
    for (const bucket of this.pending.values()) {
      const count = bucket.matrices.length;
      if (count === 0) continue;
      // Embaralha para que reduzir `count` remova instâncias de forma uniforme.
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(shuffleRng() * (i + 1));
        [bucket.matrices[i], bucket.matrices[j]] = [bucket.matrices[j], bucket.matrices[i]];
        [bucket.colors[i], bucket.colors[j]] = [bucket.colors[j], bucket.colors[i]];
      }
      const meshes = this.parts.map((part) => this.createMesh(part, bucket.matrices, bucket.colors));
      const farMeshes = this.farParts.map((part) => this.createMesh(part, bucket.matrices, bucket.colors));
      for (const mesh of farMeshes) mesh.visible = false;
      const sphere = meshes[0].boundingSphere ?? new THREE.Sphere();
      this.chunks.push({ cx: sphere.center.x, cz: sphere.center.z, radius: sphere.radius, meshes, farMeshes, total: count });
    }
    this.pending.clear();
  }

  get instanceCount(): number {
    return this.chunks.reduce((sum, chunk) => sum + chunk.total, 0);
  }

  setDensity(density: number): void {
    this.density = THREE.MathUtils.clamp(density, 0, 1);
    for (const chunk of this.chunks) {
      const count = Math.max(0, Math.round(chunk.total * this.density));
      for (const mesh of chunk.meshes) mesh.count = count;
      for (const mesh of chunk.farMeshes) mesh.count = count;
    }
  }

  /** Oculta blocos além da distância máxima e alterna o nível de detalhe. */
  updateVisibility(x: number, z: number): void {
    const hasFar = this.farParts.length > 0;
    for (const chunk of this.chunks) {
      const distance = Math.hypot(chunk.cx - x, chunk.cz - z);
      const visible = this.maxDistance <= 0 || distance - chunk.radius < this.maxDistance;
      const far = hasFar && distance - chunk.radius * 0.5 > this.lodDistance;
      for (const mesh of chunk.meshes) mesh.visible = visible && !far;
      for (const mesh of chunk.farMeshes) mesh.visible = visible && far;
    }
  }

  dispose(): void {
    for (const chunk of this.chunks) {
      for (const mesh of chunk.meshes) mesh.dispose();
      for (const mesh of chunk.farMeshes) mesh.dispose();
    }
    this.chunks.length = 0;
    this.group.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Sistema de vegetação                                                */
/* ------------------------------------------------------------------ */

export interface VegetationOptions {
  materials: MaterialLibrary;
  heightField: HeightField;
  physics: PhysicsWorld;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function compose(x: number, y: number, z: number, rotationY: number, sx: number, sy: number, sz: number, tiltX = 0, tiltZ = 0): THREE.Matrix4 {
  _position.set(x, y, z);
  _euler.set(tiltX, rotationY, tiltZ, 'YXZ');
  _quaternion.setFromEuler(_euler);
  _scale.set(sx, sy, sz);
  return _matrix.compose(_position, _quaternion, _scale).clone();
}

/**
 * Vegetação de Aurora City: árvores, arbustos, grama e flores
 * instanciados, com balanço ao vento e densidade ajustável.
 */
export class Vegetation {
  readonly group = new THREE.Group();
  private readonly materials: MaterialLibrary;
  private readonly heightField: HeightField;
  private readonly physics: PhysicsWorld;
  private readonly rng = createRng(31337);
  private readonly geometries: THREE.BufferGeometry[] = [];

  private readonly trees: Record<TreeKind, ChunkedInstances>;
  private readonly bushes: ChunkedInstances;
  private readonly grass: ChunkedInstances;
  private readonly flowerStems: ChunkedInstances;
  private readonly flowerHeads: ChunkedInstances;
  private readonly lumenStems: ChunkedInstances;
  private readonly lumenHeads: ChunkedInstances;
  private readonly occupied = new Map<string, { x: number; z: number; r: number }[]>();
  private built = false;

  treeCount = 0;

  constructor(options: VegetationOptions) {
    this.materials = options.materials;
    this.heightField = options.heightField;
    this.physics = options.physics;
    this.group.name = 'Vegetation';
    const m = this.materials;
    const g = <T extends THREE.BufferGeometry>(geometry: T): T => {
      this.geometries.push(geometry);
      return geometry;
    };

    const geoRng = createRng(808);
    const broadleaf = buildBroadleaf(geoRng);
    const cypress = buildCypress(geoRng);
    const palm = buildPalm(geoRng);
    const banana = buildBanana(geoRng);
    const TREE_CELL = 96;
    const far = (kind: 'frondosa' | 'cipreste' | 'palmeira', material: THREE.Material): ChunkPart[] => [
      { geometry: g(buildFarTree(kind, geoRng)), material, castShadow: true },
    ];
    this.trees = {
      frondosa: new ChunkedInstances(
        'Trees:frondosa',
        [
          { geometry: g(broadleaf.trunk), material: m.trunk, castShadow: true, tint: false },
          { geometry: g(broadleaf.canopy), material: m.leaf, castShadow: true },
        ],
        TREE_CELL,
        null,
        far('frondosa', m.leaf),
      ),
      cipreste: new ChunkedInstances(
        'Trees:cipreste',
        [
          { geometry: g(cypress.trunk), material: m.trunk, castShadow: true, tint: false },
          { geometry: g(cypress.canopy), material: m.leaf, castShadow: true },
        ],
        TREE_CELL,
        null,
        far('cipreste', m.leaf),
      ),
      palmeira: new ChunkedInstances(
        'Trees:palmeira',
        [
          { geometry: g(palm.trunk), material: m.palmTrunk, castShadow: true, tint: false },
          { geometry: g(palm.canopy), material: m.palmLeaf, castShadow: true },
        ],
        TREE_CELL,
        null,
        far('palmeira', m.palmLeaf),
      ),
      bananeira: new ChunkedInstances('Trees:bananeira', [{ geometry: g(banana), material: m.palmLeaf, castShadow: true }], 80, null),
    };
    this.bushes = new ChunkedInstances('Bushes', [{ geometry: g(buildBush(geoRng)), material: m.bush, castShadow: true }], 80, null);
    this.grass = new ChunkedInstances('Grass', [{ geometry: g(buildGrassTuft(geoRng)), material: m.grass, castShadow: false }], 40, DETAIL_LAYER);

    const flower = buildFlowerCluster(geoRng);
    g(flower.stems);
    g(flower.heads);
    const flowerParts = (head: THREE.Material): [ChunkPart[], ChunkPart[]] => [
      [{ geometry: flower.stems, material: m.stem, castShadow: false, tint: false }],
      [{ geometry: flower.heads, material: head, castShadow: false }],
    ];
    const [stemParts, headParts] = flowerParts(m.petal);
    const [lumenStemParts, lumenHeadParts] = flowerParts(m.lumenPetal);
    this.flowerStems = new ChunkedInstances('FlowerStems', stemParts, 40, DETAIL_LAYER);
    this.flowerHeads = new ChunkedInstances('FlowerHeads', headParts, 40, DETAIL_LAYER);
    this.lumenStems = new ChunkedInstances('LumenStems', lumenStemParts, 40, DETAIL_LAYER);
    this.lumenHeads = new ChunkedInstances('LumenHeads', lumenHeadParts, 40, DETAIL_LAYER);

    for (const set of [...Object.values(this.trees), this.bushes, this.grass, this.flowerStems, this.flowerHeads, this.lumenStems, this.lumenHeads]) {
      this.group.add(set.group);
    }
  }

  private groundY(x: number, z: number): number {
    return this.heightField.getHeight(x, z);
  }

  /** `true` se não há outra árvore a menos de `r` do ponto. */
  isClear(x: number, z: number, r: number): boolean {
    const cell = 8;
    const ci = Math.floor(x / cell);
    const cj = Math.floor(z / cell);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const list = this.occupied.get(`${i}:${j}`);
        if (!list) continue;
        for (const o of list) {
          if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
        }
      }
    }
    return true;
  }

  private occupy(x: number, z: number, r: number): void {
    const key = `${Math.floor(x / 8)}:${Math.floor(z / 8)}`;
    let list = this.occupied.get(key);
    if (!list) {
      list = [];
      this.occupied.set(key, list);
    }
    list.push({ x, z, r });
  }

  addTree(tree: TreePlacement): void {
    const y = tree.y ?? this.groundY(tree.x, tree.z);
    const s = tree.scale;
    // Leve inclinação aleatória para quebrar a repetição.
    const tilt = tree.kind === 'cipreste' ? 0 : (this.rng() - 0.5) * 0.08;
    this.trees[tree.kind].add(compose(tree.x, y - 0.05, tree.z, tree.rotation, s, s * randRange(this.rng, 0.92, 1.1), s, tilt, tilt * 0.5), tree.color);
    this.occupy(tree.x, tree.z, tree.kind === 'bananeira' ? 1.0 : 1.6);
    this.treeCount += 1;

    const collide = tree.collide ?? tree.kind !== 'bananeira';
    if (collide) {
      const radius = (tree.kind === 'cipreste' ? 0.5 : tree.kind === 'palmeira' ? 0.3 : 0.36) * s;
      this.physics.addCylinder({
        x: tree.x,
        z: tree.z,
        radius,
        yMin: y - 1,
        yMax: y + (tree.kind === 'cipreste' ? 6 : 3.2) * s,
        walkable: false,
        blocksCamera: false,
        tag: `arvore:${tree.kind}`,
      });
    }
  }

  addBush(bush: BushPlacement): void {
    const y = bush.y ?? this.groundY(bush.x, bush.z);
    const s = bush.scale;
    this.bushes.add(compose(bush.x, y - 0.04, bush.z, this.rng() * TAU, s, s * randRange(this.rng, 0.85, 1.15), s), bush.color);
  }

  addFlowerPatch(patch: FlowerPatch): void {
    const area = Math.PI * patch.radius * patch.radius;
    const count = Math.round(area * patch.density);
    const stems = patch.luminous ? this.lumenStems : this.flowerStems;
    const heads = patch.luminous ? this.lumenHeads : this.flowerHeads;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const a = this.rng() * TAU;
      const r = Math.sqrt(this.rng()) * patch.radius;
      const x = patch.x + Math.cos(a) * r;
      const z = patch.z + Math.sin(a) * r;
      const y = patch.y ?? this.groundY(x, z);
      const s = randRange(this.rng, 0.85, 1.5);
      const matrix = compose(x, y, z, this.rng() * TAU, s, s, s);
      stems.add(matrix, white);
      heads.add(matrix, new THREE.Color(pick(this.rng, patch.palette)));
    }
  }

  /** Espalha grama e flores silvestres nas áreas livres. */
  scatterGround(canGrow: GroundPredicate, radius: number, tuftsPerSquareMeter: number): void {
    const rng = this.rng;
    const cell = 2;
    const perCell = tuftsPerSquareMeter * cell * cell;
    const colorA = new THREE.Color(0x47b84a);
    const colorB = new THREE.Color(0x86df5e);
    const wild = [0xffffff, 0xffe066, 0xff9fc6, 0x9fe8ff, 0xc9a2ff];
    const white = new THREE.Color(1, 1, 1);

    for (let gz = -radius; gz < radius; gz += cell) {
      for (let gx = -radius; gx < radius; gx += cell) {
        if (gx * gx + gz * gz > radius * radius) continue;
        const n = Math.floor(perCell) + (rng() < perCell % 1 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const x = gx + rng() * cell;
          const z = gz + rng() * cell;
          if (!canGrow(x, z, 0.3)) continue;
          const y = this.groundY(x, z);
          const s = randRange(rng, 0.8, 1.55);
          const color = colorA.clone().lerp(colorB, rng());
          this.grass.add(compose(x, y - 0.02, z, rng() * TAU, s, s * randRange(rng, 0.8, 1.3), s), color);
          // Flores silvestres ocasionais.
          if (rng() < 0.018) {
            const matrix = compose(x + 0.2, y, z + 0.1, rng() * TAU, 1, 1, 1);
            this.flowerStems.add(matrix, white);
            this.flowerHeads.add(matrix, new THREE.Color(pick(rng, wild)));
          }
        }
      }
    }
  }

  /** Finaliza a construção (cria as malhas instanciadas). */
  build(): void {
    if (this.built) return;
    this.built = true;
    const shuffle = createRng(99);
    for (const set of Object.values(this.trees)) set.build(shuffle);
    this.bushes.build(shuffle);
    this.grass.build(shuffle);
    this.flowerStems.build(shuffle);
    this.flowerHeads.build(shuffle);
    this.lumenStems.build(shuffle);
    this.lumenHeads.build(shuffle);
    this.occupied.clear();
  }

  get stats(): { trees: number; bushes: number; grass: number; flowers: number } {
    return {
      trees: this.treeCount,
      bushes: this.bushes.instanceCount,
      grass: this.grass.instanceCount,
      flowers: this.flowerHeads.instanceCount + this.lumenHeads.instanceCount,
    };
  }

  /** Aplica densidade e distância de desenho do perfil de qualidade. */
  applyQuality(vegetationDensity: number, detailDistance: number, lodBias = 1): void {
    for (const kind of ['frondosa', 'cipreste', 'palmeira'] as const) this.trees[kind].lodDistance = 105 * lodBias;
    this.grass.setDensity(vegetationDensity);
    // Flores e arbustos são marcos visuais: reduzem menos que a grama.
    const softer = 0.45 + 0.55 * vegetationDensity;
    this.flowerStems.setDensity(softer);
    this.flowerHeads.setDensity(softer);
    this.lumenStems.setDensity(softer);
    this.lumenHeads.setDensity(softer);
    this.bushes.setDensity(0.6 + 0.4 * vegetationDensity);

    this.grass.maxDistance = detailDistance;
    this.flowerStems.maxDistance = detailDistance * 1.6;
    this.flowerHeads.maxDistance = detailDistance * 1.6;
    this.lumenStems.maxDistance = detailDistance * 1.6;
    this.lumenHeads.maxDistance = detailDistance * 2.2;
    this.bushes.maxDistance = detailDistance * 4;
    this.trees.bananeira.maxDistance = detailDistance * 4;
  }

  update(cameraPosition: THREE.Vector3): void {
    const x = cameraPosition.x;
    const z = cameraPosition.z;
    this.grass.updateVisibility(x, z);
    this.flowerStems.updateVisibility(x, z);
    this.flowerHeads.updateVisibility(x, z);
    this.lumenStems.updateVisibility(x, z);
    this.lumenHeads.updateVisibility(x, z);
    this.bushes.updateVisibility(x, z);
    for (const set of Object.values(this.trees)) set.updateVisibility(x, z);
  }

  dispose(): void {
    for (const set of [...Object.values(this.trees), this.bushes, this.grass, this.flowerStems, this.flowerHeads, this.lumenStems, this.lumenHeads]) {
      set.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
  }
}
