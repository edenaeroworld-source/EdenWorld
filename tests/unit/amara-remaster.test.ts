// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Amara — e a prova de que o resto do Éden não mudou.
 *
 * A Amara é a **Deusa da Maternidade**, dona do cuidado que começa
 * antes de alguém chegar, e mora no Mirante Celeste. Ela é a **décima
 * e última** figura do Panteão a ser remasterizada, e a única com um
 * sistema próprio no motor: `src/player/Gestation.ts`, o ventre que o
 * avatar carrega pela cidade inteira.
 *
 * Quatro achados da investigação moldaram o que se testa aqui:
 *
 *  · **ela era geometricamente idêntica ao Criador Aérion.** Vestia
 *    `longo` e `aero`, as duas peças genéricas, nos quatro níveis de
 *    detalhe: a Deusa da Maternidade e o Criador do Éden Aero saíam
 *    da mesma malha, diferindo só na semente do rosto;
 *  · **o dourado dela era o da Saturno.** `#ffe9a6` / `#c79a3a`
 *    contra `#ffd98a` / `#e08a2f` — vizinhos diretos em matiz e em
 *    valor, e a Júpiter encostava no mesmo canto quente;
 *  · **o campo `halo` existia na ficha e ninguém o usava.** Estava em
 *    `EdenCharacter` desde que o aro foi criado, sem um único
 *    personagem a declará-lo. Amara é a primeira;
 *  · **nada que ela veste pode ignorar o ventre.** A banda de
 *    gestação multiplica `x` e `z` por até 2,05 em `y = 0,16`. Roupa
 *    que não declare `zone` e `origin` racha; roupa que declare,
 *    acompanha.
 *
 * Vários casos nasceram de defeitos que a bancada mostrou nas catorze
 * rodadas do marco, e é por isso que os números são tão específicos:
 *
 *  · `cy`, o centro da cabeça em `buildHair`, **não é o centro do
 *    crânio** — vale 0,716, a altura da boca, e o alto do crânio está
 *    em `cy + 1,25 R`. Quatro rodadas desenharam o domo do cabelo meio
 *    crânio abaixo de onde ele devia estar, e a captura devolveu uma
 *    touca de natação;
 *  · a calota que `buildHair` desenha antes do `switch` é dos
 *    dezesseis penteados e **não se altera** — cobre-se. Cobrir com
 *    casca lisa, porém, só troca uma touca por outra: a massa precisa
 *    de vales em meridiano para ler como cabelo;
 *  · o manto nasceu com 3,4 cm de largura e saiu **suspensório**; a
 *    60° de azimute passou **ao lado** do ventre, que é uma elipse de
 *    2,3 : 1, e a barriga o engoliu; em `Finish.Glass` saiu
 *    **facetado**, lido como placa de vidro;
 *  · o fecho do manto, desenhado contra `PELVIS_PROFILE`, nasceu
 *    **dentro da saia**, que ali é 10 cm mais larga que a pelve nua.
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
  HAIR_LABELS,
  HAIR_STYLES,
  OUTFIT_LABELS,
  OUTFITS,
  randomAppearance,
} from '../../src/player/AvatarAppearance';
import { displaceGestation, MAX_GESTATION } from '../../src/player/Gestation';
import { Finish } from '../../src/player/body/BodyRig';
import type { AvatarAppearance } from '../../src/player/AvatarAppearance';
import type { BodyDetailLevel } from '../../src/player/body/BodyRig';

const amara = getCharacter('amara')!;
const aerion = getCharacter('aerion')!;
const maze = getCharacter('maze')!;
const saturno = getCharacter('saturno')!;
const jupiter = getCharacter('jupiter')!;

type Malha = THREE.SkinnedMesh;

/** Monta a deusa num nível e devolve a malha do corpo. */
const montar = (extra: Partial<AvatarAppearance> = {}, nivel: BodyDetailLevel = 'ultra'): Malha => {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, ...amara.appearance, ...extra });
  avatar.setDetail(nivel);
  return avatar.root.getObjectByName('corpo') as Malha;
};

