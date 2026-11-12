import {
  ACTION_LABELS,
  GAME_ACTIONS,
  type GameAction,
  KEY_ACTIONS,
  type KeyAction,
  bindKey,
  bindPadButton,
  defaultInputSettings,
  keyLabel,
  padButtonGlyph,
  padButtonLabel,
} from '../input/InputSettings';
import type { InputManager } from '../input/InputManager';
import { QUALITY_LABELS, QUALITY_LEVELS, type GraphicsSettings, type QualityLevel, QualitySystem } from '../systems/QualitySystem';
import type { SaveData } from '../systems/SaveSystem';
import { button, choiceGroup, clear, field, h, keyCapContent, percent, slider, spokenLabel, toggle } from './dom';
import { type IconName, icon } from './icons';
import type { Screen } from './UIManager';

export type SettingsTab = 'graficos' | 'audio' | 'controles' | 'controle' | 'jogo';

const TABS: readonly { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'graficos', label: 'Gráficos', icon: 'sun' },
  { id: 'audio', label: 'Áudio', icon: 'sound' },
  { id: 'controles', label: 'Teclado e toque', icon: 'keyboard' },
  { id: 'controle', label: 'Controle', icon: 'gamepad' },
  { id: 'jogo', label: 'Jogo', icon: 'star' },
];

export interface SettingsHost {
  readonly save: SaveData;
  readonly input: InputManager;
  /** Configurações gráficas em uso (podem vir da detecção automática). */
  graphics(): GraphicsSettings;
  setGraphics(patch: Partial<GraphicsSettings>): void;
  /** Aplica e agenda a gravação das configurações de áudio, controles e jogo. */
  commit(kind: 'audio' | 'input' | 'gameplay'): void;
  testVibration(): void;
  exportSave(): void;
  resetProgress(): void;
  close(): void;
}

const multiplier = (value: number): string => `${value.toFixed(1).replace('.', ',')}×`;

/** Painel de configurações com abas: gráficos, áudio, controles, controle e jogo. */
export class SettingsScreen implements Screen {
  readonly id = 'configuracoes';
  readonly element: HTMLDivElement;
  private readonly tabsElement: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private tab: SettingsTab = 'graficos';
  private readonly tabButtons = new Map<SettingsTab, HTMLButtonElement>();
  private padStatus: HTMLDivElement | null = null;
  private padStatusText: HTMLSpanElement | null = null;
  private padTest: { left: HTMLElement; right: HTMLElement; buttons: HTMLElement[] } | null = null;
  private lastPadId: string | null = null;

