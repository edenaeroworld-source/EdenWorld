/**
 * Os modelos oficiais do panteão — um por personagem, em todo o Éden.
 *
 * Saturno tinha dois corpos. Ao ar livre, em Aurora City, ela era um
 * `Avatar` completo: rosto com morfologia, rig de doze juntas, roupa,
 * acessório, gestos. Atrás do balcão da Casa EdenPawl ela era uma
 * figura de oito caixas do `InteriorPeople` — a aproximação barata que
 * serve para um atendente anônimo e não para uma deusa. Quem entrava
 * na loja via outra pessoa.
 *
 * O problema não era a figura simples: era não existir **um** lugar
 * que respondesse "como é o corpo oficial deste personagem". Cada
 * sistema respondia por conta própria, e as respostas divergiam.
 *
 * Este módulo é essa resposta única. Quem precisa mostrar um membro do
 * panteão — o `NpcSystem` ao ar livre, em Aurora ou em Rosas, e o
 * `InteriorScene` dentro dos prédios — pede o avatar aqui e recebe o
 * mesmo modelo, com a mesma aparência, a mesma escala, a mesma
 * gestação de cânone e a mesma configuração de Afters.
 *
 * Não há "versão de Rosas" de ninguém. Há o personagem.
 */

import { PANTHEON, type EdenCharacter } from './Pantheon';
import { Avatar } from '../player/Avatar';
import type { AvatarAppearance } from '../player/AvatarAppearance';

/** Índice por id, montado uma vez. */
const BY_ID = new Map<string, EdenCharacter>(PANTHEON.map((character) => [character.id, character]));

/** Ids oficiais, na ordem do cânone. */
export const OFFICIAL_IDS: readonly string[] = Object.freeze(PANTHEON.map((character) => character.id));

/** O personagem oficial com este id, ou `null` se não for do panteão. */
export function officialCharacter(id: string): EdenCharacter | null {
  return BY_ID.get(id) ?? null;
}

/** `true` quando o id é de um personagem oficial. */
export function isOfficialCharacter(id: string): boolean {
  return BY_ID.has(id);
}

/** A aparência oficial — a mesma referência em qualquer região. */
export function officialAppearance(id: string): AvatarAppearance | null {
  return BY_ID.get(id)?.appearance ?? null;
}

/**
 * Impressão digital do modelo oficial.
 *
 * Serve para provar, em teste, que o que aparece em Rosas Park é o
 * mesmo corpo que aparece em Aurora City — aparência, escala e
 * gestação, item a item. Se qualquer sistema reconstruir o personagem
 * por conta própria, a impressão muda.
 */
export function officialFingerprint(id: string): string | null {
  const character = BY_ID.get(id);
  if (!character) return null;
  const a = character.appearance;
  const afters = character.afters;
  return [
    character.id,
    a.skin,
    a.hairStyle,
    a.hairColor,
    a.eyeColor,
    a.outfit,
    a.topColor,
    a.bottomColor,
    a.shoeColor,
    a.accessory,
    a.height.toFixed(4),
    (character.gestation ?? 0).toFixed(4),
    afters ? `${afters.bust.toFixed(3)}/${afters.curve.toFixed(3)}/${afters.bustActive}/${afters.curveActive}` : 'sem-afters',
  ].join('|');
}

export interface OfficialAvatarOptions {
  /** Luz de preenchimento. Divindades usam um pouco mais que os habitantes. */
  fill?: number;
  shadows?: boolean;
}

/**
 * Constrói o avatar oficial de um personagem do panteão.
 *
 * Toda a identidade visual é aplicada aqui, de uma vez: aparência
 * (que já carrega a altura, e portanto a escala), gestação de cânone e
 * sombras. Quem chama não precisa saber a ordem — e, principalmente,
 * não pode esquecer um passo, que era como nasciam as diferenças
 * entre regiões.
 *
 * @returns `null` quando o id não é de um personagem oficial. O
 *   chamador decide o que fazer: não inventamos uma deusa.
 */
export function createOfficialAvatar(id: string, options: OfficialAvatarOptions = {}): Avatar | null {
  const character = BY_ID.get(id);
  if (!character) return null;
  const avatar = new Avatar(character.appearance);
  avatar.fill = options.fill ?? 0.16;
  // Gestação é identidade, não estado de jogo: entra antes de qualquer
  // Afters e vale sempre que a personagem estiver em cena. Amara é
  // Deusa da Maternidade em toda região, inclusive dentro de um prédio.
  avatar.setGestation(character.gestation ?? 0);
  avatar.setShadows(options.shadows ?? true);
  return avatar;
}
