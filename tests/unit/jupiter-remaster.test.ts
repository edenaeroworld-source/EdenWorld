// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Júpiter — e a prova de que o resto do Éden não mudou.
 *
 * A Júpiter é a **Deusa da Arte e da Criação Estética**, dona da
 * pintura, do design e da identidade visual do Éden Aero, e mora no
 * Pavilhão Lumen, a galeria holográfica de Aurora City. Ela é a
 * **nona e última** deusa do elenco a ser remasterizada.
 *
 * Quatro achados da investigação moldaram o que se testa aqui:
 *
 *  · **ela era a única deusa com os dois campos compartilhados ao
 *    mesmo tempo.** O `cacheado` é penteado de habitante; o `vestido`
 *    é traje de habitante. Nada na aparência dela era dela;
 *  · **o `cacheado` custava 1 170 triângulos no LOD baixo** — três
 *    vezes a média do catálogo — para render só 4 284 em ultra: um
 *    capacete de oito a doze esferas de subdivisão fixa, caro de
 *    longe e pobre de perto. É o mesmo defeito estrutural da `flor`
 *    da Maze, mas o `cacheado` **não foi corrigido**, porque é peça
 *    de habitante e consertá-lo mudaria gente que não está em marco;
 *  · **o `bottomColor` dela (`#2e3a4f`, azul-escuro) não aparecia em
 *    lugar nenhum da malha.** Era campo morto numa deusa de cor;
 *  · **a vizinhança cromática é apertada.** Saturno (`#ffd98a`,
 *    `#e08a2f`) e Amara (`#ffe9a6`, `#c79a3a`) ocupam o dourado
 *    quente; a Júpiter (`#ffb199`, `#c0392b`) tem o vermelho. A
 *    divisão que este arquivo guarda: **ouro em massa — galhada,
 *    folha, pata — é da Saturno; na Júpiter o ouro é fio fino, e
 *    quem domina a silhueta é o vermelho.**
 *
 * Vários casos nasceram de defeitos que a bancada mostrou nas onze
 * rodadas do marco, e é por isso que os números são tão específicos:
 *
 *  · as fitas nasceram com a largura no eixo errado — tangente ao
 *    anel horizontal, não perpendicular ao caminho — e com a torção
 *    reiniciando a cada trecho: o resultado era uma serrilha que lia
 *    como **folha de palmeira**, justamente a leitura que a fronteira
 *    com a Saturno proíbe;
 *  · o torso do Éden é uma **elipse de 2,3 : 1**, e a fita de raio
 *    circular boiava à frente do peito e sumia dentro do pano nas
 *    laterais;
 *  · uma espiral de duas voltas e meia em torno do tronco virou
 *    **múmia**, e meia volta diagonal virou **alça de bolsa**;
 *  · as pontas soltas, postas nas laterais, caíram exatamente por
 *    cima das mãos;
 *  · as mechas douradas do cabelo atravessaram a boca na primeira
 *    tentativa e saíram **esverdeadas** na segunda — foram cortadas;
 *  · o relevo das pregas da saia, pedido em 1,2 cm, não apareceu em
 *    captura nenhuma: é a mesma lição de `R · 0,055` do marco da Maze.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/characters/Pantheon';
import { Avatar } from '../../src/player/Avatar';
import {
  ACCESSORIES,
  ACCESSORY_LABELS,
  CITIZEN_ACCESSORIES,
  CITIZEN_HAIR_STYLES,
  CITIZEN_OUTFITS,
  DEFAULT_APPEARANCE,
  HAIR_STYLES,
  HAIR_LABELS,
  OUTFITS,
  OUTFIT_LABELS,
  randomAppearance,
} from '../../src/player/AvatarAppearance';
import { Finish } from '../../src/player/body/BodyRig';
import type { AvatarAppearance } from '../../src/player/AvatarAppearance';
import type { BodyDetailLevel } from '../../src/player/body/BodyRig';

const jupiter = getCharacter('jupiter')!;
const saturno = getCharacter('saturno')!;
const maze = getCharacter('maze')!;
const amara = getCharacter('amara')!;
const aerion = getCharacter('aerion')!;

type Malha = THREE.SkinnedMesh;

