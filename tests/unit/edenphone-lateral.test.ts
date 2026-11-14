// @vitest-environment happy-dom
/**
 * EdenPhone lateral e prévia 3D do personagem.
 *
 * Os dez casos pedidos, nesta ordem: abrir durante a gameplay, fechar
 * e reabrir várias vezes, alternar entre aplicativos, o personagem
 * aparecer, mexer nos Afters e ver a mudança na hora, trocar de
 * roupa, viajar com o celular aberto e fechado, os controles do
 * computador e do telefone, o fundo continuar transparente e fechar
 * devolver a gameplay.
 *
 * Nada aqui é desenhado de verdade (não há WebGL no ambiente de
 * teste), mas tudo o que importa é verificável sem pixels: quem está
 * na pilha da interface, quem recebe comandos, quantos corpos o ator
 * de Afters está escrevendo e com que valores.
 */

import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AftersBodySystem } from '../../src/afters/AftersBodySystem';
import { fromPercent } from '../../src/afters/AftersState';
import { CharacterPreview, PREVIEW_RENDERER_OPTIONS, type PreviewSource } from '../../src/interface/CharacterPreview';
import { EdenPhoneUI, type PhoneApp, type PhoneHost } from '../../src/interface/EdenPhoneUI';
import { UIManager, type Screen } from '../../src/interface/UIManager';
import { KeyboardMouseInput } from '../../src/input/KeyboardMouseInput';
import { TouchInput } from '../../src/input/TouchInput';
import { defaultInputSettings, type GameAction } from '../../src/input/InputSettings';
import { DEFAULT_APPEARANCE, type AvatarAppearance } from '../../src/player/AvatarAppearance';
import { createNewSave } from '../../src/systems/SaveSystem';
import { UniverseSystem, type UniverseSaveData } from '../../src/universe/UniverseSystem';
import { defaultAftersConfig } from '../../src/afters/AftersCatalog';
import { defaultAftersBody } from '../../src/afters/AftersState';
import { DEFAULT_PROPORTIONS } from '../../src/player/body/BodyProportions';
import { Avatar } from '../../src/player/Avatar';

/* ------------------------------------------------------------------ */
/* Dublês                                                              */
/* ------------------------------------------------------------------ */

/** Renderizador de mentira: registra o que lhe pediram, não desenha nada. */
function stubRenderer() {
  const calls = { clear: [] as Array<{ color: number; alpha: number }>, renders: 0, sizes: [] as Array<[number, number]>, disposed: 0 };
  const renderer = {
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    shadowMap: { enabled: true },
    setClearColor: (color: number, alpha: number) => calls.clear.push({ color, alpha }),
    setPixelRatio: () => {},
    setSize: (w: number, h: number) => calls.sizes.push([w, h]),
    render: () => {
      calls.renders += 1;
    },
    dispose: () => {
      calls.disposed += 1;
    },
  };
  return { calls, renderer: renderer as unknown as THREE.WebGLRenderer };
}

