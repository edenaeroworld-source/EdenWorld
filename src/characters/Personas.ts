/**
 * Jeito de cada pessoa — o que o corpo faz enquanto a boca fala.
 *
 * O texto de cada personagem já existe em `Pantheon.ts` e em
 * `CitizenData.ts`. Aqui fica a outra metade da personalidade: a
 * expressão de descanso, os gestos preferidos ao cumprimentar, os
 * gestos que pontuam a fala, o ritmo e o quanto a pessoa se mexe.
 *
 * É por isso que Suki-Chan ri enquanto conta uma ideia e Saturno
 * balança a cabeça devagar: mesmo sistema de animação, perfis
 * diferentes.
 *
 * Módulo puro: sem DOM, sem Three.js.
 */

import type { Expression } from '../player/Expressions';
import type { GestureId } from '../player/Gestures';

export interface Persona {
  /** Rosto quando a pessoa não está reagindo a nada. */
  rest: Expression;
  /** Expressão com que ela costuma receber alguém. */
  greetMood: Expression;
  /** Gestos de cumprimento (sorteados). */
  greet: readonly GestureId[];
  /** Gestos que pontuam uma fala longa (sorteados). */
  talk: readonly GestureId[];
  /** Gestos de ócio, quando ninguém está conversando. */
  idle: readonly GestureId[];
  /** Gesto de despedida. */
  farewell: GestureId;
  /**
   * Quanto a pessoa gesticula, de 0 a 1.
   *
   * Vira força do gesto e frequência: 0.3 é alguém contido, 0.95 é
   * alguém que fala com o corpo inteiro.
   */
  energy: number;
  /** Segundos médios entre gestos de ócio. */
  idleEvery: number;
}

/** Perfil de quem não tem perfil próprio. */
export const DEFAULT_PERSONA: Persona = Object.freeze<Persona>({
  rest: 'neutra',
  greetMood: 'feliz',
  greet: ['acenar', 'cumprimentar'],
  talk: ['falar', 'concordar'],
  idle: ['espreguicar', 'pensar'],
  farewell: 'despedir',
  energy: 0.6,
  idleEvery: 14,
});

function persona(values: Partial<Persona>): Persona {
  return Object.freeze({ ...DEFAULT_PERSONA, ...values });
}

/**
 * Panteão. Cada perfil segue o que o personagem já é no texto —
 * nenhum deles ganhou traço novo aqui.
 */
export const CHARACTER_PERSONAS: Readonly<Record<string, Persona>> = Object.freeze({
  // O criador recebe quem chega e pergunta mais do que responde.
  aerion: persona({
    rest: 'neutra',
    greetMood: 'feliz',
    greet: ['cumprimentar', 'acenar'],
    talk: ['falar', 'apontar', 'concordar'],
    idle: ['pensar', 'espreguicar'],
    energy: 0.52,
    idleEvery: 17,
  }),
  // Haru fala pouco e com cuidado; o "Hello Eden" dele é um aceno curto.
  haru: persona({
    rest: 'neutra',
    greetMood: 'curiosa',
    greet: ['acenar'],
    talk: ['falar', 'pensar'],
    idle: ['pensar'],
    farewell: 'acenar',
    energy: 0.34,
    idleEvery: 20,
  }),
  // Nexara explica sistemas: aponta muito, confirma muito.
  nexara: persona({
    rest: 'neutra',
    greetMood: 'curiosa',
    greet: ['cumprimentar'],
    talk: ['apontar', 'falar', 'concordar'],
    idle: ['pensar', 'apontar'],
    energy: 0.66,
    idleEvery: 13,
  }),
  // Suki-Chan vive em festa.
  suki: persona({
    rest: 'feliz',
    greetMood: 'animada',
    greet: ['acenar', 'aplaudir'],
    talk: ['rir', 'falar', 'surpresa'],
    idle: ['aplaudir', 'espreguicar'],
    energy: 0.95,
    idleEvery: 9,
  }),
  // Luma é luz e palco: gesto grande, sorriso fácil.
  luma: persona({
    rest: 'feliz',
    greetMood: 'animada',
    greet: ['cumprimentar', 'acenar'],
    talk: ['falar', 'rir', 'apontar'],
    idle: ['espreguicar', 'aplaudir'],
    energy: 0.86,
    idleEvery: 11,
  }),
  // Lilly cuida: acolhe com a cabeça, concorda, escuta.
  lilly: persona({
    rest: 'feliz',
    greetMood: 'feliz',
    greet: ['cumprimentar'],
    talk: ['concordar', 'falar'],
    idle: ['pensar'],
    energy: 0.5,
    idleEvery: 16,
  }),
  // Akemi-Chan é curiosidade pura: se surpreende com tudo.
  akemi: persona({
    rest: 'curiosa',
    greetMood: 'surpresa',
    greet: ['acenar', 'surpresa'],
    talk: ['surpresa', 'falar', 'rir'],
    idle: ['surpresa', 'espreguicar'],
    energy: 0.9,
    idleEvery: 10,
  }),
  // Saturno pesa cada palavra.
  saturno: persona({
    rest: 'pensativa',
    greetMood: 'neutra',
    greet: ['cumprimentar'],
    talk: ['pensar', 'falar'],
    idle: ['pensar'],
    energy: 0.4,
    idleEvery: 19,
  }),
  // Maze conduz, mostra caminho.
  maze: persona({
    rest: 'neutra',
    greetMood: 'feliz',
    greet: ['acenar', 'apontar'],
    talk: ['apontar', 'falar'],
    idle: ['apontar', 'espreguicar'],
    energy: 0.7,
    idleEvery: 12,
  }),
  // Júpiter é grande e ri alto.
  jupiter: persona({
    rest: 'feliz',
    greetMood: 'animada',
    greet: ['cumprimentar', 'aplaudir'],
    talk: ['rir', 'falar'],
    idle: ['espreguicar', 'rir'],
    energy: 0.88,
    idleEvery: 12,
  }),
  // Amara é serena. Nada de pressa — e a mão volta ao ventre sozinha.
  amara: persona({
    rest: 'neutra',
    greetMood: 'feliz',
    greet: ['cumprimentar'],
    talk: ['falar', 'acalentar', 'concordar'],
    idle: ['acalentar', 'pensar'],
    energy: 0.44,
    idleEvery: 14,
  }),
});

