// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Haru — e a prova de que o resto do Éden não mudou.
 *
 * A Haru é a **Deusa da Tecnologia e dos Sistemas**, a dona do EdenOS
 * e a primeira deusa autista do Panteão. O marco dela trouxe um
 * penteado exclusivo (`fibra`), um traje exclusivo (`sistema`), um
 * par de abafadores de ruído, um visor de interface e o emblema do
 * infinito no peito.
 *
 * Quatro achados da investigação moldaram tudo o que se testa aqui, e
 * nenhum deles estava no briefing:
 *
 *  · **os três campos de aparência dela eram compartilhados** —
 *    `curto`, `aero` e `oculos` são todos herdados por habitantes
 *    sorteados. E o pior é o traje: `aero` também veste o **Aérion,
 *    o Criador do Éden Aero**, e a Amara. Remasterizar o `aero` onde
 *    ele mora teria repintado o Criador junto. A contagem de
 *    triângulos dos dois avatares é idêntica nos quatro LODs, o que
 *    prova o compartilhamento;
 *  · **a ficha antiga usava `topColor: '#29c8ff'`**, que é exatamente
 *    o destaque genérico que o motor aplica a qualquer avatar. A
 *    deusa da tecnologia estava, literalmente, pintada com a cor
 *    padrão do sistema;
 *  · **a bio prometia quatro coisas e a malha entregava uma**.
 *    Circuitos acesos, visor, prata — nada disso existia. Este marco
 *    inverte a regra: a malha passou a cumprir a bio, e a única
 *    frase que mudou foi a do cabelo, porque o Criador escolheu o
 *    **longo** da arte de referência em vez do \"chanel assimétrico\"
 *    da característica oficial;
 *  · **a Nexara já é a Deusa da Internet**, remasterizada, com
 *    penteado `fluxo`, branco e lilás, e anéis orbitais. Duas deusas
 *    digitais no mesmo elenco só funcionam se a silhueta e a cor
 *    separarem as duas à distância. A divisão que este arquivo
 *    guarda: **Haru é infraestrutura** — grafite, ciano, fibra — e
 *    **não usa anel orbital**; a Nexara é o tráfego.
 *
 * Vários casos nasceram de defeitos que a bancada mostrou durante o
 * marco, e é por isso que os números são tão específicos:
 *
 *  · o emblema e os traços de circuito ficaram juntos no meio do
 *    peito e o conjunto leu como **uma carinha** — os dois aros do
 *    infinito viraram olhos e o traço horizontal virou boca;
 *  · uma placa prateada atravessava o peito de ombro a ombro e leu
 *    como **babador**;
 *  · o arco dos abafadores foi girado 90° e caiu no plano da nuca e
 *    da testa: atravessou o rosto acima dos olhos como uma
 *    **monocelha** em vez de ligar as duas conchas por cima;
 *  · a queda afunilava de `0,94R` a `0,41R` e leu como **capa de
 *    chuva**; depois nasceu mais estreita que o crânio e deixou a
 *    **nuca nua** entre a calota e o cabelo;
 *  · a franja existia só como relevo de `feature()` e sumia no
 *    sombreamento — a cabeça renderizava como **touca de natação**;
 *    em geometria, na primeira tentativa, virou uma fileira de
 *    **dedos** apontando para o rosto, e na segunda nasceu dentro da
 *    calota e não apareceu.
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

const haru = getCharacter('haru')!;
const nexara = getCharacter('nexara')!;
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

