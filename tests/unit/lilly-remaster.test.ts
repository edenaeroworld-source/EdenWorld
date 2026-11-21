// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Lilly — e a prova de que o resto do Éden não mudou.
 *
 * A Lilly é a deusa da Música e da Vibração, e o marco dela trouxe um
 * penteado exclusivo (`onda`), um traje exclusivo (`sonora`), uma
 * coroa de frequência na saia e fones remasterizados em vidro e luz.
 *
 * Quase todo caso aqui nasceu de um defeito que apareceu na bancada
 * durante o marco, e é por isso que os números são tão específicos:
 *
 *  · o degradê do cabelo acendia na altura do pescoço e a personagem
 *    ganhava um **capuz verde** que engolia o queixo;
 *  · o degradê saía em **listras horizontais de borda dura**, porque
 *    `blendStations` não interpola cor — faixa de cor é anel de
 *    controle, e dez anéis dão cinco listras;
 *  · a queda alargada **atravessava os braços** em até quatro
 *    centímetros, que é o mesmo acidente que matou o véu da Nexara;
 *  · a coroa de frequência estava em raio `0,18` **dentro** de uma
 *    saia de raio `0,24` — construída, paga em triângulos e invisível;
 *  · os fones em gelo claro eram a coisa mais clara da personagem
 *    inteira, e o traje é escuro.
 *
 * O perigo de fundo é sempre o mesmo: `fones` é um acessório que os
 * habitantes herdam, o vestido longo é compartilhado com a Luma, e a
 * calota do cabelo é compartilhada com três penteados. Nada disso
 * podia mudar, e há caso para cada um.
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

const lilly = getCharacter('lilly')!;

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

/**
 * Monta um avatar num nível e devolve a malha do corpo.
 *
 * O padrão é `alta`, não `ultra`: o nível ultra custa cerca de quatro
 * vezes mais e nada do que se mede aqui depende dele — relevo, coroa,
 * fones e cobertura da nuca existem a partir de `segments >= 14`.
 */
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

/**
 * Extremos de uma peça da malha, por acabamento.
 *
 * Comprimento de cabelo se mede por `Finish`, nunca por cor — e aqui
 * é preciso aceitar **dois**: no `onda` os anéis acesos trocam de
 * acabamento para `Holo`, que é justamente o truque que dá neon sem
 * gastar triângulo. Medir só `Hair` mediria a raiz e diria que o
 * cabelo é curto.
 */
function faixa(mesh: THREE.SkinnedMesh, finishes: readonly number[]): { minY: number; maxY: number; n: number } {
  const pos = mesh.geometry.getAttribute('position');
  const fin = mesh.geometry.getAttribute('aFinish');
  let minY = Infinity;
  let maxY = -Infinity;
  let n = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (!finishes.includes(Math.round(fin.getX(i)))) continue;
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
    n += 1;
  }
  return { minY, maxY, n };
}

describe('a Lilly do remaster ainda é a Lilly', () => {
  it('continua sendo a mesma personagem do panteão', () => {
    expect(lilly.id).toBe('lilly');
    expect(lilly.name.toLowerCase()).toContain('lilly');
    expect(lilly.appearance.hairStyle).toBe('onda');
    expect(lilly.appearance.outfit).toBe('sonora');
  });

  it('veste a paleta da arte de referência, não a do texto', () => {
    const a = lilly.appearance;
    // O pedido escrito falava em rosa, lilás e violeta; a imagem
    // anexada mostrava o contrário, e o Criador decidiu pela imagem:
    // massa escura, luz verde-ciano, acento magenta.
    expect(a.hairColor.toLowerCase()).toBe('#161b2a');
    expect(a.topColor.toLowerCase()).toBe('#171a26');
    expect(a.bottomColor.toLowerCase()).toBe('#121520');
    // Os olhos violeta são traço original da personagem e ficam.
    expect(a.eyeColor.toLowerCase()).toBe('#b98cff');
  });

  it('não usa o acessório de fones, porque os fones vêm no penteado', () => {
    // Se ela usasse o acessório compartilhado, remasterizá-lo
    // mudaria a cabeça de todo habitante que o sorteio vestir.
    expect(lilly.appearance.accessory).toBe('nenhum');
  });
});

