import * as THREE from 'three';
import { type GeometryBatcher, xform } from '../../utils/geometry';
import { TAU, clamp01, createRng, lerp, pick, randRange } from '../../utils/math';
import { BLOSSOM_COLORS, PALM_GREENS } from '../../world/Vegetation';
import { Zone } from '../../world/ZoneMap';
import { lakeEllipse } from './AuroraTerrain';
import { buildWishFountain } from './CentralPlaza';
import type { CityContext } from './CityContext';
import { type Props, headingTo, headingVector } from './Decorations';
import { annulus, blob, box, crystalShard, cyl, disc, doubleSided, lathe, scaleUV, sphere, torus, tube } from './Kit';
import { H0, HANGING_GARDENS, LAKE, LAKE_ISLAND, MIRANTE, PIER, STAGE } from './Layout';

/* ------------------------------------------------------------------ */
/* Peças compartilhadas                                                 */
/* ------------------------------------------------------------------ */

/** Ponte em arco com piso caminhável, corrimãos e filetes de luz. */
function archBridge(ctx: CityContext, batch: GeometryBatcher, ax: number, az: number, bx: number, bz: number, width: number, rise: number, tag: string): void {
  const m = ctx.materials;
  const length = Math.hypot(bx - ax, bz - az);
  const heading = Math.atan2(bx - ax, bz - az);
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const yA = ctx.ground(ax, az) + 0.04;
  const yB = ctx.ground(bx, bz) + 0.04;
  const deckY = (lz: number): number => {
    const t = clamp01(lz / length + 0.5);
    return lerp(yA, yB, t) + rise * Math.sin(Math.PI * t);
  };
  const at = xform(mx, 0, mz, 0, heading, 0);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const toWorld = (lx: number, lz: number): { x: number; z: number } => ({ x: mx + lx * cos + lz * sin, z: mz - lx * sin + lz * cos });

  const segments = Math.max(8, Math.round(length / 1.4));
  const deck = new THREE.BoxGeometry(width, 0.34, length, 1, 1, segments);
  const position = deck.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) - 0.17 + deckY(position.getZ(i)));
  deck.computeVertexNormals();
  batch.add(deck, m.white, at.clone());

  for (const side of [-1, 1]) {
    const lx = side * (width / 2 - 0.12);
    const rail: THREE.Vector3[] = [];
    const glow: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const lz = -length / 2 + (i / segments) * length;
      rail.push(new THREE.Vector3(lx, deckY(lz) + 1.0, lz));
      glow.push(new THREE.Vector3(side * (width / 2 + 0.02), deckY(lz) - 0.05, lz));
    }
    batch.add(tube(rail, 0.055, segments * 2, 6), m.white, at.clone());
    batch.add(tube(glow, 0.04, segments * 2, 5), m.aquaGlow, at.clone());
    const posts = Math.max(4, Math.round(length / 2.4));
    for (let i = 0; i <= posts; i++) {
      const lz = -length / 2 + (i / posts) * length;
      batch.add(cyl(0.04, 0.04, 1.0, 6), m.white, at.clone().multiply(xform(lx, deckY(lz), lz)));
    }
    // Colisão dos corrimãos em trechos (nadadores passam sob o vão central).
    const pieces = 6;
    for (let k = 0; k < pieces; k++) {
      const lz0 = -length / 2 + (k / pieces) * length;
      const lz1 = -length / 2 + ((k + 1) / pieces) * length;
      const p = toWorld(side * (width / 2), (lz0 + lz1) / 2);
      ctx.physics.addBox({
        x: p.x,
        z: p.z,
        halfX: 0.1,
        halfZ: (lz1 - lz0) / 2,
        rotation: heading,
        yMin: Math.min(deckY(lz0), deckY(lz1)) - 0.36,
        yMax: Math.max(deckY(lz0), deckY(lz1), deckY((lz0 + lz1) / 2)) + 1.0,
        walkable: false,
        blocksCamera: false,
        tag: `${tag}-corrimao`,
      });
    }
  }

  // Pilares até o leito.
  for (const t of [0.28, 0.72]) {
    const lz = -length / 2 + t * length;
    const p = toWorld(0, lz);
    const bed = ctx.ground(p.x, p.z);
    const top = deckY(lz) - 0.3;
    if (top - bed > 0.6) {
      batch.add(cyl(0.3, 0.42, top - bed + 0.4, 12), m.stone, xform(p.x, bed - 0.4, p.z));
      ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 0.36, yMin: bed - 1, yMax: top, walkable: false, blocksCamera: false, tag: `${tag}-pilar` });
    }
  }

  ctx.physics.addBox({
    x: mx,
    z: mz,
    halfX: width / 2,
    halfZ: length / 2,
    rotation: heading,
    yMin: Math.min(yA, yB) - 0.6,
    yMax: Math.max(yA, yB) + rise + 0.05,
    topAt: (_lx, lz) => deckY(lz),
    surface: 'stone',
    tag,
  });
  ctx.zones.stampSegment(ax, az, bx, bz, width / 2 + 0.8, Zone.Reserved);
}