describe('Haru 2.0 — o que é exclusivo dela', () => {
  it('o penteado `fibra` existe no catálogo e os habitantes não o herdam', () => {
    expect(HAIR_STYLES).toContain('fibra');
    expect(CITIZEN_HAIR_STYLES).not.toContain('fibra');
    // O `curto` que ela usava continua de pé, intocado: é penteado de
    // habitante e some do mundo se alguém o apagar junto.
    expect(CITIZEN_HAIR_STYLES).toContain('curto');
  });

  it('o traje `sistema` existe no catálogo e os habitantes não o herdam', () => {
    expect(OUTFITS).toContain('sistema');
    expect(CITIZEN_OUTFITS).not.toContain('sistema');
    // E o `aero` que ela usava segue intacto — é o traje do Criador.
    expect(CITIZEN_OUTFITS).toContain('aero');
  });

  it('nenhum habitante sorteado sai de fibra ou de sistema', () => {
    // Dois mil sorteios: se um deles escapasse, o mundo mudaria.
    const rng = createRng(20261112);
    for (let i = 0; i < 2000; i += 1) {
      const a = randomAppearance(rng);
      expect(a.hairStyle).not.toBe('fibra');
      expect(a.outfit).not.toBe('sistema');
    }
  });

  it('`fibra` e `sistema` sobrevivem ao saneamento', () => {
    const limpo = sanitizeAppearance({ ...DEFAULT_APPEARANCE, hairStyle: 'fibra', outfit: 'sistema' });
    expect(limpo.hairStyle).toBe('fibra');
    expect(limpo.outfit).toBe('sistema');
  });
});

describe('Haru 2.0 — a ficha', () => {
  it('usa o penteado e o traje exclusivos, e nenhum acessório', () => {
    expect(haru.appearance.hairStyle).toBe('fibra');
    expect(haru.appearance.outfit).toBe('sistema');
    // Abafadores e visor nascem **dentro do penteado**. Não é
    // capricho: `appearance.accessory` é um campo só, e `oculos`,
    // `chapeu` e `fones` são todos acessórios que os habitantes
    // herdam. Pelo caminho do acessório ela mexeria em gente sorteada
    // pelo mundo inteiro.
    expect(haru.appearance.accessory).toBe('nenhum');
  });

  it('larga o `#29c8ff`, que era o destaque genérico do motor', () => {
    // O achado mais embaraçoso da investigação: a deusa da tecnologia
    // vestia a cor que o motor pinta em qualquer avatar sem ficha.
    expect(haru.appearance.topColor).not.toBe('#29c8ff');
    expect(haru.appearance.bottomColor).not.toBe('#2e3a4f');
    // Grafite nos dois: a luz do traje vem da emissão, não do pano.
    for (const hex of [haru.appearance.topColor, haru.appearance.bottomColor]) {
      const c = new THREE.Color(hex);
      expect(Math.max(c.r, c.g, c.b)).toBeLessThan(0.45);
    }
  });

  it('preserva a identidade canônica da ficha', () => {
    // O briefing manda elevar o acabamento, não trocar a personagem.
    // Aura, paleta, título, domínio e altura são quem ela é. As cores
    // do traje foram liberadas pelo Criador; estas não.
    expect(haru.aura).toBe(0x7fd6ff);
    expect(haru.colors).toEqual(['#8fe6ff', '#1b82ea']);
    expect(haru.appearance.height).toBe(0.99);
    expect(haru.title).toBe('Deusa da Tecnologia e dos Sistemas');
    expect(haru.domain).toContain('EdenOS');
    expect(haru.contact?.handle).toBe('@haru');
  });

  it('a bio não promete nada que a malha não entregue', () => {
    // A bio antiga prometia circuitos acesos, visor e prata, e nada
    // disso existia na malha: três das quatro promessas eram falsas.
    // Agora a malha cumpre — e a frase do cabelo foi corrigida junto,
    // porque o Criador escolheu o longo da arte de referência.
    const bio = haru.bio.join(' ').toLowerCase();
    expect(bio).not.toContain('chanel');
    expect(bio).toContain('longo');
    expect(bio).toContain('franja');
    expect(bio).toContain('visor');
    expect(bio).toContain('circuito');
    // A identidade autista é texto **e** geometria, e o texto fica.
    expect(bio).toContain('autista');
  });

  it('deixa os óculos para os habitantes, que continuam a usá-los', () => {
    expect(CITIZEN_ACCESSORIES).toContain('oculos');
    expect(haru.appearance.accessory).not.toBe('oculos');
  });
});

