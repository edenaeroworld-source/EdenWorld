import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/core/Config';
import { DialogueRunner, MemoryFlags, validateDialogue } from '../../src/characters/Dialogue';
import { CHARACTER_JOURNAL, PANTHEON, getCharacter } from '../../src/characters/Pantheon';
import { GESTURE_IDS } from '../../src/player/Gestures';

/**
 * Panteão e diálogos: coerência do cânone do Éden Aero e segurança das árvores
 * de conversa (nenhum beco sem saída, nenhum destino inexistente).
 */

describe('panteão', () => {
  it('reúne as onze figuras do cânone, com ids únicos', () => {
    const ids = PANTHEON.map((character) => character.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['aerion', 'luma', 'suki', 'nexara', 'lilly', 'akemi', 'saturno', 'haru', 'maze', 'amara', 'jupiter']) {
      expect(ids).toContain(id);
    }
  });

  it('dá a cada figura nome, chamada, lugar e duas cores', () => {
    for (const character of PANTHEON) {
      expect(character.name.length).toBeGreaterThan(1);
      expect(character.title.length).toBeGreaterThan(1);
      expect(character.tagline.length).toBeGreaterThan(10);
      expect(character.colors.length).toBeGreaterThanOrEqual(2);
      for (const color of character.colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(Math.hypot(character.place.x, character.place.z)).toBeLessThan(WORLD.boundaryRadius);
      expect(character.place.label.length).toBeGreaterThan(3);
    }
  });

  it('declara Amara como Deusa da Maternidade, grávida, por cânone', () => {
    const amara = getCharacter('amara');
    expect(amara).toBeDefined();
    expect(amara?.domain).toContain('Maternidade');
    expect(amara?.title).toBe('Deusa da Maternidade');
    // A gestação é identidade: vai para a silhueta, não para um painel.
    expect(amara?.gestation).toBe(1);
    // Não há mais dúvida de cânone a registrar sobre ela.
    expect(amara?.canonNote).toBeUndefined();
    const visible = JSON.stringify(amara).toLowerCase();
    expect(visible).toContain('grávida');
    expect(visible).not.toContain('ainda não declarado');
  });

  it('não inventa, em volta da gestação de Amara, o que o cânone não disse', () => {
    const amara = getCharacter('amara');
    const visible = JSON.stringify(amara).toLowerCase();
    // O criador declarou domínio e gestação. Nada além disso: nem filho,
    // nem pai, nem data, nem parto. Inventar a volta é inventar cânone.
    for (const invented of ['pai do', 'o pai ', 'marido', 'esposo', 'nasce em', 'data do parto', 'parto', 'meses de', 'semanas de', 'nome do bebê', 'filho dela', 'filha dela']) {
      expect(visible).not.toContain(invented);
    }
  });

  it('dá a Amara só gestos que ela consegue fazer, e o do ventre', () => {
    const amara = getCharacter('amara');
    const gestures = (amara?.dialogue.nodes ?? []).map((node) => node.gesture).filter(Boolean);
    expect(gestures).toContain('acalentar');
    for (const gesture of gestures) expect(GESTURE_IDS).toContain(gesture);
  });

  it('preserva a identidade autista de Haru com respeito, e o seu print', () => {
    const haru = getCharacter('haru');
    expect(haru).toBeDefined();
    const text = JSON.stringify(haru);
    expect(text).toContain('autista');
    expect(text).toContain('Hello Eden');
    expect(haru?.domain.join(' ')).toMatch(/tecnologia|EdenOS/i);
    // Nada de linguagem de doença: a identidade é tratada como identidade.
    expect(text.toLowerCase()).not.toContain('sofre de');
    expect(text.toLowerCase()).not.toContain('doença');
  });

  it('mantém Aérion como criador e figura encontrável, não como o jogador', () => {
    const aerion = getCharacter('aerion');
    expect(aerion).toBeDefined();
    expect(aerion?.title.toLowerCase()).toContain('criador');
    // Corpo cósmico: a descrição precisa trazer a galáxia do cânone.
    expect(JSON.stringify(aerion).toLowerCase()).toMatch(/galáxia|nebulosa|estrela/);
  });

  it('dá a Saturno a filiação canônica e o cuidado dos animais', () => {
    const saturno = getCharacter('saturno');
    const text = JSON.stringify(saturno);
    expect(text).toMatch(/primeira filha/i);
    expect(saturno?.domain.join(' ').toLowerCase()).toContain('animais');
  });

  it('gera um registro de diário por figura, sem ids repetidos', () => {
    expect(CHARACTER_JOURNAL.length).toBe(PANTHEON.length);
    const ids = CHARACTER_JOURNAL.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of CHARACTER_JOURNAL) {
      expect(entry.id.startsWith('personagem-')).toBe(true);
      expect(entry.paragraphs.length).toBeGreaterThan(0);
    }
  });

  it('não devolve nada para um id desconhecido', () => {
    expect(getCharacter('nao-existe')).toBeUndefined();
  });
});

