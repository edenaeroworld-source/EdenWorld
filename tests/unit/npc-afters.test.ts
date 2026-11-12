// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AftersActor } from '../../src/afters/AftersActor';
import { AftersBodySystem } from '../../src/afters/AftersBodySystem';
import { sanitizeAftersCitizens } from '../../src/afters/AftersCatalog';
import { sampleNetState, sanitizeActorNetStates, toActorNetState } from '../../src/afters/AftersNet';
import { AFTERS_PRESETS, fromPercent, getAftersPreset, isNeutral, toPercent } from '../../src/afters/AftersState';
import { PANTHEON } from '../../src/characters/Pantheon';
import { CITIZEN_ARCHETYPES, citizenAftersId, makeCitizen, rollCitizenAfters } from '../../src/npc/CitizenData';
import { NpcSystem, characterAftersId } from '../../src/npc/NpcSystem';
import { Avatar } from '../../src/player/Avatar';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { QualitySystem, defaultGraphicsSettings } from '../../src/systems/QualitySystem';
import { createRng } from '../../src/utils/math';

/**
 * Afters® para a população de Aurora City.
 *
 * A pergunta destes testes é sempre a mesma: **o habitante usa a mesma
 * tecnologia que o jogador?** Mesmo ator, mesma faixa de 0% a 250%, mesma
 * animação, mesma persistência — com os cuidados que só a cidade exige
 * (avatares reaproveitados, dezenas de pessoas, gente longe da câmera).
 */

function makeNpcs(level: 'baixa' | 'media' | 'alta' = 'alta') {
  const scene = new THREE.Scene();
  const profile = new QualitySystem(defaultGraphicsSettings(level)).current;
  const npcs = new NpcSystem({ scene, ground: () => 0, blocked: () => false, quality: profile });
  const afters = new AftersBodySystem();
  npcs.attachAfters(afters);
  return { scene, npcs, afters };
}

/** Roda alguns segundos de jogo com o foco em um ponto. */
function run(npcs: NpcSystem, afters: AftersBodySystem, seconds: number, x = 0, z = 0): void {
  const dt = 1 / 30;
  for (let t = 0; t < Math.round(seconds * 30); t++) {
    npcs.setFocus(x, 0, z);
    npcs.update(dt, t * dt);
    afters.update(dt);
  }
}

/** Habitante com transformação ligada mais próximo de um ponto. */
function activeCitizenNear(npcs: NpcSystem, x: number, z: number): { seed: number; id: string; x: number; z: number } {
  const list = npcs.people
    .filter((person) => !isNeutral(person.profile.afters))
    .map((person) => ({ person, distance: Math.hypot(person.x - x, person.z - z) }))
    .sort((a, b) => a.distance - b.distance);
  expect(list.length).toBeGreaterThan(0);
  const person = list[0].person;
  return { seed: person.profile.seed, id: citizenAftersId(person.profile.seed), x: person.x, z: person.z };
}