describe('Haru 2.0 — o território, que é da Nexara ao lado', () => {
  it('a ficha da Nexara sai do marco intacta', () => {
    // A Nexara já foi remasterizada. Encostar nela aqui seria desfazer
    // um marco fechado.
    expect(nexara.title).toBe('Deusa da Internet e das Redes Sociais');
    expect(nexara.appearance.hairStyle).toBe('fluxo');
    expect(nexara.appearance.outfit).toBe('rede');
    expect(nexara.aura).toBe(0xc9a2ff);
    expect(nexara.colors).toEqual(['#d6b8ff', '#7a3fe0']);
  });

  it('as duas paletas digitais não se encostam', () => {
    for (const c of haru.colors) expect(nexara.colors).not.toContain(c);
    // A Haru é ciano: o verde passa o vermelho nos dois tons, que é o
    // que inclina o azul para a água. A Nexara é lilás, e lá o
    // vermelho passa o verde — é a mesma prova que separa a Saturno
    // dourada da Maze verde, com os canais trocados.
    const ciano = (hex: string): boolean => {
      const c = new THREE.Color(hex);
      return c.g > c.r;
    };
    expect(haru.colors.every(ciano)).toBe(true);
    expect(nexara.colors.some(ciano)).toBe(false);
  });

  it('a Haru não usa anel orbital, que é a assinatura da Nexara', () => {
    // O anel orbital é a silhueta da Nexara a trinta metros. Se a
    // Haru ganhasse um, as duas virariam a mesma personagem de longe.
    // O anel vive bem acima e bem afastado do corpo; nada da Haru
    // chega lá.
    const { mesh } = montar(haru.appearance, 'ultra');
    let fora = 0;
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      if (Math.hypot(pos.getX(i), pos.getZ(i)) > 0.3) fora += 1;
    }
    expect(fora).toBe(0);
  });

  it('o traje do Criador Aérion sai do marco intacto', () => {
    // **Atualizado no marco da Amara 2.0.** O caso comparava a Amara
    // com o Aérion porque os dois vestiam `aero` e saíam da mesma
    // malha; ela saiu para o `regaco`, com briefing próprio. O que o
    // caso guarda — que a Haru não levou o `aero` embora — continua
    // de pé com o dono da peça, comparado contra um habitante que a
    // veste.
    // **Repontada na Etapa 3 (C2).** O Aérion saiu do `aero` para o
    // `criador`, exclusivo dele; a peça continua existindo e é isso
    // que o caso guarda. O portador agora é sintético.
    const dono = { ...aerion.appearance, outfit: 'aero' as const, hairStyle: 'longo' as const };
    const habitante = { ...dono, hairStyle: 'curto' as const };
    for (const nivel of ['baixa', 'media', 'alta', 'ultra'] as const) {
      expect(triangles(montar(dono, nivel).mesh)).toBeGreaterThan(
        triangles(montar(habitante, nivel).mesh),
      );
    }
  });
});

