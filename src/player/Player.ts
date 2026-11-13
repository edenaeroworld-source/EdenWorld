import * as THREE from 'three';
import { PLAYER } from '../core/Config';
import type { SeatSpot } from '../interactions/Interactable';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { damp, dampAngle } from '../utils/math';
import { Avatar } from './Avatar';
import { AvatarAnimator } from './AvatarAnimator';
import type { AvatarAppearance } from './AvatarAppearance';
import type { Expression } from './AvatarFace';
import type { GestureId } from './Gestures';
import { type MotorListener, type MoveIntent, PlayerMotor } from './PlayerMotor';

const IDLE_INTENT: MoveIntent = { x: 0, z: 0, run: false, jump: false, jumpHeld: false };

/**
 * O personagem do jogador: une o motor de movimento, o avatar visual e
 * a animação procedural.
 */
export class Player {
  readonly motor: PlayerMotor;
  readonly avatar: Avatar;
  readonly animator = new AvatarAnimator();
  /** Posição suavizada (usada pela câmera e pelo desenho). */
  readonly position = new THREE.Vector3();
  name = 'Viajante';
  /** Luz de preenchimento desejada do avatar (maior no estúdio do criador). */
  fillTarget = 0.1;

  private visualY = 0;
  private visualHeading = 0;
  private initialized = false;

  constructor(scene: THREE.Scene, physics: PhysicsWorld, appearance: AvatarAppearance) {
    this.motor = new PlayerMotor(physics);
    this.avatar = new Avatar(appearance);
    scene.add(this.avatar.root);
  }

  setListener(listener: MotorListener): void {
    const animator = this.animator;
    this.motor.listener = {
      ...listener,
      onLand: (impact, surface) => {
        animator.land(impact);
        listener.onLand?.(impact, surface);
      },
    };
  }

  setAppearance(appearance: AvatarAppearance): void {
    this.avatar.setAppearance(appearance);
  }

  teleport(x: number, z: number, heading: number, y?: number): void {
    this.motor.teleport(x, z, heading, y);
    this.snapVisual();
  }

  sit(seat: SeatSpot): void {
    this.motor.sit(seat);
  }

  wave(): void {
    this.animator.wave();
  }

  /** Toca um gesto por cima da animação atual (não interrompe o andar). */
  gesture(id: GestureId, options?: { duration?: number; strength?: number }): void {
    this.animator.playGesture(id, options);
  }

  /** Troca a expressão do rosto. */
  express(expression: Expression): void {
    this.avatar.setExpression(expression);
  }

  /** Vira a cabeça para um ponto do mundo (ou `null` para soltar o olhar). */
  lookAt(target: THREE.Vector3 | null): void {
    if (!target) {
      this.animator.clearLook();
      return;
    }
    const yaw = Math.atan2(target.x - this.position.x, target.z - this.position.z) - this.visualHeading;
    const wrapped = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const flat = Math.hypot(dx, dz);
    const pitch = Math.atan2(this.position.y + 1.5 - target.y, Math.max(0.4, flat));
    this.animator.lookAt(wrapped, pitch);
  }

  /** Alinha imediatamente o visual ao estado físico (após teleportes). */
  snapVisual(): void {
    const p = this.motor.position;
    this.visualY = p.y;
    this.visualHeading = this.motor.heading;
    this.position.set(p.x, p.y, p.z);
    this.initialized = true;
    this.sync(0);
  }

  /** @param intent `null` congela os comandos (menus, diálogos), mantendo a física. */
  update(dt: number, elapsed: number, intent: MoveIntent | null): void {
    const motor = this.motor;
    motor.update(dt, intent ?? IDLE_INTENT);
    if (!this.initialized) this.snapVisual();

    const p = motor.position;
    // Suaviza degraus e a entrada na água, sem atrasar pulos e quedas.
    const follow = motor.grounded || motor.swimming || motor.isSitting ? 18 : 60;
    this.visualY = Math.abs(p.y - this.visualY) > 1.5 ? p.y : damp(this.visualY, p.y, follow, dt);
    this.visualHeading = dampAngle(this.visualHeading, motor.heading, 22, dt);
    this.position.set(p.x, this.visualY, p.z);

    const pose = this.animator.update(dt, {
      state: motor.state,
      speed: motor.speed,
      stridePhase: motor.stridePhase,
      verticalSpeed: motor.velocity.y,
      slope: motor.slope,
      elapsed,
    });
    this.avatar.applyPose(pose, elapsed);
    this.avatar.updateFace(dt);
    this.avatar.fill = damp(this.avatar.fill, this.fillTarget, 6, dt);
    this.sync(elapsed);
  }

  private sync(_elapsed: number): void {
    this.avatar.root.position.copy(this.position);
    this.avatar.root.rotation.y = this.visualHeading;
  }

  /** Ponto para onde a câmera olha (altura do peito). */
  getFocus(out: THREE.Vector3, height: number): THREE.Vector3 {
    const sitting = this.motor.isSitting ? -0.12 : 0;
    const swimming = this.motor.swimming ? -0.2 : 0;
    return out.set(this.position.x, this.position.y + (height + sitting + swimming) * this.avatar.appearance.height, this.position.z);
  }

  get interactionRange(): number {
    return PLAYER.interactionRange;
  }

  set visible(value: boolean) {
    this.avatar.root.visible = value;
  }

  get visible(): boolean {
    return this.avatar.root.visible;
  }

  dispose(): void {
    this.avatar.dispose();
  }
}
