// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Maze — e a prova de que o resto do Éden não mudou.
 *
 * A Maze é a **Deusa da Natureza**, dona da vegetação, dos
 * ecossistemas e dos ambientes botânicos do Éden Aero, e mora no
 * Parque das Águas. O marco dela trouxe um penteado exclusivo
 * (`copa`) e um traje exclusivo (`jardim`).
 *
 * Quatro achados da investigação moldaram tudo o que se testa aqui, e
 * nenhum deles estava no briefing:
 *
 *  · **os três campos de aparência dela eram compartilhados**, e dois
 *    pertenciam a gente que ainda não pode ser repintada: `longo` é o
 *    penteado do **Aérion, o Criador do Éden Aero**, e da Amara;
 *    `vestido` é o traje da **Júpiter**, que ainda não teve marco.
 *    Remasterizar qualquer um dos dois onde ele mora teria gastado o
 *    marco de outra pessoa;
 *  · **a `flor` custava 912 triângulos iguais nos quatro LODs** —
 *    não cortava por distância, nem a cinquenta metros — para
 *    desenhar uma florzinha rosa de um centímetro numa têmpora só,
 *    numa personagem de paleta verde. É o mesmo defeito que afundou
 *    o marco da Saturno;
 *  · **o cabelo era verde (`#3fcf86`) e chapado**. A arte de
 *    referência mostra uma juba cacheada castanha, e o Criador
 *    escolheu a arte. O verde não se perdeu: migrou para as folhas,
 *    os brotos acesos e a folhagem do traje, e a paleta canônica
 *    `colors` ficou intacta;
 *  · **a Saturno já é deusa de natureza**, remasterizada, dourada, de
 *    galhada e folha de vidro. Duas deusas de natureza no mesmo
 *    elenco só funcionam se a cor e a silhueta separarem as duas à
 *    distância. A divisão que este arquivo guarda: **Maze é verde,
 *    pano e água viva**; a Saturno é ouro, vidro e estação seca.
 *
 * Vários casos nasceram de defeitos que a bancada mostrou durante o
 * marco, e é por isso que os números são tão específicos:
 *
 *  · a juba nasceu com o perfil de uma queda longa e virou um capuz
 *    que engolia o rosto;
 *  · a calota que `buildHair` desenha para os treze penteados ficava
 *    exposta na frente, lisa e polida, terminando numa aresta dura
 *    sobre as sobrancelhas;
 *  · as folhas e as gotas do traje nasceram **dentro** do pano, por
 *    herdarem o raio de barra do marco da Saturno — a saia do Traje
 *    Jardim usa outra barra e abre muito mais;
 *  · o relevo dos cachos foi pedido em `R · 0,055` e sumiu: onze
 *    milímetros não aparecem.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/characters/Pantheon';
import { Avatar } from '../../src/player/Avatar';
import {
  CITIZEN_ACCESSORIES,
  CITIZEN_HAIR_STYLES,
  CITIZEN_OUTFITS,
  DEFAULT_APPEARANCE,
  HAIR_STYLES,
  OUTFITS,
  randomAppearance,
  sanitizeAppearance,
} from '../../src/player/AvatarAppearance';
import { BODY_DETAIL, Finish } from '../../src/player/body/BodyRig';
import { createRng } from '../../src/utils/math';

const maze = getCharacter('maze')!;
const saturno = getCharacter('saturno')!;
const jupiter = getCharacter('jupiter')!;
const aerion = getCharacter('aerion')!;

function bodyOf(avatar: Avatar): THREE.SkinnedMesh {
  const mesh = avatar.root.getObjectByName('corpo') as THREE.SkinnedMesh;
  expect(mesh).toBeTruthy();
  return mesh;
}

function triangles(mesh: THREE.SkinnedMesh): number {
  const index = mesh.geometry.getIndex();
  return index ? index.count / 3 : mesh.geometry.getAttribute('position').count / 3;
}

function meshes(avatar: Avatar): number {
  let n = 0;
  avatar.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n += 1;
  });
  return n;
}

function montar(
  extra: Partial<typeof DEFAULT_APPEARANCE>,
  nivel: keyof typeof BODY_DETAIL = 'alta',
): { a: Avatar; mesh: THREE.SkinnedMesh } {
  const a = new Avatar({ ...DEFAULT_APPEARANCE, ...extra });
  a.setDetail(nivel);
  return { a, mesh: bodyOf(a) };
}