describe('Haru 2.0 — orçamento e chamadas de desenho', () => {
  it('cabe no teto do LOD baixo com a maior folga do elenco', () => {
    const { mesh } = montar(haru.appearance, 'baixa');
    // Medido antes do marco: 6 642, com o teto em 7 145,6. Hoje:
    // 5 960 — abaixo até do corpo padrão (6 118), porque `oculos`
    // custava 524 triângulos e **não cortava por distância**, e o
    // penteado novo corta tudo menos a calota e a queda.
    expect(triangles(mesh)).toBeLessThan(6100);
  });

  it('continua em três malhas, como todas as outras deusas', () => {
    const a = new Avatar({ ...haru.appearance });
    // corpo, rosto e halo. Franja, abafadores, visor, circuitos e
    // fitas são mesclados no corpo: nenhuma peça nova paga chamada de
    // desenho.
    expect(meshes(a)).toBe(3);
  });

  it('o custo cresce com o nível, e nunca encolhe', () => {
    const niveis: Array<keyof typeof BODY_DETAIL> = ['baixa', 'media', 'alta', 'ultra'];
    const custos = niveis.map((n) => triangles(montar(haru.appearance, n).mesh));
    for (let i = 1; i < custos.length; i += 1) expect(custos[i]).toBeGreaterThan(custos[i - 1]);
  });

  it('as fitas de luz da queda só existem de perto', () => {
    // São o que conta a fibra óptica, e a três metros nenhuma delas
    // chega a um pixel.
    const fitas = (nivel: keyof typeof BODY_DETAIL): number => {
      let n = 0;
      varrer(montar(haru.appearance, nivel).mesh, Finish.Holo, (_x, y, z) => {
        if (z < -0.05 && y > 0 && y < 0.8) n += 1;
      });
      return n;
    };
    expect(fitas('baixa')).toBe(0);
    expect(fitas('media')).toBe(0);
    expect(fitas('alta')).toBeGreaterThan(0);
  });

  it('no LOD de longe sobra o emblema, e mais nada aceso', () => {
    // A regra do marco: a marca de identidade nunca corta, o ornamento
    // sempre corta. É a mesma regra da pata da Saturno.
    let noPeito = 0;
    const total = varrer(montar(haru.appearance, 'baixa').mesh, Finish.Holo, (_x, y) => {
      if (y > 0.32 && y < 0.39) noPeito += 1;
    });
    expect(total).toBeGreaterThan(0);
    expect(noPeito).toBe(total);
  });
});

