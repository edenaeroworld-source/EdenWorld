// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Avatar } from '../../src/player/Avatar';
import {
  OFFICIAL_IDS,
  createOfficialAvatar,
  officialAppearance,
  officialCosmic,
  officialFingerprint,
  officialProportions,
  officialShape,
} from '../../src/characters/CharacterModels';
import { COSMOS_MASK, cosmosFragmentGLSL } from '../../src/player/body/BodyCosmos';
import { Finish } from '../../src/player/body/BodyRig';
import { FINISH_EMISSIVE } from '../../src/player/body/BodyFinish';
import { SHAPE_MASC } from '../../src/player/body/BodyShape';
import { makeCitizen } from '../../src/npc/CitizenData';
import { proportionsFor } from '../../src/player/body/BodyProportions';

/**
 * Etapa 3, bloco C3 — o campo cósmico procedural.
 *
 * O efeito é de um personagem só, e esta suíte existe sobretudo para
 * provar que ele **não escapa**. A Etapa 1 ensinou a lição do Éden: a
 * lista de exclusão existia e ninguém a lia, e trinta e quatro de
 * cinquenta e quatro habitantes acordaram com cabelo de deusa.
 *
 * Aqui o isolamento tem dois cadeados, e os dois são testados:
 *
 * 1. **o programa** — o GLSL do campo só é injetado no material de
 *    quem tem o sinalizador, e a chave de cache muda junto. Quem não
 *    é o Criador não roda um desvio a mais: o código não existe no
 *    shader dele;
 * 2. **o uniforme** — `uCosmos` nasce zero em todo avatar, de modo
 *    que um bloco injetado por engano continuaria desligado.
 *
 * ## Limite deste ambiente
 *
 * Não há navegador nem GPU aqui: **nada abaixo compila GLSL de
 * verdade e nada compara pixels**. O que estes casos provam é o que
 * dá para provar sem placa — qual programa cada avatar recebe, o que
 * está escrito nele, e se o texto é estruturalmente são. A conferência
 * visual é manual, na prévia da porta 5173.
 */

/** Monta o shader como o Three.js montaria, com os chunks de verdade. */
function compilar(avatar: Avatar): { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string } {
  const material = (avatar as unknown as { material: THREE.Material }).material;
  const base = THREE.ShaderLib.physical;
  const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader };
  (material as unknown as { onBeforeCompile: (s: typeof shader, r: unknown) => void }).onBeforeCompile(shader, {});
  return shader;
}

function chave(avatar: Avatar): string {
  const material = (avatar as unknown as { material: { customProgramCacheKey: () => string } }).material;
  return material.customProgramCacheKey();
}

function corpo(avatar: Avatar): THREE.SkinnedMesh {
  return (avatar as unknown as { body: THREE.SkinnedMesh }).body;
}

/** Tudo o que o campo cósmico escreve no shader, para busca negativa. */
const MARCAS_COSMICAS = ['uCosmos', 'uCosmosTime', 'vBind', 'edenCosmosField', 'edenCosmosMask', 'edenStarGlow', 'edenHash13', 'edenFbm3', 'edenValue3'];

describe('C3 — a seleção é por identidade, não por aparência', () => {
  it('só o Aérion é cósmico no panteão', () => {
    expect(officialCosmic('aerion')).toBe(true);
    for (const id of OFFICIAL_IDS) {
      if (id === 'aerion') continue;
      expect(officialCosmic(id), `${id} não pode ser cósmico`).toBe(false);
    }
    expect(officialCosmic('ninguem')).toBe(false);
  });

  it('o avatar oficial do Aérion nasce com o campo aceso', () => {
    const aerion = createOfficialAvatar('aerion')!;
    expect(aerion.cosmos).toBe(true);
    expect(compilar(aerion).uniforms.uCosmos.value).toBe(1);
  });

  it('parecer o Criador não é ser o Criador', () => {
    // O caso mais importante desta suíte. Um avatar montado à mão com
    // a ficha inteira do Aérion — mesma aparência, mesmas proporções,
    // mesma silhueta masculina, portanto cabelo `cosmos`, traje
    // `criador` e o corpo todo em `Finish.Cosmos` — **continua sem
    // campo**. O efeito não se deduz de nada do que se vê: vem do id.
    const sosia = new Avatar(officialAppearance('aerion')!, officialProportions('aerion')!, SHAPE_MASC);
    expect(sosia.cosmos).toBe(false);
    const s = compilar(sosia);
    expect(s.uniforms.uCosmos.value).toBe(0);
    for (const marca of MARCAS_COSMICAS) {
      expect(s.fragmentShader, `${marca} não pode estar no shader de um sósia`).not.toContain(marca);
    }
  });

  it('o avatar padrão do jogador nasce com o uniforme em zero', () => {
    const jogador = new Avatar();
    expect(jogador.cosmos).toBe(false);
    expect(compilar(jogador).uniforms.uCosmos.value).toBe(0);
  });

  it('nenhuma das dez deusas recebe o campo', () => {
    for (const id of OFFICIAL_IDS) {
      if (id === 'aerion') continue;
      const deusa = createOfficialAvatar(id)!;
      expect(deusa.cosmos, id).toBe(false);
      const s = compilar(deusa);
      expect(s.uniforms.uCosmos.value, id).toBe(0);
      expect(s.fragmentShader, id).not.toContain('Cosmos');
    }
  });

  it('nenhum habitante de Aurora City recebe o campo', () => {
    for (let i = 1; i <= 54; i += 1) {
      const c = makeCitizen(i);
      const morador = new Avatar(c.appearance, proportionsFor(`cidadao:${c.seed}`, c.appearance.height));
      expect(morador.cosmos, `habitante ${i}`).toBe(false);
      if (i > 4) continue; // o shader é o mesmo para todos; bastam alguns
      const s = compilar(morador);
      expect(s.uniforms.uCosmos.value, `habitante ${i}`).toBe(0);
      for (const marca of MARCAS_COSMICAS) expect(s.fragmentShader, `habitante ${i} / ${marca}`).not.toContain(marca);
    }
  });
});

