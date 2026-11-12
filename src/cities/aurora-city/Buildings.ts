import * as THREE from 'three';
import { type GeometryBatcher, xform } from '../../utils/geometry';
import { TAU, type Rng, createRng, pick, randRange } from '../../utils/math';
import { BLOSSOM_COLORS, BUSH_GREENS, LEAF_GREENS, PALM_GREENS } from '../../world/Vegetation';
import type { CityContext } from './CityContext';
import type { Props } from './Decorations';
import { annulus, blob, box, crystalShard, cyl, disc, dome, lathe, scaleUV, sphere, torus, tube } from './Kit';
import { type BuildingLot, H0, forecourtRadius } from './Layout';

/** Tamanho aproximado de um painel de fachada (m). */
const PANEL_W = 3.2;
const PANEL_H = 3.4;

/** Ferramentas compartilhadas pelos construtores de cada tipo de edifício. */
class BuildingKit {
  readonly shell: GeometryBatcher;
  readonly detail: GeometryBatcher;
  readonly rng: Rng;
  private readonly base: THREE.Matrix4;
  private readonly cos: number;
  private readonly sin: number;

  constructor(
    readonly ctx: CityContext,
    readonly lot: BuildingLot,
  ) {
    this.shell = ctx.batch();
    this.detail = ctx.batch();
    this.rng = createRng(lot.seed * 7919);
    this.base = xform(lot.x, H0, lot.z, 0, lot.rotation, 0);
    this.cos = Math.cos(lot.rotation);
    this.sin = Math.sin(lot.rotation);
  }

  /** Matriz de uma peça em coordenadas locais do lote (+Z = fachada principal). */
  at(lx = 0, y = 0, lz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
    return this.base.clone().multiply(xform(lx, y, lz, rx, ry, rz, sx, sy, sz));
  }

  /** Converte um ponto local do lote para o mundo. */
  world(lx: number, lz: number): { x: number; z: number } {
    return { x: this.lot.x + lx * this.cos + lz * this.sin, z: this.lot.z - lx * this.sin + lz * this.cos };
  }

  /** Massa de folhagem estática (jardins de fachada). */
  foliage(lx: number, y: number, lz: number, radius: number, sy = 0.8, detail = false): void {
    const geometry = blob(radius, 1, this.rng, 0.16);
    (detail ? this.detail : this.shell).add(geometry, this.ctx.materials.foliage, this.at(lx, y, lz, 0, this.rng() * TAU, 0, 1, sy, 1));
  }

  /** Trepadeira pendente sob a borda de uma laje. */
  vine(lx: number, y: number, lz: number, length: number): void {
    const geometry = blob(0.34, 1, this.rng, 0.2);
    this.detail.add(geometry, this.ctx.materials.foliage, this.at(lx, y - length * 0.5, lz, 0, this.rng() * TAU, 0, 1, length / 0.68, 0.8));
  }

  /** Colisor cilíndrico em coordenadas locais. */
  collideCylinder(lx: number, lz: number, radius: number, yTop: number, walkable = false, tag = 'edificio'): void {
    const p = this.world(lx, lz);
    this.ctx.physics.addCylinder({ x: p.x, z: p.z, radius, yMin: H0 - 2, yMax: H0 + yTop, walkable, blocksCamera: !walkable || yTop > 1.2, tag });
  }

  /** Árvore sobre o edifício (terraços, jardins internos). */
  tree(kind: 'frondosa' | 'palmeira' | 'cipreste' | 'bananeira', lx: number, y: number, lz: number, scale: number, color?: number): void {
    const p = this.world(lx, lz);
    const palette = kind === 'palmeira' || kind === 'bananeira' ? PALM_GREENS : LEAF_GREENS;
    this.ctx.vegetation.addTree({
      kind,
      x: p.x,
      z: p.z,
      y: H0 + y,
      scale,
      rotation: this.rng() * TAU,
      color: new THREE.Color(color ?? pick(this.rng, palette)),
      collide: false,
    });
  }

  finish(detailDistance = 230): void {
    const { ctx, lot } = this;
    ctx.commit(this.shell, `Edificio:${lot.id}`);
    if (!this.detail.isEmpty) {
      const group = ctx.commit(this.detail, `Edificio:${lot.id}:detalhes`);
      ctx.addDetailGroup(group, lot.x, lot.z, detailDistance);
    }
  }
}

/** Prisma hexagonal com faces planas (fachadas facetadas das agulhas). */
function hexSegment(radiusTop: number, radiusBottom: number, height: number): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 6, 1, true);
  base.translate(0, height / 2, 0);
  const flat = base.toNonIndexed();
  base.dispose();
  flat.computeVertexNormals();
  scaleUV(flat, Math.max(6, Math.round((TAU * radiusBottom) / PANEL_W / 6) * 6), height / PANEL_H);
  return flat;
}

function facadeCylinder(radius: number, height: number, radial = 36): THREE.BufferGeometry {
  const geometry = cyl(radius, radius, height, radial, true);
  scaleUV(geometry, Math.max(4, Math.round((TAU * radius) / PANEL_W)), Math.max(1, Math.round(height / PANEL_H)));
  return geometry;
}

/* ------------------------------------------------------------------ */
/* Torre curva de vidro                                                 */
/* ------------------------------------------------------------------ */

