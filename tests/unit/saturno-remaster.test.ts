// @vitest-environment happy-dom
/**
 * Remaster 2.0 da Saturno — e a prova de que o resto do Éden não mudou.
 *
 * A Saturno é a **Defensora dos Animais** e a primeira filha de Adão
 * e Eva. O marco dela trouxe um penteado exclusivo (`silvestre`), um
 * traje exclusivo (`guardia`), uma galhada de vidro que nasce dentro
 * do penteado e o emblema de pata da Casa EdenPawl no peito.
 *
 * Dois achados da investigação moldaram tudo o que se testa aqui, e
 * nenhum dos dois estava no briefing:
 *
 *  · **a Maze já é a "Deusa da Natureza"**, com paleta verde
 *    (`#9df0b0`/`#1fae6b`), penteado `longo`, `vestido` e acessório
 *    `flor`, e ainda não foi remasterizada. Uma Saturno coberta de
 *    folhagem verde teria tomado o território dela antes de a Maze
 *    ter vez. A divisão que este arquivo guarda: **o eixo da Saturno
 *    é ANIMAL** — galhada, pata, ouro — e o verde entra só como
 *    **vidro**, material, nunca como o pano da peça;
 *  · **a Saturno já estourava o orçamento** antes de qualquer linha
 *    nova: 7 630 triângulos no LOD baixo contra um teto de 7 145,6.
 *    A culpa era de duas peças compartilhadas que nunca cortaram por
 *    distância — o acessório `flor` (912) e o penteado `cacheado`
 *    (1 170). Trocar as duas por peças próprias que cortam por LOD
 *    derrubou o número para 6 244.
 *
 * Vários casos nasceram de defeitos que a bancada mostrou durante o
 * marco, e é por isso que os números são tão específicos:
 *
 *  · a galhada foi posicionada por ângulo e comprimento e saiu
 *    **flutuando acima da cabeça** — a base caía em `x = 0,134` numa
 *    altura onde o crânio mede `0,105` de raio;
 *  · as folhas da barra foram calculadas pelo perfil de controle de
 *    `buildSkirt`, que diz `hipWidth · 1,22 = 0,193`. A saia que sai
 *    do forno mede **0,41**: as folhas ficaram enterradas dentro do
 *    pano, invisíveis e pagas. É o mesmo erro do laço da Akemi;
 *  · a saia saiu com o verde-limão da ficha e a figura virou uma
 *    deusa-da-vegetação genérica, que é o que o briefing proíbe;
 *  · o manto de folhas foi parar nas costas e sumiu da vista
 *    frontal; depois virou ombreira; só fechou como **gola**, anel
 *    completo na linha do pescoço;
 *  · as folhas viraram fitas compridas do cós à barra e a figura leu
 *    como poste listrado de carnaval.
 *
 * O perigo de fundo é o mesmo de sempre: `cacheado` é penteado que
 * os habitantes herdam **e** é o da Júpiter; `casual` é traje de
 * habitante; `flor` é acessório de habitante **e** é o da Maze. Os
 * três campos da ficha antiga eram compartilhados. Há caso para cada
 * um.
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

const saturno = getCharacter('saturno')!;
const maze = getCharacter('maze')!;
const jupiter = getCharacter('jupiter')!;

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

/** Cor média de uma região, para distinguir pele de pano. */
function corMedia(
  mesh: THREE.SkinnedMesh,
  dentro: (x: number, y: number, z: number) => boolean,
): { r: number; g: number; b: number; n: number } {
  const pos = mesh.geometry.getAttribute('position');
  const col = mesh.geometry.getAttribute('color');
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (!dentro(pos.getX(i), pos.getY(i), pos.getZ(i))) continue;
    r += col.getX(i);
    g += col.getY(i);
    b += col.getZ(i);
    n += 1;
  }
  return { r: r / n, g: g / n, b: b / n, n };
}

