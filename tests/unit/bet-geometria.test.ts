import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BET_LOBES,
  BUST_BAND,
  BUST_LOBE,
  CURVE_BAND,
  GLUTE_LOBE,
  MAX_INTENSITY,
  Zone,
  aftersMorphGLSL,
  displaceNormal,
  displaceVertex,
  lobeWeight,
  armClearance,
  ARM_SHOULDER_Y,
  ARM_ELBOW_Y,
  ARM_WRIST_Y,
} from '../../src/afters/AftersMorph';
import { Avatar } from '../../src/player/Avatar';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';

/**
 * BET Geometry Remaster 2.0 — garantias da forma.
 *
 * O teste de `afters-body` cobre o sistema: canais, limites, animação,
 * persistência. Este cobre a **geometria**: que existem dois volumes e
 * não um barril, que eles são espelhados, que a superfície continua
 * contínua, que nada atravessa nada e que o corpo sem BET não se move
 * um micrômetro.
 *
 * Tudo aqui é conta pura sobre o campo de deslocamento, ou medida sobre
 * a malha real do avatar. Nada depende de GPU.
 */

/** Aplica o campo a um vértice do tronco, no espaço do tronco. */
const bust = (x: number, y: number, z: number, i = MAX_INTENSITY) =>
  displaceVertex({ x, y, z }, Zone.Bust, i, 0);

/** Aplica o campo a um vértice do quadril, no espaço do quadril. */
const curve = (x: number, y: number, z: number, i = MAX_INTENSITY) =>
  displaceVertex({ x, y, z }, Zone.Curve, 0, i);

/** Frente do tórax na altura `y`, aproximada pelo anel do peito. */
const CHEST_Z = 0.104;
/** Costas da pelve. */
const PELVIS_Z = -0.118;

/* --------------------- 1. São dois volumes, não um --------------------- */

describe('BET 2.0 · dois volumes, não um barril', () => {
  it('o peito avança mais na linha dos lobos do que no meio do peito', () => {
    const noLobo = bust(BUST_LOBE.center.x, BUST_LOBE.center.y, CHEST_Z).z;
    const noMeio = bust(0, BUST_LOBE.center.y, CHEST_Z).z;
    // Se a deformação fosse escala radial, estes dois valores seriam o
    // mesmo múltiplo do z original e a razão seria exatamente 1. É essa
    // igualdade que fazia um barril.
    expect(noLobo).toBeGreaterThan(noMeio);
    expect(noLobo / noMeio).toBeGreaterThan(1.15);
  });

  it('existe um sulco: o meio do peito fica atrás dos dois lados', () => {
    const esquerdo = bust(-BUST_LOBE.center.x, BUST_LOBE.center.y, CHEST_Z).z;
    const direito = bust(BUST_LOBE.center.x, BUST_LOBE.center.y, CHEST_Z).z;
    const meio = bust(0, BUST_LOBE.center.y, CHEST_Z).z;
    expect(meio).toBeLessThan(direito);
    expect(meio).toBeLessThan(esquerdo);
  });

  it('o glúteo avança mais na linha dos lobos do que no cóccix', () => {
    const noLobo = Math.abs(curve(GLUTE_LOBE.center.x, GLUTE_LOBE.center.y, PELVIS_Z).z);
    const noMeio = Math.abs(curve(0, GLUTE_LOBE.center.y, PELVIS_Z).z);
    expect(noLobo).toBeGreaterThan(noMeio);
  });

  it('a axila quase não sente o peito — era ela que inflava antes', () => {
    // x = 0,16 é a borda do tronco, onde o braço encosta.
    const axila = bust(0.16, 0.33, 0.04);
    const deslocamento = Math.hypot(axila.x - 0.16, axila.y - 0.33, axila.z - 0.04);
    const pico = Math.hypot(
      bust(BUST_LOBE.center.x, BUST_LOBE.center.y, CHEST_Z).z - CHEST_Z,
      bust(BUST_LOBE.center.x, BUST_LOBE.center.y, CHEST_Z).y - BUST_LOBE.center.y,
    );
    expect(deslocamento).toBeLessThan(pico * 0.35);
  });
});

