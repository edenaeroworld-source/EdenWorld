/**
 * Prova visual do Marco J, sem navegador.
 *
 * Esta máquina não tem navegador nem WebGL. O que dá para fazer — e o
 * que este programa faz — é montar a região com o mesmo código do
 * jogo, pôr os personagens de pé com o mesmo sistema que o jogo usa, e
 * rasterizar os triângulos que saíram daquilo, à mão.
 *
 * Não é uma captura de tela. É a geometria real, desenhada por um
 * rasterizador caseiro. Se um personagem estiver enterrado, ele
 * aparece enterrado.
 *
 * Três imagens:
 *
 *  - `personagens-praca.png` — corte vertical da Praça Central com
 *    Aérion e o relevo: dá para ver o estrado, o terreno embaixo dele
 *    e onde ficam os pés.
 *  - `personagens-ponte.png` — o mesmo em Rosas Park, sobre uma ponte.
 *  - `personagens-rota.png` — planta de Aurora com o rastro de seis
 *    habitantes ao longo de dois minutos, e os obstáculos sólidos.
 *
 * Uso: npx tsx tools/personagens-render.ts docs/
 */

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import type { MaterialLibrary } from '../src/world/Materials';
import type { Vegetation } from '../src/world/Vegetation';

/*
 * O código da cidade pinta algumas texturas em canvas antes mesmo de
 * existir uma janela. Em Node não há `document`, então um de mentira
 * é instalado aqui — ele não desenha nada, só devolve objetos com a
 * forma certa. A geometria, que é o que estas imagens medem, não passa
 * por ele.
 *
 * Como `import` é içado para o topo do módulo, o resto das importações
 * tem de ser dinâmico: elas só podem rodar depois do remendo.
 */
installFakeDom();

const THREE = await import('three');
const { CharacterGround } = await import('../src/characters/CharacterGround');
const { createOfficialAvatar } = await import('../src/characters/CharacterModels');
const { PANTHEON } = await import('../src/characters/Pantheon');
const { getBlueprint } = await import('../src/cities');
const { PLAYER } = await import('../src/core/Config');
const { makeCitizen } = await import('../src/npc/CitizenData');
const { CitizenSim } = await import('../src/npc/CitizenSim');
const { buildAuroraWalkNetwork } = await import('../src/npc/WalkNetwork');
const { PhysicsWorld } = await import('../src/physics/PhysicsWorld');
const { createRng } = await import('../src/utils/math');
const { HeightField } = await import('../src/world/HeightField');
const { ZoneMap } = await import('../src/world/ZoneMap');

function installFakeDom(): void {
  const gradient = { addColorStop: () => {} };
  const context = new Proxy(
    {
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createConicGradient: () => gradient,
      createPattern: () => null,
      measureText: () => ({ width: 10 }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: Math.max(1, w), height: Math.max(1, h) }),
    } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : () => undefined), set: () => true },
  );
  const element = (): unknown => ({ width: 256, height: 256, style: {}, getContext: () => context, addEventListener: () => {}, removeEventListener: () => {}, appendChild: () => {}, setAttribute: () => {}, toDataURL: () => 'data:,' });
  const globals = globalThis as Record<string, unknown>;
  globals.document = { createElement: element, createElementNS: element, body: { appendChild: () => {}, style: {} }, addEventListener: () => {}, removeEventListener: () => {} };
  globals.window = globals.window ?? { devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {}, innerWidth: 1280, innerHeight: 820 };
  globals.HTMLCanvasElement = globals.HTMLCanvasElement ?? class {};
  globals.Image = globals.Image ?? class {};
  globals.self = globals.self ?? globals;
}

const WIDTH = 1280;
const HEIGHT = 820;

/* ------------------------------- PNG ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

function png(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.subarray(y * width * 3, (y + 1) * width * 3).forEach((value, i) => {
      raw[y * (width * 3 + 1) + 1 + i] = value;
    });
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ tela ---------------------------------- */

class Canvas {
  readonly pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  readonly depth = new Float32Array(WIDTH * HEIGHT).fill(Infinity);