describe('Haru 2.0 — o cabelo', () => {
  it('é longo de verdade, como a arte que o Criador escolheu', () => {
    // Medido: a ponta chega a −0,158, com o quadril em −0,09. A
    // característica oficial dizia \"chanel assimétrico\", mas a arte
    // de referência enviada no mesmo pedido mostrava cabelo muito
    // longo, e perguntado o Criador escolheu a arte.
    const { mesh } = montar(haru.appearance, 'ultra');
    let maisBaixo = Infinity;
    varrer(mesh, Finish.Hair, (_x, y) => {
      if (y < maisBaixo) maisBaixo = y;
    });
    expect(maisBaixo).toBeLessThan(-0.1);
  });

  it('cobre a nuca, em vez de nascer dentro da cabeça', () => {
    // O defeito que a bancada mostrou na terceira rodada: a queda
    // nascia com `0,92R` no couro cabeludo, menos que o crânio, e
    // apareceu uma faixa de pele nua entre a calota e o cabelo. A
    // `cascata` do estilo `longo` usa `1,06R` pelo mesmo motivo.
    const { mesh } = montar(haru.appearance, 'ultra');
    let cabelo = Infinity;
    let pele = Infinity;
    varrer(mesh, Finish.Hair, (x, y, z) => {
      if (y < 0.62 || y > 0.86 || Math.abs(x) > 0.06) return;
      cabelo = Math.min(cabelo, z);
    });
    varrer(mesh, Finish.Skin, (x, y, z) => {
      if (y < 0.62 || y > 0.86 || Math.abs(x) > 0.06) return;
      pele = Math.min(pele, z);
    });
    // Medido: −0,204 contra −0,180. O cabelo está por fora do osso.
    expect(cabelo).toBeLessThan(pele);
  });

  it('não invade o corredor por onde o braço passa', () => {
    // A queda alargada da Lilly atravessou os braços em quatro
    // centímetros, e foi o mesmo acidente que matou o véu da Nexara.
    // O ombro dela está em `|x| = 0,20`.
    const { mesh } = montar(haru.appearance, 'ultra');
    let maisLargo = 0;
    varrer(mesh, Finish.Hair, (x) => {
      maisLargo = Math.max(maisLargo, Math.abs(x));
    });
    // Medido: 0,187, e isso no alto, junto à cabeça.
    expect(maisLargo).toBeLessThan(0.195);
  });

  it('é assimétrico, que é o que sobrou da característica oficial', () => {
    // Uma mecha mais cheia desce só pelo lado direito, à frente do
    // ombro. É o que impede a queda de ler como cortina simétrica.
    const { mesh } = montar(haru.appearance, 'ultra');
    let soma = 0;
    let n = 0;
    varrer(mesh, Finish.Hair, (x, y) => {
      if (y > 0.37 || y < 0) return;
      soma += x;
      n += 1;
    });
    expect(n).toBeGreaterThan(0);
    // Medido: média +0,026. Uma cortina simétrica daria zero.
    expect(soma / n).toBeGreaterThan(0.01);
  });

  it('a franja existe em geometria, e não só como relevo', () => {
    // `feature()` empurra a casca, e nesta escala o sulco desaparece
    // no sombreamento: a cabeça renderizava como touca de natação. A
    // franja é a única coisa que sobrou do \"chanel\" depois da troca
    // de comprimento, então ela tem de existir em malha.
    const { mesh } = montar(haru.appearance, 'ultra');
    let n = 0;
    varrer(mesh, Finish.Hair, (x, y, z) => {
      if (z > 0.1 && y > 0.7 && Math.abs(x) < 0.15) n += 1;
    });
    expect(n).toBeGreaterThan(100);
  });

  it('a franja para acima do olho, e não em cima dele', () => {
    // `FACE.eyeY` põe o olho em `cy + 0,12R`. Um rosto sem testa não
    // tem onde pôr a sobrancelha — foi a lição da franja da calota
    // base, que descia até a linha dos olhos e teve de subir.
    const { mesh } = montar(haru.appearance, 'ultra');
    let maisBaixa = Infinity;
    varrer(mesh, Finish.Hair, (x, y, z) => {
      if (z < 0.1 || Math.abs(x) > 0.15 || y < 0.6) return;
      maisBaixa = Math.min(maisBaixa, y);
    });
    // O crânio tem o topo em 0,9265 e o centro em 0,700; o olho cai
    // em 0,721. Medido: 0,745.
    expect(maisBaixa).toBeGreaterThan(0.73);
  });

  it('o relevo dos filamentos não deforma o crânio', () => {
    // A cabeça da Akemi saiu **amassada** num marco anterior, e a
    // causa é que `feature()` não sabe o que é cabelo: empurra todo
    // vértice ao alcance, e alcance é três vezes o raio da bolha.
    // A `fibra` herdou o guarda que resolveu aquilo — um elipsoide de
    // `1,05·R × 1,12·R × 1,15·R` em volta do crânio, e toda bolha que
    // caia dentro dele é descartada.
    //
    // O gabarito é o `rabo`, que não chama `feature()` nenhuma vez.
    const dela = montar({ ...haru.appearance, hairStyle: 'fibra' }, 'ultra').mesh;
    const gabarito = montar({ ...haru.appearance, hairStyle: 'rabo' }, 'ultra').mesh;
    const pa = dela.geometry.getAttribute('position');
    const pb = gabarito.geometry.getAttribute('position');
    const fa = dela.geometry.getAttribute('aFinish');
    let pior = 0;
    const lim = Math.min(pa.count, pb.count);
    for (let i = 0; i < lim; i += 1) {
      if (Math.round(fa.getX(i)) !== Finish.Skin) continue;
      if (pb.getY(i) < 0.55) continue;
      pior = Math.max(pior, Math.hypot(pa.getX(i) - pb.getX(i), pa.getY(i) - pb.getY(i), pa.getZ(i) - pb.getZ(i)));
    }
    expect(pior).toBeLessThan(0.002);
  });
});