/** Fita que acompanha o terreno (canais de água e cascatas). uv.y = 1 no início, 0 no fim. */
function groundRibbon(ctx: CityContext, ax: number, az: number, bx: number, bz: number, width: number, lift: number): THREE.BufferGeometry {
  const length = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(length / 0.7));
  const nx = -(bz - az) / length;
  const nz = (bx - ax) / length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(ax, bx, t);
    const z = lerp(az, bz, t);
    const y = ctx.ground(x, z) + lift;
    positions.push(x - (nx * width) / 2, y, z - (nz * width) / 2, x + (nx * width) / 2, y, z + (nz * width) / 2);
    uvs.push(0, 1 - t, width, 1 - t);
    if (i < steps) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Garante normais para cima, qualquer que seja o sentido da fita.
  const normal = geometry.getAttribute('normal');
  if (normal.getY(0) < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const b = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = b;
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** Telescópio panorâmico. */
function telescope(ctx: CityContext, batch: GeometryBatcher, id: string, name: string, x: number, y: number, z: number, heading: number, pitch: number): void {
  const m = ctx.materials;
  batch.add(cyl(0.3, 0.4, 0.14, 14), m.white, xform(x, y, z));
  batch.add(cyl(0.07, 0.09, 1.25, 10), m.white, xform(x, y + 0.14, z));
  batch.add(sphere(0.16, 12, 8), m.metal, xform(x, y + 1.45, z));
  const barrel = cyl(0.11, 0.15, 0.95, 12);
  barrel.translate(0, -0.4, 0);
  // O cilindro nasce apontando para +Y; gira para a direção do olhar.
  batch.add(barrel, m.white, xform(x, y + 1.5, z, Math.PI / 2 - pitch, heading, 0));
  const f = headingVector(heading);
  batch.add(torus(0.15, 0.03, 6, 16), m.aquaGlow, xform(x + f.x * 0.55, y + 1.5 + Math.sin(pitch) * 0.55, z + f.z * 0.55, Math.PI / 2 - pitch, heading, 0));
  ctx.physics.addCylinder({ x, z, radius: 0.34, yMin: y - 0.5, yMax: y + 1.6, walkable: false, blocksCamera: false, tag: 'telescopio' });
  ctx.addInteractable({
    id,
    name,
    action: 'Observar',
    x,
    y: y + 1.2,
    z,
    range: 2.4,
    payload: { type: 'telescopio', view: { eye: { x, y: y + 1.7, z }, yaw: heading, pitch } },
  });
}

/* ------------------------------------------------------------------ */
/* Parque das Águas                                                     */
/* ------------------------------------------------------------------ */

function buildWaterPark(ctx: CityContext, props: Props): void {
  const m = ctx.materials;
  const batch = ctx.batch();
  const detail = ctx.batch();
  const rng = createRng(4711);
  const cx = LAKE_ISLAND.x;
  const cz = LAKE_ISLAND.z;
  const lakeCos = Math.cos(LAKE.rotation);
  const lakeSin = Math.sin(LAKE.rotation);
  const lakePoint = (lx: number, lz: number): { x: number; z: number } => ({ x: LAKE.x + lx * lakeCos + lz * lakeSin, z: LAKE.z - lx * lakeSin + lz * lakeCos });

  /* ----- Gazebo na ilha ----- */
  const islandTop = ctx.ground(cx, cz);
  const floorY = islandTop + 0.2;
  // Direção da ponte: eixo curto do lago, rumo à margem norte.
  const bridgeDir = { x: -lakeSin, z: -lakeCos };
  const bridgeAngle = Math.atan2(bridgeDir.z, bridgeDir.x);
  batch.add(disc(5.2, islandTop - 1.4, floorY, 40), m.stone, xform(cx, 0, cz));
  batch.add(torus(5.2, 0.06, 6, 48), m.aquaGlow, xform(cx, floorY - 0.06, cz));
  batch.add(disc(1.5, floorY, floorY + 0.02, 24), m.glassFloor, xform(cx, 0, cz));
  ctx.physics.addCylinder({ x: cx, z: cz, radius: 5.2, yMin: islandTop - 2, yMax: floorY, solid: false, surface: 'stone', tag: 'gazebo-piso' });
  for (let k = 0; k < 8; k++) {
    const a = bridgeAngle + ((k + 0.5) / 8) * TAU;
    const x = cx + Math.cos(a) * 4.5;
    const z = cz + Math.sin(a) * 4.5;
    batch.add(cyl(0.15, 0.2, 3.4, 10), m.white, xform(x, floorY, z));
    batch.add(sphere(0.13, 8, 6), m.aquaGlow, xform(x, floorY + 2.9, z));
    ctx.physics.addCylinder({ x, z, radius: 0.24, yMin: floorY - 1, yMax: floorY + 3.4, walkable: false, blocksCamera: false, tag: 'gazebo-coluna' });
  }
  batch.add(annulus(4.2, 4.85, floorY + 3.4, floorY + 3.7, { bottom: true, segments: 40 }), m.white, xform(cx, 0, cz));
  const roof = lathe(
    [
      [5.7, 3.45],
      [4.7, 4.05],
      [3.1, 4.75],
      [1.4, 5.25],
      [0.05, 5.5],
    ],
    40,
  );
  for (const shell of doubleSided(roof)) batch.add(shell, m.white, xform(cx, floorY, cz));
  batch.add(sphere(0.3, 12, 8), m.aquaGlow, xform(cx, floorY + 5.65, cz));
  props.orb(cx, floorY + 2.9, cz, 1.5);
  for (const offset of [Math.PI, Math.PI * 0.55, Math.PI * 1.45]) {
    const a = bridgeAngle + offset;
    const x = cx + Math.cos(a) * 3.3;
    const z = cz + Math.sin(a) * 3.3;
    props.bench(x, z, headingTo(x, z, cx, cz), floorY);
  }
  ctx.lightSpots.push({ x: cx, y: floorY + 0.05, z: cz, radius: 7, color: 0x9fefff });
  ctx.reserve(cx, cz, 8);

  /* ----- Ponte da ilha ----- */
  const bridgeStart = { x: cx + bridgeDir.x * 5.6, z: cz + bridgeDir.z * 5.6 };
  const bridgeEnd = { x: cx + bridgeDir.x * 36, z: cz + bridgeDir.z * 36 };
  archBridge(ctx, batch, bridgeStart.x, bridgeStart.z, bridgeEnd.x, bridgeEnd.z, 3, 2.1, 'ponte-ilha');
  {
    const sx = bridgeEnd.x + bridgeDir.x * 2.2 - bridgeDir.z * 3;
    const sz = bridgeEnd.z + bridgeDir.z * 2.2 + bridgeDir.x * 3;
    const position = props.sign(detail, sx, sz, headingTo(sx, sz, sx + bridgeDir.x, sz + bridgeDir.z), 'LAGO ESPELHO', 'Parque das Águas · Ilha do Gazebo');
    ctx.addInteractable({
      id: 'placa-lago',
      name: 'Lago Espelho',
      action: 'Ler',
      x: position.x,
      y: position.y,
      z: position.z,
      payload: {
        type: 'placa',
        title: 'Lago Espelho',
        paragraphs: [
          'As águas do Lago Espelho refletem o céu de Aurora City. Atravesse a ponte até a Ilha do Gazebo ou siga a trilha ao redor do lago.',
          'O rio que nasce aqui corre para o sul até encontrar o mar. Você pode nadar em qualquer ponto — a água do Éden é sempre calma.',
        ],
        entryId: 'lago-espelho',
      },
    });
  }

  /* ----- Ponte sobre o rio (trilha do lago) ----- */
  archBridge(ctx, batch, -145.0, 67.3, -166.0, 73.9, 3.2, 1.7, 'ponte-rio');

  /* ----- Bancos e postes ao redor do lago ----- */
  for (let k = 0; k < 20; k++) {
    const a = ((k + 0.5) / 20) * TAU;
    const isBench = k % 2 === 0;
    const scale = isBench ? 1.345 : 1.5;
    const p = lakePoint(Math.cos(a) * LAKE.radiusX * scale, Math.sin(a) * LAKE.radiusZ * scale);
    if (ctx.ground(p.x, p.z) < 1.2 || !ctx.zones.isFree(p.x, p.z, 1.2, Zone.Water | Zone.Reserved | Zone.Building)) continue;
    if (isBench) props.bench(p.x, p.z, headingTo(p.x, p.z, LAKE.x, LAKE.z));
    else props.lamp(p.x, p.z);
  }

  /* ----- Chafariz do lago ----- */
  {
    const p = lakePoint(-19, 5);
    batch.add(torus(0.7, 0.14, 8, 24), m.white, xform(p.x, 0.06, p.z));
    batch.add(torus(0.7, 0.05, 6, 24), m.aquaGlow, xform(p.x, 0.2, p.z));
    ctx.jets.push({ x: p.x, y: 0.1, z: p.z, vx: 0, vy: 13, vz: 0, spread: 0.05, count: 70, size: 0.26 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      ctx.jets.push({ x: p.x, y: 0.1, z: p.z, vx: Math.cos(a) * 2.6, vy: 6.5, vz: Math.sin(a) * 2.6, spread: 0.06, count: 16, size: 0.16 });
    }
    ctx.waterSounds.push({ x: p.x, z: p.z, radius: 40, gain: 0.8 });
    ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 0.8, yMin: -4, yMax: 0.3, walkable: false, blocksCamera: false, tag: 'chafariz-lago' });
  }

  /* ----- Vitórias-régias ----- */
  for (let i = 0, placed = 0; i < 400 && placed < 46; i++) {
    const p = lakePoint(randRange(rng, -1, 1) * LAKE.radiusX, randRange(rng, -1, 1) * LAKE.radiusZ);
    const e = lakeEllipse(p.x, p.z);
    if (e > 0.9 || e < 0.22) continue;
    if (Math.hypot(p.x - cx, p.z - cz) < 13) continue;
    if (ctx.zones.has(p.x, p.z, Zone.Reserved)) continue;
    const r = randRange(rng, 0.45, 0.95);
    const pad = new THREE.CircleGeometry(r, 14, 0.3, TAU - 0.6);
    pad.rotateX(-Math.PI / 2);
    detail.add(pad, m.foliage, xform(p.x, 0.035, p.z, 0, rng() * TAU, 0));
    if (rng() < 0.4) {
      const flower = new THREE.ConeGeometry(r * 0.3, r * 0.3, 7, 1, true);
      flower.rotateX(Math.PI);
      detail.add(flower, rng() < 0.5 ? m.white : m.lampGlow, xform(p.x + r * 0.2, 0.035 + r * 0.16, p.z));
    }
    placed++;
  }

  ctx.commit(batch, 'ParqueDasAguas');
  const detailGroup = ctx.commit(detail, 'ParqueDasAguas:detalhes', { castShadow: false });
  ctx.addDetailGroup(detailGroup, LAKE.x, LAKE.z, 210);
}

