import { AREAS } from '../cities/aurora-city/Layout';
import { archetypePersona } from '../characters/Personas';
import { clamp01, dampAngle, type Rng } from '../utils/math';
import type { DayPeriod } from '../world/WorldClock';
import type { CitizenProfile } from './CitizenData';
import { NpcLife } from './NpcLife';
import type { WalkNetwork } from './WalkNetwork';

/**
 * Simulação de um cidadão sobre a rede de caminhada.
 *
 * Esta camada é pura (sem Three.js): trata apenas de posição, direção,
 * rota e rotina. O `NpcSystem` cuida do avatar visual.
 */

export type CitizenActivity = 'andando' | 'parado' | 'conversando';

export interface CitizenSimOptions {
  /** Altura do terreno (m) usada para posicionar o avatar. */
  ground?: (x: number, z: number) => number;
}

/** Chance de parar para olhar a cidade ao chegar em um nó. */
const PAUSE_CHANCE = 0.22;
const PAUSE_MIN = 2.5;
const PAUSE_MAX = 9;
/** Distância (m) para considerar que chegou ao nó. */
const ARRIVE_EPSILON = 0.35;
/** Rapidez com que a pessoa se vira para quem puxou conversa. */
const TURN_RATE = 6;

export class CitizenSim {
  readonly profile: CitizenProfile;
  /** Expressão, gestos e atenção desta pessoa (sobrevive ao avatar). */
  readonly life: NpcLife;
  x = 0;
  z = 0;
  y = 0;
  heading = 0;
  /** Velocidade atual (m/s) — 0 quando parado. */
  speed = 0;
  /** Fase da passada, usada pela animação procedural. */
  stridePhase = 0;
  activity: CitizenActivity = 'andando';

  private node: number;
  private target: number;
  private route: number[] = [];
  private pauseTimer = 0;
  private talkTimer = 0;
  /** Direção que a pessoa está buscando enquanto conversa. */
  private facing: number | null = null;
  private goalArea: string | null = null;
  private repathTimer = 0;

  constructor(
    profile: CitizenProfile,
    private readonly network: WalkNetwork,
    startNode: number,
    private readonly rng: Rng,
    private readonly options: CitizenSimOptions = {},
  ) {
    this.profile = profile;
    this.life = new NpcLife(archetypePersona(profile.archetype.id), profile.seed);
    this.node = startNode;
    this.target = startNode;
    const node = network.node(startNode);
    this.x = node.x;
    this.z = node.z;
    this.y = options.ground?.(node.x, node.z) ?? 0;
    this.heading = this.rng() * Math.PI * 2;
    this.pickNextTarget();
  }

  /** Área (id) em que o cidadão está agora. */
  get areaId(): string | null {
    for (const area of AREAS) {
      if (Math.hypot(this.x - area.x, this.z - area.z) <= area.radius) return area.id;
    }
    return null;
  }

  /** Define o destino do cidadão conforme a rotina do arquétipo. */
  setRoutine(period: DayPeriod): void {
    const options = this.profile.archetype.routine[period];
    if (options.length === 0) return;
    const areaId = options[Math.min(options.length - 1, Math.floor(this.rng() * options.length))];
    if (areaId === this.goalArea) return;
    this.goalArea = areaId;
    const area = AREAS.find((candidate) => candidate.id === areaId);
    if (!area) return;
    const destination = this.network.randomNodeNear(this.rng, area.x, area.z, Math.max(20, area.radius * 0.8));
    const route = this.network.path(this.node, destination);
    if (route.length > 1) {
      route.shift();
      this.route = route;
      this.target = this.route.shift() as number;
    }
  }

  /**
   * Interrompe a caminhada para conversar.
   *
   * A pessoa não gira de uma vez: ela guarda a direção de quem chamou e
   * se vira em alguns décimos de segundo, como alguém que ouve o próprio
   * nome. Enquanto a conversa dura, ela continua acompanhando o ponto.
   */
  startTalking(lookAtX: number, lookAtZ: number, seconds = 6): void {
    this.activity = 'conversando';
    this.talkTimer = seconds;
    this.facing = Math.atan2(lookAtX - this.x, lookAtZ - this.z);
  }

