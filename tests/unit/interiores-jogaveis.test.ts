/**
 * Os cinco ambientes do marco I, medidos como ambientes — não como
 * dados.
 *
 * "O blueprint existe" nunca foi prova de nada: a EdenTech estava
 * declarada havia marcos e nunca tinha sido construída. O que estes
 * testes verificam é o prédio depois de montado:
 *
 *  - tem volume (malha, triângulos, móveis), e não um galpão vazio;
 *  - o piso cobre o prédio inteiro, sem buraco para cair;
 *  - **dá para andar de um cômodo a outro** — inundação a partir do
 *    ponto de entrada, com o raio do jogador, passando pelas portas e
 *    contornando os móveis;
 *  - a escada liga os andares de verdade;
 *  - cada ambiente é diferente dos outros.
 *
 * A inundação é o teste que importa. Uma porta larga demais, uma
 * bancada em cima da passagem ou uma parede fechada por engano
 * aparecem aqui como um cômodo inalcançável.
 */

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/core/Config';
import { getInterior, type InteriorDef, type InteriorRoom, roomsOnFloor } from '../../src/interiors/Interior';
import { FLOOR_HEIGHT } from '../../src/interiors/InteriorKit';
import { INTERIOR_ORIGIN, InteriorScene } from '../../src/interiors/InteriorScene';
import type { InteriorMaterials } from '../../src/interiors/InteriorScene';
import { footprintOf, stairwellOf } from '../../src/interiors/InteriorShell';
import { furnishedInteriorIds } from '../../src/interiors/fitouts';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';

/** Os cinco ambientes que o marco exige construídos. */
const MARCO = [
  { id: 'apto-aurora-12', titulo: 'Residência de Aurora City' },
  { id: 'torre-zenite', titulo: 'EdenTech (Torre Zênite)' },
  { id: 'mercado-eden', titulo: 'EdenStore (Mercado Éden)' },
  { id: 'edenpawl-aurora', titulo: 'EdenPawl' },
  { id: 'centro-edenconnect', titulo: 'Edifício público' },
] as const;

function stubMaterials(): InteriorMaterials {
  const make = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial();
  return {
    wood: make(),
    stone: make(),
    white: make(),
    facade: make(),
    glass: make(),
    crystal: make(),
    metal: make(),
  } as unknown as InteriorMaterials;
}

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

/**
 * Inunda o andar a partir de um ponto, andando como o jogador anda.
 *
 * Uma célula é livre quando o corpo do jogador cabe nela sem ser
 * empurrado e quando existe chão na altura deste andar — os mesmos
 * dois testes que o motor faz a cada quadro.
 */
function flood(physics: PhysicsWorld, area: { x: number; z: number; w: number; d: number }, baseY: number, from: { x: number; z: number }): Set<string> {
  const cols = Math.ceil(area.w / CELL);
  const rows = Math.ceil(area.d / CELL);
  const key = (i: number, j: number): string => `${i},${j}`;
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
  seen.add(key(start[0], start[1]));
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
      if (seen.has(key(ni, nj)) || !free(ni, nj)) continue;
      seen.add(key(ni, nj));
      queue.push([ni, nj]);
    }
  }
  return seen;
}

/** Fração do cômodo que a inundação alcançou. */
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

