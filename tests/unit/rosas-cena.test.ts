/**
 * Rosas Park montada de verdade.
 *
 * Os outros testes olham a planta e o relevo. Este constrói a região
 * inteira — geometria, colisão, interativos, luzes, som — e conta o
 * que saiu. É a diferença entre "a região está declarada" e "a região
 * existe": um cenário vazio não passa daqui.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RosasPark } from '../../src/cities/rosas-park/RosasPark';
import { LANDMARKS, PAVILIONS, ROSAS_TERRAIN_SIZE } from '../../src/cities/rosas-park/RosasLayout';
import { rosasHeight } from '../../src/cities/rosas-park/RosasTerrain';
import { buildRosasZoneMap } from '../../src/cities/rosas-park/RosasZones';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { HeightField } from '../../src/world/HeightField';
import type { MaterialLibrary } from '../../src/world/Materials';
import type { Vegetation } from '../../src/world/Vegetation';
import { Zone } from '../../src/world/ZoneMap';
import { getInterior } from '../../src/interiors/Interior';

/** Biblioteca de materiais sem textura: o teste mede forma, não pixel. */
function stubMaterials(): MaterialLibrary {
  const library: Record<string, THREE.Material> = {};
  for (const name of ['white', 'stone', 'sandstone', 'metal', 'wood', 'facade', 'glass', 'soil', 'crystal', 'orb', 'waterfall', 'trunk', 'leaf', 'bush', 'grass', 'stem', 'petal', 'foliage']) {
    library[name] = new THREE.MeshStandardMaterial({ name });
  }
  return library as unknown as MaterialLibrary;
}

/** Vegetação que só anota o que lhe pediram para plantar. */
function stubVegetation(): { vegetation: Vegetation; trees: unknown[]; bushes: unknown[]; patches: unknown[]; scatters: number } {
  const trees: unknown[] = [];
  const bushes: unknown[] = [];
  const patches: unknown[] = [];
  const record = {
    trees,
    bushes,
    patches,
    scatters: 0,
    addTree: (tree: unknown) => trees.push(tree),
    addBush: (bush: unknown) => bushes.push(bush),
    addFlowerPatch: (patch: unknown) => patches.push(patch),
    scatterGround: () => {
      record.scatters += 1;
    },
  };
  return { vegetation: record as unknown as Vegetation, trees, bushes, patches, get scatters() {
    return record.scatters;
  } };
}

