/**
 * Adoção e cuidado de bichos.
 *
 * Uma decisão de projeto que vale explicar: as necessidades dos bichos
 * **não punem**. Elas descem devagar e mudam o humor, nunca a saúde —
 * um bicho que passou fome fica desanimado e volta ao normal quando
 * alguém cuida dele. Nenhum bicho morre, adoece ou é tirado do jogador
 * por descuido. Isto é um mundo para morar, não um relógio de culpa.
 *
 * O bicho acompanha o jogador entre regiões. Mudar de cidade nunca
 * perde um animal: a posse mora no salvamento, não no cenário.
 *
 * Módulo puro: sem Three.js, sem DOM.
 */

import { type Species, getSpecies, isAdoptable } from './Species';

/** As necessidades, todas de 0 a 1. 1 é "plenamente atendida". */
export interface PetNeeds {
  fome: number;
  diversao: number;
  higiene: number;
  carinho: number;
}

export type PetNeed = keyof PetNeeds;

export const PET_NEEDS: readonly PetNeed[] = Object.freeze(['fome', 'diversao', 'higiene', 'carinho']);

/** Quanto cada necessidade cai por minuto de jogo. Lento de propósito. */
const DECAY_PER_MINUTE: Record<PetNeed, number> = { fome: 0.012, diversao: 0.009, higiene: 0.005, carinho: 0.008 };

/** Abaixo disto o bicho demonstra que precisa de algo. */
export const NEED_LOW = 0.35;

/** Personalidade: muda o jeito, não o valor das necessidades. */
export type PetPersonality = 'brincalhao' | 'tranquilo' | 'curioso' | 'grudento' | 'independente';

export const PET_PERSONALITIES: readonly PetPersonality[] = Object.freeze(['brincalhao', 'tranquilo', 'curioso', 'grudento', 'independente']);

export interface Pet {
  id: string;
  speciesId: string;
  name: string;
  personality: PetPersonality;
  needs: PetNeeds;
  /** Quando foi adotado (ms reais). */
  adoptedAt: number;
  /** Região onde o bicho está. Segue o jogador por padrão. */
  regionId: string;
  /** `true` quando está acompanhando o jogador pelo mundo. */
  following: boolean;
  /** Casa onde o bicho fica quando não está acompanhando. */
  homeId: string | null;
  /** Acessórios colocados (ids de itens). */
  accessories: string[];
}

export interface PetSaveData {
  pets: Pet[];
  /** Quantos bichos o jogador já adotou, inclusive os liberados. */
  adoptedCount: number;
}

/** Limite de bichos acompanhando ao mesmo tempo. Mobile agradece. */
export const MAX_FOLLOWING = 2;

/** Limite total de bichos adotados. */
export const MAX_PETS = 8;

export function emptyPetData(): PetSaveData {
  return { pets: [], adoptedCount: 0 };
}

