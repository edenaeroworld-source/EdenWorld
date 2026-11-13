// @vitest-environment happy-dom
/**
 * Uma cidade viva não é uma fila de gente embaixo de uma árvore.
 *
 * O relato: em Aurora City os habitantes apareciam todos amontoados em
 * volta da mesma árvore. A causa, medida: quatro pontos de passagem da
 * rede de caminhada caíam **dentro** dos canteiros de 50 cm do anel da
 * Praça Central. Em cima do canteiro não há colisão, então o
 * planejador de rotas achava o ponto livre; quem chega anda pelo piso
 * da praça, 50 cm abaixo, e 50 cm é mais que o passo de 42 cm. A
 * pessoa encostava na borda e ficava ali — para sempre, porque o
 * replanejamento devolvia a mesma rota para dentro do mesmo canteiro.
 *
 * O que se verifica aqui, nas duas regiões montadas de verdade:
 *
 *  1. Nenhum ponto da rede é inalcançável para quem anda.
 *  2. Nada foi apagado do cenário para conseguir isso.
 *  3. Os habitantes nascem espalhados e com destinos variados.
 *  4. Em dois minutos de simulação ninguém se junta num monte.
 *  5. Ninguém fica preso: quem chega troca de destino e sai.
 *  6. As correções da PR #12 continuam de pé.
 */

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CharacterGround } from '../../src/characters/CharacterGround';
import { getBlueprint } from '../../src/cities';
import { PLAYER, WORLD } from '../../src/core/Config';
import { DestinationBoard } from '../../src/npc/DestinationBoard';
import { NpcSystem } from '../../src/npc/NpcSystem';
import { buildAuroraWalkNetwork, buildRosasWalkNetwork, type WalkNetwork } from '../../src/npc/WalkNetwork';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { QualitySystem, defaultGraphicsSettings } from '../../src/systems/QualitySystem';
import { createRng } from '../../src/utils/math';
import { HeightField } from '../../src/world/HeightField';
import type { MaterialLibrary } from '../../src/world/Materials';
import { Vegetation } from '../../src/world/Vegetation';
import { WorldClock } from '../../src/world/WorldClock';
import { Zone, ZoneMap } from '../../src/world/ZoneMap';

/* ------------------------ cidade sem navegador ------------------------ */

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

interface BuiltRegion {
  body: CharacterGround;
  ground: (x: number, z: number) => number;
  blocked: (x: number, z: number) => boolean;
  dispose(): void;
}

/**
 * A região montada como o motor a monta — com a vegetação de verdade.
 *
 * A vegetação importa: é ela que planta os 1082 troncos de Aurora como
 * colisores. Uma cidade sem árvores não tem como reproduzir um
 * problema que é sobre gente esbarrando em coisas.
 */
function buildRegion(regionId: string): BuiltRegion {
  const blueprint = getBlueprint(regionId);
  if (!blueprint) throw new Error(`sem blueprint: ${regionId}`);
  const heightField = new HeightField(blueprint.terrainSize, 192, blueprint.height);
  const zones = new ZoneMap(blueprint.terrainSize, 192);
  const physics = new PhysicsWorld({ getHeight: (x, z) => heightField.getHeight(x, z), getSurface: (x, z) => heightField.getSurface(x, z) });
  physics.boundaryRadius = blueprint.boundaryRadius;
  const materials = stubMaterials();
  const vegetation = new Vegetation({ materials, heightField, physics });
  const scene = blueprint.create({ materials, physics, heightField, zones, vegetation });
  vegetation.build();
  const body = new CharacterGround({ physics, terrain: (x, z) => heightField.getHeight(x, z), radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight });
  const boundaryRadius = blueprint.boundaryRadius;
  return {
    body,
    ground: (x, z) => heightField.getHeight(x, z),
    // A mesma consulta que o motor passa ao NpcSystem.
    blocked: (x, z) => {
      if (Math.hypot(x, z) > boundaryRadius - 8) return true;
      if (heightField.getHeight(x, z) < WORLD.waterLevel + 0.35) return true;
      return zones.has(x, z, Zone.Water | Zone.Building);
    },
    dispose: () => {
      scene.dispose();
      vegetation.dispose();
      physics.clear();
    },
  };
}

function makeCity(regionId: string) {
  const region = buildRegion(regionId);
  const npcs = new NpcSystem({
    scene: new THREE.Scene(),
    ground: region.ground,
    blocked: region.blocked,
    body: region.body,
    quality: new QualitySystem(defaultGraphicsSettings('alta')).current,
  });
  if (regionId !== 'aurora-city') npcs.setRegion(regionId);
  return { region, npcs };
}

