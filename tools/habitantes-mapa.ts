/**
 * Onde está a população de Aurora City, vista de cima.
 *
 * Esta máquina não tem navegador nem WebGL, então **não há captura de
 * tela do jogo**. O que este programa faz é montar a cidade com o
 * mesmo código que o jogo usa — relevo, física, vegetação, rede de
 * caminhada —, rodar a mesma simulação de habitantes e desenhar à mão
 * onde cada um está. Os pontos são posições de verdade, não ilustração.
 *
 * Duas imagens:
 *
 *  - `habitantes-aurora.png` — a cidade inteira depois de doze minutos
 *    de simulação, com os 54 habitantes e o rastro de seis deles.
 *  - `habitantes-praca.png` — o anel da Praça Central de perto: os oito
 *    canteiros, os pontos de passagem que caíam dentro deles (vermelho)
 *    e para onde foram (verde), e onde parava quem era mandado para lá.
 *
 * Uso: npx tsx tools/habitantes-mapa.ts docs/
 */

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import type { MaterialLibrary } from '../src/world/Materials';

/*
 * O DOM falso tem de existir **antes** de importar qualquer coisa de
 * `src/cities`: a decoração de Aurora desenha num canvas já na hora de
 * montar. Daí os imports dinâmicos lá embaixo.
 */
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

installFakeDom();

const THREE = await import('three');
const { CharacterGround } = await import('../src/characters/CharacterGround');
const { getBlueprint } = await import('../src/cities');
const { AVENUES, BUILDINGS, PLAZA, RING } = await import('../src/cities/aurora-city/Layout');
const { PLAYER, WORLD } = await import('../src/core/Config');
const { makeCitizen } = await import('../src/npc/CitizenData');
const { CitizenSim } = await import('../src/npc/CitizenSim');
const { NpcSystem } = await import('../src/npc/NpcSystem');
const { buildAuroraWalkNetwork, WalkNetwork } = await import('../src/npc/WalkNetwork');
const { PhysicsWorld } = await import('../src/physics/PhysicsWorld');
const { QualitySystem, defaultGraphicsSettings } = await import('../src/systems/QualitySystem');
const { createRng } = await import('../src/utils/math');
const { HeightField } = await import('../src/world/HeightField');
const { Vegetation } = await import('../src/world/Vegetation');
const { WorldClock } = await import('../src/world/WorldClock');
const { Zone, ZoneMap } = await import('../src/world/ZoneMap');

/* -------------------------------- PNG --------------------------------- */

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

type Rgb = [number, number, number];

/** Planta vista de cima, com escala em metros. */
class Map2D {
  readonly pixels: Uint8Array;

  constructor(
    readonly size: number,
    readonly extent: number,
    readonly centreX = 0,
    readonly centreZ = 0,
    background: Rgb = [12, 18, 30],
  ) {
    this.pixels = new Uint8Array(size * size * 3);
    for (let i = 0; i < size * size; i += 1) {
      this.pixels[i * 3] = background[0];
      this.pixels[i * 3 + 1] = background[1];
      this.pixels[i * 3 + 2] = background[2];
    }
  }

  px(x: number): number {
    return ((x - this.centreX) / this.extent + 1) * (this.size / 2);
  }

  py(z: number): number {
    return ((z - this.centreZ) / this.extent + 1) * (this.size / 2);
  }

  /** Metros por pixel, para converter raios. */
  get scale(): number {
    return this.size / 2 / this.extent;
  }

  set(px: number, py: number, c: Rgb, alpha = 1): void {
    const x = Math.round(px);
    const y = Math.round(py);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 3;
    this.pixels[i] = this.pixels[i] * (1 - alpha) + c[0] * alpha;
    this.pixels[i + 1] = this.pixels[i + 1] * (1 - alpha) + c[1] * alpha;
    this.pixels[i + 2] = this.pixels[i + 2] * (1 - alpha) + c[2] * alpha;
  }