describe('Saturno 2.0 — o que é exclusivo dela', () => {
  it('o penteado `silvestre` existe no catálogo e os habitantes não o herdam', () => {
    expect(HAIR_STYLES).toContain('silvestre');
    expect(CITIZEN_HAIR_STYLES).not.toContain('silvestre');
    // E o `cacheado` que ela usava continua de pé, intocado: é
    // penteado de habitante. **Reescrito no marco da Júpiter 2.0**:
    // ele também era o penteado dela, e deixou de ser. O catálogo é
    // que não podia perdê-lo, e não perdeu — a Júpiter é que saiu.
    expect(CITIZEN_HAIR_STYLES).toContain('cacheado');
    expect(jupiter.appearance.hairStyle).toBe('pincelada');
  });

  it('o traje `guardia` existe no catálogo e os habitantes não o herdam', () => {
    expect(OUTFITS).toContain('guardia');
    expect(CITIZEN_OUTFITS).not.toContain('guardia');
    // O `casual` que ela usava é traje de habitante e continua lá.
    expect(CITIZEN_OUTFITS).toContain('casual');
  });

  it('nenhum habitante sorteado sai de silvestre ou de guardia', () => {
    // Dois mil sorteios: se um deles escapasse, o mundo mudaria.
    const rng = createRng(20261112);
    for (let i = 0; i < 2000; i += 1) {
      const a = randomAppearance(rng);
      expect(a.hairStyle).not.toBe('silvestre');
      expect(a.outfit).not.toBe('guardia');
    }
  });

  it('`silvestre` e `guardia` sobrevivem ao saneamento', () => {
    const limpo = sanitizeAppearance({ ...DEFAULT_APPEARANCE, hairStyle: 'silvestre', outfit: 'guardia' });
    expect(limpo.hairStyle).toBe('silvestre');
    expect(limpo.outfit).toBe('guardia');
  });
});

