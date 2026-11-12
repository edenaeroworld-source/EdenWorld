import * as THREE from 'three';
import type { HeightField } from './HeightField';

export interface TerrainPalette {
  grassA: THREE.ColorRepresentation;
  grassB: THREE.ColorRepresentation;
  sand: THREE.ColorRepresentation;
  rock: THREE.ColorRepresentation;
  path: THREE.ColorRepresentation;
  pavement: THREE.ColorRepresentation;
  grout: THREE.ColorRepresentation;
  soil: THREE.ColorRepresentation;
}

export const DEFAULT_TERRAIN_PALETTE: TerrainPalette = {
  grassA: 0x37b24d,
  grassB: 0x7ddc5a,
  sand: 0xf6ecc9,
  rock: 0xb9c7c9,
  path: 0xf1ead6,
  pavement: 0xf8f6ee,
  grout: 0x9fdcea,
  soil: 0x3f7f4a,
};

export interface TerrainOptions {
  heightField: HeightField;
  /** Mapa de controle: R = caminho, G = canteiro, B = pavimento. */
  controlMap: THREE.Texture;
  palette?: Partial<TerrainPalette>;
  /** Células por bloco (cada bloco é uma malha com culling próprio). */
  chunkCells?: number;
}

const TERRAIN_SHADER_KEY = 'eden-terrain-v1';

/**
 * Terreno do mundo: malha em blocos gerada a partir do `HeightField`,
 * com material procedural (grama, areia, rocha, caminhos, pavimento).
 */
