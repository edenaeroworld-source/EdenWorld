// @vitest-environment happy-dom

/**
 * Escadas, saída e isolamento de cena.
 *
 * O que estes testes defendem não é "existe uma escada nos dados" —
 * isso já era verdade e o jogador continuava preso no pé dela. É se
 * dá para **subir**, se dá para **descer**, se o corpo se move como
 * quem anda (e não como quem escala) em cada tipo de piso, se a saída
 * é sempre uma decisão do jogador, e se um prédio aberto não deixa
 * nada atrás quando fecha.
 */

import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';

import { PLAYER } from '../../src/core/Config';
import { allInteriors, getInterior, type InteriorDef } from '../../src/interiors/Interior';
import { FLOOR_HEIGHT } from '../../src/interiors/InteriorKit';
import { INTERIOR_ORIGIN, InteriorScene } from '../../src/interiors/InteriorScene';
import { stairFlight, stairHeightAt, stairwellOf } from '../../src/interiors/InteriorShell';
import { HUD } from '../../src/interface/HUD';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { ThirdPersonCamera } from '../../src/camera/ThirdPersonCamera';
import { AvatarAnimator } from '../../src/player/AvatarAnimator';
import { type MoveIntent, PlayerMotor } from '../../src/player/PlayerMotor';

const DT = 1 / 60;

function go(x: number, z: number, run = false): MoveIntent {
  return { x, z, run, jump: false, jumpHeld: false };
}

/** Prédios de mais de um andar: são os que têm escada de verdade. */
const MULTI: InteriorDef[] = allInteriors().filter((interior) => interior.floors > 1);