/* ------------------------- 2. Simetria bilateral ----------------------- */

describe('BET 2.0 · simetria bilateral', () => {
  it('os dois lados são o espelho exato um do outro', () => {
    for (const y of [0.16, 0.2, 0.235, 0.28, 0.32]) {
      for (const z of [-0.08, 0, 0.05, 0.104]) {
        for (const x of [0.02, 0.05, 0.09, 0.14]) {
          const dir = bust(x, y, z);
          const esq = bust(-x, y, z);
          expect(esq.x).toBeCloseTo(-dir.x, 12);
          expect(esq.y).toBeCloseTo(dir.y, 12);
          expect(esq.z).toBeCloseTo(dir.z, 12);
        }
      }
    }
  });

  it('o plano do meio não sai do lugar lateralmente', () => {
    for (const y of [0.18, 0.235, 0.3]) {
      expect(bust(0, y, CHEST_Z).x).toBeCloseTo(0, 12);
      expect(curve(0, y - 0.3, PELVIS_Z).x).toBeCloseTo(0, 12);
    }
  });

  it('vale também para o quadril', () => {
    for (const y of [-0.12, -0.05, 0, 0.03]) {
      const dir = curve(0.08, y, -0.09);
      const esq = curve(-0.08, y, -0.09);
      expect(esq.x).toBeCloseTo(-dir.x, 12);
      expect(esq.z).toBeCloseTo(dir.z, 12);
    }
  });
});

/* ---------------------- 3. Continuidade da superfície ------------------ */