/** Roda a cidade com o relógio do jogo (dia de 24 min) e o jogador na praça. */
function run(npcs: NpcSystem, seconds: number, clock = new WorldClock(), onSecond?: (t: number) => void): void {
  const dt = 1 / 30;
  for (let t = 0; t < Math.round(seconds * 30); t += 1) {
    clock.update(dt);
    npcs.setFocus(0, 2.16, 30);
    npcs.setPeriod(clock.period);
    npcs.update(dt, t * dt);
    if (onSecond && (t + 1) % 30 === 0) onSecond((t + 1) / 30);
  }
}

/* --------------------------- medidas comuns --------------------------- */

interface Spread {
  /** Maior número de pessoas a 5 m umas das outras. */
  cluster: number;
  /** Células de 20 m ocupadas. */
  cells: number;
  /** Distância média ao centro de massa (m). */
  radius: number;
  /** Menor distância entre duas pessoas (m). */
  closest: number;
}

function spreadOf(people: readonly { x: number; z: number }[]): Spread {
  let cluster = 0;
  let closest = Infinity;
  for (const a of people) {
    let n = 0;
    for (const b of people) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d <= 5) n += 1;
      if (a !== b) closest = Math.min(closest, d);
    }
    cluster = Math.max(cluster, n);
  }
  const cx = people.reduce((acc, p) => acc + p.x, 0) / people.length;
  const cz = people.reduce((acc, p) => acc + p.z, 0) / people.length;
  const radius = people.reduce((acc, p) => acc + Math.hypot(p.x - cx, p.z - cz), 0) / people.length;
  const cells = new Set(people.map((p) => `${Math.round(p.x / 20)}:${Math.round(p.z / 20)}`));
  return { cluster, cells: cells.size, radius, closest };
}

/** Os oito canteiros de 2,4 m do anel da Praça Central — a árvore do print. */
const PLANTERS = Array.from({ length: 8 }, (_, k) => {
  const angle = Math.PI / 8 + (k * Math.PI) / 4;
  return { x: Math.cos(angle) * 37, z: Math.sin(angle) * 37 };
});

/* ====================================================================== */

describe('a rede de caminhada não manda ninguém para dentro do cenário', () => {
  for (const regionId of ['aurora-city', 'rosas-park']) {
    it(`${regionId}: todo ponto de passagem é alcançável para quem anda`, () => {
      const { region, npcs } = makeCity(regionId);
      const net = npcs.network;
      const unreachable: string[] = [];
      for (const node of net.nodes) {
        for (const other of net.neighbors(node.id)) {
          // Chegando deste vizinho, dá para parar no nó?
          if (region.body.reachableFrom(node.x, node.z, net.node(other).x, net.node(other).z)) continue;
          unreachable.push(`#${node.id} (${node.x.toFixed(1)},${node.z.toFixed(1)}) vindo de #${other}`);
          break;
        }
      }
      expect(unreachable, `pontos inalcançáveis: ${unreachable.join(' | ')}`).toEqual([]);
      region.dispose();
    });
  }

  it('Aurora: nenhum ponto de passagem cai dentro dos canteiros da praça', () => {
    const { region, npcs } = makeCity('aurora-city');
    // Altura dos pés de quem caminha pelo piso da praça — não a de quem
    // já estaria em cima do canteiro, que era justamente o engano.
    const plazaFloor = region.body.settle(0, 30);
    for (const node of npcs.network.nodes) {
      for (const planter of PLANTERS) {
        const distance = Math.hypot(node.x - planter.x, node.z - planter.z);
        if (distance > 3.2) continue;
        expect(
          region.body.blocked(node.x, node.z, plazaFloor, PLAYER.radius),
          `nó #${node.id} (${node.x.toFixed(1)},${node.z.toFixed(1)}) está dentro de um canteiro, a ${distance.toFixed(2)} m do centro`,
        ).toBe(false);
      }
    }
    region.dispose();
  });

  it('o canteiro continua no lugar: o caminho é que desvia', () => {
    const region = buildRegion('aurora-city');
    const edgeBlocked = (ax: number, az: number, bx: number, bz: number) => region.body.corridorBlocked(ax, az, bx, bz);
    const pointBlocked = (x: number, z: number, fx: number, fz: number) => !region.body.reachableFrom(x, z, fx, fz);
    const antes = buildAuroraWalkNetwork({ blocked: region.blocked, edgeBlocked });
    const depois = buildAuroraWalkNetwork({ blocked: region.blocked, edgeBlocked, pointBlocked });

    // Nenhum nó perdido: os que caíam dentro do canteiro foram movidos
    // para o lado, não apagados. Resolver tirando o canteiro da praça
    // seria trocar um problema por outro.
    expect(depois.nodes.length).toBe(antes.nodes.length);
    expect(reachable(depois)).toBe(depois.nodes.length);

    let moved = 0;
    let furthest = 0;
    for (const node of depois.nodes) {
      const near = antes.nearest(node.x, node.z);
      const distance = Math.hypot(antes.node(near).x - node.x, antes.node(near).z - node.z);
      if (distance > 0.05) {
        moved += 1;
        furthest = Math.max(furthest, distance);
      }
    }
    expect(moved, 'nenhum nó precisou sair de dentro do cenário — o teste não está medindo nada').toBeGreaterThan(0);
    expect(furthest, 'um ponto de passagem andou longe demais da planta da cidade').toBeLessThan(4);
    region.dispose();
  });

  it('Rosas Park não perde nada: as pontes continuam na rede', () => {
    const region = buildRegion('rosas-park');
    const edgeBlocked = (ax: number, az: number, bx: number, bz: number) => region.body.corridorBlocked(ax, az, bx, bz);
    const pointBlocked = (x: number, z: number, fx: number, fz: number) => !region.body.reachableFrom(x, z, fx, fz);
    const antes = buildRosasWalkNetwork({ blocked: region.blocked, edgeBlocked });
    const depois = buildRosasWalkNetwork({ blocked: region.blocked, edgeBlocked, pointBlocked });
    expect(depois.nodes.length).toBe(antes.nodes.length);
    // O tabuleiro de uma ponte fica 88 cm acima do terreno: julgado do
    // terreno, seria "inalcançável". A pergunta é feita da altura de
    // quem vem andando pela própria ponte, então elas sobrevivem.
    const pontes = depois.nodes.filter((node) => node.kind === 'ponte').length;
    expect(pontes).toBe(antes.nodes.filter((node) => node.kind === 'ponte').length);
    expect(pontes).toBeGreaterThan(0);
    region.dispose();
  });
});

