/**
 * Modelo de diálogo do EDENWORLD.
 *
 * Uma conversa é uma árvore de nós: cada nó tem texto e, opcionalmente,
 * escolhas que levam a outros nós. Nós e escolhas podem aplicar efeitos
 * (ganhar um contato no EdenPhone, abrir um registro no diário, marcar
 * uma bandeira de história, liberar os Afters).
 *
 * Um nó pode ainda dizer **como** a fala é dita: a expressão do rosto e
 * um gesto. São dicas opcionais — quem não as declara fala com o rosto
 * de descanso do personagem.
 *
 * Módulo puro: sem DOM, sem Three.js (testável).
 */

import type { GestureId } from '../player/Gestures';
import type { Expression } from '../player/Expressions';

export type DialogueEffectKind = 'contato' | 'diario' | 'bandeira' | 'afters' | 'mensagem';

export interface DialogueEffect {
  kind: DialogueEffectKind;
  id: string;
}

export interface DialogueChoice {
  label: string;
  /** Nó de destino; ausente encerra a conversa. */
  to?: string;
  /** Só aparece se esta bandeira já estiver marcada. */
  requires?: string;
  /** Some depois que esta bandeira for marcada. */
  hiddenAfter?: string;
  effects?: readonly DialogueEffect[];
}

/** Dicas de atuação de um nó: como a fala é dita, não o que é dito. */
export interface DialoguePerformance {
  /** Expressão do rosto enquanto o nó é lido. */
  mood?: Expression;
  /** Gesto disparado quando o nó começa. */
  gesture?: GestureId;
}

export interface DialogueNode {
  id: string;
  /** Parágrafos falados pelo personagem. */
  text: readonly string[];
  /** Efeitos aplicados ao chegar neste nó. */
  effects?: readonly DialogueEffect[];
  choices?: readonly DialogueChoice[];
  /** Expressão do rosto neste nó (padrão: a de descanso do personagem). */
  mood?: Expression;
  /** Gesto disparado ao entrar no nó. */
  gesture?: GestureId;
}

export interface DialogueTree {
  start: string;
  nodes: readonly DialogueNode[];
}

/** Conjunto de bandeiras de história do jogador (persistido no salvamento). */
export interface FlagStore {
  has(flag: string): boolean;
  add(flag: string): void;
}

export class MemoryFlags implements FlagStore {
  private readonly flags: Set<string>;

  constructor(initial: Iterable<string> = []) {
    this.flags = new Set(initial);
  }

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  add(flag: string): void {
    this.flags.add(flag);
  }

  get all(): readonly string[] {
    return [...this.flags];
  }
}

/**
 * Executa uma árvore de diálogo: guarda o nó atual, filtra as escolhas
 * válidas e acumula os efeitos aplicados.
 */
export class DialogueRunner {
  private node: DialogueNode;
  private finished = false;
  /** Efeitos aplicados nesta conversa, na ordem. */
  readonly applied: DialogueEffect[] = [];

  constructor(
    private readonly tree: DialogueTree,
    private readonly flags: FlagStore,
    /** Nó inicial alternativo (ex.: reencontro em vez de primeira conversa). */
    startId?: string,
  ) {
    const start = this.find(startId ?? tree.start);
    if (!start) throw new Error(`[Dialogue] Nó inicial desconhecido: ${startId ?? tree.start}`);
    this.node = start;
    this.applyEffects(start.effects);
  }

  private find(id: string): DialogueNode | undefined {
    return this.tree.nodes.find((node) => node.id === id);
  }

  private applyEffects(effects: readonly DialogueEffect[] | undefined): void {
    if (!effects) return;
    for (const effect of effects) {
      this.applied.push(effect);
      if (effect.kind === 'bandeira') this.flags.add(effect.id);
    }
  }

  get current(): DialogueNode {
    return this.node;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Escolhas visíveis no nó atual, já filtradas pelas bandeiras. */
  get choices(): readonly DialogueChoice[] {
    const choices = this.node.choices ?? [];
    return choices.filter((choice) => {
      if (choice.requires && !this.flags.has(choice.requires)) return false;
      if (choice.hiddenAfter && this.flags.has(choice.hiddenAfter)) return false;
      return true;
    });
  }

  /**
   * Segue uma escolha. Retorna o novo nó, ou `null` quando a conversa acaba.
   */
  choose(index: number): DialogueNode | null {
    if (this.finished) return null;
    const choice = this.choices[index];
    if (!choice) return null;
    this.applyEffects(choice.effects);
    if (!choice.to) {
      this.finished = true;
      return null;
    }
    const next = this.find(choice.to);
    if (!next) {
      this.finished = true;
      return null;
    }
    this.node = next;
    this.applyEffects(next.effects);
    if (this.choices.length === 0) {
      // Nó folha: a conversa termina quando o jogador fechar a tela.
      this.finished = true;
    }
    return next;
  }

  /** Encerra a conversa (botão fechar / voltar). */
  end(): void {
    this.finished = true;
  }
}

/** Valida uma árvore: todos os destinos existem e o início é alcançável. */
export function validateDialogue(tree: DialogueTree): string[] {
  const problems: string[] = [];
  const ids = new Set(tree.nodes.map((node) => node.id));
  if (!ids.has(tree.start)) problems.push(`nó inicial ausente: ${tree.start}`);
  for (const node of tree.nodes) {
    for (const choice of node.choices ?? []) {
      if (choice.to && !ids.has(choice.to)) problems.push(`${node.id} → destino inexistente: ${choice.to}`);
    }
  }
  return problems;
}
