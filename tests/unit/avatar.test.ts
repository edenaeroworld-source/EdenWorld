import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/core/Config';
import { AvatarAnimator, Ch } from '../../src/player/AvatarAnimator';
import {
  ACCESSORIES,
  CLOTH_COLORS,
  DEFAULT_APPEARANCE,
  HAIR_STYLES,
  OUTFITS,
  randomAppearance,
  sanitizeAppearance,
  sanitizePlayerName,
} from '../../src/player/AvatarAppearance';
import type { MotionState } from '../../src/player/PlayerMotor';
import { createRng } from '../../src/utils/math';

describe('aparência do avatar', () => {
  it('dados inválidos caem no padrão', () => {
    expect(sanitizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(sanitizeAppearance(42)).toEqual(DEFAULT_APPEARANCE);
    const a = sanitizeAppearance({
      skin: 'vermelho',
      hairStyle: 'moicano',
      hairColor: '#ABCDEF',
      outfit: 'vestido',
      topColor: 'javascript:alert(1)',
      accessory: 'aureola',
      height: 7,
    });
    expect(a.skin).toBe(DEFAULT_APPEARANCE.skin);
    expect(a.hairStyle).toBe(DEFAULT_APPEARANCE.hairStyle);
    expect(a.hairColor).toBe('#abcdef');
    expect(a.outfit).toBe('vestido');
    expect(a.topColor).toBe(DEFAULT_APPEARANCE.topColor);
    expect(a.accessory).toBe('aureola');
    expect(a.height).toBe(1.1);
  });

  it('aparência aleatória é determinística e sempre válida', () => {
    expect(randomAppearance(createRng(5))).toEqual(randomAppearance(createRng(5)));
    const rng = createRng(99);
    for (let i = 0; i < 100; i++) {
      const a = randomAppearance(rng);
      expect(sanitizeAppearance(a)).toEqual(a);
      expect(HAIR_STYLES).toContain(a.hairStyle);
      expect(OUTFITS).toContain(a.outfit);
      expect(ACCESSORIES).toContain(a.accessory);
      expect(CLOTH_COLORS).toContain(a.topColor);
    }
  });

  it('limpa o nome do jogador', () => {
    expect(sanitizePlayerName('  Lilly   do   Éden ')).toBe('Lilly do Éden');
    expect(sanitizePlayerName('<b>Zé</b>')).toBe('bZé/b');
    expect(sanitizePlayerName('a\u0000b\nc')).toBe('ab c');
    expect(sanitizePlayerName('x'.repeat(50))).toHaveLength(20);
    expect(sanitizePlayerName('   ')).toBe('Viajante');
    expect(sanitizePlayerName(123)).toBe('Viajante');
    expect(sanitizePlayerName('', 'Visitante')).toBe('Visitante');
  });
});

describe('animação procedural', () => {
  const run = (animator: AvatarAnimator, state: MotionState, speed: number, seconds: number, verticalSpeed = 0) => {
    let phase = 0;
    let pose = animator.pose;
    for (let t = 0; t < seconds; t += 1 / 60) {
      phase += speed * (1 / 60) * 2.2;
      pose = animator.update(1 / 60, { state, speed, stridePhase: phase, verticalSpeed, elapsed: t });
    }
    return pose;
  };

  it('todas as poses produzem valores finitos e joelhos que só dobram para trás', () => {
    const animator = new AvatarAnimator();
    const states: [MotionState, number, number][] = [
      ['idle', 0, 0],
      ['walk', PLAYER.walkSpeed, 0],
      ['run', PLAYER.runSpeed, 0],
      ['jump', 2, 5],
      ['fall', 2, -8],
      ['swim', 0, 0],
      ['swim', PLAYER.swimSpeed, 0],
      ['sit', 0, 0],
    ];
    for (const [state, speed, vy] of states) {
      for (let i = 0; i < 90; i++) {
        const pose = animator.update(1 / 60, { state, speed, stridePhase: i * 0.2, verticalSpeed: vy, elapsed: i / 60 });
        expect(pose).toHaveLength(Ch.Count);
        for (const value of pose) {
          expect(Number.isFinite(value)).toBe(true);
          expect(Math.abs(value)).toBeLessThan(Math.PI * 2);
        }
        expect(pose[Ch.ShinL]).toBeGreaterThanOrEqual(0);
        expect(pose[Ch.ShinR]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('pernas alternam ao andar e braços balançam em oposição', () => {
    const animator = new AvatarAnimator();
    run(animator, 'walk', PLAYER.walkSpeed, 1);
    const pose = animator.update(1 / 60, { state: 'walk', speed: PLAYER.walkSpeed, stridePhase: Math.PI / 2, verticalSpeed: 0, elapsed: 1 });
    expect(pose[Ch.LegLX]).toBeLessThan(-0.3);
    expect(pose[Ch.LegRX]).toBeGreaterThan(0.3);
    expect(pose[Ch.LegLX]).toBeCloseTo(-pose[Ch.LegRX], 5);
    // O braço acompanha a perna oposta.
    expect(Math.sign(pose[Ch.ArmLX])).toBe(Math.sign(pose[Ch.LegRX]));
  });

  it('correr amplia a passada em relação a andar', () => {
    const walking = new AvatarAnimator();
    const running = new AvatarAnimator();
    run(walking, 'walk', PLAYER.walkSpeed, 1.5);
    run(running, 'run', PLAYER.runSpeed, 1.5);
    const frame = { stridePhase: Math.PI / 2, verticalSpeed: 0, elapsed: 2 };
    const w = walking.update(1 / 60, { state: 'walk', speed: PLAYER.walkSpeed, ...frame })[Ch.LegRX];
    const r = running.update(1 / 60, { state: 'run', speed: PLAYER.runSpeed, ...frame })[Ch.LegRX];
    expect(r).toBeGreaterThan(w + 0.2);
  });

  it('sentar dobra quadril e joelhos e abaixa o corpo', () => {
    const animator = new AvatarAnimator();
    const pose = run(animator, 'sit', 0, 2);
    expect(pose[Ch.LegLX]).toBeLessThan(-1.3);
    expect(pose[Ch.ShinL]).toBeGreaterThan(1.2);
    expect(pose[Ch.HipsY]).toBeLessThan(-0.3);
  });

  it('o aceno levanta o braço direito e termina sozinho', () => {
    const animator = new AvatarAnimator();
    run(animator, 'idle', 0, 0.5);
    animator.wave(1);
    expect(animator.isWaving).toBe(true);
    const raised = run(animator, 'idle', 0, 0.6);
    expect(raised[Ch.ArmRZ]).toBeLessThan(-1.6);
    const lowered = run(animator, 'idle', 0, 1.5);
    expect(animator.isWaving).toBe(false);
    expect(lowered[Ch.ArmRZ]).toBeGreaterThan(-0.3);
  });

  it('aterrissar flexiona os joelhos por um instante', () => {
    const animator = new AvatarAnimator();
    run(animator, 'idle', 0, 0.5);
    animator.land(10);
    const hit = animator.update(1 / 60, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed: 1 });
    expect(hit[Ch.ShinL]).toBeGreaterThan(0.5);
    const settled = run(animator, 'idle', 0, 1.2);
    expect(settled[Ch.ShinL]).toBeLessThan(0.05);
  });
});
