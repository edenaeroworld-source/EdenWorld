import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, createRng, randRange } from '../utils/math';
import type { AtmosphereState } from './Atmosphere';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform vec3 uPlanetDir;
uniform float uPlanetSize;
uniform float uNight;
uniform float uTwilight;
uniform float uAurora;
uniform float uSunDisc;
uniform float uTime;
varying vec3 vDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;

  // Gradiente principal: horizonte claro → zênite profundo.
  float t = pow(clamp(h, 0.0, 1.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uGround, smoothstep(0.0, -0.22, h));
  float haze = exp(-abs(h) * 8.0);
  col = mix(col, uHorizon * 1.04, haze * 0.45);

  // Sol: disco + halos.
  float sunVisible = smoothstep(-0.14, 0.02, uSunDir.y);
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 1100.0) * 5.0 * uSunDisc + pow(sd, 60.0) * 0.32 + pow(sd, 7.0) * 0.13) * sunVisible;
  col += uSunColor * pow(sd, 3.0) * haze * 0.55 * uTwilight;

  // Lua.
  float md = max(dot(dir, uMoonDir), 0.0);
  col += vec3(0.86, 0.93, 1.0) * (smoothstep(0.99925, 0.9996, md) * 0.95 * uSunDisc + pow(md, 260.0) * 0.22) * uNight;

  // Saturno do Éden: planeta com anéis, visível de dia como uma lua pálida.
  float pd = dot(dir, uPlanetDir);
  if (pd > 0.8) {
    vec3 pu = normalize(cross(uPlanetDir, vec3(0.0, 1.0, 0.0)));
    vec3 pv = cross(pu, uPlanetDir);
    vec2 q = vec2(dot(dir, pu), dot(dir, pv)) / uPlanetSize;
    float rr = length(q);
    float visibility = 0.42 + 0.5 * uNight;

    // Anéis (elipse inclinada).
    float ca = cos(0.42);
    float sa = sin(0.42);
    vec2 rq = vec2(q.x * ca + q.y * sa, (-q.x * sa + q.y * ca) * 3.4);
    float rl = length(rq);
    float ring = smoothstep(1.32, 1.42, rl) * smoothstep(2.05, 1.9, rl);
    ring *= 0.55 + 0.45 * sin(rl * 38.0);
    float behind = step(0.0, rq.y) * step(rr, 1.0);
    col = mix(col, vec3(0.78, 0.95, 1.0), ring * (1.0 - behind) * visibility * 0.75);

    if (rr < 1.0) {
      float nz = sqrt(1.0 - rr * rr);
      vec3 n = normalize(pu * q.x + pv * q.y - uPlanetDir * nz);
      float light = clamp(dot(n, uSunDir) * 0.9 + 0.35, 0.0, 1.0);
      float bands = fbm(vec2(q.x * 1.5 + 3.0, q.y * 7.0));
      vec3 surface = mix(vec3(0.24, 0.66, 0.98), vec3(0.36, 0.93, 0.74), smoothstep(0.35, 0.7, bands));
      surface = mix(surface, vec3(1.0), smoothstep(0.62, 0.9, fbm(q * 4.0 + 9.0)) * 0.6);
      float edge = smoothstep(1.0, 0.94, rr);
      float lit = smoothstep(0.18, 0.75, light);
      col = mix(col, surface * (0.35 + 0.85 * light), edge * visibility * (0.25 + 0.75 * lit));
    }
    // Brilho atmosférico ao redor do planeta.
    col += vec3(0.35, 0.8, 1.0) * smoothstep(1.35, 1.0, rr) * step(1.0, rr) * 0.12 * visibility;
  }

  // Estrelas.
  if (uNight > 0.02 && h > -0.02) {
    vec2 sp = dir.xz / (abs(h) + 0.4) * 46.0;
    vec2 cell = floor(sp);
    vec2 f = fract(sp) - 0.5;
    float rnd = hash21(cell);
    vec2 offset = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float star = step(0.88, rnd) * smoothstep(0.11, 0.0, length(f - offset * 0.6));
    float twinkle = 0.6 + 0.4 * sin(uTime * (1.0 + rnd * 3.0) + rnd * 40.0);
    col += vec3(0.88, 0.96, 1.0) * star * twinkle * uNight * smoothstep(-0.02, 0.3, h);
  }

  // Aurora: cortinas de luz que dão nome à cidade.
  if (uAurora > 0.01 && h > 0.03) {
    vec2 ap = dir.xz / (h + 0.28);
    float band = fbm(vec2(ap.x * 1.1 + uTime * 0.018, ap.y * 0.45 - uTime * 0.006));
    float curtain = smoothstep(0.46, 0.74, band) * smoothstep(0.03, 0.3, h) * smoothstep(0.98, 0.45, h);
    float rays = 0.55 + 0.45 * vnoise(vec2(ap.x * 10.0 + uTime * 0.12, uTime * 0.05));
    vec3 ac = mix(vec3(0.12, 1.0, 0.62), vec3(0.22, 0.72, 1.0), vnoise(ap * 0.8 + 3.0));
    col += ac * curtain * rays * uAurora * 0.6;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const CLOUD_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uShadow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHaze;
uniform float uTwilight;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main() {
  vec3 n = normalize(vNormalW);
  float up = n.y * 0.5 + 0.5;
  float sun = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uShadow, uLight, clamp(up * 0.65 + sun * 0.5, 0.0, 1.0));
  col += uSunColor * pow(sun, 3.0) * 0.25 * uTwilight;
  // Perspectiva aérea: nuvens distantes se fundem ao horizonte.
  float dist = length(vWorldPos.xz - cameraPosition.xz);
  col = mix(col, uHaze, smoothstep(500.0, 1500.0, dist) * 0.7);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface CloudInstance {
  mesh: THREE.Mesh;
  speed: number;
}

const CLOUD_FIELD_RADIUS = 1250;

/**
 * Céu de Aurora City: cúpula com gradiente, sol, lua, estrelas, aurora
 * e o planeta anelado do Éden, além de nuvens volumosas estilizadas.
 */
export class Sky {
  /** Segue a câmera (cúpula sempre centrada no observador). */
  readonly group = new THREE.Group();
  /** Nuvens ancoradas no mundo, levadas pelo vento. */
  readonly clouds = new THREE.Group();
  readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly cloudMaterial: THREE.ShaderMaterial;
  private readonly cloudInstances: CloudInstance[] = [];
  private readonly cloudGeometries: THREE.BufferGeometry[] = [];
  private envScene: THREE.Scene | null = null;

  constructor() {
    this.group.name = 'Sky';
    this.clouds.name = 'Clouds';

    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uPlanetDir: { value: new THREE.Vector3(-0.62, 0.52, -0.58).normalize() },
        uPlanetSize: { value: 0.105 },
        uNight: { value: 0 },
        uTwilight: { value: 0 },
        uAurora: { value: 0 },
        uSunDisc: { value: 1 },
        uTime: { value: 0 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), material);
    this.dome.name = 'SkyDome';
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    this.cloudMaterial = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      fog: false,
      uniforms: {
        uLight: { value: new THREE.Color(0xffffff) },
        uShadow: { value: new THREE.Color(0xb8d6f2) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(0xffffff) },
        uHaze: { value: new THREE.Color(0xb4e6ff) },
        uTwilight: { value: 0 },
      },
    });
  }

  /** (Re)cria as nuvens. `detail` controla a tesselação de cada "bolha". */
  setClouds(count: number, detail: number): void {
    for (const cloud of this.cloudInstances) this.clouds.remove(cloud.mesh);
    for (const geometry of this.cloudGeometries) geometry.dispose();
    this.cloudInstances.length = 0;
    this.cloudGeometries.length = 0;

    const rng = createRng(77123);
    const variants = Math.min(6, Math.max(1, count));
    for (let v = 0; v < variants; v++) {
      this.cloudGeometries.push(this.buildCloudGeometry(rng, detail));
    }

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.cloudGeometries[i % variants], this.cloudMaterial);
      const angle = rng() * TAU;
      // Mantém o céu logo acima da cidade mais aberto; nuvens preferem o entorno.
      const radius = 260 + Math.sqrt(rng()) * (CLOUD_FIELD_RADIUS - 260);
      const scale = randRange(rng, 0.8, 1.9);
      mesh.position.set(Math.cos(angle) * radius, randRange(rng, 150, 300), Math.sin(angle) * radius);
      mesh.scale.set(scale, scale * randRange(rng, 0.7, 0.95), scale);
      mesh.rotation.y = rng() * TAU;
      mesh.matrixAutoUpdate = true;
      this.clouds.add(mesh);
      this.cloudInstances.push({ mesh, speed: randRange(rng, 0.6, 1.4) });
    }
  }

  private buildCloudGeometry(rng: () => number, detail: number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const blobs = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < blobs; i++) {
      const t = blobs > 1 ? i / (blobs - 1) : 0.5;
      const radius = randRange(rng, 16, 30) * (1 - Math.abs(t - 0.5) * 0.9);
      const geometry = new THREE.IcosahedronGeometry(radius, detail);
      geometry.scale(1.25, 0.72, 1);
      geometry.translate((t - 0.5) * 120 + randRange(rng, -8, 8), randRange(rng, -3, 9) + radius * 0.2, randRange(rng, -20, 20));
      parts.push(geometry);
    }
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) throw new Error('[Sky] Falha ao gerar geometria de nuvem');
    merged.deleteAttribute('uv');
    merged.computeBoundingSphere();
    return merged;
  }

  /** Cena mínima usada para capturar o mapa de ambiente (reflexos). */
  getEnvironmentScene(): THREE.Scene {
    if (!this.envScene) {
      const scene = new THREE.Scene();
      const dome = new THREE.Mesh(this.dome.geometry, this.dome.material);
      dome.frustumCulled = false;
      scene.add(dome);
      this.envScene = scene;
    }
    return this.envScene;
  }

  /** Intensidade do disco solar/lunar (reduzida durante a captura de ambiente). */
  setDiscIntensity(value: number): void {
    this.dome.material.uniforms.uSunDisc.value = value;
  }

  update(dt: number, elapsed: number, cameraPosition: THREE.Vector3, atmosphere: AtmosphereState, wind: THREE.Vector3): void {
    this.group.position.copy(cameraPosition);

    const u = this.dome.material.uniforms;
    (u.uZenith.value as THREE.Color).copy(atmosphere.zenith);
    (u.uHorizon.value as THREE.Color).copy(atmosphere.horizon);
    (u.uGround.value as THREE.Color).copy(atmosphere.ground);
    (u.uSunDir.value as THREE.Vector3).copy(atmosphere.sunDirection);
    (u.uSunColor.value as THREE.Color).copy(atmosphere.sunDisc);
    (u.uMoonDir.value as THREE.Vector3).copy(atmosphere.moonDirection);
    u.uNight.value = atmosphere.night;
    u.uTwilight.value = atmosphere.twilight;
    u.uAurora.value = atmosphere.aurora;
    u.uTime.value = elapsed;

    const c = this.cloudMaterial.uniforms;
    (c.uLight.value as THREE.Color).copy(atmosphere.cloudLight);
    (c.uShadow.value as THREE.Color).copy(atmosphere.cloudShadow);
    (c.uSunDir.value as THREE.Vector3).copy(atmosphere.lightDirection);
    (c.uSunColor.value as THREE.Color).copy(atmosphere.sunDisc);
    (c.uHaze.value as THREE.Color).copy(atmosphere.horizon);
    c.uTwilight.value = atmosphere.twilight;

    // Deriva das nuvens com o vento (wind.xy = direção, wind.z = força).
    const drift = (2.2 + wind.z * 5) * dt;
    for (const cloud of this.cloudInstances) {
      const p = cloud.mesh.position;
      p.x += wind.x * drift * cloud.speed;
      p.z += wind.y * drift * cloud.speed;
      const d = Math.hypot(p.x, p.z);
      if (d > CLOUD_FIELD_RADIUS) {
        // Reaparece do lado oposto do campo de nuvens.
        p.x = -p.x * 0.98;
        p.z = -p.z * 0.98;
      }
    }
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.cloudMaterial.dispose();
    for (const geometry of this.cloudGeometries) geometry.dispose();
  }
}