/** Monta a deusa num nível e devolve a malha do corpo. */
const montar = (extra: Partial<AvatarAppearance> = {}, nivel: BodyDetailLevel = 'ultra'): Malha => {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, ...jupiter.appearance, ...extra });
  avatar.setDetail(nivel);
  return avatar.root.getObjectByName('corpo') as Malha;
};

/** Soma de triângulos de todas as malhas do avatar, que é o que o orçamento conta. */
const triangulos = (extra: Partial<AvatarAppearance> = {}, nivel: BodyDetailLevel = 'ultra'): number => {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, ...jupiter.appearance, ...extra });
  avatar.setDetail(nivel);
  let total = 0;
  avatar.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    total += g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
  });
  return Math.round(total);
};

/** Quantas malhas o avatar carrega — o motor exige três, sempre. */
const malhas = (extra: Partial<AvatarAppearance> = {}, nivel: BodyDetailLevel = 'ultra'): number => {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, ...jupiter.appearance, ...extra });
  avatar.setDetail(nivel);
  let n = 0;
  avatar.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n += 1;
  });
  return n;
};

/** Varre os vértices de um acabamento e entrega o que importa a cada caso. */
const varrer = (malha: Malha, acabamento: number, visita: (x: number, y: number, z: number, i: number) => void): void => {
  const pos = malha.geometry.getAttribute('position');
  const fin = malha.geometry.getAttribute('aFinish');
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.round(fin.getX(i)) !== acabamento) continue;
    visita(pos.getX(i), pos.getY(i), pos.getZ(i), i);
  }
};

/** Conta vértices de uma cor, com tolerância — as cores vêm do atributo `color`. */
const temCor = (malha: Malha, hex: number, tol = 0.02): number => {
  const cor = malha.geometry.getAttribute('color');
  if (!cor) return 0;
  const alvo = new THREE.Color(hex);
  let n = 0;
  for (let i = 0; i < cor.count; i += 1) {
    if (
      Math.abs(cor.getX(i) - alvo.r) < tol &&
      Math.abs(cor.getY(i) - alvo.g) < tol &&
      Math.abs(cor.getZ(i) - alvo.b) < tol
    ) {
      n += 1;
    }
  }
  return n;
};

describe('Júpiter 2.0 — as três peças exclusivas', () => {
  it('o penteado `pincelada` existe no catálogo e os habitantes não o herdam', () => {
    expect(HAIR_STYLES).toContain('pincelada');
    expect(CITIZEN_HAIR_STYLES).not.toContain('pincelada');
    expect(HAIR_LABELS.pincelada).toBe('Pincelada');
  });

  it('o traje `lumen` existe no catálogo e os habitantes não o herdam', () => {
    expect(OUTFITS).toContain('lumen');
    expect(CITIZEN_OUTFITS).not.toContain('lumen');
    expect(OUTFIT_LABELS.lumen).toBe('Traje Lumen');
  });

  it('o acessório `atelie` existe no catálogo e os habitantes não o herdam', () => {
    expect(ACCESSORIES).toContain('atelie');
    expect(CITIZEN_ACCESSORIES).not.toContain('atelie');
    expect(ACCESSORY_LABELS.atelie).toBe('Ouro do Ateliê');
  });

  it('o sorteio de habitantes nunca entrega as três peças, em mil tentativas', () => {
    for (let i = 0; i < 1000; i += 1) {
      const a = randomAppearance(Math.random);
      expect(a.hairStyle).not.toBe('pincelada');
      expect(a.outfit).not.toBe('lumen');
      expect(a.accessory).not.toBe('atelie');
    }
  });

  it('o nome do traje vem do lugar dela, que já era canônico', () => {
    // O Pavilhão Lumen estava na bio e no `place` dela desde antes
    // deste marco. O traje é a obra que ela veste, não um nome novo.
    expect(OUTFIT_LABELS.lumen).toContain('Lumen');
    expect(jupiter.bio.join(' ')).toContain('Pavilhão Lumen');
  });
});

