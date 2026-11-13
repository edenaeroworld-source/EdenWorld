/**
 * Registro de espécies do Éden.
 *
 * Aberto de propósito: `registerSpecies` deixa qualquer sistema — ou
 * qualquer expansão futura — acrescentar bicho sem editar este arquivo.
 * Nada aqui é uma lista fechada.
 *
 * Três famílias convivem no mesmo registro, separadas por `kind`:
 * `domestico` (pode ser adotado), `selvagem` (vive solto e **não** vira
 * bicho de estimação) e `eden` (as criaturas originais do Éden, que são
 * selvagens com regras próprias).
 *
 * Módulo puro: dados e consultas.
 */

/** Como a espécie se relaciona com as pessoas. */
export type SpeciesKind = 'domestico' | 'selvagem' | 'eden';

/** Onde a espécie vive. Usado para decidir onde ela aparece. */
export type Habitat = 'urbano' | 'jardim' | 'floresta' | 'agua' | 'ar' | 'pedra' | 'noturno';

/** Como o bicho se comporta perto de gente. */
export type Temperament =
  /** Chega perto sozinho. */
  | 'sociavel'
  /** Deixa chegar, mas não procura. */
  | 'calmo'
  /** Foge se você se aproximar demais. */
  | 'arisco'
  /** Observa de longe e decide. */
  | 'cauteloso'
  /** Não liga para gente nenhuma. */
  | 'independente';

/** Como se move — alimenta a animação e o passo da IA. */
export type Movement = 'anda' | 'salta' | 'voa' | 'nada' | 'rasteja' | 'flutua';

export interface Species {
  id: string;
  name: string;
  /** Plural, para textos de avistamento ("três capivaras"). */
  plural: string;
  kind: SpeciesKind;
  habitats: readonly Habitat[];
  temperament: Temperament;
  movement: Movement;
  /** Velocidade de passeio, em metros por segundo. */
  speed: number;
  /** Tamanho aproximado, em metros (altura no lombo ou envergadura). */
  size: number;
  /** O que come. `null` para quem não precisa, como as criaturas de luz. */
  diet: 'carnivoro' | 'herbivoro' | 'onivoro' | 'granivoro' | 'nectar' | null;
  /** Cores de identidade, para a camada visual e para os ícones. */
  colors: readonly [string, string];
  /** `true` quando emite luz própria (as criaturas do Éden). */
  glows: boolean;
  /** O que o jogador pode fazer com este bicho. */
  interactions: readonly ('observar' | 'alimentar' | 'acariciar' | 'brincar' | 'passear' | 'fotografar' | 'cuidar')[];
  /** Nota curta para o guia de bichos. */
  note: string;
  /** Som ambiente, quando houver clipe disponível. */
  sound?: string;
}

