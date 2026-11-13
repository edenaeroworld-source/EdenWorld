/**
 * Entrar num prédio **depois de viajar**.
 *
 * O relato era "em Aurora City entro na casa e caio nadando no vazio;
 * em Rosas Park funciona". Não era de Aurora: era de qualquer região
 * aberta depois de uma viagem.
 *
 * Viajar destrói o mundo e monta outro — `World.build` cria uma
 * `PhysicsWorld` nova e o motor reaponta o jogador para ela. A cena de
 * interiores, porém, nasce uma vez e vive a sessão inteira, e guardava
 * a física que recebeu no construtor. O primeiro prédio aberto depois
 * da viagem subia inteiro na física morta:
 *
 *  - as paredes e o piso iam para um mundo que ninguém consulta;
 *  - `setIndoor` ligava o modo interior onde ninguém olha;
 *  - e o jogador, ainda sujeito ao limite circular da região, era
 *    atirado dos 4000 m do prédio para a borda do mapa — oceano, com
 *    o cenário externo escondido. Medido: 5473 m de desvio, pousando
 *    exatamente na linha de nado.
 *
 * Estes testes montam as duas regiões de verdade, viajam entre elas e
 * exigem que o prédio apareça em volta do jogador, com chão sob os pés.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getBlueprint } from '../../src/cities';
import { PLAYER, WORLD } from '../../src/core/Config';
import { getInterior, type InteriorDef, interiorsInRegion } from '../../src/interiors/Interior';
import { INTERIOR_ORIGIN, InteriorScene } from '../../src/interiors/InteriorScene';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { PlayerMotor } from '../../src/player/PlayerMotor';
import { HeightField } from '../../src/world/HeightField';

/**
 * Uma física de região como `World.build` monta: relevo próprio e
 * limite circular. Cada viagem produz uma destas, nova em folha.
 */
function regionPhysics(regionId: string): PhysicsWorld {
  const blueprint = getBlueprint(regionId);
  if (!blueprint) throw new Error(`sem blueprint: ${regionId}`);
  const field = new HeightField(blueprint.terrainSize, 96, blueprint.height);
  const physics = new PhysicsWorld({ getHeight: (x, z) => field.getHeight(x, z), getSurface: (x, z) => field.getSurface(x, z) });
  physics.boundaryRadius = blueprint.boundaryRadius;
  return physics;
}

/**
 * O motor com a cena de interiores ligada como o `Engine` a liga:
 * a física é **perguntada**, não guardada.
 */
function makeGame(regionId: string) {
  let physics = regionPhysics(regionId);
  const motor = new PlayerMotor(physics);
  const scene = new InteriorScene({
    scene: new THREE.Scene(),
    physics: () => physics,
    onInteractables: () => {},
  });
  return {
    scene,
    motor,
    get physics() {
      return physics;
    },
    /** Viajar: o mundo antigo morre, um novo nasce, o jogador muda de física. */
    travel(nextRegion: string): void {
      physics.clear();
      physics = regionPhysics(nextRegion);
      motor.setPhysics(physics);
    },
    /** Entrar por uma porta, como `Engine.enterInterior`. */
    enter(interior: InteriorDef): void {
      scene.load(interior);
      const spawn = scene.spawnPoint;
      if (!spawn) throw new Error(`${interior.id} não montou`);
      motor.teleport(spawn.x, spawn.z, spawn.heading, spawn.y + 0.4);
    },
    /** Sair, como `Engine.exitInterior`. */
    leave(interior: InteriorDef, exit: { x: number; z: number }): void {
      scene.unload(interior);
      motor.teleport(exit.x, exit.z, 0);
    },
  };
}

const STILL = { x: 0, z: 0, run: false, jump: false, jumpHeld: false };
const SWIM_LINE = WORLD.waterLevel - PLAYER.swimSubmersion;

/** Deixa o jogador assentar e devolve o que aconteceu com ele. */
function settle(motor: PlayerMotor, seconds = 2) {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) motor.update(1 / 60, STILL);
  return { x: motor.position.x, y: motor.position.y, z: motor.position.z, swimming: motor.swimming, grounded: motor.grounded, state: motor.state };
}

/** Caminha numa direção por alguns segundos, anotando o pior momento. */
function walk(motor: PlayerMotor, dx: number, dz: number, seconds: number) {
  let swam = false;
  let lowest = Infinity;
  const intent = { x: dx, z: dz, run: false, jump: false, jumpHeld: false };
  for (let i = 0; i < Math.round(seconds * 60); i += 1) {
    motor.update(1 / 60, intent);
    if (motor.swimming) swam = true;
    lowest = Math.min(lowest, motor.position.y);
  }
  return { swam, lowest, x: motor.position.x, z: motor.position.z };
}

