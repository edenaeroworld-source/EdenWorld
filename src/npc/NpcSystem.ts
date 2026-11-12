import * as THREE from 'three';
import { PANTHEON, type EdenCharacter } from '../characters/Pantheon';
import type { GameSystem } from '../core/GameSystem';
import type { Interactable } from '../interactions/Interactable';
import { Avatar } from '../player/Avatar';
import { AvatarAnimator } from '../player/AvatarAnimator';
import type { QualityProfile } from '../systems/QualitySystem';
import { createRng, type Rng } from '../utils/math';
import type { DayPeriod } from '../world/WorldClock';
import { makeCitizen } from './CitizenData';
import { CitizenSim } from './CitizenSim';
import { buildAuroraWalkNetwork, type WalkNetwork } from './WalkNetwork';

/**
 * A população de Aurora City.
 *
 * - **Cidadãos**: simulados o tempo todo como dados leves (posição sobre a
 *   rede de caminhada) e desenhados com avatares completos apenas perto do
 *   jogador, por meio de um conjunto reutilizável ("pool").
 * - **Panteão**: personagens oficiais em pontos fixos da cidade, com aura,
 *   plaquinha de nome e conversa própria.
 */

export interface NpcSystemOptions {
  scene: THREE.Scene;
  /** Altura do terreno em um ponto. */
  ground: (x: number, z: number) => number;
  /** `true` onde ninguém pode andar (água, edifício, zona reservada). */
  blocked: (x: number, z: number) => boolean;
  quality: QualityProfile;
  seed?: number;
}

/**
 * Quantos cidadãos aparecem ao mesmo tempo, por nível de qualidade.
 * A simulação roda para todos; a qualidade controla só o desenho.
 */
const POPULATION: Record<string, { visible: number; range: number }> = {
  baixa: { visible: 7, range: 48 },
  media: { visible: 12, range: 70 },
  alta: { visible: 18, range: 95 },
};

/** População simulada de Aurora City (custo desprezível: é só matemática). */
const CITIZEN_COUNT = 54;
/**
 * Máximo de lugares de desenho. Os pontos de conversa são criados aqui,
 * de uma vez, para que a lista entregue ao sistema de interação nunca mude.
 */
const MAX_SLOTS = 18;

/** Distância (m) em que um personagem do panteão aparece. */
const DEITY_RANGE = 150;
/** Distância (m) em que a plaquinha com o nome some. */
const LABEL_RANGE = 46;

interface VisualSlot {
  /** Criado sob demanda (um por quadro, no máximo). */
  avatar: Avatar | null;
  animator: AvatarAnimator;
  citizen: CitizenSim | null;
  interactable: Interactable;
}

interface DeityNpc {
  character: EdenCharacter;
  x: number;
  y: number;
  z: number;
  heading: number;
  avatar: Avatar | null;
  animator: AvatarAnimator;
  aura: THREE.Mesh | null;
  label: THREE.Sprite | null;
  interactable: Interactable;
  waveCooldown: number;
}

function auraMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** Plaquinha flutuante com o nome do personagem (textura de canvas). */
function nameSprite(name: string, title: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const radius = 26;
    ctx.fillStyle = 'rgba(8, 28, 48, 0.55)';
    ctx.beginPath();
    // `roundRect` é recente: sem ele, a plaquinha vira um retângulo simples.
    if (typeof ctx.roundRect === 'function') ctx.roundRect(8, 18, canvas.width - 16, 92, radius);
    else ctx.rect(8, 18, canvas.width - 16, 92);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 44px system-ui, sans-serif';
    ctx.fillText(name, canvas.width / 2, 66);
    ctx.fillStyle = color;
    ctx.font = '400 26px system-ui, sans-serif';
    ctx.fillText(title, canvas.width / 2, 98);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(2.4, 0.6, 1);
  sprite.renderOrder = 4;
  return sprite;
}

export class NpcSystem implements GameSystem {
  readonly id = 'npcs';
  readonly group = new THREE.Group();
  readonly network: WalkNetwork;
  /** Pontos de conversa (cidadãos próximos + panteão). */
  readonly interactables: Interactable[] = [];
  /** Desligado em menus e no criador de avatar. */
  enabled = true;

