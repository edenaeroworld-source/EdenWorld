import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAX_INTENSITY, Zone as MorphZone, aftersMorphGLSL } from '../afters/AftersMorph';
import { TAU, clamp } from '../utils/math';
import { Ch, type Pose } from './AvatarAnimator';
import { type Expression, FaceController, buildFaceGeometry } from './AvatarFace';
import { type AvatarAppearance, DEFAULT_APPEARANCE } from './AvatarAppearance';

/** Altura da articulação do quadril em relação aos pés (escala 1). */
export const HIP_HEIGHT = 0.845;
const THIGH = 0.41;
const SHIN = 0.385;
const UPPER_ARM = 0.27;
const FOREARM = 0.23;
const WAIST = 0.06;
const SHOULDER_Y = 0.37;
const SHOULDER_X = 0.2;
/** Afastamento lateral do quadril para cada perna. */
const LEG_X = 0.095;
/** Quanto o ombro abre por unidade de AfterBust® (0–2.5). */
const SHOULDER_SPREAD = 0.034;
/** Quanto a perna abre por unidade de AfterCurve® (0–2.5). */
const LEG_SPREAD = 0.022;
const NECK_Y = 0.48;

type Hex = string | number;

/** Acumula primitivas com cor por vértice e as funde em uma única geometria. */
class PartBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly color = new THREE.Color();

  add(geometry: THREE.BufferGeometry, color: Hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    let g = geometry;
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    g.deleteAttribute('uv');
    if (rx !== 0 || ry !== 0 || rz !== 0) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
    if (x !== 0 || y !== 0 || z !== 0) g.translate(x, y, z);
    this.color.set(color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = this.color.r;
      colors[i * 3 + 1] = this.color.g;
      colors[i * 3 + 2] = this.color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  /**
   * @param zone zona de deformação dos Afters gravada em cada vértice
   *   (`AftersMorph.Zone`). Todas as geometrias recebem o atributo, mesmo
   *   as que nunca deformam, para o shader ser um só.
   */
  build(zone: number = MorphZone.None): THREE.BufferGeometry {
    if (this.parts.length === 0) {
      const empty = new THREE.BufferGeometry();
      empty.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      empty.setAttribute('aZone', new THREE.BufferAttribute(new Float32Array(0), 1));
      return empty;
    }
    const merged = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    const count = merged.getAttribute('position')?.count ?? 0;
    const zones = new Float32Array(count);
    if (zone !== 0) zones.fill(zone);
    merged.setAttribute('aZone', new THREE.BufferAttribute(zones, 1));
    merged.computeBoundingSphere();
    return merged;
  }
}

function ball(radius: number, sx = 1, sy = 1, sz = 1, detail = 12): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, detail, Math.max(6, Math.round(detail * 0.7)));
  if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
  return g;
}

/** Membro que desce de y = 0 até y = -length, com as pontas arredondadas. */
function limb(builder: PartBuilder, radiusTop: number, radiusBottom: number, length: number, color: Hex): void {
  const shaft = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 10, 1, true);
  builder.add(shaft, color, 0, -length / 2, 0);
  builder.add(ball(radiusTop, 1, 1, 1, 10), color);
  builder.add(ball(radiusBottom, 1, 1, 1, 10), color, 0, -length, 0);
}

function shade(color: Hex, amount: number): number {
  const c = new THREE.Color(color);
  if (amount >= 0) c.lerp(new THREE.Color(0xffffff), amount);
  else c.lerp(new THREE.Color(0x000000), -amount);
  return c.getHex();
}

interface JointGeometries {
  hips: THREE.BufferGeometry;
  torso: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  forearm: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
}