/* ------------------------------------------------------------------ */
/* Jardins Suspensos                                                    */
/* ------------------------------------------------------------------ */

function buildHangingGardens(ctx: CityContext, props: Props): void {
  const m = ctx.materials;
  const batch = ctx.batch();
  const detail = ctx.batch();
  const rng = createRng(1618);
  const cx = HANGING_GARDENS.x;
  const cz = HANGING_GARDENS.z;
  const top = ctx.ground(cx, cz);
  const polar = (angleDeg: number, r: number): { x: number; z: number } => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
  };

  /* ----- Pérgola e fonte no topo ----- */
  buildWishFountain(ctx, batch, cx, cz, top, 5);
  for (let k = 0; k < 12; k++) {
    const p = polar(45 + (k + 0.5) * 30, 9.2);
    batch.add(cyl(0.16, 0.22, 3.7, 10), m.white, xform(p.x, top, p.z));
    ctx.physics.addCylinder({ x: p.x, z: p.z, radius: 0.26, yMin: top - 1, yMax: top + 3.7, walkable: false, blocksCamera: false, tag: 'pergola-coluna' });
    if (k % 2 === 0) {
      const vine = blob(0.42, 1, rng, 0.2);
      detail.add(vine, m.foliage, xform(p.x, top + 3.0, p.z, 0, rng() * TAU, 0, 1, 2.1, 1));
    }
  }
  batch.add(annulus(8.75, 9.65, top + 3.7, top + 4.0, { bottom: true, segments: 56 }), m.white, xform(cx, 0, cz));
  batch.add(torus(9.2, 0.06, 6, 64), m.aquaGlow, xform(cx, top + 3.66, cz));
  for (let k = 0; k < 16; k++) {
    const p = polar(k * 22.5 + 8, 9.2);
    const leaf = blob(randRange(rng, 0.5, 0.8), 1, rng, 0.2);
    detail.add(leaf, m.foliage, xform(p.x, top + 4.15, p.z, 0, rng() * TAU, 0, 1, 0.6, 1));
  }
  for (const angle of [90, 180, 270, 0]) {
    const p = polar(angle, 6.7);
    props.bench(p.x, p.z, headingTo(p.x, p.z, cx, cz), top);
  }
  ctx.reserve(cx, cz, 11.5);

  /* ----- Cascatas que descem pelos terraços ----- */
  const [t0, t1, t2] = HANGING_GARDENS.tiers;
  const w = HANGING_GARDENS.riserWidth;
  const pieces: { from: number; to: number; fall: boolean }[] = [
    { from: 4.0, to: t2 - w, fall: false },
    { from: t2 - w, to: t2, fall: true },
    { from: t2, to: t1 - w, fall: false },
    { from: t1 - w, to: t1, fall: true },
    { from: t1, to: t0 - w, fall: false },
    { from: t0 - w, to: t0 + 0.5, fall: true },
  ];
  for (const angle of [135, 225, 315]) {
    for (const piece of pieces) {
      const a = polar(angle, piece.from);
      const b = polar(angle, piece.to);
      const ribbon = groundRibbon(ctx, a.x, a.z, b.x, b.z, piece.fall ? 2.2 : 1.7, piece.fall ? 0.1 : 0.06);
      if (!piece.fall) scaleUV(ribbon, 0.3, Math.max(1, (piece.to - piece.from) * 0.3));
      batch.add(ribbon, piece.fall ? m.waterfall : m.poolWater);
      ctx.zones.stampSegment(a.x, a.z, b.x, b.z, 1.6, Zone.Reserved);
    }
    const end = polar(angle, t0 + 0.8);
    const pondY = ctx.ground(end.x, end.z);
    batch.add(annulus(1.9, 2.3, pondY - 0.5, pondY + 0.3, { segments: 24 }), m.white, xform(end.x, 0, end.z));
    batch.add(disc(1.92, pondY - 0.5, pondY + 0.16, 20), m.poolWater, xform(end.x, 0, end.z));
    ctx.physics.addCylinder({ x: end.x, z: end.z, radius: 2.3, yMin: pondY - 2, yMax: pondY + 0.3, blocksCamera: false, surface: 'water', tag: 'jardins-tanque' });
    ctx.jets.push({ x: end.x, y: pondY + 0.2, z: end.z, vx: 0, vy: 1.5, vz: 0, spread: 0.9, count: 18, size: 0.18 });
    ctx.waterSounds.push({ x: end.x, z: end.z, radius: 20, gain: 0.5 });
    ctx.reserve(end.x, end.z, 3);
  }
  ctx.waterSounds.push({ x: cx, z: cz, radius: 34, gain: 0.7 });

  /* ----- Postes e cristais nos terraços ----- */
  for (let k = 0; k < 8; k++) {
    const p = polar(22.5 + k * 45, 34.3);
    if (ctx.zones.isFree(p.x, p.z, 0.6, Zone.Reserved | Zone.Path)) props.lamp(p.x, p.z);
  }
  [90, 180, 270, 0].forEach((angle, i) => {
    const p = polar(angle, 24.3);
    props.crystals(batch, p.x, p.z, 1.1, i % 2 === 0);
  });

  /* ----- Ilhas flutuantes ----- */
  const islands = [
    { dx: 31, dz: -35, y: 25, r: 7.5, fall: true, tree: 'frondosa' as const },
    { dx: -40, dz: 8, y: 20, r: 6, fall: false, tree: 'palmeira' as const },
    { dx: 4, dz: 43, y: 28, r: 5.2, fall: true, tree: 'frondosa' as const },
    { dx: -31, dz: -38, y: 33, r: 8.5, fall: false, tree: 'cipreste' as const },
    { dx: 52, dz: 20, y: 38, r: 4.4, fall: false, tree: 'palmeira' as const },
  ];
  islands.forEach((island, index) => {
    const x = cx + island.dx;
    const z = cz + island.dz;
    const r = island.r;
    // Rocha: cone invertido irregular.
    const rock = new THREE.ConeGeometry(r, r * 1.5, 9, 3);
    rock.rotateX(Math.PI);
    const rp = rock.getAttribute('position');
    const cache = new Map<string, number>();
    for (let i = 0; i < rp.count; i++) {
      const key = `${rp.getX(i).toFixed(2)},${rp.getY(i).toFixed(2)},${rp.getZ(i).toFixed(2)}`;
      let k = cache.get(key);
      if (k === undefined) {
        k = 1 + (rng() - 0.5) * 0.36;
        cache.set(key, k);
      }
      // Mantém a borda superior regular para encaixar o gramado.
      const edge = rp.getY(i) > r * 0.74 ? 1 : k;
      rp.setXYZ(i, rp.getX(i) * edge, rp.getY(i), rp.getZ(i) * edge);
    }
    const flat = rock.toNonIndexed();
    rock.dispose();
    flat.computeVertexNormals();
    batch.add(flat, m.sandstone, xform(x, island.y - r * 0.75, z, 0, rng() * TAU, 0));
    batch.add(disc(r * 1.04, island.y - 0.5, island.y, 9), m.soil, xform(x, 0, z));
    batch.add(torus(r * 0.55, 0.07, 6, 32), m.aquaGlow, xform(x, island.y - r * 0.9, z));
    batch.add(crystalShard(r * 0.09, r * 0.5), index % 2 === 0 ? m.crystal : m.crystalRose, xform(x, island.y - r * 1.5 - r * 0.2, z, Math.PI, 0, 0));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + rng();
      const leaf = blob(randRange(rng, 0.7, 1.2), 1, rng, 0.18);
      batch.add(leaf, m.foliage, xform(x + Math.cos(a) * r * 0.82, island.y + 0.25, z + Math.sin(a) * r * 0.82, 0, rng() * TAU, 0, 1, 0.7, 1));
    }
    ctx.vegetation.addTree({
      kind: island.tree,
      x,
      z,
      y: island.y,
      scale: r / 7.5 + 0.25,
      rotation: rng() * TAU,
      color: new THREE.Color(island.tree === 'frondosa' ? pick(rng, BLOSSOM_COLORS) : pick(rng, PALM_GREENS)),
      collide: false,
    });
    if (island.fall) {
      // Queda d'água da borda da ilha até o chão, voltada para o centro dos jardins.
      const dir = Math.atan2(cz - z, cx - x);
      const fx = x + Math.cos(dir) * r * 0.98;
      const fz = z + Math.sin(dir) * r * 0.98;
      const groundY = ctx.ground(fx, fz);
      const height = island.y - groundY;
      const sheet = new THREE.PlaneGeometry(1.7, height);
      scaleUV(sheet, 1.7, 1);
      batch.add(sheet, m.waterfall, xform(fx, groundY + height / 2, fz, 0, Math.PI / 2 - dir, 0));
      batch.add(annulus(1.6, 2.0, groundY - 0.5, groundY + 0.28, { segments: 20 }), m.white, xform(fx, 0, fz));
      batch.add(disc(1.62, groundY - 0.5, groundY + 0.15, 18), m.poolWater, xform(fx, 0, fz));
      ctx.physics.addCylinder({ x: fx, z: fz, radius: 2.0, yMin: groundY - 2, yMax: groundY + 0.28, blocksCamera: false, surface: 'water', tag: 'ilha-tanque' });
      ctx.jets.push({ x: fx, y: groundY + 0.25, z: fz, vx: 0, vy: 2.2, vz: 0, spread: 0.9, count: 26, size: 0.22 });
      ctx.waterSounds.push({ x: fx, z: fz, radius: 26, gain: 0.7 });
      ctx.reserve(fx, fz, 2.8);
    }
  });

  /* ----- Placa ----- */
  {
    const p = polar(45 + 5.5, 49.5);
    const position = props.sign(detail, p.x, p.z, headingTo(p.x, p.z, p.x + 1, p.z + 1), 'JARDINS SUSPENSOS', 'Terraços floridos e ilhas flutuantes');
    ctx.addInteractable({
      id: 'placa-jardins',
      name: 'Jardins Suspensos',
      action: 'Ler',
      x: position.x,
      y: position.y,
      z: position.z,
      payload: {
        type: 'placa',
        title: 'Jardins Suspensos',
        paragraphs: [
          'Três terraços de flores sobem até a pérgola, de onde a água desce em cascatas até os tanques da base.',
          'As ilhas que flutuam sobre os jardins são mantidas no ar pelos cristais de luz do Éden.',
        ],
        entryId: 'jardins-suspensos',
      },
    });
  }

  ctx.commit(batch, 'JardinsSuspensos');
  const detailGroup = ctx.commit(detail, 'JardinsSuspensos:detalhes');
  ctx.addDetailGroup(detailGroup, cx, cz, 220);
}

