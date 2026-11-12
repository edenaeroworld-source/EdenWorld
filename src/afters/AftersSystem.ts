import * as THREE from 'three';
import type { GameSystem } from '../core/GameSystem';
import { clamp01, damp } from '../utils/math';
import { type AftersConfig, type AftersProduct, defaultAftersConfig, getAftersProduct } from './AftersCatalog';

/**
 * Efeito visual dos Afters sobre o avatar do jogador.
 *
 * Representação **estilizada e abstrata**: anel de presença no chão,
 * partículas orbitando e um brilho suave em volta do corpo. Cada produto
 * tem uma assinatura de movimento própria. A troca de produto acontece
 * com transição animada e som de confirmação.
 */

export interface AftersCallbacks {
  /** Som de confirmação: ligar, desligar ou trocar de produto. */
  onSound?(kind: 'ligar' | 'desligar' | 'trocar'): void;
}

const MAX_PARTICLES = 56;

function sparkTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class AftersSystem implements GameSystem {
  readonly id = 'afters';
  readonly group = new THREE.Group();

  private config: AftersConfig = defaultAftersConfig();
  private product: AftersProduct | null = null;
  private readonly ring: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly halo: THREE.Sprite;
  private readonly haloMaterial: THREE.SpriteMaterial;
  private readonly points: THREE.Points;
  private readonly pointsMaterial: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly texture: THREE.CanvasTexture;
  private readonly color = new THREE.Color('#ff8fc0');
  private readonly target = new THREE.Vector3();
  /** 0 = desligado, 1 = totalmente visível (transição suave). */
  private activation = 0;
  private bodyHeight = 1.72;
  private enabled = true;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    private readonly callbacks: AftersCallbacks = {},
  ) {
    this.group.name = 'afters';
    this.group.visible = false;
    scene.add(this.group);

    this.texture = sparkTexture();

    const ringGeometry = new THREE.RingGeometry(0.42, 0.86, 40);
    ringGeometry.rotateX(-Math.PI / 2);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.ring = new THREE.Mesh(ringGeometry, this.ringMaterial);
    this.ring.renderOrder = 3;
    this.group.add(this.ring);

    this.haloMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      color: this.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.halo = new THREE.Sprite(this.haloMaterial);
    this.halo.scale.set(2.6, 2.6, 1);
    this.halo.renderOrder = 3;
    this.group.add(this.halo);

    this.positions = new Float32Array(MAX_PARTICLES * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setDrawRange(0, 0);
    this.pointsMaterial = new THREE.PointsMaterial({
      map: this.texture,
      color: this.color,
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geometry, this.pointsMaterial);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.group.add(this.points);
  }

  get current(): AftersConfig {
    return { ...this.config };
  }

  get activeProduct(): AftersProduct | null {
    return this.product;
  }

  /** Aplica preferências (vindas do salvamento ou do EdenPhone). */
  setConfig(config: AftersConfig, announce = true): void {
    const previous = this.config;
    this.config = { ...config };
    this.product = config.productId ? (getAftersProduct(config.productId) ?? null) : null;
    this.color.set(config.color);
    this.ringMaterial.color.copy(this.color);
    this.haloMaterial.color.copy(this.color);
    this.pointsMaterial.color.copy(this.color);
    if (!announce || !config.sound) return;
    const wasOn = previous.productId !== null;
    const isOn = this.product !== null;
    if (!wasOn && isOn) this.callbacks.onSound?.('ligar');
    else if (wasOn && !isOn) this.callbacks.onSound?.('desligar');
    else if (isOn && previous.productId !== config.productId) this.callbacks.onSound?.('trocar');
  }

  /** Posição do avatar neste quadro. */
  setTarget(x: number, y: number, z: number, bodyHeight: number): void {
    this.target.set(x, y, z);
    this.bodyHeight = bodyHeight;
  }

  /** Desliga o desenho (menus, modo foto sem avatar, criador). */
  setVisible(visible: boolean): void {
    this.enabled = visible;
  }

  update(dt: number, elapsed: number): void {
    if (this.disposed) return;
    const wanted = this.product && this.enabled ? 1 : 0;
    this.activation = damp(this.activation, wanted, 4.5, dt);
    if (this.activation < 0.004 && wanted === 0) {
      this.group.visible = false;
      return;
    }
    const product = this.product;
    if (!product) {
      this.group.visible = this.activation > 0.004;
      this.ringMaterial.opacity = 0;
      this.haloMaterial.opacity = 0;
      this.pointsMaterial.opacity = 0;
      return;
    }

    this.group.visible = true;
    const intensity = clamp01(this.config.intensity) * this.activation;
    const base = this.target;
    const pulse = 1 + Math.sin(elapsed * (product.signature === 'coracao' ? 4.4 : 1.8)) * 0.07;

    // Anel de presença no chão.
    this.ring.position.set(base.x, base.y + 0.03, base.z);
    this.ring.scale.setScalar((0.9 + product.glow * 0.5) * pulse * (0.7 + intensity * 0.6));
    this.ringMaterial.opacity = 0.22 + intensity * 0.5 * product.glow;

    // Brilho envolvente na altura do peito.
    const haloHeight = base.y + this.bodyHeight * (0.45 + product.lift * 0.35);
    this.halo.position.set(base.x, haloHeight, base.z);
    const haloScale = (1.7 + product.glow * 1.4) * (0.75 + intensity * 0.5) * pulse;
    this.halo.scale.set(haloScale, haloScale, 1);
    this.haloMaterial.opacity = 0.1 + intensity * 0.34 * product.glow;

    // Partículas com a assinatura de movimento do produto.
    const count = this.config.particles ? Math.round(MAX_PARTICLES * product.particles * (0.4 + intensity * 0.6)) : 0;
    this.points.geometry.setDrawRange(0, count);
    this.pointsMaterial.opacity = count > 0 ? 0.35 + intensity * 0.5 : 0;
    this.pointsMaterial.size = 0.1 + product.glow * 0.12;
    for (let i = 0; i < count; i++) {
      const seed = i * 2.399963;
      const t = elapsed * (0.5 + (i % 5) * 0.08);
      let radius = 0.55 + (i % 4) * 0.08;
      let height = 0;
      let angle = seed + t;
      switch (product.signature) {
        case 'halo':
          height = this.bodyHeight * (0.35 + ((i * 7) % 10) / 24);
          radius = 0.6 + Math.sin(t + seed) * 0.08;
          break;
        case 'orbita':
          height = this.bodyHeight * (0.3 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 + seed)));
          radius = 0.72 + Math.cos(t * 0.8 + seed) * 0.18;
          break;
        case 'cascata':
          height = this.bodyHeight * (1 - ((t * 0.35 + ((i * 13) % 17) / 17) % 1));
          radius = 0.5 + ((i * 11) % 7) / 28;
          angle = seed * 3.1;
          break;
        case 'brilho':
          height = this.bodyHeight * (((t * 0.5 + ((i * 19) % 23) / 23) % 1) * 1.1);
          radius = 0.35 + ((i * 17) % 9) / 14;
          angle = seed * 5.3 + t * 0.2;
          break;
        case 'coracao': {
          const beat = 0.5 + 0.5 * Math.sin(elapsed * 4.4 + seed);
          height = this.bodyHeight * (0.45 + 0.3 * beat);
          radius = 0.5 + beat * 0.3;
          break;
        }
        case 'veludo':
          height = this.bodyHeight * (0.25 + ((i * 7) % 12) / 30);
          radius = 0.46 + Math.sin(t * 0.4 + seed) * 0.05;
          break;
      }
      this.positions[i * 3] = base.x + Math.cos(angle) * radius;
      this.positions[i * 3 + 1] = base.y + height;
      this.positions[i * 3 + 2] = base.z + Math.sin(angle) * radius;
    }
    if (count > 0) (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ring.geometry.dispose();
    this.ringMaterial.dispose();
    this.haloMaterial.dispose();
    this.points.geometry.dispose();
    this.pointsMaterial.dispose();
    this.texture.dispose();
    this.group.removeFromParent();
  }
}
