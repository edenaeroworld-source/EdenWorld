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

import { type AftersBody, type AftersChannelId, defaultAftersBody, sanitizeAftersBody } from './AftersState';

export type AftersSignature = 'halo' | 'orbita' | 'cascata' | 'brilho' | 'coracao' | 'veludo';

export interface AftersProduct {
  id: string;
  /** Nome comercial, com marca registrada quando houver. */
  name: string;
  tagline: string;
  description: string;
  /**
   * Canal de transformação que este produto acompanha.
   *
   * AfterBust® e AfterCurve® **são** transformações de silhueta; a luz é só
   * a assinatura delas, e por isso mora dentro da própria seção do produto.
   * Os demais produtos não transformam nada: são efeitos complementares.
   */
  channel?: AftersChannelId;
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
    tagline: 'Transformação da silhueta superior, de 0% a 250%.',
    description: 'Muda o volume do tronco do avatar ao vivo. O halo luminoso é apenas a assinatura de luz do produto, opcional.',
    channel: 'bust',
    signature: 'halo',
    color: '#ff8fc0',
    particles: 0.45,
    glow: 0.85,
    lift: 0.55,
  },
  {
    id: 'aftercurve',
    name: 'AfterCurve®',
    tagline: 'Transformação da silhueta inferior, de 0% a 250%.',
    description: 'Muda o volume do quadril e do topo da coxa ao vivo. As linhas de luz em órbita são apenas a assinatura do produto, opcional.',
    channel: 'curve',
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

/** Os dois produtos que transformam o avatar, na ordem da interface. */
export const TRANSFORM_PRODUCTS: readonly AftersProduct[] = AFTERS_PRODUCTS.filter((product) => product.channel !== undefined);

/** Produtos que só acrescentam efeito em volta do corpo. */
export const SUPPLEMENTARY_PRODUCTS: readonly AftersProduct[] = AFTERS_PRODUCTS.filter((product) => product.channel === undefined);

/** Produto de transformação de um canal (`bust` → AfterBust®). */
export function productForChannel(channel: AftersChannelId): AftersProduct {
  const product = TRANSFORM_PRODUCTS.find((item) => item.channel === channel);
  if (!product) throw new Error(`Canal Afters sem produto: ${channel}`);
  return product;
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
  /**
   * Silhueta dos habitantes mudados por roteiro, por identificador de ator
   * (`cidadao:<semente>`, `divino:<personagem>`).
   *
   * Só entram aqui os que fugiram do próprio perfil: o restante da cidade é
   * recriado a partir da semente, sem ocupar espaço no salvamento.
   */
  citizens: Record<string, AftersBody>;
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
    citizens: {},
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
    citizens: sanitizeAftersCitizens(source.citizens),
  };
}

/** Limite de habitantes guardados: evita salvamentos inchados. */
const MAX_SAVED_CITIZENS = 128;

/** Valida o mapa de silhuetas de habitantes vindo do salvamento. */
export function sanitizeAftersCitizens(raw: unknown): Record<string, AftersBody> {
  const out: Record<string, AftersBody> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  let count = 0;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_SAVED_CITIZENS) break;
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) continue;
    if (typeof value !== 'object' || value === null) continue;
    out[id] = sanitizeAftersBody(value);
    count += 1;
  }
  return out;
}
