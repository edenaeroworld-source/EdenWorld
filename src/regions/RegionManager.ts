/**
 * Onde o jogador está, o que já descobriu e como viaja.
 *
 * O `RegionManager` é a fonte de verdade sobre a posição do jogador no
 * universo — região atual, posição dentro dela, regiões conhecidas. Não
 * desenha nada e não conhece Three.js: emite eventos, e quem cuida de
 * cenário escuta.
 *
 * Decisão importante: **descobrir uma região não é vencer uma fase**. A
 * descoberta é só a informação de que o lugar existe e de como chegar.
 * Nada aqui bloqueia, pontua ou exige pré-requisito.
 */

import { DEFAULT_REGION_ID, type WorldRegion, getRegion, initialRegions, isRegionId, routeBetween, travelTime } from './Region';

/** Posição do jogador dentro de uma região. */
export interface RegionPosition {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/** Estado persistido do sistema de regiões (vai para o salvamento). */
export interface RegionSaveData {
  /** Região em que o jogador está. */
  current: string;
  /** Regiões que o jogador já conhece. */
  discovered: string[];
  /** Última posição conhecida em cada região, para voltar onde parou. */
  positions: Record<string, RegionPosition>;
}

export interface TravelEvent {
  from: string;
  to: string;
  /** Trechos percorridos, incluindo origem e destino. */
  route: readonly string[];
  /** Duração sugerida da transição, em segundos. */
  duration: number;
  /** `true` quando a região foi descoberta nesta viagem. */
  discovered: boolean;
}

export type RegionListener = (event: TravelEvent) => void;
export type DiscoveryListener = (region: WorldRegion) => void;

export function emptyRegionData(): RegionSaveData {
  return { current: DEFAULT_REGION_ID, discovered: initialRegions(), positions: {} };
}

function sanitizePosition(raw: unknown): RegionPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const read = (key: string): number => (typeof value[key] === 'number' && Number.isFinite(value[key]) ? (value[key] as number) : 0);
  return { x: read('x'), y: read('y'), z: read('z'), heading: read('heading') };
}

/**
 * Lê o estado de regiões de um salvamento, descartando o que não faz
 * sentido. Salvamentos antigos (sem regiões) voltam ao padrão, e é por
 * isso que a migração Genesis → universo é segura.
 */
export function sanitizeRegionData(raw: unknown): RegionSaveData {
  const fallback = emptyRegionData();
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Record<string, unknown>;

  const discovered = new Set(initialRegions());
  if (Array.isArray(value.discovered)) {
    for (const id of value.discovered) if (isRegionId(id)) discovered.add(id);
  }

  // Uma região em que o jogador não está mais, ou que nunca existiu,
  // não pode prender o jogo: cai para Aurora City.
  const current = isRegionId(value.current) && discovered.has(value.current) ? value.current : DEFAULT_REGION_ID;

  const positions: Record<string, RegionPosition> = {};
  if (value.positions && typeof value.positions === 'object') {
    for (const [id, raw2] of Object.entries(value.positions as Record<string, unknown>)) {
      if (!isRegionId(id)) continue;
      const position = sanitizePosition(raw2);
      if (position) positions[id] = position;
    }
  }

  return { current, discovered: [...discovered], positions };
}

export class RegionManager {
  private currentId: string;
  private readonly discovered: Set<string>;
  private readonly positions = new Map<string, RegionPosition>();
  private readonly travelListeners = new Set<RegionListener>();
  private readonly discoveryListeners = new Set<DiscoveryListener>();
  /** Viagem em andamento: impede disparar duas ao mesmo tempo. */
  private travelling = false;

  constructor(data: RegionSaveData = emptyRegionData()) {
    this.currentId = data.current;
    this.discovered = new Set(data.discovered);
    for (const [id, position] of Object.entries(data.positions)) this.positions.set(id, position);
  }