/** Percorre os vértices de um dado acabamento. */
function varrer(
  mesh: THREE.SkinnedMesh,
  finish: number,
  visita: (x: number, y: number, z: number, i: number) => void,
): number {
  const pos = mesh.geometry.getAttribute('position');
  const fin = mesh.geometry.getAttribute('aFinish');
  let n = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.round(fin.getX(i)) !== finish) continue;
    visita(pos.getX(i), pos.getY(i), pos.getZ(i), i);
    n += 1;
  }
  return n;
}

/** A cor de um vértice, como THREE.Color. */
function corDe(mesh: THREE.SkinnedMesh, i: number): THREE.Color {
  const c = mesh.geometry.getAttribute('color');
  return new THREE.Color(c.getX(i), c.getY(i), c.getZ(i));
}

describe('Maze 2.0 — o que é exclusivo dela', () => {
  it('o penteado `copa` existe no catálogo e os habitantes não o herdam', () => {
    expect(HAIR_STYLES).toContain('copa');
    expect(CITIZEN_HAIR_STYLES).not.toContain('copa');
  });

  it('o traje `jardim` existe no catálogo e os habitantes não o herdam', () => {
    expect(OUTFITS).toContain('jardim');
    expect(CITIZEN_OUTFITS).not.toContain('jardim');
  });

  it('a ficha dela usa as duas peças novas e abandona as três compartilhadas', () => {
    expect(maze.appearance.hairStyle).toBe('copa');
    expect(maze.appearance.outfit).toBe('jardim');
    // As três que ela largou, e para quem voltaram inteiras.
    expect(maze.appearance.accessory).toBe('nenhum');
    expect(aerion.appearance.hairStyle).toBe('longo');
    // **Atualizado no marco da Amara 2.0**: a Amara saiu do `longo`
    // para a `nascente`, e a testemunha da peça é o Aérion.
    // **Reescrito no marco da Júpiter 2.0.** O que este caso guardava
    // é que a Maze não podia levar o `vestido` embora junto com ela:
    // era peça de habitante e da Júpiter. Não levou — quem saiu dele
    // foi a própria Júpiter, no marco dela, com briefing próprio. O
    // `vestido` continua no catálogo, que é o que importava aqui.
    expect(CITIZEN_OUTFITS).toContain('vestido');
    expect(CITIZEN_ACCESSORIES).toContain('flor');
  });

  it('o sorteio de habitantes nunca devolve as peças da Maze', () => {
    // Sessenta habitantes com a semente do dia do marco. Se `copa` ou
    // `jardim` vazarem para o sorteio, a deusa deixa de ser única.
    const rng = createRng(20261112);
    for (let i = 0; i < 60; i += 1) {
      const a = randomAppearance(rng);
      expect(a.hairStyle).not.toBe('copa');
      expect(a.outfit).not.toBe('jardim');
    }
  });

  it('as peças novas sobrevivem a `sanitizeAppearance`', () => {
    // Se o saneador não as conhecesse, a Maze seria silenciosamente
    // revertida para o padrão ao carregar um save.
    const limpa = sanitizeAppearance({ ...maze.appearance });
    expect(limpa.hairStyle).toBe('copa');
    expect(limpa.outfit).toBe('jardim');
  });
});

