import * as THREE from 'three';
import { TAU } from '../utils/math';

export interface CollectibleSpotLike {
  id: string;
  x: number;
  y: number;
  z: number;
  hint: string;
}

const PICKUP_RADIUS = 1.35;
const PICKUP_HEIGHT = 2.6;

function glowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(190,250,255,0.75)');
    gradient.addColorStop(0.6, 'rgba(90,220,255,0.22)');
    gradient.addColorStop(1, 'rgba(60,200,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Cristais de Luz: colecionáveis espalhados por Aurora City.
 * Desenhados com uma única malha instanciada e um conjunto de brilhos.
 */
export class Collectibles {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly glow: THREE.Points;
  private readonly glowTexture: THREE.CanvasTexture;
  private readonly active: boolean[];
  private readonly burst: number[];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(0, 1, 0);
  private remainingCount = 0;

  constructor(
    private readonly spots: readonly CollectibleSpotLike[],
    isCollected: (id: string) => boolean,
  ) {
    this.group.name = 'cristais-de-luz';
    const geometry = new THREE.OctahedronGeometry(0.26, 0);
    geometry.scale(0.72, 1.35, 0.72);
    const material = new THREE.MeshStandardMaterial({
      color: 0xc8fbff,
      emissive: 0x4fe6ff,
      emissiveIntensity: 1.5,
      roughness: 0.12,
      metalness: 0.1,
      flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, spots.length));
    this.mesh.count = spots.length;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;

    this.glowTexture = glowTexture();
    const positions = new Float32Array(spots.length * 3);
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.glow = new THREE.Points(
      glowGeometry,
      new THREE.PointsMaterial({
        map: this.glowTexture,
        size: 2.2,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.85,
        toneMapped: false,
      }),
    );
    this.glow.frustumCulled = false;
    this.group.add(this.mesh, this.glow);

    this.active = spots.map((spot) => !isCollected(spot.id));
    this.burst = spots.map(() => 0);
    this.remainingCount = this.active.filter(Boolean).length;
    this.writeAll(0);
  }

  get remaining(): number {
    return this.remainingCount;
  }

  get total(): number {
    return this.spots.length;
  }

  /** Redefine quais cristais estão disponíveis (novo jogo). */
  reset(isCollected: (id: string) => boolean): void {
    for (let i = 0; i < this.spots.length; i++) {
      this.active[i] = !isCollected(this.spots[i].id);
      this.burst[i] = 0;
    }
    this.remainingCount = this.active.filter(Boolean).length;
    this.writeAll(0);
  }

  private writeAll(elapsed: number): void {
    const positions = this.glow.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.spots.length; i++) {
      const spot = this.spots[i];
      const shown = this.active[i] || this.burst[i] > 0;
      const phase = i * 1.7;
      const bob = Math.sin(elapsed * 1.6 + phase) * 0.14;
      const grow = this.burst[i] > 0 ? 1 + (1 - this.burst[i]) * 1.6 : 1;
      const fade = this.burst[i] > 0 ? this.burst[i] : 1;
      const y = spot.y + bob + (this.burst[i] > 0 ? (1 - this.burst[i]) * 1.4 : 0);
      this.position.set(spot.x, y, spot.z);
      this.quaternion.setFromAxisAngle(this.axis, (elapsed * 1.3 + phase) % TAU);
      const s = shown ? grow * fade : 0;
      this.scale.set(s, s, s);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      // Brilhos de cristais coletados vão para longe da vista.
      positions.setXYZ(i, spot.x, shown ? y : -9999, spot.z);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    positions.needsUpdate = true;
  }

  /**
   * Anima os cristais e verifica a coleta.
   * @returns o cristal coletado neste quadro, se houver.
   */
  update(dt: number, elapsed: number, x: number, y: number, z: number, canCollect: boolean): CollectibleSpotLike | null {
    let collected: CollectibleSpotLike | null = null;
    for (let i = 0; i < this.spots.length; i++) {
      if (this.burst[i] > 0) this.burst[i] = Math.max(0, this.burst[i] - dt * 2.2);
      if (!this.active[i] || collected || !canCollect) continue;
      const spot = this.spots[i];
      const dx = spot.x - x;
      const dz = spot.z - z;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      const dy = spot.y - y;
      if (dy < -0.6 || dy > PICKUP_HEIGHT) continue;
      this.active[i] = false;
      this.burst[i] = 1;
      this.remainingCount -= 1;
      collected = spot;
    }
    this.writeAll(elapsed);
    return collected;
  }

  /** Cristal ainda não coletado mais próximo (para a dica do EdenPhone). */
  nearest(x: number, z: number): { spot: CollectibleSpotLike; distance: number } | null {
    let best: CollectibleSpotLike | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < this.spots.length; i++) {
      if (!this.active[i]) continue;
      const d = Math.hypot(this.spots[i].x - x, this.spots[i].z - z);
      if (d < bestDistance) {
        bestDistance = d;
        best = this.spots[i];
      }
    }
    return best ? { spot: best, distance: bestDistance } : null;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
    this.glowTexture.dispose();
    this.group.removeFromParent();
  }
}