function buildTower(kit: BuildingKit): void {
  const { ctx, lot, shell, detail } = kit;
  const m = ctx.materials;
  const R = lot.radius;
  const H = lot.height;
  const bodyR = R * 0.76;
  const facade = lot.seed % 2 === 0 ? m.facadeEmerald : m.facade;

  // Embasamento em degraus.
  shell.add(disc(R + 1.2, 0, 0.35, 48), m.stone, kit.at());
  shell.add(disc(R + 0.3, 0.35, 0.7, 48), m.white, kit.at());
  kit.collideCylinder(0, 0, R + 1.2, 0.35, true, 'torre-degrau');
  kit.collideCylinder(0, 0, R + 0.3, 0.7, true, 'torre-degrau');

  // Saguão envidraçado e marquise.
  const lobbyR = bodyR * 0.9;
  shell.add(facadeCylinder(lobbyR, 4.7), facade, kit.at(0, 0.7, 0));
  shell.add(annulus(lobbyR - 0.6, bodyR + 1.7, 5.4, 5.85, { bottom: true, segments: 48 }), m.white, kit.at());
  shell.add(torus(bodyR + 1.72, 0.07, 6, 56), m.aquaGlow, kit.at(0, 5.62, 0));

  // Corpo: perfil curvo que se afina em direção ao topo.
  const y0 = 5.85;
  const y1 = H - 2.6;
  const radiusAt = (t: number): number => bodyR * (1 + 0.1 * Math.sin(Math.PI * t)) * (1 - 0.3 * Math.pow(t, 2.2));
  const profile: [number, number][] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    profile.push([radiusAt(t), y0 + (y1 - y0) * t]);
  }
  const body = lathe(profile, 40);
  scaleUV(body, Math.round((TAU * bodyR) / PANEL_W), Math.round((y1 - y0) / PANEL_H));
  shell.add(body, facade, kit.at());

  // Cinturões brancos entre blocos de andares.
  const bands = Math.max(2, Math.round((y1 - y0) / 11));
  for (let i = 1; i < bands; i++) {
    const t = i / bands;
    shell.add(torus(radiusAt(t) + 0.1, 0.2, 6, 44), m.white, kit.at(0, y0 + (y1 - y0) * t, 0));
  }

  // Nervuras curvas e filete de luz.
  const spine = (angle: number, radius: number, offset: number, material: THREE.Material, batch: GeometryBatcher): void => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const r = radiusAt(t) + offset;
      points.push(new THREE.Vector3(Math.cos(angle) * r, y0 + (y1 - y0) * t, Math.sin(angle) * r));
    }
    batch.add(tube(points, radius, 30, 8), material, kit.at());
  };
  const front = Math.PI / 2;
  spine(front + 0.95, 0.34, 0.12, m.white, shell);
  spine(front - 0.95, 0.34, 0.12, m.white, shell);
  spine(front + Math.PI, 0.34, 0.12, m.white, shell);
  spine(front, 0.1, 0.1, m.aquaGlow, shell);
  spine(front + 2.2, 0.08, 0.1, m.greenGlow, detail);
  spine(front - 2.2, 0.08, 0.1, m.greenGlow, detail);

  // Topo: cúpula, coroa flutuante e antena.
  const topR = radiusAt(1);
  shell.add(dome(topR, 32, 10, 0.55), m.white, kit.at(0, y1, 0));
  const crownY = y1 + topR * 0.55 + 1.4;
  shell.add(torus(topR + 1.5, 0.24, 8, 48), m.white, kit.at(0, crownY, 0));
  shell.add(torus(topR + 1.5, 0.09, 6, 48), m.aquaGlow, kit.at(0, crownY + 0.34, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    shell.add(
      tube([new THREE.Vector3(Math.cos(a) * topR * 0.7, y1 + topR * 0.3, Math.sin(a) * topR * 0.7), new THREE.Vector3(Math.cos(a) * (topR + 1.4), crownY, Math.sin(a) * (topR + 1.4))], 0.09, 4, 6),
      m.white,
      kit.at(),
    );
  }
  shell.add(cyl(0.05, 0.14, H - y1 - topR * 0.5 + 3, 8), m.metal, kit.at(0, y1 + topR * 0.5, 0));
  shell.add(sphere(0.34, 12, 8), m.aquaGlow, kit.at(0, H + 3, 0));

  // Jardim suspenso a meia altura, voltado para a praça.
  const gardens = H > 45 ? [0.36, 0.66] : [0.5];
  for (const t of gardens) {
    const gy = y0 + (y1 - y0) * t;
    const gr = radiusAt(t);
    const arc = 2.2;
    shell.add(annulus(gr - 0.6, gr + 3.8, gy, gy + 0.4, { angleStart: front - arc / 2, angleLength: arc, bottom: true, segments: 20 }), m.white, kit.at());
    detail.add(annulus(gr + 3.66, gr + 3.72, gy + 0.4, gy + 1.4, { angleStart: front - arc / 2, angleLength: arc, segments: 20 }), m.glass, kit.at());
    detail.add(torus(gr + 3.8, 0.05, 6, 24, arc), m.aquaGlow, kit.at(0, gy + 0.2, 0, 0, -(front - arc / 2) - arc, 0));
    for (let i = 0; i < 7; i++) {
      const a = front - arc / 2 + 0.15 + (i / 6) * (arc - 0.3);
      const r = gr + 2.9;
      kit.foliage(Math.cos(a) * r, gy + 0.75, Math.sin(a) * r, randRange(kit.rng, 0.55, 0.85), 0.8, true);
      if (i % 2 === 0) kit.vine(Math.cos(a) * (gr + 3.75), gy + 0.3, Math.sin(a) * (gr + 3.75), randRange(kit.rng, 1.4, 2.6));
    }
    kit.tree('frondosa', 0, gy + 0.4, gr + 2.0, 0.55, pick(kit.rng, BLOSSOM_COLORS));
  }

  // Entrada.
  shell.add(box(3.6, 4.1, 0.7), m.white, kit.at(0, 0.7, lobbyR));
  shell.add(box(2.8, 3.4, 0.76), m.glass, kit.at(0, 0.7, lobbyR));
  detail.add(box(2.9, 0.06, 0.8), m.aquaGlow, kit.at(0, 4.3, lobbyR));

  kit.collideCylinder(0, 0, bodyR * 1.1 + 0.25, H);
}

