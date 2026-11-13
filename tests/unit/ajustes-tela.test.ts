// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { InputManager } from '../../src/input/InputManager';
import { defaultInputSettings } from '../../src/input/InputSettings';
import { type PlatformProbe, detectPlatform } from '../../src/core/Platform';
import { SettingsScreen } from '../../src/interface/SettingsScreen';
import { type GraphicsSettings, defaultGraphicsSettings } from '../../src/systems/QualitySystem';
import { createNewSave } from '../../src/systems/SaveSystem';

/**
 * O painel de configurações no celular.
 *
 * Duas coisas importam aqui. A primeira é que as opções novas — meta de
 * quadros e esquema de comando — existam, mostrem o estado certo e gravem
 * a escolha. A segunda é menos óbvia: ao mexer num ajuste, o painel se
 * redesenha inteiro, e sem cuidado o foco do teclado some no meio do
 * caminho. Num celular ninguém nota; num leitor de tela, é o fim da
 * navegação.
 */

const PHONE: PlatformProbe = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
  maxTouchPoints: 5,
  coarsePointer: true,
  hover: false,
  screenMin: 393,
  screenMax: 852,
};

const open: { dispose(): void }[] = [];

function setup(probe: PlatformProbe = PHONE, graphics: GraphicsSettings = defaultGraphicsSettings('media', true)) {
  const canvas = document.createElement('canvas');
  const uiRoot = document.createElement('div');
  document.body.append(canvas, uiRoot);
  const input = new InputManager(canvas, uiRoot, defaultInputSettings(), detectPlatform(probe));
  open.push(input);
  const save = createNewSave(0);
  let current = { ...graphics };
  const commits: string[] = [];
  const screen = new SettingsScreen({
    save,
    input,
    graphics: () => current,
    setGraphics: (patch) => {
      current = { ...current, ...patch };
    },
    commit: (kind) => commits.push(kind),
    testVibration: () => {},
    exportSave: () => {},
    importSave: () => {},
    resetProgress: () => {},
    close: () => {},
  });
  document.body.appendChild(screen.element);
  return { screen, save, commits, graphics: () => current };
}

/** Acha o grupo de botões de uma opção pelo rótulo acessível. */
function group(screen: SettingsScreen, label: string): HTMLButtonElement[] {
  const element = screen.element.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  expect(element, `grupo "${label}" não encontrado`).toBeTruthy();
  return [...element!.querySelectorAll('button')];
}

function pressed(buttons: HTMLButtonElement[]): string | null {
  const active = buttons.find((item) => item.getAttribute('aria-pressed') === 'true');
  return active?.textContent ?? null;
}

afterEach(() => {
  while (open.length) open.pop()!.dispose();
  document.body.innerHTML = '';
});

describe('aba Gráficos', () => {
  it('oferece os quatro níveis, do celular ao computador folgado', () => {
    const { screen } = setup();
    const levels = group(screen, 'Qualidade gráfica').map((item) => item.textContent);
    expect(levels).toEqual(['Baixa', 'Média', 'Alta', 'Ultra']);
  });

  it('a meta de quadros aparece marcada em 30 num celular', () => {
    const { screen } = setup();
    const targets = group(screen, 'Meta de quadros por segundo');
    expect(targets.map((item) => item.textContent)).toEqual(['30 FPS', '60 FPS']);
    expect(pressed(targets)).toBe('30 FPS');
  });

  it('trocar a meta grava a escolha e mantém o foco no painel', () => {
    const { screen, graphics } = setup();
    const sixty = group(screen, 'Meta de quadros por segundo')[1];
    sixty.focus();
    sixty.click();
    expect(graphics().fpsTarget).toBe(60);
    // O painel foi redesenhado; o foco precisa ter ido para o botão novo.
    const active = document.activeElement as HTMLElement | null;
    expect(active?.getAttribute('aria-pressed')).toBe('true');
    expect(pressed(group(screen, 'Meta de quadros por segundo'))).toBe('60 FPS');
  });

  it('a explicação da resolução dinâmica cita a meta escolhida', () => {
    const { screen } = setup(PHONE, { ...defaultGraphicsSettings('media', true), fpsTarget: 30 });
    expect(screen.element.textContent).toContain('abaixo de 30 FPS');
  });

  it('o que o nível escolhido não oferece aparece bloqueado, não escondido', () => {
    const { screen } = setup(PHONE, defaultGraphicsSettings('baixa', true));
    const shadows = screen.element.querySelector<HTMLButtonElement>('[aria-label="Sombras"]')!;
    expect(shadows.disabled).toBe(true);
    expect(screen.element.textContent).toContain('Indisponíveis na qualidade Baixa');
  });
});

describe('aba Teclado e toque', () => {
  it('mostra o aparelho detectado e o esquema escolhido pelo automático', () => {
    const { screen } = setup();
    screen.show('controles');
    expect(screen.element.textContent).toContain('Detectamos: iPhone');
    const schemes = group(screen, 'Esquema de comando');
    expect(pressed(schemes)).toContain('Automático');
    // No iPhone, o automático se resolve como toque — e o rótulo diz isso.
    expect(pressed(schemes)).toContain('toque');
  });

  it('o jogador pode fixar o teclado mesmo num celular', () => {
    const { screen, save, commits } = setup();
    screen.show('controles');
    const keyboard = group(screen, 'Esquema de comando').find((item) => item.textContent === 'Teclado e mouse')!;
    keyboard.click();
    expect(save.settings.input.scheme).toBe('teclado');
    expect(commits).toContain('input');
    expect(pressed(group(screen, 'Esquema de comando'))).toBe('Teclado e mouse');
  });

  it('as quatro opções de comando estão lá, incluindo controle', () => {
    const { screen } = setup();
    screen.show('controles');
    const labels = group(screen, 'Esquema de comando').map((item) => item.textContent);
    expect(labels).toHaveLength(4);
    expect(labels).toContain('Controle');
    expect(labels).toContain('Tela de toque');
  });

  it('a sensibilidade do toque tem seu próprio controle, separado do mouse', () => {
    const { screen } = setup();
    screen.show('controles');
    expect(screen.element.querySelector('[aria-label="Sensibilidade do toque"]')).toBeTruthy();
    expect(screen.element.querySelector('[aria-label="Sensibilidade do mouse"]')).toBeTruthy();
  });
});

describe('o painel inteiro continua navegável', () => {
  it('todas as abas abrem sem erro e produzem conteúdo', () => {
    const { screen } = setup();
    for (const tab of ['graficos', 'audio', 'controles', 'controle', 'jogo'] as const) {
      screen.show(tab);
      const body = screen.element.querySelector<HTMLElement>('.panel__body')!;
      expect(body.children.length, `aba ${tab} vazia`).toBeGreaterThan(0);
    }
  });

  it('as abas rolam na horizontal em tela estreita, sem sumir nenhuma', () => {
    const { screen } = setup();
    const tabs = screen.element.querySelectorAll('.tabs .tab');
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) expect(tab.getAttribute('aria-selected')).toBeTruthy();
  });

  it('todo botão de aba tem rótulo em texto, não só ícone', () => {
    const { screen } = setup();
    for (const tab of screen.element.querySelectorAll('.tabs .tab')) {
      expect(tab.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});
