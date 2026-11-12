import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AftersBodySystem } from '../../src/afters/AftersBodySystem';
import { defaultAftersConfig, sanitizeAftersConfig } from '../../src/afters/AftersCatalog';
import { AfterBustController, AfterCurveController, easeInOutCubic } from '../../src/afters/AftersChannel';
import {
  BUST_BAND,
  CURVE_BAND,
  MAX_INTENSITY,
  MORPH_BANDS,
  THIGH_BAND,
  Zone,
  aftersMorphGLSL,
  bandForZone,
  bandWeight,
  displaceNormal,
  displaceVertex,
  silhouetteHalfWidth,
} from '../../src/afters/AftersMorph';
import { isNetStateSettled, sampleNetState, sanitizeNetState, toNetState } from '../../src/afters/AftersNet';
import {
  AFTERS_PRESETS,
  type AftersBody,
  INTENSITY_STEPS,
  MAX_PERCENT,
  allOff,
  applyPreset,
  clampDuration,
  defaultAftersBody,
  fromPercent,
  getAftersPreset,
  isCombined,
  isNeutral,
  matchingPreset,
  nearestStep,
  resetChannel,
  sanitizeAftersBody,
  statusLabel,
  toPercent,
} from '../../src/afters/AftersState';
import { Avatar } from '../../src/player/Avatar';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { SaveSystem, createNewSave } from '../../src/systems/SaveSystem';

/**
 * Afters® 2.0 — transformação de silhueta ao vivo.
 *
 * Cobre os casos exigidos: 0% por padrão, mínimo, máximo (250%), valores
 * intermediários, ativação independente de cada canal, modo combinado,
 * desligamento independente, mudança ao vivo, persistência e restauração,
 * compatibilidade com salvamentos antigos e consistência da animação.
 */

/** Avança o sistema em quadros de 1/60 s. */
function run(system: AftersBodySystem, seconds: number, step = 1 / 60): void {
  for (let t = 0; t < seconds; t += step) system.update(step);
}

function makeSystem(): { system: AftersBodySystem; avatar: Avatar } {
  const avatar = new Avatar(DEFAULT_APPEARANCE);
  const system = new AftersBodySystem();
  system.setAvatars([avatar]);
  return { system, avatar };
}

/* ------------------------------ 1. Padrão ------------------------------ */

describe('Afters 2.0 · estado padrão', () => {
  it('começa em 0%, desligado, com a silhueta original', () => {
    const body = defaultAftersBody();
    expect(toPercent(body.bust)).toBe(0);
    expect(toPercent(body.curve)).toBe(0);
    expect(body.bustActive).toBe(false);
    expect(body.curveActive).toBe(false);
    expect(isNeutral(body)).toBe(true);
    expect(statusLabel(body)).toBe('Silhueta original');
  });

  it('o avatar nasce sem deformação nenhuma', () => {
    const { system, avatar } = makeSystem();
    expect(avatar.morph).toEqual({ bust: 0, curve: 0 });
    run(system, 1);
    expect(avatar.morph.bust).toBe(0);
    expect(avatar.morph.curve).toBe(0);
    // Em 0% o vértice volta exatamente para onde estava.
    const point = { x: 0.142, y: 0.235, z: 0.05 };
    expect(displaceVertex(point, Zone.Bust, 0, 0)).toEqual(point);
    system.dispose();
  });
});

/* -------------------- 2 e 3. Mínimo, máximo e limites ------------------- */

describe('Afters 2.0 · limites de intensidade', () => {
  it('aceita exatamente 0% como mínimo e recusa valores abaixo', () => {
    expect(toPercent(fromPercent(0))).toBe(0);
    expect(toPercent(fromPercent(-80))).toBe(0);
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(-50));
    system.setActive('bust', true);
    run(system, 3);
    expect(avatar.morph.bust).toBe(0);
    system.dispose();
  });

  it('aceita 250% como máximo e corta qualquer excesso', () => {
    expect(MAX_PERCENT).toBe(250);
    expect(toPercent(fromPercent(250))).toBe(250);
    expect(toPercent(fromPercent(999))).toBe(250);
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(400));
    system.setActive('bust', true);
    run(system, 3);
    expect(avatar.morph.bust).toBeCloseTo(MAX_INTENSITY, 6);
    expect(toPercent(system.current.bust)).toBe(250);
    system.dispose();
  });

  it('em 250% a silhueta cresce de verdade, sem explodir', () => {
    const radius = 0.142;
    const neutral = silhouetteHalfWidth(Zone.Bust, radius, BUST_BAND.center, 0, 0);
    const full = silhouetteHalfWidth(Zone.Bust, radius, BUST_BAND.center, MAX_INTENSITY, 0);
    expect(neutral).toBeCloseTo(radius, 6);
    expect(full).toBeGreaterThan(neutral);
    // 250% × ganho lateral 0,30 ⇒ 1,75× de largura: visível, ainda estilizado.
    expect(full / neutral).toBeCloseTo(1 + BUST_BAND.gainX * MAX_INTENSITY, 5);
    expect(full / neutral).toBeLessThan(2);
  });

  it('todos os valores nomeados vão de 0 a 250 de 25 em 25', () => {
    expect(INTENSITY_STEPS).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250]);
    for (const step of INTENSITY_STEPS) expect(toPercent(fromPercent(step))).toBe(step);
  });
});

