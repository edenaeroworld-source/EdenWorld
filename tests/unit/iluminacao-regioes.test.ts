// @vitest-environment happy-dom
/**
 * Viajar não pode acender a luz da cidade seguinte.
 *
 * O relato, duas vezes seguidas e em direções opostas: depois do Marco
 * L, ir de Aurora City para Rosas Park deixava **Rosas Park** clara
 * demais; antes disso, voltar de Rosas Park deixava **Aurora City**
 * clara demais. Sempre o destino, nunca a origem.
 *
 * A causa, medida: `Lighting` acrescenta um sol direcional e uma luz
 * hemisférica **à cena** no construtor, e `dispose()` nunca as tirava
 * de lá. No Three.js, `dispose()` libera memória de GPU; não desfaz o
 * `scene.add`. Como a cena vive a sessão inteira e as regiões vão e
 * vêm por baixo dela, cada viagem deixava para trás um sol aceso, com
 * a última intensidade que tinha recebido, somando-se ao sol da região
 * seguinte. O mesmo com o céu e as nuvens.
 *
 * Medido antes da correção, às 14h: 2 luzes e intensidade somada 3,82
 * na primeira região; 4 luzes e 7,64 depois de uma viagem; 10 luzes e
 * 19,10 depois de quatro. **Exatamente o dobro por viagem.**
 *
 * Isto também explica por que o Marco L pareceu resolver e não
 * resolveu: eram dois vazamentos independentes na mesma cena. O Marco
 * L consertou o relógio e a intensidade de ambiente; as luzes
 * continuaram se acumulando.
 *
 * O que se verifica aqui, com o `Environment` de verdade:
 *
 *  A. Aurora → Rosas de dia.
 *  B. Aurora → Rosas de noite.
 *  C. Rosas → Aurora de dia.
 *  D. Rosas → Aurora de noite.
 *  E. Dez ciclos de ida e volta.
 *  F. Abrir o jogo direto em cada região.
 *  G. Os parâmetros visuais antes e depois da viagem.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Environment } from '../../src/world/Environment';
import { Lighting } from '../../src/world/Lighting';
import {
  AMBIENT_LIGHT_NAME,
  CLOUD_GROUP_NAME,
  SKY_GROUP_NAME,
  SUN_LIGHT_NAME,
  checkLightingIsolation,
  checkSceneCleared,
  readSceneLighting,
  type SceneLightingReport,
} from '../../src/world/SceneLighting';
import type { EnvironmentQuality } from '../../src/world/Environment';

/* --------------------- o mundo sem placa de vídeo --------------------- */

/**
 * O mínimo de renderizador que o `Environment` precisa.
 *
 * Não há WebGL neste ambiente, mas o vazamento não está no desenho: ele
 * está em quem entra e quem sai da cena. Com este substituto o
 * `Environment` **de verdade** roda inteiro — construtor, `update` com
 * captura de reflexo, e `dispose` — e é ele que os testes exercitam,
 * não um modelo do que ele faz.
 */
function stubRenderer(): THREE.WebGLRenderer {
  return {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    coordinateSystem: THREE.WebGLCoordinateSystem,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    compile: () => {},
    setRenderTargetTextures: () => {},
    initRenderTarget: () => {},
    properties: { get: () => ({}) },
    info: { autoReset: true, reset: () => {}, render: {} },
    state: { buffers: { depth: { getReversed: () => false } } },
    capabilities: { isWebGL2: true },
    getContext: () => ({}),
    xr: { enabled: false },
  } as unknown as THREE.WebGLRenderer;
}

/** O perfil "alta", fixo: a qualidade não é a variável sob teste aqui. */
const QUALITY: EnvironmentQuality = {
  shadows: { enabled: true, mapSize: 2048, distance: 120 },
  cloudCount: 18,
  cloudDetail: 1,
  viewDistance: 900,
  envUpdateHours: 0.5,
};

/**
 * Um mundo que troca de região por baixo da cena, como o motor faz.
 *
 * A ordem é a do `runRegionTransition`, e importa:
 *
 *   guardar  → a hora do relógio é anotada (`captureWorldClock`)
 *   descarregar → `World.dispose()` descarta o `Environment`
 *   carregar → `World.build()` cria um `Environment` novo
 *              e `applyClockFromSave()` devolve a hora
 *   validar  → a conferência
 *
 * A cena é **a mesma** o tempo todo. É esse o ponto: ela é o lugar onde
 * as sobras se acumulam.
 */