  /** Disco em metros do mundo. */
  disc(x: number, z: number, radius: number, c: Rgb, alpha = 1): void {
    const r = Math.max(0.6, radius * this.scale);
    const cx = this.px(x);
    const cy = this.py(z);
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx += 1) {
        if (dx * dx + dy * dy > r * r) continue;
        this.set(cx + dx, cy + dy, c, alpha);
      }
    }
  }

  ring(x: number, z: number, radius: number, c: Rgb, thickness = 1.2, alpha = 1): void {
    const r = radius * this.scale;
    const t = Math.max(0.8, thickness * this.scale);
    const cx = this.px(x);
    const cy = this.py(z);
    const steps = Math.max(32, Math.ceil(r * 8));
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      for (let k = -t; k <= t; k += 0.5) {
        this.set(cx + Math.cos(a) * (r + k), cy + Math.sin(a) * (r + k), c, alpha);
      }
    }
  }

  segment(ax: number, az: number, bx: number, bz: number, c: Rgb, width = 1, alpha = 1): void {
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) * this.scale * 2));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.disc(ax + (bx - ax) * t, az + (bz - az) * t, width, c, alpha);
    }
  }

  write(file: string): void {
    writeFileSync(file, png(this.size, this.size, this.pixels));
  }
}

/* ------------------------- texto de 5×7 pixels ------------------------- */

const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
  F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10011', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '01110', '00001', '00001', '10001', '01110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
  '.': ['00', '00', '00', '00', '00', '00', '11'],
  ',': ['00', '00', '00', '00', '00', '11', '10'],
  ':': ['00', '11', '11', '00', '00', '11', '11'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '(': ['01', '10', '10', '10', '10', '10', '01'],
  ')': ['10', '01', '01', '01', '01', '01', '10'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
};

/** Faixa escura atrás do texto, para a legenda não sumir no desenho. */
function banner(map: Map2D, y0: number, y1: number): void {
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < map.size; x += 1) map.set(x, y, [8, 11, 18], 0.82);
  }
}

/** Escreve em pixels de tela (não em metros). */
function text(map: Map2D, sx: number, sy: number, value: string, c: Rgb, scale = 2): void {
  let x = sx;
  for (const raw of value.toUpperCase()) {
    const glyph = GLYPHS[raw] ?? GLYPHS[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== '1') continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) map.set(x + col * scale + dx, sy + row * scale + dy, c);
        }
      }
    }
    x += (glyph[0].length + 1) * scale;
  }
}

/* --------------------------- cidade montada ---------------------------- */

function stubMaterials(): MaterialLibrary {
  const cache = new Map<string, unknown>();
  const material = (name: string): THREE.Material => {
    const value = new THREE.MeshStandardMaterial({ name });
    const uniforms = new Proxy({} as Record<string, { value: unknown }>, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = { value: null };
        return target[key];
      },
    });
    Object.assign(value, { uniforms, clone: () => material(name) });
    return value;
  };
  const handle = () => ({
    material: new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uTexture: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 1 } } }),
    // A decoração de Aurora desenha as placas nesta textura, então ela
    // precisa de um canvas de verdade por baixo — o do DOM falso serve.
    texture: new THREE.CanvasTexture(document.createElement('canvas')),
    redraw: () => {},
    dispose: () => {},
  });
  const factories: Record<string, unknown> = { createHologram: handle, createPainted: handle, createCanvasTexture: () => new THREE.Texture() };
  return new Proxy({}, { get: (_t, key: string) => (key in factories ? factories[key] : (cache.get(key) ?? cache.set(key, material(key)).get(key))) }) as unknown as MaterialLibrary;
}

