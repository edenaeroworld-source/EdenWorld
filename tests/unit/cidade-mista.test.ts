import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  CITIZEN_ACCESSORIES,
  CITIZEN_HAIR_BY_SEX,
  CITIZEN_HAIR_STYLES,
  CITIZEN_OUTFITS,
  CITIZEN_OUTFITS_BY_SEX,
  DEFAULT_APPEARANCE,
  HAIR_AUDIENCE,
  HAIR_LABELS,
  HAIR_STYLES,
  OUTFITS,
  OUTFIT_AUDIENCE,
  OUTFIT_LABELS,
  type HairStyle,
  type Outfit,
} from '../../src/player/AvatarAppearance';
import { FIRST_NAMES, NAME_SEX, makeCitizen } from '../../src/npc/CitizenData';
import { officialAppearance } from '../../src/characters/CharacterModels';
import { DEFAULT_PROPORTIONS } from '../../src/player/body/BodyProportions';
import { BODY_DETAIL, Finish, bodyMetrics } from '../../src/player/body/BodyRig';
import { buildBodyGeometry } from '../../src/player/body/BodyBuilder';

/**
 * Etapa 2 do EdenWorld 2.0 — a cidade deixa de ser um desfile de
 * deusas duplicadas e passa a ter homens e mulheres.
 *
 * O que esta suíte faz de diferente das dez suítes `*-remaster`: elas
 * afirmam sobre as **constantes** (`CITIZEN_HAIR_STYLES` não contém
 * `cachos`), e por isso nenhuma delas percebeu que `makeCitizen`
 * sorteava da lista cheia e punha o cabelo da Nexara em oito
 * habitantes. Aqui tudo é afirmado sobre os habitantes que a cidade
 * **gera de fato**.
 */

/** A população de Aurora City. */
const N = 54;
const CIDADE = Array.from({ length: N }, (_, i) => makeCitizen(i + 1));

/** Amostra grande, para separar ruído de amostra de viés de sorteio. */
const AMOSTRA = Array.from({ length: 500 }, (_, i) => makeCitizen(i + 1));

/** Os nove penteados e três acessórios que pertencem às deusas. */
const CABELO_DE_DEUSA: readonly HairStyle[] = ['cascata', 'fluxo', 'onda', 'cachos', 'silvestre', 'fibra', 'copa', 'pincelada', 'nascente'];
const ACESSORIO_DE_DEUSA = ['lentes', 'atelie', 'nimbo'] as const;
const TRAJE_DE_DEUSA: readonly Outfit[] = ['aurora', 'docente', 'rede', 'sonora', 'cosplay', 'guardia', 'sistema', 'jardim', 'lumen', 'regaco'];

/** O catálogo que a cidade tinha antes desta etapa — nada pode ter sumido. */
const CABELO_ANTES: readonly HairStyle[] = ['curto', 'longo', 'ondulado', 'rabo', 'coque', 'cacheado', 'espetado', 'careca'];
const TRAJE_ANTES: readonly Outfit[] = ['casual', 'aero', 'vestido', 'esportivo', 'praia'];

/** As peças criadas nesta etapa. */
const CABELO_MASC_NOVO: readonly HairStyle[] = ['social', 'topete', 'raspado', 'samurai', 'crespo', 'franjado'];
const CABELO_FEM_NOVO: readonly HairStyle[] = ['chanel', 'tranca', 'chiquinhas'];
const TRAJE_MASC_NOVO: readonly Outfit[] = ['camiseta', 'regata', 'moletom', 'banho'];

function contar<T>(itens: readonly T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const i of itens) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

function pico<T>(itens: readonly T[]): number {
  return itens.length === 0 ? 0 : Math.max(...contar(itens).values());
}

/* ========================================================================
 * 1. O conserto: nenhuma peça de deusa na praça
 * ===================================================================== */