function makeWorld(startRegion: string, startHour: number) {
  const scene = new THREE.Scene();
  const renderer = stubRenderer();
  const camera = new THREE.Vector3();
  const focus = new THREE.Vector3();

  let region = startRegion;
  let environment = new Environment(scene, renderer);
  let elapsed = 0;

  const settle = (): void => {
    // Alguns quadros para a atmosfera assentar, como no jogo.
    for (let i = 0; i < 3; i += 1) {
      elapsed += 1 / 60;
      environment.update(1 / 60, elapsed, camera, focus, false);
    }
  };

  environment.applyQuality(QUALITY);
  environment.clock.setHours(startHour);
  settle();

  return {
    scene,
    get region(): string {
      return region;
    },
    get environment(): Environment {
      return environment;
    },
    /** Uma viagem inteira, nas quatro etapas do motor. */
    travelTo(destination: string): void {
      // A — guardar: a hora do mundo não pode morrer com a região.
      const saved = { hours: environment.clock.hours, day: environment.clock.day };

      // B — descarregar.
      environment.dispose();

      // C — carregar: ambiente novo, hora devolvida.
      region = destination;
      environment = new Environment(scene, renderer);
      environment.applyQuality(QUALITY);
      environment.clock.setHours(saved.hours);
      environment.clock.day = saved.day;
      settle();
    },
    /** O estado da cena entre o descarte e a montagem seguinte. */
    peekAfterUnload(): SceneLightingReport {
      environment.dispose();
      const report = readSceneLighting(scene);
      environment = new Environment(scene, renderer);
      environment.applyQuality(QUALITY);
      settle();
      return report;
    },
    dispose(): void {
      environment.dispose();
    },
  };
}