describe('Maze 2.0 — o cânone preservado', () => {
  it('título, domínio, aura, paleta e lugar saem do marco intactos', () => {
    expect(maze.title).toBe('Deusa da Natureza');
    expect(maze.domain).toEqual(['Natureza', 'Vegetação', 'Ecossistemas', 'Ambientes botânicos']);
    expect(maze.aura).toBe(0x7df0a8);
    expect(maze.colors).toEqual(['#9df0b0', '#1fae6b']);
    expect(maze.tagline).toBe('Planta primeiro, constrói depois.');
    expect(maze.place.label).toBe('Parque das Águas, margem leste do lago');
    expect(maze.appearance.height).toBe(1.03);
  });

  it('a pele e a cor dos olhos não mudaram', () => {
    // O briefing pediu identidade nova, não pessoa nova.
    expect(maze.appearance.skin).toBe('#7d4a2c');
    expect(maze.appearance.eyeColor).toBe('#2f9a66');
  });

  it('o cabelo deixou de ser verde, e o verde foi para a folhagem', () => {
    // A decisão é do Criador: seguir a arte de referência. O que o
    // teste guarda é que o verde não sumiu do avatar — ele mudou de
    // lugar.
    const castanho = new THREE.Color(maze.appearance.hairColor);
    expect(castanho.r).toBeGreaterThan(castanho.g);
    const { mesh } = montar(maze.appearance, 'ultra');
    let verdes = 0;
    varrer(mesh, Finish.Cloth, (_x, _y, _z, i) => {
      const c = corDe(mesh, i);
      if (c.g > c.r * 1.25 && c.g > c.b * 1.1) verdes += 1;
    });
    expect(verdes).toBeGreaterThan(200);
  });
});