/** Soma de triângulos de todas as malhas do avatar, que é o que o orçamento conta. */
const triangulos = (ficha: AvatarAppearance, nivel: BodyDetailLevel = 'ultra'): number => {
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, ...ficha });
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
  const avatar = new Avatar({ ...DEFAULT_APPEARANCE, ...amara.appearance, ...extra });
  avatar.setDetail(nivel);
  let n = 0;
  avatar.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n += 1;
  });
  return n;
};

/** Conta vértices que satisfazem um teste de posição. */
const contar = (malha: Malha, teste: (x: number, y: number, z: number, i: number) => boolean): number => {
  const pos = malha.geometry.getAttribute('position');
  let n = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (teste(pos.getX(i), pos.getY(i), pos.getZ(i), i)) n += 1;
  }
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

describe('Amara 2.0 — as três peças exclusivas', () => {
  it('o penteado `nascente` existe no catálogo e os habitantes não o herdam', () => {
    expect(HAIR_STYLES).toContain('nascente');
    expect(CITIZEN_HAIR_STYLES).not.toContain('nascente');
    expect(HAIR_LABELS.nascente).toBe('Nascente');
  });

  it('o traje `regaco` existe no catálogo e os habitantes não o herdam', () => {
    expect(OUTFITS).toContain('regaco');
    expect(CITIZEN_OUTFITS).not.toContain('regaco');
    expect(OUTFIT_LABELS.regaco).toBe('Manto Regaço');
  });

  it('o acessório `nimbo` existe no catálogo e os habitantes não o herdam', () => {
    expect(ACCESSORIES).toContain('nimbo');
    expect(CITIZEN_ACCESSORIES).not.toContain('nimbo');
    expect(ACCESSORY_LABELS.nimbo).toBe('Nimbo Materno');
  });

  it('o sorteio de habitantes nunca entrega as três peças, em mil tentativas', () => {
    for (let i = 0; i < 1000; i += 1) {
      const a = randomAppearance(Math.random);
      expect(a.hairStyle).not.toBe('nascente');
      expect(a.outfit).not.toBe('regaco');
      expect(a.accessory).not.toBe('nimbo');
    }
  });

  it('o `nimbo` não toma o nome da `aureola`, que é peça de habitante', () => {
    // O nome óbvio já estava ocupado, e tomá-lo renomearia um
    // acessório que meia cidade usa. Os dois convivem.
    expect(ACCESSORIES).toContain('aureola');
    expect(CITIZEN_ACCESSORIES).toContain('aureola');
    expect(ACCESSORY_LABELS.nimbo).not.toBe(ACCESSORY_LABELS.aureola);
  });
});