/** Dá tamanho ao canvas: sem área, a prévia (corretamente) não desenha. */
function giveSize(canvas: HTMLCanvasElement, width = 240, height = 300): void {
  canvas.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

interface Scenario {
  preview: CharacterPreview;
  afters: AftersBodySystem;
  worldAvatar: Avatar;
  source: { appearance: AvatarAppearance };
  calls: ReturnType<typeof stubRenderer>['calls'];
  attached: number;
}

function scenario(): Scenario {
  const { calls, renderer } = stubRenderer();
  const state = { appearance: { ...DEFAULT_APPEARANCE } as AvatarAppearance };
  const worldAvatar = new Avatar(state.appearance);
  const afters = new AftersBodySystem({});
  afters.setAvatars([worldAvatar]);

  const source: PreviewSource = {
    appearance: () => state.appearance,
    proportions: () => DEFAULT_PROPORTIONS,
    gestation: () => 0,
    expression: () => 'neutra',
    motion: () => ({ state: 'idle', speed: 0 }),
  };
  const result: Scenario = { preview: null as never, afters, worldAvatar, source: state, calls, attached: 0 };
  result.preview = new CharacterPreview(
    source,
    {
      attach: (avatar) => {
        result.attached += 1;
        afters.addAvatar(avatar);
      },
      detach: (avatar) => afters.removeAvatar(avatar),
    },
    () => renderer,
  );
  giveSize(result.preview.canvas);
  return result;
}

/** Celular ligado a um hospedeiro de mentira, com a prévia de verdade. */
function phoneWith(preview: CharacterPreview | null) {
  const log: string[] = [];
  let side: 'direita' | 'esquerda' = 'direita';
  const universe = new UniverseSystem(createNewSave(1_700_000_000_000) as unknown as UniverseSaveData);
  const afters = defaultAftersConfig();
  const body = defaultAftersBody();
  const host: PhoneHost = {
    // --- EdenPhone ---
    playerName: () => 'Eden',
    clockLabel: () => '09:30',
    weatherLabel: () => 'Sol',
    areaName: () => 'Praça Central',
    baseMap: () => null,
    playerPose: () => ({ x: 0, z: 0, heading: 0 }),
    portals: () => [],
    travel: () => log.push('travel'),
    journal: () => [],
    stats: () => ({ crystals: 0, crystalsTotal: 7, areas: 1, photos: 0, wishes: 0, distance: 0, playSeconds: 60, regions: 1 }),
    crystalHint: () => null,
    setHour: () => {},
    timePace: () => 'normal',
    setTimePace: () => {},
    weather: () => 'auto',
    setWeather: () => {},
    openCamera: () => log.push('camera'),
    openAvatar: () => log.push('avatar'),
    openSettings: () => log.push('settings'),
    close: () => log.push('close'),
    phoneSide: () => side,
    preview: () => preview,
    // --- EdenApps ---
    metCharacters: () => ['haru'],
    citizensMet: () => 2,
    threads: () => [],
    markThreadRead: () => {},
    photos: () => [],
    deletePhoto: () => {},
    openGramCamera: () => log.push('gram'),
    feed: () => [],
    library: () => [],
    musicEnabled: () => true,
    musicVolume: () => 0.5,
    setMusic: () => {},
    // --- Afters ---
    afters: () => afters,
    setAfters: () => {},
    aftersBody: () => body,
    aftersStatus: () => ({
      bust: { value: body.bust, target: body.bust, active: body.bustActive, moving: false },
      curve: { value: body.curve, target: body.curve, active: body.curveActive, moving: false },
      combined: false,
    }),
    setAftersIntensity: () => {},
    setAftersActive: () => {},
    setAftersCombined: () => {},
    setAftersDuration: () => {},
    applyAftersPreset: () => {},
    resetAfters: () => {},
    resetAftersAll: () => {},
    aftersAllOff: () => {},
    // --- Universo ---
    universe: () => universe,
    worldHour: () => 12,
    requestTravel: () => log.push('travel'),
    refresh: () => {},
  } as unknown as PhoneHost;
  const phone = new EdenPhoneUI(host);
  return { phone, log, setSide: (s: 'direita' | 'esquerda') => (side = s) };
}

/** Tela modal comum, para contrastar com a conviva. */
function modalScreen(id: string): Screen {
  const element = document.createElement('div');
  element.className = 'screen';
  const first = document.createElement('button');
  // O gerenciador só foca o que tem área; no DOM de teste nada tem.
  first.getBoundingClientRect = () => ({ width: 80, height: 32, top: 0, left: 0, right: 80, bottom: 32, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  element.appendChild(first);
  return { id, element };
}

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

/* ================================================================== */
/* 1. Abrir durante a gameplay                                         */
/* ================================================================== */

describe('1. abrir durante a gameplay', () => {
  it('o celular entra na interface sem tornar o jogo modal', () => {
    const ui = new UIManager(root);
    const { phone } = phoneWith(null);

    expect(ui.hasModal).toBe(false);
    phone.prepare('home');
    ui.open(phone);

    expect(ui.isOpen('edenphone')).toBe(true);
    expect(ui.hasScreen).toBe(true);
    // O ponto do marco: aberto, e mesmo assim o jogo continua recebendo
    // comandos. É `hasModal` que congela o personagem no Engine.
    expect(ui.hasModal).toBe(false);
    expect(phone.blocking).toBe(false);
  });

  it('uma tela modal continua modal — o celular não afrouxou as outras', () => {
    const ui = new UIManager(root);
    const { phone } = phoneWith(null);
    ui.open(phone);
    expect(ui.hasModal).toBe(false);

    ui.open(modalScreen('pausa'));
    expect(ui.hasModal).toBe(true);
    expect(ui.topBlocking?.id).toBe('pausa');
  });

  it('não apaga nem rouba o foco da tela que já estava aberta', () => {
    const ui = new UIManager(root);
    const menu = modalScreen('menu');
    ui.open(menu);
    const menuButton = menu.element.querySelector('button') as HTMLButtonElement;
    expect(document.activeElement).toBe(menuButton);

    const { phone } = phoneWith(null);
    ui.open(phone);
    expect(menu.element.inert).toBe(false);
    expect(document.activeElement).toBe(menuButton);
  });

  it('o aparelho não ocupa a tela inteira: é uma faixa lateral', () => {
    const { phone } = phoneWith(null);
    expect(phone.element.className).toContain('screen--phone');
    expect(phone.element.className).not.toContain('screen--dim');
    // Sem `aria-modal`: o mundo atrás continua existindo para quem lê a tela.
    expect(phone.element.getAttribute('aria-modal')).toBeNull();
    const device = phone.element.querySelector('.phone') as HTMLElement;
    expect(device.className).toContain('phone--side');
  });

  it('encosta na direita por padrão e vai para a esquerda quando mandam', () => {
    const { phone, setSide } = phoneWith(null);
    expect(phone.currentSide).toBe('direita');
    expect(phone.element.className).not.toContain('screen--phone-left');

    setSide('esquerda');
    phone.prepare('home');
    phone.onOpen();
    expect(phone.currentSide).toBe('esquerda');
    expect(phone.element.className).toContain('screen--phone-left');
    expect((phone.element.querySelector('.phone') as HTMLElement).className).toContain('phone--left');
  });
});

/* ================================================================== */
/* 2. Fechar e reabrir várias vezes                                    */
/* ================================================================== */

describe('2. fechar e reabrir várias vezes', () => {
  it('dez ciclos deixam a pilha limpa e o jogo livre', () => {
    const ui = new UIManager(root);
    const { phone } = phoneWith(null);
    for (let i = 0; i < 10; i++) {
      ui.open(phone);
      expect(ui.isOpen('edenphone')).toBe(true);
      ui.close(phone);
      expect(ui.isOpen('edenphone')).toBe(false);
      expect(ui.hasModal).toBe(false);
      expect(ui.hasScreen).toBe(false);
    }
  });

  it('reabrir retoma o aplicativo em que foi guardado', () => {
    const { phone } = phoneWith(null);
    phone.prepare('home');
    phone.onOpen();
    phone.show('musica');
    expect(phone.currentApp).toBe('musica');

    phone.onClose();
    phone.prepare(); // sem argumento = retomar
    phone.onOpen();
    expect(phone.currentApp).toBe('musica');
  });

  it('abrir direto num aplicativo (portal, holomapa) ignora o retomar', () => {
    const { phone } = phoneWith(null);
    phone.prepare('musica');
    phone.onOpen();
    phone.onClose();

    phone.prepare('mapa');
    phone.onOpen();
    expect(phone.currentApp).toBe('mapa');
  });

  it('a animação de saída não deixa o elemento preso na tela', () => {
    vi.useFakeTimers();
    const ui = new UIManager(root);
    const { phone } = phoneWith(null);
    ui.open(phone);
    ui.close(phone);

    // Sai da pilha na hora — o jogo volta a responder no mesmo quadro.
    expect(ui.hasScreen).toBe(false);
    expect(phone.element.className).toContain('is-leaving');
    expect(phone.element.isConnected).toBe(true);

    vi.advanceTimersByTime(phone.exitMs + 20);
    expect(phone.element.isConnected).toBe(false);
    vi.useRealTimers();
  });

  it('reabrir no meio da animação de saída não perde o aparelho', () => {
    vi.useFakeTimers();
    const ui = new UIManager(root);
    const { phone } = phoneWith(null);
    ui.open(phone);
    ui.close(phone);
    ui.open(phone);

    vi.advanceTimersByTime(phone.exitMs + 20);
    expect(phone.element.isConnected).toBe(true);
    expect(phone.element.className).not.toContain('is-leaving');
    vi.useRealTimers();
  });
});

/* ================================================================== */
/* 3. Alternar entre aplicativos                                       */
/* ================================================================== */

describe('3. alternar entre aplicativos', () => {
  const REQUIRED: PhoneApp[] = ['gram', 'talk', 'feed', 'reads', 'musica', 'lojas', 'atlas', 'pessoas', 'afters', 'bichos'];

  it('os dez aplicativos pedidos abrem dentro do aparelho', () => {
    const { phone } = phoneWith(null);
    phone.prepare('home');
    phone.onOpen();
    const content = phone.element.querySelector('.phone__content') as HTMLElement;

    for (const app of REQUIRED) {
      phone.show(app);
      expect(phone.currentApp).toBe(app);
      // Cada aplicativo desenhou algo de verdade no aparelho.
      expect(content.childElementCount).toBeGreaterThan(0);
    }
  });

  it('navegar entre aplicativos não recria a janela da prévia', () => {
    const s = scenario();
    const { phone } = phoneWith(s.preview);
    phone.prepare('home');
    phone.onOpen();
    const slot = phone.element.querySelector('.phone-preview') as HTMLElement;
    const canvas = slot.firstElementChild;

    for (const app of REQUIRED) phone.show(app);
    expect(slot.firstElementChild).toBe(canvas);
    expect(s.attached).toBe(1);
  });

  it('a prévia cresce no aplicativo de Afters, onde o corpo é o assunto', () => {
    const s = scenario();
    const { phone } = phoneWith(s.preview);
    phone.prepare('home');
    phone.onOpen();
    const slot = phone.element.querySelector('.phone-preview') as HTMLElement;

    expect(slot.className).not.toContain('phone-preview--tall');
    phone.show('afters');
    expect(slot.className).toContain('phone-preview--tall');
    phone.show('musica');
    expect(slot.className).not.toContain('phone-preview--tall');
  });
});

/* ================================================================== */
/* 4. O personagem aparece                                             */
/* ================================================================== */

describe('4. o personagem aparece na prévia', () => {
  it('a prévia monta um Avatar de verdade, não uma figura genérica', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);

    expect(s.attached).toBe(1);
    // Dois corpos escrevendo a mesma silhueta: o do mundo e o da prévia.
    expect(s.afters.player.avatarCount).toBe(2);
    expect(s.calls.renders).toBeGreaterThan(0);
  });

  it('usa a mesma aparência e as mesmas proporções do jogador', () => {
    const s = scenario();
    s.source.appearance = { ...DEFAULT_APPEARANCE, height: 1.08, hairStyle: 'longo', hairColor: '#2b1a12' };
    s.preview.start();
    s.preview.update(1 / 30);

    const mirrored = s.afters.player as unknown as { avatars: Avatar[] };
    const copy = mirrored.avatars[1];
    expect(copy.appearance.height).toBeCloseTo(1.08, 5);
    expect(copy.appearance.hairStyle).toBe('longo');
    expect(copy.appearance.hairColor).toBe('#2b1a12');
    expect(copy.proportions.shoulders).toBeCloseTo(DEFAULT_PROPORTIONS.shoulders, 6);
    expect(copy.proportions.legLength).toBeCloseTo(DEFAULT_PROPORTIONS.legLength, 6);
    expect(copy.proportions.hips).toBeCloseTo(DEFAULT_PROPORTIONS.hips, 6);
    // Mesmas medidas que o corpo do mundo: a prévia não reinterpreta nada.
    expect(copy.measurements).toEqual(s.worldAvatar.measurements);
  });

  it('o enquadramento mostra o personagem inteiro de cabeça aos joelhos', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const internals = s.preview as unknown as { camera: THREE.PerspectiveCamera; pivot: THREE.Group };
    const camera = internals.camera;
    camera.aspect = 240 / 300;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    internals.pivot.updateMatrixWorld(true);

    const copy = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];
    const top = copy.topHeight;
    expect(top).toBeGreaterThan(1);

    // Topo da cabeça e quadris, projetados na tela da prévia (-1..1).
    const head = new THREE.Vector3(0, top, 0).project(camera);
    const hips = new THREE.Vector3(0, top * 0.55, 0).project(camera);

    // A cabeça cabe na janela, com uma folga em cima.
    expect(head.y).toBeLessThan(0.98);
    expect(head.y).toBeGreaterThan(0.2);
    // O quadril continua à vista: dá para ver roupa e silhueta.
    expect(hips.y).toBeGreaterThan(-1);
    // E o personagem está centrado na horizontal.
    expect(Math.abs(head.x)).toBeLessThan(0.08);
  });

  it('o enquadramento acompanha a altura: baixinho e alto aparecem igual', () => {
    const quadro = (height: number) => {
      const s = scenario();
      s.source.appearance = { ...DEFAULT_APPEARANCE, height };
      s.preview.start();
      s.preview.update(1 / 30);
      const camera = (s.preview as unknown as { camera: THREE.PerspectiveCamera }).camera;
      camera.aspect = 0.8;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      const copy = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];
      return { head: new THREE.Vector3(0, copy.topHeight, 0).project(camera).y, top: copy.topHeight };
    };

    const baixo = quadro(0.9);
    const alto = quadro(1.1);
    expect(alto.top).toBeGreaterThan(baixo.top + 0.3);
    // Alturas diferentes, mesma composição: a cabeça cai no mesmo lugar.
    expect(alto.head).toBeCloseTo(baixo.head, 4);
    expect(alto.head).toBeLessThan(0.98);
    expect(alto.head).toBeGreaterThan(0.2);
  });

  it('o giro de vitrine mostra frente, lado e costas sem virar de cabeça para baixo', () => {
    const s = scenario();
    s.preview.start();
    const internals = s.preview as unknown as { pivot: THREE.Group };
    const angles: number[] = [];
    // Quinze segundos: tempo de uma volta completa do balanço.
    for (let i = 0; i < 450; i++) {
      s.preview.update(1 / 30);
      angles.push(internals.pivot.rotation.y);
    }
    const min = Math.min(...angles);
    const max = Math.max(...angles);
    // Vai e volta em torno da frente, sem rodopiar.
    expect(max).toBeGreaterThan(0.4);
    expect(min).toBeLessThan(-0.4);
    expect(max).toBeLessThan(Math.PI / 2);
    expect(min).toBeGreaterThan(-Math.PI / 2);
    // Nunca fica de ponta-cabeça nem tomba.
    expect(internals.pivot.rotation.x).toBe(0);
    expect(internals.pivot.rotation.z).toBe(0);
  });

  it('a prévia tem luz própria e nenhuma sombra para calcular', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const scene = (s.preview as unknown as { scene: THREE.Scene }).scene;
    let lights = 0;
    let casters = 0;
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) lights += 1;
      if ((o as THREE.Mesh).isMesh && o.castShadow) casters += 1;
    });
    expect(lights).toBeGreaterThanOrEqual(3);
    expect(casters).toBe(0);
  });

  it('a prévia desligada não gasta um único quadro', () => {
    const s = scenario();
    s.preview.update(1 / 30);
    expect(s.calls.renders).toBe(0);
    expect(s.preview.active).toBe(false);

    s.preview.start();
    expect(s.preview.active).toBe(true);
    s.preview.update(1 / 30);
    expect(s.calls.renders).toBe(1);

    s.preview.stop();
    s.preview.update(1 / 30);
    expect(s.calls.renders).toBe(1);
  });

  it('sem área na tela, nada é desenhado (aparelho fechando)', () => {
    const s = scenario();
    giveSize(s.preview.canvas, 0, 0);
    s.preview.start();
    s.preview.update(1 / 30);
    expect(s.calls.renders).toBe(0);
  });
});