export function fullNeeds(): PetNeeds {
  return { fome: 1, diversao: 1, higiene: 1, carinho: 1 };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function sanitizeNeeds(raw: unknown): PetNeeds {
  const needs = fullNeeds();
  if (!raw || typeof raw !== 'object') return needs;
  const value = raw as Record<string, unknown>;
  for (const need of PET_NEEDS) {
    if (typeof value[need] === 'number') needs[need] = clamp01(value[need] as number);
  }
  return needs;
}

export function sanitizePetData(raw: unknown): PetSaveData {
  if (!raw || typeof raw !== 'object') return emptyPetData();
  const value = raw as Record<string, unknown>;
  const pets: Pet[] = [];

  if (Array.isArray(value.pets)) {
    for (const raw2 of value.pets) {
      if (!raw2 || typeof raw2 !== 'object') continue;
      const entry = raw2 as Record<string, unknown>;
      const speciesId = typeof entry.speciesId === 'string' ? entry.speciesId : '';
      // Espécie que saiu do registro não vira bicho fantasma.
      if (!getSpecies(speciesId)) continue;
      if (pets.length >= MAX_PETS) break;
      pets.push({
        id: typeof entry.id === 'string' && entry.id ? entry.id : `pet-${pets.length}`,
        speciesId,
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 24) : (getSpecies(speciesId)?.name ?? 'Bicho'),
        personality: PET_PERSONALITIES.includes(entry.personality as PetPersonality) ? (entry.personality as PetPersonality) : 'tranquilo',
        needs: sanitizeNeeds(entry.needs),
        adoptedAt: typeof entry.adoptedAt === 'number' ? entry.adoptedAt : 0,
        regionId: typeof entry.regionId === 'string' ? entry.regionId : 'aurora-city',
        following: entry.following === true,
        homeId: typeof entry.homeId === 'string' ? entry.homeId : null,
        accessories: Array.isArray(entry.accessories) ? entry.accessories.filter((a): a is string => typeof a === 'string').slice(0, 6) : [],
      });
    }
  }

  // Mais bichos seguindo do que o permitido: os excedentes ficam em casa.
  let following = 0;
  for (const pet of pets) {
    if (!pet.following) continue;
    following += 1;
    if (following > MAX_FOLLOWING) pet.following = false;
  }

  const adoptedCount = typeof value.adoptedCount === 'number' ? Math.max(pets.length, Math.floor(value.adoptedCount)) : pets.length;
  return { pets, adoptedCount };
}

export interface AdoptionResult {
  ok: boolean;
  pet?: Pet;
  message: string;
}

export class PetManager {
  private readonly pets: Pet[];
  private adoptedCount: number;
  private sequence = 0;

  constructor(data: PetSaveData = emptyPetData()) {
    this.pets = [...data.pets];
    this.adoptedCount = data.adoptedCount;
  }

  list(): readonly Pet[] {
    return this.pets;
  }

  get(id: string): Pet | undefined {
    return this.pets.find((pet) => pet.id === id);
  }

  get count(): number {
    return this.pets.length;
  }

  /** Bichos acompanhando o jogador agora. */
  following(): Pet[] {
    return this.pets.filter((pet) => pet.following);
  }

  /** Bichos presentes numa região (os que seguem estão sempre junto). */
  inRegion(regionId: string): Pet[] {
    return this.pets.filter((pet) => pet.following || pet.regionId === regionId);
  }

  /**
   * Adota um bicho.
   *
   * Só espécie doméstica: o que é selvagem continua selvagem, mesmo que
   * o jogador tenha passado meia hora ganhando a confiança dele.
   */
  adopt(speciesId: string, name: string, personality: PetPersonality = 'tranquilo', regionId = 'aurora-city', at: number = Date.now()): AdoptionResult {
    const species = getSpecies(speciesId);
    if (!species) return { ok: false, message: 'Essa espécie não existe no Éden.' };
    if (!isAdoptable(speciesId)) {
      return { ok: false, message: `${species.name} é um animal selvagem. Saturno pediria para você só observar.` };
    }
    if (this.pets.length >= MAX_PETS) return { ok: false, message: `Você já cuida de ${MAX_PETS} bichos. É bastante.` };

    const clean = name.trim().slice(0, 24) || species.name;
    this.sequence += 1;
    const pet: Pet = {
      id: `pet-${at.toString(36)}-${this.sequence}`,
      speciesId,
      name: clean,
      personality,
      needs: fullNeeds(),
      adoptedAt: at,
      regionId,
      following: this.following().length < MAX_FOLLOWING,
      homeId: null,
      accessories: [],
    };
    this.pets.push(pet);
    this.adoptedCount += 1;
    return { ok: true, pet, message: `${clean} agora é seu companheiro.` };
  }

  /** Troca o nome. O bicho não liga; você talvez sim. */
  rename(petId: string, name: string): boolean {
    const pet = this.get(petId);
    const clean = name.trim().slice(0, 24);
    if (!pet || !clean) return false;
    pet.name = clean;
    return true;
  }

