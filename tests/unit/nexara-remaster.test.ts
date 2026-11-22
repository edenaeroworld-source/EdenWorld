// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Nexara — e a prova de que o resto do Éden não mudou.
 *
 * A Nexara é a deusa da Internet e das Redes, e o marco dela trouxe
 * três coisas que nenhuma personagem tinha antes: um acabamento que
 * **emite luz**, um traje exclusivo e dois anéis em órbita da cabeça.
 * As três são perigosas de maneiras diferentes, e é disso que estes
 * testes tratam.
 *
 * O acabamento é perigoso porque mexe numa tabela que todo mundo lê:
 * se a coluna nova não nascer zerada nas sete linhas antigas, cada
 * pessoa do Éden passa a brilhar. Os anéis são perigosos porque a
 * saída fácil — um objeto à parte seguindo a cabeça — custa uma
 * chamada de desenho por personagem. O traje é perigoso porque o
 * guarda-roupa é sorteado para os habitantes, e roupa de deusa na
 * praça deixa de ser roupa de deusa.
 *
 * Quase todo caso aqui nasceu de um defeito que apareceu na bancada
 * durante o marco: faixa de pele na nuca, costas lisas como capuz,
 * anéis dentro do crânio e véu querendo cobrir o que o braço já
 * ocupava.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createOfficialAvatar } from '../../src/characters/CharacterModels';
import { getCharacter } from '../../src/characters/Pantheon';
import { Avatar, HALO_DEFAULT } from '../../src/player/Avatar';
import {
  CITIZEN_HAIR_STYLES,
  CITIZEN_OUTFITS,
  DEFAULT_APPEARANCE,
  HAIR_STYLES,
  OUTFITS,
  randomAppearance,
  sanitizeAppearance,
} from '../../src/player/AvatarAppearance';
import {
  FINISH_CLEARCOAT,
  FINISH_EMISSIVE,
  FINISH_ENV_DIFFUSE,
  FINISH_IRIDESCENCE,
  FINISH_METALNESS,
  FINISH_ROUGHNESS,
  FINISH_SHEEN,
} from '../../src/player/body/BodyFinish';
import { BODY_DETAIL, Finish } from '../../src/player/body/BodyRig';
import { createRng } from '../../src/utils/math';

const nexara = getCharacter('nexara')!;

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

/**
 * Monta um avatar num nível e devolve a malha do corpo.
 *
 * O padrão é `alta`, não `ultra`, e a razão é tempo de suíte: o nível
 * ultra custa cerca de quatro vezes mais e nada do que se mede aqui
 * depende dele — relevo, anéis, véu e cobertura da nuca existem a
 * partir de `segments >= 14`. Um arquivo de teste que gasta mais do
 * que precisa não é só lento: ele empurra para fora do tempo os
 * testes pesados dos outros, que rodam no mesmo pool.
 */
function montar(extra: Partial<typeof DEFAULT_APPEARANCE>, nivel: keyof typeof BODY_DETAIL = 'alta'): { a: Avatar; mesh: THREE.SkinnedMesh } {
  const a = new Avatar({ ...DEFAULT_APPEARANCE, ...extra });
  a.setDetail(nivel);
  return { a, mesh: bodyOf(a) };
}

describe('a Nexara do remaster ainda é a Nexara', () => {
  it('continua sendo a mesma personagem do panteão', () => {
    expect(nexara.id).toBe('nexara');
    expect(nexara.appearance.hairStyle).toBe('fluxo');
    expect(nexara.appearance.outfit).toBe('rede');
  });

  it('veste a identidade da arte oficial', () => {
    const a = nexara.appearance;
    // Olhos ciano luminosos, cabelo branco-lavanda, paleta clara.
    expect(a.eyeColor.toLowerCase()).toBe('#29c8ff');
    expect(a.hairColor.toLowerCase()).toBe('#efe6ff');
    expect(a.topColor.toLowerCase()).toBe('#f4f6fb');
    // Ela não usa o acessório de auréola: o halo dela são os anéis
    // orbitais, que vêm no penteado e fazem parte da malha.
    expect(a.accessory).toBe('nenhum');
  });
});

