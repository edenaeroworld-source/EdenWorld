// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  AERION_ONLY_HAIR,
  AERION_ONLY_OUTFIT,
  CITIZEN_HAIR_BY_SEX,
  CITIZEN_HAIR_STYLES,
  CITIZEN_OUTFITS,
  CITIZEN_OUTFITS_BY_SEX,
  CREATOR_HAIR_STYLES,
  CREATOR_OUTFITS,
  GODDESS_ONLY_HAIR,
  GODDESS_ONLY_OUTFIT,
  DEFAULT_APPEARANCE,
  HAIR_LABELS,
  HAIR_STYLES,
  OUTFITS,
  OUTFIT_LABELS,
  SEXES,
  randomAppearance,
} from '../../src/player/AvatarAppearance';
import {
  FINISH_CLEARCOAT,
  FINISH_EMISSIVE,
  FINISH_ENV_DIFFUSE,
  FINISH_IRIDESCENCE,
  FINISH_METALNESS,
  FINISH_ROUGHNESS,
  FINISH_SHEEN,
  finishVaryingGLSL,
} from '../../src/player/body/BodyFinish';
import { BODY_DETAIL, Finish, bodyMetrics } from '../../src/player/body/BodyRig';
import { buildBodyGeometry } from '../../src/player/body/BodyBuilder';
import {
  OFFICIAL_IDS,
  officialAppearance,
  officialFingerprint,
  officialProportions,
  officialShape,
} from '../../src/characters/CharacterModels';
import { PANTHEON } from '../../src/characters/Pantheon';
import { makeCitizen, rollCitizenAfters } from '../../src/npc/CitizenData';
import { AvatarCreatorScreen } from '../../src/interface/AvatarCreator';
import { createRng } from '../../src/utils/math';

/**
 * Etapa 3, bloco C2 — as peças exclusivas do Aérion.
 *
 * Três coisas nascem aqui: o penteado `cosmos`, o traje `criador` e o
 * acabamento `Finish.Cosmos`. As três são de um personagem só, e o
 * valor desta suíte está menos em provar que elas existem do que em
 * provar que **não escaparam**: nem para a praça, nem para as dez
 * deusas, nem para o criador de avatar do jogador.
 *
 * O Éden já tinha peças de deusa fora do sorteio, e a Etapa 1 mostrou
 * que a lista existia e ninguém a lia — 34 de 54 habitantes
 * apareciam de cabelo divino. É esse erro, e não a falta das listas,
 * que esta suíte vigia.
 */

const NIVEIS = ['ultra', 'alta', 'media', 'baixa'] as const;

/** Conta vértices por acabamento numa malha. */
function porAcabamento(geometria: ReturnType<typeof buildBodyGeometry>): Record<number, number> {
  const f = geometria.getAttribute('aFinish');
  const contagem: Record<number, number> = {};
  for (let i = 0; i < f.count; i++) {
    const k = Math.round(f.getX(i));
    contagem[k] = (contagem[k] ?? 0) + 1;
  }
  return contagem;
}

function malhaOficial(id: string, nivel: (typeof NIVEIS)[number]) {
  const ap = officialAppearance(id)!;
  const pp = officialProportions(id)!;
  return buildBodyGeometry(ap, pp, bodyMetrics(pp, officialShape(id)!), BODY_DETAIL[nivel]);
}

