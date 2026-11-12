import { button, clear, h, keyCapContent } from './dom';
import { type IconName, icon } from './icons';

export interface HudPrompt {
  /** Texto do comando (tecla ou botão). Vazio em dispositivos de toque. */
  key: string;
  round: boolean;
  action: string;
  name: string;
}

export interface HudHint {
  key: string;
  label: string;
}

export interface HudCallbacks {
  onPhone(): void;
  onMenu(): void;
  onInteract(): void;
  onExitMode(): void;
  onCapture(): void;
}

export type HudMode = 'normal' | 'scenic' | 'photo';

/** Interface em jogo: local, relógio, cristais, dicas, avisos e ações rápidas. */
export class HUD {
  readonly element: HTMLDivElement;
  private readonly placeMain: HTMLSpanElement;
  private readonly placeSub: HTMLSpanElement;
  private readonly clockPill: HTMLDivElement;
  private readonly clockIcon: HTMLSpanElement;
  private readonly clockText: HTMLSpanElement;
  private readonly crystalText: HTMLSpanElement;
  private readonly corners: HTMLElement[];
  private readonly prompt: HTMLButtonElement;
  private readonly promptKey: HTMLSpanElement;
  private readonly promptText: HTMLSpanElement;
  private readonly hints: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly bannerElement: HTMLDivElement;
  private readonly bannerSub: HTMLSpanElement;
  private readonly bannerMain: HTMLSpanElement;
  private readonly fps: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly barLabel: HTMLSpanElement;
  private readonly captureButton: HTMLButtonElement;
  private readonly fadeElement: HTMLDivElement;
  private readonly flashElement: HTMLDivElement;
  private hintTimer = 0;
  private lastNight: boolean | null = null;
  private mode: HudMode = 'normal';
  private promptVisible = false;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.placeSub = h('span', { class: 'pill__sub', text: 'Aurora City' });
    this.placeMain = h('span', { class: 'pill__main', text: 'Praça Central' });
    const place = h('div', { class: 'pill pill--place', attrs: { role: 'status', 'aria-live': 'polite' } }, this.placeSub, this.placeMain);
    this.clockIcon = h('span', { html: icon('sun', 18) });
    this.clockText = h('span', { text: '09:30' });
    this.clockPill = h('div', { class: 'pill' }, this.clockIcon, this.clockText);
    const topLeft = h('div', { class: 'hud__corner hud__corner--tl' }, place, this.clockPill);

    this.crystalText = h('span', { text: '0/0' });
    const crystals = h('div', { class: 'pill', attrs: { title: 'Cristais de Luz' } }, h('span', { html: icon('crystal', 18) }), this.crystalText);
    const phone = button({ class: 'btn btn--icon hud__btn', icon: icon('phone', 22), ariaLabel: 'Abrir EdenPhone', onClick: () => callbacks.onPhone() });
    const menu = button({ class: 'btn btn--ghost btn--icon hud__btn', icon: icon('menu', 22), ariaLabel: 'Pausar e abrir o menu', onClick: () => callbacks.onMenu() });
    phone.tabIndex = -1;
    menu.tabIndex = -1;
    const topRight = h('div', { class: 'hud__corner hud__corner--tr' }, crystals, phone, menu);
    this.corners = [topLeft, topRight];

    this.promptKey = h('span', { class: 'keycap' });
    this.promptText = h('span', { class: 'hud__prompt-text' });
    this.prompt = h('button', { class: 'hud__prompt', attrs: { type: 'button', tabindex: -1 } }, this.promptKey, this.promptText);
    this.prompt.hidden = true;
    this.prompt.addEventListener('click', () => callbacks.onInteract());

    this.hints = h('div', { class: 'hud__hints' });
    this.hints.hidden = true;
    this.toasts = h('div', { class: 'hud__toasts', attrs: { role: 'status', 'aria-live': 'polite' } });
    this.bannerSub = h('span', { class: 'hud__banner-sub' });
    this.bannerMain = h('span', { class: 'hud__banner-main' });
    this.bannerElement = h('div', { class: 'hud__banner', attrs: { 'aria-hidden': 'true' } }, this.bannerSub, this.bannerMain);
    this.fps = h('div', { class: 'hud__fps' });
    this.fps.hidden = true;

    this.barLabel = h('span', { class: 'hud__bar-label' });
    this.captureButton = button({ class: 'btn btn--green btn--small', icon: icon('camera', 18), label: 'Fotografar', onClick: () => callbacks.onCapture() });
    const exit = button({ class: 'btn btn--ghost btn--small', icon: icon('back', 18), label: 'Sair', onClick: () => callbacks.onExitMode() });
    this.captureButton.tabIndex = -1;
    exit.tabIndex = -1;
    this.bar = h('div', { class: 'hud__bar' }, this.barLabel, this.captureButton, exit);
    this.bar.hidden = true;

