/**
 * Os bichos, agora visíveis.
 *
 * O registro de espécies já existia; o que não existia era corpo. Estes
 * testes verificam o que o marco pede: que cada espécie tenha malha,
 * que o jeito de andar produza partes diferentes, que o bicho apareça
 * no ambiente certo e que a animação realmente mexa alguma coisa.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildCreature, disposeCreature } from '../../src/creatures/CreatureMesh';
import { allSpecies, getSpecies, type Species } from '../../src/creatures/Species';
import { populateRegion, wildlifeBudget } from '../../src/creatures/Wildlife';
import { WildlifeView, type HabitatAnchor } from '../../src/creatures/WildlifeView';
import { getBlueprint } from '../../src/cities';

/** As espécies que o marco nomeia explicitamente. */
const REQUIRED = ['gato', 'cachorro', 'coelho', 'raposa', 'veado', 'borboleta', 'passaro'];

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

describe('corpos dos bichos', () => {
  it('dá malha a todas as espécies registradas', () => {
    for (const species of allSpecies()) {
      const parts = buildCreature(species);
      expect(triangles(parts.root), `sem malha: ${species.id}`).toBeGreaterThan(20);
      disposeCreature(parts);
    }
  });

  it('dá corpo às espécies que o marco nomeia', () => {
    for (const id of REQUIRED) {
      const species = getSpecies(id);
      expect(species, `espécie ausente: ${id}`).toBeDefined();
      if (!species) continue;
      const parts = buildCreature(species);
      expect(triangles(parts.root)).toBeGreaterThan(20);
      disposeCreature(parts);
    }
  });

  it('monta o corpo de acordo com o jeito de se mover', () => {
    const byMovement = (movement: Species['movement']): Species | undefined => allSpecies().find((species) => species.movement === movement);

    const walker = byMovement('anda');
    expect(walker).toBeDefined();
    if (walker) {
      const parts = buildCreature(walker);
      // Quadrúpede: quatro patas, cabeça e rabo.
      expect(parts.legs).toHaveLength(4);
      expect(parts.head).not.toBeNull();
      expect(parts.tail).not.toBeNull();
      expect(parts.wings).toHaveLength(0);
      disposeCreature(parts);
    }

    const flyer = byMovement('voa');
    if (flyer) {
      const parts = buildCreature(flyer);
      expect(parts.wings).toHaveLength(2);
      disposeCreature(parts);
    }

    const floater = byMovement('flutua');
    if (floater) {
      const parts = buildCreature(floater);
      expect(parts.wings.length).toBeGreaterThan(0);
      expect(parts.legs).toHaveLength(0);
      disposeCreature(parts);
    }
  });

  it('faz o veado maior que o esquilo, como o registro manda', () => {
    const deer = getSpecies('veado');
    const squirrel = getSpecies('esquilo');
    if (!deer || !squirrel) return;
    const a = buildCreature(deer);
    const b = buildCreature(squirrel);
    expect(a.standHeight).toBeGreaterThan(b.standHeight);
    disposeCreature(a);
    disposeCreature(b);
  });

  it('acende quem brilha e não acende quem não brilha', () => {
    const glowing = allSpecies().find((species) => species.glows);
    const plain = getSpecies('gato');
    if (!glowing || !plain) return;
    const a = buildCreature(glowing);
    const b = buildCreature(plain);
    const emissive = (parts: typeof a): number => (parts.materials[0] as THREE.MeshStandardMaterial).emissiveIntensity;
    expect(emissive(a)).toBeGreaterThan(0);
    expect(emissive(b)).toBe(0);
    disposeCreature(a);
    disposeCreature(b);
  });

  it('libera tudo ao ser descartado', () => {
    const species = getSpecies('cachorro');
    if (!species) return;
    const parts = buildCreature(species);
    const scene = new THREE.Scene();
    scene.add(parts.root);
    disposeCreature(parts);
    expect(parts.root.children).toHaveLength(0);
    expect(parts.root.parent).toBeNull();
  });
});

