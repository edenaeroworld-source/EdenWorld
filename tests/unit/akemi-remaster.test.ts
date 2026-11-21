// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Akemi-Chan — e a prova de que o resto do Éden não mudou.
 *
 * A Akemi é a Deusa da Cultura Otaku e do Fandom, e o marco dela
 * trouxe um penteado exclusivo (`cachos`), um traje exclusivo
 * (`cosplay`), óculos redondos que nascem dentro do penteado e um
 * leque de cartões holográficos ao lado do corpo.
 *
 * Quase todo caso aqui nasceu de um defeito que a bancada mostrou
 * durante o marco, e é por isso que os números são tão específicos:
 *
 *  · o campo de cachos foi espalhado num **círculo** de raio `1,2·R`,
 *    mas a queda é uma elipse rasa (`rz` vale `0,34·R` na frente
 *    contra `1,16·R` atrás) — metade das bolhas caiu no ar e o cabelo
 *    renderizou liso feito capacete;
 *  · o laço e as pontas da gola ficaram em `z = 0,082` num peito cuja
 *    frente está em `z ≈ 0,111`: existiam, custavam triângulos e
 *    estavam **enterrados dentro do torso**;
 *  · a gola saiu **branca sobre um torso branco** e sumiu;
 *  · as lapelas do haori corriam por dentro do contorno do corpo e
 *    liam como suspensório, não como casaco;
 *  · o cano da meia era um degradê de sete centímetros e meio entre
 *    duas estações, e a perna inteira lia como coberta;
 *  · a saia tinha barra em `−0,36`, **abaixo** do cano da meia, de
 *    modo que não sobrava vão de pele nenhum;
 *  · os cartões em leque atrás dos ombros eram invisíveis de frente;
 *  · uma flor custava quase quatrocentos triângulos no LOD de longe e
 *    sozinha estourava o teto de orçamento.
 *
 * O perigo de fundo é o mesmo de sempre, e aqui ele vinha triplicado:
 * `cacheado` é penteado que os habitantes herdam, e `oculos`, `flor`
 * **e** `chapeu` são acessórios de habitante — `CITIZEN_ACCESSORIES`
 * exclui apenas `lentes`. Remasterizar qualquer um deles no lugar
 * onde mora mudaria gente sorteada pelo mundo inteiro. Há caso para
 * cada um.
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

const akemi = getCharacter('akemi')!;

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

/** Assinatura estável de uma malha, para comparar construções. */
function assinatura(mesh: THREE.SkinnedMesh): string {
  const parts: string[] = [];
  for (const nome of ['position', 'normal', 'aFinish', 'color']) {
    const at = mesh.geometry.getAttribute(nome);
    if (!at) continue;
    const arr = at.array as ArrayLike<number>;
    let soma = 0;
    for (let i = 0; i < arr.length; i += 1) soma = (soma * 31 + Math.round(arr[i] * 1e5)) | 0;
    parts.push(`${nome}:${arr.length}:${soma}`);
  }
  return parts.join('|');
}

/** Quantos vértices de um dado acabamento a malha tem. */
function contarFinish(mesh: THREE.SkinnedMesh, finish: number): number {
  const fin = mesh.geometry.getAttribute('aFinish');
  let n = 0;
  for (let i = 0; i < fin.count; i += 1) if (Math.round(fin.getX(i)) === finish) n += 1;
  return n;
}

describe('Akemi-Chan 2.0 — o que é exclusivo dela', () => {
  it('o penteado `cachos` existe no catálogo e os habitantes não o herdam', () => {
    expect(HAIR_STYLES).toContain('cachos');
    expect(CITIZEN_HAIR_STYLES).not.toContain('cachos');
    // E o `cacheado` compartilhado continua de pé, intocado.
    expect(CITIZEN_HAIR_STYLES).toContain('cacheado');
  });

  it('o traje `cosplay` existe no catálogo e os habitantes não o herdam', () => {
    expect(OUTFITS).toContain('cosplay');
    expect(CITIZEN_OUTFITS).not.toContain('cosplay');
  });

  it('nenhum habitante sorteado sai de cachos ou de cosplay', () => {
    // Dois mil sorteios: se um deles escapasse, o mundo mudaria.
    const rng = createRng(20260112);
    for (let i = 0; i < 2000; i += 1) {
      const a = randomAppearance(rng);
      expect(a.hairStyle).not.toBe('cachos');
      expect(a.outfit).not.toBe('cosplay');
    }
  });

  it('`cachos` e `cosplay` sobrevivem ao saneamento', () => {
    const limpo = sanitizeAppearance({ ...DEFAULT_APPEARANCE, hairStyle: 'cachos', outfit: 'cosplay' });
    expect(limpo.hairStyle).toBe('cachos');
    expect(limpo.outfit).toBe('cosplay');
  });
});