/** Habitantes comuns: o arquétipo define o jeito. */
export const ARCHETYPE_PERSONAS: Readonly<Record<string, Persona>> = Object.freeze({
  jardineiro: persona({ rest: 'feliz', greet: ['acenar'], talk: ['apontar', 'falar'], idle: ['pensar', 'espreguicar'], energy: 0.5, idleEvery: 15 }),
  estudante: persona({ rest: 'curiosa', greetMood: 'curiosa', greet: ['acenar'], talk: ['pensar', 'falar'], idle: ['pensar'], energy: 0.55, idleEvery: 13 }),
  musico: persona({ rest: 'feliz', greetMood: 'animada', greet: ['acenar', 'aplaudir'], talk: ['rir', 'falar'], idle: ['aplaudir', 'espreguicar'], energy: 0.9, idleEvery: 9 }),
  tecnica: persona({ rest: 'neutra', greet: ['cumprimentar'], talk: ['apontar', 'concordar'], idle: ['pensar'], energy: 0.48, idleEvery: 16 }),
  comerciante: persona({ rest: 'feliz', greet: ['cumprimentar', 'acenar'], talk: ['falar', 'apontar'], idle: ['espreguicar'], energy: 0.72, idleEvery: 11 }),
  atleta: persona({ rest: 'animada', greetMood: 'animada', greet: ['acenar'], talk: ['falar', 'concordar'], idle: ['espreguicar'], energy: 0.8, idleEvery: 10 }),
  artista: persona({ rest: 'curiosa', greetMood: 'animada', greet: ['acenar', 'surpresa'], talk: ['falar', 'surpresa', 'rir'], idle: ['pensar', 'espreguicar'], energy: 0.85, idleEvery: 10 }),
  cuidador: persona({ rest: 'feliz', greet: ['cumprimentar'], talk: ['concordar', 'falar'], idle: ['pensar'], energy: 0.46, idleEvery: 17 }),
  navegante: persona({ rest: 'neutra', greetMood: 'curiosa', greet: ['acenar'], talk: ['apontar', 'falar'], idle: ['apontar', 'pensar'], energy: 0.6, idleEvery: 14 }),
  viajante: persona({ rest: 'curiosa', greetMood: 'feliz', greet: ['acenar', 'cumprimentar'], talk: ['falar', 'surpresa'], idle: ['espreguicar', 'pensar'], energy: 0.68, idleEvery: 12 }),
});

/** Perfil de um personagem do panteão (ou o padrão). */
export function characterPersona(id: string): Persona {
  return CHARACTER_PERSONAS[id] ?? DEFAULT_PERSONA;
}

/** Perfil de um habitante, pelo arquétipo. */
export function archetypePersona(id: string): Persona {
  return ARCHETYPE_PERSONAS[id] ?? DEFAULT_PERSONA;
}
