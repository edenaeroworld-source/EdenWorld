// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { archetypePersona, characterPersona } from '../../src/characters/Personas';
import { makeCitizen } from '../../src/npc/CitizenData';
import { CitizenSim } from '../../src/npc/CitizenSim';
import { GREET_COOLDOWN, NpcLife } from '../../src/npc/NpcLife';
import { NpcSystem } from '../../src/npc/NpcSystem';
import { buildAuroraWalkNetwork } from '../../src/npc/WalkNetwork';
import { Avatar } from '../../src/player/Avatar';
import { AvatarAnimator, Ch, type Pose } from '../../src/player/AvatarAnimator';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { FACE_MORPHS, FaceController, buildFaceGeometry } from '../../src/player/AvatarFace';
import { EXPRESSION_WEIGHTS, EXPRESSIONS } from '../../src/player/Expressions';
import { GESTURES, GESTURE_IDS, GesturePlayback, getGesture } from '../../src/player/Gestures';
import { QualitySystem, defaultGraphicsSettings } from '../../src/systems/QualitySystem';
import { createRng } from '../../src/utils/math';

/**
 * A vida dos habitantes: gesto, rosto e atenção.
 *
 * O compromisso que estes testes protegem é o mesmo em toda parte: as
 * camadas novas **somam** à animação que já existia. Ninguém congela no
 * meio do passo para acenar, e o avatar reaproveitado nunca herda o
 * sorriso de quem saiu de vista.
 */

/* -------------------------------------------------------------------------- */
/* Gestos                                                                      */
/* -------------------------------------------------------------------------- */

/** Canais que a locomoção usa e que nenhum gesto pode tocar. */
const LEG_CHANNELS = [Ch.LegLX, Ch.LegRX, Ch.LegLZ, Ch.LegRZ, Ch.ShinL, Ch.ShinR];

function walkPose(animator: AvatarAnimator, dt: number, phase: number): Pose {
  return animator.update(dt, { state: 'walk', speed: 2, stridePhase: phase, verticalSpeed: 0, elapsed: phase });
}

