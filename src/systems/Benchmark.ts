/**
 * Medidor de desempenho.
 *
 * Este arquivo não melhora o jogo: ele **mede**. Existe porque "roda bem
 * no celular" não é afirmação que se faça sem número, e porque o ambiente
 * em que o jogo é desenvolvido não tem celular nenhum. Quem tiver o
 * aparelho na mão roda a medição e obtém dados reais.
 *
 *     https://…/?bench          mede 20 s no nível atual
 *     https://…/?bench=10       mede 10 s
 *
 * O que sai é um relatório com a taxa média, a mediana, o 1% pior (que é
 * onde mora o engasgo que o jogador sente) e o número de quadros acima da
 * meta. Nada disso é estimado: são os intervalos reais entre quadros.
 */

export interface BenchmarkReport {
  /** Rótulo do aparelho, como detectado. */
  device: string;
  quality: string;
  /** Meta de quadros configurada no momento da medição. */
  target: number;
  seconds: number;
  frames: number;
  averageFps: number;
  medianFps: number;
  /** Taxa do 1% pior quadro: o engasgo que se sente, não a média que consola. */
  onePercentLowFps: number;
  minFps: number;
  maxFps: number;
  /** Fração (0–1) de quadros entregues dentro da meta. */
  withinTarget: number;
  /** Resolução interna em uso ao fim da medição (a dinâmica pode ter mexido). */
  resolutionScale: number;
  /** Chamadas de desenho e triângulos no último quadro medido. */
  drawCalls: number;
  triangles: number;
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index];
}

/**
 * Média do 1% de quadros mais lentos — a medida que a indústria chama de
 * "1% low". Não é o percentil 99: é a **média dos piores**, que é o que
 * corresponde ao engasgo percebido.
 */
function worstPercentMean(sortedAscending: number[]): number {
  if (sortedAscending.length === 0) return 0;
  const count = Math.max(1, Math.ceil(sortedAscending.length / 100));
  const worst = sortedAscending.slice(-count);
  return worst.reduce((sum, ms) => sum + ms, 0) / count;
}

/**
 * Acumula tempos de quadro e fecha um relatório.
 *
 * Os primeiros quadros são descartados de propósito: compilação de
 * shader, alocação de textura e o primeiro desenho de cada material
 * aparecem ali e não representam o jogo em regime.
 */
export class Benchmark {
  private readonly samples: number[] = [];
  private warmupLeft: number;
  private elapsed = 0;
  private finished = false;

  constructor(
    readonly seconds: number,
    warmupFrames = 30,
  ) {
    this.warmupLeft = warmupFrames;
  }

  get running(): boolean {
    return !this.finished;
  }

  get progress(): number {
    return Math.min(1, this.elapsed / this.seconds);
  }

  get frameCount(): number {
    return this.samples.length;
  }

  /** Registra um quadro. Devolve `true` quando a medição termina. */
  sample(dtSeconds: number): boolean {
    if (this.finished || dtSeconds <= 0) return this.finished;
    if (this.warmupLeft > 0) {
      this.warmupLeft -= 1;
      return false;
    }
    this.samples.push(dtSeconds * 1000);
    this.elapsed += dtSeconds;
    if (this.elapsed >= this.seconds) this.finished = true;
    return this.finished;
  }

  report(context: { device: string; quality: string; target: number; resolutionScale: number; drawCalls: number; triangles: number }): BenchmarkReport {
    const times = [...this.samples].sort((a, b) => a - b);
    const total = this.samples.reduce((sum, ms) => sum + ms, 0);
    const frames = this.samples.length;
    const budget = 1000 / context.target;
    const within = this.samples.filter((ms) => ms <= budget).length;
    // Tempos ordenados do menor ao maior: o 1% pior são os maiores.
    const worst = worstPercentMean(times);
    return {
      ...context,
      seconds: total / 1000,
      frames,
      averageFps: frames > 0 ? 1000 / (total / frames) : 0,
      medianFps: 1000 / (percentile(times, 0.5) || 1),
      onePercentLowFps: 1000 / (worst || 1),
      minFps: 1000 / (times[times.length - 1] || 1),
      maxFps: 1000 / (times[0] || 1),
      withinTarget: frames > 0 ? within / frames : 0,
      resolutionScale: context.resolutionScale,
      drawCalls: context.drawCalls,
      triangles: context.triangles,
    };
  }
}

/** Relatório em texto, pronto para colar num relato de teste. */
export function formatReport(report: BenchmarkReport): string {
  const pct = (value: number): string => `${Math.round(value * 100)}%`;
  const fps = (value: number): string => value.toFixed(1);
  return [
    `EDENWORLD — medição de desempenho`,
    `Aparelho: ${report.device}`,
    `Qualidade: ${report.quality} · meta ${report.target} FPS · resolução ${pct(report.resolutionScale)}`,
    `Amostra: ${report.frames} quadros em ${report.seconds.toFixed(1)} s`,
    `Média: ${fps(report.averageFps)} FPS · mediana: ${fps(report.medianFps)} FPS`,
    `1% pior: ${fps(report.onePercentLowFps)} FPS · mínimo: ${fps(report.minFps)} · máximo: ${fps(report.maxFps)}`,
    `Dentro da meta: ${pct(report.withinTarget)} dos quadros`,
    `Último quadro: ${report.drawCalls} chamadas de desenho, ${report.triangles.toLocaleString('pt-BR')} triângulos`,
  ].join('\n');
}

/** Lê `?bench` / `?bench=15` da URL. `null` quando não foi pedido. */
export function readBenchmarkRequest(search: string): number | null {
  const params = new URLSearchParams(search);
  if (!params.has('bench')) return null;
  const raw = Number(params.get('bench'));
  if (!Number.isFinite(raw) || raw <= 0) return 20;
  return Math.min(120, Math.max(3, raw));
}