describe('silhueta dos habitantes: mesma arquitetura do jogador', () => {
  it('o ator de um habitante é a mesma classe do ator do jogador', () => {
    const afters = new AftersBodySystem();
    const citizen = afters.actor('cidadao:7');
    expect(citizen).toBeInstanceOf(AftersActor);
    expect(afters.player).toBeInstanceOf(AftersActor);
    expect(Object.getPrototypeOf(citizen)).toBe(Object.getPrototypeOf(afters.player));
  });

  it('aceita a mesma faixa de 0% a 250% nos dois canais', () => {
    const afters = new AftersBodySystem();
    const actor = afters.actor('cidadao:1');
    actor.setIntensity('bust', fromPercent(250));
    actor.setIntensity('curve', fromPercent(400));
    actor.setCombined(true);
    expect(toPercent(actor.requested('bust'))).toBe(250);
    expect(toPercent(actor.requested('curve'))).toBe(250);
    actor.setIntensity('bust', fromPercent(-30));
    expect(toPercent(actor.requested('bust'))).toBe(0);
  });

  it('usa os canais isolados ou combinados, como o jogador', () => {
    const afters = new AftersBodySystem();
    const actor = afters.actor('cidadao:2');
    actor.setIntensity('bust', fromPercent(120));
    actor.setIntensity('curve', fromPercent(80));
    actor.setActive('bust', true);
    expect(actor.status.label).toBe('AfterBust® 120%');
    actor.setActive('bust', false);
    actor.setActive('curve', true);
    expect(actor.status.label).toBe('AfterCurve® 80%');
    actor.setCombined(true);
    expect(actor.status.label).toBe('Modo combinado · AfterBust® 120% · AfterCurve® 80%');
  });

  it('cada habitante tem configuração independente — e nenhum mexe no jogador', () => {
    const afters = new AftersBodySystem();
    const a = afters.actor('cidadao:10');
    const b = afters.actor('cidadao:11');
    a.applyPreset(AFTERS_PRESETS[4]);
    b.applyPreset(AFTERS_PRESETS[1]);
    afters.setIntensity('bust', fromPercent(45));
    afters.setActive('bust', true);
    expect(toPercent(a.requested('bust'))).toBe(200);
    expect(toPercent(b.requested('bust'))).toBe(50);
    expect(toPercent(afters.requested('bust'))).toBe(45);
    a.turnOff();
    expect(toPercent(b.requested('bust'))).toBe(50);
    expect(toPercent(afters.requested('bust'))).toBe(45);
  });

  it('o mesmo id devolve o mesmo ator (ninguém é duplicado ao reaparecer)', () => {
    const afters = new AftersBodySystem();
    const first = afters.actor('cidadao:3');
    first.setIntensity('curve', fromPercent(150));
    first.setActive('curve', true);
    expect(afters.actor('cidadao:3')).toBe(first);
    expect(afters.actorCount).toBe(1);
    expect(afters.hasActor('cidadao:3')).toBe(true);
    expect(afters.findActor('cidadao:999')).toBeUndefined();
  });

  it('a animação é a mesma: transição suave até o alvo, sem salto', () => {
    const afters = new AftersBodySystem();
    const actor = afters.actor('cidadao:4');
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE });
    actor.setAvatars([avatar]);
    actor.visible = true;
    actor.setDuration(1);
    actor.setIntensity('bust', fromPercent(200));
    actor.setActive('bust', true);
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      afters.update(1 / 30);
      seen.push(avatar.morph.bust);
    }
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(fromPercent(60));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] - 1e-6);
    expect(seen[seen.length - 1]).toBeCloseTo(fromPercent(200), 3);
    avatar.dispose();
  });
});

