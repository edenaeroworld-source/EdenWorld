import { describe, expect, it } from 'vitest';
import { WorldClock } from '../../src/world/WorldClock';

describe('WorldClock', () => {
  it('avança conforme a duração do dia e conta os dias', () => {
    const clock = new WorldClock(23, 240);
    clock.update(10); // 240 s por dia → 10 s = 1 hora
    expect(clock.hours).toBeCloseTo(0, 6);
    expect(clock.day).toBe(2);
  });

  it('formata o horário e classifica o período', () => {
    const clock = new WorldClock(9.5);
    expect(clock.label).toBe('09:30');
    expect(clock.period).toBe('manhã');
    clock.setHours(13);
    expect(clock.period).toBe('tarde');
    clock.setHours(20.25);
    expect(clock.label).toBe('20:15');
    expect(clock.period).toBe('noite');
    clock.setHours(27);
    expect(clock.label).toBe('03:00');
    expect(clock.period).toBe('madrugada');
    clock.setHours(-1);
    expect(clock.hours).toBe(23);
  });

  it('respeita o ritmo do tempo', () => {
    const clock = new WorldClock(12, 1440);
    clock.pace = 'parado';
    clock.update(600);
    expect(clock.hours).toBe(12);
    clock.pace = 'rapido';
    clock.update(30); // 30 s reais × 12 = 360 s de jogo = 6 h (dia de 1440 s)
    expect(clock.hours).toBeCloseTo(18, 6);
    clock.pace = 'normal';
    clock.update(60); // 60 s = 1 h
    expect(clock.hours).toBeCloseTo(19, 6);
    expect(clock.day).toBe(1);
  });

  it('desliza sempre para frente até o horário escolhido', () => {
    const clock = new WorldClock(20, 1440);
    clock.glideTo(6);
    expect(clock.isGliding).toBe(true);
    let previous = clock.hours;
    let wrapped = 0;
    for (let i = 0; i < 600 && clock.isGliding; i++) {
      clock.update(1 / 60);
      if (clock.hours < previous) wrapped++;
      previous = clock.hours;
    }
    expect(clock.isGliding).toBe(false);
    expect(clock.hours).toBeCloseTo(6, 6);
    expect(wrapped).toBe(1);
    expect(clock.day).toBe(2);
  });

  it('o sol nasce a leste, culmina ao meio-dia e some à noite', () => {
    const clock = new WorldClock(12);
    const noon = clock.getSun();
    expect(noon.y).toBeGreaterThan(0.9);
    expect(noon.daylight).toBe(1);
    expect(Math.hypot(noon.x, noon.y, noon.z)).toBeCloseTo(1, 6);
    expect(clock.isNight).toBe(false);

    clock.setHours(6);
    const dawn = clock.getSun();
    expect(dawn.x).toBeGreaterThan(0.9);
    expect(dawn.twilight).toBeGreaterThan(0.8);

    clock.setHours(18);
    expect(clock.getSun().x).toBeLessThan(-0.9);

    clock.setHours(0);
    const midnight = clock.getSun();
    expect(midnight.y).toBeLessThan(-0.9);
    expect(midnight.daylight).toBe(0);
    expect(clock.isNight).toBe(true);
  });
});