describe('Júpiter 2.0 — a ficha', () => {
  it('veste as três peças exclusivas', () => {
    expect(jupiter.appearance.hairStyle).toBe('pincelada');
    expect(jupiter.appearance.outfit).toBe('lumen');
    expect(jupiter.appearance.accessory).toBe('atelie');
  });

  it('o cânone da ficha sai intacto do marco', () => {
    expect(jupiter.title).toBe('Deusa da Arte e da Criação Estética');
    expect(jupiter.colors).toEqual(['#ffb199', '#c0392b']);
    expect(jupiter.aura).toBe(0xff9f6a);
    expect(jupiter.tagline).toBe('Assina a identidade visual do Éden.');
    expect(jupiter.contact?.handle).toBe('@jupiter');
    expect(jupiter.appearance.skin).toBe('#cf8f63');
    expect(jupiter.appearance.eyeColor).toBe('#3b2a20');
    expect(jupiter.appearance.height).toBe(1.0);
    expect(jupiter.appearance.hairColor).toBe('#c0392b');
  });

  it('o `bottomColor` morto virou cor viva', () => {
    // Era `#2e3a4f`, azul-escuro, e não aparecia em lugar nenhum da
    // malha: campo morto numa deusa cuja profissão é cor.
    expect(jupiter.appearance.bottomColor).not.toBe('#2e3a4f');
    expect(jupiter.appearance.bottomColor).toBe('#ffb199');
    // E o `topColor` passou a ser o claro do drapeado.
    expect(jupiter.appearance.topColor).toBe('#f7f2ee');
  });

  it('a bio conta o que a malha mostra', () => {
    const texto = jupiter.bio.join(' ');
    expect(texto).toContain('ondas longas');
    expect(texto).toContain('Traje Lumen');
  });
});

describe('Júpiter 2.0 — o penteado Pincelada', () => {
  it('é uma queda longa: desce abaixo do busto', () => {
    const malha = montar();
    let min = 9;
    varrer(malha, Finish.Hair, (_x, y) => {
      min = Math.min(min, y);
    });
    // O `cacheado` parava em `y = 0,6445`, logo abaixo do queixo.
    expect(min).toBeLessThan(0.3);
  });

  it('não engole o rosto: a frente é rasa na linha do olhar', () => {
    const malha = montar();
    // A frente do rosto está em `z = 0,2089`, na altura `y = 0,6653`.
    // Nenhum vértice de cabelo pode avançar sobre isso na faixa dos
    // olhos e da boca, ou a deusa fica de capuz.
    let maisFrente = -9;
    varrer(malha, Finish.Hair, (x, y, z) => {
      if (y < 0.6 || y > 0.72 || Math.abs(x) > 0.08) return;
      maisFrente = Math.max(maisFrente, z);
    });
    expect(maisFrente).toBeLessThan(0.2089);
  });

  it('cobre a calota que `buildHair` desenha para os treze penteados', () => {
    // A calota é comum a todo o catálogo e **não pode ser alterada**.
    // A queda passa por cima dela: o cabelo tem de alcançar o alto do
    // crânio, que está em `y = 0,9265`.
    const malha = montar();
    let max = -9;
    varrer(malha, Finish.Hair, (_x, y) => {
      max = Math.max(max, y);
    });
    expect(max).toBeGreaterThan(0.92);
  });

  it('tem volume atrás, e não só uma cortina chapada', () => {
    const malha = montar();
    let fundo = 9;
    varrer(malha, Finish.Hair, (_x, _y, z) => {
      fundo = Math.min(fundo, z);
    });
    expect(fundo).toBeLessThan(-0.2);
  });

  it('degrada por LOD, que é o defeito que tirou o `cacheado` dela', () => {
    const niveis: BodyDetailLevel[] = ['baixa', 'media', 'alta', 'ultra'];
    const custos = niveis.map((n) => triangulos({}, n) - triangulos({ hairStyle: 'careca' }, n));
    // Cada nível tem de custar mais que o anterior. O `cacheado`
    // cobrava 1 170 em baixa e 4 284 em ultra: a curva quase não
    // subia, porque as esferas tinham subdivisão fixa.
    for (let i = 1; i < custos.length; i += 1) expect(custos[i]).toBeGreaterThan(custos[i - 1]);
    // E a razão ultra/baixa tem de ser folgada, não os 3,7× do `cacheado`.
    expect(custos[3] / custos[0]).toBeGreaterThan(8);
  });

  it('não tem mecha dourada: ouro no cabelo saiu verde na bancada', () => {
    const malha = montar();
    // `0xf0c95a` é o ouro do Éden. No cabelo ele apareceu como risco
    // esverdeado sobre o vermelho — cor proibida pela fronteira com a
    // Saturno —, então o ouro dela vive no traje e no acessório.
    let ouroNoCabelo = 0;
    const cor = malha.geometry.getAttribute('color');
    const alvo = new THREE.Color(0xf0c95a);
    varrer(malha, Finish.Hair, (_x, _y, _z, i) => {
      if (
        Math.abs(cor.getX(i) - alvo.r) < 0.02 &&
        Math.abs(cor.getY(i) - alvo.g) < 0.02 &&
        Math.abs(cor.getZ(i) - alvo.b) < 0.02
      ) {
        ouroNoCabelo += 1;
      }
    });
    expect(ouroNoCabelo).toBe(0);
  });

  it('o `cacheado` que ela deixou continua inteiro para os habitantes', () => {
    expect(CITIZEN_HAIR_STYLES).toContain('cacheado');
    expect(HAIR_STYLES).toContain('cacheado');
    const comCacheado = montar({ hairStyle: 'cacheado' });
    let n = 0;
    varrer(comCacheado, Finish.Hair, () => {
      n += 1;
    });
    expect(n).toBeGreaterThan(0);
  });
});