describe('perfis de habitante', () => {
  it('todo arquétipo declara um gosto por Afters coerente', () => {
    for (const archetype of CITIZEN_ARCHETYPES) {
      expect(archetype.afters.chance).toBeGreaterThanOrEqual(0);
      expect(archetype.afters.chance).toBeLessThanOrEqual(1);
      expect(archetype.afters.presets.length).toBeGreaterThan(0);
      for (const id of archetype.afters.presets) expect(getAftersPreset(id)).toBeTruthy();
      expect(typeof archetype.afters.night).toBe('boolean');
    }
  });

  it('a silhueta de cada habitante é sorteada da semente — igual em toda sessão', () => {
    for (const seed of [0, 1, 7, 23, 41, 53]) {
      const first = makeCitizen(seed);
      const second = makeCitizen(seed);
      expect(second.afters).toEqual(first.afters);
      expect(second.name).toBe(first.name);
      expect(citizenAftersId(seed)).toBe(`cidadao:${seed}`);
    }
  });

  it('a cidade tem variedade: gente sem transformação, gente com, valores diferentes', () => {
    const bodies = Array.from({ length: 54 }, (_, seed) => makeCitizen(seed).afters);
    const active = bodies.filter((body) => !isNeutral(body));
    expect(active.length).toBeGreaterThan(3);
    expect(active.length).toBeLessThan(bodies.length);
    const percentages = new Set(active.map((body) => `${toPercent(body.bust)}/${toPercent(body.curve)}`));
    expect(percentages.size).toBeGreaterThan(2);
    for (const body of bodies) {
      expect(toPercent(body.bust)).toBeGreaterThanOrEqual(0);
      expect(toPercent(body.bust)).toBeLessThanOrEqual(250);
      expect(toPercent(body.curve)).toBeLessThanOrEqual(250);
      expect(body.duration).toBeGreaterThan(0);
    }
  });

  it('um arquétipo sem gosto por Afters nunca liga a transformação', () => {
    const never = { ...CITIZEN_ARCHETYPES[0], afters: { chance: 0, presets: ['aurora'], night: false } };
    for (let seed = 0; seed < 25; seed++) {
      expect(isNeutral(rollCitizenAfters(createRng(seed), never))).toBe(true);
    }
  });

  it('personagens do panteão também podem usar a tecnologia', () => {
    const users = PANTHEON.filter((character) => character.afters);
    expect(users.length).toBeGreaterThan(0);
    for (const character of users) {
      expect(isNeutral(character.afters!)).toBe(false);
      expect(toPercent(character.afters!.bust)).toBeLessThanOrEqual(250);
      expect(characterAftersId(character.id)).toBe(`divino:${character.id}`);
    }
  });
});