describe('BET 2.0 · continuidade', () => {
  it('o campo é contínuo: metade do passo, metade do salto', () => {
    /** Maior diferença entre dois pontos vizinhos, caminhando em y. */
    const maiorSalto = (passo: number): number => {
      let maior = 0;
      for (let y = 0.05; y < 0.42; y += passo) {
        const a = bust(0.06, y, 0.09);
        const b = bust(0.06, y + passo, 0.09);
        maior = Math.max(maior, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
      return maior;
    };
    // Continuidade não é "o campo anda pouco" — é "o campo anda menos
    // quando se pergunta mais de perto". Um degrau devolveria o mesmo
    // salto para qualquer passo, porque o degrau não encolhe. Um campo
    // derivável devolve metade quando o passo é metade.
    //
    // Limiar fixo seria pior: o campo é mesmo íngreme sob a dobra
    // inframamária em 250%, e um limiar frouxo o bastante para aceitar
    // a dobra aceitaria também uma rachadura de 5 mm.
    const grosso = maiorSalto(0.004);
    const fino = maiorSalto(0.002);
    const metade = maiorSalto(0.001);
    expect(fino / grosso).toBeGreaterThan(0.4);
    expect(fino / grosso).toBeLessThan(0.6);
    expect(metade / fino).toBeGreaterThan(0.4);
    expect(metade / fino).toBeLessThan(0.6);
  });

  it('o campo morre antes das bordas da zona', () => {
    // Pescoço (topo do tronco) e cintura (base): o volume não chega.
    const pescoco = bust(0.03, 0.42, 0.03);
    expect(Math.hypot(pescoco.x - 0.03, pescoco.y - 0.42, pescoco.z - 0.03)).toBeLessThan(0.004);
    const cintura = bust(0.1, 0.1, 0.086);
    expect(Math.hypot(cintura.x - 0.1, cintura.y - 0.1, cintura.z - 0.086)).toBeLessThan(0.012);
  });

  it('a dobra de baixo é mais curta que a subida de cima', () => {
    const acima = lobeWeight(BUST_LOBE, { x: BUST_LOBE.center.x, y: BUST_LOBE.center.y + 0.05, z: BUST_LOBE.center.z }, 1);
    const abaixo = lobeWeight(BUST_LOBE, { x: BUST_LOBE.center.x, y: BUST_LOBE.center.y - 0.05, z: BUST_LOBE.center.z }, 1);
    expect(abaixo).toBeLessThan(acima);
  });

  it('a normal é unitária, contínua, e só fica íngreme no extremo', () => {
    /** Maior giro da normal entre duas amostras separadas por `passo`. */
    const maiorGiro = (passo: number, intensidade: number): number => {
      let maior = 0;
      let anterior: { x: number; y: number; z: number } | null = null;
      for (let y = 0.12; y < 0.38; y += passo) {
        const n = displaceNormal({ x: 0.05, y, z: 0.095 }, { x: 0.3, y: 0, z: 0.954 }, Zone.Bust, intensidade, 0);
        expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
        if (anterior) maior = Math.max(maior, Math.hypot(n.x - anterior.x, n.y - anterior.y, n.z - anterior.z));
        anterior = n;
      }
      return maior;
    };
    // Continuidade, de novo pela escala: num campo derivável, perguntar
    // de 2 em 2 mm devolve metade do giro de 4 em 4 mm.
    const grosso = maiorGiro(0.004, MAX_INTENSITY);
    const fino = maiorGiro(0.002, MAX_INTENSITY);
    expect(fino / grosso).toBeGreaterThan(0.4);
    expect(fino / grosso).toBeLessThan(0.6);
    // Curvatura: o maior giro acontece no **centro do lobo**, e isso é o
    // esperado — numa gaussiana a curvatura é máxima no ápice, 2A/σ², o
    // que em 100% dá da ordem de 0,18 por passo de 4 mm. Já se tentou
    // tratar esse número como vinco: isolando os campos, a banda
    // respondeu por 0,016 e o lobo por 0,175, e suavizar a assimetria do
    // lobo não mexeu nele. É a cúpula, não uma quina.
    //
    // O limite existe para pegar o dia em que alguém dobrar um ganho sem
    // perceber que está pedindo uma superfície que o olho lê como aresta.
    expect(maiorGiro(0.004, 1)).toBeLessThan(0.25);
    expect(maiorGiro(0.004, MAX_INTENSITY)).toBeLessThan(0.45);
  });

  it('sem intensidade a normal volta exatamente a si mesma', () => {
    const n = { x: 0.3, y: 0.1, z: 0.948 };
    const saida = displaceNormal({ x: 0.05, y: 0.24, z: 0.1 }, n, Zone.Bust, 0, 0);
    expect(saida.x).toBeCloseTo(n.x, 12);
    expect(saida.y).toBeCloseTo(n.y, 12);
    expect(saida.z).toBeCloseTo(n.z, 12);
  });

  it('com campo identidade a diferença central devolve a normal de entrada', () => {
    // Zona que não deforma: o caminho das diferenças centrais nem roda,
    // mas o contrato é o mesmo — normal entra, normal sai.
    const n = { x: 0, y: 1, z: 0 };
    const saida = displaceNormal({ x: 0, y: 0.2, z: 0 }, n, Zone.None, MAX_INTENSITY, MAX_INTENSITY);
    expect(saida).toEqual(n);
  });
});

/* ------------------- 4. Progressão e volta ao original ----------------- */

describe('BET 2.0 · progressão', () => {
  it('o volume cresce de forma monótona com a intensidade', () => {
    let anterior = -Infinity;
    for (let i = 0; i <= MAX_INTENSITY + 1e-9; i += 0.05) {
      const z = bust(BUST_LOBE.center.x, BUST_LOBE.center.y, CHEST_Z, i).z;
      expect(z).toBeGreaterThan(anterior);
      anterior = z;
    }
  });

  it('em 0% a geometria é a original, bit a bit', () => {
    for (const zona of [Zone.Bust, Zone.Curve, Zone.Thigh, Zone.None]) {
      for (const p of [
        { x: 0.07, y: 0.24, z: 0.1 },
        { x: -0.05, y: -0.04, z: -0.11 },
        { x: 0.12, y: 0.3, z: 0 },
      ]) {
        expect(displaceVertex(p, zona, 0, 0)).toEqual(p);
      }
    }
  });

  it('o avanço máximo em 250% é grande mas não absurdo', () => {
    const avanco = bust(BUST_LOBE.center.x, BUST_LOBE.center.y, CHEST_Z).z - CHEST_Z;
    expect(avanco).toBeGreaterThan(0.04);
    expect(avanco).toBeLessThan(0.14);
  });
});

/* ------------------------ 5. A malha de verdade ------------------------ */

describe('BET 2.0 · sobre a malha do avatar', () => {
  /** Vértices do corpo com zona e normal, já no espaço da junta da zona. */
  function amostra(detail: 'baixa' | 'media' | 'alta' | 'ultra') {
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE });
    avatar.setDetail(detail);
    const malha = (avatar as unknown as { body: THREE.Mesh }).body;
    const g = malha.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute('position');
    const zona = g.getAttribute('aZone');
    const origem = g.getAttribute('aMorphOrigin');
    const normal = g.getAttribute('normal');
    return { avatar, g, pos, zona, origem, normal };
  }

  it('todo vértice tem zona e origem de junta declaradas', () => {
    const { avatar, pos, zona, origem } = amostra('alta');
    expect(zona).toBeTruthy();
    expect(origem).toBeTruthy();
    expect(zona.count).toBe(pos.count);
    expect(origem.count).toBe(pos.count);
    for (let i = 0; i < zona.count; i += 1) {
      const z = zona.getX(i);
      expect(Number.isInteger(z)).toBe(true);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(4);
    }
    avatar.dispose();
  });

  it('a deformação não inverte nenhum triângulo da malha', () => {
    const { avatar, g, pos, zona, origem } = amostra('alta');
    const index = g.getIndex()!;
    const p = new THREE.Vector3();
    const o = new THREE.Vector3();
    /** Posição deformada do vértice i, em espaço de objeto. */
    const mover = (i: number): THREE.Vector3 => {
      p.fromBufferAttribute(pos, i);
      o.fromBufferAttribute(origem, i);
      const d = displaceVertex({ x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }, zona.getX(i), MAX_INTENSITY, MAX_INTENSITY);
      return new THREE.Vector3(d.x + o.x, d.y + o.y, d.z + o.z);
    };
    let invertidos = 0;
    let avaliados = 0;
    const antesA = new THREE.Vector3();
    const antesB = new THREE.Vector3();
    const antesC = new THREE.Vector3();
    for (let t = 0; t < index.count; t += 3) {
      const ia = index.getX(t);
      const ib = index.getX(t + 1);
      const ic = index.getX(t + 2);
      // Só interessa onde a deformação age.
      if (zona.getX(ia) === Zone.None && zona.getX(ib) === Zone.None && zona.getX(ic) === Zone.None) continue;
      antesA.fromBufferAttribute(pos, ia);
      antesB.fromBufferAttribute(pos, ib);
      antesC.fromBufferAttribute(pos, ic);
      const nAntes = new THREE.Vector3()
        .subVectors(antesB, antesA)
        .cross(new THREE.Vector3().subVectors(antesC, antesA));
      if (nAntes.lengthSq() < 1e-14) continue;
      const a = mover(ia);
      const b = mover(ib);
      const c = mover(ic);
      const nDepois = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (nDepois.lengthSq() < 1e-16) continue;
      avaliados += 1;
      if (nAntes.normalize().dot(nDepois.normalize()) < 0) invertidos += 1;
    }
    expect(avaliados).toBeGreaterThan(1000);
    expect(invertidos).toBe(0);
    avatar.dispose();
  });

  it('costuras entre zonas não abrem: vértices coincidentes continuam juntos', () => {
    // Aqui mora o risco real de rachadura. A deformação é função da
    // posição **e da zona**, e zonas vizinhas usam bandas diferentes.
    // Onde duas cascas se encontram com vértices exatamente no mesmo
    // ponto mas com zonas distintas, um lado anda e o outro não — e o
    // que era uma costura fechada vira uma fenda aberta.
    //
    // Contar aresta solta não pegaria isso: a topologia não muda, os
    // índices não mudam, o buraco é geométrico.
    for (const nivel of ['media', 'ultra'] as const) {
      const { avatar, pos, zona, origem } = amostra(nivel);
      const grade = new Map<string, number[]>();
      for (let i = 0; i < pos.count; i += 1) {
        // 0,1 mm: dois vértices neste raio são a mesma costura.
        const chave = `${Math.round(pos.getX(i) * 1e4)}:${Math.round(pos.getY(i) * 1e4)}:${Math.round(pos.getZ(i) * 1e4)}`;
        const lista = grade.get(chave);
        if (lista) lista.push(i);
        else grade.set(chave, [i]);
      }
      /** Posição deformada em espaço de objeto. */
      const mover = (i: number) => {
        const ox = origem.getX(i);
        const oy = origem.getY(i);
        const oz = origem.getZ(i);
        const d = displaceVertex(
          { x: pos.getX(i) - ox, y: pos.getY(i) - oy, z: pos.getZ(i) - oz },
          zona.getX(i),
          MAX_INTENSITY,
          MAX_INTENSITY,
        );
        return { x: d.x + ox, y: d.y + oy, z: d.z + oz };
      };
      let costuras = 0;
      let maiorAbertura = 0;
      for (const lista of grade.values()) {
        if (lista.length < 2) continue;
        const zonas = new Set(lista.map((i) => zona.getX(i)));
        const origens = new Set(lista.map((i) => `${origem.getX(i)}:${origem.getY(i)}:${origem.getZ(i)}`));
        if (zonas.size === 1 && origens.size === 1) continue;
        costuras += 1;
        const pontos = lista.map(mover);
        for (const a of pontos) {
          for (const b of pontos) {
            maiorAbertura = Math.max(maiorAbertura, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
          }
        }
      }
      // Meio milímetro: abaixo disso nenhuma fenda é visível num corpo
      // de 1,7 m, nem com a câmera colada.
      expect(maiorAbertura).toBeLessThan(0.0005);
      // E o teste precisa estar olhando para alguma coisa.
      expect(costuras + grade.size).toBeGreaterThan(100);
      avatar.dispose();
    }
  });

  it('quem não usa BET não se move um micrômetro, em qualquer nível', () => {
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      const { avatar, pos, zona, origem } = amostra(nivel);
      let maior = 0;
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i) - origem.getX(i);
        const y = pos.getY(i) - origem.getY(i);
        const z = pos.getZ(i) - origem.getZ(i);
        const d = displaceVertex({ x, y, z }, zona.getX(i), 0, 0);
        maior = Math.max(maior, Math.abs(d.x - x), Math.abs(d.y - y), Math.abs(d.z - z));
      }
      expect(maior).toBe(0);
      avatar.dispose();
    }
  });

  it('o volume aparece nos quatro níveis, com mais resolução nos altos', () => {
    const avanco: Record<string, number> = {};
    const vertices: Record<string, number> = {};
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      const { avatar, pos, zona, origem } = amostra(nivel);
      let maior = 0;
      let dentro = 0;
      for (let i = 0; i < pos.count; i += 1) {
        if (zona.getX(i) !== Zone.Bust) continue;
        const x = pos.getX(i) - origem.getX(i);
        const y = pos.getY(i) - origem.getY(i);
        const z = pos.getZ(i) - origem.getZ(i);
        if (lobeWeight(BUST_LOBE, { x, y, z }, Math.sign(x) || 1) > 0.35) dentro += 1;
        const d = displaceVertex({ x, y, z }, Zone.Bust, MAX_INTENSITY, 0);
        maior = Math.max(maior, d.z - z);
      }
      avanco[nivel] = maior;
      vertices[nivel] = dentro;
      avatar.dispose();
    }
    // O avanço é o mesmo campo em todos os níveis: a forma não depende da
    // densidade, só a finura com que ela é amostrada.
    for (const nivel of ['baixa', 'media', 'alta'] as const) {
      expect(avanco[nivel]).toBeGreaterThan(avanco.ultra * 0.7);
    }
    // E há vértice suficiente dentro do lobo para ele ser lido como forma.
    expect(vertices.baixa).toBeGreaterThan(2);
    expect(vertices.ultra).toBeGreaterThan(vertices.baixa * 2.5);
  });
});

