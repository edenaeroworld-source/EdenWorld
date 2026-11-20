// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Luma — e a prova de que ainda é ela.
 *
 * A regra do remaster não é "ficar bonito": é continuar sendo a mesma
 * personagem. Estes testes guardam as duas metades disso — a
 * identidade canônica (quem ela é) e o contrato técnico (o que não
 * pode quebrar porque ela mudou de roupa e de cabelo).
 *
 * Quase todos nasceram de um defeito real visto na bancada durante o
 * marco: mecha virando tentáculo sobre o rosto, brinco enterrado
 * dentro do cabelo, manto virando crinolina, e a malha baixa
 * estourando o orçamento por causa dos anéis da onda.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/characters/Pantheon';
import { getBuilding } from '../../src/cities/aurora-city/Layout';
import { Avatar } from '../../src/player/Avatar';
import { CITIZEN_OUTFITS, DEFAULT_APPEARANCE, OUTFITS, randomAppearance, sanitizeAppearance } from '../../src/player/AvatarAppearance';
import { BONE_NAMES, Finish, HIP_HEIGHT } from '../../src/player/body/BodyRig';
import { createRng } from '../../src/utils/math';

function bodyOf(avatar: Avatar): THREE.SkinnedMesh {
  const mesh = avatar.root.getObjectByName('corpo') as THREE.SkinnedMesh;
  expect(mesh).toBeTruthy();
  return mesh;
}

/** Quantos vértices de cada acabamento a malha tem. */
function finishes(mesh: THREE.SkinnedMesh): Map<number, number> {
  const attr = mesh.geometry.getAttribute('aFinish');
  const count = new Map<number, number>();
  for (let i = 0; i < attr.count; i += 1) {
    const id = Math.round(attr.getX(i));
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  return count;
}

const luma = getCharacter('luma')!;

describe('a Luma do remaster ainda é a Luma', () => {
  it('continua sendo a mesma personagem do panteão', () => {
    // O que o remaster NÃO pode tocar: quem ela é, o que ela assina e
    // onde ela mora. Trocar o visual não pode virar trocar de deusa.
    expect(luma.id).toBe('luma');
    expect(luma.name).toBe('Luma');
    expect(luma.title).toBe('Deusa do Corpo e da Silhueta Viva');
    expect(luma.place.label).toBe(getBuilding('atelie-aero').name);
    expect(luma.domain).toContain('Ecossistema BET');
  });

  it('mantém a silhueta que ela mesma mostra no Ateliê', () => {
    // Quem assina a tecnologia usa a tecnologia. Os dois canais ficam
    // ligados, nos mesmos 125% e 150% de antes do remaster.
    expect(luma.afters).toBeTruthy();
    expect(luma.afters!.bust).toBeCloseTo(1.25, 5);
    expect(luma.afters!.curve).toBeCloseTo(1.5, 5);
    expect(luma.afters!.bustActive).toBe(true);
    expect(luma.afters!.curveActive).toBe(true);
  });

  it('veste a identidade da arte oficial', () => {
    // Cabelo roxo ondulado, olhos castanhos, pele morena, Manto
    // Aurora e brincos de cristal — a leitura da arte "LUMA — EDEN
    // AERO", atributo por atributo.
    expect(luma.appearance.hairStyle).toBe('ondulado');
    expect(luma.appearance.hairColor).toBe('#a855f7');
    expect(luma.appearance.eyeColor).toBe('#3b2a20');
    expect(luma.appearance.skin).toBe('#cf8f63');
    expect(luma.appearance.outfit).toBe('aurora');
    expect(luma.appearance.accessory).toBe('cristal');
    // A altura é parte das proporções dela e não muda no remaster.
    expect(luma.appearance.height).toBeCloseTo(1.01, 5);
  });
});

describe('o Manto Aurora', () => {
  it('é vidro líquido, e não pano pintado de azul', () => {
    // O acabamento é por vértice: se o manto fosse `Cloth` com outra
    // cor, ele teria rugosidade 0,88 e brilho de tecido — exatamente
    // o contrário de vidro.
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'aurora' });
    avatar.setDetail('ultra');
    const conta = finishes(bodyOf(avatar));
    expect(conta.get(Finish.Glass) ?? 0).toBeGreaterThan(1000);
    expect(conta.get(Finish.Cloth) ?? 0).toBe(0);
    avatar.dispose();
  });

  it('não cai no sorteio de um habitante qualquer', () => {
    // Traje divino em cinquenta e quatro pessoas na praça deixa de
    // ser traje divino.
    expect(OUTFITS).toContain('aurora');
    expect(CITIZEN_OUTFITS).not.toContain('aurora');
    const rng = createRng(20261112);
    for (let i = 0; i < 400; i += 1) {
      expect(randomAppearance(rng).outfit).not.toBe('aurora');
    }
  });

  it('é mais comprido que a saia curta, e ainda assim sai do chão', () => {
    // A barra desce 10 cm, não até os pés: a folga que a passada
    // exige cresce com a distância ao quadril, e no chão o manto
    // precisaria abrir 49 cm de cada lado para a coxa balançar
    // dentro dele — vira crinolina, não coluna.
    const saia = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' });
    const manto = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'aurora' });
    saia.setDetail('ultra');
    manto.setDetail('ultra');
    const barra = (a: Avatar): number => {
      const g = bodyOf(a).geometry;
      const partes = g.userData.parts as Record<string, [number, number]>;
      const [ini, fim] = partes.saia;
      const pos = g.getAttribute('position');
      let min = Infinity;
      for (let i = ini; i < fim; i += 1) min = Math.min(min, pos.getY(i));
      return min;
    };
    const baixaSaia = barra(saia);
    const baixaManto = barra(manto);
    expect(baixaManto).toBeLessThan(baixaSaia);
    // Os vértices da saia vivem no espaço do osso do quadril, onde o
    // chão está em `-HIP_HEIGHT`. O manto tem de sobrar pé: 20 cm de
    // folga é o que separa uma barra de uma vassoura.
    expect(baixaManto).toBeGreaterThan(-HIP_HEIGHT + 0.2);
    saia.dispose();
    manto.dispose();
  });
});