describe('integração com a população', () => {
  it('cada habitante simulado ganha um ator ao entrar no sistema', () => {
    const { npcs, afters } = makeNpcs();
    expect(afters.actorCount).toBeGreaterThanOrEqual(npcs.population);
    for (const person of npcs.people) expect(afters.hasActor(citizenAftersId(person.profile.seed))).toBe(true);
    expect(afters.activeActorCount).toBeGreaterThan(0);
    npcs.dispose();
  });

  it('o avatar recebe a silhueta no mesmo quadro da aparência, já no destino', () => {
    const { npcs, afters } = makeNpcs();
    run(npcs, afters, 10, 0, 0);
    const bound = npcs.people.map((person) => afters.findActor(citizenAftersId(person.profile.seed))!).filter((actor) => actor.avatarCount > 0);
    expect(bound.length).toBeGreaterThan(0);
    for (const actor of bound) {
      // Quem chega ao campo de visão já aparece pronto: nada de inflar na rua.
      expect(actor.animating).toBe(false);
      expect(actor.effective('bust')).toBeCloseTo(actor.requested('bust'), 5);
      expect(actor.effective('curve')).toBeCloseTo(actor.requested('curve'), 5);
    }
    expect(bound.some((actor) => !isNeutral(actor.current))).toBe(true);
    npcs.dispose();
  });

  it('o habitante que sai e volta à vista reaparece com a mesma silhueta', () => {
    const { npcs, afters } = makeNpcs();
    run(npcs, afters, 8, 0, 0);
    const near = activeCitizenNear(npcs, 0, 0);
    const actor = afters.findActor(near.id)!;
    const wanted = { bust: actor.requested('bust'), curve: actor.requested('curve') };
    // Jogador atravessa a cidade: o habitante perde o avatar…
    run(npcs, afters, 8, 420, 420);
    expect(actor.avatarCount).toBe(0);
    expect(actor.requested('bust')).toBeCloseTo(wanted.bust, 6);
    // …e volta exatamente como estava quando o jogador retorna.
    run(npcs, afters, 10, near.x, near.z);
    expect(actor.avatarCount).toBe(1);
    expect(actor.animating).toBe(false);
    expect(actor.effective('bust')).toBeCloseTo(wanted.bust, 5);
    expect(actor.effective('curve')).toBeCloseTo(wanted.curve, 5);
    npcs.dispose();
  });

  it('avatares são recursos compartilhados: dezenas de atores, poucos avatares', () => {
    const { npcs, afters } = makeNpcs();
    run(npcs, afters, 8, 0, 0);
    let bound = 0;
    for (const person of npcs.people) bound += afters.findActor(citizenAftersId(person.profile.seed))?.avatarCount ?? 0;
    expect(afters.actorCount).toBeGreaterThan(bound);
    expect(bound).toBeLessThanOrEqual(18);
    npcs.dispose();
  });

  it('o avatar reaproveitado não herda a silhueta do habitante anterior', () => {
    const afters = new AftersBodySystem();
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE });
    afters.actor('cidadao:40').setBody({ bust: fromPercent(200), curve: fromPercent(150), bustActive: true, curveActive: true, duration: 1.4, preset: null }, false);
    afters.bindAvatar('cidadao:40', avatar);
    expect(avatar.morph.bust).toBeCloseTo(fromPercent(200), 4);
    afters.unbindAvatar('cidadao:40');
    expect(avatar.morph.bust).toBe(0);
    expect(avatar.morph.curve).toBe(0);
    // O próximo habitante entra limpo, com a própria silhueta.
    afters.bindAvatar('cidadao:41', avatar, { bust: fromPercent(50), curve: 0, bustActive: true, curveActive: false, duration: 1.2, preset: null });
    expect(avatar.morph.bust).toBeCloseTo(fromPercent(50), 4);
    expect(avatar.morph.curve).toBe(0);
    // E o estado do primeiro continua guardado para quando ele voltar.
    expect(toPercent(afters.findActor('cidadao:40')!.requested('bust'))).toBe(200);
    avatar.dispose();
  });

  it('transformar um habitante não reconstrói malha nem troca material', () => {
    const { npcs, afters } = makeNpcs();
    run(npcs, afters, 6, 0, 0);
    const actors = npcs.people.map((person) => afters.findActor(citizenAftersId(person.profile.seed))!).filter((actor) => actor.avatarCount > 0);
    expect(actors.length).toBeGreaterThan(0);
    const ids: string[] = [];
    npcs.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) ids.push(`${mesh.geometry.uuid}:${(mesh.material as THREE.Material).uuid}`);
    });
    for (const actor of actors) {
      actor.setIntensity('bust', fromPercent(210));
      actor.setActive('bust', true);
    }
    run(npcs, afters, 3, 0, 0);
    const after: string[] = [];
    npcs.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) after.push(`${mesh.geometry.uuid}:${(mesh.material as THREE.Material).uuid}`);
    });
    expect(after).toEqual(ids);
    npcs.dispose();
  });

  it('a silhueta não trava a caminhada: posição e pose continuam mudando', () => {
    const { npcs, afters } = makeNpcs();
    run(npcs, afters, 4, 0, 0);
    const walkers = npcs.people.filter((person) => person.activity === 'andando');
    expect(walkers.length).toBeGreaterThan(0);
    const before = walkers.map((person) => `${person.x.toFixed(3)}:${person.z.toFixed(3)}`);
    run(npcs, afters, 3, 0, 0);
    const moved = walkers.filter((person, index) => `${person.x.toFixed(3)}:${person.z.toFixed(3)}` !== before[index]);
    expect(moved.length).toBeGreaterThan(0);
    npcs.dispose();
  });

  it('habitantes longe do jogador são atualizados em frequência reduzida', () => {
    const afters = new AftersBodySystem();
    for (let i = 0; i < 40; i++) {
      const actor = afters.actor(`cidadao:${i}`);
      actor.setDuration(1);
      actor.setIntensity('bust', fromPercent(100));
      actor.setActive('bust', true);
    }
    const visible = afters.actor('cidadao:0');
    visible.visible = true;
    afters.update(1 / 30);
    // O que está à vista anda no quadro; o resto espera a fatia.
    expect(visible.effective('bust')).toBeGreaterThan(0);
    let awake = 0;
    for (let i = 1; i < 40; i++) if (afters.findActor(`cidadao:${i}`)!.effective('bust') > 0) awake += 1;
    expect(awake).toBe(0);
    for (let i = 0; i < 9; i++) afters.update(1 / 30);
    let moved = 0;
    for (let i = 1; i < 40; i++) if (afters.findActor(`cidadao:${i}`)!.effective('bust') > 0) moved += 1;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(16);
    // Mesmo dormindo, todos chegam ao destino: ninguém fica pela metade.
    for (let i = 0; i < 200; i++) afters.update(1 / 30);
    for (let i = 1; i < 40; i++) expect(afters.findActor(`cidadao:${i}`)!.effective('bust')).toBeCloseTo(fromPercent(100), 4);
  });

  it('reduzir a qualidade solta os avatares excedentes sem perder a silhueta', () => {
    const { npcs, afters } = makeNpcs('alta');
    run(npcs, afters, 8, 0, 0);
    const before = npcs.people.map((person) => afters.findActor(citizenAftersId(person.profile.seed))!.requested('bust'));
    npcs.applyQuality(new QualitySystem(defaultGraphicsSettings('baixa')).current);
    run(npcs, afters, 3, 0, 0);
    const after = npcs.people.map((person) => afters.findActor(citizenAftersId(person.profile.seed))!.requested('bust'));
    expect(after).toEqual(before);
    npcs.dispose();
  });
});

