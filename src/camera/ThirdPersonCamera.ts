import * as THREE from 'three';
import { CAMERA, WORLD } from '../core/Config';
import type { ScenicView } from '../interactions/Interactable';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { DEG2RAD, clamp, damp, dampAngle, wrapAngle } from '../utils/math';
import { DETAIL_LAYER } from '../world/Water';

export type CameraMode = 'follow' | 'scenic' | 'creator' | 'orbit';

const SCENIC_MIN_FOV = 11;
const SCENIC_MAX_FOV = 52;

/** Campo de visão vertical que preserva a abertura horizontal em telas estreitas. */
export function fovForAspect(baseFov: number, aspect: number, referenceAspect = 1.25, maxFov = 86): number {
  if (aspect >= referenceAspect) return baseFov;
  const horizontal = Math.tan((baseFov * DEG2RAD) / 2) * referenceAspect;
  return Math.min(maxFov, (2 * Math.atan(horizontal / Math.max(aspect, 0.2))) / DEG2RAD);
}

/**
 * Câmera de terceira pessoa com órbita livre, zoom, colisão com o
 * cenário e três modos auxiliares: vista panorâmica (telescópios),
 * estúdio (criador de avatar) e órbita cinematográfica (menu).
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'follow';
  /** Direção horizontal do olhar (0 = +Z). */
  yaw = Math.PI;
  /** Inclinação: positiva = câmera acima do personagem. */
  pitch: number = CAMERA.defaultPitch;
  distance: number = CAMERA.defaultDistance;
  /** Realinha suavemente atrás do personagem quando ele anda. */
  autoAlign = true;
  /** `true` quando a câmera está tão perto que o avatar deve ser ocultado. */
  hideAvatar = false;

  private aspect = 1;
  private baseFov: number = CAMERA.fov;
  private currentDistance: number = CAMERA.defaultDistance;
  private readonly pivot = new THREE.Vector3();
  private pivotReady = false;
  private idleLook = 0;
  private readonly lookTarget = new THREE.Vector3();

  private scenicEye = new THREE.Vector3();
  private scenicYaw = 0;
  private scenicPitch = 0;
  private scenicFov = 36;

  private creatorYaw = 0;
  private creatorZoom = 1;

  private readonly orbitCenter = new THREE.Vector3();
  private orbitRadius = 58;
  private orbitHeight = 17;
  private orbitLookY = 9;
  private orbitAngle = 0.6;
  private orbitSpeed = 0.045;

  private offsetX = 0;
  private offsetY = 0;
  private offsetTargetX = 0;
  private offsetTargetY = 0;
  private viewWidth = 1;
  private viewHeight = 1;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.layers.enable(DETAIL_LAYER);
    this.camera.rotation.order = 'YXZ';
  }

  setViewport(width: number, height: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.aspect = this.viewWidth / this.viewHeight;
    this.camera.aspect = this.aspect;
    this.baseFov = fovForAspect(CAMERA.fov, this.aspect);
    this.applyProjection(this.mode === 'scenic' ? this.scenicFov : this.baseFov);
  }

  get fov(): number {
    return this.camera.fov;
  }

  /** Desloca o centro da imagem (fração da tela), abrindo espaço para painéis. */
  setScreenOffset(x: number, y: number, immediate = false): void {
    this.offsetTargetX = x;
    this.offsetTargetY = y;
    if (immediate) {
      this.offsetX = x;
      this.offsetY = y;
      this.applyProjection(this.camera.fov);
    }
  }

  private applyProjection(fov: number): void {
    this.camera.fov = fov;
    if (Math.abs(this.offsetX) > 0.001 || Math.abs(this.offsetY) > 0.001) {
      this.camera.setViewOffset(this.viewWidth, this.viewHeight, this.offsetX * this.viewWidth, this.offsetY * this.viewHeight, this.viewWidth, this.viewHeight);
    } else if (this.camera.view !== null) {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
  }

  /** Gira a câmera (radianos). `dx` positivo vira para a direita; `dy` positivo sobe a câmera. */
  addLook(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.idleLook = 0;
    if (this.mode === 'scenic') {
      const scale = this.scenicFov / CAMERA.fov;
      this.scenicYaw = wrapAngle(this.scenicYaw - dx * scale);
      this.scenicPitch = clamp(this.scenicPitch - dy * scale, -0.75, 0.6);
    } else if (this.mode === 'creator') {
      this.creatorYaw = wrapAngle(this.creatorYaw - dx);
    } else if (this.mode === 'follow') {
      this.yaw = wrapAngle(this.yaw - dx);
      this.pitch = clamp(this.pitch + dy, CAMERA.minPitch, CAMERA.maxPitch);
    }
  }

  /** Zoom: valores positivos afastam a câmera. */
  addZoom(delta: number): void {
    if (delta === 0) return;
    if (this.mode === 'scenic') {
      this.scenicFov = clamp(this.scenicFov * (1 + delta * 0.12), SCENIC_MIN_FOV, SCENIC_MAX_FOV);
    } else if (this.mode === 'creator') {
      this.creatorZoom = clamp(this.creatorZoom + delta * 0.08, 0.55, 1.25);
    } else if (this.mode === 'follow') {
      this.distance = clamp(this.distance * (1 + delta * 0.1), CAMERA.minDistance, CAMERA.maxDistance);
    }
  }

  /** Posiciona a câmera atrás do personagem. */
  reset(heading: number, immediate = false): void {
    this.yaw = wrapAngle(heading);
    this.pitch = CAMERA.defaultPitch;
    this.idleLook = 0;
    if (immediate) {
      this.pivotReady = false;
      this.currentDistance = this.distance;
    }
  }

  enterFollow(): void {
    this.mode = 'follow';
    this.setScreenOffset(0, 0);
    this.pivotReady = false;
  }

  enterScenic(view: ScenicView): void {
    this.mode = 'scenic';
    this.scenicEye.set(view.eye.x, view.eye.y, view.eye.z);
    this.scenicYaw = view.yaw;
    this.scenicPitch = view.pitch;
    this.scenicFov = 34;
    this.setScreenOffset(0, 0, true);
  }

  /** Estúdio do avatar: câmera de frente para o personagem. */
  enterCreator(heading: number): void {
    this.mode = 'creator';
    this.creatorYaw = wrapAngle(heading + Math.PI + 0.35);
    this.creatorZoom = 1;
  }

  enterOrbit(center: { x: number; y: number; z: number }, radius: number, height: number, lookY: number, speed = 0.045): void {
    this.mode = 'orbit';
    this.orbitCenter.set(center.x, center.y, center.z);
    this.orbitRadius = radius;
    this.orbitHeight = height;
    this.orbitLookY = lookY;
    this.orbitSpeed = speed;
    this.setScreenOffset(0, 0);
  }

  /** Direção horizontal do olhar atual (para converter comandos em movimento). */
  get lookYaw(): number {
    return this.mode === 'scenic' ? this.scenicYaw : this.yaw;
  }

  update(dt: number, focus: THREE.Vector3, playerHeading: number, playerMoving: boolean, physics: PhysicsWorld): void {
    const camera = this.camera;
    if (this.offsetX !== this.offsetTargetX || this.offsetY !== this.offsetTargetY) {
      this.offsetX = Math.abs(this.offsetTargetX - this.offsetX) < 0.002 ? this.offsetTargetX : damp(this.offsetX, this.offsetTargetX, 7, dt);
      this.offsetY = Math.abs(this.offsetTargetY - this.offsetY) < 0.002 ? this.offsetTargetY : damp(this.offsetY, this.offsetTargetY, 7, dt);
      this.applyProjection(camera.fov);
    }

    if (this.mode === 'scenic') {
      this.hideAvatar = true;
      if (Math.abs(camera.fov - this.scenicFov) > 0.01) this.applyProjection(damp(camera.fov, this.scenicFov, 10, dt));
      camera.position.copy(this.scenicEye);
      const cp = Math.cos(this.scenicPitch);
      this.lookTarget.set(
        this.scenicEye.x + Math.sin(this.scenicYaw) * cp,
        this.scenicEye.y + Math.sin(this.scenicPitch),
        this.scenicEye.z + Math.cos(this.scenicYaw) * cp,
      );
      camera.lookAt(this.lookTarget);
      return;
    }

    if (Math.abs(camera.fov - this.baseFov) > 0.01) this.applyProjection(damp(camera.fov, this.baseFov, 8, dt));

    if (this.mode === 'orbit') {
      this.hideAvatar = false;
      this.orbitAngle += this.orbitSpeed * dt;
      const bob = Math.sin(this.orbitAngle * 1.7) * 1.6;
      camera.position.set(
        this.orbitCenter.x + Math.cos(this.orbitAngle) * this.orbitRadius,
        this.orbitHeight + bob,
        this.orbitCenter.z + Math.sin(this.orbitAngle) * this.orbitRadius,
      );
      this.lookTarget.set(this.orbitCenter.x, this.orbitLookY, this.orbitCenter.z);
      camera.lookAt(this.lookTarget);
      return;
    }

    if (this.mode === 'creator') {
      this.hideAvatar = false;
      const portrait = this.aspect < 0.9;
      const distance = (portrait ? 4.3 : 3.5) * this.creatorZoom;
      const pitch = 0.1;
      const targetY = focus.y - 0.42;
      const cp = Math.cos(pitch);
      camera.position.set(
        focus.x - Math.sin(this.creatorYaw) * cp * distance,
        targetY + Math.sin(pitch) * distance,
        focus.z - Math.cos(this.creatorYaw) * cp * distance,
      );
      this.lookTarget.set(focus.x, targetY, focus.z);
      camera.lookAt(this.lookTarget);
      return;
    }

    // --- Modo de acompanhamento ---
    this.idleLook += dt;
    if (this.autoAlign && playerMoving && this.idleLook > 2.4) {
      this.yaw = wrapAngle(dampAngle(this.yaw, playerHeading, 0.85, dt));
    }

    if (!this.pivotReady) {
      this.pivot.copy(focus);
      this.pivotReady = true;
    } else {
      this.pivot.x = damp(this.pivot.x, focus.x, 18, dt);
      this.pivot.z = damp(this.pivot.z, focus.z, 18, dt);
      this.pivot.y = damp(this.pivot.y, focus.y, 11, dt);
      // Nunca deixa o personagem escapar muito do centro (teleportes, quedas).
      if (this.pivot.distanceToSquared(focus) > 36) this.pivot.copy(focus);
    }

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const dx = -Math.sin(this.yaw) * cp;
    const dy = sp;
    const dz = -Math.cos(this.yaw) * cp;

    const wanted = this.distance;
    const free = physics.raycast(this.pivot.x, this.pivot.y, this.pivot.z, dx, dy, dz, wanted + CAMERA.collisionMargin);
    const allowed = Math.max(0.35, Math.min(wanted, free - CAMERA.collisionMargin));
    // Aproxima rápido (para não atravessar paredes) e afasta devagar.
    this.currentDistance = allowed < this.currentDistance ? damp(this.currentDistance, allowed, 30, dt) : damp(this.currentDistance, allowed, 4.5, dt);
    if (this.currentDistance > allowed + 0.6) this.currentDistance = allowed + 0.6;

    const cx = this.pivot.x + dx * this.currentDistance;
    let cy = this.pivot.y + dy * this.currentDistance;
    const cz = this.pivot.z + dz * this.currentDistance;

    // Mantém a câmera acima do chão e da linha d'água. Dentro de um
    // prédio o chão é a laje do andar em que o jogador está — medida a
    // partir do alvo, não da câmera, senão ao subir a escada a câmera
    // ficaria presa na laje de cima enquanto o corpo ainda está embaixo.
    const ground = physics.floorUnder(cx, cz, this.pivot.y + 0.3);
    const floor = physics.indoor ? ground + 0.22 : Math.max(ground + 0.22, WORLD.waterLevel + 0.2);
    if (cy < floor) cy = floor;

    camera.position.set(cx, cy, cz);
    camera.lookAt(this.pivot);
    this.hideAvatar = this.currentDistance < 0.85;
  }
}