/* ================================================================== */
/* 5. Afters em tempo real                                             */
/* ================================================================== */

describe('5. mexer nos Afters atualiza a prévia na hora', () => {
  it('o mesmo ator escreve nos dois corpos, com os mesmos valores', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const copy = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];

    s.afters.setActive('bust', true);
    s.afters.setActive('curve', true);
    s.afters.setIntensity('bust', fromPercent(120));
    s.afters.setIntensity('curve', fromPercent(60));
    // Tempo para a transição correr até o alvo.
    for (let i = 0; i < 400; i++) s.afters.update(1 / 60);

    expect(s.worldAvatar.morph.bust).toBeGreaterThan(0.5);
    expect(copy.morph.bust).toBeCloseTo(s.worldAvatar.morph.bust, 6);
    expect(copy.morph.curve).toBeCloseTo(s.worldAvatar.morph.curve, 6);
  });

  it('acompanha enquanto o controle é arrastado, não só no fim', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const copy = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];

    s.afters.setActive('bust', true);
    const seen: number[] = [];
    // Dez passos do controle deslizante, com um quadro entre eles.
    for (let percent = 10; percent <= 100; percent += 10) {
      s.afters.setIntensity('bust', fromPercent(percent));
      s.afters.update(1 / 60);
      expect(copy.morph.bust).toBeCloseTo(s.worldAvatar.morph.bust, 6);
      seen.push(copy.morph.bust);
    }
    // Não ficou parado esperando fechar e reabrir.
    expect(seen[seen.length - 1]).toBeGreaterThan(seen[0]);
  });

  it('desligar um canal preserva o valor e some na prévia junto', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const copy = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];

    s.afters.setActive('bust', true);
    s.afters.setIntensity('bust', fromPercent(150));
    for (let i = 0; i < 400; i++) s.afters.update(1 / 60);
    const ligado = copy.morph.bust;
    expect(ligado).toBeGreaterThan(0.5);

    s.afters.setActive('bust', false);
    for (let i = 0; i < 400; i++) s.afters.update(1 / 60);
    expect(copy.morph.bust).toBeLessThan(0.01);
    // O valor escolhido continua guardado: religar volta ao mesmo lugar.
    expect(s.afters.current.bust).toBeCloseTo(fromPercent(150), 6);

    s.afters.setActive('bust', true);
    for (let i = 0; i < 400; i++) s.afters.update(1 / 60);
    expect(copy.morph.bust).toBeCloseTo(ligado, 4);
  });

  it('os dois canais juntos aparecem juntos', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const copy = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];

    s.afters.setCombined(true);
    s.afters.setActive('bust', true);
    s.afters.setActive('curve', true);
    s.afters.setIntensity('bust', fromPercent(100));
    s.afters.setIntensity('curve', fromPercent(100));
    for (let i = 0; i < 400; i++) s.afters.update(1 / 60);

    expect(copy.morph.bust).toBeGreaterThan(0.3);
    expect(copy.morph.curve).toBeGreaterThan(0.3);
  });

  it('a prévia não tem transformação própria: sem ator, não há silhueta', () => {
    // Prova direta do requisito "proibido um segundo sistema": se o
    // ator não escrever, o corpo da prévia fica neutro. Ela não calcula
    // nada por conta.
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const copy = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];

    s.afters.setActive('bust', true);
    s.afters.setIntensity('bust', fromPercent(140));
    for (let i = 0; i < 400; i++) s.afters.update(1 / 60);
    expect(copy.morph.bust).toBeGreaterThan(0.5);

    s.afters.removeAvatar(copy);
    for (let i = 0; i < 60; i++) s.afters.update(1 / 60);
    s.preview.update(1 / 30);
    expect(copy.morph.bust).toBe(0);
  });
});

