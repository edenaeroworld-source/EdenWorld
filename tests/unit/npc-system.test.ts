// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultAftersConfig, AFTERS_PRODUCTS } from '../../src/afters/AftersCatalog';
import { AftersSystem } from '../../src/afters/AftersSystem';
import { WORLD } from '../../src/core/Config';
import { PANTHEON } from '../../src/characters/Pantheon';
import { NpcSystem } from '../../src/npc/NpcSystem';
import { QualitySystem, defaultGraphicsSettings } from '../../src/systems/QualitySystem';

/**
 * Os dois sistemas novos rodando de verdade, com uma cena do Three.js.
 *
 * Não há WebGL aqui: nada é desenhado. O que se verifica é o que acontece
 * a cada quadro — criação de avatares, pontos de conversa, limites de
 * população e liberação de memória.
 */

const quality = new QualitySystem(defaultGraphicsSettings('alta')).current;

function makeSystem(level: 'baixa' | 'media' | 'alta' = 'alta') {
  const scene = new THREE.Scene();
  const profile = new QualitySystem(defaultGraphicsSettings(level)).current;
  const npcs = new NpcSystem({
    scene,
    ground: () => 0,
    blocked: () => false,
    quality: profile,
  });
  return { scene, npcs };
}

/** Roda alguns segundos de jogo. */
function run(npcs: NpcSystem, seconds: number, x = 0, z = 30): void {
  const dt = 1 / 30;
  for (let t = 0; t < seconds * 30; t++) {
    npcs.setFocus(x, 0, z);
    npcs.update(dt, t * dt);
  }
}

describe('NpcSystem', () => {
  it('nasce com a população simulada e o panteão em seus lugares', () => {
    const { npcs, scene } = makeSystem();
    expect(npcs.population).toBe(54);
    expect(scene.children).toContain(npcs.group);
    const divine = npcs.interactables.filter((item) => item.id.startsWith('divino:'));
    expect(divine.length).toBe(PANTHEON.length);
    for (const item of divine) {
      expect(item.enabled).toBe(true);
      expect(item.action).toBe('Conversar');
      expect(item.payload.type).toBe('conversa');
      expect(Math.hypot(item.position.x, item.position.z)).toBeLessThan(WORLD.boundaryRadius);
    }
  });

  it('mantém a lista de pontos de conversa estável (o sistema de interação guarda a referência)', () => {
    const { npcs } = makeSystem();
    const before = npcs.interactables.length;
    const snapshot = [...npcs.interactables];
    run(npcs, 20);
    expect(npcs.interactables.length).toBe(before);
    expect(npcs.interactables).toEqual(snapshot);
  });

  it('dá corpo aos moradores perto do jogador, um por quadro', () => {
    const { npcs } = makeSystem();
    run(npcs, 25);
    const active = npcs.interactables.filter((item) => item.id.startsWith('cidadao:') && item.enabled);
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThanOrEqual(18);
    for (const item of active) {
      expect(item.name).not.toBe('Habitante');
      expect(item.payload.type === 'conversa' && item.payload.personId.length > 0).toBe(true);
      expect(Math.hypot(item.position.x - 0, item.position.z - 30)).toBeLessThan(140);
    }
  });

  it('acha o cidadão ligado a um ponto de conversa', () => {
    const { npcs } = makeSystem();
    run(npcs, 25);
    const item = npcs.interactables.find((entry) => entry.id.startsWith('cidadao:') && entry.enabled);
    expect(item).toBeDefined();
    const citizen = npcs.citizenOf(item!.id);
    expect(citizen).not.toBeNull();
    expect(citizen?.profile.name).toBe(item?.name);
    expect(npcs.citizenOf('cidadao:999')).toBeNull();
  });

  it('respeita o teto de moradores visíveis em cada nível de qualidade', () => {
    for (const [level, limit] of [
      ['baixa', 7],
      ['media', 12],
      ['alta', 18],
    ] as const) {
      const { npcs } = makeSystem(level);
      run(npcs, 30);
      const active = npcs.interactables.filter((item) => item.id.startsWith('cidadao:') && item.enabled).length;
      expect(active).toBeLessThanOrEqual(limit);
      npcs.dispose();
    }
  });

  it('solta os avatares excedentes ao baixar a qualidade, e volta a usá-los ao subir', () => {
    const { npcs } = makeSystem('alta');
    run(npcs, 30);
    const high = npcs.interactables.filter((item) => item.id.startsWith('cidadao:') && item.enabled).length;
    const low = new QualitySystem(defaultGraphicsSettings('baixa')).current;
    npcs.applyQuality(low);
    run(npcs, 5);
    const after = npcs.interactables.filter((item) => item.id.startsWith('cidadao:') && item.enabled).length;
    expect(after).toBeLessThanOrEqual(7);
    expect(after).toBeLessThanOrEqual(high);
    npcs.applyQuality(quality);
    run(npcs, 30);
    expect(npcs.interactables.filter((item) => item.id.startsWith('cidadao:') && item.enabled).length).toBeGreaterThan(after);
  });

  it('acompanha o jogador: quem fica para trás some, quem está perto aparece', () => {
    const { npcs } = makeSystem();
    run(npcs, 30, 0, 30);
    const first = new Set(npcs.interactables.filter((item) => item.enabled && item.id.startsWith('cidadao:')).map((item) => item.name));
    run(npcs, 40, 150, 140);
    const second = npcs.interactables.filter((item) => item.enabled && item.id.startsWith('cidadao:'));
    expect(second.length).toBeGreaterThan(0);
    for (const item of second) expect(Math.hypot(item.position.x - 150, item.position.z - 140)).toBeLessThan(140);
    expect([...first].some((name) => !second.some((item) => item.name === name))).toBe(true);
  });

  it('fica parado e invisível quando desligado (menus e criador)', () => {
    const { npcs } = makeSystem();
    run(npcs, 20);
    npcs.enabled = false;
    npcs.update(1 / 30, 1);
    expect(npcs.group.visible).toBe(false);
    npcs.enabled = true;
    npcs.update(1 / 30, 2);
    expect(npcs.group.visible).toBe(true);
  });

  it('troca a rotina quando o período do dia muda, sem parar a simulação', () => {
    const { npcs } = makeSystem();
    for (const period of ['manhã', 'tarde', 'noite', 'madrugada'] as const) {
      npcs.setPeriod(period);
      run(npcs, 6);
    }
    expect(npcs.interactables.some((item) => item.enabled)).toBe(true);
  });

  it('sabe onde cada figura do panteão está, e vira o rosto para o jogador', () => {
    const { npcs } = makeSystem();
    for (const character of PANTHEON) {
      const place = npcs.characterPosition(character.id);
      expect(place).not.toBeNull();
      expect(Number.isFinite(place!.x)).toBe(true);
    }
    expect(npcs.characterPosition('ninguem')).toBeNull();
    npcs.lookAt('haru', 10, 10);
    npcs.waveBack('haru');
  });

  it('libera tudo ao ser descartado', () => {
    const { npcs, scene } = makeSystem();
    run(npcs, 25);
    npcs.dispose();
    expect(scene.children).not.toContain(npcs.group);
    expect(npcs.group.children.length).toBe(0);
    // Chamar duas vezes não pode quebrar.
    npcs.dispose();
    npcs.update(1 / 30, 1);
  });
});

