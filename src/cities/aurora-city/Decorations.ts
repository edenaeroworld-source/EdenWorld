import * as THREE from 'three';
import { InstanceBuilder, type GeometryBatcher, xform } from '../../utils/geometry';
import { TAU, randRange } from '../../utils/math';
import type { HologramHandle } from '../../world/Materials';
import { DETAIL_LAYER } from '../../world/Water';
import type { CityContext } from './CityContext';
import { annulus, box, crystalShard, cyl, disc, mergeAll, sphere, torus } from './Kit';

const SIGN_ATLAS_W = 1024;
const SIGN_ATLAS_H = 1536;
const SIGN_CELL_W = 256;
const SIGN_CELL_H = 128;

/** Direção "para frente" de um ângulo de orientação (0 = +Z). */
export function headingVector(heading: number): { x: number; z: number } {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

/** Orientação (heading) que olha do ponto A para o ponto B. */
export function headingTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(bx - ax, bz - az);
}

function benchGeometries(): { frame: THREE.BufferGeometry; wood: THREE.BufferGeometry } {
  const frameParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const leg = box(0.09, 0.42, 0.56);
    leg.translate(side * 0.84, 0, 0);
    frameParts.push(leg);
    const arm = box(0.09, 0.07, 0.6);
    arm.translate(side * 0.84, 0.66, 0.0);
    frameParts.push(arm);
    const post = box(0.09, 0.26, 0.08);
    post.translate(side * 0.84, 0.42, 0.24);
    frameParts.push(post);
    const backPost = box(0.09, 0.62, 0.08);
    backPost.applyMatrix4(xform(side * 0.84, 0.42, -0.27, -0.18, 0, 0));
    frameParts.push(backPost);
  }
  const seat = box(1.9, 0.07, 0.54);
  seat.translate(0, 0.4, 0);
  const back = box(1.9, 0.4, 0.06);
  back.applyMatrix4(xform(0, 0.6, -0.3, -0.18, 0, 0));
  return { frame: mergeAll(frameParts), wood: mergeAll([seat, back]) };
}

function lampGeometries(): { post: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const base = cyl(0.16, 0.22, 0.12, 12);
  const post = cyl(0.055, 0.09, 3.7, 10);
  post.translate(0, 0.12, 0);
  const cup = torus(0.3, 0.035, 6, 20);
  cup.translate(0, 4.0, 0);
  const cap = cyl(0.02, 0.2, 0.12, 12);
  cap.translate(0, 4.3, 0);
  const glow = sphere(0.28, 14, 10);
  glow.translate(0, 4.02, 0);
  return { post: mergeAll([base, post, cup, cap]), glow };
}

function createLightPoolTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[Decorations] Canvas 2D indisponível');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Mobiliário e decoração reutilizáveis de Aurora City: bancos, postes,
 * cristais, placas holográficas, canteiros elevados, orbes de energia e
 * halos de luz noturnos. Objetos repetidos são instanciados.
 */
export class Props {
  private readonly benches: InstanceBuilder;
  private readonly lamps: InstanceBuilder;
  private readonly orbs: InstanceBuilder;
  private readonly signAtlas: HTMLCanvasElement;
  private readonly signContext: CanvasRenderingContext2D;
  private readonly signHologram: HologramHandle;
  private signCount = 0;
  private benchCount = 0;
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(private readonly ctx: CityContext) {
    const m = ctx.materials;
    const bench = benchGeometries();
    const lamp = lampGeometries();
    const orb = sphere(0.2, 12, 8);
    this.geometries.push(bench.frame, bench.wood, lamp.post, lamp.glow, orb);

    this.benches = new InstanceBuilder('Benches', [
      { geometry: bench.frame, material: m.white },
      { geometry: bench.wood, material: m.wood },
    ]);
    this.lamps = new InstanceBuilder('Lamps', [
      { geometry: lamp.post, material: m.white },
      { geometry: lamp.glow, material: m.lampGlow, castShadow: false, receiveShadow: false },
    ]);
    this.orbs = new InstanceBuilder('EnergyOrbs', [{ geometry: orb, material: m.orb, castShadow: false, receiveShadow: false }]);

    this.signHologram = m.createHologram(SIGN_ATLAS_W, SIGN_ATLAS_H, () => undefined, 0x7ff3ff);
    this.signHologram.material.side = THREE.FrontSide;
    this.signAtlas = this.signHologram.texture.image as HTMLCanvasElement;
    const context = this.signAtlas.getContext('2d');
    if (!context) throw new Error('[Decorations] Canvas 2D indisponível');
    this.signContext = context;
  }

