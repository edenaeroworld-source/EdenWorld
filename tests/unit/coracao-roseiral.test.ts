// @vitest-environment happy-dom
/**
 * O Coração do Roseiral é para olhar, não para entrar.
 *
 * O relato: Suki-Chan apareceu dentro do Coração do Roseiral, no
 * mesmo ponto em que Saturno aparecia antes. Medido antes da
 * correção, ela estava em (0,000; −24,000) — o **centro exato** da
 * estrutura, a zero metro dela.
 *
 * A causa tinha duas metades que se somavam:
 *
 *  1. O ponto oficial do Roseiral Maior (`roseiral-maior`, em
 *     `Region.ts`) tem as coordenadas (0, −24), que são as do centro
 *     do Coração. Quem fosse mandado para o Roseiral Maior nascia
 *     dentro do mirante.
 *  2. O `settlePlacement` **não conferia o ponto pretendido**. A
 *     consulta de obstáculo só rodava no anel de desempate, que nem
 *     chega a rodar quando mais ninguém disputa o lugar. E não havia
 *     o que conferir de qualquer forma: o piso do mirante era um
 *     colisor **caminhável**, `solid: false`.
 *
 * Por isso trocar quem recebe o lugar não resolvia — a vez passava
 * para o próximo da fila, e foi literalmente o que aconteceu entre
 * Saturno e Suki-Chan.
 *
 * O que se verifica aqui, na região montada de verdade, com física,
 * vegetação e colisão:
 *
 *  1. O jogador esbarra na estrutura vindo de qualquer direção.
 *  2. Nem correndo ele entra.
 *  3. A rede de caminhada contorna a estrutura; nenhuma rota a corta.
 *  4. Nenhum personagem do panteão está dentro dela.
 *  5. Suki-Chan, Saturno e Maze em particular.
 *  6. Dez viagens Aurora↔Rosas não mudam isso.
 *  7. Recarregar a região mantém o bloqueio.
 *  8. Nenhum destino de rotina nem ponto de nascimento cai lá dentro.
 *
 * E, o que é tão importante quanto: a estrutura **continua lá**.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CharacterGround } from '../../src/characters/CharacterGround';
import { getBlueprint } from '../../src/cities';
import { ROSE_GARDEN } from '../../src/cities/rosas-park/RosasLayout';
import { PLAYER, WORLD } from '../../src/core/Config';
import { NpcSystem } from '../../src/npc/NpcSystem';
import { buildRosasWalkNetwork } from '../../src/npc/WalkNetwork';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { type MoveIntent, PlayerMotor } from '../../src/player/PlayerMotor';
import { QualitySystem, defaultGraphicsSettings } from '../../src/systems/QualitySystem';
import { HeightField } from '../../src/world/HeightField';
import {
  KEEP_OUT_CLEARANCE,
  crossesKeepOut,
  insideKeepOut,
  keepOutsFor,
  pushOutOfKeepOut,
} from '../../src/world/KeepOut';
import type { MaterialLibrary } from '../../src/world/Materials';
import { checkRegionIntegrity } from '../../src/world/RegionTransition';
import { Vegetation } from '../../src/world/Vegetation';
import { WorldClock } from '../../src/world/WorldClock';
import { Zone, ZoneMap } from '../../src/world/ZoneMap';

/* ---------------------- a região sem navegador ----------------------- */

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
  id: string;
  body: CharacterGround;
  physics: PhysicsWorld;
  ground: (x: number, z: number) => number;
  blocked: (x: number, z: number) => boolean;
  boundaryRadius: number;
  interactableIds: string[];
  interactables: { id: string; x: number; z: number; range: number }[];
  sceneGroup: THREE.Object3D;
  dispose(): void;
}

