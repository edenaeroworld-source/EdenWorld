/**
 * Rosas Park em três dimensões.
 *
 * A segunda região do Éden a existir de verdade como lugar que se
 * caminha. Monta: cascatas luminosas, pavilhões de vidro, pontes,
 * jardins flutuantes, roseiral em terraços, bosques de sakura e mata
 * tropical, pontos de interesse e os pontos onde os bichos vivem.
 *
 * Cumpre o mesmo contrato de `AuroraCity` (`RegionScene`), então o
 * `World` hospeda qualquer uma das duas sem saber qual é.
 */

import * as THREE from 'three';
import type { Interactable } from '../../interactions/Interactable';
import type { PhysicsWorld } from '../../physics/PhysicsWorld';
import { TAU, createRng, randRange } from '../../utils/math';
import type { HeightField } from '../../world/HeightField';
import type { MaterialLibrary } from '../../world/Materials';
import type { Vegetation } from '../../world/Vegetation';
import { Zone, type ZoneMap } from '../../world/ZoneMap';
import { CityContext, type CityFrame, type CollectibleSpot, type JetEmitter, type LightSpot, type PortalStation, type SphereController, type WaterSoundSource } from '../aurora-city/CityContext';
import { annulus, box, cyl, disc, dome, lathe, sphere, torus } from '../aurora-city/Kit';
import { buildTravelStation } from '../shared/TravelStation';
import {
  BASIN,
  BRIDGES,
  CLIFF,
  FLOATING_GARDENS,
  GROVES,
  LAKE,
  LAKE_ISLAND,
  LANDMARKS,
  PATHS,
  PATH_WIDTH,
  PAVILIONS,
  ROSE_GARDEN,
  WATERFALLS,
  waterfallFoot,
  waterfallPosition,
} from './RosasLayout';
import { keepOutsFor, pushOutOfKeepOut } from '../../world/KeepOut';
import { roseBeds } from './RosasZones';

export interface RosasParkOptions {
  materials: MaterialLibrary;
  physics: PhysicsWorld;
  heightField: HeightField;
  zones: ZoneMap;
  vegetation: Vegetation;
}

/** Paleta da região: azul, ciano, verde e branco. */
const ROSE_PALETTE = [0xffc1d6, 0xff8fb8, 0xffe9f2, 0xf0588c, 0xffd9e6];
const SAKURA_LEAF = [0xffc8dd, 0xffd9e8, 0xf7b8d0];
const TROPICAL_LEAF = [0x3fae63, 0x2f9e5e, 0x58c47a, 0x1f8a52];

/**
 * Folga da placa de um marco até a borda de uma área proibida.
 *
 * Maior que o alcance do interativo (3 m) para que a pessoa consulte
 * a placa parada do lado de fora, sem encostar na barreira.
 */
const PLAQUE_STANDOFF = 3.4;

export class RosasPark {
  readonly id = 'rosas-park';
  readonly name = 'Rosas Park';
  readonly group: THREE.Group;
  private readonly context: CityContext;
  private detailScale = 1;

  constructor(options: RosasParkOptions) {
    const ctx = new CityContext(options);
    this.context = ctx;
    ctx.root.name = 'RosasPark';
    this.group = ctx.root;

    this.buildPaths(ctx);
    this.buildCliffAndFalls(ctx);
    this.buildRoseGarden(ctx);
    this.buildPavilions(ctx);
    this.buildBridges(ctx);
    this.buildFloatingGardens(ctx);
    this.buildLakeIsland(ctx);
    this.buildGroves(ctx);
    this.buildLandmarks(ctx);
    this.buildStation(ctx);
    this.buildAmbience(ctx);
    // Por último, depois de todo o cenário: o que for área proibida
    // desta região fica fechado. Vir por último garante que nenhuma
    // etapa posterior abra um buraco na barreira.
    ctx.sealKeepOuts(keepOutsFor(this.id));
  }

  /* ------------------------------ caminhos ----------------------------- */