describe('o que é dela não entra no sorteio da praça', () => {
  it('o Fluxo não cai na cabeça de um habitante qualquer', () => {
    expect(HAIR_STYLES).toContain('fluxo');
    expect(CITIZEN_HAIR_STYLES).not.toContain('fluxo');
  });

  it('o traje Rede não cai no guarda-roupa de um habitante qualquer', () => {
    expect(OUTFITS).toContain('rede');
    expect(CITIZEN_OUTFITS).not.toContain('rede');
  });

  it('o que já era exclusivo da Luma e da Suki-Chan continua protegido', () => {
    expect(CITIZEN_HAIR_STYLES).not.toContain('cascata');
    expect(CITIZEN_OUTFITS).not.toContain('aurora');
    expect(CITIZEN_OUTFITS).not.toContain('docente');
  });

  it('mil habitantes sorteados não vestem nada da Nexara', () => {
    const rng = createRng(20261112);
    for (let i = 0; i < 1000; i += 1) {
      const a = randomAppearance(rng);
      expect(a.hairStyle).not.toBe('fluxo');
      expect(a.outfit).not.toBe('rede');
    }
  });
});

describe('saves antigos continuam valendo', () => {
  it('aceita os valores novos e não quebra com os velhos', () => {
    expect(sanitizeAppearance({ hairStyle: 'fluxo', outfit: 'rede' }).hairStyle).toBe('fluxo');
    expect(sanitizeAppearance({ hairStyle: 'fluxo', outfit: 'rede' }).outfit).toBe('rede');
    // Save de antes do marco: o que não existe mais volta ao padrão.
    const velho = sanitizeAppearance({ hairStyle: 'inventado' as never, outfit: 'inventado' as never });
    expect(HAIR_STYLES).toContain(velho.hairStyle);
    expect(OUTFITS).toContain(velho.outfit);
  });
});

describe('o acabamento que emite luz', () => {
  it('nasce zerado nos sete acabamentos que já existiam', () => {
    // Esta é a prova de não-regressão visual do marco inteiro: pele,
    // pano, cabelo, olho, borracha, brilho e vidro continuam com
    // emissão zero, então nenhum pixel do Éden antigo mudou de cor
    // por causa da coluna nova.
    for (let i = 0; i <= Finish.Glass; i += 1) {
      expect(FINISH_EMISSIVE[i], `acabamento ${i} deveria continuar sem emissão`).toBe(0);
    }
    expect(FINISH_EMISSIVE[Finish.Holo]).toBeGreaterThan(0);
  });

  it('todas as tabelas de acabamento têm a mesma altura', () => {
    // Elas são paralelas e lidas pelo mesmo índice: uma tabela mais
    // curta que as outras devolve `undefined` no GLSL e apaga o
    // material inteiro, sem erro de compilação que avise.
    const tabelas = [
      FINISH_ROUGHNESS,
      FINISH_METALNESS,
      FINISH_SHEEN,
      FINISH_CLEARCOAT,
      FINISH_ENV_DIFFUSE,
      FINISH_IRIDESCENCE,
      FINISH_EMISSIVE,
    ];
    for (const t of tabelas) expect(t).toHaveLength(Finish.Holo + 1);
  });

  it('só brilha quem tem briefing para brilhar, e nunca uma peça genérica', () => {
    const dela = montar(nexara.appearance);
    expect(finishes(dela.mesh).get(Finish.Holo) ?? 0).toBeGreaterThan(0);
    dela.a.dispose();

    // **Atualizado no marco da Amara 2.0.** O caso dizia "a Nexara e
    // mais ninguém" quando ela era a única a ter ganhado um marco com
    // peça emissiva. A Amara ganhou o dela — o Nimbo Materno, o fio
    // da borda do manto e as nervuras da saia são `Finish.Holo` por
    // briefing do Criador, que pediu a auréola acesa.
    //
    // O que este caso guarda não mudou, e é mais forte do que era:
    // **o holograma não vaza para peça de habitante.** Quem não tem
    // marco continua sem brilhar, e a própria Amara, trocadas as três
    // peças dela pelas genéricas, volta a zero.
    for (const id of ['luma', 'suki', 'aerion']) {
      const ficha = getCharacter(id);
      if (!ficha) continue;
      const outra = montar(ficha.appearance);
      expect(finishes(outra.mesh).get(Finish.Holo) ?? 0, `${id} não pode brilhar`).toBe(0);
      outra.a.dispose();
    }

    const amara = getCharacter('amara')!;
    const comPecasDela = montar(amara.appearance);
    expect(finishes(comPecasDela.mesh).get(Finish.Holo) ?? 0).toBeGreaterThan(0);
    comPecasDela.a.dispose();

    const semPecasDela = montar({ ...amara.appearance, hairStyle: 'longo', outfit: 'aero', accessory: 'nenhum' });
    expect(finishes(semPecasDela.mesh).get(Finish.Holo) ?? 0, 'o brilho é das peças dela, não dela').toBe(0);
    semPecasDela.a.dispose();

    const padrao = montar({});
    expect(finishes(padrao.mesh).get(Finish.Holo) ?? 0).toBe(0);
    padrao.a.dispose();
  });
});