describe('gestos por cima da animação', () => {
  it('tem os doze gestos da conversa, todos com duração e mistura', () => {
    expect(GESTURE_IDS.length).toBe(12);
    for (const id of GESTURE_IDS) {
      const gesture = GESTURES[id];
      expect(gesture.id).toBe(id);
      expect(gesture.label.length).toBeGreaterThan(0);
      expect(gesture.duration).toBeGreaterThan(0);
      expect(gesture.fade).toBeGreaterThan(0);
    }
    // Os pedidos da proposta estão todos lá.
    for (const id of ['acenar', 'cumprimentar', 'falar', 'concordar', 'pensar', 'apontar', 'rir', 'surpresa', 'despedir']) {
      expect(GESTURE_IDS).toContain(id);
    }
    expect(getGesture('inexistente')).toBeUndefined();
  });

  it('nenhum gesto mexe nas pernas', () => {
    for (const id of GESTURE_IDS) {
      const base = new AvatarAnimator();
      const comGesto = new AvatarAnimator();
      comGesto.playGesture(id);
      let phase = 0;
      for (let step = 0; step < 40; step++) {
        phase += 0.2;
        const limpo = Float32Array.from(walkPose(base, 1 / 30, phase));
        const gesto = walkPose(comGesto, 1 / 30, phase);
        for (const channel of LEG_CHANNELS) {
          expect(Math.abs(gesto[channel] - limpo[channel])).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('o peso sobe, fica cheio e desce — sem corte', () => {
    const playback = new GesturePlayback(GESTURES.acenar);
    expect(playback.weight).toBe(0);
    playback.update(GESTURES.acenar.fade);
    expect(playback.weight).toBeCloseTo(1, 2);
    playback.update(GESTURES.acenar.duration - GESTURES.acenar.fade * 1.5);
    expect(playback.weight).toBeGreaterThan(0);
    expect(playback.weight).toBeLessThan(1);
    playback.update(1);
    expect(playback.weight).toBe(0);
    expect(playback.finished).toBe(true);
  });

  it('a força do gesto limita a mistura (personagem contido)', () => {
    const forte = new GesturePlayback(GESTURES.acenar, { strength: 1 });
    const fraco = new GesturePlayback(GESTURES.acenar, { strength: 0.3 });
    forte.update(0.5);
    fraco.update(0.5);
    expect(fraco.weight).toBeLessThan(forte.weight);
    expect(fraco.weight).toBeCloseTo(0.3, 2);
  });

  it('parar um gesto o apaga suavemente, sem saltar de volta', () => {
    const playback = new GesturePlayback(GESTURES.pensar);
    playback.update(1);
    const antes = playback.weight;
    playback.stop();
    expect(playback.weight).toBeCloseTo(antes, 3);
    playback.update(GESTURES.pensar.fade * 1.1);
    expect(playback.weight).toBe(0);
    expect(playback.finished).toBe(true);
  });

  it('trocar de gesto mistura os dois em vez de cortar', () => {
    const animator = new AvatarAnimator();
    animator.playGesture('acenar');
    for (let step = 0; step < 20; step++) animator.update(1 / 30, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 0 });
    const antes = animator.update(0, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 0 })[Ch.ArmRZ];
    animator.playGesture('pensar');
    const depois = animator.update(1 / 60, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 0 })[Ch.ArmRZ];
    // Um quadro depois da troca o braço ainda está perto de onde estava.
    expect(Math.abs(depois - antes)).toBeLessThan(0.6);
  });

  it('o animador expõe o gesto em curso e o aceno continua funcionando', () => {
    const animator = new AvatarAnimator();
    expect(animator.isGesturing).toBe(false);
    animator.wave();
    expect(animator.isWaving).toBe(true);
    expect(animator.currentGesture).toBe('acenar');
    animator.stopGesture();
    expect(animator.currentGesture).toBeNull();
  });

  it('olhar vira a cabeça sem girar o corpo inteiro', () => {
    const animator = new AvatarAnimator();
    const input = { state: 'idle' as const, speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 0 };
    animator.lookAt(0.9);
    for (let step = 0; step < 60; step++) animator.update(1 / 30, input);
    const pose = animator.update(0, input);
    expect(pose[Ch.HeadY]).toBeGreaterThan(0.5);
    // O tronco acompanha de leve, mas nem perto do giro da cabeça.
    expect(Math.abs(pose[Ch.TorsoY])).toBeLessThan(Math.abs(pose[Ch.HeadY]) / 2);
    animator.clearLook();
    for (let step = 0; step < 60; step++) animator.update(1 / 30, input);
    expect(Math.abs(animator.update(0, input)[Ch.HeadY])).toBeLessThan(0.1);
  });

  it('falar move os braços enquanto o texto aparece', () => {
    const calado = new AvatarAnimator();
    const falando = new AvatarAnimator();
    falando.setTalking(1);
    const input = { state: 'idle' as const, speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 0 };
    for (let step = 0; step < 60; step++) {
      calado.update(1 / 30, input);
      falando.update(1 / 30, input);
    }
    const a = calado.update(0, input);
    const b = falando.update(0, input);
    expect(Math.abs(b[Ch.ForeL] - a[Ch.ForeL])).toBeGreaterThan(0.2);
    expect(falando.talking).toBeGreaterThan(0.5);
  });
});

/* -------------------------------------------------------------------------- */
/* Rosto                                                                       */
/* -------------------------------------------------------------------------- */

describe('expressões faciais', () => {
  it('o rosto tem um alvo de morph por peça que se mexe', () => {
    const geometry = buildFaceGeometry(DEFAULT_APPEARANCE);
    const targets = geometry.morphAttributes.position as THREE.BufferAttribute[] | undefined;
    expect(targets).toBeDefined();
    if (!targets) return;
    expect(targets.length).toBe(FACE_MORPHS.length);
    const base = geometry.getAttribute('position');
    for (let i = 0; i < targets.length; i++) {
      // Mesma malha, posições diferentes: é isso que permite misturar.
      expect(targets[i].count).toBe(base.count);
      expect(targets[i].name).toBe(FACE_MORPHS[i]);
      let diferentes = 0;
      for (let v = 0; v < base.count; v++) {
        if (Math.abs(targets[i].getY(v) - base.getY(v)) > 1e-5) diferentes += 1;
      }
      expect(diferentes).toBeGreaterThan(0);
    }
    // O atributo de zona existe e marca "não deformar" (os Afters® não
    // mexem no rosto).
    const zone = geometry.getAttribute('aZone');
    expect(zone.count).toBe(base.count);
    for (let v = 0; v < zone.count; v++) expect(zone.getX(v)).toBe(0);
    geometry.dispose();
  });

  it('cada expressão é uma mistura de alvos válidos', () => {
    for (const expression of EXPRESSIONS) {
      const mix = EXPRESSION_WEIGHTS[expression];
      for (const [morph, weight] of Object.entries(mix)) {
        expect(FACE_MORPHS).toContain(morph);
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
    expect(Object.keys(EXPRESSION_WEIGHTS.neutra)).toHaveLength(0);
    expect(EXPRESSION_WEIGHTS.feliz.sorriso).toBe(1);
  });

  it('troca de expressão é gradual, não um salto', () => {
    const face = new FaceController(1);
    const sorriso = FACE_MORPHS.indexOf('sorriso');
    face.setExpression('feliz');
    expect(face.weights[sorriso]).toBe(0);
    face.update(1 / 30);
    const primeiro = face.weights[sorriso];
    expect(primeiro).toBeGreaterThan(0);
    expect(primeiro).toBeLessThan(0.9);
    for (let step = 0; step < 90; step++) face.update(1 / 30);
    expect(face.weights[sorriso]).toBeGreaterThan(0.95);
    expect(face.expression).toBe('feliz');
  });

  it('a boca se mexe só enquanto a pessoa fala', () => {
    const face = new FaceController(3);
    const fala = FACE_MORPHS.indexOf('fala');
    for (let step = 0; step < 30; step++) face.update(1 / 30);
    expect(face.weights[fala]).toBeLessThan(0.01);
    face.setTalking(1);
    let maximo = 0;
    for (let step = 0; step < 60; step++) {
      face.update(1 / 30);
      maximo = Math.max(maximo, face.weights[fala]);
    }
    expect(maximo).toBeGreaterThan(0.3);
    face.setTalking(0);
    for (let step = 0; step < 60; step++) face.update(1 / 30);
    expect(face.weights[fala]).toBeLessThan(0.05);
  });

  it('duas pessoas não piscam ao mesmo tempo', () => {
    const piscada = FACE_MORPHS.indexOf('piscada');
    const registro = (seed: number): number[] => {
      const face = new FaceController(seed);
      const momentos: number[] = [];
      for (let step = 0; step < 1200; step++) {
        face.update(1 / 30);
        if (face.weights[piscada] > 0.5) momentos.push(step);
      }
      return momentos;
    };
    const a = registro(1);
    const b = registro(2);
    expect(a.length).toBeGreaterThan(2);
    expect(b.length).toBeGreaterThan(2);
    expect(a[0]).not.toBe(b[0]);
  });

  it('o rosto volta ao neutro quando o avatar é devolvido ao conjunto', () => {
    const face = new FaceController(5);
    face.setExpression('animada');
    face.setTalking(1);
    for (let step = 0; step < 60; step++) face.update(1 / 30);
    face.reset();
    expect(face.expression).toBe('neutra');
    expect(face.talking).toBe(0);
    expect(face.weights[FACE_MORPHS.indexOf('fala')]).toBe(0);
    expect(face.weights[FACE_MORPHS.indexOf('sorriso')]).toBe(0);
  });

  it('o avatar expõe expressão e fala sem trocar de material', () => {
    const avatar = new Avatar(DEFAULT_APPEARANCE);
    const materiais = new Set<string>();
    avatar.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) materiais.add((mesh.material as THREE.Material).name || 'sem-nome');
    });
    expect(materiais.has('avatar')).toBe(true);
    avatar.setExpression('surpresa');
    avatar.setTalking(1);
    avatar.updateFace(1 / 30);
    expect(avatar.expression).toBe('surpresa');
    avatar.dispose();
  });
});

/* -------------------------------------------------------------------------- */
/* Vida do habitante                                                           */
/* -------------------------------------------------------------------------- */

const FAR = { playerX: 100, playerZ: 100, distance: 100, period: 'tarde' as const, visible: true };
const NEAR = { playerX: 1, playerZ: 0, distance: 2, period: 'tarde' as const, visible: true };

describe('vida do habitante fora da conversa', () => {
  it('cumprimenta quem chega perto, e não a cada quadro', () => {
    const life = new NpcLife(characterPersona('suki'), 3);
    life.update(1 / 30, FAR);
    expect(life.takeGesture()).toBeNull();
    life.update(1 / 30, NEAR);
    const saudacao = life.takeGesture();
    expect(saudacao).not.toBeNull();
    expect(characterPersona('suki').greet).toContain(saudacao?.id);
    // Logo em seguida não cumprimenta de novo.
    for (let step = 0; step < 60; step++) life.update(1 / 30, NEAR);
    expect(life.takeGesture()).toBeNull();
  });

  it('olha para quem está por perto e solta o olhar quando a pessoa vai embora', () => {
    const life = new NpcLife(characterPersona('amara'), 1);
    life.update(1 / 30, NEAR);
    expect(life.lookTarget).toEqual({ x: NEAR.playerX, z: NEAR.playerZ });
    for (let step = 0; step < 120; step++) life.update(1 / 30, FAR);
    expect(life.lookTarget).toBeNull();
  });

  it('gestos de ócio aparecem com o tempo — e não todos juntos', () => {
    const quando = (seed: number): number => {
      const life = new NpcLife(characterPersona('suki'), seed);
      for (let step = 0; step < 3000; step++) {
        life.update(1 / 30, FAR);
        if (life.takeGesture()) return step;
      }
      return -1;
    };
    const a = quando(1);
    const b = quando(2);
    const c = quando(3);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });

  it('de madrugada ninguém faz escândalo', () => {
    const life = new NpcLife(characterPersona('jupiter'), 9);
    life.update(1 / 30, { ...NEAR, period: 'madrugada' });
    expect(life.takeGesture()).toBeNull();
  });

  it('quem está longe demais para ser visto não decide nada', () => {
    const life = new NpcLife(characterPersona('luma'), 4);
    for (let step = 0; step < 600; step++) life.update(1 / 30, { ...NEAR, visible: false });
    expect(life.takeGesture()).toBeNull();
  });

  it('responde a um aceno do jogador, respeitando o intervalo', () => {
    const life = new NpcLife(characterPersona('maze'), 2);
    expect(life.greetBack(0, 0)).toBe(true);
    expect(life.takeGesture()).not.toBeNull();
    expect(life.greetBack(0, 0)).toBe(false);
    expect(GREET_COOLDOWN).toBeGreaterThan(10);
  });
});

describe('a conversa manda na vida', () => {
  it('começa com saudação, vira para quem chamou e muda de rosto', () => {
    const life = new NpcLife(characterPersona('lilly'), 7);
    life.beginConversation(3, 4);
    expect(life.inConversation).toBe(true);
    expect(life.lookTarget).toEqual({ x: 3, z: 4 });
    expect(life.expression).toBe(characterPersona('lilly').greetMood);
    expect(life.takeGesture()).not.toBeNull();
  });

  it('nenhum gesto espontâneo entra no meio de uma fala', () => {
    const life = new NpcLife(characterPersona('suki'), 11);
    life.beginConversation(0, 0);
    life.takeGesture();
    for (let step = 0; step < 2000; step++) life.update(1 / 30, NEAR);
    expect(life.takeGesture()).toBeNull();
  });

  it('cada fala pede a expressão do roteiro e move a boca', () => {
    const life = new NpcLife(characterPersona('saturno'), 13);
    life.beginConversation(0, 0);
    life.takeGesture();
    life.speak('pensativa', 'pensar');
    expect(life.expression).toBe('pensativa');
    expect(life.talking).toBe(1);
    expect(life.takeGesture()?.id).toBe('pensar');
    life.stopSpeaking();
    expect(life.talking).toBe(0);
  });

  it('o fim da conversa devolve a pessoa ao rosto de descanso, com despedida', () => {
    const persona = characterPersona('akemi');
    const life = new NpcLife(persona, 17);
    life.beginConversation(0, 0);
    life.speak('surpresa');
    life.endConversation();
    expect(life.inConversation).toBe(false);
    expect(life.expression).toBe(persona.rest);
    expect(life.takeGesture()?.id).toBe(persona.farewell);
    expect(life.talking).toBe(0);
  });

  it('interromper sem despedida também é seguro', () => {
    const life = new NpcLife(characterPersona('haru'), 19);
    life.beginConversation(0, 0);
    life.takeGesture();
    life.endConversation(false);
    expect(life.takeGesture()).toBeNull();
    expect(life.inConversation).toBe(false);
    // Encerrar duas vezes não quebra nada.
    life.endConversation();
    expect(life.inConversation).toBe(false);
  });

  it('um bate-papo entre habitantes não atropela a conversa com o jogador', () => {
    const life = new NpcLife(characterPersona('nexara'), 23);
    life.beginConversation(0, 0);
    life.startChat(5, 5);
    expect(life.chatting).toBe(false);
    life.endConversation(false);
    life.startChat(5, 5);
    expect(life.chatting).toBe(true);
    for (let step = 0; step < 300; step++) life.update(1 / 30, FAR);
    expect(life.chatting).toBe(false);
    expect(life.lookTarget).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Simulação e cidade                                                          */
/* -------------------------------------------------------------------------- */

function makeSim(seed: number): CitizenSim {
  const network = buildAuroraWalkNetwork();
  const rng = createRng(seed * 977 + 31);
  return new CitizenSim(makeCitizen(seed), network, network.randomNode(rng), rng, {});
}

describe('o habitante para, se vira e volta à rotina', () => {
  it('vira para quem chamou aos poucos, não de um salto', () => {
    const sim = makeSim(5);
    sim.heading = 0;
    sim.startTalking(sim.x + 10, sim.z, 6);
    const alvo = Math.atan2(10, 0);
    expect(sim.heading).toBe(0);
    sim.update(1 / 30);
    const primeiro = Math.abs(sim.heading);
    expect(primeiro).toBeGreaterThan(0);
    expect(primeiro).toBeLessThan(Math.abs(alvo));
    for (let step = 0; step < 90; step++) sim.update(1 / 30);
    expect(Math.abs(sim.heading - alvo)).toBeLessThan(0.05);
  });

  it('a conversa se renova enquanto o jogador lê, e acaba quando ele fecha', () => {
    const sim = makeSim(8);
    sim.startTalking(sim.x + 1, sim.z, 2);
    for (let step = 0; step < 30; step++) {
      sim.keepTalking(2);
      sim.update(1 / 30);
    }
    expect(sim.activity).toBe('conversando');
    sim.stopTalking();
    sim.update(1 / 30);
    expect(sim.activity).toBe('andando');
  });

  it('cada habitante tem o jeito do seu arquétipo', () => {
    const sim = makeSim(12);
    expect(sim.life).toBeInstanceOf(NpcLife);
    expect(sim.life.persona).toBe(archetypePersona(sim.profile.archetype.id));
  });
});

describe('a cidade inteira', () => {
  function makeNpcs() {
    const scene = new THREE.Scene();
    const profile = new QualitySystem(defaultGraphicsSettings('alta')).current;
    return new NpcSystem({ scene, ground: () => 0, blocked: () => false, quality: profile });
  }

  it('entrega a vida de um habitante e de um personagem do panteão', () => {
    const npcs = makeNpcs();
    for (let step = 0; step < 60; step++) {
      npcs.setFocus(0, 0, 0);
      npcs.update(1 / 30, step / 30);
    }
    const ponto = npcs.interactables.find((item) => item.id.startsWith('cidadao:') && item.enabled);
    expect(ponto).toBeDefined();
    expect(npcs.lifeOf(ponto!.id)).toBeInstanceOf(NpcLife);
    expect(npcs.characterLife('aerion')).toBeInstanceOf(NpcLife);
    expect(npcs.characterLife('ninguem')).toBeNull();
    npcs.dispose();
  });

  it('um aceno do jogador tem resposta de quem está perto', () => {
    const npcs = makeNpcs();
    for (let step = 0; step < 60; step++) {
      npcs.setFocus(0, 0, 0);
      npcs.update(1 / 30, step / 30);
    }
    const perto = npcs.people.filter((person) => person.distanceTo(0, 0) < 12);
    for (const person of perto) person.life.takeGesture();
    npcs.greetBack(0, 0);
    const responderam = perto.filter((person) => person.life.takeGesture() !== null);
    if (perto.length > 0) expect(responderam.length).toBeGreaterThan(0);
    npcs.dispose();
  });

  it('não desenha ninguém longe: a vida só roda para quem está à vista', () => {
    const npcs = makeNpcs();
    const spy = vi.spyOn(NpcLife.prototype, 'update');
    for (let step = 0; step < 30; step++) {
      npcs.setFocus(0, 0, 0);
      npcs.update(1 / 30, step / 30);
    }
    // Dezenas de habitantes simulados, mas a vida só é decidida para os
    // que ganharam avatar (mais o panteão à vista).
    const porQuadro = spy.mock.calls.length / 30;
    expect(porQuadro).toBeLessThan(npcs.population);
    spy.mockRestore();
    npcs.dispose();
  });
});
