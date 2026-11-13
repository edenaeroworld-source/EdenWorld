/**
 * A camada de geometria dos interiores.
 *
 * O que importa aqui não é "o interior existe nos dados" — isso já era
 * verdade antes. É se entrar num prédio produz **malha, luz, colisão e
 * coisas para fazer**, e se sair devolve tudo ao estado anterior sem
 * deixar lixo na cena.
 */

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Interactable } from '../../src/interactions/Interactable';
import { allInteriors, getInterior, interiorsInRegion } from '../../src/interiors/Interior';
import { InteriorManager } from '../../src/interiors/InteriorManager';
import { INTERIOR_ORIGIN, InteriorScene } from '../../src/interiors/InteriorScene';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import type { InteriorMaterials } from '../../src/interiors/InteriorScene';

/**
 * Materiais mínimos: a biblioteca real do mundo precisa de um canvas
 * com contexto 2D, que o ambiente de teste não tem. A geometria, a
 * colisão e as luzes — que é o que se mede aqui — não dependem disso.
 */
function stubMaterials(): InteriorMaterials {
  const make = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial();
  return { wood: make(), stone: make(), white: make(), facade: make(), glass: make(), crystal: make(), metal: make() } as unknown as InteriorMaterials;
}

function countMeshes(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) total += 1;
  });
  return total;
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