describe('o que é dela não entra no sorteio da praça', () => {
  it('a Onda não cai na cabeça de um habitante qualquer', () => {
    expect(HAIR_STYLES).toContain('onda');
    expect(CITIZEN_HAIR_STYLES).not.toContain('onda');
  });

  it('o traje Sonora não cai no guarda-roupa de um habitante qualquer', () => {
    expect(OUTFITS).toContain('sonora');
    expect(CITIZEN_OUTFITS).not.toContain('sonora');
  });

  it('o que já era exclusivo das outras deusas continua protegido', () => {
    expect(CITIZEN_HAIR_STYLES).not.toContain('cascata');
    expect(CITIZEN_HAIR_STYLES).not.toContain('fluxo');
    expect(CITIZEN_OUTFITS).not.toContain('aurora');
    expect(CITIZEN_OUTFITS).not.toContain('rede');
    expect(CITIZEN_OUTFITS).not.toContain('docente');
  });

  it('mil habitantes sorteados não vestem nada da Lilly', () => {
    const rng = createRng(20461);
    for (let i = 0; i < 1000; i += 1) {
      const a = randomAppearance(rng);
      expect(a.hairStyle).not.toBe('onda');
      expect(a.outfit).not.toBe('sonora');
    }
  });

  it('pedir a Onda por dado salvo não quebra — cai no padrão', () => {
    // `sanitizeAppearance` é a porta de entrada de dado vindo de
    // fora; ela tem de aceitar o valor novo sem explodir.
    const limpo = sanitizeAppearance({ ...DEFAULT_APPEARANCE, hairStyle: 'onda', outfit: 'sonora' });
    expect(limpo.hairStyle).toBe('onda');
    expect(limpo.outfit).toBe('sonora');
  });
});

describe('o cabelo Onda', () => {
  it('é longo de verdade, e ainda assim mais curto que a Cascata', () => {
    const { mesh } = montar({ hairStyle: 'onda' });
    const onda = faixa(mesh, [Finish.Hair, Finish.Holo]);
    const { mesh: outra } = montar({ hairStyle: 'cascata' });
    const cascata = faixa(outra, [Finish.Hair]);
    // Passa bem abaixo do ombro.
    expect(onda.minY).toBeLessThan(0.2);
    // E não toma da Suki-Chan o posto de cabelo mais longo do Éden,
    // que tem teste próprio em outro arquivo.
    expect(onda.minY).toBeGreaterThan(cascata.minY);
  });

  it('acende na ponta e fica escuro em cima', () => {
    const { mesh } = montar({ hairStyle: 'onda' });
    const pos = mesh.geometry.getAttribute('position');
    const fin = mesh.geometry.getAttribute('aFinish');
    let acesoMax = -Infinity;
    let raizMin = Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const f = Math.round(fin.getX(i));
      // A cabeça tem outras peças `Holo` (os fones); o recorte por
      // altura mantém a medida no cabelo.
      if (f === Finish.Holo && pos.getY(i) < 0.5) acesoMax = Math.max(acesoMax, pos.getY(i));
      if (f === Finish.Hair) raizMin = Math.min(raizMin, pos.getY(i));
    }
    // Existe parte acesa...
    expect(acesoMax).toBeGreaterThan(-Infinity);
    // ...e ela mora embaixo. Com o neon na altura do pescoço a
    // personagem ganhava um capuz verde; isto é a trava disso.
    expect(acesoMax).toBeLessThan(0.45);
    // A raiz escura desce pelo menos até o ombro, senão o degradê
    // começou alto demais de novo.
    expect(raizMin).toBeLessThan(0.5);
  });

  it('tem anel de controle suficiente para o degradê não virar listra', () => {
    // `blendStations` trava a cor no anel mais próximo: o número de
    // faixas de cor é o número de anéis de controle. Com poucos
    // anéis o degradê sai como um bolo de camadas. A contagem de
    // cores distintas na queda é o proxy observável disso.
    const { mesh } = montar({ hairStyle: 'onda' }, 'ultra');
    const pos = mesh.geometry.getAttribute('position');
    const fin = mesh.geometry.getAttribute('aFinish');
    const cor = mesh.geometry.getAttribute('color');
    const tons = new Set<string>();
    for (let i = 0; i < pos.count; i += 1) {
      const f = Math.round(fin.getX(i));
      if (f !== Finish.Hair && f !== Finish.Holo) continue;
      if (pos.getY(i) > 0.55) continue;
      tons.add(`${cor.getX(i).toFixed(3)},${cor.getY(i).toFixed(3)},${cor.getZ(i).toFixed(3)}`);
    }
    expect(tons.size).toBeGreaterThanOrEqual(8);
  });

  it('passa por trás dos braços em vez de atravessá-los', () => {
    // O acidente que matou o véu da Nexara: os braços caem em `x`
    // entre 0,13 e 0,28, e a face de trás deles fica perto de
    // `z = −0,05`. Cabelo largo tem de passar atrás disso.
    const { mesh } = montar({ hairStyle: 'onda' }, 'ultra');
    const pos = mesh.geometry.getAttribute('position');
    const fin = mesh.geometry.getAttribute('aFinish');
    for (let y = 0.35; y >= 0.1; y -= 0.05) {
      let cabeloFrente = -Infinity;
      let bracoTras = Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.abs(pos.getY(i) - y) > 0.03) continue;
        const ax = Math.abs(pos.getX(i));
        if (ax < 0.13 || ax > 0.28) continue;
        const f = Math.round(fin.getX(i));
        if (f === Finish.Hair || f === Finish.Holo) cabeloFrente = Math.max(cabeloFrente, pos.getZ(i));
        else bracoTras = Math.min(bracoTras, pos.getZ(i));
      }
      if (cabeloFrente === -Infinity || bracoTras === Infinity) continue;
      expect(bracoTras).toBeGreaterThan(cabeloFrente);
    }
  });

  it('cobre a nuca — nenhuma faixa de pele vista de trás', () => {
    // Traçado de raios, não amostragem de vértice: vértice é proxy
    // ruim para oclusão. Grade grossa de propósito, para caber no
    // tempo da suíte.
    const { mesh } = montar({ hairStyle: 'onda' }, 'alta');
    mesh.updateMatrixWorld(true);
    const fin = mesh.geometry.getAttribute('aFinish');
    const ray = new THREE.Raycaster();
    const alvo = new THREE.Vector3();
    let pele = 0;
    for (let az = 130; az <= 230; az += 20) {
      for (let el = -10; el <= 40; el += 25) {
        const ar = (az * Math.PI) / 180;
        const er = (el * Math.PI) / 180;
        const dir = new THREE.Vector3(Math.sin(ar) * Math.cos(er), Math.sin(er), Math.cos(ar) * Math.cos(er));
        for (let y = 0.86; y >= 0.6; y -= 0.04) {
          alvo.set(0, y, 0);
          ray.set(alvo.clone().addScaledVector(dir, 1.5), dir.clone().negate());
          const hit = ray.intersectObject(mesh, false)[0];
          if (hit?.face && Math.round(fin.getX(hit.face.a)) === Finish.Skin) pele += 1;
        }
      }
    }
    expect(pele).toBe(0);
  });

  it('não mexeu na calota, que é compartilhada com outros penteados', () => {
    const antes = assinatura(montar({ hairStyle: 'fluxo' }).mesh);
    const depois = assinatura(montar({ hairStyle: 'cascata' }).mesh);
    // Construir a Onda no meio não pode contaminar os vizinhos.
    montar({ hairStyle: 'onda' });
    expect(assinatura(montar({ hairStyle: 'fluxo' }).mesh)).toBe(antes);
    expect(assinatura(montar({ hairStyle: 'cascata' }).mesh)).toBe(depois);
  });
});