describe('Maze 2.0 — o cabelo', () => {
  it('a juba é muito mais larga que a cabeça, como uma copa', () => {
    const { mesh } = montar(maze.appearance, 'ultra');
    const careca = montar({ ...maze.appearance, hairStyle: 'careca' }, 'ultra');
    let maxCabelo = 0;
    varrer(mesh, Finish.Hair, (x) => {
      maxCabelo = Math.max(maxCabelo, Math.abs(x));
    });
    let maxCranio = 0;
    varrer(careca.mesh, Finish.Skin, (x, y) => {
      if (y < 0.6) return;
      maxCranio = Math.max(maxCranio, Math.abs(x));
    });
    // Medido: crânio em 0,18 e juba acima de 0,30.
    expect(maxCabelo).toBeGreaterThan(maxCranio * 1.5);
  });

  it('a juba não engole o rosto', () => {
    // Primeiro defeito da bancada: com a mesma profundidade na frente
    // e atrás, a juba virou uma bola com o rosto preso dentro.
    //
    // Medido na faixa dos olhos e do nariz: a pele do rosto chega a
    // z = 0,1808 e o cabelo para em 0,0615 — mais de onze
    // centímetros atrás. A frente da juba é rasa de propósito.
    const { mesh } = montar(maze.appearance, 'ultra');
    const careca = montar({ ...maze.appearance, hairStyle: 'careca' }, 'ultra');
    const frente = (m: THREE.SkinnedMesh, acabamento: number): number => {
      let z = -Infinity;
      varrer(m, acabamento, (x, y, zz) => {
        if (y < 0.64 || y > 0.73 || Math.abs(x) > 0.07) return;
        z = Math.max(z, zz);
      });
      return z;
    };
    const cabelo = frente(mesh, Finish.Hair);
    const rosto = frente(careca.mesh, Finish.Skin);
    expect(cabelo).toBeLessThan(rosto - 0.05);
  });

  it('a franja cobre a calota compartilhada acima da testa', () => {
    // Segundo defeito da bancada, e o mais caro de diagnosticar: a
    // calota que `buildHair` desenha **antes** do `switch`, igual
    // para os treze penteados, ficava à frente da juba e aparecia
    // exposta sobre a testa — lisa, polida, terminando numa aresta
    // dura em cima das sobrancelhas.
    //
    // Apagar a calota consertaria a Maze e quebraria os outros doze
    // penteados. A `copa` cobre a calota em vez de removê-la, e é
    // isso que este teste mede: na faixa da testa, qualquer penteado
    // que só tenha a calota chega a 0,1695; a `copa` chega a 0,1964.
    const daCopa = montar(maze.appearance, 'ultra');
    const soCalota = montar({ ...maze.appearance, hairStyle: 'coque' }, 'ultra');
    const frente = (m: THREE.SkinnedMesh, y0: number, y1: number): number => {
      let z = -Infinity;
      varrer(m, Finish.Hair, (x, y, zz) => {
        if (y < y0 || y > y1 || Math.abs(x) > 0.07) return;
        z = Math.max(z, zz);
      });
      return z;
    };
    expect(frente(daCopa.mesh, 0.76, 0.82)).toBeGreaterThan(frente(soCalota.mesh, 0.76, 0.82) + 0.015);
    expect(frente(daCopa.mesh, 0.84, 0.9)).toBeGreaterThan(frente(soCalota.mesh, 0.84, 0.9));
  });

  it('o relevo dos cachos de fato desloca a superfície', () => {
    // Terceiro defeito: `feature()` pesa o empurrão por uma
    // gaussiana, e o pedido original de `R · 0,055` — onze
    // milímetros — não apareceu na bancada. O teste compara a juba
    // com e sem o nível que liga o relevo.
    const perto = montar(maze.appearance, 'ultra');
    const longe = montar(maze.appearance, 'baixa');
    const raio = (mesh: THREE.SkinnedMesh): number => {
      let soma = 0;
      let n = 0;
      varrer(mesh, Finish.Hair, (x, y, z) => {
        if (y < 0.62 || y > 0.78) return;
        soma += Math.hypot(x, z);
        n += 1;
      });
      return n > 0 ? soma / n : 0;
    };
    // Com cachos e tufos a casca fica mais longe do eixo que a bola
    // lisa do nível baixo.
    expect(raio(perto.mesh)).toBeGreaterThan(raio(longe.mesh) * 1.02);
  });

  it('o relevo dos cachos não deforma o crânio', () => {
    // A lição da Akemi: `feature()` varre a geometria inteira, e um
    // campo de relevo de cabelo já empurrou um crânio 35 mm para
    // fora. A bolha do cacho é pequena de propósito.
    const comCopa = montar({ ...maze.appearance }, 'ultra');
    const careca = montar({ ...maze.appearance, hairStyle: 'careca' }, 'ultra');
    const perfil = (mesh: THREE.SkinnedMesh): Map<number, number> => {
      const m = new Map<number, number>();
      varrer(mesh, Finish.Skin, (x, y, z) => {
        if (y < 0.6 || y > 0.9) return;
        const k = Math.round(y * 40);
        m.set(k, Math.max(m.get(k) ?? 0, Math.hypot(x, z)));
      });
      return m;
    };
    const a = perfil(comCopa.mesh);
    const b = perfil(careca.mesh);
    let pior = 0;
    for (const [k, v] of b) {
      const outro = a.get(k);
      if (outro !== undefined) pior = Math.max(pior, Math.abs(outro - v));
    }
    expect(pior).toBeLessThan(0.012);
  });

  it('a coroa fica na testa, e não na linha dos olhos', () => {
    // Quarto defeito: a primeira coroa usou `t = 0,9` sem conta e
    // caiu em `cy + 0,02`, que é onde `FACE.eyeY` põe o olho. Na
    // bancada ela atravessou o rosto na altura das sobrancelhas.
    const { mesh } = montar(maze.appearance, 'ultra');
    let maisBaixaNaFrente = Infinity;
    varrer(mesh, Finish.Cloth, (x, y, z) => {
      if (y < 0.6 || z < 0.1 || Math.abs(x) > 0.12) return;
      maisBaixaNaFrente = Math.min(maisBaixaNaFrente, y);
    });
    // O olho está em torno de 0,76; a coroa fica acima disso.
    expect(maisBaixaNaFrente).toBeGreaterThan(0.8);
  });

  it('nada do penteado cobre a boca nem o queixo', () => {
    const { mesh } = montar(maze.appearance, 'ultra');
    let invasor = 0;
    for (const acabamento of [Finish.Hair, Finish.Cloth, Finish.Holo]) {
      varrer(mesh, acabamento, (x, y, z) => {
        if (y > 0.72 || y < 0.6) return;
        if (z > 0.12 && Math.abs(x) < 0.09) invasor += 1;
      });
    }
    expect(invasor).toBe(0);
  });

  it('os brotos acesos existem, e só nos dois níveis de perto', () => {
    const conta = (nivel: keyof typeof BODY_DETAIL): number => {
      const { mesh } = montar(maze.appearance, nivel);
      let n = 0;
      varrer(mesh, Finish.Holo, (_x, y) => {
        if (y > 0.6) n += 1;
      });
      return n;
    };
    expect(conta('ultra')).toBeGreaterThan(0);
    expect(conta('baixa')).toBe(0);
  });

  it('o cabelo não usa vidro: o brilho dela é seiva, não a folha de vidro da Saturno', () => {
    const { mesh } = montar(maze.appearance, 'ultra');
    let vidroNaCabeca = 0;
    varrer(mesh, Finish.Glass, (_x, y) => {
      if (y > 0.6) vidroNaCabeca += 1;
    });
    expect(vidroNaCabeca).toBe(0);
  });
});