describe('a cor da auréola vem da ficha', () => {
  it('o Aérion continua dourado', () => {
    const a = createOfficialAvatar('aerion');
    expect(a).toBeTruthy();
    const halo = a!.root.getObjectByName('halo') as THREE.Mesh;
    const cor = (halo.material as THREE.MeshBasicMaterial).color.getHex();
    expect(cor).toBe(HALO_DEFAULT);
    a!.dispose();
  });

  it('e qualquer ficha pode pedir outra cor sem tocar na dele', () => {
    const a = new Avatar({ ...DEFAULT_APPEARANCE, accessory: 'aureola' });
    const halo = a.root.getObjectByName('halo') as THREE.Mesh;
    expect((halo.material as THREE.MeshBasicMaterial).color.getHex()).toBe(HALO_DEFAULT);
    a.setHaloColor(0x29c8ff);
    expect((halo.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x29c8ff);
    a.dispose();
  });
});

describe('o cabelo Fluxo', () => {
  it('é longo, mas não toma da Suki-Chan o título de cabelo mais longo do Éden', () => {
    // Medido pelo ACABAMENTO, nunca pela cor: o Fluxo vai de branco
    // a lavanda de propósito, e um filtro por tom descartaria
    // justamente o trecho que se quer medir.
    //
    // **Nota do marco da Amara 2.0.** O que este caso guarda — que o
    // Fluxo fica entre o `longo` e a `cascata` — segue intacto, e as
    // asserções abaixo não foram tocadas: entre Nexara e Suki-Chan,
    // nada mudou. Mas a `cascata` deixou de ser a queda mais longa do
    // Éden: a `nascente` desce a `y = −0,10` contra os `0,01` dela.
    // Mais fundo que as duas só a `fibra` da Akemi-Chan (`−0,16`), e
    // aquilo são filamentos soltos, não massa de cabelo.
    const medir = (estilo: string): number => {
      const { a, mesh } = montar({ hairStyle: estilo as never });
      const pos = mesh.geometry.getAttribute('position');
      const fin = mesh.geometry.getAttribute('aFinish');
      let min = Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.round(fin.getX(i)) === Finish.Hair) min = Math.min(min, pos.getY(i));
      }
      a.dispose();
      return min;
    };
    const fluxo = medir('fluxo');
    expect(fluxo).toBeLessThan(medir('longo'));
    expect(fluxo).toBeGreaterThan(medir('cascata'));
  });

  it('cobre a nuca: não sobra occipital entre a calota e a queda', () => {
    // A faixa de pele na nuca foi um defeito real e enganou três
    // diagnósticos seguidos, porque era assimétrica: a onda do
    // penteado empurrava o cabelo para um lado só, na altura da
    // orelha.
    //
    // A prova é por TRAÇADO DE RAIOS, e não por amostra de vértice.
    // A primeira versão deste teste pegava, em cada faixa de altura,
    // o vértice mais recuado e exigia que fosse cabelo — e isso
    // acusa defeito onde não há: basta que a malha do cabelo, mais
    // esparsa, não tenha vértice naquela faixa exata para o vértice
    // mais recuado ser o do crânio, com o cabelo passando por fora
    // mesmo assim. Raio que sai de fora e para no primeiro
    // triângulo responde a pergunta que importa: **o que se vê
    // daqui é pele?**
    const a = new Avatar(nexara.appearance);
    a.setDetail('alta');
    const mesh = bodyOf(a);
    const fin = mesh.geometry.getAttribute('aFinish');
    const alvo = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    const cy = 0.7;
    const R = 0.176;
    const vistos: string[] = [];
    let total = 0;
    // A grade é grossa de propósito: raio contra malha sem índice
    // espacial custa caro, e novecentos raios estouravam o tempo do
    // teste. Estes cento e poucos ainda passam pelos ângulos em que
    // cada defeito desta nuca apareceu — inclusive `az=240, el=50`,
    // que foi o último a cair.
    for (let az = 105; az <= 255; az += 15) {
      for (const el of [-10, 20, 50]) {
        const ar = (az * Math.PI) / 180;
        const er = (el * Math.PI) / 180;
        const dir = new THREE.Vector3(Math.sin(ar) * Math.cos(er), Math.sin(er), Math.cos(ar) * Math.cos(er));
        for (let dy = 0.75; dy >= -0.2; dy -= 0.15) {
          alvo.set(0, cy + dy * R, 0);
          ray.set(alvo.clone().addScaledVector(dir, 1.5), dir.clone().negate());
          const hit = ray.intersectObject(mesh, false)[0];
          if (!hit?.face) continue;
          total += 1;
          if (Math.round(fin.getX(hit.face.a)) === Finish.Skin) vistos.push(`az=${az} el=${el} dy=${dy.toFixed(1)}`);
        }
      }
    }
    expect(total).toBeGreaterThan(120);
    expect(vistos.slice(0, 5).join(' | '), 'raios que enxergam pele atrás da cabeça').toBe('');
    a.dispose();
  });

  it('tem relevo nas costas em vez de uma casca lisa', () => {
    // As costas liam como um capuz de uma peça só. A causa não era
    // falta de sulco: era sulco estreito demais para a malha e, na
    // segunda tentativa, sulcos espalhados em alturas diferentes —
    // nenhuma altura tinha dois. Mecha é um vinco que corre a queda
    // inteira, e é isso que se mede aqui: em várias alturas da
    // queda, o raio do cabelo varia com o ângulo.
    const { a, mesh } = montar(nexara.appearance, 'alta');
    const pos = mesh.geometry.getAttribute('position');
    const fin = mesh.geometry.getAttribute('aFinish');
    let alturasComRelevo = 0;
    let alturasMedidas = 0;
    for (let y = 0.2; y <= 0.6; y += 0.05) {
      const raios: number[] = [];
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.round(fin.getX(i)) !== Finish.Hair) continue;
        if (Math.abs(pos.getY(i) - y) > 0.015) continue;
        const z = pos.getZ(i);
        if (z > -0.02) continue; // só a face de trás
        raios.push(Math.hypot(pos.getX(i), z));
      }
      if (raios.length < 5) continue;
      alturasMedidas += 1;
      const min = Math.min(...raios);
      const max = Math.max(...raios);
      if (1 - min / max > 0.08) alturasComRelevo += 1;
    }
    expect(alturasMedidas).toBeGreaterThan(4);
    expect(alturasComRelevo).toBe(alturasMedidas);
    a.dispose();
  });

  it('perde o relevo no nível baixo, onde ele não se enxerga', () => {
    // O detalhe secundário é a primeira coisa a cair no LOD distante:
    // é lá que o orçamento aperta e é lá que ninguém veria a ranhura.
    const baixa = montar(nexara.appearance, 'baixa');
    const alta = montar(nexara.appearance, 'alta');
    expect(triangles(baixa.mesh)).toBeLessThan(triangles(alta.mesh));
    baixa.a.dispose();
    alta.a.dispose();
  });
});