/* ----------------------- 6. Paridade TypeScript ↔ GLSL ----------------- */

describe('BET 2.0 · paridade dos lobos entre TypeScript e GLSL', () => {
  const glsl = aftersMorphGLSL();

  it('declara a estrutura e as duas funções do lobo', () => {
    expect(glsl).toContain('struct EdenLobe');
    expect(glsl).toContain('float edenLobeWeight(EdenLobe lobe, vec3 pos, float side)');
    expect(glsl).toContain('vec3 edenLobeOffset(EdenLobe lobe, vec3 pos, float side, float intensity)');
    // Os dois lados, espelhados, no mesmo lugar em que o TypeScript os soma.
    expect(glsl).toContain('edenLobeOffset(lobe, pos, 1.0, intensity)');
    expect(glsl).toContain('edenLobeOffset(lobe, pos, -1.0, intensity)');
  });

  it('cada número dos lobos aparece no GLSL com o mesmo valor', () => {
    for (const lobe of Object.values(BET_LOBES)) {
      for (const v of [
        lobe.center.x,
        lobe.center.y,
        lobe.center.z,
        lobe.anchor.x,
        lobe.anchor.y,
        lobe.anchor.z,
        lobe.falloff.x,
        lobe.falloff.y,
        lobe.falloff.z,
        lobe.below,
        lobe.gain,
      ]) {
        expect(glsl).toContain(v.toFixed(5));
      }
    }
  });

  it('a normal do GLSL é por diferença central, como a do TypeScript', () => {
    expect(glsl).toContain('cross(a - b, c - d)');
    expect(glsl).not.toContain('tilt');
  });

  it('a coxa não ganha lobo em nenhum dos dois lados', () => {
    // zone == 3.0 é a coxa: tem banda, não tem par espelhado.
    const trecho = glsl.slice(glsl.indexOf('zone == 3.0'));
    expect(trecho.slice(0, 200)).toContain('hasLobe = false');
  });

  it('as bandas de sustentação continuam listadas', () => {
    for (const band of [BUST_BAND, CURVE_BAND]) {
      expect(glsl).toContain(band.gainX.toFixed(5));
      expect(glsl).toContain(band.center.toFixed(5));
    }
  });
});