/* ------------------------------------------------------------------ */
/* Agulha de cristal (Torre Aurora e agulhas menores)                   */
/* ------------------------------------------------------------------ */

function buildSpire(kit: BuildingKit): void {
  const { ctx, lot, shell, detail } = kit;
  const m = ctx.materials;
  const R = lot.radius;
  const H = lot.height;
  const k = R / 10;
  const grand = R > 20;

  // Plataforma em degraus baixos (caminháveis).
  const tiers = grand ? 4 : 2;
  for (let i = 0; i < tiers; i++) {
    const r = R - i * R * 0.1;
    shell.add(disc(r, i * 0.4, (i + 1) * 0.4, 64), i % 2 === 0 ? m.stone : m.white, kit.at());
    kit.collideCylinder(0, 0, r, (i + 1) * 0.4, true, 'agulha-degrau');
  }
  const deck = tiers * 0.4;
  const deckR = R - (tiers - 1) * R * 0.1;

  // Espelho d'água anelar ao redor da base.
  const poolIn = R * 0.46;
  const poolOut = Math.min(deckR - 1.2, R * 0.62);
  shell.add(annulus(poolIn, poolOut, deck - 0.02, deck + 0.03, { segments: 64 }), m.poolWater, kit.at());
  shell.add(torus(poolOut + 0.08, 0.06, 6, 64), m.aquaGlow, kit.at(0, deck + 0.04, 0));
  shell.add(torus(poolIn - 0.08, 0.06, 6, 64), m.aquaGlow, kit.at(0, deck + 0.04, 0));

  // Base branca curva.
  const baseTop = deck + 2.6 * k;
  shell.add(
    lathe(
      [
        [R * 0.44, deck],
        [R * 0.41, deck + 1.2 * k],
        [R * 0.37, baseTop],
      ],
      6,
    ),
    m.white,
    kit.at(),
  );

  // Corpo facetado em três segmentos.
  const h1 = H * 0.42;
  const h2 = H * 0.33;
  const h3 = H - baseTop - h1 - h2;
  const facade = lot.seed % 2 === 0 ? m.facadeEmerald : m.facade;
  shell.add(hexSegment(R * 0.27, R * 0.36, h1), facade, kit.at(0, baseTop, 0));
  shell.add(hexSegment(R * 0.165, R * 0.25, h2), facade, kit.at(0, baseTop + h1, 0, 0, Math.PI / 6, 0));
  shell.add(hexSegment(0.06 * k, R * 0.14, h3), m.crystal, kit.at(0, baseTop + h1 + h2, 0));
  // Colares entre os segmentos.
  shell.add(cyl(R * 0.3, R * 0.3, 0.7 * k, 6), m.white, kit.at(0, baseTop + h1 - 0.35 * k, 0));
  shell.add(cyl(R * 0.19, R * 0.19, 0.6 * k, 6), m.white, kit.at(0, baseTop + h1 + h2 - 0.3 * k, 0, 0, Math.PI / 6, 0));
  shell.add(torus(R * 0.31, 0.1 * k, 6, 6), m.aquaGlow, kit.at(0, baseTop + h1 + 0.4 * k, 0, 0, Math.PI / 6, 0));
  shell.add(torus(R * 0.2, 0.08 * k, 6, 6), m.aquaGlow, kit.at(0, baseTop + h1 + h2 + 0.35 * k, 0));

  // Contrafortes curvos.
  const fins = grand ? 6 : 3;
  for (let i = 0; i < fins; i++) {
    const a = (i / fins) * TAU + Math.PI / 6;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const points = [
      new THREE.Vector3(c * R * 0.7, deck, s * R * 0.7),
      new THREE.Vector3(c * R * 0.52, deck + H * 0.09, s * R * 0.52),
      new THREE.Vector3(c * R * 0.37, deck + H * 0.22, s * R * 0.37),
      new THREE.Vector3(c * R * 0.3, deck + H * 0.36, s * R * 0.3),
    ];
    shell.add(tube(points, 0.4 * k, 24, 8), m.white, kit.at());
    const p = kit.world(c * R * 0.7, s * R * 0.7);
    ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 0.55 * k, yMin: H0 - 2, yMax: H0 + 6 * k, walkable: false, blocksCamera: false, tag: 'agulha-contraforte' });

    // Cascatas entre os contrafortes (apenas na torre principal).
    if (grand && i % 2 === 0) {
      const wa = a + Math.PI / fins;
      const fallTop = baseTop + h1 * 0.2;
      // A lâmina cai à frente da base branca, direto no espelho d'água.
      const fallR = R * 0.455;
      const sheet = new THREE.PlaneGeometry(3.4, fallTop - deck);
      scaleUV(sheet, 3.4, 1);
      shell.add(sheet, m.waterfall, kit.at(Math.cos(wa) * fallR, deck + (fallTop - deck) / 2, Math.sin(wa) * fallR, 0, Math.PI / 2 - wa, 0));
      // Bica: laje que avança do corpo da torre até a queda.
      shell.add(box(3.9, 0.5, R * 0.17), m.white, kit.at(Math.cos(wa) * R * 0.38, fallTop - 0.3, Math.sin(wa) * R * 0.38, 0, Math.PI / 2 - wa, 0));
      shell.add(box(3.5, 0.08, R * 0.17), m.poolWater, kit.at(Math.cos(wa) * R * 0.38, fallTop + 0.2, Math.sin(wa) * R * 0.38, 0, Math.PI / 2 - wa, 0));
      const w = kit.world(Math.cos(wa) * (fallR + 0.5), Math.sin(wa) * (fallR + 0.5));
      ctx.jets.push({ x: w.x, y: H0 + deck + 0.2, z: w.z, vx: 0, vy: 1.6, vz: 0, spread: 0.9, count: 26, size: 0.2 });
    }
  }
  if (grand) ctx.waterSounds.push({ x: lot.x, z: lot.z, radius: 46, gain: 0.9 });

  // Filetes de luz nas arestas do primeiro segmento.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    detail.add(
      tube([new THREE.Vector3(Math.cos(a) * R * 0.365, baseTop, Math.sin(a) * R * 0.365), new THREE.Vector3(Math.cos(a) * R * 0.275, baseTop + h1, Math.sin(a) * R * 0.275)], 0.08 * k, 4, 6),
      m.aquaGlow,
      kit.at(),
    );
  }

  // Anéis flutuantes giratórios e farol no topo.
  const ringCount = grand ? 3 : 1;
  const ringMaterials = [m.white, m.aquaGlow, m.greenGlow];
  const pivot = new THREE.Group();
  const origin = kit.world(0, 0);
  pivot.position.set(origin.x, H0, origin.z);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < ringCount; i++) {
    const geometry = new THREE.TorusGeometry(R * (0.62 - i * 0.12), 0.16 * k, 8, 72);
    const ring = new THREE.Mesh(geometry, ringMaterials[i % ringMaterials.length]);
    ring.position.y = baseTop + h1 * (0.55 + i * 0.3);
    ring.castShadow = true;
    pivot.add(ring);
    rings.push(ring);
    ctx.disposables.push(geometry);
  }
  const beaconGeometry = new THREE.SphereGeometry(0.85 * k, 20, 14);
  const beacon = new THREE.Mesh(beaconGeometry, m.orb);
  beacon.position.y = H + 0.4 * k;
  const beaconHalo = new THREE.Mesh(beaconGeometry, m.orbHalo);
  beaconHalo.position.copy(beacon.position);
  beaconHalo.scale.setScalar(2.2);
  pivot.add(beacon, beaconHalo);
  ctx.disposables.push(beaconGeometry);
  ctx.root.add(pivot);
  const phase = lot.seed;
  ctx.animate(({ elapsed }) => {
    rings.forEach((ring, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      ring.rotation.set(Math.PI / 2 + Math.sin(elapsed * 0.17 + phase + i) * 0.34, 0, elapsed * 0.22 * dir + i);
    });
    beaconHalo.scale.setScalar(2.1 + Math.sin(elapsed * 1.3 + phase) * 0.25);
  });

  kit.collideCylinder(0, 0, R * 0.4, H);

  // Vasos de cristal e arbustos na plataforma.
  for (let i = 0; i < fins; i++) {
    const a = (i / fins) * TAU + Math.PI / 6 + Math.PI / fins;
    if (grand && i % 2 === 0) continue;
    const r = R * 0.8;
    detail.add(crystalShard(0.3 * Math.min(k, 1.6), 1.7 * Math.min(k, 1.6)), i % 2 === 0 ? m.crystal : m.crystalRose, kit.at(Math.cos(a) * r, deck, Math.sin(a) * r));
    const p = kit.world(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lightSpots.push({ x: p.x, y: H0 + deck + 0.05, z: p.z, radius: 5, color: 0x7feaff });
  }
}

