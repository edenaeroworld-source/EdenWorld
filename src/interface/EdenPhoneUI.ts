import { FUTURE_EVENTS, FUTURE_FEATURES, type FutureFeature } from '../shared/FutureFeatures';
import type { TimePaceSetting } from '../systems/SaveSystem';
import { button, choiceGroup, clear, h } from './dom';
import { type EdenAppsHost, buildAfters, buildFeed, buildGram, buildMusic, buildPeople, buildReads, buildTalk } from './EdenApps';
import { type UniverseAppHost, buildActivities, buildAtlas, buildHomes, buildPets, buildStores, buildWallet } from './UniverseApps';
import { type IconName, icon } from './icons';
import { type MapMarker, drawMap } from './MapRenderer';
import type { Screen } from './UIManager';

export type PhoneApp =
  | 'home'
  | 'mapa'
  | 'diario'
  | 'jornada'
  | 'ceu'
  | 'eventos'
  | 'pessoas'
  | 'talk'
  | 'gram'
  | 'feed'
  | 'reads'
  | 'afters'
  | 'musica'
  | 'atlas'
  | 'carteira'
  | 'lojas'
  | 'bichos'
  | 'imoveis'
  | 'atividades'
  | `recurso:${string}`;

export interface PhonePortal {
  id: string;
  name: string;
  x: number;
  z: number;
  unlocked: boolean;
}

export interface JournalEntry {
  id: string;
  title: string;
  paragraphs: readonly string[];
  read: boolean;
}

export interface PhoneStats {
  crystals: readonly [number, number];
  entries: readonly [number, number];
  areas: readonly [number, number];
  portals: readonly [number, number];
  distance: string;
  playTime: string;
  wishes: number;
  photos: number;
  completion: number;
  day: number;
}

export type WeatherChoice = 'auto' | 'limpo' | 'brisa' | 'neblina';

export interface PhoneHost extends EdenAppsHost, UniverseAppHost {
  playerName(): string;
  clockLabel(): string;
  weatherLabel(): string;
  areaName(): string;
  baseMap(): HTMLCanvasElement;
  playerPose(): { x: number; z: number; heading: number };
  portals(): PhonePortal[];
  travel(portalId: string): void;
  journal(): JournalEntry[];
  stats(): PhoneStats;
  crystalHint(): string | null;
  setHour(hours: number): void;
  timePace(): TimePaceSetting;
  setTimePace(pace: TimePaceSetting): void;
  weather(): WeatherChoice;
  setWeather(choice: WeatherChoice): void;
  openCamera(): void;
  openAvatar(): void;
  openSettings(): void;
  close(): void;
}

interface AppDef {
  id: string;
  label: string;
  icon: IconName;
  colors: readonly [string, string];
  soon?: boolean;
  /** Selo curto no canto do ícone (ex.: "novo"). */
  badge?: string;
  open(): void;
}

/** EdenPhone: o celular do jogador, com mapa, diário, câmera e ajustes. */
export class EdenPhoneUI implements Screen {
  readonly id = 'edenphone';
  readonly element: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly statusClock: HTMLSpanElement;
  private readonly homeButton: HTMLButtonElement;
  private app: PhoneApp = 'home';
  private pendingApp: PhoneApp = 'home';
  /** Aplicativo em que o celular foi aberto (ex.: o mapa, ao usar um portal). */
  private entryApp: PhoneApp = 'home';
  private mapCanvas: HTMLCanvasElement | null = null;
  /** Conversa aberta no EdenTalk (null = lista). */
  private talkThread: string | null = null;
  /** Texto aberto no EdenReads (null = acervo). */
  private readDoc: string | null = null;
  private mapMarkers: MapMarker[] = [];
  private lastMapDraw = 0;
  private lastClock = '';