/**
 * A folga do braço.
 *
 * O braço não engorda com o BET: ele sai do caminho. A medida que
 * motivou isto está no relatório — com o quadril em 250%, a saia passava
 * 73 mm por fora da linha da mão, e o tecido atravessava os dedos.
 */
describe('folga do braço', () => {
  it('não mexe no braço quando o BET está desligado', () => {
    for (const y of [0.49, 0.3, 0.0, -0.07, -0.2]) {
      expect(armClearance({ x: 0.2, y, z: 0 }, 0, 0)).toBe(0);
    }
    const parado = displaceVertex({ x: 0.2, y: -0.07, z: 0 }, Zone.Arm, 0, 0);
    expect(parado).toEqual({ x: 0.2, y: -0.07, z: 0 });
  });

  it('deixa o ombro e o cotovelo quietos', () => {
    // Os dois primeiros anéis do braço pertencem ao osso do tronco e
    // fecham a axila. Se andarem, abrem a costura que existem para fechar.
    expect(armClearance({ x: 0.2, y: ARM_SHOULDER_Y, z: 0 }, 2.5, 2.5)).toBe(0);
    expect(armClearance({ x: 0.2, y: ARM_SHOULDER_Y + 0.05, z: 0 }, 2.5, 2.5)).toBe(0);
    // No cotovelo a rampa já está inteira, mas o quadril ainda não
    // alargou nada àquela altura, então o braço mal se move.
    expect(armClearance({ x: 0.2, y: ARM_ELBOW_Y, z: 0 }, 2.5, 2.5)).toBeLessThan(0.01);
  });

  it('afasta o punho na medida em que o quadril alarga', () => {
    const punho = armClearance({ x: 0.2, y: ARM_WRIST_Y, z: 0 }, 0, 2.5);
    // O quadril ganha gainX da própria meia-largura; o braço anda o mesmo
    // tanto, senão a folga que existia vira colisão.
    expect(punho).toBeGreaterThan(0.05);
    expect(punho).toBeLessThan(0.12);
  });

  it('cresce junto com a intensidade, sem salto', () => {
    let anterior = -1;
    for (const i of [0, 0.5, 1, 1.5, 2, 2.5]) {
      const f = armClearance({ x: 0.2, y: -0.07, z: 0 }, 0, i);
      expect(f).toBeGreaterThanOrEqual(anterior);
      anterior = f;
    }
  });

  it('é simétrica nos dois braços', () => {
    for (const y of [0.2, 0, -0.07, -0.2]) {
      const dir = displaceVertex({ x: 0.21, y, z: 0.01 }, Zone.Arm, 1.4, 2.1);
      const esq = displaceVertex({ x: -0.21, y, z: 0.01 }, Zone.Arm, 1.4, 2.1);
      expect(esq.x).toBeCloseTo(-dir.x, 12);
      expect(esq.y).toBeCloseTo(dir.y, 12);
      expect(esq.z).toBeCloseTo(dir.z, 12);
    }
  });

  it('é translação pura: não muda y, z, nem a normal', () => {
    const p = { x: 0.2, y: -0.07, z: 0.03 };
    const d = displaceVertex(p, Zone.Arm, 2.5, 2.5);
    expect(d.y).toBe(p.y);
    expect(d.z).toBe(p.z);
    expect(Math.abs(d.x)).toBeGreaterThan(Math.abs(p.x));
    const n = { x: 0, y: 0.6, z: 0.8 };
    expect(displaceNormal(p, n, Zone.Arm, 2.5, 2.5)).toEqual(n);
  });

  it('é contínua ao longo do braço', () => {
    // Passo pela metade: num campo contínuo a diferença cai junto.
    const dif = (h: number) => {
      let pior = 0;
      for (let y = -0.25; y < 0.5; y += h) {
        const a = armClearance({ x: 0.2, y, z: 0 }, 2.5, 2.5);
        const b = armClearance({ x: 0.2, y: y + h, z: 0 }, 2.5, 2.5);
        pior = Math.max(pior, Math.abs(b - a));
      }
      return pior;
    };
    const razao = dif(0.002) / dif(0.004);
    expect(razao).toBeGreaterThan(0.4);
    expect(razao).toBeLessThan(0.6);
  });

  it('o GLSL declara a mesma folga que o TypeScript', () => {
    const glsl = aftersMorphGLSL();
    expect(glsl).toContain('edenArmClearance');
    expect(glsl).toContain(ARM_SHOULDER_Y.toFixed(5));
    expect(glsl).toContain(ARM_ELBOW_Y.toFixed(5));
    // A zona 4 precisa ser despachada antes das bandas.
    expect(glsl).toContain('floor(aZone + 0.5) == 4.0');
  });
});