  /** Põe ou tira o bicho do passeio. Respeita o limite de acompanhantes. */
  setFollowing(petId: string, following: boolean): boolean {
    const pet = this.get(petId);
    if (!pet) return false;
    if (following && !pet.following && this.following().length >= MAX_FOLLOWING) return false;
    pet.following = following;
    return true;
  }

  /** Registra em que região o bicho está (os que seguem vão junto). */
  moveTo(regionId: string): void {
    for (const pet of this.pets) if (pet.following) pet.regionId = regionId;
  }

  /** Deixa o bicho morando numa casa. Ele para de seguir. */
  sendHome(petId: string, homeId: string): boolean {
    const pet = this.get(petId);
    if (!pet) return false;
    pet.homeId = homeId;
    pet.following = false;
    return true;
  }

  /**
   * Passa o tempo: as necessidades caem devagar.
   *
   * Nada de ruim acontece quando chegam a zero — o bicho só demonstra
   * que quer atenção, e `mood()` passa a dizer isso.
   */
  tick(minutes: number): void {
    if (minutes <= 0) return;
    for (const pet of this.pets) {
      for (const need of PET_NEEDS) {
        pet.needs[need] = clamp01(pet.needs[need] - DECAY_PER_MINUTE[need] * minutes);
      }
    }
  }

  /** Atende uma necessidade. É o que comida, brinquedo e carinho fazem. */
  care(petId: string, need: PetNeed, amount: number): boolean {
    const pet = this.get(petId);
    if (!pet || amount <= 0) return false;
    pet.needs[need] = clamp01(pet.needs[need] + amount);
    // Cuidar de qualquer coisa agrada um pouco: ninguém fica indiferente
    // a receber atenção.
    if (need !== 'carinho') pet.needs.carinho = clamp01(pet.needs.carinho + amount * 0.15);
    return true;
  }

  /** Coloca um acessório (coleira, laço, plaquinha). */
  addAccessory(petId: string, itemId: string): boolean {
    const pet = this.get(petId);
    if (!pet || pet.accessories.includes(itemId) || pet.accessories.length >= 6) return false;
    pet.accessories.push(itemId);
    return true;
  }

  removeAccessory(petId: string, itemId: string): boolean {
    const pet = this.get(petId);
    if (!pet) return false;
    const index = pet.accessories.indexOf(itemId);
    if (index < 0) return false;
    pet.accessories.splice(index, 1);
    return true;
  }

  /** A necessidade mais baixa, quando está baixa o bastante para notar. */
  wants(petId: string): PetNeed | null {
    const pet = this.get(petId);
    if (!pet) return null;
    let lowest: PetNeed = 'fome';
    for (const need of PET_NEEDS) if (pet.needs[need] < pet.needs[lowest]) lowest = need;
    return pet.needs[lowest] < NEED_LOW ? lowest : null;
  }

  /**
   * Como o bicho está, em uma palavra.
   *
   * É a única consequência de não cuidar: o humor. Nunca a saúde.
   */
  mood(petId: string): 'feliz' | 'bem' | 'carente' | 'quieto' {
    const pet = this.get(petId);
    if (!pet) return 'bem';
    const average = PET_NEEDS.reduce((sum, need) => sum + pet.needs[need], 0) / PET_NEEDS.length;
    if (average > 0.8) return 'feliz';
    if (average > 0.55) return 'bem';
    if (average > 0.3) return 'carente';
    return 'quieto';
  }

  speciesOf(petId: string): Species | undefined {
    const pet = this.get(petId);
    return pet ? getSpecies(pet.speciesId) : undefined;
  }

  toJSON(): PetSaveData {
    return { pets: this.pets.map((pet) => ({ ...pet, needs: { ...pet.needs }, accessories: [...pet.accessories] })), adoptedCount: this.adoptedCount };
  }
}
