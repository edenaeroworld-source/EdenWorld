/**
 * Contrato de rede dos Afters® — **preparação, não funcionalidade**.
 *
 * O EDENWORLD não tem servidor: `LocalSocial.online` é `false` e nenhuma
 * requisição sai do navegador. Este módulo existe para que, quando houver
 * multijogador, a transformação de silhueta já tenha um formato de troca
 * definido — e para que esse formato seja testável desde agora.
 *
 * A ideia é não transmitir quadro a quadro. Manda-se o **destino** e o
 * **começo** da transição; cada cliente reconstrói a animação localmente.
 * Dois jogadores com relógios parecidos veem a mesma transformação.
 */

import { clamp01 } from '../utils/math';
import { easeInOutCubic } from './AftersChannel';
import type { AftersBody } from './AftersState';
import { clampDuration, clampIntensity } from './AftersState';

/** Instantâneo enviado pela rede quando o estado muda (não por quadro). */
export interface AftersNetState {
  /** Intensidade alvo do AfterBust® (0–2.5). */
  bust: number;
  /** Intensidade alvo do AfterCurve® (0–2.5). */
  curve: number;
  /** Intensidade de onde a transição partiu, para quem chega no meio. */
  fromBust: number;
  fromCurve: number;
  /** Produto estético ativo (anel, halo e partículas), se houver. */
  productId: string | null;
  /** Momento em que a transição começou (ms, relógio do remetente). */
  startedAt: number;
  /** Duração da transição, em segundos. */
  duration: number;
}

/** Monta o instantâneo a partir do estado local. */
export function toNetState(body: AftersBody, options: { productId?: string | null; fromBust?: number; fromCurve?: number; now?: number } = {}): AftersNetState {
  const bust = body.bustActive ? clampIntensity(body.bust) : 0;
  const curve = body.curveActive ? clampIntensity(body.curve) : 0;
  return {
    bust,
    curve,
    fromBust: clampIntensity(options.fromBust ?? bust),
    fromCurve: clampIntensity(options.fromCurve ?? curve),
    productId: options.productId ?? null,
    startedAt: options.now ?? Date.now(),
    duration: clampDuration(body.duration),
  };
}

/** Valida um instantâneo recebido. Entrada inválida vira silhueta original. */
export function sanitizeNetState(raw: unknown, now = Date.now()): AftersNetState {
  const neutral: AftersNetState = { bust: 0, curve: 0, fromBust: 0, fromCurve: 0, productId: null, startedAt: now, duration: 0 };
  if (typeof raw !== 'object' || raw === null) return neutral;
  const source = raw as Record<string, unknown>;
  const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  const bust = clampIntensity(number(source.bust, 0));
  const curve = clampIntensity(number(source.curve, 0));
  return {
    bust,
    curve,
    fromBust: clampIntensity(number(source.fromBust, bust)),
    fromCurve: clampIntensity(number(source.fromCurve, curve)),
    productId: typeof source.productId === 'string' ? source.productId : null,
    // Um carimbo no futuro (relógio adiantado do remetente) é tratado como agora.
    startedAt: Math.min(number(source.startedAt, now), now),
    duration: Math.max(0, Math.min(clampDuration(number(source.duration, 0)), number(source.duration, 0))),
  };
}

/**
 * Reconstrói, no cliente, a intensidade de um jogador remoto neste instante.
 *
 * É interpolação local a partir do instantâneo: nenhum quadro de animação
 * precisa trafegar.
 */
export function sampleNetState(state: AftersNetState, now = Date.now()): { bust: number; curve: number } {
  if (state.duration <= 0) return { bust: state.bust, curve: state.curve };
  const seconds = Math.max(0, (now - state.startedAt) / 1000);
  const t = easeInOutCubic(clamp01(seconds / state.duration));
  return {
    bust: state.fromBust + (state.bust - state.fromBust) * t,
    curve: state.fromCurve + (state.curve - state.fromCurve) * t,
  };
}

/** `true` quando a transição remota já terminou (pode parar de amostrar). */
export function isNetStateSettled(state: AftersNetState, now = Date.now()): boolean {
  if (state.duration <= 0) return true;
  return (now - state.startedAt) / 1000 >= state.duration;
}
