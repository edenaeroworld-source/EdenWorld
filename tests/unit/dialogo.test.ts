// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DialogueRunner, MemoryFlags, validateDialogue, type DialogueTree } from '../../src/characters/Dialogue';
import { DEFAULT_CPS, DialogueSequence } from '../../src/characters/DialogueSequence';
import { getCharacter, PANTHEON } from '../../src/characters/Pantheon';
import { CHARACTER_PERSONAS, archetypePersona, characterPersona, DEFAULT_PERSONA } from '../../src/characters/Personas';
import { DialogueBox } from '../../src/interface/DialogueBox';
import { DialogueScreen } from '../../src/interface/DialogueScreen';
import { CITIZEN_ARCHETYPES } from '../../src/npc/CitizenData';
import { EXPRESSIONS, isExpression } from '../../src/player/Expressions';
import { GESTURE_IDS } from '../../src/player/Gestures';

/**
 * A conversa, do texto à tela.
 *
 * Três camadas, testadas separadas: o **tempo** da fala (quantas letras
 * apareceram, quando vira a página), a **caixa** que desenha isso no
 * rodapé e a **tela** que liga as duas pontas à árvore de diálogo.
 */

const TREE: DialogueTree = {
  start: 'oi',
  nodes: [
    {
      id: 'oi',
      mood: 'feliz',
      gesture: 'acenar',
      text: ['Primeira linha.', 'Segunda linha, mais longa que a primeira.'],
      choices: [
        { label: 'Continuar', to: 'fim' },
        { label: 'Tchau' },
      ],
    },
    { id: 'fim', mood: 'pensativa', text: ['Até a próxima.'] },
  ],
};

function screenOf(options: Partial<Parameters<typeof makeScreen>[0]> = {}) {
  return makeScreen(options);
}

function makeScreen(options: { instant?: boolean; onLine?: (event: unknown) => void; onTalking?: (level: number) => void; onClose?: () => void } = {}) {
  const runner = new DialogueRunner(TREE, new MemoryFlags());
  const screen = new DialogueScreen({
    speaker: { name: 'Nexara', title: 'Deusa da Tecnologia', color: '#29c8ff', place: 'Praça Central' },
    runner,
    instantText: options.instant ?? true,
    onEffects: () => {},
    onClose: options.onClose ?? (() => {}),
    onLine: options.onLine as never,
    onTalking: options.onTalking,
  });
  document.body.appendChild(screen.element);
  return { screen, runner };
}

function page(screen: DialogueScreen): HTMLButtonElement {
  const element = screen.element.querySelector<HTMLButtonElement>('.talkbar__page');
  expect(element).not.toBeNull();
  return element as HTMLButtonElement;
}

function text(screen: DialogueScreen): string {
  return screen.element.querySelector('.talkbar__text')?.textContent ?? '';
}

function choices(screen: DialogueScreen): HTMLButtonElement[] {
  return [...screen.element.querySelectorAll<HTMLButtonElement>('.talkbar__choice')];
}

/* -------------------------------------------------------------------------- */

describe('tempo da fala', () => {
  it('revela o texto aos poucos, e não de uma vez', () => {
    const sequence = new DialogueSequence(['Boa noite, viajante.']);
    expect(sequence.visible).toBe('');
    sequence.update(0.1);
    const parcial = sequence.visible.length;
    expect(parcial).toBeGreaterThan(0);
    expect(parcial).toBeLessThan(sequence.page.length);
    for (let i = 0; i < 100; i++) sequence.update(0.05);
    expect(sequence.visible).toBe(sequence.page);
    expect(sequence.revealing).toBe(false);
  });

  it('respeita o ritmo pedido (letras por segundo)', () => {
    const texto = 'abcdefghijklmnopqrstuvwxyz';
    const devagar = new DialogueSequence([texto], { cps: 10 });
    const depressa = new DialogueSequence([texto], { cps: 40 });
    devagar.update(0.5);
    depressa.update(0.5);
    expect(depressa.visible.length).toBeGreaterThan(devagar.visible.length);
    expect(DEFAULT_CPS).toBeGreaterThan(10);
  });

  it('respira na pontuação sem travar a frase', () => {
    const sequence = new DialogueSequence(['Oi. Tudo bem?'], { cps: 1000 });
    // Um passo gordo pararia no ponto final, não no fim da frase.
    sequence.update(0.02);
    expect(sequence.visible).toBe('Oi.');
    expect(sequence.revealing).toBe(true);
    sequence.update(0.5);
    expect(sequence.visible).toBe('Oi. Tudo bem?');
  });

  it('pular mostra a página inteira; o botão seguinte vira a página', () => {
    const sequence = new DialogueSequence(['Uma.', 'Duas.']);
    expect(sequence.advance()).toBe('revelou');
    expect(sequence.visible).toBe('Uma.');
    expect(sequence.advance()).toBe('pagina');
    expect(sequence.pageIndex).toBe(1);
    expect(sequence.advance()).toBe('revelou');
    expect(sequence.advance()).toBe('fim');
    expect(sequence.finished).toBe(true);
  });

  it('modo instantâneo entrega o texto completo (acessibilidade)', () => {
    const sequence = new DialogueSequence(['Tudo de uma vez.'], { instant: true });
    expect(sequence.revealing).toBe(false);
    expect(sequence.visible).toBe('Tudo de uma vez.');
  });

  it('ignora parágrafos vazios', () => {
    const sequence = new DialogueSequence(['', '   ', 'Só esta vale.']);
    expect(sequence.pageCount).toBe(1);
    expect(sequence.page).toBe('Só esta vale.');
  });
});

