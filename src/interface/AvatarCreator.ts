import {
  ACCESSORIES,
  ACCESSORY_LABELS,
  type AvatarAppearance,
  CLOTH_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_LABELS,
  HAIR_STYLES,
  OUTFITS,
  OUTFIT_LABELS,
  SKIN_TONES,
  randomAppearance,
  sanitizePlayerName,
} from '../player/AvatarAppearance';
import { createRng } from '../utils/math';
import { button, choiceGroup, clear, h, slider } from './dom';
import { icon } from './icons';
import type { Screen } from './UIManager';

export interface CreatorCallbacks {
  onPreview(appearance: AvatarAppearance): void;
  onConfirm(name: string, appearance: AvatarAppearance): void;
  onCancel(): void;
  /** Gira a vista do avatar (radianos). */
  onRotate(delta: number): void;
}

const COLOR_NAMES: Record<string, string> = {
  '#ffffff': 'branco',
  '#29c8ff': 'azul-água',
  '#1b82ea': 'azul',
  '#24e08a': 'verde-água',
  '#7ddc5a': 'verde',
  '#ffd84a': 'amarelo',
  '#ff9f43': 'laranja',
  '#ff6f91': 'rosa',
  '#c9a2ff': 'lilás',
  '#7a5cc9': 'roxo',
  '#2e3a4f': 'grafite',
  '#f3ead6': 'areia',
};

/** Criador de avatar: painel lateral com pré-visualização 3D ao vivo no próprio mundo. */
export class AvatarCreatorScreen implements Screen {
  readonly id = 'criador';
  readonly element: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLDivElement;
  private readonly footer: HTMLDivElement;
  private nameInput!: HTMLInputElement;
  private appearance!: AvatarAppearance;
  private editing = false;
  private readonly rng = createRng((Date.now() & 0xffff) + 17);

  constructor(private readonly callbacks: CreatorCallbacks) {
    this.title = h('h2', { class: 'panel__title' });
    this.body = h('div', { class: 'panel__body' });
    this.footer = h('div', { class: 'panel__footer' });
    const panel = h('div', { class: 'panel creator' }, h('div', { class: 'panel__header' }, this.title), this.body, this.footer);
    this.element = h('div', { class: 'screen screen--side', attrs: { role: 'dialog', 'aria-label': 'Criador de avatar' } }, panel);
  }

  /** Prepara o painel antes de abri-lo. */
  configure(name: string, appearance: AvatarAppearance, editing: boolean): void {
    this.appearance = { ...appearance };
    this.editing = editing;
    this.title.textContent = editing ? 'Ateliê Aero' : 'Crie seu avatar';
    this.build(name);
  }

  private change(patch: Partial<AvatarAppearance>): void {
    Object.assign(this.appearance, patch);
    this.callbacks.onPreview({ ...this.appearance });
  }

  private swatches(label: string, colors: readonly string[], key: 'skin' | 'hairColor' | 'eyeColor' | 'topColor' | 'bottomColor' | 'shoeColor'): HTMLDivElement {
    const group = h('div', { class: 'swatches', attrs: { role: 'group', 'aria-label': label } });
    const items: HTMLButtonElement[] = [];
    colors.forEach((color, index) => {
      const item = h('button', {
        class: 'swatch',
        attrs: { type: 'button', 'aria-pressed': String(this.appearance[key] === color), 'aria-label': `${label}: ${COLOR_NAMES[color] ?? `opção ${index + 1}`}` },
      });
      item.style.setProperty('--c', color);
      item.addEventListener('click', () => {
        for (const other of items) other.setAttribute('aria-pressed', String(other === item));
        this.change({ [key]: color });
      });
      items.push(item);
      group.appendChild(item);
    });
    return group;
  }

  private group(label: string, ...controls: Node[]): HTMLDivElement {
    return h('div', { class: 'group' }, h('span', { class: 'group__label', text: label }), ...controls);
  }

  private build(name: string): void {
    const a = this.appearance;
    clear(this.body);
    clear(this.footer);

    this.nameInput = h('input', {
      class: 'text-input',
      attrs: { type: 'text', maxlength: 20, autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', placeholder: 'Seu nome no Éden', 'aria-label': 'Nome do personagem', enterkeyhint: 'done' },
    });
    this.nameInput.value = name;
    this.nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.nameInput.blur();
    });

