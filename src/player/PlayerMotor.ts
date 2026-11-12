import { PLAYER, WORLD } from '../core/Config';
import type { SeatSpot } from '../interactions/Interactable';
import type { SurfaceType } from '../physics/Collision';
import type { GroundInfo, PhysicsWorld } from '../physics/PhysicsWorld';
import { damp, dampAngle, wrapAngle } from '../utils/math';

export type MotionState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'swim' | 'sit';

/** Intenção de movimento de um quadro, já convertida para o espaço do mundo. */
export interface MoveIntent {
  /** Direção desejada no plano XZ, com magnitude entre 0 e 1. */
  x: number;
  z: number;
  run: boolean;
  /** `true` apenas no quadro em que o pulo foi pressionado. */
  jump: boolean;
  jumpHeld: boolean;
}

export interface MotorListener {
  onJump?(): void;
  onLand?(impactSpeed: number, surface: SurfaceType): void;
  onStep?(surface: SurfaceType, running: boolean): void;
  onSplash?(strength: number): void;
  onStandUp?(): void;
}

const MAX_SUBSTEP = 0.22;
const STRIDE_WALK = 0.78;
const STRIDE_RUN = 1.32;
const SNAP_DOWN = 0.46;
const AIR_STEP = 0.28;
/** Distância entre a superfície do assento e a origem (pés) do personagem sentado. */
const SEAT_DROP = 0.345;

/**
 * Movimento cinemático do personagem (sem dependência de renderização):
 * aceleração, pulo com tolerâncias, gravidade, degraus, natação e assentos.
 * Trabalha apenas com o `PhysicsWorld`, o que o torna testável em Node.
 */
export class PlayerMotor {
  readonly position = { x: 0, y: 0, z: 0 };
  readonly velocity = { x: 0, y: 0, z: 0 };
  /** Direção do corpo (0 = +Z). */
  heading = 0;
  grounded = true;
  swimming = false;
  /** `true` com os pés na água rasa (sons de passos molhados). */
  wading = false;
  state: MotionState = 'idle';
  surface: SurfaceType = 'stone';
  /** Velocidade horizontal atual (m/s). */
  speed = 0;
  /** Distância total percorrida a pé ou a nado (m). */
  distanceTravelled = 0;
  /** Fase contínua da passada (rad), usada pela animação. */
  stridePhase = 0;
  seat: SeatSpot | null = null;
  listener: MotorListener = {};

  private coyote = 0;
  private jumpBuffer = 0;
  private airTime = 0;
  private stepAccumulator = 0;
  private readonly ground: GroundInfo = { height: 0, surface: 'stone', onPlatform: false };
  private readonly safe = { x: 0, y: 0, z: 0, valid: false };

  constructor(private readonly physics: PhysicsWorld) {}

  /** Último ponto firme e seco em que o personagem pisou. */
  get lastSafePosition(): { x: number; y: number; z: number } | null {
    return this.safe.valid ? this.safe : null;
  }

  get isSitting(): boolean {
    return this.seat !== null;
  }

  /** Coloca o personagem em um ponto do mundo, apoiado no chão sob ele. */
  teleport(x: number, z: number, heading: number, y?: number): void {
    this.seat = null;
    this.position.x = x;
    this.position.z = z;
    const probeY = y ?? 1e4;
    this.physics.groundAt(x, z, probeY, PLAYER.stepHeight, this.ground);
    const swimY = WORLD.waterLevel - PLAYER.swimSubmersion;
    this.position.y = Math.max(this.ground.height, swimY);
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.heading = wrapAngle(heading);
    this.grounded = this.ground.height >= swimY;
    this.swimming = !this.grounded;
    this.speed = 0;
    this.airTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.state = this.swimming ? 'swim' : 'idle';
  }