describe('Amara 2.0 — a ficha', () => {
  it('veste as três peças dela e nenhuma genérica', () => {
    expect(amara.appearance.hairStyle).toBe('nascente');
    expect(amara.appearance.outfit).toBe('regaco');
    expect(amara.appearance.accessory).toBe('nimbo');
  });

  it('deixou de ser a cópia geométrica do Criador Aérion', () => {
    // Era este o achado que abriu o marco: as duas fichas montavam a
    // mesma malha, triângulo por triângulo, nos quatro níveis.
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      expect(triangulos(amara.appearance, nivel)).not.toBe(triangulos(aerion.appearance, nivel));
    }
  });

  it('a pele e o olho continuam os dela', () => {
    // Identidade, não paleta de marco: o âmbar é o único ponto quente
    // de um visual que sem ele vira monocromático.
    expect(amara.appearance.skin).toBe('#7d4a2c');
    expect(amara.appearance.eyeColor).toBe('#c98a2b');
  });

  it('a paleta saiu do dourado e foi para a água-marinha', () => {
    expect(amara.colors).toEqual(['#aef0dd', '#2f9b8e']);
    // E não encosta mais na Saturno nem na Júpiter, que ocupam o
    // canto quente.
    const todas = [...amara.colors, ...saturno.colors, ...jupiter.colors];
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('é a primeira personagem do Éden a declarar `halo`', () => {
    expect(amara.halo).toBe(0xbdf6e8);
    const comHalo = ['aerion', 'amara', 'luma', 'suki', 'nexara', 'lilly', 'akemi', 'saturno', 'haru', 'maze', 'jupiter']
      .map((id) => getCharacter(id))
      .filter((c) => c && c.halo !== undefined);
    expect(comHalo).toHaveLength(1);
    expect(comHalo[0]!.id).toBe('amara');
  });

  it('a aura acompanha a paleta nova', () => {
    expect(amara.aura).toBe(0x9fe8d8);
  });

  it('a gestação plena continua declarada, e é o sistema dela', () => {
    expect(amara.gestation).toBe(1);
    expect(amara.gestation).toBe(MAX_GESTATION);
  });

  it('o título, o lugar e a bio não foram tocados pelo marco', () => {
    expect(amara.title).toBe('Deusa da Maternidade');
    expect(amara.place.label).toBe('Mirante Celeste');
    expect(amara.bio.join(' ')).toContain('Mirante Celeste');
  });
});

describe('Amara 2.0 — o cabelo Nascente', () => {
  it('monta nos quatro níveis e sempre com as três malhas', () => {
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      expect(malhas({}, nivel)).toBe(3);
    }
  });

  it('cobre o alto do crânio, que a calota compartilhada deixava liso', () => {
    // O crânio nu termina em `y = 0,929`. Quatro rodadas desenharam o
    // domo abaixo disso — `cy` é a altura da boca, não o centro da
    // cabeça — e o que aparecia no alto era a calota de `buildHair`.
    const comCabelo = contar(montar(), (_x, y) => y > 0.9);
    const careca = contar(montar({ hairStyle: 'careca' }), (_x, y) => y > 0.9);
    expect(comCabelo).toBeGreaterThan(careca);
  });

  it('é a queda mais longa do catálogo, medida contra os dezesseis', () => {
    // **Medido pelo acabamento, nunca pela cor** — a lição é da
    // bancada da Nexara: a Nascente vai de verde-água a quase branco
    // de propósito, e um filtro por tom descartaria justamente o
    // trecho que se quer medir.
    //
    // A primeira versão deste caso contava vértices mais largos que
    // `|x| = 0,16` na faixa do tronco, e quebrou na rodada em que a
    // queda foi **estreitada de propósito** (a massa era mais larga
    // que os ombros e lia como casulo de costas). Contagem de
    // largura não é medida de comprimento: o que se afirma aqui é
    // que ela desce mais que qualquer outra, e é isso que se mede.
    const fundo = (estilo: string): number => {
      const avatar = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: estilo as never });
      avatar.setDetail('alta');
      const malha = avatar.root.getObjectByName('corpo') as Malha;
      const pos = malha.geometry.getAttribute('position');
      const fin = malha.geometry.getAttribute('aFinish');
      let min = Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.round(fin.getX(i)) === Finish.Hair) min = Math.min(min, pos.getY(i));
      }
      return min;
    };
    const dela = fundo('nascente');
    // Abaixo do quadril, que está em `y = 0`.
    expect(dela).toBeLessThan(-0.08);
    // Mais longa que **toda massa de cabelo** do catálogo, incluindo
    // a `cascata` da Suki-Chan, que detinha o título, e o `longo` que
    // ela própria vestia antes deste marco.
    for (const estilo of HAIR_STYLES) {
      if (estilo === 'nascente' || estilo === 'careca' || estilo === 'fibra') continue;
      expect(dela, `${estilo} não pode ser mais longo que a Nascente`).toBeLessThan(fundo(estilo));
    }
    // A exceção, e ela é honesta: a `fibra` da Akemi-Chan desce a
    // `−0,158` — mais fundo que a Nascente. Não é massa de cabelo, são
    // **filamentos ópticos** soltos, e o título que a Nascente toma é
    // o da queda; o dos fios continua com a Akemi.
    expect(fundo('fibra')).toBeLessThan(dela);
  });

  it('tem degradê de matiz: raiz verde-água e ponta clara', () => {
    const malha = montar();
    // Duas cores distantes na mesma peça. Com uma só, a captura de
    // costas devolveu um **casulo**: cabelo e vestido no mesmo tom,
    // sem silhueta entre os dois.
    expect(temCor(malha, 0x7fcfb8, 0.06)).toBeGreaterThan(0);
    expect(temCor(malha, 0xe3f6ec, 0.06)).toBeGreaterThan(0);
  });

  it('a raiz não é a cor do vestido, que é o que separa as duas massas', () => {
    const raiz = new THREE.Color(0x7fcfb8);
    const pano = new THREE.Color(amara.appearance.topColor);
    const distancia = Math.hypot(raiz.r - pano.r, raiz.g - pano.g, raiz.b - pano.b);
    expect(distancia).toBeGreaterThan(0.05);
  });

  it('não é `longo` reaproveitado: custa mais e desenha outra coisa', () => {
    expect(triangulos(amara.appearance)).toBeGreaterThan(
      triangulos({ ...amara.appearance, hairStyle: 'longo' }),
    );
  });

  it('o `longo` continua montando para quem o veste', () => {
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      expect(triangulos(aerion.appearance, nivel)).toBeGreaterThan(0);
    }
    expect(aerion.appearance.hairStyle).toBe('longo');
    expect(CITIZEN_HAIR_STYLES).toContain('longo');
  });
});

