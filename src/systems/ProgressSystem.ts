import type { ProgressData } from './SaveSystem';

export interface ProgressTotals {
  crystals: number;
  entries: number;
  areas: number;
  portals: number;
}

/**
 * Progresso de exploração do jogador: Cristais de Luz, registros do
 * diário, áreas visitadas e portais ativados. Mantém conjuntos para
 * consultas rápidas e exporta dados simples para o salvamento.
 */
export class ProgressSystem {
  private readonly crystals: Set<string>;
  private readonly entries: Set<string>;
  private readonly areas: Set<string>;
  private readonly portals: Set<string>;
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
    if (this.crystals.has(id)) return false;
    this.crystals.add(id);
    return true;
  }

  readEntry(id: string): boolean {
    if (this.entries.has(id)) return false;
    this.entries.add(id);
    return true;
  }

  visitArea(id: string): boolean {
    if (this.areas.has(id)) return false;
    this.areas.add(id);
    return true;
  }

  unlockPortal(id: string): boolean {
    if (this.portals.has(id)) return false;
    this.portals.add(id);
    return true;
  }

  get crystalCount(): number {
    return this.crystals.size;
  }

  get entryCount(): number {
    return this.entries.size;
  }

  get areaCount(): number {
    return this.areas.size;
  }

  get portalCount(): number {
    return this.portals.size;
  }

  get entryIds(): readonly string[] {
    return [...this.entries];
  }

  /** Percentual geral de exploração (0–100), ponderando as quatro categorias. */
  get completion(): number {
    const t = this.totals;
    const parts: number[] = [];
    if (t.crystals > 0) parts.push(Math.min(1, this.crystals.size / t.crystals));
    if (t.entries > 0) parts.push(Math.min(1, this.entries.size / t.entries));
    if (t.areas > 0) parts.push(Math.min(1, this.areas.size / t.areas));
    if (t.portals > 0) parts.push(Math.min(1, this.portals.size / t.portals));
    if (parts.length === 0) return 0;
    return Math.round((parts.reduce((sum, value) => sum + value, 0) / parts.length) * 100);
  }

  toData(): ProgressData {
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
    };
  }
}