/* ------------------------------------------------------------------ */
/* Mirante Celeste                                                      */
/* ------------------------------------------------------------------ */

function buildMirante(ctx: CityContext, props: Props): void {
  const m = ctx.materials;
  const batch = ctx.batch();
  const cx = MIRANTE.x;
  const cz = MIRANTE.z;
  const top = ctx.ground(cx, cz);
  const R = MIRANTE.topRadius - 1.3;
  // A trilha em espiral chega pelo lado norte; o guarda-corpo deixa esse vão livre.
  const gapCenter = Math.PI + 0.38 + 1.15 * TAU;
  const gap = 0.95;
  const arcStart = gapCenter + gap / 2;
  const arcLength = TAU - gap;

  batch.add(annulus(R - 0.35, R, top - 1.2, top + 0.22, { segments: 64 }), m.white, xform(cx, 0, cz));
  batch.add(annulus(R - 0.14, R - 0.08, top + 0.22, top + 1.08, { angleStart: arcStart, angleLength: arcLength, segments: 56 }), m.glass, xform(cx, 0, cz));
  batch.add(torus(R - 0.11, 0.05, 6, 64, arcLength), m.white, xform(cx, top + 1.1, cz, 0, -arcStart - arcLength, 0));
  batch.add(torus(R - 0.2, 0.045, 6, 64), m.aquaGlow, xform(cx, top + 0.26, cz));
  const posts = 22;
  for (let k = 0; k <= posts; k++) {
    const a = arcStart + (k / posts) * arcLength;
    batch.add(cyl(0.045, 0.045, 0.88, 6), m.white, xform(cx + Math.cos(a) * (R - 0.11), top + 0.22, cz + Math.sin(a) * (R - 0.11)));
  }
  const pieces = 18;
  for (let k = 0; k < pieces; k++) {
    const a = arcStart + ((k + 0.5) / pieces) * arcLength;
    ctx.physics.addBox({
      x: cx + Math.cos(a) * (R - 0.11),
      z: cz + Math.sin(a) * (R - 0.11),
      halfX: 0.12,
      halfZ: ((R * arcLength) / pieces) * 0.52,
      rotation: -a,
      yMin: top - 0.5,
      yMax: top + 1.1,
      walkable: false,
      blocksCamera: false,
      tag: 'mirante-guarda-corpo',
    });
  }

  props.crystals(batch, cx, cz, 1.35, false, top);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const x = cx + Math.cos(a) * 3.6;
    const z = cz + Math.sin(a) * 3.6;
    props.bench(x, z, headingTo(cx, cz, x, z), top);
  }
  for (const a of [gapCenter + 0.75, gapCenter - 0.75]) props.lamp(cx + Math.cos(a) * (R - 1.1), cz + Math.sin(a) * (R - 1.1), top);

  // Telescópios: um voltado para a cidade, outro para a orla.
  const cityAngle = Math.atan2(-cz, -cx);
  const cityX = cx + Math.cos(cityAngle) * (R - 1.2);
  const cityZ = cz + Math.sin(cityAngle) * (R - 1.2);
  telescope(ctx, batch, 'telescopio-mirante-cidade', 'Telescópio — Vista da Cidade', cityX, top, cityZ, headingTo(cityX, cityZ, 0, 0), -0.07);
  const seaAngle = Math.atan2(PIER.zEnd - cz, PIER.x - cx);
  const seaX = cx + Math.cos(seaAngle) * (R - 1.2);
  const seaZ = cz + Math.sin(seaAngle) * (R - 1.2);
  telescope(ctx, batch, 'telescopio-mirante-orla', 'Telescópio — Vista da Orla', seaX, top, seaZ, headingTo(seaX, seaZ, PIER.x, PIER.zEnd), -0.09);

  {
    const a = gapCenter - 0.34;
    const x = cx + Math.cos(a) * (R + 1.6);
    const z = cz + Math.sin(a) * (R + 1.6);
    const position = props.sign(batch, x, z, headingTo(cx, cz, x, z), 'MIRANTE CELESTE', 'O ponto mais alto de Aurora City');
    ctx.addInteractable({
      id: 'placa-mirante',
      name: 'Mirante Celeste',
      action: 'Ler',
      x: position.x,
      y: position.y,
      z: position.z,
      payload: {
        type: 'placa',
        title: 'Mirante Celeste',
        paragraphs: [
          'Você está a 16 metros acima da cidade. Daqui se vê a Praça Central, a Torre Aurora, o Lago Espelho e toda a orla.',
          'Use os telescópios para observar a paisagem. Ao anoitecer, a aurora cobre o céu do Éden.',
        ],
        entryId: 'mirante-celeste',
      },
    });
  }
  ctx.reserve(cx, cz, MIRANTE.topRadius);
  ctx.commit(batch, 'MiranteCeleste');
}

