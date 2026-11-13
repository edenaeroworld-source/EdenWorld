import * as THREE from 'three';
import { createRng, randRange } from '../utils/math';
import type { AtmosphereState } from './Atmosphere';
import { DETAIL_LAYER } from './Water';

/** Emissor balístico de gotas (fontes, chafarizes, névoa de cascatas). */
export interface JetSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spread: number;
  count: number;
  size: number;
}

const GRAVITY = 9.8;

const JET_VERTEX = /* glsl */ `
attribute vec3 aVelocity;
attribute vec3 aParams; // x = fase, y = vida (s), z = tamanho
uniform float uTime;
uniform float uScale;
varying float vAlpha;
void main() {
  float life = aParams.y;
  float t = fract(uTime / life + aParams.x) * life;
  vec3 p = position + aVelocity * t;
  p.y -= 0.5 * ${GRAVITY.toFixed(1)} * t * t;
  float k = t / life;
  vAlpha = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.72, 1.0, k));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aParams.z * (1.0 + k * 0.9) * uScale / max(0.1, -mv.z), 1.0, 64.0);
}
`;

const JET_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLight;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = (1.0 - smoothstep(0.25, 1.0, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * uLight, a * 0.8);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const MOTE_VERTEX = /* glsl */ `
attribute vec4 aSeed; // x = fase, y = velocidade, z = tamanho, w = matiz
uniform float uTime;
uniform float uScale;
uniform float uNight;
uniform vec3 uBox;
uniform vec3 uCenter;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec3 drift = vec3(sin(aSeed.x * 6.283 + uTime * 0.21 * aSeed.y), 0.0, cos(aSeed.x * 4.1 + uTime * 0.17 * aSeed.y)) * 2.2;
  vec3 p = position + drift;
  p.y += uTime * 0.16 * aSeed.y;
  // Caixa que acompanha a câmera (as partículas reaparecem do outro lado).
  p.xz = mod(p.xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5 + uCenter.xz;
  p.y = 0.5 + mod(p.y, uBox.y);
  float blink = 0.55 + 0.45 * sin(uTime * (1.2 + aSeed.y) + aSeed.x * 40.0);
  vAlpha = mix(0.3, 0.95 * blink, uNight);
  vec3 dayColor = vec3(1.0, 1.0, 0.92);
  vec3 nightColor = mix(vec3(0.45, 1.0, 0.85), vec3(1.0, 0.95, 0.5), step(0.5, aSeed.w));
  nightColor = mix(nightColor, vec3(0.55, 0.9, 1.0), step(0.8, aSeed.w));
  vColor = mix(dayColor, nightColor, uNight);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(0.1, -mv.z);
  vAlpha *= smoothstep(0.6, 3.0, dist) * (1.0 - smoothstep(uBox.x * 0.36, uBox.x * 0.5, dist));
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSeed.z * mix(0.7, 1.7, uNight) * uScale / dist, 1.0, 24.0);
}
`;

const MOTE_FRAGMENT = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = (1.0 - smoothstep(0.0, 1.0, d)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const BUBBLE_VERTEX = /* glsl */ `
attribute vec4 aBubble; // x = fase, y = velocidade, z = raio, w = altura do ciclo
uniform float uTime;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vFade;
void main() {
  float cycle = fract(uTime * aBubble.y / aBubble.w + aBubble.x);
  vec3 origin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  origin.y += cycle * aBubble.w;
  origin.x += sin(uTime * 0.5 + aBubble.x * 30.0) * 0.8;
  origin.z += cos(uTime * 0.41 + aBubble.x * 17.0) * 0.8;
  float wobble = 1.0 + 0.05 * sin(uTime * 2.3 + aBubble.x * 50.0);
  vec3 p = origin + position * aBubble.z * vec3(wobble, 2.0 - wobble, wobble);
  vFade = smoothstep(0.0, 0.08, cycle) * (1.0 - smoothstep(0.86, 1.0, cycle));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vNormalV = normalize(mat3(viewMatrix) * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const BUBBLE_FRAGMENT = /* glsl */ `
uniform float uLight;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vFade;
void main() {
  vec3 n = normalize(vNormalV);
  float ndv = clamp(dot(n, normalize(vViewDir)), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.6);
  // Película iridescente: o matiz varia com o ângulo.
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (rim * 1.3 + vec3(0.0, 0.33, 0.67)));
  vec3 col = mix(vec3(0.75, 0.95, 1.0), film, 0.45) * rim;
  // Brilhos especulares (janela de luz no alto e reflexo embaixo).
  float spec = pow(max(dot(n, normalize(vec3(-0.45, 0.65, 0.6))), 0.0), 42.0);
  float spec2 = pow(max(dot(n, normalize(vec3(0.4, -0.5, 0.75))), 0.0), 90.0) * 0.5;
  col += vec3(1.0) * (spec + spec2);
  float alpha = clamp(rim * 0.85 + spec + spec2 + 0.04, 0.0, 1.0) * vFade;
  gl_FragColor = vec4(col * uLight, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface BubbleZone {
  x: number;
  z: number;
  y: number;
  radius: number;
  count: number;
}

/**
 * Partículas ambientes do mundo, todas animadas na GPU:
 * gotas das fontes, pólen/vaga-lumes ao redor da câmera e bolhas
 * iridescentes que sobem pela cidade.
 */
export class Particles {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly scale = { value: 600 };
  private jets: THREE.Points | null = null;
  private jetCount = 0;
  private readonly motes: THREE.Points;
  private readonly moteMaterial: THREE.ShaderMaterial;
  private readonly moteCount = 520;
  private bubbles: THREE.InstancedMesh | null = null;
  private environmentEffects = true;
  private bubbleCount = 0;
  private jetMaterial: THREE.ShaderMaterial | null = null;
  private bubbleMaterial: THREE.ShaderMaterial | null = null;
  private density = 1;

  constructor() {
    this.group.name = 'Particles';
    const rng = createRng(2718);
    const box = new THREE.Vector3(72, 15, 72);

    const positions = new Float32Array(this.moteCount * 3);
    const seeds = new Float32Array(this.moteCount * 4);
    for (let i = 0; i < this.moteCount; i++) {
      positions[i * 3] = rng() * box.x;
      positions[i * 3 + 1] = rng() * box.y;
      positions[i * 3 + 2] = rng() * box.z;
      seeds[i * 4] = rng();
      seeds[i * 4 + 1] = randRange(rng, 0.5, 1.5);
      seeds[i * 4 + 2] = randRange(rng, 0.05, 0.12);
      seeds[i * 4 + 3] = rng();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.moteMaterial = new THREE.ShaderMaterial({
      name: 'motes',
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      uniforms: {
        uTime: this.time,
        uScale: this.scale,
        uNight: { value: 0 },
        uBox: { value: box },
        uCenter: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.motes = new THREE.Points(geometry, this.moteMaterial);
    this.motes.name = 'Motes';
    this.motes.frustumCulled = false;
    this.motes.layers.set(DETAIL_LAYER);
    this.motes.renderOrder = 6;
    this.group.add(this.motes);
  }

  /** Cria as gotas de todos os emissores (uma única chamada de desenho). */
  setJets(specs: readonly JetSpec[]): void {
    if (this.jets) {
      this.jets.geometry.dispose();
      this.group.remove(this.jets);
      this.jets = null;
    }
    const total = specs.reduce((sum, spec) => sum + spec.count, 0);
    this.jetCount = total;
    if (total === 0) return;
    const rng = createRng(1414);
    const particles: number[][] = [];
    for (const spec of specs) {
      const speed = Math.hypot(spec.vx, spec.vy, spec.vz);
      for (let i = 0; i < spec.count; i++) {
        const k = 1 + (rng() - 0.5) * spec.spread;
        const lateral = speed * spec.spread * 0.35;
        const vx = spec.vx * k + (rng() - 0.5) * lateral;
        const vy = spec.vy * (1 + (rng() - 0.5) * spec.spread * 0.6);
        const vz = spec.vz * k + (rng() - 0.5) * lateral;
        // Vida = tempo de voo até voltar à altura de origem.
        const life = Math.max(0.5, (2 * vy) / GRAVITY) * 1.04;
        particles.push([spec.x, spec.y, spec.z, vx, vy, vz, rng(), life, spec.size * randRange(rng, 0.7, 1.25)]);
      }
    }
    // Embaralha: reduzir a contagem remove gotas de todas as fontes por igual.
    for (let i = particles.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [particles[i], particles[j]] = [particles[j], particles[i]];
    }
    const positions = new Float32Array(total * 3);
    const velocities = new Float32Array(total * 3);
    const params = new Float32Array(total * 3);
    particles.forEach((p, i) => {
      positions.set(p.slice(0, 3), i * 3);
      velocities.set(p.slice(3, 6), i * 3);
      params.set(p.slice(6, 9), i * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('aParams', new THREE.BufferAttribute(params, 3));
    this.jetMaterial ??= new THREE.ShaderMaterial({
      name: 'jets',
      vertexShader: JET_VERTEX,
      fragmentShader: JET_FRAGMENT,
      uniforms: {
        uTime: this.time,
        uScale: this.scale,
        uColor: { value: new THREE.Color(0xeafcff) },
        uLight: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.jets = new THREE.Points(geometry, this.jetMaterial);
    this.jets.name = 'WaterJets';
    this.jets.frustumCulled = false;
    this.jets.layers.set(DETAIL_LAYER);
    this.jets.renderOrder = 5;
    this.group.add(this.jets);
    this.applyDensity();
  }

  /** Cria bolhas iridescentes que sobem nas zonas indicadas. */
  setBubbles(zones: readonly BubbleZone[]): void {
    if (this.bubbles) {
      this.bubbles.geometry.dispose();
      this.group.remove(this.bubbles);
      this.bubbles = null;
    }
    const total = zones.reduce((sum, zone) => sum + zone.count, 0);
    this.bubbleCount = total;
    if (total === 0) return;
    const rng = createRng(3141);
    const geometry = new THREE.SphereGeometry(1, 18, 12);
    const data = new Float32Array(total * 4);
    this.bubbleMaterial ??= new THREE.ShaderMaterial({
      name: 'bubbles',
      vertexShader: BUBBLE_VERTEX,
      fragmentShader: BUBBLE_FRAGMENT,
      uniforms: { uTime: this.time, uLight: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geometry, this.bubbleMaterial, total);
    const matrix = new THREE.Matrix4();
    const order: { x: number; y: number; z: number }[] = [];
    for (const zone of zones) {
      for (let i = 0; i < zone.count; i++) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * zone.radius;
        order.push({ x: zone.x + Math.cos(a) * r, y: zone.y, z: zone.z + Math.sin(a) * r });
      }
    }
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((p, i) => {
      mesh.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z));
      data[i * 4] = rng();
      data[i * 4 + 1] = randRange(rng, 0.35, 0.9);
      data[i * 4 + 2] = randRange(rng, 0.14, 0.42);
      data[i * 4 + 3] = randRange(rng, 9, 20);
    });
    geometry.setAttribute('aBubble', new THREE.InstancedBufferAttribute(data, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'Bubbles';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.layers.set(DETAIL_LAYER);
    mesh.renderOrder = 5;
    this.bubbles = mesh;
    this.group.add(mesh);
    this.applyDensity();
  }

  setDensity(density: number): void {
    this.density = THREE.MathUtils.clamp(density, 0, 1);
    this.applyDensity();
  }

  /**
   * Efeitos de ambiente: os jatos das fontes e as bolhas submersas. Nos
   * níveis mais baixos eles saem inteiros — a poeira luminosa fica, porque
   * é ela que dá o ar do Éden, e custa uma chamada de desenho só.
   */
  setEnvironmentEffects(enabled: boolean): void {
    this.environmentEffects = enabled;
    this.applyDensity();
  }

  private applyDensity(): void {
    this.motes.geometry.setDrawRange(0, Math.round(this.moteCount * this.density));
    const extra = this.environmentEffects ? 1 : 0;
    this.jets?.geometry.setDrawRange(0, Math.round(this.jetCount * (0.4 + 0.6 * this.density) * extra));
    if (this.bubbles) this.bubbles.count = Math.round(this.bubbleCount * (0.3 + 0.7 * this.density) * extra);
  }

  /** Ajusta o tamanho dos pontos à resolução vertical e ao campo de visão. */
  setViewport(pixelHeight: number, fovDegrees: number): void {
    this.scale.value = pixelHeight / (2 * Math.tan((fovDegrees * Math.PI) / 360));
  }

  update(elapsed: number, atmosphere: AtmosphereState, cameraPosition: THREE.Vector3): void {
    this.time.value = elapsed;
    this.moteMaterial.uniforms.uNight.value = atmosphere.night;
    (this.moteMaterial.uniforms.uCenter.value as THREE.Vector3).copy(cameraPosition);
    const light = 0.35 + 0.65 * atmosphere.daylight;
    if (this.jetMaterial) this.jetMaterial.uniforms.uLight.value = light;
    if (this.bubbleMaterial) this.bubbleMaterial.uniforms.uLight.value = 0.5 + 0.5 * atmosphere.daylight;
  }

  dispose(): void {
    this.motes.geometry.dispose();
    this.moteMaterial.dispose();
    this.jets?.geometry.dispose();
    this.jetMaterial?.dispose();
    this.bubbles?.geometry.dispose();
    this.bubbles?.dispose();
    this.bubbleMaterial?.dispose();
    this.group.clear();
  }
}
