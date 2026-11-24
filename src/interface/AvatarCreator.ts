import {
  ACCESSORY_LABELS,
  type AvatarAppearance,
  CLOTH_COLORS,
  CREATOR_ACCESSORIES,
  CREATOR_HAIR_BY_SEX,
  CREATOR_OUTFITS_BY_SEX,
  EYE_COLORS,
  FACE_AXES,
  FACE_AXIS_LABELS,
  FACE_RANGE,
  type FaceAxis,
  HAIR_COLORS,
  HAIR_LABELS,
  OUTFIT_LABELS,
  SKIN_TONES,
  type Sex,
  catalogWithLegacy,
  coerceAppearanceToSex,
  isLegacyPiece,
  randomAppearance,
  sanitizePlayerName,
} from '../player/AvatarAppearance';
import { createRng } from '../utils/math';
import { button, choiceGroup, clear, h, slider } from './dom';
import { icon } from './icons';
import type { Screen } from './UIManager';

/**
 * Onde a trilha de etapas tem de parar para a aba ativa aparecer.
 *
 * Fica separada do DOM porque é a parte que vale a pena testar: a
 * aba é centralizada quando dá, e o resultado é preso entre zero e o
 * fim do conteúdo, para a faixa nunca parar além da última aba nem
 * antes da primeira.
 *
 * @param caixa largura visível da faixa
 * @param conteudo largura total das abas enfileiradas
 * @param inicio distância da aba ativa até o começo do conteúdo
 * @param largura largura da aba ativa
 */
export function alvoDaTrilha(caixa: number, conteudo: number, inicio: number, largura: number): number {
  const sobra = conteudo - caixa;
  // Cabe tudo: não há para onde rolar, e rolar seria piorar.
  if (sobra <= 0) return 0;
  return Math.max(0, Math.min(sobra, inicio - (caixa - largura) / 2));
}

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

/**
 * As etapas do criador, na ordem em que a pessoa as atravessa.
 *
 * A primeira é a escolha de quem se está criando, e ela é diferente
 * das outras: ocupa a tela inteira e não tem volta para trás, porque
 * não há nada antes dela. As cinco seguintes são o acabamento, e a
 * última é a confirmação.
 *
 * Não há etapa que o Éden não saiba desenhar. "Rosto" é tom de pele,
 * cor dos olhos e os quatro eixos que a Fase 1.1 acrescentou — não é
 * um editor de crânio, e não finge ser.
 */
const STEPS = ['rosto', 'cabelo', 'roupa', 'acessorios', 'ajustes', 'confirmar'] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  rosto: 'Rosto',
  cabelo: 'Cabelo',
  roupa: 'Roupa',
  acessorios: 'Acessórios',
  ajustes: 'Ajustes',
  confirmar: 'Pronto',
};

const SEX_CARDS: readonly { sex: Sex; title: string; hint: string }[] = [
  { sex: 'masc', title: 'Ele', hint: 'Silhueta masculina' },
  { sex: 'fem', title: 'Ela', hint: 'Silhueta feminina' },
];

/** Criador de avatar: escolha de Ele/Ela e depois o acabamento em etapas. */
export class AvatarCreatorScreen implements Screen {
  readonly id = 'criador';
  readonly element: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLDivElement;
  private readonly footer: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private nameInput!: HTMLInputElement;
  private appearance!: AvatarAppearance;
  private editing = false;
  /** `null` enquanto a pessoa não escolheu Ele ou Ela. */
  private step: Step | null = null;
  private pendingName = '';
  private readonly rng = createRng((Date.now() & 0xffff) + 17);

  constructor(private readonly callbacks: CreatorCallbacks) {
    this.title = h('h2', { class: 'panel__title' });
    this.body = h('div', { class: 'panel__body' });
    this.footer = h('div', { class: 'panel__footer' });
    this.panel = h('div', { class: 'panel creator' }, h('div', { class: 'panel__header' }, this.title), this.body, this.footer);
    this.element = h('div', { class: 'screen screen--side', attrs: { role: 'dialog', 'aria-label': 'Criador de avatar' } }, this.panel);
  }