describe('AftersSystem', () => {
  function makeAfters() {
    const scene = new THREE.Scene();
    const sounds: string[] = [];
    const afters = new AftersSystem(scene, { onSound: (kind) => sounds.push(kind) });
    return { scene, afters, sounds };
  }

  it('entra desligado e invisível', () => {
    const { afters, scene } = makeAfters();
    expect(afters.current.unlocked).toBe(false);
    expect(afters.activeProduct).toBeNull();
    expect(scene.children).toContain(afters.group);
    afters.setTarget(0, 0, 0, 1);
    afters.update(1 / 30, 0);
    expect(afters.group.visible).toBe(false);
  });

  it('acende quando um produto é ligado e apaga ao desligar', () => {
    const { afters } = makeAfters();
    afters.setTarget(0, 0, 0, 1);
    afters.setVisible(true);
    afters.setConfig({ ...defaultAftersConfig(), unlocked: true, productId: AFTERS_PRODUCTS[0].id });
    for (let t = 0; t < 60; t++) afters.update(1 / 30, t / 30);
    expect(afters.group.visible).toBe(true);
    expect(afters.activeProduct?.id).toBe(AFTERS_PRODUCTS[0].id);
    afters.setConfig({ ...afters.current, productId: null });
    for (let t = 0; t < 120; t++) afters.update(1 / 30, t / 30);
    expect(afters.group.visible).toBe(false);
  });

  it('avisa o jogo para tocar o som certo em cada troca', () => {
    const { afters, sounds } = makeAfters();
    const base = { ...defaultAftersConfig(), unlocked: true, sound: true };
    afters.setConfig({ ...base, productId: AFTERS_PRODUCTS[0].id });
    afters.setConfig({ ...base, productId: AFTERS_PRODUCTS[1].id });
    afters.setConfig({ ...base, productId: null });
    expect(sounds).toEqual(['ligar', 'trocar', 'desligar']);
  });

  it('fica em silêncio quando o jogador desliga o som do painel', () => {
    const { afters, sounds } = makeAfters();
    afters.setConfig({ ...defaultAftersConfig(), unlocked: true, sound: false, productId: AFTERS_PRODUCTS[0].id });
    expect(sounds).toEqual([]);
  });

  it('segue o avatar e some com o avatar', () => {
    const { afters } = makeAfters();
    afters.setVisible(true);
    afters.setConfig({ ...defaultAftersConfig(), unlocked: true, productId: AFTERS_PRODUCTS[3].id }, false);
    afters.setTarget(12, 3, -8, 1.05);
    for (let t = 0; t < 60; t++) afters.update(1 / 30, t / 30);
    expect(afters.group.visible).toBe(true);
    afters.setVisible(false);
    for (let t = 0; t < 120; t++) afters.update(1 / 30, t / 30);
    expect(afters.group.visible).toBe(false);
  });

  it('aceita os seis produtos sem quebrar e libera tudo no fim', () => {
    const { afters, scene } = makeAfters();
    afters.setVisible(true);
    afters.setTarget(0, 0, 0, 1);
    for (const product of AFTERS_PRODUCTS) {
      afters.setConfig({ ...defaultAftersConfig(), unlocked: true, productId: product.id, color: product.color }, false);
      for (let t = 0; t < 40; t++) afters.update(1 / 30, t / 30);
      expect(afters.group.visible).toBe(true);
    }
    afters.dispose();
    expect(scene.children).not.toContain(afters.group);
    afters.update(1 / 30, 1);
  });
});