describe('a exclusividade das deusas, medida em quem a cidade gera', () => {
  it('nenhum dos 54 habitantes usa penteado fora da lista de habitante', () => {
    const fora = CIDADE.filter((c) => !(CITIZEN_HAIR_STYLES as readonly string[]).includes(c.appearance.hairStyle));
    expect(fora.map((c) => `${c.name}: ${c.appearance.hairStyle}`)).toEqual([]);
  });

  it('nenhum habitante usa traje fora da lista de habitante', () => {
    const fora = CIDADE.filter((c) => !(CITIZEN_OUTFITS as readonly string[]).includes(c.appearance.outfit));
    expect(fora.map((c) => `${c.name}: ${c.appearance.outfit}`)).toEqual([]);
  });

  it('nenhum habitante usa acessório fora da lista de habitante', () => {
    // Era por aqui que o Ouro do Ateliê, as lentes e o Nimbo vazavam:
    // o ramo de 35% sorteava de `ACCESSORIES` cheia.
    const fora = CIDADE.filter((c) => !(CITIZEN_ACCESSORIES as readonly string[]).includes(c.appearance.accessory));
    expect(fora.map((c) => `${c.name}: ${c.appearance.accessory}`)).toEqual([]);
  });

  it('nenhuma das peças exclusivas aparece, nomeada uma a uma', () => {
    for (const peca of CABELO_DE_DEUSA) {
      expect(CIDADE.filter((c) => c.appearance.hairStyle === peca), `penteado de deusa na praça: ${peca}`).toHaveLength(0);
    }
    for (const peca of ACESSORIO_DE_DEUSA) {
      expect(CIDADE.filter((c) => c.appearance.accessory === peca), `acessório de deusa na praça: ${peca}`).toHaveLength(0);
    }
    for (const peca of TRAJE_DE_DEUSA) {
      expect(CIDADE.filter((c) => c.appearance.outfit === peca), `traje de deusa na praça: ${peca}`).toHaveLength(0);
    }
  });

  it('e continua valendo em quinhentos habitantes, não só nos cinquenta e quatro', () => {
    const vazou = AMOSTRA.filter(
      (c) =>
        !(CITIZEN_HAIR_STYLES as readonly string[]).includes(c.appearance.hairStyle) ||
        !(CITIZEN_OUTFITS as readonly string[]).includes(c.appearance.outfit) ||
        !(CITIZEN_ACCESSORIES as readonly string[]).includes(c.appearance.accessory),
    );
    expect(vazou).toHaveLength(0);
  });

  it('a auréola continua reservada aos seres divinos', () => {
    expect(AMOSTRA.filter((c) => c.appearance.accessory === 'aureola')).toHaveLength(0);
    // Mas ela não saiu do catálogo: é peça de deusa, não peça apagada.
    expect(ACCESSORIES).toContain('aureola');
  });
});

/* ========================================================================
 * 2. O eixo de sexo na população
 * ===================================================================== */

describe('a cidade tem homens e mulheres', () => {
  it('todo nome próprio tem sexo declarado, e não há entrada órfã', () => {
    const nomes = [...FIRST_NAMES].sort();
    const tabela = Object.keys(NAME_SEX).sort();
    expect(tabela).toEqual(nomes);
  });

  it('a tabela de nomes é exatamente metade e metade', () => {
    const valores = Object.values(NAME_SEX);
    const masc = valores.filter((s) => s === 'masc').length;
    expect(masc).toBe(valores.length - masc);
  });

  it('o sexo do habitante sai do nome dele, nos 54', () => {
    for (const c of CIDADE) {
      const primeiro = c.name.split(' ')[0];
      expect(c.appearance.sex, `${c.name}`).toBe(NAME_SEX[primeiro]);
    }
  });

  it('a população fica perto de metade e metade', () => {
    const masc = CIDADE.filter((c) => c.appearance.sex === 'masc').length;
    expect(masc / N).toBeGreaterThanOrEqual(0.4);
    expect(masc / N).toBeLessThanOrEqual(0.6);
  });

  it('em amostra grande a divisão converge para a metade', () => {
    const masc = AMOSTRA.filter((c) => c.appearance.sex === 'masc').length;
    expect(masc / AMOSTRA.length).toBeGreaterThan(0.45);
    expect(masc / AMOSTRA.length).toBeLessThan(0.55);
  });
});

