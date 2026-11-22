import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BODY_SHAPES,
  BODY_SHAPE_IDS,
  SHAPE_FEM,
  SHAPE_MASC,
  type BodyShape,
  shapeFor,
} from '../../src/player/body/BodyShape';
import { BODY_DETAIL, Bone, bodyMetrics } from '../../src/player/body/BodyRig';
import { buildBodyGeometry } from '../../src/player/body/BodyBuilder';
import { PANTHEON } from '../../src/characters/Pantheon';
import {
  OFFICIAL_IDS,
  createOfficialAvatar,
  officialAppearance,
  officialFingerprint,
  officialProportions,
  officialShape,
} from '../../src/characters/CharacterModels';
import { Avatar } from '../../src/player/Avatar';
import { proportionsFor } from '../../src/player/body/BodyProportions';
import { makeCitizen } from '../../src/npc/CitizenData';

/**
 * Etapa 3, bloco C1 — o Aérion ganha silhueta masculina, e **ninguém mais
 * muda**.
 *
 * O eixo de forma (`BodyShape`) é novo e corta o sistema inteiro de
 * construção de corpo: toda malha do jogo passa por `bodyMetrics`. Um
 * eixo assim só é aceitável se vier com a prova de que está desligado
 * em todo lugar menos num. É isso que esta suíte faz, em três frentes:
 *
 * 1. **Identidade** — `SHAPE_FEM` não é "quase neutro", é 1 em todo
 *    fator, verificado número a número e em corpos aleatórios.
 * 2. **Isolamento** — dez deusas, cinquenta e quatro habitantes e o
 *    corpo padrão continuam exatamente como estavam.
 * 3. **Efeito** — o corpo do Aérion mudou de verdade, medido na malha
 *    construída e não só nos números que a alimentam.
 */

/** Largura do tronco numa faixa de altura, lida pelo osso dominante. */
function larguraDoTronco(geometria: THREE.BufferGeometry, ossos: number[], y0: number, y1: number) {
  const pos = geometria.getAttribute('position');
  const indice = geometria.getAttribute('skinIndex');
  const peso = geometria.getAttribute('skinWeight');
  let maior = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y <= y0 || y >= y1) continue;
    let osso = -1;
    let melhor = -1;
    for (const canal of ['getX', 'getY', 'getZ', 'getW'] as const) {
      const w = peso[canal](i);
      if (w > melhor) {
        melhor = w;
        osso = indice[canal](i);
      }
    }
    if (!ossos.includes(osso)) continue;
    maior = Math.max(maior, Math.abs(pos.getX(i)));
  }
  return maior * 2;
}

/** Corpos variados para testar o eixo em algo além de um caso feliz. */
function corposDeAmostra() {
  const ids = ['teste:a', 'teste:b', 'teste:c', 'cidadao:17', 'cidadao:42', 'jogador'];
  return ids.flatMap((id) => [0.92, 1, 1.09].map((h) => proportionsFor(id, h)));
}