  sit(seat: SeatSpot): void {
    this.seat = seat;
    this.position.x = seat.x;
    // `seat.y` é a superfície do assento; a origem do personagem fica nos pés.
    this.position.y = seat.y - SEAT_DROP;
    this.position.z = seat.z;
    this.heading = wrapAngle(seat.heading);
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.speed = 0;
    this.grounded = true;
    this.swimming = false;
    this.state = 'sit';
  }

  standUp(): void {
    const seat = this.seat;
    if (!seat) return;
    this.seat = null;
    // Levanta um passo à frente do assento.
    const x = seat.x + Math.sin(seat.heading) * 0.62;
    const z = seat.z + Math.cos(seat.heading) * 0.62;
    this.physics.groundAt(x, z, seat.y + 0.3, PLAYER.stepHeight, this.ground);
    this.position.x = x;
    this.position.z = z;
    this.position.y = this.ground.height;
    this.state = 'idle';
    this.listener.onStandUp?.();
  }

  update(dt: number, intent: MoveIntent): void {
    if (dt <= 0) return;
    if (this.seat) {
      if (intent.jump || Math.hypot(intent.x, intent.z) > 0.35) this.standUp();
      else return;
    }

    const physics = this.physics;
    const pos = this.position;
    const vel = this.velocity;
    const swimY = WORLD.waterLevel - PLAYER.swimSubmersion;

    let ix = intent.x;
    let iz = intent.z;
    const magnitude = Math.hypot(ix, iz);
    if (magnitude > 1) {
      ix /= magnitude;
      iz /= magnitude;
    }
    const amount = Math.min(1, magnitude);

    // Velocidade horizontal desejada.
    const maxSpeed = this.swimming
      ? intent.run
        ? PLAYER.swimSprintSpeed
        : PLAYER.swimSpeed
      : intent.run
        ? PLAYER.runSpeed
        : PLAYER.walkSpeed;
    const wadeFactor = this.wading && !this.swimming ? 0.72 : 1;
    const targetX = ix * maxSpeed * wadeFactor;
    const targetZ = iz * maxSpeed * wadeFactor;
    const accel = this.grounded || this.swimming ? (amount > 0.01 ? PLAYER.acceleration : PLAYER.deceleration) : PLAYER.airControl;
    const dvx = targetX - vel.x;
    const dvz = targetZ - vel.z;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dv <= maxDv) {
      vel.x = targetX;
      vel.z = targetZ;
    } else {
      vel.x += (dvx / dv) * maxDv;
      vel.z += (dvz / dv) * maxDv;
    }

    if (amount > 0.05) {
      this.heading = wrapAngle(dampAngle(this.heading, Math.atan2(ix, iz), PLAYER.turnRate, dt));
    }