/* ================================================================== */
/* 6. Trocar de roupa                                                  */
/* ================================================================== */

describe('6. trocar de roupa aparece na prévia', () => {
  it('a prévia remonta o corpo quando a aparência muda', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const antes = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];

    s.source.appearance = { ...DEFAULT_APPEARANCE, outfit: 'vestido', topColor: '#ff66aa' };
    s.preview.update(1 / 30);

    const depois = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];
    expect(depois).not.toBe(antes);
    expect(depois.appearance.outfit).toBe('vestido');
    expect(depois.appearance.topColor).toBe('#ff66aa');
    // O corpo antigo saiu do ator e o novo entrou: sem corpo órfão.
    expect(s.afters.player.avatarCount).toBe(2);
    expect(s.attached).toBe(2);
  });

  it('trocar de roupa não perde a silhueta escolhida', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    s.afters.setActive('curve', true);
    s.afters.setIntensity('curve', fromPercent(130));
    for (let i = 0; i < 400; i++) s.afters.update(1 / 60);

    s.source.appearance = { ...DEFAULT_APPEARANCE, outfit: 'vestido' };
    s.preview.update(1 / 30);
    const novo = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];

    // Entrou já com o valor certo, sem precisar de um quadro de ajuste.
    expect(novo.morph.curve).toBeCloseTo(s.worldAvatar.morph.curve, 6);
    expect(novo.morph.curve).toBeGreaterThan(0.5);
  });

  it('aparência igual não remonta nada (não pisca a cada quadro)', () => {
    const s = scenario();
    s.preview.start();
    for (let i = 0; i < 30; i++) s.preview.update(1 / 30);
    expect(s.attached).toBe(1);
  });
});