  sky(top: [number, number, number], bottom: [number, number, number]): void {
    for (let y = 0; y < HEIGHT; y += 1) {
      const t = y / HEIGHT;
      for (let x = 0; x < WIDTH; x += 1) {
        const i = (y * WIDTH + x) * 3;
        this.pixels[i] = top[0] + (bottom[0] - top[0]) * t;
        this.pixels[i + 1] = top[1] + (bottom[1] - top[1]) * t;
        this.pixels[i + 2] = top[2] + (bottom[2] - top[2]) * t;
      }
    }
  }

  dot(sx: number, sy: number, radius: number, r: number, g: number, b: number): void {
    const x0 = Math.max(0, Math.floor(sx - radius));
    const x1 = Math.min(WIDTH - 1, Math.ceil(sx + radius));
    const y0 = Math.max(0, Math.floor(sy - radius));
    const y1 = Math.min(HEIGHT - 1, Math.ceil(sy + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (Math.hypot(x - sx, y - sy) > radius) continue;
        const i = (y * WIDTH + x) * 3;
        this.pixels[i] = r;
        this.pixels[i + 1] = g;
        this.pixels[i + 2] = b;
      }
    }
  }

  line(ax: number, ay: number, bx: number, by: number, r: number, g: number, b: number, width = 1): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.dot(ax + (bx - ax) * t, ay + (by - ay) * t, width, r, g, b);
    }
  }

  write(file: string): void {
    writeFileSync(file, png(WIDTH, HEIGHT, this.pixels));
  }
}

/* --------------------------- região montada ----------------------------- */

function stubMaterials(): MaterialLibrary {
  const cache = new Map<string, unknown>();
  const material = (name: string): THREE.Material => {
    // Cores que aproximam a paleta do jogo, só para a imagem não sair cinza.
    const tint: Record<string, number> = {
      glass: 0xaddff0,
      crystal: 0xbfeaff,
      white: 0xf2f7fb,
      aquaGlow: 0x5fd4ff,
      metal: 0xb9c6d2,
      stone: 0xcfd8de,
      wood: 0x9c7349,
      leaf: 0x4f9e5a,
      path: 0xd8cdb8,
    };
    const value = new THREE.MeshStandardMaterial({ name, color: tint[name] ?? 0xcdd6de });
    const uniforms = new Proxy({} as Record<string, { value: unknown }>, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = { value: null };
        return target[key];
      },
    });
    Object.assign(value, { uniforms, clone: () => material(name) });
    return value;
  };
  const handle = (width = 256, height = 256) => {
    const canvas = document.createElement('canvas') as HTMLCanvasElement;
    canvas.width = width;
    canvas.height = height;
    return {
      material: new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uTexture: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 1 } } }),
      texture: new THREE.CanvasTexture(canvas),
      redraw: () => {},
      dispose: () => {},
    };
  };
  const factories: Record<string, unknown> = { createHologram: handle, createPainted: handle, createCanvasTexture: () => new THREE.Texture() };
  return new Proxy({}, { get: (_t, key: string) => (key in factories ? factories[key] : (cache.get(key) ?? cache.set(key, material(key)).get(key))) }) as unknown as MaterialLibrary;
}

function stubVegetation(): Vegetation {
  return { isClear: () => true, addTree: () => {}, addBush: () => {}, addFlowerPatch: () => {}, scatterGround: () => {}, build: () => {}, setDensity: () => {}, updateVisibility: () => {}, dispose: () => {} } as unknown as Vegetation;
}

function buildRegion(regionId: string) {
  const blueprint = getBlueprint(regionId);
  if (!blueprint) throw new Error(`sem blueprint: ${regionId}`);
  const heightField = new HeightField(blueprint.terrainSize, 192, blueprint.height);
  const physics = new PhysicsWorld({ getHeight: (x, z) => heightField.getHeight(x, z), getSurface: (x, z) => heightField.getSurface(x, z) });
  physics.boundaryRadius = blueprint.boundaryRadius;
  const scene = blueprint.create({ materials: stubMaterials(), physics, heightField, zones: new ZoneMap(blueprint.terrainSize, 192), vegetation: stubVegetation() });
  const body = new CharacterGround({ physics, terrain: (x, z) => heightField.getHeight(x, z), radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight });
  return { blueprint, heightField, physics, scene, body };
}