describe('C3 — o programa do Criador', () => {
  it('traz o campo, a varying e os dois uniformes', () => {
    const s = compilar(createOfficialAvatar('aerion')!);
    for (const marca of MARCAS_COSMICAS) expect(s.fragmentShader, marca).toContain(marca);
    expect(s.vertexShader).toContain('varying vec3 vBind;');
    expect(s.uniforms.uCosmosTime.value).toBe(0);
  });

  it('a varying carrega a pose de ligação, não a deformada', () => {
    // `position` é o atributo cru: o campo fica pintado no corpo e
    // não escorre quando o braço sobe nem quando o AfterBust® muda a
    // silhueta. Se um dia alguém trocar por `transformed`, a galáxia
    // passa a nadar — e este caso cai.
    const s = compilar(createOfficialAvatar('aerion')!);
    expect(s.vertexShader).toContain('vBind = position;');
    expect(s.vertexShader).not.toContain('vBind = transformed');
  });

  it('o campo entra no albedo antes da emissão, e a estrela acende', () => {
    const s = compilar(createOfficialAvatar('aerion')!);
    const campo = s.fragmentShader.indexOf('edenCosmosField( vBind');
    const emissao = s.fragmentShader.indexOf('totalEmissiveRadiance +=');
    expect(campo).toBeGreaterThan(0);
    expect(emissao).toBeGreaterThan(campo);
    expect(s.fragmentShader).toContain('+ edenStarGlow;');
  });

  it('a máscara acende um acabamento só', () => {
    expect(COSMOS_MASK).toHaveLength(Object.keys(Finish).length);
    COSMOS_MASK.forEach((peso, i) => {
      expect(peso, `acabamento ${i}`).toBe(i === Finish.Cosmos ? 1 : 0);
    });
    // E o olho continua molhado: é `Finish.Eye`, peso zero.
    expect(COSMOS_MASK[Finish.Eye]).toBe(0);
  });

  it('a máscara apaga por omissão, e esse padrão vem da tabela', () => {
    // O ramo de reserva de `edenCosmosMask` é inalcançável com
    // acabamento válido — e foi por isso que um mutante que o
    // acendia sobreviveu à primeira rodada. A resposta não foi
    // testar o inalcançável: foi tirar o literal de lá. O padrão
    // agora é gerado da tabela, e é isto que este caso guarda.
    const fonte = cosmosFragmentGLSL();
    const corpoDaMascara = fonte.slice(fonte.indexOf('float edenCosmosMask'), fonte.indexOf('float edenHash13'));
    expect(corpoDaMascara).toContain(`: ${COSMOS_MASK[0].toFixed(1)};`);
    expect(corpoDaMascara).not.toContain(': 1.0;');
  });

  it('a chave de cache separa os quatro programas possíveis', () => {
    // Sem isto o Three.js serviria o programa guardado: o segundo
    // avatar a compilar receberia o shader do primeiro, e o Criador
    // sairia sem galáxia — ou um habitante sairia com uma.
    const aerion = createOfficialAvatar('aerion')!;
    const luma = createOfficialAvatar('luma')!;
    const chaves = new Set<string>();
    for (const avatar of [aerion, luma]) {
      for (const fisico of [true, false]) {
        avatar.setMaterialTier(fisico);
        chaves.add(chave(avatar));
      }
    }
    expect(chaves.size).toBe(4);
    expect([...chaves].filter((k) => k.includes('cosmos'))).toHaveLength(2);
  });

  it('o campo roda enxuto na máquina fraca', () => {
    // O degrau não é um botão novo: é o mesmo `setMaterialTier` que
    // já separa o material físico do simples, movido pelo nível
    // gráfico. Quem roda em `media` ou `baixa` paga 20 picadas de
    // ruído por fragmento em vez de 36.
    const medir = (fisico: boolean) => {
      const av = createOfficialAvatar('aerion')!;
      av.setMaterialTier(fisico);
      const f = compilar(av).fragmentShader;
      const bloco = f.slice(f.indexOf('float edenCosmosMask'), f.indexOf('void main', f.indexOf('float edenCosmosMask')));
      const oitavas = Number(/i < (\d)/.exec(bloco)?.[1]);
      const dobra = bloco.includes('float warp');
      return { oitavas, dobra, picadas: (dobra ? 8 : 0) + oitavas * 8 + 4, temCampo: bloco.includes('edenCosmosField') };
    };
    const rico = medir(true);
    const enxuto = medir(false);
    expect(rico.temCampo).toBe(true);
    expect(enxuto.temCampo).toBe(true);
    expect(rico.picadas).toBe(36);
    expect(enxuto.picadas).toBe(20);
    expect(enxuto.picadas).toBeLessThan(rico.picadas);
    // E o que some é a borda da nebulosa, não a identidade: as
    // estrelas, os braços de galáxia e os fluxos continuam nos dois.
    for (const nivel of [rico, enxuto]) expect(nivel.oitavas).toBeGreaterThanOrEqual(2);
  });

  it('o material de profundidade não ganhou nada', () => {
    // A sombra não precisa de galáxia, e pagar por ela no passe de
    // profundidade seria pagar duas vezes pelo mesmo personagem.
    const aerion = createOfficialAvatar('aerion')!;
    const depth = (aerion as unknown as { depthMaterial: THREE.Material }).depthMaterial;
    const base = THREE.ShaderLib.standard;
    const s = { uniforms: {} as Record<string, unknown>, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader };
    (depth as unknown as { onBeforeCompile: (x: typeof s) => void }).onBeforeCompile(s);
    for (const marca of MARCAS_COSMICAS) expect(s.vertexShader, marca).not.toContain(marca);
    expect(s.uniforms.uCosmos).toBeUndefined();
  });
});

