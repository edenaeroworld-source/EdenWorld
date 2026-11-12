import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { TAU, createRng } from '../utils/math';
import type { AtmosphereState } from './Atmosphere';
import type { HeightField } from './HeightField';

/** Camada de objetos pequenos (grama, flores, partículas) ignorada nos reflexos. */
export const DETAIL_LAYER = 1;

const WATER_VERTEX = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vReflectUv;
varying vec3 vWorldPos;
#include <common>
#include <fog_pars_vertex>
void main() {
  vReflectUv = textureMatrix * vec4(position, 1.0);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform sampler2D uNormalMap;
uniform sampler2D uHeightMap;
uniform vec4 uTerrainRect;
uniform float uWaterLevel;
uniform float uTime;
uniform float uReflection;
uniform float uLightScale;
uniform float uWaveStrength;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFoam;
varying vec4 vReflectUv;
varying vec3 vWorldPos;
#include <common>
#include <fog_pars_fragment>

void main() {
  // Profundidade a partir do mapa de alturas do terreno.
  vec2 huv = (vWorldPos.xz - uTerrainRect.xy) / uTerrainRect.zw;
  float inside = step(0.0, huv.x) * step(huv.x, 1.0) * step(0.0, huv.y) * step(huv.y, 1.0);
  float terrain = mix(-8.0, texture2D(uHeightMap, huv).r, inside);
  float depth = max(uWaterLevel - terrain, 0.0);

  // Ondas: duas camadas de normais procedurais em movimento.
  // Camadas giradas entre si: quebra o padrão repetitivo no mar aberto.
  vec2 uv1 = vWorldPos.xz * 0.043 + uTime * vec2(0.011, 0.007);
  vec2 uv2 = mat2(0.799, -0.602, 0.602, 0.799) * vWorldPos.xz * 0.117 + uTime * vec2(-0.017, 0.012);
  vec2 uv3 = mat2(0.454, 0.891, -0.891, 0.454) * vWorldPos.xz * 0.0091 + uTime * vec2(0.003, -0.002);
  vec2 n1 = texture2D(uNormalMap, uv1).xy * 2.0 - 1.0;
  vec2 n2 = texture2D(uNormalMap, uv2).xy * 2.0 - 1.0;
  n1 = n1 * 0.75 + (texture2D(uNormalMap, uv3).xy * 2.0 - 1.0) * 0.7;
  float calm = mix(0.55, 1.0, smoothstep(0.0, 2.5, depth));
  // Atenua as ondas ao longe para evitar cintilação (aliasing) no horizonte.
  float viewDist = length(cameraPosition - vWorldPos);
  float farFade = mix(0.22, 1.0, 1.0 - smoothstep(120.0, 800.0, viewDist));
  vec2 slope = (n1 + n2 * 0.6) * uWaveStrength * calm * farFade;
  vec3 normal = normalize(vec3(slope.x, 1.0, slope.y));

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float ndv = max(dot(normal, viewDir), 0.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);

  // Reflexo: céu analítico ou reflexo planar real (qualidade alta).
  vec3 r = reflect(-viewDir, normal);
  float ry = clamp(r.y, 0.0, 1.0);
  vec3 reflection = mix(uHorizon, uZenith, pow(ry, 0.42));
  if (uReflection > 0.001) {
    vec4 ruv = vReflectUv;
    ruv.xy += slope * 0.9 * ruv.w;
    vec3 planar = texture2DProj(tDiffuse, ruv).rgb;
    reflection = mix(reflection, planar, uReflection);
  }

  // Cor do corpo d'água: aqua cristalino no raso, azul oceano no fundo.
  float deepness = 1.0 - exp(-depth * 0.5);
  vec3 body = mix(uShallow, uDeep, deepness) * color * uLightScale;

  // Brilho do sol na superfície.
  float sunSpec = pow(max(dot(r, uSunDir), 0.0), 380.0) * 2.4 * farFade + pow(max(dot(r, uSunDir), 0.0), 28.0) * 0.16;
  vec3 sparkle = uSunColor * sunSpec * step(0.0, uSunDir.y);

  // Espuma suave na linha d'água.
  float shore = smoothstep(0.42, 0.0, depth) * inside;
  float foamWave = 0.5 + 0.5 * sin(depth * 22.0 - uTime * 1.8 + (n1.x + n2.y) * 3.0);
  float foam = shore * smoothstep(0.35, 0.8, foamWave + shore * 0.6) * 0.85;

  vec3 col = mix(body, reflection, fresnel) + sparkle;
  col = mix(col, uFoam * uLightScale, foam);

  // Totalmente opaca em águas profundas (esconde o limite da malha do terreno).
  float alpha = mix(0.28, 1.0, smoothstep(0.0, 5.0, depth));
  alpha = max(alpha, fresnel * 0.92);
  alpha = clamp(alpha + foam * 0.6, 0.0, 1.0);
  // Some suavemente na borda da areia.
  alpha *= smoothstep(0.0, 0.07, depth + (1.0 - inside));

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Gera um mapa de normais ladrilhável a partir de uma soma de ondas senoidais. */
export function createWaterNormalMap(size = 256): THREE.DataTexture {
  const rng = createRng(4242);
  const waves: { kx: number; ky: number; amp: number; phase: number }[] = [];
  for (let i = 0; i < 22; i++) {
    // Frequências inteiras garantem que a textura se repete sem emendas.
    const kx = Math.round((rng() * 2 - 1) * 9);
    const ky = Math.round((rng() * 2 - 1) * 9);
    const k = Math.hypot(kx, ky);
    if (k < 1) continue;
    waves.push({ kx, ky, amp: 1 / (k * k * 0.35 + 1), phase: rng() * TAU });
  }

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TAU;
      const v = (y / size) * TAU;
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const c = Math.cos(w.kx * u + w.ky * v + w.phase) * w.amp;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const scale = 0.16;
      const nx = -dx * scale;
      const ny = -dy * scale;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx / len) * 127.5 + 127.5);
      data[i + 1] = Math.round((ny / len) * 127.5 + 127.5);
      data[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Empacota as alturas do terreno em uma textura (meio-float) para o shader da água. */
function createHeightTexture(field: HeightField): THREE.DataTexture {
  const n = field.verticesPerSide;
  const data = new Uint16Array(n * n);
  for (let i = 0; i < data.length; i++) {
    data[i] = THREE.DataUtils.toHalfFloat(field.data[i]);
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export interface WaterOptions {
  heightField: HeightField;
  waterLevel: number;
  /** Raio do plano de água (estende-se até o horizonte). */
  radius?: number;
}

/**
 * Superfície de água do mundo (lagos, rio e oceano em um único plano).
 * O terreno define onde a água aparece: tudo abaixo de `waterLevel`.
 * Reflexos planares reais são opcionais (qualidade Alta).
 */
export class Water {
  readonly mesh: Reflector;
  readonly normalMap: THREE.DataTexture;
  private readonly heightTexture: THREE.DataTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly renderReflection: THREE.Object3D['onBeforeRender'];
  private reflectionsEnabled = false;
  private frame = 0;

  constructor(options: WaterOptions) {
    const field = options.heightField;
    this.normalMap = createWaterNormalMap(256);
    this.heightTexture = createHeightTexture(field);

    // O texel (0,0) do mapa de alturas corresponde ao centro do primeiro vértice.
    const cell = field.cellSize;
    const rect = new THREE.Vector4(field.origin - cell / 2, field.origin - cell / 2, field.size + cell, field.size + cell);

    const geometry = new THREE.CircleGeometry(options.radius ?? 1500, 48);
    this.mesh = new Reflector(geometry, {
      textureWidth: 512,
      textureHeight: 512,
      clipBias: 0.02,
      multisample: 0,
      shader: {
        name: 'EdenWaterShader',
        uniforms: {
          ...THREE.UniformsLib.fog,
          color: { value: null },
          tDiffuse: { value: null },
          textureMatrix: { value: null },
          // Texturas são atribuídas após a construção (o Reflector clona os uniforms).
          uNormalMap: { value: null },
          uHeightMap: { value: null },
          uTerrainRect: { value: rect },
          uWaterLevel: { value: options.waterLevel },
          uTime: { value: 0 },
          uReflection: { value: 0 },
          uLightScale: { value: 1 },
          uWaveStrength: { value: 0.5 },
          uShallow: { value: new THREE.Color(0x66ecdf) },
          uDeep: { value: new THREE.Color(0x0a66b4) },
          uZenith: { value: new THREE.Color(0x1b82ea) },
          uHorizon: { value: new THREE.Color(0xb4e6ff) },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color(0xffffff) },
          uFoam: { value: new THREE.Color(0xffffff) },
        },
        vertexShader: WATER_VERTEX,
        fragmentShader: WATER_FRAGMENT,
      },
      color: 0xffffff,
    });
    this.mesh.name = 'Water';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = options.waterLevel;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;

    this.material = this.mesh.material as THREE.ShaderMaterial;
    this.material.uniforms.uNormalMap.value = this.normalMap;
    this.material.uniforms.uHeightMap.value = this.heightTexture;
    this.material.transparent = true;
    this.material.depthWrite = false;
    this.material.fog = true;

    // O Reflector renderiza o reflexo em onBeforeRender; controlamos quando isso acontece.
    this.renderReflection = this.mesh.onBeforeRender;
    this.mesh.onBeforeRender = (renderer, scene, camera, geometryArg, materialArg, group) => {
      if (!this.reflectionsEnabled) return;
      const reflectionCamera = this.mesh.getReflectionCamera(camera);
      reflectionCamera.layers.disable(DETAIL_LAYER);
      this.renderReflection.call(this.mesh, renderer, scene, camera, geometryArg, materialArg, group);
    };
  }

  /** Liga/desliga reflexos planares reais (custam uma renderização extra da cena). */
  setReflections(enabled: boolean): void {
    this.reflectionsEnabled = enabled;
    this.material.uniforms.uReflection.value = enabled ? 0.85 : 0;
  }

  get reflections(): boolean {
    return this.reflectionsEnabled;
  }

  /** Ajusta o alvo de reflexo à resolução da tela (metade da resolução). */
  setSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.max(64, Math.min(1024, Math.round(width * pixelRatio * 0.5)));
    const h = Math.max(64, Math.min(1024, Math.round(height * pixelRatio * 0.5)));
    this.mesh.getRenderTarget().setSize(w, h);
  }

  update(elapsed: number, atmosphere: AtmosphereState, windStrength: number): void {
    this.frame += 1;
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uWaveStrength.value = 0.38 + windStrength * 0.42;
    u.uLightScale.value = 0.22 + 0.78 * atmosphere.daylight;
    (u.uZenith.value as THREE.Color).copy(atmosphere.zenith);
    (u.uHorizon.value as THREE.Color).copy(atmosphere.horizon);
    (u.uSunDir.value as THREE.Vector3).copy(atmosphere.lightDirection);
    (u.uSunColor.value as THREE.Color).copy(atmosphere.lightColor).multiplyScalar(Math.min(1, atmosphere.lightIntensity));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
    this.normalMap.dispose();
    this.heightTexture.dispose();
  }
}