describe('Akemi-Chan 2.0 — a ficha', () => {
  it('usa o penteado e o traje exclusivos, e nenhum acessório', () => {
    expect(akemi.appearance.hairStyle).toBe('cachos');
    expect(akemi.appearance.outfit).toBe('cosplay');
    // Os óculos e as flores nascem **dentro** do penteado. Não é
    // capricho: `appearance.accessory` é um campo só, e ela usa os
    // dois. Pelo caminho do acessório ela teria de escolher um.
    expect(akemi.appearance.accessory).toBe('nenhum');
  });

  it('preserva a identidade canônica da ficha', () => {
    // O briefing manda elevar o acabamento, não trocar a personagem.
    // Cor de aura, paleta, olhos, pele e altura são quem ela é.
    expect(akemi.aura).toBe(0xff9ec6);
    expect(akemi.colors).toEqual(['#ffc1d6', '#e0417f']);
    expect(akemi.appearance.eyeColor).toBe('#7a5cc9');
    expect(akemi.appearance.skin).toBe('#ffe0c8');
    expect(akemi.appearance.height).toBe(0.96);
    expect(akemi.title).toBe('Deusa da Cultura Otaku e do Fandom');
  });

  it('o cabelo é castanho, como a arte de referência', () => {
    expect(akemi.appearance.hairColor.toLowerCase()).toBe('#7d5636');
  });
});

describe('Akemi-Chan 2.0 — orçamento e chamadas de desenho', () => {
  it('cabe no teto do LOD baixo', () => {
    const { mesh } = montar(akemi.appearance, 'baixa');
    // 7145,6 é o teto herdado dos marcos anteriores.
    expect(triangles(mesh)).toBeLessThan(7145.6);
  });

  it('continua em três malhas, como todas as outras deusas', () => {
    const a = new Avatar({ ...akemi.appearance });
    // corpo, rosto e halo. Tudo que o traje e o penteado acrescentam
    // é mesclado no corpo: nenhuma peça nova paga chamada de desenho.
    expect(meshes(a)).toBe(3);
  });

  it('o custo cresce com o nível, e nunca encolhe', () => {
    const niveis: Array<keyof typeof BODY_DETAIL> = ['baixa', 'media', 'alta', 'ultra'];
    const custos = niveis.map((n) => triangles(montar(akemi.appearance, n).mesh));
    for (let i = 1; i < custos.length; i += 1) expect(custos[i]).toBeGreaterThan(custos[i - 1]);
  });

  it('as flores e os óculos somem no LOD de longe, e o traje continua inteiro', () => {
    // Uma flor são cinco `ball`, e cinco `ball` custavam quase
    // quatrocentos triângulos — sozinhas estouravam o teto. A três
    // metros, uma pétala de dois centímetros não chega a um pixel.
    const baixa = triangles(montar(akemi.appearance, 'baixa').mesh);
    const media = triangles(montar(akemi.appearance, 'media').mesh);
    expect(media).toBeGreaterThan(baixa * 1.5);
  });
});

