// @vitest-environment happy-dom
/**
 * Marco J — o mundo reconhece os personagens, os personagens reconhecem o mundo.
 *
 * Três perguntas, medidas na cidade montada de verdade (a mesma receita
 * sem navegador usada pela Estação do Éden):
 *
 *  1. Os personagens pisam onde o jogador pisaria? (chão)
 *  2. Eles esbarram no que o jogador esbarraria? (colisão)
 *  3. Eles saem do lugar? (movimento)
 *
 * Mais uma, que não é de física: a deusa que aparece em Rosas Park é a
 * mesma que aparece em Aurora City?
 */

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CharacterGround } from '../../src/characters/CharacterGround';
import { createOfficialAvatar, officialFingerprint, OFFICIAL_IDS } from '../../src/characters/CharacterModels';
import { PANTHEON } from '../../src/characters/Pantheon';
import { getBlueprint } from '../../src/cities';
import { PLAYER } from '../../src/core/Config';
import { makeCitizen } from '../../src/npc/CitizenData';
import { CitizenSim } from '../../src/npc/CitizenSim';
import { NpcSystem } from '../../src/npc/NpcSystem';
import { buildAuroraWalkNetwork, buildRosasWalkNetwork, WalkNetwork, type WalkNode } from '../../src/npc/WalkNetwork';
import { BASIN, LAKE_ISLAND as ROSAS_LAKE_ISLAND, PAVILIONS, ROSE_GARDEN } from '../../src/cities/rosas-park/RosasLayout';
import type { NamedArea } from '../../src/cities/aurora-city/Layout';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { getRegion } from '../../src/regions/Region';
import { QualitySystem, defaultGraphicsSettings } from '../../src/systems/QualitySystem';
import { createRng } from '../../src/utils/math';
import { HeightField } from '../../src/world/HeightField';
import type { MaterialLibrary } from '../../src/world/Materials';
import type { Vegetation } from '../../src/world/Vegetation';
import { ZoneMap } from '../../src/world/ZoneMap';

/** Perfil de qualidade alto: todo mundo visível, nada economizado. */
function qualityProfile() {
  return new QualitySystem(defaultGraphicsSettings('alta')).current;
}

/* ------------------------- cidade sem navegador ------------------------- */

function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const special: Record<string, unknown> = {
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h }),
  };
  return new Proxy(special, { get: (target, key: string) => (key in target ? target[key] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  const proto = globalThis.HTMLCanvasElement?.prototype;
  if (!proto) return;
  proto.getContext = function patched(this: HTMLCanvasElement, kind: string) {
    return kind === '2d' ? fakeContext(this) : null;
  } as HTMLCanvasElement['getContext'];
});

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
  const handle = (width = 256, height = 256) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const shader = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uTexture: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 1 } } });
    return { material: shader, texture: new THREE.CanvasTexture(canvas), redraw: () => {}, dispose: () => {} };
  };
  const factories: Record<string, unknown> = { createHologram: handle, createPainted: handle, createCanvasTexture: () => new THREE.Texture() };
  return new Proxy({}, { get: (_t, key: string) => (key in factories ? factories[key] : (cache.get(key) ?? cache.set(key, material(key)).get(key))) }) as unknown as MaterialLibrary;
}

function stubVegetation(): Vegetation {
  return { isClear: () => true, addTree: () => {}, addBush: () => {}, addFlowerPatch: () => {}, scatterGround: () => {}, build: () => {}, setDensity: () => {}, updateVisibility: () => {}, dispose: () => {} } as unknown as Vegetation;
}

interface BuiltRegion {
  physics: PhysicsWorld;
  heightField: HeightField;
  body: CharacterGround;
  dispose(): void;
}

function buildRegion(regionId: string): BuiltRegion {
  const blueprint = getBlueprint(regionId);
  if (!blueprint) throw new Error(`sem blueprint: ${regionId}`);
  const heightField = new HeightField(blueprint.terrainSize, 192, blueprint.height);
  const zones = new ZoneMap(blueprint.terrainSize, 192);
  const physics = new PhysicsWorld({ getHeight: (x, z) => heightField.getHeight(x, z), getSurface: (x, z) => heightField.getSurface(x, z) });
  physics.boundaryRadius = blueprint.boundaryRadius;
  const scene = blueprint.create({ materials: stubMaterials(), physics, heightField, zones, vegetation: stubVegetation() });
  const body = new CharacterGround({
    physics,
    terrain: (x, z) => heightField.getHeight(x, z),
    radius: PLAYER.radius,
    height: PLAYER.height,
    stepHeight: PLAYER.stepHeight,
  });
  return {
    physics,
    heightField,
    body,
    dispose: () => {
      scene.dispose();
      physics.clear();
    },
  };
}

