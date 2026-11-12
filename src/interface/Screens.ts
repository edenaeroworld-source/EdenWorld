import { GAME } from '../core/Config';
import { button, h } from './dom';
import { type IconName, icon } from './icons';
import type { Screen } from './UIManager';

const asset = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

function logo(): HTMLImageElement {
  return h('img', {
    class: 'logo',
    attrs: {
      src: asset('assets/ui/logo-edenworld-480.webp'),
      srcset: `${asset('assets/ui/logo-edenworld-480.webp')} 480w, ${asset('assets/ui/logo-edenworld.webp')} 1293w`,
      sizes: '(max-width: 600px) 74vw, 440px',
      alt: 'EDENWORLD',
      width: 480,
      height: 451,
      decoding: 'async',
      draggable: 'false',
    },
  });
}

function bubbles(count: number): HTMLDivElement {
  const layer = h('div', { class: 'bubbles', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < count; i++) {
    const bubble = document.createElement('i');
    // Distribuição determinística (sem aleatoriedade em tempo de execução).
    const t = (i * 0.618034) % 1;
    const size = 3 + ((i * 7) % 9);
    bubble.style.setProperty('--x', `${(t * 96 + 2).toFixed(1)}%`);
    bubble.style.setProperty('--s', `${size}vmin`);
    bubble.style.setProperty('--d', `${11 + ((i * 5) % 12)}s`);
    bubble.style.setProperty('--delay', `${-((i * 3.7) % 20).toFixed(1)}s`);
    layer.appendChild(bubble);
  }
  return layer;
}

const TIPS = [
  'Procure os 24 Cristais de Luz espalhados por Aurora City.',
  'Sente-se nos bancos para apreciar a vista.',
  'Ative os portais para viajar rapidamente pela cidade.',
  'À noite, a aurora ilumina o céu de Aurora City.',
  'Abra o EdenPhone para ver o mapa, o diário e tirar fotos.',
  'Toque na Esfera Aurora para mudar as cores da praça.',
  'Você pode mudar seu visual no Ateliê Aero.',
] as const;

/** Tela de carregamento com barra de progresso. */
export class LoadingScreen {
  readonly element: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly label: HTMLParagraphElement;
  private readonly track: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.bar = h('div', { class: 'progress__bar' });
    this.track = h('div', { class: 'progress', attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-label': 'Carregando' } }, this.bar);
    this.label = h('p', { class: 'loading__label', text: 'Preparando o Éden…', attrs: { 'aria-live': 'polite' } });
    const tip = TIPS[Math.floor(Date.now() / 1000) % TIPS.length];
    this.element = h(
      'div',
      { class: 'loading' },
      bubbles(14),
      logo(),
      h('p', { class: 'tagline', text: GAME.tagline }),
      this.track,
      this.label,
      h('p', { class: 'loading__tip', text: `Dica: ${tip}` }),
    );
    root.appendChild(this.element);
  }

  setProgress(fraction: number, label: string): void {
    const value = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    this.bar.style.width = `${value}%`;
    this.track.setAttribute('aria-valuenow', String(value));
    this.label.textContent = label;
  }

  /** Esmaece e remove a tela. */
  finish(): Promise<void> {
    this.element.classList.add('is-leaving');
    return new Promise((resolve) => {
      window.setTimeout(() => {
        this.element.remove();
        resolve();
      }, 620);
    });
  }
}

export interface MainMenuCallbacks {
  onContinue(): void;
  onNewGame(): void;
  onSettings(): void;
  onAbout(): void;
}

/** Menu principal, exibido sobre a cidade ao vivo. */
export class MainMenuScreen implements Screen {
  readonly id = 'menu';
  readonly element: HTMLDivElement;
  private readonly buttons: HTMLDivElement;
  private readonly welcome: HTMLParagraphElement;
  private first: HTMLButtonElement | null = null;

  constructor(private readonly callbacks: MainMenuCallbacks) {
    this.buttons = h('div', { class: 'menu__buttons' });
    this.welcome = h('p', { class: 'menu__welcome' });
    this.element = h(
      'div',
      { class: 'menu', attrs: { role: 'dialog', 'aria-label': 'Menu principal' } },
      logo(),
      h('p', { class: 'tagline', text: GAME.tagline }),
      this.welcome,
      this.buttons,
      h('p', { class: 'menu__foot', text: `${GAME.name} ${GAME.versionLabel} · Universo ${GAME.universe}` }),
    );
  }

  /** @param playerName nome do jogador com jogo salvo, ou `null` se for a primeira vez. */
  configure(playerName: string | null): void {
    this.buttons.replaceChildren();
    const c = this.callbacks;
    if (playerName !== null) {
      this.welcome.textContent = `Que bom te ver de novo, ${playerName}!`;
      this.first = button({ class: 'btn btn--green btn--large', icon: icon('play', 22), label: 'Continuar', onClick: () => c.onContinue() });
      this.buttons.append(
        this.first,
        button({ class: 'btn btn--large', icon: icon('star', 20), label: 'Novo jogo', onClick: () => c.onNewGame() }),
      );
    } else {
      this.welcome.textContent = 'Bem-vindo(a) a Aurora City.';
      this.first = button({ class: 'btn btn--green btn--large', icon: icon('play', 22), label: 'Jogar', onClick: () => c.onContinue() });
      this.buttons.append(this.first);
    }
    // Opções secundárias lado a lado: o menu cabe em telas baixas (celular deitado).
    this.buttons.append(
      h(
        'div',
        { class: 'menu__row' },
        button({ class: 'btn btn--ghost', icon: icon('settings', 20), label: 'Configurações', onClick: () => c.onSettings() }),
        button({ class: 'btn btn--ghost', icon: icon('info', 20), label: 'Sobre', onClick: () => c.onAbout() }),
      ),
    );
  }

  initialFocus(): HTMLElement | null {
    return this.first;
  }
}

export interface PauseCallbacks {
  onResume(): void;
  onSettings(): void;
  onAvatar(): void;
  onUnstuck(): void;
  onQuit(): void;
}

/** Menu de pausa. */
export class PauseScreen implements Screen {
  readonly id = 'pausa';
  readonly element: HTMLDivElement;
  private readonly resume: HTMLButtonElement;

  constructor(private readonly callbacks: PauseCallbacks) {
    const c = callbacks;
    this.resume = button({ class: 'btn btn--green btn--wide', icon: icon('play', 20), label: 'Continuar', onClick: () => c.onResume() });
    const panel = h(
      'div',
      { class: 'panel panel--narrow' },
      h('div', { class: 'panel__header' }, h('h2', { class: 'panel__title', text: 'Jogo pausado' })),
      h(
        'div',
        { class: 'panel__body stack' },
        this.resume,
        button({ class: 'btn btn--wide', icon: icon('settings', 20), label: 'Configurações', onClick: () => c.onSettings() }),
        button({ class: 'btn btn--wide', icon: icon('avatar', 20), label: 'Editar avatar', onClick: () => c.onAvatar() }),
        button({ class: 'btn btn--ghost btn--wide', icon: icon('home', 20), label: 'Voltar para a praça', onClick: () => c.onUnstuck() }),
        button({ class: 'btn btn--ghost btn--wide', icon: icon('back', 20), label: 'Salvar e sair para o menu', onClick: () => c.onQuit() }),
        h('p', { class: 'muted', text: 'O progresso é salvo automaticamente neste navegador.' }),
      ),
    );
    this.element = h('div', { class: 'screen screen--dim', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Jogo pausado' } }, panel);
  }

  onBack(): void {
    this.callbacks.onResume();
  }

  initialFocus(): HTMLElement | null {
    return this.resume;
  }
}

export interface DialogAction {
  label: string;
  icon?: IconName;
  kind?: 'primary' | 'ghost' | 'danger' | 'green';
  onClick(): void;
}

export interface DialogOptions {
  id?: string;
  title: string;
  paragraphs: readonly string[];
  /** Texto pequeno abaixo do conteúdo. */
  note?: string;
  actions: readonly DialogAction[];
  /** Ação ao dispensar (Esc/B). Se ausente, usa a última ação. */
  onDismiss?(): void;
}

/** Diálogo genérico: placas, confirmações e avisos. */
export class DialogScreen implements Screen {
  readonly id: string;
  readonly element: HTMLDivElement;
  private primary: HTMLButtonElement | null = null;

  constructor(private readonly options: DialogOptions) {
    this.id = options.id ?? 'dialogo';
    const body = h('div', { class: 'panel__body' });
    for (const paragraph of options.paragraphs) body.appendChild(h('p', { text: paragraph }));
    if (options.note) body.appendChild(h('p', { class: 'muted', text: options.note }));
    const footer = h('div', { class: 'panel__footer' });
    options.actions.forEach((action, index) => {
      const kind = action.kind ?? 'primary';
      const className = kind === 'primary' ? 'btn' : `btn btn--${kind}`;
      const element = button({ class: className, icon: action.icon ? icon(action.icon, 20) : undefined, label: action.label, onClick: () => action.onClick() });
      if (index === options.actions.length - 1) this.primary = element;
      footer.appendChild(element);
    });
    const panel = h(
      'div',
      { class: 'panel panel--medium' },
      h('div', { class: 'panel__header' }, h('h2', { class: 'panel__title', text: options.title })),
      body,
      footer,
    );
    this.element = h('div', { class: 'screen screen--dim', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title } }, panel);
  }

  onBack(): void {
    if (this.options.onDismiss) this.options.onDismiss();
    else this.options.actions[this.options.actions.length - 1]?.onClick();
  }

  initialFocus(): HTMLElement | null {
    return this.primary;
  }
}

/** Tela de erro fatal (sem WebGL2, falha ao iniciar...). Não depende do restante do jogo. */
export function showErrorScreen(root: HTMLElement, title: string, paragraphs: readonly string[], allowReload = true): void {
  root.querySelector('.error-screen')?.remove();
  const body = h('div', { class: 'panel__body' });
  for (const paragraph of paragraphs) body.appendChild(h('p', { text: paragraph }));
  const footer = h('div', { class: 'panel__footer' });
  if (allowReload) footer.appendChild(button({ icon: icon('play', 20), label: 'Tentar novamente', onClick: () => location.reload() }));
  const panel = h('div', { class: 'panel panel--medium' }, h('div', { class: 'panel__header' }, h('h2', { class: 'panel__title', text: title })), body, footer);
  root.appendChild(h('div', { class: 'error-screen', attrs: { role: 'alert' } }, logo(), panel));
}