const SPECIES: Species[] = [
  // ------------------------------ domésticos ---------------------------
  { id: 'gato', name: 'Gato', plural: 'gatos', kind: 'domestico', habitats: ['urbano'], temperament: 'independente', movement: 'anda', speed: 2.4, size: 0.3, diet: 'carnivoro', colors: ['#f0d5b8', '#8a6342'], glows: false, interactions: ['observar', 'alimentar', 'acariciar', 'brincar', 'fotografar', 'cuidar'], note: 'Decide sozinho quando gosta de você. Costuma gostar.' },
  { id: 'cachorro', name: 'Cachorro', plural: 'cachorros', kind: 'domestico', habitats: ['urbano', 'jardim'], temperament: 'sociavel', movement: 'anda', speed: 3.4, size: 0.5, diet: 'onivoro', colors: ['#e8c48f', '#9a6b33'], glows: false, interactions: ['observar', 'alimentar', 'acariciar', 'brincar', 'passear', 'fotografar', 'cuidar'], note: 'Já estava feliz antes de você chegar. Agora está mais.' },
  { id: 'coelho', name: 'Coelho', plural: 'coelhos', kind: 'domestico', habitats: ['jardim'], temperament: 'arisco', movement: 'salta', speed: 2.8, size: 0.22, diet: 'herbivoro', colors: ['#f6efe4', '#c9b79a'], glows: false, interactions: ['observar', 'alimentar', 'acariciar', 'fotografar', 'cuidar'], note: 'Para completamente e depois dispara. Sem aviso.' },
  { id: 'hamster', name: 'Hamster', plural: 'hamsters', kind: 'domestico', habitats: ['urbano'], temperament: 'calmo', movement: 'anda', speed: 1.1, size: 0.09, diet: 'granivoro', colors: ['#ffd9a6', '#c98a3a'], glows: false, interactions: ['observar', 'alimentar', 'acariciar', 'fotografar', 'cuidar'], note: 'Guarda comida na bochecha e finge que não.' },
  { id: 'porquinho-da-india', name: 'Porquinho-da-índia', plural: 'porquinhos-da-índia', kind: 'domestico', habitats: ['urbano'], temperament: 'sociavel', movement: 'anda', speed: 1.3, size: 0.12, diet: 'herbivoro', colors: ['#f3c9a0', '#9b5f3c'], glows: false, interactions: ['observar', 'alimentar', 'acariciar', 'fotografar', 'cuidar'], note: 'Assobia quando ouve a porta da geladeira.' },
  { id: 'passaro', name: 'Pássaro', plural: 'pássaros', kind: 'domestico', habitats: ['ar', 'urbano'], temperament: 'calmo', movement: 'voa', speed: 5.2, size: 0.14, diet: 'granivoro', colors: ['#ffe9a6', '#f2a83a'], glows: false, interactions: ['observar', 'alimentar', 'fotografar', 'cuidar'], note: 'Repete o que ouve, inclusive o que não devia.' },
  { id: 'peixe', name: 'Peixe', plural: 'peixes', kind: 'domestico', habitats: ['agua'], temperament: 'calmo', movement: 'nada', speed: 1.4, size: 0.08, diet: 'onivoro', colors: ['#ffb37a', '#e06a2a'], glows: false, interactions: ['observar', 'alimentar', 'fotografar', 'cuidar'], note: 'O aquário fica melhor perto da janela.' },
  { id: 'tartaruga', name: 'Tartaruga', plural: 'tartarugas', kind: 'domestico', habitats: ['agua', 'jardim'], temperament: 'calmo', movement: 'anda', speed: 0.4, size: 0.2, diet: 'herbivoro', colors: ['#b9d98a', '#5a7a35'], glows: false, interactions: ['observar', 'alimentar', 'acariciar', 'fotografar', 'cuidar'], note: 'Chega lá. Não hoje, mas chega.' },

  // ------------------------------ selvagens ----------------------------
  { id: 'raposa', name: 'Raposa', plural: 'raposas', kind: 'selvagem', habitats: ['floresta'], temperament: 'cauteloso', movement: 'anda', speed: 4.2, size: 0.4, diet: 'onivoro', colors: ['#ff9f5a', '#b3471a'], glows: false, interactions: ['observar', 'fotografar'], note: 'Olha de volta antes de sumir.' },
  { id: 'veado', name: 'Veado', plural: 'veados', kind: 'selvagem', habitats: ['floresta', 'jardim'], temperament: 'arisco', movement: 'anda', speed: 5.6, size: 1.1, diet: 'herbivoro', colors: ['#d9b48a', '#7a5433'], glows: false, interactions: ['observar', 'fotografar'], note: 'Fica imóvel e espera você decidir primeiro.' },
  { id: 'esquilo', name: 'Esquilo', plural: 'esquilos', kind: 'selvagem', habitats: ['jardim', 'floresta', 'urbano'], temperament: 'cauteloso', movement: 'salta', speed: 3.2, size: 0.15, diet: 'granivoro', colors: ['#d9a06a', '#8a5a2f'], glows: false, interactions: ['observar', 'alimentar', 'fotografar'], note: 'Enterra coisas e esquece metade. É assim que nasce árvore.' },
  { id: 'lontra', name: 'Lontra', plural: 'lontras', kind: 'selvagem', habitats: ['agua'], temperament: 'sociavel', movement: 'nada', speed: 3.0, size: 0.35, diet: 'carnivoro', colors: ['#a8835a', '#5c3c22'], glows: false, interactions: ['observar', 'fotografar'], note: 'Brinca porque quer, não porque você está olhando.' },
  { id: 'capivara', name: 'Capivara', plural: 'capivaras', kind: 'selvagem', habitats: ['agua', 'jardim'], temperament: 'calmo', movement: 'anda', speed: 1.8, size: 0.6, diet: 'herbivoro', colors: ['#c9a06a', '#7a5433'], glows: false, interactions: ['observar', 'fotografar'], note: 'A criatura mais tranquila do Éden, e ela sabe disso.' },
  { id: 'borboleta', name: 'Borboleta', plural: 'borboletas', kind: 'selvagem', habitats: ['jardim', 'ar'], temperament: 'arisco', movement: 'voa', speed: 1.6, size: 0.06, diet: 'nectar', colors: ['#ffd1ea', '#e06aa8'], glows: false, interactions: ['observar', 'fotografar'], note: 'Pousa quando você para de tentar.' },
  { id: 'coruja', name: 'Coruja', plural: 'corujas', kind: 'selvagem', habitats: ['noturno', 'floresta', 'ar'], temperament: 'independente', movement: 'voa', speed: 6.4, size: 0.4, diet: 'carnivoro', colors: ['#d8c6a8', '#6a5436'], glows: false, interactions: ['observar', 'fotografar'], note: 'Já estava acordada antes de você chegar.' },
  { id: 'lobo', name: 'Lobo', plural: 'lobos', kind: 'selvagem', habitats: ['floresta', 'noturno'], temperament: 'cauteloso', movement: 'anda', speed: 5.8, size: 0.8, diet: 'carnivoro', colors: ['#b5b9c0', '#4e545d'], glows: false, interactions: ['observar', 'fotografar'], note: 'Mantém distância, e espera o mesmo de você.' },
  { id: 'cavalo', name: 'Cavalo', plural: 'cavalos', kind: 'selvagem', habitats: ['jardim', 'floresta'], temperament: 'calmo', movement: 'anda', speed: 7.2, size: 1.6, diet: 'herbivoro', colors: ['#c9a279', '#6b4526'], glows: false, interactions: ['observar', 'acariciar', 'fotografar'], note: 'Se deixar você chegar, é porque decidiu.' },
  { id: 'urso', name: 'Urso', plural: 'ursos', kind: 'selvagem', habitats: ['floresta'], temperament: 'independente', movement: 'anda', speed: 4.6, size: 1.4, diet: 'onivoro', colors: ['#8a6a4a', '#3f2d1d'], glows: false, interactions: ['observar', 'fotografar'], note: 'Observe de longe. É o acordo.' },
  { id: 'gato-selvagem', name: 'Gato-selvagem', plural: 'gatos-selvagens', kind: 'selvagem', habitats: ['pedra', 'floresta'], temperament: 'arisco', movement: 'anda', speed: 4.8, size: 0.35, diet: 'carnivoro', colors: ['#cbb08a', '#6a533a'], glows: false, interactions: ['observar', 'fotografar'], note: 'Parece um gato de casa até você tentar chegar perto.' },
  { id: 'lagarto', name: 'Lagarto', plural: 'lagartos', kind: 'selvagem', habitats: ['pedra'], temperament: 'arisco', movement: 'rasteja', speed: 2.2, size: 0.18, diet: 'carnivoro', colors: ['#9ac47a', '#4e6a33'], glows: false, interactions: ['observar', 'fotografar'], note: 'Toma sol na pedra quente e some ao primeiro passo.' },

  // --------------------------- criaturas do Éden -----------------------
  { id: 'criatura-bioluminescente', name: 'Lumífera', plural: 'lumíferas', kind: 'eden', habitats: ['noturno', 'floresta'], temperament: 'cauteloso', movement: 'flutua', speed: 1.2, size: 0.3, diet: null, colors: ['#a6ffe4', '#1fb49a'], glows: true, interactions: ['observar', 'fotografar'], note: 'Não se sabe o que é. Sabe-se que acende quando alguém canta.' },
  { id: 'passaro-cristal', name: 'Pássaro-de-cristal', plural: 'pássaros-de-cristal', kind: 'eden', habitats: ['ar', 'jardim', 'urbano'], temperament: 'calmo', movement: 'voa', speed: 5.8, size: 0.2, diet: null, colors: ['#bfe9ff', '#3a9fe0'], glows: true, interactions: ['observar', 'fotografar'], note: 'As penas tilintam. O som é quase uma melodia.' },
  { id: 'borboleta-luminosa', name: 'Borboleta-lúmen', plural: 'borboletas-lúmen', kind: 'eden', habitats: ['jardim', 'ar', 'noturno'], temperament: 'arisco', movement: 'voa', speed: 1.8, size: 0.08, diet: 'nectar', colors: ['#e8c1ff', '#9a4fe0'], glows: true, interactions: ['observar', 'fotografar'], note: 'Deixa um rastro curto no ar. Some em dois segundos.' },
  { id: 'peixe-aurora', name: 'Peixe-aurora', plural: 'peixes-aurora', kind: 'eden', habitats: ['agua'], temperament: 'calmo', movement: 'nada', speed: 2.2, size: 0.25, diet: null, colors: ['#9df0d0', '#1b9e82'], glows: true, interactions: ['observar', 'fotografar'], note: 'A água fica da cor dele quando passa um cardume.' },
  { id: 'anfibio-lumen', name: 'Anfíbio-lúmen', plural: 'anfíbios-lúmen', kind: 'eden', habitats: ['agua', 'noturno'], temperament: 'cauteloso', movement: 'salta', speed: 1.6, size: 0.12, diet: 'carnivoro', colors: ['#c6ff9a', '#4a9a2a'], glows: true, interactions: ['observar', 'fotografar'], note: 'Canta em coro quando a noite fica quieta demais.' },
];

const BY_ID = new Map(SPECIES.map((species) => [species.id, species]));

export function registerSpecies(species: Species): Species {
  if (BY_ID.has(species.id)) throw new Error(`[Species] Espécie já registrada: ${species.id}`);
  SPECIES.push(species);
  BY_ID.set(species.id, species);
  return species;
}

export function getSpecies(id: string): Species | undefined {
  return BY_ID.get(id);
}

export function allSpecies(): readonly Species[] {
  return SPECIES;
}

export function speciesOfKind(kind: SpeciesKind): Species[] {
  return SPECIES.filter((species) => species.kind === kind);
}

export function speciesInHabitat(habitat: Habitat): Species[] {
  return SPECIES.filter((species) => species.habitats.includes(habitat));
}

/**
 * Só bicho doméstico pode ser adotado.
 *
 * É uma regra de mundo, não de interface: o Jardim Proibido existe
 * justamente porque o que é selvagem continua selvagem. Saturno não
 * deixaria passar.
 */
export function isAdoptable(id: string): boolean {
  return getSpecies(id)?.kind === 'domestico';
}