describe('o remaster não quebra o que já existia', () => {
  it('preserva o esqueleto inteiro, osso por osso', () => {
    // Rigging preservado é requisito do jogo, não detalhe: as
    // animações, os colisores e a pose de saia dependem destes
    // dezenove nomes.
    const padrao = new Avatar({ ...DEFAULT_APPEARANCE });
    const dela = new Avatar(luma.appearance);
    for (const nome of BONE_NAMES) {
      expect(dela.root.getObjectByName(nome), nome).toBeTruthy();
    }
    expect(bodyOf(dela).skeleton.bones.length).toBe(bodyOf(padrao).skeleton.bones.length);
    padrao.dispose();
    dela.dispose();
  });

  it('o AfterBust e o AfterCurve continuam valendo nela', () => {
    // O morph é de GPU: a contagem de vértices não pode mudar com a
    // intensidade, senão alguém reconstruiu geometria por engano.
    const avatar = new Avatar(luma.appearance);
    avatar.setDetail('ultra');
    const antes = bodyOf(avatar).geometry.getAttribute('position').count;
    avatar.setMorph(2.5, 2.5);
    expect(bodyOf(avatar).geometry.getAttribute('position').count).toBe(antes);
    expect(avatar.morph.bust).toBeCloseTo(2.5, 5);
    expect(avatar.morph.curve).toBeCloseTo(2.5, 5);
    avatar.setMorph(0, 0);
    expect(avatar.morph.bust).toBe(0);
    avatar.dispose();
  });

  it('cabe no orçamento da malha baixa, como qualquer habitante', () => {
    // A promessa do nível baixo: não pesar mais que o avatar antigo
    // inteiro (6 496 triângulos). A onda do cabelo custa anéis, e por
    // isso ela some no nível baixo.
    const avatar = new Avatar(luma.appearance);
    avatar.setDetail('baixa');
    const g = bodyOf(avatar).geometry;
    expect(g.getIndex()!.count / 3).toBeLessThanOrEqual(6_496 * 1.1);
    expect(g.getAttribute('position').count).toBeLessThan(18_405);
    avatar.dispose();
  });

  it('continua um desenho só, com um material só', () => {
    // Vidro líquido não pode ter custado uma chamada de desenho: o
    // acabamento viaja por vértice justamente para isso.
    const conta = (a: Avatar): number => {
      let n = 0;
      a.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) n += 1;
      });
      return n;
    };
    const padrao = new Avatar({ ...DEFAULT_APPEARANCE });
    const dela = new Avatar(luma.appearance);
    padrao.setDetail('ultra');
    dela.setDetail('ultra');
    // O número exato não importa (o rosto sempre foi malha à parte);
    // o que não pode é a Luma custar um desenho a mais que qualquer
    // outro habitante por causa do vidro.
    expect(conta(dela)).toBe(conta(padrao));
    expect(Array.isArray(bodyOf(dela).material)).toBe(false);
    padrao.dispose();
    dela.dispose();
  });

  it('um save antigo da Luma continua carregando', () => {
    // O visual anterior dela — cabelo longo liso, vestido, flor —
    // ainda é uma aparência válida: ninguém perde o personagem
    // salvo porque o canon mudou.
    const antigo = sanitizeAppearance({
      skin: '#ffe0c8',
      hairStyle: 'longo',
      hairColor: '#ff8fc0',
      eyeColor: '#7a5cc9',
      outfit: 'vestido',
      topColor: '#ffc1d6',
      bottomColor: '#f0588c',
      shoeColor: '#f4f6fb',
      accessory: 'flor',
      height: 1.01,
    });
    expect(antigo.hairStyle).toBe('longo');
    expect(antigo.outfit).toBe('vestido');
    expect(antigo.accessory).toBe('flor');
    // E o visual novo também sobrevive a uma ida ao disco.
    const novo = sanitizeAppearance(JSON.parse(JSON.stringify(luma.appearance)));
    expect(novo).toEqual(luma.appearance);
  });
});