describe('eventos e roteiro', () => {
  it('a noite reforça quem tem esse gosto e poupa o resto', () => {
    const { npcs, afters } = makeNpcs();
    const night = npcs.people.find((person) => person.profile.aftersNight && !isNeutral(person.profile.afters));
    const day = npcs.people.find((person) => !person.profile.aftersNight && !isNeutral(person.profile.afters));
    expect(night).toBeTruthy();
    expect(day).toBeTruthy();
    const nightId = citizenAftersId(night!.profile.seed);
    const dayId = citizenAftersId(day!.profile.seed);
    const baseNight = toPercent(afters.findActor(nightId)!.requested('bust'));
    const baseDay = toPercent(afters.findActor(dayId)!.requested('bust'));
    npcs.applyAftersEvent('noite');
    expect(toPercent(afters.findActor(nightId)!.requested('bust'))).toBeGreaterThan(baseNight - 1);
    expect(toPercent(afters.findActor(dayId)!.requested('bust'))).toBe(baseDay);
    npcs.applyAftersEvent('normal');
    expect(toPercent(afters.findActor(nightId)!.requested('bust'))).toBe(baseNight);
    npcs.dispose();
  });

  it('o evento nunca passa de 250% nem liga canal desligado', () => {
    const { npcs, afters } = makeNpcs();
    npcs.setAftersFor(citizenAftersId(npcs.people[0].profile.seed), { bust: 240, curve: 0, bustActive: true, curveActive: false });
    npcs.clearAftersOverride(citizenAftersId(npcs.people[0].profile.seed));
    npcs.applyAftersEvent('palco');
    for (const person of npcs.people) {
      const actor = afters.findActor(citizenAftersId(person.profile.seed))!;
      expect(toPercent(actor.requested('bust'))).toBeLessThanOrEqual(250);
      expect(toPercent(actor.requested('curve'))).toBeLessThanOrEqual(250);
      if (isNeutral(person.profile.afters)) expect(isNeutral(actor.current)).toBe(true);
    }
    npcs.dispose();
  });

  it('um evento pode desligar a cidade inteira e devolver tudo depois', () => {
    const { npcs, afters } = makeNpcs();
    const id = activeCitizenNear(npcs, 0, 0).id;
    const base = toPercent(afters.findActor(id)!.requested('bust'));
    npcs.applyAftersEvent('desligado');
    expect(afters.activeActorCount).toBe(PANTHEON.filter((character) => character.afters).length);
    npcs.applyAftersEvent('normal');
    expect(toPercent(afters.findActor(id)!.requested('bust'))).toBe(base);
    npcs.dispose();
  });

  it('roteiro liga, desliga e troca o preset de um habitante', () => {
    const { npcs, afters } = makeNpcs();
    const id = citizenAftersId(npcs.people[3].profile.seed);
    const body = npcs.setAftersFor(id, { bust: 175, curve: 125, bustActive: true, curveActive: true, duration: 2 });
    expect(body).toBeTruthy();
    expect(toPercent(body!.bust)).toBe(175);
    expect(afters.findActor(id)!.status.label).toBe('Modo combinado · AfterBust® 175% · AfterCurve® 125%');
    npcs.setAftersActiveFor(id, false);
    expect(afters.findActor(id)!.status.label).toBe('Silhueta original');
    npcs.setAftersActiveFor(id, true, 'bust');
    expect(afters.findActor(id)!.status.label).toBe('AfterBust® 175%');
    expect(npcs.setAftersPresetFor(id, 'aurora')).toBeTruthy();
    expect(toPercent(npcs.aftersOf(id)!.bust)).toBe(100);
    expect(npcs.setAftersPresetFor(id, 'inexistente')).toBeNull();
    expect(npcs.setAftersFor('cidadao:9999', { bust: 50 })).toBeNull();
    npcs.dispose();
  });

  it('quem foi mudado por roteiro não é tocado pelos eventos da cidade', () => {
    const { npcs, afters } = makeNpcs();
    const person = npcs.people.find((candidate) => candidate.profile.aftersNight && !isNeutral(candidate.profile.afters))!;
    const id = citizenAftersId(person.profile.seed);
    npcs.setAftersFor(id, { bust: 60, bustActive: true });
    npcs.applyAftersEvent('noite');
    expect(toPercent(afters.findActor(id)!.requested('bust'))).toBe(60);
    npcs.clearAftersOverride(id);
    expect(npcs.aftersOverrideIds()).not.toContain(id);
    npcs.dispose();
  });
});

