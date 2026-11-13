// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Benchmark, formatReport, readBenchmarkRequest } from '../../src/systems/Benchmark';
import { NpcSystem } from '../../src/npc/NpcSystem';
import { QUALITY_LEVELS, QualitySystem, type QualityLevel, defaultGraphicsSettings } from '../../src/systems/QualitySystem';

/**
 * Desempenho — o que dá para medir aqui, e o que não dá.
 *
 * **Não dá** para medir FPS: isso depende de GPU, de tela e de aparelho,
 * e aqui não há navegador nem placa de vídeo. Qualquer número de quadros
 * por segundo que saísse deste arquivo seria invenção.
 *
 * **Dá** para medir o custo de CPU da simulação — a parte que roda igual
 * em qualquer aparelho e que, num celular, é justamente a que sobra para
 * disputar tempo com o desenho. É o que este arquivo faz: roda a cidade
 * inteira, cronometra, e verifica que baixar a qualidade realmente
 * **custa menos**, em vez de só mudar um rótulo na tela.
 *
 * A medição de FPS de verdade mora em `src/systems/Benchmark.ts` e se
 * liga com `?bench` no aparelho real.
 */

function makeCity(level: QualityLevel) {
  const scene = new THREE.Scene();
  const profile = new QualitySystem(defaultGraphicsSettings(level)).current;
  const npcs = new NpcSystem({ scene, ground: () => 0, blocked: () => false, quality: profile });
  return { npcs, profile };
}

interface CityCost {
  /** Passos de simulação de habitante executados por segundo de jogo. */
  stepsPerSecond: number;
  /** Avatares desenhados ao fim da medição (procuração do custo de GPU). */
  drawn: number;
  /** Tempo de CPU por quadro, em milissegundos — informativo, não normativo. */
  msPerFrame: number;
}

/**
 * Roda a cidade por alguns segundos e conta o trabalho feito.
 *
 * A contagem de passos é **determinística**: é o número de vezes que a
 * rotina de um habitante foi avançada. O tempo em milissegundos vai junto
 * só como informação — nesta máquina a simulação é barata demais para que
 * a diferença entre níveis saia do ruído, e um teste que dependesse dela
 * falharia ao acaso.
 */
function measureCity(level: QualityLevel, seconds: number, warmup = 1): CityCost {
  const { npcs } = makeCity(level);
  const dt = 1 / 60;
  // Aquecimento: a primeira passagem cria avatares e aquece o JIT.
  for (let t = 0; t < warmup * 60; t++) {
    npcs.setFocus(0, 0, 30);
    npcs.update(dt, t * dt);
  }

  // Conta cada avanço de habitante, sem tocar na classe de produção.
  let steps = 0;
  for (const person of npcs.people) {
    const original = person.update.bind(person);
    (person as unknown as { update: (d: number) => void }).update = (d: number) => {
      steps += 1;
      original(d);
    };
  }

  const frames = Math.round(seconds * 60);
  const start = performance.now();
  for (let t = 0; t < frames; t++) {
    npcs.setFocus(0, 0, 30);
    npcs.update(dt, (warmup * 60 + t) * dt);
  }
  const elapsed = performance.now() - start;
  const drawn = npcs.people.filter((person) => person.distanceTo(0, 30) <= QualitySystem.preset(level).npcRange).length;
  npcs.dispose();
  return { stepsPerSecond: steps / seconds, drawn: Math.min(drawn, QualitySystem.preset(level).npcVisible), msPerFrame: elapsed / frames };
}

