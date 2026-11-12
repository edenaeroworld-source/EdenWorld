// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AFTERS_PRODUCTS, defaultAftersConfig, type AftersConfig } from '../../src/afters/AftersCatalog';
import { MemoryFlags, DialogueRunner } from '../../src/characters/Dialogue';
import { PANTHEON, getCharacter } from '../../src/characters/Pantheon';
import { EdenSocial } from '../../src/edenos/EdenSocial';
import { LIBRARY, libraryFor } from '../../src/edenos/Library';
import { type EdenAppsHost, buildAfters, buildFeed, buildGram, buildMusic, buildPeople, buildReads, buildTalk } from '../../src/interface/EdenApps';
import { DialogueScreen } from '../../src/interface/DialogueScreen';

/**
 * Telas do EdenOS e da conversa, desenhadas de verdade em um DOM.
 *
 * O objetivo é garantir que os aplicativos não sejam enfeite: cada botão
 * precisa chamar o jogo, e cada tela precisa mostrar o estado real.
 */

/** Hospedeiro de teste: guarda o estado como o Engine faria. */
function makeHost(overrides: Partial<EdenAppsHost> = {}) {
  const social = new EdenSocial();
  let afters: AftersConfig = defaultAftersConfig();
  let music = { enabled: true, volume: 0.55 };
  const calls = { camera: 0, deleted: [] as string[] };
  const host: EdenAppsHost = {
    playerName: () => 'Aurora',
    clockLabel: () => '18:40',
    areaName: () => 'Praça Central',
    metCharacters: () => social.contactIds,
    citizensMet: () => social.citizenCount,
    threads: () => social.threads(),
    markThreadRead: (id) => social.markThreadRead(id),
    photos: () => social.photos,
    deletePhoto: (id) => {
      calls.deleted.push(id);
      social.removePhoto(id);
    },
    openGramCamera: () => {
      calls.camera += 1;
    },
    feed: () =>
      social.feed({
        playerName: 'Aurora',
        clock: '18:40',
        weather: 'Céu limpo',
        area: 'Praça Central',
        day: 2,
        crystals: [3, 24],
        areas: [4, 11],
        portals: [1, 8],
        night: false,
        hasFlag: () => false,
      }),
    library: () => libraryFor(() => false),
    afters: () => afters,
    setAfters: (patch) => {
      afters = { ...afters, ...patch };
    },
    musicEnabled: () => music.enabled,
    musicVolume: () => music.volume,
    setMusic: (patch) => {
      music = { ...music, ...patch };
    },
    ...overrides,
  };
  return { host, social, calls, state: () => ({ afters, music }) };
}

let content: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '';
  content = document.createElement('div');
  document.body.appendChild(content);
});

const text = () => content.textContent ?? '';

describe('EdenFeed', () => {
  it('desenha um cartão por publicação, com autor e etiqueta', () => {
    const { host } = makeHost();
    buildFeed(host, content);
    const posts = content.querySelectorAll('.post');
    expect(posts.length).toBeGreaterThan(3);
    expect(content.querySelectorAll('.post__avatar').length).toBe(posts.length);
    expect(text()).toContain('EdenFeed');
  });

  it('avisa que nada sai do aparelho', () => {
    const { host } = makeHost();
    buildFeed(host, content);
    expect(content.querySelector('.eden-note')?.textContent).toMatch(/não há conta, servidor nem envio de dados/i);
  });
});

describe('EdenGram', () => {
  it('mostra o álbum vazio e abre a câmera do jogo', () => {
    const { host, calls } = makeHost();
    buildGram(host, content, () => {});
    expect(text()).toContain('Álbum vazio');
    const camera = content.querySelector('button');
    expect(camera?.textContent).toContain('Tirar foto');
    camera?.click();
    expect(calls.camera).toBe(1);
  });

  it('mostra as fotos guardadas e apaga de verdade', () => {
    const { host, social, calls } = makeHost();
    social.addPhoto({ id: 'p1', data: 'data:image/jpeg;base64,AAAA', place: 'Píer', clock: '07:10', at: 1 });
    social.addPhoto({ id: 'p2', data: 'data:image/jpeg;base64,BBBB', place: 'Orla', clock: '08:10', at: 2 });
    const refresh = vi.fn();
    buildGram(host, content, refresh);
    const images = content.querySelectorAll<HTMLImageElement>('.gram__img');
    expect(images.length).toBe(2);
    expect(images[0].src).toContain('data:image/jpeg');
    expect(text()).toContain('Píer');
    content.querySelector<HTMLButtonElement>('.gram__del')?.click();
    expect(calls.deleted.length).toBe(1);
    expect(refresh).toHaveBeenCalled();
    expect(social.photos.length).toBe(1);
  });
});

