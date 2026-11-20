// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Suki-Chan — e a prova de que ainda é ela.
 *
 * A regra do remaster não é "ficar bonito": é continuar sendo a mesma
 * personagem. Estes testes guardam as duas metades disso — a
 * identidade canônica (quem ela é) e o contrato técnico (o que não
 * pode quebrar porque ela mudou de roupa e de cabelo).
 *
 * Quase todos nasceram de um defeito real visto na bancada durante o
 * marco: nuca careca entre a calota e a queda, decote virando buraco
 * de fechadura, diadema atravessando a testa e o cabelo mais longo do
 * Éden entrando no tronco.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../src/characters/Pantheon';
import { getBuilding } from '../../src/cities/aurora-city/Layout';
import { Avatar } from '../../src/player/Avatar';
import {
  ACCESSORIES,
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

const suki = getCharacter('suki')!;

describe('a Suki do remaster ainda é a Suki', () => {
  it('continua sendo a mesma personagem do panteão', () => {
    // O que o remaster NÃO pode tocar: quem ela é, o que ela ensina e
    // onde ela mora.
    expect(suki.id).toBe('suki');
    expect(suki.name).toBe('Suki-Chan');
    expect(suki.title).toBe('Deusa da Inteligência e da Educação');
    expect(suki.place.label).toBe(getBuilding('estufa-celeste').name);
    expect(suki.domain).toContain('Educação');
    expect(suki.contact.handle).toBe('@sukichan');
  });

  it('veste a identidade da arte oficial', () => {
    // Cabelo preto longuíssimo, pele morena, Vestido Docente magenta
    // e os óculos que ela nunca tirou — a leitura da arte, atributo
    // por atributo.
    expect(suki.appearance.hairStyle).toBe('cascata');
    expect(suki.appearance.hairColor).toBe('#1a1a22');
    expect(suki.appearance.skin).toBe('#e8ab82');
    expect(suki.appearance.outfit).toBe('docente');
    expect(suki.appearance.topColor).toBe('#e23c8f');
    expect(suki.appearance.accessory).toBe('lentes');
    // A altura é parte das proporções dela e não muda no remaster.
    expect(suki.appearance.height).toBeCloseTo(0.97, 5);
  });
});

describe('o que é dela não entra no sorteio da praça', () => {
  it('a Cascata não cai na cabeça de um habitante qualquer', () => {
    // O penteado traz o diadema junto: sorteá-lo poria coroa em meia
    // dúzia de passantes.
    expect(HAIR_STYLES).toContain('cascata');
    expect(CITIZEN_HAIR_STYLES).not.toContain('cascata');
    const rng = createRng(20261120);
    for (let i = 0; i < 400; i += 1) expect(randomAppearance(rng).hairStyle).not.toBe('cascata');
  });

  it('o Vestido Docente não cai no guarda-roupa de um habitante qualquer', () => {
    expect(OUTFITS).toContain('docente');
    expect(CITIZEN_OUTFITS).not.toContain('docente');
    const rng = createRng(777);
    for (let i = 0; i < 400; i += 1) expect(randomAppearance(rng).outfit).not.toBe('docente');
  });

  it('as lentes de vidro são dela, e os óculos comuns continuam de todos', () => {
    // A diferença entre proteger um ativo e confiscar um: `lentes`
    // sai do sorteio, `oculos` fica.
    expect(ACCESSORIES).toContain('lentes');
    expect(CITIZEN_ACCESSORIES).not.toContain('lentes');
    expect(CITIZEN_ACCESSORIES).toContain('oculos');
    const rng = createRng(31337);
    for (let i = 0; i < 400; i += 1) expect(randomAppearance(rng).accessory).not.toBe('lentes');
  });

  it('o Manto Aurora da Luma continua protegido junto', () => {
    // A exclusão nova não pode ter substituído a antiga.
    expect(CITIZEN_OUTFITS).not.toContain('aurora');
  });
});

describe('saves antigos continuam valendo', () => {
  it('aceita os valores novos e não quebra com os velhos', () => {
    const novo = sanitizeAppearance({ hairStyle: 'cascata', outfit: 'docente', accessory: 'lentes' });
    expect(novo.hairStyle).toBe('cascata');
    expect(novo.outfit).toBe('docente');
    expect(novo.accessory).toBe('lentes');
    // O save de quem jogou antes do remaster: a Suki usava coque e
    // casual, e isso tem de continuar montando.
    const velho = sanitizeAppearance({ hairStyle: 'coque', outfit: 'casual', accessory: 'oculos' });
    expect(velho.hairStyle).toBe('coque');
    expect(velho.outfit).toBe('casual');
    expect(velho.accessory).toBe('oculos');
  });
});

describe('o Vestido Docente', () => {
  it('é vestido longo: desce mais que a saia curta', () => {
    const curto = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' });
    const docente = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'docente' });
    curto.setDetail('ultra');
    docente.setDetail('ultra');
    const barra = (a: Avatar): number => {
      const g = bodyOf(a).geometry;
      const [ini, fim] = (g.userData.parts as Record<string, [number, number]>).saia;
      const pos = g.getAttribute('position');
      let min = Infinity;
      for (let i = ini; i < fim; i += 1) min = Math.min(min, pos.getY(i));
      return min;
    };
    expect(barra(docente)).toBeLessThan(barra(curto) - 0.05);
    curto.dispose();
    docente.dispose();
  });

  it('tem manga três-quartos: pano no braço, pele no antebraço', () => {
    // A manga não é geometria nova — é a consequência de `docente`
    // não estar nem na lista de manga curta nem na de comprida. Se
    // alguém a puser numa delas, este teste cai.
    const a = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'docente', topColor: '#e23c8f', skin: '#e8ab82' });
    a.setDetail('ultra');
    const geo = bodyOf(a).geometry;
    const pos = geo.getAttribute('position');
    const cor = geo.getAttribute('color');
    // Vermelho alto e verde baixo é o magenta do vestido; o contrário
    // é pele. Comparar canais evita depender do espaço de cor.
    let panoNoBraco = 0;
    let peleNoAntebraco = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const x = Math.abs(pos.getX(i));
      const y = pos.getY(i);
      if (x < 0.17) continue;
      const magenta = cor.getX(i) > cor.getY(i) * 2;
      if (y > 0.26 && y < 0.36 && magenta) panoNoBraco += 1;
      if (y > 0.05 && y < 0.14 && !magenta) peleNoAntebraco += 1;
    }
    expect(panoNoBraco).toBeGreaterThan(0);
    expect(peleNoAntebraco).toBeGreaterThan(0);
    a.dispose();
  });

  it('tem um decote de pele, e não um vestido fechado', () => {
    // O decote é geometria acrescentada porque a cor desta malha é
    // por anel. Sem o painel, não existe um único vértice de pele na
    // frente do peito.
    const fechado = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'vestido' });
    const aberto = new Avatar({ ...DEFAULT_APPEARANCE, outfit: 'docente' });
    fechado.setDetail('ultra');
    aberto.setDetail('ultra');
    const peleNoPeito = (a: Avatar): number => {
      const geo = bodyOf(a).geometry;
      const pos = geo.getAttribute('position');
      const fin = geo.getAttribute('aFinish');
      let n = 0;
      for (let i = 0; i < pos.count; i += 1) {
        if (pos.getY(i) > 0.25 && pos.getY(i) < 0.4 && pos.getZ(i) > 0.08 && Math.abs(pos.getX(i)) < 0.1) {
          if (Math.round(fin.getX(i)) === Finish.Skin) n += 1;
        }
      }
      return n;
    };
    expect(peleNoPeito(aberto)).toBeGreaterThan(peleNoPeito(fechado));
    fechado.dispose();
    aberto.dispose();
  });
});

