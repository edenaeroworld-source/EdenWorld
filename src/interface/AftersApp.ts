/**
 * Aplicativo Afters® do EdenPhone.
 *
 * A tela é organizada em torno dos **dois produtos que transformam o
 * avatar** — cada um com interruptor, slider de 0% a 250%, leitura
 * numérica e botão de reiniciar. Os efeitos de luz entram depois, numa
 * seção claramente marcada como complementar: eles nunca substituem a
 * transformação.
 *
 * Nenhum controle é enfeite: cada um chama o jogo e o avatar muda na hora,
 * sem sair da cidade e sem interromper o movimento.
 */

import type { AftersBodyStatus } from '../afters/AftersBodySystem';
import { type AftersConfig, SUPPLEMENTARY_PRODUCTS, productForChannel } from '../afters/AftersCatalog';
import {
  AFTERS_PRESETS,
  type AftersBody,
  type AftersChannelId,
  CHANNEL_DESCRIPTIONS,
  INTENSITY_STEPS,
  MAX_DURATION,
  MAX_PERCENT,
  MIN_DURATION,
  PERCENT_STEP,
  effectiveIntensity,
  isCombined,
  isNeutral,
  toPercent,
} from '../afters/AftersState';
import { button, h, slider, toggle } from './dom';
import { type IconName, icon } from './icons';

/** O que o aplicativo precisa do jogo para funcionar. */
export interface AftersAppHost {
  afters(): AftersConfig;
  setAfters(patch: Partial<AftersConfig>): void;
  /** Estado da transformação de silhueta. */
  aftersBody(): AftersBody;
  /** Situação dos canais neste instante (inclui transição em andamento). */
  aftersStatus(): AftersBodyStatus;
  setAftersIntensity(channel: AftersChannelId, percent: number): void;
  setAftersActive(channel: AftersChannelId, active: boolean): void;
  setAftersCombined(active: boolean): void;
  setAftersDuration(seconds: number): void;
  applyAftersPreset(id: string): void;
  /** Reinicia um canal: 0% e desligado, sem tocar no outro. */
  resetAfters(channel: AftersChannelId): void;
  /** Reinicia os dois canais e a duração. */
  resetAftersAll(): void;
  /** Desliga silhueta e luz, preservando as porcentagens escolhidas. */
  aftersAllOff(): void;
}

const CHANNEL_ICON: Record<AftersChannelId, IconName> = { bust: 'sparkle', curve: 'star' };

