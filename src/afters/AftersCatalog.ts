/**
 * Catálogo Afters — a linha BET (Body Expansion Tech) do Éden Aero,
 * assinada por Luma.
 *
 * A linha tem duas camadas no EDENWORLD:
 *
 * 1. **Transformação de silhueta** (AfterBust® e AfterCurve®), de 0% a
 *    250%, aplicada ao próprio avatar ao vivo — ver `AftersState.ts`,
 *    `AftersBodySystem.ts` e `AftersMorph.ts`.
 * 2. **Assinatura estética** (anel, halo e partículas em volta do corpo),
 *    uma por produto — ver `AftersSystem.ts`.
 *
 * O avatar é estilizado, feito de primitivas sem detalhe anatômico, e
 * continua assim: o que muda é o volume suave da região, com a roupa junto.
 *
 * Módulo puro: catálogo + validação de preferências (testável).
 */

import { type AftersBody, defaultAftersBody, sanitizeAftersBody } from './AftersState';

export type AftersSignature = 'halo' | 'orbita' | 'cascata' | 'brilho' | 'coracao' | 'veludo';

export interface AftersProduct {
  id: string;
  /** Nome comercial, com marca registrada quando houver. */
  name: string;
  tagline: string;
  description: string;
  /** Assinatura visual do produto. */
  signature: AftersSignature;
  /** Cor sugerida (o jogador pode trocar). */
  color: string;
  /** Quantidade relativa de partículas (0–1). */
  particles: number;
  /** Brilho relativo da aura (0–1). */
  glow: number;
  /** Altura relativa do efeito em volta do corpo (0–1). */
  lift: number;
}

export const AFTERS_PRODUCTS: readonly AftersProduct[] = [
  {
    id: 'afterbust',
    name: 'AfterBust®',
    tagline: 'Presença que entra na sala antes de você.',
    description: 'Halo luminoso amplo e constante em torno da silhueta, com pulso lento no ritmo da respiração.',
    signature: 'halo',
    color: '#ff8fc0',
    particles: 0.45,
    glow: 0.85,
    lift: 0.55,
  },
  {
    id: 'aftercurve',
    name: 'AfterCurve®',
    tagline: 'Movimento desenhado em luz.',
    description: 'Linhas curvas de luz que orbitam o corpo e acompanham cada mudança de direção.',
    signature: 'orbita',
    color: '#c9a2ff',
    particles: 0.75,
    glow: 0.6,
    lift: 0.75,
  },
  {
    id: 'gelgrow',
    name: 'GelGrow®',
    tagline: 'Textura viva, acabamento gel.',
    description: 'Película translúcida que escorre devagar sobre a aura, no melhor estilo líquido do Éden.',
    signature: 'cascata',
    color: '#7fd6ff',
    particles: 0.5,
    glow: 0.7,
    lift: 0.4,
  },
  {
    id: 'candygrow',
    name: 'CandyGrow®',
    tagline: 'Doce, brilhante, impossível de ignorar.',
    description: 'Partículas cintilantes em cores de confeito, com estouros suaves a cada passo.',
    signature: 'brilho',
    color: '#ffd84a',
    particles: 1,
    glow: 0.55,
    lift: 0.85,
  },
  {
    id: 'afterlove',
    name: 'AfterLove',
    tagline: 'Afeto que se vê de longe.',
    description: 'Aura quente e acolhedora, com pulsos que lembram batimento e partículas em forma de coração.',
    signature: 'coracao',
    color: '#ff6f91',
    particles: 0.6,
    glow: 0.8,
    lift: 0.6,
  },
  {
    id: 'aftervelvet',
    name: 'AfterVelvet',
    tagline: 'Discrição é um estilo.',
    description: 'Brilho fosco e aveludado, quase sem partículas: elegância para quem não quer anunciar nada.',
    signature: 'veludo',
    color: '#9a7bff',
    particles: 0.2,
    glow: 0.4,
    lift: 0.3,
  },
];

export function getAftersProduct(id: string): AftersProduct | undefined {
  return AFTERS_PRODUCTS.find((product) => product.id === id);
}

export interface AftersConfig {
  /** `true` depois que Luma libera o painel no EdenPhone. */
  unlocked: boolean;
  /** Produto ativo, ou `null` com tudo desligado. */
  productId: string | null;
  /** Cor do efeito (hexadecimal). */
  color: string;
  /** Intensidade visual da assinatura estética (0–1). */
  intensity: number;
  particles: boolean;
  /** Som ao ligar, desligar e trocar de produto. */
  sound: boolean;
  /** Transformação de silhueta: AfterBust® e AfterCurve®. */
  body: AftersBody;
}

export function defaultAftersConfig(): AftersConfig {
  return {
    unlocked: false,
    productId: null,
    color: AFTERS_PRODUCTS[0].color,
    intensity: 0.6,
    particles: true,
    sound: true,
    body: defaultAftersBody(),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Valida preferências Afters vindas do salvamento. */
export function sanitizeAftersConfig(raw: unknown): AftersConfig {
  const base = defaultAftersConfig();
  if (typeof raw !== 'object' || raw === null) return base;
  const source = raw as Record<string, unknown>;
  const productId = typeof source.productId === 'string' && getAftersProduct(source.productId) ? source.productId : null;
  const intensity = typeof source.intensity === 'number' && Number.isFinite(source.intensity) ? Math.min(1, Math.max(0, source.intensity)) : base.intensity;
  return {
    unlocked: source.unlocked === true,
    productId,
    color: typeof source.color === 'string' && HEX.test(source.color) ? source.color.toLowerCase() : base.color,
    intensity,
    particles: typeof source.particles === 'boolean' ? source.particles : base.particles,
    sound: typeof source.sound === 'boolean' ? source.sound : base.sound,
    // Salvamentos anteriores à versão 2.0 dos Afters não têm este bloco:
    // carregam com a silhueta original, sem perder o resto do progresso.
    body: sanitizeAftersBody(source.body),
  };
}