describe('Júpiter 2.0 — o Traje Lumen', () => {
  it('carrega o gradiente da paleta canônica dela', () => {
    const malha = montar();
    // Pêssego, laranja de passagem e vermelho: as duas pontas são a
    // `colors` da ficha, e é o que garante que ela siga sendo a deusa
    // vermelha mesmo que alguém vista o traje noutra cor.
    expect(temCor(malha, 0xffb199)).toBeGreaterThan(0);
    expect(temCor(malha, 0xff8a4a)).toBeGreaterThan(0);
    expect(temCor(malha, 0xc0392b)).toBeGreaterThan(0);
  });

  it('as fitas têm volume: não são superfície plana', () => {
    // A lição mais cara do marco da Maze é que pano plano e largo, sob
    // luz difusa e sem textura, lê como cartolina. Cada trecho de fita
    // é um prisma fechado de quatro faces, com espessura.
    //
    // A prova geométrica: o pano do traje ocupa mais profundidade que
    // o do `vestido` liso na faixa do tronco.
    const lumen = montar();
    const liso = montar({ outfit: 'vestido' });
    const fundura = (m: Malha): number => {
      let min = 9;
      let max = -9;
      varrer(m, Finish.Cloth, (_x, y, z) => {
        if (y < 0.1 || y > 0.45) return;
        min = Math.min(min, z);
        max = Math.max(max, z);
      });
      return max - min;
    };
    expect(fundura(lumen)).toBeGreaterThan(fundura(liso));
  });

  it('as fitas não boiam à frente do corpo nem somem dentro do pano', () => {
    // O torso é uma elipse de 2,3 : 1 (`rx 0,2485` contra
    // `rz 0,1002`). Com raio circular a fita saía trinta centímetros
    // à frente do peito. A sobra sobre o pano do `vestido` tem de ser
    // de fita, não de prancha.
    const lumen = montar();
    const liso = montar({ outfit: 'vestido' });
    const raioMax = (m: Malha, y0: number, y1: number): number => {
      let r = 0;
      varrer(m, Finish.Cloth, (x, y, z) => {
        if (y < y0 || y > y1) return;
        r = Math.max(r, Math.hypot(x, z));
      });
      return r;
    };
    const sobra = raioMax(lumen, -0.35, -0.1) - raioMax(liso, -0.35, -0.1);
    expect(sobra).toBeGreaterThan(0);
    expect(sobra).toBeLessThan(0.05);
  });

  it('nada do traje desce abaixo da barra da saia', () => {
    // `SKIRT_HEM_Y` é −0,36. Numa das rodadas a fita do quadril
    // terminava abaixo disso e aparecia solta sob o pano.
    const lumen = montar();
    const liso = montar({ outfit: 'vestido' });
    const raioAbaixo = (m: Malha): number => {
      let r = 0;
      varrer(m, Finish.Cloth, (x, y, z) => {
        if (y > -0.38) return;
        r = Math.max(r, Math.hypot(x, z));
      });
      return r;
    };
    expect(raioAbaixo(lumen)).toBeLessThanOrEqual(raioAbaixo(liso) + 0.01);
  });

  it('acende à noite, com nervura de luz e pouca dela', () => {
    const malha = montar();
    let holo = 0;
    varrer(malha, Finish.Holo, () => {
      holo += 1;
    });
    expect(holo).toBeGreaterThan(0);
    // Pouca: a galeria dela muda com a luz do dia, a roupa faz o
    // mesmo, e nenhuma das duas é pisca-pisca.
    let pano = 0;
    varrer(malha, Finish.Cloth, () => {
      pano += 1;
    });
    expect(holo).toBeLessThan(pano * 0.1);
  });

  it('as pontas soltas caem à frente e atrás, nunca por cima das mãos', () => {
    // Os braços descem ao lado do corpo e as mãos param em torno de
    // `y = −0,2`, com `|x|` até 0,212. Uma rodada pôs duas abas de
    // pano exatamente ali.
    const lumen = montar();
    const liso = montar({ outfit: 'vestido' });
    const panoLateral = (m: Malha): number => {
      let n = 0;
      varrer(m, Finish.Cloth, (x, y, z) => {
        if (y < -0.28 || y > -0.12) return;
        if (Math.abs(z) > 0.09) return;
        if (Math.abs(x) < 0.19) return;
        n += 1;
      });
      return n;
    };
    expect(panoLateral(lumen)).toBeLessThanOrEqual(panoLateral(liso) + 4);
  });

  it('o `vestido` que ela deixou continua inteiro para os habitantes', () => {
    expect(CITIZEN_OUTFITS).toContain('vestido');
    expect(OUTFITS).toContain('vestido');
    const malha = montar({ outfit: 'vestido' });
    let n = 0;
    varrer(malha, Finish.Cloth, () => {
      n += 1;
    });
    expect(n).toBeGreaterThan(0);
  });

  it('o traje degrada nos quatro níveis', () => {
    const niveis: BodyDetailLevel[] = ['baixa', 'media', 'alta', 'ultra'];
    const custos = niveis.map((n) => triangulos({}, n) - triangulos({ outfit: 'vestido' }, n));
    for (let i = 1; i < custos.length; i += 1) expect(custos[i]).toBeGreaterThanOrEqual(custos[i - 1]);
  });
});