/* ------------------------- corte vertical (elevação) -------------------- */

interface Figure {
  x: number;
  z: number;
  /** Altura dos pés depois da correção: o chão que a física devolve. */
  y: number;
  /** Altura dos pés antes: o relevo cru, que era o que o jogo usava. */
  before: number;
  label: string;
}

/**
 * Corte vertical em escala real, centrado em quem interessa.
 *
 * Em elevação não há como disfarçar altura: ou os pés tocam a linha do
 * piso, ou não tocam. Nada de exagero vertical aqui — um metro no eixo
 * de cima é o mesmo tanto de pixels que um metro no eixo deitado, senão
 * a imagem provaria o que ela mesma desenhou.
 *
 * Cada figura aparece duas vezes: em vermelho pálido onde ela ficava
 * antes (pés no relevo cru) e em tinta cheia onde ela fica agora (pés
 * no piso que a física devolve). Quando as duas coincidem, não havia
 * nada para consertar naquele ponto.
 */
function drawSection(canvas: Canvas, region: ReturnType<typeof buildRegion>, centre: { x: number; z: number }, dir: { x: number; z: number }, span: number, figures: Figure[]): void {
  const length = Math.hypot(dir.x, dir.z);
  const dirX = dir.x / length;
  const dirZ = dir.z / length;

  const distanceOf = (x: number, z: number): number => (x - centre.x) * dirX + (z - centre.z) * dirZ;

  // A janela vertical nasce do que há para mostrar, com folga para o
  // corpo inteiro mais um pouco de céu.
  let low = Infinity;
  let high = -Infinity;
  const samples = Math.ceil(span * 4);
  for (let i = 0; i <= samples; i += 1) {
    const distance = -span / 2 + (span * i) / samples;
    const x = centre.x + dirX * distance;
    const z = centre.z + dirZ * distance;
    low = Math.min(low, region.heightField.getHeight(x, z), region.body.settle(x, z));
    high = Math.max(high, region.heightField.getHeight(x, z), region.body.settle(x, z));
  }
  for (const figure of figures) {
    low = Math.min(low, figure.before, figure.y);
    high = Math.max(high, figure.y + 1.9, figure.before + 1.9);
  }
  low -= 0.6;
  high += 0.6;

  const scale = Math.min((WIDTH - 150) / span, (HEIGHT - 140) / (high - low));
  const originX = WIDTH / 2;
  const originY = HEIGHT / 2 + ((high - low) / 2) * scale;
  const project = (distance: number, y: number): [number, number] => [originX + distance * scale, originY - (y - low) * scale];

  canvas.sky([205, 229, 246], [240, 248, 252]);

  // Régua de um metro, para a escala ser conferível a olho.
  for (let metre = Math.ceil(low); metre <= high; metre += 1) {
    const [, y] = project(0, metre);
    const major = metre % 5 === 0;
    canvas.line(60, y, major ? 96 : 80, y, 120, 142, 160, 0.7);
    if (major) canvas.line(96, y, WIDTH - 40, y, 214, 226, 234, 0.5);
  }
  canvas.line(60, project(0, low)[1], 60, project(0, high)[1], 120, 142, 160, 0.7);

  // Relevo cru.
  let previous: [number, number] | null = null;
  for (let i = 0; i <= samples; i += 1) {
    const distance = -span / 2 + (span * i) / samples;
    const x = centre.x + dirX * distance;
    const z = centre.z + dirZ * distance;
    const point = project(distance, region.heightField.getHeight(x, z));
    if (previous) canvas.line(previous[0], previous[1], point[0], point[1], 150, 176, 122, 2.2);
    previous = point;
  }

  // Piso de verdade: o que a física devolve. Onde ele se descola do
  // relevo, há um estrado, um tablado ou uma ponte.
  previous = null;
  for (let i = 0; i <= samples; i += 1) {
    const distance = -span / 2 + (span * i) / samples;
    const x = centre.x + dirX * distance;
    const z = centre.z + dirZ * distance;
    const point = project(distance, region.body.settle(x, z));
    if (previous && Math.abs(previous[1] - point[1]) < 0.9 * scale) canvas.line(previous[0], previous[1], point[0], point[1], 32, 104, 162, 2.6);
    previous = point;
  }

  const figure = (distance: number, feet: number, body: [number, number, number], skin: [number, number, number]): void => {
    const [sx, sy] = project(distance, feet);
    const hip = project(distance, feet + 0.845)[1];
    const shoulder = project(distance, feet + 1.42)[1];
    const crown = project(distance, feet + 1.72)[1];
    canvas.line(sx - 0.11 * scale, sy, sx - 0.09 * scale, hip, body[0], body[1], body[2], 0.13 * scale);
    canvas.line(sx + 0.11 * scale, sy, sx + 0.09 * scale, hip, body[0], body[1], body[2], 0.13 * scale);
    canvas.line(sx, hip, sx, shoulder, body[0], body[1], body[2], 0.2 * scale);
    canvas.line(sx - 0.2 * scale, shoulder, sx - 0.24 * scale, hip + (shoulder - hip) * 0.25, body[0], body[1], body[2], 0.075 * scale);
    canvas.line(sx + 0.2 * scale, shoulder, sx + 0.24 * scale, hip + (shoulder - hip) * 0.25, body[0], body[1], body[2], 0.075 * scale);
    canvas.dot(sx, (shoulder + crown) / 2, 0.145 * scale, skin[0], skin[1], skin[2]);
    // Linha dos pés: a prova.
    canvas.line(sx - 0.9 * scale, sy, sx + 0.9 * scale, sy, body[0], body[1], body[2], 0.8);
  };

  for (const item of figures) {
    const distance = distanceOf(item.x, item.z);
    if (Math.abs(item.y - item.before) > 0.02) figure(distance - 1.5, item.before, [224, 150, 156], [238, 206, 198]);
    figure(distance + (Math.abs(item.y - item.before) > 0.02 ? 1.5 : 0), item.y, [38, 48, 70], [242, 208, 182]);
  }
}