describe('Haru 2.0 — o traje e o emblema do infinito', () => {
  it('o emblema fica à frente do pano, e não enterrado nele', () => {
    // No marco da Akemi o laço foi parar atrás da superfície: existia,
    // custava triângulos e não aparecia. Medido aqui: o pano do peito
    // chega a `z = 0,1026` nessa altura e o emblema a `0,1060`.
    const { mesh } = montar(haru.appearance, 'ultra');
    let emblema = -Infinity;
    let pano = -Infinity;
    const n = varrer(mesh, Finish.Holo, (x, y, z) => {
      if (y < 0.33 || y > 0.375 || Math.abs(x) > 0.05) return;
      emblema = Math.max(emblema, z);
    });
    varrer(mesh, Finish.Cloth, (x, y, z) => {
      if (y < 0.33 || y > 0.375 || Math.abs(x) > 0.05) return;
      pano = Math.max(pano, z);
    });
    expect(n).toBeGreaterThan(0);
    expect(emblema).toBeGreaterThan(pano);
  });

  it('o símbolo são dois aros — o infinito, não uma peça de quebra-cabeça', () => {
    // A Haru é a primeira deusa autista do Panteão. O infinito é o
    // símbolo que a comunidade autista endossa; a peça de
    // quebra-cabeça é rejeitada por boa parte dela, por associação
    // histórica a campanhas de \"cura\". O Criador pediu os dois
    // caminhos — peça funcional digna **e** símbolo — e esta é a
    // metade do símbolo.
    //
    // Dois aros, um de cada lado do esterno, em contagem igual.
    const { mesh } = montar(haru.appearance, 'ultra');
    let esq = 0;
    let dir = 0;
    varrer(mesh, Finish.Holo, (x, y) => {
      if (y < 0.33 || y > 0.375 || Math.abs(x) > 0.05) return;
      if (x < 0) esq += 1;
      else dir += 1;
    });
    expect(esq).toBeGreaterThan(0);
    expect(esq).toBe(dir);
  });

  it('os traços de circuito do peito são assimétricos, para não lerem como rosto', () => {
    // O defeito da primeira rodada de capturas, e o mais caro: um par
    // simétrico de traços em volta do emblema desenhou uma carinha no
    // peito. Os dois aros viraram olhos e o degrau horizontal virou
    // boca. A trilha passou a correr de um lado só.
    const { mesh } = montar(haru.appearance, 'ultra');
    let esq = 0;
    let dir = 0;
    varrer(mesh, Finish.Holo, (x, y, z) => {
      if (y < 0.15 || y > 0.33 || z < 0.06 || Math.abs(x) > 0.13) return;
      if (x < 0) esq += 1;
      else dir += 1;
    });
    expect(esq).toBeGreaterThan(0);
    expect(esq).toBeGreaterThan(dir * 5);
  });

  it('não há placa atravessando o peito de ombro a ombro', () => {
    // A segunda leitura errada da bancada: uma placa prateada no peito
    // leu como babador. Sobraram as ombreiras, que são duas e ficam
    // **nos ombros**, com o meio do peito livre.
    const { mesh } = montar(haru.appearance, 'ultra');
    let noMeio = 0;
    varrer(mesh, Finish.Shine, (x, y) => {
      if (y < 0.3 || y > 0.39 || Math.abs(x) > 0.08) return;
      noMeio += 1;
    });
    expect(noMeio).toBe(0);
  });

  it('o traje é pano, e a luz entra peça a peça', () => {
    // Lição paga caro no marco da Akemi: pôr o traje inteiro num
    // acabamento especial marcou a perna toda, porque
    // `subdivideProfile` descarta o acabamento e trava o anel na
    // estação mais próxima — a coxa nua renderizava envernizada.
    const { mesh } = montar(haru.appearance, 'ultra');
    let acesoNaCoxa = 0;
    varrer(mesh, Finish.Holo, (x, y, z) => {
      if (y > -0.55 && y < -0.42 && Math.hypot(x, z) < 0.09) acesoNaCoxa += 1;
    });
    expect(acesoNaCoxa).toBe(0);
  });
});