function card(...children: (Node | string | false | null | undefined)[]): HTMLDivElement {
  return h('div', { class: 'card card--glass' }, ...children);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/* ------------------- Seção de um produto de transformação ------------------ */

function buildChannel(host: AftersAppHost, channel: AftersChannelId, refresh: () => void): HTMLElement {
  const config = host.afters();
  const body = host.aftersBody();
  const status = host.aftersStatus();
  const product = productForChannel(channel);
  const snapshot = channel === 'bust' ? status.bust : status.curve;
  const stored = channel === 'bust' ? body.bust : body.curve;
  const active = channel === 'bust' ? body.bustActive : body.curveActive;
  const percent = toPercent(stored);
  const shown = toPercent(snapshot.current);

  const badge = h('span', { class: `afters__badge afters__badge--${channel}`, html: icon(CHANNEL_ICON[channel], 22) });
  const header = h(
    'header',
    { class: 'afters__head' },
    badge,
    h('div', { class: 'afters__title' }, h('b', { text: product.name }), h('small', { text: CHANNEL_DESCRIPTIONS[channel] })),
    toggle(`Ativar ${product.name}`, active, (value) => {
      host.setAftersActive(channel, value);
      refresh();
    }),
  );

  const readout = h(
    'div',
    { class: 'afters__readout' },
    h('b', { class: 'afters__percent', text: formatPercent(percent) }),
    h('small', { text: active ? 'ativo' : 'desligado' }),
  );
  if (snapshot.animating) readout.appendChild(h('small', { class: 'afters__live', text: `aplicando ${formatPercent(shown)}…` }));

  const range = slider({
    label: `Intensidade de ${product.name}, de 0 a ${MAX_PERCENT} por cento`,
    min: 0,
    max: MAX_PERCENT,
    step: PERCENT_STEP,
    value: percent,
    format: formatPercent,
    onInput: (value) => {
      host.setAftersIntensity(channel, value);
      // A leitura numérica acompanha o arrasto sem redesenhar a tela
      // inteira — redesenhar faria o controle perder o foco.
      const label = readout.querySelector('.afters__percent');
      if (label) label.textContent = formatPercent(value);
    },
  });
  range.classList.add('slider--afters');

  const steps = h('div', { class: 'afters__steps', attrs: { role: 'group', 'aria-label': `Atalhos de intensidade de ${product.name}` } });
  for (const step of INTENSITY_STEPS) {
    const on = Math.abs(step - percent) < 0.01;
    const chip = h('button', { class: on ? 'chip is-on' : 'chip', text: `${step}%`, attrs: { type: 'button', 'aria-pressed': String(on) } });
    chip.addEventListener('click', () => {
      host.setAftersIntensity(channel, step);
      refresh();
    });
    steps.appendChild(chip);
  }

  const glowOn = config.productId === product.id;
  const actions = h(
    'div',
    { class: 'row afters__actions' },
    button({
      class: 'btn btn--ghost btn--small',
      icon: icon('back', 18),
      label: 'Reiniciar',
      ariaLabel: `Reiniciar ${product.name} para 0 por cento`,
      onClick: () => {
        host.resetAfters(channel);
        refresh();
      },
    }),
    h(
      'span',
      { class: 'afters__glow' },
      h('span', { class: 'muted', text: 'Luz de assinatura' }),
      toggle(`Luz de assinatura de ${product.name}`, glowOn, (value) => {
        host.setAfters({ productId: value ? product.id : null, color: value ? product.color : config.color });
        refresh();
      }),
    ),
  );

  return h('section', { class: `card card--glass afters__channel${active ? ' is-on' : ''}` }, header, readout, range, steps, actions);
}

/* ------------------------------- Aplicativo ------------------------------- */

export function buildAftersApp(host: AftersAppHost, content: HTMLElement, refresh: () => void): void {
  const config = host.afters();

  content.append(
    h('div', { class: 'phone__app-head' }, h('h2', { text: 'Afters®' }), h('span', { class: 'muted', text: 'Body Expansion Tech · assinatura Luma' })),
  );

  if (!config.unlocked) {
    content.appendChild(
      card(
        h('h3', { text: 'Painel bloqueado' }),
        h('p', { text: 'A tecnologia Afters é liberada por Luma, no Ateliê Aero, a sudoeste da Praça Central.' }),
        h('p', { class: 'muted', text: 'Converse com ela para ativar o painel no seu EdenPhone.' }),
      ),
    );
    return;
  }

  const body = host.aftersBody();
  const status = host.aftersStatus();

  /* --- Estado atual --- */
  content.appendChild(
    h(
      'section',
      { class: `card card--glass afters__status${isNeutral(body) ? '' : ' is-on'}`, attrs: { 'aria-live': 'polite' } },
      h('h3', { text: status.label }),
      h(
        'div',
        { class: 'afters__gauges' },
        h('span', { class: 'afters__gauge' }, h('small', { text: 'AfterBust®' }), h('b', { text: formatPercent(toPercent(effectiveIntensity(body, 'bust'))) })),
        h('span', { class: 'afters__gauge' }, h('small', { text: 'AfterCurve®' }), h('b', { text: formatPercent(toPercent(effectiveIntensity(body, 'curve'))) })),
      ),
      h('p', {
        class: 'muted',
        text: status.animating
          ? 'Transição em andamento. Pode continuar andando, correndo e conversando: a mudança acontece no mundo, sem recarregar nada.'
          : 'A transformação acontece no avatar, ao vivo em Aurora City. Dá para ajustar enquanto você explora.',
      }),
    ),
  );

  /* --- Os dois produtos de transformação --- */
  content.appendChild(buildChannel(host, 'bust', refresh));
  content.appendChild(buildChannel(host, 'curve', refresh));

  /* --- Modo combinado --- */
  const combined = isCombined(body);
  content.appendChild(
    card(
      h('h3', { text: 'Modo combinado' }),
      h('p', { class: 'muted', text: 'Liga e desliga os dois produtos de uma vez. Cada um mantém a sua própria porcentagem.' }),
      h(
        'div',
        { class: 'row' },
        button({
          class: combined ? 'btn btn--small' : 'btn btn--green btn--small',
          icon: icon(combined ? 'close' : 'check', 18),
          label: combined ? 'Desligar os dois' : 'Ligar os dois',
          onClick: () => {
            host.setAftersCombined(!combined);
            refresh();
          },
        }),
        button({
          class: 'btn btn--ghost btn--small',
          icon: icon('close', 18),
          label: 'Desligar tudo',
          onClick: () => {
            host.aftersAllOff();
            refresh();
          },
        }),
        button({
          class: 'btn btn--ghost btn--small',
          icon: icon('back', 18),
          label: 'Reiniciar tudo',
          onClick: () => {
            host.resetAftersAll();
            refresh();
          },
        }),
      ),
      h('p', { class: 'muted', text: 'Desligar guarda a porcentagem escolhida. Reiniciar volta ao padrão: 0%.' }),
    ),
  );

  /* --- Duração da transição --- */
  const durationSlider = slider({
    label: 'Duração da transição, em segundos',
    min: MIN_DURATION,
    max: MAX_DURATION,
    step: 0.1,
    value: body.duration,
    format: (value) => `${value.toFixed(1)} s`,
    onInput: (value) => host.setAftersDuration(value),
  });
  content.appendChild(
    card(
      h('h3', { text: 'Animação' }),
      h('p', { class: 'muted', text: 'Quanto tempo a silhueta leva para chegar ao valor escolhido. A intensidade não muda: só o tempo da transição.' }),
      durationSlider,
    ),
  );

  /* --- Presets --- */
  const presets = h('ul', { class: 'list', attrs: { 'aria-label': 'Presets Afters' } });
  for (const preset of AFTERS_PRESETS) {
    const selected = body.preset === preset.id;
    const item = h(
      'button',
      { class: selected ? 'list-btn is-on' : 'list-btn', attrs: { type: 'button', 'aria-pressed': String(selected) } },
      h('span', { class: 'tagdot tagdot--muted', text: `${preset.bust}/${preset.curve}` }),
      h('span', {}, preset.name, h('small', { text: preset.description })),
    );
    item.addEventListener('click', () => {
      host.applyAftersPreset(preset.id);
      refresh();
    });
    presets.appendChild(h('li', {}, item));
  }
  content.appendChild(card(h('h3', { text: 'Presets' }), presets));

  /* --- Efeitos complementares (nunca substituem a transformação) --- */
  const products = h('ul', { class: 'list', attrs: { 'aria-label': 'Efeitos complementares' } });
  for (const product of SUPPLEMENTARY_PRODUCTS) {
    const selected = product.id === config.productId;
    const swatch = h('span', { class: 'swatch' });
    swatch.style.background = product.color;
    const item = h(
      'button',
      { class: selected ? 'list-btn is-on' : 'list-btn', attrs: { type: 'button', 'aria-pressed': String(selected) } },
      swatch,
      h('span', {}, product.name, h('small', { text: product.tagline })),
    );
    item.addEventListener('click', () => {
      host.setAfters({ productId: selected ? null : product.id, color: selected ? config.color : product.color });
      refresh();
    });
    products.appendChild(h('li', {}, item));
  }
  content.appendChild(
    card(
      h('h3', { text: 'Efeitos complementares' }),
      h('p', { class: 'muted', text: 'Anel de presença, halo e partículas em volta do corpo. São enfeite de luz: não mudam a silhueta e podem ficar desligados.' }),
      products,
      h('p', { class: 'muted', text: 'A luz é uma de cada vez, incluindo as assinaturas do AfterBust® e do AfterCurve®.' }),
    ),
  );

  const colors = ['#ff8fc0', '#c9a2ff', '#7fd6ff', '#ffd84a', '#ff6f91', '#9a7bff', '#24e08a', '#ffffff'];
  const palette = h('div', { class: 'palette', attrs: { role: 'group', 'aria-label': 'Cor do efeito' } });
  for (const color of colors) {
    const swatch = h('button', {
      class: config.color === color ? 'swatch swatch--pick is-on' : 'swatch swatch--pick',
      attrs: { type: 'button', 'aria-label': `Cor ${color}`, 'aria-pressed': String(config.color === color) },
    });
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      host.setAfters({ color });
      refresh();
    });
    palette.appendChild(swatch);
  }

  content.appendChild(
    card(
      h('h3', { text: 'Ajustes da luz' }),
      palette,
      slider({
        label: 'Intensidade do brilho',
        min: 0,
        max: 1,
        step: 0.05,
        value: config.intensity,
        format: (value) => `${Math.round(value * 100)}%`,
        onInput: (value) => host.setAfters({ intensity: value }),
      }),
      h('div', { class: 'row' }, h('span', { text: 'Partículas' }), toggle('Partículas', config.particles, (value) => host.setAfters({ particles: value }))),
      h('div', { class: 'row' }, h('span', { text: 'Som de confirmação' }), toggle('Som de confirmação', config.sound, (value) => host.setAfters({ sound: value }))),
    ),
  );
}
