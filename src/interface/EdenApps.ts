import type { AftersConfig } from '../afters/AftersCatalog';
import { AFTERS_PRODUCTS } from '../afters/AftersCatalog';
import { PANTHEON } from '../characters/Pantheon';
import type { EdenPhoto, FeedPost, TalkThread } from '../edenos/EdenSocial';
import type { LibraryDocument } from '../edenos/Library';
import { button, h, slider, toggle } from './dom';
import { icon } from './icons';

/**
 * Aplicativos do EdenOS desenhados dentro do EdenPhone.
 *
 * Cada função preenche a área de conteúdo do celular com um aplicativo.
 * Tudo funciona localmente, no próprio aparelho: as telas dizem isso de
 * forma explícita em vez de simular serviços on-line que ainda não existem.
 */

export interface EdenAppsHost {
  playerName(): string;
  clockLabel(): string;
  areaName(): string;
  /** Personagens do panteão já conhecidos. */
  metCharacters(): readonly string[];
  citizensMet(): number;
  threads(): readonly TalkThread[];
  markThreadRead(characterId: string): void;
  photos(): readonly EdenPhoto[];
  deletePhoto(id: string): void;
  /** Abre a câmera no modo EdenGram: a foto vai para o álbum do aparelho. */
  openGramCamera(): void;
  feed(): readonly FeedPost[];
  library(): readonly LibraryDocument[];
  afters(): AftersConfig;
  setAfters(patch: Partial<AftersConfig>): void;
  musicEnabled(): boolean;
  musicVolume(): number;
  setMusic(patch: { enabled?: boolean; volume?: number }): void;
}

const LOCAL_NOTE = 'Tudo neste aplicativo fica só neste aparelho: não há conta, servidor nem envio de dados.';

function head(title: string, subtitle?: string): HTMLDivElement {
  const element = h('div', { class: 'phone__app-head' }, h('h2', { text: title }));
  if (subtitle) element.appendChild(h('span', { class: 'muted', text: subtitle }));
  return element;
}

function note(text: string): HTMLParagraphElement {
  return h('p', { class: 'eden-note', text });
}

/* ------------------------------- EdenFeed ------------------------------ */

const TAG_LABEL: Record<FeedPost['tag'], string> = {
  sistema: 'EdenOS',
  cidade: 'Cidade',
  panteao: 'Panteão',
  voce: 'Você',
  agenda: 'Agenda',
};

export function buildFeed(host: EdenAppsHost, content: HTMLElement): void {
  content.append(head('EdenFeed', 'O que está acontecendo em Aurora City'), note(LOCAL_NOTE));
  for (const post of host.feed()) {
    const avatar = h('span', { class: 'post__avatar', text: post.author.slice(0, 1).toUpperCase() });
    avatar.style.background = `linear-gradient(140deg, ${post.color}, rgba(255,255,255,0.3))`;
    const card = h(
      'article',
      { class: 'card post' },
      h(
        'header',
        { class: 'post__head' },
        avatar,
        h('div', {}, h('b', { text: post.author }), h('small', { text: `${post.handle} · ${TAG_LABEL[post.tag]}` })),
      ),
      h('p', { text: post.text }),
    );
    content.appendChild(card);
  }
}

/* ------------------------------- EdenGram ------------------------------ */