function buildAurora() {
  const blueprint = getBlueprint('aurora-city');
  if (!blueprint) throw new Error('sem planta de Aurora City');
  const heightField = new HeightField(blueprint.terrainSize, 192, blueprint.height);
  const zones = new ZoneMap(blueprint.terrainSize, 192);
  const physics = new PhysicsWorld({ getHeight: (x, z) => heightField.getHeight(x, z), getSurface: (x, z) => heightField.getSurface(x, z) });
  physics.boundaryRadius = blueprint.boundaryRadius;
  const materials = stubMaterials();
  const vegetation = new Vegetation({ materials, heightField, physics });
  blueprint.create({ materials, physics, heightField, zones, vegetation });
  vegetation.build();
  const body = new CharacterGround({ physics, terrain: (x, z) => heightField.getHeight(x, z), radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight });
  const boundaryRadius = blueprint.boundaryRadius;
  return {
    body,
    heightField,
    physics,
    ground: (x: number, z: number) => heightField.getHeight(x, z),
    blocked: (x: number, z: number) => {
      if (Math.hypot(x, z) > boundaryRadius - 8) return true;
      if (heightField.getHeight(x, z) < WORLD.waterLevel + 0.35) return true;
      return zones.has(x, z, Zone.Water | Zone.Building);
    },
  };
}

/** Os oito canteiros de 2,4 m do anel da Praça Central. */
const PLANTERS = Array.from({ length: 8 }, (_, k) => {
  const angle = Math.PI / 8 + (k * Math.PI) / 4;
  return { x: Math.cos(angle) * 37, z: Math.sin(angle) * 37 };
});

const WATER: Rgb = [18, 38, 64];
const LAND: Rgb = [30, 46, 44];
const PAVING: Rgb = [58, 72, 92];
const LOT: Rgb = [74, 70, 96];
const PERSON: Rgb = [120, 240, 200];
const TRAIL: Rgb = [70, 150, 190];
const BAD: Rgb = [236, 88, 110];
const GOOD: Rgb = [122, 235, 150];
const PLANTER: Rgb = [196, 142, 96];
const INK: Rgb = [226, 238, 248];

/* ------------------------------ imagem 1 ------------------------------- */

function cityMap(region: ReturnType<typeof buildAurora>, people: readonly { x: number; z: number }[], trails: { x: number; z: number }[][], file: string, title: string): void {
  const map = new Map2D(1100, 250, 0, 0, [10, 14, 24]);

  // Relevo: água, terra e platô.
  for (let py = 0; py < map.size; py += 1) {
    for (let px = 0; px < map.size; px += 1) {
      const x = ((px / map.size) * 2 - 1) * map.extent;
      const z = ((py / map.size) * 2 - 1) * map.extent;
      const h = region.heightField.getHeight(x, z);
      if (h < WORLD.waterLevel) {
        map.set(px, py, WATER);
        continue;
      }
      const shade = Math.min(1, Math.max(0, h / 26));
      map.set(px, py, [LAND[0] + shade * 46, LAND[1] + shade * 44, LAND[2] + shade * 40]);
    }
  }

  map.disc(0, 0, PLAZA.radius, PAVING, 0.55);
  map.ring(0, 0, RING.radius, PAVING, RING.width / 2, 0.8);
  for (const avenue of AVENUES) {
    map.segment(Math.cos(avenue.angle) * avenue.from, Math.sin(avenue.angle) * avenue.from, Math.cos(avenue.angle) * avenue.to, Math.sin(avenue.angle) * avenue.to, PAVING, 3.2, 0.75);
  }
  for (const lot of BUILDINGS) map.disc(lot.x, lot.z, lot.radius, LOT, 0.85);
  for (const planter of PLANTERS) map.disc(planter.x, planter.z, 2.4, PLANTER, 0.9);

  for (const trail of trails) {
    for (const point of trail) map.disc(point.x, point.z, 0.9, TRAIL, 0.5);
  }
  for (const person of people) {
    map.disc(person.x, person.z, 2.6, [10, 20, 26], 0.9);
    map.disc(person.x, person.z, 1.8, PERSON);
  }

  banner(map, 0, 100);
  banner(map, map.size - 52, map.size);
  text(map, 24, 22, title, INK, 3);
  text(map, 24, 56, 'PONTOS VERDES: UMA PESSOA. RASTRO AZUL: SEIS DELAS AO LONGO DA SIMULACAO.', INK, 2);
  text(map, 24, 78, 'DISCOS LARANJA: OS 8 CANTEIROS DO ANEL DA PRACA, ONDE A MULTIDAO SE FORMAVA.', INK, 2);
  text(map, 24, map.size - 40, 'GEOMETRIA E SIMULACAO REAIS, RASTERIZADAS FORA DA TELA - NAO E CAPTURA DO JOGO.', [150, 170, 190], 2);
  map.write(file);
}