function buildHair(b: PartBuilder, a: AvatarAppearance): void {
  if (a.hairStyle === 'careca') return;
  const hair = a.hairColor;
  const dark = shade(hair, -0.18);
  const headY = 0.16;
  // Calota inclinada para trás: deixa a testa livre e cobre a nuca.
  const cap = new THREE.SphereGeometry(0.189, 16, 10, 0, TAU, 0, 1.5);
  cap.scale(1.02, 1.06, 1.02);
  b.add(cap, hair, 0, headY + 0.004, -0.006, -0.52, 0, 0);
  // Franja.
  b.add(ball(0.07, 1.25, 0.5, 0.6, 8), hair, -0.055, headY + 0.135, 0.125, 0.35, 0, 0.25);
  b.add(ball(0.07, 1.25, 0.5, 0.6, 8), hair, 0.06, headY + 0.14, 0.12, 0.35, 0, -0.3);

  switch (a.hairStyle) {
    case 'longo': {
      b.add(ball(0.19, 1, 1.5, 0.52, 12), hair, 0, headY - 0.12, -0.085);
      b.add(ball(0.07, 0.8, 2.3, 0.9, 8), dark, 0.15, headY - 0.1, -0.01);
      b.add(ball(0.07, 0.8, 2.3, 0.9, 8), dark, -0.15, headY - 0.1, -0.01);
      break;
    }
    case 'rabo': {
      b.add(ball(0.05, 1, 1, 1, 8), dark, 0, headY + 0.07, -0.2);
      const tail = new THREE.CylinderGeometry(0.058, 0.014, 0.36, 8);
      b.add(tail, hair, 0, headY - 0.1, -0.265, -0.38, 0, 0);
      break;
    }
    case 'coque': {
      b.add(ball(0.082, 1, 0.95, 1, 10), hair, 0, headY + 0.2, -0.07);
      b.add(ball(0.03, 1, 1, 1, 6), dark, 0, headY + 0.13, -0.17);
      break;
    }
    case 'cacheado': {
      const n = 11;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * TAU;
        const high = i % 2 === 0;
        const r = high ? 0.13 : 0.17;
        const y = headY + (high ? 0.13 : 0.02);
        const z = Math.cos(angle) * r - 0.03;
        if (z > 0.09 && !high) continue; // mantém o rosto livre
        b.add(ball(0.075, 1, 1, 1, 8), i % 3 === 0 ? dark : hair, Math.sin(angle) * r, y, z);
      }
      b.add(ball(0.09, 1, 0.9, 1, 8), hair, 0, headY + 0.19, -0.02);
      break;
    }
    case 'espetado': {
      const spikes: [number, number, number, number, number][] = [
        [0, 0.2, 0.04, 0.5, 0],
        [-0.08, 0.18, -0.01, 0.1, 0.5],
        [0.08, 0.18, -0.01, 0.1, -0.5],
        [0, 0.19, -0.08, -0.5, 0],
        [-0.1, 0.12, -0.1, -0.7, 0.7],
        [0.1, 0.12, -0.1, -0.7, -0.7],
        [0, 0.08, -0.17, -1.3, 0],
      ];
      for (const [x, y, z, rx, rz] of spikes) {
        const cone = new THREE.ConeGeometry(0.052, 0.17, 7);
        b.add(cone, hair, x, headY + y, z, rx, 0, rz);
      }
      break;
    }
    default:
      break;
  }
}

function buildAccessory(b: PartBuilder, a: AvatarAppearance): void {
  const headY = 0.16;
  switch (a.accessory) {
    case 'oculos': {
      for (const side of [-1, 1]) {
        const ring = new THREE.TorusGeometry(0.043, 0.007, 6, 16);
        b.add(ring, 0x24323f, side * 0.064, headY + 0.018, 0.168);
        b.add(ball(0.04, 1, 1, 0.12, 8), 0xbfeaff, side * 0.064, headY + 0.018, 0.164);
      }
      b.add(new THREE.BoxGeometry(0.045, 0.008, 0.008), 0x24323f, 0, headY + 0.024, 0.172);
      break;
    }
    case 'fones': {
      const band = new THREE.TorusGeometry(0.196, 0.014, 6, 18, Math.PI);
      b.add(band, 0xf7fbff, 0, headY + 0.01, 0);
      for (const side of [-1, 1]) {
        const cup = new THREE.CylinderGeometry(0.058, 0.058, 0.045, 12);
        b.add(cup, 0x29c8ff, side * 0.19, headY + 0.005, 0, 0, 0, Math.PI / 2);
        b.add(ball(0.04, 0.4, 1, 1, 8), 0xf7fbff, side * 0.215, headY + 0.005, 0);
      }
      break;
    }
    case 'chapeu': {
      b.add(new THREE.CylinderGeometry(0.29, 0.3, 0.016, 20), 0xf3ead6, 0, headY + 0.135, -0.005, -0.1, 0, 0);
      b.add(new THREE.CylinderGeometry(0.135, 0.165, 0.12, 16), 0xf3ead6, 0, headY + 0.2, -0.012, -0.1, 0, 0);
      b.add(new THREE.CylinderGeometry(0.168, 0.17, 0.035, 16), a.topColor, 0, headY + 0.16, -0.008, -0.1, 0, 0);
      break;
    }
    case 'flor': {
      const cx = 0.135;
      const cy = headY + 0.115;
      const cz = 0.085;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * TAU;
        b.add(ball(0.028, 1, 1, 0.5, 6), 0xff8fc0, cx + Math.cos(angle) * 0.034, cy + Math.sin(angle) * 0.034, cz, 0, 0.7, 0);
      }
      b.add(ball(0.02, 1, 1, 0.7, 6), 0xffd84a, cx + 0.008, cy, cz + 0.012);
      break;
    }
    default:
      break;
  }
}