/** Os números visuais que o jogador enxerga como "o brilho da cidade". */
function visualProfile(world: ReturnType<typeof makeWorld>) {
  const scene = readSceneLighting(world.scene);
  const environment = world.environment;
  return {
    sol: round(environment.lighting.sun.intensity),
    ambiente: round(environment.lighting.ambient.intensity),
    intensidadeTotal: round(scene.totalIntensity),
    intensidadeDeAmbiente: round(scene.environmentIntensity),
    nevoaPerto: round(scene.fogNear ?? 0),
    nevoaLonge: round(scene.fogFar ?? 0),
    corDaNevoa: scene.fogColor,
    corDoSol: environment.lighting.sun.color.getHex(),
    hora: round(environment.clock.hours),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const DIA = 14;
const NOITE = 2;

describe('a luz de uma região não atravessa para a outra', () => {
  /* =================================================================== */
  /* A conferência de fundo: o que entra na cena tem de sair             */
  /* =================================================================== */

  describe('a cena fica limpa entre uma região e outra', () => {
    it('montar uma região põe exatamente uma iluminação na cena', () => {
      const world = makeWorld('aurora-city', DIA);
      const audit = checkLightingIsolation(world.scene);
      expect(audit.problems).toEqual([]);
      expect(audit.report.suns).toBe(1);
      expect(audit.report.ambients).toBe(1);
      expect(audit.report.skies).toBe(1);
      expect(audit.report.clouds).toBe(1);
      world.dispose();
    });

    it('descartar a região não deixa nada aceso', () => {
      // O contrato do outro lado da viagem. O que sobrar aqui é
      // exatamente o que vai somar na região seguinte.
      const world = makeWorld('aurora-city', DIA);
      const afterUnload = world.peekAfterUnload();

      expect(afterUnload.suns, 'um sol ficou para trás').toBe(0);
      expect(afterUnload.ambients, 'uma luz de ambiente ficou para trás').toBe(0);
      expect(afterUnload.skies, 'um céu ficou para trás').toBe(0);
      expect(afterUnload.clouds, 'as nuvens ficaram para trás').toBe(0);
      expect(afterUnload.totalIntensity).toBe(0);
      expect(afterUnload.hasFog).toBe(false);
      expect(afterUnload.hasEnvironmentMap).toBe(false);
      expect(afterUnload.environmentIntensity).toBe(1);
      world.dispose();
    });

    it('a cena descartada passa na conferência completa', () => {
      const scene = new THREE.Scene();
      const environment = new Environment(scene, stubRenderer());
      environment.dispose();
      const audit = checkSceneCleared(scene);
      expect(audit.problems).toEqual([]);
    });

    it('o controle negativo: sem remover da cena, a luz dobra a cada viagem', () => {
      // Este é o bug, reproduzido de propósito. `dispose()` do
      // Three.js libera GPU e **não** desfaz o `scene.add` — uma luz
      // descartada sem ser removida continua iluminando. Se a
      // correção for desfeita, é isto que volta a acontecer.
      const scene = new THREE.Scene();
      const vazando: THREE.Light[] = [];
      const somar = (): number => {
        let total = 0;
        scene.traverse((object) => {
          const light = object as THREE.Light;
          if (light.isLight) total += light.intensity;
        });
        return total;
      };

      for (let trip = 0; trip < 3; trip += 1) {
        const sun = new THREE.DirectionalLight(0xffffff, 2.5);
        sun.name = SUN_LIGHT_NAME;
        const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.1);
        ambient.name = AMBIENT_LIGHT_NAME;
        scene.add(sun, ambient);
        vazando.push(sun, ambient);
        // O `dispose()` antigo: libera e vai embora, sem remover.
        sun.dispose();
        ambient.dispose();
      }

      expect(somar()).toBeCloseTo(3 * 3.6, 5);
      expect(checkLightingIsolation(scene).ok).toBe(false);
      expect(checkLightingIsolation(scene).problems.join(' ')).toContain('sóis');
    });
  });

  /* =================================================================== */
  /* A conferência em si — ela tem de acusar, não só concordar           */
  /* =================================================================== */

  describe('a conferência acusa cada tipo de sobra', () => {
    /** Uma cena com uma iluminação de região completa e correta. */
    function cenaCompleta(): THREE.Scene {
      const scene = new THREE.Scene();
      const sun = new THREE.DirectionalLight(0xffffff, 2.5);
      sun.name = SUN_LIGHT_NAME;
      const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.1);
      ambient.name = AMBIENT_LIGHT_NAME;
      const sky = new THREE.Group();
      sky.name = SKY_GROUP_NAME;
      const clouds = new THREE.Group();
      clouds.name = CLOUD_GROUP_NAME;
      scene.add(sun, ambient, sky, clouds);
      return scene;
    }

    it('a cena completa passa — a conferência não acusa o que está certo', () => {
      expect(checkLightingIsolation(cenaCompleta()).problems).toEqual([]);
    });

    const SOBRAS = [
      ['um sol', SUN_LIGHT_NAME, 'sóis'],
      ['uma luz de ambiente', AMBIENT_LIGHT_NAME, 'luzes de ambiente'],
      ['um céu', SKY_GROUP_NAME, 'céus'],
      ['um grupo de nuvens', CLOUD_GROUP_NAME, 'grupos de nuvens'],
    ] as const;

    it.each(SOBRAS)('acusa %s a mais na cena', (_label, name, palavra) => {
      const scene = cenaCompleta();
      const sobra =
        name === SUN_LIGHT_NAME
          ? new THREE.DirectionalLight(0xffffff, 2.5)
          : name === AMBIENT_LIGHT_NAME
            ? new THREE.HemisphereLight(0xffffff, 0xffffff, 1.1)
            : new THREE.Group();
      sobra.name = name;
      scene.add(sobra);

      const audit = checkLightingIsolation(scene);
      expect(audit.ok, `${palavra}: a sobra passou despercebida`).toBe(false);
      expect(audit.problems.join(' ')).toContain(palavra);
      expect(audit.problems.join(' ')).toContain('2');
    });

    it.each(SOBRAS)('acusa a falta de %s na cena', (_label, name, palavra) => {
      const scene = cenaCompleta();
      const faltando = scene.children.find((child) => child.name === name);
      scene.remove(faltando as THREE.Object3D);

      const audit = checkLightingIsolation(scene);
      expect(audit.ok, `${palavra}: a falta passou despercebida`).toBe(false);
      expect(audit.problems.join(' ')).toContain(palavra);
    });

    it.each(SOBRAS)('a cena descartada não pode conter %s', (_label, name, palavra) => {
      // `checkSceneCleared` é o contrato do outro lado: se ele aceitar
      // uma cena suja, o vazamento volta sem aviso.
      const scene = new THREE.Scene();
      const sobra =
        name === SUN_LIGHT_NAME
          ? new THREE.DirectionalLight(0xffffff, 2.5)
          : name === AMBIENT_LIGHT_NAME
            ? new THREE.HemisphereLight(0xffffff, 0xffffff, 1.1)
            : new THREE.Group();
      sobra.name = name;
      scene.add(sobra);

      const audit = checkSceneCleared(scene);
      expect(audit.ok, `${palavra}: a cena suja foi dada como limpa`).toBe(false);
      expect(audit.problems.join(' ')).toContain(palavra);
    });

    it('a cena descartada não pode guardar névoa, reflexo nem intensidade', () => {
      const comNevoa = new THREE.Scene();
      comNevoa.fog = new THREE.Fog(0xb4e6ff, 120, 900);
      expect(checkSceneCleared(comNevoa).problems.join(' ')).toContain('névoa');

      const comReflexo = new THREE.Scene();
      comReflexo.environment = new THREE.Texture();
      expect(checkSceneCleared(comReflexo).problems.join(' ')).toContain('reflexo');

      const comIntensidade = new THREE.Scene();
      comIntensidade.environmentIntensity = 0.64;
      expect(checkSceneCleared(comIntensidade).problems.join(' ')).toContain('intensidade de ambiente');

      expect(checkSceneCleared(new THREE.Scene()).problems).toEqual([]);
    });

    it('o censo soma a intensidade de verdade, não devolve zero', () => {
      // Sem isto, um censo quebrado que sempre responde 0 passaria em
      // toda comparação antes/depois deste arquivo — 0 é igual a 0.
      const scene = new THREE.Scene();
      expect(readSceneLighting(scene).totalIntensity).toBe(0);

      const sun = new THREE.DirectionalLight(0xffffff, 2.5);
      sun.name = SUN_LIGHT_NAME;
      scene.add(sun);
      expect(readSceneLighting(scene).totalIntensity).toBeCloseTo(2.5, 6);

      const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.1);
      ambient.name = AMBIENT_LIGHT_NAME;
      scene.add(ambient);
      expect(readSceneLighting(scene).totalIntensity).toBeCloseTo(3.6, 6);

      sun.intensity = 0.4;
      expect(readSceneLighting(scene).totalIntensity).toBeCloseTo(1.5, 6);
    });

    it('o censo não mexe na cena que está lendo', () => {
      const scene = cenaCompleta();
      const antes = scene.children.length;
      readSceneLighting(scene);
      checkLightingIsolation(scene);
      checkSceneCleared(scene);
      expect(scene.children).toHaveLength(antes);
    });
  });

  /* =================================================================== */
  /* A, B, C, D — as quatro viagens                                      */
  /* =================================================================== */

  describe('as quatro travessias', () => {
    const CENARIOS = [
      ['A', 'aurora-city', 'rosas-park', DIA, 'de dia'],
      ['B', 'aurora-city', 'rosas-park', NOITE, 'de noite'],
      ['C', 'rosas-park', 'aurora-city', DIA, 'de dia'],
      ['D', 'rosas-park', 'aurora-city', NOITE, 'de noite'],
    ] as const;

    it.each(CENARIOS.map((c) => [`${c[0]}: ${c[1]} → ${c[2]} ${c[4]}`, c[1], c[2], c[3]] as const))(
      '%s — a luz do destino é só a dele',
      (_label, from, to, hour) => {
        const world = makeWorld(from, hour);

        // Quanto a região de destino tem de luz quando é a primeira a
        // ser montada, sem viagem nenhuma antes dela.
        const fresh = makeWorld(to, hour);
        const esperado = visualProfile(fresh);
        fresh.dispose();

        world.travelTo(to);
        const chegada = visualProfile(world);

        expect(chegada, 'chegar viajando difere de começar aqui').toEqual(esperado);
        expect(checkLightingIsolation(world.scene).problems).toEqual([]);
        world.dispose();
      },
    );

    it('a hora do mundo atravessa a viagem', () => {
      // 02h em Aurora tem de dar 02h em Rosas. É o pedido, literal.
      for (const hour of [2, 9.5, 14, 19.5, 23.25]) {
        const world = makeWorld('aurora-city', hour);
        const antes = world.environment.clock.hours;
        world.travelTo('rosas-park');
        expect(world.environment.clock.hours, `${hour}h virou outra hora`).toBeCloseTo(antes, 3);
        world.travelTo('aurora-city');
        expect(world.environment.clock.hours).toBeCloseTo(antes, 3);
        world.dispose();
      }
    });

    it('a noite continua noite e o dia continua dia', () => {
      // Não basta a hora bater: a luz tem de corresponder a ela. Uma
      // chegada às duas da manhã com sol de meio-dia passaria no teste
      // anterior e estaria errada na tela.
      const noite = makeWorld('aurora-city', NOITE);
      const solDeNoite = noite.environment.lighting.sun.intensity;
      noite.travelTo('rosas-park');
      expect(noite.environment.lighting.sun.intensity).toBeCloseTo(solDeNoite, 5);

      const dia = makeWorld('aurora-city', DIA);
      const solDeDia = dia.environment.lighting.sun.intensity;
      dia.travelTo('rosas-park');
      expect(dia.environment.lighting.sun.intensity).toBeCloseTo(solDeDia, 5);

      // E o dia é mesmo mais claro que a noite — senão as duas
      // comparações acima poderiam estar medindo o mesmo nada.
      expect(solDeDia).toBeGreaterThan(solDeNoite);
      noite.dispose();
      dia.dispose();
    });
  });

  /* =================================================================== */
  /* E — dez ciclos                                                      */
  /* =================================================================== */

  describe('E · dez ciclos de ida e volta', () => {
    it('nada se acumula em vinte viagens', () => {
      const world = makeWorld('aurora-city', DIA);
      const inicial = visualProfile(world);

      for (let cycle = 1; cycle <= 10; cycle += 1) {
        world.travelTo('rosas-park');
        const emRosas = readSceneLighting(world.scene);
        expect(emRosas.suns, `ciclo ${cycle}: ${emRosas.suns} sóis em Rosas Park`).toBe(1);
        expect(emRosas.skies, `ciclo ${cycle}: ${emRosas.skies} céus em Rosas Park`).toBe(1);

        world.travelTo('aurora-city');
        const emAurora = readSceneLighting(world.scene);
        expect(emAurora.suns, `ciclo ${cycle}: ${emAurora.suns} sóis em Aurora`).toBe(1);
        expect(emAurora.skies, `ciclo ${cycle}: ${emAurora.skies} céus em Aurora`).toBe(1);
      }

      // Depois de vinte travessias, Aurora é a mesma Aurora.
      expect(visualProfile(world)).toEqual(inicial);
      world.dispose();
    });

    it('a intensidade somada não cresce um décimo que seja', () => {
      // A medida mais direta do sintoma. Com o vazamento, este número
      // ia de 3,82 para 7,64 na primeira viagem e para 19,10 na
      // quarta. Aqui ele não pode se mexer.
      const world = makeWorld('aurora-city', DIA);
      const base = readSceneLighting(world.scene).totalIntensity;
      const medidas: number[] = [];

      for (let cycle = 0; cycle < 10; cycle += 1) {
        world.travelTo('rosas-park');
        medidas.push(readSceneLighting(world.scene).totalIntensity);
        world.travelTo('aurora-city');
        medidas.push(readSceneLighting(world.scene).totalIntensity);
      }

      for (const [index, medida] of medidas.entries()) {
        expect(medida, `a viagem ${index + 1} mudou a luz total`).toBeCloseTo(base, 6);
      }
      world.dispose();
    });

    it('a cena não engorda: o número de objetos é estável', () => {
      // O céu e as nuvens vazavam junto com as luzes. Contar objetos
      // pega qualquer sobra, inclusive uma que ainda não exista.
      const world = makeWorld('aurora-city', DIA);
      const count = (): number => {
        let n = 0;
        world.scene.traverse(() => {
          n += 1;
        });
        return n;
      };
      const base = count();
      for (let cycle = 0; cycle < 10; cycle += 1) {
        world.travelTo('rosas-park');
        world.travelTo('aurora-city');
      }
      expect(count(), 'a cena ganhou objetos ao longo das viagens').toBe(base);
      world.dispose();
    });
  });

  /* =================================================================== */
  /* F — abrir o jogo direto em cada região                              */
  /* =================================================================== */

  describe('F · abrir o jogo direto em cada região', () => {
    it('começar em Rosas Park é igual a chegar em Rosas Park', () => {
      // O caminho de carga e o caminho de viagem têm de terminar no
      // mesmo lugar. Enquanto forem dois caminhos, um deles esquece
      // alguma coisa — foi assim no Marco L.
      for (const hour of [NOITE, DIA]) {
        const direto = makeWorld('rosas-park', hour);
        const viajando = makeWorld('aurora-city', hour);
        viajando.travelTo('rosas-park');

        expect(visualProfile(viajando)).toEqual(visualProfile(direto));
        direto.dispose();
        viajando.dispose();
      }
    });

    it('começar em Aurora City é igual a voltar para Aurora City', () => {
      for (const hour of [NOITE, DIA]) {
        const direto = makeWorld('aurora-city', hour);
        const viajando = makeWorld('rosas-park', hour);
        viajando.travelTo('aurora-city');

        expect(visualProfile(viajando)).toEqual(visualProfile(direto));
        direto.dispose();
        viajando.dispose();
      }
    });
  });

  /* =================================================================== */
  /* G — os parâmetros visuais, antes e depois                           */
  /* =================================================================== */

  describe('G · os parâmetros visuais antes e depois', () => {
    it('Aurora City volta exatamente com os números com que saiu', () => {
      const world = makeWorld('aurora-city', DIA);
      const antes = visualProfile(world);

      world.travelTo('rosas-park');
      world.travelTo('aurora-city');

      const depois = visualProfile(world);
      expect(depois).toEqual(antes);
      world.dispose();
    });

    it('Rosas Park volta exatamente com os números com que saiu', () => {
      const world = makeWorld('rosas-park', NOITE);
      const antes = visualProfile(world);

      world.travelTo('aurora-city');
      world.travelTo('rosas-park');

      const depois = visualProfile(world);
      expect(depois).toEqual(antes);
      world.dispose();
    });

    it('a névoa também volta como estava', () => {
      // A névoa é da cena, não do `Environment` — mesma armadilha das
      // luzes, outro campo. Vale conferir à parte.
      const world = makeWorld('aurora-city', NOITE);
      const antes = readSceneLighting(world.scene);
      world.travelTo('rosas-park');
      world.travelTo('aurora-city');
      const depois = readSceneLighting(world.scene);

      expect(depois.hasFog).toBe(true);
      expect(depois.fogColor).toBe(antes.fogColor);
      expect(depois.fogNear).toBeCloseTo(antes.fogNear ?? 0, 6);
      expect(depois.fogFar).toBeCloseTo(antes.fogFar ?? 0, 6);
      world.dispose();
    });

    it('a identidade das duas cidades não foi nivelada para esconder o problema', () => {
      // A regra do pedido: restaurar a luz certa, não escurecer uma
      // cidade para compensar a outra. As duas rodam sob o mesmo
      // modelo de céu — a identidade delas vem do terreno, dos
      // materiais e da vegetação, não de um multiplicador de brilho.
      // Então os números de iluminação **devem** ser iguais entre as
      // duas à mesma hora; o que não pode é um compensar o outro.
      const aurora = makeWorld('aurora-city', DIA);
      const rosas = makeWorld('rosas-park', DIA);

      const a = visualProfile(aurora);
      const r = visualProfile(rosas);
      expect(r.sol).toBe(a.sol);
      expect(r.ambiente).toBe(a.ambiente);
      expect(r.intensidadeDeAmbiente).toBe(a.intensidadeDeAmbiente);

      // E os valores são os do modelo de atmosfera, não um número
      // qualquer escolhido para "ficar bom": o sol de dia é forte, o
      // ambiente é fraco, e nenhum deles é zero.
      expect(a.sol).toBeGreaterThan(1);
      expect(a.ambiente).toBeGreaterThan(0);
      expect(a.intensidadeDeAmbiente).toBeGreaterThan(0);
      expect(a.intensidadeDeAmbiente).toBeLessThan(1);

      aurora.dispose();
      rosas.dispose();
    });
  });

  /* =================================================================== */
  /* A peça isolada                                                      */
  /* =================================================================== */

  describe('a iluminação, sozinha', () => {
    it('acende e apaga na mesma cena, sem deixar rastro', () => {
      const scene = new THREE.Scene();
      const before = readSceneLighting(scene);
      expect(before.suns).toBe(0);

      const lighting = new Lighting(scene);
      expect(readSceneLighting(scene).suns).toBe(1);
      expect(readSceneLighting(scene).ambients).toBe(1);

      lighting.dispose();
      const after = readSceneLighting(scene);
      expect(after.suns).toBe(0);
      expect(after.ambients).toBe(0);
      expect(after.totalIntensity).toBe(0);
    });

    it('o alvo do sol sai junto com ele', () => {
      // `sun.target` também é acrescentado à cena. Sem removê-lo,
      // sobra um objeto por viagem — invisível, mas acumulando.
      const scene = new THREE.Scene();
      const lighting = new Lighting(scene);
      const target = lighting.sun.target;
      expect(scene.children).toContain(target);
      lighting.dispose();
      expect(scene.children).not.toContain(target);
      expect(scene.children).toHaveLength(0);
    });

    it('cem acendimentos e apagamentos não deixam nada para trás', () => {
      const scene = new THREE.Scene();
      for (let i = 0; i < 100; i += 1) new Lighting(scene).dispose();
      expect(scene.children).toHaveLength(0);
      expect(readSceneLighting(scene).totalIntensity).toBe(0);
    });
  });
});