  private buildPaths(ctx: CityContext): void {
    const batch = ctx.batch();
    const half = PATH_WIDTH * 0.5;
    for (const path of PATHS) {
      for (let i = 0; i < path.length - 1; i += 1) {
        const a = path[i];
        const b = path[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.01) continue;
        const angle = Math.atan2(dz, dx);
        // A calçada segue o terreno: um segmento curto por metro, para
        // acompanhar a subida dos terraços sem flutuar nem afundar.
        const steps = Math.max(1, Math.round(length / 2.5));
        for (let s = 0; s < steps; s += 1) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const mx = a.x + dx * (t0 + t1) * 0.5;
          const mz = a.z + dz * (t0 + t1) * 0.5;
          const y = ctx.ground(mx, mz);
          const segment = box(length / steps + 0.3, 0.16, PATH_WIDTH);
          const matrix = new THREE.Matrix4().makeRotationY(-angle).setPosition(mx, y + 0.08, mz);
          batch.add(segment, ctx.materials.sandstone, matrix);
        }
      }
      // Guias de luz nas bordas, espaçadas: acendem à noite.
      for (let i = 0; i < path.length; i += 1) {
        const point = path[i];
        const y = ctx.ground(point.x, point.z);
        ctx.lightSpots.push({ x: point.x, y: y + 0.6, z: point.z, radius: 7, color: 0x8fe6ff });
        const marker = cyl(0.12, 0.16, 0.7, 8);
        batch.add(marker, ctx.materials.crystal, new THREE.Matrix4().makeTranslation(point.x + half + 0.8, y + 0.35, point.z));
      }
    }
    ctx.commit(batch, 'rosas:caminhos', { castShadow: false });
  }

  /* --------------------------- paredão e quedas ------------------------- */

  private buildCliffAndFalls(ctx: CityContext): void {
    const batch = ctx.batch();

    for (const fall of WATERFALLS) {
      // A crista fica encosta acima; o pé, encosta abaixo. O relevo é
      // uma rampa caminhável — quem faz a cachoeira é o afloramento de
      // rocha construído aqui, não o terreno.
      const { x, z } = waterfallPosition(fall);
      const { x: footX, z: footZ } = waterfallFoot(fall);
      const foot = ctx.ground(footX, footZ);
      const crest = ctx.ground(x, z);
      const drop = Math.max(fall.drop, crest - foot + 2);

      // A lâmina d'água: um plano alto com o shader de cascata que a
      // região herda da biblioteca de materiais de Aurora.
      const sheet = box(fall.width, drop, 0.5);
      const facing = fall.angle + Math.PI;
      const matrix = new THREE.Matrix4().makeRotationY(-facing).setPosition(x + Math.cos(fall.angle) * 1.2, foot + drop * 0.5, z + Math.sin(fall.angle) * 1.2);
      batch.add(sheet, ctx.materials.waterfall, matrix);

      // Pedra atrás da queda, para a água não cair do nada.
      const backing = box(fall.width + 3, drop + 2, 2.4);
      batch.add(backing, ctx.materials.stone, new THREE.Matrix4().makeRotationY(-facing).setPosition(x - Math.cos(fall.angle) * 0.9, foot + drop * 0.5, z - Math.sin(fall.angle) * 0.9));

      // Espuma e névoa no pé: partículas e som.
      ctx.jets.push({ x: footX, y: foot + 0.4, z: footZ, vx: 0, vy: 2.6, vz: 0, spread: 0.85, count: Math.round(fall.width * 3), size: 0.3 });
      ctx.waterSounds.push({ x: footX, z: footZ, radius: 46, gain: 1 });
      // Luz noturna: é o que faz a queda ser "luminosa".
      ctx.lightSpots.push({ x: footX, y: foot + 1.6, z: footZ, radius: 22, color: fall.color });
      ctx.lightSpots.push({ x, y: foot + drop, z, radius: 14, color: fall.color });

      // Poça de espuma ao pé, em disco translúcido.
      const pool = disc(fall.width * 0.9, 0, 0.12, 24);
      batch.add(pool, ctx.materials.glass, new THREE.Matrix4().makeTranslation(footX, foot + 0.2, footZ));
    }

    // Afloramentos de pedra ao longo do arco, para o degrau parecer rocha.
    const rng = createRng(4412);
    for (let i = 0; i < 26; i += 1) {
      const angle = CLIFF.arcFrom + (CLIFF.arcTo - CLIFF.arcFrom) * (i / 25);
      const radius = CLIFF.crestRadius + randRange(rng, -4, 26);
      const x = CLIFF.x + Math.cos(angle) * radius;
      const z = CLIFF.z + Math.sin(angle) * radius;
      // Não colocar pedra em cima de uma queda.
      if (WATERFALLS.some((fall) => Math.abs(angle - fall.angle) < 0.14)) continue;
      const y = ctx.ground(x, z);
      const rock = sphere(randRange(rng, 1.6, 3.4), 7, 5);
      const matrix = new THREE.Matrix4().makeScale(1, randRange(rng, 0.5, 0.9), 1).setPosition(x, y - 0.4, z);
      batch.add(rock, ctx.materials.stone, matrix);
      ctx.physics.addCylinder({ x, z, radius: 1.9, yMin: y - 2, yMax: y + 1.6, walkable: false, tag: 'rosas:pedra' });
    }

    ctx.commit(batch, 'rosas:cascatas');
  }

  /* ------------------------------ roseiral ------------------------------ */

  private buildRoseGarden(ctx: CityContext): void {
    const batch = ctx.batch();
    const { x, z } = ROSE_GARDEN;

    // Muretas de contenção entre os terraços.
    for (const radius of ROSE_GARDEN.tiers) {
      const y = ctx.ground(x + radius, z);
      const wall = annulus(radius - 0.45, radius, y, y + 0.55, { segments: 56 });
      batch.add(wall, ctx.materials.sandstone, new THREE.Matrix4());
      void wall;
    }

    // Mirante central: piso de vidro sobre um pedestal.
    const coreY = ctx.ground(x, z);
    batch.add(disc(ROSE_GARDEN.coreRadius, coreY, coreY + 0.18, 48), ctx.materials.glass, new THREE.Matrix4().makeTranslation(x, 0, z));
    // O piso de vidro continua no lugar, visível e idêntico — mas sem
    // colisor caminhável. Ele era o convite: um chão em que dava para
    // pisar, no meio de uma estrutura em que ninguém deveria entrar.
    // Quem fecha a área agora é a barreira de `sealKeepOuts`.

    // Pérgula de arcos sobre o mirante: estrutura orgânica, sem quina.
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU;
      const arc = torus(ROSE_GARDEN.coreRadius - 1.2, 0.17, 7, 28, Math.PI);
      const matrix = new THREE.Matrix4().makeRotationY(angle).multiply(new THREE.Matrix4().makeRotationZ(Math.PI * 0.5)).setPosition(x, coreY + 0.2, z);
      batch.add(arc, ctx.materials.white, matrix);
    }
    ctx.lightSpots.push({ x, y: coreY + 4, z, radius: 26, color: 0xffd9e6 });

    // Canteiros: flores densas entre os anéis.
    for (const bed of roseBeds()) {
      const rings = 3;
      for (let r = 0; r < rings; r += 1) {
        const radius = bed.inner + ((bed.radius - bed.inner) * (r + 0.5)) / rings;
        const count = Math.max(8, Math.round(radius * 0.9));
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * TAU + r * 0.3;
          const fx = bed.x + Math.cos(angle) * radius;
          const fz = bed.z + Math.sin(angle) * radius;
          ctx.vegetation.addFlowerPatch({ x: fx, z: fz, radius: 1.6, density: 1.5, palette: ROSE_PALETTE, luminous: false });
        }
      }
    }

    ctx.commit(batch, 'rosas:roseiral', { castShadow: false });
  }

  /* ------------------------------ pavilhões ----------------------------- */

  private buildPavilions(ctx: CityContext): void {
    for (const pavilion of PAVILIONS) {
      const batch = ctx.batch();
      const base = ctx.ground(pavilion.x, pavilion.z);
      const { x, z, radius, height } = pavilion;
      const at = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number): void => {
        batch.add(geometry, material, new THREE.Matrix4().makeTranslation(x, y, z));
      };

      // Plataforma comum a todas.
      at(disc(radius + 2.4, base - 0.4, base + 0.22, 44), ctx.materials.sandstone, 0);

      if (pavilion.shape === 'estufa') {
        // Estufa: cúpula de vidro sobre anel de estrutura branca.
        at(annulus(radius - 0.3, radius, base, base + height * 0.42, { segments: 40 }), ctx.materials.white, 0);
        const cupola = dome(radius, 32, 14, 0.78);
        batch.add(cupola, ctx.materials.glass, new THREE.Matrix4().makeTranslation(x, base + height * 0.42, z));
        // Nervuras.
        for (let i = 0; i < 10; i += 1) {
          const arc = torus(radius * 0.98, 0.1, 6, 26, Math.PI);
          const matrix = new THREE.Matrix4().makeRotationY((i / 10) * Math.PI).multiply(new THREE.Matrix4().makeRotationZ(Math.PI * 0.5)).setPosition(x, base + height * 0.42, z);
          batch.add(arc, ctx.materials.white, matrix);
        }
      } else if (pavilion.shape === 'pavilhao') {
        // Pavilhão: vidro com telhado em pétala.
        at(annulus(radius - 0.25, radius, base, base + height * 0.62, { segments: 36 }), ctx.materials.glass, 0);
        const roof = lathe(
          [
            [radius + 1.6, 0],
            [radius * 0.72, height * 0.2],
            [radius * 0.3, height * 0.33],
            [0, height * 0.38],
          ],
          36,
        );
        batch.add(roof, ctx.materials.white, new THREE.Matrix4().makeTranslation(x, base + height * 0.62, z));
      } else if (pavilion.shape === 'abrigo') {
        // Abrigo do santuário: madeira e vidro, baixo e largo.
        at(annulus(radius - 0.4, radius, base, base + height * 0.5, { segments: 32 }), ctx.materials.wood, 0);
        const roof = lathe(
          [
            [radius + 2.2, 0],
            [radius * 0.6, height * 0.26],
            [0, height * 0.34],
          ],
          32,
        );
        batch.add(roof, ctx.materials.leaf, new THREE.Matrix4().makeTranslation(x, base + height * 0.5, z));
      } else if (pavilion.shape === 'casa') {
        // Casa: madeira clara, muita janela e um telhado leve de duas águas.
        at(annulus(radius - 0.35, radius, base, base + height * 0.56, { segments: 28 }), ctx.materials.wood, 0);
        at(annulus(radius - 0.45, radius - 0.1, base + height * 0.2, base + height * 0.48, { segments: 28 }), ctx.materials.glass, 0);
        const roof = lathe(
          [
            [radius + 1.5, 0],
            [radius * 0.55, height * 0.22],
            [0, height * 0.3],
          ],
          6,
        );
        batch.add(roof, ctx.materials.facade, new THREE.Matrix4().makeRotationY(Math.PI / 6).setPosition(x, base + height * 0.56, z));
        ctx.lightSpots.push({ x, y: base + height * 0.5, z, radius: 14, color: 0xffe9a6 });
      } else {
        // Torre-mirante: fuste de vidro e plataforma no alto.
        at(cyl(radius * 0.5, radius * 0.66, height, 24), ctx.materials.glass, base + height * 0.5);
        at(disc(radius, base + height, base + height + 0.3, 32), ctx.materials.white, 0);
        at(torus(radius - 0.2, 0.14, 6, 32), ctx.materials.metal, base + height + 1.1);
        ctx.lightSpots.push({ x, y: base + height + 1, z, radius: 30, color: 0x8fe6ff });
      }

      // Colisão: cilindro oco, com um vão na direção da porta.
      ctx.physics.addCylinder({
        x,
        z,
        radius: radius + 0.3,
        innerRadius: Math.max(0, radius - 1.2),
        yMin: base,
        yMax: base + height,
        walkable: false,
        tag: `rosas:${pavilion.id}`,
      });
      // Piso interno andável (o pátio sob a cúpula).
      ctx.physics.addCylinder({ x, z, radius: radius + 2.4, yMin: base - 0.4, yMax: base + 0.22, walkable: true, solid: false, blocksCamera: false, surface: 'stone', tag: `rosas:piso:${pavilion.id}` });

      // Porta: o interativo que abre o interior, quando há um.
      const doorX = x + Math.cos(pavilion.doorAngle) * (radius + 1.4);
      const doorZ = z + Math.sin(pavilion.doorAngle) * (radius + 1.4);
      if (pavilion.interiorId) {
        ctx.addInteractable({
          id: `porta:${pavilion.id}`,
          name: pavilion.name,
          action: 'Entrar',
          x: doorX,
          y: base + 1,
          z: doorZ,
          range: 3.2,
          payload: {
            type: 'porta',
            interiorId: pavilion.interiorId,
            exit: { regionId: 'rosas-park', x: doorX, z: doorZ, heading: pavilion.doorAngle },
          },
        });
        // Marca a soleira, para a porta ser visível.
        const sill = box(3.4, 0.1, 1.6);
        batch.add(sill, ctx.materials.crystal, new THREE.Matrix4().makeRotationY(-pavilion.doorAngle).setPosition(doorX, base + 0.3, doorZ));
        ctx.lightSpots.push({ x: doorX, y: base + 1.2, z: doorZ, radius: 8, color: 0xa6ffe4 });
      }

      ctx.reserve(x, z, radius + 5);
      ctx.commit(batch, `rosas:${pavilion.id}`);
    }
  }

  /* -------------------------------- pontes ------------------------------ */

  private buildBridges(ctx: CityContext): void {
    const batch = ctx.batch();
    for (const bridge of BRIDGES) {
      const dx = bridge.to.x - bridge.from.x;
      const dz = bridge.to.z - bridge.from.z;
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      const yFrom = Math.max(0.4, ctx.ground(bridge.from.x, bridge.from.z));
      const yTo = Math.max(0.4, ctx.ground(bridge.to.x, bridge.to.z));
      const material = bridge.style === 'vidro' ? ctx.materials.glass : ctx.materials.wood;

      const steps = Math.max(4, Math.round(length / 1.6));
      for (let i = 0; i < steps; i += 1) {
        const t = (i + 0.5) / steps;
        const px = bridge.from.x + dx * t;
        const pz = bridge.from.z + dz * t;
        // Arco: sobe no meio do vão e volta nas pontas.
        const y = yFrom + (yTo - yFrom) * t + Math.sin(t * Math.PI) * bridge.arch + 0.55;
        const plank = box(length / steps + 0.12, 0.18, bridge.width);
        batch.add(plank, material, new THREE.Matrix4().makeRotationY(-angle).setPosition(px, y, pz));
        // Colisão por trecho: o jogador anda sobre o arco, não atravessa.
        ctx.physics.addBox({
          x: px,
          z: pz,
          halfX: length / steps / 2 + 0.1,
          halfZ: bridge.width / 2,
          rotation: -angle,
          yMin: y - 0.2,
          yMax: y + 0.1,
          walkable: true,
          solid: false,
          blocksCamera: false,
          surface: bridge.style === 'vidro' ? 'stone' : 'wood',
          topAt: () => y + 0.1,
          tag: `ponte:${bridge.id}`,
        });
      }

      // Guarda-corpo.
      for (const side of [-1, 1]) {
        for (let i = 0; i <= steps; i += 2) {
          const t = i / steps;
          const px = bridge.from.x + dx * t - Math.sin(angle) * side * bridge.width * 0.5;
          const pz = bridge.from.z + dz * t + Math.cos(angle) * side * bridge.width * 0.5;
          const y = yFrom + (yTo - yFrom) * t + Math.sin(t * Math.PI) * bridge.arch + 0.55;
          batch.add(cyl(0.07, 0.07, 1.0, 6), ctx.materials.metal, new THREE.Matrix4().makeTranslation(px, y + 0.5, pz));
        }
      }
      ctx.waterSounds.push({ x: (bridge.from.x + bridge.to.x) / 2, z: (bridge.from.z + bridge.to.z) / 2, radius: 20, gain: 0.35 });
    }
    ctx.commit(batch, 'rosas:pontes');
  }

  /* -------------------------- jardins flutuantes ------------------------ */

  private buildFloatingGardens(ctx: CityContext): void {
    for (const garden of FLOATING_GARDENS) {
      const batch = ctx.batch();
      const baseY = ctx.ground(garden.x, garden.z) + garden.height;
      const group = new THREE.Group();
      group.name = `rosas:flutuante:${garden.id}`;

      // Casco: disco de vidro por baixo, terra por cima.
      batch.add(lathe([[garden.radius, 0], [garden.radius * 0.8, -1.1], [garden.radius * 0.34, -2.1], [0, -2.5]], 30), ctx.materials.glass, new THREE.Matrix4());
      batch.add(disc(garden.radius, 0, 0.42, 34), ctx.materials.soil, new THREE.Matrix4());
      batch.add(annulus(garden.radius - 0.3, garden.radius + 0.1, 0.3, 0.95, { segments: 34 }), ctx.materials.white, new THREE.Matrix4());

      // Vegetação luminosa em cima — é um jardim, afinal.
      const rng = createRng(garden.id.length * 977 + 31);
      for (let i = 0; i < 14; i += 1) {
        const angle = rng() * TAU;
        const r = Math.sqrt(rng()) * (garden.radius - 1.4);
        const bush = sphere(randRange(rng, 0.5, 1.0), 8, 6);
        batch.add(bush, ctx.materials.bush, new THREE.Matrix4().makeTranslation(Math.cos(angle) * r, 0.75, Math.sin(angle) * r));
      }

      const built = batch.build(`rosas:flutuante:${garden.id}`, { castShadow: true, receiveShadow: true });
      group.add(built);
      group.position.set(garden.x, baseY, garden.z);
      ctx.root.add(group);

      // Colisão: topo andável que acompanha a flutuação.
      let currentTop = baseY + 0.42;
      ctx.physics.addCylinder({
        x: garden.x,
        z: garden.z,
        radius: garden.radius,
        yMin: baseY - 2.5,
        yMax: baseY + 0.42,
        walkable: true,
        solid: false,
        blocksCamera: false,
        surface: 'grass',
        tag: `flutuante:${garden.id}`,
      });

      // Sobe e desce devagar.
      ctx.animate((frame: CityFrame) => {
        const offset = Math.sin((frame.elapsed / garden.period) * TAU) * garden.bob;
        group.position.y = baseY + offset;
        currentTop = baseY + offset + 0.42;
        void currentTop;
      });

      ctx.lightSpots.push({ x: garden.x, y: baseY - 1, z: garden.z, radius: 16, color: 0xa6ffe4 });
      ctx.addDetailGroup(group, garden.x, garden.z, 150);
    }
  }

  /* ----------------------------- ilha do lago --------------------------- */

  private buildLakeIsland(ctx: CityContext): void {
    const batch = ctx.batch();
    const { x, z, radius } = LAKE_ISLAND;
    const y = ctx.ground(x, z);

    // Um caramanchão de vidro no meio da ilha.
    batch.add(disc(radius * 0.45, y, y + 0.2, 24), ctx.materials.sandstone, new THREE.Matrix4().makeTranslation(x, 0, z));
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * TAU;
      batch.add(cyl(0.12, 0.14, 3.2, 8), ctx.materials.white, new THREE.Matrix4().makeTranslation(x + Math.cos(angle) * radius * 0.4, y + 1.6, z + Math.sin(angle) * radius * 0.4));
    }
    batch.add(dome(radius * 0.5, 22, 10, 0.5), ctx.materials.glass, new THREE.Matrix4().makeTranslation(x, y + 3.2, z));
    ctx.lightSpots.push({ x, y: y + 3.4, z, radius: 20, color: 0xbfe9ff });
    ctx.waterSounds.push({ x, z, radius: 52, gain: 0.5 });

    // Árvores da ilha.
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * TAU + 0.6;
      const tx = x + Math.cos(angle) * (radius - 3);
      const tz = z + Math.sin(angle) * (radius - 3);
      ctx.vegetation.addTree({ kind: 'frondosa', x: tx, z: tz, scale: 0.9, rotation: angle, color: new THREE.Color(SAKURA_LEAF[i % SAKURA_LEAF.length]) });
    }
    ctx.reserve(x, z, radius * 0.6);
    ctx.commit(batch, 'rosas:ilha');
  }

  /* -------------------------------- bosques ----------------------------- */

  private buildGroves(ctx: CityContext): void {
    const rng = createRng(90210);
    for (const grove of GROVES) {
      const area = Math.PI * grove.radius * grove.radius;
      const count = Math.round(area * grove.density * 0.014);
      for (let i = 0; i < count; i += 1) {
        const angle = rng() * TAU;
        const r = Math.sqrt(rng()) * grove.radius;
        const x = grove.x + Math.cos(angle) * r;
        const z = grove.z + Math.sin(angle) * r;
        if (!ctx.zones.isFree(x, z, 1.6)) continue;
        if (ctx.ground(x, z) < 0.6) continue;

        if (grove.kind === 'sakura' || (grove.kind === 'mista' && rng() < 0.5)) {
          ctx.vegetation.addTree({
            kind: 'frondosa',
            x,
            z,
            scale: randRange(rng, 0.75, 1.25),
            rotation: rng() * TAU,
            color: new THREE.Color(SAKURA_LEAF[Math.floor(rng() * SAKURA_LEAF.length)]),
          });
          // Pétalas caídas ao pé das sakuras.
          if (rng() < 0.5) ctx.vegetation.addFlowerPatch({ x, z, radius: 2.6, density: 0.5, palette: SAKURA_LEAF, luminous: false });
        } else {
          const kind = rng() < 0.45 ? 'palmeira' : rng() < 0.7 ? 'bananeira' : 'frondosa';
          ctx.vegetation.addTree({
            kind,
            x,
            z,
            scale: randRange(rng, 0.85, 1.45),
            rotation: rng() * TAU,
            color: new THREE.Color(TROPICAL_LEAF[Math.floor(rng() * TROPICAL_LEAF.length)]),
          });
        }
        // Arbustos entre as árvores.
        if (rng() < 0.6) {
          ctx.vegetation.addBush({ x: x + randRange(rng, -3, 3), z: z + randRange(rng, -3, 3), scale: randRange(rng, 0.6, 1.2), color: new THREE.Color(TROPICAL_LEAF[Math.floor(rng() * TROPICAL_LEAF.length)]) });
        }
      }
      // Flores silvestres pelo bosque.
      ctx.vegetation.addFlowerPatch({
        x: grove.x,
        z: grove.z,
        radius: grove.radius * 0.8,
        density: 0.06,
        palette: grove.kind === 'sakura' ? SAKURA_LEAF : [0xffe9a6, 0xa6ffe4, 0xffc1d6],
        luminous: false,
      });
    }
  }

  /* ---------------------------- pontos de parada ------------------------ */

  private buildLandmarks(ctx: CityContext): void {
    const batch = ctx.batch();
    const forbidden = keepOutsFor(this.id);
    for (const landmark of LANDMARKS) {
      // Uma placa dentro de uma área proibida seria uma placa que
      // ninguém pode ler: o alcance do interativo é 3 m e a barreira
      // fica bem antes disso. Ela vai para a borda de fora da
      // estrutura, que é de onde a pessoa a olha de qualquer forma.
      // A regra é geral — vale para o Coração do Roseiral hoje e para
      // qualquer marco que caia dentro de uma zona amanhã.
      const spot = pushOutOfKeepOut(forbidden, landmark.x, landmark.z, PLAQUE_STANDOFF);
      const { x: markX, z: markZ } = spot;
      const y = ctx.ground(markX, markZ);

      // Placa: um cristal inclinado sobre um pedestal.
      const pedestal = cyl(0.3, 0.42, 0.9, 10);
      batch.add(pedestal, ctx.materials.sandstone, new THREE.Matrix4().makeTranslation(markX, y + 0.45, markZ));
      const shard = sphere(landmark.hidden ? 0.46 : 0.36, 10, 8);
      batch.add(shard, ctx.materials.crystal, new THREE.Matrix4().makeScale(1, 1.5, 0.5).setPosition(markX, y + 1.35, markZ));

      ctx.lightSpots.push({ x: markX, y: y + 1.4, z: markZ, radius: landmark.hidden ? 12 : 8, color: landmark.hidden ? 0xa6ffe4 : 0xffe9a6 });

      ctx.addInteractable({
        id: `marco:${landmark.id}`,
        name: landmark.name,
        action: 'Observar',
        x: markX,
        y: y + 1,
        z: markZ,
        range: 3,
        payload: {
          type: 'placa',
          title: landmark.name,
          paragraphs: [landmark.note],
          entryId: `rosas:${landmark.id}`,
        },
      });

      // Os escondidos também contam como colecionável: achar é o prêmio.
      if (landmark.hidden) {
        ctx.collectibles.push({ id: `rosas-${landmark.id}`, x: markX, y: y + 1.9, z: markZ, hint: landmark.note });
      }
      ctx.reserve(markX, markZ, 2.4);
    }
    ctx.commit(batch, 'rosas:marcos');
  }

  /* ------------------------------- ambiente ----------------------------- */

  /**
   * Estação do Éden, ao lado do portão.
   *
   * Fica onde o jogador chega e por onde ele sai: quem entra no parque
   * passa por ela antes de qualquer outra coisa, e quem quer ir embora
   * não precisa procurar.
   */
  private buildStation(ctx: CityContext): void {
    buildTravelStation(ctx, { id: 'estacao-rosas', name: 'Estação do Éden · Rosas Park', x: 8, z: 104, color: 0xb9f5c4 });
  }

  private buildAmbience(ctx: CityContext): void {
    // Som e bolhas do lago e da lagoa.
    ctx.waterSounds.push({ x: LAKE.x, z: LAKE.z, radius: 70, gain: 0.55 });
    ctx.waterSounds.push({ x: BASIN.x, z: BASIN.z, radius: 48, gain: 0.7 });

    // Grama onde houver espaço livre e terra seca.
    ctx.vegetation.scatterGround((x, z) => ctx.zones.isFree(x, z, 0.5) && ctx.ground(x, z) > 0.55 && (ctx.zones.flags(x, z) & Zone.Water) === 0, 170, 0.1);
  }

  /* -------------------------------- contrato ---------------------------- */

  get interactables(): readonly Interactable[] {
    return this.context.interactables;
  }

  get portals(): readonly PortalStation[] {
    return this.context.portals;
  }

  get collectibles(): readonly CollectibleSpot[] {
    return this.context.collectibles;
  }

  get jets(): readonly JetEmitter[] {
    return this.context.jets;
  }

  get waterSounds(): readonly WaterSoundSource[] {
    return this.context.waterSounds;
  }

  get lightSpots(): readonly LightSpot[] {
    return this.context.lightSpots;
  }

  get sphere(): SphereController | null {
    return null;
  }

  setDetailScale(scale: number): void {
    this.detailScale = scale;
  }

  update(frame: CityFrame): void {
    for (const animator of this.context.animators) animator(frame);
    const { x, z } = frame.cameraPosition;
    for (const detail of this.context.detailGroups) {
      detail.group.visible = Math.hypot(detail.x - x, detail.z - z) < detail.distance * this.detailScale;
    }
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose();
    });
    for (const geometry of geometries) geometry.dispose();
    for (const item of this.context.disposables) item.dispose();
    this.group.clear();
    this.group.removeFromParent();
  }
}