function buildGeometries(a: AvatarAppearance): JointGeometries {
  const skin = a.skin;
  const top = a.topColor;
  const bottom = a.bottomColor;
  const shoe = a.shoeColor;
  const accent = 0x29c8ff;
  const outfit = a.outfit;

  const longSleeves = outfit === 'aero';
  const bareArms = outfit === 'esportivo' || outfit === 'vestido';
  const longPants = outfit === 'casual' || outfit === 'aero';
  const bareLegs = outfit === 'vestido';

  // Quadril.
  const hips = new PartBuilder();
  hips.add(ball(0.125, 1.32, 0.95, 1, 12), outfit === 'vestido' ? top : bottom, 0, 0.025, 0);
  if (outfit === 'vestido') {
    const skirt = new THREE.CylinderGeometry(0.15, 0.3, 0.4, 16, 1, true);
    hips.add(skirt, top, 0, -0.14, 0);
    hips.add(new THREE.TorusGeometry(0.3, 0.014, 6, 20), shade(top, 0.35), 0, -0.34, 0, Math.PI / 2, 0, 0);
    hips.add(new THREE.CylinderGeometry(0.29, 0.29, 0.004, 16), shade(top, -0.25), 0, -0.3, 0);
  }
  if (outfit === 'aero') {
    hips.add(new THREE.TorusGeometry(0.152, 0.02, 6, 20), accent, 0, 0.075, 0, Math.PI / 2, 0, 0);
  }

  // Tronco.
  const torso = new PartBuilder();
  const chest = new THREE.CapsuleGeometry(0.142, 0.17, 5, 14);
  chest.scale(1.18, 1, 0.84);
  torso.add(chest, top, 0, 0.215, 0);
  torso.add(new THREE.CylinderGeometry(0.046, 0.052, 0.09, 10), skin, 0, NECK_Y - 0.03, 0);
  if (outfit === 'aero') {
    torso.add(new THREE.TorusGeometry(0.062, 0.016, 6, 14), accent, 0, NECK_Y - 0.065, 0, Math.PI / 2, 0, 0);
    torso.add(ball(0.03, 1, 1, 0.35, 8), accent, 0, 0.3, 0.122);
    torso.add(ball(0.014, 1, 1, 0.4, 6), 0xffffff, 0, 0.3, 0.131);
  } else if (outfit === 'esportivo') {
    torso.add(new THREE.BoxGeometry(0.2, 0.035, 0.012), shade(top, 0.5), 0, 0.27, 0.118);
  } else if (outfit === 'praia') {
    for (let i = 0; i < 3; i++) torso.add(ball(0.012, 1, 1, 0.5, 6), 0xffffff, 0, 0.16 + i * 0.075, 0.121);
  } else if (outfit === 'vestido') {
    torso.add(new THREE.TorusGeometry(0.15, 0.014, 6, 18), shade(top, 0.35), 0, 0.085, 0, Math.PI / 2, 0, 0);
  }
  if (outfit === 'vestido' || outfit === 'esportivo') {
    // Ombros à mostra.
    torso.add(ball(0.06, 1, 1, 1, 8), skin, SHOULDER_X - 0.012, SHOULDER_Y, 0);
    torso.add(ball(0.06, 1, 1, 1, 8), skin, -SHOULDER_X + 0.012, SHOULDER_Y, 0);
  }

  // Cabeça.
  const head = new PartBuilder();
  const headY = 0.16;
  head.add(ball(0.176, 1, 1.05, 0.98, 18), skin, 0, headY, 0);
  head.add(ball(0.03, 0.6, 1, 0.8, 6), skin, 0.172, headY - 0.005, 0);
  head.add(ball(0.03, 0.6, 1, 0.8, 6), skin, -0.172, headY - 0.005, 0);
  const blush = new THREE.Color(skin).lerp(new THREE.Color(0xff8fa8), 0.38).getHex();
  for (const side of [-1, 1]) {
    head.add(ball(0.027, 1, 1.3, 0.42, 10), 0xffffff, side * 0.064, headY + 0.018, 0.152);
    head.add(ball(0.021, 1, 1.25, 0.42, 10), a.eyeColor, side * 0.064, headY + 0.016, 0.16);
    head.add(ball(0.011, 1, 1.2, 0.4, 6), 0x14161c, side * 0.064, headY + 0.014, 0.167);
    head.add(ball(0.006, 1, 1, 0.5, 6), 0xffffff, side * 0.064 + 0.008, headY + 0.028, 0.171);
    head.add(ball(0.03, 1, 0.62, 0.3, 8), blush, side * 0.108, headY - 0.045, 0.135);
  }
  // Sobrancelhas, pálpebras e boca não entram aqui: são a malha do rosto,
  // que tem alvos de morph e muda de expressão (ver `AvatarFace`).
  buildHair(head, a);
  buildAccessory(head, a);

  // Braços.
  const upperArm = new PartBuilder();
  limb(upperArm, 0.058, 0.05, UPPER_ARM, bareArms ? skin : top);
  if (outfit === 'casual' || outfit === 'praia') {
    // Manga curta: metade inferior do braço na cor da pele.
    upperArm.add(new THREE.CylinderGeometry(0.052, 0.049, UPPER_ARM * 0.5, 10, 1, true), skin, 0, -UPPER_ARM * 0.75, 0);
    upperArm.add(ball(0.051, 1, 1, 1, 10), skin, 0, -UPPER_ARM, 0);
    upperArm.add(new THREE.TorusGeometry(0.056, 0.008, 5, 12), shade(top, -0.12), 0, -UPPER_ARM * 0.5, 0, Math.PI / 2, 0, 0);
  }
  const forearm = new PartBuilder();
  limb(forearm, 0.048, 0.041, FOREARM, longSleeves ? top : skin);
  forearm.add(ball(0.052, 0.9, 1.1, 0.8, 10), skin, 0, -FOREARM - 0.035, 0);
  if (longSleeves) forearm.add(new THREE.TorusGeometry(0.046, 0.011, 5, 12), accent, 0, -FOREARM + 0.02, 0, Math.PI / 2, 0, 0);

  // Pernas.
  const thigh = new PartBuilder();
  limb(thigh, 0.082, 0.064, THIGH, bareLegs ? skin : bottom);
  if (!longPants && !bareLegs) {
    // Bermuda: a parte de baixo da coxa fica na cor da pele.
    thigh.add(new THREE.CylinderGeometry(0.067, 0.063, THIGH * 0.32, 10, 1, true), skin, 0, -THIGH * 0.84, 0);
    thigh.add(ball(0.0645, 1, 1, 1, 10), skin, 0, -THIGH, 0);
    thigh.add(new THREE.TorusGeometry(0.073, 0.008, 5, 12), shade(bottom, -0.12), 0, -THIGH * 0.68, 0, Math.PI / 2, 0, 0);
  }
  const shin = new PartBuilder();
  limb(shin, 0.062, 0.046, SHIN - 0.04, longPants ? bottom : skin);
  if (outfit === 'praia') {
    shin.add(ball(0.07, 0.95, 0.5, 1.75, 10), skin, 0, -SHIN, 0.04);
    shin.add(new THREE.BoxGeometry(0.13, 0.022, 0.26), shoe, 0, -SHIN - 0.038, 0.04);
    shin.add(new THREE.BoxGeometry(0.135, 0.016, 0.03), shoe, 0, -SHIN + 0.012, 0.075);
  } else {
    shin.add(ball(0.074, 1, 0.68, 1.8, 10), shoe, 0, -SHIN, 0.042);
    shin.add(new THREE.BoxGeometry(0.135, 0.02, 0.255), shade(shoe, outfit === 'esportivo' ? 0.7 : -0.3), 0, -SHIN - 0.04, 0.042);
  }

  return {
    // O quadril leva a saia do vestido junto; a coxa recebe uma zona
    // atenuada para a junção com o quadril não ficar estrangulada.
    hips: hips.build(MorphZone.Curve),
    torso: torso.build(MorphZone.Bust),
    head: head.build(),
    face: buildFaceGeometry(a),
    upperArm: upperArm.build(),
    forearm: forearm.build(),
    thigh: thigh.build(MorphZone.Thigh),
    shin: shin.build(),
  };
}

