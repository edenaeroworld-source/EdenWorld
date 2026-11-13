/**
 * Entrar e sair de interiores, carregando um de cada vez.
 *
 * O manager é deliberadamente burro quanto a geometria: ele não cria
 * malha nenhuma. O que ele garante é a parte que costuma dar errado —
 * que só um interior esteja carregado por vez, que a saída devolva o
 * jogador à porta certa, e que cada cena seja liberada ao sair.
 *
 * A camada de cenário registra um `InteriorLoader`; o manager chama
 * `load` ao entrar e `unload` ao sair. Em teste, o loader é um espião,
 * e é assim que se prova que nada vaza.
 */

import { type ExitPoint, type InteriorDef, getInterior } from './Interior';

/** Quem sabe montar e desmontar a cena de um interior. */
export interface InteriorLoader {
  load(interior: InteriorDef): void | Promise<void>;
  unload(interior: InteriorDef): void;
}

export interface InteriorVisit {
  interior: InteriorDef;
  /** Para onde o jogador volta ao sair. */
  exit: ExitPoint;
  /** Andar em que o jogador está. */
  floor: number;
}

export interface InteriorSaveData {
  /** Interiores em que o jogador já entrou pelo menos uma vez. */
  visited: string[];
}

export function emptyInteriorData(): InteriorSaveData {
  return { visited: [] };
}

export function sanitizeInteriorData(raw: unknown): InteriorSaveData {
  if (!raw || typeof raw !== 'object') return emptyInteriorData();
  const value = raw as Record<string, unknown>;
  const visited: string[] = [];
  if (Array.isArray(value.visited)) {
    for (const id of value.visited) {
      if (typeof id === 'string' && getInterior(id) && !visited.includes(id)) visited.push(id);
    }
  }
  return { visited };
}

export class InteriorManager {
  private visit: InteriorVisit | null = null;
  private readonly visited: Set<string>;
  private loader: InteriorLoader | null = null;

  constructor(data: InteriorSaveData = emptyInteriorData()) {
    this.visited = new Set(data.visited);
  }

  /** Liga a camada que realmente monta a cena. */
  setLoader(loader: InteriorLoader | null): void {
    this.loader = loader;
  }

  get current(): InteriorVisit | null {
    return this.visit;
  }

  get isInside(): boolean {
    return this.visit !== null;
  }

  hasVisited(id: string): boolean {
    return this.visited.has(id);
  }

  visitedCount(): number {
    return this.visited.size;
  }

  /**
   * Entra num interior.
   *
   * Se já houver um carregado, ele é liberado antes — nunca dois ao
   * mesmo tempo. Devolve `null` quando o interior não existe.
   */
  enter(interiorId: string, exit: ExitPoint): InteriorVisit | null {
    const interior = getInterior(interiorId);
    if (!interior) return null;
    if (this.visit) this.leave();

    this.visit = { interior, exit: { ...exit }, floor: 0 };
    this.visited.add(interior.id);
    void this.loader?.load(interior);
    return this.visit;
  }

  /** Sai. Devolve o ponto exterior a que o jogador deve voltar. */
  leave(): ExitPoint | null {
    if (!this.visit) return null;
    const { interior, exit } = this.visit;
    this.loader?.unload(interior);
    this.visit = null;
    return exit;
  }

  /** Muda de andar dentro do interior atual. */
  goToFloor(floor: number): boolean {
    if (!this.visit) return false;
    if (!Number.isInteger(floor) || floor < 0 || floor >= this.visit.interior.floors) return false;
    this.visit.floor = floor;
    return true;
  }

  /** Onde o jogador aparece ao entrar, em coordenadas locais. */
  spawnPoint(): { x: number; z: number; heading: number } | null {
    return this.visit ? { ...this.visit.interior.spawn } : null;
  }

  toJSON(): InteriorSaveData {
    return { visited: [...this.visited] };
  }
}