/* ================================================================== */
/* 7. Viajar entre regiões                                             */
/* ================================================================== */

describe('7. viajar entre regiões, com o celular aberto e fechado', () => {
  it('a viagem fecha o aparelho e devolve o jogo, sem sobra na pilha', () => {
    const ui = new UIManager(root);
    const s = scenario();
    const { phone } = phoneWith(s.preview);
    ui.open(phone);
    phone.show('atlas');
    expect(s.preview.active).toBe(true);

    // É o que o Engine faz ao atravessar: `ui.closeAll()`.
    ui.closeAll();
    expect(ui.hasScreen).toBe(false);
    expect(ui.hasModal).toBe(false);
    expect(s.preview.active).toBe(false);
  });

  it('depois da viagem o celular volta onde estava', () => {
    const ui = new UIManager(root);
    const s = scenario();
    const { phone } = phoneWith(s.preview);
    ui.open(phone);
    phone.show('atlas');
    ui.closeAll();

    phone.prepare();
    ui.open(phone);
    expect(phone.currentApp).toBe('atlas');
    expect(s.preview.active).toBe(true);
  });

  it('a região nova reconstrói o ator e a prévia é reencontrada', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    expect(s.afters.player.avatarCount).toBe(2);

    // Travessia: o mundo é refeito e o ator recebe só o corpo do mundo.
    s.afters.setAvatars([s.worldAvatar]);
    expect(s.afters.player.avatarCount).toBe(1);

    // É isto que o Engine chama logo em seguida.
    s.preview.reattach();
    expect(s.afters.player.avatarCount).toBe(2);

    s.afters.setActive('bust', true);
    s.afters.setIntensity('bust', fromPercent(110));
    for (let i = 0; i < 400; i++) s.afters.update(1 / 60);
    const copy = (s.afters.player as unknown as { avatars: Avatar[] }).avatars[1];
    expect(copy.morph.bust).toBeCloseTo(s.worldAvatar.morph.bust, 6);
  });

  it('viajar com o celular fechado não acorda a prévia', () => {
    const ui = new UIManager(root);
    const s = scenario();
    phoneWith(s.preview);
    expect(s.preview.active).toBe(false);
    ui.closeAll();
    s.preview.update(1 / 30);
    expect(s.calls.renders).toBe(0);
  });
});