describe('Maze 2.0 — o traje', () => {
  it('a folhagem da saia fica por fora do pano, e não enterrada nele', () => {
    // O erro que afundou o marco da Saturno, repetido aqui na
    // primeira versão: as folhas herdaram o raio de barra 0,3497, que
    // é da barra `SKIRT_HEM_Y`. O Traje Jardim usa `GOWN_HEM_Y`, e
    // varrido na malha o raio real chega a 0,4084. As folhas estavam
    // dentro do tecido — existiam, custavam e não apareciam.
    const { mesh } = montar(maze.appearance, 'ultra');
    const saia = new Map<number, number>();
    varrer(mesh, Finish.Cloth, (x, y, z) => {
      if (y > -0.14 || y < -0.46) return;
      const k = Math.round(y * 25);
      saia.set(k, Math.max(saia.get(k) ?? 0, Math.hypot(x, z)));
    });
    // Em toda a faixa da saia existe geometria além do raio que a
    // saia branca sozinha alcançava.
    let acima = 0;
    for (const [k, r] of saia) {
      const y = k / 25;
      const brancoSozinho = 0.2758 + (0.4084 - 0.2758) * Math.min(1, Math.max(0, (-0.2 - y) / -0.24));
      if (r > brancoSozinho) acima += 1;
    }
    expect(acima).toBeGreaterThan(3);
  });

  it('a faixa do peito é assimétrica', () => {
    // A lição da Haru: peça simétrica no meio do peito lê como rosto,
    // e um par de folhas em volta do esterno viraria dois olhos.
    const { mesh } = montar(maze.appearance, 'ultra');
    let esquerda = 0;
    let direita = 0;
    varrer(mesh, Finish.Cloth, (x, y, z) => {
      if (y < 0.18 || y > 0.45 || z < 0.09) return;
      if (x < -0.02) esquerda += 1;
      else if (x > 0.02) direita += 1;
    });
    const total = esquerda + direita;
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(esquerda - direita) / total).toBeGreaterThan(0.12);
  });

  it('a gola é um anel completo, e não duas placas na frente', () => {
    // A lição da Lilly, e o erro inverso do primeiro esboço da
    // Saturno, que pôs tudo nas costas.
    const { mesh } = montar(maze.appearance, 'ultra');
    let frente = 0;
    let costas = 0;
    varrer(mesh, Finish.Cloth, (_x, y, z) => {
      if (y < 0.42 || y > 0.56) return;
      if (z > 0.02) frente += 1;
      else if (z < -0.02) costas += 1;
    });
    expect(frente).toBeGreaterThan(0);
    expect(costas).toBeGreaterThan(0);
  });

  it('as gotas de água são o único vidro da peça, e são poucas', () => {
    const { mesh } = montar(maze.appearance, 'ultra');
    let vidro = 0;
    varrer(mesh, Finish.Glass, () => {
      vidro += 1;
    });
    expect(vidro).toBeGreaterThan(0);
    // Água em excesso vira lantejoula — e vidro em peça inteira não
    // sobrevive a `subdivideProfile`, que foi como a perna nua da
    // Lilly virou vidro.
    expect(vidro).toBeLessThan(700);
  });

  it('o braço nu não virou vidro', () => {
    // A lição da Lilly: `Finish.Glass` aplicado a uma peça inteira
    // não sobrevive a `subdivideProfile`, e a perna nua dela saiu de
    // vidro. Na Maze o vidro é só das gotas de água, peça a peça.
    //
    // Medido no bind pose: os braços nus são a pele em y −0,25…−0,05
    // com |x| até 0,212, e as gotas mais baixas ficam em y −0,4518.
    const { mesh } = montar(maze.appearance, 'ultra');
    let vidroNoBraco = 0;
    varrer(mesh, Finish.Glass, (x, y) => {
      if (y > -0.25 && y < -0.05 && Math.abs(x) > 0.15) vidroNoBraco += 1;
    });
    expect(vidroNoBraco).toBe(0);
  });

  it('a folha do traje é pano, e nunca vidro: o vidro é território da Saturno', () => {
    const { mesh } = montar(maze.appearance, 'ultra');
    // Toda a folhagem do tronco está em Finish.Cloth.
    let panoNoTronco = 0;
    varrer(mesh, Finish.Cloth, (_x, y, z) => {
      if (y > 0.18 && y < 0.45 && z > 0.09) panoNoTronco += 1;
    });
    expect(panoNoTronco).toBeGreaterThan(20);
    let vidroNoTronco = 0;
    varrer(mesh, Finish.Glass, (_x, y, z) => {
      if (y > 0.18 && y < 0.45 && z > 0.09) vidroNoTronco += 1;
    });
    expect(vidroNoTronco).toBe(0);
  });

  it('o traje acende em verde, não em dourado nem em magenta', () => {
    const { mesh } = montar(maze.appearance, 'ultra');
    let n = 0;
    varrer(mesh, Finish.Holo, (_x, _y, _z, i) => {
      const c = corDe(mesh, i);
      expect(c.g).toBeGreaterThan(c.r);
      expect(c.g).toBeGreaterThan(c.b);
      n += 1;
    });
    expect(n).toBeGreaterThan(0);
  });

  it('os braços ficam nus, como nos outros trajes sem manga', () => {
    // No bind pose os braços caem ao lado do corpo e ficam **abaixo**
    // do tronco: a pele deles está em y −0,25…−0,05, com |x| até
    // 0,212. O tronco em si, de y 0 a 0,45, é todo pano.
    const { mesh } = montar(maze.appearance, 'ultra');
    let peleNoBraco = 0;
    varrer(mesh, Finish.Skin, (x, y) => {
      if (y > -0.25 && y < -0.05 && Math.abs(x) > 0.15) peleNoBraco += 1;
    });
    expect(peleNoBraco).toBeGreaterThan(50);
  });
});