function reachable(network: WalkNetwork): number {
  if (network.nodes.length === 0) return 0;
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    for (const next of network.neighbors(current)) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size;
}

describe('os 54 habitantes nascem espalhados', () => {
  for (const regionId of ['aurora-city', 'rosas-park']) {
    it(`${regionId}: distribuição inicial`, () => {
      const { region, npcs } = makeCity(regionId);
      const people = npcs.people;
      expect(people.length).toBe(54);

      const spread = spreadOf(people);
      expect(spread.closest, 'duas pessoas nasceram em cima uma da outra').toBeGreaterThan(0.7);
      expect(spread.cluster, 'nasceu um monte de gente no mesmo canto').toBeLessThanOrEqual(4);
      expect(spread.cells, 'a população nasceu concentrada em poucos cantos').toBeGreaterThanOrEqual(regionId === 'aurora-city' ? 25 : 18);

      // Cada um no seu ponto: nada de duas pessoas no mesmo nó.
      const nodes = new Set(people.map((p) => `${p.x.toFixed(2)}:${p.z.toFixed(2)}`));
      expect(nodes.size).toBe(people.length);
      region.dispose();
    });
  }

  it('cada habitante sai de casa com o seu próprio destino', () => {
    const { region, npcs } = makeCity('aurora-city');
    const goals = npcs.people.map((person) => person.goal);
    expect(goals.every((goal) => goal >= 0), 'alguém nasceu sem rumo').toBe(true);

    const distinct = new Set(goals);
    expect(distinct.size, `só ${distinct.size} destinos distintos para 54 pessoas`).toBeGreaterThanOrEqual(45);

    // Nenhum ponto da cidade vira o destino de meia população.
    const busiest = Math.max(...[...distinct].map((goal) => goals.filter((other) => other === goal).length));
    expect(busiest, 'gente demais indo para o mesmo ponto').toBeLessThanOrEqual(2);
    region.dispose();
  });
});