/* ----------------------- 4. Valores intermediários ---------------------- */

describe('Afters 2.0 · valores intermediários', () => {
  it('aceita valores fora dos degraus nomeados', () => {
    for (const percent of [5, 37, 63, 111, 148, 199, 223, 247]) {
      expect(toPercent(fromPercent(percent))).toBe(percent);
    }
  });

  it('cresce de forma monótona com a intensidade', () => {
    const radius = 0.125;
    let previous = -1;
    for (let percent = 0; percent <= 250; percent += 5) {
      const width = silhouetteHalfWidth(Zone.Curve, radius, CURVE_BAND.center, 0, fromPercent(percent));
      expect(width).toBeGreaterThan(previous);
      previous = width;
    }
  });

  it('o atalho de degrau só é usado quando pedido', () => {
    expect(nearestStep(63)).toBe(75);
    expect(nearestStep(60)).toBe(50);
    expect(nearestStep(-10)).toBe(0);
    expect(nearestStep(9999)).toBe(250);
  });
});

/* ------------- 5, 6 e 7. Canais independentes e modo combinado ---------- */

describe('Afters 2.0 · canais independentes', () => {
  it('ativa só o AfterBust® sem mexer no AfterCurve®', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(150));
    system.setActive('bust', true);
    run(system, 3);
    expect(toPercent(avatar.morph.bust)).toBe(150);
    expect(avatar.morph.curve).toBe(0);
    expect(statusLabel(system.current)).toBe('AfterBust® 150%');
    system.dispose();
  });

  it('ativa só o AfterCurve® sem mexer no AfterBust®', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('curve', fromPercent(75));
    system.setActive('curve', true);
    run(system, 3);
    expect(toPercent(avatar.morph.curve)).toBe(75);
    expect(avatar.morph.bust).toBe(0);
    expect(statusLabel(system.current)).toBe('AfterCurve® 75%');
    system.dispose();
  });

  it('cada canal mexe só na sua zona do corpo', () => {
    const bustOnly = displaceVertex({ x: 0.1, y: BUST_BAND.center, z: 0 }, Zone.Bust, 2, 0);
    const curveOnBust = displaceVertex({ x: 0.1, y: BUST_BAND.center, z: 0 }, Zone.Bust, 0, 2);
    expect(bustOnly.x).toBeGreaterThan(0.1);
    expect(curveOnBust.x).toBe(0.1);

    const curveOnly = displaceVertex({ x: 0.1, y: CURVE_BAND.center, z: 0 }, Zone.Curve, 0, 2);
    const bustOnCurve = displaceVertex({ x: 0.1, y: CURVE_BAND.center, z: 0 }, Zone.Curve, 2, 0);
    expect(curveOnly.x).toBeGreaterThan(0.1);
    expect(bustOnCurve.x).toBe(0.1);

    // Cabeça, braços e canelas nunca deformam, em nenhuma intensidade.
    const head = displaceVertex({ x: 0.11, y: 0.1, z: 0 }, Zone.None, MAX_INTENSITY, MAX_INTENSITY);
    expect(head).toEqual({ x: 0.11, y: 0.1, z: 0 });
  });

  it('combina os dois com intensidades diferentes', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(200));
    system.setIntensity('curve', fromPercent(100));
    system.setCombined(true);
    run(system, 3);
    expect(toPercent(avatar.morph.bust)).toBe(200);
    expect(toPercent(avatar.morph.curve)).toBe(100);
    expect(isCombined(system.current)).toBe(true);
    expect(system.status.combined).toBe(true);
    expect(statusLabel(system.current)).toBe('Modo combinado · AfterBust® 200% · AfterCurve® 100%');
    system.dispose();
  });

  it('a coxa acompanha o quadril para a junção não estrangular', () => {
    const grow = (zone: number, y: number): number => displaceVertex({ x: 0.1, y, z: 0 }, zone, 0, 1.5).x / 0.1;
    const hip = grow(Zone.Curve, CURVE_BAND.center);
    const thighTop = grow(Zone.Thigh, THIGH_BAND.center);
    expect(hip).toBeGreaterThan(1);
    expect(thighTop).toBeGreaterThan(1);
    // Os dois lados da junção crescem na mesma ordem de grandeza: sem degrau.
    expect(Math.abs(thighTop - hip)).toBeLessThan(0.25);
    // No joelho a deformação já praticamente desapareceu.
    expect(grow(Zone.Thigh, -0.4)).toBeLessThan(1.08);
    // E a canela nunca muda, em intensidade nenhuma.
    expect(grow(Zone.None, -0.2)).toBe(1);
  });
});