/** A região montada como o motor a monta, com vegetação e colisão. */
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
    id: regionId,
    body,
    physics,
    ground: (x, z) => heightField.getHeight(x, z),
    blocked: (x, z) => {
      if (Math.hypot(x, z) > boundaryRadius - 8) return true;
      if (heightField.getHeight(x, z) < WORLD.waterLevel + 0.35) return true;
      return zones.has(x, z, Zone.Water | Zone.Building);
    },
    boundaryRadius,
    interactableIds: scene.interactables.map((item) => item.id),
    interactables: scene.interactables.map((item) => ({ id: item.id, x: item.position.x, z: item.position.z, range: item.range })),
    sceneGroup: scene.group,
    dispose: () => {
      scene.dispose();
      vegetation.dispose();
      physics.clear();
    },
  };
}

/** Um universo que troca de região por baixo dos sistemas, como o motor. */
function makeUniverse(startId: string) {
  const cache = new Map<string, BuiltRegion>();
  const load = (id: string): BuiltRegion => {
    const existing = cache.get(id);
    if (existing) return existing;
    const built = buildRegion(id);
    cache.set(id, built);
    return built;
  };
  let current = load(startId);
  const npcs = new NpcSystem({
    scene: new THREE.Scene(),
    ground: (x, z) => current.ground(x, z),
    blocked: (x, z) => current.blocked(x, z),
    body: current.body,
    quality: new QualitySystem(defaultGraphicsSettings('alta')).current,
    regionId: startId,
  });
  return {
    npcs,
    region: (): BuiltRegion => current,
    enter(id: string): void {
      current = load(id);
      npcs.setBody(current.body);
      npcs.setRegion(id);
    },
    dispose(): void {
      for (const region of cache.values()) region.dispose();
    },
  };
}

/* --------------------------- o alvo do teste -------------------------- */

const HEART = keepOutsFor('rosas-park')[0];
const CENTER = { x: ROSE_GARDEN.x, z: ROSE_GARDEN.z };

/** Distância de um ponto ao centro do Coração. */
function fromHeart(x: number, z: number): number {
  return Math.hypot(x - CENTER.x, z - CENTER.z);
}

const intent = (patch: Partial<MoveIntent> = {}): MoveIntent => ({ x: 0, z: 0, run: false, jump: false, jumpHeld: false, ...patch });

/** Oito rumos de aproximação, para não testar só o lado fácil. */
const APPROACHES = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
  const angle = (i / 8) * Math.PI * 2;
  return { angle, label: `${Math.round((angle * 180) / Math.PI)}°` };
});