describe('os anéis orbitais', () => {
  it('vêm com o Fluxo e com mais nenhum penteado', () => {
    const contar = (estilo: string): number => {
      const { a, mesh } = montar({ hairStyle: estilo as never });
      const pos = mesh.geometry.getAttribute('position');
      const fin = mesh.geometry.getAttribute('aFinish');
      let n = 0;
      // Só o que está acima do alto da cabeça: o véu também é Holo.
      for (let i = 0; i < pos.count; i += 1) {
        if (Math.round(fin.getX(i)) === Finish.Holo && pos.getY(i) > 0.9) n += 1;
      }
      a.dispose();
      return n;
    };
    expect(contar('fluxo')).toBeGreaterThan(0);
    expect(contar('longo')).toBe(0);
    expect(contar('cascata')).toBe(0);
  });

  it('orbitam por cima da cabeça, não dentro dela', () => {
    // A primeira versão pôs os dois anéis em `cy + 0,2`, e o alto do
    // crânio está em `cy + 0,229`: eles atravessavam a calota e a
    // bancada mostrou um bolo de camadas em vez de uma órbita.
    const { a, mesh } = montar(nexara.appearance);
    const pos = mesh.geometry.getAttribute('position');
    const fin = mesh.geometry.getAttribute('aFinish');
    let topoDoCabelo = -Infinity;
    let baseDosAneis = Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const f = Math.round(fin.getX(i));
      const y = pos.getY(i);
      if (f === Finish.Hair) topoDoCabelo = Math.max(topoDoCabelo, y);
      if (f === Finish.Holo && y > 0.9) baseDosAneis = Math.min(baseDosAneis, y);
    }
    expect(baseDosAneis).toBeGreaterThan(topoDoCabelo - 0.02);
    a.dispose();
  });

  it('não custam uma chamada de desenho sequer', () => {
    // Presos ao osso da cabeça dentro da malha única: acompanham o
    // balanço da cabeça sem uma linha de animação e sem um objeto a
    // mais na cena.
    for (const nivel of Object.keys(BODY_DETAIL) as (keyof typeof BODY_DETAIL)[]) {
      const dela = new Avatar(nexara.appearance);
      const padrao = new Avatar(DEFAULT_APPEARANCE);
      dela.setDetail(nivel);
      padrao.setDetail(nivel);
      expect(meshes(dela), `nível ${nivel}`).toBe(meshes(padrao));
      dela.dispose();
      padrao.dispose();
    }
  });
});