describe('Saturno 2.0 — a ficha', () => {
  it('usa o penteado e o traje exclusivos, e nenhum acessório', () => {
    expect(saturno.appearance.hairStyle).toBe('silvestre');
    expect(saturno.appearance.outfit).toBe('guardia');
    // A galhada nasce **dentro** do penteado. Não é capricho:
    // `appearance.accessory` é um campo só, e `oculos`, `chapeu` e
    // `flor` são todos acessórios que os habitantes herdam. Pelo
    // caminho do acessório ela mexeria em gente sorteada pelo mundo
    // inteiro — e ainda tomaria a `flor` da Maze.
    expect(saturno.appearance.accessory).toBe('nenhum');
  });

  it('preserva a identidade canônica da ficha', () => {
    // O briefing manda elevar o acabamento, não trocar a personagem.
    // Aura, paleta, olhos, altura e título são quem ela é.
    //
    // A pele é a exceção, e foi pedida pelo Criador depois do PR
    // aberto: `#a96c45` → `#f3d2c1`. O tom novo sai do catálogo
    // canônico `SKIN_TONES`, não é inventado, e não é o `#ffe0c8` da
    // Akemi — duas deusas com a mesma pele exata encurtam o elenco.
    expect(saturno.aura).toBe(0xffd98a);
    expect(saturno.colors).toEqual(['#ffd98a', '#e08a2f']);
    expect(saturno.appearance.eyeColor).toBe('#c98a2b');
    expect(saturno.appearance.skin).toBe('#f3d2c1');
    expect(saturno.appearance.hairColor).toBe('#8a5a2b');
    expect(saturno.appearance.height).toBe(1.0);
    expect(saturno.title).toBe('Defensora dos Animais');
    expect(saturno.domain).toContain('Animais');
  });

  it('deixa a flor para a Maze, que é a Deusa da Natureza', () => {
    // Este é o caso que guarda o território. A Maze é verde, é a
    // Natureza, usa `flor` — e ainda não foi remasterizada. Se a
    // Saturno ficasse com a flor, a Maze chegaria ao marco dela sem
    // assinatura nenhuma.
    expect(maze.title).toBe('Deusa da Natureza');
    expect(saturno.appearance.accessory).not.toBe('flor');
    // A `flor` continua acessível aos habitantes, como sempre foi —
    // e desde o marco da Maze ela é **só** deles: a Maze trocou o
    // acessório por uma coroa dentro do próprio penteado.
    expect(CITIZEN_ACCESSORIES).toContain('flor');
  });

  it('a ficha da Júpiter sai do marco da Saturno intacta', () => {
    // **Reescrito no marco da Júpiter 2.0.** O que este caso guardava
    // era que o marco da Saturno não podia gastar o marco da Júpiter
    // sem briefing, e não gastou: quem mudou estes dois campos foi o
    // marco dela, com briefing próprio e decisão do Criador.
    //
    // O que continua valendo, e é o que importa aqui: a Saturno não
    // leva nada da Júpiter junto. As peças que a Júpiter deixou são
    // de habitante e seguem no catálogo.
    expect(jupiter.appearance.hairStyle).toBe('pincelada');
    expect(jupiter.appearance.outfit).toBe('lumen');
    expect(CITIZEN_HAIR_STYLES).toContain('cacheado');
    expect(CITIZEN_OUTFITS).toContain('vestido');
  });

  it('a ficha da Maze mudou no marco dela, e não neste', () => {
    // Esta asserção **foi reescrita** no marco da Maze 2.0, e a
    // reescrita é deliberada: a versão original deste arquivo fixava
    // a aparência inteira da Maze por `toEqual` com a justificativa
    // de que ela ainda não tinha sido remasterizada. Depois de
    // `Maze 2.0 — Remasterização Oficial` essa justificativa deixou
    // de valer, e manter os valores antigos aqui seria travar a
    // Maze no estado anterior a partir do arquivo de **outra**
    // deusa.
    //
    // O que este teste guarda continua sendo o mesmo de antes: que o
    // marco da Saturno não encoste na Maze. Por isso ele afirma o
    // estado **novo** e canônico dela, e qualquer mudança feita a
    // partir daqui volta a quebrar o teste, como deve.
    //
    // A etapa 1 do EdenWorld 2.0 acrescentou `sex` ao esquema da ficha,
    // com padrão `'fem'`. A Maze não mudou — o esquema ganhou um campo —,
    // e o literal abaixo passa a declará-lo para que a asserção continue
    // sendo um `toEqual` exato, e não um `toMatchObject` frouxo.
    //
    // A Fase 1.1 fez o mesmo com os quatro eixos de rosto, pela mesma
    // razão e com o mesmo cuidado: eles nascem em 1, que é o rosto que
    // a Maze sempre teve. Declará-los aqui mantém a asserção exata; o
    // dia em que algum deles sair de 1 nesta ficha, este teste quebra.
    expect(maze.appearance).toEqual({
      sex: 'fem',
      skin: '#7d4a2c',
      hairStyle: 'copa',
      hairColor: '#a8702f',
      eyeColor: '#2f9a66',
      outfit: 'jardim',
      topColor: '#eef9ef',
      bottomColor: '#2fa36a',
      shoeColor: '#f3ead6',
      accessory: 'nenhum',
      height: 1.03,
      faceEye: 1,
      faceEyeGap: 1,
      faceBrow: 1,
      faceMouth: 1,
    });
    // O que o marco da Maze **não** podia tocar, e não tocou.
    expect(maze.aura).toBe(0x7df0a8);
    expect(maze.colors).toEqual(['#9df0b0', '#1fae6b']);
  });

  it('a paleta dourada dela não encosta na paleta verde da Maze', () => {
    // Duas deusas de natureza no mesmo elenco só funcionam se a cor
    // separar as duas à distância.
    for (const c of saturno.colors) expect(maze.colors).not.toContain(c);
    const verde = (hex: string): boolean => {
      const c = new THREE.Color(hex);
      return c.g > c.r;
    };
    // A Maze é verde: o canal verde domina o vermelho nos dois tons.
    expect(maze.colors.every(verde)).toBe(true);
    // A Saturno é dourada: o vermelho domina, nos dois tons.
    expect(saturno.colors.some(verde)).toBe(false);
  });
});

