import type { CharacterGround } from '../characters/CharacterGround';
import { AREAS, type NamedArea } from '../cities/aurora-city/Layout';
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
  /**
   * Chão e colisão do mundo montado.
   *
   * Com ele a pessoa pisa no estrado da praça e no tabuleiro da ponte,
   * e esbarra em árvore, banco e poste como o jogador esbarraria. Sem
   * ele a simulação continua funcionando em cima do relevo puro — é
   * assim que os testes da camada pura rodam, sem física.
   */
  body?: CharacterGround;
  /**
   * Lugares com nome da região, para onde as rotinas levam.
   *
   * Cada região tem a sua lista. Sem isto o sistema usava só a de
   * Aurora, e em Rosas Park nenhuma rotina pegava: os arquétipos
   * pedem 'praca' ou 'mirante', nomes que não existem lá, a busca
   * falhava e todo mundo passava o dia inteiro perambulando ao acaso.
   */
  areas?: readonly NamedArea[];
}

/** Chance de parar para olhar a cidade ao chegar em um nó. */
const PAUSE_CHANCE = 0.22;
const PAUSE_MIN = 2.5;
const PAUSE_MAX = 9;
/** Distância (m) para considerar que chegou ao nó. */
const ARRIVE_EPSILON = 0.35;
/** Distância mínima (m) de uma viagem: ninguém sai de casa para ir ao poste. */
const MIN_TRIP = 45;
/** Segundos empurrando contra algo antes de procurar outro caminho. */
const STUCK_SECONDS = 1.2;
/** Por quanto tempo um trecho descoberto bloqueado fica fora da rota. */
const AVOID_SECONDS = 12;
/** Por quanto tempo a pessoa mantém o lado escolhido para contornar. */
const SIDESTEP_SECONDS = 2.4;
/** Distâncias laterais (m) sondadas ao escolher por qual lado desviar. */
const SIDE_PROBES = [0.7, 1.4, 2.2, 3.2];
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
  /**
   * Nó de onde a pessoa veio.
   *
   * Existe para não desandar o caminho. Antes, a regra de "não voltar
   * por onde vim" comparava o vizinho com `this.target` — que, no
   * instante da escolha, já tinha acabado de virar o nó atual. O
   * filtro não removia nada, e a caminhada virava um passeio
   * aleatório: 120 a 190 m andados em dois minutos para terminar a 14
   * m do ponto de partida. De longe, parece gente andando no lugar.
   */
  private previous = -1;
  private route: number[] = [];
  private pauseTimer = 0;
  private talkTimer = 0;
  /** Direção que a pessoa está buscando enquanto conversa. */
  private facing: number | null = null;
  private goalArea: string | null = null;
  private repathTimer = 0;
  /** Nó de destino da viagem atual (-1 = sem destino). */
  private destination = -1;
  /** Há quanto tempo a pessoa não consegue avançar. */
  private stuckTimer = 0;
  /** Trechos que a pessoa descobriu estarem bloqueados, e por quanto tempo. */
  private readonly avoid = new Map<number, number>();
  /** Desvio lateral em curso ao contornar um obstáculo (-1, 0 ou 1). */
  private sidestep = 0;
  private sidestepTimer = 0;
  /** Empurrão de separação acumulado neste passo (evita grudar em alguém). */
  private pushX = 0;
  private pushZ = 0;

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
    this.y = this.groundAt(node.x, node.z, true);
    this.heading = this.rng() * Math.PI * 2;
    this.pickDestination();
  }

  /** Lugares com nome da região onde esta pessoa vive. */
  private get areas(): readonly NamedArea[] {
    return this.options.areas ?? AREAS;
  }

  /** Área (id) em que o cidadão está agora. */
  get areaId(): string | null {
    for (const area of this.areas) {
      if (Math.hypot(this.x - area.x, this.z - area.z) <= area.radius) return area.id;
    }
    return null;
  }

  /** Define o destino do cidadão conforme a rotina do arquétipo. */
  setRoutine(period: DayPeriod): void {
    const options = this.profile.archetype.routine[period] ?? [];
    const areas = this.areas;
    if (options.length === 0 || areas.length === 0) return;
    const wanted = options[Math.min(options.length - 1, Math.floor(this.rng() * options.length))];
    let area = areas.find((candidate) => candidate.id === wanted);
    if (!area) {
      // As rotinas dos arquétipos citam lugares de Aurora pelo nome.
      // Noutra região esses nomes não existem — mas o hábito existe:
      // quem passa a tarde no parque em Aurora passa a tarde num
      // lugar fixo de Rosas também. O sorteio é estável por pessoa e
      // por período, então o hábito dela não muda a cada dia.
      let hash = 2166136261;
      for (const text of [wanted, String(this.profile.seed)]) {
        for (let i = 0; i < text.length; i += 1) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
      }
      area = areas[(hash >>> 0) % areas.length];
    }
    // A comparação vem depois da tradução: guardar o nome pedido faria
    // o próximo dia ser descartado como repetido sem nunca ter saído.
    if (area.id === this.goalArea) return;
    this.goalArea = area.id;
    const destination = this.network.randomNodeNear(this.rng, area.x, area.z, Math.max(20, area.radius * 0.8));
    this.travelTo(destination);
  }

  /**
   * Traça rota até um nó e começa a andar.
   *
   * @returns `false` quando não há caminho (rede partida, destino
   *   isolado) — aí a pessoa continua com o que já estava fazendo.
   */
  private travelTo(destination: number): boolean {
    if (destination < 0 || destination === this.node) return false;
    const route = this.network.path(this.node, destination);
    if (route.length <= 1) return false;
    route.shift();
    this.route = route;
    this.destination = destination;
    this.target = this.route.shift() as number;
    return true;
  }

  /**
   * Escolhe um lugar para ir — de verdade, longe daqui.
   *
   * Uma pessoa que sorteia o vizinho seguinte a cada esquina não vai a
   * lugar nenhum: o passeio aleatório tem deslocamento médio
   * proporcional à raiz do número de passos, e ela passa a tarde
   * oscilando entre os mesmos dois cruzamentos. Quem mora numa cidade
   * sai de um ponto e chega a outro, e é isso que esta função faz:
   * sorteia um destino a dezenas de metros e deixa o A* resolver o
   * trajeto.
   */
  private pickDestination(): void {
    const size = this.network.size;
    if (size === 0) return;
    const here = this.network.node(this.node);
    // Até oito tentativas de achar um destino distante; depois aceita
    // qualquer um, para nunca ficar sem rumo.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = this.network.randomNode(this.rng);
      if (candidate === this.node) continue;
      const other = this.network.node(candidate);
      const far = Math.hypot(other.x - here.x, other.z - here.z) >= MIN_TRIP;
      if ((far || attempt >= 6) && this.travelTo(candidate)) return;
    }
    this.pickNextTarget();
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

  /** Próximo passo sem rota: um vizinho que não seja de onde eu vim. */
  private pickNextTarget(): void {
    const neighbors = this.network.neighbors(this.node);
    if (neighbors.length === 0) return;
    const candidates = neighbors.filter((id) => id !== this.previous && !this.isAvoided(id));
    const list = candidates.length > 0 ? candidates : neighbors;
    this.target = list[Math.min(list.length - 1, Math.floor(this.rng() * list.length))];
  }

  /** Chave estável para o trecho entre dois nós. */
  private edgeKey(a: number, b: number): number {
    return a < b ? a * 100003 + b : b * 100003 + a;
  }

  private isAvoided(target: number): boolean {
    const until = this.avoid.get(this.edgeKey(this.node, target));
    return until !== undefined && until > 0;
  }

  /**
   * Marca o trecho atual como intransitável e procura outro caminho.
   *
   * O bloqueio é temporário de propósito: o que atravancou pode ser
   * outra pessoa parada, e daqui a pouco ela sai.
   */
  private detour(): void {
    this.avoid.set(this.edgeKey(this.node, this.target), AVOID_SECONDS);
    this.route.length = 0;
    this.stuckTimer = 0;
    if (this.destination >= 0 && this.travelTo(this.destination)) return;
    this.pickNextTarget();
  }

  /** Altura do chão — a mesma do jogador quando há física montada. */
  private groundAt(x: number, z: number, settle = false): number {
    const body = this.options.body;
    if (body) return settle ? body.settle(x, z) : body.heightAt(x, z, this.y + 0.6);
    return this.options.ground?.(x, z) ?? this.y;
  }

  /**
   * Soma um empurrão de separação, aplicado no próximo passo.
   *
   * Chamado de fora (pelo `NpcSystem`), que é quem enxerga todo mundo
   * ao mesmo tempo e sabe quem está grudado em quem.
   */
  pushAway(dx: number, dz: number): void {
    this.pushX += dx;
    this.pushZ += dz;
  }

  /**
   * Consome o empurrão de separação acumulado.
   *
   * Precisa rodar em **todos** os ramos do quadro, inclusive parada e
   * conversa. O `NpcSystem` empurra quem está grudado a cada quadro;
   * se o ramo parado não gastasse esse empurrão, ele se somaria por
   * quatro segundos de papo e a pessoa sairia catapultada no instante
   * em que voltasse a andar. Como o empurrão também move, a altura
   * dos pés é relida aqui — era o outro jeito de ficar com um `y`
   * velho enquanto o corpo já estava noutro lugar.
   */
  private applyPush(): void {
    if (this.pushX === 0 && this.pushZ === 0) return;
    const point = { x: this.x + this.pushX, z: this.z + this.pushZ };
    this.pushX = 0;
    this.pushZ = 0;
    const body = this.options.body;
    if (body) body.resolve(point, this.y, body.radius);
    this.x = point.x;
    this.z = point.z;
    this.y = this.groundAt(this.x, this.z);
  }

  update(dt: number): void {
    if (this.talkTimer > 0) {
      this.talkTimer -= dt;
      this.speed = 0;
      this.applyPush();
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
      this.applyPush();
      // Parado de papo com alguém: a pessoa se vira para o outro.
      if (this.facing !== null) this.heading = dampAngle(this.heading, this.facing, TURN_RATE, dt);
      return;
    }

    this.activity = 'andando';
    this.expireAvoidance(dt);

    const target = this.network.node(this.target);
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= ARRIVE_EPSILON) {
      this.previous = this.node;
      this.node = this.target;
      this.stuckTimer = 0;
      this.sidestep = 0;
      if (this.route.length > 0) {
        this.target = this.route.shift() as number;
      } else {
        this.goalArea = null;
        this.facing = null;
        this.destination = -1;
        if (this.rng() < PAUSE_CHANCE) {
          this.pauseTimer = PAUSE_MIN + this.rng() * (PAUSE_MAX - PAUSE_MIN);
          this.speed = 0;
          this.applyPush();
          return;
        }
        // Chegou: escolhe outro canto da cidade, não o vizinho ao lado.
        this.pickDestination();
      }
      this.applyPush();
      return;
    }

    const speed = this.profile.speed;
    const want = Math.min(distance, speed * dt);
    const inverse = 1 / distance;
    let dirX = dx * inverse;
    let dirZ = dz * inverse;

    // Contorno: se há algo sólido logo à frente, a pessoa tenta passar
    // por um lado antes de desistir do trecho. É o desvio que alguém
    // faz ao ver um banco no meio da calçada — decidido **antes** do
    // passo, não depois de atravessá-lo.
    if (this.sidestepTimer > 0) this.sidestepTimer -= dt;
    else this.sidestep = 0;
    const body = this.options.body;
    if (body) {
      const look = Math.max(0.7, want * 3 + body.radius);
      if (body.segmentBlocked(this.x, this.z, this.x + dirX * look, this.z + dirZ * look, body.radius)) {
        const side = this.chooseSide(dirX, dirZ, look, body);
        // Mistura a direção do alvo com a tangente escolhida: a pessoa
        // sai de lado sem perder o rumo. Mesmo sem lado livre à vista
        // ela anda de lado — é o que alguém faz diante de um banco
        // comprido: segue rente a ele até o fim. Parar aqui seria o
        // oposto de contornar.
        const tangentX = -dirZ * side;
        const tangentZ = dirX * side;
        dirX = dirX * 0.2 + tangentX;
        dirZ = dirZ * 0.2 + tangentZ;
        const length = Math.hypot(dirX, dirZ) || 1;
        dirX /= length;
        dirZ /= length;
      }
    }

    let nextX = this.x + dirX * want + this.pushX;
    let nextZ = this.z + dirZ * want + this.pushZ;
    this.pushX = 0;
    this.pushZ = 0;

    if (body) {
      // Mesma rotina que segura o jogador: desliza ao longo do que
      // encosta, em vez de atravessar.
      const point = { x: nextX, z: nextZ };
      body.resolve(point, this.y, body.radius);
      nextX = point.x;
      nextZ = point.z;
    }

    const moved = Math.hypot(nextX - this.x, nextZ - this.z);
    this.x = nextX;
    this.z = nextZ;
    this.speed = dt > 0 ? moved / dt : 0;
    this.stridePhase += (moved / 0.78) * Math.PI;
    this.heading = dampAngle(this.heading, Math.atan2(dirX, dirZ), 7, dt);
    this.y = this.groundAt(this.x, this.z);

    // Travou mesmo assim (preso entre dois colisores, ou gente demais
    // no mesmo ponto): depois de alguns segundos, procura outro caminho.
    if (moved < want * 0.25) {
      this.stuckTimer += dt;
      if (this.stuckTimer > STUCK_SECONDS) this.detour();
    } else {
      this.stuckTimer = 0;
    }

    // Replaneja de tempos em tempos se o destino ficou longe demais.
    this.repathTimer += dt;
    if (this.repathTimer > 20) {
      this.repathTimer = 0;
      if (this.route.length === 0) this.goalArea = null;
    }
  }

  /** Envelhece os bloqueios temporários de trecho. */
  private expireAvoidance(dt: number): void {
    if (this.avoid.size === 0) return;
    for (const [key, left] of this.avoid) {
      const next = left - dt;
      if (next <= 0) this.avoid.delete(key);
      else this.avoid.set(key, next);
    }
  }

  /**
   * Por qual lado contornar: -1 (esquerda), 1 (direita) ou 0 (nenhum).
   *
   * Mantém o lado já escolhido por alguns segundos. Sem essa memória a
   * pessoa oscila entre os dois lados a cada quadro e fica tremendo na
   * frente do obstáculo.
   */
  private chooseSide(dirX: number, dirZ: number, look: number, body: CharacterGround): number {
    /** Quanto espaço livre há daquele lado, em metros varridos. */
    const room = (side: number): number => {
      const tangentX = -dirZ * side;
      const tangentZ = dirX * side;
      let reach = 0;
      for (const offset of SIDE_PROBES) {
        const probeX = this.x + tangentX * offset + dirX * look * 0.5;
        const probeZ = this.z + tangentZ * offset + dirZ * look * 0.5;
        if (body.blocked(probeX, probeZ, this.y, body.radius * 0.9)) break;
        reach = offset;
      }
      return reach;
    };
    // Mantém o lado já escolhido enquanto ele ainda levar a algum lugar:
    // sem essa memória a pessoa troca de lado a cada quadro e fica
    // tremendo na frente do obstáculo.
    if (this.sidestep !== 0 && room(this.sidestep) > 0) return this.sidestep;
    const left = room(-1);
    const right = room(1);
    const side = left === right ? (this.rng() < 0.5 ? -1 : 1) : left > right ? -1 : 1;
    this.sidestep = side;
    this.sidestepTimer = SIDESTEP_SECONDS;
    return side;
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