describe('fauna no mundo', () => {
  const anchors: readonly HabitatAnchor[] = [
    { habitat: 'agua', x: -96, z: 70, radius: 20 },
    { habitat: 'jardim', x: 0, z: -24, radius: 30 },
    { habitat: 'floresta', x: 84, z: 60, radius: 30 },
    { habitat: 'ar', x: 0, z: 0, radius: 80 },
  ];

  const makeView = (): WildlifeView =>
    new WildlifeView({
      groundY: () => 1.6,
      waterLevel: 0,
      anchors,
    });

  it('desenha um corpo por bicho da população', () => {
    const view = makeView();
    const animals = populateRegion('rosas-park', 12, 10, 7);
    expect(animals.length).toBeGreaterThan(0);
    view.populate(animals);
    expect(view.count).toBe(animals.length);
    expect(view.group.children).toHaveLength(animals.length);
    view.dispose();
  });

  it('põe cada bicho no habitat em que ele vive', () => {
    const view = makeView();
    view.populate(populateRegion('rosas-park', 12, 16, 3));
    for (const child of view.group.children) {
      const speciesId = child.name.replace('bicho:', '');
      const species = getSpecies(speciesId);
      expect(species, speciesId).toBeDefined();
      if (!species) continue;
      const home = anchors.filter((anchor) => species.habitats.includes(anchor.habitat));
      if (home.length === 0) continue;
      // Está dentro de alguma das áreas do seu habitat.
      const inside = home.some((anchor) => Math.hypot(child.position.x - anchor.x, child.position.z - anchor.z) <= anchor.radius + 0.01);
      expect(inside, `${speciesId} fora do seu habitat`).toBe(true);
    }
    view.dispose();
  });

  it('respeita o orçamento de qualidade: menos bichos no perfil baixo', () => {
    const low = wildlifeBudget('baixa');
    const high = wildlifeBudget('ultra');
    expect(low).toBeLessThan(high);

    const view = makeView();
    view.populate(populateRegion('rosas-park', 12, low, 1));
    expect(view.count).toBeLessThanOrEqual(low);
    view.dispose();
  });

  it('anima: o bicho se mexe entre um quadro e outro', () => {
    const view = makeView();
    view.populate(populateRegion('rosas-park', 12, 12, 11));
    const camera = new THREE.Vector3(0, 2, 0);

    const snapshot = (): string =>
      view.group.children
        .map((child) => `${child.position.x.toFixed(3)},${child.position.y.toFixed(3)},${child.rotation.y.toFixed(3)}`)
        .join('|');

    view.update(0.016, 0, 500, 500, camera);
    const before = snapshot();
    for (let i = 0; i < 180; i += 1) view.update(0.05, i * 0.05, 500, 500, camera);
    expect(snapshot()).not.toBe(before);
    view.dispose();
  });

  it('esconde o que está longe da câmera', () => {
    const view = makeView();
    view.setViewDistance(20);
    view.populate(populateRegion('rosas-park', 12, 12, 5));
    view.update(0.016, 0, 0, 0, new THREE.Vector3(900, 2, 900));
    expect(view.group.children.every((child) => !child.visible)).toBe(true);
    expect(view.visibleSpecies).toHaveLength(0);
    view.dispose();
  });

  it('foge de quem chega perto demais, quando a espécie é arisca', () => {
    const view = makeView();
    const deer = getSpecies('veado');
    if (!deer) return;
    view.populate([{ id: 'w1', speciesId: 'veado', x: 0, z: -24, heading: 0, state: 'parado', timer: 99 }]);
    const start = view.positionOf('w1');
    expect(start).not.toBeNull();
    if (!start) return;

    // O jogador aparece em cima dele.
    for (let i = 0; i < 40; i += 1) view.update(0.05, i * 0.05, start.x, start.z, new THREE.Vector3(start.x, 2, start.z));
    const after = view.positionOf('w1');
    expect(after).not.toBeNull();
    if (!after) return;
    expect(Math.hypot(after.x - start.x, after.z - start.z)).toBeGreaterThan(1);
    view.dispose();
  });

  it('liberta a memória ao trocar de população', () => {
    const view = makeView();
    view.populate(populateRegion('rosas-park', 12, 10, 2));
    view.populate(populateRegion('aurora-city', 12, 10, 2));
    // Nada da população anterior ficou pendurado na cena.
    expect(view.group.children).toHaveLength(view.count);
    view.clear();
    expect(view.group.children).toHaveLength(0);
    view.dispose();
  });

  it('usa as âncoras declaradas pelas duas regiões construídas', () => {
    for (const id of ['aurora-city', 'rosas-park']) {
      const blueprint = getBlueprint(id);
      expect(blueprint).not.toBeNull();
      const view = new WildlifeView({ groundY: () => 1, waterLevel: 0, anchors: blueprint?.habitats() ?? [] });
      view.populate(populateRegion(id, 12, 12, 9));
      expect(view.count).toBeGreaterThan(0);
      for (const child of view.group.children) {
        expect(Math.hypot(child.position.x, child.position.z)).toBeLessThan(300);
      }
      view.dispose();
    }
  });
});