/** Semente estável por aparência: desencontra as piscadas entre habitantes. */
function seedFrom(appearance: AvatarAppearance): number {
  const text = `${appearance.skin}${appearance.hairColor}${appearance.hairStyle}${appearance.outfit}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 100000);
}

/**
 * Avatar estilizado do jogador, 100% procedural. Cada articulação é uma
 * única malha com cores por vértice (11 chamadas de desenho no total),
 * reconstruída quando a aparência muda.
 */
export class Avatar {
  /** Origem nos pés; `rotation.y` é a direção do personagem. */
  readonly root = new THREE.Group();
  private readonly scaler = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly hips: THREE.Mesh;
  private readonly torso: THREE.Mesh;
  private readonly head: THREE.Mesh;
  /** Sobrancelhas, pálpebras e boca: a malha que muda de expressão. */
  private readonly faceMesh: THREE.Mesh;
  /** Mistura de expressões, fala e piscadas. */
  readonly face: FaceController;
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;
  private readonly foreL: THREE.Mesh;
  private readonly foreR: THREE.Mesh;
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly shinL: THREE.Mesh;
  private readonly shinR: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  /** Material de profundidade com a mesma deformação: a sombra acompanha. */
  private readonly depthMaterial: THREE.MeshDepthMaterial;
  private readonly haloMaterial: THREE.MeshBasicMaterial;
  /** Fração da cor própria somada à luz recebida (uniforme do shader). */
  private readonly fillUniform = { value: 0.1 };
  /** Intensidade do AfterBust® aplicada à silhueta (0–2.5). */
  private readonly bustUniform = { value: 0 };
  /** Intensidade do AfterCurve® aplicada à silhueta (0–2.5). */
  private readonly curveUniform = { value: 0 };
  private geometries: JointGeometries | null = null;
  private current: AvatarAppearance = DEFAULT_APPEARANCE;

  constructor(appearance: AvatarAppearance = DEFAULT_APPEARANCE) {
    this.root.name = 'avatar';
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.02 });
    this.material.name = 'avatar';
    // Luz de preenchimento: soma um pouco da própria cor para que a pele e as
    // roupas não fiquem acinzentadas na sombra (a luz ambiente é azulada).
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.avatarFill = this.fillUniform;
      shader.uniforms.uBust = this.bustUniform;
      shader.uniforms.uCurve = this.curveUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float avatarFill;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * avatarFill;');
      // Afters: a silhueta é deformada na GPU, no espaço local da junta.
      // Como o rig só gira juntas, a deformação continua correta andando,
      // correndo, nadando ou sentado — e a roupa vai junto, porque está na
      // mesma malha fundida.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${aftersMorphGLSL()}`)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tobjectNormal = edenAftersNormal(position, objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = edenAftersPosition(transformed);');
    };
    this.material.customProgramCacheKey = () => 'eden-avatar-fill-afters';

    // O mapa de sombras usa um material próprio: sem isto a sombra do
    // avatar continuaria com a silhueta antiga enquanto o corpo muda.
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    this.depthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uBust = this.bustUniform;
      shader.uniforms.uCurve = this.curveUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${aftersMorphGLSL()}`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = edenAftersPosition(transformed);');
    };
    this.depthMaterial.customProgramCacheKey = () => 'eden-avatar-depth-afters';
    this.haloMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a8, toneMapped: false });

    const mesh = (name: string): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
      m.name = name;
      m.customDepthMaterial = this.depthMaterial;
      m.castShadow = true;
      m.receiveShadow = false;
      return m;
    };
    this.hips = mesh('quadril');
    this.torso = mesh('tronco');
    this.head = mesh('cabeca');
    // O rosto usa o mesmo material (mesma luz, mesma cor por vértice), mas
    // não entra no mapa de sombras: são peças de milímetros.
    this.faceMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.faceMesh.name = 'rosto';
    this.faceMesh.castShadow = false;
    this.faceMesh.receiveShadow = false;
    this.face = new FaceController(seedFrom(appearance));
    this.armL = mesh('braco-e');
    this.armR = mesh('braco-d');
    this.foreL = mesh('antebraco-e');
    this.foreR = mesh('antebraco-d');
    this.legL = mesh('coxa-e');
    this.legR = mesh('coxa-d');
    this.shinL = mesh('perna-e');
    this.shinR = mesh('perna-d');

    this.root.add(this.scaler);
    this.scaler.add(this.pivot);
    this.pivot.position.y = HIP_HEIGHT;
    this.pivot.add(this.hips);
    this.hips.add(this.torso, this.legL, this.legR);
    this.torso.position.y = WAIST;
    this.torso.add(this.head, this.armL, this.armR);
    this.head.position.y = NECK_Y;
    this.head.add(this.faceMesh);
    this.armL.position.set(SHOULDER_X, SHOULDER_Y, 0);
    this.armR.position.set(-SHOULDER_X, SHOULDER_Y, 0);
    this.armL.add(this.foreL);
    this.armR.add(this.foreR);
    this.foreL.position.y = -UPPER_ARM;
    this.foreR.position.y = -UPPER_ARM;
    this.legL.position.set(LEG_X, -0.02, 0);
    this.legR.position.set(-LEG_X, -0.02, 0);
    this.legL.add(this.shinL);
    this.legR.add(this.shinR);
    this.shinL.position.y = -THIGH;
    this.shinR.position.y = -THIGH;

    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 8, 28), this.haloMaterial);
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.set(0, 0.44, 0);
    this.halo.visible = false;
    this.head.add(this.halo);

    this.setAppearance(appearance);
  }

  get appearance(): AvatarAppearance {
    return this.current;
  }

  setAppearance(appearance: AvatarAppearance): void {
    this.current = { ...appearance };
    const next = buildGeometries(appearance);
    const previous = this.geometries;
    this.geometries = next;
    this.hips.geometry = next.hips;
    this.torso.geometry = next.torso;
    this.head.geometry = next.head;
    this.faceMesh.geometry = next.face;
    // Reinicia os pesos de morph para a geometria nova (mesma ordem de alvos).
    this.faceMesh.updateMorphTargets();
    this.face.reset();
    this.armL.geometry = this.armR.geometry = next.upperArm;
    this.foreL.geometry = this.foreR.geometry = next.forearm;
    this.legL.geometry = this.legR.geometry = next.thigh;
    this.shinL.geometry = this.shinR.geometry = next.shin;
    this.halo.visible = appearance.accessory === 'aureola';
    this.scaler.scale.setScalar(appearance.height);
    if (previous) for (const geometry of Object.values(previous)) geometry.dispose();
  }

  /**
   * Transformação de silhueta dos Afters®, aplicada ao vivo.
   *
   * Escrever aqui custa dois `float`: não reconstrói geometria, não troca
   * material e não interrompe a animação. `0, 0` devolve exatamente a
   * silhueta original.
   *
   * @param bust intensidade do AfterBust® (0 a 2.5, ou seja 0% a 250%)
   * @param curve intensidade do AfterCurve® (0 a 2.5)
   */
  setMorph(bust: number, curve: number): void {
    const b = clamp(bust, 0, MAX_INTENSITY);
    const c = clamp(curve, 0, MAX_INTENSITY);
    this.bustUniform.value = b;
    this.curveUniform.value = c;
    // O rig acompanha: ombros e pernas abrem um pouco, como fariam em volta
    // de um corpo mais largo. São deslocamentos de junta, não deformação —
    // braços e pernas continuam do mesmo tamanho, só não atravessam o corpo.
    const shoulder = SHOULDER_X + b * SHOULDER_SPREAD;
    this.armL.position.x = shoulder;
    this.armR.position.x = -shoulder;
    const leg = LEG_X + c * LEG_SPREAD;
    this.legL.position.x = leg;
    this.legR.position.x = -leg;
  }

  /** Intensidades em vigor neste instante (já limitadas). */
  get morph(): { bust: number; curve: number } {
    return { bust: this.bustUniform.value, curve: this.curveUniform.value };
  }

  /**
   * Troca a expressão do rosto. A mudança é suave: os pesos de morph
   * caminham até o alvo em alguns décimos de segundo.
   */
  setExpression(expression: Expression): void {
    this.face.setExpression(expression);
  }

  /** Nível de fala (0–1): a boca abre e fecha enquanto o texto aparece. */
  setTalking(level: number): void {
    this.face.setTalking(level);
  }

  /** Expressão em vigor. */
  get expression(): Expression {
    return this.face.expression;
  }

  /**
   * Avança o rosto e copia os pesos para a malha.
   *
   * Separado de `applyPose` porque o corpo e o rosto têm ritmos diferentes:
   * a pose vem do animador a cada quadro, o rosto anda sozinho (piscadas,
   * boca) mesmo quando a pose não muda.
   */
  updateFace(dt: number): void {
    this.face.update(dt);
    const influences = this.faceMesh.morphTargetInfluences;
    if (!influences) return;
    const weights = this.face.weights;
    for (let i = 0; i < influences.length && i < weights.length; i += 1) influences[i] = weights[i];
  }

  /** Intensidade da luz de preenchimento (0 = só a luz do cenário). */
  get fill(): number {
    return this.fillUniform.value;
  }

  set fill(value: number) {
    this.fillUniform.value = value;
  }

  /** Altura aproximada do topo da cabeça (para etiquetas e câmera). */
  get topHeight(): number {
    return 1.76 * this.current.height;
  }

  applyPose(pose: Pose, elapsed = 0): void {
    this.pivot.position.y = HIP_HEIGHT + pose[Ch.HipsY];
    this.pivot.rotation.x = pose[Ch.BodyPitch];
    this.torso.rotation.set(pose[Ch.TorsoX], pose[Ch.TorsoY], pose[Ch.TorsoZ]);
    this.head.rotation.set(pose[Ch.HeadX], pose[Ch.HeadY], 0);
    this.armL.rotation.set(pose[Ch.ArmLX], 0, pose[Ch.ArmLZ]);
    this.armR.rotation.set(pose[Ch.ArmRX], 0, pose[Ch.ArmRZ]);
    this.foreL.rotation.x = pose[Ch.ForeL];
    this.foreR.rotation.x = pose[Ch.ForeR];
    this.legL.rotation.set(pose[Ch.LegLX], 0, pose[Ch.LegLZ]);
    this.legR.rotation.set(pose[Ch.LegRX], 0, pose[Ch.LegRZ]);
    this.shinL.rotation.x = pose[Ch.ShinL];
    this.shinR.rotation.x = pose[Ch.ShinR];
    if (this.halo.visible) this.halo.position.y = 0.44 + Math.sin(elapsed * 2.2) * 0.012;
  }

  setShadows(enabled: boolean): void {
    this.root.traverse((object) => {
      // A auréola e o rosto ficam de fora: luz própria e peças de milímetros.
      if ((object as THREE.Mesh).isMesh && object !== this.halo && object !== this.faceMesh) object.castShadow = enabled;
    });
  }

  dispose(): void {
    if (this.geometries) for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.geometries = null;
    this.halo.geometry.dispose();
    this.material.dispose();
    this.depthMaterial.dispose();
    this.haloMaterial.dispose();
    this.root.removeFromParent();
  }
}
