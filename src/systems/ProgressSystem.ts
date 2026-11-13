import type { ProgressData, PortalStateData } from './SaveSystem';

export interface ProgressTotals {
  crystals: number;
  entries: number;
  areas: number;
  portals: number;
}

/** Identificadores que existem no mundo desta versão do jogo. */
export interface KnownProgressIds {
  crystals: Iterable<string>;
  entries: Iterable<string>;
  areas: Iterable<string>;
  portals: Iterable<string>;
}

/** As quatro categorias de progresso de exploração. */
export type ProgressKind = 'crystals' | 'entries' | 'areas' | 'portals';

const KINDS: readonly ProgressKind[] = ['crystals', 'entries', 'areas', 'portals'];

/**
 * Os cinco estados de um portal, em ordem.
 *
 * O jogo inteiro lê esta escada — não existe "portal ligado" booleano
 * em lugar nenhum. Guardar só o último degrau era o que fazia o
 * jogador perder a ativação parcial ao viajar: a volta não sabia
 * distinguir "nunca vi" de "vi mas ainda não liguei".
 */
export type PortalPhase = 'desconhecido' | 'descoberto' | 'parcial' | 'ativado' | 'pronto';

const PHASE_ORDER: readonly PortalPhase[] = ['desconhecido', 'descoberto', 'parcial', 'ativado', 'pronto'];

export function portalPhaseRank(phase: PortalPhase): number {
  const index = PHASE_ORDER.indexOf(phase);
  return index < 0 ? 0 : index;
}

/** `true` quando o portal já conta como ativado (ativado ou pronto). */
export function portalPhaseUnlocked(phase: PortalPhase): boolean {
  return portalPhaseRank(phase) >= portalPhaseRank('ativado');
}

export interface PortalState {
  phase: PortalPhase;
  /** Carga da ativação parcial, 0–1. Chega a 1 quando o portal liga. */
  charge: number;
}

/**
 * De que região é cada identificador de progresso.
 *
 * Esta é a peça que separa "progresso global" de "progresso da
 * região". O mundo é um só, mas só uma região está montada por vez, e
 * a lista de ids que ela conhece é a lista dela — não a do universo.
 * Sem esta marcação, limpar ids desconhecidos ao carregar uma região
 * apagava o progresso de todas as outras.
 */
type OriginKey = string;

function originKey(kind: ProgressKind, id: string): OriginKey {
  return `${kind}:${id}`;
}

/**
 * Progresso de exploração do jogador: Cristais de Luz, registros do
 * diário, áreas visitadas e portais ativados. Mantém conjuntos para
 * consultas rápidas e exporta dados simples para o salvamento.
 *
 * **Os conjuntos são do universo inteiro; as contagens são da região
 * carregada.** Um cristal apanhado em Aurora continua apanhado quando
 * o jogador está em Rosas Park — ele só não entra no contador de
 * Rosas Park, porque o contador de Rosas Park fala do que há em Rosas
 * Park.
 */
export class ProgressSystem {
  private readonly crystals: Set<string>;
  private readonly entries: Set<string>;
  private readonly areas: Set<string>;
  private readonly portals: Set<string>;
  /** `kind:id` → id da região que conhece esse identificador. */
  private readonly origins = new Map<OriginKey, string>();
  private readonly portalStates = new Map<string, PortalState>();
  /** Região montada agora. Tudo que for descoberto é creditado a ela. */
  private regionId = '';
  wishes: number;
  photos: number;
  distance: number;
  playSeconds: number;
  sphereMode: number;
  totals: ProgressTotals = { crystals: 0, entries: 0, areas: 0, portals: 0 };

  constructor(data: ProgressData) {
    this.crystals = new Set(data.crystals);
    this.entries = new Set(data.entries);
    this.areas = new Set(data.areas);
    this.portals = new Set(data.portals);
    this.wishes = data.wishes;
    this.photos = data.photos;
    this.distance = data.distance;
    this.playSeconds = data.playSeconds;
    this.sphereMode = data.sphereMode;
    for (const [key, region] of Object.entries(data.origins ?? {})) {
      if (typeof region === 'string' && region) this.origins.set(key, region);
    }
    this.adoptPortalStates(data.portalStates);
  }