  constructor(private readonly host: PhoneHost) {
    this.statusClock = h('span', { text: '09:30' });
    this.content = h('div', { class: 'phone__content' });
    this.homeButton = button({ class: 'btn btn--ghost btn--small', icon: icon('home', 18), label: 'Início', onClick: () => this.show('home', true) });
    const close = button({ class: 'btn btn--small', icon: icon('close', 18), label: 'Guardar', onClick: () => host.close() });
    const screen = h(
      'div',
      { class: 'phone__screen' },
      h('div', { class: 'phone__status' }, this.statusClock, h('span', { text: 'EdenOS · Genesis' })),
      this.content,
      h('div', { class: 'phone__home-bar' }, this.homeButton, close),
    );
    this.element = h('div', { class: 'screen screen--dim', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'EdenPhone' } }, h('div', { class: 'phone' }, screen));
  }

  /** Define o aplicativo exibido na próxima abertura. */
  prepare(app: PhoneApp = 'home'): void {
    this.pendingApp = app;
  }

  onOpen(): void {
    this.entryApp = this.pendingApp;
    this.show(this.pendingApp);
    this.pendingApp = 'home';
  }

  onClose(): void {
    this.mapCanvas = null;
  }

  onBack(): void {
    // Dentro de um aplicativo com subtela, "voltar" sobe um nível antes de sair.
    if (this.app === 'talk' && this.talkThread !== null) {
      this.talkThread = null;
      this.show('talk', true);
      return;
    }
    if (this.app === 'reads' && this.readDoc !== null) {
      this.readDoc = null;
      this.show('reads', true);
      return;
    }
    // "Voltar" fecha o celular na tela inicial e também no aplicativo em que
    // ele foi aberto direto pelo mundo (portal, holomapa, painel de eventos).
    if (this.app !== 'home' && this.app !== this.entryApp) this.show('home', true);
    else this.host.close();
  }

  onMenu(): void {
    this.host.close();
  }

  initialFocus(): HTMLElement | null {
    return this.content.querySelector<HTMLElement>('button') ?? this.homeButton;
  }

  update(): void {
    const clock = this.host.clockLabel();
    if (clock !== this.lastClock) {
      this.lastClock = clock;
      this.statusClock.textContent = clock;
    }
    if (this.app === 'mapa' && this.mapCanvas) {
      const now = performance.now();
      if (now - this.lastMapDraw > 200) {
        this.lastMapDraw = now;
        drawMap(this.mapCanvas, this.host.baseMap(), this.host.playerPose(), this.mapMarkers);
      }
    }
  }

  show(app: PhoneApp, focus = false): void {
    this.app = app;
    this.mapCanvas = null;
    clear(this.content);
    this.homeButton.hidden = app === 'home';
    if (app === 'home') this.buildHome();
    else if (app === 'mapa') this.buildMap();
    else if (app === 'diario') this.buildJournal();
    else if (app === 'jornada') this.buildJourney();
    else if (app === 'ceu') this.buildSky();
    else if (app === 'eventos') this.buildEvents();
    else if (app === 'pessoas') buildPeople(this.host, this.content, (id) => this.openThread(id));
    else if (app === 'talk') buildTalk(this.host, this.content, this.talkThread, (id) => this.openThread(id));
    else if (app === 'gram') buildGram(this.host, this.content, () => this.show('gram'));
    else if (app === 'feed') buildFeed(this.host, this.content);
    else if (app === 'reads')
      buildReads(this.host, this.content, this.readDoc, (id) => {
        this.readDoc = id;
        this.show('reads', true);
      });
    else if (app === 'afters') buildAfters(this.host, this.content, () => this.show('afters'));
    else if (app === 'musica') buildMusic(this.host, this.content, () => this.show('musica'));
    else if (app === 'atlas') buildAtlas(this.host, this.content);
    else if (app === 'carteira') buildWallet(this.host, this.content);
    else if (app === 'lojas') buildStores(this.host, this.content);
    else if (app === 'bichos') buildPets(this.host, this.content);
    else if (app === 'imoveis') buildHomes(this.host, this.content);
    else if (app === 'atividades') buildActivities(this.host, this.content);
    else this.buildFeature(app.slice('recurso:'.length));
    this.content.scrollTop = 0;
    if (focus) (this.content.querySelector<HTMLElement>('button') ?? this.homeButton).focus({ preventScroll: true });
  }

  /**
   * Redesenha o aplicativo aberto, mantendo o foco onde estava.
   *
   * As telas do universo mudam dados ao serem usadas (comprar, adotar,
   * viajar), e precisam se redesenhar sem roubar o foco de quem navega
   * pelo teclado.
   */
  refreshCurrent(): void {
    const active = document.activeElement as HTMLElement | null;
    const label = active?.getAttribute('aria-label') ?? active?.textContent ?? null;
    this.show(this.app);
    if (!label) return;
    for (const candidate of this.content.querySelectorAll<HTMLElement>('button')) {
      if ((candidate.getAttribute('aria-label') ?? candidate.textContent) === label) {
        candidate.focus({ preventScroll: true });
        return;
      }
    }
  }

  /** Abre uma conversa do EdenTalk (ou a lista, com `null`). */
  private openThread(id: string | null): void {
    this.talkThread = id;
    this.show('talk', true);
  }

  private head(title: string): HTMLDivElement {
    return h('div', { class: 'phone__app-head' }, h('h2', { text: title }));
  }

  /* -------------------------------- Início ------------------------------ */

  private buildHome(): void {
    const greeting = h('p', { class: 'phone__greeting' }, 'Olá, ', h('b', { text: this.host.playerName() }), '!');
    const apps: AppDef[] = [
      { id: 'mapa', label: 'Mapa', icon: 'map', colors: ['#9df0b0', '#1fae6b'], open: () => this.show('mapa', true) },
      { id: 'diario', label: 'Diário', icon: 'book', colors: ['#ffe9a6', '#f2a83a'], open: () => this.show('diario', true) },
      { id: 'jornada', label: 'Jornada', icon: 'star', colors: ['#8fe6ff', '#1b82ea'], open: () => this.show('jornada', true) },
      { id: 'camera', label: 'Câmera', icon: 'camera', colors: ['#e6eef6', '#7d93aa'], open: () => this.host.openCamera() },
      { id: 'ceu', label: 'Céu', icon: 'sun', colors: ['#ffe98a', '#ff9f43'], open: () => this.show('ceu', true) },
      { id: 'avatar', label: 'Avatar', icon: 'avatar', colors: ['#ffc1d6', '#f0588c'], open: () => this.host.openAvatar() },
      { id: 'pessoas', label: 'Pessoas', icon: 'people', colors: ['#ffd9a6', '#ef9a2e'], open: () => this.show('pessoas', true) },
      {
        id: 'talk',
        label: 'EdenTalk',
        icon: 'chat',
        colors: ['#a8d8ff', '#2f6fe0'],
        badge: this.host.threads().some((thread) => thread.unread) ? 'novo' : undefined,
        open: () => this.openThread(null),
      },
      { id: 'gram', label: 'EdenGram', icon: 'camera', colors: ['#ffc1d6', '#f0588c'], open: () => this.show('gram', true) },
      { id: 'feed', label: 'EdenFeed', icon: 'feed', colors: ['#bfe9ff', '#1b82ea'], open: () => this.show('feed', true) },
      { id: 'reads', label: 'EdenReads', icon: 'book', colors: ['#a8f0c0', '#22b577'], open: () => this.show('reads', true) },
      {
        id: 'afters',
        label: 'Afters',
        icon: 'sparkle',
        colors: ['#ffc1d6', '#c0398c'],
        badge: this.host.afters().unlocked ? undefined : 'bloqueado',
        open: () => this.show('afters', true),
      },
      { id: 'musica', label: 'EdenMusic', icon: 'music', colors: ['#d6b8ff', '#7a3fe0'], open: () => this.show('musica', true) },
      { id: 'atlas', label: 'Mapa do Éden', icon: 'map', colors: ['#a6ffe4', '#108d79'], open: () => this.show('atlas', true) },
      { id: 'carteira', label: 'Carteira', icon: 'star', colors: ['#ffe28a', '#e0821b'], open: () => this.show('carteira', true) },
      { id: 'lojas', label: 'Lojas', icon: 'ticket', colors: ['#bfe9ff', '#1b82ea'], open: () => this.show('lojas', true) },
      { id: 'bichos', label: 'EdenPawl', icon: 'people', colors: ['#ffd9a6', '#ef9a2e'], open: () => this.show('bichos', true) },
      { id: 'imoveis', label: 'Imóveis', icon: 'book', colors: ['#b9f5c4', '#2f9e5e'], open: () => this.show('imoveis', true) },
      { id: 'atividades', label: 'Atividades', icon: 'star', colors: ['#c9a6ff', '#7a3fe0'], open: () => this.show('atividades', true) },
      { id: 'eventos', label: 'Eventos', icon: 'ticket', colors: ['#d6b8ff', '#8a5be0'], soon: true, open: () => this.show('eventos', true) },
      { id: 'ajustes', label: 'Ajustes', icon: 'settings', colors: ['#dfe8f0', '#6f8296'], open: () => this.host.openSettings() },
      ...FUTURE_FEATURES.map(
        (feature): AppDef => ({
          id: feature.id,
          label: feature.name,
          icon: feature.icon,
          colors: feature.colors,
          soon: feature.status === 'em-breve',
          open: () => this.show(`recurso:${feature.id}`, true),
        }),
      ),
    ];
    const grid = h('div', { class: 'apps' });
    for (const app of apps) {
      const iconBox = h('span', { class: 'app__icon', html: icon(app.icon, 30) });
      iconBox.style.setProperty('--a', app.colors[0]);
      iconBox.style.setProperty('--b', app.colors[1]);
      if (app.soon) iconBox.appendChild(h('span', { class: 'app__badge', text: 'EM BREVE' }));
      else if (app.badge) iconBox.appendChild(h('span', { class: 'app__badge app__badge--info', text: app.badge.toUpperCase() }));
      const element = h('button', { class: app.soon ? 'app is-soon' : 'app', attrs: { type: 'button', 'aria-label': app.soon ? `${app.label} (em breve)` : app.label } }, iconBox, h('span', { text: app.label }));
      element.addEventListener('click', () => app.open());
      grid.appendChild(element);
    }
    const info = h('div', { class: 'card' }, h('h3', { text: this.host.areaName() }), h('p', { text: `Aurora City · ${this.host.clockLabel()} · ${this.host.weatherLabel()}` }));
    info.style.marginTop = '16px';
    this.content.append(greeting, grid, info);
  }

  /* --------------------------------- Mapa ------------------------------- */

  private buildMap(): void {
    const portals = this.host.portals();
    this.mapMarkers = portals.map((p) => ({ x: p.x, z: p.z, unlocked: p.unlocked }));
    const canvas = h('canvas', { class: 'map-canvas', attrs: { width: 720, height: 720, role: 'img', 'aria-label': 'Mapa de Aurora City com a sua posição e os portais' } });
    this.mapCanvas = canvas;
    this.lastMapDraw = 0;
    drawMap(canvas, this.host.baseMap(), this.host.playerPose(), this.mapMarkers);

    const list = h('ul', { class: 'list', attrs: { 'aria-label': 'Viagem rápida pelos portais' } });
    const unlocked = portals.filter((p) => p.unlocked).length;
    for (const portal of portals) {
      const item = h(
        'button',
        { class: 'list-btn', attrs: { type: 'button', 'aria-label': portal.unlocked ? `Viajar para ${portal.name}` : `${portal.name}: portal ainda não ativado` } },
        h('span', { html: icon('portal', 22) }),
        h('span', {}, portal.name, h('small', { text: portal.unlocked ? 'Viajar agora' : 'Portal ainda não ativado' })),
      );
      item.disabled = !portal.unlocked;
      item.addEventListener('click', () => this.host.travel(portal.id));
      list.appendChild(h('li', {}, item));
    }
    this.content.append(
      this.head('Mapa de Aurora City'),
      canvas,
      h('div', { class: 'card', attrs: { style: 'margin-top:10px' } }, h('h3', { text: `Portais ativados: ${unlocked}/${portals.length}` }), h('p', { text: 'Encontre um portal na cidade e interaja com ele para ativá-lo. Depois, viaje para ele quando quiser.' })),
      list,
    );
  }

  /* -------------------------------- Diário ------------------------------ */

  private buildJournal(): void {
    const entries = this.host.journal();
    const read = entries.filter((e) => e.read);
    this.content.append(this.head('Diário de Aurora'));
    if (read.length === 0) {
      this.content.append(h('div', { class: 'card' }, h('h3', { text: 'Seu diário está em branco' }), h('p', { text: 'Leia as placas holográficas espalhadas por Aurora City para registrar o que descobrir.' })));
    }
    for (const entry of read) {
      const card = h('div', { class: 'card' }, h('h3', { text: entry.title }));
      for (const paragraph of entry.paragraphs) card.appendChild(h('p', { text: paragraph }));
      this.content.appendChild(card);
    }
    const missing = entries.length - read.length;
    if (missing > 0 && read.length > 0) {
      this.content.appendChild(h('p', { class: 'phone__greeting', text: `Ainda há ${missing} ${missing === 1 ? 'registro' : 'registros'} para descobrir.`, attrs: { style: 'font-size:0.95rem;margin-top:12px' } }));
    }
  }

  /* -------------------------------- Jornada ----------------------------- */

  private buildJourney(): void {
    const s = this.host.stats();
    const stat = (value: string, label: string): HTMLDivElement => h('div', { class: 'stat' }, h('b', { text: value }), h('span', { text: label }));
    const meter = h('div', { class: 'meter', attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': s.completion, 'aria-label': 'Exploração de Aurora City' } }, h('i'));
    (meter.firstElementChild as HTMLElement).style.width = `${s.completion}%`;
    const hint = this.host.crystalHint();
    this.content.append(
      this.head('Sua jornada'),
      h('div', { class: 'card' }, h('h3', { text: `Exploração de Aurora City: ${s.completion}%` }), meter),
      h('div', { class: 'card' }, h('h3', { text: 'Próximo Cristal de Luz' }), h('p', { text: hint ?? 'Você encontrou todos os Cristais de Luz. Parabéns!' })),
      h(
        'div',
        { class: 'stats', attrs: { style: 'margin-top:10px' } },
        stat(`${s.crystals[0]}/${s.crystals[1]}`, 'Cristais de Luz'),
        stat(`${s.areas[0]}/${s.areas[1]}`, 'Áreas visitadas'),
        stat(`${s.entries[0]}/${s.entries[1]}`, 'Registros no diário'),
        stat(`${s.portals[0]}/${s.portals[1]}`, 'Portais ativados'),
        stat(s.distance, 'Distância percorrida'),
        stat(s.playTime, 'Tempo de jogo'),
        stat(String(s.wishes), 'Pedidos às fontes'),
        stat(String(s.photos), 'Fotos tiradas'),
      ),
      h('p', { class: 'phone__greeting', text: `Dia ${s.day} em Aurora City.`, attrs: { style: 'font-size:0.95rem;margin-top:12px' } }),
    );
  }

  /* ---------------------------------- Céu ------------------------------- */

  private buildSky(): void {
    const hours: readonly { label: string; hour: number; icon: IconName }[] = [
      { label: 'Amanhecer', hour: 6.2, icon: 'sun' },
      { label: 'Meio-dia', hour: 12, icon: 'sun' },
      { label: 'Pôr do sol', hour: 17.7, icon: 'sun' },
      { label: 'Noite', hour: 22, icon: 'moon' },
    ];
    const list = h('ul', { class: 'list', attrs: { 'aria-label': 'Mudar a hora do dia' } });
    for (const option of hours) {
      const item = h('button', { class: 'list-btn', attrs: { type: 'button' } }, h('span', { html: icon(option.icon, 22) }), h('span', {}, option.label, h('small', { text: 'Avançar o relógio até este momento' })));
      item.addEventListener('click', () => this.host.setHour(option.hour));
      list.appendChild(h('li', {}, item));
    }
    const pace = h(
      'div',
      { class: 'card', attrs: { style: 'margin-top:10px' } },
      h('h3', { text: 'Passagem do tempo' }),
      choiceGroup<TimePaceSetting>(
        'Passagem do tempo',
        [
          { value: 'normal', label: 'Normal' },
          { value: 'rapido', label: 'Rápida' },
          { value: 'parado', label: 'Parada' },
        ],
        this.host.timePace(),
        (value) => this.host.setTimePace(value),
      ),
    );
    const weather = h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Clima' }),
      choiceGroup<WeatherChoice>(
        'Clima',
        [
          { value: 'auto', label: 'Automático' },
          { value: 'limpo', label: 'Céu limpo' },
          { value: 'brisa', label: 'Brisa' },
          { value: 'neblina', label: 'Neblina' },
        ],
        this.host.weather(),
        (value) => this.host.setWeather(value),
      ),
    );
    this.content.append(this.head('Céu de Aurora'), h('div', { class: 'card' }, h('h3', { text: `Agora: ${this.host.clockLabel()}` }), h('p', { text: this.host.weatherLabel() })), list, pace, weather);
  }

  /* -------------------------------- Em breve ---------------------------- */

  private buildEvents(): void {
    this.content.append(this.head('Eventos do Éden'), h('div', { class: 'card' }, h('h3', { text: 'Em breve' }), h('p', { text: 'A programação de eventos chegará em versões futuras do EDENWORLD. Fique de olho no Painel de Eventos da Praça Central e no Palco Aurora.' })));
    for (const event of FUTURE_EVENTS) {
      this.content.appendChild(h('div', { class: 'card' }, h('h3', { text: event.name }), h('p', { text: event.description }), h('p', { class: 'muted', text: 'Em breve' })));
    }
  }

  private buildFeature(id: string): void {
    const feature: FutureFeature | undefined = FUTURE_FEATURES.find((f) => f.id === id);
    if (!feature) {
      this.show('home');
      return;
    }
    const card = h('div', { class: 'card' }, h('h3', { text: feature.status === 'em-breve' ? 'Em breve' : feature.name }), h('p', { text: feature.summary }));
    for (const paragraph of feature.details) card.appendChild(h('p', { text: paragraph }));
    this.content.append(this.head(feature.name), card);
    if (feature.place) this.content.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Onde encontrar' }), h('p', { text: feature.place })));
  }
}