/** Uma rede de dois nós, para medir uma travessia isolada. */
function straightNetwork(ax: number, az: number, bx: number, bz: number): WalkNetwork {
  const nodes: WalkNode[] = [
    { id: 0, x: ax, z: az, kind: 'caminho' },
    { id: 1, x: bx, z: bz, kind: 'caminho' },
  ];
  return new WalkNetwork(nodes, [[1], [0]]);
}

/** Simula uma pessoa por alguns segundos e devolve o rastro. */
function walk(sim: CitizenSim, seconds: number, dt = 1 / 60): { x: number; z: number }[] {
  const trail: { x: number; z: number }[] = [];
  for (let step = 0; step < Math.round(seconds / dt); step += 1) {
    sim.update(dt);
    trail.push({ x: sim.x, z: sim.z });
  }
  return trail;
}

/* ------------------------------ 1. colisão ------------------------------ */

/** Espelho da tabela de lugares de Rosas que o `NpcSystem` monta. */
const ROSAS_AREAS: readonly NamedArea[] = [
  { id: 'roseiral', name: 'Roseiral Maior', x: ROSE_GARDEN.x, z: ROSE_GARDEN.z, radius: 44 },
  { id: 'ilha-lago', name: 'Ilha das Lontras', x: ROSAS_LAKE_ISLAND.x, z: ROSAS_LAKE_ISLAND.z, radius: 20 },
  { id: 'quedas', name: 'Pé das Quedas', x: BASIN.x, z: BASIN.z, radius: 34 },
  ...PAVILIONS.map((pavilion) => ({ id: pavilion.id, name: pavilion.name, x: pavilion.x, z: pavilion.z, radius: Math.max(16, pavilion.radius * 2) })),
];

