// @vitest-environment happy-dom
/**
 * A Estação do Éden, construída dentro das duas regiões.
 *
 * Este arquivo monta Aurora City e Rosas Park de verdade e procura a
 * estação no que saiu: interativo, piso pisável, luz e posição. É a
 * diferença entre "existe um botão no telefone" e "existe um lugar no
 * mundo para onde andar".
 *
 * Para montar Aurora é preciso um contexto 2D — ela desenha hologramas
 * e texturas em canvas. Este ambiente não tem um, então damos um falso
 * que responde a tudo sem pintar nada: a geometria, a física e os
 * interativos não dependem de pixel.
 */

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { getBlueprint } from '../../src/cities';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { getRegion } from '../../src/regions/Region';
import { HeightField } from '../../src/world/HeightField';
import type { MaterialLibrary } from '../../src/world/Materials';
import type { Vegetation } from '../../src/world/Vegetation';
import { ZoneMap } from '../../src/world/ZoneMap';

/** Contexto 2D de mentira: responde a qualquer chamada, sem pintar. */
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const special: Record<string, unknown> = {
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4),
      width: w,
      height: h,
    }),
  };
  return new Proxy(special, {
    get: (target, key: string) => (key in target ? target[key] : () => undefined),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  const proto = globalThis.HTMLCanvasElement?.prototype;
  if (!proto) return;
  proto.getContext = function patched(this: HTMLCanvasElement, kind: string) {
    return kind === '2d' ? fakeContext(this) : null;
  } as HTMLCanvasElement['getContext'];
});

/** Materiais sem textura: mede-se forma, não pixel. */
function stubMaterials(): MaterialLibrary {
  const cache = new Map<string, unknown>();
  /**
   * Material comum com dois acréscimos:
   *
   * - `uniforms` que inventa a entrada pedida (parte da cidade escreve
   *   em `uniforms.uCore.value` sem checar se existe);
   * - `clone()` que devolve outro stub — o clone nativo perderia tudo
   *   isso e a cidade clona materiais para variar cor.
   */
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
  // O holograma precisa de uma textura cuja imagem seja um canvas de
  // verdade: quem o usa desenha nela (o atlas de placas de Aurora).
  const handle = (width = 256, height = 256) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // Material de shader, porque quem anima o holograma escreve em
    // `uniforms.uTime` todo quadro.
    const shader = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uTexture: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 1 } } });
    return { material: shader, texture: new THREE.CanvasTexture(canvas), redraw: () => {}, dispose: () => {} };
  };
  const factories: Record<string, unknown> = {
    createHologram: handle,
    createPainted: handle,
    createCanvasTexture: () => new THREE.Texture(),
  };
  return new Proxy(
    {},
    {
      get: (_target, key: string) => {
        if (key in factories) return factories[key];
        if (!cache.has(key)) cache.set(key, material(key));
        return cache.get(key);
      },
    },
  ) as unknown as MaterialLibrary;
}

function stubVegetation(): Vegetation {
  return {
    isClear: () => true,
    addTree: () => {},
    addBush: () => {},
    addFlowerPatch: () => {},
    scatterGround: () => {},
    build: () => {},
    setDensity: () => {},
    updateVisibility: () => {},
    dispose: () => {},
  } as unknown as Vegetation;
}

/** Monta uma região de verdade, em resolução reduzida. */
function buildRegion(regionId: string) {
  const blueprint = getBlueprint(regionId);
  if (!blueprint) throw new Error(`sem blueprint: ${regionId}`);
  const heightField = new HeightField(blueprint.terrainSize, 96, blueprint.height ?? (() => 0));
  const zones = new ZoneMap(blueprint.terrainSize, 192);
  const physics = new PhysicsWorld({ getHeight: (x, z) => heightField.getHeight(x, z), getSurface: () => 'grass' });
  const scene = blueprint.create({ materials: stubMaterials(), physics, heightField, zones, vegetation: stubVegetation() });
  return { scene, physics, heightField };
}

const REGIONS_WITH_SCENE = ['aurora-city', 'rosas-park'];

