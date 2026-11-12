import type { IconName } from '../interface/icons';

/**
 * Catálogo dos recursos planejados para as próximas versões do
 * EDENWORLD. Na Genesis 0.1 eles aparecem apenas como "em breve" —
 * nenhum deles simula funcionalidade que ainda não existe.
 *
 * Para implementar um recurso: crie o sistema correspondente
 * (implementando `GameSystem`), registre-o no `SystemRegistry` do
 * Engine e mude o `status` aqui para "disponivel".
 */
export type FeatureStatus = 'em-breve' | 'disponivel';

export interface FutureFeature {
  id: string;
  name: string;
  icon: IconName;
  /** Cores do ícone no EdenPhone. */
  colors: readonly [string, string];
  summary: string;
  details: readonly string[];
  /** Onde o recurso viverá em Aurora City. */
  place?: string;
  status: FeatureStatus;
}

export const FUTURE_FEATURES: readonly FutureFeature[] = [
  {
    id: 'eden-connect',
    name: 'Éden Connect',
    icon: 'globe',
    colors: ['#b7a2ff', '#6a4fe0'],
    summary: 'Sua conta única para os serviços on-line do universo Éden.',
    details: [
      'Com o Éden Connect você poderá encontrar amigos em Aurora City e levar seu avatar para todo o universo Éden.',
      'Serviços planejados: EdenGram (fotos), EdenTalk (conversas) e EdenFeed (novidades).',
    ],
    place: 'Centro Éden Connect, a leste da Praça Central',
    status: 'em-breve',
  },
  {
    id: 'eden-store',
    name: 'EdenStore',
    icon: 'bag',
    colors: ['#ffd98a', '#ff8f3d'],
    summary: 'A loja oficial do Éden, com roupas e itens para o seu avatar.',
    details: ['A EdenStore abrirá as portas no Mercado Éden em uma versão futura.'],
    place: 'Mercado Éden, ao sul da Praça Central',
    status: 'em-breve',
  },
  {
    id: 'eden-reads',
    name: 'EdenReads',
    icon: 'book',
    colors: ['#a8f0c0', '#22b577'],
    summary: 'Histórias e livros do universo Éden para ler no jogo.',
    details: ['O acervo do EdenReads ficará na Biblioteca de Cristal e também no seu EdenPhone.'],
    place: 'Biblioteca de Cristal, a sudeste da Praça Central',
    status: 'em-breve',
  },
  {
    id: 'eden-pawl',
    name: 'EdenPawl',
    icon: 'paw',
    colors: ['#ffc1d6', '#f0588c'],
    summary: 'Companheiros que exploram o Éden ao seu lado.',
    details: ['Os EdenPawl chegarão em uma versão futura. A Casa EdenPawl já os espera em Aurora City.'],
    place: 'Casa EdenPawl, a oeste da Praça Central',
    status: 'em-breve',
  },
];

export interface FutureEvent {
  id: string;
  name: string;
  description: string;
}

/** Programação anunciada no Painel de Eventos da praça (todos "em breve"). */
export const FUTURE_EVENTS: readonly FutureEvent[] = [
  { id: 'edengala', name: 'EdenGala', description: 'A grande noite de gala do universo Éden.' },
  { id: 'edencon', name: 'EdenCon', description: 'A convenção dos fãs e criadores do Éden.' },
  { id: 'concurso-divino', name: 'Concurso Divino', description: 'Uma competição de estilo e criatividade.' },
  { id: 'shows-lilly', name: 'Shows de Lilly', description: 'Apresentações musicais no Palco Aurora.' },
  { id: 'eventos-litmora', name: 'Eventos de Litmora', description: 'Encontros especiais vindos de Litmora.' },
];

export function getFeature(id: string): FutureFeature | undefined {
  return FUTURE_FEATURES.find((feature) => feature.id === id);
}