describe('Saturno 2.0 — orçamento e chamadas de desenho', () => {
  it('cabe no teto do LOD baixo — e antes do marco não cabia', () => {
    const { mesh } = montar(saturno.appearance, 'baixa');
    // Medido antes do marco: 7 630, com o teto em 7 145,6. A ficha
    // antiga carregava `flor` (912 triângulos) e `cacheado` (1 170),
    // e nenhum dos dois cortava por distância. Hoje: 6 244.
    expect(triangles(mesh)).toBeLessThan(7145.6);
  });

  it('continua em três malhas, como todas as outras deusas', () => {
    const a = new Avatar({ ...saturno.appearance });
    // corpo, rosto e halo. Galhada, gola, pata e folhas são mescladas
    // no corpo: nenhuma peça nova paga chamada de desenho.
    expect(meshes(a)).toBe(3);
  });

  it('o custo cresce com o nível, e nunca encolhe', () => {
    const niveis: Array<keyof typeof BODY_DETAIL> = ['baixa', 'media', 'alta', 'ultra'];
    const custos = niveis.map((n) => triangles(montar(saturno.appearance, n).mesh));
    for (let i = 1; i < custos.length; i += 1) expect(custos[i]).toBeGreaterThan(custos[i - 1]);
  });

  it('todo o vidro some no LOD de longe', () => {
    // Galhada, gola e folhas são a conta inteira do marco, e a três
    // metros nenhuma delas chega a um pixel. É esse corte que paga a
    // troca: a `flor` e o `cacheado` antigos não cortavam nada.
    const vidro = (nivel: keyof typeof BODY_DETAIL): number =>
      varrer(montar(saturno.appearance, nivel).mesh, Finish.Glass, () => {});
    expect(vidro('baixa')).toBe(0);
    expect(vidro('media')).toBeGreaterThan(0);
    expect(vidro('ultra')).toBeGreaterThan(vidro('media'));
  });
});

describe('Saturno 2.0 — a galhada', () => {
  it('nasce dentro do couro cabeludo, e não flutuando acima da cabeça', () => {
    // O defeito que a primeira captura mostrou. `feature()` e as
    // peças posicionadas por ângulo não sabem onde a cabeça termina:
    // a base caiu em `x = 0,134` numa altura em que o crânio mede
    // `0,105` de raio, e a galhada apareceu solta no ar.
    const { mesh } = montar(saturno.appearance, 'ultra');
    let baseY = Infinity;
    let baseR = 0;
    varrer(mesh, Finish.Glass, (x, y, z) => {
      if (y < 0.7) return;
      if (y < baseY) {
        baseY = y;
        baseR = Math.hypot(x, z);
      }
    });
    expect(baseY).toBeLessThan(Infinity);
    // Raio do crânio naquela altura, com o centro em 0,700 e R = 0,176.
    const raioDoCranio = Math.sqrt(Math.max(0, 0.176 ** 2 - (baseY - 0.7) ** 2));
    expect(baseR).toBeLessThan(raioDoCranio);
  });

  it('ultrapassa o topo do cabelo, que é o que a torna silhueta', () => {
    const { mesh } = montar(saturno.appearance, 'ultra');
    let topoDoVidro = -Infinity;
    varrer(mesh, Finish.Glass, (_x, y) => {
      if (y > topoDoVidro) topoDoVidro = y;
    });
    let topoDoCabelo = -Infinity;
    varrer(mesh, Finish.Hair, (_x, y) => {
      if (y > topoDoCabelo) topoDoCabelo = y;
    });
    // Medido: 1,207 contra 0,929. Adereço que não passa do contorno
    // não conta silhueta nenhuma — foi a lição do haori da Akemi.
    expect(topoDoVidro).toBeGreaterThan(topoDoCabelo + 0.1);
  });

  it('é simétrica', () => {
    const { mesh } = montar(saturno.appearance, 'ultra');
    let soma = 0;
    varrer(mesh, Finish.Glass, (x, y) => {
      if (y > 0.7) soma += x;
    });
    expect(soma).toBeCloseTo(0, 6);
  });

  it('nasce do penteado, não do acessório', () => {
    // Se um dia alguém mover a galhada para `accessory`, este caso
    // cai — e tem de cair, porque o campo é um só e os acessórios
    // são herdados pelos habitantes.
    const comPenteado = varrer(montar({ ...saturno.appearance, outfit: 'vestido' }, 'ultra').mesh, Finish.Glass, () => {});
    const careca = varrer(
      montar({ ...saturno.appearance, outfit: 'vestido', hairStyle: 'careca' }, 'ultra').mesh,
      Finish.Glass,
      () => {},
    );
    expect(comPenteado).toBeGreaterThan(0);
    expect(careca).toBe(0);
  });
});