  /** Atualiza o ponto que a pessoa encara sem reiniciar a conversa. */
  faceTowards(x: number, z: number): void {
    this.facing = Math.atan2(x - this.x, z - this.z);
  }

  /** Prolonga a conversa (o jogador continua lendo). */
  keepTalking(seconds: number): void {
    if (seconds > this.talkTimer) this.talkTimer = seconds;
    this.activity = 'conversando';
  }

  /** Encerra a conversa agora e devolve a pessoa à rotina. */
  stopTalking(): void {
    this.talkTimer = 0;
    this.facing = null;
    this.activity = 'andando';
  }

  private pickNextTarget(): void {
    const neighbors = this.network.neighbors(this.node);
    if (neighbors.length === 0) return;
    // Evita voltar por onde veio, quando houver alternativa.
    const candidates = neighbors.filter((id) => id !== this.target);
    const list = candidates.length > 0 ? candidates : neighbors;
    this.target = list[Math.min(list.length - 1, Math.floor(this.rng() * list.length))];
  }

  update(dt: number): void {
    if (this.talkTimer > 0) {
      this.talkTimer -= dt;
      this.speed = 0;
      if (this.facing !== null) this.heading = dampAngle(this.heading, this.facing, TURN_RATE, dt);
      if (this.talkTimer <= 0) {
        this.activity = 'andando';
        this.facing = null;
      }
      return;
    }
    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      this.speed = 0;
      this.activity = 'parado';
      // Parado de papo com alguém: a pessoa se vira para o outro.
      if (this.facing !== null) this.heading = dampAngle(this.heading, this.facing, TURN_RATE, dt);
      return;
    }

    this.activity = 'andando';
    const target = this.network.node(this.target);
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= ARRIVE_EPSILON) {
      this.node = this.target;
      if (this.route.length > 0) {
        this.target = this.route.shift() as number;
      } else {
        this.goalArea = null;
        this.facing = null;
        if (this.rng() < PAUSE_CHANCE) {
          this.pauseTimer = PAUSE_MIN + this.rng() * (PAUSE_MAX - PAUSE_MIN);
          this.speed = 0;
          return;
        }
        this.pickNextTarget();
      }
      return;
    }

    const speed = this.profile.speed;
    const step = Math.min(distance, speed * dt);
    const inverse = 1 / distance;
    this.x += dx * inverse * step;
    this.z += dz * inverse * step;
    this.speed = dt > 0 ? step / dt : 0;
    this.stridePhase += (step / 0.78) * Math.PI;
    this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 7, dt);
    this.y = this.options.ground?.(this.x, this.z) ?? this.y;

    // Replaneja de tempos em tempos se o destino ficou longe demais.
    this.repathTimer += dt;
    if (this.repathTimer > 20) {
      this.repathTimer = 0;
      if (this.route.length === 0) this.goalArea = null;
    }
  }

  /** Faz a pessoa parar onde está por alguns segundos (bate-papo). */
  pause(seconds: number): void {
    if (this.talkTimer > 0) return;
    this.pauseTimer = Math.max(this.pauseTimer, seconds);
    this.speed = 0;
    this.activity = 'parado';
  }

  /** `true` quando a pessoa está parada e livre para um bate-papo. */
  get idleHere(): boolean {
    return this.talkTimer <= 0 && this.activity !== 'andando';
  }

  /** Distância horizontal até um ponto. */
  distanceTo(x: number, z: number): number {
    return Math.hypot(this.x - x, this.z - z);
  }

  /** Peso de interesse para escolher quem ganha avatar visível (0–1). */
  visualPriority(x: number, z: number, range: number): number {
    return 1 - clamp01(this.distanceTo(x, z) / range);
  }
}
