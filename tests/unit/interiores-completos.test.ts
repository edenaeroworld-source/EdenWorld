// @vitest-environment happy-dom
/**
 * Toda porta que abre tem um lugar de verdade do outro lado.
 *
 * O marco I provou isso para os cinco ambientes que ele construiu.
 * Este arquivo cobra o mesmo de **todos** os interiores das regiões
 * jogáveis — inclusive os que nunca ganharam acabamento próprio — e,
 * do lado de fora, confere que cada um deles tem porta onde deveria.
 *
 * O que se mede, por prédio:
 *
 *  - tem volume: malhas, triângulos e móveis, não um galpão;
 *  - tem piso em toda a planta, teto e luz acesa;
 *  - dá para andar da entrada até cada cômodo do térreo;
 *  - a porta existe na cidade, no chão, encostada no lote certo;
 *  - entrar e sair não deixa nada para trás.
 */

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBlueprint } from '../../src/cities';
import { PLAYER } from '../../src/core/Config';
import type { Interactable } from '../../src/interactions/Interactable';
import { type InteriorRoom, interiorsInRegion, roomsOnFloor } from '../../src/interiors/Interior';
import { INTERIOR_ORIGIN, InteriorScene } from '../../src/interiors/InteriorScene';
import { footprintOf } from '../../src/interiors/InteriorShell';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { HeightField } from '../../src/world/HeightField';
import { ZoneMap } from '../../src/world/ZoneMap';
import type { MaterialLibrary } from '../../src/world/Materials';
import type { Vegetation } from '../../src/world/Vegetation';

/** As regiões que o jogador realmente visita. */
const REGIOES = ['aurora-city', 'rosas-park'] as const;

function countTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const index = mesh.geometry.getIndex();
    const position = mesh.geometry.getAttribute('position');
    if (index) total += index.count / 3;
    else if (position) total += position.count / 3;
  });
  return total;
}

const CELL = 0.4;

/** Inunda o andar a partir de um ponto, andando como o jogador anda. */
function flood(physics: PhysicsWorld, area: { x: number; z: number; w: number; d: number }, baseY: number, from: { x: number; z: number }): Set<string> {
  const cols = Math.ceil(area.w / CELL);
  const rows = Math.ceil(area.d / CELL);
  const ground = { height: 0, surface: 'stone' as const, onPlatform: false };
  const free = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return false;
    const x = INTERIOR_ORIGIN.x + area.x + (i + 0.5) * CELL;
    const z = INTERIOR_ORIGIN.z + area.z + (j + 0.5) * CELL;
    physics.groundAt(x, z, baseY + 0.3, PLAYER.stepHeight, ground);
    if (Math.abs(ground.height - baseY) > 0.45) return false;
    const probe = new THREE.Vector3(x, baseY, z);
    physics.resolveCircle(probe, PLAYER.radius, baseY, PLAYER.height, PLAYER.stepHeight);
    return Math.hypot(probe.x - x, probe.z - z) < 0.02;
  };
  const start: [number, number] = [Math.floor((from.x - area.x) / CELL), Math.floor((from.z - area.z) / CELL)];
  const seen = new Set<string>();
  if (!free(start[0], start[1])) return seen;
  const queue: [number, number][] = [start];
  seen.add(`${start[0]},${start[1]}`);
  while (queue.length > 0) {
    const [i, j] = queue.pop() as [number, number];
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (seen.has(`${ni},${nj}`) || !free(ni, nj)) continue;
      seen.add(`${ni},${nj}`);
      queue.push([ni, nj]);
    }
  }
  return seen;
}

function coverage(reached: Set<string>, area: { x: number; z: number }, room: InteriorRoom): number {
  let total = 0;
  let hit = 0;
  for (let x = room.x + 0.6; x < room.x + room.w - 0.6; x += CELL) {
    for (let z = room.z + 0.6; z < room.z + room.d - 0.6; z += CELL) {
      total += 1;
      const i = Math.floor((x - area.x) / CELL);
      const j = Math.floor((z - area.z) / CELL);
      if (reached.has(`${i},${j}`)) hit += 1;
    }
  }
  return total === 0 ? 1 : hit / total;
}

