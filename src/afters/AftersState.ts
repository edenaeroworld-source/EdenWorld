/**
 * Estado dos Afters® 2.0 — transformação de silhueta.
 *
 * Dados puros: intensidades, ativação, duração da transição e presets.
 * Nenhuma dependência de Three.js, DOM ou salvamento — é este módulo que
 * os testes usam para garantir os limites de 0% a 250%.
 */

import { MAX_INTENSITY, MIN_INTENSITY } from './AftersMorph';

export { MAX_INTENSITY, MIN_INTENSITY };

/** 250% vira 2.5 internamente. */
export const MAX_PERCENT = 100 * MAX_INTENSITY;

/** Degraus pedidos pelo painel (o slider aceita valores intermediários). */
export const INTENSITY_STEPS: readonly number[] = [0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250];

/** Passo do slider, em pontos percentuais. */
export const PERCENT_STEP = 5;

/** Duração mínima e máxima da transição, em segundos. */
export const MIN_DURATION = 0.2;
export const MAX_DURATION = 6;
export const DEFAULT_DURATION = 1.6;

/** Canais independentes de transformação. */
export type AftersChannelId = 'bust' | 'curve';

export const CHANNEL_LABELS: Record<AftersChannelId, string> = {
  bust: 'AfterBust®',
  curve: 'AfterCurve®',
};

export const CHANNEL_DESCRIPTIONS: Record<AftersChannelId, string> = {
  bust: 'Silhueta superior do avatar.',
  curve: 'Silhueta inferior do avatar.',
};

/**
 * Preferências de transformação do jogador.
 *
 * `bust` e `curve` são guardados em unidades internas (0–2.5). A interface
 * sempre mostra porcentagem. A ativação é separada da intensidade: desligar
 * um canal preserva o valor escolhido para quando ele voltar.
 */
export interface AftersBody {
  /** Intensidade do AfterBust® (0–2.5). */
  bust: number;
  /** Intensidade do AfterCurve® (0–2.5). */
  curve: number;
  /** AfterBust® ligado. */
  bustActive: boolean;
  /** AfterCurve® ligado. */
  curveActive: boolean;
  /** Duração da transição, em segundos. */
  duration: number;
  /** Preset escolhido, quando os valores ainda batem com ele. */
  preset: string | null;
}

export interface AftersPreset {
  id: string;
  name: string;
  description: string;
  /** Intensidade do AfterBust® em porcentagem (0–250). */
  bust: number;
  /** Intensidade do AfterCurve® em porcentagem (0–250). */
  curve: number;
}

/**
 * Presets de fábrica da linha BET.
 *
 * São combinações dos dois canais, não produtos: o jogador continua
 * livre para mexer em cada slider depois de aplicar um preset.
 */
export const AFTERS_PRESETS: readonly AftersPreset[] = [
  { id: 'natural', name: 'Natural', description: 'Silhueta original, tudo em 0%.', bust: 0, curve: 0 },
  { id: 'suave', name: 'Suave', description: 'Uma mudança discreta, para o dia a dia em Aurora City.', bust: 50, curve: 50 },
  { id: 'aurora', name: 'Aurora', description: 'O ajuste de assinatura da Luma: equilíbrio em 100%.', bust: 100, curve: 100 },
  { id: 'palco', name: 'Palco', description: 'Pensado para o Palco Aurora: presença acima, base firme.', bust: 175, curve: 125 },
  { id: 'vice', name: 'Vice Éden', description: 'Para a noite da cidade, quando o néon acende.', bust: 200, curve: 200 },
  { id: 'maximo', name: 'Máximo BET', description: 'Os dois canais em 250%: o limite da tecnologia.', bust: 250, curve: 250 },
];

export function getAftersPreset(id: string): AftersPreset | undefined {
  return AFTERS_PRESETS.find((preset) => preset.id === id);
}

/** Porcentagem (0–250) a partir da unidade interna (0–2.5). */
export function toPercent(intensity: number): number {
  return Math.round(intensity * 1000) / 10;
}

/** Unidade interna (0–2.5) a partir da porcentagem (0–250). */
export function fromPercent(percent: number): number {
  return clampIntensity(percent / 100);
}

/** Limita uma intensidade ao intervalo aceito. */
export function clampIntensity(value: number): number {
  if (!Number.isFinite(value)) return MIN_INTENSITY;
  return Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, value));
}

/** Limita uma duração de transição ao intervalo aceito. */
export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DURATION;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, value));
}