/* --------------------- 8. Desligamento independente --------------------- */

describe('Afters 2.0 · desligar sem perder o outro', () => {
  it('desliga o AfterBust® e o AfterCurve® continua', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(175));
    system.setIntensity('curve', fromPercent(125));
    system.setCombined(true);
    run(system, 3);
    system.setActive('bust', false);
    run(system, 3);
    expect(avatar.morph.bust).toBe(0);
    expect(toPercent(avatar.morph.curve)).toBe(125);
    // A intensidade escolhida fica guardada para quando religar.
    expect(toPercent(system.current.bust)).toBe(175);
    system.setActive('bust', true);
    run(system, 3);
    expect(toPercent(avatar.morph.bust)).toBe(175);
    system.dispose();
  });

  it('"desligar tudo" zera os dois sem apagar as escolhas', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(225));
    system.setIntensity('curve', fromPercent(50));
    system.setCombined(true);
    run(system, 3);
    system.turnOff();
    run(system, 3);
    expect(avatar.morph).toEqual({ bust: 0, curve: 0 });
    const body = system.current;
    expect(toPercent(body.bust)).toBe(225);
    expect(toPercent(body.curve)).toBe(50);
    expect(body.bustActive).toBe(false);
    expect(body.curveActive).toBe(false);
    const off = allOff(body);
    expect(isNeutral(off)).toBe(true);
    system.dispose();
  });

  it('restaura a silhueta original de forma limpa em 0%', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(250));
    system.setActive('bust', true);
    run(system, 3);
    system.setIntensity('bust', 0);
    run(system, 3);
    expect(avatar.morph.bust).toBe(0);
    expect(system.status.bust.animating).toBe(false);
    system.dispose();
  });
});

/* ------------------- 8.1 Reinício (padrão de fábrica) ------------------- */

describe('Afters 2.0 · reiniciar', () => {
  it('reiniciar um canal zera a porcentagem guardada', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(225));
    system.setActive('bust', true);
    run(system, 3);
    system.reset('bust');
    run(system, 3);
    expect(avatar.morph.bust).toBe(0);
    expect(toPercent(system.current.bust)).toBe(0);
    expect(system.current.bustActive).toBe(false);
    // Religar depois do reinício começa do zero, não dos 225%.
    system.setActive('bust', true);
    run(system, 3);
    expect(avatar.morph.bust).toBe(0);
    system.dispose();
  });

  it('reiniciar um canal não encosta no outro', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(150));
    system.setIntensity('curve', fromPercent(200));
    system.setCombined(true);
    system.setDuration(2.4);
    run(system, 4);
    system.reset('curve');
    run(system, 4);
    expect(toPercent(avatar.morph.bust)).toBe(150);
    expect(avatar.morph.curve).toBe(0);
    expect(system.current.bustActive).toBe(true);
    expect(system.current.duration).toBeCloseTo(2.4, 5);
    system.dispose();
  });

  it('reiniciar tudo volta ao estado de fábrica', () => {
    const { system, avatar } = makeSystem();
    system.applyPreset(getAftersPreset('maximo')!);
    system.setDuration(5.5);
    run(system, 7);
    system.resetAll();
    run(system, 4);
    expect(avatar.morph).toEqual({ bust: 0, curve: 0 });
    expect(system.current).toEqual(defaultAftersBody());
    system.dispose();
  });

  it('reiniciar avisa a interface, como qualquer outra mudança', () => {
    const changes: AftersBody[] = [];
    const system = new AftersBodySystem({ onChange: (body) => changes.push(body) });
    system.setAvatars([new Avatar(DEFAULT_APPEARANCE)]);
    system.setIntensity('curve', fromPercent(100));
    const before = changes.length;
    system.reset('curve');
    expect(changes.length).toBeGreaterThan(before);
    expect(toPercent(changes[changes.length - 1].curve)).toBe(0);
    system.dispose();
  });

  it('reiniciar o estado puro é diferente de desligar', () => {
    const body = { bust: 2, curve: 1, bustActive: true, curveActive: true, duration: 1.6, preset: null };
    const off = allOff(body);
    expect(off.bust).toBe(2);
    expect(off.bustActive).toBe(false);
    const reset = resetChannel(body, 'bust');
    expect(reset.bust).toBe(0);
    expect(reset.bustActive).toBe(false);
    expect(reset.curve).toBe(1);
    expect(reset.curveActive).toBe(true);
  });
});