describe('escadas dos interiores', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let interiorScene: InteriorScene;

  beforeEach(() => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    interiorScene = new InteriorScene({ scene, physics, onInteractables: () => {} });
  });

  /**
   * Caminha segurando uma direção e devolve o que aconteceu com o
   * corpo — é a única forma honesta de saber se uma escada é
   * caminhável: andando nela.
   */
  function walk(motor: PlayerMotor, intent: MoveIntent, seconds: number) {
    const states = new Set<string>();
    let highest = motor.position.y;
    let lowest = motor.position.y;
    let biggestJolt = 0;
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i += 1) {
      const before = motor.position.y;
      motor.update(DT, intent);
      biggestJolt = Math.max(biggestJolt, Math.abs(motor.position.y - before));
      highest = Math.max(highest, motor.position.y);
      lowest = Math.min(lowest, motor.position.y);
      states.add(motor.state);
    }
    return { states, highest, lowest, biggestJolt, y: motor.position.y };
  }

  /** Coloca o jogador no pé da escada, virado para a subida. */
  function atStairFoot(interior: InteriorDef): { motor: PlayerMotor; intent: MoveIntent } {
    const stair = stairwellOf(interior);
    const flight = stairFlight(stair);
    const motor = new PlayerMotor(physics);
    // Meio passo antes do primeiro degrau, no eixo da subida — e não
    // encostado na parede, para medir a escada e não o empurrão.
    const outside = flight.start - flight.forward * 0.45;
    const x = flight.alongZ ? flight.cross : outside;
    const z = flight.alongZ ? outside : flight.cross;
    motor.teleport(INTERIOR_ORIGIN.x + x, INTERIOR_ORIGIN.z + z, 0, 0);
    const intent = flight.alongZ ? go(0, flight.forward) : go(flight.forward, 0);
    return { motor, intent };
  }

  it.each(MULTI.map((interior) => [interior.id, interior] as const))(
    '%s: o jogador sobe a escada inteira só andando para a frente',
    (_id, interior) => {
      interiorScene.load(interior);
      const { motor, intent } = atStairFoot(interior);

      const result = walk(motor, intent, 12);

      // Chegou ao andar de cima — não ficou preso no primeiro degrau.
      expect(result.highest).toBeGreaterThanOrEqual(FLOOR_HEIGHT - 0.05);
      // E chegou andando: sem pulo, sem queda, sem nado.
      expect(result.states.has('jump')).toBe(false);
      expect(result.states.has('fall')).toBe(false);
      expect(result.states.has('swim')).toBe(false);
    },
  );

  it.each(MULTI.map((interior) => [interior.id, interior] as const))(
    '%s: subir é suave — nenhum degrau teleporta o corpo',
    (_id, interior) => {
      interiorScene.load(interior);
      const { motor, intent } = atStairFoot(interior);

      const result = walk(motor, intent, 12);

      // Um degrau tem 34 cm. Se o corpo subisse de uma vez, o salto de
      // um quadro seria esse valor inteiro; acompanhando a subida, cada
      // quadro anda muito menos. É o que separa a câmera tremida da
      // caminhada contínua.
      expect(result.biggestJolt).toBeLessThan(0.12);
    },
  );

  it.each(MULTI.map((interior) => [interior.id, interior] as const))(
    '%s: quem subiu consegue descer pelo mesmo caminho',
    (_id, interior) => {
      interiorScene.load(interior);
      const { motor, intent } = atStairFoot(interior);
      walk(motor, intent, 12);
      expect(motor.position.y).toBeGreaterThanOrEqual(FLOOR_HEIGHT - 0.05);

      const back: MoveIntent = { ...intent, x: -intent.x, z: -intent.z };
      const descent = walk(motor, back, 12);

      // Voltou ao térreo inteiro, e descendo — não caindo.
      expect(descent.y).toBeLessThan(0.2);
      expect(descent.states.has('fall')).toBe(false);
      expect(descent.biggestJolt).toBeLessThan(0.2);
    },
  );

  it.each(MULTI.map((interior) => [interior.id, interior] as const))(
    '%s: no topo dá para sair da escada e pisar no andar de cima',
    (_id, interior) => {
      interiorScene.load(interior);
      const stair = stairwellOf(interior);
      const { motor, intent } = atStairFoot(interior);

      walk(motor, intent, 14);

      const lx = motor.position.x - INTERIOR_ORIGIN.x;
      const lz = motor.position.z - INTERIOR_ORIGIN.z;
      const insideStairwell =
        lx > stair.x && lx < stair.x + stair.w && lz > stair.z && lz < stair.z + stair.d;

      // Subir e não conseguir entrar no andar é o mesmo que não ter
      // escada: o guarda-corpo tem de deixar a boca livre, do lado
      // certo. Com o vidro no lado errado o jogador para no último
      // degrau, de cara para o nada.
      expect({ interior: interior.id, insideStairwell }).toEqual({ interior: interior.id, insideStairwell: false });
      expect(motor.position.y).toBeGreaterThanOrEqual(FLOOR_HEIGHT - 0.05);
    },
  );

  it.each(MULTI.map((interior) => [interior.id, interior] as const))(
    '%s: dá para subir correndo, sem escorregar de volta ao pé da escada',
    (_id, interior) => {
      interiorScene.load(interior);
      const { motor, intent } = atStairFoot(interior);

      // Correndo, cada quadro cobre mais piso de degrau. Se a subida
      // do corpo não acompanhasse a velocidade, o degrau seguinte
      // sairia do alcance do passo e a pessoa despencaria — que é
      // exatamente ficar preso no começo da escada.
      const result = walk(motor, { ...intent, run: true }, 12);

      expect(result.highest).toBeGreaterThanOrEqual(FLOOR_HEIGHT - 0.05);
      expect(result.states.has('fall')).toBe(false);
    },
  );

  it('a boca da escada fica aberta: o guarda-corpo não fecha a chegada', () => {
    for (const interior of MULTI) {
      const stair = stairwellOf(interior);
      const flight = stairFlight(stair);
      const scene2 = new THREE.Scene();
      const physics2 = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
      const layer = new InteriorScene({ scene: scene2, physics: physics2, onInteractables: () => {} });
      layer.load(interior);

      // O lado por onde se chega ao andar de cima não pode ter vidro.
      const rails = (physics2 as unknown as { colliders: { tag?: string }[] }).colliders
        .map((collider) => collider.tag ?? '')
        .filter((tag) => tag.includes('guarda-corpo'));
      expect(rails.length).toBeGreaterThan(0);
      expect(rails.some((tag) => tag.endsWith(flight.mouth))).toBe(false);
      layer.unload(interior);
    }
  });

  it('nenhum móvel invade o vão da escada', () => {
    for (const interior of MULTI) {
      const stair = stairwellOf(interior);
      const physics2 = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
      const layer = new InteriorScene({ scene: new THREE.Scene(), physics: physics2, onInteractables: () => {} });
      layer.load(interior);

      const intruders = (
        physics2 as unknown as {
          colliders: { tag?: string; x: number; z: number; halfX: number; halfZ: number }[];
        }
      ).colliders
        .filter((collider) => collider.tag?.includes('movel:'))
        .filter((collider) => {
          const lx = collider.x - INTERIOR_ORIGIN.x;
          const lz = collider.z - INTERIOR_ORIGIN.z;
          return (
            lx + collider.halfX > stair.x &&
            lx - collider.halfX < stair.x + stair.w &&
            lz + collider.halfZ > stair.z &&
            lz - collider.halfZ < stair.z + stair.d
          );
        })
        .map((collider) => collider.tag);

      // Um móvel aqui ou fica encravado nos degraus, ou flutua sobre o
      // buraco que a laje de cima abre para a escada passar.
      expect({ interior: interior.id, intruders }).toEqual({ interior: interior.id, intruders: [] });
      layer.unload(interior);
    }
  });

  it('o degrau cabe no passo do jogador, com folga', () => {
    for (const interior of MULTI) {
      const flight = stairFlight(stairwellOf(interior));
      expect(flight.rise).toBeLessThan(PLAYER.stepHeight);
      // E o piso do degrau comporta o corpo inteiro de pé.
      expect(flight.depth).toBeGreaterThan(PLAYER.radius);
    }
  });

  it('a altura da escada é contínua: a mesma conta serve ao jogador e a quem mora ali', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    interiorScene.load(interior);
    const stair = stairwellOf(interior);
    const flight = stairFlight(stair);

    let previous = 0;
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      const along = flight.start + flight.forward * t * flight.run;
      const x = flight.alongZ ? flight.cross : along;
      const z = flight.alongZ ? along : flight.cross;
      const height = stairHeightAt(stair, x, z);
      expect(height).not.toBeNull();
      if (height === null) continue;
      // Sobe sempre, nunca desce no meio do lance, e nunca passa do andar.
      expect(height).toBeGreaterThanOrEqual(previous - 1e-6);
      expect(height).toBeLessThanOrEqual(FLOOR_HEIGHT + 1e-6);
      previous = height;
    }
    expect(previous).toBeCloseTo(FLOOR_HEIGHT, 5);
    // Fora do vão não existe degrau nenhum.
    expect(stairHeightAt(stair, stair.x - 1, stair.z - 1)).toBeNull();
  });
});

