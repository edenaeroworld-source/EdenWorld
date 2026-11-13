// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AftersBodySystem } from '../../src/afters/AftersBodySystem';
import { AFTERS_PRODUCTS, SUPPLEMENTARY_PRODUCTS, defaultAftersConfig, type AftersConfig } from '../../src/afters/AftersCatalog';
import { AFTERS_PRESETS, defaultAftersBody, fromPercent, getAftersPreset, toPercent } from '../../src/afters/AftersState';
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
  // Sistema real: as telas conversam com a mesma lógica usada no jogo.
  const bodySystem = new AftersBodySystem();
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
    afters: () => ({ ...afters, body: bodySystem.current }),
    setAfters: (patch) => {
      afters = { ...afters, ...patch, body: bodySystem.current };
    },
    aftersBody: () => bodySystem.current,
    aftersStatus: () => bodySystem.status,
    setAftersIntensity: (channel, percent) => bodySystem.setIntensity(channel, fromPercent(percent)),
    setAftersActive: (channel, active) => bodySystem.setActive(channel, active),
    setAftersCombined: (active) => bodySystem.setCombined(active),
    setAftersDuration: (seconds) => bodySystem.setDuration(seconds),
    applyAftersPreset: (id) => {
      const preset = getAftersPreset(id);
      if (preset) bodySystem.applyPreset(preset);
    },
    resetAfters: (channel) => bodySystem.reset(channel),
    resetAftersAll: () => bodySystem.resetAll(),
    aftersAllOff: () => {
      bodySystem.turnOff();
      afters = { ...afters, productId: null, body: bodySystem.current };
    },
    musicEnabled: () => music.enabled,
    musicVolume: () => music.volume,
    setMusic: (patch) => {
      music = { ...music, ...patch };
    },
    ...overrides,
  };
  return { host, social, calls, bodySystem, state: () => ({ afters: { ...afters, body: bodySystem.current }, music }) };
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
    const items = content.querySelectorAll('[aria-label="Efeitos complementares"] .list-btn');
    // Só os complementares: AfterBust® e AfterCurve® têm seção própria.
    expect(items.length).toBe(SUPPLEMENTARY_PRODUCTS.length);
    items[0].dispatchEvent(new Event('click'));
    expect(state().afters.productId).toBe(SUPPLEMENTARY_PRODUCTS[0].id);
    expect(state().afters.color).toBe(SUPPLEMENTARY_PRODUCTS[0].color);
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
    const range = content.querySelector<HTMLInputElement>('input[aria-label="Intensidade do brilho"]');
    expect(range).not.toBeNull();
    range!.value = '0.3';
    range!.dispatchEvent(new Event('input'));
    expect(state().afters.intensity).toBeCloseTo(0.3, 5);
  });

  it('fala de silhueta estilizada, sem descrição anatômica', () => {
    const { host } = makeHost();
    host.setAfters({ unlocked: true });
    buildAfters(host, content, () => {});
    const lower = text().toLowerCase();
    expect(lower).toContain('silhueta');
    expect(lower).toContain('partículas');
    // As marcas AfterBust® e AfterCurve® aparecem; o vocabulário anatômico, não.
    for (const forbidden of ['seio', 'peito', 'nádega', 'bumbum', 'decote', 'cintura fina']) expect(lower).not.toContain(forbidden);
  });
});