describe('C1 — o eixo de forma existe e é bem formado', () => {
  it('SHAPE_FEM é a identidade: todo fator vale exatamente 1', () => {
    // Esta é a asserção que sustenta a etapa inteira. Se um fator de
    // SHAPE_FEM deixar de ser 1, todo corpo do Éden muda de tamanho
    // em silêncio — as dez deusas, os habitantes e o jogador.
    const { id, ...fatores } = SHAPE_FEM;
    expect(id).toBe('fem');
    expect(Object.values(fatores).length).toBeGreaterThan(0);
    for (const [nome, valor] of Object.entries(fatores)) {
      expect(valor, `SHAPE_FEM.${nome}`).toBe(1);
    }
  });

  it('as duas formas declaram exatamente os mesmos fatores', () => {
    // Um fator que existisse só numa das formas seria aplicado como
    // `undefined` na outra e produziria NaN na malha.
    expect(Object.keys(SHAPE_MASC).sort()).toEqual(Object.keys(SHAPE_FEM).sort());
    for (const [nome, valor] of Object.entries(SHAPE_MASC)) {
      if (nome === 'id') continue;
      expect(Number.isFinite(valor as number), `SHAPE_MASC.${nome}`).toBe(true);
      expect(valor as number, `SHAPE_MASC.${nome}`).toBeGreaterThan(0);
    }
  });

  it('a forma masculina não é uma cópia da feminina', () => {
    // Protege contra o C1 virar um eixo que existe e não faz nada.
    const diferentes = Object.keys(SHAPE_MASC).filter(
      (k) => k !== 'id' && (SHAPE_MASC as never as Record<string, number>)[k] !== 1,
    );
    expect(diferentes.length).toBeGreaterThanOrEqual(5);
  });

  it('o eixo só tem comprimentos fora dele', () => {
    // Altura, braço, perna e cabeça são assunto de BodyProportions.
    // Se um deles entrasse aqui, todo homem do Éden ficaria mais alto
    // que toda mulher — que é exatamente o erro que não queremos.
    const proibidos = ['height', 'armLength', 'legLength', 'crown', 'hipHeight', 'headR', 'headSize'];
    for (const nome of proibidos) {
      expect(Object.keys(SHAPE_FEM), `campo proibido no eixo de forma: ${nome}`).not.toContain(nome);
    }
  });

  it('shapeFor cai na forma de referência quando não há declaração', () => {
    expect(shapeFor(undefined)).toBe(SHAPE_FEM);
    for (const id of BODY_SHAPE_IDS) expect(shapeFor(id)).toBe(BODY_SHAPES[id]);
  });
});

describe('C1 — isolamento: o argumento-padrão não mexe em nada', () => {
  it('bodyMetrics sem forma devolve exatamente o que devolvia antes', () => {
    // `bodyMetrics(p)` e `bodyMetrics(p, SHAPE_FEM)` têm de ser o
    // mesmo número, não "quase o mesmo": é multiplicação por 1.
    for (const p of corposDeAmostra()) {
      const semForma = bodyMetrics(p) as unknown as Record<string, number>;
      const comFem = bodyMetrics(p, SHAPE_FEM) as unknown as Record<string, number>;
      for (const chave of Object.keys(semForma)) {
        expect(semForma[chave], `métrica ${chave}`).toBe(comFem[chave]);
      }
    }
  });

  it('as dez deusas têm todas as medidas idênticas com e sem o eixo', () => {
    for (const id of OFFICIAL_IDS) {
      if (id === 'aerion') continue;
      const p = officialProportions(id)!;
      const antes = bodyMetrics(p) as unknown as Record<string, number>;
      const agora = bodyMetrics(p, officialShape(id)!) as unknown as Record<string, number>;
      for (const chave of Object.keys(antes)) {
        expect(agora[chave], `${id}.${chave}`).toBe(antes[chave]);
      }
    }
  });

  it('o Aérion é o único personagem oficial que declara forma', () => {
    const declaram = PANTHEON.filter((c) => c.shape !== undefined).map((c) => c.id);
    expect(declaram).toEqual(['aerion']);
    for (const id of OFFICIAL_IDS) {
      expect(officialShape(id), `forma de ${id}`).toBe(id === 'aerion' ? SHAPE_MASC : SHAPE_FEM);
    }
  });

  it('nenhum dos 54 habitantes recebe forma masculina', () => {
    // A Etapa 2 deu sexo aos habitantes; a Etapa 3 **não** lhes dá
    // corpo novo. Vinte e seis deles são masculinos e continuam com a
    // silhueta de referência — mudar isso não foi autorizado.
    let masculinos = 0;
    for (let i = 1; i <= 54; i++) {
      const cidadao = makeCitizen(i);
      if (cidadao.appearance.sex === 'masc') masculinos++;
      const p = proportionsFor(`cidadao:${cidadao.seed}`, cidadao.appearance.height);
      const padrao = bodyMetrics(p) as unknown as Record<string, number>;
      const comFem = bodyMetrics(p, SHAPE_FEM) as unknown as Record<string, number>;
      for (const chave of Object.keys(padrao)) {
        expect(padrao[chave], `habitante ${i} — ${chave}`).toBe(comFem[chave]);
      }
    }
    // Se este número mudar, a cidade foi mexida sem autorização.
    expect(masculinos).toBe(26);
  });

  it('a impressão digital das dez deusas não ganhou sufixo de forma', () => {
    for (const id of OFFICIAL_IDS) {
      const digital = officialFingerprint(id)!;
      if (id === 'aerion') expect(digital).toContain('|forma:masc');
      else expect(digital, `ficha ${id}`).not.toContain('forma:');
    }
  });

  it('a impressão digital continua distinguindo os onze', () => {
    expect(new Set(OFFICIAL_IDS.map((id) => officialFingerprint(id))).size).toBe(11);
  });
});