describe('Saturno 2.0 — o cabelo', () => {
  it('a queda desce bem abaixo da linha do ombro', () => {
    // Mais longa que a da Akemi, que para no ombro; mais curta que a
    // `cascata` da Suki, que vai à junta do quadril. Medido: 0,159,
    // com o ombro em 0,370.
    const { mesh } = montar(saturno.appearance, 'ultra');
    let maisBaixo = Infinity;
    varrer(mesh, Finish.Hair, (_x, y) => {
      if (y < maisBaixo) maisBaixo = y;
    });
    expect(maisBaixo).toBeLessThan(0.25);
  });

  it('não invade o corredor por onde o braço passa', () => {
    // A queda alargada da Lilly atravessou os braços em quatro
    // centímetros, e foi o mesmo acidente que matou o véu da Nexara.
    // O antebraço balança perto de `z = 0`; o cabelo cai atrás.
    const { mesh } = montar(saturno.appearance, 'ultra');
    let maisBaixoNoCorredor = Infinity;
    varrer(mesh, Finish.Hair, (x, y, z) => {
      if (Math.abs(z) > 0.06) return;
      if (Math.abs(x) < 0.13) return;
      if (y < maisBaixoNoCorredor) maisBaixoNoCorredor = y;
    });
    // Medido: 0,3115. Acima disso é o ombro, onde o cabelo se apoia.
    expect(maisBaixoNoCorredor).toBeGreaterThan(0.3);
  });

  it('o relevo das tranças não deforma o crânio', () => {
    // A cabeça da Akemi saiu **amassada** num marco anterior, e a
    // causa é que `feature()` não sabe o que é cabelo: empurra todo
    // vértice ao alcance, e alcance é três vezes o raio da bolha.
    // O `silvestre` herdou o guarda que resolveu aquilo — um
    // elipsoide de `1,05·R × 1,12·R × 1,15·R` em volta do crânio, e
    // toda bolha que caia dentro dele é descartada.
    //
    // O gabarito é o `rabo`, que não chama `feature()` nenhuma vez.
    // O crânio é construído antes do cabelo, então os vértices de
    // pele ocupam os mesmos índices nas duas construções.
    const dela = montar({ ...saturno.appearance, hairStyle: 'silvestre' }, 'ultra').mesh;
    const gabarito = montar({ ...saturno.appearance, hairStyle: 'rabo' }, 'ultra').mesh;
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
    // Medido: 0,695 mm. Num crânio de trinta e cinco centímetros de
    // largura isso é dois décimos de por cento.
    expect(pior).toBeLessThan(0.002);
  });

  it('o relevo das tranças de fato desloca a superfície', () => {
    // O outro lado da moeda: no marco da Akemi metade das bolhas caiu
    // no ar, longe de qualquer vértice, e o cabelo renderizou liso
    // feito capacete. Se o relevo voltar a errar o alvo, as duas
    // malhas convergem e este caso cai.
    const assinatura = (mesh: THREE.SkinnedMesh): number => {
      const arr = mesh.geometry.getAttribute('position').array as ArrayLike<number>;
      let soma = 0;
      for (let i = 0; i < arr.length; i += 1) soma = (soma * 31 + Math.round(arr[i] * 1e5)) | 0;
      return soma;
    };
    const comRelevo = assinatura(montar({ ...saturno.appearance, hairStyle: 'silvestre' }, 'ultra').mesh);
    const semRelevo = assinatura(montar({ ...saturno.appearance, hairStyle: 'longo' }, 'ultra').mesh);
    expect(comRelevo).not.toBe(semRelevo);
  });
});