describe('o Coração do Roseiral é intransponível', () => {
  /* =================================================================== */
  /* 1 e 2 — o jogador, andando e correndo                               */
  /* =================================================================== */

  describe('o jogador esbarra nele', () => {
    it.each(APPROACHES.map((a) => [a.label, a.angle] as const))(
      'andando a partir de %s, para do lado de fora',
      (_label, angle) => {
        const region = buildRegion('rosas-park');
        const motor = new PlayerMotor(region.physics);

        // Começa 22 m do centro — fora da estrutura, dentro do
        // primeiro terraço — e caminha direto para o meio dela.
        const startX = CENTER.x + Math.cos(angle) * 22;
        const startZ = CENTER.z + Math.sin(angle) * 22;
        motor.teleport(startX, startZ, 0, region.ground(startX, startZ) + 0.5);

        // Rumo ao centro, oito segundos — tempo de sobra para cobrir
        // os 22 m se nada o impedisse.
        const toCenter = { x: -Math.cos(angle), z: -Math.sin(angle) };
        for (let frame = 0; frame < 8 * 60; frame += 1) {
          motor.update(1 / 60, intent({ x: toCenter.x, z: toCenter.z }));
        }

        const distance = fromHeart(motor.position.x, motor.position.z);
        expect(distance, `entrou pelo rumo ${_label}: parou a ${distance.toFixed(2)} m do centro`).toBeGreaterThan(HEART.radius);
        region.dispose();
      },
    );

    it('correndo, também não entra', () => {
      const region = buildRegion('rosas-park');
      const motor = new PlayerMotor(region.physics);

      // Correr é a tentativa séria de atravessar: velocidade maior
      // significa passo maior por quadro, que é como um corpo
      // atravessa uma parede fina sem encostar nela.
      for (const { angle, label } of APPROACHES) {
        const startX = CENTER.x + Math.cos(angle) * 30;
        const startZ = CENTER.z + Math.sin(angle) * 30;
        motor.teleport(startX, startZ, 0, region.ground(startX, startZ) + 0.5);
        let closest = Infinity;
        for (let frame = 0; frame < 10 * 60; frame += 1) {
          motor.update(1 / 60, intent({ x: -Math.cos(angle), z: -Math.sin(angle), run: true }));
          closest = Math.min(closest, fromHeart(motor.position.x, motor.position.z));
        }
        expect(closest, `atravessou correndo pelo rumo ${label}`).toBeGreaterThan(HEART.radius);
      }
      region.dispose();
    });

    it('nem num quadro ruim de celular ele atravessa', () => {
      // Num aparelho fraco o quadro estica. Com dt grande o passo por
      // quadro cresce, e é aí que um corpo passa de um lado ao outro
      // de uma barreira sem nunca estar dentro dela. 100 ms por
      // quadro é um celular em apuros de verdade.
      const region = buildRegion('rosas-park');
      const motor = new PlayerMotor(region.physics);
      const startX = CENTER.x + 30;
      const startZ = CENTER.z;
      motor.teleport(startX, startZ, 0, region.ground(startX, startZ) + 0.5);
      let closest = Infinity;
      for (let frame = 0; frame < 120; frame += 1) {
        motor.update(0.1, intent({ x: -1, z: 0, run: true }));
        closest = Math.min(closest, fromHeart(motor.position.x, motor.position.z));
      }
      expect(closest).toBeGreaterThan(HEART.radius);
      region.dispose();
    });

    it('teleportado para dentro, a física o devolve para fora', () => {
      // A proteção contra o teleporte: mesmo que algum sistema o
      // ponha lá dentro, ele não fica.
      const region = buildRegion('rosas-park');
      const motor = new PlayerMotor(region.physics);
      motor.teleport(CENTER.x, CENTER.z, 0, region.ground(CENTER.x, CENTER.z) + 0.5);
      for (let frame = 0; frame < 60; frame += 1) motor.update(1 / 60, intent());
      expect(fromHeart(motor.position.x, motor.position.z)).toBeGreaterThan(HEART.radius);
      region.dispose();
    });

    it('não dá para pular por cima: a barreira é mais alta que o pulo', () => {
      // O pulo sobe v²/2g = 8,3²/48 = 1,44 m. A barreira tem 6 m
      // acima do ponto mais alto do terreno sob ela. A conta é feita
      // aqui para que mexer em `jumpSpeed` ou em `KEEP_OUT_HEIGHT`
      // acuse o problema em vez de abrir a estrutura em silêncio.
      const apex = (PLAYER.jumpSpeed * PLAYER.jumpSpeed) / (2 * PLAYER.gravity);
      expect(apex).toBeLessThan(HEART.height);

      const region = buildRegion('rosas-park');
      const motor = new PlayerMotor(region.physics);
      const startX = CENTER.x + 14;
      motor.teleport(startX, CENTER.z, 0, region.ground(startX, CENTER.z) + 0.5);
      let closest = Infinity;
      for (let frame = 0; frame < 10 * 60; frame += 1) {
        motor.update(1 / 60, intent({ x: -1, z: 0, run: true, jump: frame % 40 === 0, jumpHeld: true }));
        closest = Math.min(closest, fromHeart(motor.position.x, motor.position.z));
      }
      expect(closest).toBeGreaterThan(HEART.radius);
      region.dispose();
    });
  });

  /* =================================================================== */
  /* 3 e 8 — navegação                                                   */
  /* =================================================================== */

  describe('a navegação contorna, nunca atravessa', () => {
    it('nenhum ponto de passagem da rede cai dentro', () => {
      const region = buildRegion('rosas-park');
      const network = buildRosasWalkNetwork({
        blocked: region.blocked,
        edgeBlocked: (ax, az, bx, bz) => region.body.corridorBlocked(ax, az, bx, bz),
        pointBlocked: (x, z, fx, fz) => !region.body.reachableFrom(x, z, fx, fz),
      });
      const inside: string[] = [];
      for (let id = 0; id < network.size; id += 1) {
        const node = network.node(id);
        if (insideKeepOut(keepOutsFor('rosas-park'), node.x, node.z)) {
          inside.push(`(${node.x.toFixed(1)}, ${node.z.toFixed(1)})`);
        }
      }
      expect(inside, `pontos de passagem dentro do Coração: ${inside.join(' ')}`).toHaveLength(0);
      region.dispose();
    });

    it('nenhuma ligação entre dois pontos corta pelo meio', () => {
      // Dois pontos em lados opostos podem estar ambos livres e a
      // reta entre eles passar por dentro. É essa ligação que faria
      // um habitante cortar caminho pelo Coração em vez de contorná-lo.
      const region = buildRegion('rosas-park');
      const network = buildRosasWalkNetwork({
        blocked: region.blocked,
        edgeBlocked: (ax, az, bx, bz) => region.body.corridorBlocked(ax, az, bx, bz),
        pointBlocked: (x, z, fx, fz) => !region.body.reachableFrom(x, z, fx, fz),
      });
      const zones = keepOutsFor('rosas-park');
      let crossing = 0;
      for (let id = 0; id < network.size; id += 1) {
        const node = network.node(id);
        for (const other of network.neighbors(id)) {
          if (other < id) continue;
          const peer = network.node(other);
          if (crossesKeepOut(zones, node.x, node.z, peer.x, peer.z)) crossing += 1;
        }
      }
      expect(crossing).toBe(0);
      region.dispose();
    });

    it('a regra sozinha basta: sem física nenhuma, a rede já contorna', () => {
      // Teste da camada de navegação **isolada**. Com a física ligada
      // a barreira sólida já afasta os pontos de passagem, e um teste
      // que dependesse disso estaria medindo a física — passaria até
      // se a regra de navegação fosse apagada.
      //
      // Aqui a rede é montada sem `blocked`, sem `pointBlocked` e sem
      // `edgeBlocked`: só a planta e a zona declarada. A zona é
      // inventada e posta em cima do anel do roseiral, que é cheio de
      // pontos de passagem — é lá que dá para ver a regra agir.
      const fake = {
        id: 'zona-de-teste',
        name: 'Zona de Teste',
        x: ROSE_GARDEN.x,
        z: ROSE_GARDEN.z,
        radius: ROSE_GARDEN.tiers[2] + 4, // engole o anel interno inteiro
        height: 6,
      };

      // Controle: sem a zona, aquele espaço é povoado de pontos.
      const open = buildRosasWalkNetwork({ keepOuts: [] });
      let populated = 0;
      for (let id = 0; id < open.size; id += 1) {
        const node = open.node(id);
        if (fromHeart(node.x, node.z) < fake.radius) populated += 1;
      }
      expect(populated, 'o controle não tem pontos onde a zona vai entrar — o teste não provaria nada').toBeGreaterThan(4);

      // Com a zona: nenhum ponto dentro, nenhuma ligação cruzando.
      const guarded = buildRosasWalkNetwork({ keepOuts: [fake] });
      for (let id = 0; id < guarded.size; id += 1) {
        const node = guarded.node(id);
        expect(insideKeepOut([fake], node.x, node.z), `ponto de passagem em (${node.x.toFixed(1)}, ${node.z.toFixed(1)})`).toBeNull();
        for (const other of guarded.neighbors(id)) {
          const peer = guarded.node(other);
          expect(crossesKeepOut([fake], node.x, node.z, peer.x, peer.z)).toBeNull();
        }
      }
      // E a rede continua sendo uma rede: fechar um pedaço não a apagou.
      expect(guarded.size).toBeGreaterThan(open.size * 0.5);
    });

    it('a rota de um lado ao outro passa por fora', () => {
      // A prova de que contornar funciona: existe caminho entre os
      // dois lados opostos do Coração, e nenhum trecho dele entra.
      const region = buildRegion('rosas-park');
      const network = buildRosasWalkNetwork({
        blocked: region.blocked,
        edgeBlocked: (ax, az, bx, bz) => region.body.corridorBlocked(ax, az, bx, bz),
        pointBlocked: (x, z, fx, fz) => !region.body.reachableFrom(x, z, fx, fz),
      });
      const north = network.nearest(CENTER.x, CENTER.z - 20);
      const south = network.nearest(CENTER.x, CENTER.z + 20);
      expect(north).toBeGreaterThanOrEqual(0);
      expect(south).toBeGreaterThanOrEqual(0);

      const route = network.path(north, south);
      expect(route.length, 'não há rota de um lado ao outro do roseiral').toBeGreaterThan(1);
      for (const id of route) {
        const node = network.node(id);
        expect(fromHeart(node.x, node.z), `a rota entra no Coração em (${node.x.toFixed(1)}, ${node.z.toFixed(1)})`).toBeGreaterThanOrEqual(HEART.radius);
      }
      region.dispose();
    });

    it('nenhum habitante nasce dentro, nem vai parar lá em dois minutos de parque', () => {
      const universe = makeUniverse('rosas-park');
      const zones = keepOutsFor('rosas-park');

      const born = universe.npcs.people.filter((person) => insideKeepOut(zones, person.x, person.z));
      expect(born.map((p) => p.profile.name), 'alguém nasceu dentro do Coração').toHaveLength(0);

      // Dois minutos de vida da cidade, com o relógio do jogo: as
      // rotinas trocam de período e todo mundo escolhe destino novo.
      const clock = new WorldClock();
      const dt = 1 / 30;
      let worst = Infinity;
      for (let frame = 0; frame < 120 * 30; frame += 1) {
        clock.update(dt);
        universe.npcs.setFocus(CENTER.x, 2.16, CENTER.z);
        universe.npcs.setPeriod(clock.period);
        universe.npcs.update(dt, frame * dt);
        if (frame % 30 === 0) {
          for (const person of universe.npcs.people) worst = Math.min(worst, fromHeart(person.x, person.z));
        }
      }
      expect(worst, `um habitante chegou a ${worst.toFixed(2)} m do centro`).toBeGreaterThanOrEqual(HEART.radius);
      universe.dispose();
    });
  });

  /* =================================================================== */
  /* 4, 5 e 6 — o panteão                                                */
  /* =================================================================== */

  describe('o panteão fica do lado de fora', () => {
    it('nenhuma deusa aparece dentro do Coração', () => {
      const universe = makeUniverse('rosas-park');
      const zones = keepOutsFor('rosas-park');
      for (const character of universe.npcs.placedCharacters()) {
        if (!character.active) continue;
        const zone = insideKeepOut(zones, character.x, character.z);
        expect(zone, `${character.id} está dentro do ${zone?.name} em (${character.x.toFixed(1)}, ${character.z.toFixed(1)})`).toBeNull();
      }
      universe.dispose();
    });

    it('Suki-Chan, Saturno e Maze em particular', () => {
      // Os três nomes do relato. Suki-Chan estava em (0,000; −24,000),
      // a zero metro do centro; Saturno ocupava o mesmo ponto antes
      // dela. O teste é nominal de propósito: é a regressão relatada.
      const universe = makeUniverse('rosas-park');
      const placed = new Map(universe.npcs.placedCharacters().map((character) => [character.id, character]));
      for (const id of ['suki', 'saturno', 'maze']) {
        const character = placed.get(id);
        expect(character, `${id} não foi posicionado em Rosas Park`).toBeDefined();
        const distance = fromHeart(character!.x, character!.z);
        expect(distance, `${id} está a ${distance.toFixed(2)} m do centro do Coração`).toBeGreaterThan(HEART.radius);
      }
      universe.dispose();
    });

    it('dez viagens Aurora↔Rosas não põem ninguém lá dentro', () => {
      const universe = makeUniverse('aurora-city');
      const zones = keepOutsFor('rosas-park');

      for (let trip = 1; trip <= 5; trip += 1) {
        universe.enter('rosas-park');
        for (const character of universe.npcs.placedCharacters()) {
          if (!character.active) continue;
          expect(
            insideKeepOut(zones, character.x, character.z),
            `viagem ${trip}: ${character.id} entrou no Coração`,
          ).toBeNull();
        }
        // A mesma conferência que a transição de região roda de verdade.
        const report = checkRegionIntegrity({
          regionId: 'rosas-park',
          characters: universe.npcs.placedCharacters(),
          groundAt: (x, z) => universe.region().body.settle(x, z),
          boundaryRadius: universe.region().boundaryRadius,
        });
        expect(report.ok, `viagem ${trip}: ${report.problems.join(' | ')}`).toBe(true);
        universe.enter('aurora-city');
      }
      universe.dispose();
    });

    it('recarregar a região mantém o bloqueio', () => {
      // Montar a região de novo, do zero, é o que acontece ao
      // recarregar a página. A barreira não é estado salvo: ela nasce
      // da planta, então tem de estar lá toda vez.
      for (let load = 0; load < 3; load += 1) {
        const universe = makeUniverse('rosas-park');
        const barriers = (universe.region().physics as unknown as { colliders: { tag?: string; solid: boolean }[] }).colliders.filter(
          (collider) => collider.tag === 'keep-out:coracao-roseiral',
        );
        expect(barriers, `carga ${load}: a barreira não foi montada`).toHaveLength(1);
        expect(barriers[0].solid).toBe(true);
        for (const character of universe.npcs.placedCharacters()) {
          if (!character.active) continue;
          expect(insideKeepOut(keepOutsFor('rosas-park'), character.x, character.z)).toBeNull();
        }
        universe.dispose();
      }
    });

    it('a conferência da transição reprova quem estiver lá dentro', () => {
      // O controle negativo: se a verificação não enxergasse a área
      // proibida, este caso passaria — e um bug igual ao relatado
      // chegaria ao jogador sem ninguém reclamar.
      const ground = 6.73;
      const report = checkRegionIntegrity({
        regionId: 'rosas-park',
        characters: [{ id: 'suki', x: CENTER.x, y: ground, z: CENTER.z, active: true }],
        groundAt: () => ground,
        boundaryRadius: 200,
      });
      expect(report.ok).toBe(false);
      expect(report.problems.join(' ')).toContain('Coração do Roseiral');
    });

    it('a rede de segurança tira de dentro quem for posto à força', () => {
      // A exigência: *mesmo que algum sistema tente posicionar um
      // personagem lá dentro*. Aqui o teste faz o papel desse sistema.
      const universe = makeUniverse('rosas-park');
      const people = universe.npcs.people;
      expect(people.length).toBeGreaterThan(0);

      const victim = people[0];
      victim.x = CENTER.x;
      victim.z = CENTER.z;
      expect(insideKeepOut(keepOutsFor('rosas-park'), victim.x, victim.z)).not.toBeNull();

      universe.npcs.enforceKeepOuts();

      expect(insideKeepOut(keepOutsFor('rosas-park'), victim.x, victim.z)).toBeNull();
      expect(fromHeart(victim.x, victim.z)).toBeGreaterThan(HEART.radius);
      universe.dispose();
    });

    it('não há exceção para o panteão: a regra não cita nome nenhum', () => {
      // A exigência de compatibilidade: "não criar exceções para
      // personagens do Panteão". Um `if (id === 'suki')` escondido em
      // qualquer das quatro camadas apareceria aqui.
      const sources = [
        'src/world/KeepOut.ts',
        'src/npc/NpcSystem.ts',
        'src/npc/WalkNetwork.ts',
        'src/cities/aurora-city/CityContext.ts',
      ];
      const names = ['suki', 'saturno', 'maze', 'luma', 'nexara', 'lilly', 'akemi', 'haru', 'amara', 'jupiter', 'aerion'];
      for (const path of sources) {
        const code = readSource(path);
        // Linhas de código, sem comentários: os comentários **devem**
        // citar os nomes, porque é assim que se conta a história do bug.
        const logic = code
          .split('\n')
          .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
          .join('\n')
          .toLowerCase();
        for (const name of names) {
          expect(logic.includes(`'${name}'`), `${path} trata ${name} como caso especial`).toBe(false);
        }
      }
    });
  });

  /* =================================================================== */
  /* 5 (preservação) — a estrutura continua lá                           */
  /* =================================================================== */

  describe('a estrutura continua lá, inteira', () => {
    it('a barreira tem exatamente a forma e o tamanho do mirante', () => {
      expect(HEART.x).toBe(ROSE_GARDEN.x);
      expect(HEART.z).toBe(ROSE_GARDEN.z);
      expect(HEART.radius).toBe(ROSE_GARDEN.coreRadius);
    });

    it('o piso de vidro e a pérgula continuam exatamente onde estavam', () => {
      // Preservação visual, medida na geometria — não num "ainda há
      // malhas na região", que passaria mesmo com o Coração apagado.
      //
      // O mirante é feito de duas peças: o disco de vidro do piso e
      // os seis arcos brancos da pérgula. Ambos ficam no grupo
      // `rosas:roseiral`, separados por material. Aqui se conta
      // quantos vértices de cada um caem **dentro do miolo** — se
      // alguém "resolver" o bug apagando a estrutura em vez de
      // fechá-la, estes números vão a zero.
      const region = buildRegion('rosas-park');
      const roseiral = region.sceneGroup.getObjectByName('rosas:roseiral');
      expect(roseiral, 'o grupo do roseiral sumiu').toBeDefined();

      const inCore = (name: string): { count: number; minY: number; maxY: number } => {
        const mesh = roseiral!.getObjectByName(name) as THREE.Mesh | undefined;
        if (!mesh) return { count: 0, minY: 0, maxY: 0 };
        const position = mesh.geometry.getAttribute('position');
        let count = 0;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < position.count; i += 1) {
          const x = position.getX(i);
          const y = position.getY(i);
          const z = position.getZ(i);
          if (fromHeart(x, z) > HEART.radius + 0.05) continue;
          count += 1;
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        return { count, minY, maxY };
      };

      const glass = inCore('rosas:roseiral:glass');
      expect(glass.count, 'o piso de vidro do mirante desapareceu').toBeGreaterThan(100);
      // Um disco fino, assentado no chão do miolo: é o piso, não um bloco.
      expect(glass.maxY - glass.minY).toBeLessThan(1);

      const pergola = inCore('rosas:roseiral:white');
      expect(pergola.count, 'a pérgula de arcos desapareceu').toBeGreaterThan(500);
      // Os arcos sobem acima do piso — é o que lhe dá a silhueta.
      expect(pergola.maxY).toBeGreaterThan(glass.maxY);

      region.dispose();
    });

    it('a barreira é só colisão: não acrescentou nenhuma malha', () => {
      // "Os colliders devem ficar invisíveis durante a jogabilidade."
      // Um colisor não é desenhado; o que se verifica é que a
      // barreira não trouxe geometria junto, e que ela existe mesmo
      // assim no mundo físico.
      const region = buildRegion('rosas-park');
      const colliders = (region.physics as unknown as { colliders: { tag?: string }[] }).colliders;
      expect(colliders.filter((collider) => collider.tag === 'keep-out:coracao-roseiral')).toHaveLength(1);

      let named = 0;
      region.sceneGroup.traverse((object) => {
        if (object.name.includes('keep-out')) named += 1;
      });
      expect(named, 'a barreira criou geometria visível').toBe(0);
      region.dispose();
    });

    it('a placa do Coração continua legível, do lado de fora', () => {
      // A estrutura fechada não pode levar junto o conteúdo. A placa
      // saiu do centro para a borda: continua existindo, continua
      // alcançável, e agora é lida de onde se olha a estrutura.
      const region = buildRegion('rosas-park');
      const plaque = region.interactables.find((item) => item.id === 'marco:coracao-roseiral');
      expect(plaque, 'a placa do Coração do Roseiral sumiu').toBeDefined();

      const distance = fromHeart(plaque!.x, plaque!.z);
      expect(distance, 'a placa ficou dentro da barreira, inalcançável').toBeGreaterThan(HEART.radius);

      // Alcançável de fato: existe ponto livre dentro do alcance dela.
      const reachable = APPROACHES.some(({ angle }) => {
        const x = plaque!.x + Math.cos(angle) * (plaque!.range * 0.6);
        const z = plaque!.z + Math.sin(angle) * (plaque!.range * 0.6);
        return !insideKeepOut(keepOutsFor('rosas-park'), x, z) && !region.body.blocked(x, z);
      });
      expect(reachable, 'não há de onde ler a placa').toBe(true);
      region.dispose();
    });
  });

  /* =================================================================== */
  /* a geometria, isolada                                                */
  /* =================================================================== */

  describe('as contas da área proibida', () => {
    it('quem está no centro exato sai mesmo assim', () => {
      // O caso que o bug produziu: distância zero do centro, sem
      // direção radial para calcular. Sem um rumo escolhido à mão a
      // conta seria 0/0 e o personagem ficaria onde estava.
      const out = pushOutOfKeepOut([HEART], CENTER.x, CENTER.z);
      expect(Number.isFinite(out.x)).toBe(true);
      expect(Number.isFinite(out.z)).toBe(true);
      expect(fromHeart(out.x, out.z)).toBeCloseTo(HEART.radius + KEEP_OUT_CLEARANCE, 5);
    });

    it('o empurrão é estável: a mesma entrada dá sempre a mesma saída', () => {
      // Sem isto a região montaria diferente a cada carga, e um
      // personagem encostado na borda tremeria entre dois pontos.
      const a = pushOutOfKeepOut([HEART], CENTER.x, CENTER.z);
      const b = pushOutOfKeepOut([HEART], CENTER.x, CENTER.z);
      expect(a).toEqual(b);
    });

    it('quem já está fora não é movido', () => {
      const far = { x: CENTER.x + 80, z: CENTER.z - 30 };
      const out = pushOutOfKeepOut([HEART], far.x, far.z);
      expect(out.x).toBe(far.x);
      expect(out.z).toBe(far.z);
      expect(out.zone).toBeNull();
    });

    it('sai pelo lado mais próximo, que é por onde se entrou', () => {
      const out = pushOutOfKeepOut([HEART], CENTER.x + 3, CENTER.z);
      expect(out.x).toBeGreaterThan(CENTER.x);
      expect(out.z).toBeCloseTo(CENTER.z, 5);
    });

    it('a reta que passa raspando por fora não conta como travessia', () => {
      const margin = 0.5;
      const grazing = CENTER.z + HEART.radius + margin + 0.1;
      expect(crossesKeepOut([HEART], CENTER.x - 50, grazing, CENTER.x + 50, grazing, margin)).toBeNull();
      expect(crossesKeepOut([HEART], CENTER.x - 50, CENTER.z, CENTER.x + 50, CENTER.z)).not.toBeNull();
    });

    it('uma região sem área declarada não paga nada', () => {
      expect(keepOutsFor('aurora-city')).toHaveLength(0);
      expect(keepOutsFor('uma-regiao-que-nao-existe')).toHaveLength(0);
      const out = pushOutOfKeepOut([], 1, 2);
      expect(out).toEqual({ x: 1, z: 2, zone: null });
    });
  });
});

/** Lê um arquivo do código, para as verificações sobre o próprio código. */
function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}