/* ------------------------------------------------------------------ */
/* Edifício em terraços com jardins suspensos                           */
/* ------------------------------------------------------------------ */

function buildTerraces(kit: BuildingKit): void {
  const { ctx, lot, shell, detail } = kit;
  const m = ctx.materials;
  const R = lot.radius;
  const H = lot.height;
  const floors = Math.max(3, Math.round(H / 4.4));
  const floorH = H / floors;
  const facade = lot.seed % 2 === 0 ? m.facade : m.facadeEmerald;
  const front = Math.PI / 2;

  shell.add(disc(R + 1.0, 0, 0.3, 48), m.stone, kit.at());
  kit.collideCylinder(0, 0, R + 1.0, 0.3, true, 'terracos-degrau');

  let topR = R;
  let topOff = 0;
  for (let i = 0; i < floors; i++) {
    const t = floors > 1 ? i / (floors - 1) : 0;
    const r = R * (1 - 0.46 * Math.pow(t, 1.2));
    const off = -(R - r) * 0.55;
    const y = 0.3 + i * floorH;
    topR = r;
    topOff = off;

    shell.add(facadeCylinder(r - 0.75, floorH - 0.45, 36), facade, kit.at(0, y, off));
    shell.add(disc(r + 0.5, y + floorH - 0.45, y + floorH, 44), m.white, kit.at(0, 0, off));
    shell.add(torus(r + 0.52, 0.055, 6, 44), m.aquaGlow, kit.at(0, y + floorH - 0.22, off));

    // Jardineiras e trepadeiras na borda frontal de cada laje.
    const edge = r + 0.05;
    const count = Math.max(5, Math.round(edge * 1.5));
    for (let j = 0; j < count; j++) {
      const a = front - 1.35 + (j / (count - 1)) * 2.7;
      const lx = Math.cos(a) * edge;
      const lz = off + Math.sin(a) * edge;
      kit.foliage(lx, y + floorH + 0.28, lz, randRange(kit.rng, 0.5, 0.82), 0.75, i > 0);
      if (j % 2 === 1) kit.vine(Math.cos(a) * (edge + 0.42), y + floorH - 0.1, off + Math.sin(a) * (edge + 0.42), randRange(kit.rng, 1.2, 2.8));
    }
    // Guarda-corpo de vidro.
    detail.add(annulus(r + 0.36, r + 0.41, y + floorH, y + floorH + 1.0, { angleStart: front - 1.5, angleLength: 3.0, segments: 24 }), m.glass, kit.at(0, 0, off));

    // Árvores nos terraços mais largos.
    if (i < floors - 1 && i % 2 === 0) {
      const a = front + (kit.rng() - 0.5) * 1.4;
      kit.tree(kit.rng() < 0.5 ? 'palmeira' : 'frondosa', Math.cos(a) * (r - 1.3), y + floorH, off + Math.sin(a) * (r - 1.3), 0.5, kit.rng() < 0.4 ? pick(kit.rng, BLOSSOM_COLORS) : undefined);
    }
  }

  // Cobertura-jardim com cúpula de vidro.
  const roofY = 0.3 + floors * floorH;
  shell.add(dome(topR * 0.5, 24, 8, 0.8), m.glass, kit.at(0, roofY, topOff - topR * 0.2));
  shell.add(torus(topR * 0.5, 0.1, 6, 32), m.white, kit.at(0, roofY + 0.05, topOff - topR * 0.2));
  kit.tree('frondosa', topR * 0.45, roofY, topOff + topR * 0.35, 0.55, pick(kit.rng, BLOSSOM_COLORS));
  kit.tree('palmeira', -topR * 0.5, roofY, topOff + topR * 0.3, 0.5);

  // Entrada.
  shell.add(box(3.4, 3.7, 0.8), m.white, kit.at(0, 0.3, R - 0.75));
  shell.add(box(2.6, 3.0, 0.86), m.glass, kit.at(0, 0.3, R - 0.75));

  kit.collideCylinder(0, 0, R + 0.5, H);
}

