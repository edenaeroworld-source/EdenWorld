/**
 * Acabamentos: o que torna cada prédio aquele prédio.
 *
 * A casca (`InteriorShell`) ergue piso, parede e teto a partir da
 * planta — igual para todo mundo. O acabamento é o que vem depois: os
 * móveis, a luz de vitrine, o aquário, o cheiro de pão. Sem ele, cinco
 * ambientes com cinco nomes seriam a mesma sala cinco vezes, que é
 * exatamente o que o jogo tinha.
 *
 * Um acabamento recebe o andar já construído e mobilia. Pode também
 * pedir gente: `ctx.people.push(...)` e o motor dá corpo a ela.
 *
 * Interiores **sem** acabamento continuam funcionando: a casca sobe e
 * a mobília genérica é derivada de `props`. Isso mantém a porta de um
 * ambiente novo jogável no mesmo dia em que ele é declarado — só não
 * conta como ambiente pronto.
 */

import type { InteriorDef, InteriorRoom } from '../Interior';
import type { InteriorBuild } from '../InteriorKit';
import type { PersonSpec } from '../InteriorPeople';
import { apartamentoAurora } from './ApartamentoAurora';
import { atelieAero } from './AtelieAero';
import { centroCivico } from './CentroCivico';
import { edenpawl } from './EdenPawl';
import { edenstore } from './EdenStore';
import { edentech } from './EdenTech';

export interface FitoutContext {
  /** O canteiro deste andar, já com a casca levantada. */
  b: InteriorBuild;
  interior: InteriorDef;
  floor: number;
  /** Gente a quem dar corpo depois. */
  people: PersonSpec[];
  /** Procura um cômodo pelo id. */
  room(id: string): InteriorRoom | undefined;
}

export type Fitout = (ctx: FitoutContext) => void;

const FITOUTS: Record<string, Fitout> = {
  'apartamento-aurora': apartamentoAurora,
  'atelie-aero': atelieAero,
  edentech,
  edenstore,
  edenpawl,
  'centro-civico': centroCivico,
};

export function getFitout(id: string | undefined): Fitout | null {
  if (!id) return null;
  return FITOUTS[id] ?? null;
}

/** Ids dos ambientes com acabamento próprio — os "construídos de verdade". */
export function furnishedInteriorIds(): string[] {
  return Object.keys(FITOUTS);
}