describe('a animação acompanha o chão, não o contrário', () => {
  let physics: PhysicsWorld;

  beforeEach(() => {
    physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
  });

  function run(motor: PlayerMotor, intent: MoveIntent, seconds: number): Set<string> {
    const states = new Set<string>();
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      motor.update(DT, intent);
      states.add(motor.state);
    }
    return states;
  }

  it('no plano o personagem anda — nunca entra em modo de escada', () => {
    const motor = new PlayerMotor(physics);
    motor.teleport(0, 0, 0, 0);
    const states = run(motor, go(0, -1), 4);
    expect(states.has('walk')).toBe(true);
    expect(states.has('stairUp')).toBe(false);
    expect(states.has('stairDown')).toBe(false);
    expect(Math.abs(motor.slope)).toBeLessThan(0.05);
  });

  it('numa rampa suave o personagem anda, não escala', () => {
    // Uma rampa como a do píer do Parque das Rosas: sobe 1,2 m ao
    // longo de 8,5 m. Quem a sobe está caminhando, e tem de parecer
    // que está caminhando.
    const rise = 1.2;
    const length = 8.5;
    const half = length / 2;
    physics.addBox({
      x: 0,
      z: -half,
      halfX: 3,
      halfZ: half,
      yMin: -0.5,
      yMax: rise,
      walkable: true,
      solid: false,
      blocksCamera: false,
      surface: 'wood',
      // `topAt` recebe coordenadas locais: o deck sobe do começo
      // (local +half, onde o jogador entra) ao fim (local −half).
      topAt: (_x: number, z: number) => ((half - z) / length) * rise,
      tag: 'rampa',
    });

    const motor = new PlayerMotor(physics);
    motor.teleport(0, 0, 0, 0);

    const states = new Set<string>();
    let highest = 0;
    let steepest = 0;
    for (let i = 0; i < Math.round(2.5 / DT); i += 1) {
      motor.update(DT, go(0, -1));
      states.add(motor.state);
      highest = Math.max(highest, motor.position.y);
      steepest = Math.max(steepest, Math.abs(motor.slope));
    }

    // Subiu a rampa inteira…
    expect(highest).toBeGreaterThan(rise - 0.1);
    // …andando.
    expect(states.has('walk')).toBe(true);
    expect(states.has('stairUp')).toBe(false);
    expect(states.has('stairDown')).toBe(false);
    // A inclinação é real, mas é de rampa — longe do limiar de escada.
    expect(steepest).toBeGreaterThan(0.05);
    expect(steepest).toBeLessThan(0.3);
  });

  it('numa escada o personagem sobe degrau, e o estado diz isso', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    layer.load(interior);

    const motor = new PlayerMotor(physics);
    motor.teleport(INTERIOR_ORIGIN.x + 21.3, INTERIOR_ORIGIN.z + 17.6, Math.PI, 0);
    const states = run(motor, go(0, -1), 8);

    expect(states.has('stairUp')).toBe(true);
    expect(motor.position.y).toBeGreaterThan(FLOOR_HEIGHT - 0.1);
    // Chegando em cima, volta a ser caminhada normal.
    expect(motor.state).not.toBe('stairUp');
  });

  it('descer a escada tem estado próprio, diferente de cair', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    layer.load(interior);

    const motor = new PlayerMotor(physics);
    motor.teleport(INTERIOR_ORIGIN.x + 21.3, INTERIOR_ORIGIN.z + 17.6, Math.PI, 0);
    run(motor, go(0, -1), 8);
    const down = run(motor, go(0, 1), 8);

    expect(down.has('stairDown')).toBe(true);
    expect(down.has('fall')).toBe(false);
  });

  it('a pose de escada entra pela inclinação, e some no plano', () => {
    const animator = new AvatarAnimator();
    const pose = (state: 'walk' | 'stairUp', slope: number) => {
      // Deixa a mistura assentar antes de ler.
      let out = animator.update(DT, { state, speed: 2.4, stridePhase: 0.9, verticalSpeed: 0, slope, elapsed: 0 });
      for (let i = 0; i < 90; i += 1) {
        out = animator.update(DT, { state, speed: 2.4, stridePhase: 0.9, verticalSpeed: 0, slope, elapsed: i * DT });
      }
      return Float32Array.from(out);
    };

    const flat = pose('walk', 0);
    const climbing = pose('stairUp', 0.74);
    const backToFlat = pose('walk', 0);

    // A escada muda a pose de verdade…
    let difference = 0;
    for (let i = 0; i < flat.length; i += 1) difference += Math.abs(climbing[i] - flat[i]);
    expect(difference).toBeGreaterThan(0.5);

    // …e sai de cena quando o chão volta a ser plano. Sem isto, o
    // personagem continuaria escalando no meio da loja.
    let residue = 0;
    for (let i = 0; i < flat.length; i += 1) residue += Math.abs(backToFlat[i] - flat[i]);
    expect(residue).toBeLessThan(0.05);
  });

  it('a velocidade da passada continua sendo a velocidade real na escada', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    layer.load(interior);

    const motor = new PlayerMotor(physics);
    motor.teleport(INTERIOR_ORIGIN.x + 21.3, INTERIOR_ORIGIN.z + 17.6, Math.PI, 0);

    let phaseOnStairs = 0;
    let distanceOnStairs = 0;
    for (let i = 0; i < 480; i += 1) {
      const phaseBefore = motor.stridePhase;
      const travelled = motor.distanceTravelled;
      motor.update(DT, go(0, -1));
      if (motor.state === 'stairUp') {
        phaseOnStairs += motor.stridePhase - phaseBefore;
        distanceOnStairs += motor.distanceTravelled - travelled;
      }
    }

    expect(distanceOnStairs).toBeGreaterThan(1);
    // A passada é função da distância andada, como no plano: nada de
    // pernas girando no lugar enquanto o corpo sobe.
    expect(phaseOnStairs).toBeCloseTo((distanceOnStairs / 0.78) * Math.PI, 1);
  });
});