/* ------------------------------------------------------------------ */
/* Cúpula de vidro                                                      */
/* ------------------------------------------------------------------ */

function buildDome(kit: BuildingKit): void {
  const { ctx, lot, shell, detail } = kit;
  const m = ctx.materials;
  const R = lot.radius;
  const H = lot.height;
  const wall = 1.1;
  const domeR = R - 0.25;
  const squash = (H - wall) / domeR;

  shell.add(annulus(R - 0.55, R, 0, wall, { segments: 56 }), m.white, kit.at());
  shell.add(torus(R + 0.02, 0.06, 6, 56), m.aquaGlow, kit.at(0, wall * 0.5, 0));
  const isGarden = lot.id === 'estufa-celeste';
  shell.add(disc(R - 0.5, 0, 0.12, 48), isGarden ? m.soil : m.glassFloor, kit.at());
  shell.add(dome(domeR, 40, 14, squash), m.glass, kit.at(0, wall, 0));

  // Nervuras: meridianos e paralelos.
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.TorusGeometry(domeR, 0.1, 6, 36, Math.PI);
    shell.add(rib, m.white, kit.at(0, wall, 0, 0, (i / 4) * Math.PI, 0, 1, squash, 1));
  }
  for (const t of [0.42, 0.74]) {
    const angle = Math.asin(t);
    detail.add(torus(domeR * Math.cos(angle), 0.07, 6, 48), m.white, kit.at(0, wall + domeR * t * squash, 0));
  }
  shell.add(sphere(0.42, 12, 8), m.aquaGlow, kit.at(0, H + 0.2, 0));
  shell.add(cyl(0.5, 0.9, 0.5, 14), m.white, kit.at(0, H - 0.25, 0));

  // Portal de entrada.
  const arch = new THREE.TorusGeometry(2.0, 0.24, 8, 24, Math.PI);
  shell.add(arch, m.white, kit.at(0, 2.2, R - 0.1));
  for (const side of [-1, 1]) shell.add(box(0.48, 2.2, 0.48), m.white, kit.at(side * 2.0, 0, R - 0.1));
  shell.add(box(3.6, 2.3, 0.2), m.glass, kit.at(0, 0, R - 0.1));
  detail.add(torus(2.0, 0.06, 6, 24, Math.PI), m.aquaGlow, kit.at(0, 2.2, R + 0.18, Math.PI / 2, 0, 0));

  // Interior visível através do vidro.
  if (isGarden) {
    kit.tree('frondosa', 0, 0.12, 0, 0.82, BLOSSOM_COLORS[0]);
    kit.tree('palmeira', -R * 0.42, 0.12, R * 0.2, 0.62);
    kit.tree('palmeira', R * 0.4, 0.12, -R * 0.25, 0.56);
    kit.tree('bananeira', R * 0.3, 0.12, R * 0.42, 1.1);
    kit.tree('bananeira', -R * 0.25, 0.12, -R * 0.48, 1.2);
    kit.tree('bananeira', -R * 0.55, 0.12, -R * 0.1, 1.0);
    const p = kit.world(0, 0);
    ctx.vegetation.addFlowerPatch({ x: p.x, z: p.z, y: H0 + 0.12, radius: R - 2, density: 1.6, palette: [0xff7fb0, 0xffd84a, 0xffffff, 0xb58cff], luminous: false });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      kit.foliage(Math.cos(a) * (R - 1.8), 0.5, Math.sin(a) * (R - 1.8), randRange(kit.rng, 0.6, 1.0), 0.8, true);
    }
  } else if (lot.id === 'observatorio') {
    // Telescópio principal.
    shell.add(cyl(1.5, 1.9, 1.2, 20), m.white, kit.at());
    const barrel = R * 0.95;
    shell.add(cyl(0.95, 1.15, barrel, 20), m.white, kit.at(0, 1.4, -0.6, -0.72, 0.5, 0));
    // Anel luminoso na boca do telescópio (mesma orientação do tubo).
    const reach = Math.sin(0.72) * barrel * 0.98;
    shell.add(torus(1.0, 0.12, 6, 24), m.aquaGlow, kit.at(-Math.sin(0.5) * reach, 1.4 + Math.cos(0.72) * barrel * 0.98, -0.6 - Math.cos(0.5) * reach, -0.72, 0.5, 0));
    shell.add(sphere(1.25, 16, 12), m.metal, kit.at(0, 1.5, -0.4));
  } else if (lot.id === 'atelie-aero') {
    // Passarela circular com espelhos e manequins de luz.
    shell.add(disc(R * 0.45, 0.12, 0.42, 36), m.white, kit.at());
    shell.add(torus(R * 0.45, 0.06, 6, 40), m.aquaGlow, kit.at(0, 0.44, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      const r = R * 0.68;
      detail.add(box(1.5, 2.6, 0.08), m.glass, kit.at(Math.cos(a) * r, 0.12, Math.sin(a) * r, 0, Math.PI / 2 - a, 0));
      detail.add(box(1.7, 0.08, 0.14), m.aquaGlow, kit.at(Math.cos(a) * r, 2.72, Math.sin(a) * r, 0, Math.PI / 2 - a, 0));
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 1.1;
      const r = R * 0.22;
      detail.add(cyl(0.16, 0.3, 1.25, 10), i === 1 ? m.greenGlow : m.aquaGlow, kit.at(Math.cos(a) * r, 0.42, Math.sin(a) * r));
      detail.add(sphere(0.2, 10, 8), m.white, kit.at(Math.cos(a) * r, 1.9, Math.sin(a) * r));
    }
  } else {
    // Galeria: esculturas de cristal e luz.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.5;
      const r = i === 0 ? 0 : R * 0.5;
      shell.add(cyl(0.7, 0.85, 0.5, 12), m.white, kit.at(Math.cos(a) * r, 0.12, Math.sin(a) * r));
      shell.add(crystalShard(i === 0 ? 0.6 : 0.34, i === 0 ? 4.6 : 2.4), i % 2 === 0 ? m.crystal : m.crystalRose, kit.at(Math.cos(a) * r, 0.6, Math.sin(a) * r, 0, a, i === 0 ? 0 : 0.14));
    }
    shell.add(torus(R * 0.5, 0.05, 6, 48), m.aquaGlow, kit.at(0, 0.16, 0));
  }

  kit.collideCylinder(0, 0, R, H);
}