describe('persistência', () => {
  it('a cidade volta igual: só os habitantes fora do padrão são gravados', () => {
    const { npcs } = makeNpcs();
    const id = citizenAftersId(npcs.people[5].profile.seed);
    npcs.setAftersFor(id, { bust: 225, curve: 80, bustActive: true, curveActive: true });
    const data = npcs.aftersOverridesData();
    expect(Object.keys(data)).toEqual([id]);

    const saved = JSON.parse(JSON.stringify(data));
    const { npcs: reloaded, afters: afters2 } = makeNpcs();
    reloaded.restoreAftersOverrides(sanitizeAftersCitizens(saved));
    expect(toPercent(afters2.findActor(id)!.requested('bust'))).toBe(225);
    expect(toPercent(afters2.findActor(id)!.requested('curve'))).toBe(80);
    // Habitantes comuns continuam vindo da semente, sem ocupar salvamento.
    const other = citizenAftersId(npcs.people[6].profile.seed);
    expect(afters2.findActor(other)!.current).toEqual(reloaded.people[6].profile.afters);
    npcs.dispose();
    reloaded.dispose();
  });

  it('salvamento antigo ou corrompido não derruba a cidade', () => {
    expect(sanitizeAftersCitizens(undefined)).toEqual({});
    expect(sanitizeAftersCitizens([1, 2, 3])).toEqual({});
    expect(sanitizeAftersCitizens({ 'cidadao:1': 'nada' })).toEqual({});
    const cleaned = sanitizeAftersCitizens({ 'cidadao:1': { bust: 99, curve: -5, bustActive: true, curveActive: true, duration: 500, preset: 'fake' } });
    expect(toPercent(cleaned['cidadao:1'].bust)).toBe(250);
    expect(toPercent(cleaned['cidadao:1'].curve)).toBe(0);
    expect(cleaned['cidadao:1'].preset).toBeNull();
    const { npcs } = makeNpcs();
    npcs.restoreAftersOverrides(null);
    expect(npcs.aftersOverrideIds()).toEqual([]);
    npcs.dispose();
  });

  it('a silhueta recarregada entra sem animação (ninguém infla ao carregar)', () => {
    const afters = new AftersBodySystem();
    afters.restoreActors({ 'cidadao:12': { bust: fromPercent(150), curve: 0, bustActive: true, curveActive: false, duration: 1.6, preset: null } });
    const actor = afters.findActor('cidadao:12')!;
    expect(actor.animating).toBe(false);
    expect(actor.effective('bust')).toBeCloseTo(fromPercent(150), 5);
    const snapshot = afters.snapshotActors();
    expect(Object.keys(snapshot)).toEqual(['cidadao:12']);
  });
});