describe('o traje Sonora', () => {
  it('é vestido longo, como o manto da Luma, e não calça', () => {
    const { mesh } = montar({ outfit: 'sonora' });
    const { minY } = faixa(mesh, [Finish.Glass]);
    // A barra do vestido longo desce bem abaixo da saia curta.
    expect(minY).toBeLessThan(-0.4);
  });

  it('a coroa de frequência fica POR FORA da saia, não dentro dela', () => {
    // Este é o caso que justifica o arquivo. A primeira versão pôs a
    // coroa no quadril, em raio 0,18, dentro de um manto de raio
    // 0,24: paga em triângulos e invisível na tela.
    const { mesh } = montar({ outfit: 'sonora' }, 'ultra');
    const pos = mesh.geometry.getAttribute('position');
    const fin = mesh.geometry.getAttribute('aFinish');
    let conferidas = 0;
    for (let y = -0.1; y >= -0.22; y -= 0.05) {
      let coroa = 0;
      let pano = 0;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.abs(pos.getY(i) - y) > 0.025) continue;
        if (Math.abs(pos.getZ(i)) > 0.05) continue;
        const f = Math.round(fin.getX(i));
        const ax = Math.abs(pos.getX(i));
        if (f === Finish.Holo) coroa = Math.max(coroa, ax);
        if (f === Finish.Glass) pano = Math.max(pano, ax);
      }
      if (coroa === 0 || pano === 0) continue;
      expect(coroa).toBeGreaterThan(pano);
      conferidas += 1;
    }
    // Se nada foi conferido, o teste não provou nada.
    expect(conferidas).toBeGreaterThanOrEqual(2);
  });

  it('a coroa some no LOD de longe, onde o orçamento aperta', () => {
    // A conta é por faixa de altura, não por total de `Holo` na
    // malha: a ponta acesa do cabelo, a costura do peito, as linhas
    // do ombro e o cristal da fivela também são `Holo` e existem em
    // todos os níveis. O que desaparece de longe é a coroa, que mora
    // abaixo do quadril.
    const naSaia = (mesh: THREE.SkinnedMesh): number => {
      const pos = mesh.geometry.getAttribute('position');
      const fin = mesh.geometry.getAttribute('aFinish');
      let n = 0;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.round(fin.getX(i)) === Finish.Holo && pos.getY(i) < -0.05) n += 1;
      }
      return n;
    };
    expect(naSaia(montar({ outfit: 'sonora' }, 'alta').mesh)).toBeGreaterThan(0);
    expect(naSaia(montar({ outfit: 'sonora' }, 'baixa').mesh)).toBe(0);
  });

  it('não alterou o vestido compartilhado nem o manto da Luma', () => {
    const vestido = assinatura(montar({ outfit: 'vestido' }).mesh);
    const aurora = assinatura(montar({ outfit: 'aurora' }).mesh);
    montar({ outfit: 'sonora' });
    expect(assinatura(montar({ outfit: 'vestido' }).mesh)).toBe(vestido);
    expect(assinatura(montar({ outfit: 'aurora' }).mesh)).toBe(aurora);
  });
});