/* ------------------------------------------------------------------ */
/* Arco monumental (Biblioteca de Cristal)                              */
/* ------------------------------------------------------------------ */

function buildArch(kit: BuildingKit): void {
  const { ctx, lot, shell, detail } = kit;
  const m = ctx.materials;
  const R = lot.radius;
  const H = lot.height;
  const tubeR = R * 0.25;
  const a = R * 0.72;
  const b = H - tubeR;

  shell.add(disc(R + 1.5, 0, 0.3, 48), m.stone, kit.at());
  kit.collideCylinder(0, 0, R + 1.5, 0.3, true, 'arco-degrau');

  const points: THREE.Vector3[] = [];
  const samples = 18;
  for (let i = 0; i <= samples; i++) {
    const theta = (i / samples) * Math.PI;
    points.push(new THREE.Vector3(Math.cos(theta) * a, Math.max(0, Math.sin(theta) * b), 0));
  }
  const arch = tube(points, tubeR, 48, 16);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
  scaleUV(arch, Math.round(length / PANEL_H), Math.round((TAU * tubeR) / PANEL_W));
  shell.add(arch, m.facade, kit.at(0, 0.3, 0));

  // Anéis brancos ao longo do arco.
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= 6; i++) {
    const theta = (i / 6) * Math.PI;
    const tangent = new THREE.Vector3(-Math.sin(theta) * a, Math.cos(theta) * b, 0).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(zAxis, tangent);
    const ring = new THREE.TorusGeometry(tubeR + 0.12, 0.24, 8, 28);
    ring.applyQuaternion(q);
    shell.add(ring, m.white, kit.at(Math.cos(theta) * a, 0.3 + Math.max(0, Math.sin(theta) * b), 0));
    if (i > 0 && i < 6) {
      const glowRing = new THREE.TorusGeometry(tubeR + 0.14, 0.07, 6, 28);
      glowRing.applyQuaternion(q);
      detail.add(glowRing, m.aquaGlow, kit.at(Math.cos(theta + 0.045) * a, 0.3 + Math.sin(theta + 0.045) * b, 0));
    }
  }
  for (const side of [-1, 1]) {
    shell.add(cyl(tubeR + 0.5, tubeR + 0.9, 1.0, 24), m.white, kit.at(side * a, 0.3, 0));
    kit.collideCylinder(side * a, 0, tubeR + 0.6, H * 0.5);
  }

  // Átrio esférico sob o arco.
  const atriumR = R * 0.4;
  shell.add(sphere(atriumR, 32, 20), m.facadeEmerald, kit.at(0, atriumR * 0.55, 0));
  shell.add(torus(atriumR + 0.05, 0.16, 6, 44), m.white, kit.at(0, atriumR * 0.55, 0));
  shell.add(annulus(atriumR * 0.8, atriumR + 0.7, 0.3, 0.75, { segments: 40 }), m.white, kit.at());
  shell.add(box(3.2, 3.2, 0.7), m.white, kit.at(0, 0.3, atriumR * 0.86));
  shell.add(box(2.4, 2.6, 0.76), m.glass, kit.at(0, 0.3, atriumR * 0.86));
  kit.collideCylinder(0, 0, atriumR + 0.3, atriumR * 1.5);

  // Espelhos d'água laterais.
  for (const side of [-1, 1]) {
    const px = side * R * 0.5;
    const pz = R * 0.82;
    shell.add(annulus(2.0, 2.35, 0.3, 0.64, { segments: 28 }), m.white, kit.at(px, 0, pz));
    shell.add(disc(2.02, 0.3, 0.34, 24), m.glassFloor, kit.at(px, 0, pz));
    shell.add(disc(2.0, 0.5, 0.52, 24), m.poolWater, kit.at(px, 0, pz));
    detail.add(crystalShard(0.2, 1.2), m.crystal, kit.at(px, 0.3, pz));
    const p = kit.world(px, pz);
    ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 2.35, innerRadius: 2.0, yMin: H0 - 1, yMax: H0 + 0.64, blocksCamera: false, tag: 'arco-espelho' });
    ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 2.0, yMin: H0 - 1, yMax: H0 + 0.34, surface: 'water', blocksCamera: false, tag: 'arco-espelho' });
    ctx.jets.push({ x: p.x, y: H0 + 1.5, z: p.z, vx: 0, vy: 3.0, vz: 0, spread: 0.3, count: 16, size: 0.12 });
    ctx.waterSounds.push({ x: p.x, z: p.z, radius: 14, gain: 0.45 });
  }
}