describe('Amara 2.0 — o Manto Regaço', () => {
  it('passa à frente do ventre, não ao lado dele', () => {
    // O tronco é uma elipse de 2,3 : 1: um ponto a 60° de azimute tem
    // `z = 0,061` e está **ao lado** do corpo. O ventre avança até
    // `z = 0,19`, e o manto a 60° saía engolido pela barriga.
    const malha = montar();
    let frente = -9;
    varrer(malha, Finish.Cloth, (x, y, z) => {
      if (y > 0.13 && y < 0.19 && Math.abs(x) < 0.09) frente = Math.max(frente, z);
    });
    expect(frente).toBeGreaterThan(0.17);
  });

  it('o fecho desce sobre a saia, e não para na pelve nua', () => {
    // `PELVIS_PROFILE` mede 0,13 a 0,17 de raio; a saia vestida mede
    // 0,2345 na mesma altura. O fecho desenhado contra a tabela do
    // corpo nasceu **dentro do pano**.
    const comManto = contar(montar(), (x, y, z) => y > -0.12 && y < -0.04 && z > 0.15 && Math.abs(x) < 0.09);
    const semManto = contar(montar({ outfit: 'aero' }), (x, y, z) => y > -0.12 && y < -0.04 && z > 0.15 && Math.abs(x) < 0.09);
    expect(semManto).toBe(0);
    expect(comManto).toBeGreaterThan(100);
  });

  it('é pano, não vidro líquido — que é vocabulário da Luma', () => {
    // Em `Finish.Glass` cada quadro da varredura devolvia o sol com
    // um ângulo diferente, e o abraço saía facetado como placa.
    const malha = montar();
    let panoNoPeito = 0;
    varrer(malha, Finish.Cloth, (x, y, z) => {
      if (y > 0.1 && y < 0.45 && z > 0.12 && Math.abs(x) < 0.16) panoNoPeito += 1;
    });
    expect(panoNoPeito).toBeGreaterThan(100);
  });

  it('o brilho vem de fio aceso, que é de outra ordem que o verniz', () => {
    // `Finish.Holo` é o único acabamento que emite: continua visível
    // de noite, e uma deusa não apaga quando o sol se põe.
    const malha = montar();
    let fios = 0;
    varrer(malha, Finish.Holo, () => {
      fios += 1;
    });
    expect(fios).toBeGreaterThan(1000);
  });

  it('as nervuras da saia existem e ficam abaixo da cintura', () => {
    const malha = montar();
    let baixo = 9;
    let alto = -9;
    let n = 0;
    varrer(malha, Finish.Holo, (_x, y) => {
      if (y >= -0.05) return;
      n += 1;
      baixo = Math.min(baixo, y);
      alto = Math.max(alto, y);
    });
    expect(n).toBeGreaterThan(200);
    expect(alto).toBeLessThan(-0.05);
    expect(baixo).toBeGreaterThan(-0.46);
  });

  it('a gola fica acima da banda do ventre, onde pedraria não estica', () => {
    const malha = montar();
    let baixo = 9;
    varrer(malha, Finish.Glass, (_x, y) => {
      baixo = Math.min(baixo, y);
    });
    expect(baixo).toBeGreaterThan(0.3);
  });

  it('não é `aero` repintado: custa mais e desenha outra coisa', () => {
    expect(triangulos(amara.appearance)).toBeGreaterThan(
      triangulos({ ...amara.appearance, outfit: 'aero' }),
    );
  });

  it('o `aero` continua montando para o Criador, que é o dono', () => {
    expect(aerion.appearance.outfit).toBe('aero');
    expect(triangulos(aerion.appearance)).toBeGreaterThan(0);
  });
});