export function buildGram(host: EdenAppsHost, content: HTMLElement, refresh: () => void): void {
  const photos = host.photos();
  content.append(head('EdenGram', `${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'} no seu aparelho`), note(LOCAL_NOTE));
  content.appendChild(
    h(
      'div',
      { class: 'row', attrs: { style: 'margin-bottom:10px' } },
      button({ class: 'btn btn--small', icon: icon('camera', 18), label: 'Tirar foto', onClick: () => host.openGramCamera() }),
    ),
  );
  if (photos.length === 0) {
    content.appendChild(
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'Álbum vazio' }),
        h('p', { text: 'Abra a câmera, enquadre Aurora City e registre o que quiser. As fotos ficam guardadas aqui, no seu EdenPhone.' }),
      ),
    );
    return;
  }
  const grid = h('div', { class: 'gram' });
  for (const photo of photos) {
    const image = h('img', { class: 'gram__img', attrs: { src: photo.data, alt: `Foto em ${photo.place}`, loading: 'lazy' } });
    const remove = button({
      class: 'btn btn--small btn--danger gram__del',
      icon: icon('close', 16),
      ariaLabel: `Apagar foto de ${photo.place}`,
      onClick: () => {
        host.deletePhoto(photo.id);
        refresh();
      },
    });
    grid.appendChild(h('figure', { class: 'gram__item' }, image, h('figcaption', { text: `${photo.place} · ${photo.clock}` }), remove));
  }
  content.appendChild(grid);
}

/* ------------------------------- EdenTalk ------------------------------ */

export function buildTalk(host: EdenAppsHost, content: HTMLElement, selected: string | null, onSelect: (id: string | null) => void): void {
  const threads = host.threads();
  if (selected) {
    const thread = threads.find((candidate) => candidate.character.id === selected);
    if (thread) {
      host.markThreadRead(thread.character.id);
      content.append(head(thread.character.name, thread.character.contact.handle));
      content.appendChild(
        h('div', { class: 'row', attrs: { style: 'margin-bottom:10px' } }, button({ class: 'btn btn--ghost btn--small', icon: icon('back', 18), label: 'Conversas', onClick: () => onSelect(null) })),
      );
      for (const message of thread.character.contact.messages) {
        content.appendChild(h('div', { class: 'bubble bubble--them' }, h('p', { text: message })));
      }
      content.appendChild(
        h(
          'div',
          { class: 'card' },
          h('h3', { text: 'Responder' }),
          h('p', { text: 'A resposta por mensagem chega quando o Éden Connect existir. Por enquanto, fale com ela pessoalmente em Aurora City.' }),
          h('p', { class: 'muted', text: thread.character.place.label }),
        ),
      );
      return;
    }
  }

  content.append(head('EdenTalk', 'Conversas com quem você conheceu'), note(LOCAL_NOTE));
  if (threads.length === 0) {
    content.appendChild(
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'Nenhuma conversa ainda' }),
        h('p', { text: 'Converse com alguém do panteão em Aurora City para trocar contato. Procure as auras coloridas pela cidade.' }),
      ),
    );
    return;
  }
  const list = h('ul', { class: 'list', attrs: { 'aria-label': 'Conversas' } });
  for (const thread of threads) {
    const item = h(
      'button',
      { class: 'list-btn', attrs: { type: 'button' } },
      h('span', { html: icon('chat', 22) }),
      h('span', {}, thread.character.name, h('small', { text: thread.character.contact.messages[0] ?? thread.character.contact.status })),
    );
    if (thread.unread) item.appendChild(h('span', { class: 'tagdot', text: 'novo' }));
    item.addEventListener('click', () => onSelect(thread.character.id));
    list.appendChild(h('li', {}, item));
  }
  content.appendChild(list);
}

/* -------------------------------- Pessoas ------------------------------ */

export function buildPeople(host: EdenAppsHost, content: HTMLElement, onTalk: (id: string) => void): void {
  const met = new Set(host.metCharacters());
  content.append(head('Pessoas', `${met.size} de ${PANTHEON.length} do panteão · ${host.citizensMet()} habitantes`));
  for (const character of PANTHEON) {
    const known = met.has(character.id);
    const badge = h('span', { class: 'post__avatar' });
    badge.style.background = known ? `linear-gradient(140deg, ${character.colors[0]}, ${character.colors[1]})` : 'rgba(255,255,255,0.14)';
    badge.textContent = known ? character.name.slice(0, 1).toUpperCase() : '?';
    const card = h(
      'article',
      { class: known ? 'card person' : 'card person is-unknown' },
      h(
        'header',
        { class: 'post__head' },
        badge,
        h('div', {}, h('b', { text: known ? character.name : '???' }), h('small', { text: known ? character.title : 'Ainda não encontrado(a)' })),
      ),
    );
    if (known) {
      card.appendChild(h('p', { text: character.tagline }));
      card.appendChild(h('p', { class: 'muted', text: `Domínio: ${character.domain.length > 0 ? character.domain.join(' · ') : 'ainda não declarado pelo cânone do Éden'}` }));
      card.appendChild(h('p', { class: 'muted', text: `Onde encontrar: ${character.place.label}` }));
      card.appendChild(
        h('div', { class: 'row' }, button({ class: 'btn btn--ghost btn--small', icon: icon('chat', 18), label: 'Abrir conversa', onClick: () => onTalk(character.id) })),
      );
    } else {
      card.appendChild(h('p', { class: 'muted', text: 'Explore Aurora City para encontrar esta pessoa.' }));
    }
    content.appendChild(card);
  }
}