  /** Prepara o painel antes de abri-lo. */
  configure(name: string, appearance: AvatarAppearance, editing: boolean): void {
    this.appearance = { ...appearance };
    this.editing = editing;
    this.pendingName = name;
    // Quem edita já é alguém: o gênero que a ficha declara é mantido e
    // a pessoa cai direto no acabamento. Quem está nascendo escolhe
    // primeiro de quem se trata, que é o que esta fase acrescenta.
    this.step = editing ? 'rosto' : null;
    this.render();
  }

  private change(patch: Partial<AvatarAppearance>): void {
    Object.assign(this.appearance, patch);
    this.callbacks.onPreview({ ...this.appearance });
  }

  /** Troca de Ele para Ela (ou o contrário), consertando peça incompatível. */
  private setSex(sex: Sex): void {
    if (this.appearance.sex === sex) return;
    this.appearance = coerceAppearanceToSex(this.appearance, sex);
    this.callbacks.onPreview({ ...this.appearance });
  }

  /* ----------------------------- peças ----------------------------- */

  private swatches(
    label: string,
    colors: readonly string[],
    key: 'skin' | 'hairColor' | 'eyeColor' | 'topColor' | 'bottomColor' | 'shoeColor',
  ): HTMLDivElement {
    const group = h('div', { class: 'swatches', attrs: { role: 'group', 'aria-label': label } });
    const items: HTMLButtonElement[] = [];
    colors.forEach((color, index) => {
      const item = h('button', {
        class: 'swatch',
        attrs: {
          type: 'button',
          'aria-pressed': String(this.appearance[key] === color),
          'aria-label': `${label}: ${COLOR_NAMES[color] ?? `opção ${index + 1}`}`,
        },
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

  /** Um eixo de rosto, com o neutro marcado no meio da régua. */
  private faceSlider(axis: FaceAxis): HTMLDivElement {
    const { min, max } = FACE_RANGE[axis];
    return slider({
      label: FACE_AXIS_LABELS[axis],
      min,
      max,
      step: 0.01,
      value: this.appearance[axis],
      // A pessoa não quer saber que isto é um multiplicador. Mostra-se
      // a distância do neutro, que é o que ela está de fato mexendo.
      format: (v) => (Math.abs(v - 1) < 0.005 ? 'padrão' : `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`),
      onInput: (value) => this.change({ [axis]: value }),
    });
  }

  /* ----------------------------- telas ----------------------------- */

  private render(): void {
    clear(this.body);
    clear(this.footer);
    this.panel.classList.toggle('creator--choice', this.step === null);
    if (this.step === null) this.renderSexChoice();
    else this.renderStep(this.step);
  }

  /** Primeira tela: Ele ou Ela, em dois cartões grandes. */
  private renderSexChoice(): void {
    this.title.textContent = 'Quem é você no Éden?';
    const cards = h('div', { class: 'sex-choice' });
    for (const { sex, title, hint } of SEX_CARDS) {
      const card = h(
        'button',
        {
          class: 'sex-card',
          attrs: { type: 'button', 'data-sex': sex, 'aria-label': `${title} — ${hint}` },
        },
        h('span', { class: 'sex-card__figure', attrs: { 'aria-hidden': 'true' } }, this.figure(sex)),
        h('span', { class: 'sex-card__title', text: title }),
        h('span', { class: 'sex-card__hint', text: hint }),
      );
      card.addEventListener('click', () => {
        this.setSex(sex);
        this.step = 'rosto';
        this.render();
      });
      // Mostra o corpo ao vivo já no passar do dedo: a escolha é de
      // silhueta, e silhueta se julga olhando.
      card.addEventListener('pointerenter', () => this.previewSex(sex));
      card.addEventListener('focus', () => this.previewSex(sex));
      cards.appendChild(card);
    }
    this.body.appendChild(
      h('p', { class: 'creator__lead', text: 'A escolha define a silhueta do corpo e o catálogo de peças. Dá para mudar depois, nos ajustes.' }),
    );
    this.body.appendChild(cards);
  }

  /**
   * Silhueta desenhada, só para o cartão.
   *
   * É um desenho de interface, não o avatar: o avatar de verdade está
   * atrás do painel, em três dimensões, e muda ao passar o dedo aqui.
   */
  private figure(sex: Sex): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 48 96');
    svg.setAttribute('class', 'sex-figure');
    const corpo = document.createElementNS(ns, 'path');
    corpo.setAttribute(
      'd',
      sex === 'masc'
        ? 'M24 8a8 8 0 1 1 0 16a8 8 0 0 1 0-16M12 30h24l4 22-6 2-2-10v44h-8V62h-4v26h-8V44l-2 10-6-2z'
        : 'M24 8a8 8 0 1 1 0 16a8 8 0 0 1 0-16M14 30h20l5 20-5 3-2-7 4 18H12l4-18-2 7-5-3z M14 64h20l-3 24h-6l-1-16-1 16h-6z',
    );
    svg.appendChild(corpo);
    return svg;
  }

  /** Vira o avatar de verdade para a silhueta espiada no cartão. */
  private previewSex(sex: Sex): void {
    if (this.appearance.sex === sex) return;
    this.callbacks.onPreview(coerceAppearanceToSex({ ...this.appearance }, sex));
  }

  /** Trilha de etapas, clicável, com a atual marcada. */
  private stepper(current: Step): HTMLDivElement {
    const trilha = h('div', { class: 'stepper', attrs: { role: 'tablist', 'aria-label': 'Etapas da criação' } });
    STEPS.forEach((step, index) => {
      const atual = step === current;
      const item = h('button', {
        class: 'stepper__item',
        text: `${index + 1}. ${STEP_LABELS[step]}`,
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(atual), 'aria-controls': 'creator-step' },
      });
      item.addEventListener('click', () => {
        this.step = step;
        this.render();
      });
      trilha.appendChild(item);
    });
    return trilha;
  }

  /**
   * Rola a trilha até a etapa ativa aparecer.
   *
   * A trilha é uma faixa que rola na horizontal e cuja barra de
   * rolagem é escondida de propósito (ver `.stepper` no CSS). Como
   * `render()` reconstrói a faixa a cada etapa, o `scrollLeft` nascia
   * sempre em zero: da quarta etapa em diante a aba acesa ficava fora
   * da área visível e o painel mostrava a trilha **sem nenhuma aba
   * marcada**. Medido no Chromium: em 1280×900 a caixa vai de 859 a
   * 1243 px e a aba "6. Pronto" caía em 1354..1443.
   *
   * Em vez de `scrollIntoView`, que também rola os ancestrais e pode
   * arrastar a página inteira, a conta é feita na mão e aplicada só a
   * esta faixa — a página nunca ganha rolagem horizontal por causa
   * disto.
   *
   * Chamada **depois** de a faixa entrar no documento, e não dentro de
   * `stepper()`: elemento solto não tem layout, os retângulos saem
   * zerados e a conta não teria o que medir. A primeira versão desta
   * correção dependia do quadro seguinte para consertar isso, e na
   * conferência o acerto chegava até 600 ms atrasado — tempo de um
   * quadro quando a cena 3D está pesada. Medindo já posicionado, o
   * ajuste sai junto com a etapa.
   */
  private mostrarEtapaAtiva(trilha: HTMLDivElement): void {
    const ajustar = (): void => {
      const ativa = trilha.querySelector<HTMLElement>('.stepper__item[aria-selected="true"]');
      if (!ativa) return;
      const caixa = trilha.getBoundingClientRect();
      const aba = ativa.getBoundingClientRect();
      // Painel ainda fechado: sem medida, não há o que rolar.
      if (caixa.width === 0 || aba.width === 0) return;
      const inicio = aba.left - caixa.left + trilha.scrollLeft;
      trilha.scrollLeft = alvoDaTrilha(trilha.clientWidth, trilha.scrollWidth, inicio, aba.width);
    };
    ajustar();
    // Rede de segurança para quando o painel abre junto com a etapa e
    // o layout ainda não valia no instante de cima.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(ajustar);
  }

  private renderStep(step: Step): void {
    const a = this.appearance;
    this.title.textContent = this.editing ? 'Ateliê Aero' : 'Crie seu avatar';
    const trilha = this.stepper(step);
    this.body.appendChild(trilha);
    this.mostrarEtapaAtiva(trilha);
    const painel = h('div', { class: 'step', attrs: { id: 'creator-step', role: 'tabpanel' } });
    this.body.appendChild(painel);

    if (step === 'rosto') {
      painel.append(
        this.group('Pele', this.swatches('Tom de pele', SKIN_TONES, 'skin')),
        this.group('Olhos', this.swatches('Cor dos olhos', EYE_COLORS, 'eyeColor')),
        ...FACE_AXES.map((axis) => this.group(FACE_AXIS_LABELS[axis], this.faceSlider(axis))),
      );
    } else if (step === 'cabelo') {
      painel.append(
        this.group('Estilo', this.pieceChoice('hairStyle', CREATOR_HAIR_BY_SEX[a.sex], HAIR_LABELS)),
        this.group('Cor do cabelo', this.swatches('Cor do cabelo', HAIR_COLORS, 'hairColor')),
      );
    } else if (step === 'roupa') {
      painel.append(
        this.group('Traje', this.pieceChoice('outfit', CREATOR_OUTFITS_BY_SEX[a.sex], OUTFIT_LABELS)),
        this.group('Cor de cima', this.swatches('Cor da parte de cima', CLOTH_COLORS, 'topColor')),
        this.group('Cor de baixo', this.swatches('Cor da parte de baixo', CLOTH_COLORS, 'bottomColor')),
        this.group('Calçado', this.swatches('Cor do calçado', CLOTH_COLORS, 'shoeColor')),
      );
    } else if (step === 'acessorios') {
      painel.append(this.group('Acessório', this.pieceChoice('accessory', CREATOR_ACCESSORIES, ACCESSORY_LABELS)));
    } else if (step === 'ajustes') {
      const troca = h('div', { class: 'row' });
      for (const { sex, title } of SEX_CARDS) {
        const b = button({
          // Marcado por `aria-pressed`, como as fichas de peça: o CSS
          // do Éden pinta o estado ligado por atributo, não por classe.
          class: 'btn btn--ghost btn--small chip',
          label: title,
          onClick: () => {
            this.setSex(sex);
            this.render();
          },
        });
        b.setAttribute('aria-pressed', String(a.sex === sex));
        troca.appendChild(b);
      }
      painel.append(
        this.group('Silhueta', troca),
        this.group(
          'Altura',
          slider({
            label: 'Altura',
            min: 0.9,
            max: 1.1,
            step: 0.01,
            value: a.height,
            format: (v) => `${Math.round(v * 172)} cm`,
            onInput: (height) => this.change({ height }),
          }),
        ),
        this.group(
          'Visualização',
          h(
            'div',
            { class: 'row' },
            button({ class: 'btn btn--ghost btn--small', icon: icon('back', 18), label: 'Girar', onClick: () => this.callbacks.onRotate(0.6) }),
            button({ class: 'btn btn--ghost btn--small', icon: icon('dice', 18), label: 'Aleatório', onClick: () => this.randomize() }),
          ),
        ),
      );
    } else {
      this.nameInput = h('input', {
        class: 'text-input',
        attrs: {
          type: 'text',
          maxlength: 20,
          autocomplete: 'off',
          autocapitalize: 'words',
          spellcheck: 'false',
          placeholder: 'Seu nome no Éden',
          'aria-label': 'Nome do personagem',
          enterkeyhint: 'done',
        },
      });
      this.nameInput.value = this.pendingName;
      this.nameInput.addEventListener('input', () => {
        this.pendingName = this.nameInput.value;
      });
      this.nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') this.nameInput.blur();
      });
      painel.append(this.group('Nome', this.nameInput), this.group('Resumo', this.summary()));
    }

    this.renderFooter(step);
  }

  /**
   * Lista de peças de uma categoria, já filtrada pelo catálogo do sexo.
   *
   * A peça herdada de um visual anterior a esta fase — o Manto Aurora
   * de quem o vestiu quando ainda era possível — entra no fim, marcada.
   * Ela não volta ao catálogo: é a roupa do corpo que está ali, e
   * sumir com ela sem avisar seria trocar a aparência de alguém sem
   * que ninguém tivesse pedido.
   */
  private pieceChoice<K extends 'hairStyle' | 'outfit' | 'accessory'>(
    key: K,
    catalog: readonly AvatarAppearance[K][],
    labels: Record<string, string>,
  ): HTMLDivElement {
    const atual = this.appearance[key];
    const lista = catalogWithLegacy(catalog, atual);
    const herdada = isLegacyPiece(catalog, atual);
    const grupo = choiceGroup(
      labels[atual] ?? 'Peça',
      lista.map((value) => ({
        value,
        label: herdada && value === atual ? `${labels[value]} (seu visual atual)` : labels[value],
      })),
      atual,
      (value) => this.change({ [key]: value } as Partial<AvatarAppearance>),
      'chips',
      'chip',
    );
    if (herdada) {
      grupo.appendChild(
        h('p', {
          class: 'group__note',
          text: 'Esta peça é do Panteão e saiu do catálogo comum. Ela continua sua, mas se você trocar não volta.',
        }),
      );
    }
    return grupo;
  }

  private summary(): HTMLDivElement {
    const a = this.appearance;
    const linha = (rotulo: string, valor: string) =>
      h('div', { class: 'summary__row' }, h('span', { text: rotulo }), h('strong', { text: valor }));
    return h(
      'div',
      { class: 'summary' },
      linha('Silhueta', a.sex === 'masc' ? 'Ele' : 'Ela'),
      linha('Cabelo', HAIR_LABELS[a.hairStyle]),
      linha('Traje', OUTFIT_LABELS[a.outfit]),
      linha('Acessório', ACCESSORY_LABELS[a.accessory]),
      linha('Altura', `${Math.round(a.height * 172)} cm`),
    );
  }

  private renderFooter(step: Step): void {
    const index = STEPS.indexOf(step);
    this.footer.appendChild(
      h('p', { class: 'pad-hint', text: this.editing ? 'LB / RB: etapa · Start: salvar · B: cancelar' : 'LB / RB: etapa · Start: entrar' }),
    );
    if (index > 0) {
      this.footer.appendChild(
        button({
          class: 'btn btn--ghost',
          label: 'Voltar',
          onClick: () => {
            this.step = STEPS[index - 1];
            this.render();
          },
        }),
      );
    } else if (this.editing) {
      this.footer.appendChild(button({ class: 'btn btn--ghost', label: 'Cancelar', onClick: () => this.callbacks.onCancel() }));
    }
    if (step === 'confirmar') {
      this.footer.appendChild(
        button({
          class: 'btn btn--green',
          icon: icon('check', 20),
          label: this.editing ? 'Salvar visual' : 'Entrar em Aurora City',
          onClick: () => this.confirm(),
        }),
      );
    } else {
      this.footer.appendChild(
        button({
          class: 'btn btn--green',
          label: 'Avançar',
          onClick: () => {
            this.step = STEPS[index + 1];
            this.render();
          },
        }),
      );
    }
  }

  private confirm(): void {
    const nome = this.nameInput ? this.nameInput.value : this.pendingName;
    this.callbacks.onConfirm(sanitizePlayerName(nome), { ...this.appearance });
  }

  /** LB/RB: etapa anterior/seguinte. */
  onTab(direction: 1 | -1): void {
    if (this.step === null) return;
    const index = STEPS.indexOf(this.step);
    const next = index + direction;
    if (next < 0 || next >= STEPS.length) return;
    this.step = STEPS[next];
    this.render();
  }

  /** Start: conclui a criação (ou salva o visual). */
  onMenu(): void {
    if (this.step === null) return;
    this.confirm();
  }

  private randomize(): void {
    // Sorteia dentro do catálogo de quem a pessoa escolheu ser. O sexo
    // nunca é sorteado: essa escolha é dela.
    this.appearance = randomAppearance(this.rng, this.appearance.sex);
    this.callbacks.onPreview({ ...this.appearance });
    this.render();
  }

  onBack(): void {
    if (this.step !== null && this.step !== STEPS[0]) {
      this.step = STEPS[STEPS.indexOf(this.step) - 1];
      this.render();
      return;
    }
    if (this.editing) this.callbacks.onCancel();
  }

  initialFocus(): HTMLElement | null {
    // Evita abrir o teclado virtual automaticamente em celulares.
    if (this.step === null) return this.body.querySelector<HTMLElement>('.sex-card');
    return this.footer.querySelector<HTMLElement>('.btn--green');
  }
}