describe('multijogador', () => {
  it('só os habitantes fora do padrão entram no pacote de rede', () => {
    const afters = new AftersBodySystem();
    afters.actor('cidadao:1');
    afters.actor('cidadao:2').setBody({ bust: fromPercent(120), curve: 0, bustActive: true, curveActive: false, duration: 1.5, preset: null }, false);
    const states = afters.netStates();
    expect(states.map((state) => state.id)).toEqual(['cidadao:2']);
    expect(toPercent(states[0].bust)).toBe(120);
    expect(states[0].duration).toBeCloseTo(1.5, 5);
  });

  it('o mesmo habitante fica igual para os dois jogadores', () => {
    const host = new AftersBodySystem();
    const guest = new AftersBodySystem();
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE });
    host.actor('cidadao:8').setBody({ bust: fromPercent(200), curve: fromPercent(100), bustActive: true, curveActive: true, duration: 2, preset: null }, false);
    guest.bindAvatar('cidadao:8', avatar);
    guest.applyNetStates(sanitizeActorNetStates(JSON.parse(JSON.stringify(host.netStates()))));
    expect(toPercent(guest.findActor('cidadao:8')!.requested('bust'))).toBe(200);
    expect(toPercent(guest.findActor('cidadao:8')!.requested('curve'))).toBe(100);
    expect(avatar.morph.bust).toBeCloseTo(fromPercent(200), 4);
    avatar.dispose();
  });

  it('quem chega no meio da transformação entra no mesmo ponto', () => {
    const now = 10_000;
    const state = toActorNetState(
      'cidadao:9',
      { bust: fromPercent(200), curve: 0, bustActive: true, curveActive: false, duration: 2, preset: null },
      { fromBust: 0, fromCurve: 0, now },
    );
    const sample = sampleNetState(state, now + 1000);
    expect(sample.bust).toBeGreaterThan(0);
    expect(sample.bust).toBeLessThan(fromPercent(200));

    const guest = new AftersBodySystem();
    guest.applyNetStates([state], now + 1000);
    const actor = guest.findActor('cidadao:9')!;
    expect(actor.effective('bust')).toBeCloseTo(sample.bust, 5);
    expect(actor.animating).toBe(true);
    actor.visible = true;
    for (let i = 0; i < 60; i++) guest.update(1 / 30);
    expect(actor.effective('bust')).toBeCloseTo(fromPercent(200), 4);
  });

  it('pacote inválido não muda a cidade', () => {
    expect(sanitizeActorNetStates(null)).toEqual([]);
    expect(sanitizeActorNetStates([{ bust: 1 }])).toEqual([]);
    expect(sanitizeActorNetStates([{ id: '', bust: 1 }])).toEqual([]);
    const repeated = sanitizeActorNetStates([
      { id: 'cidadao:1', bust: 1, curve: 0, duration: 1, startedAt: 0 },
      { id: 'cidadao:1', bust: 2, curve: 0, duration: 1, startedAt: 0 },
    ]);
    expect(repeated.length).toBe(1);
    const huge = sanitizeActorNetStates(Array.from({ length: 200 }, (_, i) => ({ id: `cidadao:${i}`, bust: 1, curve: 0, duration: 1, startedAt: 0 })));
    expect(huge.length).toBeLessThanOrEqual(64);
  });
});