export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  readonly heightField: HeightField;
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(options: TerrainOptions) {
    this.heightField = options.heightField;
    this.group.name = 'Terrain';
    this.material = this.createMaterial(options.controlMap, { ...DEFAULT_TERRAIN_PALETTE, ...options.palette });
    this.buildChunks(options.chunkCells ?? 64);
  }

  getHeight(x: number, z: number): number {
    return this.heightField.getHeight(x, z);
  }

  private buildChunks(chunkCells: number): void {
    const field = this.heightField;
    const segments = field.segments;
    const cell = field.cellSize;

    for (let cj = 0; cj < segments; cj += chunkCells) {
      for (let ci = 0; ci < segments; ci += chunkCells) {
        const cellsX = Math.min(chunkCells, segments - ci);
        const cellsZ = Math.min(chunkCells, segments - cj);
        const vx = cellsX + 1;
        const vz = cellsZ + 1;
        const positions = new Float32Array(vx * vz * 3);
        const normals = new Float32Array(vx * vz * 3);

        let p = 0;
        for (let j = 0; j < vz; j++) {
          for (let i = 0; i < vx; i++) {
            const gi = ci + i;
            const gj = cj + j;
            positions[p] = field.origin + gi * cell;
            positions[p + 1] = field.at(gi, gj);
            positions[p + 2] = field.origin + gj * cell;

            const nx = field.at(gi - 1, gj) - field.at(gi + 1, gj);
            const nz = field.at(gi, gj - 1) - field.at(gi, gj + 1);
            const ny = 2 * cell;
            const len = Math.hypot(nx, ny, nz);
            normals[p] = nx / len;
            normals[p + 1] = ny / len;
            normals[p + 2] = nz / len;
            p += 3;
          }
        }

        const indices = new Uint32Array(cellsX * cellsZ * 6);
        let q = 0;
        for (let j = 0; j < cellsZ; j++) {
          for (let i = 0; i < cellsX; i++) {
            const a = j * vx + i; // (i, j)
            const b = a + 1; // (i+1, j)
            const c = a + vx; // (i, j+1)
            const d = c + 1; // (i+1, j+1)
            // Mesma diagonal usada por HeightField.getHeight().
            indices[q++] = a;
            indices[q++] = c;
            indices[q++] = b;
            indices[q++] = b;
            indices[q++] = c;
            indices[q++] = d;
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        this.geometries.push(geometry);

        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.name = `TerrainChunk_${ci}_${cj}`;
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
      }
    }
  }

  private createMaterial(controlMap: THREE.Texture, palette: TerrainPalette): THREE.MeshStandardMaterial {
    const field = this.heightField;
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });

    const uniforms = {
      uControlMap: { value: controlMap },
      uTerrainRect: { value: new THREE.Vector4(field.origin, field.origin, field.size, field.size) },
      uGrassA: { value: new THREE.Color(palette.grassA) },
      uGrassB: { value: new THREE.Color(palette.grassB) },
      uSand: { value: new THREE.Color(palette.sand) },
      uRock: { value: new THREE.Color(palette.rock) },
      uPath: { value: new THREE.Color(palette.path) },
      uPavement: { value: new THREE.Color(palette.pavement) },
      uGrout: { value: new THREE.Color(palette.grout) },
      uSoil: { value: new THREE.Color(palette.soil) },
    };

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying vec3 vEdenWorldPos;
          varying vec3 vEdenWorldNormal;`,
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          vEdenWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vEdenWorldNormal = normal;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying vec3 vEdenWorldPos;
          varying vec3 vEdenWorldNormal;
          uniform sampler2D uControlMap;
          uniform vec4 uTerrainRect;
          uniform vec3 uGrassA;
          uniform vec3 uGrassB;
          uniform vec3 uSand;
          uniform vec3 uRock;
          uniform vec3 uPath;
          uniform vec3 uPavement;
          uniform vec3 uGrout;
          uniform vec3 uSoil;

          float edenHash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float edenNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(edenHash(i), edenHash(i + vec2(1.0, 0.0)), f.x),
              mix(edenHash(i + vec2(0.0, 1.0)), edenHash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }`,
        )
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          vec2 edenUv = (vEdenWorldPos.xz - uTerrainRect.xy) / uTerrainRect.zw;
          vec4 edenCtrl = texture2D(uControlMap, edenUv);
          float edenN1 = edenNoise(vEdenWorldPos.xz * 0.13);
          float edenN2 = edenNoise(vEdenWorldPos.xz * 1.1);
          float edenN3 = edenNoise(vEdenWorldPos.xz * 0.021 + 7.3);

          vec3 edenCol = mix(uGrassA, uGrassB, clamp(edenN1 * 0.55 + edenN3 * 0.6 - 0.1, 0.0, 1.0));
          edenCol *= 0.9 + 0.2 * edenN2;

          float edenSand = smoothstep(1.05, 0.5, vEdenWorldPos.y + (edenN1 - 0.5) * 0.5);
          edenCol = mix(edenCol, uSand * (0.93 + 0.1 * edenN2), edenSand);

          float edenSlope = 1.0 - normalize(vEdenWorldNormal).y;
          float edenRock = smoothstep(0.2, 0.38, edenSlope + (edenN2 - 0.5) * 0.08) * (1.0 - edenSand * 0.6);
          edenCol = mix(edenCol, uRock * (0.85 + 0.25 * edenN1), edenRock);

          float edenBed = smoothstep(0.4, 0.6, edenCtrl.g + (edenN2 - 0.5) * 0.3);
          edenCol = mix(edenCol, uSoil * (0.85 + 0.3 * edenN2), edenBed);

          float edenPath = smoothstep(0.4, 0.6, edenCtrl.r + (edenN2 - 0.5) * 0.22);
          edenCol = mix(edenCol, uPath * (0.92 + 0.1 * edenN2), edenPath);

          float edenPave = smoothstep(0.42, 0.58, edenCtrl.b);
          vec2 edenTileCoord = vEdenWorldPos.xz / 1.8;
          vec2 edenTileFw = fwidth(edenTileCoord);
          float edenFw = max(edenTileFw.x, edenTileFw.y);
          vec2 edenTile = abs(fract(edenTileCoord) - 0.5);
          // Rejunte com anti-aliasing: desaparece suavemente ao longe (sem moiré).
          float edenGrout = smoothstep(0.474 - edenFw, 0.494, max(edenTile.x, edenTile.y)) * (1.0 - smoothstep(0.06, 0.3, edenFw));
          vec3 edenPaveCol = mix(uPavement * (0.96 + 0.05 * edenN1), uGrout, edenGrout * 0.8);
          edenCol = mix(edenCol, edenPaveCol, edenPave);

          // Leito submerso: leve tom aqua para reforçar a água cristalina.
          float edenUnder = smoothstep(0.0, -2.2, vEdenWorldPos.y);
          edenCol = mix(edenCol, edenCol * vec3(0.62, 0.9, 0.96), edenUnder);

          diffuseColor.rgb *= edenCol;
          `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.44, edenPave * (1.0 - edenGrout * 0.5));
          roughnessFactor = mix(roughnessFactor, 0.55, edenSand * smoothstep(0.45, 0.05, vEdenWorldPos.y));`,
        );
    };
    material.customProgramCacheKey = () => TERRAIN_SHADER_KEY;
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.material.dispose();
    this.group.clear();
  }
}