/* ------------------------------ programa -------------------------------- */

const outDir = (process.argv[2] ?? 'docs').replace(/\/$/, '');

/* 1. Aurora: corte da Praça Central com o panteão que mora nela. */
{
  const aurora = buildRegion('aurora-city');
  const canvas = new Canvas();
  const characters = PANTHEON.filter((character) => Math.hypot(character.place.x, character.place.z) < 44).map((character) => {
    const y = aurora.body.settle(character.place.x, character.place.z);
    const terrain = aurora.heightField.getHeight(character.place.x, character.place.z);
    console.log(`  ${character.name}: terreno ${terrain.toFixed(2)} m, piso ${y.toFixed(2)} m, pés em ${y.toFixed(2)} m (antes: ${terrain.toFixed(2)} m, ${(y - terrain).toFixed(2)} m enterrado)`);
    return { x: character.place.x, z: character.place.z, y, before: terrain, label: character.name };
  });
  // Corte radial passando por Aérion: 26 m de praça, escala real.
  drawSection(canvas, aurora, { x: -16, z: 16 }, { x: -1, z: 1 }, 26, characters);
  canvas.write(`${outDir}/personagens-praca.png`);
  console.log(`${outDir}/personagens-praca.png — corte da Praça Central`);
}

/* 2. Rosas Park: corte sobre uma ponte, com habitantes em cima dela. */
{
  const rosas = buildRegion('rosas-park');
  const canvas = new Canvas();
  // Procura o ponto da região com a maior diferença entre relevo e piso:
  // é lá que o bug aparecia inteiro.
  let best = { x: 0, z: 0, gap: 0 };
  for (let x = -180; x <= 180; x += 2) {
    for (let z = -180; z <= 180; z += 2) {
      const terrain = rosas.heightField.getHeight(x, z);
      const gap = rosas.body.settle(x, z) - terrain;
      if (gap > best.gap) best = { x, z, gap };
    }
  }
  const y = rosas.body.settle(best.x, best.z);
  console.log(`  maior vão em Rosas: ${best.gap.toFixed(2)} m em (${best.x}, ${best.z}) — piso ${y.toFixed(2)} m`);
  drawSection(canvas, rosas, best, { x: 1, z: 1 }, 26, [{ x: best.x, z: best.z, y, before: rosas.heightField.getHeight(best.x, best.z), label: 'habitante' }]);
  canvas.write(`${outDir}/personagens-ponte.png`);
  console.log(`${outDir}/personagens-ponte.png — corte sobre a ponte de Rosas Park`);
}