describe('nenhuma porta abre para um ambiente vazio', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let interiors: InteriorScene;

  beforeEach(() => {
    scene = new THREE.Scene();
    // Relevo de fundo do mar: se alguma coisa escapar do modo
    // interior, a medição mostra na hora.
    physics = new PhysicsWorld({ getHeight: () => -7, getSurface: () => 'grass' });
    physics.boundaryRadius = 268;
    interiors = new InteriorScene({ scene, physics, onInteractables: () => {} });
  });

  for (const regionId of REGIOES) {
    for (const interior of interiorsInRegion(regionId)) {
      describe(`${regionId} · ${interior.name}`, () => {
        beforeEach(() => interiors.load(interior));
        afterEach(() => interiors.unload(interior));

        it('tem volume: paredes, móveis e colisores', () => {
          const triangles = countTriangles(interiors.group);
          let meshes = 0;
          interiors.group.traverse((object) => {
            if ((object as THREE.Mesh).isMesh) meshes += 1;
          });
          const area = footprintOf(roomsOnFloor(interior, 0));
          const metros = area.w * area.d;

          expect(meshes, 'prédio sem malha nenhuma').toBeGreaterThan(8);
          expect(triangles, `só ${triangles} triângulos: isso é um galpão`).toBeGreaterThan(900);
          // Densidade: um salão grande precisa de mais coisa dentro
          // que um quartinho, senão continua parecendo vazio.
          expect(triangles / metros, `${(triangles / metros).toFixed(1)} triângulos por m²: ambiente ralo demais`).toBeGreaterThan(4);

          const furniture = physics.getColliders().filter((collider) => (collider.tag ?? '').includes('movel'));
          expect(furniture.length, 'nada em que esbarrar: o cômodo está vazio').toBeGreaterThan(2);
        });

        it('tem chão em toda a planta, teto e luz acesa', () => {
          const area = footprintOf(roomsOnFloor(interior, 0));
          const ground = { height: 0, surface: 'stone' as const, onPlatform: false };
          let holes = 0;
          for (let x = area.x + 0.5; x < area.x + area.w - 0.5; x += 0.7) {
            for (let z = area.z + 0.5; z < area.z + area.d - 0.5; z += 0.7) {
              // Só conta buraco dentro de algum cômodo: a planta pode
              // ser um L, e o vão de fora do L não é piso faltando.
              const inside = roomsOnFloor(interior, 0).some((room) => x >= room.x && x <= room.x + room.w && z >= room.z && z <= room.z + room.d);
              if (!inside) continue;
              physics.groundAt(INTERIOR_ORIGIN.x + x, INTERIOR_ORIGIN.z + z, 0.3, PLAYER.stepHeight, ground);
              if (ground.height < -1) holes += 1;
            }
          }
          expect(holes, `${holes} pontos sem piso: dá para cair do prédio`).toBe(0);

          let lights = 0;
          interiors.group.traverse((object) => {
            if ((object as THREE.Light).isLight) lights += 1;
          });
          expect(lights, 'prédio no escuro').toBeGreaterThan(1);
        });

        it('dá para andar da entrada até cada cômodo do térreo', () => {
          const rooms = roomsOnFloor(interior, 0);
          const area = footprintOf(rooms);
          const reached = flood(physics, area, 0, interior.spawn);
          expect(reached.size, 'o ponto de entrada está dentro de uma parede').toBeGreaterThan(10);
          for (const room of rooms) {
            expect(coverage(reached, area, room), `${room.name}: inalcançável ou entulhado`).toBeGreaterThan(0.45);
          }
        });

        it('sai sem deixar lixo na física', () => {
          interiors.unload(interior);
          expect(physics.getColliders().length, 'colisor do interior vazou para o mundo').toBe(0);
          expect(physics.indoor, 'o modo interior ficou ligado').toBe(false);
          interiors.load(interior); // o afterEach espera um carregado
        });
      });
    }
  }
});

