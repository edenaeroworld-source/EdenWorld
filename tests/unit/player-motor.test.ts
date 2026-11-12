import { describe, expect, it } from 'vitest';
import { PLAYER, WORLD } from '../../src/core/Config';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { type MoveIntent, PlayerMotor } from '../../src/player/PlayerMotor';

const DT = 1 / 60;
const intent = (patch: Partial<MoveIntent> = {}): MoveIntent => ({ x: 0, z: 0, run: false, jump: false, jumpHeld: false, ...patch });

function simulate(motor: PlayerMotor, seconds: number, move: MoveIntent, each?: (frame: number) => void): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    motor.update(DT, i === 0 ? move : { ...move, jump: false });
    each?.(i);
  }
}

function flatWorld(height = 2): PhysicsWorld {
  return new PhysicsWorld({ getHeight: () => height, getSurface: () => 'stone' });
}

describe('PlayerMotor', () => {
  it('anda e corre nas velocidades configuradas', () => {
    const motor = new PlayerMotor(flatWorld());
    motor.teleport(0, 0, 0);
    simulate(motor, 2, intent({ z: 1 }));
    expect(motor.speed).toBeCloseTo(PLAYER.walkSpeed, 1);
    expect(motor.state).toBe('walk');
    expect(motor.position.z).toBeGreaterThan(5);
    expect(motor.heading).toBeCloseTo(0, 2);

    simulate(motor, 2, intent({ z: 1, run: true }));
    expect(motor.speed).toBeCloseTo(PLAYER.runSpeed, 1);
    expect(motor.state).toBe('run');

    simulate(motor, 1, intent());
    expect(motor.speed).toBe(0);
    expect(motor.state).toBe('idle');
  });

  it('vira o corpo para a direção do movimento', () => {
    const motor = new PlayerMotor(flatWorld());
    motor.teleport(0, 0, 0);
    simulate(motor, 1, intent({ x: 1 }));
    expect(motor.heading).toBeCloseTo(Math.PI / 2, 2);
    expect(motor.position.x).toBeGreaterThan(2);
  });

  it('pula, sobe até a altura esperada e aterrissa', () => {
    const motor = new PlayerMotor(flatWorld());
    motor.teleport(0, 0, 0);
    let jumped = 0;
    let landed = 0;
    motor.listener = { onJump: () => jumped++, onLand: () => landed++ };
    let peak = 0;
    simulate(motor, 1.2, intent({ jump: true, jumpHeld: true }), () => {
      peak = Math.max(peak, motor.position.y - 2);
    });
    const expected = (PLAYER.jumpSpeed * PLAYER.jumpSpeed) / (2 * PLAYER.gravity);
    expect(jumped).toBe(1);
    expect(landed).toBe(1);
    expect(peak).toBeGreaterThan(expected * 0.9);
    expect(peak).toBeLessThan(expected * 1.05);
    expect(motor.grounded).toBe(true);
    expect(motor.position.y).toBeCloseTo(2, 5);
  });

  it('soltar o pulo cedo resulta em um pulo mais baixo', () => {
    const high = new PlayerMotor(flatWorld());
    const low = new PlayerMotor(flatWorld());
    high.teleport(0, 0, 0);
    low.teleport(0, 0, 0);
    let peakHigh = 0;
    let peakLow = 0;
    simulate(high, 1.2, intent({ jump: true, jumpHeld: true }), () => (peakHigh = Math.max(peakHigh, high.position.y)));
    simulate(low, 1.2, intent({ jump: true, jumpHeld: false }), () => (peakLow = Math.max(peakLow, low.position.y)));
    expect(peakLow).toBeLessThan(peakHigh - 0.4);
  });

  it('aceita o pulo logo após sair de uma borda (coyote time)', () => {
    const physics = new PhysicsWorld({ getHeight: (_x, z) => (z < 0 ? 5 : 0) });
    const motor = new PlayerMotor(physics);
    motor.teleport(0, -0.3, 0);
    expect(motor.position.y).toBe(5);
    let frame = 0;
    while (motor.grounded && frame < 120) {
      motor.update(DT, intent({ z: 1 }));
      frame++;
    }
    expect(motor.grounded).toBe(false);
    let jumped = false;
    motor.listener = { onJump: () => (jumped = true) };
    motor.update(DT, intent({ z: 1, jump: true, jumpHeld: true }));
    expect(jumped).toBe(true);
    expect(motor.velocity.y).toBeGreaterThan(0);
  });

  it('sobe degraus baixos e é barrado por paredes', () => {
    const physics = flatWorld(0);
    physics.addBox({ x: 0, z: 3, halfX: 3, halfZ: 1, yMin: 0, yMax: 0.3 });
    physics.addBox({ x: 0, z: 8, halfX: 3, halfZ: 1, yMin: 0, yMax: 3 });
    const motor = new PlayerMotor(physics);
    motor.teleport(0, 0, 0);
    let maxY = 0;
    simulate(motor, 4, intent({ z: 1 }), () => (maxY = Math.max(maxY, motor.position.y)));
    expect(maxY).toBeCloseTo(0.3, 5);
    expect(motor.position.z).toBeLessThanOrEqual(7 - PLAYER.radius + 1e-6);
    expect(motor.position.z).toBeGreaterThan(6);
    expect(motor.speed).toBeLessThan(0.05);
  });

  it('nada em água funda e volta a andar na margem', () => {
    // Fundo desce 1 m a cada metro em +Z; a água fica em y = 0.
    const physics = new PhysicsWorld({ getHeight: (_x, z) => 1 - z, getSurface: () => 'sand' });
    const motor = new PlayerMotor(physics);
    motor.teleport(0, 0, 0);
    let splashes = 0;
    motor.listener = { onSplash: () => splashes++ };
    simulate(motor, 4, intent({ z: 1 }));
    expect(motor.swimming).toBe(true);
    expect(motor.state).toBe('swim');
    expect(motor.surface).toBe('water');
    expect(motor.position.y).toBeCloseTo(WORLD.waterLevel - PLAYER.swimSubmersion, 2);
    expect(splashes).toBe(1);
    expect(motor.speed).toBeLessThanOrEqual(PLAYER.swimSpeed + 0.01);

    simulate(motor, 8, intent({ z: -1 }));
    expect(motor.swimming).toBe(false);
    expect(motor.grounded).toBe(true);
    expect(motor.position.y).toBeGreaterThan(0);
    const safe = motor.lastSafePosition;
    expect(safe).not.toBeNull();
  });

  it('senta, ignora a gravidade e levanta ao se mover', () => {
    const motor = new PlayerMotor(flatWorld());
    motor.teleport(0, 0, 0);
    motor.sit({ x: 3, y: 2.47, z: 3, heading: Math.PI / 2 });
    expect(motor.state).toBe('sit');
    expect(motor.isSitting).toBe(true);
    simulate(motor, 0.5, intent());
    expect(motor.position.x).toBe(3);
    let stood = false;
    motor.listener = { onStandUp: () => (stood = true) };
    motor.update(DT, intent({ x: 1 }));
    expect(stood).toBe(true);
    expect(motor.isSitting).toBe(false);
    expect(motor.position.y).toBeCloseTo(2, 5);
    expect(motor.position.x).toBeGreaterThan(3.5);
  });

  it('emite passos proporcionais à distância', () => {
    const motor = new PlayerMotor(flatWorld());
    motor.teleport(0, 0, 0);
    const steps: string[] = [];
    motor.listener = { onStep: (surface) => steps.push(surface) };
    simulate(motor, 3, intent({ z: 1 }));
    expect(steps.length).toBeGreaterThanOrEqual(10);
    expect(steps.length).toBeLessThanOrEqual(13);
    expect(new Set(steps)).toEqual(new Set(['stone']));
    expect(motor.distanceTravelled).toBeGreaterThan(8);
  });

  it('não atravessa paredes finas com quadros longos', () => {
    const physics = flatWorld(0);
    physics.addBox({ x: 0, z: 2, halfX: 5, halfZ: 0.1, yMin: 0, yMax: 3 });
    const motor = new PlayerMotor(physics);
    motor.teleport(0, 0, 0);
    for (let i = 0; i < 40; i++) motor.update(0.1, intent({ z: 1, run: true }));
    expect(motor.position.z).toBeLessThan(1.9);
  });

  it('respeita o limite do mundo', () => {
    const physics = flatWorld(0);
    physics.boundaryRadius = 10;
    const motor = new PlayerMotor(physics);
    motor.teleport(0, 0, 0);
    simulate(motor, 5, intent({ x: 1, run: true }));
    expect(Math.hypot(motor.position.x, motor.position.z)).toBeLessThanOrEqual(10 - PLAYER.radius + 1e-6);
  });
});