describe('geometria dos interiores', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let materials: InteriorMaterials;
  let interiorScene: InteriorScene;
  let items: readonly Interactable[] = [];

  beforeEach(() => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    materials = stubMaterials();
    interiorScene = new InteriorScene({
      scene,
      materials,
      physics,
      onInteractables: (next) => {
        items = next;
      },
    });
  });

  it('monta malha de verdade, e não um grupo vazio', () => {
    const interior = getInterior('casa-de-cha');
    expect(interior).toBeDefined();
    if (!interior) return;

    interiorScene.load(interior);
    expect(countMeshes(interiorScene.group)).toBeGreaterThan(0);
    // Piso, teto, paredes e móveis: muito mais do que um plano solto.
    expect(countTriangles(interiorScene.group)).toBeGreaterThan(200);
    expect(interiorScene.group.visible).toBe(true);
  });

  it('acende luz coerente com o clima declarado', () => {
    const interior = getInterior('casa-de-cha');
    if (!interior) return;
    interiorScene.load(interior);

    const lights: THREE.Light[] = [];
    interiorScene.group.traverse((object) => {
      if ((object as THREE.Light).isLight) lights.push(object as THREE.Light);
    });
    // Uma ambiente e pelo menos uma por cômodo.
    expect(lights.length).toBeGreaterThanOrEqual(interior.rooms.length + 1);
    expect(lights.some((light) => light.type === 'HemisphereLight')).toBe(true);
    expect(lights.some((light) => light.type === 'PointLight')).toBe(true);
  });

  it('dá colisão ao piso, às paredes e aos móveis', () => {
    const interior = getInterior('casa-de-cha');
    if (!interior) return;
    const before = physics.getColliders().length;
    interiorScene.load(interior);
    const colliders = physics.getColliders();
    expect(colliders.length).toBeGreaterThan(before);

    const tags = colliders.map((collider) => collider.tag ?? '');
    expect(tags.some((tag) => tag.startsWith('interior:piso'))).toBe(true);
    expect(tags.some((tag) => tag.startsWith('interior:parede'))).toBe(true);
    expect(tags.some((tag) => tag.startsWith('interior:movel'))).toBe(true);

    // O piso é pisável; a parede, não.
    const floor = colliders.find((collider) => (collider.tag ?? '').startsWith('interior:piso'));
    const wall = colliders.find((collider) => (collider.tag ?? '').startsWith('interior:parede'));
    expect(floor?.walkable).toBe(true);
    expect(wall?.walkable).toBe(false);
  });

  it('dá uma porta de saída e um interativo por móvel', () => {
    const interior = getInterior('viveiro-eden');
    if (!interior) return;
    interiorScene.load(interior);

    const exit = items.find((item) => item.payload.type === 'porta');
    expect(exit).toBeDefined();
    expect(exit?.action).toBe('Sair');

    for (const prop of interior.props) {
      const match = items.find((item) => item.id === `interior:${interior.id}:${prop.id}`);
      expect(match, `faltou o interativo de ${prop.id}`).toBeDefined();
      expect(match?.name).toBe(prop.name);
    }
    // Sentar vira assento de verdade, não uma placa.
    const seat = items.find((item) => item.id === 'interior:viveiro-eden:banco-estufa');
    expect(seat?.payload.type).toBe('assento');
  });

  it('monta tudo longe do mundo exterior, para os dois não se misturarem', () => {
    const interior = getInterior('casa-rosas-7');
    if (!interior) return;
    interiorScene.load(interior);
    const spawn = interiorScene.spawnPoint;
    expect(spawn).not.toBeNull();
    expect(Math.hypot(spawn?.x ?? 0, spawn?.z ?? 0)).toBeGreaterThan(1000);
    expect(spawn?.x).toBeCloseTo(INTERIOR_ORIGIN.x + interior.spawn.x, 5);
  });

  it('carrega um interior por vez: entrar no segundo libera o primeiro', () => {
    const a = getInterior('casa-de-cha');
    const b = getInterior('viveiro-eden');
    if (!a || !b) return;

    interiorScene.load(a);
    const meshesA = countMeshes(interiorScene.group);
    expect(meshesA).toBeGreaterThan(0);

    interiorScene.load(b);
    expect(interiorScene.active?.id).toBe('viveiro-eden');
    // Nada do primeiro sobrou: os ids dos interativos são todos do segundo.
    for (const item of items) {
      expect(item.id.includes('casa-de-cha')).toBe(false);
    }
  });

  it('descarrega sem deixar lixo: nem malha, nem luz, nem colisor', () => {
    const interior = getInterior('casa-de-cha');
    if (!interior) return;
    const beforeColliders = physics.getColliders().length;

    interiorScene.load(interior);
    expect(countMeshes(interiorScene.group)).toBeGreaterThan(0);

    interiorScene.unload(interior);
    expect(countMeshes(interiorScene.group)).toBe(0);
    expect(interiorScene.group.children).toHaveLength(0);
    expect(interiorScene.group.visible).toBe(false);
    expect(physics.getColliders().length).toBe(beforeColliders);
    expect(items).toHaveLength(0);
    expect(interiorScene.active).toBeNull();
  });

  it('serve de loader para o InteriorManager, que devolve a porta certa', () => {
    const manager = new InteriorManager();
    manager.setLoader(interiorScene);

    const exit = { regionId: 'rosas-park', x: 52, z: 47, heading: Math.PI };
    const visit = manager.enter('casa-de-cha', exit);
    expect(visit).not.toBeNull();
    expect(interiorScene.active?.id).toBe('casa-de-cha');
    expect(countMeshes(interiorScene.group)).toBeGreaterThan(0);

    const back = manager.leave();
    expect(back).toEqual(exit);
    expect(interiorScene.active).toBeNull();
    expect(countMeshes(interiorScene.group)).toBe(0);
  });

  it('monta qualquer interior declarado, sem código por prédio', () => {
    for (const interior of allInteriors()) {
      interiorScene.load(interior);
      expect(countMeshes(interiorScene.group), `interior vazio: ${interior.id}`).toBeGreaterThan(0);
      expect(items.length, `interior sem nada para fazer: ${interior.id}`).toBeGreaterThan(0);
      interiorScene.unload(interior);
    }
  });

  it('cobre as três categorias que o marco exige, em Rosas Park', () => {
    const interiors = interiorsInRegion('rosas-park');
    const residential = interiors.find((interior) => interior.category === 'casa');
    const shop = interiors.find((interior) => interior.shopId !== undefined);
    const publico = interiors.find((interior) => interior.category === 'santuario' || interior.category === 'restaurante');

    for (const interior of [residential, shop, publico]) {
      expect(interior).toBeDefined();
      if (!interior) continue;
      interiorScene.load(interior);
      expect(countTriangles(interiorScene.group)).toBeGreaterThan(100);
      expect(items.some((item) => item.payload.type === 'porta')).toBe(true);
      interiorScene.unload(interior);
    }
  });
});