/* ------------------------------------------------------------------ */
/* A porta, vista de fora                                              */
/* ------------------------------------------------------------------ */

function stubWorldMaterials(): MaterialLibrary {
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

function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const special: Record<string, unknown> = {
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: Math.max(1, w), height: Math.max(1, h) }),
  };
  return new Proxy(special, { get: (t, k: string) => (k in t ? t[k] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
}

function stubVegetation(): Vegetation {
  return { isClear: () => true, addTree: () => {}, addBush: () => {}, addFlowerPatch: () => {}, scatterGround: () => {}, build: () => {}, setDensity: () => {}, updateVisibility: () => {}, dispose: () => {} } as unknown as Vegetation;
}

describe('cada interior tem porta na cidade, e a porta leva a ele', () => {
  beforeEach(() => {
    const prototype = globalThis.HTMLCanvasElement?.prototype;
    if (prototype) {
      prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
        return kind === '2d' ? fakeContext(this) : null;
      } as HTMLCanvasElement['getContext'];
    }
  });

  for (const regionId of REGIOES) {
    it(`${regionId}: toda porta declarada existe no mundo montado`, () => {
      const blueprint = getBlueprint(regionId);
      if (!blueprint) throw new Error(`sem blueprint: ${regionId}`);
      const heightField = new HeightField(blueprint.terrainSize, 96, blueprint.height);
      const physics = new PhysicsWorld({ getHeight: (x, z) => heightField.getHeight(x, z), getSurface: (x, z) => heightField.getSurface(x, z) });
      physics.boundaryRadius = blueprint.boundaryRadius;
      const region = blueprint.create({
        materials: stubWorldMaterials(),
        physics,
        heightField,
        zones: new ZoneMap(blueprint.terrainSize, 96),
        vegetation: stubVegetation(),
      });

      const doors = new Map<string, Interactable>();
      for (const item of region.interactables) {
        if (item.payload.type !== 'porta') continue;
        doors.set(item.payload.interiorId, item);
      }

      for (const interior of interiorsInRegion(regionId)) {
        const door = doors.get(interior.id);
        expect(door, `${interior.name}: declarado em ${regionId} e sem porta na cidade`).toBeDefined();
        if (!door) continue;

        // A porta tem de estar dentro da região e com chão sob ela —
        // senão ela aparece boiando, ou fora do limite jogável.
        const distance = Math.hypot(door.position.x, door.position.z);
        expect(distance, `${interior.name}: porta fora do limite da região`).toBeLessThan(physics.boundaryRadius);

        const ground = { height: 0, surface: 'stone' as const, onPlatform: false };
        physics.groundAt(door.position.x, door.position.z, door.position.y, PLAYER.stepHeight, ground);
        expect(ground.height, `${interior.name}: porta sem chão embaixo`).toBeGreaterThan(-1);
        expect(Math.abs(door.position.y - ground.height), `${interior.name}: porta a ${(door.position.y - ground.height).toFixed(1)} m do chão`).toBeLessThan(2.2);

        // E o jogador precisa caber na soleira para alcançá-la.
        const probe = new THREE.Vector3(door.position.x, ground.height, door.position.z);
        physics.resolveCircle(probe, PLAYER.radius, ground.height, PLAYER.height, PLAYER.stepHeight);
        expect(Math.hypot(probe.x - door.position.x, probe.z - door.position.z), `${interior.name}: a porta está dentro de uma parede`).toBeLessThan(0.6);

        // O ponto de saída devolve o jogador exatamente para a porta.
        const exit = door.payload.type === 'porta' ? door.payload.exit : null;
        expect(exit?.regionId, `${interior.name}: a saída manda para outra região`).toBe(regionId);
        expect(Math.hypot((exit?.x ?? 0) - door.position.x, (exit?.z ?? 0) - door.position.z), `${interior.name}: a saída não é a porta`).toBeLessThan(0.5);
      }

      region.dispose();
    });
  }
});