describe('Saturno 2.0 — o traje', () => {
  it('o emblema de pata fica à frente do peito, e não dentro dele', () => {
    // Medido na malha: a frente do torso chega a `z ≈ 0,111` nessa
    // altura. No marco da Akemi o laço foi parar em 0,082 e ficou
    // enterrado dentro do tronco — existia, custava triângulos e não
    // aparecia.
    const { mesh } = montar(saturno.appearance, 'ultra');
    let n = 0;
    let maxZ = -Infinity;
    n = varrer(mesh, Finish.Holo, (_x, y, z) => {
      if (y < 0.25 || y > 0.4) return;
      if (z > maxZ) maxZ = z;
    });
    expect(n).toBeGreaterThan(0);
    expect(maxZ).toBeGreaterThan(0.113);
  });

  it('as folhas da barra ficam por fora da saia, e passam dela', () => {
    // O erro mais caro do marco. `buildSkirt` escreve um perfil de
    // controle cuja barra vale `hipWidth · 1,22 = 0,193`, mas a saia
    // que sai do forno mede **0,41** — a varredura e a zona de
    // morfologia abrem muito mais que o perfil sugere. A primeira
    // versão pôs as folhas em 0,205 e enterrou todas.
    const { mesh } = montar(saturno.appearance, 'ultra');
    let raio = 0;
    let maisBaixa = Infinity;
    varrer(mesh, Finish.Glass, (x, y, z) => {
      if (y > -0.25) return;
      raio = Math.max(raio, Math.hypot(x, z));
      maisBaixa = Math.min(maisBaixa, y);
    });
    // A saia mede 0,4118 de raio na barra, em y = −0,46.
    expect(raio).toBeGreaterThan(0.4118);
    expect(maisBaixa).toBeLessThan(-0.46);
  });

  it('a gola de folhas fecha o anel, à frente e atrás', () => {
    // Duas placas soltas na frente do peito não são uma gola — foi a
    // lição do marco da Lilly, e a primeira versão desta peça repetiu
    // o erro ao contrário, pondo tudo atrás.
    const { mesh } = montar(saturno.appearance, 'ultra');
    let frente = 0;
    let costas = 0;
    varrer(mesh, Finish.Glass, (_x, y, z) => {
      if (y < 0.36 || y > 0.5) return;
      if (z > 0.03) frente += 1;
      else if (z < -0.03) costas += 1;
    });
    expect(frente).toBeGreaterThan(0);
    expect(costas).toBeGreaterThan(0);
  });

  it('a túnica é pano, e o vidro só aparece peça a peça', () => {
    // Lição paga caro no marco da Akemi: pôr o traje inteiro em
    // `Finish.Glass` marcou a perna toda como vidro, porque
    // `subdivideProfile` descarta o acabamento e trava o anel na
    // estação mais próxima — a coxa nua renderizava envernizada.
    const { mesh } = montar(saturno.appearance, 'ultra');
    let vidroNoTronco = 0;
    varrer(mesh, Finish.Glass, (x, y, z) => {
      if (y > 0.15 && y < 0.35 && Math.hypot(x, z) < 0.16) vidroNoTronco += 1;
    });
    expect(vidroNoTronco).toBe(0);
  });

  it('os braços ficam nus, como nos outros trajes sem manga', () => {
    // Ela é a única deusa que trabalha com as mãos — resgata bicho —
    // e manga comprida esconderia justamente isso.
    //
    // A medição é por **cor**, não por `aFinish`: `subdivideProfile`
    // descarta o acabamento e a pele nua sai marcada como `Cloth` em
    // todo o elenco (veja o caso do defeito preexistente abaixo).
    const noBraco = (x: number, y: number): boolean => Math.abs(x) > 0.16 && Math.abs(x) < 0.3 && y > 0.05 && y < 0.35;
    const dela = corMedia(montar(saturno.appearance, 'ultra').mesh, noBraco);
    const semManga = corMedia(montar({ ...saturno.appearance, outfit: 'vestido' }, 'ultra').mesh, noBraco);
    const comManga = corMedia(montar({ ...saturno.appearance, outfit: 'aero' }, 'ultra').mesh, noBraco);
    expect(dela.n).toBeGreaterThan(0);
    // A comparação é **relativa**, e de propósito: a média cai sobre
    // uma caixa, e a caixa apanha de raspão umas poucas folhas da
    // gola, o que desloca o número em alguns milésimos. O que importa
    // é a ordem de grandeza — o braço dela está colado no braço nu e
    // longe do braço vestido.
    const distanciaDoNu = Math.hypot(dela.r - semManga.r, dela.g - semManga.g, dela.b - semManga.b);
    const distanciaDoVestido = Math.hypot(dela.r - comManga.r, dela.g - comManga.g, dela.b - comManga.b);
    expect(distanciaDoNu).toBeLessThan(0.02);
    expect(distanciaDoVestido).toBeGreaterThan(distanciaDoNu * 5);
  });
});