describe('Amara 2.0 — o Nimbo Materno', () => {
  it('existe acima da cabeça e é a peça mais alta da malha', () => {
    const comNimbo = contar(montar(), (_x, y) => y > 0.94);
    const sem = contar(montar({ accessory: 'nenhum' }), (_x, y) => y > 0.94);
    expect(comNimbo).toBeGreaterThan(sem);
  });

  it('é um disco vertical, mais largo que a cabeça', () => {
    const comNimbo = contar(montar(), (x, y) => Math.abs(x) > 0.21 && y > 0.6);
    const sem = contar(montar({ accessory: 'nenhum' }), (x, y) => Math.abs(x) > 0.21 && y > 0.6);
    expect(comNimbo - sem).toBeGreaterThan(300);
  });

  it('acende: é `Finish.Holo`, não metal nem vidro', () => {
    const malha = montar();
    let altos = 0;
    varrer(malha, Finish.Holo, (_x, y) => {
      if (y > 0.9) altos += 1;
    });
    expect(altos).toBeGreaterThan(50);
  });

  it('não é o anel orbital inclinado da Nexara: fica no plano da frente', () => {
    // Vocabulário alheio. O da Nexara orbita inclinado; este é um
    // disco frontal, atrás da cabeça, e por isso o `z` dele é raso.
    const malha = montar();
    let fundo = 9;
    let frente = -9;
    varrer(malha, Finish.Holo, (_x, y, z) => {
      if (y < 0.9) return;
      fundo = Math.min(fundo, z);
      frente = Math.max(frente, z);
    });
    expect(frente - fundo).toBeLessThan(0.14);
  });
});

describe('Amara 2.0 — a gestação, que é o sistema dela', () => {
  it('o traje acompanha o ventre em vez de rachar nele', () => {
    // Prova com a implementação de referência do morph, a mesma conta
    // do GLSL: a roupa na banda do ventre cresce junto. Camada que
    // não declara `zone` fica parada e a barriga a atravessa.
    const malha = montar();
    const pos = malha.geometry.getAttribute('position');
    const zona = malha.geometry.getAttribute('aZone');
    let parado = -9;
    let cheio = -9;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y < 0.13 || y > 0.19 || z <= 0) continue;
      parado = Math.max(parado, z);
      cheio = Math.max(cheio, displaceGestation({ x: pos.getX(i), y, z }, zona.getX(i), 1).z);
    }
    expect(parado).toBeGreaterThan(0.17);
    expect(cheio / parado).toBeGreaterThan(1.7);
  });

  it('a gola e o nimbo ficam fora da banda, parados onde devem', () => {
    // Acima de `y = 0,36` o fator é 1,0: pedraria e aro não esticam.
    const alto = { x: 0.05, y: 0.45, z: 0.1 };
    for (const zona of [0, 1, 2, 3]) {
      const d = displaceGestation(alto, zona, 1);
      expect(Math.abs(d.z - alto.z)).toBeLessThan(0.02);
    }
  });

  it('o ventre não mexe na largura do corpo fora da banda', () => {
    const pe = { x: 0.08, y: -0.5, z: 0.05 };
    const d = displaceGestation(pe, 1, 1);
    expect(d.x).toBeCloseTo(pe.x, 6);
    expect(d.z).toBeCloseTo(pe.z, 6);
  });
});