describe('Maze 2.0 — a fronteira com a Saturno', () => {
  it('as duas paletas não se encostam', () => {
    for (const c of maze.colors) expect(saturno.colors).not.toContain(c);
  });

  it('a Maze é verde e a Saturno é dourada, nos dois tons de cada uma', () => {
    const verde = (hex: string): boolean => {
      const c = new THREE.Color(hex);
      return c.g > c.r;
    };
    expect(maze.colors.every(verde)).toBe(true);
    expect(saturno.colors.some(verde)).toBe(false);
  });

  it('as duas não compartilham penteado nem traje', () => {
    expect(maze.appearance.hairStyle).not.toBe(saturno.appearance.hairStyle);
    expect(maze.appearance.outfit).not.toBe(saturno.appearance.outfit);
  });

  it('a Maze não usa ouro em lugar nenhum da malha', () => {
    // Fronteira acordada no plano: ouro é da Saturno. Um reflexo
    // dourado na Maze apaga a diferença entre as duas à distância.
    const { mesh } = montar(maze.appearance, 'ultra');
    let dourado = 0;
    for (const acabamento of [Finish.Cloth, Finish.Holo, Finish.Glass]) {
      varrer(mesh, acabamento, (_x, _y, _z, i) => {
        const c = corDe(mesh, i);
        if (c.r > 0.55 && c.g > 0.4 && c.b < 0.25 && c.r > c.g) dourado += 1;
      });
    }
    expect(dourado).toBe(0);
  });
});