  /** Banco com assento interativo. `heading` = direção para a qual o banco olha. */
  bench(x: number, z: number, heading: number, y = this.ctx.ground(x, z), register = true): void {
    this.benches.add(xform(x, y, z, 0, heading, 0));
    this.ctx.physics.addBox({ x, z, halfX: 0.98, halfZ: 0.32, rotation: heading, yMin: y - 0.5, yMax: y + 0.47, blocksCamera: false, surface: 'wood', tag: 'banco' });
    this.ctx.reserve(x, z, 1.4);
    if (!register) return;
    const f = headingVector(heading);
    this.benchCount += 1;
    this.ctx.addInteractable({
      id: `banco-${this.benchCount}`,
      name: 'Banco',
      action: 'Sentar',
      x: x + f.x * 0.25,
      y: y + 0.6,
      z: z + f.z * 0.25,
      range: 2.1,
      payload: { type: 'assento', seat: { x: x + f.x * 0.02, y: y + 0.47, z: z + f.z * 0.02, heading } },
    });
  }

  /** Poste de luz com globo luminoso. */
  lamp(x: number, z: number, y = this.ctx.ground(x, z), color = 0xfff1cc): void {
    this.lamps.add(xform(x, y, z, 0, this.ctx.rng() * TAU, 0));
    this.ctx.physics.addCylinder({ x, z, radius: 0.14, yMin: y - 0.5, yMax: y + 4.3, walkable: false, blocksCamera: false, tag: 'poste' });
    this.ctx.lightSpots.push({ x, y: y + 0.06, z, radius: 7.5, color });
    this.ctx.reserve(x, z, 0.7);
  }

  /** Orbe de energia flutuante. */
  orb(x: number, y: number, z: number, scale = 1): void {
    this.orbs.add(xform(x, y, z, 0, 0, 0, scale));
  }

