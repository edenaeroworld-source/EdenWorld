/**
 * A conversa: liga a árvore de diálogo à caixa de rodapé.
 *
 * O `DialogueRunner` sabe o que é dito e o que isso muda no jogo; a
 * `DialogueBox` sabe desenhar. Este arquivo é o maestro entre os dois —
 * e é quem avisa o resto do jogo, a cada fala, para o personagem mexer
 * o rosto, gesticular e (quando houver) falar em voz alta.
 *
 * A tela continua sendo uma `Screen` da pilha da interface: ganha de
 * graça o foco por teclado, a navegação por controle, o Esc e o toque.
 * O que mudou é a aparência — não ocupa mais o meio do mundo.
 */

import type { DialogueEffect, DialogueNode, DialogueRunner } from '../characters/Dialogue';
import type { Expression } from '../player/Expressions';
import type { GestureId } from '../player/Gestures';
import { DialogueBox, type DialogueSpeaker } from './DialogueBox';
import type { Screen } from './UIManager';

export type { DialogueSpeaker } from './DialogueBox';

/** Uma fala que acabou de entrar na tela. */
export interface DialogueLineEvent {
  nodeId: string;
  /** Texto da página que está aparecendo. */
  text: string;
  /** Índice da página dentro do nó. */
  pageIndex: number;
  /** `true` na primeira página de um nó novo. */
  first: boolean;
  /** Expressão pedida pelo nó. */
  mood?: Expression;
  /** Gesto pedido pelo nó (só na primeira página). */
  gesture?: GestureId;
}

export interface DialogueScreenOptions {
  id?: string;
  speaker: DialogueSpeaker;
  runner: DialogueRunner;
  /** Nome de quem joga, usado no histórico. */
  playerName?: string;
  /** Mostra o texto de uma vez (acessibilidade). */
  instantText?: boolean;
  /** Chamado com os efeitos novos a cada passo da conversa. */
  onEffects(effects: readonly DialogueEffect[]): void;
  onClose(): void;
  /** Uma fala começou a aparecer. */
  onLine?(event: DialogueLineEvent): void;
  /** Nível da boca: 1 enquanto as letras aparecem, 0 quando param. */
  onTalking?(level: number): void;
  /** O jogador escolheu uma resposta. */
  onChoice?(label: string, index: number): void;
}

export class DialogueScreen implements Screen {
  readonly id: string;
  readonly element: HTMLDivElement;

  private readonly box: DialogueBox;
  private readonly runner: DialogueRunner;
  private readonly playerName: string;
  private appliedCount = 0;
  private talking = false;
  private closed = false;

  constructor(private readonly options: DialogueScreenOptions) {
    this.id = options.id ?? 'conversa';
    this.runner = options.runner;
    this.playerName = options.playerName ?? 'Você';

    this.box = new DialogueBox({
      speaker: options.speaker,
      sequence: { instant: options.instantText },
      onAdvance: () => this.advance(),
      onChoice: (index) => this.pick(index),
    });

    this.element = document.createElement('div');
    // Sem `screen--dim`: a conversa acontece com o mundo à vista.
    this.element.className = 'screen screen--talk';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', `Conversa com ${options.speaker.name}`);
    this.element.appendChild(this.box.element);

    this.enter(this.runner.current, true);
  }

  /* ----------------------------- Passos ----------------------------- */

  /** Entra em um nó: aplica efeitos, mostra o texto, avisa o mundo. */
  private enter(node: DialogueNode, first: boolean): void {
    this.flushEffects();
    this.box.say(node.text, this.options.speaker.name);
    this.setTalking(true);
    this.options.onLine?.({
      nodeId: node.id,
      text: node.text[0] ?? '',
      pageIndex: 0,
      first,
      mood: node.mood,
      gesture: node.gesture,
    });
    // As respostas só aparecem quando o nó inteiro foi dito: primeiro
    // ouvir, depois responder.
    if (this.box.finished) this.offerChoices();
  }

  /** O jogador pediu para continuar. */
  private advance(): void {
    if (this.closed) return;
    const node = this.runner.current;
    const before = this.box.pageIndex;
    if (this.box.advance()) {
      // Ainda havia texto: ou completou a página, ou virou a página.
      if (this.box.pageIndex !== before) {
        this.options.onLine?.({
          nodeId: node.id,
          text: node.text[this.box.pageIndex] ?? '',
          pageIndex: this.box.pageIndex,
          first: false,
          mood: node.mood,
        });
        this.setTalking(true);
      } else {
        this.setTalking(false);
      }
      if (this.box.finished) this.offerChoices();
      return;
    }
    this.setTalking(false);
    // Texto esgotado: sem respostas, a conversa acaba aqui.
    if (this.runner.choices.length === 0) {
      this.close();
      return;
    }
    this.offerChoices();
  }

  /** Publica as respostas disponíveis no nó atual. */
  private offerChoices(): void {
    const choices = this.runner.choices;
    if (choices.length === 0) {
      this.box.hideChoices();
      return;
    }
    if (this.box.hasChoices) return;
    this.box.showChoices(choices.map((choice) => ({ label: choice.label })));
  }

  private pick(index: number): void {
    if (this.closed) return;
    const choice = this.runner.choices[index];
    if (choice) {
      this.box.recordChoice(choice.label, this.playerName);
      this.options.onChoice?.(choice.label, index);
    }
    const next = this.runner.choose(index);
    this.flushEffects();
    if (!next) {
      this.close();
      return;
    }
    this.box.hideChoices();
    this.enter(next, false);
    this.box.focusTarget()?.focus({ preventScroll: true });
  }

  private setTalking(value: boolean): void {
    if (this.talking === value) return;
    this.talking = value;
    this.options.onTalking?.(value ? 1 : 0);
  }

  private flushEffects(): void {
    const applied = this.runner.applied;
    if (applied.length > this.appliedCount) {
      this.options.onEffects(applied.slice(this.appliedCount));
      this.appliedCount = applied.length;
    }
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.runner.end();
    this.flushEffects();
    this.setTalking(false);
    this.options.onClose();
  }

  /* ---------------------------- Interface ---------------------------- */

  /** Letra a letra. Chamado pela pilha de telas, uma vez por quadro. */
  update(): void {
    if (this.closed) return;
    this.box.update();
    if (this.talking && !this.box.revealing) {
      this.setTalking(false);
      if (this.box.finished) this.offerChoices();
    }
  }

  /** Esc ou botão B: a conversa pode ser interrompida a qualquer momento. */
  onBack(): void {
    this.close();
  }

  onClose(): void {
    this.box.dispose();
  }

  initialFocus(): HTMLElement | null {
    return this.box.focusTarget();
  }
}