describe('a qualidade gráfica mexe no custo, não só no rótulo', () => {
  it('cada nível desenha mais gente, vê mais longe e simula mais vezes', () => {
    const levels = QUALITY_LEVELS.map((level) => QualitySystem.preset(level));
    for (let i = 1; i < levels.length; i++) {
      const lower = levels[i - 1];
      const higher = levels[i];
      expect(higher.npcVisible).toBeGreaterThanOrEqual(lower.npcVisible);
      expect(higher.npcRange).toBeGreaterThan(lower.npcRange);
      expect(higher.viewDistance).toBeGreaterThan(lower.viewDistance);
      expect(higher.particleDensity).toBeGreaterThanOrEqual(lower.particleDensity);
      expect(higher.detailDistance).toBeGreaterThan(lower.detailDistance);
    }
    // `0` em Ultra quer dizer "todo quadro": é o passo mais fino possível.
    expect(QualitySystem.preset('ultra').npcSimHz).toBe(0);
    expect(QualitySystem.preset('baixa').npcSimHz).toBeLessThan(QualitySystem.preset('alta').npcSimHz);
  });

  it('os efeitos de ambiente só ficam de fora na qualidade Baixa', () => {
    expect(QualitySystem.preset('baixa').environmentEffects).toBe(false);
    expect(QualitySystem.preset('media').environmentEffects).toBe(true);
    expect(QualitySystem.preset('ultra').environmentEffects).toBe(true);
  });

  it('baixar a qualidade corta trabalho de verdade — contado, não suposto', () => {
    const low = measureCity('baixa', 4);
    const ultra = measureCity('ultra', 4);
    console.info(
      `[desempenho] passos de habitante por segundo: baixa ${Math.round(low.stepsPerSecond)} · ultra ${Math.round(ultra.stepsPerSecond)}\n` +
        `[desempenho] CPU por quadro (só simulação, sem GPU): baixa ${low.msPerFrame.toFixed(3)} ms · ultra ${ultra.msPerFrame.toFixed(3)} ms`,
    );

    // Em Ultra, os 54 habitantes avançam em todo quadro: 54 × 60.
    expect(ultra.stepsPerSecond).toBeCloseTo(54 * 60, -2);
    // Em Baixa, só os desenhados andam a 60; o resto vai a 12 Hz.
    expect(low.stepsPerSecond).toBeLessThan(ultra.stepsPerSecond * 0.45);
    // E menos gente desenhada: menos avatar na tela, menos chamada de desenho.
    expect(low.drawn).toBeLessThan(ultra.drawn);
  });

  it('a simulação em frequência reduzida não perde ninguém pelo caminho', () => {
    // Mesma cidade, mesmo tempo, ritmos diferentes: todos continuam dentro
    // do mapa e andando. Passo maior não é passo perdido.
    for (const level of ['baixa', 'ultra'] as const) {
      const { npcs } = makeCity(level);
      const dt = 1 / 60;
      for (let t = 0; t < 600; t++) {
        npcs.setFocus(0, 0, 30);
        npcs.update(dt, t * dt);
      }
      expect(npcs.population).toBe(54);
      for (const person of npcs.people) {
        expect(Number.isFinite(person.x)).toBe(true);
        expect(Math.hypot(person.x, person.z)).toBeLessThan(400);
      }
      npcs.dispose();
    }
  });

  it('quem está à vista anda todo quadro, mesmo na qualidade Baixa', () => {
    const { npcs } = makeCity('baixa');
    const dt = 1 / 60;
    for (let t = 0; t < 900; t++) {
      npcs.setFocus(0, 0, 30);
      npcs.update(dt, t * dt);
    }
    // Pega alguém desenhado e confere que ele se move entre dois quadros
    // seguidos — sem esperar a fatia da simulação lenta.
    const drawn = npcs.people.filter((person) => person.distanceTo(0, 30) < 20 && person.activity === 'andando');
    expect(drawn.length).toBeGreaterThan(0);
    const moved = drawn.map((person) => `${person.x.toFixed(4)}:${person.z.toFixed(4)}`);
    npcs.setFocus(0, 0, 30);
    npcs.update(dt, 901 * dt);
    const after = drawn.map((person) => `${person.x.toFixed(4)}:${person.z.toFixed(4)}`);
    expect(after.some((value, index) => value !== moved[index])).toBe(true);
    npcs.dispose();
  });
});