describe('EdenTalk', () => {
  it('explica como conseguir contatos quando não há conversas', () => {
    const { host } = makeHost();
    buildTalk(host, content, null, () => {});
    expect(text()).toContain('Nenhuma conversa ainda');
  });

  it('lista conversas, marca as novas e abre a escolhida', () => {
    const { host, social } = makeHost();
    social.meet('haru');
    social.meet('lilly');
    const onSelect = vi.fn();
    buildTalk(host, content, null, onSelect);
    const items = content.querySelectorAll('.list-btn');
    expect(items.length).toBe(2);
    expect(content.querySelectorAll('.tagdot').length).toBe(2);
    items[0].dispatchEvent(new Event('click'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('abre a conversa, marca como lida e é honesta sobre não haver resposta', () => {
    const { host, social } = makeHost();
    social.meet('haru');
    buildTalk(host, content, 'haru', () => {});
    expect(content.querySelectorAll('.bubble').length).toBeGreaterThan(0);
    expect(text()).toContain('Haru');
    expect(text()).toMatch(/pessoalmente em Aurora City/i);
    expect(social.unreadCount).toBe(0);
  });
});

describe('Pessoas', () => {
  it('esconde quem ainda não foi encontrado e revela quem já foi', () => {
    const { host, social } = makeHost();
    social.meet('saturno');
    buildPeople(host, content, () => {});
    expect(content.querySelectorAll('.person').length).toBe(PANTHEON.length);
    expect(content.querySelectorAll('.person.is-unknown').length).toBe(PANTHEON.length - 1);
    expect(text()).toContain('Saturno');
    expect(text()).toContain('???');
  });

  it('não inventa domínio para Amara', () => {
    const { host, social } = makeHost();
    social.meet('amara');
    buildPeople(host, content, () => {});
    expect(text()).toContain('ainda não declarado pelo cânone do Éden');
  });

  it('leva da ficha para a conversa no EdenTalk', () => {
    const { host, social } = makeHost();
    social.meet('maze');
    const onTalk = vi.fn();
    buildPeople(host, content, onTalk);
    const open = [...content.querySelectorAll('button')].find((button) => button.textContent?.includes('Abrir conversa'));
    open?.click();
    expect(onTalk).toHaveBeenCalledWith('maze');
  });
});

describe('EdenReads', () => {
  it('agrupa o acervo por prateleira e abre um documento', () => {
    const { host } = makeHost();
    const onSelect = vi.fn();
    buildReads(host, content, null, onSelect);
    expect(text()).toContain('Universo');
    expect(content.querySelectorAll('.list-btn').length).toBe(libraryFor(() => false).length);
    content.querySelector('.list-btn')?.dispatchEvent(new Event('click'));
    expect(onSelect).toHaveBeenCalled();
  });

  it('mostra o texto completo do documento escolhido', () => {
    const { host } = makeHost();
    const document_ = LIBRARY.find((entry) => !entry.requiresFlag)!;
    buildReads(host, content, document_.id, () => {});
    expect(text()).toContain(document_.title);
    expect(text()).toContain(document_.paragraphs[0].slice(0, 40));
  });
});

describe('Afters', () => {
  it('fica trancado até Luma liberar, sem botões que não fazem nada', () => {
    const { host } = makeHost();
    buildAfters(host, content, () => {});
    expect(text()).toContain('Painel bloqueado');
    expect(text()).toContain('Luma');
    expect(content.querySelectorAll('button').length).toBe(0);
  });

  it('liga um produto e guarda a escolha', () => {
    const { host, state } = makeHost({});
    host.setAfters({ unlocked: true });
    const refresh = vi.fn();
    buildAfters(host, content, refresh);
    const items = content.querySelectorAll('.list-btn');
    expect(items.length).toBe(AFTERS_PRODUCTS.length);
    items[0].dispatchEvent(new Event('click'));
    expect(state().afters.productId).toBe(AFTERS_PRODUCTS[0].id);
    expect(state().afters.color).toBe(AFTERS_PRODUCTS[0].color);
    expect(refresh).toHaveBeenCalled();
  });

  it('oferece sempre o desligamento manual quando algo está ligado', () => {
    const { host, state } = makeHost();
    host.setAfters({ unlocked: true, productId: AFTERS_PRODUCTS[1].id });
    buildAfters(host, content, () => {});
    const off = [...content.querySelectorAll('button')].find((button) => button.textContent?.includes('Desligar tudo'));
    expect(off).toBeDefined();
    off?.click();
    expect(state().afters.productId).toBeNull();
  });

  it('troca a cor pela paleta e ajusta a intensidade', () => {
    const { host, state } = makeHost();
    host.setAfters({ unlocked: true, productId: AFTERS_PRODUCTS[0].id });
    buildAfters(host, content, () => {});
    const swatches = content.querySelectorAll<HTMLButtonElement>('.swatch--pick');
    expect(swatches.length).toBeGreaterThan(4);
    swatches[2].click();
    expect(state().afters.color).toBe('#7fd6ff');
    const range = content.querySelector<HTMLInputElement>('input[type="range"]');
    expect(range).not.toBeNull();
    range!.value = '0.3';
    range!.dispatchEvent(new Event('input'));
    expect(state().afters.intensity).toBeCloseTo(0.3, 5);
  });

  it('descreve o efeito como estético, sem anatomia', () => {
    const { host } = makeHost();
    host.setAfters({ unlocked: true });
    buildAfters(host, content, () => {});
    const lower = text().toLowerCase();
    expect(lower).toContain('aura');
    for (const forbidden of ['seio', 'busto', 'peito', 'nádega', 'quadril', 'decote']) expect(lower).not.toContain(forbidden);
  });
});

describe('EdenMusic', () => {
  it('liga e desliga a trilha de verdade, e admite que ela é procedural', () => {
    const { host, state } = makeHost();
    buildMusic(host, content, () => {});
    expect(text().toLowerCase()).toContain('procedural');
    const toggleButton = content.querySelector<HTMLButtonElement>('button[role="switch"]');
    expect(toggleButton).not.toBeNull();
    toggleButton!.click();
    expect(state().music.enabled).toBe(false);
  });

  it('não promete um catálogo de artistas que ainda não existe', () => {
    const { host } = makeHost();
    buildMusic(host, content, () => {});
    expect(text().toLowerCase()).toMatch(/não existe|ainda não/);
  });
});

describe('tela de conversa', () => {
  it('mostra fala, papel e escolhas do personagem', () => {
    const character = getCharacter('haru')!;
    const runner = new DialogueRunner(character.dialogue, new MemoryFlags());
    const screen = new DialogueScreen({
      speaker: { name: character.name, title: character.title, color: character.colors[0], place: character.place.label },
      runner,
      onEffects: () => {},
      onClose: () => {},
    });
    document.body.appendChild(screen.element);
    expect(screen.element.textContent).toContain('Haru');
    expect(screen.element.textContent).toContain(character.title);
    expect(screen.element.querySelectorAll('.talk__choices .btn').length).toBeGreaterThan(1);
  });

  it('entrega os efeitos da conversa ao jogo (contato, diário, bandeira)', () => {
    const character = getCharacter('luma')!;
    const flags = new MemoryFlags();
    const effects: string[] = [];
    const screen = new DialogueScreen({
      speaker: { name: character.name, title: character.title, color: character.colors[0] },
      runner: new DialogueRunner(character.dialogue, flags),
      onEffects: (list) => {
        for (const effect of list) effects.push(`${effect.kind}:${effect.id}`);
      },
      onClose: () => {},
    });
    document.body.appendChild(screen.element);
    expect(effects).toContain('contato:luma');
    expect(effects.some((entry) => entry.startsWith('diario:'))).toBe(true);
    expect(flags.has('conheceu-luma')).toBe(true);
  });

  it('avança ao clicar numa escolha e termina com o botão de encerrar', () => {
    const character = getCharacter('nexara')!;
    const closed = vi.fn();
    const screen = new DialogueScreen({
      speaker: { name: character.name, title: character.title, color: character.colors[0] },
      runner: new DialogueRunner(character.dialogue, new MemoryFlags()),
      onEffects: () => {},
      onClose: closed,
    });
    document.body.appendChild(screen.element);
    const before = screen.element.querySelector('.talk__text')?.textContent;
    screen.element.querySelector<HTMLButtonElement>('.talk__choices .btn')?.click();
    expect(screen.element.querySelector('.talk__text')?.textContent).not.toBe(before);
    // Encerra pelo botão Voltar da interface.
    screen.onBack();
    expect(closed).toHaveBeenCalled();
  });

  it('libera o painel Afters quando Luma concede a tecnologia', () => {
    const character = getCharacter('luma')!;
    const flags = new MemoryFlags();
    const effects: string[] = [];
    const runner = new DialogueRunner(character.dialogue, flags);
    const screen = new DialogueScreen({
      speaker: { name: character.name, title: character.title, color: character.colors[0] },
      runner,
      onEffects: (list) => {
        for (const effect of list) effects.push(effect.kind);
      },
      onClose: () => {},
    });
    document.body.appendChild(screen.element);
    // Percorre a conversa inteira em largura, clicando em cada escolha disponível.
    for (let guard = 0; guard < 24 && !runner.isFinished; guard++) {
      const buttons = screen.element.querySelectorAll<HTMLButtonElement>('.talk__choices .btn');
      if (buttons.length === 0) break;
      if (effects.includes('afters')) break;
      buttons[0].click();
    }
    expect(effects).toContain('afters');
  });
});