describe('C1 — efeito: o corpo do Aérion mudou de verdade', () => {
  const p = officialProportions('aerion')!;
  const antes = bodyMetrics(p, SHAPE_FEM);
  const agora = bodyMetrics(p, SHAPE_MASC);

  it('a razão peito/cintura chega ao alvo da etapa', () => {
    // Linha de base medida antes do C1: 1,012 — um tubo. O plano
    // fixou 1,20 como o mínimo que se lê como tronco masculino.
    expect(antes.chestWidth / antes.waistWidth).toBeCloseTo(1.012, 2);
    expect(agora.chestWidth / agora.waistWidth).toBeGreaterThanOrEqual(1.2);
  });

  it('a razão ombro/quadril aumenta', () => {
    expect(agora.shoulderX / agora.hipWidth).toBeGreaterThan(antes.shoulderX / antes.hipWidth);
    expect(agora.shoulderX / agora.hipWidth).toBeGreaterThanOrEqual(1.7);
  });

  it('o tronco afina e os ombros alargam, cada um para o seu lado', () => {
    expect(agora.shoulderX).toBeGreaterThan(antes.shoulderX);
    expect(agora.chestWidth).toBeGreaterThan(antes.chestWidth);
    expect(agora.waistWidth).toBeLessThan(antes.waistWidth);
    expect(agora.hipWidth).toBeLessThan(antes.hipWidth);
  });

  it('nenhum comprimento do Aérion mudou', () => {
    // O corpo dele continua tendo a altura e os membros que o hash do
    // nome deu. A forma mexe em largura, e só.
    const a = antes as unknown as Record<string, number>;
    const b = agora as unknown as Record<string, number>;
    for (const chave of ['crown', 'hipHeight', 'headR', 'armLength', 'legLength']) {
      if (!(chave in a)) continue;
      expect(b[chave], `comprimento ${chave}`).toBe(a[chave]);
    }
  });

  it('as pernas não se cruzam nem abrem um vão', () => {
    // O afastamento acompanha o quadril mais estreito; se não
    // acompanhasse, sobraria um vão entre as coxas.
    expect(agora.legX).toBeLessThan(antes.legX);
    expect(agora.legX).toBeGreaterThan(agora.legTop * 0.5);
  });
});