/** Degrau mais próximo de uma porcentagem (para os botões de atalho). */
export function nearestStep(percent: number): number {
  let best = INTENSITY_STEPS[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const step of INTENSITY_STEPS) {
    const d = Math.abs(step - percent);
    if (d < distance) {
      distance = d;
      best = step;
    }
  }
  return best;
}

export function defaultAftersBody(): AftersBody {
  return { bust: 0, curve: 0, bustActive: false, curveActive: false, duration: DEFAULT_DURATION, preset: 'natural' };
}

/**
 * Intensidade que de fato chega ao avatar: a ativação funciona como uma
 * chave geral, sem apagar o valor guardado no slider.
 */
export function effectiveIntensity(body: AftersBody, channel: AftersChannelId): number {
  if (channel === 'bust') return body.bustActive ? clampIntensity(body.bust) : 0;
  return body.curveActive ? clampIntensity(body.curve) : 0;
}

/** `true` quando os dois canais estão ligados ao mesmo tempo. */
export function isCombined(body: AftersBody): boolean {
  return body.bustActive && body.curveActive;
}

/** `true` quando nada está transformando a silhueta. */
export function isNeutral(body: AftersBody): boolean {
  return effectiveIntensity(body, 'bust') <= 0 && effectiveIntensity(body, 'curve') <= 0;
}

/** Aplica um preset, ligando os canais que ele usa. */
export function applyPreset(body: AftersBody, preset: AftersPreset): AftersBody {
  return {
    ...body,
    bust: fromPercent(preset.bust),
    curve: fromPercent(preset.curve),
    bustActive: preset.bust > 0,
    curveActive: preset.curve > 0,
    preset: preset.id,
  };
}

/** Preset cujos valores batem exatamente com o estado atual, se houver. */
export function matchingPreset(body: AftersBody): AftersPreset | null {
  for (const preset of AFTERS_PRESETS) {
    const bustOk = Math.abs(toPercent(effectiveIntensity(body, 'bust')) - preset.bust) < 0.05;
    const curveOk = Math.abs(toPercent(effectiveIntensity(body, 'curve')) - preset.curve) < 0.05;
    if (bustOk && curveOk) return preset;
  }
  return null;
}

/** Desliga os dois canais, preservando as intensidades escolhidas. */
export function allOff(body: AftersBody): AftersBody {
  return { ...body, bustActive: false, curveActive: false, preset: null };
}

/**
 * Volta um canal ao padrão de fábrica: 0% e desligado.
 *
 * É diferente de desligar. O interruptor guarda a porcentagem escolhida
 * para quando o canal voltar; o reinício apaga essa escolha.
 */
export function resetChannel(body: AftersBody, channel: AftersChannelId): AftersBody {
  const next: AftersBody =
    channel === 'bust' ? { ...body, bust: 0, bustActive: false } : { ...body, curve: 0, curveActive: false };
  next.preset = matchingPreset(next)?.id ?? null;
  return next;
}

/** Volta os dois canais e a duração ao padrão de fábrica. */
export function resetAll(): AftersBody {
  return defaultAftersBody();
}

/**
 * Valida preferências vindas do salvamento.
 *
 * Nunca lança: entrada inválida vira o padrão. Salvamentos antigos (sem o
 * bloco `body`) continuam carregando com a silhueta original.
 */
export function sanitizeAftersBody(raw: unknown): AftersBody {
  const base = defaultAftersBody();
  if (typeof raw !== 'object' || raw === null) return base;
  const source = raw as Record<string, unknown>;
  const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  const body: AftersBody = {
    bust: clampIntensity(number(source.bust, base.bust)),
    curve: clampIntensity(number(source.curve, base.curve)),
    bustActive: source.bustActive === true,
    curveActive: source.curveActive === true,
    duration: clampDuration(number(source.duration, base.duration)),
    preset: typeof source.preset === 'string' && getAftersPreset(source.preset) ? source.preset : null,
  };
  // Coerência: o preset guardado só continua válido se ainda descrever o estado.
  const match = matchingPreset(body);
  body.preset = match ? match.id : null;
  return body;
}

/** Resumo legível do estado, usado no painel do EdenPhone. */
export function statusLabel(body: AftersBody): string {
  const bust = toPercent(effectiveIntensity(body, 'bust'));
  const curve = toPercent(effectiveIntensity(body, 'curve'));
  if (bust <= 0 && curve <= 0) return 'Silhueta original';
  if (bust > 0 && curve > 0) return `Modo combinado · AfterBust® ${bust}% · AfterCurve® ${curve}%`;
  if (bust > 0) return `AfterBust® ${bust}%`;
  return `AfterCurve® ${curve}%`;
}
