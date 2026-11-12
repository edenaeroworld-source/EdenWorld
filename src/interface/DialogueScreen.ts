import type { DialogueEffect, DialogueRunner } from '../characters/Dialogue';
import { button, clear, h } from './dom';
import { icon } from './icons';
import type { Screen } from './UIManager';

export interface DialogueSpeaker {
  name: string;
  /** Título ou ocupação (ex.: "Deusa da Tecnologia e dos Sistemas"). */
  title: string;
  /** Cor de identidade usada no cabeçalho. */
  color: string;
  /** Linha pequena abaixo do nome (ex.: o lugar). */
  place?: string;
}

export interface DialogueScreenOptions {
  id?: string;
  speaker: DialogueSpeaker;
  runner: DialogueRunner;
  /** Chamado com os efeitos novos a cada passo da conversa. */
  onEffects(effects: readonly DialogueEffect[]): void;
  onClose(): void;
}

/**
 * Tela de conversa: fala do personagem + escolhas do jogador.
 * Navegável por mouse, toque, teclado e controle (como as demais telas).
 */
export class DialogueScreen implements Screen {
  readonly id: string;
  readonly element: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly footer: HTMLDivElement;
  private readonly runner: DialogueRunner;
  private appliedCount = 0;
  private first: HTMLButtonElement | null = null;

  constructor(private readonly options: DialogueScreenOptions) {
    this.id = options.id ?? 'conversa';
    this.runner = options.runner;
    const speaker = options.speaker;

    const badge = h('span', { class: 'talk__badge' });
    badge.style.background = `linear-gradient(140deg, ${speaker.color}, rgba(255,255,255,0.25))`;
    badge.textContent = speaker.name.slice(0, 1).toUpperCase();

    const header = h(
      'div',
      { class: 'panel__header talk__head' },
      badge,
      h('div', { class: 'talk__who' }, h('h2', { class: 'panel__title', text: speaker.name }), h('span', { class: 'talk__role', text: speaker.title })),
    );
    if (speaker.place) header.appendChild(h('span', { class: 'talk__place', text: speaker.place }));

    this.body = h('div', { class: 'panel__body talk__text' });
    this.footer = h('div', { class: 'panel__footer talk__choices' });
    const panel = h('div', { class: 'panel panel--medium talk' }, header, this.body, this.footer);
    this.element = h('div', { class: 'screen screen--dim', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Conversa com ${speaker.name}` } }, panel);
    this.render();
  }

  private flushEffects(): void {
    const applied = this.runner.applied;
    if (applied.length > this.appliedCount) {
      this.options.onEffects(applied.slice(this.appliedCount));
      this.appliedCount = applied.length;
    }
  }

  private render(): void {
    this.flushEffects();
    clear(this.body);
    clear(this.footer);
    this.first = null;
    for (const paragraph of this.runner.current.text) this.body.appendChild(h('p', { text: paragraph }));

    const choices = this.runner.choices;
    if (choices.length === 0) {
      const close = button({ class: 'btn btn--wide', icon: icon('check', 20), label: 'Encerrar conversa', onClick: () => this.close() });
      this.first = close;
      this.footer.appendChild(close);
      return;
    }
    choices.forEach((choice, index) => {
      const element = button({
        class: 'btn btn--ghost btn--wide',
        label: choice.label,
        onClick: () => this.pick(index),
      });
      if (index === 0) this.first = element;
      this.footer.appendChild(element);
    });
  }

  private pick(index: number): void {
    const next = this.runner.choose(index);
    this.flushEffects();
    if (!next) {
      this.close();
      return;
    }
    this.render();
    this.first?.focus({ preventScroll: true });
  }

  private close(): void {
    this.runner.end();
    this.flushEffects();
    this.options.onClose();
  }

  onBack(): void {
    this.close();
  }

  initialFocus(): HTMLElement | null {
    return this.first;
  }
}
