/**
 * Por que o jogador "nadava no nada" dentro dos prédios.
 *
 * O interior é montado em `INTERIOR_ORIGIN` (4000, 4000), bem longe do
 * terreno. Duas coisas do mundo exterior continuavam valendo lá dentro,
 * e as duas sozinhas já quebravam o chão:
 *
 *  1. **O limite jogável.** `resolveCircle` prende o jogador dentro de
 *     um círculo centrado em (0,0). A 5657 m do centro, o primeiro
 *     passo dentro de um prédio jogava o jogador de volta para a borda
 *     do mundo — fora do prédio, com o exterior escondido.
 *
 *  2. **O relevo.** `groundAt` começa amostrando o terreno. A 4000 m o
 *     relevo vale −7 m em Aurora e −9 m em Rosas, abaixo do nível de
 *     flutuação (−1,18 m). Resultado: `swimming = true` — o jogador
 *     nadava, de pé, dentro da sala.
 *
 * Estes testes falhariam antes do modo interior e existem para que a
 * regressão não volte sem aviso.
 */

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { auroraHeight } from '../../src/cities/aurora-city/AuroraTerrain';
import { rosasHeight } from '../../src/cities/rosas-park/RosasTerrain';
import { PLAYER, WORLD } from '../../src/core/Config';
import { allInteriors, getInterior } from '../../src/interiors/Interior';
import { INTERIOR_ORIGIN, InteriorScene } from '../../src/interiors/InteriorScene';
import type { InteriorMaterials } from '../../src/interiors/InteriorScene';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { PlayerMotor } from '../../src/player/PlayerMotor';

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

/** O relevo de Aurora, como o motor o enxerga quando a cidade está carregada. */
const auroraSampler = {
  getHeight: (x: number, z: number) => auroraHeight(x, z),
  getSurface: () => 'grass' as const,
};

describe('o chão dos interiores', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let interiors: InteriorScene;

  beforeEach(() => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld(auroraSampler);
    physics.boundaryRadius = 268; // o mesmo valor que Aurora City usa
    interiors = new InteriorScene({ scene, materials: stubMaterials(), physics, onInteractables: () => {} });
  });

  it('o relevo a 4000 m é fundo de mar — é daí que vinha a natação', () => {
    const swimY = WORLD.waterLevel - PLAYER.swimSubmersion;
    // Documenta a armadilha: não é um detalhe, são metros de diferença.
    expect(auroraHeight(INTERIOR_ORIGIN.x, INTERIOR_ORIGIN.z)).toBeLessThan(swimY);
    expect(rosasHeight(INTERIOR_ORIGIN.x, INTERIOR_ORIGIN.z)).toBeLessThan(swimY);
  });

  it('dentro do prédio o chão é o piso, e não o relevo lá fora', () => {
    interiors.load(getInterior('atelie-aero')!);
    const ground = physics.groundAt(INTERIOR_ORIGIN.x + 7, INTERIOR_ORIGIN.z + 9, 0.5, PLAYER.stepHeight, {
      height: 0,
      surface: 'grass',
      onPlatform: false,
    });
    expect(ground.height).toBeCloseTo(0, 2);
    expect(ground.height).toBeGreaterThan(WORLD.waterLevel - PLAYER.swimSubmersion);
  });

  it('o chão continua firme nos cantos que nenhum cômodo cobre', () => {
    // O ponto fraco antigo: fora do retângulo de um cômodo, `groundAt`
    // caía no relevo e o jogador afundava. Agora o prédio inteiro tem
    // chão, inclusive onde não há móvel nem parede.
    interiors.load(getInterior('atelie-aero')!);
    for (const [dx, dz] of [
      [0.2, 0.2],
      [19.8, 9.8],
      [14, 0.5],
      [10, 5],
    ] as const) {
      const ground = physics.groundAt(INTERIOR_ORIGIN.x + dx, INTERIOR_ORIGIN.z + dz, 0.5, PLAYER.stepHeight, {
        height: 0,
        surface: 'grass',
        onPlatform: false,
      });
      expect(ground.height, `canto ${dx},${dz}`).toBeGreaterThan(WORLD.waterLevel - PLAYER.swimSubmersion);
    }
  });

  it('o limite jogável do mundo não arranca o jogador de dentro do prédio', () => {
    interiors.load(getInterior('atelie-aero')!);
    const spawn = interiors.spawnPoint!;
    const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    physics.resolveCircle(position, 0.4, spawn.y, 1.7, 0.42);
    // Sem o modo interior, isto puxaria o jogador para ~(188, 188).
    expect(position.x).toBeGreaterThan(INTERIOR_ORIGIN.x - 50);
    expect(position.z).toBeGreaterThan(INTERIOR_ORIGIN.z - 50);
  });

  it('o jogador anda pelo interior sem nunca entrar em modo de natação', () => {
    interiors.load(getInterior('atelie-aero')!);
    const spawn = interiors.spawnPoint!;
    const motor = new PlayerMotor(physics);
    motor.teleport(spawn.x, spawn.z, spawn.heading, spawn.y);
    motor.update(1 / 60, { x: 0, z: 0, run: false, jump: false, jumpHeld: false });
    expect(motor.swimming).toBe(false);

    // Oito direções, dois segundos em cada: em nenhum quadro ele nada,
    // afunda abaixo do piso ou é teleportado para fora do prédio.
    for (let dir = 0; dir < 8; dir += 1) {
      const angle = (dir * Math.PI) / 4;
      const intent = { x: Math.cos(angle), z: Math.sin(angle), run: true, jump: false, jumpHeld: false };
      for (let step = 0; step < 120; step += 1) {
        motor.update(1 / 60, intent);
        expect(motor.swimming, `direção ${dir}`).toBe(false);
        expect(motor.position.y, `direção ${dir}`).toBeGreaterThan(-0.5);
        expect(Math.abs(motor.position.x - INTERIOR_ORIGIN.x), `direção ${dir}`).toBeLessThan(80);
        expect(Math.abs(motor.position.z - INTERIOR_ORIGIN.z), `direção ${dir}`).toBeLessThan(80);
      }
      motor.teleport(spawn.x, spawn.z, spawn.heading, spawn.y);
    }
  });

  it('sair do prédio devolve o relevo e o limite do mundo', () => {
    const interior = getInterior('atelie-aero')!;
    interiors.load(interior);
    interiors.unload(interior);

    const ground = physics.groundAt(120, 40, 2, PLAYER.stepHeight, { height: 0, surface: 'grass', onPlatform: false });
    expect(ground.height).toBeCloseTo(auroraHeight(120, 40), 2);

    const far = new THREE.Vector3(4000, 0, 4000);
    physics.resolveCircle(far, 0.4, 0, 1.7, 0.42);
    expect(Math.hypot(far.x, far.z)).toBeLessThanOrEqual(268);
  });

  it('nenhum interior deixa o jogador cair: todos têm piso sob o ponto de entrada', () => {
    for (const interior of allInteriors()) {
      interiors.load(interior);
      const spawn = interiors.spawnPoint!;
      const ground = physics.groundAt(spawn.x, spawn.z, spawn.y + 0.5, PLAYER.stepHeight, {
        height: 0,
        surface: 'grass',
        onPlatform: false,
      });
      expect(Math.abs(ground.height - spawn.y), `${interior.id}: piso sob a entrada`).toBeLessThan(0.3);
      interiors.unload(interior);
    }
  });
});
