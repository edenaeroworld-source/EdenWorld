/**
 * A caixa de diálogo de rodapé.
 *
 * Presença de RPG clássico — a faixa fica embaixo, o mundo continua
 * visível acima dela — com a cara do EDENWORLD: vidro líquido, borda de
 * luz na cor de quem fala, texto que aparece letra a letra.
 *
 * A caixa não conhece a árvore de diálogo: ela mostra o que mandam
 * mostrar e avisa quando o jogador pede para continuar ou escolhe uma
 * resposta. Quem liga as duas pontas é o `DialogueScreen`.
 *
 * Regra de ouro deste arquivo: **nunca reconstruir a faixa inteira**.
 * O texto que aparece letra a letra muda um nó de texto; reconstruir o
 * painel a cada quadro roubaria o foco do teclado e do controle.
 */

import { DialogueSequence, type SequenceOptions } from '../characters/DialogueSequence';
import { button, clear, h } from './dom';
import { icon } from './icons';

export interface DialogueSpeaker {
  name: string;
  /** Título ou ocupação (ex.: "Deusa da Tecnologia e dos Sistemas"). */
  title: string;
  /** Cor de identidade usada na borda e no selo. */
  color: string;
  /** Linha pequena ao lado do nome (ex.: o lugar). */
  place?: string;
}

export interface DialogueChoiceView {
  label: string;
}

export interface DialogueBoxOptions {
  speaker: DialogueSpeaker;
  /** O jogador pediu para continuar (clique, Enter, A do controle, toque). */
  onAdvance(): void;
  /** O jogador escolheu uma resposta. */
  onChoice(index: number): void;
  /** Quantas letras apareceram neste quadro — move a boca e toca o som. */
  onReveal?(chars: number): void;
  /** Ritmo do texto. */
  sequence?: SequenceOptions;
}

/** Texto do indicador conforme o que vem a seguir. */
const HINT_MORE = 'Continuar';
const HINT_SKIP = 'Pular texto';
const HINT_END = 'Encerrar';

export class DialogueBox {
  readonly element: HTMLDivElement;

  private readonly options: DialogueBoxOptions;
  private readonly nameEl: HTMLSpanElement;
  private readonly roleEl: HTMLSpanElement;
  private readonly badge: HTMLSpanElement;
  private readonly textEl: HTMLParagraphElement;
  private readonly page: HTMLButtonElement;
  private readonly hintLabel: HTMLSpanElement;
  private readonly marker: HTMLSpanElement;
  private readonly choicesEl: HTMLDivElement;
  private readonly logEl: HTMLDivElement;
  private readonly logButton: HTMLButtonElement;
  private readonly bar: HTMLDivElement;

  private sequence: DialogueSequence | null = null;
  private lastTick = 0;
  /** Linhas já ditas nesta conversa (o histórico). */
  private readonly history: { who: string; text: string }[] = [];
  private logOpen = false;
  private choiceButtons: HTMLButtonElement[] = [];

  constructor(options: DialogueBoxOptions) {
    this.options = options;
    const speaker = options.speaker;

    this.badge = h('span', { class: 'talkbar__badge', attrs: { 'aria-hidden': 'true' } });
    this.nameEl = h('span', { class: 'talkbar__name' });
    this.roleEl = h('span', { class: 'talkbar__role' });

    this.logButton = button({
      class: 'talkbar__log-toggle',
      icon: icon('book', 18),
      ariaLabel: 'Histórico da conversa',
      onClick: () => this.toggleLog(),
    });
    this.logButton.setAttribute('aria-expanded', 'false');

    const head = h('div', { class: 'talkbar__head' }, this.badge, h('span', { class: 'talkbar__who' }, this.nameEl, this.roleEl), this.logButton);

    this.textEl = h('p', { class: 'talkbar__text' });
    this.marker = h('span', { class: 'talkbar__marker', html: icon('play', 16), attrs: { 'aria-hidden': 'true' } });
    this.hintLabel = h('span', { class: 'talkbar__hint-label' });

    // A página inteira é o botão de continuar: clicar em qualquer lugar do
    // texto avança, como em um RPG de console. Teclado e controle chegam
    // aqui pelo foco (Enter, Espaço, botão A).
    this.page = h(
      'button',
      { class: 'talkbar__page', attrs: { type: 'button', 'aria-label': 'Continuar a conversa' } },
      this.textEl,
      h('span', { class: 'talkbar__hint' }, this.hintLabel, this.marker),
    );
    this.page.addEventListener('click', () => this.options.onAdvance());

    this.choicesEl = h('div', { class: 'talkbar__choices', attrs: { role: 'group', 'aria-label': 'Respostas' } });
    this.choicesEl.hidden = true;

    this.logEl = h('div', { class: 'talkbar__log', attrs: { 'aria-label': 'Histórico da conversa', tabindex: '-1' } });
    this.logEl.hidden = true;

    this.bar = h('div', { class: 'talkbar' }, head, this.logEl, this.page, this.choicesEl);
    this.element = h('div', { class: 'talkbar-dock' }, this.bar);
    this.setSpeaker(speaker);
  }

  /* ---------------------------- Quem fala --------------------------- */