/* ------------------------ 9. Mudanças ao vivo --------------------------- */

describe('Afters 2.0 · mudança ao vivo', () => {
  it('nunca salta: a transição passa por valores intermediários', () => {
    const { system, avatar } = makeSystem();
    system.setDuration(1);
    system.setIntensity('bust', fromPercent(250));
    system.setActive('bust', true);
    const samples: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      system.update(1 / 60);
      samples.push(avatar.morph.bust);
    }
    expect(samples[0]).toBeGreaterThan(0);
    expect(samples[samples.length - 1]).toBeLessThan(MAX_INTENSITY);
    // Monótona e sem degrau brusco entre quadros (nada de "pop").
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
      expect(samples[i] - samples[i - 1]).toBeLessThan(0.2);
    }
    system.dispose();
  });

  it('aceita um novo alvo no meio da transição, sem reiniciar do zero', () => {
    const { system, avatar } = makeSystem();
    system.setDuration(2);
    system.setIntensity('curve', fromPercent(250));
    system.setActive('curve', true);
    run(system, 0.6);
    const middle = avatar.morph.curve;
    expect(middle).toBeGreaterThan(0);
    system.setIntensity('curve', fromPercent(100));
    // O valor não pula: parte de onde estava.
    expect(avatar.morph.curve).toBeCloseTo(middle, 6);
    run(system, 4);
    expect(toPercent(avatar.morph.curve)).toBe(100);
    system.dispose();
  });

  it('intensidade e duração são parâmetros separados', () => {
    const fast = new AftersBodySystem();
    const slow = new AftersBodySystem();
    const fastAvatar = new Avatar(DEFAULT_APPEARANCE);
    const slowAvatar = new Avatar(DEFAULT_APPEARANCE);
    fast.setAvatars([fastAvatar]);
    slow.setAvatars([slowAvatar]);
    for (const system of [fast, slow]) {
      system.setIntensity('bust', fromPercent(200));
      system.setActive('bust', true);
    }
    fast.setDuration(0.4);
    slow.setDuration(5);
    fast.setIntensity('bust', fromPercent(200));
    slow.setIntensity('bust', fromPercent(200));
    run(fast, 0.5);
    run(slow, 0.5);
    // Mesma intensidade pedida, tempos diferentes de chegada.
    expect(toPercent(fast.current.bust)).toBe(200);
    expect(toPercent(slow.current.bust)).toBe(200);
    expect(fastAvatar.morph.bust).toBeGreaterThan(slowAvatar.morph.bust);
    run(slow, 6);
    expect(toPercent(slowAvatar.morph.bust)).toBe(200);
    fast.dispose();
    slow.dispose();
  });

  it('a duração é limitada a uma faixa usável', () => {
    expect(clampDuration(0)).toBeGreaterThan(0);
    expect(clampDuration(-3)).toBe(clampDuration(0));
    expect(clampDuration(999)).toBeLessThanOrEqual(6);
    expect(clampDuration(Number.NaN)).toBeGreaterThan(0);
  });

  it('não depende de quadros regulares: dt enorme, zero ou negativo', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('bust', fromPercent(100));
    system.setActive('bust', true);
    system.update(0);
    system.update(-1);
    expect(Number.isFinite(avatar.morph.bust)).toBe(true);
    system.update(120);
    expect(toPercent(avatar.morph.bust)).toBe(100);
    system.dispose();
  });

  it('trocar de avatar no meio do caminho mantém a silhueta', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('curve', fromPercent(150));
    system.setActive('curve', true);
    run(system, 3);
    const replacement = new Avatar(DEFAULT_APPEARANCE);
    system.addAvatar(replacement);
    expect(toPercent(replacement.morph.curve)).toBe(150);
    system.removeAvatar(avatar);
    expect(avatar.morph.curve).toBe(0);
    expect(toPercent(replacement.morph.curve)).toBe(150);
    system.dispose();
  });
});