describe('C2 — as peças existem e são do Aérion', () => {
  it('a ficha do Aérion usa as duas peças novas', () => {
    const aerion = officialAppearance('aerion')!;
    expect(aerion.hairStyle).toBe('cosmos');
    expect(aerion.outfit).toBe('criador');
    // E o resto da ficha dele não foi mexido de carona.
    expect(aerion.accessory).toBe('aureola');
    expect(aerion.hairColor).toBe('#9a7bff');
    expect(aerion.height).toBe(1.08);
  });

  it('nenhum outro personagem oficial usa cosmos ou criador', () => {
    for (const ficha of PANTHEON) {
      if (ficha.id === 'aerion') continue;
      expect(ficha.appearance.hairStyle, `cabelo de ${ficha.id}`).not.toBe('cosmos');
      expect(ficha.appearance.outfit, `traje de ${ficha.id}`).not.toBe('criador');
    }
  });

  it('as peças entraram no catálogo com rótulo e sem desalojar ninguém', () => {
    expect(HAIR_STYLES).toContain('cosmos');
    expect(OUTFITS).toContain('criador');
    expect(HAIR_LABELS.cosmos).toBeTruthy();
    expect(OUTFIT_LABELS.criador).toBeTruthy();
    // As peças que existiam continuam todas lá.
    for (const peca of ['longo', 'curto', 'cascata', 'nascente', 'social', 'careca']) {
      expect(HAIR_STYLES).toContain(peca);
    }
    for (const peca of ['aero', 'casual', 'aurora', 'regaco', 'camiseta', 'banho']) {
      expect(OUTFITS).toContain(peca);
    }
  });
});

describe('C2 — exclusividade: as peças não vazam', () => {
  it('estão declaradas como exclusivas num lugar só', () => {
    expect([...AERION_ONLY_HAIR]).toEqual(['cosmos']);
    expect([...AERION_ONLY_OUTFIT]).toEqual(['criador']);
  });

  it('fora de todas as listas de sorteio de habitante', () => {
    expect(CITIZEN_HAIR_STYLES).not.toContain('cosmos');
    expect(CITIZEN_OUTFITS).not.toContain('criador');
    for (const sexo of SEXES) {
      expect(CITIZEN_HAIR_BY_SEX[sexo], `cabelos de ${sexo}`).not.toContain('cosmos');
      expect(CITIZEN_OUTFITS_BY_SEX[sexo], `trajes de ${sexo}`).not.toContain('criador');
      // E as listas não ficaram vazias por causa do filtro novo.
      expect(CITIZEN_HAIR_BY_SEX[sexo].length).toBeGreaterThan(4);
      expect(CITIZEN_OUTFITS_BY_SEX[sexo].length).toBeGreaterThan(3);
    }
  });

  it('os 54 habitantes de Aurora City não as usam', () => {
    for (let i = 1; i <= 54; i++) {
      const c = makeCitizen(i);
      expect(c.appearance.hairStyle, `habitante ${i}`).not.toBe('cosmos');
      expect(c.appearance.outfit, `habitante ${i}`).not.toBe('criador');
    }
  });

  it('500 sorteios de aparência não produzem nenhuma das duas', () => {
    // A cidade tem 54 moradores, mas o sorteio é a função que pode
    // rodar um número indeterminado de vezes numa sessão longa.
    for (let s = 0; s < 500; s++) {
      const a = randomAppearance(createRng(s * 7 + 3));
      expect(a.hairStyle, `sorteio ${s}`).not.toBe('cosmos');
      expect(a.outfit, `sorteio ${s}`).not.toBe('criador');
    }
    // E o sorteio da cidade, que é o que de fato veste a praça,
    // passa pelas listas por sexo — cobertas acima.
  });

  it('o criador de avatar do jogador não oferece as duas', () => {
    expect(CREATOR_HAIR_STYLES).not.toContain('cosmos');
    expect(CREATOR_OUTFITS).not.toContain('criador');
    // A regra mudou na Fase 1.1, e este caso mudou com ela.
    //
    // Até aqui o criador oferecia tudo menos as duas peças do Aérion
    // — peça de deusa inclusive, e de propósito. Agora o catálogo
    // comum é **só** o comum: o que é das dez é delas. A linha que
    // este caso guardava ("continua oferecendo tudo o mais") deixou
    // de ser verdadeira porque deixou de ser desejada, e não porque
    // alguma coisa quebrou.
    //
    // O que não mudou, e é o que este arquivo existe para guardar: as
    // duas peças do Aérion continuam fora, por uma barreira própria.
    expect(CREATOR_HAIR_STYLES.length).toBe(HAIR_STYLES.length - 1 - GODDESS_ONLY_HAIR.size);
    expect(CREATOR_OUTFITS.length).toBe(OUTFITS.length - 1 - GODDESS_ONLY_OUTFIT.size);
    for (const peca of GODDESS_ONLY_HAIR) expect(CREATOR_HAIR_STYLES, `cabelo de deusa: ${peca}`).not.toContain(peca);
    for (const peca of GODDESS_ONLY_OUTFIT) expect(CREATOR_OUTFITS, `roupa de deusa: ${peca}`).not.toContain(peca);
    expect(CREATOR_HAIR_STYLES).not.toContain('cascata');
    expect(CREATOR_OUTFITS).not.toContain('aurora');
  });

  it('a tela do criador, montada, não mostra as peças do Aérion', () => {
    // Não basta a lista estar certa: o que protege o jogador é a
    // tela **ler** a lista certa. Este caso monta o painel de
    // verdade e procura os rótulos nos botões.
    const tela = new AvatarCreatorScreen({
      onPreview: () => {},
      onConfirm: () => {},
      onCancel: () => {},
      onRotate: () => {},
    });
    tela.configure('Viajante', { ...DEFAULT_APPEARANCE }, false);
    document.body.appendChild(tela.element);
    // A Fase 1.1 pôs uma tela antes do acabamento: a escolha de Ele ou
    // Ela. O caso atravessa essa escolha em vez de ser afrouxado —
    // o que ele guarda continua sendo o catálogo montado de verdade.
    tela.element.querySelector<HTMLButtonElement>('.sex-card[data-sex="fem"]')?.click();
    // E percorre as etapas de peça, porque agora só uma aparece por vez.
    const texto = Array.from(tela.element.querySelectorAll<HTMLButtonElement>('.stepper__item'))
      .map((aba) => {
        aba.click();
        return tela.element.textContent ?? '';
      })
      .join(' ');
    expect(texto).toContain('Longo');
    expect(texto).not.toContain(HAIR_LABELS.cosmos);
    expect(texto).not.toContain(OUTFIT_LABELS.criador);
    tela.element.remove();
  });

  it('os Afters continuam fora do alcance do Aérion e dos masculinos', () => {
    // D3 da Etapa 1, reconferido: o traje novo não reabriu a porta.
    const semAfters = rollCitizenAfters(createRng(11), makeCitizen(3).archetype, 'masc');
    expect(semAfters.bustActive).toBe(false);
  });
});