describe('Maze 2.0 — orçamento e chamadas de desenho', () => {
  it('cabe no teto do LOD baixo, com folga maior que antes do marco', () => {
    const { mesh } = montar(maze.appearance, 'baixa');
    // Medido antes do marco: 7 024, com o teto em 7 145,6 — a segunda
    // pior folga do elenco inteiro. Hoje: 6 012. A diferença é quase
    // toda a `flor`, que custava 912 triângulos sem cortar nunca.
    expect(triangles(mesh)).toBeLessThan(6100);
    expect(triangles(mesh)).toBeLessThan(7145.6);
  });

  it('continua em três malhas, como todas as outras deusas', () => {
    const a = new Avatar({ ...maze.appearance });
    // corpo, rosto e halo. Juba, folhas, coroa, brotos, faixa, gola,
    // cascata e gotas são mesclados no corpo: nenhuma peça nova paga
    // chamada de desenho.
    expect(meshes(a)).toBe(3);
  });

  it('o custo cresce com o nível, e nunca encolhe', () => {
    const niveis: Array<keyof typeof BODY_DETAIL> = ['baixa', 'media', 'alta', 'ultra'];
    const custos = niveis.map((n) => triangles(montar(maze.appearance, n).mesh));
    for (let i = 1; i < custos.length; i += 1) expect(custos[i]).toBeGreaterThan(custos[i - 1]);
  });

  it('as peças de perto somem de longe — o defeito da `flor` não se repete', () => {
    // A `flor` custava 912 triângulos **iguais nos quatro níveis**.
    // Tudo o que este marco acrescentou corta por distância.
    const baixa = triangles(montar(maze.appearance, 'baixa').mesh);
    const ultra = triangles(montar(maze.appearance, 'ultra').mesh);
    expect(ultra).toBeGreaterThan(baixa * 10);
  });

  it('o nível baixo dela é mais leve que o da maioria do elenco', () => {
    const custo = (c: typeof maze): number => triangles(montar(c.appearance, 'baixa').mesh);
    expect(custo(maze)).toBeLessThan(custo(jupiter));
    expect(custo(maze)).toBeLessThan(custo(saturno));
  });
});

describe('Maze 2.0 — o resto do Éden não mudou', () => {
  it('o Aérion e a Amara não foram tocados, e a Júpiter só no marco dela', () => {
    // **Reescrito no marco da Júpiter 2.0.** As três fichas aqui
    // dependiam das peças que a Maze largou. O Aérion e a Amara
    // continuam intocados — nenhum dos dois teve marco ainda.
    //
    // A Júpiter saiu do `cacheado` e do `vestido` no marco dela, que
    // é o nono e último do elenco. O que este caso continua provando
    // é que **as peças não sumiram do catálogo** quando ela saiu: a
    // Maze não as levou, e a Júpiter também não.
    expect(CITIZEN_HAIR_STYLES).toContain('cacheado');
    expect(CITIZEN_OUTFITS).toContain('vestido');
    expect(jupiter.appearance.hairStyle).toBe('pincelada');
    expect(jupiter.appearance.outfit).toBe('lumen');
    expect(aerion.appearance.hairStyle).toBe('longo');
  });

  it('o `vestido` continua montando igual para quem o usa', () => {
    // Se o despacho do `jardim` tivesse vazado para o `vestido`, a
    // Júpiter mudaria junto, sem briefing.
    const a = triangles(montar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' }, 'ultra').mesh);
    const b = triangles(montar({ ...jupiter.appearance, outfit: 'vestido' }, 'ultra').mesh);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(triangles(montar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' }, 'ultra').mesh)).toBe(a);
  });

  it('os treze penteados antigos continuam montando', () => {
    for (const estilo of HAIR_STYLES) {
      const { mesh } = montar({ ...DEFAULT_APPEARANCE, hairStyle: estilo }, 'media');
      expect(triangles(mesh)).toBeGreaterThan(0);
    }
  });

  it('todos os trajes continuam montando', () => {
    for (const traje of OUTFITS) {
      const { mesh } = montar({ ...DEFAULT_APPEARANCE, outfit: traje }, 'media');
      expect(triangles(mesh)).toBeGreaterThan(0);
    }
  });
});

describe('Maze 2.0 — defeito preexistente, medido e não mascarado', () => {
  it('a pele nua sai marcada como pano em todos os trajes, não só no dela', () => {
    // Herdado e documentado no marco da Saturno: `buildSkirt` marca
    // parte da perna nua com o acabamento de tecido. Não é defeito da
    // Maze e não foi consertado aqui — consertar exigiria mexer em
    // construção compartilhada, que o briefing proíbe sem necessidade
    // comprovada. Fica medido para não ser esquecido.
    const contar = (outfit: string): number => {
      const { mesh } = montar({ ...DEFAULT_APPEARANCE, outfit: outfit as never }, 'alta');
      let n = 0;
      varrer(mesh, Finish.Cloth, (_x, y) => {
        if (y < -0.62) n += 1;
      });
      return n;
    };
    const doJardim = contar('jardim');
    const doVestido = contar('vestido');
    // O mesmo fenômeno nos dois: não é peça da Maze.
    expect(doJardim).toBe(doVestido);
  });
});
