// @vitest-environment happy-dom
//
// Auditoria da Fase 1.1: comportamento ponta a ponta do criador, com o
// SaveSystem de verdade no meio do caminho, e os achados visuais que a
// inspeção pegou. Cada caso aqui nasceu de uma coisa que foi olhada e
// não de uma coisa que foi suposta.
import { beforeEach, describe, expect, it } from 'vitest';
import { AvatarCreatorScreen } from '../../src/interface/AvatarCreator';
import {
  type AvatarAppearance,
  CREATOR_HAIR_BY_SEX,
  CREATOR_OUTFITS_BY_SEX,
  DEFAULT_APPEARANCE,
  FACE_AXES,
  GODDESS_ONLY_HAIR,
  GODDESS_ONLY_OUTFIT,
  type Sex,
  coerceAppearanceToSex,
  randomAppearance,
  sanitizeAppearance,
} from '../../src/player/AvatarAppearance';
import { Avatar } from '../../src/player/Avatar';
import { createOfficialAvatar } from '../../src/characters/CharacterModels';
import { PANTHEON } from '../../src/characters/Pantheon';
import { SAVE_VERSION, SaveSystem, createNewSave, sanitizeSave } from '../../src/systems/SaveSystem';
import { makeCitizen } from '../../src/npc/CitizenData';
import { createRng } from '../../src/utils/math';

function halo(avatar: Avatar): boolean {
  let visivel = false;
  avatar.root.traverse((o) => {
    if (o.name === 'halo') visivel = o.visible;
  });
  return visivel;
}

describe('Auditoria — a auréola acende na construção', () => {
  it('um avatar construído com auréola já nasce com ela', () => {
    // Achado da inspeção visual: o construtor deixava `halo.visible`
    // em falso e só a troca de aparência acendia. Quem vinha de um
    // save, ou era criado de uma vez, ficava sem.
    expect(halo(new Avatar({ ...DEFAULT_APPEARANCE, accessory: 'aureola' }))).toBe(true);
    expect(halo(new Avatar({ ...DEFAULT_APPEARANCE, accessory: 'nenhum' }))).toBe(false);
  });

  it('o Aérion oficial tem a auréola da ficha dele', () => {
    const aerion = createOfficialAvatar('aerion');
    expect(aerion).not.toBeNull();
    expect(aerion!.appearance.accessory).toBe('aureola');
    expect(halo(aerion!)).toBe(true);
  });

  it('tirar e pôr a auréola continua funcionando depois de construído', () => {
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE, accessory: 'nenhum' });
    avatar.setAppearance({ ...DEFAULT_APPEARANCE, accessory: 'aureola' });
    expect(halo(avatar)).toBe(true);
    avatar.setAppearance({ ...DEFAULT_APPEARANCE, accessory: 'oculos' });
    expect(halo(avatar)).toBe(false);
  });
});

