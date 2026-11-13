/**
 * A fauna visível.
 *
 * Liga `Wildlife.ts` (que decide *quais* bichos existem) a
 * `CreatureMesh.ts` (que sabe desenhá-los) e os faz andar, parar,
 * comer, pular e fugir dentro da região.
 *
 * Três coisas aqui não são enfeite:
 *
 * 1. **Habitat correto.** `populateRegion` sorteia posições sem olhar
 *    o terreno. Aqui cada bicho é reposicionado para uma âncora do seu
 *    habitat — lontra na água, veado no bosque, esquilo no jardim. Um
 *    peixe nunca aparece no meio do roseiral.
 * 2. **Orçamento.** A quantidade vem de `wildlifeBudget(quality)`, que
 *    já existia. Corpos além do orçamento nem são criados.
 * 3. **Distância.** Bicho longe some. É LOD simples, mas é o que
 *    mantém o celular respirando.
 */

import * as THREE from 'three';
import { TAU, createRng } from '../utils/math';
import { type CreatureParts, buildCreature, disposeCreature } from './CreatureMesh';
import { type Habitat, type Species, getSpecies } from './Species';
import type { WildAnimal } from './Wildlife';

/** Uma área onde um certo tipo de bicho se sente em casa. */
export interface HabitatAnchor {
  habitat: Habitat;
  x: number;
  z: number;
  radius: number;
}

export interface WildlifeViewOptions {
  /** Altura do terreno, para assentar as patas no chão. */
  groundY: (x: number, z: number) => number;
  /** Nível da água, para quem nada e para quem não deve molhar a pata. */
  waterLevel: number;
  anchors: readonly HabitatAnchor[];
  /** Até onde um bicho é desenhado. */
  viewDistance?: number;
}

interface LiveAnimal {
  data: WildAnimal;
  species: Species;
  parts: CreatureParts;
  /** Fase própria, para dois bichos iguais não se moverem em sincronia. */
  phase: number;
  /** Para onde está indo agora. */
  targetX: number;
  targetZ: number;
  /** Centro e raio do habitat a que pertence. */
  homeX: number;
  homeZ: number;
  homeRadius: number;
  /** Suaviza a virada de direção. */
  facing: number;
}

const STATE_TIME: Record<WildAnimal['state'], [number, number]> = {
  parado: [2.5, 6],
  andando: [3, 8],
  descansando: [6, 14],
  fugindo: [1.5, 3],
};

export class WildlifeView {
  readonly group = new THREE.Group();
  private readonly options: WildlifeViewOptions;
  private readonly animals: LiveAnimal[] = [];
  private readonly rng: () => number;
  private viewDistance: number;
  private detailScale = 1;

  constructor(options: WildlifeViewOptions) {
    this.options = options;
    this.group.name = 'Fauna';
    this.viewDistance = options.viewDistance ?? 90;
    this.rng = createRng(5150);
  }

  get count(): number {
    return this.animals.length;
  }

  /** Quais espécies estão visíveis agora — alimenta os avistamentos. */
  get visibleSpecies(): string[] {
    const ids = new Set<string>();
    for (const animal of this.animals) if (animal.parts.root.visible) ids.add(animal.species.id);
    return [...ids];
  }