  get current(): WorldRegion {
    // O construtor só aceita ids válidos (vindos do sanitize), então a
    // região sempre existe. O fallback é defesa contra engano futuro.
    return getRegion(this.currentId) ?? (getRegion(DEFAULT_REGION_ID) as WorldRegion);
  }

  get currentRegionId(): string {
    return this.currentId;
  }

  get isTravelling(): boolean {
    return this.travelling;
  }

  /** Ids descobertos, na ordem canônica das regiões. */
  knownRegions(): WorldRegion[] {
    return [...this.discovered].map((id) => getRegion(id)).filter((region): region is WorldRegion => Boolean(region));
  }

  knows(id: string): boolean {
    return this.discovered.has(id);
  }

  /**
   * Registra que o jogador ficou sabendo de uma região.
   *
   * Devolve `true` só na primeira vez — é o que o chamador usa para
   * decidir se mostra o aviso de descoberta.
   */
  discover(id: string): boolean {
    if (!isRegionId(id) || this.discovered.has(id)) return false;
    this.discovered.add(id);
    const region = getRegion(id);
    if (region) for (const listener of this.discoveryListeners) listener(region);
    return true;
  }

  /** Guarda onde o jogador estava, para quando voltar. */
  rememberPosition(position: RegionPosition, regionId = this.currentId): void {
    this.positions.set(regionId, { ...position });
  }

  /**
   * Onde o jogador deve aparecer ao entrar numa região: o ponto onde
   * ele parou, se já esteve lá, ou a chegada padrão.
   */
  entryPoint(regionId: string): RegionPosition {
    const saved = this.positions.get(regionId);
    if (saved) return { ...saved };
    const region = getRegion(regionId);
    if (!region) return { x: 0, y: 0, z: 0, heading: 0 };
    return { x: region.arrival.x, y: 0, z: region.arrival.z, heading: region.arrival.heading };
  }

  /** Por que uma viagem não pode acontecer agora, ou `null` se pode. */
  travelBlocker(toId: string): string | null {
    if (this.travelling) return 'Uma viagem já está em andamento.';
    if (!isRegionId(toId)) return 'Esse lugar não existe no Éden.';
    if (toId === this.currentId) return 'Você já está aqui.';
    if (!this.discovered.has(toId)) return 'Você ainda não sabe como chegar lá.';
    if (routeBetween(this.currentId, toId).length === 0) return 'Não há caminho conhecido até lá.';
    return null;
  }

  canTravelTo(toId: string): boolean {
    return this.travelBlocker(toId) === null;
  }

  /**
   * Viaja para outra região.
   *
   * Devolve o evento da viagem, ou `null` quando ela não é possível. A
   * posição atual é guardada antes de sair, então voltar traz o jogador
   * de volta ao lugar onde ele estava — não à entrada da cidade.
   */
  travelTo(toId: string, from?: RegionPosition): TravelEvent | null {
    if (!this.canTravelTo(toId)) return null;
    if (from) this.rememberPosition(from);

    const fromId = this.currentId;
    const event: TravelEvent = {
      from: fromId,
      to: toId,
      route: routeBetween(fromId, toId),
      duration: travelTime(fromId, toId),
      discovered: false,
    };

    this.travelling = true;
    this.currentId = toId;
    this.travelling = false;

    for (const listener of this.travelListeners) listener(event);
    return event;
  }

  onTravel(listener: RegionListener): () => void {
    this.travelListeners.add(listener);
    return () => this.travelListeners.delete(listener);
  }

  onDiscovery(listener: DiscoveryListener): () => void {
    this.discoveryListeners.add(listener);
    return () => this.discoveryListeners.delete(listener);
  }

  toJSON(): RegionSaveData {
    return {
      current: this.currentId,
      discovered: [...this.discovered],
      positions: Object.fromEntries([...this.positions].map(([id, position]) => [id, { ...position }])),
    };
  }
}