/* ------------------------------------------------------------------ */
/* Pavilhão de cobertura curva                                          */
/* ------------------------------------------------------------------ */

function buildPavilion(kit: BuildingKit): void {
  const { ctx, lot, shell, detail } = kit;
  const m = ctx.materials;
  const R = lot.radius;
  const H = lot.height;

  shell.add(disc(R, 0, 0.2, 48), m.stone, kit.at());
  kit.collideCylinder(0, 0, R, 0.2, true, 'pavilhao-piso');

  // Cobertura em concha.
  shell.add(
    lathe(
      [
        [R * 1.12, H - 2.7],
        [R * 0.8, H - 1.5],
        [R * 0.42, H - 0.72],
        [0.05, H - 0.45],
        [0.05, H - 0.9],
        [R * 0.42, H - 1.15],
        [R * 0.8, H - 1.95],
        [R * 1.1, H - 2.84],
        [R * 1.12, H - 2.7],
      ],
      48,
    ),
    m.white,
    kit.at(),
  );
  shell.add(torus(R * 1.1, 0.07, 6, 56), m.aquaGlow, kit.at(0, H - 2.86, 0));
  shell.add(sphere(0.4, 12, 8), m.aquaGlow, kit.at(0, H - 0.3, 0));

  // Colunas esbeltas.
  const columns = 6;
  for (let i = 0; i < columns; i++) {
    const a = (i / columns) * TAU + Math.PI / columns;
    const r = R * 0.8;
    shell.add(cyl(0.14, 0.2, H - 2.15, 10), m.white, kit.at(Math.cos(a) * r, 0.2, Math.sin(a) * r));
    const p = kit.world(Math.cos(a) * r, Math.sin(a) * r);
    ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 0.24, yMin: H0 - 1, yMax: H0 + H - 2, walkable: false, blocksCamera: false, tag: 'pavilhao-coluna' });
  }

  // Salão envidraçado central.
  const roomR = R * 0.44;
  shell.add(facadeCylinder(roomR, 3.4, 28), lot.seed % 2 === 0 ? m.facadeEmerald : m.facade, kit.at(0, 0.2, 0));
  shell.add(disc(roomR + 0.35, 3.6, 3.85, 32), m.white, kit.at());
  shell.add(torus(roomR + 0.36, 0.05, 6, 36), m.aquaGlow, kit.at(0, 3.72, 0));
  shell.add(box(2.4, 2.9, 0.5), m.white, kit.at(0, 0.2, roomR));
  shell.add(box(1.8, 2.5, 0.56), m.glass, kit.at(0, 0.2, roomR));
  kit.collideCylinder(0, 0, roomR + 0.1, 3.85);

  // Mesas e banquetas ao ar livre.
  const tables = 5;
  for (let i = 0; i < tables; i++) {
    const a = Math.PI / 2 + (i - (tables - 1) / 2) * 0.62;
    const r = R * 0.68;
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    detail.add(
      lathe(
        [
          [0.34, 0],
          [0.07, 0.08],
          [0.07, 0.7],
          [0.52, 0.74],
          [0.52, 0.79],
          [0.05, 0.79],
        ],
        16,
      ),
      m.white,
      kit.at(lx, 0.2, lz),
    );
    for (const side of [-1, 1]) {
      const sa = a + side * 0.14;
      detail.add(cyl(0.2, 0.16, 0.46, 12), i % 2 === 0 ? m.aquaGlow : m.wood, kit.at(Math.cos(sa) * r, 0.2, Math.sin(sa) * r));
    }
    const p = kit.world(lx, lz);
    ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 0.5, yMin: H0 - 1, yMax: H0 + 0.99, walkable: false, blocksCamera: false, tag: 'pavilhao-mesa' });
  }

  // Jardineiras na borda.
  for (let i = 0; i < columns; i++) {
    const a = (i / columns) * TAU;
    if (Math.abs(Math.sin(a) - 1) < 0.2) continue; // mantém a entrada livre
    const r = R * 0.93;
    detail.add(cyl(0.62, 0.5, 0.5, 14), m.white, kit.at(Math.cos(a) * r, 0.2, Math.sin(a) * r));
    kit.foliage(Math.cos(a) * r, 0.95, Math.sin(a) * r, 0.62, 0.85, true);
    const p = kit.world(Math.cos(a) * r, Math.sin(a) * r);
    ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 0.62, yMin: H0 - 1, yMax: H0 + 0.7, blocksCamera: false, tag: 'pavilhao-vaso' });
  }
}

/* ------------------------------------------------------------------ */