/* ----------------------- 10. Presets e estado --------------------------- */

describe('Afters 2.0 · presets', () => {
  it('cada preset existe, é aplicável e é reconhecido de volta', () => {
    for (const preset of AFTERS_PRESETS) {
      expect(getAftersPreset(preset.id)).toBe(preset);
      const body = applyPreset(defaultAftersBody(), preset);
      expect(toPercent(body.bust)).toBe(preset.bust);
      expect(toPercent(body.curve)).toBe(preset.curve);
      expect(matchingPreset(body)?.id).toBe(preset.id);
    }
  });

  it('o preset Máximo BET leva os dois canais a 250%', () => {
    const { system, avatar } = makeSystem();
    const maximo = getAftersPreset('maximo');
    expect(maximo).toBeDefined();
    system.applyPreset(maximo!);
    run(system, 4);
    expect(toPercent(avatar.morph.bust)).toBe(250);
    expect(toPercent(avatar.morph.curve)).toBe(250);
    system.dispose();
  });

  it('mexer num slider depois do preset desfaz a marcação do preset', () => {
    const { system } = makeSystem();
    system.applyPreset(getAftersPreset('aurora')!);
    expect(system.current.preset).toBe('aurora');
    system.setIntensity('bust', fromPercent(135));
    expect(system.current.preset).toBeNull();
    system.dispose();
  });
});

/* ------------- 11 e 12. Persistência, migração e salvamento ------------- */

describe('Afters 2.0 · persistência', () => {
  it('guarda intensidades, ativações, duração e preset', () => {
    const { system } = makeSystem();
    system.setIntensity('bust', fromPercent(175));
    system.setIntensity('curve', fromPercent(125));
    system.setCombined(true);
    system.setDuration(2.5);
    const saved = JSON.parse(JSON.stringify(system.current));
    const restored = sanitizeAftersBody(saved);
    expect(toPercent(restored.bust)).toBe(175);
    expect(toPercent(restored.curve)).toBe(125);
    expect(restored.bustActive).toBe(true);
    expect(restored.curveActive).toBe(true);
    expect(restored.duration).toBeCloseTo(2.5, 5);
    system.dispose();
  });

  it('restaura sem animação: o avatar carrega já transformado', () => {
    const { system, avatar } = makeSystem();
    const stored = sanitizeAftersBody({ bust: 2, curve: 1.25, bustActive: true, curveActive: true, duration: 1.6, preset: null });
    system.setBody(stored, false);
    expect(toPercent(avatar.morph.bust)).toBe(200);
    expect(toPercent(avatar.morph.curve)).toBe(125);
    expect(system.status.animating).toBe(false);
    system.dispose();
  });

  it('o salvamento novo já nasce com o bloco de silhueta', () => {
    const save = createNewSave();
    expect(save.afters.body).toBeDefined();
    expect(isNeutral(save.afters.body)).toBe(true);
  });

  it('salvamento sem o bloco (anterior ao Afters 2.0) continua carregando', () => {
    const legacy = { unlocked: true, productId: 'afterlove', color: '#ff6f91', intensity: 0.8, particles: true, sound: true };
    const config = sanitizeAftersConfig(legacy);
    expect(config.unlocked).toBe(true);
    expect(config.productId).toBe('afterlove');
    expect(isNeutral(config.body)).toBe(true);
  });

  it('entrada corrompida vira silhueta original, sem derrubar o jogo', () => {
    for (const junk of [null, undefined, 42, 'nada', [], { bust: 'muito', curve: Number.NaN, duration: -9 }]) {
      const body = sanitizeAftersBody(junk);
      expect(Number.isFinite(body.bust)).toBe(true);
      expect(Number.isFinite(body.curve)).toBe(true);
      expect(body.bust).toBeGreaterThanOrEqual(0);
      expect(body.bust).toBeLessThanOrEqual(MAX_INTENSITY);
      expect(body.duration).toBeGreaterThan(0);
    }
    // 0% em tudo é exatamente o preset Natural, então ele é reconhecido.
    expect(sanitizeAftersBody({ preset: 'inexistente' }).preset).toBe('natural');
    // Um preset que não descreve mais o estado guardado é descartado.
    expect(sanitizeAftersBody({ bust: 1, curve: 0.3, bustActive: true, curveActive: true, preset: 'aurora' }).preset).toBeNull();
  });

  it('a volta inteira pelo SaveSystem preserva a transformação', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    const system = new SaveSystem(storage);
    const save = createNewSave();
    save.afters = { ...defaultAftersConfig(), unlocked: true, body: { bust: 2.5, curve: 1, bustActive: true, curveActive: false, duration: 3, preset: null } };
    expect(system.save(save)).toBe(true);
    const loaded = system.load();
    expect(loaded.status).toBe('carregado');
    expect(loaded.data?.afters.body.bust).toBeCloseTo(2.5, 6);
    expect(loaded.data?.afters.body.curve).toBeCloseTo(1, 6);
    expect(loaded.data?.afters.body.bustActive).toBe(true);
    expect(loaded.data?.afters.body.curveActive).toBe(false);
    expect(loaded.data?.afters.body.duration).toBeCloseTo(3, 6);
  });

  it('um salvamento da versão 1, sem Afters nenhum, não quebra', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    const legacy = createNewSave() as unknown as Record<string, unknown>;
    legacy.version = 1;
    delete legacy.afters;
    store.set('edenworld.save.v1', JSON.stringify(legacy));
    const loaded = new SaveSystem(storage).load();
    expect(loaded.status).toBe('carregado');
    expect(loaded.data?.afters.body).toBeDefined();
    expect(isNeutral(loaded.data!.afters.body)).toBe(true);
  });
});