  setSpeaker(speaker: DialogueSpeaker): void {
    this.nameEl.textContent = speaker.name;
    this.roleEl.textContent = speaker.place ? `${speaker.title} · ${speaker.place}` : speaker.title;
    this.badge.textContent = speaker.name.slice(0, 1).toUpperCase();
    this.badge.style.background = `linear-gradient(140deg, ${speaker.color}, rgba(255,255,255,0.3))`;
    this.bar.style.setProperty('--talk', speaker.color);
  }

  /* ------------------------------ Falas ----------------------------- */

  /**
   * Começa uma fala nova.
   *
   * @param pages parágrafos do nó; cada um vira uma página da caixa.
   */
  say(pages: readonly string[], speakerName: string): void {
    this.sequence = new DialogueSequence(pages, this.options.sequence);
    this.lastTick = now();
    this.textEl.textContent = this.sequence.visible;
    for (const page of this.sequence.pages) this.history.push({ who: speakerName, text: page });
    this.renderLog();
    this.hideChoices();
    this.page.hidden = false;
    this.updateHint();
  }

  /** Página atual (para quem quiser saber onde a conversa está). */
  get pageIndex(): number {
    return this.sequence?.pageIndex ?? 0;
  }

  get revealing(): boolean {
    return this.sequence?.revealing ?? false;
  }

  /** `true` quando o texto do nó terminou de aparecer. */
  get finished(): boolean {
    return this.sequence?.finished ?? true;
  }

  /**
   * O jogador pediu para continuar.
   * Devolve `true` se ainda havia texto (então a conversa não avança).
   */
  advance(): boolean {
    if (!this.sequence) return false;
    const result = this.sequence.advance();
    if (result === 'fim') return false;
    this.textEl.textContent = this.sequence.visible;
    this.updateHint();
    return true;
  }

  /** Passo de relógio: revela letras. Chamado uma vez por quadro. */
  update(): void {
    const sequence = this.sequence;
    if (!sequence) return;
    const time = now();
    const dt = Math.min(0.2, Math.max(0, (time - this.lastTick) / 1000));
    this.lastTick = time;
    if (!sequence.revealing) return;
    const revealed = sequence.update(dt);
    if (revealed <= 0) return;
    this.textEl.textContent = sequence.visible;
    this.options.onReveal?.(revealed);
    if (!sequence.revealing) this.updateHint();
  }

  /* ---------------------------- Respostas --------------------------- */

  /**
   * Mostra as respostas possíveis.
   * A lista vazia esconde a área e devolve o foco ao texto.
   */
  showChoices(choices: readonly DialogueChoiceView[]): void {
    clear(this.choicesEl);
    this.choiceButtons = [];
    if (choices.length === 0) {
      this.hideChoices();
      return;
    }
    choices.forEach((choice, index) => {
      const element = button({
        class: 'talkbar__choice',
        label: choice.label,
        onClick: () => this.options.onChoice(index),
      });
      this.choiceButtons.push(element);
      this.choicesEl.appendChild(element);
    });
    this.choicesEl.hidden = false;
    this.page.hidden = false;
    this.updateHint();
    this.choiceButtons[0]?.focus({ preventScroll: true });
  }

  hideChoices(): void {
    this.choicesEl.hidden = true;
    clear(this.choicesEl);
    this.choiceButtons = [];
  }

  get hasChoices(): boolean {
    return this.choiceButtons.length > 0;
  }

  /** Elemento que recebe o foco ao abrir ou ao trocar de fala. */
  focusTarget(): HTMLElement | null {
    if (this.choiceButtons.length > 0) return this.choiceButtons[0];
    return this.page;
  }

  /* ---------------------------- Histórico --------------------------- */

  private toggleLog(): void {
    this.logOpen = !this.logOpen;
    this.logEl.hidden = !this.logOpen;
    this.logButton.setAttribute('aria-expanded', String(this.logOpen));
    if (this.logOpen) this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private renderLog(): void {
    clear(this.logEl);
    // Só as últimas falas: o histórico é um apoio, não um livro.
    for (const entry of this.history.slice(-12)) {
      this.logEl.appendChild(h('p', { class: 'talkbar__log-line' }, h('b', { text: `${entry.who}: ` }), document.createTextNode(entry.text)));
    }
    if (this.logOpen) this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  /** Registra uma fala do jogador no histórico (a resposta escolhida). */
  recordChoice(label: string, playerName: string): void {
    this.history.push({ who: playerName, text: label });
    this.renderLog();
  }

  /* ------------------------------ Dicas ----------------------------- */

  private updateHint(): void {
    const sequence = this.sequence;
    const revealing = sequence?.revealing ?? false;
    const more = sequence?.hasNext ?? false;
    const label = revealing ? HINT_SKIP : more ? HINT_MORE : this.hasChoices ? '' : HINT_END;
    this.hintLabel.textContent = label;
    // O triângulo só pisca quando há mais texto esperando o jogador.
    this.marker.hidden = revealing || this.hasChoices;
    this.page.classList.toggle('talkbar__page--waiting', !revealing && more);
    this.page.setAttribute('aria-label', revealing ? 'Mostrar o texto inteiro' : more ? 'Continuar a conversa' : 'Encerrar a conversa');
  }

  dispose(): void {
    this.sequence = null;
    this.history.length = 0;
    this.choiceButtons = [];
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