  private readonly scene: THREE.Scene;
  private readonly ground: (x: number, z: number) => number;
  private readonly rng: Rng;
  private readonly citizens: CitizenSim[] = [];
  private readonly slots: VisualSlot[] = [];
  private readonly deities: DeityNpc[] = [];
  private readonly auraGeometry: THREE.RingGeometry;
  private readonly focus = new THREE.Vector3();
  private maxVisible: number;
  private visibleRange: number;
  private shadows: boolean;
  private assignTimer = 0;
  private period: DayPeriod | null = null;
  private routineCursor = 0;
  /** Reconstruções de avatar pendentes (no máximo uma por quadro). */
  private readonly pending: { slot: VisualSlot; citizen: CitizenSim }[] = [];
  private disposed = false;

  constructor(options: NpcSystemOptions) {
    this.scene = options.scene;
    this.ground = options.ground;
    this.rng = createRng(options.seed ?? 20261114);
    const preset = POPULATION[options.quality.level] ?? POPULATION.media;
    this.maxVisible = Math.min(MAX_SLOTS, preset.visible);
    this.visibleRange = preset.range;
    this.shadows = options.quality.shadows;
    this.group.name = 'habitantes';
    this.scene.add(this.group);
    this.auraGeometry = new THREE.RingGeometry(0.62, 1.05, 32);
    this.auraGeometry.rotateX(-Math.PI / 2);

    this.network = buildAuroraWalkNetwork({ blocked: options.blocked });
    this.spawnCitizens(CITIZEN_COUNT);
    this.createSlots();
    this.spawnPantheon();
  }

  /* ----------------------------- Criação ----------------------------- */

  private spawnCitizens(count: number): void {
    if (this.network.size === 0) return;
    for (let i = 0; i < count; i++) {
      const profile = makeCitizen(i + 1);
      const node = this.network.randomNode(this.rng);
      this.citizens.push(new CitizenSim(profile, this.network, node, createRng(i * 977 + 31), { ground: this.ground }));
    }
  }

  private spawnPantheon(): void {
    for (const character of PANTHEON) {
      let { x, z } = character.place;
      // Segurança: se o ponto oficial cair em água ou dentro de uma construção,
      // o personagem vai para o nó caminhável mais próximo.
      const nodeId = this.network.nearest(x, z);
      if (nodeId >= 0) {
        const node = this.network.node(nodeId);
        if (Math.hypot(node.x - x, node.z - z) > 18) {
          x = node.x;
          z = node.z;
        }
      }
      const y = this.ground(x, z);
      const interactable: Interactable = {
        id: `divino:${character.id}`,
        name: character.name,
        action: 'Conversar',
        position: new THREE.Vector3(x, y, z),
        range: 3.2,
        enabled: true,
        payload: { type: 'conversa', personId: character.id, divino: true },
      };
      this.interactables.push(interactable);
      this.deities.push({
        character,
        x,
        y,
        z,
        heading: character.place.heading,
        avatar: null,
        animator: new AvatarAnimator(),
        aura: null,
        label: null,
        interactable,
        waveCooldown: 0,
      });
    }
  }