describe('C2 — Finish.Cosmos', () => {
  const tabelas = {
    FINISH_ROUGHNESS,
    FINISH_METALNESS,
    FINISH_SHEEN,
    FINISH_CLEARCOAT,
    FINISH_ENV_DIFFUSE,
    FINISH_IRIDESCENCE,
    FINISH_EMISSIVE,
  };

  it('tem entrada em todas as sete tabelas', () => {
    expect(Finish.Cosmos).toBe(8);
    for (const [nome, tabela] of Object.entries(tabelas)) {
      expect(tabela.length, `${nome} precisa de uma entrada para cada acabamento`).toBe(
        Object.keys(Finish).length,
      );
      expect(Number.isFinite(tabela[Finish.Cosmos]), `${nome}[Cosmos]`).toBe(true);
    }
  });

  it('não é o holograma com outro nome', () => {
    const cosmico = Object.values(tabelas).map((t) => t[Finish.Cosmos]);
    const holo = Object.values(tabelas).map((t) => t[Finish.Holo]);
    expect(cosmico).not.toEqual(holo);
    // Acende, mas menos: o criador não ilumina a praça.
    expect(FINISH_EMISSIVE[Finish.Cosmos]).toBeGreaterThan(0);
    expect(FINISH_EMISSIVE[Finish.Cosmos]).toBeLessThan(FINISH_EMISSIVE[Finish.Holo]);
  });

  it('os acabamentos anteriores não foram tocados', () => {
    // Oito acabamentos existiam antes; se um valor deles mudasse,
    // mudaria a aparência de todo o Éden.
    expect(FINISH_ROUGHNESS.slice(0, 8)).toEqual([0.58, 0.88, 0.42, 0.08, 0.72, 0.22, 0.12, 0.1]);
    expect(FINISH_EMISSIVE.slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0.55]);
    expect(FINISH_SHEEN.slice(0, 8)).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('entra no GLSL gerado, sem ramo novo', () => {
    const glsl = finishVaryingGLSL();
    // O seletor é gerado a partir da tabela: o índice 8 tem de
    // aparecer em cada função, senão o acabamento existe no dado e
    // não existe no shader.
    const ocorrencias = (glsl.match(/abs\(id - 8\.0\)/g) ?? []).length;
    expect(ocorrencias).toBe(Object.keys(tabelas).length);
    expect(glsl).not.toContain('if (');
  });
});

describe('C2 — a malha do Aérion', () => {
  it('é cósmica de ponta a ponta, menos os olhos', () => {
    for (const nivel of NIVEIS) {
      const g = malhaOficial('aerion', nivel);
      try {
        const porFinish = porAcabamento(g);
        const total = g.getAttribute('position').count;
        const cosmico = porFinish[Finish.Cosmos] ?? 0;
        const olhos = porFinish[Finish.Eye] ?? 0;
        // Exato, e não um percentual: o corpo inteiro é cósmico e o
        // que sobra são os olhos — que continuam molhados, porque
        // olho de vidro não é campo estelar.
        expect(cosmico + olhos, `cósmico + olhos em ${nivel}`).toBe(total);
        expect(cosmico, `cósmico em ${nivel}`).toBeGreaterThan(olhos);
        // Nada de pano, nada de pele comum, nada de cabelo comum.
        expect(porFinish[Finish.Cloth] ?? 0, `pano em ${nivel}`).toBe(0);
        expect(porFinish[Finish.Skin] ?? 0, `pele comum em ${nivel}`).toBe(0);
        expect(porFinish[Finish.Hair] ?? 0, `cabelo comum em ${nivel}`).toBe(0);
      } finally {
        g.dispose();
      }
    }
  });

  it('o traje não desenha peça de roupa nenhuma', () => {
    const g = malhaOficial('aerion', 'alta');
    try {
      // `parts.saia` é como o construtor marca onde o tecido começa.
      expect(g.userData.parts?.saia).toBeUndefined();
    } finally {
      g.dispose();
    }
    // E sai mais barato que o traje que ele usava: pano é geometria.
    const ap = officialAppearance('aerion')!;
    const pp = officialProportions('aerion')!;
    const sh = officialShape('aerion')!;
    const comAero = buildBodyGeometry({ ...ap, outfit: 'aero' }, pp, bodyMetrics(pp, sh), BODY_DETAIL.alta);
    const comCriador = buildBodyGeometry(ap, pp, bodyMetrics(pp, sh), BODY_DETAIL.alta);
    try {
      expect(comCriador.getAttribute('position').count).toBeLessThan(comAero.getAttribute('position').count);
    } finally {
      comAero.dispose();
      comCriador.dispose();
    }
  });

  it('o corpo está de fato nu: nenhuma cor de guarda-roupa na malha', () => {
    // Um mutante mostrou que medir só o acabamento não basta. Se
    // `criador` deixar de entrar em `bareArms`, o Aérion ganha
    // mangas — e elas saem **cósmicas**, porque o acabamento do
    // corpo inteiro é cósmico. A malha continuaria 100% `Cosmos` e
    // o personagem estaria vestido.
    //
    // O que distingue pele de pano aqui é a **cor** do vértice. Com
    // a paleta real dele não dá para medir: `skin` #2a2350 e
    // `bottomColor` #2b1d5a são o mesmo roxo a menos de um milésimo
    // em espaço linear. Então a sonda troca as três cores por
    // primárias puras e pergunta onde cada uma foi parar — a
    // geometria é exatamente a mesma, só os tons mudam.
    //
    // O filtro é de cor pura, e não de canal dominante: os lábios
    // são avermelhados por conta própria e apareceriam num teste de
    // dominância sem ter nada a ver com `topColor`.
    const ap = officialAppearance('aerion')!;
    const pp = officialProportions('aerion')!;
    const sh = officialShape('aerion')!;
    const sonda = { ...ap, skin: '#0000ff', topColor: '#ff0000', bottomColor: '#00ff00' };
    const contar = (traje: string, nivel: (typeof NIVEIS)[number]) => {
      const g = buildBodyGeometry({ ...sonda, outfit: traje as never }, pp, bodyMetrics(pp, sh), BODY_DETAIL[nivel]);
      try {
        const cor = g.getAttribute('color');
        let blusa = 0;
        let calca = 0;
        for (let i = 0; i < cor.count; i++) {
          const r = cor.getX(i);
          const v = cor.getY(i);
          const a = cor.getZ(i);
          if (r > 0.02 && v < 0.05 && a < 0.05) blusa++;
          if (v > 0.02 && r < 0.05 && a < 0.05) calca++;
        }
        return { blusa, calca };
      } finally {
        g.dispose();
      }
    };
    for (const nivel of NIVEIS) {
      const nu = contar('criador', nivel);
      expect(nu.blusa, `cor de blusa em ${nivel}`).toBe(0);
      expect(nu.calca, `cor de calça em ${nivel}`).toBe(0);
    }
    // E a sonda discrimina: sem esta parte, o caso acima passaria
    // igual se a medida estivesse simplesmente cega.
    const camiseta = contar('camiseta', 'alta');
    expect(camiseta.blusa).toBeGreaterThan(0);
    expect(camiseta.calca).toBeGreaterThan(0);
    // A bermuda de banho — o outro traje de tronco nu — continua
    // vestindo o quadril. O Criador não ficou nu por tabela: a
    // regra dele é própria.
    const banho = contar('banho', 'alta');
    expect(banho.blusa).toBe(0);
    expect(banho.calca).toBeGreaterThan(0);
  });

  it('o cabelo cosmos tem geometria própria nos quatro níveis', () => {
    const ap = officialAppearance('aerion')!;
    const pp = officialProportions('aerion')!;
    const sh = officialShape('aerion')!;
    for (const nivel of NIVEIS) {
      const comCabelo = buildBodyGeometry(ap, pp, bodyMetrics(pp, sh), BODY_DETAIL[nivel]);
      const careca = buildBodyGeometry({ ...ap, hairStyle: 'careca' }, pp, bodyMetrics(pp, sh), BODY_DETAIL[nivel]);
      try {
        const custo = comCabelo.getAttribute('position').count - careca.getAttribute('position').count;
        expect(custo, `cabelo em ${nivel}`).toBeGreaterThan(0);
      } finally {
        comCabelo.dispose();
        careca.dispose();
      }
    }
  });

  it('a crista sobe acima do crânio onde há resolução para ela', () => {
    // O traço que separa este penteado de toda queda longa do Éden: o
    // cabelo dele sobe antes de cair. Em `baixa` a crista não é
    // montada de propósito — é o nível de orçamento mais apertado.
    const ap = officialAppearance('aerion')!;
    const pp = officialProportions('aerion')!;
    const sh = officialShape('aerion')!;
    const topo = (a: typeof ap, nivel: (typeof NIVEIS)[number]) => {
      const g = buildBodyGeometry(a, pp, bodyMetrics(pp, sh), BODY_DETAIL[nivel]);
      try {
        const p = g.getAttribute('position');
        let y = -Infinity;
        for (let i = 0; i < p.count; i++) y = Math.max(y, p.getY(i));
        return y;
      } finally {
        g.dispose();
      }
    };
    for (const nivel of ['ultra', 'alta', 'media'] as const) {
      const comCrista = topo(ap, nivel);
      const semCabelo = topo({ ...ap, hairStyle: 'careca' }, nivel);
      expect(comCrista - semCabelo, `crista em ${nivel}`).toBeGreaterThan(0.05);
    }
  });

  it('não copia o penteado de nenhuma deusa', () => {
    // Duas malhas iguais seriam a mesma peça com dois nomes. A prova
    // é a contagem de vértices do cabelo, que é assinatura da forma.
    const ap = officialAppearance('aerion')!;
    const pp = officialProportions('aerion')!;
    const sh = officialShape('aerion')!;
    const custo = (estilo: string) => {
      const g = buildBodyGeometry({ ...ap, hairStyle: estilo as never }, pp, bodyMetrics(pp, sh), BODY_DETAIL.ultra);
      const c = buildBodyGeometry({ ...ap, hairStyle: 'careca' }, pp, bodyMetrics(pp, sh), BODY_DETAIL.ultra);
      try {
        return g.getAttribute('position').count - c.getAttribute('position').count;
      } finally {
        g.dispose();
        c.dispose();
      }
    };
    const cosmos = custo('cosmos');
    for (const deusa of ['cascata', 'fluxo', 'onda', 'cachos', 'silvestre', 'fibra', 'copa', 'pincelada', 'nascente', 'ondulado', 'longo']) {
      expect(cosmos, `cosmos contra ${deusa}`).not.toBe(custo(deusa));
    }
  });

  it('cabe no orçamento do panteão nos quatro níveis', () => {
    const tetos = { ultra: 44953, alta: 18330, media: 9408, baixa: 4982 } as const;
    for (const nivel of NIVEIS) {
      const g = malhaOficial('aerion', nivel);
      try {
        expect(g.getAttribute('position').count, `orçamento em ${nivel}`).toBeLessThanOrEqual(tetos[nivel]);
      } finally {
        g.dispose();
      }
    }
  });

  it('é determinística: duas construções dão a mesma malha', () => {
    for (const nivel of ['alta', 'baixa'] as const) {
      const a = malhaOficial('aerion', nivel);
      const b = malhaOficial('aerion', nivel);
      try {
        const pa = a.getAttribute('position');
        const pb = b.getAttribute('position');
        expect(pb.count).toBe(pa.count);
        let divergentes = 0;
        for (let i = 0; i < pa.count; i++) {
          if (pa.getX(i) !== pb.getX(i) || pa.getY(i) !== pb.getY(i) || pa.getZ(i) !== pb.getZ(i)) divergentes++;
        }
        expect(divergentes, `determinismo em ${nivel}`).toBe(0);
      } finally {
        a.dispose();
        b.dispose();
      }
    }
  });
});

describe('C2 — o resto do Éden não mudou', () => {
  it('nenhuma outra figura tem um vértice cósmico', () => {
    for (const id of OFFICIAL_IDS) {
      if (id === 'aerion') continue;
      const g = malhaOficial(id, 'media');
      try {
        expect(porAcabamento(g)[Finish.Cosmos] ?? 0, `cósmico em ${id}`).toBe(0);
      } finally {
        g.dispose();
      }
    }
    for (let i = 1; i <= 12; i++) {
      const c = makeCitizen(i);
      const pp = officialProportions('aerion')!;
      const g = buildBodyGeometry(c.appearance, pp, bodyMetrics(pp), BODY_DETAIL.media);
      try {
        expect(porAcabamento(g)[Finish.Cosmos] ?? 0, `cósmico no habitante ${i}`).toBe(0);
      } finally {
        g.dispose();
      }
    }
  });

  it('as dez deusas mantêm a impressão digital do C1', () => {
    // O ouro continua sendo `sexo-dados.test.ts`; aqui o que se
    // guarda é que o sufixo de forma não ganhou companhia e que
    // nenhuma delas passou a declarar peça exclusiva.
    for (const id of OFFICIAL_IDS) {
      if (id === 'aerion') continue;
      const digital = officialFingerprint(id)!;
      expect(digital).not.toContain('cosmos');
      expect(digital).not.toContain('criador');
      expect(digital).not.toContain('forma:');
    }
    expect(officialFingerprint('aerion')).toContain('|cosmos|');
    expect(officialFingerprint('aerion')).toContain('|criador|');
    expect(officialFingerprint('aerion')).toContain('|forma:masc');
  });

  it('a silhueta do C1 não foi mexida', () => {
    const pp = officialProportions('aerion')!;
    const m = bodyMetrics(pp, officialShape('aerion')!);
    expect(m.chestWidth / m.waistWidth).toBeGreaterThanOrEqual(1.2);
  });
});