describe('Saturno 2.0 — defeito preexistente, medido e não mascarado', () => {
  it('a pele nua sai marcada como pano em todos os trajes, não só no dela', () => {
    // `subdivideProfile` descarta o campo `finish` das estações e
    // trava o anel inteiro num valor só. O resultado é que braço e
    // perna nus renderizam com o acabamento de pano em todo o Éden.
    //
    // Isto **não** é da Saturno e não foi introduzido por este marco:
    // o número é idêntico em `vestido`, `praia`, `casual`,
    // `esportivo` e `guardia`. O caso existe para que o defeito fique
    // registrado e para que, no dia em que alguém consertar
    // `subdivideProfile`, esta expectativa caia e aponte o lugar.
    const naPanturrilha = (x: number, y: number, z: number): boolean =>
      y > -0.8 && y < -0.5 && Math.hypot(x, z) < 0.2;
    const contar = (outfit: (typeof OUTFITS)[number]): { pele: number; pano: number } => {
      const mesh = montar({ ...saturno.appearance, outfit }, 'ultra').mesh;
      let pele = 0;
      let pano = 0;
      varrer(mesh, Finish.Skin, (x, y, z) => {
        if (naPanturrilha(x, y, z)) pele += 1;
      });
      varrer(mesh, Finish.Cloth, (x, y, z) => {
        if (naPanturrilha(x, y, z)) pano += 1;
      });
      return { pele, pano };
    };
    const dela = contar('guardia');
    expect(dela.pele).toBe(0);
    expect(dela.pano).toBeGreaterThan(0);
    for (const outro of ['vestido', 'praia', 'casual', 'esportivo'] as const) {
      // Exatamente o mesmo número: o defeito é da engine, não do traje.
      expect(contar(outro)).toEqual(dela);
    }
  });
});