  constructor(private readonly host: SettingsHost) {
    this.tabsElement = h('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'Seções das configurações' } });
    for (const tab of TABS) {
      const element = h('button', { class: 'tab', attrs: { type: 'button', role: 'tab' } }, h('span', { html: icon(tab.icon, 18) }), h('span', { text: tab.label }));
      element.addEventListener('click', () => this.show(tab.id, true));
      this.tabButtons.set(tab.id, element);
      this.tabsElement.appendChild(element);
    }
    this.body = h('div', { class: 'panel__body', attrs: { role: 'tabpanel' } });
    const close = button({ class: 'btn btn--ghost btn--icon', icon: icon('close', 20), ariaLabel: 'Fechar configurações', onClick: () => host.close() });
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'panel__header' }, h('h2', { class: 'panel__title', text: 'Configurações' }), close),
      this.tabsElement,
      this.body,
      h('div', { class: 'panel__footer' }, button({ class: 'btn btn--green', icon: icon('check', 20), label: 'Concluir', onClick: () => host.close() })),
    );
    this.element = h('div', { class: 'screen screen--dim', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Configurações' } }, panel);
    this.show('graficos');
  }

  onOpen(): void {
    this.show(this.tab);
  }

  onClose(): void {
    this.host.input.cancelCapture();
  }

  onBack(): void {
    if (this.host.input.isCapturing) {
      this.host.input.cancelCapture();
      return;
    }
    this.host.close();
  }

  onTab(direction: 1 | -1): void {
    const index = TABS.findIndex((t) => t.id === this.tab);
    const next = TABS[(index + direction + TABS.length) % TABS.length];
    this.show(next.id, true);
  }

  initialFocus(): HTMLElement | null {
    return this.tabButtons.get(this.tab) ?? null;
  }

  show(tab: SettingsTab, focus = false): void {
    this.host.input.cancelCapture();
    this.tab = tab;
    for (const [id, element] of this.tabButtons) {
      const active = id === tab;
      element.classList.toggle('is-active', active);
      element.setAttribute('aria-selected', String(active));
    }
    clear(this.body);
    this.padStatus = null;
    this.padTest = null;
    this.lastPadId = null;
    switch (tab) {
      case 'graficos':
        this.buildGraphics();
        break;
      case 'audio':
        this.buildAudio();
        break;
      case 'controles':
        this.buildControls();
        break;
      case 'controle':
        this.buildGamepad();
        break;
      default:
        this.buildGame();
        break;
    }
    this.body.scrollTop = 0;
    if (focus) {
      const element = this.tabButtons.get(tab);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /**
   * Reconstrói a aba atual depois de uma alteração, mantendo a rolagem e
   * devolvendo o foco ao controle equivalente (essencial para quem navega
   * por teclado ou controle).
   */
  private refresh(findFocus?: () => HTMLElement | null | undefined): void {
    const top = this.body.scrollTop;
    this.show(this.tab);
    this.body.scrollTop = top;
    const target = findFocus?.();
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private findButton(label: string): HTMLElement | undefined {
    return Array.from(this.body.querySelectorAll<HTMLElement>('button')).find((element) => element.textContent === label);
  }

  /* ------------------------------ Gráficos ------------------------------ */

  private buildGraphics(): void {
    const g = this.host.graphics();
    const set = (patch: Partial<GraphicsSettings>): void => this.host.setGraphics(patch);
    const levels = QUALITY_LEVELS.map((level) => ({ value: level, label: QUALITY_LABELS[level] }));
    const preset = QualitySystem.preset(g.quality);
    this.body.append(
      field(
        'Qualidade',
        choiceGroup<QualityLevel>('Qualidade gráfica', levels, g.quality, (quality) => {
          set({ quality });
          this.refresh(() => this.body.querySelector<HTMLElement>('.segmented [aria-pressed="true"]'));
        }),
        'Baixa para celulares e PCs modestos; Alta para placas de vídeo dedicadas.',
      ),
      field(
        'Sombras',
        // Recursos que o nível escolhido não oferece aparecem desligados e bloqueados.
        toggle('Sombras', g.shadows && preset.shadows, (shadows) => set({ shadows }), !preset.shadows),
        preset.shadows ? undefined : 'Indisponíveis na qualidade Baixa.',
      ),
      field(
        'Reflexos na água',
        toggle('Reflexos na água', g.waterReflections && preset.waterReflections, (waterReflections) => set({ waterReflections }), !preset.waterReflections),
        preset.waterReflections ? 'Reflete a cidade no lago e no mar.' : 'Disponíveis apenas na qualidade Alta.',
      ),
      field(
        'Escala de resolução',
        slider({ label: 'Escala de resolução', min: 0.5, max: 1, step: 0.05, value: g.resolutionScale, format: percent, onInput: (resolutionScale) => set({ resolutionScale }) }),
        'Reduza para ganhar desempenho.',
      ),
      field(
        'Resolução dinâmica',
        toggle('Resolução dinâmica', g.dynamicResolution, (dynamicResolution) => set({ dynamicResolution })),
        'Diminui a resolução automaticamente quando o jogo fica lento.',
      ),
      field(
        'Mostrar FPS',
        toggle('Mostrar FPS', g.showFps, (showFps) => set({ showFps })),
      ),
    );
  }

  /* -------------------------------- Áudio ------------------------------- */

  private buildAudio(): void {
    const audio = this.host.save.settings.audio;
    const commit = (): void => this.host.commit('audio');
    const volume = (label: string, key: 'master' | 'music' | 'ambience' | 'effects'): HTMLDivElement =>
      field(
        label,
        slider({
          label,
          min: 0,
          max: 1,
          step: 0.05,
          value: audio[key],
          format: percent,
          onInput: (value) => {
            audio[key] = value;
            commit();
          },
        }),
      );
    this.body.append(
      field(
        'Som',
        toggle('Som', !audio.muted, (on) => {
          audio.muted = !on;
          commit();
        }),
        'Liga ou desliga todo o áudio do jogo.',
      ),
      volume('Volume geral', 'master'),
      volume('Música', 'music'),
      volume('Ambiente', 'ambience'),
      volume('Efeitos', 'effects'),
      h('p', { class: 'muted', text: 'Todo o áudio do EDENWORLD é gerado em tempo real pelo navegador.' }),
    );
  }

  /* ------------------------------ Controles ----------------------------- */

  private buildControls(): void {
    const settings = this.host.save.settings;
    const input = settings.input;
    const commit = (): void => this.host.commit('input');

    this.body.append(
      h('h3', { class: 'section-title', text: 'Câmera' }),
      field('Sensibilidade do mouse', slider({ label: 'Sensibilidade do mouse', min: 0.2, max: 3, step: 0.1, value: input.mouseSensitivity, format: multiplier, onInput: (v) => ((input.mouseSensitivity = v), commit()) })),
      field('Sensibilidade do toque', slider({ label: 'Sensibilidade do toque', min: 0.2, max: 3, step: 0.1, value: input.touchSensitivity, format: multiplier, onInput: (v) => ((input.touchSensitivity = v), commit()) })),
      field('Inverter eixo vertical', toggle('Inverter eixo vertical', input.invertY, (v) => ((input.invertY = v), commit()))),
      field(
        'Capturar o cursor',
        toggle('Capturar o cursor', settings.gameplay.pointerLock, (v) => {
          settings.gameplay.pointerLock = v;
          this.host.commit('gameplay');
        }),
        'Ao clicar no jogo, o mouse gira a câmera livremente (Esc libera).',
      ),
      field(
        'Correr alterna',
        toggle('Correr alterna', input.toggleRun, (v) => ((input.toggleRun = v), commit())),
        'Um toque liga ou desliga a corrida, sem precisar segurar.',
      ),
      h('h3', { class: 'section-title', text: 'Teclas' }),
    );

    for (const action of KEY_ACTIONS) this.body.appendChild(this.keyRow(action));

    this.body.append(
      h('p', { class: 'muted', text: 'Clique em uma tecla e pressione a nova. Esc cancela. No celular, use o analógico virtual à esquerda e arraste à direita para girar a câmera.' }),
      h(
        'div',
        { class: 'row' },
        button({
          class: 'btn btn--ghost btn--small',
          label: 'Restaurar teclas padrão',
          onClick: () => {
            input.keys = defaultInputSettings().keys;
            commit();
            this.refresh(() => this.findButton('Restaurar teclas padrão'));
          },
        }),
      ),
    );
  }

  private keyRow(action: KeyAction): HTMLDivElement {
    const input = this.host.save.settings.input;
    const keys = h('div', { class: 'bind-row__keys' });
    const codes = input.keys[action];
    for (let slot = 0; slot < 2; slot++) {
      const code = codes[slot];
      const element = h(
        'button',
        {
          class: code ? 'bind-key' : 'bind-key is-empty',
          attrs: { type: 'button', 'aria-label': `${ACTION_LABELS[action]}: tecla ${slot + 1}, ${code ? spokenLabel(keyLabel(code)) : 'não definida'}. Ative para alterar.` },
        },
        ...keyCapContent(code ? keyLabel(code) : 'Definir'),
      );
      element.addEventListener('click', () => {
        element.classList.add('is-listening');
        element.textContent = 'Pressione…';
        void this.host.input.captureKey().then((captured) => {
          if (captured && captured !== 'Escape') {
            input.keys = bindKey(input.keys, action, captured, slot);
            this.host.commit('input');
          }
          if (this.tab === 'controles') {
            this.refresh(() => {
              const rows = Array.from(this.body.querySelectorAll<HTMLElement>('.bind-row'));
              return rows[KEY_ACTIONS.indexOf(action)]?.querySelectorAll<HTMLElement>('.bind-key')[slot];
            });
          }
        });
      });
      keys.appendChild(element);
    }
    return h('div', { class: 'bind-row' }, h('span', { class: 'field__label', text: ACTION_LABELS[action] }), keys);
  }

  /* ------------------------------- Controle ----------------------------- */

  private buildGamepad(): void {
    const input = this.host.save.settings.input;
    const commit = (): void => this.host.commit('input');

    this.padStatusText = h('span');
    this.padStatus = h('div', { class: 'pad-status', attrs: { role: 'status', 'aria-live': 'polite' } }, h('span', { class: 'pad-status__dot' }), this.padStatusText);

    const left = h('i');
    const right = h('i');
    const buttonsBox = h('div', { class: 'pad-test__buttons' });
    const buttons: HTMLElement[] = [];
    for (let i = 0; i < 16; i++) {
      const item = h('i', {}, ...keyCapContent(padButtonGlyph(i)));
      buttons.push(item);
      buttonsBox.appendChild(item);
    }
    this.padTest = { left, right, buttons };
    const test = h(
      'div',
      { class: 'pad-test', attrs: { 'aria-hidden': 'true' } },
      h('div', { class: 'pad-test__stick' }, left),
      h('div', { class: 'pad-test__stick' }, right),
      buttonsBox,
    );

    this.body.append(
      this.padStatus,
      test,
      field('Sensibilidade da câmera', slider({ label: 'Sensibilidade da câmera no controle', min: 0.2, max: 3, step: 0.1, value: input.padSensitivity, format: multiplier, onInput: (v) => ((input.padSensitivity = v), commit()) })),
      field(
        'Zona morta dos analógicos',
        slider({ label: 'Zona morta dos analógicos', min: 0.05, max: 0.5, step: 0.01, value: input.padDeadzone, format: percent, onInput: (v) => ((input.padDeadzone = v), commit()) }),
        'Aumente se o personagem ou a câmera se moverem sozinhos.',
      ),
      field('Inverter eixo vertical', toggle('Inverter eixo vertical', input.invertY, (v) => ((input.invertY = v), commit()))),
      field(
        'Vibração',
        h(
          'div',
          { class: 'row' },
          button({ class: 'btn btn--ghost btn--small', label: 'Testar', onClick: () => this.host.testVibration() }),
          toggle('Vibração', input.vibration, (v) => ((input.vibration = v), commit())),
        ),
      ),
      h('h3', { class: 'section-title', text: 'Botões' }),
    );

    for (const action of GAME_ACTIONS) this.body.appendChild(this.padRow(action));

    this.body.append(
      h('p', { class: 'muted', text: 'Analógico esquerdo: mover · Analógico direito: câmera · LB/RB: zoom. Nos menus: direcional para navegar, A confirma, B volta, LB/RB trocam de aba.' }),
      h(
        'div',
        { class: 'row' },
        button({
          class: 'btn btn--ghost btn--small',
          label: 'Restaurar botões padrão',
          onClick: () => {
            input.pad = defaultInputSettings().pad;
            commit();
            this.refresh(() => this.findButton('Restaurar botões padrão'));
          },
        }),
      ),
    );
    this.update();
  }

  private padRow(action: GameAction): HTMLDivElement {
    const input = this.host.save.settings.input;
    const element = h(
      'button',
      { class: 'bind-key', attrs: { type: 'button', 'aria-label': `${ACTION_LABELS[action]}: ${spokenLabel(padButtonLabel(input.pad[action]))}. Ative para alterar.` } },
      ...keyCapContent(padButtonLabel(input.pad[action])),
    );
    element.addEventListener('click', () => {
      element.classList.add('is-listening');
      element.textContent = 'Pressione um botão…';
      void this.host.input.capturePadButton().then((captured) => {
        if (captured !== null) {
          input.pad = bindPadButton(input.pad, action, captured);
          this.host.commit('input');
        }
        if (this.tab === 'controle') {
          this.refresh(() => {
            const rows = Array.from(this.body.querySelectorAll<HTMLElement>('.bind-row'));
            return rows[GAME_ACTIONS.indexOf(action)]?.querySelector<HTMLElement>('.bind-key');
          });
        }
      });
    });
    return h('div', { class: 'bind-row' }, h('span', { class: 'field__label', text: ACTION_LABELS[action] }), h('div', { class: 'bind-row__keys' }, element));
  }

  /** Atualiza o indicador e o teste do controle (chamado a cada quadro). */
  update(): void {
    if (this.tab !== 'controle' || !this.padStatus || !this.padStatusText) return;
    const status = this.host.input.gamepad.status;
    const id = status.connected ? status.id : '';
    if (id !== this.lastPadId) {
      this.lastPadId = id;
      this.padStatus.classList.toggle('is-on', status.connected);
      this.padStatusText.textContent = status.connected
        ? `Controle conectado: ${status.id.slice(0, 60)}${status.standard ? '' : ' (layout não padrão: confira os botões abaixo)'}`
        : 'Nenhum controle detectado. Conecte um controle e pressione qualquer botão.';
    }
    const test = this.padTest;
    const snapshot = this.host.input.gamepad.snapshot();
    if (!test) return;
    const ax = snapshot?.axes ?? [];
    test.left.style.transform = `translate(${(ax[0] ?? 0) * 24}px, ${(ax[1] ?? 0) * 24}px)`;
    test.right.style.transform = `translate(${(ax[2] ?? 0) * 24}px, ${(ax[3] ?? 0) * 24}px)`;
    for (let i = 0; i < test.buttons.length; i++) {
      test.buttons[i].classList.toggle('is-on', (snapshot?.buttons[i] ?? 0) > 0.5);
    }
  }

  /* --------------------------------- Jogo ------------------------------- */

  private buildGame(): void {
    const gameplay = this.host.save.settings.gameplay;
    const commit = (): void => this.host.commit('gameplay');
    this.body.append(
      field(
        'Câmera automática',
        toggle('Câmera automática', gameplay.autoCamera, (v) => ((gameplay.autoCamera = v), commit())),
        'A câmera se alinha atrás do personagem enquanto você anda.',
      ),
      field('Dicas de controles', toggle('Dicas de controles', gameplay.hints, (v) => ((gameplay.hints = v), commit())), 'Mostra os comandos básicos ao entrar no jogo.'),
      field(
        'Passagem do tempo',
        choiceGroup(
          'Passagem do tempo',
          [
            { value: 'normal', label: 'Normal' },
            { value: 'rapido', label: 'Rápida' },
            { value: 'parado', label: 'Parada' },
          ] as const,
          gameplay.timePace,
          (v) => ((gameplay.timePace = v), commit()),
        ),
        'Um dia completo dura 24 minutos no ritmo normal.',
      ),
      h('h3', { class: 'section-title', text: 'Dados salvos' }),
      h('p', {
        class: 'muted',
        text: this.host.save.profile.created
          ? 'Seu progresso fica guardado apenas neste navegador. Nenhum dado é enviado para servidores.'
          : 'Nenhum jogo iniciado ainda. O progresso ficará guardado apenas neste navegador.',
      }),
      h(
        'div',
        { class: 'row' },
        button({ class: 'btn btn--ghost btn--small', label: 'Exportar salvamento', onClick: () => this.host.exportSave() }),
        button({ class: 'btn btn--danger btn--small', label: 'Apagar progresso', onClick: () => this.host.resetProgress() }),
      ),
    );
  }
}