describe('ninguém veste peça do outro sexo', () => {
  it('cada habitante usa penteado do catálogo do próprio sexo', () => {
    const erro = AMOSTRA.filter((c) => !(CITIZEN_HAIR_BY_SEX[c.appearance.sex] as readonly string[]).includes(c.appearance.hairStyle));
    expect(erro.map((c) => `${c.name} (${c.appearance.sex}): ${c.appearance.hairStyle}`)).toEqual([]);
  });

  it('cada habitante usa traje do catálogo do próprio sexo', () => {
    const erro = AMOSTRA.filter((c) => !(CITIZEN_OUTFITS_BY_SEX[c.appearance.sex] as readonly string[]).includes(c.appearance.outfit));
    expect(erro.map((c) => `${c.name} (${c.appearance.sex}): ${c.appearance.outfit}`)).toEqual([]);
  });

  it('nenhum habitante masculino usa vestido nem traje de praia feminino', () => {
    const masc = AMOSTRA.filter((c) => c.appearance.sex === 'masc');
    expect(masc.filter((c) => c.appearance.outfit === 'vestido')).toHaveLength(0);
    expect(masc.filter((c) => c.appearance.outfit === 'praia')).toHaveLength(0);
  });

  it('nenhuma habitante feminina usa os quatro trajes masculinos', () => {
    const fem = AMOSTRA.filter((c) => c.appearance.sex === 'fem');
    for (const traje of TRAJE_MASC_NOVO) {
      expect(fem.filter((c) => c.appearance.outfit === traje), `traje masculino em habitante feminina: ${traje}`).toHaveLength(0);
    }
  });
});

/* ========================================================================
 * 3. Nada do que existia foi removido
 * ===================================================================== */

describe('o catálogo cresceu sem perder nada', () => {
  it('todo penteado que existia continua existindo', () => {
    for (const h of [...CABELO_ANTES, ...CABELO_DE_DEUSA]) expect(HAIR_STYLES, h).toContain(h);
  });

  it('todo traje que existia continua existindo', () => {
    for (const o of [...TRAJE_ANTES, ...TRAJE_DE_DEUSA]) expect(OUTFITS, o).toContain(o);
  });

  it('o catálogo feminino de habitante não encolheu', () => {
    // Todos os oito penteados que uma habitante podia receber antes
    // continuam disponíveis para ela. Separar por sexo tirou coisas do
    // sorteio masculino, nunca do feminino.
    for (const h of CABELO_ANTES) expect(CITIZEN_HAIR_BY_SEX.fem as readonly string[], h).toContain(h);
    for (const o of TRAJE_ANTES) expect(CITIZEN_OUTFITS_BY_SEX.fem as readonly string[], o).toContain(o);
  });

  it('toda peça do catálogo tem rótulo e público declarados', () => {
    for (const h of HAIR_STYLES) {
      expect(HAIR_LABELS[h], h).toBeTruthy();
      expect(['fem', 'masc', 'ambos'], h).toContain(HAIR_AUDIENCE[h]);
    }
    for (const o of OUTFITS) {
      expect(OUTFIT_LABELS[o], o).toBeTruthy();
      expect(['fem', 'masc', 'ambos'], o).toContain(OUTFIT_AUDIENCE[o]);
    }
  });

  it('nenhuma peça de deusa foi marcada como masculina ou comum por engano', () => {
    for (const h of CABELO_DE_DEUSA) expect(HAIR_AUDIENCE[h], h).toBe('fem');
    for (const o of TRAJE_DE_DEUSA) expect(OUTFIT_AUDIENCE[o], o).toBe('fem');
  });
});

/* ========================================================================
 * 4. Variedade — o motivo de o catálogo ter crescido
 * ===================================================================== */