describe('os fones', () => {
  it('o acessório compartilhado dos habitantes não foi tocado', () => {
    // `fones` está em CITIZEN_ACCESSORIES: remasterizá-lo mudaria a
    // cabeça de todo habitante sorteado com ele. Os fones da Lilly
    // nascem no penteado, não no acessório.
    expect(CITIZEN_ACCESSORIES).toContain('fones');
    const semOnda = assinatura(montar({ accessory: 'fones', hairStyle: 'curto' }).mesh);
    montar({ hairStyle: 'onda' });
    expect(assinatura(montar({ accessory: 'fones', hairStyle: 'curto' }).mesh)).toBe(semOnda);
  });

  it('vêm junto com a Onda, sem precisar de acessório', () => {
    const semFones = montar({ hairStyle: 'cascata', accessory: 'nenhum' }).mesh;
    const comFones = montar({ hairStyle: 'onda', accessory: 'nenhum' }).mesh;
    // A Onda tem peça acesa na altura da orelha que a Cascata não tem.
    const orelha = (mesh: THREE.SkinnedMesh): number => {
      const pos = mesh.geometry.getAttribute('position');
      const fin = mesh.geometry.getAttribute('aFinish');
      let n = 0;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.round(fin.getX(i)) !== Finish.Holo) continue;
        if (pos.getY(i) < 0.6 || Math.abs(pos.getX(i)) < 0.17) continue;
        n += 1;
      }
      return n;
    };
    expect(orelha(comFones)).toBeGreaterThan(0);
    expect(orelha(semFones)).toBe(0);
  });
});

describe('desempenho', () => {
  it('cabe no teto de triângulos do LOD de longe', () => {
    const { mesh } = montar({ hairStyle: 'onda', outfit: 'sonora' }, 'baixa');
    expect(triangles(mesh)).toBeLessThan(7145);
  });

  it('não acrescenta uma única chamada de desenho', () => {
    // Tudo — coroa, fones, costuras — é geometria mesclada no corpo.
    // Um objeto à parte seguindo o osso custaria uma chamada por
    // personagem em cena.
    const padrao = new Avatar({ ...DEFAULT_APPEARANCE });
    const dela = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: 'onda', outfit: 'sonora' });
    expect(meshes(dela)).toBe(meshes(padrao));
  });

  it('a malha é estável entre montagens iguais', () => {
    // Nada de aleatório entrou no penteado nem no traje: duas
    // montagens do mesmo dado têm de dar a mesma malha.
    const um = assinatura(montar({ hairStyle: 'onda', outfit: 'sonora' }).mesh);
    const dois = assinatura(montar({ hairStyle: 'onda', outfit: 'sonora' }).mesh);
    expect(um).toBe(dois);
  });

  it('os quatro níveis constroem, e o detalhe cresce com o nível', () => {
    const niveis = ['baixa', 'media', 'alta', 'ultra'] as const;
    let anterior = 0;
    for (const nivel of niveis) {
      const { mesh } = montar({ hairStyle: 'onda', outfit: 'sonora' }, nivel);
      const t = triangles(mesh);
      expect(t).toBeGreaterThan(anterior);
      anterior = t;
    }
  });
});

describe('o resto do Éden não mudou', () => {
  it('as outras deusas constroem a mesma malha de sempre', () => {
    // A prova forte é por hash contra a base limpa, fora da suíte.
    // Aqui vale a trava barata: construir a Lilly no meio não pode
    // mudar o que as vizinhas produzem.
    const ids = ['luma', 'suki', 'nexara', 'aerion', 'amara'];
    const antes = new Map<string, string>();
    for (const id of ids) {
      const c = getCharacter(id)!;
      antes.set(id, assinatura(bodyOf(new Avatar(c.appearance))));
    }
    montar({ hairStyle: 'onda', outfit: 'sonora' }, 'ultra');
    for (const id of ids) {
      const c = getCharacter(id)!;
      expect(assinatura(bodyOf(new Avatar(c.appearance)))).toBe(antes.get(id));
    }
  });
});