describe('dois minutos de cidade, registrados', () => {
  for (const regionId of ['aurora-city', 'rosas-park']) {
    it(`${regionId}: a população não se junta num monte`, () => {
      const { region, npcs } = makeCity(regionId);
      const people = npcs.people;
      const log: string[] = [];
      const worst = { cluster: 0, cells: Infinity };

      run(npcs, 120, new WorldClock(), (second) => {
        if (second % 10 !== 0) return;
        const spread = spreadOf(people);
        worst.cluster = Math.max(worst.cluster, spread.cluster);
        worst.cells = Math.min(worst.cells, spread.cells);
        log.push(
          `  t=${String(second).padStart(3)}s  maior grupo 5 m=${String(spread.cluster).padStart(2)}  células 20 m=${String(spread.cells).padStart(2)}  raio médio=${spread.radius.toFixed(0)} m`,
        );
      });
      console.log(`${regionId} — distribuição ao longo de 120 s:\n${log.join('\n')}`);

      expect(worst.cluster, 'formou-se um aglomerado de gente').toBeLessThanOrEqual(8);
      expect(worst.cells, 'a cidade encolheu para poucos cantos').toBeGreaterThanOrEqual(regionId === 'aurora-city' ? 25 : 16);

      // Diversidade de destinos ao fim da simulação.
      const goals = npcs.people.map((person) => person.goal).filter((goal) => goal >= 0);
      expect(new Set(goals).size, 'a população convergiu para poucos destinos').toBeGreaterThanOrEqual(Math.floor(goals.length * 0.75));
      region.dispose();
    }, 120000);
  }

  it('ninguém acaba empilhado em cima de outra pessoa', () => {
    const { region, npcs } = makeCity('aurora-city');
    let tightest = Infinity;
    run(npcs, 120, new WorldClock(), () => {
      tightest = Math.min(tightest, spreadOf(npcs.people).closest);
    });
    // O espaço pessoal é 0,72 m e a separação é iterativa: aceita-se
    // um encosto, não um atravessamento.
    expect(tightest, 'duas pessoas ocuparam o mesmo lugar').toBeGreaterThan(0.45);
    region.dispose();
  }, 120000);
});

describe('ninguém fica preso', () => {
  it('doze minutos de Aurora sem roda de gente em volta da árvore', () => {
    const { region, npcs } = makeCity('aurora-city');
    const people = npcs.people;
    const clock = new WorldClock();
    let worstAtPlanters = 0;
    const history: number[] = [];

    for (let minute = 0; minute < 12; minute += 1) {
      run(npcs, 60, clock);
      const atPlanters = people.filter((person) => PLANTERS.some((planter) => Math.hypot(person.x - planter.x, person.z - planter.z) < 3.6)).length;
      history.push(atPlanters);
      worstAtPlanters = Math.max(worstAtPlanters, atPlanters);
    }
    console.log(`encostados nos canteiros da praça, minuto a minuto: ${history.join(' ')}`);

    // Antes da correção isto subia sem parar dentro de cada período —
    // 4, 6, 8, 10, 13, 15, 16 de 54 — porque quem chegava não saía
    // mais. O número agora oscila com quem passa.
    expect(worstAtPlanters, 'os canteiros voltaram a juntar gente').toBeLessThanOrEqual(8);
    expect(history[history.length - 1]).toBeLessThanOrEqual(8);
    region.dispose();
  }, 300000);

  it('quem chega ao destino escolhe outro e sai de lá', () => {
    const { region, npcs } = makeCity('aurora-city');
    const people = npcs.people;
    const net = npcs.network;
    const state = people.map((person) => ({ goal: person.goal, reached: false }));
    const visited = people.map(() => new Set<number>());
    let arrivals = 0;

    const clock = new WorldClock();
    for (let t = 0; t < 240 * 30; t += 1) {
      clock.update(1 / 30);
      npcs.setFocus(0, 2.16, 30);
      npcs.setPeriod(clock.period);
      npcs.update(1 / 30, t / 30);
      people.forEach((person, i) => {
        const goal = person.goal;
        if (goal !== state[i].goal) {
          // Trocou de destino. Só conta como "chegou e seguiu" quem de
          // fato encostou no ponto antes de escolher outro.
          if (state[i].reached) arrivals += 1;
          state[i] = { goal, reached: false };
          if (goal >= 0) visited[i].add(goal);
          return;
        }
        if (goal >= 0 && person.distanceTo(net.node(goal).x, net.node(goal).z) < 1.2) state[i].reached = true;
      });
    }

    const andarilhos = visited.filter((set) => set.size >= 2).length;
    console.log(`em 240 s: ${arrivals} chegadas seguidas de novo destino; ${andarilhos}/54 pessoas tiveram 2 ou mais destinos`);
    expect(arrivals, 'ninguém chegou a um destino e escolheu outro').toBeGreaterThanOrEqual(10);
    expect(andarilhos, 'a maior parte da cidade ficou com um destino só').toBeGreaterThanOrEqual(40);
    region.dispose();
  }, 300000);

  it('todo mundo anda de verdade em dois minutos', () => {
    const { region, npcs } = makeCity('aurora-city');
    const before = npcs.people.map((person) => ({ x: person.x, z: person.z }));
    run(npcs, 120);
    const still = npcs.people.filter((person, i) => Math.hypot(person.x - before[i].x, person.z - before[i].z) < 5);
    expect(
      still.length,
      `parados: ${still.map((p) => `(${p.x.toFixed(0)},${p.z.toFixed(0)})`).join(' ')}`,
    ).toBeLessThanOrEqual(3);
    region.dispose();
  }, 120000);
});