describe('a câmera acompanha o andar', () => {
  it('a laje do andar barra a câmera: de cima não se enxerga o térreo por baixo', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    layer.load(interior);

    // Raio para baixo, de quem está na galeria: tem de esbarrar no
    // piso. Enquanto a laje era transparente para a câmera, ela
    // mergulhava e mostrava o mercado visto de dentro do chão.
    const hit = physics.raycast(INTERIOR_ORIGIN.x + 6, FLOOR_HEIGHT + 1.2, INTERIOR_ORIGIN.z + 6, 0, -1, 0, 6);
    expect(hit).toBeLessThan(1.4);
  });

  it('sem laje opaca, o limite de altura ainda segura a câmera no andar', () => {
    // Só a trava de altura, isolada: um estrado pisável que a câmera
    // atravessa, com relevo externo bem fundo. Se a trava usar o
    // relevo em vez do andar, a câmera despenca.
    const physics = new PhysicsWorld({ getHeight: () => -40, getSurface: () => 'grass' });
    physics.setIndoor(0);
    physics.addBox({
      x: 0,
      z: 0,
      halfX: 12,
      halfZ: 12,
      yMin: FLOOR_HEIGHT - 0.2,
      yMax: FLOOR_HEIGHT,
      walkable: true,
      solid: false,
      blocksCamera: false,
      surface: 'stone',
      tag: 'laje-vazada',
    });

    const rig = new ThirdPersonCamera();
    rig.setViewport(1280, 720);
    const focus = new THREE.Vector3(0, FLOOR_HEIGHT + 1.2, 0);
    rig.reset(0, true);
    for (let i = 0; i < 180; i += 1) {
      rig.pitch = -0.95;
      rig.update(DT, focus, 0, false, physics);
    }

    expect(rig.camera.position.y).toBeGreaterThanOrEqual(FLOOR_HEIGHT);
  });

  it('a câmera não atravessa o piso quando o jogador está no andar de cima', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    // Relevo exterior fundo: é o que a câmera usava antes de saber o
    // que é um andar, e é o que a fazia descer para dentro do térreo.
    const physics = new PhysicsWorld({ getHeight: () => -40, getSurface: () => 'grass' });
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    layer.load(interior);

    const rig = new ThirdPersonCamera();
    rig.setViewport(1280, 720);
    // Jogador de pé na galeria, longe da escada.
    const focus = new THREE.Vector3(INTERIOR_ORIGIN.x + 6, FLOOR_HEIGHT + 1.2, INTERIOR_ORIGIN.z + 6);
    rig.reset(0, true);
    for (let i = 0; i < 120; i += 1) {
      // Olhando de baixo para cima: é a mira que empurra a câmera
      // contra o piso, e onde o afundamento aparecia.
      rig.pitch = -0.45;
      rig.update(DT, focus, 0, false, physics);
    }

    // A câmera para em cima da laje do primeiro andar. Antes ela
    // mergulhava para o relevo lá fora e mostrava a galeria por baixo.
    expect(rig.camera.position.y).toBeGreaterThanOrEqual(FLOOR_HEIGHT);
  });

  it('dentro do prédio o piso da câmera é a laje do andar, não o relevo lá fora', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    // Relevo exterior alto de propósito: é o que a câmera usava antes,
    // e é o que a fazia flutuar ou afundar dentro do prédio.
    const physics = new PhysicsWorld({ getHeight: () => 12, getSurface: () => 'grass' });
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    layer.load(interior);

    const x = INTERIOR_ORIGIN.x + 6;
    const z = INTERIOR_ORIGIN.z + 6;
    expect(physics.indoor).toBe(true);
    // No térreo, o chão da câmera é o térreo.
    expect(physics.floorUnder(x, z, 1.2)).toBeCloseTo(0, 1);
    // No primeiro andar, é a laje do primeiro andar.
    expect(physics.floorUnder(x, z, FLOOR_HEIGHT + 0.3)).toBeCloseTo(FLOOR_HEIGHT, 1);

    layer.unload(interior);
    // Lá fora, volta a ser o relevo.
    expect(physics.indoor).toBe(false);
    expect(physics.floorUnder(x, z, 20)).toBeCloseTo(12, 1);
  });
});