describe('a Estação do Éden existe no mundo, nas duas regiões', () => {
  for (const regionId of REGIONS_WITH_SCENE) {
    it(`${regionId}: tem estação, com corpo, luz e piso pisável`, () => {
      const { scene, physics } = buildRegion(regionId);

      const station = scene.interactables.find((item) => item.payload.type === 'estacao');
      expect(station, 'nenhuma estação na região').toBeDefined();
      if (!station) return;
      expect(station.action).toBe('Viajar');
      expect(station.name).toContain('Estação do Éden');
      expect(station.enabled).toBe(true);

      const colliders = physics.getColliders();
      const floor = colliders.find((collider) => (collider.tag ?? '').startsWith('estacao:') && (collider.tag ?? '').endsWith(':piso'));
      expect(floor, 'estação sem piso').toBeDefined();
      expect(floor?.walkable).toBe(true);

      const light = scene.lightSpots.find((spot) => Math.hypot(spot.x - station.position.x, spot.z - station.position.z) < 4);
      expect(light, 'estação sem luz à noite').toBeDefined();

      scene.dispose();
      physics.clear();
    });

    it(`${regionId}: a estação fica a poucos passos de onde o jogador chega`, () => {
      const { scene } = buildRegion(regionId);
      const station = scene.interactables.find((item) => item.payload.type === 'estacao');
      const arrival = getRegion(regionId)?.arrival;
      expect(station).toBeDefined();
      expect(arrival).toBeDefined();
      if (!station || !arrival) return;
      // Quem chega enxerga a estação do ponto em que pisou.
      expect(Math.hypot(station.position.x - arrival.x, station.position.z - arrival.z)).toBeLessThan(30);
      scene.dispose();
    });

    it(`${regionId}: a estação não está enterrada nem dentro de outra coisa`, () => {
      const { scene, physics, heightField } = buildRegion(regionId);
      const station = scene.interactables.find((item) => item.payload.type === 'estacao');
      expect(station).toBeDefined();
      if (!station) return;

      const ground = heightField.getHeight(station.position.x, station.position.z);
      // O painel fica na altura da mão, acima do chão e abaixo do teto.
      expect(station.position.y - ground).toBeGreaterThan(0.5);
      expect(station.position.y - ground).toBeLessThan(3);

      // Nenhum outro interativo disputa o mesmo lugar.
      const crowded = scene.interactables.filter(
        (item) => item !== station && Math.hypot(item.position.x - station.position.x, item.position.z - station.position.z) < 3,
      );
      expect(crowded.map((item) => item.id)).toEqual([]);

      scene.dispose();
      physics.clear();
    });
  }

  it('as duas estações têm ids diferentes', () => {
    const aurora = buildRegion('aurora-city');
    const rosas = buildRegion('rosas-park');
    const idOf = (scene: { interactables: readonly { id: string; payload: { type: string } }[] }): string =>
      scene.interactables.find((item) => item.payload.type === 'estacao')?.id ?? '';
    expect(idOf(aurora.scene)).toBe('estacao-aurora');
    expect(idOf(rosas.scene)).toBe('estacao-rosas');
    aurora.scene.dispose();
    rosas.scene.dispose();
  });

  it('a estação some junto com a região: sair não deixa colisor para trás', () => {
    const { scene, physics } = buildRegion('rosas-park');
    expect(physics.getColliders().some((collider) => (collider.tag ?? '').startsWith('estacao:'))).toBe(true);
    scene.dispose();
    physics.clear();
    expect(physics.getColliders()).toHaveLength(0);
  });
});

describe('a troca de cenário que a viagem faz', () => {
  /**
   * Isto é o miolo de `Engine.enterRegion`, sem o renderizador: solta o
   * cenário de uma região e monta o da outra na mesma física. Se algo
   * vazasse — um colisor, um interativo, um colecionável —, o jogador
   * chegaria em Rosas Park esbarrando em paredes de Aurora.
   */
  it('solta Aurora inteira e monta Rosas Park no lugar', () => {
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    const materials = stubMaterials();
    const vegetation = stubVegetation();

    const build = (regionId: string) => {
      const blueprint = getBlueprint(regionId);
      if (!blueprint) throw new Error(regionId);
      const heightField = new HeightField(blueprint.terrainSize, 96, blueprint.height ?? (() => 0));
      const zones = new ZoneMap(blueprint.terrainSize, 192);
      return blueprint.create({ materials, physics, heightField, zones, vegetation });
    };

    const aurora = build('aurora-city');
    expect(aurora.id).toBe('aurora-city');
    const auroraColliders = physics.getColliders().length;
    expect(auroraColliders).toBeGreaterThan(50);
    expect(aurora.interactables.length).toBeGreaterThan(10);

    // Sai de Aurora: o cenário some e a física fica limpa.
    aurora.dispose();
    physics.clear();
    expect(physics.getColliders()).toHaveLength(0);
    expect(aurora.group.children).toHaveLength(0);

    // Chega em Rosas: cenário próprio, interativos próprios.
    const rosas = build('rosas-park');
    expect(rosas.id).toBe('rosas-park');
    expect(rosas.group.children.length).toBeGreaterThan(0);
    expect(physics.getColliders().length).toBeGreaterThan(20);
    expect(rosas.interactables.some((item) => item.payload.type === 'estacao')).toBe(true);

    // Nada de Aurora sobrou: nenhum interativo com id da cidade.
    const auroraIds = new Set(aurora.interactables.map((item) => item.id));
    expect(rosas.interactables.filter((item) => auroraIds.has(item.id))).toEqual([]);
    expect(physics.getColliders().some((collider) => (collider.tag ?? '').startsWith('estacao:estacao-aurora'))).toBe(false);

    // E dá para voltar: Aurora monta de novo, inteira.
    rosas.dispose();
    physics.clear();
    const again = build('aurora-city');
    expect(again.interactables.length).toBe(aurora.interactables.length);
    expect(physics.getColliders().length).toBe(auroraColliders);
    again.dispose();
    physics.clear();
  });

  it('as duas regiões declaram habitats e áreas próprias', () => {
    for (const regionId of REGIONS_WITH_SCENE) {
      const blueprint = getBlueprint(regionId);
      expect(blueprint?.habitats().length, regionId).toBeGreaterThan(0);
      expect(blueprint?.areas().length, regionId).toBeGreaterThan(0);
      expect(blueprint?.spawn, regionId).toBeDefined();
    }
  });
});