/* ------------------------------ imagem 2 ------------------------------- */

function plazaMap(
  region: ReturnType<typeof buildAurora>,
  antes: InstanceType<typeof WalkNetwork>,
  depois: InstanceType<typeof WalkNetwork>,
  pinned: { x: number; z: number }[],
  file: string,
): void {
  const map = new Map2D(1100, 48, 0, 0, [14, 20, 30]);
  map.disc(0, 0, PLAZA.radius, PAVING, 0.5);
  map.ring(0, 0, 35.88, [86, 104, 128], 0.35, 0.9);

  for (const planter of PLANTERS) {
    map.disc(planter.x, planter.z, 2.4, PLANTER, 0.95);
    // A borda que o corpo não atravessa: raio do canteiro + raio do corpo.
    map.ring(planter.x, planter.z, 2.4 + PLAYER.radius, [120, 86, 60], 0.12, 0.9);
  }

  // Ligações da rede corrigida.
  for (const node of depois.nodes) {
    if (Math.hypot(node.x, node.z) > 46) continue;
    for (const other of depois.neighbors(node.id)) {
      if (other <= node.id) continue;
      const b = depois.node(other);
      map.segment(node.x, node.z, b.x, b.z, [52, 86, 72], 0.14, 0.8);
    }
  }

  for (const node of antes.nodes) {
    if (Math.hypot(node.x, node.z) > 46) continue;
    const inside = PLANTERS.some((planter) => Math.hypot(node.x - planter.x, node.z - planter.z) < 2.4 + PLAYER.radius);
    map.disc(node.x, node.z, inside ? 0.75 : 0.4, inside ? BAD : [90, 100, 118], inside ? 1 : 0.7);
  }
  for (const node of depois.nodes) {
    if (Math.hypot(node.x, node.z) > 46) continue;
    map.disc(node.x, node.z, 0.5, GOOD, 0.95);
  }
  for (const spot of pinned) map.disc(spot.x, spot.z, 0.65, [250, 196, 90]);

  banner(map, 0, 144);
  banner(map, map.size - 52, map.size);
  text(map, 24, 22, 'ANEL DA PRACA CENTRAL - DE PERTO', INK, 3);
  text(map, 24, 56, 'LARANJA: CANTEIRO DE 2.4 M COM A ARVORE. LINHA FINA: ATE ONDE O CORPO CHEGA.', INK, 2);
  text(map, 24, 78, 'VERMELHO: PONTO DE PASSAGEM QUE CAIA DENTRO DO CANTEIRO (INALCANCAVEL A PE).', BAD, 2);
  text(map, 24, 100, 'VERDE: O MESMO PONTO DEPOIS DA CORRECAO - O CAMINHO DESVIOU, O CANTEIRO FICOU.', GOOD, 2);
  text(map, 24, 122, 'AMARELO: ONDE PARAVA QUEM ERA MANDADO AO PONTO VERMELHO, APOS 90 S.', [250, 196, 90], 2);
  text(map, 24, map.size - 40, 'GEOMETRIA E FISICA REAIS, RASTERIZADAS FORA DA TELA - NAO E CAPTURA DO JOGO.', [150, 170, 190], 2);
  map.write(file);
}

/* -------------------------------- main --------------------------------- */

const outDir = (process.argv[2] ?? 'docs').replace(/\/$/, '');
/*
 * `antes` roda este mesmo programa dentro de uma cópia do código
 * anterior à correção (ver docs/PLANO-HABITANTES-ESPALHADOS.md): sai só
 * a planta da cidade, porque `reachableFrom` ainda não existe lá.
 */