function triangles(root: THREE.Object3D): number {
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

function buildPark() {
  // Resolução reduzida: o relevo é o mesmo, só amostrado mais grosso,
  // para o teste não gastar segundos construindo 288² vértices.
  const heightField = new HeightField(ROSAS_TERRAIN_SIZE, 96, rosasHeight);
  const zones = buildRosasZoneMap(heightField);
  const physics = new PhysicsWorld({
    getHeight: (x, z) => heightField.getHeight(x, z),
    getSurface: () => 'grass',
  });
  const plants = stubVegetation();
  const park = new RosasPark({
    materials: stubMaterials(),
    physics,
    heightField,
    zones,
    vegetation: plants.vegetation,
  });
  return { park, physics, zones, heightField, plants };
}

describe('Rosas Park montada', () => {
  it('produz geometria de verdade, e não um grupo vazio', () => {
    const { park } = buildPark();
    expect(park.group.children.length).toBeGreaterThan(0);
    // Caminhos, cascatas, roseiral, quatro construções, pontes, ilha,
    // marcos e três jardins flutuantes.
    expect(triangles(park.group)).toBeGreaterThan(20_000);
    park.dispose();
  });

  it('dá colisão ao que precisa ser sólido e piso ao que precisa ser pisado', () => {
    const { park, physics } = buildPark();
    const colliders = physics.getColliders();
    expect(colliders.length).toBeGreaterThan(20);

    const tags = colliders.map((collider) => collider.tag ?? '');
    // As construções barram; os pátios e as pontes deixam andar por cima.
    expect(tags.some((tag) => tag === 'rosas:casa-de-cha')).toBe(true);
    expect(tags.some((tag) => tag.startsWith('rosas:piso:'))).toBe(true);
    expect(tags.some((tag) => tag.startsWith('ponte:'))).toBe(true);
    expect(tags.some((tag) => tag.startsWith('flutuante:'))).toBe(true);

    const bridge = colliders.find((collider) => (collider.tag ?? '').startsWith('ponte:'));
    expect(bridge?.walkable).toBe(true);
    const building = colliders.find((collider) => collider.tag === 'rosas:casa-de-cha');
    expect(building?.walkable).toBe(false);
    park.dispose();
  });

  it('abre uma porta por interior e nenhuma para o vazio', () => {
    const { park } = buildPark();
    const doors = park.interactables.filter((item) => item.payload.type === 'porta');
    const expected = PAVILIONS.filter((pavilion) => pavilion.interiorId);
    expect(doors).toHaveLength(expected.length);
    expect(doors.length).toBeGreaterThanOrEqual(3);

    for (const door of doors) {
      if (door.payload.type !== 'porta') continue;
      expect(getInterior(door.payload.interiorId), door.payload.interiorId).toBeDefined();
      expect(door.payload.exit.regionId).toBe('rosas-park');
      // A saída fica fora do prédio, não dentro da parede.
      const interiorId = door.payload.interiorId;
      const pavilion = PAVILIONS.find((candidate) => candidate.interiorId === interiorId);
      if (!pavilion) continue;
      const distance = Math.hypot(door.payload.exit.x - pavilion.x, door.payload.exit.z - pavilion.z);
      expect(distance).toBeGreaterThan(pavilion.radius);
    }
    park.dispose();
  });

  it('transforma cada ponto de interesse num interativo e cada escondido num colecionável', () => {
    const { park } = buildPark();
    for (const landmark of LANDMARKS) {
      const item = park.interactables.find((candidate) => candidate.id === `marco:${landmark.id}`);
      expect(item, `marco ausente: ${landmark.id}`).toBeDefined();
      expect(item?.action).toBe('Observar');
      expect(item?.payload.type).toBe('placa');
    }
    const hidden = LANDMARKS.filter((landmark) => landmark.hidden);
    expect(park.collectibles).toHaveLength(hidden.length);
    for (const spot of park.collectibles) expect(spot.hint.length).toBeGreaterThan(10);
    park.dispose();
  });

  it('acende as cascatas e as faz soar', () => {
    const { park } = buildPark();
    // Três quedas: cada uma com névoa, som e luz.
    expect(park.jets.length).toBeGreaterThanOrEqual(3);
    expect(park.waterSounds.length).toBeGreaterThanOrEqual(5);
    expect(park.lightSpots.length).toBeGreaterThan(20);
    for (const sound of park.waterSounds) {
      expect(sound.radius).toBeGreaterThan(0);
      expect(sound.gain).toBeGreaterThan(0);
    }
    park.dispose();
  });

  it('planta sakuras, mata tropical e os canteiros do roseiral', () => {
    const { park, plants } = buildPark();
    expect(plants.trees.length).toBeGreaterThan(40);
    expect(plants.bushes.length).toBeGreaterThan(10);
    expect(plants.patches.length).toBeGreaterThan(20);
    // A grama só nasce onde há espaço: foi pedida uma vez, com filtro.
    expect(plants.scatters).toBe(1);
    park.dispose();
  });

  it('reserva a água e os caminhos: nada é plantado por cima', () => {
    const { zones } = buildPark();
    // O lago é água.
    expect(zones.has(-96, 70, Zone.Water)).toBe(true);
    // O pátio de uma construção está ocupado.
    expect(zones.isFree(PAVILIONS[0].x, PAVILIONS[0].z, 1)).toBe(false);
  });

  it('anima os jardins flutuantes, que sobem e descem', () => {
    const { park } = buildPark();
    const garden = park.group.children.find((child) => child.name.startsWith('rosas:flutuante:'));
    expect(garden).toBeDefined();
    if (!garden) return;

    const frame = (elapsed: number) => ({
      dt: 0.016,
      elapsed,
      atmosphere: {} as never,
      cameraPosition: new THREE.Vector3(garden.position.x, 5, garden.position.z),
    });
    park.update(frame(0));
    const start = garden.position.y;
    park.update(frame(6));
    expect(garden.position.y).not.toBe(start);
    park.dispose();
  });

  it('não tem Esfera Aurora: aquilo é de Aurora, não daqui', () => {
    const { park } = buildPark();
    expect(park.sphere).toBeNull();
    expect(park.id).toBe('rosas-park');
    park.dispose();
  });

  it('se desfaz por inteiro ao sair da região', () => {
    const { park, physics } = buildPark();
    const scene = new THREE.Scene();
    scene.add(park.group);
    expect(triangles(park.group)).toBeGreaterThan(0);

    park.dispose();
    physics.clear();
    expect(park.group.children).toHaveLength(0);
    expect(park.group.parent).toBeNull();
    expect(physics.getColliders()).toHaveLength(0);
  });
});