  /**
   * Reconstrói a escada de estados dos portais a partir do salvamento.
   *
   * Salvamento antigo não tem `portalStates`: quem está na lista de
   * ativados vira `pronto`, e é assim que ninguém perde um portal que
   * já tinha ligado. É a migração — nada é reinicializado.
   */
  private adoptPortalStates(raw: PortalStateData | undefined): void {
    for (const [id, state] of Object.entries(raw ?? {})) {
      const phase = PHASE_ORDER.includes(state?.phase as PortalPhase) ? (state.phase as PortalPhase) : 'desconhecido';
      const charge = typeof state?.charge === 'number' && Number.isFinite(state.charge) ? Math.min(1, Math.max(0, state.charge)) : 0;
      this.portalStates.set(id, { phase, charge });
    }
    // O conjunto `portals` é a verdade histórica sobre o que está
    // ativado. Quem está nele e não tem estado veio de um salvamento
    // anterior a esta versão.
    for (const id of this.portals) {
      const existing = this.portalStates.get(id);
      if (!existing || !portalPhaseUnlocked(existing.phase)) this.portalStates.set(id, { phase: 'pronto', charge: 1 });
    }
    // E quem tem estado de ativado precisa estar no conjunto.
    for (const [id, state] of this.portalStates) if (portalPhaseUnlocked(state.phase)) this.portals.add(id);
  }

  /**
   * Diz qual região está montada.
   *
   * Chamado pela transição de região antes de qualquer leitura de
   * contador, para que o HUD fale da cidade que o jogador está vendo.
   */
  setRegion(regionId: string): void {
    this.regionId = regionId;
  }

  get region(): string {
    return this.regionId;
  }

  private tag(kind: ProgressKind, id: string): void {
    if (this.regionId) this.origins.set(originKey(kind, id), this.regionId);
  }

  private setOf(kind: ProgressKind): Set<string> {
    if (kind === 'crystals') return this.crystals;
    if (kind === 'entries') return this.entries;
    if (kind === 'areas') return this.areas;
    return this.portals;
  }

  /**
   * Descarta registros que não existem **nesta região** (salvamento
   * editado à mão ou vindo de outra versão), para que as contagens
   * nunca passem do total.
   *
   * O que é de outra região fica intocado. Era exatamente aqui que o
   * universo se perdia: a lista de ids conhecidos é sempre a da cidade
   * montada, e apagar tudo que não estava nela significava apagar
   * Aurora inteira ao pôr o pé em Rosas Park.
   */
  retainKnown(known: KnownProgressIds, regionId: string = this.regionId): void {
    for (const kind of KINDS) {
      const valid = new Set(known[kind]);
      // Carregar a região é também aprender de quem são estes ids.
      if (regionId) for (const id of valid) this.origins.set(originKey(kind, id), regionId);
      if (!regionId) continue;
      const set = this.setOf(kind);
      for (const id of set) {
        if (valid.has(id)) continue;
        // Só se sabe que um id é lixo quando se sabe que ele deveria
        // estar nesta região e não está.
        if (this.origins.get(originKey(kind, id)) === regionId) set.delete(id);
      }
    }
    for (const id of [...this.portalStates.keys()]) {
      if (this.origins.get(originKey('portals', id)) === regionId && !new Set(known.portals).has(id)) this.portalStates.delete(id);
    }
  }

  /** Quantos ids desta categoria pertencem à região carregada. */
  private countIn(kind: ProgressKind): number {
    const set = this.setOf(kind);
    if (!this.regionId) return set.size;
    let total = 0;
    for (const id of set) if (this.origins.get(originKey(kind, id)) === this.regionId) total += 1;
    return total;
  }

  hasCrystal(id: string): boolean {
    return this.crystals.has(id);
  }

  hasEntry(id: string): boolean {
    return this.entries.has(id);
  }

  hasArea(id: string): boolean {
    return this.areas.has(id);
  }

  hasPortal(id: string): boolean {
    return this.portals.has(id);
  }

  /** Cada método devolve `true` apenas na primeira vez (descoberta nova). */
  collectCrystal(id: string): boolean {
    this.tag('crystals', id);
    if (this.crystals.has(id)) return false;
    this.crystals.add(id);
    return true;
  }

  readEntry(id: string): boolean {
    this.tag('entries', id);
    if (this.entries.has(id)) return false;
    this.entries.add(id);
    return true;
  }