  /** Posição atual de um bicho vivo, para o jogo poder reagir a ele. */
  positionOf(id: string): { x: number; y: number; z: number } | null {
    const animal = this.animals.find((item) => item.data.id === id);
    if (!animal) return null;
    const p = animal.parts.root.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /** O bicho desta espécie mais próximo de um ponto. */
  nearest(speciesId: string, x: number, z: number): { x: number; y: number; z: number } | null {
    let best: LiveAnimal | null = null;
    let bestDistance = Infinity;
    for (const animal of this.animals) {
      if (animal.species.id !== speciesId || !animal.parts.root.visible) continue;
      const distance = Math.hypot(animal.data.x - x, animal.data.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = animal;
      }
    }
    if (!best) return null;
    const p = best.parts.root.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Substitui toda a população. Chamado ao entrar numa região e ao mudar a hora. */
  populate(animals: readonly WildAnimal[]): void {
    this.clear();
    for (const data of animals) {
      const species = getSpecies(data.speciesId);
      if (!species) continue;
      const home = this.anchorFor(species);
      const parts = buildCreature(species, 0.9 + this.rng() * 0.3);
      // Começa dentro do habitat, não onde o sorteio puro mandou.
      const angle = this.rng() * TAU;
      const radius = Math.sqrt(this.rng()) * home.radius;
      const x = home.x + Math.cos(angle) * radius;
      const z = home.z + Math.sin(angle) * radius;
      const live: LiveAnimal = {
        data: { ...data, x, z },
        species,
        parts,
        phase: this.rng() * TAU,
        targetX: x,
        targetZ: z,
        homeX: home.x,
        homeZ: home.z,
        homeRadius: home.radius,
        facing: data.heading,
      };
      parts.root.position.set(x, this.restY(species, x, z), z);
      parts.root.rotation.y = live.facing;
      this.group.add(parts.root);
      this.animals.push(live);
      this.pickTarget(live);
    }
  }

  /** Onde um bicho desta espécie se sente em casa. */
  private anchorFor(species: Species): HabitatAnchor {
    const matching = this.options.anchors.filter((anchor) => species.habitats.includes(anchor.habitat));
    if (matching.length > 0) return matching[Math.floor(this.rng() * matching.length) % matching.length];
    // Sem âncora do habitat certo: fica no primeiro ponto declarado,
    // em vez de aparecer num lugar onde não faz sentido.
    return this.options.anchors[0] ?? { habitat: species.habitats[0] ?? 'jardim', x: 0, z: 0, radius: 40 };
  }

  /** Altura em que o bicho repousa: no chão, ou na lâmina d'água. */
  private restY(species: Species, x: number, z: number): number {
    const ground = this.options.groundY(x, z);
    if (species.movement === 'nada') return Math.max(ground + 0.1, this.options.waterLevel - species.size * 0.25);
    if (species.movement === 'voa') return Math.max(ground, this.options.waterLevel) + 1.6 + species.size * 2.2;
    if (species.movement === 'flutua') return Math.max(ground, this.options.waterLevel) + 1.2;
    return ground;
  }

  private pickTarget(animal: LiveAnimal): void {
    const angle = this.rng() * TAU;
    const radius = Math.sqrt(this.rng()) * animal.homeRadius;
    animal.targetX = animal.homeX + Math.cos(angle) * radius;
    animal.targetZ = animal.homeZ + Math.sin(angle) * radius;
  }

  setDetailScale(scale: number): void {
    this.detailScale = scale;
  }

  setViewDistance(distance: number): void {
    this.viewDistance = distance;
  }

  /**
   * @param playerX posição do jogador: bichos ariscos fogem dela.
   */
  update(dt: number, elapsed: number, playerX: number, playerZ: number, cameraPosition: THREE.Vector3): void {
    const reach = this.viewDistance * this.detailScale;
    for (const animal of this.animals) {
      const root = animal.parts.root;
      const visible = Math.hypot(root.position.x - cameraPosition.x, root.position.z - cameraPosition.z) < reach;
      root.visible = visible;
      // Bicho invisível ainda vive: só não gasta animação por quadro.
      this.step(animal, dt, playerX, playerZ);
      if (visible) this.animate(animal, elapsed);
    }
  }

  private step(animal: LiveAnimal, dt: number, playerX: number, playerZ: number): void {
    const data = animal.data;
    const species = animal.species;
    data.timer -= dt;

    // Fuga: quem é arisco não espera o relógio.
    const toPlayer = Math.hypot(playerX - data.x, playerZ - data.z);
    const flightRange = species.temperament === 'arisco' ? 11 : species.temperament === 'cauteloso' ? 7 : 0;
    if (flightRange > 0 && toPlayer < flightRange && data.state !== 'fugindo') {
      data.state = 'fugindo';
      data.timer = 1.5 + this.rng() * 1.5;
      const away = Math.atan2(data.z - playerZ, data.x - playerX);
      animal.targetX = data.x + Math.cos(away) * 22;
      animal.targetZ = data.z + Math.sin(away) * 22;
    }

    if (data.timer <= 0) {
      const roll = this.rng();
      if (data.state === 'fugindo') data.state = 'parado';
      else if (data.state === 'andando') data.state = roll < 0.45 ? 'parado' : 'descansando';
      else data.state = roll < 0.7 ? 'andando' : 'parado';
      const [min, max] = STATE_TIME[data.state];
      data.timer = min + this.rng() * (max - min);
      if (data.state === 'andando') this.pickTarget(animal);
    }

    const moving = data.state === 'andando' || data.state === 'fugindo';
    if (moving) {
      const dx = animal.targetX - data.x;
      const dz = animal.targetZ - data.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.6) {
        data.state = 'parado';
        data.timer = 1 + this.rng() * 3;
      } else {
        const speed = species.speed * (data.state === 'fugindo' ? 1.6 : 0.42);
        const vx = (dx / distance) * speed * dt;
        const vz = (dz / distance) * speed * dt;
        data.x += vx;
        data.z += vz;
        data.heading = Math.atan2(dx, dz);
      }
    }

    // Virada suave: um bicho não gira 180° num quadro.
    let delta = data.heading - animal.facing;
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    animal.facing += delta * Math.min(1, dt * 6);

    const root = animal.parts.root;
    root.position.x = data.x;
    root.position.z = data.z;
    root.rotation.y = animal.facing;
  }

  private animate(animal: LiveAnimal, elapsed: number): void {
    const { parts, species, data } = animal;
    const t = elapsed + animal.phase;
    const moving = data.state === 'andando' || data.state === 'fugindo';
    const baseY = this.restY(species, data.x, data.z);

    if (species.movement === 'voa') {
      // Bater de asas e deriva: nunca parado no ar.
      const flap = Math.sin(t * (species.id.includes('borboleta') ? 11 : 7)) * (species.id.includes('borboleta') ? 1.1 : 0.7);
      for (let i = 0; i < parts.wings.length; i += 1) {
        parts.wings[i].rotation.z = (i === 0 ? 1 : -1) * flap;
      }
      parts.root.position.y = baseY + Math.sin(t * 1.7) * 0.5;
      parts.root.rotation.z = Math.sin(t * 1.2) * 0.12;
      return;
    }

    if (species.movement === 'nada') {
      const sweep = Math.sin(t * (moving ? 6 : 2.2)) * 0.5;
      if (parts.tail) parts.tail.rotation.y = sweep;
      for (let i = 0; i < parts.legs.length; i += 1) parts.legs[i].rotation.x = sweep * 0.4;
      parts.root.position.y = baseY + Math.sin(t * 1.4) * 0.06;
      parts.root.rotation.z = Math.sin(t * 2.4) * 0.08;
      return;
    }

    if (species.movement === 'flutua') {
      parts.root.position.y = baseY + Math.sin(t * 0.9) * 0.4;
      parts.root.rotation.y += 0.004;
      for (let i = 0; i < parts.wings.length; i += 1) {
        const angle = t * 0.6 + (i / parts.wings.length) * TAU;
        const radius = species.size * 0.95;
        parts.wings[i].position.set(Math.cos(angle) * radius, Math.sin(t * 1.3 + i) * species.size * 0.4, Math.sin(angle) * radius);
      }
      return;
    }

    // Quadrúpedes.
    if (data.state === 'descansando') {
      // Deitado: corpo baixo, patas recolhidas, respiração.
      parts.root.position.y = baseY - species.size * 0.3;
      for (const leg of parts.legs) leg.rotation.x = 0.9;
      if (parts.head) parts.head.rotation.x = 0.35 + Math.sin(t * 1.1) * 0.03;
      if (parts.tail) parts.tail.rotation.y = Math.sin(t * 0.8) * 0.15;
      return;
    }

    if (species.movement === 'salta' && moving) {
      // Pulo: arco vertical e patas juntas no ar.
      const hop = Math.abs(Math.sin(t * 5.5));
      parts.root.position.y = baseY + hop * species.size * 1.5;
      for (let i = 0; i < parts.legs.length; i += 1) {
        parts.legs[i].rotation.x = -hop * 1.1 + (i < 2 ? 0.2 : -0.2);
      }
      parts.root.rotation.x = -hop * 0.22;
      if (parts.tail) parts.tail.rotation.x = -0.4 - hop * 0.3;
      return;
    }

    const stride = moving ? Math.sin(t * (6 + species.speed)) : 0;
    for (let i = 0; i < parts.legs.length; i += 1) {
      // Diagonais opostas em fase: é o que faz parecer andar.
      const sign = i === 0 || i === 3 ? 1 : -1;
      parts.legs[i].rotation.x = stride * sign * 0.55;
    }
    parts.root.position.y = baseY + (moving ? Math.abs(stride) * species.size * 0.08 : Math.sin(t * 1.4) * species.size * 0.02);
    parts.root.rotation.x = 0;
    if (parts.head) {
      // Parado, o bicho olha em volta; andando, olha para onde vai.
      parts.head.rotation.y = moving ? 0 : Math.sin(t * 0.7) * 0.5;
      parts.head.rotation.x = moving ? 0 : Math.sin(t * 0.45) * 0.15;
    }
    if (parts.tail) parts.tail.rotation.y = Math.sin(t * (moving ? 5 : 1.6)) * (moving ? 0.35 : 0.18);
  }

  clear(): void {
    for (const animal of this.animals) disposeCreature(animal.parts);
    this.animals.length = 0;
    this.group.clear();
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
