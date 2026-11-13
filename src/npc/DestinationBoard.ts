import type { Rng } from '../utils/math';

/**
 * Quadro de destinos: quem está indo para onde.
 *
 * Cinquenta e quatro pessoas sorteando destino cada uma por si não
 * formam uma cidade — formam uma coincidência atrás da outra. Nada
 * impedia que meia dúzia escolhesse o mesmo ponto do anel da praça no
 * mesmo minuto, e menos ainda que todas as que têm `praca` na rotina
 * fossem para o mesmo canteiro quando o período do dia virava.
 *
 * Este quadro é a única coisa que uma pessoa sabe sobre as outras: o
 * ponto para onde já há gente a caminho. Não é coordenação — ninguém
 * combina nada —, é só o que qualquer um percebe ao olhar a praça e
 * escolher o banco vazio em vez do ocupado.
 */
export class DestinationBoard {
  private readonly claims = new Map<number, number>();

  /** Quantas pessoas já estão a caminho deste nó. */
  count(node: number): number {
    return this.claims.get(node) ?? 0;
  }

  claim(node: number): void {
    if (node < 0) return;
    this.claims.set(node, this.count(node) + 1);
  }

  release(node: number): void {
    if (node < 0) return;
    const left = this.count(node) - 1;
    if (left > 0) this.claims.set(node, left);
    else this.claims.delete(node);
  }

  clear(): void {
    this.claims.clear();
  }

  /** Total de destinos distintos reservados (leitura para testes). */
  get distinct(): number {
    return this.claims.size;
  }

  /**
   * O candidato menos disputado.
   *
   * Empate é desempatado por sorteio, senão a ordem da lista vira uma
   * preferência escondida e todo mundo cai no mesmo primeiro nó.
   */
  leastBusy(candidates: readonly number[], rng: Rng): number {
    if (candidates.length === 0) return -1;
    let best = Infinity;
    const tied: number[] = [];
    for (const node of candidates) {
      const claims = this.count(node);
      if (claims < best) {
        best = claims;
        tied.length = 0;
      }
      if (claims === best) tied.push(node);
    }
    return tied[Math.min(tied.length - 1, Math.floor(rng() * tied.length))];
  }
}