    // Pulo com tolerâncias ("coyote time" e buffer).
    this.jumpBuffer = intent.jump ? PLAYER.jumpBuffer : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? PLAYER.coyoteTime : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.swimming) {
      vel.y = PLAYER.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.airTime = 0;
      this.listener.onJump?.();
    }

    // Gravidade (pulo mais curto ao soltar o botão).
    if (!this.grounded && !this.swimming) {
      const gravity = vel.y > 0 && !intent.jumpHeld ? PLAYER.gravity * 2.1 : PLAYER.gravity;
      vel.y = Math.max(-PLAYER.maxFallSpeed, vel.y - gravity * dt);
    }

    // Deslocamento horizontal em subpassos (evita atravessar paredes finas).
    const startX = pos.x;
    const startZ = pos.z;
    const travel = Math.hypot(vel.x, vel.z) * dt;
    const steps = Math.max(1, Math.ceil(travel / MAX_SUBSTEP));
    let collided = false;
    for (let i = 0; i < steps; i++) {
      pos.x += (vel.x * dt) / steps;
      pos.z += (vel.z * dt) / steps;
      if (physics.resolveCircle(pos, PLAYER.radius, pos.y, PLAYER.height, PLAYER.stepHeight)) collided = true;
    }
    const movedX = pos.x - startX;
    const movedZ = pos.z - startZ;
    const moved = Math.hypot(movedX, movedZ);
    if (collided) {
      // Ao deslizar em paredes, a velocidade passa a refletir o movimento real.
      vel.x = movedX / dt;
      vel.z = movedZ / dt;
    }
    this.speed = moved / dt;

    // Movimento vertical e apoio.
    const wasGrounded = this.grounded;
    const wasSwimming = this.swimming;
    const fallSpeed = -vel.y;
    if (this.grounded) {
      physics.groundAt(pos.x, pos.z, pos.y, PLAYER.stepHeight, this.ground);
      if (this.ground.height >= pos.y - SNAP_DOWN) {
        pos.y = this.ground.height;
        vel.y = 0;
      } else {
        this.grounded = false;
        vel.y = 0;
      }
    } else if (!this.swimming) {
      pos.y += vel.y * dt;
      physics.groundAt(pos.x, pos.z, pos.y, AIR_STEP, this.ground);
      if (vel.y <= 0 && pos.y <= this.ground.height) {
        pos.y = this.ground.height;
        this.grounded = true;
        vel.y = 0;
      }
    } else {
      physics.groundAt(pos.x, pos.z, pos.y, PLAYER.stepHeight, this.ground);
    }

    // Água: nada quando o fundo fica abaixo do nível de flutuação.
    const deep = this.ground.height < swimY;
    if (deep && pos.y <= swimY + 0.02) {
      if (!wasSwimming) {
        this.swimming = true;
        this.grounded = false;
        this.listener.onSplash?.(Math.min(1, 0.25 + Math.max(0, fallSpeed) / 12));
      }
      pos.y = wasSwimming ? damp(pos.y, swimY, 6, dt) : swimY;
      vel.y = 0;
    } else if (this.swimming) {
      // Fundo voltou a ficar raso: sai andando.
      this.swimming = false;
      this.grounded = true;
      pos.y = Math.max(pos.y, this.ground.height);
    }
    this.wading = !this.ground.onPlatform && this.ground.height < WORLD.waterLevel - 0.06 && pos.y < WORLD.waterLevel;
    this.surface = this.swimming || this.wading ? 'water' : this.ground.surface;

    if (!wasGrounded && this.grounded && !this.swimming && !wasSwimming) {
      this.listener.onLand?.(Math.max(0, fallSpeed), this.surface);
      this.stepAccumulator = 0;
    }
    this.airTime = this.grounded || this.swimming ? 0 : this.airTime + dt;

    // Passos e distância.
    if ((this.grounded || this.swimming) && moved > 0) {
      this.distanceTravelled += moved;
      const running = this.speed > PLAYER.walkSpeed * 1.25;
      const stride = this.swimming ? 1.5 : running ? STRIDE_RUN : STRIDE_WALK;
      this.stridePhase += (moved / stride) * Math.PI;
      this.stepAccumulator += moved;
      if (this.stepAccumulator >= stride) {
        this.stepAccumulator -= stride;
        this.listener.onStep?.(this.surface, running);
      }
    }

    if (this.grounded && !this.wading) {
      this.safe.x = pos.x;
      this.safe.y = pos.y;
      this.safe.z = pos.z;
      this.safe.valid = true;
    }

    // Rede de segurança: nunca deixar o personagem cair para fora do mundo.
    if (pos.y < -40) {
      if (this.safe.valid) this.teleport(this.safe.x, this.safe.z, this.heading, this.safe.y + 0.5);
      else this.teleport(0, 0, this.heading);
    }

    if (this.swimming) this.state = 'swim';
    else if (!this.grounded && this.airTime > 0.08) this.state = vel.y > 0.5 ? 'jump' : 'fall';
    else if (this.speed > PLAYER.walkSpeed * 1.25) this.state = 'run';
    else if (this.speed > 0.25) this.state = 'walk';
    else this.state = 'idle';
  }
}