describe('C1 — a malha construída reflete a forma', () => {
  const aparencia = officialAppearance('aerion')!;
  const proporcoes = officialProportions('aerion')!;

  function malha(forma: BodyShape, nivel: keyof typeof BODY_DETAIL) {
    return buildBodyGeometry(aparencia, proporcoes, bodyMetrics(proporcoes, forma), BODY_DETAIL[nivel]);
  }


  it('o tronco é mais largo no peito e mais estreito na cintura, em todos os níveis', () => {
    // A razão lida na malha depende de quantos anéis o nível amostra:
    // medida nível a nível ela vai de 1,277 (media) a 1,362 (baixa)
    // para o mesmo corpo. Um piso absoluto perto desses valores
    // testaria o amostrador, não a silhueta — foi o que uma revisão
    // pegou, com o piso de 1,30 passando em ultra e reprovando em
    // media. O que vale em qualquer nível é a comparação **contra o
    // mesmo corpo na forma de referência**.
    for (const nivel of ['ultra', 'alta', 'media', 'baixa'] as const) {
      const fem = malha(SHAPE_FEM, nivel);
      const masc = malha(SHAPE_MASC, nivel);
      try {
        const peitoFem = larguraDoTronco(fem, [Bone.Torso], 0.26, 0.34);
        const peitoMasc = larguraDoTronco(masc, [Bone.Torso], 0.26, 0.34);
        const cinturaFem = larguraDoTronco(fem, [Bone.Torso], 0.1, 0.18);
        const cinturaMasc = larguraDoTronco(masc, [Bone.Torso], 0.1, 0.18);
        expect(peitoMasc, `peito em ${nivel}`).toBeGreaterThan(peitoFem);
        expect(cinturaMasc, `cintura em ${nivel}`).toBeLessThan(cinturaFem);
        const razaoFem = peitoFem / cinturaFem;
        const razaoMasc = peitoMasc / cinturaMasc;
        // Ganho relativo medido: +17,0% (ultra) a +22,7% (media).
        expect(razaoMasc / razaoFem, `ganho de razão em ${nivel}`).toBeGreaterThanOrEqual(1.12);
        // Piso absoluto folgado, abaixo do pior nível (media, 1,277).
        expect(razaoMasc, `razão absoluta em ${nivel}`).toBeGreaterThanOrEqual(1.25);
      } finally {
        fem.dispose();
        masc.dispose();
      }
    }
  });

  it('a forma não custa um vértice sequer, nos quatro níveis', () => {
    // O princípio reitor da etapa: silhueta é medida, não geometria.
    for (const nivel of ['ultra', 'alta', 'media', 'baixa'] as const) {
      const fem = malha(SHAPE_FEM, nivel);
      const masc = malha(SHAPE_MASC, nivel);
      try {
        expect(masc.getAttribute('position').count, `nível ${nivel}`).toBe(
          fem.getAttribute('position').count,
        );
      } finally {
        fem.dispose();
        masc.dispose();
      }
    }
  });

  it('o Aérion continua dentro do orçamento de vértices do panteão', () => {
    // Tetos medidos no panteão inteiro: o maior corpo em ultra (maze)
    // e o maior em baixa (akemi). O Aérion não pode passar deles.
    const ultra = malha(SHAPE_MASC, 'ultra');
    const baixa = malha(SHAPE_MASC, 'baixa');
    try {
      expect(ultra.getAttribute('position').count).toBeLessThanOrEqual(44953);
      expect(baixa.getAttribute('position').count).toBeLessThanOrEqual(4982);
    } finally {
      ultra.dispose();
      baixa.dispose();
    }
  });

  it('a malha não tem vértice inválido depois da mudança', () => {
    const masc = malha(SHAPE_MASC, 'alta');
    try {
      const pos = masc.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i))).toBe(
          true,
        );
      }
    } finally {
      masc.dispose();
    }
  });

  it('as dez deusas constroem malha idêntica com e sem o eixo', () => {
    // A prova final de isolamento: não os números, os vértices.
    for (const id of OFFICIAL_IDS) {
      if (id === 'aerion') continue;
      const ap = officialAppearance(id)!;
      const pp = officialProportions(id)!;
      const a = buildBodyGeometry(ap, pp, bodyMetrics(pp), BODY_DETAIL.media);
      const b = buildBodyGeometry(ap, pp, bodyMetrics(pp, officialShape(id)!), BODY_DETAIL.media);
      try {
        const pa = a.getAttribute('position');
        const pb = b.getAttribute('position');
        expect(pb.count, `${id}: contagem de vértices`).toBe(pa.count);
        let divergentes = 0;
        for (let i = 0; i < pa.count; i++) {
          if (pa.getX(i) !== pb.getX(i) || pa.getY(i) !== pb.getY(i) || pa.getZ(i) !== pb.getZ(i)) divergentes++;
        }
        expect(divergentes, `${id}: vértices deslocados`).toBe(0);
      } finally {
        a.dispose();
        b.dispose();
      }
    }
  });
});

