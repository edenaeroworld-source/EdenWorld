import * as THREE from 'three';
import { xform } from '../../utils/geometry';
import { TAU, createRng, pick, randRange } from '../../utils/math';
import type { GroundInfo } from '../../physics/PhysicsWorld';
import { BLOSSOM_COLORS, BUSH_GREENS, LEAF_GREENS, PALM_GREENS, type TreeKind } from '../../world/Vegetation';
import { Zone, ZONE_BLOCKING } from '../../world/ZoneMap';
import { lakeEllipse } from './AuroraTerrain';
import { PLAZA_Y } from './CentralPlaza';
import type { CityContext } from './CityContext';
import { type Props, headingTo, headingVector } from './Decorations';
import { crystalShard, cyl, disc, torus } from './Kit';
import { AVENUES, CORE_FLAT_RADIUS, H0, HANGING_GARDENS, LAKE_ISLAND, MIRANTE, PIER, RING, STAGE, coastRadius } from './Layout';
import type { GardenBed } from './Zones';

/* ------------------------------------------------------------------ */
/* Portais de viagem rápida                                             */
/* ------------------------------------------------------------------ */

interface PortalSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Ponto para o qual o portal está voltado. */
  faceX: number;
  faceZ: number;
  y?: number;
}

const PLAZA_PORTAL_ANGLE = (112.5 * Math.PI) / 180;

export const PORTAL_SPECS: readonly PortalSpec[] = [
  { id: 'praca', name: 'Praça Central', x: Math.cos(PLAZA_PORTAL_ANGLE) * 30.5, z: Math.sin(PLAZA_PORTAL_ANGLE) * 30.5, faceX: 0, faceZ: 0, y: PLAZA_Y },
  { id: 'parque', name: 'Parque das Águas', x: -143, z: -1, faceX: -150, faceZ: -9 },
  { id: 'jardins', name: 'Jardins Suspensos', x: -86, z: -96, faceX: -90, faceZ: -89 },
  { id: 'cristal', name: 'Distrito Cristal', x: 9.5, z: -127, faceX: 0, faceZ: -127 },
  { id: 'nuvens', name: 'Vila das Nuvens', x: 109, z: -99, faceX: 107, faceZ: -104 },
  { id: 'mirante', name: 'Mirante Celeste', x: MIRANTE.x - 5.6, z: MIRANTE.z + 2.4, faceX: MIRANTE.x, faceZ: MIRANTE.z },
  { id: 'palco', name: 'Palco Aurora', x: 73, z: 159, faceX: 80, faceZ: 157 },
  { id: 'orla', name: 'Orla Cristalina', x: 9, z: 191, faceX: 0, faceZ: 191 },
];