/* ================================================================== */
/* 8. Controles no computador e no telefone                            */
/* ================================================================== */

describe('8. controles no computador e no telefone', () => {
  function keyboardRig(gameplayEnabled = true) {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const actions: GameAction[] = [];
    const host = {
      settings: defaultInputSettings(),
      gameplayEnabled,
      onAction: (action: GameAction) => actions.push(action),
      onNav: () => {},
      onActivity: () => {},
      onPointerUnlock: () => {},
    };
    const keyboard = new KeyboardMouseInput(canvas, host);
    return { keyboard, actions, host, canvas };
  }

  function press(code: string, target: EventTarget = window): void {
    const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: target, configurable: true });
    window.dispatchEvent(event);
  }

  it('a tecla do EdenPhone é configurável e tem padrão', () => {
    const settings = defaultInputSettings();
    expect(settings.keys.phone.length).toBeGreaterThan(0);
    expect(settings.keys.phone).toContain('Tab');
    // Remapear é só escrever outra tecla: o mesmo caminho das demais.
    settings.keys.phone = ['KeyM'];
    expect(settings.keys.phone).toEqual(['KeyM']);
  });

  it('com o jogo rodando, a tecla do celular chega como ação', () => {
    const { keyboard, actions } = keyboardRig(true);
    press('Tab');
    expect(actions).toContain('phone');
    keyboard.dispose?.();
  });

  it('o foco dentro do aparelho não faz o personagem andar', () => {
    const { actions } = keyboardRig(true);
    const surface = document.createElement('div');
    surface.setAttribute('data-live-ui', '');
    const slider = document.createElement('input');
    slider.type = 'range';
    surface.appendChild(slider);
    document.body.appendChild(surface);

    press('KeyW', slider);
    press('Space', slider);
    press('KeyE', slider);
    // Nem pular, nem interagir: as teclas são da interface.
    expect(actions).not.toContain('jump');
    expect(actions).not.toContain('interact');

    // Mas sair continua possível — ninguém fica preso lá dentro.
    press('Tab', slider);
    expect(actions).toContain('phone');
    press('Escape', slider);
    expect(actions).toContain('pause');
  });

  it('fora do aparelho as teclas voltam a ser do personagem', () => {
    const { actions } = keyboardRig(true);
    press('Space');
    expect(actions).toContain('jump');
  });

  it('o cursor é solto enquanto o aparelho está aberto', () => {
    const { keyboard, canvas } = keyboardRig(true);
    const request = vi.fn();
    canvas.requestPointerLock = request as unknown as typeof canvas.requestPointerLock;

    keyboard.setPointerLockAllowed(false);
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(request).not.toHaveBeenCalled();

    keyboard.setPointerLockAllowed(true);
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(request).toHaveBeenCalled();
  });

  it('no telefone há um botão dedicado, e ele vale mesmo parado', () => {
    const canvas = document.createElement('canvas');
    const uiRoot = document.createElement('div');
    document.body.append(canvas, uiRoot);
    const actions: GameAction[] = [];
    const touch = new TouchInput(canvas, uiRoot, {
      settings: defaultInputSettings(),
      gameplayEnabled: false,
      onAction: (action: GameAction) => actions.push(action),
      onActivity: () => {},
    });

    const phoneButton = uiRoot.querySelector('.touch-btn--phone') as HTMLButtonElement;
    expect(phoneButton).not.toBeNull();
    phoneButton.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(actions).toContain('phone');
    touch.dispose?.();
  });

  it('tocar num aplicativo não chega ao mundo (não sai andando)', () => {
    const canvas = document.createElement('canvas');
    const uiRoot = document.createElement('div');
    document.body.append(canvas, uiRoot);
    let worldTouches = 0;
    canvas.addEventListener('pointerdown', () => (worldTouches += 1));

    const s = scenario();
    const { phone } = phoneWith(s.preview);
    uiRoot.appendChild(phone.element);
    phone.prepare('home');
    phone.onOpen();

    const appButton = phone.element.querySelector('.phone__content button') as HTMLButtonElement;
    appButton.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    // O evento sobe pelo celular, nunca pelo canvas do mundo.
    expect(worldTouches).toBe(0);
  });

  it('Esc sobe um nível no aplicativo antes de guardar o aparelho', () => {
    const { phone, log } = phoneWith(null);
    phone.prepare('home');
    phone.onOpen();
    phone.show('musica');

    // Primeiro Esc: volta ao início do celular, sem fechar.
    phone.onBack();
    expect(phone.currentApp).toBe('home');
    expect(log).not.toContain('close');

    // Segundo Esc: guarda o aparelho.
    phone.onBack();
    expect(log).toContain('close');
  });

  it('o aparelho é alcançável pelo teclado (foco entra nos aplicativos)', () => {
    const { phone } = phoneWith(null);
    phone.prepare('home');
    phone.onOpen();
    const focusable = phone.element.querySelectorAll('button');
    expect(focusable.length).toBeGreaterThan(3);
    expect(phone.initialFocus()).not.toBeNull();
  });

  it('há um botão de fechar visível na moldura do aparelho', () => {
    const { phone, log } = phoneWith(null);
    const dismiss = phone.element.querySelector('.phone__dismiss') as HTMLButtonElement;
    expect(dismiss).not.toBeNull();
    expect(dismiss.getAttribute('aria-label')).toContain('Guardar');
    dismiss.click();
    expect(log).toContain('close');
  });
});

