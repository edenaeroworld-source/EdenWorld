// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { AvatarCreatorScreen } from '../../src/interface/AvatarCreator';
import {
  ACCESSORIES,
  AERION_ONLY_HAIR,
  AERION_ONLY_OUTFIT,
  type AvatarAppearance,
  CREATOR_ACCESSORIES,
  CREATOR_HAIR_BY_SEX,
  CREATOR_OUTFITS_BY_SEX,
  DEFAULT_APPEARANCE,
  FACE_AXES,
  FACE_RANGE,
  GODDESS_ONLY_ACCESSORY,
  GODDESS_ONLY_HAIR,
  GODDESS_ONLY_OUTFIT,
  HAIR_AUDIENCE,
  HAIR_LABELS,
  OUTFIT_AUDIENCE,
  OUTFIT_LABELS,
  type Sex,
  catalogWithLegacy,
  coerceAppearanceToSex,
  isLegacyPiece,
  randomAppearance,
  sanitizeAppearance,
} from '../../src/player/AvatarAppearance';
import { Avatar } from '../../src/player/Avatar';
import { createOfficialAvatar } from '../../src/characters/CharacterModels';
import { PANTHEON } from '../../src/characters/Pantheon';
import { BODY_DETAIL } from '../../src/player/body/BodyRig';
import { createRng } from '../../src/utils/math';

const SEXOS: readonly Sex[] = ['fem', 'masc'];

function montarTela(appearance: AvatarAppearance, editing = false) {
  const vistos: AvatarAppearance[] = [];
  const tela = new AvatarCreatorScreen({
    onPreview: (a) => vistos.push(a),
    onConfirm: () => {},
    onCancel: () => {},
    onRotate: () => {},
  });
  tela.configure('Viajante', appearance, editing);
  return { tela, vistos };
}

const rotulos = (tela: AvatarCreatorScreen) =>
  Array.from(tela.element.querySelectorAll<HTMLElement>('.chip')).map((c) => c.textContent ?? '');

/** Leva a tela até uma etapa pelo nome mostrado na trilha. */
function irPara(tela: AvatarCreatorScreen, nome: string): void {
  const alvo = Array.from(tela.element.querySelectorAll<HTMLButtonElement>('.stepper__item')).find((b) =>
    (b.textContent ?? '').includes(nome),
  );
  if (!alvo) throw new Error(`etapa não encontrada: ${nome}`);
  alvo.click();
}

/** Clica no cartão Ele ou Ela da primeira tela. */
function escolher(tela: AvatarCreatorScreen, sex: Sex): void {
  const card = tela.element.querySelector<HTMLButtonElement>(`.sex-card[data-sex="${sex}"]`);
  if (!card) throw new Error('cartão de silhueta não encontrado');
  card.click();
}

describe('Criador 2.0 — a escolha Ele / Ela', () => {
  it('a primeira tela oferece as duas, e só elas', () => {
    const { tela } = montarTela(DEFAULT_APPEARANCE);
    const cartoes = tela.element.querySelectorAll('.sex-card');
    expect(cartoes).toHaveLength(2);
    expect(tela.element.querySelector('.sex-card[data-sex="masc"]')?.textContent).toContain('Ele');
    expect(tela.element.querySelector('.sex-card[data-sex="fem"]')?.textContent).toContain('Ela');
    // Enquanto a escolha não acontece, não há catálogo nenhum na tela:
    // é a diferença entre escolher primeiro e escolher no meio.
    expect(rotulos(tela)).toHaveLength(0);
  });

  it('escolher Ele leva ao acabamento já marcado como masculino', () => {
    const { tela, vistos } = montarTela(DEFAULT_APPEARANCE);
    escolher(tela, 'masc');
    expect(vistos.at(-1)?.sex).toBe('masc');
    expect(tela.element.querySelector('.stepper__item[aria-selected="true"]')?.textContent).toContain('Rosto');
  });

  it('escolher Ela mantém a ficha feminina', () => {
    const { tela, vistos } = montarTela(DEFAULT_APPEARANCE);
    escolher(tela, 'fem');
    // A ficha já nascia `fem`: o que se verifica é que a escolha não
    // estraga nada, e que o fluxo anda.
    expect(vistos.at(-1)?.sex ?? DEFAULT_APPEARANCE.sex).toBe('fem');
    expect(tela.element.querySelector('.step')).not.toBeNull();
  });

  it('quem edita um personagem não perde o gênero que já tinha', () => {
    const { tela } = montarTela({ ...DEFAULT_APPEARANCE, sex: 'masc', hairStyle: 'topete', outfit: 'moletom' }, true);
    // Editando, a tela de escolha não aparece: a pessoa já existe.
    expect(tela.element.querySelector('.sex-card')).toBeNull();
    irPara(tela, 'Cabelo');
    expect(rotulos(tela)).toContain(HAIR_LABELS.topete);
    expect(rotulos(tela)).not.toContain(HAIR_LABELS.chanel);
  });
});