/* ------------------------------- EdenReads ----------------------------- */

const SHELF_LABEL: Record<LibraryDocument['shelf'], string> = {
  universo: 'Universo',
  cidades: 'Cidades',
  tecnologia: 'Tecnologia',
  historia: 'História',
};

export function buildReads(host: EdenAppsHost, content: HTMLElement, selected: string | null, onSelect: (id: string | null) => void): void {
  const documents = host.library();
  const open = selected ? documents.find((document) => document.id === selected) : undefined;
  if (open) {
    content.append(head(open.title, open.subtitle));
    content.appendChild(
      h('div', { class: 'row', attrs: { style: 'margin-bottom:10px' } }, button({ class: 'btn btn--ghost btn--small', icon: icon('back', 18), label: 'Acervo', onClick: () => onSelect(null) })),
    );
    const card = h('div', { class: 'card' });
    for (const paragraph of open.paragraphs) card.appendChild(h('p', { text: paragraph }));
    content.appendChild(card);
    return;
  }

  content.append(head('EdenReads', 'Acervo do universo Éden Aero'));
  const shelves: LibraryDocument['shelf'][] = ['universo', 'cidades', 'tecnologia', 'historia'];
  for (const shelf of shelves) {
    const items = documents.filter((document) => document.shelf === shelf);
    if (items.length === 0) continue;
    content.appendChild(h('p', { class: 'phone__greeting', text: SHELF_LABEL[shelf], attrs: { style: 'font-size:0.95rem;margin:14px 0 6px' } }));
    const list = h('ul', { class: 'list', attrs: { 'aria-label': SHELF_LABEL[shelf] } });
    for (const document of items) {
      const item = h(
        'button',
        { class: 'list-btn', attrs: { type: 'button' } },
        h('span', { html: icon('book', 22) }),
        h('span', {}, document.title, h('small', { text: document.subtitle })),
      );
      item.addEventListener('click', () => onSelect(document.id));
      list.appendChild(h('li', {}, item));
    }
    content.appendChild(list);
  }
}

/* --------------------------------- Afters ------------------------------ */