describe('a Cascata', () => {
  it('é o cabelo mais longo do Éden', () => {
    // A medida é pelo ACABAMENTO, não pela cor. Medir "o que é
    // escuro" parece natural e está errado: o degradê da Cascata
    // clareia 13% em direção à ponta, de propósito, então um filtro
    // por escuridão descarta exatamente o trecho que se quer medir —
    // e o cabelo mais longo do Éden aparece como o mais curto.
    const medir = (estilo: string): number => {
      const a = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: estilo as never, hairColor: '#1a1a22' });
      a.setDetail('ultra');
      const geo = bodyOf(a).geometry;
      const pos = geo.getAttribute('position');
      const fin = geo.getAttribute('aFinish');
      let min = Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.round(fin.getX(i)) === Finish.Hair) min = Math.min(min, pos.getY(i));
      }
      a.dispose();
      return min;
    };
    expect(medir('cascata')).toBeLessThan(medir('ondulado'));
    expect(medir('cascata')).toBeLessThan(medir('longo'));
  });

  it('cobre a nuca: não sobra occipital entre a calota e a queda', () => {
    // A nuca careca foi um defeito real — a queda entrava mais rasa
    // que a calota e aparecia um crescente de pele no meio do
    // cabelo. A prova mede por FAIXA DE ALTURA: em cada faixa da
    // parte de trás do crânio, o ponto mais recuado tem de ser
    // cabelo, nunca pele.
    const a = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: 'cascata', hairColor: '#1a1a22', skin: '#e8ab82' });
    a.setDetail('ultra');
    const geo = bodyOf(a).geometry;
    const pos = geo.getAttribute('position');
    const cor = geo.getAttribute('color');
    // Da nuca ao alto da cabeça, em faixas de 2 cm.
    for (let y = 0.62; y <= 0.78; y += 0.02) {
      let maisAtras = Infinity;
      let escuro = false;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.abs(pos.getY(i) - y) > 0.01) continue;
        if (Math.abs(pos.getX(i)) > 0.04) continue;
        if (pos.getZ(i) < maisAtras) {
          maisAtras = pos.getZ(i);
          escuro = cor.getX(i) < 0.1 && cor.getY(i) < 0.1;
        }
      }
      if (maisAtras < Infinity) expect(escuro, `faixa y=${y.toFixed(2)} mostra pele atrás`).toBe(true);
    }
    a.dispose();
  });

  it('traz o diadema junto, em ouro e vidro', () => {
    // O diadema mora no penteado porque o campo de acessório está
    // ocupado pelos óculos. Quem escolhe a Cascata leva a coroa.
    const com = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: 'cascata', accessory: 'nenhum' });
    const sem = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: 'longo', accessory: 'nenhum' });
    com.setDetail('ultra');
    sem.setDetail('ultra');
    expect(finishes(bodyOf(com)).get(Finish.Glass) ?? 0).toBeGreaterThan(0);
    expect(finishes(bodyOf(sem)).get(Finish.Glass) ?? 0).toBe(0);
    com.dispose();
    sem.dispose();
  });

  it('o diadema não atravessa o crânio', () => {
    // A armadilha é conhecida: peça rígida sobre crânio curvo entra
    // pela testa. Mede-se por RAIO dentro de cada faixa de altura —
    // uma prova por altura pura já aprovou geometria errada antes.
    const a = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: 'cascata', accessory: 'nenhum' });
    a.setDetail('ultra');
    const geo = bodyOf(a).geometry;
    const pos = geo.getAttribute('position');
    const fin = geo.getAttribute('aFinish');
    // Para cada vértice de ouro ou vidro, o raio dele tem de ser
    // maior que o raio médio da cabeça naquela faixa.
    const faixa = new Map<number, number[]>();
    for (let i = 0; i < pos.count; i += 1) {
      const id = Math.round(fin.getX(i));
      if (id !== Finish.Skin) continue;
      const y = pos.getY(i);
      if (y < 0.75 || y > 0.95) continue;
      const k = Math.round(y / 0.02);
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const lista = faixa.get(k) ?? [];
      lista.push(r);
      faixa.set(k, lista);
    }
    let conferidos = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const id = Math.round(fin.getX(i));
      if (id !== Finish.Shine && id !== Finish.Glass) continue;
      const k = Math.round(pos.getY(i) / 0.02);
      const lista = faixa.get(k);
      if (!lista || lista.length === 0) continue;
      const craneo = lista.reduce((s, v) => s + v, 0) / lista.length;
      expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeGreaterThan(craneo * 0.8);
      conferidos += 1;
    }
    expect(conferidos).toBeGreaterThan(0);
    a.dispose();
  });
});