describe('C1 — a ligação com o jogo', () => {
  /**
   * Os testes acima medem `bodyMetrics` e a geometria. Nenhum deles
   * passa por `createOfficialAvatar`, que é **o ponto onde o corpo de
   * verdade é construído** — e foi um mutante que mostrou isso: trocar
   * a forma ali dentro dava corpo masculino às dez deusas no jogo
   * inteiro sem derrubar uma asserção sequer.
   *
   * Este bloco existe por causa daquele mutante sobrevivente.
   */
  it('createOfficialAvatar dá forma masculina ao Aérion e só a ele', () => {
    for (const id of OFFICIAL_IDS) {
      const avatar = createOfficialAvatar(id);
      expect(avatar, `avatar oficial de ${id}`).not.toBeNull();
      try {
        expect(avatar!.shape, `forma do avatar de ${id}`).toBe(id === 'aerion' ? SHAPE_MASC : SHAPE_FEM);
      } finally {
        avatar!.dispose();
      }
    }
  });

  /** Malha do corpo dentro do avatar montado, sem abrir a classe para teste. */
  function malhaDoCorpo(avatar: Avatar): THREE.BufferGeometry {
    let achada: THREE.BufferGeometry | null = null;
    avatar.root.traverse((o) => {
      if (!achada && (o as THREE.SkinnedMesh).isSkinnedMesh) achada = (o as THREE.SkinnedMesh).geometry;
    });
    if (!achada) throw new Error('avatar sem malha de corpo');
    return achada;
  }

  it('o avatar do Aérion nasce com o tronco já na forma dele', () => {
    // Medido na malha que o avatar realmente carrega — é o corpo que
    // aparece em cena, não um número paralelo calculado no teste.
    const aerion = createOfficialAvatar('aerion')!;
    const referencia = new Avatar(officialAppearance('aerion')!, officialProportions('aerion')!);
    try {
      const peito = (g: THREE.BufferGeometry) => larguraDoTronco(g, [Bone.Torso], 0.26, 0.34);
      const cintura = (g: THREE.BufferGeometry) => larguraDoTronco(g, [Bone.Torso], 0.1, 0.18);
      const a = malhaDoCorpo(aerion);
      const r = malhaDoCorpo(referencia);
      expect(peito(a)).toBeGreaterThan(peito(r));
      expect(cintura(a)).toBeLessThan(cintura(r));
      // Relativo ao corpo de referência no mesmo nível, pelo mesmo
      // motivo do teste acima: piso absoluto mede o amostrador.
      expect(peito(a) / cintura(a)).toBeGreaterThan(peito(r) / cintura(r));
      expect(peito(a) / cintura(a)).toBeGreaterThanOrEqual(1.25);
    } finally {
      aerion.dispose();
      referencia.dispose();
    }
  });

  it('quem constrói um Avatar sem dizer a forma recebe a de referência', () => {
    // É por aqui que passam os 54 habitantes, o jogador e a prévia do
    // celular: três chamadas de dois argumentos. Se o padrão mudasse,
    // a cidade inteira mudaria de corpo.
    const avatar = new Avatar();
    try {
      expect(avatar.shape).toBe(SHAPE_FEM);
    } finally {
      avatar.dispose();
    }
  });

  it('reconstruir o corpo preserva a forma', () => {
    // `rebuild` recalcula métricas e esqueleto. Se ele esquecesse a
    // forma, o Aérion voltaria ao corpo antigo ao trocar de roupa, de
    // nível de detalhe ou de região.
    const avatar = createOfficialAvatar('aerion')!;
    const referencia = new Avatar(officialAppearance('aerion')!, officialProportions('aerion')!);
    try {
      avatar.setDetail('media');
      expect(avatar.shape).toBe(SHAPE_MASC);
      // Comparado com o corpo de referência **no mesmo nível de
      // detalhe**: níveis diferentes amostram o tronco com menos
      // anéis, então medir o personagem contra ele mesmo em outro
      // nível mediria o amostrador, não a forma.
      referencia.setDetail('media');
      const dele = larguraDoTronco(malhaDoCorpo(avatar), [Bone.Torso], 0.26, 0.34);
      const padrao = larguraDoTronco(malhaDoCorpo(referencia), [Bone.Torso], 0.26, 0.34);
      expect(dele).toBeGreaterThan(padrao);
    } finally {
      avatar.dispose();
      referencia.dispose();
    }
  });
});