describe('o medidor de FPS', () => {
  /** Alimenta o medidor com quadros de duração fixa. */
  function feed(bench: Benchmark, frames: number, ms: number): void {
    for (let i = 0; i < frames; i++) bench.sample(ms / 1000);
  }

  it('descarta o aquecimento antes de começar a contar', () => {
    const bench = new Benchmark(1, 5);
    feed(bench, 5, 100);
    expect(bench.frameCount).toBe(0);
    feed(bench, 3, 16.7);
    expect(bench.frameCount).toBe(3);
  });

  it('calcula média, mediana e o 1% pior', () => {
    const bench = new Benchmark(10, 0);
    feed(bench, 99, 1000 / 60);
    // Um engasgo de 200 ms no meio de 99 quadros bons.
    bench.sample(0.2);
    const report = bench.report({ device: 'teste', quality: 'alta', target: 60, resolutionScale: 1, drawCalls: 120, triangles: 400000 });
    expect(report.frames).toBe(100);
    // A média mal percebe o engasgo…
    expect(report.averageFps).toBeGreaterThan(40);
    // …a mediana, nada…
    expect(report.medianFps).toBeCloseTo(60, 0);
    // …mas o 1% pior entrega: 200 ms são 5 FPS.
    expect(report.onePercentLowFps).toBeLessThan(10);
    expect(report.minFps).toBeCloseTo(5, 0);
    expect(report.withinTarget).toBeCloseTo(0.99, 2);
  });

  it('termina sozinho quando o tempo pedido acaba', () => {
    const bench = new Benchmark(0.5, 0);
    expect(bench.running).toBe(true);
    let finished = false;
    for (let i = 0; i < 1000 && !finished; i++) finished = bench.sample(1 / 60);
    expect(finished).toBe(true);
    expect(bench.running).toBe(false);
    expect(bench.progress).toBe(1);
    // Depois de fechado, não aceita mais nada.
    const before = bench.frameCount;
    bench.sample(1 / 60);
    expect(bench.frameCount).toBe(before);
  });

  it('o relatório em texto diz o aparelho, a meta e o 1% pior', () => {
    const bench = new Benchmark(1, 0);
    feed(bench, 60, 1000 / 30);
    const text = formatReport(bench.report({ device: 'Android · celular', quality: 'media', target: 30, resolutionScale: 0.8, drawCalls: 90, triangles: 250000 }));
    expect(text).toContain('Android · celular');
    expect(text).toContain('meta 30 FPS');
    expect(text).toContain('1% pior');
    expect(text).toContain('80%');
  });

  it('lê o pedido de medição da URL', () => {
    expect(readBenchmarkRequest('')).toBeNull();
    expect(readBenchmarkRequest('?debug')).toBeNull();
    expect(readBenchmarkRequest('?bench')).toBe(20);
    expect(readBenchmarkRequest('?bench=10')).toBe(10);
    // Fora da faixa razoável, o pedido é contido.
    expect(readBenchmarkRequest('?bench=9999')).toBe(120);
    expect(readBenchmarkRequest('?bench=-5')).toBe(20);
  });
});

describe('a resolução dinâmica persegue a meta escolhida', () => {
  function system(target: 30 | 60) {
    return new QualitySystem({ ...defaultGraphicsSettings('alta'), dynamicResolution: true, fpsTarget: target });
  }

  it('com meta de 30, rodar a 45 é folga — não reduz nada', () => {
    const quality = system(30);
    for (let i = 0; i < 100; i++) quality.monitor(0.5, 45);
    expect(quality.dynamicResolutionScale).toBe(1);
  });

  it('com meta de 60, rodar a 45 reduz a resolução', () => {
    const quality = system(60);
    for (let i = 0; i < 100; i++) quality.monitor(0.5, 45);
    expect(quality.dynamicResolutionScale).toBeLessThan(1);
  });

  it('com meta de 60 numa tela de 60 Hz, a resolução volta a subir', () => {
    // O caso que um teto acima da meta quebraria: com vsync, o jogo nunca
    // passa de 60, e a resolução ficaria presa embaixo para sempre.
    const quality = system(60);
    for (let i = 0; i < 100; i++) quality.monitor(0.5, 40);
    const reduced = quality.dynamicResolutionScale;
    expect(reduced).toBeLessThan(1);
    for (let i = 0; i < 400; i++) quality.monitor(0.5, 59.9);
    expect(quality.dynamicResolutionScale).toBeGreaterThan(reduced);
  });

  it('nunca desce abaixo do piso, por pior que seja o desempenho', () => {
    const quality = system(60);
    for (let i = 0; i < 2000; i++) quality.monitor(0.5, 5);
    expect(quality.dynamicResolutionScale).toBeGreaterThanOrEqual(0.55);
    expect(quality.current.resolutionScale).toBeGreaterThan(0.3);
  });
});