describe('gente que usa a escada', () => {
  /** Posição de uma pessoa desenhada, pelo nome do nó. */
  function personY(layer: InteriorScene, id: string): number | null {
    const node = layer.group.getObjectByName(`pessoa:${id}`);
    return node ? node.position.y : null;
  }

  it('o Mercado tem alguém que sobe para a galeria', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    layer.load(interior);

    let lowest = Infinity;
    let highest = -Infinity;
    let biggestJump = 0;
    let previous: number | null = null;

    // Um ciclo inteiro do trajeto.
    for (let i = 0; i < 60 * 60; i += 1) {
      layer.update(DT, i * DT);
      const y = personY(layer, 'cliente-mercado-escada');
      if (y === null) continue;
      lowest = Math.min(lowest, y);
      highest = Math.max(highest, y);
      if (previous !== null) biggestJump = Math.max(biggestJump, Math.abs(y - previous));
      previous = y;
    }

    // Esteve no térreo e esteve na galeria.
    expect(lowest).toBeLessThan(0.3);
    expect(highest).toBeGreaterThan(FLOOR_HEIGHT - 0.2);
    // E fez o caminho pisando: sem teletransporte entre os andares.
    expect(biggestJump).toBeLessThan(0.2);
  });

  it('quem anda num andar só continua nivelado', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    layer.load(interior);

    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < 60 * 30; i += 1) {
      layer.update(DT, i * DT);
      const y = personY(layer, 'cliente-mercado-1');
      if (y === null) continue;
      lowest = Math.min(lowest, y);
      highest = Math.max(highest, y);
    }
    // Só o balanço da passada.
    expect(highest - lowest).toBeLessThan(0.1);
  });
});