function buildPortals(ctx: CityContext): void {
  const m = ctx.materials;
  const batch = ctx.batch();
  const swirl = m.createHologram(
    256,
    256,
    (c, w, h) => {
      const gradient = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      gradient.addColorStop(0.8, 'rgba(255,255,255,0.22)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gradient;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = 5;
      c.lineCap = 'round';
      for (let arm = 0; arm < 5; arm++) {
        c.beginPath();
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const a = (arm / 5) * TAU + t * 4.2;
          const r = 8 + t * (w / 2 - 14);
          const x = w / 2 + Math.cos(a) * r;
          const y = h / 2 + Math.sin(a) * r;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
    },
    0x8ff5ff,
  );
  const discGeometry = new THREE.CircleGeometry(1.52, 40);
  ctx.disposables.push(discGeometry);

  PORTAL_SPECS.forEach((spec, index) => {
    const y = spec.y ?? ctx.ground(spec.x, spec.z);
    const heading = headingTo(spec.x, spec.z, spec.faceX, spec.faceZ);
    const f = headingVector(heading);
    const side = { x: Math.cos(heading), z: -Math.sin(heading) };

    batch.add(disc(2.0, y - 1.2, y + 0.24, 32), m.white, xform(spec.x, 0, spec.z));
    batch.add(torus(2.0, 0.06, 6, 40), m.aquaGlow, xform(spec.x, y + 0.14, spec.z));
    batch.add(new THREE.TorusGeometry(1.78, 0.2, 10, 44), m.white, xform(spec.x, y + 2.12, spec.z, 0, heading, 0));
    batch.add(new THREE.TorusGeometry(1.55, 0.05, 6, 44), m.aquaGlow, xform(spec.x, y + 2.12, spec.z, 0, heading, 0));
    for (const s of [-1, 1]) {
      const px = spec.x + side.x * s * 1.86;
      const pz = spec.z + side.z * s * 1.86;
      batch.add(cyl(0.26, 0.34, 0.8, 10), m.white, xform(px, y + 0.24, pz));
      batch.add(crystalShard(0.16, 0.9), s < 0 ? m.crystal : m.crystalRose, xform(px, y + 1.0, pz));
      ctx.physics.addCylinder({ x: px, z: pz, radius: 0.34, yMin: y - 1, yMax: y + 2.2, walkable: false, blocksCamera: false, tag: 'portal-pilar' });
    }
    ctx.physics.addCylinder({ x: spec.x, z: spec.z, radius: 2.0, yMin: y - 1.2, yMax: y + 0.24, blocksCamera: false, tag: 'portal-base' });

    const disc3 = new THREE.Mesh(discGeometry, swirl.material);
    disc3.position.set(spec.x, y + 2.12, spec.z);
    disc3.rotation.set(0, heading, 0, 'YXZ');
    disc3.renderOrder = 4;
    ctx.root.add(disc3);
    ctx.animate(({ elapsed }) => {
      disc3.rotation.z = elapsed * 0.8 + index;
    });

    ctx.lightSpots.push({ x: spec.x, y: y + 0.3, z: spec.z, radius: 6, color: 0x8ff5ff });
    ctx.reserve(spec.x, spec.z, 3.2);
    ctx.portals.push({ id: spec.id, name: spec.name, x: spec.x + f.x * 2.9, y: y + 0.3, z: spec.z + f.z * 2.9, heading });
    ctx.addInteractable({
      id: `portal-${spec.id}`,
      name: `Portal · ${spec.name}`,
      action: 'Viajar',
      x: spec.x,
      y: y + 1.3,
      z: spec.z,
      range: 3.4,
      payload: { type: 'portal', portalId: spec.id },
    });
  });
  ctx.commit(batch, 'Portais');
}

/* ------------------------------------------------------------------ */
/* Cristais de Luz (colecionáveis)                                      */
/* ------------------------------------------------------------------ */

const COLLECTIBLE_SPOTS: readonly { id: string; x: number; z: number; hint: string }[] = [
  { id: 'praca', x: 0, z: -17, hint: 'Atrás da Esfera Aurora, na Praça Central.' },
  { id: 'gazebo', x: LAKE_ISLAND.x, z: LAKE_ISLAND.z, hint: 'No centro do gazebo da ilha do lago.' },
  { id: 'lago-oeste', x: -214, z: 30, hint: 'Na margem oeste do Lago Espelho, perto do mar.' },
  { id: 'rio', x: -112, z: 150, hint: 'Na trilha que acompanha o rio.' },
  { id: 'jardins-topo', x: -122, z: -134, hint: 'No topo dos Jardins Suspensos, sob a pérgola.' },
  { id: 'jardins-base', x: -168, z: -104, hint: 'Atrás dos Jardins Suspensos, sob uma ilha flutuante.' },
  { id: 'torre-aurora', x: -9, z: -139, hint: 'Diante da Torre Aurora.' },
  { id: 'torre-aurora-norte', x: 0, z: -212, hint: 'Atrás da Torre Aurora, de frente para o mar do norte.' },
  { id: 'agulha-poente', x: -54, z: -144, hint: 'Aos pés da Agulha Poente.' },
  { id: 'agulha-estelar', x: 104, z: -176, hint: 'Na costa norte, além da Agulha Estelar.' },
  { id: 'vila-nuvens', x: 136, z: -103, hint: 'No coração da Vila das Nuvens.' },
  { id: 'cirrus', x: 170, z: -66, hint: 'No gramado atrás dos Terraços Cirrus.' },
  { id: 'observatorio', x: 150, z: 0, hint: 'Ao lado do Observatório Alvorada.' },
  { id: 'mirante-topo', x: MIRANTE.x + 4.5, z: MIRANTE.z + 5.5, hint: 'No alto do Mirante Celeste.' },
  { id: 'mirante-encosta', x: MIRANTE.x - 26, z: MIRANTE.z + 24, hint: 'Na encosta do Mirante, ao lado da trilha em espiral.' },
  { id: 'palco', x: STAGE.x, z: STAGE.z, hint: 'No centro do Palco Aurora.' },
  { id: 'pier', x: PIER.x, z: PIER.zEnd + 3.2, hint: 'Na ponta do Píer da Orla.' },
  { id: 'praia-oeste', x: -56, z: 204, hint: 'Na areia da praia, a oeste do píer.' },
  { id: 'praia-leste', x: 60, z: 199, hint: 'Na areia da praia, a leste do píer.' },
  { id: 'clube', x: -48, z: 166, hint: 'Atrás do Clube Náutico.' },
  { id: 'centro-nordeste', x: 52, z: -35, hint: 'Nos gramados do centro, a nordeste da praça.' },
  { id: 'centro-noroeste', x: -49, z: -41, hint: 'Nos gramados do centro, a noroeste da praça.' },
  { id: 'centro-sudeste', x: 45, z: 47, hint: 'Nos gramados do centro, a sudeste da praça.' },
  { id: 'costa-leste', x: 213, z: -22, hint: 'Na pequena praia da costa leste.' },
];

function placeCollectibles(ctx: CityContext): void {
  const info: GroundInfo = { height: 0, surface: 'grass', onPlatform: false };
  for (const spot of COLLECTIBLE_SPOTS) {
    ctx.physics.groundAt(spot.x, spot.z, 1000, 0, info);
    ctx.collectibles.push({ id: `cristal-${spot.id}`, x: spot.x, y: Math.max(info.height, 0.1) + 1.15, z: spot.z, hint: spot.hint });
    ctx.reserve(spot.x, spot.z, 1.2);
  }
}

/* ------------------------------------------------------------------ */
/* Ruas: postes, bancos e arborização                                   */
/* ------------------------------------------------------------------ */

function buildStreets(ctx: CityContext, props: Props): void {
  const zones = ctx.zones;
  const clear = (x: number, z: number, r: number): boolean => zones.isFree(x, z, r, Zone.Path | Zone.Building | Zone.Reserved | Zone.Water);

  AVENUES.forEach((avenue, index) => {
    const cos = Math.cos(avenue.angle);
    const sin = Math.sin(avenue.angle);
    const at = (along: number, lateral: number): { x: number; z: number } => ({ x: cos * along - sin * lateral, z: sin * along + cos * lateral });
    for (let d = 54; d <= 104; d += 16) {
      for (const side of [-1, 1]) {
        const lamp = at(d, side * 6.5);
        if (clear(lamp.x, lamp.z, 0.5)) props.lamp(lamp.x, lamp.z);
        const tree = at(d + 8, side * 8.8);
        if (d + 8 < 106 && zones.isFree(tree.x, tree.z, 1.4)) {
          const palm = index % 2 === 0;
          ctx.vegetation.addTree({
            kind: palm ? 'palmeira' : 'frondosa',
            x: tree.x,
            z: tree.z,
            scale: palm ? 1.05 : 0.95,
            rotation: ctx.rng() * TAU,
            color: new THREE.Color(palm ? pick(ctx.rng, PALM_GREENS) : BLOSSOM_COLORS[index === 1 ? 0 : 3]),
          });
        }
      }
    }
    for (const d of [62, 94]) {
      for (const side of [-1, 1]) {
        const bench = at(d, side * 6.9);
        const axis = at(d, 0);
        if (clear(bench.x, bench.z, 1.3)) props.bench(bench.x, bench.z, headingTo(bench.x, bench.z, axis.x, axis.z));
      }
    }
  });

  // Anel viário: postes por fora, bancos por dentro, árvores alternadas.
  const outer = RING.radius + RING.width / 2 + 1.5;
  const inner = RING.radius - RING.width / 2 - 1.6;
  for (let k = 0; k < 36; k++) {
    const a = ((k + 0.5) / 36) * TAU;
    const x = Math.cos(a) * outer;
    const z = Math.sin(a) * outer;
    if (clear(x, z, 0.5)) props.lamp(x, z);
    const ta = ((k + 1) / 36) * TAU;
    const tx = Math.cos(ta) * (outer + 3.6);
    const tz = Math.sin(ta) * (outer + 3.6);
    if (zones.isFree(tx, tz, 1.4) && ctx.ground(tx, tz) > 1.2) {
      const palm = k % 3 === 0;
      ctx.vegetation.addTree({
        kind: palm ? 'palmeira' : 'frondosa',
        x: tx,
        z: tz,
        scale: randRange(ctx.rng, 0.9, 1.15),
        rotation: ctx.rng() * TAU,
        color: new THREE.Color(palm ? pick(ctx.rng, PALM_GREENS) : pick(ctx.rng, LEAF_GREENS)),
      });
    }
  }
  for (let k = 0; k < 16; k++) {
    const a = ((k + 0.5) / 16) * TAU;
    const x = Math.cos(a) * inner;
    const z = Math.sin(a) * inner;
    if (zones.isFree(x, z, 1.4, Zone.Path | Zone.Building | Zone.Reserved | Zone.Water | Zone.Paved)) props.bench(x, z, headingTo(x, z, 0, 0));
  }
}

/* ------------------------------------------------------------------ */
/* Canteiros                                                            */
/* ------------------------------------------------------------------ */

const FLOWER_PALETTES: readonly (readonly number[])[] = [
  [0xff7fb0, 0xffb3d1, 0xffffff, 0xff5f93],
  [0xffd84a, 0xffa94d, 0xffffff, 0xfff3a0],
  [0xb58cff, 0x8fb8ff, 0xffffff, 0xe0b3ff],
  [0xff8f6b, 0xffd84a, 0xff7fb0, 0xffffff],
];
const LUMEN_PALETTES: readonly (readonly number[])[] = [
  [0x6ff5ff, 0x9fefff, 0xcfe9ff],
  [0x7dffc4, 0x6ff5ff, 0xd0fff0],
  [0xff9fe0, 0xc9a2ff, 0x9fefff],
];

function plantBeds(ctx: CityContext, beds: readonly GardenBed[]): void {
  const rng = createRng(777);
  beds.forEach((bed, index) => {
    const luminous = bed.theme === 'lumen';
    const palette = luminous ? LUMEN_PALETTES[index % LUMEN_PALETTES.length] : FLOWER_PALETTES[index % FLOWER_PALETTES.length];
    ctx.vegetation.addFlowerPatch({ x: bed.x, z: bed.z, radius: bed.radius * 0.94, density: bed.theme === 'tropical' ? 0.8 : 1.5, palette, luminous });
    if (luminous) ctx.lightSpots.push({ x: bed.x, y: ctx.ground(bed.x, bed.z) + 0.08, z: bed.z, radius: bed.radius * 1.5, color: palette[0] });
    if (bed.theme === 'tropical') {
      const count = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < count; k++) {
        const a = rng() * TAU;
        const r = rng() * bed.radius * 0.6;
        ctx.vegetation.addTree({
          kind: 'bananeira',
          x: bed.x + Math.cos(a) * r,
          z: bed.z + Math.sin(a) * r,
          scale: randRange(rng, 0.9, 1.5),
          rotation: rng() * TAU,
          color: new THREE.Color(pick(rng, PALM_GREENS)),
        });
      }
    } else if (bed.radius > 3.4) {
      ctx.vegetation.addBush({ x: bed.x, z: bed.z, scale: randRange(rng, 1.3, 1.9), color: new THREE.Color(pick(rng, BUSH_GREENS)) });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Arborização livre                                                    */
/* ------------------------------------------------------------------ */

/** Acima desta altitude, a encosta do Mirante só recebe arbustos e flores. */
const MIRANTE_TREE_LINE = H0 + MIRANTE.height * 0.34;

function plantTrees(ctx: CityContext): void {
  const rng = createRng(4242);
  const zones = ctx.zones;
  const vegetation = ctx.vegetation;
  const field = ctx.heightField;

  const plant = (x: number, z: number, kind: TreeKind, gap: number): boolean => {
    if (!zones.isFree(x, z, kind === 'bananeira' ? 1.0 : 1.7, ZONE_BLOCKING | Zone.Bed)) return false;
    if (!vegetation.isClear(x, z, gap)) return false;
    const h = field.getHeight(x, z);
    if (h < 0.7 || field.getSlope(x, z) > 0.3) return false;
    let color: number;
    if (kind === 'palmeira' || kind === 'bananeira') color = pick(rng, PALM_GREENS);
    else if (kind === 'frondosa' && rng() < 0.16) color = pick(rng, BLOSSOM_COLORS);
    else color = pick(rng, LEAF_GREENS);
    const scale = kind === 'bananeira' ? randRange(rng, 0.9, 1.5) : randRange(rng, 0.82, 1.28);
    const rotation = rng() * TAU;
    // O alto do Mirante Celeste fica sem copas, para não tapar a vista panorâmica.
    // (O sorteio acima é mantido para não alterar o restante da arborização.)
    if (h > MIRANTE_TREE_LINE && Math.hypot(x - MIRANTE.x, z - MIRANTE.z) < MIRANTE.radius) return false;
    vegetation.addTree({ kind, x, z, scale, rotation, color: new THREE.Color(color) });
    return true;
  };
  const choose = (table: readonly [TreeKind, number][]): TreeKind => {
    let roll = rng();
    for (const [kind, weight] of table) {
      roll -= weight;
      if (roll <= 0) return kind;
    }
    return table[0][0];
  };

  // Gramados do núcleo urbano.
  for (let i = 0; i < 560; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(randRange(rng, 50 * 50, 122 * 122));
    plant(Math.cos(a) * r, Math.sin(a) * r, choose([['frondosa', 0.74], ['cipreste', 0.14], ['palmeira', 0.12]]), 4.2);
  }

  // Parques e áreas naturais.
  for (let i = 0; i < 3000; i++) {
    const a = rng() * TAU;
    const limit = coastRadius(a) + 4;
    const r = Math.sqrt(randRange(rng, CORE_FLAT_RADIUS * CORE_FLAT_RADIUS, limit * limit));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = field.getHeight(x, z);
    if (h < 0.7) continue;
    // Os terraços dos Jardins Suspensos ficam abertos, com arborização própria.
    if (Math.hypot(x - HANGING_GARDENS.x, z - HANGING_GARDENS.z) < HANGING_GARDENS.tiers[0] + 2) continue;
    let table: readonly [TreeKind, number][];
    if (h < 1.05) {
      if (rng() < 0.55) continue; // areia: palmeiras esparsas
      table = [['palmeira', 1]];
    } else if (lakeEllipse(x, z) < 3.3) {
      table = [['palmeira', 0.42], ['frondosa', 0.4], ['bananeira', 0.18]];
    } else if (z > 140) {
      table = [['palmeira', 0.78], ['frondosa', 0.22]];
    } else if (z < -112) {
      table = [['cipreste', 0.44], ['frondosa', 0.56]];
    } else if (Math.hypot(x - MIRANTE.x, z - MIRANTE.z) < MIRANTE.radius) {
      table = [['frondosa', 0.6], ['cipreste', 0.26], ['palmeira', 0.14]];
    } else {
      table = [['frondosa', 0.58], ['palmeira', 0.22], ['cipreste', 0.2]];
    }
    plant(x, z, choose(table), randRange(rng, 3.4, 6.5));
  }

  // Jardins Suspensos: árvores floridas na borda de cada terraço.
  HANGING_GARDENS.tiers.forEach((tier, index) => {
    const count = [16, 10, 0][index];
    for (let k = 0; k < count; k++) {
      const a = ((k + 0.5) / count) * TAU + index * 0.3;
      const r = tier - HANGING_GARDENS.riserWidth - 1.6;
      const x = HANGING_GARDENS.x + Math.cos(a) * r;
      const z = HANGING_GARDENS.z + Math.sin(a) * r;
      if (!zones.isFree(x, z, 1.4, ZONE_BLOCKING | Zone.Bed) || !vegetation.isClear(x, z, 3)) continue;
      const cypress = k % 2 === 1;
      vegetation.addTree({
        kind: cypress ? 'cipreste' : 'frondosa',
        x,
        z,
        scale: cypress ? 0.8 : 0.72,
        rotation: rng() * TAU,
        color: new THREE.Color(cypress ? pick(rng, LEAF_GREENS) : BLOSSOM_COLORS[(k / 2 + index) % BLOSSOM_COLORS.length | 0]),
      });
    }
  });

  // Arbustos.
  for (let i = 0; i < 1150; i++) {
    const a = rng() * TAU;
    const r = Math.sqrt(randRange(rng, 48 * 48, 232 * 232));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!zones.isFree(x, z, 0.9, ZONE_BLOCKING | Zone.Bed | Zone.Sand)) continue;
    if (field.getHeight(x, z) < 1.1 || field.getSlope(x, z) > 0.3) continue;
    vegetation.addBush({ x, z, scale: randRange(rng, 0.8, 1.7), color: new THREE.Color(pick(rng, BUSH_GREENS)) });
  }
}

/** Mobiliário urbano, portais, colecionáveis e toda a vegetação de Aurora City. */
export function buildLandscape(ctx: CityContext, props: Props, beds: readonly GardenBed[]): void {
  buildPortals(ctx);
  buildStreets(ctx, props);
  placeCollectibles(ctx);
  plantBeds(ctx, beds);
  plantTrees(ctx);

  // Grama e flores silvestres em todo o solo livre.
  const zones = ctx.zones;
  const field = ctx.heightField;
  ctx.vegetation.scatterGround(
    (x, z, radius) => zones.isFree(x, z, radius, ZONE_BLOCKING | Zone.Bed | Zone.Sand) && field.getHeight(x, z) > 1.0,
    240,
    0.72,
  );
}