/* ================================================================== */
/* 9. Fundo transparente                                               */
/* ================================================================== */

describe('9. o fundo da prévia continua transparente', () => {
  it('o contexto é pedido com alfa', () => {
    expect(PREVIEW_RENDERER_OPTIONS.alpha).toBe(true);
  });

  it('a cor de fundo é limpa com alfa zero — nada de caixa preta', () => {
    const s = scenario();
    s.preview.start();
    expect(s.calls.clear.length).toBeGreaterThan(0);
    for (const call of s.calls.clear) expect(call.alpha).toBe(0);
  });

  it('a cena da prévia não tem fundo nem névoa', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    const scene = (s.preview as unknown as { scene: THREE.Scene }).scene;
    expect(scene.background).toBeNull();
    expect(scene.fog).toBeNull();
  });

  it('o canvas da prévia não ganha fundo opaco por acidente', () => {
    const s = scenario();
    expect(s.preview.canvas.style.background).toBe('');
    expect(s.preview.canvas.className).toBe('phone-preview__canvas');
  });

  it('a janela da prévia não é um painel sólido', () => {
    const s = scenario();
    const { phone } = phoneWith(s.preview);
    phone.prepare('home');
    phone.onOpen();
    const slot = phone.element.querySelector('.phone-preview') as HTMLElement;
    expect(slot.hidden).toBe(false);
    expect(slot.style.backgroundColor).toBe('');
  });

  it('sem WebGL a janela some, em vez de virar um retângulo vazio', () => {
    const state = { appearance: { ...DEFAULT_APPEARANCE } as AvatarAppearance };
    const preview = new CharacterPreview(
      {
        appearance: () => state.appearance,
        proportions: () => DEFAULT_PROPORTIONS,
        gestation: () => 0,
        expression: () => 'neutra',
        motion: () => ({ state: 'idle', speed: 0 }),
      },
      { attach: () => {}, detach: () => {} },
      () => {
        throw new Error('sem contexto');
      },
    );
    preview.start();
    expect(preview.unavailable).toBe(true);

    const { phone } = phoneWith(preview);
    phone.prepare('home');
    phone.onOpen();
    const slot = phone.element.querySelector('.phone-preview') as HTMLElement;
    expect(slot.hidden).toBe(true);
    // E o celular continua inteiro.
    expect(phone.element.querySelector('.phone__content')?.childElementCount).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/* 10. Fechar devolve a gameplay                                       */
/* ================================================================== */

describe('10. fechar devolve a gameplay', () => {
  it('a pilha esvazia e nada fica inerte', () => {
    const ui = new UIManager(root);
    const { phone } = phoneWith(null);
    ui.open(phone);
    ui.close(phone);

    expect(ui.hasModal).toBe(false);
    expect(ui.hasScreen).toBe(false);
    expect(ui.top).toBeNull();
  });

  it('fechar o celular devolve o foco ao jogo, não a um botão da tela', () => {
    const ui = new UIManager(root);
    const { phone } = phoneWith(null);
    ui.open(phone);
    const dismiss = phone.element.querySelector('.phone__dismiss') as HTMLButtonElement;
    dismiss.focus();
    ui.close(phone);
    expect(document.activeElement === dismiss).toBe(false);
  });

  it('fechar para a prévia, e abrir religa', () => {
    const s = scenario();
    const { phone } = phoneWith(s.preview);
    phone.prepare('home');
    phone.onOpen();
    expect(s.preview.active).toBe(true);

    phone.onClose();
    expect(s.preview.active).toBe(false);
    const quadros = s.calls.renders;
    s.preview.update(1 / 30);
    expect(s.calls.renders).toBe(quadros);

    phone.prepare();
    phone.onOpen();
    expect(s.preview.active).toBe(true);
  });

  it('fechar com uma tela modal por baixo devolve a modal, não o jogo', () => {
    const ui = new UIManager(root);
    const menu = modalScreen('menu');
    const { phone } = phoneWith(null);
    ui.open(menu);
    ui.open(phone);
    ui.close(phone);

    expect(ui.hasScreen).toBe(true);
    expect(ui.hasModal).toBe(true);
    expect(ui.top?.id).toBe('menu');
  });

  it('perder o contexto WebGL desliga a prévia sem derrubar o celular', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    expect(s.preview.active).toBe(true);

    s.preview.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(s.preview.active).toBe(false);
    expect(s.preview.unavailable).toBe(true);

    const quadros = s.calls.renders;
    s.preview.update(1 / 30);
    expect(s.calls.renders).toBe(quadros);

    // E o aparelho continua abrindo normalmente, só sem a janela.
    const { phone } = phoneWith(s.preview);
    phone.prepare('home');
    phone.onOpen();
    expect((phone.element.querySelector('.phone-preview') as HTMLElement).hidden).toBe(true);
    expect(phone.element.querySelector('.phone__content')?.childElementCount).toBeGreaterThan(0);
  });

  it('descartar o celular solta o corpo da prévia do ator', () => {
    const s = scenario();
    s.preview.start();
    s.preview.update(1 / 30);
    expect(s.afters.player.avatarCount).toBe(2);

    s.preview.dispose();
    expect(s.afters.player.avatarCount).toBe(1);
    expect(s.calls.disposed).toBe(1);
  });
});