describe('o traje Rede', () => {
  it('tem gola alta: pano acima da base do pescoço', () => {
    const alto = (outfit: string): number => {
      const { a, mesh } = montar({ outfit: outfit as never, hairStyle: 'careca' });
      const pos = mesh.geometry.getAttribute('position');
      const fin = mesh.geometry.getAttribute('aFinish');
      let max = -Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        const f = Math.round(fin.getX(i));
        if (f !== Finish.Cloth && f !== Finish.Glass) continue;
        if (Math.abs(pos.getX(i)) > 0.06) continue;
        max = Math.max(max, pos.getY(i));
      }
      a.dispose();
      return max;
    };
    expect(alto('rede')).toBeGreaterThan(alto('casual'));
  });

  it('tem ombreiras de vidro e o véu holográfico curto', () => {
    const { a, mesh } = montar(nexara.appearance);
    const pos = mesh.geometry.getAttribute('position');
    const fin = mesh.geometry.getAttribute('aFinish');
    let vidroNoOmbro = 0;
    let veuBaixo = 0;
    let veuNaCoxa = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const f = Math.round(fin.getX(i));
      const y = pos.getY(i);
      if (f === Finish.Glass && y > 0.36 && y < 0.46 && Math.abs(pos.getX(i)) > 0.12) vidroNoOmbro += 1;
      if (f === Finish.Holo && y < 0.3) veuBaixo += 1;
      // O quadril está em `0,06` e o joelho perto de `-0,40`: abaixo
      // de `-0,20` o véu já teria virado saia longa.
      if (f === Finish.Holo && y < -0.2) veuNaCoxa += 1;
    }
    expect(vidroNoOmbro).toBeGreaterThan(0);
    expect(veuBaixo).toBeGreaterThan(0);
    // Curto de propósito: um véu longo nas costas apagaria o cabelo,
    // porque a malha é opaca e de material único — medido na bancada.
    expect(veuNaCoxa).toBe(0);
    a.dispose();
  });
});

describe('o contrato técnico do remaster', () => {
  it('cabe no orçamento do nível baixo', () => {
    // O teto é o avatar antigo inteiro mais 10%: é o que o LOD de
    // `NpcSystem` assume ao pôr cinquenta e quatro pessoas em cena.
    const a = new Avatar(nexara.appearance);
    a.setDetail('baixa');
    expect(triangles(bodyOf(a))).toBeLessThanOrEqual(6496 * 1.1);
    a.dispose();
  });

  it('monta em todos os quatro níveis sem perder as peças dela', () => {
    for (const nivel of Object.keys(BODY_DETAIL) as (keyof typeof BODY_DETAIL)[]) {
      const a = new Avatar(nexara.appearance);
      a.setDetail(nivel);
      const conta = finishes(bodyOf(a));
      expect(conta.get(Finish.Holo) ?? 0, `nível ${nivel} sem anéis nem véu`).toBeGreaterThan(0);
      expect(conta.get(Finish.Glass) ?? 0, `nível ${nivel} sem vidro`).toBeGreaterThan(0);
      expect(conta.get(Finish.Hair) ?? 0, `nível ${nivel} sem cabelo`).toBeGreaterThan(0);
      a.dispose();
    }
  });

  it('a troca de nível não perde nem duplica peça', () => {
    // Transição de LOD: o mesmo avatar atravessando os quatro níveis
    // e voltando continua com as mesmas peças do começo.
    const a = new Avatar(nexara.appearance);
    a.setDetail('ultra');
    const antes = finishes(bodyOf(a));
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) a.setDetail(nivel);
    const depois = finishes(bodyOf(a));
    for (const [id, n] of antes) expect(depois.get(id), `acabamento ${id}`).toBe(n);
    a.dispose();
  });
});