describe('os cinco ambientes do marco I', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let interiors: InteriorScene;

  beforeEach(() => {
    scene = new THREE.Scene();
    // Relevo de fundo do mar: se alguma coisa escapar do modo interior,
    // a medição mostra na hora.
    physics = new PhysicsWorld({ getHeight: () => -7, getSurface: () => 'grass' });
    physics.boundaryRadius = 268;
    interiors = new InteriorScene({ scene, materials: stubMaterials(), physics, onInteractables: () => {} });
  });

  it('os cinco existem, e todos têm acabamento próprio', () => {
    const furnished = furnishedInteriorIds();
    expect(furnished).toHaveLength(5);
    for (const { id, titulo } of MARCO) {
      const interior = getInterior(id);
      expect(interior, titulo).toBeDefined();
      expect(interior?.fitout, `${titulo}: precisa de acabamento próprio`).toBeTruthy();
    }
  });

  for (const { id, titulo } of MARCO) {
    describe(titulo, () => {
      let interior: InteriorDef;

      beforeEach(() => {
        interior = getInterior(id) as InteriorDef;
        interiors.load(interior);
      });

      it('é um ambiente construído, e não um galpão vazio', () => {
        const triangles = countTriangles(interiors.group);
        expect(triangles, 'triângulos').toBeGreaterThan(4000);
        // Móveis: colisão própria, acima do piso e das paredes.
        const furniture = physics.getColliders().filter((collider) => (collider.tag ?? '').startsWith('interior:movel'));
        expect(furniture.length, 'móveis com volume').toBeGreaterThan(10);
      });

      it('tem piso, paredes, teto e luz acesa', () => {
        const tags = physics.getColliders().map((collider) => collider.tag ?? '');
        expect(tags.some((tag) => tag.startsWith('interior:piso'))).toBe(true);
        expect(tags.some((tag) => tag.startsWith('interior:parede:fachada'))).toBe(true);
        let lights = 0;
        interiors.group.traverse((object) => {
          if ((object as THREE.Light).isLight) lights += 1;
        });
        expect(lights, 'pontos de luz').toBeGreaterThan(3);
      });

      it('tem janela para fora em pelo menos um cômodo', () => {
        const tags = physics.getColliders().map((collider) => collider.tag ?? '');
        expect(tags.some((tag) => tag.startsWith('interior:parede:janela'))).toBe(true);
      });

      it('o piso cobre o prédio inteiro: não há onde cair', () => {
        const ground = { height: 0, surface: 'stone' as const, onPlatform: false };
        // O vão da escada é um buraco de propósito — mas um buraco com
        // degraus embaixo, nunca o vazio.
        const stair = interior.floors > 1 ? stairwellOf(interior) : null;
        const inStairwell = (x: number, z: number): boolean =>
          stair !== null && x >= stair.x - 0.3 && x <= stair.x + stair.w + 0.3 && z >= stair.z - 0.3 && z <= stair.z + stair.d + 0.3;

        for (let floor = 0; floor < interior.floors; floor += 1) {
          const rooms = roomsOnFloor(interior, floor);
          if (rooms.length === 0) continue;
          const baseY = floor * FLOOR_HEIGHT;
          for (const room of rooms) {
            for (let x = room.x + 0.3; x < room.x + room.w; x += 0.9) {
              for (let z = room.z + 0.3; z < room.z + room.d; z += 0.9) {
                physics.groundAt(INTERIOR_ORIGIN.x + x, INTERIOR_ORIGIN.z + z, baseY + 0.4, PLAYER.stepHeight, ground);
                const limit = inStairwell(x, z) ? -0.3 : baseY - 0.5;
                expect(ground.height, `${room.id} em ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(limit);
              }
            }
          }
        }
      });

      it('dá para andar da porta até todos os cômodos do térreo', () => {
        const rooms = roomsOnFloor(interior, 0);
        const area = footprintOf(rooms);
        const reached = flood(physics, area, 0, interior.spawn);
        expect(reached.size, 'área alcançada a partir da entrada').toBeGreaterThan(40);
        for (const room of rooms) {
          expect(coverage(reached, area, room), `${room.name} inalcançável a partir da entrada`).toBeGreaterThan(0.45);
        }
      });

      it('nenhum móvel interativo está preso dentro de outra coisa', () => {
        for (const prop of interior.props) {
          const x = INTERIOR_ORIGIN.x + prop.x;
          const z = INTERIOR_ORIGIN.z + prop.z;
          const baseY = prop.floor * FLOOR_HEIGHT;
          // Existe lugar para ficar de pé a até 2,2 m do móvel?
          let standable = false;
          for (let a = 0; a < 12 && !standable; a += 1) {
            for (const r of [1.2, 1.7, 2.2]) {
              const angle = (a / 12) * Math.PI * 2;
              const px = x + Math.cos(angle) * r;
              const pz = z + Math.sin(angle) * r;
              const probe = new THREE.Vector3(px, baseY, pz);
              physics.resolveCircle(probe, PLAYER.radius, baseY, PLAYER.height, PLAYER.stepHeight);
              if (Math.hypot(probe.x - px, probe.z - pz) < 0.02) {
                standable = true;
                break;
              }
            }
          }
          expect(standable, `${prop.name}: não há onde ficar de pé para interagir`).toBe(true);
        }
      });

      it('sai sem deixar lixo na cena nem na física', () => {
        const before = physics.getColliders().length;
        expect(before).toBeGreaterThan(20);
        interiors.unload(interior);
        expect(physics.getColliders()).toHaveLength(0);
        expect(interiors.group.children).toHaveLength(0);
        expect(interiors.items).toHaveLength(0);
        expect(physics.indoor).toBe(false);
      });
    });
  }

  it('os prédios de vários andares constroem todos eles, e a escada liga', () => {
    for (const id of ['torre-zenite', 'mercado-eden']) {
      const interior = getInterior(id) as InteriorDef;
      interiors.load(interior);
      const ground = { height: 0, surface: 'stone' as const, onPlatform: false };

      for (let floor = 1; floor < interior.floors; floor += 1) {
        const rooms = roomsOnFloor(interior, floor);
        expect(rooms.length, `${id}: andar ${floor} declarado`).toBeGreaterThan(0);
        const area = footprintOf(rooms);
        const baseY = floor * FLOOR_HEIGHT;
        // Há piso neste andar, longe do vão da escada.
        physics.groundAt(INTERIOR_ORIGIN.x + area.x + 2, INTERIOR_ORIGIN.z + area.z + 2, baseY + 0.4, PLAYER.stepHeight, ground);
        expect(ground.height, `${id}: piso do andar ${floor}`).toBeCloseTo(baseY, 1);

        // A escada sobe: cada degrau está no alcance do passo do anterior.
        const stair = stairwellOf(interior);
        let previous = (floor - 1) * FLOOR_HEIGHT;
        const alongZ = stair.d >= stair.w;
        const run = alongZ ? stair.d : stair.w;
        const forward = Math.cos(stair.yaw) >= 0 ? 1 : -1;
        const start = forward > 0 ? (alongZ ? stair.z : stair.x) : alongZ ? stair.z + stair.d : stair.x + stair.w;
        const steps = 10;
        for (let i = 0; i < steps; i += 1) {
          const centre = start + forward * ((i + 0.5) * (run / steps));
          const x = INTERIOR_ORIGIN.x + (alongZ ? stair.x + stair.w / 2 : centre);
          const z = INTERIOR_ORIGIN.z + (alongZ ? centre : stair.z + stair.d / 2);
          physics.groundAt(x, z, previous + 0.2, PLAYER.stepHeight, ground);
          expect(ground.height - previous, `${id}: degrau ${i} alto demais`).toBeLessThanOrEqual(PLAYER.stepHeight + 0.001);
          expect(ground.height, `${id}: degrau ${i} não subiu`).toBeGreaterThan(previous - 0.01);
          previous = ground.height;
        }
        expect(previous, `${id}: a escada chega ao andar ${floor}`).toBeCloseTo(baseY, 1);
      }
      interiors.unload(interior);
    }
  });

  it('há gente dentro das lojas e do prédio público', () => {
    for (const { id, titulo } of MARCO) {
      if (id === 'apto-aurora-12') continue; // a casa é sua; ninguém mora junto
      interiors.load(getInterior(id) as InteriorDef);
      expect(interiors.population, `${titulo}: ninguém dentro`).toBeGreaterThan(1);
      interiors.unload(getInterior(id) as InteriorDef);
    }
  });

  it('cada ambiente é diferente dos outros, e não a mesma sala renomeada', () => {
    const fingerprints = new Map<string, number>();
    for (const { id } of MARCO) {
      const interior = getInterior(id) as InteriorDef;
      interiors.load(interior);
      // Assinatura: quantidade de móveis sólidos e de triângulos.
      const furniture = physics.getColliders().filter((collider) => (collider.tag ?? '').startsWith('interior:movel')).length;
      fingerprints.set(id, furniture * 1000003 + Math.round(countTriangles(interiors.group)));
      interiors.unload(interior);
    }
    expect(new Set(fingerprints.values()).size).toBe(MARCO.length);
  });

  it('o apartamento tem os cômodos que uma casa precisa ter', () => {
    const apartamento = getInterior('apto-aurora-12') as InteriorDef;
    const kinds = apartamento.rooms.map((room) => room.kind);
    for (const required of ['sala', 'cozinha', 'quarto', 'banheiro'] as const) {
      expect(kinds, `falta ${required}`).toContain(required);
    }
  });
});