describe('Criador 2.0 — os catálogos são separados de verdade', () => {
  it('a tela de cabelo mostra só o catálogo do sexo escolhido', () => {
    for (const sex of SEXOS) {
      const { tela } = montarTela({ ...DEFAULT_APPEARANCE, sex }, true);
      irPara(tela, 'Cabelo');
      const mostrados = rotulos(tela);
      const outro: Sex = sex === 'fem' ? 'masc' : 'fem';
      for (const peca of CREATOR_HAIR_BY_SEX[sex]) {
        expect(mostrados, `${sex} devia oferecer ${peca}`).toContain(HAIR_LABELS[peca]);
      }
      for (const peca of CREATOR_HAIR_BY_SEX[outro]) {
        if (HAIR_AUDIENCE[peca] === 'ambos') continue;
        expect(mostrados, `${sex} não pode oferecer ${peca}`).not.toContain(HAIR_LABELS[peca]);
      }
    }
  });

  it('a tela de roupa mostra só o catálogo do sexo escolhido', () => {
    for (const sex of SEXOS) {
      const { tela } = montarTela({ ...DEFAULT_APPEARANCE, sex }, true);
      irPara(tela, 'Roupa');
      const mostrados = rotulos(tela);
      const outro: Sex = sex === 'fem' ? 'masc' : 'fem';
      for (const peca of CREATOR_OUTFITS_BY_SEX[sex]) {
        expect(mostrados, `${sex} devia oferecer ${peca}`).toContain(OUTFIT_LABELS[peca]);
      }
      for (const peca of CREATOR_OUTFITS_BY_SEX[outro]) {
        if (OUTFIT_AUDIENCE[peca] === 'ambos') continue;
        expect(mostrados, `${sex} não pode oferecer ${peca}`).not.toContain(OUTFIT_LABELS[peca]);
      }
    }
  });

  it('a separação não é só visual: trocar de gênero conserta a peça incompatível', () => {
    // Este é o item 3 da encomenda, e é o que diferencia esconder de
    // separar. Uma ficha feminina de trança, passada para Ele, não
    // pode continuar de trança por dentro.
    const ela: AvatarAppearance = { ...DEFAULT_APPEARANCE, sex: 'fem', hairStyle: 'tranca', outfit: 'vestido' };
    const ele = coerceAppearanceToSex(ela, 'masc');
    expect(ele.sex).toBe('masc');
    expect(CREATOR_HAIR_BY_SEX.masc).toContain(ele.hairStyle);
    expect(CREATOR_OUTFITS_BY_SEX.masc).toContain(ele.outfit);
    // E a volta também.
    const devolta = coerceAppearanceToSex(ele, 'fem');
    expect(CREATOR_HAIR_BY_SEX.fem).toContain(devolta.hairStyle);
    expect(CREATOR_OUTFITS_BY_SEX.fem).toContain(devolta.outfit);
  });

  it('peça que serve aos dois não é trocada à toa', () => {
    const base: AvatarAppearance = { ...DEFAULT_APPEARANCE, sex: 'fem', hairStyle: 'curto', outfit: 'casual' };
    const virado = coerceAppearanceToSex(base, 'masc');
    expect(virado.hairStyle).toBe('curto');
    expect(virado.outfit).toBe('casual');
    // E o que não tem sexo nenhum não se mexe.
    expect(virado.skin).toBe(base.skin);
    expect(virado.height).toBe(base.height);
    expect(virado.faceEye).toBe(base.faceEye);
  });

  it('trocar de gênero na própria tela refaz o catálogo mostrado', () => {
    const { tela } = montarTela({ ...DEFAULT_APPEARANCE, sex: 'fem', hairStyle: 'tranca' }, true);
    irPara(tela, 'Ajustes');
    const botaoEle = Array.from(tela.element.querySelectorAll<HTMLButtonElement>('.chip')).find(
      (b) => (b.textContent ?? '').trim() === 'Ele',
    );
    expect(botaoEle).toBeDefined();
    botaoEle?.click();
    irPara(tela, 'Cabelo');
    const mostrados = rotulos(tela);
    expect(mostrados).not.toContain(HAIR_LABELS.tranca);
    expect(mostrados).toContain(HAIR_LABELS.social);
  });
});

