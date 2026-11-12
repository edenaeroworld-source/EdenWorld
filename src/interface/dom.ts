/** Pequenos utilitários de DOM usados pela interface (sem frameworks). */

export type Child = Node | string | null | undefined | false;

export interface ElementProps {
  class?: string;
  /** Texto simples (sempre via `textContent`: seguro para conteúdo do jogador). */
  text?: string;
  /** HTML fixo e confiável (apenas ícones embutidos). */
  html?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  onClick?: (event: MouseEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElementProps = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.html !== undefined) element.innerHTML = props.html;
  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      element.setAttribute(name, value === true ? '' : String(value));
    }
  }
  if (props.onClick) element.addEventListener('click', props.onClick as EventListener);
  append(element, children);
  return element;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

const ARROW_ANGLES: Record<string, number> = { '←': 0, '↑': 90, '→': 180, '↓': 270 };
const ARROW_NAMES: Record<string, string> = { '←': 'esquerda', '↑': 'cima', '→': 'direita', '↓': 'baixo' };
const ARROW_SVG =
  '<svg class="icon" width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M11 5l1.7 1.7L8.4 11H20v2.400H8.400l4.300 4.300L11 19.400 3.800 12.200z"/></svg>';

/** Troca setas (←↑→↓) por texto falável: usado em rótulos acessíveis. */
export function spokenLabel(label: string): string {
  return label.replace(/[←↑→↓]/g, (arrow) => `seta para ${ARROW_NAMES[arrow]}`);
}

/**
 * Converte o rótulo de uma tecla ou botão em nós de DOM, desenhando as
 * setas (←↑→↓) como ícones vetoriais — assim elas aparecem mesmo em
 * aparelhos cuja fonte não tem esses símbolos.
 */
export function keyCapContent(label: string): Node[] {
  const nodes: Node[] = [];
  let text = '';
  for (const char of label) {
    const angle = ARROW_ANGLES[char];
    if (angle === undefined) {
      text += char;
      continue;
    }
    if (text) nodes.push(document.createTextNode(text));
    text = '';
    const arrow = h('span', { class: 'key-arrow', html: ARROW_SVG, attrs: { role: 'img', 'aria-label': `seta para ${ARROW_NAMES[char]}` } });
    arrow.style.transform = `rotate(${angle}deg)`;
    nodes.push(arrow);
  }
  if (text) nodes.push(document.createTextNode(text));
  return nodes;
}

export function clear(element: Element): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

export interface ButtonOptions {
  class?: string;
  /** HTML de ícone (de `icon()`), exibido antes do texto. */
  icon?: string;
  label?: string;
  /** Rótulo acessível quando o botão só tem ícone. */
  ariaLabel?: string;
  onClick: (event: MouseEvent) => void;
  disabled?: boolean;
}

export function button(options: ButtonOptions): HTMLButtonElement {
  const element = h('button', { class: options.class ?? 'btn', attrs: { type: 'button' }, onClick: options.onClick });
  if (options.icon) element.appendChild(h('span', { html: options.icon, attrs: { 'aria-hidden': 'true' } }));
  if (options.label) element.appendChild(h('span', { text: options.label }));
  if (options.ariaLabel) element.setAttribute('aria-label', options.ariaLabel);
  if (options.disabled) element.disabled = true;
  return element;
}

/** Interruptor liga/desliga acessível. */
export function toggle(label: string, value: boolean, onChange: (value: boolean) => void, disabled = false): HTMLButtonElement {
  const element = h('button', { class: 'switch', attrs: { type: 'button', role: 'switch', 'aria-checked': String(value), 'aria-label': label } });
  element.disabled = disabled;
  element.addEventListener('click', () => {
    const next = element.getAttribute('aria-checked') !== 'true';
    element.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return element;
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (value: number) => string;
  onInput: (value: number) => void;
}

export function slider(options: SliderOptions): HTMLDivElement {
  const format = options.format ?? ((v: number) => String(v));
  const output = h('output', { text: format(options.value) });
  const input = h('input', {
    attrs: { type: 'range', min: options.min, max: options.max, step: options.step, value: options.value, 'aria-label': options.label },
  });
  input.addEventListener('input', () => {
    const value = Number(input.value);
    output.textContent = format(value);
    options.onInput(value);
  });
  return h('div', { class: 'slider' }, input, output);
}

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/** Grupo de opções mutuamente exclusivas (botões segmentados ou "chips"). */
export function choiceGroup<T extends string>(
  label: string,
  choices: readonly Choice<T>[],
  value: T,
  onChange: (value: T) => void,
  className = 'segmented',
  itemClass = '',
): HTMLDivElement {
  const group = h('div', { class: className, attrs: { role: 'group', 'aria-label': label } });
  const buttons: HTMLButtonElement[] = [];
  for (const choice of choices) {
    const item = h('button', { class: itemClass, text: choice.label, attrs: { type: 'button', 'aria-pressed': String(choice.value === value) } });
    item.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === item));
      onChange(choice.value);
    });
    buttons.push(item);
    group.appendChild(item);
  }
  return group;
}

/** Linha de configuração: rótulo (com dica opcional) + controle. */
export function field(label: string, control: Node, hint?: string): HTMLDivElement {
  const labelElement = h('div', { class: 'field__label', text: label });
  if (hint) labelElement.appendChild(h('span', { class: 'field__hint', text: hint }));
  return h('div', { class: 'field' }, labelElement, h('div', { class: 'field__control' }, control));
}

export const percent = (value: number): string => `${Math.round(value * 100)}%`;