export function buildAfters(host: EdenAppsHost, content: HTMLElement, refresh: () => void): void {
  const config = host.afters();
  content.append(head('Afters', 'Body Expansion Tech · assinatura Luma'));
  if (!config.unlocked) {
    content.appendChild(
      h(
        'div',
        { class: 'card' },
        h('h3', { text: 'Painel bloqueado' }),
        h('p', { text: 'A tecnologia Afters é liberada por Luma, no Ateliê Aero, a sudoeste da Praça Central.' }),
        h('p', { class: 'muted', text: 'Converse com ela para ativar o painel no seu EdenPhone.' }),
      ),
    );
    return;
  }

  const active = config.productId;
  content.appendChild(
    h(
      'div',
      { class: 'card' },
      h('h3', { text: active ? (AFTERS_PRODUCTS.find((product) => product.id === active)?.name ?? 'Afters') : 'Tudo desligado' }),
      h('p', { text: active ? (AFTERS_PRODUCTS.find((product) => product.id === active)?.description ?? '') : 'Escolha um produto abaixo para ativar a sua assinatura visual.' }),
      h('p', { class: 'muted', text: 'Efeito estético: aura, brilho e partículas em volta do avatar. Desligamento manual a qualquer momento.' }),
    ),
  );

  const list = h('ul', { class: 'list', attrs: { 'aria-label': 'Produtos Afters' } });
  for (const product of AFTERS_PRODUCTS) {
    const selected = product.id === active;
    const swatch = h('span', { class: 'swatch' });
    swatch.style.background = product.color;
    const item = h(
      'button',
      { class: selected ? 'list-btn is-on' : 'list-btn', attrs: { type: 'button', 'aria-pressed': String(selected) } },
      swatch,
      h('span', {}, product.name, h('small', { text: product.tagline })),
    );
    item.addEventListener('click', () => {
      host.setAfters({ productId: selected ? null : product.id, color: selected ? config.color : product.color });
      refresh();
    });
    list.appendChild(h('li', {}, item));
  }
  content.appendChild(list);

  if (active) {
    content.appendChild(
      h('div', { class: 'row', attrs: { style: 'margin-top:10px' } }, button({ class: 'btn btn--ghost btn--small', icon: icon('close', 18), label: 'Desligar tudo', onClick: () => {
        host.setAfters({ productId: null });
        refresh();
      } })),
    );
  }

  const colors = ['#ff8fc0', '#c9a2ff', '#7fd6ff', '#ffd84a', '#ff6f91', '#9a7bff', '#24e08a', '#ffffff'];
  const palette = h('div', { class: 'palette', attrs: { role: 'group', 'aria-label': 'Cor do efeito' } });
  for (const color of colors) {
    const swatch = h('button', { class: config.color === color ? 'swatch swatch--pick is-on' : 'swatch swatch--pick', attrs: { type: 'button', 'aria-label': `Cor ${color}`, 'aria-pressed': String(config.color === color) } });
    swatch.style.background = color;
    swatch.addEventListener('click', () => {
      host.setAfters({ color });
      refresh();
    });
    palette.appendChild(swatch);
  }

  content.appendChild(
    h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Ajustes' }),
      palette,
      slider({
        label: 'Intensidade',
        min: 0,
        max: 1,
        step: 0.05,
        value: config.intensity,
        format: (value) => `${Math.round(value * 100)}%`,
        onInput: (value) => host.setAfters({ intensity: value }),
      }),
      h('div', { class: 'row' }, h('span', { text: 'Partículas' }), toggle('Partículas', config.particles, (value) => host.setAfters({ particles: value }))),
      h('div', { class: 'row' }, h('span', { text: 'Som de confirmação' }), toggle('Som de confirmação', config.sound, (value) => host.setAfters({ sound: value }))),
    ),
  );
}

/* ------------------------------- EdenMusic ----------------------------- */

export function buildMusic(host: EdenAppsHost, content: HTMLElement, refresh: () => void): void {
  content.append(head('EdenMusic', 'Trilha de Aurora City'));
  content.appendChild(
    h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Trilha viva' }),
      h('p', { text: 'A trilha de Aurora City é procedural: o próprio jogo sintetiza a música em tempo real, acompanhando a hora do dia e o clima. Não há faixas gravadas.' }),
      h('p', { class: 'muted', text: 'Catálogo de artistas de Bitnara e SkyStones ainda não existe: ele depende de faixas originais ou licenciadas.' }),
    ),
  );
  content.appendChild(
    h(
      'div',
      { class: 'card' },
      h('h3', { text: 'Controles' }),
      h('div', { class: 'row' }, h('span', { text: 'Música' }), toggle('Música', host.musicEnabled(), (value) => {
        host.setMusic({ enabled: value });
        refresh();
      })),
      slider({
        label: 'Volume da música',
        min: 0,
        max: 1,
        step: 0.05,
        value: host.musicVolume(),
        format: (value) => `${Math.round(value * 100)}%`,
        onInput: (value) => host.setMusic({ volume: value }),
      }),
    ),
  );
}