describe('Haru 2.0 — os abafadores e o visor', () => {
  it('os abafadores existem dos dois lados, na orelha medida', () => {
    // A peça funcional digna que o Criador pediu junto com o símbolo.
    // Medido na malha: a orelha está em `|x| = 0,1804`, `y = 0,682`.
    // A concha fica um pouco por fora disso, senão nasce dentro do
    // crânio em vez de cobrir a orelha.
    const { mesh } = montar(haru.appearance, 'ultra');
    let esq = 0;
    let dir = 0;
    varrer(mesh, Finish.Shine, (x, y) => {
      if (y < 0.64 || y > 0.8 || Math.abs(x) < 0.17) return;
      if (x < 0) esq += 1;
      else dir += 1;
    });
    expect(esq).toBeGreaterThan(0);
    expect(dir).toBeGreaterThan(0);
  });

  it('o arco liga as conchas por cima e não cruza o rosto', () => {
    // O defeito da quarta rodada: o arco foi girado 90° em Y, caiu no
    // plano da nuca e da testa e atravessou o rosto acima dos olhos
    // como uma monocelha escura. Meia volta no plano das duas
    // orelhas, e as pontas caem exatamente onde as conchas estão.
    const { mesh } = montar(haru.appearance, 'ultra');
    let naFrenteDoRosto = 0;
    let porCima = 0;
    varrer(mesh, Finish.Cloth, (x, y, z) => {
      if (y < 0.72) return;
      if (Math.abs(x) < 0.06 && z > 0.05) naFrenteDoRosto += 1;
      if (Math.abs(x) < 0.06 && y > 0.85) porCima += 1;
    });
    expect(naFrenteDoRosto).toBe(0);
    expect(porCima).toBeGreaterThan(0);
  });

  it('o visor fica de um lado só, à frente do rosto e na linha do olho', () => {
    // Substitui os óculos redondos, a pedido do Criador e seguindo a
    // arte. Medido: a frente do rosto na linha dos olhos está em
    // `z ≈ 0,173` e o nariz avança até `0,208`; a lâmina sai em
    // `0,207`. A primeira versão a pôs 2 cm acima e ela cobriu a
    // sobrancelha em vez da vista.
    const { mesh } = montar(haru.appearance, 'ultra');
    let minX = Infinity;
    let maxZ = -Infinity;
    let somaY = 0;
    const n = varrer(mesh, Finish.Holo, (x, y, z) => {
      if (y < 0.7 || z < 0.15) return;
      minX = Math.min(minX, x);
      maxZ = Math.max(maxZ, z);
      somaY += y;
    });
    expect(n).toBeGreaterThan(0);
    // Nada do visor atravessa para o outro lado do nariz.
    expect(minX).toBeGreaterThan(0);
    expect(maxZ).toBeGreaterThan(0.19);
  });

  it('abafadores e visor somem no LOD de longe', () => {
    // É este corte que paga o marco. O acessório `oculos` que ela
    // usava custava 524 triângulos e **não cortava nada** — aparecia
    // inteiro mesmo a cinquenta metros.
    const naCabeca = (nivel: keyof typeof BODY_DETAIL): number => {
      let n = 0;
      varrer(montar(haru.appearance, nivel).mesh, Finish.Shine, (_x, y) => {
        if (y > 0.6) n += 1;
      });
      return n;
    };
    expect(naCabeca('baixa')).toBe(0);
    expect(naCabeca('media')).toBeGreaterThan(0);
  });

  it('nada disso aparece em quem não usa o penteado dela', () => {
    // Se um dia alguém mover os abafadores para `accessory`, este caso
    // cai — e tem de cair, porque o campo é um só e os acessórios são
    // herdados pelos habitantes.
    const comFibra = montar({ ...haru.appearance, hairStyle: 'fibra' }, 'ultra').mesh;
    const semFibra = montar({ ...haru.appearance, hairStyle: 'curto' }, 'ultra').mesh;
    const contar = (mesh: THREE.SkinnedMesh): number => {
      let n = 0;
      varrer(mesh, Finish.Shine, (_x, y) => {
        if (y > 0.6) n += 1;
      });
      return n;
    };
    expect(contar(comFibra)).toBeGreaterThan(0);
    expect(contar(semFibra)).toBe(0);
  });
});