/* --------------- 13. Consistência da animação e do canal ---------------- */

describe('Afters 2.0 · consistência da animação', () => {
  it('a suavização é contínua e termina exatamente em 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOutCubic(-5)).toBe(0);
    expect(easeInOutCubic(7)).toBe(1);
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const value = easeInOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('o canal relata progresso coerente do início ao fim', () => {
    const channel = new AfterBustController();
    expect(channel.id).toBe('bust');
    channel.duration = 1;
    channel.apply(2, true);
    expect(channel.animating).toBe(true);
    expect(channel.progress).toBeCloseTo(0, 6);
    channel.update(0.5);
    expect(channel.progress).toBeCloseTo(0.5, 6);
    expect(channel.current).toBeGreaterThan(0);
    expect(channel.current).toBeLessThan(2);
    channel.update(0.6);
    expect(channel.animating).toBe(false);
    expect(channel.progress).toBe(1);
    expect(channel.current).toBe(2);
    expect(channel.percent).toBe(200);
  });

  it('o canal de curva tem identidade própria e snap imediato', () => {
    const channel = new AfterCurveController();
    expect(channel.id).toBe('curve');
    channel.duration = 4;
    channel.apply(1.5, true);
    channel.snap();
    expect(channel.current).toBe(1.5);
    expect(channel.animating).toBe(false);
    const snapshot = channel.snapshot();
    expect(snapshot).toMatchObject({ id: 'curve', current: 1.5, target: 1.5, animating: false, active: true });
  });

  it('o estado informado pelo sistema acompanha a transição', () => {
    const { system } = makeSystem();
    system.setDuration(1);
    system.setIntensity('bust', fromPercent(250));
    system.setActive('bust', true);
    expect(system.status.animating).toBe(true);
    run(system, 0.5);
    expect(system.status.bust.progress).toBeGreaterThan(0.3);
    expect(system.status.bust.progress).toBeLessThan(0.8);
    run(system, 1);
    expect(system.status.animating).toBe(false);
    expect(system.effective('bust')).toBeCloseTo(system.requested('bust'), 6);
    system.dispose();
  });

  it('avisa a interface quando o estado muda', () => {
    const changes: number[] = [];
    const transitions: string[] = [];
    const system = new AftersBodySystem({
      onChange: (body) => changes.push(toPercent(body.bust)),
      onTransition: (channel, from, to) => transitions.push(`${channel}:${to > from ? 'sobe' : 'desce'}`),
    });
    system.setAvatars([new Avatar(DEFAULT_APPEARANCE)]);
    system.setIntensity('bust', fromPercent(100));
    system.setActive('bust', true);
    system.setActive('bust', false);
    expect(changes.length).toBeGreaterThanOrEqual(3);
    expect(transitions).toContain('bust:sobe');
    expect(transitions).toContain('bust:desce');
    system.dispose();
  });

  it('descartar o sistema devolve o avatar ao formato original', () => {
    const { system, avatar } = makeSystem();
    system.setIntensity('curve', fromPercent(250));
    system.setActive('curve', true);
    run(system, 3);
    expect(avatar.morph.curve).toBeGreaterThan(0);
    system.dispose();
    expect(avatar.morph).toEqual({ bust: 0, curve: 0 });
    // Chamar duas vezes não quebra nem reanima.
    system.dispose();
    system.update(1);
    expect(avatar.morph.curve).toBe(0);
  });
});

/* ---------------- 14. Malha do avatar: zonas e integridade -------------- */

describe('Afters 2.0 · malha do avatar', () => {
  it('toda a malha tem o atributo de zona, com zonas válidas', () => {
    const avatar = new Avatar(DEFAULT_APPEARANCE);
    const meshes: THREE.Mesh[] = [];
    avatar.root.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh;
      // Só as juntas usam o material do avatar; a auréola tem o seu.
      if (mesh.isMesh && (mesh.material as THREE.Material).name === 'avatar') meshes.push(mesh);
    });
    expect(meshes.length).toBeGreaterThan(5);
    let zoned = 0;
    for (const mesh of meshes) {
      const attribute = mesh.geometry.getAttribute('aZone');
      expect(attribute).toBeDefined();
      expect(attribute.count).toBe(mesh.geometry.getAttribute('position').count);
      for (let i = 0; i < attribute.count; i += 1) {
        const zone = attribute.getX(i);
        expect([Zone.None, Zone.Bust, Zone.Curve, Zone.Thigh]).toContain(Math.round(zone));
        if (zone > 0) zoned += 1;
      }
    }
    // Existem vértices deformáveis — e também vértices que nunca deformam.
    expect(zoned).toBeGreaterThan(0);
    avatar.dispose();
  });

  it('cada roupa e cada corpo continuam montando com as zonas certas', () => {
    for (const outfit of ['casual', 'aero', 'vestido', 'esportivo', 'praia'] as const) {
      const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit });
      avatar.setMorph(2.5, 2.5);
      expect(avatar.morph).toEqual({ bust: 2.5, curve: 2.5 });
      let hasCurve = false;
      avatar.root.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || (mesh.material as THREE.Material).name !== 'avatar') return;
        const attribute = mesh.geometry.getAttribute('aZone');
        for (let i = 0; i < attribute.count; i += 1) if (Math.round(attribute.getX(i)) === Zone.Curve) hasCurve = true;
      });
      expect(hasCurve).toBe(true);
      avatar.dispose();
    }
  });

  it('o avatar limita a intensidade que recebe', () => {
    const avatar = new Avatar(DEFAULT_APPEARANCE);
    avatar.setMorph(99, -4);
    expect(avatar.morph).toEqual({ bust: MAX_INTENSITY, curve: 0 });
    avatar.dispose();
  });

  it('trocar de roupa mantém a silhueta escolhida', () => {
    const avatar = new Avatar(DEFAULT_APPEARANCE);
    avatar.setMorph(1.5, 2);
    avatar.setAppearance({ ...DEFAULT_APPEARANCE, outfit: 'vestido' });
    expect(avatar.morph).toEqual({ bust: 1.5, curve: 2 });
    avatar.dispose();
  });
});