describe('as lentes vazadas', () => {
  it('são de vidro, e os óculos comuns continuam opacos', () => {
    const dela = new Avatar({ ...DEFAULT_APPEARANCE, accessory: 'lentes' });
    const comuns = new Avatar({ ...DEFAULT_APPEARANCE, accessory: 'oculos' });
    dela.setDetail('ultra');
    comuns.setDetail('ultra');
    expect(finishes(bodyOf(dela)).get(Finish.Glass) ?? 0).toBeGreaterThan(0);
    expect(finishes(bodyOf(comuns)).get(Finish.Glass) ?? 0).toBe(0);
    dela.dispose();
    comuns.dispose();
  });

  it('custam menos que os óculos opacos, porque a bola saiu', () => {
    const dela = new Avatar({ ...DEFAULT_APPEARANCE, accessory: 'lentes' });
    const comuns = new Avatar({ ...DEFAULT_APPEARANCE, accessory: 'oculos' });
    dela.setDetail('baixa');
    comuns.setDetail('baixa');
    expect(triangles(bodyOf(dela))).toBeLessThan(triangles(bodyOf(comuns)));
    dela.dispose();
    comuns.dispose();
  });
});

describe('o contrato técnico do remaster', () => {
  it('cabe no orçamento do nível baixo', () => {
    // O teto é o avatar antigo inteiro mais 10%: é o que o LOD de
    // `NpcSystem` assume ao pôr cinquenta e quatro pessoas em cena.
    const a = new Avatar(suki.appearance);
    a.setDetail('baixa');
    expect(triangles(bodyOf(a))).toBeLessThanOrEqual(6496 * 1.1);
    a.dispose();
  });

  it('não acrescenta uma única chamada de desenho', () => {
    // Tudo o que o remaster trouxe — cabelo, diadema, decote, lentes
    // — está na malha do corpo. Contagem comparada com o avatar
    // padrão, nunca absoluta.
    for (const nivel of Object.keys(BODY_DETAIL) as (keyof typeof BODY_DETAIL)[]) {
      const dela = new Avatar(suki.appearance);
      const padrao = new Avatar(DEFAULT_APPEARANCE);
      dela.setDetail(nivel);
      padrao.setDetail(nivel);
      expect(meshes(dela), `nível ${nivel}`).toBe(meshes(padrao));
      dela.dispose();
      padrao.dispose();
    }
  });

  it('monta em todos os quatro níveis sem perder as peças dela', () => {
    for (const nivel of Object.keys(BODY_DETAIL) as (keyof typeof BODY_DETAIL)[]) {
      const a = new Avatar(suki.appearance);
      a.setDetail(nivel);
      const conta = finishes(bodyOf(a));
      // Vidro existe em todo nível: no baixo vem das lentes, nos
      // outros das lentes e das gemas do diadema.
      expect(conta.get(Finish.Glass) ?? 0, `nível ${nivel}`).toBeGreaterThan(0);
      expect(conta.get(Finish.Cloth) ?? 0, `nível ${nivel}`).toBeGreaterThan(0);
      a.dispose();
    }
  });
});