/* ------------------------------------------------------------------ */
/* Orla Cristalina: píer, praia e veleiros                              */
/* ------------------------------------------------------------------ */

function buildWaterfront(ctx: CityContext, props: Props): void {
  const m = ctx.materials;
  const batch = ctx.batch();
  const rng = createRng(909);
  const deckY = PIER.deckY;
  const length = PIER.zEnd - PIER.zStart;
  const midZ = (PIER.zStart + PIER.zEnd) / 2;
  const half = PIER.width / 2;

  /* ----- Rampa de acesso ----- */
  const rampStart = PIER.zStart - 8.5;
  const rampY0 = ctx.ground(PIER.x, rampStart) + 0.03;
  const rampY = (lz: number): number => lerp(rampY0, deckY, clamp01((lz + 4.25) / 8.5));
  const ramp = new THREE.BoxGeometry(PIER.width, 0.3, 8.5, 1, 1, 4);
  const rampPos = ramp.getAttribute('position');
  for (let i = 0; i < rampPos.count; i++) rampPos.setY(i, rampPos.getY(i) - 0.15 + rampY(rampPos.getZ(i)));
  ramp.computeVertexNormals();
  batch.add(ramp, m.wood, xform(PIER.x, 0, rampStart + 4.25));
  ctx.physics.addBox({ x: PIER.x, z: rampStart + 4.25, halfX: half, halfZ: 4.25, yMin: -1, yMax: deckY, topAt: (_lx, lz) => rampY(lz), surface: 'wood', tag: 'pier-rampa' });

  /* ----- Deck ----- */
  batch.add(box(PIER.width, 0.3, length), m.wood, xform(PIER.x, deckY - 0.3, midZ));
  ctx.physics.addBox({ x: PIER.x, z: midZ, halfX: half, halfZ: length / 2, yMin: deckY - 0.3, yMax: deckY, surface: 'wood', blocksCamera: false, tag: 'pier-deck' });
  for (const side of [-1, 1]) {
    batch.add(box(0.16, 0.14, length), m.white, xform(PIER.x + side * (half - 0.08), deckY, midZ));
    batch.add(box(0.05, 0.05, length), m.aquaGlow, xform(PIER.x + side * (half + 0.03), deckY - 0.2, midZ));
    for (let z = PIER.zStart + 2; z < PIER.zEnd; z += 6) {
      const bed = ctx.ground(PIER.x + side * (half - 0.3), z);
      batch.add(cyl(0.2, 0.24, deckY - bed + 0.6, 10), m.wood, xform(PIER.x + side * (half - 0.3), bed - 0.3, z));
    }
  }
  for (let i = 0, z = PIER.zStart + 5; z < PIER.zEnd - 4; z += 10, i++) {
    props.lamp(PIER.x + (i % 2 === 0 ? -1 : 1) * (half - 0.45), z, deckY);
  }

  /* ----- Pavilhão na ponta ----- */
  const endZ = PIER.zEnd + 3.2;
  const endR = 6.8;
  batch.add(disc(endR, deckY - 0.3, deckY, 40), m.wood, xform(PIER.x, 0, endZ));
  batch.add(torus(endR, 0.06, 6, 48), m.aquaGlow, xform(PIER.x, deckY - 0.12, endZ));
  ctx.physics.addCylinder({ x: PIER.x, z: endZ, radius: endR, yMin: deckY - 0.3, yMax: deckY, surface: 'wood', blocksCamera: false, tag: 'pier-ponta' });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + Math.PI / 6;
    const x = PIER.x + Math.cos(a) * 4.6;
    const z = endZ + Math.sin(a) * 4.6;
    const bed = ctx.ground(x, z);
    batch.add(cyl(0.14, 0.18, 3.3, 10), m.white, xform(x, deckY, z));
    batch.add(cyl(0.22, 0.26, deckY - bed + 0.4, 10), m.wood, xform(x, bed - 0.4, z));
    ctx.physics.addCylinder({ x, z, radius: 0.22, yMin: deckY - 0.3, yMax: deckY + 3.3, walkable: false, blocksCamera: false, tag: 'pier-coluna' });
  }
  const shell = lathe(
    [
      [6.2, 3.2],
      [4.6, 3.75],
      [2.4, 4.3],
      [0.05, 4.55],
    ],
    36,
  );
  for (const part of doubleSided(shell)) batch.add(part, m.white, xform(PIER.x, deckY, endZ));
  batch.add(sphere(0.3, 12, 8), m.aquaGlow, xform(PIER.x, deckY + 4.7, endZ));
  props.orb(PIER.x, deckY + 2.8, endZ, 1.4);
  for (const a of [Math.PI / 2 - 0.9, Math.PI / 2 + 0.9]) {
    const x = PIER.x + Math.cos(a) * 3.0;
    const z = endZ + Math.sin(a) * 3.0;
    props.bench(x, z, headingTo(PIER.x, endZ, x, z), deckY);
  }
  telescope(ctx, batch, 'telescopio-pier', 'Telescópio — Vista do Mar', PIER.x, deckY, endZ + 5.4, Math.PI, 0.06);
  ctx.lightSpots.push({ x: PIER.x, y: deckY + 0.05, z: endZ, radius: 7, color: 0x9fefff });

  /* ----- Guarda-sóis e espreguiçadeiras ----- */
  const umbrellaColors = [m.aquaGlow, m.white, m.greenGlow];
  let lounger = 0;
  for (let k = 0; k < 10; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const x = PIER.x + side * (14 + Math.floor(k / 2) * 11.5 + rng() * 2);
    const z = 199.5 + rng() * 3;
    const y = ctx.ground(x, z);
    if (y < 0.42 || !ctx.zones.isFree(x, z, 1.5, Zone.Water | Zone.Path | Zone.Reserved)) continue;
    batch.add(cyl(0.045, 0.045, 2.5, 8), m.white, xform(x, y - 0.1, z));
    const canopy = lathe(
      [
        [1.9, 2.05],
        [1.2, 2.4],
        [0.05, 2.6],
      ],
      10,
    );
    for (const part of doubleSided(canopy)) batch.add(part, umbrellaColors[k % 3], xform(x, y - 0.1, z));
    ctx.physics.addCylinder({ x, z, radius: 0.12, yMin: y - 1, yMax: y + 2.4, walkable: false, blocksCamera: false, tag: 'guarda-sol' });
    for (const offset of [-1.1, 1.1]) {
      const lx = x + offset;
      const lz = z + 0.4;
      const ly = ctx.ground(lx, lz);
      batch.add(box(0.72, 0.1, 1.9), m.white, xform(lx, ly + 0.26, lz, -0.06, Math.PI, 0));
      batch.add(box(0.72, 0.1, 0.8), m.white, xform(lx, ly + 0.34, lz - 1.15, 0.75, Math.PI, 0));
      batch.add(box(0.6, 0.26, 1.5), m.wood, xform(lx, ly, lz));
      ctx.physics.addBox({ x: lx, z: lz, halfX: 0.4, halfZ: 1.0, yMin: ly - 0.5, yMax: ly + 0.38, blocksCamera: false, surface: 'wood', tag: 'espreguicadeira' });
      lounger += 1;
      ctx.addInteractable({
        id: `espreguicadeira-${lounger}`,
        name: 'Espreguiçadeira',
        action: 'Relaxar',
        x: lx,
        y: ly + 0.6,
        z: lz,
        range: 2,
        payload: { type: 'assento', seat: { x: lx, y: ly + 0.38, z: lz + 0.1, heading: 0 } },
      });
    }
    ctx.reserve(x, z, 2.6);
  }

  /* ----- Placa da orla ----- */
  {
    const x = PIER.x + half + 1.6;
    const z = rampStart - 1.5;
    const position = props.sign(batch, x, z, Math.PI, 'PÍER DA ORLA', 'Orla Cristalina · Mar do Éden');
    ctx.addInteractable({
      id: 'placa-orla',
      name: 'Orla Cristalina',
      action: 'Ler',
      x: position.x,
      y: position.y,
      z: position.z,
      payload: {
        type: 'placa',
        title: 'Orla Cristalina',
        paragraphs: [
          'A areia clara e o mar transparente fazem da Orla Cristalina o lugar favorito para ver o pôr do sol em Aurora City.',
          'Caminhe até a ponta do píer, descanse nas espreguiçadeiras ou dê um mergulho. Os veleiros ao largo pertencem ao Clube Náutico.',
        ],
        entryId: 'orla-cristalina',
      },
    });
  }
  ctx.commit(batch, 'OrlaCristalina');

  /* ----- Veleiros ----- */
  const boats = [
    { x: 34, z: 246, heading: 0.6 },
    { x: -42, z: 240, heading: -1.1 },
    { x: 70, z: 232, heading: 2.2 },
    { x: -78, z: 236, heading: 0.2 },
  ];
  boats.forEach((spot, index) => {
    const boat = ctx.batch();
    const hull = new THREE.SphereGeometry(1, 16, 10, 0, TAU, Math.PI / 2, Math.PI / 2);
    hull.scale(1.25, 0.95, 3.6);
    boat.add(hull, m.white);
    boat.add(box(2.2, 0.08, 6.6), m.wood, xform(0, -0.04, 0, 0, 0, 0, 1, 1, 1));
    boat.add(box(1.5, 0.6, 2.2), m.white, xform(0, 0.04, -0.4));
    boat.add(box(1.55, 0.3, 2.25), index % 2 === 0 ? m.aquaGlow : m.greenGlow, xform(0, 0.2, -0.4));
    boat.add(cyl(0.06, 0.09, 8.4, 8), m.metal, xform(0, 0.04, 0.5));
    const sail = (points: number[]): THREE.BufferGeometry => {
      const geometry = new THREE.BufferGeometry();
      // Duas faces: a vela é vista dos dois lados.
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([...points, points[0], points[1], points[2], points[6], points[7], points[8], points[3], points[4], points[5]], 3));
      geometry.computeVertexNormals();
      return geometry;
    };
    boat.add(sail([0.02, 1.0, 0.36, 0.02, 8.2, 0.5, 0.5, 1.0, -3.0]), m.white);
    boat.add(sail([0.02, 1.2, 0.66, 0.02, 7.4, 0.56, -0.25, 1.0, 3.3]), m.white);
    boat.add(sphere(0.14, 8, 6), m.aquaGlow, xform(0, 8.5, 0.5));
    const group = boat.build(`Veleiro:${index}`, { castShadow: true, receiveShadow: false });
    group.matrixAutoUpdate = true;
    group.position.set(spot.x, 0.2, spot.z);
    group.rotation.y = spot.heading;
    ctx.root.add(group);
    ctx.physics.addCylinder({ x: spot.x, z: spot.z, radius: 2.6, yMin: -2, yMax: 1.4, walkable: false, tag: 'veleiro' });
    ctx.animate(({ elapsed }) => {
      group.position.y = 0.2 + Math.sin(elapsed * 0.9 + index * 1.7) * 0.09;
      group.rotation.z = Math.sin(elapsed * 0.7 + index) * 0.045;
      group.rotation.x = Math.sin(elapsed * 0.53 + index * 2.1) * 0.03;
    });
  });
}