  visitArea(id: string): boolean {
    this.tag('areas', id);
    if (this.areas.has(id)) return false;
    this.areas.add(id);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Portais                                                             */
  /* ------------------------------------------------------------------ */

  portalState(id: string): PortalState {
    return this.portalStates.get(id) ?? { phase: 'desconhecido', charge: 0 };
  }

  portalPhase(id: string): PortalPhase {
    return this.portalState(id).phase;
  }

  /**
   * Leva um portal para um degrau da escada — nunca para trás.
   *
   * Devolve `true` quando o estado mudou de verdade. Avançar é
   * monotônico de propósito: uma viagem, um recarregamento ou uma
   * revalidação não podem rebaixar o que o jogador já conquistou.
   */
  advancePortal(id: string, phase: PortalPhase, charge?: number): boolean {
    this.tag('portals', id);
    const current = this.portalState(id);
    const next = portalPhaseRank(phase) > portalPhaseRank(current.phase) ? phase : current.phase;
    const nextCharge = Math.min(1, Math.max(current.charge, charge ?? (portalPhaseUnlocked(next) ? 1 : current.charge)));
    const changed = next !== current.phase || nextCharge !== current.charge;
    this.portalStates.set(id, { phase: next, charge: nextCharge });
    if (portalPhaseUnlocked(next)) this.portals.add(id);
    return changed;
  }

  /** O jogador viu o portal pela primeira vez. */
  discoverPortal(id: string): boolean {
    return this.advancePortal(id, 'descoberto');
  }

  /** Ativação parcial: o portal acendeu, mas ainda não liga a lugar nenhum. */
  chargePortal(id: string, charge: number): boolean {
    const clamped = Math.min(1, Math.max(0, charge));
    if (clamped >= 1) return this.advancePortal(id, 'ativado', 1);
    return this.advancePortal(id, 'parcial', clamped);
  }

  unlockPortal(id: string): boolean {
    this.tag('portals', id);
    const first = !this.portals.has(id);
    this.portals.add(id);
    this.advancePortal(id, 'ativado', 1);
    return first;
  }

  /**
   * Recalcula quais portais já estão prontos para viajar.
   *
   * Um portal ativado sozinho não leva a lugar nenhum: a rede precisa
   * de pelo menos dois. Esta é a única regra que o estado salvo não
   * decide sozinho, então é recalculada ao validar a região.
   */
  refreshPortalReadiness(): void {
    const unlocked = [...this.portalStates].filter(([, state]) => portalPhaseUnlocked(state.phase));
    if (unlocked.length < 2) return;
    for (const [id] of unlocked) this.advancePortal(id, 'pronto', 1);
  }

  /** Portais que o jogador pode usar para viajar agora. */
  travelReady(id: string): boolean {
    return this.portalState(id).phase === 'pronto';
  }

  /* ------------------------------------------------------------------ */
  /* Contagens                                                           */
  /* ------------------------------------------------------------------ */

  get crystalCount(): number {
    return this.countIn('crystals');
  }

  get entryCount(): number {
    return this.countIn('entries');
  }

  get areaCount(): number {
    return this.countIn('areas');
  }

  get portalCount(): number {
    return this.countIn('portals');
  }

  /** Contagens do universo inteiro, para as telas que falam do todo. */
  get universeCrystalCount(): number {
    return this.crystals.size;
  }

  get universeEntryCount(): number {
    return this.entries.size;
  }

  get universeAreaCount(): number {
    return this.areas.size;
  }

  get universePortalCount(): number {
    return this.portals.size;
  }

  get entryIds(): readonly string[] {
    return [...this.entries];
  }

  /** Percentual geral de exploração (0–100), ponderando as quatro categorias. */
  get completion(): number {
    const t = this.totals;
    const parts: number[] = [];
    if (t.crystals > 0) parts.push(Math.min(1, this.crystalCount / t.crystals));
    if (t.entries > 0) parts.push(Math.min(1, this.entryCount / t.entries));
    if (t.areas > 0) parts.push(Math.min(1, this.areaCount / t.areas));
    if (t.portals > 0) parts.push(Math.min(1, this.portalCount / t.portals));
    if (parts.length === 0) return 0;
    return Math.round((parts.reduce((sum, value) => sum + value, 0) / parts.length) * 100);
  }

  toData(): ProgressData {
    const portalStates: PortalStateData = {};
    for (const [id, state] of this.portalStates) portalStates[id] = { phase: state.phase, charge: Math.round(state.charge * 1000) / 1000 };
    return {
      crystals: [...this.crystals],
      entries: [...this.entries],
      areas: [...this.areas],
      portals: [...this.portals],
      wishes: this.wishes,
      photos: this.photos,
      distance: Math.round(this.distance * 10) / 10,
      playSeconds: Math.round(this.playSeconds),
      sphereMode: this.sphereMode,
      origins: Object.fromEntries(this.origins),
      portalStates,
    };
  }
}