describe('Akemi-Chan 2.0 — o cabelo', () => {
  it('o cacho sai quase de graça perto do equivalente compartilhado', () => {
    // O relevo em si custa **zero**: `feature()` empurra vértices que
    // já existem. O que se mede aqui é o pacote inteiro contra o que
    // ela teria sem exclusividade nenhuma.
    //
    // À esquerda: `cachos`, com os óculos e as flores **dentro** do
    // penteado. À direita: o `cacheado` dos habitantes mais o
    // acessório `oculos` compartilhado — e sem flor alguma, porque
    // `accessory` é um campo só e já está ocupado.
    //
    // Medido: 22 286 contra 22 074. Duzentos e doze triângulos é o
    // preço de cachos exclusivos, óculos próprios **e** flores.
    const cachos = triangles(montar({ ...akemi.appearance, hairStyle: 'cachos', accessory: 'nenhum' }, 'alta').mesh);
    const compartilhado = triangles(montar({ ...akemi.appearance, hairStyle: 'cacheado', accessory: 'oculos' }, 'alta').mesh);
    expect(cachos - compartilhado).toBeLessThan(400);
  });

  it('o campo de cachos de fato desloca a superfície', () => {
    // O defeito que a primeira captura mostrou: as bolhas caíam no ar,
    // longe de qualquer vértice, e a malha saía idêntica à de um
    // cabelo liso. Se o relevo voltar a errar o alvo, as duas
    // assinaturas convergem e este caso cai.
    const comRelevo = assinatura(montar({ ...akemi.appearance, hairStyle: 'cachos' }, 'ultra').mesh);
    const semRelevo = assinatura(montar({ ...akemi.appearance, hairStyle: 'longo' }, 'ultra').mesh);
    expect(comRelevo).not.toBe(semRelevo);
  });

  it('a juba não invade o corredor por onde o braço passa', () => {
    // A queda alargada da Lilly atravessou os braços em quatro
    // centímetros, e foi o mesmo acidente que matou o véu da Nexara.
    // Aqui a massa é larga mas **curta**: para no ombro.
    const { mesh } = montar({ ...akemi.appearance, hairStyle: 'cachos' }, 'ultra');
    const liso = montar({ ...akemi.appearance, hairStyle: 'careca' }, 'ultra').mesh;
    const base = new Set<string>();
    const pl = liso.geometry.getAttribute('position');
    for (let i = 0; i < pl.count; i += 1) base.add(`${pl.getX(i).toFixed(4)},${pl.getY(i).toFixed(4)},${pl.getZ(i).toFixed(4)}`);

    const pos = mesh.geometry.getAttribute('position');
    let maisBaixo = Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (base.has(`${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`)) continue;
      if (Math.abs(x) >= 0.13 && Math.abs(x) <= 0.28 && y >= -0.1 && y <= 0.45) maisBaixo = Math.min(maisBaixo, y);
    }
    // O antebraço balança abaixo da linha do ombro. Nada de cabelo
    // pode descer até lá por fora do tronco.
    expect(maisBaixo).toBeGreaterThan(0.3);
  });

  it('o relevo dos cachos não deforma o crânio', () => {
    // A cabeça da Akemi saiu **amassada** na primeira versão, e a
    // causa é que `feature()` não sabe o que é cabelo: empurra todo
    // vértice ao alcance, e alcance é três vezes o raio da bolha.
    // Uma bolha nasceu a sete milímetros da orelha e puxou a lateral
    // do crânio 28 mm para fora; outras 1 106 saíram do lugar, com
    // média de 8,5 mm.
    //
    // O crânio é construído antes do cabelo, então os vértices de
    // pele ocupam os mesmos índices nas duas construções e dá para
    // comparar um a um. O gabarito é o `rabo`, que não chama
    // `feature()` nenhuma vez.
    const comRelevo = montar({ ...akemi.appearance, hairStyle: 'cachos' }, 'ultra').mesh;
    const gabarito = montar({ ...akemi.appearance, hairStyle: 'rabo' }, 'ultra').mesh;
    const pa = comRelevo.geometry.getAttribute('position');
    const pb = gabarito.geometry.getAttribute('position');
    const fa = comRelevo.geometry.getAttribute('aFinish');
    let pior = 0;
    const lim = Math.min(pa.count, pb.count);
    for (let i = 0; i < lim; i += 1) {
      if (Math.round(fa.getX(i)) !== Finish.Skin) continue;
      // Só a cabeça: abaixo disso é pescoço e tronco.
      if (pb.getY(i) < 0.55) continue;
      const d = Math.hypot(pa.getX(i) - pb.getX(i), pa.getY(i) - pb.getY(i), pa.getZ(i) - pb.getZ(i));
      if (d > pior) pior = d;
    }
    // Dois milímetros num crânio de trinta e cinco centímetros de
    // largura é meio por cento: invisível. Vinte e oito não eram.
    expect(pior).toBeLessThan(0.002);
  });

  it('o crânio é tão redondo quanto o das outras deusas', () => {
    // A medida que o olho faz: a variação de raio do crânio numa
    // altura. Se o cabelo empurrar um lado, este número abre.
    const variacao = (mesh: THREE.SkinnedMesh, y: number): number => {
      const pos = mesh.geometry.getAttribute('position');
      const fin = mesh.geometry.getAttribute('aFinish');
      let min = Infinity;
      let max = 0;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.round(fin.getX(i)) !== Finish.Skin) continue;
        if (Math.abs(pos.getY(i) - y) > 0.012) continue;
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        min = Math.min(min, r);
        max = Math.max(max, r);
      }
      return max - min;
    };
    const dela = montar({ ...akemi.appearance, hairStyle: 'cachos' }, 'ultra').mesh;
    const gabarito = montar({ ...akemi.appearance, hairStyle: 'rabo' }, 'ultra').mesh;
    for (const y of [0.7, 0.78, 0.84]) {
      // Idêntico ao gabarito, não apenas parecido.
      expect(variacao(dela, y)).toBeCloseTo(variacao(gabarito, y), 4);
    }
  });

  it('os óculos nascem com o penteado e em vidro', () => {
    const comCachos = contarFinish(montar({ ...akemi.appearance, hairStyle: 'cachos' }, 'alta').mesh, Finish.Glass);
    const semCachos = contarFinish(montar({ ...akemi.appearance, hairStyle: 'careca' }, 'alta').mesh, Finish.Glass);
    expect(comCachos).toBeGreaterThan(semCachos);
  });
});

