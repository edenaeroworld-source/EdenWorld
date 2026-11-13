/**
 * O tempo de uma fala.
 *
 * Um nó de diálogo tem vários parágrafos; a caixa mostra um de cada vez
 * e revela as letras aos poucos, como um RPG clássico. Esta classe é só
 * essa contagem — quantas letras já apareceram, qual página está no ar,
 * o que acontece quando o jogador aperta o botão.
 *
 * Fica fora da interface de propósito: é a parte que precisa de teste
 * (velocidade, pular, virar página) e a que não precisa de navegador.
 *
 * Módulo puro: sem DOM, sem Three.js.
 */

/** Letras por segundo no ritmo normal. */
export const DEFAULT_CPS = 48;

/** Pausa extra (s) depois de cada sinal de pontuação forte. */
const PUNCTUATION_PAUSE: Readonly<Record<string, number>> = { '.': 0.22, '!': 0.22, '?': 0.22, ',': 0.1, ';': 0.12, ':': 0.12, '…': 0.3 };

export interface SequenceOptions {
  /** Letras por segundo. */
  cps?: number;
  /** `true` mostra tudo de uma vez (preferência de acessibilidade). */
  instant?: boolean;
}

/** O que aconteceu quando o jogador pediu para continuar. */
export type AdvanceResult = 'revelou' | 'pagina' | 'fim';

export class DialogueSequence {
  readonly pages: readonly string[];
  private readonly cps: number;
  private readonly instant: boolean;
  private index = 0;
  private shown = 0;
  private hold = 0;

  constructor(pages: readonly string[], options: SequenceOptions = {}) {
    // Parágrafo vazio não vira página em branco.
    const clean = pages.map((page) => page.trim()).filter((page) => page.length > 0);
    this.pages = clean.length > 0 ? clean : [''];
    this.cps = Math.max(8, options.cps ?? DEFAULT_CPS);
    this.instant = options.instant ?? false;
    if (this.instant) this.shown = this.pages[0].length;
  }

  /** Texto completo da página atual. */
  get page(): string {
    return this.pages[this.index] ?? '';
  }

  /** Trecho já revelado da página atual. */
  get visible(): string {
    return this.page.slice(0, this.shown);
  }

  get pageIndex(): number {
    return this.index;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** `true` enquanto ainda há letras para aparecer nesta página. */
  get revealing(): boolean {
    return this.shown < this.page.length;
  }

  /** `true` quando esta é a última página e ela já apareceu inteira. */
  get finished(): boolean {
    return this.index >= this.pages.length - 1 && !this.revealing;
  }

  /** `true` quando ainda há outra página depois desta. */
  get hasNext(): boolean {
    return this.index < this.pages.length - 1;
  }

  /**
   * Avança o relógio.
   *
   * @returns quantas letras apareceram neste passo — a caixa usa esse
   *   número para mexer a boca do personagem e tocar o clique do texto.
   */
  update(dt: number): number {
    if (dt <= 0 || !this.revealing) return 0;
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold > 0) return 0;
    }
    const page = this.page;
    let budget = dt * this.cps;
    let revealed = 0;
    while (budget >= 1 && this.shown < page.length) {
      const char = page[this.shown];
      this.shown += 1;
      revealed += 1;
      budget -= 1;
      const pause = PUNCTUATION_PAUSE[char];
      // Respira na pontuação, mas não no último caractere da página.
      if (pause !== undefined && this.shown < page.length) {
        this.hold = pause;
        break;
      }
    }
    return revealed;
  }

  /** Mostra a página inteira de uma vez. */
  skip(): void {
    this.shown = this.page.length;
    this.hold = 0;
  }

  /** Vai para a próxima página. `false` quando não há. */
  next(): boolean {
    if (!this.hasNext) return false;
    this.index += 1;
    this.shown = this.instant ? this.page.length : 0;
    this.hold = 0;
    return true;
  }

  /**
   * O botão de continuar, com a regra clássica: primeiro completa o
   * texto, depois vira a página, e só então entrega a conversa de volta
   * a quem chamou.
   */
  advance(): AdvanceResult {
    if (this.revealing) {
      this.skip();
      return 'revelou';
    }
    if (this.next()) return 'pagina';
    return 'fim';
  }
}