describe('Júpiter 2.0 — o Ouro do Ateliê', () => {
  it('a gargantilha é um anel completo, e não uma peça só na frente', () => {
    // Lição do marco da Lilly: peça presa só na frente do pescoço não
    // lê como colar. O primeiro esboço da Saturno repetiu o erro ao
    // contrário, pondo tudo nas costas.
    const malha = montar();
    const liso = montar({ accessory: 'nenhum' });
    const conta = (m: Malha, teste: (x: number, y: number, z: number) => boolean): number => {
      let n = 0;
      varrer(m, Finish.Shine, (x, y, z) => {
        if (teste(x, y, z)) n += 1;
      });
      return n;
    };
    const naFaixaDoPescoco = (frente: boolean) => (x: number, y: number, z: number) =>
      y > 0.45 && y < 0.62 && Math.abs(x) < 0.12 && (frente ? z > 0.03 : z < -0.03);
    expect(conta(malha, naFaixaDoPescoco(true))).toBeGreaterThan(conta(liso, naFaixaDoPescoco(true)));
    expect(conta(malha, naFaixaDoPescoco(false))).toBeGreaterThan(conta(liso, naFaixaDoPescoco(false)));
  });

  it('tem bracelete nos dois pulsos, e nos pulsos de verdade', () => {
    // O punho em bind pose está em `y = −0,041`, que sai das mesmas
    // fórmulas de `buildArm`. A primeira versão chutou o lugar a
    // partir de `m.legX` — a abertura das **pernas** — e o bracelete
    // só apareceu fora do braço na captura com a deusa andando: um
    // aro dourado solto no meio da saia. Este caso fixa a altura.
    const malha = montar();
    const liso = montar({ accessory: 'nenhum' });
    const lado = (m: Malha, sinal: number): number => {
      let n = 0;
      varrer(m, Finish.Shine, (x, y) => {
        if (y > 0.0 || y < -0.09) return;
        if (Math.sign(x) !== sinal || Math.abs(x) < 0.15) return;
        n += 1;
      });
      return n;
    };
    expect(lado(malha, -1)).toBeGreaterThan(0);
    expect(lado(malha, 1)).toBeGreaterThan(0);
    expect(lado(liso, -1)).toBe(0);
    expect(lado(liso, 1)).toBe(0);
    // E os dois lados têm praticamente o mesmo tanto de ouro: um
    // bracelete só, ou dois de tamanhos diferentes, aparece aqui. A
    // folga de 5% é para o debrum da faixa do ombro, que é diagonal
    // e, por ser diagonal, nunca é simétrico.
    const esq = lado(malha, -1);
    const dir = lado(malha, 1);
    expect(Math.abs(esq - dir) / Math.max(esq, dir)).toBeLessThan(0.05);
  });

  it('é ouro em fio, nunca ouro em massa — a fronteira com a Saturno', () => {
    const malha = montar();
    let ouro = 0;
    let total = 0;
    const cor = malha.geometry.getAttribute('color');
    const alvo = new THREE.Color(0xf0c95a);
    for (let i = 0; i < cor.count; i += 1) {
      total += 1;
      if (
        Math.abs(cor.getX(i) - alvo.r) < 0.02 &&
        Math.abs(cor.getY(i) - alvo.g) < 0.02 &&
        Math.abs(cor.getZ(i) - alvo.b) < 0.02
      ) {
        ouro += 1;
      }
    }
    // Ouro **em massa** — galhada, folha, pata — é da Saturno. Aqui
    // ele é traço de tinta: uma fração pequena da malha.
    expect(ouro).toBeGreaterThan(0);
    expect(ouro / total).toBeLessThan(0.1);
  });

  it('o campo de acessório dela estava livre, e não custou peça de ninguém', () => {
    // Ao contrário da Maze, cujo campo estava ocupado pela `flor`, a
    // Júpiter usava `nenhum`. O ouro pôde morar onde é o lugar dele.
    expect(ACCESSORIES).toContain('nenhum');
    expect(CITIZEN_ACCESSORIES).toContain('nenhum');
  });

  it('o acessório degrada: brincos só nos níveis altos', () => {
    const baixa = triangulos({}, 'baixa') - triangulos({ accessory: 'nenhum' }, 'baixa');
    const ultra = triangulos({}, 'ultra') - triangulos({ accessory: 'nenhum' }, 'ultra');
    expect(baixa).toBeGreaterThan(0);
    expect(ultra).toBeGreaterThan(baixa * 3);
  });
});