/* ===================================================================== */
/* A ligação com o motor                                                 */
/* ===================================================================== */

/**
 * O motor não roda sem WebGL, e aqui não há WebGL.
 *
 * O que dá para garantir sem instanciar o `Engine` é que a conferência
 * está **ligada** na etapa de validação da viagem — a mesma etapa que
 * já confere posições de personagens e área proibida. Se alguém tirar
 * essa chamada, o jogo perde o alarme e nenhum dos testes acima
 * percebe, porque eles exercitam o `Environment` direto.
 */
function sourceOf(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('a conferência está ligada na viagem', () => {
  it('a etapa de validação do motor chama a auditoria de iluminação', () => {
    const engine = sourceOf('src/core/Engine.ts');
    const validate = engine.slice(engine.indexOf('private validateRegion('));
    const body = validate.slice(0, validate.indexOf('\n  }\n'));

    expect(body, 'validateRegion não confere mais a iluminação').toContain('checkLightingIsolation');
    expect(body, 'a auditoria roda mas o resultado é descartado').toContain('lighting.problems');
    expect(engine).toContain("from '../world/SceneLighting'");
  });

  it('quem acende a luz é quem a remove da cena', () => {
    // A regra que o bug violou, escrita onde um `dispose()` futuro
    // possa esbarrar nela: `Lighting` faz `scene.add`, logo
    // `Lighting.dispose` tem de fazer `scene.remove`.
    const lighting = sourceOf('src/world/Lighting.ts');
    const dispose = lighting.slice(lighting.indexOf('  dispose(): void {'));
    expect(dispose.slice(0, dispose.indexOf('\n  }'))).toContain('this.scene.remove(');

    const environment = sourceOf('src/world/Environment.ts');
    const envDispose = environment.slice(environment.indexOf('  dispose(): void {'));
    expect(envDispose.slice(0, envDispose.indexOf('\n  }'))).toContain('this.scene.remove(');
  });

  it('não existe compensação artificial de brilho na troca de região', () => {
    // O pedido foi explícito: restaurar a luz certa, não escurecer uma
    // cidade para disfarçar o excesso da outra. Nenhum arquivo de
    // mundo pode multiplicar luz por região.
    for (const path of ['src/world/Lighting.ts', 'src/world/Environment.ts', 'src/world/Atmosphere.ts']) {
      const source = sourceOf(path);
      expect(source, `${path} compensa brilho por região`).not.toMatch(
        /(rosas|aurora)[A-Za-z]*\s*[?:]\s*[\d.]+/i,
      );
      expect(source, `${path} corrige brilho por região`).not.toMatch(/compensa|correcaoDeBrilho|brightnessFix/i);
    }
  });
});