    const rotate = h(
      'div',
      { class: 'row' },
      button({ class: 'btn btn--ghost btn--small', icon: icon('back', 18), label: 'Girar', onClick: () => this.callbacks.onRotate(0.6) }),
      button({ class: 'btn btn--ghost btn--small', icon: icon('dice', 18), label: 'Aleatório', onClick: () => this.randomize() }),
    );

    this.body.append(
      this.group('Nome', this.nameInput),
      this.group('Visualização', rotate),
      this.group('Pele', this.swatches('Tom de pele', SKIN_TONES, 'skin')),
      this.group(
        'Cabelo',
        choiceGroup('Estilo de cabelo', HAIR_STYLES.map((value) => ({ value, label: HAIR_LABELS[value] })), a.hairStyle, (hairStyle) => this.change({ hairStyle }), 'chips', 'chip'),
        h('div', { attrs: { style: 'height:8px' } }),
        this.swatches('Cor do cabelo', HAIR_COLORS, 'hairColor'),
      ),
      this.group('Olhos', this.swatches('Cor dos olhos', EYE_COLORS, 'eyeColor')),
      this.group(
        'Roupa',
        choiceGroup('Roupa', OUTFITS.map((value) => ({ value, label: OUTFIT_LABELS[value] })), a.outfit, (outfit) => this.change({ outfit }), 'chips', 'chip'),
      ),
      this.group('Cor de cima', this.swatches('Cor da parte de cima', CLOTH_COLORS, 'topColor')),
      this.group('Cor de baixo', this.swatches('Cor da parte de baixo', CLOTH_COLORS, 'bottomColor')),
      this.group('Calçado', this.swatches('Cor do calçado', CLOTH_COLORS, 'shoeColor')),
      this.group(
        'Acessório',
        choiceGroup('Acessório', ACCESSORIES.map((value) => ({ value, label: ACCESSORY_LABELS[value] })), a.accessory, (accessory) => this.change({ accessory }), 'chips', 'chip'),
      ),
      this.group(
        'Altura',
        slider({ label: 'Altura', min: 0.9, max: 1.1, step: 0.01, value: a.height, format: (v) => `${Math.round(v * 172)} cm`, onInput: (height) => this.change({ height }) }),
      ),
    );

    // Atalhos exibidos apenas quando o jogador usa um controle (ver `[data-device]` no CSS).
    this.footer.appendChild(h('p', { class: 'pad-hint', text: this.editing ? 'LB / RB: seção · Start: salvar · B: cancelar' : 'LB / RB: seção · Start: entrar' }));
    if (this.editing) {
      this.footer.appendChild(button({ class: 'btn btn--ghost', label: 'Cancelar', onClick: () => this.callbacks.onCancel() }));
    }
    this.footer.appendChild(
      button({
        class: 'btn btn--green',
        icon: icon('check', 20),
        label: this.editing ? 'Salvar visual' : 'Entrar em Aurora City',
        onClick: () => this.confirm(),
      }),
    );
  }

  private confirm(): void {
    this.callbacks.onConfirm(sanitizePlayerName(this.nameInput.value), { ...this.appearance });
  }

  /** LB/RB: pula para a seção anterior/seguinte (Pele, Cabelo, Roupa...). */
  onTab(direction: 1 | -1): void {
    const groups = Array.from(this.body.querySelectorAll<HTMLElement>('.group'));
    if (groups.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const current = active ? groups.findIndex((group) => group.contains(active)) : -1;
    const start = current < 0 ? (direction > 0 ? -1 : groups.length) : current;
    for (let step = 1; step <= groups.length; step++) {
      const group = groups[(start + direction * step + groups.length * 2) % groups.length];
      // Na seção, começa pela opção já escolhida (ou pelo primeiro controle).
      const target = group.querySelector<HTMLElement>('[aria-pressed="true"]') ?? group.querySelector<HTMLElement>('button, input');
      if (!target) continue;
      target.focus({ preventScroll: true });
      group.scrollIntoView({ block: 'nearest' });
      return;
    }
  }

  /** Start: conclui a criação (ou salva o visual). */
  onMenu(): void {
    this.confirm();
  }

  private randomize(): void {
    this.appearance = randomAppearance(this.rng);
    this.callbacks.onPreview({ ...this.appearance });
    this.build(this.nameInput.value);
  }

  onBack(): void {
    if (this.editing) this.callbacks.onCancel();
  }

  initialFocus(): HTMLElement | null {
    // Evita abrir o teclado virtual automaticamente em celulares.
    return this.footer.querySelector<HTMLElement>('.btn--green');
  }
}