describe('a praça não é um desfile de clones', () => {
  it('os 54 habitantes têm aparências todas diferentes entre si', () => {
    const chave = (c: (typeof CIDADE)[number]) => {
      const a = c.appearance;
      return [a.sex, a.hairStyle, a.hairColor, a.skin, a.outfit, a.topColor, a.bottomColor, a.accessory].join('|');
    };
    expect(new Set(CIDADE.map(chave)).size).toBe(N);
  });

  it('nenhum penteado domina o próprio sexo', () => {
    // O limiar é 8 e não 4, e a correção é minha: o plano calculou a
    // **média** (26 habitantes / 10 cortes = 2,6) e escreveu o número
    // como se fosse o pico. Em 26 sorteios sobre 10 opções o pico
    // esperado fica entre 5 e 7 por puro acaso — medindo, deu 7 para
    // `social`, e em 3 000 habitantes esse mesmo corte converge para
    // 13,0% contra os 12,8% que o peso dele prevê. É ruído de amostra,
    // não viés de sorteio.
    //
    // Para comparação, o que havia antes: `fluxo` em 8 dos 54.
    for (const sexo of ['masc', 'fem'] as const) {
      const doSexo = CIDADE.filter((c) => c.appearance.sex === sexo);
      expect(pico(doSexo.map((c) => c.appearance.hairStyle)), `pico de penteado em ${sexo}`).toBeLessThanOrEqual(8);
    }
  });

  it('cada sexo tem pelo menos oito penteados distintos em uso', () => {
    for (const sexo of ['masc', 'fem'] as const) {
      const usados = new Set(CIDADE.filter((c) => c.appearance.sex === sexo).map((c) => c.appearance.hairStyle));
      expect(usados.size, `penteados distintos em ${sexo}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('cabeça raspada é traço, não epidemia', () => {
    const carecas = CIDADE.filter((c) => c.appearance.hairStyle === 'careca').length;
    expect(carecas).toBeGreaterThanOrEqual(1);
    expect(carecas).toBeLessThanOrEqual(4);
  });

  it('toda peça criada nesta etapa é usada de verdade — nenhuma é código morto', () => {
    const cabelos = new Set(AMOSTRA.map((c) => c.appearance.hairStyle));
    const trajes = new Set(AMOSTRA.map((c) => c.appearance.outfit));
    for (const h of [...CABELO_MASC_NOVO, ...CABELO_FEM_NOVO]) expect(cabelos, `penteado novo nunca sorteado: ${h}`).toContain(h);
    for (const o of TRAJE_MASC_NOVO) expect(trajes, `traje novo nunca sorteado: ${o}`).toContain(o);
  });

  it('o mesmo habitante continua sendo o mesmo em qualquer execução', () => {
    for (const semente of [1, 17, 54, 300]) {
      expect(JSON.stringify(makeCitizen(semente))).toBe(JSON.stringify(makeCitizen(semente)));
    }
  });
});

/* ========================================================================
 * 5. A geometria das peças novas
 * ===================================================================== */

const metrics = bodyMetrics(DEFAULT_PROPORTIONS);

function malha(extra: { hairStyle?: HairStyle; outfit?: Outfit }, nivel: keyof typeof BODY_DETAIL = 'media'): THREE.BufferGeometry {
  return buildBodyGeometry({ ...DEFAULT_APPEARANCE, ...extra }, DEFAULT_PROPORTIONS, metrics, BODY_DETAIL[nivel]);
}

function vertices(extra: { hairStyle?: HairStyle; outfit?: Outfit }, nivel: keyof typeof BODY_DETAIL = 'media'): number {
  const g = malha(extra, nivel);
  const n = g.getAttribute('position').count;
  g.dispose();
  return n;
}

/**
 * Conta vértices cor de pele numa caixa do corpo.
 *
 * Mede **cor**, e não `aFinish`, de propósito: `subdivideProfile`
 * descarta o acabamento das estações (está escrito em `BodyBuilder.ts`,
 * na definição de `cloth`), então toda superfície varrida sai com o
 * acabamento de base do traje — pele e pano inclusive. Quem carrega a
 * diferença até a malha final é a cor do vértice. Testar `Finish.Skin`
 * aqui daria um teste que passa com o tronco vestido.
 */
function pelePor(
  g: THREE.BufferGeometry,
  skin: string,
  dentro: (x: number, y: number, z: number) => boolean,
): { pele: number; total: number } {
  const alvo = new THREE.Color(skin);
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  let pele = 0;
  let total = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (!dentro(pos.getX(i), pos.getY(i), pos.getZ(i))) continue;
    total += 1;
    if (Math.abs(col.getX(i) - alvo.r) < 0.02 && Math.abs(col.getY(i) - alvo.g) < 0.02 && Math.abs(col.getZ(i) - alvo.b) < 0.02) pele += 1;
  }
  return { pele, total };
}

/** O peito, na frente do tronco. */
const NO_PEITO = (x: number, y: number, z: number) => y > 0.2 && y < 0.34 && Math.abs(x) < 0.1 && z > 0.04;
/** A tampa do ombro, de onde a manga da camiseta desce. */
const NO_OMBRO = (x: number, y: number) => y > 0.38 && y < 0.46 && Math.abs(x) > 0.1 && Math.abs(x) < 0.22;

describe('os penteados novos existem na malha', () => {
  const careca = vertices({ hairStyle: 'careca' });

  for (const h of [...CABELO_MASC_NOVO, ...CABELO_FEM_NOVO]) {
    it(`\`${h}\` põe cabelo na cabeça`, () => {
      const g = malha({ hairStyle: h });
      let fios = 0;
      const fin = g.getAttribute('aFinish');
      for (let i = 0; i < fin.count; i += 1) if (Math.round(fin.getX(i)) === Finish.Hair) fios += 1;
      expect(fios, `vértices de cabelo em ${h}`).toBeGreaterThan(0);
      expect(g.getAttribute('position').count).toBeGreaterThan(careca);
      g.dispose();
    });
  }

  it('cada penteado novo é geometricamente distinto dos outros', () => {
    const assinaturas = new Map<string, HairStyle>();
    for (const h of [...CABELO_MASC_NOVO, ...CABELO_FEM_NOVO]) {
      const g = malha({ hairStyle: h });
      const chave = String(g.getAttribute('position').count);
      g.dispose();
      expect(assinaturas.has(chave), `${h} tem a mesma contagem de ${assinaturas.get(chave)}`).toBe(false);
      assinaturas.set(chave, h);
    }
  });
});

describe('os trajes masculinos vestem o que prometem', () => {
  const pele = DEFAULT_APPEARANCE.skin;

  it('a bermuda de banho deixa o tronco nu e a camiseta o cobre', () => {
    const banho = malha({ outfit: 'banho' }, 'alta');
    const camiseta = malha({ outfit: 'camiseta' }, 'alta');
    const nu = pelePor(banho, pele, NO_PEITO);
    const vestido = pelePor(camiseta, pele, NO_PEITO);

    expect(nu.total, 'a caixa do peito não pegou vértice nenhum').toBeGreaterThan(20);
    expect(nu.pele).toBe(nu.total); // peito inteiro em pele
    expect(vestido.pele).toBe(0); // peito inteiro em pano
    banho.dispose();
    camiseta.dispose();
  });

  it('a regata deixa o ombro nu, e a camiseta cobre o mesmo ombro', () => {
    const regata = malha({ outfit: 'regata' }, 'alta');
    const camiseta = malha({ outfit: 'camiseta' }, 'alta');
    const r = pelePor(regata, pele, (x, y) => NO_OMBRO(x, y));
    const c = pelePor(camiseta, pele, (x, y) => NO_OMBRO(x, y));

    expect(r.total).toBeGreaterThan(20);
    expect(r.pele / r.total, 'ombro da regata deveria estar quase todo nu').toBeGreaterThan(0.9);
    expect(c.pele, 'a manga da camiseta deveria cobrir o ombro').toBe(0);
    regata.dispose();
    camiseta.dispose();
  });

  it('a alça da regata cruza o ombro — ele não fica inteiramente nu', () => {
    // A diferença entre regata e peito nu com braço nu: sobra pano
    // sobre o ombro. Sem isto, `regata` seria só `banho` de calça.
    const regata = malha({ outfit: 'regata' }, 'alta');
    const banho = malha({ outfit: 'banho' }, 'alta');
    const r = pelePor(regata, pele, (x, y) => NO_OMBRO(x, y));
    const b = pelePor(banho, pele, (x, y) => NO_OMBRO(x, y));

    expect(r.total - r.pele, 'nenhum vértice de alça sobre o ombro').toBeGreaterThan(0);
    expect(b.pele).toBe(b.total); // no banho o ombro não tem alça alguma
    regata.dispose();
    banho.dispose();
  });

  it('a regata cobre o peito, ao contrário da bermuda de banho', () => {
    const regata = malha({ outfit: 'regata' }, 'alta');
    expect(pelePor(regata, pele, NO_PEITO).pele).toBe(0);
    regata.dispose();
  });

  it('nenhum traje masculino produz saia', () => {
    // `dress` é o que abre a saia a partir da pelve. Um traje
    // masculino que entrasse nessa lista ganharia barra rodada.
    const comVestido = vertices({ outfit: 'vestido' }, 'media');
    for (const o of TRAJE_MASC_NOVO) {
      expect(vertices({ outfit: o }, 'media'), `${o} tem contagem de vestido`).not.toBe(comVestido);
    }
  });

  it('cada traje masculino é distinto dos outros três', () => {
    const contagens = TRAJE_MASC_NOVO.map((o) => vertices({ outfit: o }, 'media'));
    expect(new Set(contagens).size).toBe(TRAJE_MASC_NOVO.length);
  });
});

describe('o orçamento de vértices dos quatro níveis foi respeitado', () => {
  // Nenhuma peça nova pode custar mais que a pior peça que já existia,
  // em nenhum dos quatro níveis — senão o aparelho mais fraco paga a
  // conta de um catálogo maior.
  const CABELO_NOVO = [...CABELO_MASC_NOVO, ...CABELO_FEM_NOVO];
  const CABELO_VELHO: readonly HairStyle[] = ['ondulado', 'cacheado', 'espetado', 'longo', 'rabo', 'coque', 'curto'];

  for (const nivel of ['ultra', 'alta', 'media', 'baixa'] as const) {
    it(`em \`${nivel}\`, o pior penteado novo não passa do pior penteado antigo`, () => {
      const velho = Math.max(...CABELO_VELHO.map((h) => vertices({ hairStyle: h }, nivel)));
      const novo = Math.max(...CABELO_NOVO.map((h) => vertices({ hairStyle: h }, nivel)));
      expect(novo, `pior novo ${novo} contra pior antigo ${velho}`).toBeLessThanOrEqual(velho);
    });
  }

  for (const nivel of ['ultra', 'alta', 'media', 'baixa'] as const) {
    it(`em \`${nivel}\`, o pior traje novo não passa do pior traje antigo`, () => {
      const velho = Math.max(...TRAJE_ANTES.map((o) => vertices({ outfit: o }, nivel)));
      const novo = Math.max(...TRAJE_MASC_NOVO.map((o) => vertices({ outfit: o }, nivel)));
      expect(novo, `pior novo ${novo} contra pior antigo ${velho}`).toBeLessThanOrEqual(velho);
    });
  }
});

/* ========================================================================
 * 6. O panteão não foi tocado
 * ===================================================================== */

describe('as onze fichas oficiais continuam intactas', () => {
  it('cada deusa mantém a peça exclusiva dela', () => {
    const esperado: Readonly<Record<string, HairStyle>> = {
      suki: 'cascata',
      nexara: 'fluxo',
      lilly: 'onda',
      akemi: 'cachos',
      saturno: 'silvestre',
      haru: 'fibra',
      maze: 'copa',
      jupiter: 'pincelada',
      amara: 'nascente',
      luma: 'ondulado',
    };
    for (const [id, cabelo] of Object.entries(esperado)) {
      expect(officialAppearance(id)?.hairStyle, id).toBe(cabelo);
    }
  });

  it('nenhuma ficha oficial foi marcada como masculina nesta etapa', () => {
    for (const id of Object.keys({ suki: 1, nexara: 1, lilly: 1, akemi: 1, saturno: 1, haru: 1, maze: 1, jupiter: 1, amara: 1, luma: 1, aerion: 1 })) {
      expect(officialAppearance(id)?.sex, id).toBe('fem');
    }
  });
});