/* ------------------------------------------------------------------ */
/* Palco Aurora                                                         */
/* ------------------------------------------------------------------ */

function buildStage(ctx: CityContext, props: Props): void {
  const m = ctx.materials;
  const batch = ctx.batch();
  const cx = STAGE.x;
  const cz = STAGE.z;
  const R = STAGE.radius;
  const base = H0 - 0.3;
  const stageY = base + 0.9;

  // Degraus concêntricos e tablado.
  [
    { r: R + 1.4, y: base + 0.3 },
    { r: R + 0.7, y: base + 0.6 },
    { r: R, y: stageY },
  ].forEach((step, i) => {
    batch.add(disc(step.r, base - 0.6, step.y, 56), i === 2 ? m.glassFloor : m.white, xform(cx, 0, cz));
    ctx.physics.addCylinder({ x: cx, z: cz, radius: step.r, yMin: base - 1, yMax: step.y, surface: i === 2 ? 'glass' : 'stone', blocksCamera: false, tag: 'palco-degrau' });
  });
  batch.add(torus(R, 0.07, 6, 64), m.aquaGlow, xform(cx, stageY + 0.02, cz));

  // Concha acústica aberta para o norte (plateia).
  const shellGeometry = new THREE.SphereGeometry(R + 1.2, 36, 14, 0, Math.PI, 0, Math.PI / 2);
  shellGeometry.scale(1, 0.92, 0.8);
  for (const part of doubleSided(shellGeometry)) batch.add(part, m.white, xform(cx, stageY - 0.1, cz + 0.6));
  const rim = new THREE.TorusGeometry(R + 1.2, 0.2, 8, 40, Math.PI);
  rim.scale(1, 0.92, 1);
  batch.add(rim, m.aquaGlow, xform(cx, stageY - 0.1, cz + 0.6));
  for (let k = 0; k < 7; k++) {
    const a = (k / 6) * Math.PI;
    const x = cx + Math.cos(a) * (R + 1.0);
    const z = cz + 0.6 + Math.sin(a) * (R + 1.0) * 0.8;
    ctx.physics.addCylinder({ x, z, radius: 1.3, yMin: base - 1, yMax: stageY + 5, walkable: false, tag: 'palco-concha' });
  }

  // Telão holográfico.
  const screen = m.createHologram(1024, 512, (c, w, h) => {
    c.fillStyle = 'rgba(8, 66, 124, 0.7)';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgb(170, 244, 255)';
    c.lineWidth = 6;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.font = '700 96px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
    c.fillText('PALCO AURORA', w / 2, 170);
    c.fillRect(w * 0.18, 205, w * 0.64, 4);
    c.font = '500 50px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
    c.fillText('Shows de Lilly  ·  EdenGala', w / 2, 290);
    c.fillText('Concurso Divino', w / 2, 355);
    c.font = '700 44px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
    c.fillText('✦ EM BREVE ✦', w / 2, 448);
  });
  screen.material.side = THREE.FrontSide;
  const screenGeometry = new THREE.PlaneGeometry(9, 4.5);
  const screenMesh = new THREE.Mesh(screenGeometry, screen.material);
  screenMesh.position.set(cx, stageY + 3.6, cz + 5.2);
  screenMesh.rotation.y = Math.PI;
  screenMesh.renderOrder = 4;
  ctx.root.add(screenMesh);
  ctx.disposables.push(screenGeometry);

  // Torres de luz.
  for (const side of [-1, 1]) {
    const x = cx + side * (R + 2.6);
    const z = cz - 3.2;
    batch.add(cyl(0.16, 0.26, 6.2, 10), m.white, xform(x, base, z));
    for (let k = 0; k < 3; k++) batch.add(sphere(0.3, 10, 8), k % 2 === 0 ? m.aquaGlow : m.greenGlow, xform(x, base + 4.4 + k * 0.8, z));
    ctx.physics.addCylinder({ x, z, radius: 0.3, yMin: base - 1, yMax: base + 6.2, walkable: false, blocksCamera: false, tag: 'palco-torre' });
    ctx.lightSpots.push({ x, y: base + 0.06, z, radius: 8, color: side < 0 ? 0x7feaff : 0x7dffc0 });
  }

  // Plateia: arcos de bancos voltados para o palco.
  [
    { r: R + 6, count: 5 },
    { r: R + 9.5, count: 6 },
    { r: R + 13, count: 7 },
  ].forEach((row) => {
    for (let k = 0; k < row.count; k++) {
      const a = -Math.PI / 2 + (k - (row.count - 1) / 2) * (3.1 / row.r);
      const x = cx + Math.cos(a) * row.r;
      const z = cz + Math.sin(a) * row.r;
      if (!ctx.zones.isFree(x, z, 1.2, Zone.Path | Zone.Water | Zone.Reserved | Zone.Building)) continue;
      props.bench(x, z, headingTo(x, z, cx, cz));
    }
  });

  {
    const x = cx - R - 5.5;
    const z = cz - 6.5;
    const position = props.sign(batch, x, z, headingTo(x, z, x - 0.4, z - 1), 'PALCO AURORA', 'Shows e eventos do Éden · em breve');
    ctx.addInteractable({
      id: 'placa-palco',
      name: 'Palco Aurora',
      action: 'Ler',
      x: position.x,
      y: position.y,
      z: position.z,
      payload: {
        type: 'placa',
        title: 'Palco Aurora',
        paragraphs: [
          'O Palco Aurora receberá os grandes eventos do Éden: shows de Lilly, a EdenGala, a EdenCon e o Concurso Divino.',
          'Os eventos ao vivo chegarão em uma versão futura do EDENWORLD. Por enquanto, suba ao palco e aproveite a vista.',
        ],
        entryId: 'palco-aurora',
      },
    });
  }
  ctx.reserve(cx, cz, R + 2);
  ctx.commit(batch, 'PalcoAurora');
}

/** Constrói os parques e marcos naturais de Aurora City. */
export function buildParks(ctx: CityContext, props: Props): void {
  buildWaterPark(ctx, props);
  buildHangingGardens(ctx, props);
  buildMirante(ctx, props);
  buildWaterfront(ctx, props);
  buildStage(ctx, props);
}