/* -------------------------------------------------------------------------- */

describe('caixa de diálogo no rodapé', () => {
  it('fica no rodapé e deixa o mundo à vista', () => {
    const { screen } = screenOf();
    // Sem a classe de escurecer: nada de cobrir a cena inteira.
    expect(screen.element.classList.contains('screen--dim')).toBe(false);
    expect(screen.element.classList.contains('screen--talk')).toBe(true);
    expect(screen.element.querySelector('.talkbar')).not.toBeNull();
  });

  it('mostra o nome e o papel de quem fala', () => {
    const { screen } = screenOf();
    expect(screen.element.querySelector('.talkbar__name')?.textContent).toBe('Nexara');
    expect(screen.element.querySelector('.talkbar__role')?.textContent).toContain('Praça Central');
  });

  it('indica que há mais texto e some com o indicador no fim', () => {
    const { screen } = screenOf();
    const marker = screen.element.querySelector<HTMLElement>('.talkbar__marker');
    expect(marker?.hidden).toBe(false);
    page(screen).click();
    page(screen).click();
    expect(marker?.hidden).toBe(true);
  });

  it('só oferece as respostas depois da última página', () => {
    const { screen } = screenOf();
    expect(choices(screen)).toHaveLength(0);
    page(screen).click();
    expect(choices(screen).length).toBeGreaterThan(0);
    expect(choices(screen)[0].textContent).toContain('Continuar');
  });

  it('guarda o histórico da conversa, incluindo a resposta do jogador', () => {
    const { screen } = screenOf();
    page(screen).click();
    choices(screen)[0].click();
    const log = screen.element.querySelector('.talkbar__log')?.textContent ?? '';
    expect(log).toContain('Primeira linha.');
    expect(log).toContain('Continuar');
  });

  it('o texto aparece letra a letra quando o modo instantâneo está desligado', () => {
    const box = new DialogueBox({ speaker: { name: 'Haru', title: 'Deus dos Sistemas', color: '#8fe6ff' }, onAdvance: () => {}, onChoice: () => {} });
    box.say(['Uma frase inteira para revelar.'], 'Haru');
    const alvo = box.element.querySelector('.talkbar__text') as HTMLElement;
    expect(alvo.textContent).toBe('');
    box.update();
    expect(box.revealing).toBe(true);
  });

  it('avisa quantas letras apareceram (sincronia labial e som do texto)', () => {
    const onReveal = vi.fn();
    const box = new DialogueBox({ speaker: { name: 'Luma', title: 'Deusa da Luz', color: '#ffd84a' }, onAdvance: () => {}, onChoice: () => {}, onReveal });
    box.say(['Texto com letras suficientes para render alguns quadros.'], 'Luma');
    // Dois quadros com tempo real entre eles.
    box.update();
    const start = Date.now();
    while (Date.now() - start < 30) {
      /* espera um instante curto para o relógio andar */
    }
    box.update();
    expect(onReveal).toHaveBeenCalled();
    expect(onReveal.mock.calls[0][0]).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */

describe('a conversa ligada ao jogo', () => {
  it('avisa cada fala com expressão e gesto do roteiro', () => {
    const lines: { nodeId: string; first: boolean; mood?: string; gesture?: string }[] = [];
    const { screen } = screenOf({ onLine: (event) => lines.push(event as never) });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ nodeId: 'oi', first: true, mood: 'feliz', gesture: 'acenar' });
    page(screen).click();
    // Segunda página do mesmo nó: mantém a expressão, não repete o gesto.
    expect(lines).toHaveLength(2);
    expect(lines[1].first).toBe(false);
    expect(lines[1].gesture).toBeUndefined();
  });

  it('liga e desliga a boca conforme o texto aparece', () => {
    const levels: number[] = [];
    const { screen } = screenOf({ onTalking: (level) => levels.push(level) });
    expect(levels[0]).toBe(1);
    page(screen).click();
    page(screen).click();
    expect(levels[levels.length - 1]).toBe(0);
  });

  it('escolher uma resposta leva ao nó seguinte', () => {
    const { screen, runner } = screenOf();
    page(screen).click();
    choices(screen)[0].click();
    expect(runner.current.id).toBe('fim');
    expect(text(screen)).toContain('Até a próxima');
  });

  it('encerra quando o texto acaba e não há resposta', () => {
    const onClose = vi.fn();
    const { screen } = screenOf({ onClose });
    page(screen).click();
    choices(screen)[0].click();
    // Nó final: um clique a mais encerra.
    page(screen).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('pode ser interrompida com segurança a qualquer momento', () => {
    const onClose = vi.fn();
    const onTalking = vi.fn();
    const { screen, runner } = screenOf({ onClose, onTalking });
    screen.onBack();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(runner.isFinished).toBe(true);
    // A boca para junto com a conversa.
    expect(onTalking).toHaveBeenLastCalledWith(0);
    // Interromper duas vezes não dispara dois fechamentos.
    screen.onBack();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('entrega um alvo de foco para teclado e controle', () => {
    const { screen } = screenOf();
    expect(screen.initialFocus()).toBe(page(screen));
    page(screen).click();
    expect(screen.initialFocus()).toBe(choices(screen)[0]);
  });
});

/* -------------------------------------------------------------------------- */

describe('identidade de cada personagem', () => {
  it('cada figura do panteão tem um jeito próprio', () => {
    for (const character of PANTHEON) {
      const persona = characterPersona(character.id);
      expect(CHARACTER_PERSONAS[character.id]).toBeDefined();
      expect(EXPRESSIONS).toContain(persona.rest);
      expect(EXPRESSIONS).toContain(persona.greetMood);
      expect(persona.greet.length).toBeGreaterThan(0);
      expect(persona.talk.length).toBeGreaterThan(0);
      for (const gesture of [...persona.greet, ...persona.talk, ...persona.idle, persona.farewell]) {
        expect(GESTURE_IDS).toContain(gesture);
      }
      expect(persona.energy).toBeGreaterThan(0);
      expect(persona.energy).toBeLessThanOrEqual(1);
    }
  });

  it('os perfis não são todos iguais', () => {
    const energies = new Set(PANTHEON.map((character) => characterPersona(character.id).energy));
    expect(energies.size).toBeGreaterThan(5);
    // Suki-Chan gesticula mais que Saturno: é o que o texto delas diz.
    expect(characterPersona('suki').energy).toBeGreaterThan(characterPersona('saturno').energy);
    expect(characterPersona('haru').idleEvery).toBeGreaterThan(characterPersona('suki').idleEvery);
  });

  it('todo arquétipo de habitante também tem um jeito', () => {
    for (const archetype of CITIZEN_ARCHETYPES) {
      const persona = archetypePersona(archetype.id);
      expect(persona).not.toBe(DEFAULT_PERSONA);
      expect(EXPRESSIONS).toContain(persona.rest);
    }
    expect(archetypePersona('inexistente')).toBe(DEFAULT_PERSONA);
  });

  it('as falas do panteão pedem expressões válidas e gestos existentes', () => {
    let comMood = 0;
    for (const character of PANTHEON) {
      for (const node of character.dialogue.nodes) {
        if (node.mood) {
          expect(isExpression(node.mood)).toBe(true);
          comMood += 1;
        }
        if (node.gesture) expect(GESTURE_IDS).toContain(node.gesture);
      }
    }
    // Não é um enfeite isolado: a maioria das falas tem direção de atuação.
    expect(comMood).toBeGreaterThan(30);
  });

  it('as árvores continuam válidas depois da direção de atuação', () => {
    for (const character of PANTHEON) {
      expect(validateDialogue(character.dialogue)).toEqual([]);
    }
    // E o conteúdo não mudou: Haru continua dizendo o que dizia.
    const haru = getCharacter('haru');
    expect(JSON.stringify(haru?.dialogue.nodes)).toContain('Hello Eden');
  });
});