const EXTRA_INFO: Record<string, string> = {
  'torre-aurora': 'Com 128 metros, é o ponto mais alto da cidade. Seus anéis de luz giram dia e noite e podem ser vistos de toda a ilha.',
  'biblioteca-cristal': 'Quando o Éden Connect estiver ativo, os livros do EdenReads poderão ser lidos aqui e no seu EdenPhone.',
  'atelie-aero': 'Use a estação de estilo na entrada para mudar o visual do seu avatar a qualquer momento.',
  'centro-edenconnect': 'Os serviços on-line do Éden (EdenGram, EdenTalk, EdenFeed e outros) ainda estão em desenvolvimento.',
  'mercado-eden': 'A EdenStore abrirá aqui em uma versão futura do EDENWORLD.',
  'casa-edenpawl': 'Os EdenPawl — companheiros do Éden — chegarão em uma versão futura.',
  'estufa-celeste': 'Sob a cúpula crescem espécies tropicais de todo o Éden.',
  observatorio: 'À noite, procure a aurora e o planeta anelado no céu de Aurora City.',
};

/** Estação de estilo do Ateliê Aero: um espelho holográfico onde o jogador recria o avatar. */
function buildStyleStation(kit: BuildingKit, forecourt: number): void {
  const { ctx } = kit;
  const m = ctx.materials;
  const lx = -3.6;
  const lz = forecourt - 1.8;
  kit.detail.add(cyl(0.95, 1.1, 0.16, 28), m.white, kit.at(lx, 0, lz));
  kit.detail.add(cyl(0.82, 0.82, 0.05, 28), m.aquaGlow, kit.at(lx, 0.16, lz));
  kit.detail.add(cyl(0.07, 0.09, 0.5, 10), m.metal, kit.at(lx - 0.62, 0.16, lz - 0.5));
  kit.detail.add(cyl(0.07, 0.09, 0.5, 10), m.metal, kit.at(lx + 0.62, 0.16, lz - 0.5));
  // Espelho oval atrás da plataforma, voltado para quem chega.
  const frame = new THREE.TorusGeometry(0.86, 0.06, 10, 40);
  frame.scale(1, 1.32, 1);
  kit.detail.add(frame, m.aquaGlow, kit.at(lx, 1.72, lz - 0.52));
  const mirror = new THREE.CircleGeometry(0.84, 36);
  mirror.scale(1, 1.32, 1);
  kit.detail.add(mirror, m.glass, kit.at(lx, 1.72, lz - 0.53));
  kit.detail.add(new THREE.SphereGeometry(0.11, 12, 8), m.lampGlow, kit.at(lx, 3.02, lz - 0.52));
  const p = kit.world(lx, lz);
  const back = kit.world(lx, lz - 0.55);
  ctx.physics.addCylinder({ x: back.x, z: back.z, radius: 0.3, yMin: H0 - 1, yMax: H0 + 2.9, walkable: false, blocksCamera: false, tag: 'estacao-estilo' });
  ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 1.0, yMin: H0 - 0.5, yMax: H0 + 0.21, surface: 'glass', blocksCamera: false, tag: 'estacao-estilo-base' });
  ctx.reserve(p.x, p.z, 1.6);
  ctx.lightSpots.push({ x: p.x, y: H0 + 0.3, z: p.z, radius: 4, color: 0x7ff0ff });
  ctx.addInteractable({
    id: 'estacao-estilo',
    name: 'Estação de Estilo',
    action: 'Mudar visual',
    x: p.x,
    y: H0 + 1.1,
    z: p.z,
    range: 2.4,
    // O jogador sobe na plataforma, de costas para o espelho, e a câmera o vê de frente.
    payload: { type: 'atelie', stand: { x: p.x, z: p.z, heading: Math.atan2(p.x - back.x, p.z - back.z) } },
  });
}

/** Constrói todos os edifícios de Aurora City a partir dos lotes do layout. */
export function buildBuildings(ctx: CityContext, props: Props, lots: readonly BuildingLot[]): void {
  for (const lot of lots) {
    const kit = new BuildingKit(ctx, lot);
    switch (lot.kind) {
      case 'tower':
        buildTower(kit);
        break;
      case 'spire':
        buildSpire(kit);
        break;
      case 'terraces':
        buildTerraces(kit);
        break;
      case 'dome':
        buildDome(kit);
        break;
      case 'arch':
        buildArch(kit);
        break;
      case 'pavilion':
        buildPavilion(kit);
        break;
    }

    // Placa de identificação na entrada do pátio.
    const fr = forecourtRadius(lot);
    const sign = kit.world(lot.kind === 'spire' && lot.radius > 20 ? 6 : 3.4, fr - 1.6);
    const position = props.sign(kit.detail, sign.x, sign.z, lot.rotation, lot.name.toUpperCase(), lot.description, H0);
    const paragraphs = [lot.description];
    if (EXTRA_INFO[lot.id]) paragraphs.push(EXTRA_INFO[lot.id]);
    ctx.addInteractable({
      id: `placa-${lot.id}`,
      name: lot.name,
      action: 'Ler',
      x: position.x,
      y: position.y,
      z: position.z,
      payload: { type: 'placa', title: lot.name, paragraphs, entryId: `edificio-${lot.id}` },
    });

    if (lot.id === 'atelie-aero') buildStyleStation(kit, fr);

    // Arbustos ao redor do pátio.
    const bushes = Math.round(fr * 1.3);
    for (let i = 0; i < bushes; i++) {
      const a = (i / bushes) * TAU + kit.rng() * 0.2;
      const bx = lot.x + Math.cos(a) * (fr + 1.3);
      const bz = lot.z + Math.sin(a) * (fr + 1.3);
      if (!ctx.zones.isFree(bx, bz, 0.6)) continue;
      ctx.vegetation.addBush({ x: bx, z: bz, scale: randRange(kit.rng, 0.9, 1.5), color: new THREE.Color(pick(kit.rng, BUSH_GREENS)) });
    }

    kit.finish();
  }
}