describe('o quadro de destinos', () => {
  it('conta quem vai para onde e devolve o lugar ao sair', () => {
    const board = new DestinationBoard();
    expect(board.count(7)).toBe(0);
    board.claim(7);
    board.claim(7);
    expect(board.count(7)).toBe(2);
    board.release(7);
    expect(board.count(7)).toBe(1);
    board.release(7);
    expect(board.count(7)).toBe(0);
    expect(board.distinct).toBe(0);
    board.release(-1);
    board.claim(-1);
    expect(board.distinct).toBe(0);
  });

  it('manda a próxima pessoa para o ponto menos disputado', () => {
    const board = new DestinationBoard();
    // 1 com três pessoas a caminho, 2 com duas, 3 com uma.
    for (const node of [1, 1, 1, 2, 2, 3]) board.claim(node);
    expect(board.leastBusy([1, 2, 3], createRng(5))).toBe(3);
    // Agora 3 encheu: a vez é do 2.
    board.claim(3);
    board.claim(3);
    expect(board.leastBusy([1, 2, 3], createRng(5))).toBe(2);
  });

  it('desempata por sorteio, para a ordem da lista não virar preferência', () => {
    const board = new DestinationBoard();
    const seen = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) seen.add(board.leastBusy([10, 11, 12, 13], createRng(seed)));
    expect(seen.size, 'escolheu sempre o mesmo candidato entre iguais').toBeGreaterThan(1);
  });

  it('lista vazia não quebra', () => {
    expect(new DestinationBoard().leastBusy([], createRng(1))).toBe(-1);
  });
});

describe('as correções da PR #12 continuam de pé', () => {
  for (const regionId of ['aurora-city', 'rosas-park']) {
    it(`${regionId}: ninguém fica enterrado no chão depois de andar`, () => {
      const { region, npcs } = makeCity(regionId);
      run(npcs, 60);
      for (const person of npcs.people) {
        const floor = region.body.heightAt(person.x, person.z, person.y + 0.6);
        expect(Math.abs(person.y - floor), `${person.profile.name} está a ${(person.y - floor).toFixed(2)} m do chão`).toBeLessThan(0.05);
      }
      region.dispose();
    }, 120000);
  }

  it('a rede continua inteira e sem ligação intransponível', () => {
    const { region, npcs } = makeCity('aurora-city');
    const net = npcs.network;
    expect(reachable(net)).toBe(net.nodes.length);
    for (const node of net.nodes) {
      expect(net.neighbors(node.id).length, `nó solto em ${node.x},${node.z}`).toBeGreaterThan(0);
      for (const other of net.neighbors(node.id)) {
        const b = net.node(other);
        expect(region.body.corridorBlocked(node.x, node.z, b.x, b.z), `ligação sem passagem ${node.id}→${other}`).toBe(false);
      }
    }
    region.dispose();
  });

  it('ninguém atravessa os canteiros, nem depois de doze minutos', () => {
    const { region, npcs } = makeCity('aurora-city');
    const clock = new WorldClock();
    let inside = 0;
    for (let minute = 0; minute < 12; minute += 1) {
      run(npcs, 60, clock);
      for (const person of npcs.people) {
        for (const planter of PLANTERS) {
          // Raio do canteiro 2,4 m + raio do corpo: quem está mais perto
          // que isso entrou no canteiro.
          if (Math.hypot(person.x - planter.x, person.z - planter.z) < 2.4) inside += 1;
        }
      }
    }
    expect(inside, 'alguém entrou dentro de um canteiro — a colisão regrediu').toBe(0);
    region.dispose();
  }, 300000);

  it('a separação vale para a cidade inteira, não só para quem está desenhado', () => {
    const { region, npcs } = makeCity('aurora-city');
    // O jogador fica num canto do mapa: ninguém aqui está desenhado.
    const dt = 1 / 30;
    for (let t = 0; t < 120 * 30; t += 1) {
      npcs.setFocus(-230, 0, -230);
      npcs.setPeriod('tarde');
      npcs.update(dt, t * dt);
    }
    expect(spreadOf(npcs.people).closest, 'longe dos olhos do jogador a população se empilhou').toBeGreaterThan(0.45);
    region.dispose();
  }, 120000);
});
