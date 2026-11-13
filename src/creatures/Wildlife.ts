/**
 * Fauna selvagem: quem aparece, onde e quando.
 *
 * O princípio é que o bicho pertence ao lugar, não ao jogador. O que
 * este módulo decide é **onde cabe aparecer** e **quantos**, respeitando
 * o habitat, a hora e o orçamento de simulação do aparelho. Nada aqui
 * torna um animal selvagem adotável — isso é regra de `Species`, e é
 * checada de novo na adoção.
 *
 * O registro de avistamentos é o "guia de bichos" do jogador: a única
 * forma de colecionar fauna no Éden é tê-la visto.
 *
 * Módulo puro: sem Three.js, sem DOM.
 */

import { getRegion } from '../regions/Region';
import { type Species, getSpecies } from './Species';

/** Período do dia, igual ao do relógio do mundo. */
export type DayPeriod = 'madrugada' | 'manha' | 'tarde' | 'noite';

export function periodOfHour(hour: number): DayPeriod {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return 'madrugada';
  if (h < 12) return 'manha';
  if (h < 18) return 'tarde';
  return 'noite';
}

/**
 * Quantos bichos cabem em cena ao mesmo tempo, por nível de qualidade.
 *
 * Os números são conservadores de propósito: fauna é enfeite caro, e
 * num celular é a primeira coisa que deve ceder lugar aos moradores.
 */
export const WILDLIFE_BUDGET: Readonly<Record<string, number>> = Object.freeze({
  baixa: 4,
  media: 8,
  alta: 14,
  ultra: 20,
});

export function wildlifeBudget(quality: string): number {
  return WILDLIFE_BUDGET[quality] ?? WILDLIFE_BUDGET.media;
}

/** Uma espécie está ativa neste período? */
export function isActiveAt(species: Species, period: DayPeriod): boolean {
  const nocturnal = species.habitats.includes('noturno');
  if (nocturnal) return period === 'noite' || period === 'madrugada';
  // Diurnos somem de madrugada e rareiam à noite — mas não desaparecem.
  return period !== 'madrugada';
}

/** Espécies que podem aparecer numa região, a esta hora. */
export function spawnableIn(regionId: string, hour: number): Species[] {
  const region = getRegion(regionId);
  if (!region) return [];
  const period = periodOfHour(hour);
  return region.wildlife
    .map((id) => getSpecies(id))
    .filter((species): species is Species => Boolean(species))
    .filter((species) => isActiveAt(species, period));
}

/** Um animal em cena. */
export interface WildAnimal {
  id: string;
  speciesId: string;
  x: number;
  z: number;
  /** Para onde está indo. */
  heading: number;
  state: 'parado' | 'andando' | 'descansando' | 'fugindo';
  /** Quanto tempo falta no estado atual. */
  timer: number;
}

/**
 * Monta a população selvagem de uma região.
 *
 * Determinístico para uma dada semente: a mesma região, na mesma hora,
 * com a mesma semente, gera os mesmos bichos. Isso mantém o mundo
 * estável entre uma visita e outra sem precisar guardar nada.
 */
export function populateRegion(regionId: string, hour: number, budget: number, seed = 1): WildAnimal[] {
  const species = spawnableIn(regionId, hour);
  const region = getRegion(regionId);
  if (species.length === 0 || !region || budget <= 0) return [];

  // Gerador simples e estável — o mesmo estilo usado em `utils/math`.
  let state = Math.floor(Math.abs(seed)) * 7919 + 13;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const animals: WildAnimal[] = [];
  const count = Math.min(budget, species.length * 3);
  for (let i = 0; i < count; i += 1) {
    const kind = species[Math.floor(next() * species.length) % species.length];
    const angle = next() * Math.PI * 2;
    // Fauna fica longe do centro: o meio da região é onde está a gente.
    const radius = region.radius * (0.35 + next() * 0.55);
    animals.push({
      id: `wild-${regionId}-${i}`,
      speciesId: kind.id,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      heading: next() * Math.PI * 2,
      state: next() < 0.3 ? 'descansando' : 'parado',
      timer: 1 + next() * 4,
    });
  }
  return animals;
}

/**
 * A que distância o bicho se incomoda com a aproximação.
 *
 * Temperamento vira número aqui: o arisco foge cedo, o sociável deixa
 * chegar. É o que faz observar fauna parecer observar fauna.
 */
export function flightDistance(species: Species): number {
  switch (species.temperament) {
    case 'arisco':
      return 12;
    case 'cauteloso':
      return 8;
    case 'independente':
      return 5;
    case 'calmo':
      return 3;
    case 'sociavel':
      return 0;
    default:
      return 6;
  }
}

/* --------------------------- guia de bichos ---------------------------- */

export interface SightingSaveData {
  /** Espécies já avistadas, e quantas vezes. */
  seen: Record<string, number>;
}

export function emptySightingData(): SightingSaveData {
  return { seen: {} };
}

export function sanitizeSightingData(raw: unknown): SightingSaveData {
  if (!raw || typeof raw !== 'object') return emptySightingData();
  const value = raw as Record<string, unknown>;
  const seen: Record<string, number> = {};
  if (value.seen && typeof value.seen === 'object') {
    for (const [id, count] of Object.entries(value.seen as Record<string, unknown>)) {
      if (!getSpecies(id)) continue;
      if (typeof count === 'number' && count > 0) seen[id] = Math.floor(count);
    }
  }
  return { seen };
}

export class WildlifeGuide {
  private readonly seen = new Map<string, number>();

  constructor(data: SightingSaveData = emptySightingData()) {
    for (const [id, count] of Object.entries(data.seen)) this.seen.set(id, count);
  }

  /** Registra um avistamento. Devolve `true` na primeira vez da espécie. */
  sight(speciesId: string): boolean {
    if (!getSpecies(speciesId)) return false;
    const previous = this.seen.get(speciesId) ?? 0;
    this.seen.set(speciesId, previous + 1);
    return previous === 0;
  }

  hasSeen(speciesId: string): boolean {
    return (this.seen.get(speciesId) ?? 0) > 0;
  }

  timesSeen(speciesId: string): number {
    return this.seen.get(speciesId) ?? 0;
  }

  /** Quantas espécies diferentes já foram vistas. */
  get discovered(): number {
    return this.seen.size;
  }

  toJSON(): SightingSaveData {
    return { seen: Object.fromEntries(this.seen) };
  }
}