describe('Auditoria — comportamento do criador, ponta a ponta', () => {
  function abrir(appearance: AvatarAppearance, editing = false) {
    const vistos: AvatarAppearance[] = [];
    let confirmado: { name: string; appearance: AvatarAppearance } | null = null;
    const tela = new AvatarCreatorScreen({
      onPreview: (a) => vistos.push(a),
      onConfirm: (name, a) => {
        confirmado = { name, appearance: a };
      },
      onCancel: () => {},
      onRotate: () => {},
    });
    tela.configure('Viajante', appearance, editing);
    const etapa = (nome: string) => {
      const aba = Array.from(tela.element.querySelectorAll<HTMLButtonElement>('.stepper__item')).find((b) =>
        (b.textContent ?? '').includes(nome),
      );
      if (!aba) throw new Error(`sem etapa ${nome}`);
      aba.click();
    };
    const chips = () => Array.from(tela.element.querySelectorAll<HTMLButtonElement>('.chip'));
    return { tela, vistos, etapa, chips, pego: () => confirmado };
  }

  it('trocar de Ele para Ela no meio da criação conserta a peça incompatível', () => {
    const { tela, vistos, etapa, chips } = abrir({ ...DEFAULT_APPEARANCE, sex: 'fem' });
    tela.element.querySelector<HTMLButtonElement>('.sex-card[data-sex="masc"]')!.click();
    etapa('Cabelo');
    // Escolhe um cabelo que só Ele tem.
    const social = chips().find((c) => (c.textContent ?? '').includes('Social'));
    expect(social).toBeDefined();
    social!.click();
    expect(vistos.at(-1)!.hairStyle).toBe('social');
    // Volta para Ela: o cabelo masculino não pode sobreviver.
    etapa('Ajustes');
    chips()
      .find((c) => (c.textContent ?? '').trim() === 'Ela')!
      .click();
    const agora = vistos.at(-1)!;
    expect(agora.sex).toBe('fem');
    expect(CREATOR_HAIR_BY_SEX.fem).toContain(agora.hairStyle);
    expect(agora.hairStyle).not.toBe('social');
  });

  it('o que a tela confirma é exatamente o que ela mostrou por último', () => {
    const { tela, vistos, etapa, chips, pego } = abrir({ ...DEFAULT_APPEARANCE, sex: 'fem' }, true);
    etapa('Cabelo');
    chips()[3].click();
    etapa('Roupa');
    chips()[2].click();
    const ultimo = vistos.at(-1)!;
    // O botão de fechar só existe na última etapa: é o desenho do
    // fluxo, e o caso atravessa a trilha em vez de contorná-la.
    etapa('Pronto');
    const confirmar = Array.from(tela.element.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      /entrar em aurora|salvar visual/i.test(b.textContent ?? ''),
    );
    expect(confirmar, 'a etapa final precisa ter o botão que fecha o criador').toBeDefined();
    confirmar!.click();
    expect(pego()).not.toBeNull();
    expect(pego()!.appearance).toEqual(ultimo);
  });

  it('o Aleatório da tela nunca troca o gênero nem vaza peça', () => {
    for (const sex of ['masc', 'fem'] as Sex[]) {
      const { tela, vistos, etapa } = abrir({ ...DEFAULT_APPEARANCE, sex }, true);
      etapa('Ajustes');
      const dado = Array.from(tela.element.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        (b.textContent ?? '').includes('Aleatório'),
      );
      expect(dado).toBeDefined();
      for (let i = 0; i < 40; i++) dado!.click();
      expect(vistos.length).toBeGreaterThan(30);
      for (const a of vistos) {
        expect(a.sex).toBe(sex);
        expect(CREATOR_HAIR_BY_SEX[sex]).toContain(a.hairStyle);
        expect(CREATOR_OUTFITS_BY_SEX[sex]).toContain(a.outfit);
        expect(GODDESS_ONLY_HAIR.has(a.hairStyle)).toBe(false);
        expect(GODDESS_ONLY_OUTFIT.has(a.outfit)).toBe(false);
      }
    }
  });

  it('as réguas de rosto mexem na ficha e nada mais', () => {
    const { tela, vistos, etapa } = abrir({ ...DEFAULT_APPEARANCE, sex: 'fem' }, true);
    etapa('Rosto');
    const reguas = Array.from(tela.element.querySelectorAll<HTMLInputElement>('input[type="range"]'));
    expect(reguas).toHaveLength(FACE_AXES.length);
    reguas[0].value = String(Number(reguas[0].max));
    reguas[0].dispatchEvent(new Event('input', { bubbles: true }));
    const depois = vistos.at(-1)!;
    expect(depois.faceEye).toBeGreaterThan(1);
    expect(depois.hairStyle).toBe(DEFAULT_APPEARANCE.hairStyle);
    expect(depois.outfit).toBe(DEFAULT_APPEARANCE.outfit);
    expect(depois.height).toBe(DEFAULT_APPEARANCE.height);
  });
});

describe('Auditoria — persistência com o SaveSystem de verdade', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('salvar e carregar devolve a ficha inteira, inclusive sexo e rosto', () => {
    const ficha: AvatarAppearance = {
      ...DEFAULT_APPEARANCE,
      sex: 'masc',
      hairStyle: 'moicano',
      outfit: 'macacao',
      accessory: 'aureola',
      faceEye: 1.12,
      faceEyeGap: 0.93,
      faceBrow: 1.18,
      faceMouth: 0.88,
      height: 1.07,
    };
    const sistema = new SaveSystem(localStorage);
    const dados = createNewSave();
    dados.profile.appearance = ficha;
    dados.profile.created = true;
    expect(sistema.save(dados)).toBe(true);

    // Outro sistema, mesma gaveta: é o que acontece ao reabrir o jogo.
    const lido = new SaveSystem(localStorage).load().data;
    expect(lido).not.toBeNull();
    expect(lido!.profile.appearance).toEqual(ficha);
    // E o avatar reconstruído do save é o mesmo avatar.
    const avatar = new Avatar(lido!.profile.appearance);
    expect(avatar.shape.id).toBe('masc');
    expect(halo(avatar)).toBe(true);
  });

  it('o save não sobe de versão por causa desta fase', () => {
    expect(SAVE_VERSION).toBe(3);
    const novo = createNewSave();
    expect(novo.version).toBe(3);
  });

  it('save da versão 1, sem sexo e sem rosto, abre sem perder nada do resto', () => {
    const antigo = {
      version: 1,
      createdAt: 1,
      updatedAt: 2,
      profile: { name: 'Antiga', appearance: { skin: '#f6c9a4', hairStyle: 'longo', outfit: 'aero', accessory: 'oculos', height: 1.02 }, created: true },
      world: { hours: 9, day: 4 },
    };
    const lido = sanitizeSave(antigo);
    expect(lido).not.toBeNull();
    const a = lido!.profile.appearance;
    expect(a.hairStyle).toBe('longo');
    expect(a.outfit).toBe('aero');
    expect(a.accessory).toBe('oculos');
    expect(a.height).toBeCloseTo(1.02, 5);
    // Os campos que a fase criou entram no neutro, nunca no sorteio.
    expect(a.sex).toBe('fem');
    for (const eixo of FACE_AXES) expect(a[eixo], eixo).toBe(1);
    expect(lido!.profile.name).toBe('Antiga');
    expect(lido!.world.day).toBe(4);
  });

  it('save com peça de deusa gravada não é derrubado pelo saneamento', () => {
    const veterana = sanitizeAppearance({ sex: 'fem', hairStyle: 'cascata', outfit: 'aurora', accessory: 'lentes' });
    expect(veterana.hairStyle).toBe('cascata');
    expect(veterana.outfit).toBe('aurora');
    expect(veterana.accessory).toBe('lentes');
  });

  it('a ficha sobrevive a dez idas e voltas sem derivar', () => {
    let a = randomAppearance(createRng(99), 'masc');
    const primeira = { ...a };
    for (let i = 0; i < 10; i++) a = sanitizeAppearance(JSON.parse(JSON.stringify(a)));
    expect(a).toEqual(primeira);
  });
});

