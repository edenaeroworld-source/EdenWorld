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
import { Avatar, HALO_DEFAULT } from '../player/Avatar';
import type { AvatarAppearance } from '../player/AvatarAppearance';
import { type BodyProportions, proportionsFingerprint, proportionsFor } from '../player/body/BodyProportions';
import { type BodyShape, shapeFor } from '../player/body/BodyShape';

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
 * As proporções oficiais de um personagem.
 *
 * Saem do id, não de um sorteio: o mesmo id devolve sempre o mesmo
 * corpo, nesta sessão e na próxima, nesta região e na outra. É o que
 * permite dar a cada morador um porte próprio sem guardar nada no
 * save e sem que Suki-Chan mude de ombros ao atravessar um portal.
 */
export function officialProportions(id: string): BodyProportions | null {
  const character = BY_ID.get(id);
  if (!character) return null;
  return proportionsFor(id, character.appearance.height);
}

/**
 * A silhueta do modelo oficial.
 *
 * Quem não declara `shape` na ficha recebe `SHAPE_FEM`, cujos fatores
 * valem todos 1 — o corpo de referência do Éden, inalterado.
 */
export function officialShape(id: string): BodyShape | null {
  const character = BY_ID.get(id);
  if (!character) return null;
  return shapeFor(character.shape);
}

/**
 * Se o modelo oficial carrega o campo cósmico.
 *
 * Quem não declara `cosmic` na ficha recebe `false` — ou seja, todo
 * o Éden menos o Criador. A pergunta é feita pelo **id**, e é só
 * assim que o campo é concedido: não há caminho que o deduza da
 * aparência, e montar um avatar com a ficha dele à mão não o acende.
 */
export function officialCosmic(id: string): boolean {
  return BY_ID.get(id)?.cosmic === true;
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
    // As proporções entram na impressão digital: a partir do Marco N o
    // corpo também é identidade, e uma divergência de ombros entre
    // regiões é tão errada quanto uma divergência de cor de cabelo.
    proportionsFingerprint(proportionsFor(character.id, a.height)),
  ]
    .join('|')
    // A silhueta também é identidade: dois corpos com as mesmas
    // medidas e formas diferentes **não** são o mesmo corpo, e uma
    // impressão que não os distinguisse estaria mentindo.
    //
    // Entra como sufixo, e só para quem declara forma. É o mesmo
    // princípio do argumento-padrão em `bodyMetrics`: as dez deusas
    // não declaram nada e a impressão delas continua byte a byte a
    // que era antes de este eixo existir — o que é verificável com um
    // `git diff` neste arquivo, sem precisar rodar nada.
    .concat(character.shape ? `|forma:${character.shape}` : '');
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
 * (que já carrega a altura, e portanto a escala), proporções de corpo
 * derivadas do id, gestação de cânone e sombras. Quem chama não precisa saber a ordem — e, principalmente,
 * não pode esquecer um passo, que era como nasciam as diferenças
 * entre regiões.
 *
 * @returns `null` quando o id não é de um personagem oficial. O
 *   chamador decide o que fazer: não inventamos uma deusa.
 */
export function createOfficialAvatar(id: string, options: OfficialAvatarOptions = {}): Avatar | null {
  const character = BY_ID.get(id);
  if (!character) return null;
  const avatar = new Avatar(
    character.appearance,
    proportionsFor(character.id, character.appearance.height),
    shapeFor(character.shape),
    character.cosmic === true,
  );
  avatar.fill = options.fill ?? 0.16;
  // Gestação é identidade, não estado de jogo: entra antes de qualquer
  // Afters e vale sempre que a personagem estiver em cena. Amara é
  // Deusa da Maternidade em toda região, inclusive dentro de um prédio.
  avatar.setGestation(character.gestation ?? 0);
  // A auréola é dourada por omissão, e é assim que o Aérion continua
  // dourado sem precisar declarar nada.
  avatar.setHaloColor(character.halo ?? HALO_DEFAULT);
  avatar.setShadows(options.shadows ?? true);
  return avatar;
}
