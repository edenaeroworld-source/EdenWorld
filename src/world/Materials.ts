import * as THREE from 'three';
import { createRng } from '../utils/math';
import type { AtmosphereState } from './Atmosphere';

/** Uniforms de vento compartilhados por toda a vegetação. */
export interface WindUniforms {
  uWindTime: { value: number };
  uWindStrength: { value: number };
  uWindDir: { value: THREE.Vector2 };
}

export interface WindOptions {
  /** Altura (espaço local) em que a oscilação atinge peso 1. */
  height: number;
  /** Deslocamento máximo (m) no topo com vento forte. */
  amplitude: number;
  /** Tremor rápido das folhas. */
  flutter?: number;
  /** Tinge a emissão pela cor da instância (flores luminosas). */
  emissiveFromColor?: boolean;
  /** Ilumina como o solo (normal para cima), independentemente da face. */
  upNormals?: boolean;
}

/** Injeta balanço ao vento em um material padrão (compatível com instâncias). */
export function applyWind<T extends THREE.Material>(material: T, wind: WindUniforms, options: WindOptions): T {
  const scale = (1 / Math.max(options.height, 0.001)).toFixed(4);
  const amplitude = options.amplitude.toFixed(4);
  const flutter = (options.flutter ?? 0).toFixed(4);
  const key = `eden-wind:${scale}:${amplitude}:${flutter}:${options.emissiveFromColor ? 1 : 0}:${options.upNormals ? 1 : 0}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = wind.uWindTime;
    shader.uniforms.uWindStrength = wind.uWindStrength;
    shader.uniforms.uWindDir = wind.uWindDir;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uWindTime;
        uniform float uWindStrength;
        uniform vec2 uWindDir;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 edenOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #else
          vec2 edenOrigin = vec2(modelMatrix[3][0], modelMatrix[3][2]);
        #endif
        float edenPhase = dot(edenOrigin, vec2(0.31, 0.23));
        float edenH = clamp(transformed.y * ${scale}, 0.0, 1.6);
        float edenGust = sin(uWindTime * 1.3 + edenPhase) * 0.6 + sin(uWindTime * 2.9 + edenPhase * 1.9) * 0.25 + 0.35;
        float edenFlutter = sin(uWindTime * 5.3 + transformed.x * 3.1 + transformed.z * 2.7 + edenPhase) * ${flutter};
        transformed.xz += (uWindDir * edenGust * edenH * edenH * ${amplitude} + vec2(edenFlutter, -edenFlutter) * min(edenH, 1.0)) * uWindStrength;`,
      );
    if (options.upNormals) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`,
      );
    }
    if (options.emissiveFromColor) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        #ifdef USE_COLOR
          totalEmissiveRadiance *= vColor.rgb;
        #endif`,
      );
    }
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/** Textura de fachada: grade de painéis de vidro com caixilhos brancos. */
function createFacadeTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const size = 512;
  const cells = 8;
  const cell = size / cells;
  const rng = createRng(1984);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const lit = document.createElement('canvas');
  lit.width = lit.height = size;
  const litCtx = lit.getContext('2d');
  if (!ctx || !litCtx) throw new Error('[Materials] Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  litCtx.fillStyle = '#000000';
  litCtx.fillRect(0, 0, size, size);

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = i * cell;
      const y = j * cell;
      const tone = rng();
      // Vidro em tons de céu, aqua e turquesa.
      const hue = 190 + tone * 22;
      const light = 62 + rng() * 16;
      const gradient = ctx.createLinearGradient(x, y, x, y + cell);
      gradient.addColorStop(0, `hsl(${hue}, 78%, ${light + 10}%)`);
      gradient.addColorStop(1, `hsl(${hue + 6}, 82%, ${light - 6}%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x + 3, y + 4, cell - 6, cell - 8);
      // Brilho diagonal (vidro polido).
      const gloss = ctx.createLinearGradient(x, y, x + cell, y + cell);
      gloss.addColorStop(0, 'rgba(255,255,255,0.42)');
      gloss.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(x + 3, y + 4, cell - 6, cell - 8);

      if (rng() < 0.42) {
        const warm = rng() < 0.55;
        litCtx.fillStyle = warm ? `rgba(255, 236, 190, ${0.55 + rng() * 0.45})` : `rgba(150, 240, 255, ${0.5 + rng() * 0.5})`;
        litCtx.fillRect(x + 4, y + 5, cell - 8, cell - 10);
      }
    }
  }

  const finish = (c: HTMLCanvasElement, colorSpace: THREE.ColorSpace): THREE.CanvasTexture => {
    const texture = new THREE.CanvasTexture(c);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = colorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  return { map: finish(canvas, THREE.SRGBColorSpace), emissive: finish(lit, THREE.SRGBColorSpace) };
}

const HOLOGRAM_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const HOLOGRAM_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uTint;
uniform float uTime;
uniform float uGain;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float scan = 0.88 + 0.12 * sin(vWorldPos.y * 46.0 - uTime * 3.2);
  float sweep = 1.0 - smoothstep(0.0, 0.06, abs(fract(vUv.y - uTime * 0.11) - 0.5));
  float flicker = 0.96 + 0.04 * sin(uTime * 23.0);
  float edge = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x) * smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
  vec3 col = tex.rgb * scan + uTint * (sweep * 0.3 + 0.05) * tex.a;
  float alpha = tex.a * flicker * edge * uOpacity;
  gl_FragColor = vec4(col * uGain, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const ORB_VERTEX = /* glsl */ `
uniform float uTime;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vLocal;
void main() {
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    // Orbes instanciados flutuam suavemente, cada um com sua fase.
    float phase = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.5;
    local.y += sin(uTime * 1.2 + phase) * 0.22;
    local.x += sin(uTime * 0.7 + phase * 1.3) * 0.12;
  #endif
  vec4 mv = modelViewMatrix * local;
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  vLocal = position;
  gl_Position = projectionMatrix * mv;
}
`;

const ORB_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uRim;
uniform float uTime;
uniform float uPower;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vLocal;
void main() {
  float ndv = clamp(dot(normalize(vNormalV), normalize(vViewDir)), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 2.2);
  float swirl = 0.5 + 0.5 * sin(vLocal.y * 5.0 + uTime * 1.4 + sin(vLocal.x * 4.0 + uTime) * 1.5);
  vec3 col = mix(uCore, uRim, fresnel) * (0.85 + 0.25 * swirl);
  col += vec3(1.0) * pow(ndv, 6.0) * 0.55;
  gl_FragColor = vec4(col * uPower, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const FALLS_VERTEX = /* glsl */ `
varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FALLS_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uLight;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
float fallsHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float fallsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fallsHash(i), fallsHash(i + vec2(1.0, 0.0)), f.x), mix(fallsHash(i + vec2(0.0, 1.0)), fallsHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  // vUv.x = ao longo da largura (em metros), vUv.y = 0 na base, 1 no topo.
  float streaks = fallsNoise(vec2(vUv.x * 5.0, vUv.y * 2.2 + uTime * 1.9));
  float fine = fallsNoise(vec2(vUv.x * 17.0, vUv.y * 5.0 + uTime * 3.1));
  float body = 0.5 + 0.35 * streaks + 0.25 * fine;
  float mist = smoothstep(0.22, 0.0, vUv.y);
  float alpha = clamp(body * 0.8 + mist * 0.4, 0.0, 1.0) * smoothstep(1.0, 0.94, vUv.y);
  vec3 col = mix(uColor, vec3(1.0), clamp(streaks * 0.75 + mist * 0.6, 0.0, 1.0)) * uLight;
  gl_FragColor = vec4(col, alpha * 0.86);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export interface HologramHandle {
  material: THREE.ShaderMaterial;
  texture: THREE.CanvasTexture;
}

/**
 * Biblioteca de materiais compartilhados de Aurora City.
 * Reutilizar materiais mantém baixo o número de programas de shader e
 * permite fundir geometrias da cidade em poucas chamadas de desenho.
 */
export class MaterialLibrary {
  readonly wind: WindUniforms = {
    uWindTime: { value: 0 },
    uWindStrength: { value: 0.3 },
    uWindDir: { value: new THREE.Vector2(1, 0) },
  };
  readonly time = { value: 0 };
  readonly dayLight = { value: 1 };

  // Estruturas
  readonly white: THREE.MeshStandardMaterial;
  readonly stone: THREE.MeshStandardMaterial;
  readonly sandstone: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly wood: THREE.MeshStandardMaterial;
  readonly facade: THREE.MeshStandardMaterial;
  readonly facadeEmerald: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly glassFloor: THREE.MeshStandardMaterial;
  readonly soil: THREE.MeshStandardMaterial;

  // Luz
  readonly aquaGlow: THREE.MeshStandardMaterial;
  readonly greenGlow: THREE.MeshStandardMaterial;
  readonly lampGlow: THREE.MeshStandardMaterial;
  readonly crystal: THREE.MeshStandardMaterial;
  readonly crystalRose: THREE.MeshStandardMaterial;
  readonly orb: THREE.ShaderMaterial;
  readonly orbHalo: THREE.MeshBasicMaterial;

  // Água
  readonly poolWater: THREE.MeshStandardMaterial;
  readonly waterfall: THREE.ShaderMaterial;

  // Vegetação
  readonly trunk: THREE.MeshStandardMaterial;
  readonly palmTrunk: THREE.MeshStandardMaterial;
  readonly leaf: THREE.MeshStandardMaterial;
  readonly palmLeaf: THREE.MeshStandardMaterial;
  readonly bush: THREE.MeshStandardMaterial;
  readonly grass: THREE.MeshStandardMaterial;
  readonly stem: THREE.MeshStandardMaterial;
  readonly petal: THREE.MeshStandardMaterial;
  readonly lumenPetal: THREE.MeshStandardMaterial;
  /** Folhagem estática de fachadas (jardins suspensos), fundida por edifício. */
  readonly foliage: THREE.MeshStandardMaterial;

  private readonly facadeTextures: { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture };
  private readonly poolNormal: THREE.Texture;
  private readonly holograms: HologramHandle[] = [];
  private readonly nightEmissive: { material: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  private readonly all: THREE.Material[] = [];

  constructor(waterNormalMap: THREE.Texture) {
    const std = (params: THREE.MeshStandardMaterialParameters, name: string): THREE.MeshStandardMaterial => {
      const material = new THREE.MeshStandardMaterial(params);
      material.name = name;
      this.all.push(material);
      return material;
    };

    this.white = std({ color: 0xf7fbff, roughness: 0.26, metalness: 0.04 }, 'white');
    this.stone = std({ color: 0xe4ebee, roughness: 0.72, metalness: 0 }, 'stone');
    this.sandstone = std({ color: 0xf3ead6, roughness: 0.8, metalness: 0 }, 'sandstone');
    this.metal = std({ color: 0xdde8ec, roughness: 0.28, metalness: 0.75 }, 'metal');
    this.wood = std({ color: 0xdcb98a, roughness: 0.66, metalness: 0 }, 'wood');
    this.soil = std({ color: 0x4a8f52, roughness: 0.95, metalness: 0 }, 'soil');

    this.facadeTextures = createFacadeTextures();
    this.facade = std(
      {
        color: 0xffffff,
        map: this.facadeTextures.map,
        emissive: 0xffffff,
        emissiveMap: this.facadeTextures.emissive,
        emissiveIntensity: 0,
        roughness: 0.1,
        metalness: 0.82,
        envMapIntensity: 1.25,
      },
      'facade',
    );
    this.facadeEmerald = std(
      {
        color: 0xb4ffe2,
        map: this.facadeTextures.map,
        emissive: 0xffffff,
        emissiveMap: this.facadeTextures.emissive,
        emissiveIntensity: 0,
        roughness: 0.1,
        metalness: 0.82,
        envMapIntensity: 1.25,
      },
      'facadeEmerald',
    );
    this.nightEmissive.push({ material: this.facade, day: 0, night: 1.15 }, { material: this.facadeEmerald, day: 0, night: 1.15 });

    this.glass = std(
      {
        color: 0xbfeeff,
        roughness: 0.04,
        metalness: 0.25,
        transparent: true,
        opacity: 0.34,
        envMapIntensity: 1.6,
        depthWrite: false,
        side: THREE.DoubleSide,
      },
      'glass',
    );
    this.glassFloor = std(
      {
        color: 0x9fe9f7,
        emissive: 0x2fd3ff,
        emissiveIntensity: 0.12,
        roughness: 0.06,
        metalness: 0.3,
        envMapIntensity: 1.3,
      },
      'glassFloor',
    );
    this.nightEmissive.push({ material: this.glassFloor, day: 0.12, night: 0.85 });

    this.aquaGlow = std({ color: 0x9df4ff, emissive: 0x35dcff, emissiveIntensity: 1.1, roughness: 0.3 }, 'aquaGlow');
    this.greenGlow = std({ color: 0xb5ffd2, emissive: 0x3dff9a, emissiveIntensity: 1.0, roughness: 0.3 }, 'greenGlow');
    this.lampGlow = std({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 0.5, roughness: 0.3 }, 'lampGlow');
    this.nightEmissive.push(
      { material: this.aquaGlow, day: 1.0, night: 2.4 },
      { material: this.greenGlow, day: 0.9, night: 2.2 },
      { material: this.lampGlow, day: 0.45, night: 3.2 },
    );

    this.crystal = std(
      {
        color: 0x8ff3ff,
        emissive: 0x1fbfe8,
        emissiveIntensity: 0.45,
        roughness: 0.05,
        metalness: 0.15,
        transparent: true,
        opacity: 0.86,
        flatShading: true,
        envMapIntensity: 1.8,
      },
      'crystal',
    );
    this.crystalRose = std(
      {
        color: 0xc9ffe6,
        emissive: 0x38e8a0,
        emissiveIntensity: 0.45,
        roughness: 0.05,
        metalness: 0.15,
        transparent: true,
        opacity: 0.86,
        flatShading: true,
        envMapIntensity: 1.8,
      },
      'crystalEmerald',
    );
    this.nightEmissive.push({ material: this.crystal, day: 0.45, night: 1.5 }, { material: this.crystalRose, day: 0.45, night: 1.5 });

    this.orb = new THREE.ShaderMaterial({
      name: 'orb',
      vertexShader: ORB_VERTEX,
      fragmentShader: ORB_FRAGMENT,
      uniforms: {
        uCore: { value: new THREE.Color(0xeaffff) },
        uRim: { value: new THREE.Color(0x29c8ff) },
        uTime: this.time,
        uPower: { value: 1.25 },
      },
      fog: false,
    });
    this.orbHalo = new THREE.MeshBasicMaterial({
      name: 'orbHalo',
      color: 0x7fe9ff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
    });
    this.all.push(this.orb, this.orbHalo);

    this.poolNormal = waterNormalMap.clone();
    this.poolNormal.repeat.set(1, 1);
    this.poolNormal.needsUpdate = true;
    this.poolWater = std(
      {
        color: 0x4fd6e6,
        roughness: 0.04,
        metalness: 0.35,
        normalMap: this.poolNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
        transparent: true,
        opacity: 0.8,
        envMapIntensity: 1.5,
      },
      'poolWater',
    );

    this.waterfall = new THREE.ShaderMaterial({
      name: 'waterfall',
      vertexShader: FALLS_VERTEX,
      fragmentShader: FALLS_FRAGMENT,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: this.time,
        uColor: { value: new THREE.Color(0x8fe9ff) },
        uLight: this.dayLight,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.all.push(this.waterfall);

    // Vegetação
    this.trunk = std({ color: 0xa98563, roughness: 0.9 }, 'trunk');
    this.palmTrunk = std({ color: 0xc2a57c, roughness: 0.88 }, 'palmTrunk');
    this.leaf = applyWind(std({ color: 0xffffff, roughness: 0.82, vertexColors: true }, 'leaf'), this.wind, {
      height: 7,
      amplitude: 0.38,
      flutter: 0.035,
    });
    this.palmLeaf = applyWind(
      std({ color: 0xffffff, roughness: 0.7, vertexColors: true, side: THREE.DoubleSide }, 'palmLeaf'),
      this.wind,
      { height: 9, amplitude: 0.7, flutter: 0.06 },
    );
    this.bush = applyWind(std({ color: 0xffffff, roughness: 0.85, vertexColors: true }, 'bush'), this.wind, {
      height: 1.4,
      amplitude: 0.07,
      flutter: 0.02,
    });
    this.grass = applyWind(
      std({ color: 0xffffff, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide }, 'grass'),
      this.wind,
      { height: 0.45, amplitude: 0.16, flutter: 0.02, upNormals: true },
    );
    this.stem = applyWind(std({ color: 0x4fb04a, roughness: 0.85 }, 'stem'), this.wind, { height: 0.7, amplitude: 0.14 });
    this.petal = applyWind(std({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide, vertexColors: true }, 'petal'), this.wind, {
      height: 0.7,
      amplitude: 0.14,
    });
    this.lumenPetal = applyWind(
      std({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.5, side: THREE.DoubleSide, vertexColors: true }, 'lumenPetal'),
      this.wind,
      { height: 0.7, amplitude: 0.14, emissiveFromColor: true },
    );
    this.nightEmissive.push({ material: this.lumenPetal, day: 0.55, night: 2.3 });
    this.foliage = std({ color: 0x4fc45a, roughness: 0.85 }, 'foliage');
  }

  /** Cria um material de holograma a partir de um desenho em canvas. */
  createHologram(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, tint = 0x6ff0ff): HologramHandle {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('[Materials] Canvas 2D indisponível');
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.ShaderMaterial({
      name: 'hologram',
      vertexShader: HOLOGRAM_VERTEX,
      fragmentShader: HOLOGRAM_FRAGMENT,
      uniforms: {
        uMap: { value: texture },
        uTint: { value: new THREE.Color(tint) },
        uTime: this.time,
        uGain: { value: 1.1 },
        uOpacity: { value: 0.92 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      fog: false,
    });
    const handle = { material, texture };
    this.holograms.push(handle);
    return handle;
  }

  update(elapsed: number, atmosphere: AtmosphereState, wind: THREE.Vector3): void {
    this.time.value = elapsed;
    this.dayLight.value = 0.3 + 0.7 * atmosphere.daylight;
    this.wind.uWindTime.value = elapsed;
    this.wind.uWindStrength.value = wind.z;
    this.wind.uWindDir.value.set(wind.x, wind.y);

    const night = atmosphere.night;
    for (const entry of this.nightEmissive) {
      entry.material.emissiveIntensity = entry.day + (entry.night - entry.day) * night;
    }
    for (const hologram of this.holograms) {
      hologram.material.uniforms.uGain.value = 1.0 + 0.5 * night;
    }
    this.poolNormal.offset.set(elapsed * 0.012, elapsed * 0.017);
  }

  dispose(): void {
    for (const material of this.all) material.dispose();
    for (const hologram of this.holograms) {
      hologram.material.dispose();
      hologram.texture.dispose();
    }
    this.facadeTextures.map.dispose();
    this.facadeTextures.emissive.dispose();
    this.poolNormal.dispose();
  }
}