    this.fadeElement = h('div', { class: 'fade' });
    this.flashElement = h('div', { class: 'flash' });

    this.element = h(
      'div',
      { class: 'hud is-hidden' },
      topLeft,
      topRight,
      this.bannerElement,
      this.hints,
      this.prompt,
      this.bar,
      this.fps,
      this.fadeElement,
      this.flashElement,
    );
    // Os avisos são irmãos do HUD: continuam visíveis no menu e sobre as telas.
    root.append(this.element, this.toasts);
  }

  setVisible(visible: boolean): void {
    this.element.classList.toggle('is-hidden', !visible);
  }

  setMode(mode: HudMode, label = ''): void {
    this.mode = mode;
    const normal = mode === 'normal';
    for (const corner of this.corners) corner.hidden = !normal;
    this.hints.hidden = !normal || this.hints.childElementCount === 0;
    this.bar.hidden = normal;
    this.captureButton.hidden = mode !== 'photo';
    this.barLabel.textContent = label;
    this.prompt.hidden = !normal || !this.promptVisible;
    // Nada de letreiros sobre a paisagem ao fotografar ou usar um telescópio.
    this.bannerElement.hidden = !normal;
  }

  setPlace(area: string, city: string): void {
    this.placeMain.textContent = area;
    this.placeSub.textContent = city;
  }

  setClock(label: string, night: boolean, weather: string): void {
    this.clockText.textContent = `${label} · ${weather}`;
    if (night !== this.lastNight) {
      this.lastNight = night;
      this.clockIcon.innerHTML = icon(night ? 'moon' : 'sun', 18);
    }
  }

  setCrystals(count: number, total: number): void {
    this.crystalText.textContent = `${count}/${total}`;
  }

  setPrompt(prompt: HudPrompt | null): void {
    this.promptVisible = prompt !== null;
    if (!prompt) {
      this.prompt.hidden = true;
      return;
    }
    this.promptKey.hidden = prompt.key === '';
    this.promptKey.replaceChildren(...keyCapContent(prompt.key));
    this.promptKey.classList.toggle('keycap--round', prompt.round);
    clear(this.promptText);
    this.promptText.append(prompt.action, ' ');
    this.promptText.appendChild(h('small', { text: `· ${prompt.name}` }));
    this.prompt.setAttribute('aria-label', `${prompt.action}: ${prompt.name}`);
    this.prompt.hidden = this.mode !== 'normal';
  }

  /** Mostra as dicas de controles por alguns segundos (ou as oculta com `null`). */
  setHints(hints: readonly HudHint[] | null, seconds = 14): void {
    window.clearTimeout(this.hintTimer);
    clear(this.hints);
    if (!hints || hints.length === 0) {
      this.hints.hidden = true;
      return;
    }
    for (const hint of hints) {
      this.hints.appendChild(h('span', {}, h('span', { class: 'keycap' }, ...keyCapContent(hint.key)), hint.label));
    }
    this.hints.classList.remove('is-faded');
    this.hints.hidden = this.mode !== 'normal';
    this.hintTimer = window.setTimeout(() => this.hints.classList.add('is-faded'), seconds * 1000);
  }

  toast(text: string, iconName: IconName = 'info', seconds = 3.6): void {
    const element = h('div', { class: 'toast' }, h('span', { html: icon(iconName, 20) }), h('span', { text }));
    this.toasts.appendChild(element);
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      element.classList.add('is-leaving');
      window.setTimeout(() => element.remove(), 320);
    }, seconds * 1000);
  }

  banner(sub: string, main: string): void {
    this.bannerSub.textContent = sub;
    this.bannerMain.textContent = main;
    this.bannerElement.classList.remove('is-showing');
    // Reinicia a animação.
    void this.bannerElement.offsetWidth;
    this.bannerElement.classList.add('is-showing');
  }

  setFps(text: string | null): void {
    this.fps.hidden = text === null;
    if (text !== null) this.fps.textContent = text;
  }

  /** Escurece/clareia a tela (transição de portais). Resolve ao fim da transição. */
  fade(on: boolean): Promise<void> {
    this.fadeElement.classList.toggle('is-on', on);
    return new Promise((resolve) => window.setTimeout(resolve, 340));
  }

  flash(): void {
    this.flashElement.classList.remove('is-on');
    void this.flashElement.offsetWidth;
    this.flashElement.classList.add('is-on');
  }

  dispose(): void {
    window.clearTimeout(this.hintTimer);
    this.element.remove();
    this.toasts.remove();
  }
}