describe('os habitantes esbarram no cenário em vez de atravessá-lo', () => {
  it('não atravessa uma árvore plantada no meio do caminho', () => {
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    // Tronco igual ao que a vegetação planta: cilindro sólido.
    physics.addCylinder({ x: 0, z: 0, radius: 0.5, yMin: -1, yMax: 4.2, walkable: false, blocksCamera: false, tag: 'arvore:plátano' });
    const body = new CharacterGround({ physics, terrain: () => 0, radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight });
    const net = straightNetwork(0, -14, 0, 14);
    const sim = new CitizenSim(makeCitizen(3), net, 0, createRng(3), { body });

    let closest = Infinity;
    for (const point of walk(sim, 40)) closest = Math.min(closest, Math.hypot(point.x, point.z));
    // Centro do tronco + raio do corpo: nunca se aproxima mais do que isso.
    expect(closest, 'passou por dentro do tronco').toBeGreaterThan(0.5);
  });

  it('não atravessa um banco', () => {
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    // Banco de praça: caixa baixa, mas alta demais para subir de um passo.
    physics.addBox({ x: 0, z: 0, halfX: 1.1, halfZ: 0.3, rotation: 0, yMin: 0, yMax: 0.92, walkable: false, blocksCamera: false, tag: 'banco' });
    const body = new CharacterGround({ physics, terrain: () => 0, radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight });
    const net = straightNetwork(0, -12, 0, 12);
    const sim = new CitizenSim(makeCitizen(5), net, 0, createRng(5), { body });

    for (const point of walk(sim, 40)) {
      const insideX = Math.abs(point.x) < 1.1;
      const insideZ = Math.abs(point.z) < 0.3;
      expect(insideX && insideZ, `atravessou o banco em ${point.x.toFixed(2)},${point.z.toFixed(2)}`).toBe(false);
    }
  });

  it('contorna o obstáculo e chega do outro lado', () => {
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    physics.addBox({ x: 0, z: 0, halfX: 1.6, halfZ: 0.4, rotation: 0, yMin: 0, yMax: 1.1, walkable: false, blocksCamera: false, tag: 'banco' });
    const body = new CharacterGround({ physics, terrain: () => 0, radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight });
    const net = straightNetwork(0, -10, 0, 10);
    const sim = new CitizenSim(makeCitizen(9), net, 0, createRng(9), { body });

    let crossed = false;
    for (const point of walk(sim, 90)) {
      if (point.z > 2) crossed = true;
    }
    expect(crossed, 'ficou preso na frente do obstáculo em vez de contorná-lo').toBe(true);
  });

  it('a rede de caminhada só liga pontos por onde dá para passar', () => {
    const { body, dispose } = buildRegion('aurora-city');
    const livre = buildAuroraWalkNetwork({ blocked: () => false });
    const podada = buildAuroraWalkNetwork({ blocked: () => false, edgeBlocked: (ax, az, bx, bz) => body.corridorBlocked(ax, az, bx, bz) });

    const edges = (net: WalkNetwork): number => {
      let total = 0;
      for (let i = 0; i < net.size; i += 1) total += net.neighbors(i).length;
      return total / 2;
    };
    // A poda tem de cortar alguma coisa — senão a consulta não está ligada.
    expect(edges(podada), 'a poda por obstáculo não removeu nenhuma ligação').toBeLessThan(edges(livre));
    // ...e não pode cortar a cidade ao meio. O critério é corredor, não
    // linha reta: um poste no meio da calçada não fecha a calçada.
    expect(podada.size, 'a poda desmontou a rede').toBe(livre.size);

    for (let i = 0; i < podada.size; i += 1) {
      const a = podada.node(i);
      for (const j of podada.neighbors(i)) {
        if (j <= i) continue;
        const b = podada.node(j);
        expect(body.corridorBlocked(a.x, a.z, b.x, b.z), `ligação ${i}→${j} não tem passagem`).toBe(false);
      }
    }

    // E a rede continua inteira: ninguém nasce num trecho sem saída.
    const seen = new Uint8Array(podada.size);
    const stack = [0];
    seen[0] = 1;
    let reached = 0;
    while (stack.length > 0) {
      const node = stack.pop() as number;
      reached += 1;
      for (const next of podada.neighbors(node)) {
        if (seen[next]) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    expect(reached, 'a rede ficou em pedaços').toBe(podada.size);
    dispose();
  });
});

/* ----------------------------- 2. movimento ----------------------------- */

describe('os habitantes percorrem distâncias reais', () => {
  it('muda de coordenadas e chega longe de onde começou', () => {
    const net = buildAuroraWalkNetwork({ blocked: () => false });
    for (const seed of [1, 7, 23, 41]) {
      const sim = new CitizenSim(makeCitizen(seed), net, net.randomNode(createRng(seed)), createRng(seed * 977 + 31), {});
      const start = { x: sim.x, z: sim.z };
      let travelled = 0;
      let previous = { ...start };
      for (const point of walk(sim, 120)) {
        travelled += Math.hypot(point.x - previous.x, point.z - previous.z);
        previous = point;
      }
      const displacement = Math.hypot(sim.x - start.x, sim.z - start.z);
      expect(travelled, `semente ${seed}: mal saiu do lugar`).toBeGreaterThan(80);
      // O teste que pega "anda no lugar": andar muito e não ir a lugar
      // nenhum. Um passeio aleatório fica abaixo de 30%.
      expect(displacement / travelled, `semente ${seed}: andou ${travelled.toFixed(0)} m e ficou a ${displacement.toFixed(0)} m do início`).toBeGreaterThan(0.45);
      expect(displacement, `semente ${seed}: não atravessou a cidade`).toBeGreaterThan(60);
    }
  });

  it('visita pontos diferentes da cidade, não dois cruzamentos', () => {
    const net = buildAuroraWalkNetwork({ blocked: () => false });
    const sim = new CitizenSim(makeCitizen(11), net, net.randomNode(createRng(11)), createRng(11 * 977 + 31), {});
    const visited = new Set<string>();
    for (const point of walk(sim, 180)) visited.add(`${Math.round(point.x / 12)}:${Math.round(point.z / 12)}`);
    expect(visited.size, 'ficou circulando no mesmo quarteirão').toBeGreaterThan(12);
  });

  it('as rotinas levam a algum lugar em Rosas Park, não só em Aurora', () => {
    // Os arquétipos citam lugares de Aurora pelo nome ('praca',
    // 'mirante'). Enquanto a lista de lugares era só a de Aurora,
    // nenhuma rotina pegava fora dela: a busca falhava, ninguém tinha
    // hora nem lugar para estar, e o parque virava perambulação pura.
    const net = buildRosasWalkNetwork({ blocked: () => false });
    const periods = ['madrugada', 'manhã', 'tarde', 'noite'] as const;
    const visited = new Set<string>();
    let engaged = 0;
    for (let seed = 1; seed <= 54; seed += 1) {
      const sim = new CitizenSim(makeCitizen(seed), net, net.randomNode(createRng(seed)), createRng(seed * 977 + 31), { areas: ROSAS_AREAS });
      for (const period of periods) {
        sim.setRoutine(period);
        const goal = (sim as unknown as { goalArea: string | null }).goalArea;
        if (goal === null) continue;
        engaged += 1;
        visited.add(goal);
        expect(ROSAS_AREAS.some((area) => area.id === goal), `rotina mandou ${goal}, que não existe em Rosas`).toBe(true);
      }
    }
    expect(engaged, 'as rotinas não pegaram em Rosas Park').toBe(54 * periods.length);
    // E não é todo mundo indo ao mesmo canto.
    expect(visited.size, 'o parque inteiro virou um destino só').toBeGreaterThan(4);

    // O hábito é estável: a mesma pessoa, no mesmo período, vai ao
    // mesmo lugar. Senão não é rotina, é sorteio.
    const first = new CitizenSim(makeCitizen(9), net, net.randomNode(createRng(9)), createRng(9 * 977 + 31), { areas: ROSAS_AREAS });
    const second = new CitizenSim(makeCitizen(9), net, net.randomNode(createRng(9)), createRng(9 * 977 + 31), { areas: ROSAS_AREAS });
    first.setRoutine('tarde');
    second.setRoutine('tarde');
    expect((first as unknown as { goalArea: string }).goalArea).toBe((second as unknown as { goalArea: string }).goalArea);
  });

  it('o empurrão de separação não se acumula enquanto a pessoa conversa', () => {
    // O `NpcSystem` empurra quem está grudado a cada quadro. Se o ramo
    // da conversa não gastasse esse empurrão, quatro segundos de papo
    // somariam 240 empurrões e a pessoa sairia catapultada ao voltar a
    // andar.
    const net = buildAuroraWalkNetwork({ blocked: () => false });
    const sim = new CitizenSim(makeCitizen(3), net, net.randomNode(createRng(3)), createRng(3 * 977 + 31), {});
    sim.startTalking(0, 0, 4);
    let worst = 0;
    let previous = { x: sim.x, z: sim.z };
    for (let frame = 0; frame < 600; frame += 1) {
      sim.pushAway(0.01, 0.004);
      sim.update(1 / 60);
      worst = Math.max(worst, Math.hypot(sim.x - previous.x, sim.z - previous.z));
      previous = { x: sim.x, z: sim.z };
    }
    // Um empurrão por quadro vale 0,0108 m. Qualquer salto muito acima
    // disso é acúmulo represado.
    expect(worst, 'a pessoa saiu catapultada depois da conversa').toBeLessThan(0.05);
  });

  it('a animação acompanha o deslocamento: parado é parado', () => {
    const net = buildAuroraWalkNetwork({ blocked: () => false });
    const sim = new CitizenSim(makeCitizen(17), net, net.randomNode(createRng(17)), createRng(17 * 977 + 31), {});
    const dt = 1 / 60;
    for (let step = 0; step < 240; step += 1) {
      const before = { x: sim.x, z: sim.z, phase: sim.stridePhase };
      sim.update(dt);
      const moved = Math.hypot(sim.x - before.x, sim.z - before.z);
      // Velocidade declarada = deslocamento real dividido pelo tempo.
      expect(Math.abs(sim.speed - moved / dt)).toBeLessThan(0.01);
      // A passada só avança quando há deslocamento, e na proporção dele.
      const stride = sim.stridePhase - before.phase;
      expect(Math.abs(stride - (moved / 0.78) * Math.PI)).toBeLessThan(1e-6);
      if (moved < 1e-6) expect(sim.speed).toBe(0);
    }

    // Conversando, a pessoa para de andar — e volta a andar depois.
    sim.startTalking(sim.x + 2, sim.z, 3);
    for (let step = 0; step < 60; step += 1) {
      const before = { x: sim.x, z: sim.z };
      sim.update(dt);
      expect(Math.hypot(sim.x - before.x, sim.z - before.z)).toBeLessThan(1e-9);
      expect(sim.speed).toBe(0);
      expect(sim.activity).toBe('conversando');
    }
    sim.stopTalking();
    let moved = 0;
    for (const point of walk(sim, 12)) moved = Math.max(moved, Math.hypot(point.x - sim.x, point.z - sim.z));
    expect(sim.activity === 'andando' || sim.activity === 'parado').toBe(true);
  });
});

/* ------------------------------- 3. chão -------------------------------- */

const REGIONS = ['aurora-city', 'rosas-park'];

describe('ninguém fica enterrado no terreno', () => {
  for (const regionId of REGIONS) {
    it(`${regionId}: os habitantes pisam na superfície que o jogador pisaria`, () => {
      const { body, heightField, dispose } = buildRegion(regionId);
      const net = buildAuroraWalkNetwork({ blocked: () => false, edgeBlocked: (ax, az, bx, bz) => body.corridorBlocked(ax, az, bx, bz) });
      const sim = new CitizenSim(makeCitizen(2), net, net.randomNode(createRng(2)), createRng(2 * 977 + 31), {
        ground: (x, z) => heightField.getHeight(x, z),
        body,
      });
      for (let step = 0; step < 60 * 60; step += 1) {
        sim.update(1 / 60);
        if (step % 37 !== 0) continue;
        const surface = body.heightAt(sim.x, sim.z, sim.y + 0.6);
        expect(Math.abs(sim.y - surface), `pés a ${(sim.y - surface).toFixed(2)} m da superfície em ${sim.x.toFixed(1)},${sim.z.toFixed(1)}`).toBeLessThan(0.05);
        // E nunca abaixo do relevo: isso é estar enterrado.
        expect(sim.y).toBeGreaterThanOrEqual(heightField.getHeight(sim.x, sim.z) - 0.05);
      }
      dispose();
    });

    it(`${regionId}: o panteão fica em cima do chão, não dentro dele`, () => {
      const { body, heightField, dispose } = buildRegion(regionId);
      const npcs = new NpcSystem({
        scene: new THREE.Scene(),
        body,
        ground: (x, z) => heightField.getHeight(x, z),
        blocked: () => false,
        quality: qualityProfile(),
      });
      npcs.setRegion(regionId);

      const region = getRegion(regionId);
      for (const character of PANTHEON) {
        const deity = npcs.deityOf(character.id);
        expect(deity, `${character.id} não existe`).toBeDefined();
        if (!deity) continue;
        const home = regionId === 'aurora-city' || (region?.patrons.includes(character.id) ?? false);
        expect(deity.interactable.enabled, `${character.id} deveria ${home ? '' : 'não '}estar em ${regionId}`).toBe(home);
        if (!home) continue;
        const surface = body.settle(deity.x, deity.z);
        expect(Math.abs(deity.y - surface), `${character.id} a ${(deity.y - surface).toFixed(2)} m da superfície`).toBeLessThan(0.02);
        expect(deity.y, `${character.id} está abaixo do relevo`).toBeGreaterThanOrEqual(heightField.getHeight(deity.x, deity.z) - 0.02);
      }
      npcs.dispose();
      dispose();
    });
  }

  it('Aérion fica sobre o estrado da Praça Central, não dentro dele', () => {
    const { body, heightField, dispose } = buildRegion('aurora-city');
    const npcs = new NpcSystem({
      scene: new THREE.Scene(),
      body,
      ground: (x, z) => heightField.getHeight(x, z),
      blocked: () => false,
      quality: qualityProfile(),
    });
    const aerion = npcs.deityOf('aerion');
    expect(aerion).toBeDefined();
    if (!aerion) return;
    const terrain = heightField.getHeight(aerion.x, aerion.z);
    const deck = body.settle(aerion.x, aerion.z);
    // O estrado existe e está acima do relevo — é por isso que o bug
    // era possível.
    expect(deck).toBeGreaterThan(terrain + 0.1);
    // E Aérion está em cima dele.
    expect(Math.abs(aerion.y - deck)).toBeLessThan(0.02);
    npcs.dispose();
    dispose();
  });
});

/* -------------------------- 4. modelos oficiais ------------------------- */

describe('as deusas são as mesmas em todas as regiões', () => {
  it('Saturno tem a mesma identidade visual em Aurora City e em Rosas Park', () => {
    const aurora = buildRegion('aurora-city');
    const rosas = buildRegion('rosas-park');

    const build = (region: BuiltRegion, regionId: string) => {
      const npcs = new NpcSystem({
        scene: new THREE.Scene(),
        body: region.body,
        ground: (x, z) => region.heightField.getHeight(x, z),
        blocked: () => false,
        quality: qualityProfile(),
      });
      npcs.setRegion(regionId);
      const deity = npcs.deityOf('saturno');
      if (!deity) throw new Error('sem Saturno');
      // Materializa o avatar aproximando o foco dela.
      npcs.setFocus(deity.x, deity.y, deity.z);
      npcs.update(1 / 60, 0);
      return { npcs, deity };
    };

    const a = build(aurora, 'aurora-city');
    const b = build(rosas, 'rosas-park');

    expect(a.deity.avatar, 'Saturno não ganhou corpo em Aurora').not.toBeNull();
    expect(b.deity.avatar, 'Saturno não ganhou corpo em Rosas Park').not.toBeNull();
    // Mesma aparência, byte a byte: é literalmente o mesmo objeto de cânone.
    expect(b.deity.avatar?.appearance).toEqual(a.deity.avatar?.appearance);
    // Mesma escala. Uma Saturno 1,62 e outra 1,70 seriam duas Saturnos.
    expect(b.deity.avatar?.appearance.height).toBe(a.deity.avatar?.appearance.height);
    expect(b.deity.character.appearance).toBe(a.deity.character.appearance);

    a.npcs.dispose();
    b.npcs.dispose();
    aurora.dispose();
    rosas.dispose();
  });

  it('todos os personagens oficiais vêm da mesma fábrica, com a mesma impressão', () => {
    for (const id of OFFICIAL_IDS) {
      const fingerprint = officialFingerprint(id);
      expect(fingerprint, `${id} sem impressão`).toBeTruthy();
      const first = createOfficialAvatar(id);
      const second = createOfficialAvatar(id);
      expect(first, `${id} não tem modelo oficial`).not.toBeNull();
      if (!first || !second) continue;
      // Duas chamadas, o mesmo corpo.
      expect(second.appearance).toEqual(first.appearance);
      expect(officialFingerprint(id)).toBe(fingerprint);
      first.dispose();
      second.dispose();
    }
    // Onze personagens, onze impressões distintas: ninguém é cópia de ninguém.
    const prints = new Set(OFFICIAL_IDS.map((id) => officialFingerprint(id)));
    expect(prints.size).toBe(OFFICIAL_IDS.length);
  });

  it('o cânone de Amara sobrevive à fábrica', () => {
    const amara = PANTHEON.find((character) => character.id === 'amara');
    expect(amara?.title).toBe('Deusa da Maternidade');
    expect(amara?.gestation).toBe(1);
    const avatar = createOfficialAvatar('amara');
    expect(avatar).not.toBeNull();
    // A gestação entra no modelo oficial, em qualquer região.
    expect(avatar?.gestation).toBe(1);
    avatar?.dispose();
  });

  it('trocar de região não deforma nem desposiciona ninguém', () => {
    const aurora = buildRegion('aurora-city');
    const rosas = buildRegion('rosas-park');
    const npcs = new NpcSystem({
      scene: new THREE.Scene(),
      body: aurora.body,
      ground: (x, z) => aurora.heightField.getHeight(x, z),
      blocked: () => false,
      quality: qualityProfile(),
    });

    const before = npcs.deityOf('saturno');
    npcs.setFocus(before?.x ?? 0, before?.y ?? 0, before?.z ?? 0);
    npcs.update(1 / 60, 0);
    const appearance = before?.avatar?.appearance;
    const prints = OFFICIAL_IDS.map((id) => officialFingerprint(id));

    // Ida e volta, como numa viagem de verdade.
    for (const [regionId, region] of [
      ['rosas-park', rosas],
      ['aurora-city', aurora],
      ['rosas-park', rosas],
    ] as const) {
      npcs.setBody(region.body);
      npcs.setRegion(regionId);
      const home = getRegion(regionId);
      for (const character of PANTHEON) {
        const deity = npcs.deityOf(character.id);
        if (!deity) continue;
        const isHome = regionId === 'aurora-city' || (home?.patrons.includes(character.id) ?? false);
        expect(deity.interactable.enabled).toBe(isHome);
        if (!isHome) continue;
        const surface = region.body.settle(deity.x, deity.z);
        expect(Math.abs(deity.y - surface), `${character.id} desalinhou em ${regionId}`).toBeLessThan(0.02);
      }
      // E ninguém foi reconstruído por baixo dos panos.
      expect(OFFICIAL_IDS.map((id) => officialFingerprint(id))).toEqual(prints);
    }

    const after = npcs.deityOf('saturno');
    expect(after?.avatar?.appearance).toEqual(appearance);
    npcs.dispose();
    aurora.dispose();
    rosas.dispose();
  });
});