describe('Criador 2.0 — o Panteão continua intocado', () => {
  it('nenhuma peça das dez deusas é oferecida ao jogador', () => {
    for (const sex of SEXOS) {
      const { tela } = montarTela({ ...DEFAULT_APPEARANCE, sex }, true);
      for (const etapa of ['Cabelo', 'Roupa', 'Acessórios']) {
        irPara(tela, etapa);
        const mostrados = rotulos(tela);
        for (const peca of GODDESS_ONLY_HAIR) expect(mostrados, `cabelo ${peca}`).not.toContain(HAIR_LABELS[peca as never]);
        for (const peca of GODDESS_ONLY_OUTFIT) expect(mostrados, `roupa ${peca}`).not.toContain(OUTFIT_LABELS[peca as never]);
      }
    }
  });

  it('nenhuma peça do Aérion é oferecida ao jogador', () => {
    for (const sex of SEXOS) {
      for (const peca of AERION_ONLY_HAIR) expect(CREATOR_HAIR_BY_SEX[sex]).not.toContain(peca);
      for (const peca of AERION_ONLY_OUTFIT) expect(CREATOR_OUTFITS_BY_SEX[sex]).not.toContain(peca);
    }
  });

  it('os acessórios de deusa saíram, e os comuns ficaram', () => {
    for (const peca of GODDESS_ONLY_ACCESSORY) expect(CREATOR_ACCESSORIES).not.toContain(peca);
    expect(CREATOR_ACCESSORIES).toContain('oculos');
    expect(CREATOR_ACCESSORIES).toContain('aureola');
    expect(CREATOR_ACCESSORIES.length).toBe(ACCESSORIES.length - GODDESS_ONLY_ACCESSORY.size);
  });

  it('as onze fichas oficiais não mudaram de silhueta nem de rosto', () => {
    for (const ficha of PANTHEON) {
      const avatar = createOfficialAvatar(ficha.id);
      expect(avatar, ficha.id).not.toBeNull();
      // Aérion é masculino por ficha; as dez são o corpo de referência.
      expect(avatar?.shape.id, ficha.id).toBe(ficha.id === 'aerion' ? 'masc' : 'fem');
      // Rosto neutro nos quatro eixos: o rosto que sempre tiveram.
      for (const eixo of FACE_AXES) expect(ficha.appearance[eixo], `${ficha.id}.${eixo}`).toBe(1);
    }
  });
});