describe('Akemi-Chan 2.0 — o traje', () => {
  it('a meia alta é um degrau de cor, e deixa um vão de pele sob a saia', () => {
    // O cano da meia não é geometria: é a cor do anel, e custa zero
    // triângulo. O que este caso guarda é o **vão** — a barra da saia
    // está em −0,26 e o cano da meia começa perto de −0,34. Se as
    // duas se encostarem, a perna some e a silhueta volta a ler como
    // vestido comprido, que foi exatamente o que a primeira captura
    // mostrou.
    //
    // A medição é por **cor**, não por `aFinish`, e por um motivo
    // que não é desta personagem: `subdivideProfile` descarta o
    // acabamento e trava a perna inteira num valor só. Coxa nua sai
    // como `Cloth` em todo mundo — no `vestido` e no `praia` do
    // catálogo padrão também, medido. É defeito preexistente da
    // engine, anotado no relatório, e mascarar isso aqui esconderia
    // um problema real do Éden.
    const { mesh } = montar(akemi.appearance, 'ultra');
    const pos = mesh.geometry.getAttribute('position');
    const col = mesh.geometry.getAttribute('color');
    const media = (de: number, ate: number): { r: number; b: number; n: number } => {
      let r = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        if (x < 0.03 || x > 0.12 || Math.abs(pos.getZ(i)) > 0.05) continue;
        if (y < de || y > ate) continue;
        r += col.getX(i);
        b += col.getZ(i);
        n += 1;
      }
      return { r: r / n, b: b / n, n };
    };
    const coxa = media(-0.32, -0.27);
    const meia = media(-0.45, -0.37);
    expect(coxa.n).toBeGreaterThan(0);
    expect(meia.n).toBeGreaterThan(0);
    // Pele é quente: o vermelho domina o azul.
    expect(coxa.r).toBeGreaterThan(coxa.b);
    // A meia é fria: lilás claríssimo, o azul domina.
    expect(meia.b).toBeGreaterThan(meia.r);
  });

  it('o laço fica à frente do peito, e não dentro dele', () => {
    // Medido na malha: a frente do torso está em z ≈ 0,111 na altura
    // do laço. A primeira versão pôs o laço em 0,082.
    const { mesh } = montar(akemi.appearance, 'ultra');
    const pos = mesh.geometry.getAttribute('position');
    let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y < 0.28 || y > 0.34) continue;
      if (Math.abs(pos.getX(i)) > 0.09) continue;
      maxZ = Math.max(maxZ, pos.getZ(i));
    }
    expect(maxZ).toBeGreaterThan(0.12);
  });

  it('o haori ultrapassa o contorno do tronco', () => {
    // Casaco que corre por dentro da silhueta lê como suspensório. É
    // a borda contra o fundo que conta a peça.
    const comHaori = montar({ ...akemi.appearance, outfit: 'cosplay' }, 'ultra').mesh;
    const semHaori = montar({ ...akemi.appearance, outfit: 'casual' }, 'ultra').mesh;
    const larguraEm = (mesh: THREE.SkinnedMesh): number => {
      const pos = mesh.geometry.getAttribute('position');
      let max = 0;
      for (let i = 0; i < pos.count; i += 1) {
        const y = pos.getY(i);
        if (y < 0.0 || y > 0.2) continue;
        if (Math.abs(pos.getZ(i)) > 0.12) continue;
        max = Math.max(max, Math.abs(pos.getX(i)));
      }
      return max;
    };
    expect(larguraEm(comHaori)).toBeGreaterThan(larguraEm(semHaori));
  });

  it('os cartões holográficos existem, são Holo e ficam fora do corredor do braço', () => {
    const { mesh } = montar(akemi.appearance, 'ultra');
    const pos = mesh.geometry.getAttribute('position');
    const fin = mesh.geometry.getAttribute('aFinish');
    let n = 0;
    let minX = Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      if (Math.round(fin.getX(i)) !== Finish.Holo) continue;
      n += 1;
      if (pos.getX(i) > 0.2) minX = Math.min(minX, pos.getX(i));
    }
    expect(n).toBeGreaterThan(0);
    // A varredura do braço vai até |x| = 0,28.
    expect(minX).toBeGreaterThan(0.28);
  });

  it('o traje mantém vidro e holografia em todos os níveis', () => {
    // Acabamento que some num LOD é acabamento que pisca quando a
    // câmera se afasta.
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      const { mesh } = montar(akemi.appearance, nivel);
      expect(contarFinish(mesh, Finish.Glass)).toBeGreaterThan(0);
    }
    // Os cartões são detalhe de perto, e aparecem a partir de `media`.
    for (const nivel of ['media', 'alta', 'ultra'] as const) {
      const { mesh } = montar(akemi.appearance, nivel);
      expect(contarFinish(mesh, Finish.Holo)).toBeGreaterThan(0);
    }
  });
});

