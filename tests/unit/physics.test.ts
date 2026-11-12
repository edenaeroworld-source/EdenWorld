import { describe, expect, it } from 'vitest';
import { colliderBounds, colliderTopAt, pushCircleOut, raycastCollider } from '../../src/physics/Collision';
import { type GroundInfo, PhysicsWorld } from '../../src/physics/PhysicsWorld';

const flat = (height = 0): PhysicsWorld => new PhysicsWorld({ getHeight: () => height, getSurface: () => 'grass' });
const ground = (): GroundInfo => ({ height: 0, surface: 'grass', onPlatform: false });

describe('colisores', () => {
  it('cilindro: topo, empurrão e limites', () => {
    const world = flat();
    const c = world.addCylinder({ x: 0, z: 0, radius: 2, yMin: 0, yMax: 3 });
    expect(colliderTopAt(c, 1, 0)).toBe(3);
    expect(colliderTopAt(c, 3, 0)).toBeNull();
    const pos = { x: 1.5, z: 0 };
    expect(pushCircleOut(c, pos, 0.5)).toBe(true);
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(2.5, 5);
    expect(pushCircleOut(c, { x: 5, z: 0 }, 0.5)).toBe(false);
    expect(colliderBounds(c)).toEqual({ minX: -2, maxX: 2, minZ: -2, maxZ: 2 });
  });

  it('anel: o interior é livre e a parede segura quem está dentro', () => {
    const world = flat();
    const ring = world.addCylinder({ x: 0, z: 0, radius: 5, innerRadius: 4, yMin: 0, yMax: 2 });
    expect(colliderTopAt(ring, 0, 0)).toBeNull();
    expect(colliderTopAt(ring, 4.5, 0)).toBe(2);
    const inside = { x: 3.8, z: 0 };
    expect(pushCircleOut(ring, inside, 0.5)).toBe(true);
    expect(inside.x).toBeLessThanOrEqual(3.5 + 1e-6);
    const center = { x: 0.5, z: 0 };
    expect(pushCircleOut(ring, center, 0.5)).toBe(false);
  });

  it('caixa rotacionada empurra pelo lado mais próximo', () => {
    const world = flat();
    const box = world.addBox({ x: 0, z: 0, halfX: 4, halfZ: 1, rotation: Math.PI / 2, yMin: 0, yMax: 2 });
    // Após girar 90°, a caixa ocupa |x| <= 1 e |z| <= 4.
    expect(colliderTopAt(box, 0.5, 3.5)).toBe(2);
    expect(colliderTopAt(box, 3.5, 0)).toBeNull();
    const pos = { x: 1.2, z: 0 };
    expect(pushCircleOut(box, pos, 0.5)).toBe(true);
    expect(pos.x).toBeCloseTo(1.5, 5);
    expect(pos.z).toBeCloseTo(0, 5);
  });

  it('raio encontra a face mais próxima', () => {
    const world = flat();
    const box = world.addBox({ x: 10, z: 0, halfX: 1, halfZ: 1, yMin: 0, yMax: 4 });
    expect(raycastCollider(box, 0, 1, 0, 1, 0, 0, 50)).toBeCloseTo(9, 5);
    expect(raycastCollider(box, 0, 6, 0, 1, 0, 0, 50)).toBe(Infinity);
    const c = world.addCylinder({ x: 0, z: 10, radius: 2, yMin: 0, yMax: 4 });
    expect(raycastCollider(c, 0, 1, 0, 0, 0, 1, 50)).toBeCloseTo(8, 5);
  });
});

describe('PhysicsWorld', () => {
  it('encontra o chão em plataformas ao alcance de um passo', () => {
    const world = flat(1);
    world.addBox({ x: 0, z: 0, halfX: 2, halfZ: 2, yMin: 0, yMax: 1.3, surface: 'wood' });
    world.addBox({ x: 10, z: 0, halfX: 2, halfZ: 2, yMin: 0, yMax: 3 });
    const info = ground();
    world.groundAt(0, 0, 1, 0.42, info);
    expect(info).toEqual({ height: 1.3, surface: 'wood', onPlatform: true });
    // Parede alta demais para ser degrau: continua no terreno.
    world.groundAt(10, 0, 1, 0.42, info);
    expect(info.height).toBe(1);
    expect(info.onPlatform).toBe(false);
    // De cima, a mesma caixa é chão.
    world.groundAt(10, 0, 3.2, 0.42, info);
    expect(info.height).toBe(3);
  });

  it('degraus baixos não bloqueiam; paredes bloqueiam', () => {
    const world = flat();
    world.addBox({ x: 0, z: 0, halfX: 1, halfZ: 1, yMin: 0, yMax: 0.3 });
    world.addBox({ x: 10, z: 0, halfX: 1, halfZ: 1, yMin: 0, yMax: 3 });
    const a = { x: 0.9, z: 0 };
    expect(world.resolveCircle(a, 0.34, 0, 1.72, 0.42)).toBe(false);
    const b = { x: 9.1, z: 0 };
    expect(world.resolveCircle(b, 0.34, 0, 1.72, 0.42)).toBe(true);
    expect(b.x).toBeLessThanOrEqual(8.66 + 1e-6);
  });

  it('colisores acima da cabeça ou abaixo dos pés são ignorados', () => {
    const world = flat();
    world.addBox({ x: 0, z: 0, halfX: 1, halfZ: 1, yMin: 3, yMax: 5, walkable: false });
    const pos = { x: 0.5, z: 0 };
    expect(world.resolveCircle(pos, 0.34, 0, 1.72, 0.42)).toBe(false);
    expect(world.resolveCircle(pos, 0.34, 6, 1.72, 0.42)).toBe(false);
    expect(world.resolveCircle(pos, 0.34, 2, 1.72, 0.42)).toBe(true);
  });

  it('mantém o jogador dentro do limite do mundo', () => {
    const world = flat();
    world.boundaryRadius = 100;
    const pos = { x: 150, z: 0 };
    expect(world.resolveCircle(pos, 0.34, 0, 1.72, 0.42)).toBe(true);
    expect(pos.x).toBeCloseTo(99.66, 5);
    expect(world.isNearBoundary(96, 0, 5)).toBe(true);
    expect(world.isNearBoundary(50, 0, 5)).toBe(false);
  });

  it('raycast para em colisores e no terreno', () => {
    const world = new PhysicsWorld({ getHeight: (x) => (x > 20 ? 10 : 0) });
    world.addCylinder({ x: 5, z: 0, radius: 1, yMin: 0, yMax: 4 });
    expect(world.raycast(0, 1, 0, 1, 0, 0, 30)).toBeCloseTo(4, 3);
    // Acima do cilindro o raio segue até a encosta do terreno.
    const d = world.raycast(0, 5, 0, 1, 0, 0, 30);
    expect(d).toBeGreaterThan(19);
    expect(d).toBeLessThan(20.7);
    expect(world.raycast(0, 20, 0, 1, 0, 0, 30)).toBe(30);
  });

  it('colisores removidos deixam de atuar', () => {
    const world = flat();
    const c = world.addCylinder({ x: 0, z: 0, radius: 1, yMin: 0, yMax: 3 });
    expect(world.colliderCount).toBe(1);
    world.remove(c);
    expect(world.colliderCount).toBe(0);
    expect(world.resolveCircle({ x: 0.5, z: 0 }, 0.34, 0, 1.72, 0.42)).toBe(false);
  });
});