describe('o prédio aparece em volta do jogador, tenha ele viajado ou não', () => {
  it('Aurora City logo na primeira porta, sem viagem nenhuma', () => {
    const game = makeGame('aurora-city');
    game.enter(getInterior('apto-aurora-12') as InteriorDef);
    const rest = settle(game.motor);
    expect(rest.swimming, 'nadando dentro de casa').toBe(false);
    expect(Math.hypot(rest.x - INTERIOR_ORIGIN.x, rest.z - INTERIOR_ORIGIN.z), 'o jogador não está dentro do prédio').toBeLessThan(40);
  });

  it('Aurora City depois de ir a Rosas Park e voltar — o caso relatado', () => {
    const game = makeGame('aurora-city');
    game.travel('rosas-park');
    game.travel('aurora-city');

    const interior = getInterior('apto-aurora-12') as InteriorDef;
    game.enter(interior);

    // O prédio tem de estar na física que o jogador está usando.
    expect(game.physics.indoor, 'o modo interior foi ligado na física errada').toBe(true);
    expect(game.physics.getColliders().length, 'as paredes subiram noutro mundo').toBeGreaterThan(20);

    const rest = settle(game.motor);
    // Era aqui que ele aparecia a 5473 m dali, boiando.
    expect(Math.hypot(rest.x - INTERIOR_ORIGIN.x, rest.z - INTERIOR_ORIGIN.z), `o jogador parou a ${Math.hypot(rest.x - INTERIOR_ORIGIN.x, rest.z - INTERIOR_ORIGIN.z).toFixed(0)} m do prédio`).toBeLessThan(40);
    expect(rest.swimming, 'nadando dentro de casa').toBe(false);
    expect(rest.state, `estado ${rest.state} dentro de casa`).not.toBe('swim');
    expect(rest.y, 'o piso é y=0; o jogador afundou').toBeGreaterThan(SWIM_LINE + 0.5);
    expect(rest.grounded, 'sem chão sob os pés').toBe(true);
  });

  it('Rosas Park depois de vir de Aurora City continua inteiro', () => {
    const game = makeGame('rosas-park');
    game.travel('aurora-city');
    game.travel('rosas-park');
    game.enter(getInterior('casa-de-cha') as InteriorDef);
    const rest = settle(game.motor);
    expect(game.physics.indoor).toBe(true);
    expect(rest.swimming).toBe(false);
    expect(Math.hypot(rest.x - INTERIOR_ORIGIN.x, rest.z - INTERIOR_ORIGIN.z)).toBeLessThan(40);
  });

  it('sair devolve o jogador à porta, no chão da cidade', () => {
    const game = makeGame('aurora-city');
    game.travel('rosas-park');
    game.travel('aurora-city');
    const interior = getInterior('mercado-eden') as InteriorDef;
    game.enter(interior);
    settle(game.motor);

    const door = { x: -30, z: 96 };
    game.leave(interior, door);
    const outside = settle(game.motor);

    expect(game.physics.indoor, 'o modo interior ficou ligado depois de sair').toBe(false);
    expect(game.physics.getColliders().length, 'as paredes do prédio ficaram no mundo').toBe(0);
    expect(Math.hypot(outside.x - door.x, outside.z - door.z), 'não voltou para a porta').toBeLessThan(3);
    expect(outside.y, 'voltou para dentro do chão').toBeGreaterThan(SWIM_LINE);
  });

  it('viajar com um prédio aberto não deixa parede nenhuma para trás', () => {
    const game = makeGame('aurora-city');
    const interior = getInterior('torre-zenite') as InteriorDef;
    game.enter(interior);
    const abandoned = game.physics;
    expect(abandoned.getColliders().length).toBeGreaterThan(20);

    // O motor fecha o interior antes de trocar de mundo.
    game.scene.unload(interior);
    expect(abandoned.getColliders().length, 'o prédio ficou carregado na física velha').toBe(0);
    expect(abandoned.indoor, 'o modo interior ficou ligado na física velha').toBe(false);

    game.travel('rosas-park');
    game.enter(getInterior('santuario-rosas') as InteriorDef);
    expect(game.physics.indoor).toBe(true);
    expect(settle(game.motor).swimming).toBe(false);
  });
});

describe('dá para caminhar dentro de cada prédio das duas regiões', () => {
  const casos = [
    { regionId: 'aurora-city', vindoDe: 'rosas-park' },
    { regionId: 'rosas-park', vindoDe: 'aurora-city' },
  ] as const;

  for (const caso of casos) {
    for (const interior of interiorsInRegion(caso.regionId)) {
      it(`${caso.regionId}: ${interior.name}`, () => {
        const game = makeGame(caso.vindoDe);
        game.travel(caso.regionId);
        game.enter(interior);

        const rest = settle(game.motor);
        expect(rest.swimming, 'nadando ao entrar').toBe(false);
        expect(rest.grounded, 'sem chão ao entrar').toBe(true);

        // Quatro rumos, dois segundos cada: ninguém deve nadar nem
        // cair, e o prédio deve segurar o jogador lá dentro.
        for (const [dx, dz] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ]) {
          const run = walk(game.motor, dx, dz, 2);
          expect(run.swam, `nadou andando para (${dx}, ${dz})`).toBe(false);
          expect(run.lowest, `caiu para ${run.lowest.toFixed(2)} m andando para (${dx}, ${dz})`).toBeGreaterThan(-1);
          expect(Math.hypot(run.x - INTERIOR_ORIGIN.x, run.z - INTERIOR_ORIGIN.z), 'atravessou a parede e saiu do prédio').toBeLessThan(60);
        }

        game.leave(interior, { x: 0, z: 30 });
        expect(game.physics.indoor).toBe(false);
        expect(game.physics.getColliders().length, 'sobrou colisor do interior na cidade').toBe(0);
      });
    }
  }
});