describe('Júpiter 2.0 — a fronteira com o resto do elenco', () => {
  it('o vermelho domina a silhueta dela, e o dourado é o da Saturno', () => {
    expect(jupiter.colors).toEqual(['#ffb199', '#c0392b']);
    expect(saturno.colors).toEqual(['#ffd98a', '#e08a2f']);
    // **Atualizado no marco da Amara 2.0.** O dourado dela era
    // vizinho direto do da Saturno; ela saiu dele para a água-marinha
    // com briefing próprio. A asserção que importa aqui continua de
    // pé, e é a de baixo: nenhuma das três partilha ponta de paleta.
    expect(amara.colors).toEqual(['#aef0dd', '#2f9b8e']);
    // Nenhuma das três partilha ponta de paleta com outra.
    const todas = [...jupiter.colors, ...saturno.colors, ...amara.colors];
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('não usa nada do vocabulário da Saturno', () => {
    // Galhada, folha de vidro e pata são dela. A Júpiter não tem
    // `Finish.Glass` em peça nenhuma: vidro líquido em peça inteira é
    // da Luma, e nem sobrevive a `subdivideProfile`.
    const malha = montar();
    let vidro = 0;
    varrer(malha, Finish.Glass, () => {
      vidro += 1;
    });
    expect(vidro).toBe(0);
  });

  it('não invade a Maze: nada de verde na malha', () => {
    const malha = montar();
    const cor = malha.geometry.getAttribute('color');
    let verdes = 0;
    for (let i = 0; i < cor.count; i += 1) {
      const r = cor.getX(i);
      const g = cor.getY(i);
      const b = cor.getZ(i);
      // Verde é o que tem o canal verde dominante com folga.
      if (g > r + 0.08 && g > b + 0.08) verdes += 1;
    }
    expect(verdes).toBe(0);
    expect(maze.appearance.outfit).toBe('jardim');
  });

  it('as peças das outras oito remasterizações seguem de pé', () => {
    for (const peca of ['copa', 'silvestre', 'fibra'] as const) expect(HAIR_STYLES).toContain(peca);
    for (const peca of ['jardim', 'guardia', 'sistema'] as const) expect(OUTFITS).toContain(peca);
    for (const peca of ['pincelada'] as const) expect(HAIR_STYLES).toContain(peca);
    expect(maze.appearance.hairStyle).toBe('copa');
    expect(saturno.appearance.hairStyle).toBe('silvestre');
  });

  it('o Aérion continua com o `longo`, que não foi tocado', () => {
    // **Atualizado no marco da Amara 2.0.** A testemunha do `longo`
    // passou a ser só o Aérion: a Amara saiu dele para a `nascente`,
    // com briefing próprio. O que este caso guarda é a peça, não quem
    // a veste — e a peça continua inteira e no catálogo de habitante.
    expect(aerion.appearance.hairStyle).toBe('longo');
    expect(CITIZEN_HAIR_STYLES).toContain('longo');
  });
});

describe('Júpiter 2.0 — o orçamento', () => {
  it('ficou mais barata no LOD baixo do que era antes do marco', () => {
    // É o nível que roda quando há multidão em cena, e era onde o
    // `cacheado` doía mais: 1 170 triângulos para um capacete de
    // esferas que ninguém vê a cinquenta metros.
    const agora = triangulos({}, 'baixa');
    const antes = triangulos({ hairStyle: 'cacheado', outfit: 'vestido', accessory: 'nenhum' }, 'baixa');
    expect(agora).toBeLessThan(antes);
  });

  it('cabe no teto do LOD baixo com folga maior que a de antes', () => {
    const agora = triangulos({}, 'baixa');
    expect(agora).toBeLessThan(8400);
  });

  it('são três malhas em todos os níveis, sem exceção', () => {
    for (const n of ['baixa', 'media', 'alta', 'ultra'] as BodyDetailLevel[]) expect(malhas({}, n)).toBe(3);
  });

  it('nenhuma peça tem contagem fixa: os quatro níveis são diferentes', () => {
    const custos = (['baixa', 'media', 'alta', 'ultra'] as BodyDetailLevel[]).map((n) => triangulos({}, n));
    expect(new Set(custos).size).toBe(4);
    for (let i = 1; i < custos.length; i += 1) expect(custos[i]).toBeGreaterThan(custos[i - 1]);
  });

  it('a silhueta sobrevive ao LOD baixo: cabelo e faixa principal continuam lá', () => {
    const malha = montar({}, 'baixa');
    let cabelo = 0;
    varrer(malha, Finish.Hair, () => {
      cabelo += 1;
    });
    expect(cabelo).toBeGreaterThan(0);
    // E a faixa do ombro, que é a peça que diz "Júpiter" de longe.
    expect(temCor(malha, 0xffb199)).toBeGreaterThan(0);
  });
});

describe('Júpiter 2.0 — o resto do Éden não mudou', () => {
  it('monta sem erro em todos os níveis', () => {
    for (const n of ['baixa', 'media', 'alta', 'ultra'] as BodyDetailLevel[]) {
      expect(() => montar({}, n)).not.toThrow();
    }
  });

  it('os habitantes sorteados continuam montando', () => {
    for (let i = 0; i < 40; i += 1) {
      const a = randomAppearance(Math.random);
      expect(() => {
        const av = new Avatar(a);
        av.setDetail('media');
      }).not.toThrow();
    }
  });

  it('as oito deusas já remasterizadas continuam com as peças delas', () => {
    const esperado: Array<[string, string, string]> = [
      ['luma', 'ondulado', 'aurora'],
      ['suki', 'cascata', 'docente'],
      ['nexara', 'fluxo', 'rede'],
      ['lilly', 'onda', 'sonora'],
      ['akemi', 'cachos', 'cosplay'],
      ['saturno', 'silvestre', 'guardia'],
      ['haru', 'fibra', 'sistema'],
      ['maze', 'copa', 'jardim'],
    ];
    for (const [id, cabelo, traje] of esperado) {
      const p = getCharacter(id)!;
      expect(p.appearance.hairStyle).toBe(cabelo);
      expect(p.appearance.outfit).toBe(traje);
    }
  });

  it('o catálogo de habitantes não encolheu', () => {
    for (const peca of ['cacheado', 'longo', 'ondulado', 'curto'] as const) {
      expect(CITIZEN_HAIR_STYLES).toContain(peca);
    }
    for (const peca of ['vestido', 'casual', 'esportivo'] as const) {
      expect(CITIZEN_OUTFITS).toContain(peca);
    }
  });
});