  /** Conjunto de cristais luminosos. */
  crystals(batch: GeometryBatcher, x: number, z: number, scale = 1, emerald = false, y = this.ctx.ground(x, z)): void {
    const rng = this.ctx.rng;
    const material = emerald ? this.ctx.materials.crystalRose : this.ctx.materials.crystal;
    const count = 4 + Math.floor(rng() * 3);
    batch.add(crystalShard(0.42 * scale, randRange(rng, 3.0, 4.2) * scale), material, xform(x, y - 0.1, z, randRange(rng, -0.06, 0.06), rng() * TAU, randRange(rng, -0.06, 0.06)));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rng() * 0.5;
      const r = randRange(rng, 0.45, 0.85) * scale;
      const tilt = randRange(rng, 0.18, 0.5);
      batch.add(
        crystalShard(randRange(rng, 0.18, 0.32) * scale, randRange(rng, 1.0, 2.3) * scale),
        material,
        // Inclina cada fragmento para fora do centro do conjunto.
        xform(x + Math.cos(a) * r, y - 0.1, z + Math.sin(a) * r, tilt, Math.atan2(Math.cos(a), Math.sin(a)), 0),
      );
    }
    batch.add(cyl(0.9 * scale, 1.05 * scale, 0.16, 10), this.ctx.materials.stone, xform(x, y, z));
    this.ctx.physics.addCylinder({ x, z, radius: 0.85 * scale, yMin: y - 0.5, yMax: y + 3 * scale, walkable: false, blocksCamera: false, tag: 'cristais' });
    this.ctx.lightSpots.push({ x, y: y + 0.06, z, radius: 6 * scale, color: emerald ? 0x6dffc0 : 0x7feaff });
    this.ctx.reserve(x, z, 1.5 * scale);
  }

  /** Canteiro circular elevado. Retorna a altura do topo da terra. */
  planter(batch: GeometryBatcher, x: number, z: number, radius: number, y: number, height = 0.5): number {
    const m = this.ctx.materials;
    batch.add(annulus(radius - 0.22, radius, 0, height, { segments: 28 }), m.white, xform(x, y, z));
    batch.add(disc(radius - 0.2, height - 0.2, height - 0.08, 24), m.soil, xform(x, y, z));
    batch.add(torus(radius - 0.11, 0.035, 6, 28), m.aquaGlow, xform(x, y + height * 0.42, z));
    this.ctx.physics.addCylinder({ x, z, radius, yMin: y - 0.5, yMax: y + height, blocksCamera: false, tag: 'canteiro' });
    this.ctx.reserve(x, z, radius + 0.3);
    return y + height - 0.08;
  }

  /**
   * Placa holográfica informativa: totem de vidro com título flutuante.
   * Retorna a posição para registrar a interação.
   */
  sign(batch: GeometryBatcher, x: number, z: number, heading: number, title: string, subtitle: string, y = this.ctx.ground(x, z)): THREE.Vector3 {
    const m = this.ctx.materials;
    const cell = this.signCount++;
    const columns = SIGN_ATLAS_W / SIGN_CELL_W;
    const rows = SIGN_ATLAS_H / SIGN_CELL_H;
    if (cell >= columns * rows) throw new Error('[Decorations] Atlas de placas esgotado');
    const col = cell % columns;
    const row = Math.floor(cell / columns);
    this.drawSign(col * SIGN_CELL_W, row * SIGN_CELL_H, title, subtitle);

    batch.add(cyl(0.34, 0.42, 0.16, 16), m.white, xform(x, y, z));
    batch.add(box(0.12, 1.25, 0.12), m.white, xform(x, y + 0.12, z));
    batch.add(sphere(0.11, 10, 8), m.aquaGlow, xform(x, y + 1.44, z));
    batch.add(box(1.64, 0.035, 0.05), m.aquaGlow, xform(x, y + 1.6, z, 0, heading, 0));

    const u0 = (col * SIGN_CELL_W) / SIGN_ATLAS_W;
    const u1 = ((col + 1) * SIGN_CELL_W) / SIGN_ATLAS_W;
    // CanvasTexture usa flipY: a linha 0 do canvas fica em v = 1.
    const v1 = 1 - (row * SIGN_CELL_H) / SIGN_ATLAS_H;
    const v0 = 1 - ((row + 1) * SIGN_CELL_H) / SIGN_ATLAS_H;
    for (const flip of [0, Math.PI]) {
      const plane = new THREE.PlaneGeometry(1.6, 0.8);
      const uv = plane.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
      }
      batch.add(plane, this.signHologram.material, xform(x, y + 2.06, z, 0, heading + flip, 0));
    }
    this.ctx.physics.addCylinder({ x, z, radius: 0.36, yMin: y - 0.5, yMax: y + 1.5, walkable: false, blocksCamera: false, tag: 'placa' });
    this.ctx.reserve(x, z, 1);
    return new THREE.Vector3(x, y + 1.1, z);
  }

  private drawSign(px: number, py: number, title: string, subtitle: string): void {
    const c = this.signContext;
    const w = SIGN_CELL_W;
    const h = SIGN_CELL_H;
    c.save();
    c.translate(px, py);
    // Moldura de vidro.
    c.fillStyle = 'rgba(8, 66, 124, 0.66)';
    c.strokeStyle = 'rgba(170, 244, 255, 0.98)';
    c.lineWidth = 3;
    const r = 16;
    c.beginPath();
    c.moveTo(6 + r, 6);
    c.arcTo(w - 6, 6, w - 6, h - 6, r);
    c.arcTo(w - 6, h - 6, 6, h - 6, r);
    c.arcTo(6, h - 6, 6, 6, r);
    c.arcTo(6, 6, w - 6, 6, r);
    c.closePath();
    c.fill();
    c.stroke();

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    let size = 30;
    c.font = `700 ${size}px "Segoe UI", "Trebuchet MS", Arial, sans-serif`;
    while (c.measureText(title).width > w - 30 && size > 14) {
      size -= 2;
      c.font = `700 ${size}px "Segoe UI", "Trebuchet MS", Arial, sans-serif`;
    }
    c.fillText(title, w / 2, subtitle ? h * 0.4 : h / 2);
    if (subtitle) {
      let sub = 17;
      c.font = `500 ${sub}px "Segoe UI", "Trebuchet MS", Arial, sans-serif`;
      while (c.measureText(subtitle).width > w - 28 && sub > 10) {
        sub -= 1;
        c.font = `500 ${sub}px "Segoe UI", "Trebuchet MS", Arial, sans-serif`;
      }
      c.fillStyle = 'rgba(255,255,255,0.86)';
      c.fillText(subtitle, w / 2, h * 0.7);
    }
    c.restore();
  }

  /** Cria as malhas instanciadas e os halos de luz. Chamar uma vez, ao final. */
  finalize(): void {
    const ctx = this.ctx;
    const root = ctx.root;
    for (const mesh of [...this.benches.build(), ...this.lamps.build()]) root.add(mesh);
    for (const mesh of this.orbs.build({ frustumCulled: false })) {
      mesh.layers.set(DETAIL_LAYER);
      root.add(mesh);
    }
    this.signHologram.texture.needsUpdate = true;

    // Halos de luz no chão (visíveis à noite).
    const spots = ctx.lightSpots;
    if (spots.length > 0) {
      const texture = createLightPoolTexture();
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const pools = new THREE.InstancedMesh(geometry, material, spots.length);
      pools.name = 'LightPools';
      const color = new THREE.Color();
      spots.forEach((spot, i) => {
        pools.setMatrixAt(i, xform(spot.x, spot.y, spot.z, 0, 0, 0, spot.radius * 2, 1, spot.radius * 2));
        pools.setColorAt(i, color.set(spot.color));
      });
      pools.instanceMatrix.needsUpdate = true;
      if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
      pools.castShadow = false;
      pools.receiveShadow = false;
      pools.matrixAutoUpdate = false;
      pools.computeBoundingSphere();
      pools.layers.set(DETAIL_LAYER);
      pools.renderOrder = 1;
      pools.visible = false;
      root.add(pools);
      ctx.disposables.push(texture, geometry, material);
      ctx.animate(({ atmosphere }) => {
        const strength = Math.max(0, atmosphere.night - 0.25) / 0.75;
        pools.visible = strength > 0.01;
        material.opacity = strength * 0.42;
      });
    }
    ctx.disposables.push(...this.geometries);
  }
}
