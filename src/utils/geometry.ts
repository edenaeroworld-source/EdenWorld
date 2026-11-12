import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP_ATTRIBUTES = new Set(['position', 'normal', 'uv']);

/** Cria uma matriz de transformação (posição, rotação XYZ, escala). */
export function xform(
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
  return matrix;
}

/** Garante atributos uniformes (position/normal/uv) e índice, para permitir a fusão. */
function normalizeForMerge(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    if (!KEEP_ATTRIBUTES.has(name)) geometry.deleteAttribute(name);
  }
  const position = geometry.getAttribute('position');
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  }
  if (!geometry.index) {
    const index = new Uint32Array(position.count);
    for (let i = 0; i < index.length; i++) index[i] = i;
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }
  geometry.morphAttributes = {};
  geometry.clearGroups();
  return geometry;
}

export interface BatchBuildOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Camada de renderização (ex.: DETAIL_LAYER para ignorar em reflexos). */
  layer?: number;
}

/**
 * Agrupa geometrias estáticas por material e as funde em poucas malhas,
 * reduzindo drasticamente as chamadas de desenho da cidade.
 * O batcher assume a posse das geometrias adicionadas (elas são descartadas).
 */
export class GeometryBatcher {
  private readonly buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4): this {
    if (matrix) geometry.applyMatrix4(matrix);
    normalizeForMerge(geometry);
    let list = this.buckets.get(material);
    if (!list) {
      list = [];
      this.buckets.set(material, list);
    }
    list.push(geometry);
    return this;
  }

  get isEmpty(): boolean {
    return this.buckets.size === 0;
  }

  /** Funde cada grupo em uma malha e devolve um `Group` com todas elas. */
  build(name: string, options: BatchBuildOptions = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, geometries] of this.buckets) {
      const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (!merged) {
        console.warn(`[GeometryBatcher] Falha ao fundir geometrias de "${name}"`);
        continue;
      }
      if (geometries.length > 1) {
        for (const geometry of geometries) geometry.dispose();
      }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${name}:${material.name || material.type}`;
      mesh.castShadow = options.castShadow ?? true;
      mesh.receiveShadow = options.receiveShadow ?? true;
      if (options.layer !== undefined) mesh.layers.set(options.layer);
      // Malhas estáticas: matriz calculada uma única vez.
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.buckets.clear();
    group.matrixAutoUpdate = false;
    return group;
  }
}

export interface InstancePart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Constrói `InstancedMesh` para objetos repetidos (árvores, bancos,
 * postes...). Cada "parte" compartilha as mesmas matrizes de instância.
 */
export class InstanceBuilder {
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly colors: (THREE.Color | null)[] = [];
  private hasColors = false;

  constructor(
    readonly name: string,
    private readonly parts: InstancePart[],
  ) {}

  add(matrix: THREE.Matrix4, color?: THREE.Color): this {
    this.matrices.push(matrix);
    this.colors.push(color ?? null);
    if (color) this.hasColors = true;
    return this;
  }

  get count(): number {
    return this.matrices.length;
  }

  build(options: { layer?: number; frustumCulled?: boolean } = {}): THREE.InstancedMesh[] {
    const count = this.matrices.length;
    if (count === 0) return [];
    const white = new THREE.Color(1, 1, 1);
    return this.parts.map((part, index) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
      mesh.name = `${this.name}:${index}`;
      for (let i = 0; i < count; i++) {
        mesh.setMatrixAt(i, this.matrices[i]);
        if (this.hasColors) mesh.setColorAt(i, this.colors[i] ?? white);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = part.castShadow ?? true;
      mesh.receiveShadow = part.receiveShadow ?? true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      mesh.frustumCulled = options.frustumCulled ?? true;
      if (options.layer !== undefined) mesh.layers.set(options.layer);
      mesh.matrixAutoUpdate = false;
      return mesh;
    });
  }
}

/** Libera geometrias, materiais e texturas de uma árvore de objetos. */
export function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => materials.add(m));
    else if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
    }
    material.dispose();
  }
}