  /** Cria os lugares de desenho e seus pontos de conversa (lista estável). */
  private createSlots(): void {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const interactable: Interactable = {
        id: `cidadao:${i}`,
        name: 'Habitante',
        action: 'Conversar',
        position: new THREE.Vector3(),
        range: 2.8,
        enabled: false,
        payload: { type: 'conversa', personId: '', divino: false },
      };
      this.interactables.push(interactable);
      this.slots.push({ avatar: null, animator: new AvatarAnimator(), citizen: null, interactable });
    }
  }

  /** Garante que o lugar tenha um avatar pronto para desenhar. */
  private ensureAvatar(slot: VisualSlot): Avatar {
    if (slot.avatar) return slot.avatar;
    const avatar = new Avatar();
    avatar.fill = 0.1;
    avatar.setShadows(this.shadows);
    avatar.root.visible = false;
    this.group.add(avatar.root);
    slot.avatar = avatar;
    return avatar;
  }

  /* ---------------------------- Consultas ---------------------------- */

  /** Cidadão atualmente ligado a um ponto de conversa (ou `null`). */
  citizenOf(interactableId: string): CitizenSim | null {
    const slot = this.slots.find((candidate) => candidate.interactable.id === interactableId);
    return slot?.citizen ?? null;
  }

  deityOf(characterId: string): DeityNpc | undefined {
    return this.deities.find((deity) => deity.character.id === characterId);
  }

  /** Faz o personagem acenar de volta. */
  waveBack(characterId: string): void {
    const deity = this.deityOf(characterId);
    deity?.animator.wave();
  }

  /** Posição do personagem no mundo (para câmera e olhares). */
  characterPosition(characterId: string): { x: number; y: number; z: number } | null {
    const deity = this.deityOf(characterId);
    return deity ? { x: deity.x, y: deity.y, z: deity.z } : null;
  }

  /** Vira um personagem do panteão para olhar um ponto. */
  lookAt(characterId: string, x: number, z: number): void {
    const deity = this.deityOf(characterId);
    if (deity) deity.heading = Math.atan2(x - deity.x, z - deity.z);
  }

  get population(): number {
    return this.citizens.length;
  }

  /* ---------------------------- Simulação ---------------------------- */

  setFocus(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
  }

  /** Troca a rotina dos cidadãos quando o período do dia muda. */
  setPeriod(period: DayPeriod): void {
    if (period === this.period) return;
    this.period = period;
    this.routineCursor = 0;
  }

  applyQuality(profile: QualityProfile): void {
    const preset = POPULATION[profile.level] ?? POPULATION.media;
    this.maxVisible = Math.min(MAX_SLOTS, preset.visible);
    this.visibleRange = preset.range;
    this.shadows = profile.shadows;
    for (const slot of this.slots) slot.avatar?.setShadows(profile.shadows);
    for (const deity of this.deities) deity.avatar?.setShadows(profile.shadows);
    // Excedente de avatares (qualidade reduzida): libera os últimos.
    for (let i = this.maxVisible; i < this.slots.length; i++) {
      const slot = this.slots[i];
      slot.citizen = null;
      slot.interactable.enabled = false;
      slot.avatar?.dispose();
      slot.avatar = null;
    }
  }

  update(dt: number, elapsed: number): void {
    if (this.disposed || dt <= 0) return;
    if (!this.enabled) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const focus = this.focus;

    // 1. Simulação leve de todos os cidadãos.
    for (const citizen of this.citizens) {
      citizen.update(dt);
      // Espaço pessoal: ninguém atravessa o jogador.
      const dx = citizen.x - focus.x;
      const dz = citizen.z - focus.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.9 && distance > 1e-3) {
        const push = (0.9 - distance) * Math.min(1, dt * 12);
        citizen.x += (dx / distance) * push;
        citizen.z += (dz / distance) * push;
      }
    }

    // 2. Rotinas: alguns cidadãos por quadro, para diluir o custo.
    if (this.period) {
      for (let i = 0; i < 2 && this.citizens.length > 0; i++) {
        const citizen = this.citizens[this.routineCursor % this.citizens.length];
        this.routineCursor += 1;
        if (this.routineCursor <= this.citizens.length) citizen.setRoutine(this.period);
      }
    }

    // 3. Quem ganha avatar visível.
    this.assignTimer += dt;
    if (this.assignTimer >= 0.4) {
      this.assignTimer = 0;
      this.assignVisuals();
    }

    // 4. Uma reconstrução de avatar por quadro (evita engasgos).
    const next = this.pending.shift();
    if (next && next.slot.citizen === next.citizen) {
      const avatar = this.ensureAvatar(next.slot);
      avatar.setAppearance(next.citizen.profile.appearance);
      avatar.root.visible = true;
      next.slot.interactable.name = next.citizen.profile.name;
      next.slot.interactable.enabled = true;
      next.slot.interactable.payload = { type: 'conversa', personId: String(next.citizen.profile.seed), divino: false };
    }

    // 5. Desenho dos cidadãos visíveis.
    for (const slot of this.slots) {
      const citizen = slot.citizen;
      if (!citizen || !slot.avatar) {
        if (slot.avatar) slot.avatar.root.visible = false;
        if (!citizen) slot.interactable.enabled = false;
        continue;
      }
      const pose = slot.animator.update(dt, {
        state: citizen.activity === 'andando' && citizen.speed > 0.15 ? (citizen.speed > 2.4 ? 'run' : 'walk') : 'idle',
        speed: citizen.speed,
        stridePhase: citizen.stridePhase,
        verticalSpeed: 0,
        elapsed,
      });
      slot.avatar.applyPose(pose, elapsed);
      slot.avatar.root.position.set(citizen.x, citizen.y, citizen.z);
      slot.avatar.root.rotation.y = citizen.heading;
      slot.interactable.position.set(citizen.x, citizen.y, citizen.z);
    }

    // 6. Panteão.
    this.updateDeities(dt, elapsed);
  }

  private assignVisuals(): void {
    const focus = this.focus;
    const range = this.visibleRange;
    const nearby = this.citizens
      .map((citizen) => ({ citizen, distance: citizen.distanceTo(focus.x, focus.z) }))
      .filter((entry) => entry.distance <= range)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.maxVisible);
    const wanted = new Set(nearby.map((entry) => entry.citizen));

    // Libera quem saiu do alcance.
    for (const slot of this.slots) {
      if (slot.citizen && !wanted.has(slot.citizen)) {
        slot.citizen = null;
        if (slot.avatar) slot.avatar.root.visible = false;
        slot.interactable.enabled = false;
      }
    }

    const assigned = new Set(this.slots.map((slot) => slot.citizen).filter((citizen): citizen is CitizenSim => citizen !== null));
    for (const entry of nearby) {
      if (assigned.has(entry.citizen)) continue;
      const slot = this.slots.slice(0, this.maxVisible).find((candidate) => candidate.citizen === null);
      if (!slot) break;
      slot.citizen = entry.citizen;
      if (slot.avatar) slot.avatar.root.visible = false;
      slot.interactable.enabled = false;
      assigned.add(entry.citizen);
      this.pending.push({ slot, citizen: entry.citizen });
    }
  }

  private updateDeities(dt: number, elapsed: number): void {
    const focus = this.focus;
    for (const deity of this.deities) {
      const distance = Math.hypot(deity.x - focus.x, deity.z - focus.z);
      const active = distance <= DEITY_RANGE;
      if (active && !deity.avatar) this.materializeDeity(deity);
      if (!deity.avatar) continue;
      deity.avatar.root.visible = active;
      if (deity.aura) deity.aura.visible = active;
      if (deity.label) {
        deity.label.visible = active && distance < LABEL_RANGE;
        (deity.label.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, (LABEL_RANGE - distance) / 10));
      }
      if (!active) continue;

      // Acena quando o jogador chega perto (com intervalo).
      deity.waveCooldown -= dt;
      if (distance < 6 && deity.waveCooldown <= 0 && !deity.animator.isWaving) {
        deity.animator.wave();
        deity.waveCooldown = 22;
      }
      // Olha para o jogador quando ele está perto.
      if (distance < 9) {
        const target = Math.atan2(focus.x - deity.x, focus.z - deity.z);
        let delta = target - deity.heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        deity.heading += delta * Math.min(1, dt * 3);
      } else {
        let delta = deity.character.place.heading - deity.heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        deity.heading += delta * Math.min(1, dt * 1.2);
      }

      const pose = deity.animator.update(dt, { state: 'idle', speed: 0, stridePhase: 0, verticalSpeed: 0, elapsed });
      deity.avatar.applyPose(pose, elapsed);
      deity.avatar.root.position.set(deity.x, deity.y, deity.z);
      deity.avatar.root.rotation.y = deity.heading;
      if (deity.aura) {
        const pulse = 1 + Math.sin(elapsed * 1.6 + deity.x) * 0.06;
        deity.aura.position.set(deity.x, deity.y + 0.035, deity.z);
        deity.aura.scale.setScalar(pulse);
        (deity.aura.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(elapsed * 2.1 + deity.z) * 0.08;
      }
      if (deity.label) deity.label.position.set(deity.x, deity.y + 2.35 + Math.sin(elapsed * 1.3 + deity.x) * 0.03, deity.z);
    }
  }

  private materializeDeity(deity: DeityNpc): void {
    const avatar = new Avatar(deity.character.appearance);
    avatar.fill = 0.16;
    avatar.setShadows(this.shadows);
    this.group.add(avatar.root);
    deity.avatar = avatar;

    const aura = new THREE.Mesh(this.auraGeometry, auraMaterial(deity.character.aura));
    aura.renderOrder = 2;
    this.group.add(aura);
    deity.aura = aura;

    const label = nameSprite(deity.character.name, deity.character.title, deity.character.colors[0]);
    this.group.add(label);
    deity.label = label;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) slot.avatar?.dispose();
    this.slots.length = 0;
    for (const deity of this.deities) {
      deity.avatar?.dispose();
      if (deity.aura) (deity.aura.material as THREE.Material).dispose();
      if (deity.label) {
        const material = deity.label.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      }
    }
    this.deities.length = 0;
    this.auraGeometry.dispose();
    this.pending.length = 0;
    this.citizens.length = 0;
    this.group.clear();
    this.group.removeFromParent();
    this.interactables.length = 0;
  }
}