/* -------------- 15. Paridade entre a conta em TS e a do GLSL ------------ */

describe('Afters 2.0 · paridade TypeScript ↔ GLSL', () => {
  const glsl = aftersMorphGLSL();

  it('o shader declara o que o avatar injeta', () => {
    expect(glsl).toContain('uniform float uBust;');
    expect(glsl).toContain('uniform float uCurve;');
    expect(glsl).toContain('attribute float aZone;');
    expect(glsl).toContain('vec3 edenAftersPosition(vec3 pos)');
    expect(glsl).toContain('vec3 edenAftersNormal(vec3 pos, vec3 nrm)');
  });

  it('as constantes das bandas são exatamente as mesmas nos dois lados', () => {
    for (const band of [MORPH_BANDS.bust, MORPH_BANDS.curve, MORPH_BANDS.thigh]) {
      const expected = [band.center, band.sigmaUp, band.sigmaDown, band.gainX, band.gainFront, band.gainBack]
        .map((value) => value.toFixed(5))
        .join(', ');
      expect(glsl).toContain(`EdenBand(${expected})`);
    }
    // Nenhum número mágico sobrando: toda chamada EdenBand(...) do shader
    // corresponde a uma das três bandas declaradas em TypeScript.
    const calls = glsl.match(/EdenBand\([^)]*\)/g) ?? [];
    const known = new Set(
      [MORPH_BANDS.bust, MORPH_BANDS.curve, MORPH_BANDS.thigh].map(
        (band) =>
          `EdenBand(${[band.center, band.sigmaUp, band.sigmaDown, band.gainX, band.gainFront, band.gainBack].map((value) => value.toFixed(5)).join(', ')})`,
      ),
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(known.has(call)).toBe(true);
  });

  it('o mapa de zonas do shader bate com o do TypeScript', () => {
    expect(bandForZone(Zone.Bust)).toMatchObject({ band: BUST_BAND, channel: 'bust' });
    expect(bandForZone(Zone.Curve)).toMatchObject({ band: CURVE_BAND, channel: 'curve' });
    expect(bandForZone(Zone.Thigh)).toMatchObject({ band: THIGH_BAND, channel: 'curve' });
    expect(bandForZone(Zone.None)).toBeNull();
    expect(bandForZone(7)).toBeNull();
    expect(glsl).toContain('if (zone == 1.0)');
    expect(glsl).toContain('intensity = uBust;');
    expect(glsl).toContain('} else if (zone == 2.0)');
    expect(glsl).toContain('} else if (zone == 3.0)');
  });

  it('a conta de referência é estável e bem-comportada', () => {
    // O peso é 1 no centro e cai dos dois lados, com caudas diferentes.
    expect(bandWeight(BUST_BAND, BUST_BAND.center)).toBeCloseTo(1, 6);
    expect(bandWeight(BUST_BAND, BUST_BAND.center + 0.2)).toBeLessThan(0.01);
    expect(bandWeight(CURVE_BAND, CURVE_BAND.center - 0.1)).toBeGreaterThan(bandWeight(CURVE_BAND, CURVE_BAND.center + 0.1));

    // A normal continua unitária depois da correção.
    const normal = displaceNormal({ x: 0.14, y: 0.23, z: 0.05 }, { x: 1, y: 0, z: 0 }, Zone.Bust, 2.5, 0);
    expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 6);
    const untouched = displaceNormal({ x: 0.1, y: 0.1, z: 0 }, { x: 0, y: 1, z: 0 }, Zone.None, 2.5, 2.5);
    expect(untouched).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('frente e costas crescem de forma diferente, como no shader', () => {
    const front = displaceVertex({ x: 0, y: BUST_BAND.center, z: 0.1 }, Zone.Bust, 2, 0);
    const back = displaceVertex({ x: 0, y: BUST_BAND.center, z: -0.1 }, Zone.Bust, 2, 0);
    expect(front.z).toBeGreaterThan(0.1);
    expect(Math.abs(back.z)).toBeGreaterThan(0.1);
    expect(front.z - 0.1).toBeGreaterThan(Math.abs(back.z) - 0.1);
    expect(front.y).toBe(BUST_BAND.center);
  });
});

/* ------------- 16. Estado para multijogador (apenas preparo) ------------ */

describe('Afters 2.0 · estado de rede (preparado, sem servidor)', () => {
  it('serializa só o que o outro cliente precisa', () => {
    const body = { bust: 2, curve: 1, bustActive: true, curveActive: true, duration: 1.5, preset: null };
    const state = toNetState(body, { productId: 'afterbust', now: 1000 });
    expect(state).toMatchObject({ bust: 2, curve: 1, productId: 'afterbust', startedAt: 1000, duration: 1.5 });
  });

  it('um canal desligado viaja como zero', () => {
    const state = toNetState({ bust: 2.5, curve: 2, bustActive: false, curveActive: true, duration: 1, preset: null });
    expect(state.bust).toBe(0);
    expect(state.curve).toBe(2);
  });

  it('reconstrói a transição no cliente, sem mandar quadros', () => {
    const state = toNetState({ bust: 2, curve: 0, bustActive: true, curveActive: false, duration: 2, preset: null }, { fromBust: 0, now: 0 });
    expect(sampleNetState(state, 0).bust).toBeCloseTo(0, 6);
    const middle = sampleNetState(state, 1000).bust;
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(2);
    expect(sampleNetState(state, 2000).bust).toBeCloseTo(2, 6);
    expect(isNetStateSettled(state, 1000)).toBe(false);
    expect(isNetStateSettled(state, 2500)).toBe(true);
  });

  it('entrada de rede corrompida não deforma ninguém', () => {
    for (const junk of [null, 'oi', 7, { bust: 'enorme' }, { bust: 99, curve: -5 }]) {
      const state = sanitizeNetState(junk, 500);
      expect(state.bust).toBeGreaterThanOrEqual(0);
      expect(state.bust).toBeLessThanOrEqual(MAX_INTENSITY);
      expect(state.curve).toBeGreaterThanOrEqual(0);
      expect(state.curve).toBeLessThanOrEqual(MAX_INTENSITY);
      expect(state.startedAt).toBeLessThanOrEqual(500);
    }
  });
});