describe('Auditoria — integridade do universo', () => {
  it('nenhum cidadão sorteado usa peça do Panteão', () => {
    for (let seed = 0; seed < 400; seed++) {
      const c = makeCitizen(seed);
      expect(GODDESS_ONLY_HAIR.has(c.appearance.hairStyle), `cidadão ${seed}`).toBe(false);
      expect(GODDESS_ONLY_OUTFIT.has(c.appearance.outfit), `cidadão ${seed}`).toBe(false);
      expect(c.appearance.hairStyle).not.toBe('cosmos');
      expect(c.appearance.outfit).not.toBe('criador');
    }
  });

  it('o corpo do cidadão combina com o sexo da ficha dele', () => {
    // Quarenta, e não cento e vinte: cada avatar aqui é uma malha
    // inteira (~40 ms), e sob a carga da suíte completa o caso
    // estourava os 5 s de limite. A varredura larga de catálogo fica
    // no caso seguinte, que confere 400 fichas sem construir corpo.
    for (let seed = 0; seed < 40; seed++) {
      const c = makeCitizen(seed);
      const avatar = new Avatar(c.appearance);
      expect(avatar.shape.id, `cidadão ${seed}`).toBe(c.appearance.sex);
    }
  });

  it('o cidadão só veste o que o catálogo do sexo dele oferece', () => {
    for (let seed = 0; seed < 400; seed++) {
      const c = makeCitizen(seed);
      const sex = c.appearance.sex;
      expect([...CREATOR_HAIR_BY_SEX[sex], 'cascata'], `cidadão ${seed} cabelo`).toContain(c.appearance.hairStyle);
      expect(CREATOR_OUTFITS_BY_SEX[sex], `cidadão ${seed} roupa`).toContain(c.appearance.outfit);
    }
  });

  it('as onze fichas oficiais continuam com a silhueta e o rosto de origem', () => {
    for (const f of PANTHEON) {
      const avatar = createOfficialAvatar(f.id)!;
      expect(avatar.shape.id, f.id).toBe(f.id === 'aerion' ? 'masc' : 'fem');
      for (const eixo of FACE_AXES) expect(f.appearance[eixo], `${f.id}.${eixo}`).toBe(1);
    }
  });

  it('coerceAppearanceToSex nunca inventa peça fora do catálogo', () => {
    // Mil fichas tortas de propósito: cada peça do acervo de um lado
    // empurrada para o outro lado.
    for (const destino of ['masc', 'fem'] as Sex[]) {
      const origem: Sex = destino === 'masc' ? 'fem' : 'masc';
      for (const h of CREATOR_HAIR_BY_SEX[origem]) {
        for (const o of CREATOR_OUTFITS_BY_SEX[origem]) {
          const r = coerceAppearanceToSex({ ...DEFAULT_APPEARANCE, sex: origem, hairStyle: h, outfit: o }, destino);
          expect(CREATOR_HAIR_BY_SEX[destino], `${h}→${destino}`).toContain(r.hairStyle);
          expect(CREATOR_OUTFITS_BY_SEX[destino], `${o}→${destino}`).toContain(r.outfit);
          expect(r.sex).toBe(destino);
        }
      }
    }
  });
});