describe('Criador 2.0 — o botão Aleatório', () => {
  it('respeita a escolha e nunca sorteia peça do outro catálogo', () => {
    for (const sex of SEXOS) {
      for (let s = 0; s < 400; s++) {
        const a = randomAppearance(createRng(s * 13 + 5), sex);
        expect(a.sex, `sorteio ${s}`).toBe(sex);
        expect(CREATOR_HAIR_BY_SEX[sex], `cabelo no sorteio ${s}`).toContain(a.hairStyle);
        expect(CREATOR_OUTFITS_BY_SEX[sex], `roupa no sorteio ${s}`).toContain(a.outfit);
      }
    }
  });

  it('nunca sorteia peça de deusa nem peça do Aérion', () => {
    for (const sex of SEXOS) {
      for (let s = 0; s < 400; s++) {
        const a = randomAppearance(createRng(s * 7 + 11), sex);
        expect(GODDESS_ONLY_HAIR.has(a.hairStyle), `sorteio ${s}: ${a.hairStyle}`).toBe(false);
        expect(GODDESS_ONLY_OUTFIT.has(a.outfit), `sorteio ${s}: ${a.outfit}`).toBe(false);
        expect(GODDESS_ONLY_ACCESSORY.has(a.accessory), `sorteio ${s}: ${a.accessory}`).toBe(false);
        expect(AERION_ONLY_HAIR.has(a.hairStyle)).toBe(false);
        expect(AERION_ONLY_OUTFIT.has(a.outfit)).toBe(false);
      }
    }
  });

  it('sorteia rosto dentro da faixa, sem deformar ninguém', () => {
    for (let s = 0; s < 200; s++) {
      const a = randomAppearance(createRng(s * 3 + 1), 'fem');
      for (const eixo of FACE_AXES) {
        const { min, max } = FACE_RANGE[eixo];
        expect(a[eixo], `${eixo} no sorteio ${s}`).toBeGreaterThanOrEqual(min);
        expect(a[eixo], `${eixo} no sorteio ${s}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('o botão da tela sorteia dentro do gênero escolhido', () => {
    const { tela, vistos } = montarTela({ ...DEFAULT_APPEARANCE, sex: 'masc' }, true);
    irPara(tela, 'Ajustes');
    const dado = Array.from(tela.element.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      (b.textContent ?? '').includes('Aleatório'),
    );
    expect(dado).toBeDefined();
    for (let i = 0; i < 25; i++) dado?.click();
    expect(vistos.length).toBeGreaterThan(0);
    for (const a of vistos) {
      expect(a.sex).toBe('masc');
      expect(CREATOR_HAIR_BY_SEX.masc).toContain(a.hairStyle);
      expect(CREATOR_OUTFITS_BY_SEX.masc).toContain(a.outfit);
    }
  });
});

describe('Criador 2.0 — a silhueta chega ao corpo', () => {
  it('o jogador marcado Ele recebe corpo masculino, e Ela o de referência', () => {
    const ele = new Avatar({ ...DEFAULT_APPEARANCE, sex: 'masc' });
    const ela = new Avatar({ ...DEFAULT_APPEARANCE, sex: 'fem' });
    expect(ele.shape.id).toBe('masc');
    expect(ela.shape.id).toBe('fem');
  });

  it('trocar de gênero reconstrói o corpo, e volta igual', () => {
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE, sex: 'fem' });
    const metricas = () => (avatar as unknown as { metrics: Record<string, number> }).metrics;
    const ombroFem = metricas().shoulderX;
    const cinturaFem = metricas().waistWidth;
    avatar.setAppearance({ ...DEFAULT_APPEARANCE, sex: 'masc' });
    expect(avatar.shape.id).toBe('masc');
    expect(metricas().shoulderX).toBeGreaterThan(ombroFem);
    expect(metricas().waistWidth).toBeLessThan(cinturaFem);
    avatar.setAppearance({ ...DEFAULT_APPEARANCE, sex: 'fem' });
    expect(avatar.shape.id).toBe('fem');
    expect(metricas().shoulderX).toBeCloseTo(ombroFem, 10);
    expect(metricas().waistWidth).toBeCloseTo(cinturaFem, 10);
  });

  it('a ficha oficial manda mais que o sexo declarado', () => {
    // O Aérion tem a aparência marcada `fem` por herança do panteão e
    // a silhueta `masc` por ficha. A ficha ganha — senão o Criador
    // perderia o corpo no dia em que alguém arrumasse o outro campo.
    const aerion = createOfficialAvatar('aerion');
    expect(aerion?.appearance.sex).toBe('fem');
    expect(aerion?.shape.id).toBe('masc');
  });

  it('funciona nos quatro níveis gráficos', () => {
    for (const nivel of Object.keys(BODY_DETAIL) as (keyof typeof BODY_DETAIL)[]) {
      for (const sex of SEXOS) {
        const avatar = new Avatar({ ...DEFAULT_APPEARANCE, sex });
        avatar.setDetail(nivel);
        expect(avatar.shape.id, `${sex} em ${nivel}`).toBe(sex);
        // O corpo é privado: o que se confere de fora é que a troca de
        // nível não derruba a silhueta nem o avatar.
        expect(avatar.root.children.length, `${sex} em ${nivel}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('Criador 2.0 — rosto', () => {
  it('os quatro eixos nascem neutros e sobrevivem ao salvamento', () => {
    for (const eixo of FACE_AXES) expect(DEFAULT_APPEARANCE[eixo]).toBe(1);
    const salvo = JSON.parse(JSON.stringify({ ...DEFAULT_APPEARANCE, faceEye: 1.12, faceMouth: 0.9 }));
    const lido = sanitizeAppearance(salvo);
    expect(lido.faceEye).toBe(1.12);
    expect(lido.faceMouth).toBe(0.9);
  });

  it('save anterior a esta fase abre com o rosto de sempre', () => {
    // Sem os campos: é o que todo save gravado antes da Fase 1.1 tem.
    const antigo = sanitizeAppearance({ skin: '#f6c9a4', hairStyle: 'longo', outfit: 'aero' });
    for (const eixo of FACE_AXES) expect(antigo[eixo], eixo).toBe(1);
  });

  it('valor fora da faixa é preso na faixa, e lixo vira neutro', () => {
    const exagerado = sanitizeAppearance({ faceEye: 99, faceBrow: -4 });
    expect(exagerado.faceEye).toBe(FACE_RANGE.faceEye.max);
    expect(exagerado.faceBrow).toBe(FACE_RANGE.faceBrow.min);
    const lixo = sanitizeAppearance({ faceEye: 'grande', faceMouth: null });
    expect(lixo.faceEye).toBe(1);
    expect(lixo.faceMouth).toBe(1);
  });

  it('a etapa de rosto oferece os quatro eixos', () => {
    const { tela } = montarTela(DEFAULT_APPEARANCE, true);
    irPara(tela, 'Rosto');
    const reguas = tela.element.querySelectorAll('input[type="range"]');
    expect(reguas.length).toBe(FACE_AXES.length);
  });
});

describe('Criador 2.0 — a reposição do acervo', () => {
  const CABELOS_NOVOS = ['pixie', 'rabolateral', 'coques', 'ondas', 'meiopreso', 'franjao', 'repicado', 'trancinhas', 'moicano'] as const;
  const ROUPAS_NOVAS = ['saia', 'maio', 'tunica', 'macacao', 'jaqueta'] as const;

  it('o acervo feminino volta ao tamanho que tinha, agora sem peça de deusa', () => {
    // Antes da Fase 1.1 a tela feminina mostrava vinte cabelos, dos
    // quais nove eram do Panteão. Depois da limpeza sobraram onze;
    // com a reposição são vinte outra vez, e os vinte são comuns.
    expect(CREATOR_HAIR_BY_SEX.fem).toHaveLength(20);
    for (const peca of CREATOR_HAIR_BY_SEX.fem) expect(GODDESS_ONLY_HAIR.has(peca), peca).toBe(false);
    // As roupas: cinco legítimas antes, dez agora, e o mesmo número
    // dos dois lados.
    expect(CREATOR_OUTFITS_BY_SEX.fem).toHaveLength(10);
    expect(CREATOR_OUTFITS_BY_SEX.masc).toHaveLength(10);
  });

  it('nenhuma peça nova é um penteado ou um traje já existente de outra cor', () => {
    // Recolorir não devolve variedade: o que se lê de longe é a
    // silhueta. Cada peça nova tem de mudar a malha, e nenhuma pode
    // sair igual a outra.
    const assinatura = (o: Partial<AvatarAppearance>): string => {
      const avatar = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle: 'careca', outfit: 'casual', ...o });
      const pos = (avatar as unknown as { body: { geometry: { getAttribute(n: string): { array: ArrayLike<number>; count: number } } } }).body.geometry.getAttribute('position');
      let h = 2166136261;
      for (let i = 0; i < pos.array.length; i += 1) {
        h ^= Math.round(pos.array[i] * 10000);
        h = Math.imul(h, 16777619);
      }
      return `${pos.count}:${h >>> 0}`;
    };
    const vistas = new Map<string, string>();
    vistas.set(assinatura({}), 'careca+casual');
    for (const peca of CABELOS_NOVOS) {
      const a = assinatura({ hairStyle: peca });
      expect(vistas.has(a), `${peca} repete ${vistas.get(a)}`).toBe(false);
      vistas.set(a, peca);
    }
    for (const peca of ROUPAS_NOVAS) {
      const a = assinatura({ outfit: peca });
      expect(vistas.has(a), `${peca} repete ${vistas.get(a)}`).toBe(false);
      vistas.set(a, peca);
    }
  });

  it('as peças novas chegam à tela, no catálogo certo', () => {
    const { tela } = montarTela({ ...DEFAULT_APPEARANCE, sex: 'fem' }, true);
    irPara(tela, 'Cabelo');
    const cabelos = rotulos(tela);
    for (const peca of CABELOS_NOVOS) expect(cabelos, peca).toContain(HAIR_LABELS[peca]);
    irPara(tela, 'Roupa');
    const roupas = rotulos(tela);
    for (const peca of ROUPAS_NOVAS) expect(roupas, peca).toContain(OUTFIT_LABELS[peca]);

    const { tela: dele } = montarTela({ ...DEFAULT_APPEARANCE, sex: 'masc' }, true);
    irPara(dele, 'Roupa');
    const roupasDele = rotulos(dele);
    // Macacão, túnica e jaqueta servem aos dois; saia e maiô, não.
    expect(roupasDele).toContain(OUTFIT_LABELS.macacao);
    expect(roupasDele).not.toContain(OUTFIT_LABELS.saia);
    expect(roupasDele).not.toContain(OUTFIT_LABELS.maio);
  });

  it('as peças novas não encarecem o avatar além do que ele já custava', () => {
    const custo = (hairStyle: AvatarAppearance['hairStyle']): number => {
      const avatar = new Avatar({ ...DEFAULT_APPEARANCE, hairStyle, outfit: 'aero' });
      return (avatar as unknown as { body: { geometry: { getAttribute(n: string): { count: number } } } }).body.geometry.getAttribute('position').count;
    };
    // O `cacheado` é o corte mais caro que o Éden já aceitava. Nenhum
    // dos novos pode passar dele: o teto de vértices do avatar é o
    // mesmo de antes da fase.
    const teto = custo('cacheado');
    for (const peca of CABELOS_NOVOS) expect(custo(peca), peca).toBeLessThanOrEqual(teto);
  });

  it('o sorteio alcança as peças novas, sem nunca sair do catálogo', () => {
    const saiu = new Set<string>();
    for (let s = 0; s < 600; s++) {
      const a = randomAppearance(createRng(s * 17 + 3), 'fem');
      saiu.add(a.hairStyle);
      saiu.add(a.outfit);
      expect(CREATOR_HAIR_BY_SEX.fem).toContain(a.hairStyle);
      expect(CREATOR_OUTFITS_BY_SEX.fem).toContain(a.outfit);
    }
    for (const peca of CABELOS_NOVOS) expect(saiu.has(peca), `${peca} nunca saiu`).toBe(true);
    for (const peca of ROUPAS_NOVAS) expect(saiu.has(peca), `${peca} nunca saiu`).toBe(true);
  });
});

describe('Criador 2.0 — quem já jogava não perde nada', () => {
  it('a peça de deusa já vestida continua na ficha e aparece marcada', () => {
    const veterana: AvatarAppearance = { ...DEFAULT_APPEARANCE, sex: 'fem', outfit: 'aurora' };
    // O saneamento não a derruba: a peça continua existindo no jogo.
    expect(sanitizeAppearance(veterana).outfit).toBe('aurora');
    const { tela } = montarTela(veterana, true);
    irPara(tela, 'Roupa');
    const mostrados = rotulos(tela);
    expect(mostrados.some((r) => r.includes(OUTFIT_LABELS.aurora))).toBe(true);
    expect(mostrados.some((r) => r.includes('seu visual atual'))).toBe(true);
    expect(tela.element.querySelector('.group__note')).not.toBeNull();
  });

  it('a herança entra no fim da lista e não vira catálogo', () => {
    const catalogo = CREATOR_OUTFITS_BY_SEX.fem;
    const comHeranca = catalogWithLegacy(catalogo, 'aurora');
    expect(comHeranca.at(-1)).toBe('aurora');
    expect(comHeranca).toHaveLength(catalogo.length + 1);
    expect(isLegacyPiece(catalogo, 'aurora')).toBe(true);
    // Peça do próprio catálogo não é duplicada nem marcada.
    expect(catalogWithLegacy(catalogo, catalogo[0])).toHaveLength(catalogo.length);
    expect(isLegacyPiece(catalogo, catalogo[0])).toBe(false);
  });

  it('o jogador comum não tem silhueta fixada, então pode mudar de ideia', () => {
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE, sex: 'fem' });
    avatar.setAppearance({ ...DEFAULT_APPEARANCE, sex: 'masc' });
    expect(avatar.shape.id).toBe('masc');
  });
});