describe('C3 — o GLSL é estruturalmente são', () => {
  // Não há GPU neste ambiente: ninguém aqui compila o shader. Um erro
  // de digitação não apareceria como falha, e sim como tela preta no
  // navegador do Criador. Este caso é o substituto possível —
  // delimitadores equilibrados, nenhuma função `eden*` chamada sem
  // existir, e nenhuma usada antes de ser declarada (GLSL exige
  // declaração anterior ao uso).
  const analisar = (fonte: string) => {
    const limpo = fonte
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .replace(/^\s*#.*$/gm, ' ');
    let chaves = 0;
    let parens = 0;
    let fundo = 0;
    for (const c of limpo) {
      if (c === '{') chaves += 1;
      if (c === '}') {
        chaves -= 1;
        fundo = Math.min(fundo, chaves);
      }
      if (c === '(') parens += 1;
      if (c === ')') parens -= 1;
    }
    const definidas = new Map<string, number>();
    const reDef = /\b(?:float|vec2|vec3|vec4|ivec[234]|bvec[234]|bool|int|void|mat[234])\s+(eden\w*)\s*\(/g;
    for (let m = reDef.exec(limpo); m; m = reDef.exec(limpo)) if (!definidas.has(m[1])) definidas.set(m[1], m.index);
    const ausentes: string[] = [];
    const foraDeOrdem: string[] = [];
    const reUso = /\b(eden\w*)\s*\(/g;
    for (let m = reUso.exec(limpo); m; m = reUso.exec(limpo)) {
      const nome = m[1];
      if (!definidas.has(nome)) ausentes.push(nome);
      else if (m.index < definidas.get(nome)!) foraDeOrdem.push(nome);
    }
    return { chaves, parens, fundo, definidas: [...definidas.keys()], ausentes, foraDeOrdem };
  };

  it('o fragmento do Criador fecha o que abre e define o que chama', () => {
    const s = compilar(createOfficialAvatar('aerion')!);
    const f = analisar(s.fragmentShader);
    expect(f.chaves, 'chaves desequilibradas').toBe(0);
    expect(f.parens, 'parênteses desequilibrados').toBe(0);
    expect(f.fundo, 'fechou uma chave que não estava aberta').toBe(0);
    expect(f.ausentes, 'função eden* chamada sem existir').toEqual([]);
    expect(f.foraDeOrdem, 'função eden* usada antes de ser declarada').toEqual([]);
    expect(f.definidas).toContain('edenCosmosField');
    expect(f.definidas).toContain('edenHash13');
  });

  it('o vértice do Criador também', () => {
    const v = analisar(compilar(createOfficialAvatar('aerion')!).vertexShader);
    expect(v.chaves).toBe(0);
    expect(v.parens).toBe(0);
    expect(v.ausentes).toEqual([]);
    expect(v.foraDeOrdem).toEqual([]);
  });

  it('e o programa de quem não é cósmico continua são', () => {
    const f = analisar(compilar(createOfficialAvatar('maze')!).fragmentShader);
    expect(f.chaves).toBe(0);
    expect(f.parens).toBe(0);
    expect(f.ausentes).toEqual([]);
    expect(f.definidas).not.toContain('edenCosmosField');
  });
});

describe('C3 — o relógio do campo', () => {
  it('anda no Criador e não existe em mais ninguém', () => {
    const aerion = createOfficialAvatar('aerion')!;
    const luma = createOfficialAvatar('luma')!;
    expect(typeof corpo(aerion).onBeforeRender).toBe('function');
    // O `Object3D` nasce com um `onBeforeRender` vazio; o que importa
    // é que o de quem não é cósmico não mexa em uniforme nenhum.
    const antes = compilar(luma).uniforms.uCosmosTime.value;
    corpo(luma).onBeforeRender(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(compilar(luma).uniforms.uCosmosTime.value).toBe(antes);
  });

  it('começa em zero e avança', () => {
    const aerion = createOfficialAvatar('aerion')!;
    const relogio = () => compilar(aerion).uniforms.uCosmosTime.value as number;
    expect(relogio()).toBe(0);
    const desenhar = () =>
      corpo(aerion).onBeforeRender(
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
        undefined as never,
      );
    desenhar();
    const t1 = relogio();
    expect(t1).toBeGreaterThanOrEqual(0);
    // Um laço curto para o relógio de parede andar de fato.
    const alvo = Date.now() + 12;
    while (Date.now() < alvo) {
      /* espera */
    }
    desenhar();
    expect(relogio()).toBeGreaterThan(t1);
  });

  it('sobrevive à troca de nível gráfico', () => {
    // `setDetail` reconstrói a malha. Se o gancho não for
    // reinstalado, o campo congela ao mudar de qualidade.
    const aerion = createOfficialAvatar('aerion')!;
    aerion.setDetail('baixa');
    expect(typeof corpo(aerion).onBeforeRender).toBe('function');
    const antes = compilar(aerion).uniforms.uCosmosTime.value as number;
    const alvo = Date.now() + 12;
    while (Date.now() < alvo) {
      /* espera */
    }
    corpo(aerion).onBeforeRender(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(compilar(aerion).uniforms.uCosmosTime.value as number).toBeGreaterThan(antes);
  });

  it('sobrevive à troca de material', () => {
    const aerion = createOfficialAvatar('aerion')!;
    aerion.setMaterialTier(false);
    const s = compilar(aerion);
    expect(s.uniforms.uCosmos.value).toBe(1);
    expect(s.fragmentShader).toContain('edenCosmosField');
    expect(chave(aerion)).toContain('cosmos');
  });
});

describe('C3 — C1 e C2 continuam de pé', () => {
  it('a silhueta e as peças do Aérion não mudaram', () => {
    const ap = officialAppearance('aerion')!;
    expect(ap.hairStyle).toBe('cosmos');
    expect(ap.outfit).toBe('criador');
    expect(officialShape('aerion')).toEqual(SHAPE_MASC);
    expect(officialFingerprint('aerion')).toContain('|forma:masc');
  });

  it('as tabelas de acabamento do C2 não foram tocadas', () => {
    expect(FINISH_EMISSIVE[Finish.Cosmos]).toBe(0.28);
    expect(FINISH_EMISSIVE[Finish.Holo]).toBe(0.55);
    expect(FINISH_EMISSIVE.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('o campo é acabamento, não geometria', () => {
    // O princípio da Etapa 3, afirmado como teste: ligar o campo não
    // acrescenta um vértice sequer ao Criador.
    const comCampo = createOfficialAvatar('aerion')!;
    const semCampo = new Avatar(officialAppearance('aerion')!, officialProportions('aerion')!, SHAPE_MASC);
    const conta = (a: Avatar) => corpo(a).geometry.getAttribute('position').count;
    expect(conta(comCampo)).toBe(conta(semCampo));
  });
});