/* 3. Aurora em planta: o rastro de seis habitantes em dois minutos. */
{
  const aurora = buildRegion('aurora-city');
  const canvas = new Canvas();
  canvas.sky([244, 248, 251], [228, 238, 245]);
  const extent = 210;
  const scale = (Math.min(WIDTH, HEIGHT) - 80) / (extent * 2);
  const toScreen = (x: number, z: number): [number, number] => [WIDTH / 2 + x * scale, HEIGHT / 2 + z * scale];

  // Obstáculos sólidos: o que os habitantes precisam contornar.
  for (const collider of aurora.physics.getColliders()) {
    if (collider.walkable || !collider.solid) continue;
    const any = collider as unknown as { x: number; z: number; radius?: number; halfX?: number; halfZ?: number };
    const size = any.radius ?? Math.max(any.halfX ?? 0, any.halfZ ?? 0);
    const [sx, sy] = toScreen(any.x, any.z);
    canvas.dot(sx, sy, Math.max(1.2, size * scale), 192, 174, 158);
  }

  const network = buildAuroraWalkNetwork({ blocked: () => false, edgeBlocked: (ax, az, bx, bz) => aurora.body.corridorBlocked(ax, az, bx, bz) });
  for (let i = 0; i < network.size; i += 1) {
    const a = network.node(i);
    for (const j of network.neighbors(i)) {
      if (j <= i) continue;
      const b = network.node(j);
      const [ax, ay] = toScreen(a.x, a.z);
      const [bx, by] = toScreen(b.x, b.z);
      canvas.line(ax, ay, bx, by, 176, 196, 212, 0.75);
    }
  }

  const palette: [number, number, number][] = [
    [204, 58, 72],
    [26, 118, 186],
    [36, 148, 96],
    [206, 128, 26],
    [138, 68, 184],
    [18, 148, 170],
  ];
  let index = 0;
  for (const seed of [1, 7, 23, 41, 53, 17]) {
    const sim = new CitizenSim(makeCitizen(seed), network, network.randomNode(createRng(seed)), createRng(seed * 977 + 31), {
      ground: (x, z) => aurora.heightField.getHeight(x, z),
      body: aurora.body,
    });
    const colour = palette[index % palette.length];
    let previous = toScreen(sim.x, sim.z);
    const start = previous;
    let travelled = 0;
    let lastX = sim.x;
    let lastZ = sim.z;
    for (let step = 0; step < 120 * 60; step += 1) {
      sim.update(1 / 60);
      travelled += Math.hypot(sim.x - lastX, sim.z - lastZ);
      lastX = sim.x;
      lastZ = sim.z;
      if (step % 6 !== 0) continue;
      const point = toScreen(sim.x, sim.z);
      canvas.line(previous[0], previous[1], point[0], point[1], colour[0], colour[1], colour[2], 1.5);
      previous = point;
    }
    canvas.dot(start[0], start[1], 4, 255, 255, 255);
    canvas.dot(start[0], start[1], 2.4, colour[0], colour[1], colour[2]);
    canvas.dot(previous[0], previous[1], 5, colour[0], colour[1], colour[2]);
    console.log(`  habitante ${seed}: andou ${travelled.toFixed(0)} m, terminou a ${Math.hypot(sim.x - 0, sim.z - 0).toFixed(0)} m do centro`);
    index += 1;
  }
  canvas.write(`${outDir}/personagens-rota.png`);
  console.log(`${outDir}/personagens-rota.png — rastro de seis habitantes em 2 minutos`);
}

/* 4. Conferência dos modelos oficiais. */
{
  for (const character of PANTHEON) {
    const avatar = createOfficialAvatar(character.id);
    if (!avatar) {
      console.log(`  ${character.id}: SEM MODELO OFICIAL`);
      continue;
    }
    console.log(`  ${character.name.padEnd(12)} altura ${avatar.appearance.height.toFixed(3)}  gestação ${avatar.gestation.toFixed(2)}  roupa ${avatar.appearance.outfit}`);
    avatar.dispose();
  }
}