describe('sair é sempre uma decisão do jogador', () => {
  it('ao ar livre não existe botão de sair do prédio', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const hud = new HUD(root, {
      onPhone: () => {},
      onMenu: () => {},
      onInteract: () => {},
      onExitMode: () => {},
      onCapture: () => {},
      onLeaveBuilding: () => {},
    });
    expect(hud.leaveBuildingVisible).toBe(false);
  });

  it('dentro do prédio o botão aparece, e some ao sair', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const hud = new HUD(root, {
      onPhone: () => {},
      onMenu: () => {},
      onInteract: () => {},
      onExitMode: () => {},
      onCapture: () => {},
      onLeaveBuilding: () => {},
    });

    hud.setLeaveBuilding('Mercado Éden');
    expect(hud.leaveBuildingVisible).toBe(true);

    hud.setLeaveBuilding(null);
    expect(hud.leaveBuildingVisible).toBe(false);
  });

  it('o botão só sai do prédio quando é apertado — nunca sozinho', () => {
    const root = document.createElement('div');
    document.body.append(root);
    let saidas = 0;
    const hud = new HUD(root, {
      onPhone: () => {},
      onMenu: () => {},
      onInteract: () => {},
      onExitMode: () => {},
      onCapture: () => {},
      onLeaveBuilding: () => {
        saidas += 1;
      },
    });

    hud.setLeaveBuilding('Torre Zênite');
    // Só existir na tela não tira ninguém de lugar nenhum.
    expect(saidas).toBe(0);

    const button = root.querySelector<HTMLButtonElement>('.hud__leave');
    expect(button).not.toBeNull();
    button?.click();
    expect(saidas).toBe(1);
  });

  it('o botão sai de cena no modo foto e volta depois', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const hud = new HUD(root, {
      onPhone: () => {},
      onMenu: () => {},
      onInteract: () => {},
      onExitMode: () => {},
      onCapture: () => {},
      onLeaveBuilding: () => {},
    });

    hud.setLeaveBuilding('Mercado Éden');
    hud.setMode('photo', 'Foto');
    expect(hud.leaveBuildingVisible).toBe(false);
    hud.setMode('normal');
    expect(hud.leaveBuildingVisible).toBe(true);
  });

  it('a porta continua sendo uma saída: o interativo existe e tem ação', () => {
    const interior = getInterior('mercado-eden');
    if (!interior) return;
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    let items: readonly { id: string; action: string }[] = [];
    const layer = new InteriorScene({
      scene: new THREE.Scene(),
      physics,
      onInteractables: (next) => {
        items = next;
      },
    });
    layer.load(interior);

    const exit = items.find((item) => item.id.startsWith('interior:saida:'));
    expect(exit).toBeDefined();
    expect(exit?.action).toBe('Sair');
  });
});