describe('árvores de diálogo', () => {
  it('são válidas: início presente e todos os destinos existem', () => {
    for (const character of PANTHEON) {
      expect(validateDialogue(character.dialogue)).toEqual([]);
    }
  });

  it('dão a cada figura um nó de reencontro e uma saída em todo nó', () => {
    for (const character of PANTHEON) {
      const ids = character.dialogue.nodes.map((node) => node.id);
      expect(ids).toContain('reencontro');
      for (const node of character.dialogue.nodes) {
        expect(node.text.length).toBeGreaterThan(0);
        // Sem escolhas o nó é final; com escolhas, nenhuma pode ser vazia.
        for (const choice of node.choices ?? []) expect(choice.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('registra o contato do panteão na primeira conversa', () => {
    for (const character of PANTHEON) {
      const effects = character.dialogue.nodes.flatMap((node) => [...(node.effects ?? []), ...(node.choices ?? []).flatMap((choice) => choice.effects ?? [])]);
      expect(effects.some((effect) => effect.kind === 'contato' && effect.id === character.id)).toBe(true);
    }
  });

  it('deixa toda conversa alcançável a partir do início', () => {
    for (const character of PANTHEON) {
      const byId = new Map(character.dialogue.nodes.map((node) => [node.id, node]));
      const seen = new Set<string>();
      const queue = [character.dialogue.start, 'reencontro'];
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        for (const choice of byId.get(id)?.choices ?? []) if (choice.to) queue.push(choice.to);
      }
      for (const node of character.dialogue.nodes) expect(seen.has(node.id)).toBe(true);
    }
  });

  it('deixa sempre uma saída: toda conversa pode ser encerrada', () => {
    for (const character of PANTHEON) {
      const byId = new Map(character.dialogue.nodes.map((node) => [node.id, node]));
      // Nós que encerram: sem escolhas, ou com uma escolha sem destino.
      const terminal = new Set(character.dialogue.nodes.filter((node) => (node.choices ?? []).length === 0 || (node.choices ?? []).some((choice) => !choice.to)).map((node) => node.id));
      // Propaga para trás: quem leva a um nó com saída também tem saída.
      let grew = true;
      while (grew) {
        grew = false;
        for (const node of character.dialogue.nodes) {
          if (terminal.has(node.id)) continue;
          if ((node.choices ?? []).some((choice) => choice.to && terminal.has(choice.to))) {
            terminal.add(node.id);
            grew = true;
          }
        }
      }
      for (const node of character.dialogue.nodes) expect([node.id, terminal.has(node.id)]).toEqual([node.id, true]);
      // E uma conversa real termina em poucos passos escolhendo a última opção.
      const runner = new DialogueRunner(character.dialogue, new MemoryFlags());
      let guard = 0;
      while (!runner.isFinished && guard++ < 20) runner.choose(runner.choices.length - 1);
      expect(runner.isFinished).toBe(true);
      expect(byId.size).toBeGreaterThan(2);
    }
  });

  it('acumula bandeiras e efeitos ao longo da conversa', () => {
    const flags = new MemoryFlags();
    const haru = getCharacter('haru');
    expect(haru).toBeDefined();
    const runner = new DialogueRunner(haru!.dialogue, flags);
    let guard = 0;
    while (!runner.isFinished && guard++ < 40) {
      if (runner.choices.length === 0) break;
      runner.choose(0);
    }
    const collected = runner.applied.map((effect) => `${effect.kind}:${effect.id}`);
    expect(collected.some((entry) => entry.startsWith('contato:'))).toBe(true);
    expect(flags.all.length).toBeGreaterThan(0);
  });

  it('só abre o reencontro depois de conhecer a pessoa', () => {
    const luma = getCharacter('luma');
    const runner = new DialogueRunner(luma!.dialogue, new MemoryFlags(), 'reencontro');
    expect(runner.current.id).toBe('reencontro');
  });

  it('aponta problemas quando a árvore está quebrada', () => {
    const problems = validateDialogue({
      start: 'ausente',
      nodes: [{ id: 'a', text: ['oi'], choices: [{ label: 'ir', to: 'fantasma' }] }],
    });
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });
});

describe('MemoryFlags', () => {
  it('guarda bandeiras sem repetir', () => {
    const flags = new MemoryFlags(['a', 'a', 'b']);
    flags.add('b');
    flags.add('c');
    expect(flags.has('a')).toBe(true);
    expect(flags.has('z')).toBe(false);
    expect([...flags.all].sort()).toEqual(['a', 'b', 'c']);
  });
});