const mode = process.argv[3] === 'antes' ? 'antes' : 'depois';
const region = buildAurora();

// 1. A cidade rodando, com a correção.
const npcs = new NpcSystem({
  scene: new THREE.Scene(),
  ground: region.ground,
  blocked: region.blocked,
  body: region.body,
  quality: new QualitySystem(defaultGraphicsSettings('alta')).current,
});
const clock = new WorldClock();
const watched = [0, 9, 18, 27, 36, 45];
const trails: { x: number; z: number }[][] = watched.map(() => []);
const dt = 1 / 30;
for (let t = 0; t < 12 * 60 * 30; t += 1) {
  clock.update(dt);
  npcs.setFocus(0, 2.16, 30);
  npcs.setPeriod(clock.period);
  npcs.update(dt, t * dt);
  if ((t + 1) % 30 === 0) watched.forEach((index, slot) => trails[slot].push({ x: npcs.people[index].x, z: npcs.people[index].z }));
}
const atPlanters = npcs.people.filter((person) => PLANTERS.some((planter) => Math.hypot(person.x - planter.x, person.z - planter.z) < 3.6)).length;
const cells = new Set(npcs.people.map((person) => `${Math.round(person.x / 20)}:${Math.round(person.z / 20)}`)).size;
console.log(`[${mode}] 12 min simulados — encostados nos canteiros: ${atPlanters}/54 · células de 20 m ocupadas: ${cells}`);
cityMap(
  region,
  npcs.people,
  trails,
  mode === 'antes' ? `${outDir}/habitantes-antes.png` : `${outDir}/habitantes-aurora.png`,
  mode === 'antes'
    ? `ANTES - OS 54 HABITANTES DEPOIS DE 12 MINUTOS (${atPlanters} NOS CANTEIROS)`
    : `DEPOIS - OS 54 HABITANTES DEPOIS DE 12 MINUTOS (${atPlanters} NOS CANTEIROS)`,
);
if (mode === 'antes') process.exit(0);

// 2. O anel da praça: rede antiga, rede corrigida, e onde parava quem
//    era mandado para dentro do canteiro.
const edgeBlocked = (ax: number, az: number, bx: number, bz: number) => region.body.corridorBlocked(ax, az, bx, bz);
const pointBlocked = (x: number, z: number, fx: number, fz: number) => !region.body.reachableFrom(x, z, fx, fz);
const antes = buildAuroraWalkNetwork({ blocked: region.blocked, edgeBlocked });
const depois = buildAuroraWalkNetwork({ blocked: region.blocked, edgeBlocked, pointBlocked });

const pinned: { x: number; z: number }[] = [];
for (const node of antes.nodes) {
  if (!PLANTERS.some((planter) => Math.hypot(node.x - planter.x, node.z - planter.z) < 2.4 + PLAYER.radius)) continue;
  const from = antes.node(antes.neighbors(node.id)[0]);
  const mini = new WalkNetwork(
    [
      { id: 0, x: from.x, z: from.z, kind: 'praca' },
      { id: 1, x: node.x, z: node.z, kind: 'praca' },
    ],
    [[1], [0]],
  );
  const sim = new CitizenSim(makeCitizen(7), mini, 0, createRng(7), { body: region.body });
  for (let t = 0; t < 90 * 30; t += 1) sim.update(1 / 30);
  pinned.push({ x: sim.x, z: sim.z });
  console.log(
    `  nó (${node.x.toFixed(1)},${node.z.toFixed(1)}) dentro de canteiro: depois de 90 s a pessoa parou a ${Math.min(...PLANTERS.map((p) => Math.hypot(sim.x - p.x, sim.z - p.z))).toFixed(2)} m do centro`,
  );
}
plazaMap(region, antes, depois, pinned, `${outDir}/habitantes-praca.png`);
console.log(`escrito: ${outDir}/habitantes-aurora.png e ${outDir}/habitantes-praca.png`);