describe('um prédio por vez, e nada fica para trás', () => {
  it('entrar no segundo libera tudo do primeiro, inclusive a escada', () => {
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    const scene = new THREE.Scene();
    const layer = new InteriorScene({ scene, physics, onInteractables: () => {} });

    const colliderTags = () =>
      (physics as unknown as { colliders: { tag?: string }[] }).colliders.map((collider) => collider.tag ?? '');

    layer.load(getInterior('mercado-eden')!);
    expect(colliderTags().some((tag) => tag.includes('escada'))).toBe(true);
    expect(colliderTags().some((tag) => tag.includes('guarda-corpo'))).toBe(true);

    layer.load(getInterior('edenpawl-aurora')!);
    // A EdenPawl tem um andar só: nenhuma escada pode ter sobrado.
    expect(colliderTags().some((tag) => tag.includes('escada'))).toBe(false);
    expect(colliderTags().some((tag) => tag.includes('guarda-corpo'))).toBe(false);
    expect(colliderTags().some((tag) => tag.includes('corrimao'))).toBe(false);
  });

  it('sair devolve o relevo, o limite do mundo e uma cena vazia', () => {
    const physics = new PhysicsWorld({ getHeight: () => 7, getSurface: () => 'grass' });
    const scene = new THREE.Scene();
    const layer = new InteriorScene({ scene, physics, onInteractables: () => {} });
    const interior = getInterior('mercado-eden')!;

    layer.load(interior);
    expect(physics.indoor).toBe(true);

    layer.unload(interior);
    expect(physics.indoor).toBe(false);
    expect((physics as unknown as { colliders: unknown[] }).colliders.length).toBe(0);
    expect(layer.group.visible).toBe(false);
    // E o chão volta a ser o do mundo lá fora.
    expect(physics.floorUnder(0, 0, 20)).toBeCloseTo(7, 1);
  });

  it('entrar, subir, sair e entrar de novo deixa a escada no mesmo lugar', () => {
    const physics = new PhysicsWorld({ getHeight: () => 0, getSurface: () => 'grass' });
    const layer = new InteriorScene({ scene: new THREE.Scene(), physics, onInteractables: () => {} });
    const interior = getInterior('mercado-eden')!;

    const climb = (): number => {
      const motor = new PlayerMotor(physics);
      motor.teleport(INTERIOR_ORIGIN.x + 21.3, INTERIOR_ORIGIN.z + 17.4, Math.PI, 0);
      let highest = 0;
      for (let i = 0; i < 600; i += 1) {
        motor.update(DT, go(0, -1));
        highest = Math.max(highest, motor.position.y);
      }
      return highest;
    };

    layer.load(interior);
    const first = climb();
    layer.unload(interior);

    layer.load(interior);
    const second = climb();

    // A segunda visita sobe igual à primeira — nem degrau duplicado,
    // nem escada que sumiu.
    expect(second).toBeCloseTo(first, 2);
    expect(second).toBeGreaterThan(FLOOR_HEIGHT - 0.1);
  });
});