describe('Amara 2.0 — o orçamento', () => {
  it('respeita o teto declarado no plano, nos quatro níveis', () => {
    const tetos: Record<BodyDetailLevel, number> = { baixa: 8900, media: 15800, alta: 26000, ultra: 79000 };
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      expect(triangulos(amara.appearance, nivel)).toBeLessThanOrEqual(tetos[nivel]);
    }
  });

  it('o custo cresce com o nível, e nunca encolhe', () => {
    const niveis = ['baixa', 'media', 'alta', 'ultra'] as const;
    for (let i = 1; i < niveis.length; i += 1) {
      expect(triangulos(amara.appearance, niveis[i])).toBeGreaterThan(triangulos(amara.appearance, niveis[i - 1]));
    }
  });

  it('continua mais barata que a Maze, que é o teto do elenco em ultra', () => {
    expect(triangulos(amara.appearance, 'ultra')).toBeLessThan(triangulos(maze.appearance, 'ultra'));
  });

  it('o nível baixo não estoura o avatar antigo inteiro', () => {
    // A regra do elenco: a malha baixa de uma deusa remasterizada não
    // pode pesar mais que o avatar de 6 496 triângulos que o Éden
    // tinha antes de qualquer marco, mais a folga declarada.
    expect(triangulos(amara.appearance, 'baixa')).toBeLessThan(8900);
  });
});

describe('Amara 2.0 — o resto do Éden não mudou', () => {
  it('os dezessete penteados continuam montando', () => {
    for (const estilo of HAIR_STYLES) {
      const avatar = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: estilo });
      avatar.setDetail('alta');
      expect(avatar.root.getObjectByName('corpo')).toBeTruthy();
    }
  });

  it('os quinze trajes continuam montando', () => {
    for (const traje of OUTFITS) {
      const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: traje });
      avatar.setDetail('alta');
      expect(avatar.root.getObjectByName('corpo')).toBeTruthy();
    }
  });

  it('os dez acessórios continuam montando', () => {
    for (const acessorio of ACCESSORIES) {
      const avatar = new Avatar({ ...DEFAULT_APPEARANCE, accessory: acessorio });
      avatar.setDetail('alta');
      expect(avatar.root.getObjectByName('corpo')).toBeTruthy();
    }
  });

  it('o Criador Aérion sai do marco com a malha intacta', () => {
    // Os números são os do baseline, medidos em `f38a2ec`, antes de
    // uma linha deste marco ser escrita.
    expect(triangulos(aerion.appearance, 'baixa')).toBe(8220);
    expect(triangulos(aerion.appearance, 'media')).toBe(12948);
    expect(triangulos(aerion.appearance, 'alta')).toBe(20330);
    expect(triangulos(aerion.appearance, 'ultra')).toBe(66224);
  });

  it('as outras nove deusas continuam montando nos quatro níveis', () => {
    for (const id of ['luma', 'suki', 'nexara', 'lilly', 'akemi', 'saturno', 'haru', 'maze', 'jupiter']) {
      const ficha = getCharacter(id)!;
      for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
        expect(triangulos(ficha.appearance, nivel)).toBeGreaterThan(0);
      }
    }
  });

  it('o catálogo de habitante não cresceu com as peças dela', () => {
    expect(CITIZEN_HAIR_STYLES).not.toContain('nascente');
    expect(CITIZEN_OUTFITS).not.toContain('regaco');
    expect(CITIZEN_ACCESSORIES).not.toContain('nimbo');
  });

  it('a fronteira cromática com a vizinhança verde continua de pé', () => {
    // Maze e Suki têm o verde vegetal; Haru, o ciano azulado; Lilly, a
    // turquesa de néon. A Amara entra entre eles pelo valor alto.
    const matiz = (hex: string): number => {
      const hsl = { h: 0, s: 0, l: 0 };
      new THREE.Color(hex).getHSL(hsl);
      return Math.round(hsl.h * 360);
    };
    expect(matiz('#aef0dd')).toBeGreaterThan(matiz(maze.colors[0]));
    expect(matiz('#aef0dd')).toBeLessThan(matiz(getCharacter('haru')!.colors[0]));
  });
});