describe('Akemi-Chan 2.0 — o resto do Éden não mudou', () => {
  it('os acessórios de habitante continuam exatamente como estavam', () => {
    // `CITIZEN_ACCESSORIES` exclui **apenas** `lentes`. Óculos, flor
    // e chapéu são de habitante, e nada aqui os tocou.
    expect(CITIZEN_ACCESSORIES).toContain('oculos');
    expect(CITIZEN_ACCESSORIES).toContain('flor');
    expect(CITIZEN_ACCESSORIES).toContain('chapeu');
    expect(CITIZEN_ACCESSORIES).not.toContain('lentes');
  });

  it('o avatar padrão não mudou de custo em nenhum nível', () => {
    // Números medidos na base `35885a1`, antes deste marco.
    const esperado: Record<string, number> = { baixa: 6118, media: 10694, alta: 17818, ultra: 62224 };
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      const { mesh } = montar({}, nivel);
      expect(triangles(mesh)).toBe(esperado[nivel]);
    }
  });

  it('as outras deusas não mudaram de custo', () => {
    // Se o traje ou o penteado novos tivessem vazado para uma peça
    // compartilhada, estes números se moveriam.
    const esperado: Record<string, number> = { luma: 20706, suki: 20758, nexara: 19422, lilly: 21074 };
    for (const [id, tris] of Object.entries(esperado)) {
      const c = getCharacter(id)!;
      expect(triangles(montar(c.appearance, 'alta').mesh)).toBe(tris);
    }
  });
});