describe('Afters · painel de silhueta', () => {
  it('mostra os dois canais com leitura numérica e controle de 0 a 250', () => {
    const { host } = makeHost();
    host.setAfters({ unlocked: true });
    buildAfters(host, content, () => {});
    const bust = content.querySelector<HTMLInputElement>('input[aria-label^="Intensidade de AfterBust"]');
    const curve = content.querySelector<HTMLInputElement>('input[aria-label^="Intensidade de AfterCurve"]');
    expect(bust).not.toBeNull();
    expect(curve).not.toBeNull();
    for (const range of [bust!, curve!]) {
      expect(range.min).toBe('0');
      expect(range.max).toBe('250');
    }
    expect(text()).toContain('AfterBust®');
    expect(text()).toContain('AfterCurve®');
    expect(text()).toContain('0%');
  });

  it('arrastar o slider muda o estado do jogo na hora', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    buildAfters(host, content, () => {});
    const bust = content.querySelector<HTMLInputElement>('input[aria-label^="Intensidade de AfterBust"]')!;
    bust.value = '175';
    bust.dispatchEvent(new Event('input'));
    expect(toPercent(bodySystem.current.bust)).toBe(175);
    const readout = content.querySelector('.afters__percent');
    expect(readout?.textContent).toBe('175%');
  });

  it('cada canal liga e desliga sozinho', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    host.setAftersIntensity('bust', 100);
    host.setAftersIntensity('curve', 100);
    const refresh = vi.fn();
    buildAfters(host, content, refresh);
    const switches = content.querySelectorAll<HTMLButtonElement>('.afters__channel .afters__head button[role="switch"]');
    expect(switches.length).toBe(2);
    switches[0].click();
    expect(bodySystem.current.bustActive).toBe(true);
    expect(bodySystem.current.curveActive).toBe(false);
    switches[1].click();
    expect(bodySystem.current.curveActive).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('os atalhos de porcentagem existem e funcionam', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    buildAfters(host, content, () => {});
    const chips = content.querySelectorAll<HTMLButtonElement>('.afters__steps .chip');
    expect([...chips].map((chip) => chip.textContent)).toContain('250%');
    const max = [...chips].find((chip) => chip.textContent === '250%')!;
    max.click();
    expect(toPercent(bodySystem.current.bust)).toBe(250);
  });

  it('o modo combinado liga os dois de uma vez', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    buildAfters(host, content, () => {});
    const both = [...content.querySelectorAll('button')].find((item) => item.textContent?.includes('Ligar os dois'));
    expect(both).toBeDefined();
    both?.click();
    expect(bodySystem.current.bustActive).toBe(true);
    expect(bodySystem.current.curveActive).toBe(true);
  });

  it('"desligar tudo" zera a silhueta e a assinatura estética', () => {
    const { host, bodySystem, state } = makeHost();
    host.setAfters({ unlocked: true, productId: AFTERS_PRODUCTS[0].id });
    host.setAftersIntensity('bust', 200);
    host.setAftersCombined(true);
    buildAfters(host, content, () => {});
    const off = [...content.querySelectorAll('button')].find((item) => item.textContent?.includes('Desligar tudo'));
    off?.click();
    expect(bodySystem.current.bustActive).toBe(false);
    expect(bodySystem.current.curveActive).toBe(false);
    expect(state().afters.productId).toBeNull();
    // A intensidade escolhida fica guardada para quando religar.
    expect(toPercent(bodySystem.current.bust)).toBe(200);
  });

  it('o botão Reiniciar zera o canal sem tocar no outro', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    host.setAftersIntensity('bust', 200);
    host.setAftersIntensity('curve', 125);
    host.setAftersCombined(true);
    buildAfters(host, content, () => {});
    const resets = [...content.querySelectorAll<HTMLButtonElement>('button')].filter((item) =>
      item.getAttribute('aria-label')?.startsWith('Reiniciar AfterBust'),
    );
    expect(resets.length).toBe(1);
    resets[0].click();
    expect(toPercent(bodySystem.current.bust)).toBe(0);
    expect(bodySystem.current.bustActive).toBe(false);
    // O AfterCurve® continua exatamente como estava.
    expect(toPercent(bodySystem.current.curve)).toBe(125);
    expect(bodySystem.current.curveActive).toBe(true);
  });

  it('cada produto tem o seu Reiniciar, e há um Reiniciar tudo', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    host.setAftersIntensity('bust', 250);
    host.setAftersIntensity('curve', 250);
    host.setAftersCombined(true);
    host.setAftersDuration(4);
    buildAfters(host, content, () => {});
    const labels = [...content.querySelectorAll<HTMLButtonElement>('button')]
      .map((item) => item.getAttribute('aria-label') ?? item.textContent ?? '')
      .filter((label) => label.includes('Reiniciar'));
    expect(labels.some((label) => label.includes('AfterBust'))).toBe(true);
    expect(labels.some((label) => label.includes('AfterCurve'))).toBe(true);
    const all = [...content.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('Reiniciar tudo'));
    expect(all).toBeDefined();
    all?.click();
    expect(toPercent(bodySystem.current.bust)).toBe(0);
    expect(toPercent(bodySystem.current.curve)).toBe(0);
    expect(bodySystem.current.bustActive).toBe(false);
    expect(bodySystem.current.curveActive).toBe(false);
    expect(bodySystem.current.duration).toBeCloseTo(defaultAftersBody().duration, 5);
  });

  it('reiniciar é diferente de desligar: desligar guarda a porcentagem', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    host.setAftersIntensity('bust', 175);
    host.setAftersActive('bust', true);
    buildAfters(host, content, () => {});
    const off = [...content.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('Desligar tudo'));
    off?.click();
    expect(toPercent(bodySystem.current.bust)).toBe(175);
    host.resetAfters('bust');
    expect(toPercent(bodySystem.current.bust)).toBe(0);
  });

  it('a luz de assinatura de cada produto fica na seção dele', () => {
    const { host, state } = makeHost();
    host.setAfters({ unlocked: true });
    buildAfters(host, content, () => {});
    const sections = content.querySelectorAll('.afters__channel');
    expect(sections.length).toBe(2);
    const glow = sections[0].querySelector<HTMLButtonElement>('.afters__glow button[role="switch"]');
    expect(glow).not.toBeNull();
    glow!.click();
    expect(state().afters.productId).toBe('afterbust');
    // E a lista de complementares não repete o produto.
    const names = [...content.querySelectorAll('[aria-label="Efeitos complementares"] .list-btn')].map((item) => item.textContent ?? '');
    expect(names.some((name) => name.includes('AfterBust'))).toBe(false);
    expect(names.some((name) => name.includes('AfterCurve'))).toBe(false);
  });

  it('a duração da animação é um controle separado da intensidade', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    host.setAftersIntensity('bust', 150);
    buildAfters(host, content, () => {});
    const duration = content.querySelector<HTMLInputElement>('input[aria-label^="Duração da transição"]')!;
    expect(duration).not.toBeNull();
    duration.value = '3.4';
    duration.dispatchEvent(new Event('input'));
    expect(bodySystem.current.duration).toBeCloseTo(3.4, 5);
    // Mudar o tempo não mexe na porcentagem.
    expect(toPercent(bodySystem.current.bust)).toBe(150);
  });

  it('os presets aplicam os dois canais de verdade', () => {
    const { host, bodySystem } = makeHost();
    host.setAfters({ unlocked: true });
    buildAfters(host, content, () => {});
    const items = [...content.querySelectorAll<HTMLButtonElement>('[aria-label="Presets Afters"] .list-btn')];
    expect(items.length).toBe(AFTERS_PRESETS.length);
    const palco = items[AFTERS_PRESETS.findIndex((preset) => preset.id === 'palco')];
    palco.click();
    expect(toPercent(bodySystem.current.bust)).toBe(175);
    expect(toPercent(bodySystem.current.curve)).toBe(125);
  });

  it('mostra a situação atual, inclusive o modo combinado', () => {
    const { host } = makeHost();
    host.setAfters({ unlocked: true });
    host.setAftersIntensity('bust', 100);
    host.setAftersIntensity('curve', 50);
    host.setAftersCombined(true);
    buildAfters(host, content, () => {});
    expect(text()).toContain('Modo combinado');
    expect(text()).toContain('100%');
    expect(text()).toContain('50%');
  });

  it('não tem botão de enfeite: todo controle chama o jogo', () => {
    const { host } = makeHost();
    host.setAfters({ unlocked: true });
    const touched: string[] = [];
    const spy: typeof host = {
      ...host,
      setAfters: (patch) => touched.push(`setAfters:${Object.keys(patch).join(',')}`),
      setAftersIntensity: (channel) => touched.push(`intensity:${channel}`),
      setAftersActive: (channel) => touched.push(`active:${channel}`),
      setAftersCombined: () => touched.push('combined'),
      setAftersDuration: () => touched.push('duration'),
      applyAftersPreset: (id) => touched.push(`preset:${id}`),
      aftersAllOff: () => touched.push('off'),
    };
    buildAfters(spy, content, () => {});
    const buttons = [...content.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.length).toBeGreaterThan(10);
    for (const item of buttons) item.click();
    for (const range of content.querySelectorAll<HTMLInputElement>('input[type="range"]')) range.dispatchEvent(new Event('input'));
    // Cada botão e cada slider desta tela chamou alguma ação do jogo.
    expect(touched.length).toBeGreaterThanOrEqual(buttons.length);
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

/**
 * Clica no texto até o nó terminar (a caixa mostra uma página por vez).
 * As respostas só aparecem depois da última página.
 */
function turnPages(screen: DialogueScreen, limit = 12): void {
  for (let guard = 0; guard < limit; guard++) {
    if (screen.element.querySelector('.talkbar__choice')) return;
    const page = screen.element.querySelector<HTMLButtonElement>('.talkbar__page');
    if (!page || page.hidden) return;
    const before = screen.element.querySelector('.talkbar__text')?.textContent;
    page.click();
    if (screen.element.querySelector('.talkbar__text')?.textContent === before) return;
  }
}

describe('tela de conversa', () => {
  it('mostra fala, papel e escolhas do personagem', () => {
    const character = getCharacter('haru')!;
    const runner = new DialogueRunner(character.dialogue, new MemoryFlags());
    const screen = new DialogueScreen({
      speaker: { name: character.name, title: character.title, color: character.colors[0], place: character.place.label },
      runner,
      instantText: true,
      onEffects: () => {},
      onClose: () => {},
    });
    document.body.appendChild(screen.element);
    expect(screen.element.textContent).toContain('Haru');
    expect(screen.element.textContent).toContain(character.title);
    // A faixa fica no rodapé e as respostas só aparecem no fim do texto.
    expect(screen.element.querySelector('.talkbar')).not.toBeNull();
    turnPages(screen);
    expect(screen.element.querySelectorAll('.talkbar__choice').length).toBeGreaterThan(1);
  });

  it('entrega os efeitos da conversa ao jogo (contato, diário, bandeira)', () => {
    const character = getCharacter('luma')!;
    const flags = new MemoryFlags();
    const effects: string[] = [];
    const screen = new DialogueScreen({
      speaker: { name: character.name, title: character.title, color: character.colors[0] },
      runner: new DialogueRunner(character.dialogue, flags),
      instantText: true,
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
      instantText: true,
      onEffects: () => {},
      onClose: closed,
    });
    document.body.appendChild(screen.element);
    turnPages(screen);
    const before = screen.element.querySelector('.talkbar__text')?.textContent;
    screen.element.querySelector<HTMLButtonElement>('.talkbar__choice')?.click();
    turnPages(screen);
    expect(screen.element.querySelector('.talkbar__text')?.textContent).not.toBe(before);
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
      instantText: true,
      onEffects: (list) => {
        for (const effect of list) effects.push(effect.kind);
      },
      onClose: () => {},
    });
    document.body.appendChild(screen.element);
    // Percorre a conversa inteira em largura, clicando em cada escolha disponível.
    for (let guard = 0; guard < 24 && !runner.isFinished; guard++) {
      turnPages(screen);
      const buttons = screen.element.querySelectorAll<HTMLButtonElement>('.talkbar__choice');
      if (buttons.length === 0) break;
      if (effects.includes('afters')) break;
      buttons[0].click();
    }
    expect(effects).toContain('afters');
  });
});
