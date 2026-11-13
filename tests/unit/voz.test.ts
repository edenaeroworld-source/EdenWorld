// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_VOICES,
  DEFAULT_VOICE_PROFILE,
  EmptyVoiceBank,
  MapVoiceBank,
  VOICE_MODES,
  VoiceSystem,
  isVoiceMode,
  type VoiceHost,
} from '../../src/systems/VoiceSystem';
import { PANTHEON } from '../../src/characters/Pantheon';
import { defaultAudioSettings, sanitizeAudioSettings } from '../../src/systems/SaveSystem';

/**
 * Voz dos personagens.
 *
 * O jogo **não tem dublagem** — e estes testes existem justamente para
 * que ele não finja ter. O que existe é a estrutura: clipes quando
 * houver arquivos, síntese do navegador quando o jogador ligar, e texto
 * com a boca se mexendo no resto do tempo.
 */

/** Sintetizador de mentira, para ver o que o sistema pede ao navegador. */
function fakeHost(): { host: VoiceHost; spoken: SpeechSynthesisUtterance[]; cancels: number } {
  const spoken: SpeechSynthesisUtterance[] = [];
  const state = { cancels: 0 };
  const synthesis = {
    speak(utterance: SpeechSynthesisUtterance) {
      spoken.push(utterance);
    },
    cancel() {
      state.cancels += 1;
    },
  } as unknown as SpeechSynthesis;
  const host: VoiceHost = {
    synthesis,
    utterance: (text: string) => ({ text, lang: '', pitch: 1, rate: 1, volume: 1 }) as SpeechSynthesisUtterance,
  };
  return {
    host,
    spoken,
    get cancels() {
      return state.cancels;
    },
  };
}

const LINE = { characterId: 'suki', nodeId: 'primeira', line: 0, text: 'Oi! Bem-vindo a Aurora City.' };

describe('o jogo não finge ter dublagem', () => {
  it('sem clipes e sem síntese ligada, nada é prometido', () => {
    const voice = new VoiceSystem({ synthesis: null }, new EmptyVoiceBank());
    expect(voice.hasClips).toBe(false);
    expect(voice.audible).toBe(false);
    expect(voice.speak(LINE)).toBe(false);
    expect(voice.describe()).toContain('Sem dublagem');
  });

  it('o modo padrão é texto, e o volume de voz vem salvo', () => {
    const settings = defaultAudioSettings();
    expect(settings.voiceMode).toBe('texto');
    expect(settings.voice).toBeGreaterThan(0);
    expect(VOICE_MODES).toEqual(['texto', 'sintese']);
    expect(isVoiceMode('sintese')).toBe(true);
    expect(isVoiceMode('dublagem')).toBe(false);
  });

  it('o aviso da tela de ajustes diz de onde vem a voz', () => {
    const voice = new VoiceSystem(fakeHost().host, new EmptyVoiceBank());
    voice.setMode('sintese');
    expect(voice.describe()).toContain('voz sintética do seu navegador');
    const semSintese = new VoiceSystem({ synthesis: null }, new EmptyVoiceBank());
    semSintese.setMode('sintese');
    expect(semSintese.describe()).toContain('não oferece síntese');
  });

  it('o salvamento aceita o volume e o modo de voz, e recusa lixo', () => {
    const limpo = sanitizeAudioSettings({ voice: 0.5, voiceMode: 'sintese' });
    expect(limpo.voice).toBe(0.5);
    expect(limpo.voiceMode).toBe('sintese');
    const sujo = sanitizeAudioSettings({ voice: 9, voiceMode: 'dublagem-cara' });
    expect(sujo.voice).toBe(1);
    expect(sujo.voiceMode).toBe('texto');
    // Salvamento antigo, sem os campos novos: carrega com o padrão.
    expect(sanitizeAudioSettings({ master: 0.4 }).voiceMode).toBe('texto');
  });
});

describe('síntese do navegador (grátis, opcional)', () => {
  it('fala com o perfil do personagem quando o jogador liga', () => {
    const fake = fakeHost();
    const voice = new VoiceSystem(fake.host, new EmptyVoiceBank());
    voice.setProfile('suki', CHARACTER_VOICES.suki);
    voice.setMode('sintese');
    voice.setVolume(0.6);
    expect(voice.speak(LINE)).toBe(true);
    expect(fake.spoken).toHaveLength(1);
    expect(fake.spoken[0].text).toBe(LINE.text);
    expect(fake.spoken[0].pitch).toBe(CHARACTER_VOICES.suki.pitch);
    expect(fake.spoken[0].rate).toBe(CHARACTER_VOICES.suki.rate);
    expect(fake.spoken[0].volume).toBe(0.6);
    expect(voice.active).toBe(true);
  });

  it('cada figura do panteão tem a própria voz', () => {
    const pitches = new Set<number>();
    for (const character of PANTHEON) {
      const profile = CHARACTER_VOICES[character.id];
      expect(profile).toBeDefined();
      expect(profile.lang).toBe('pt-BR');
      pitches.add(profile.pitch);
    }
    expect(pitches.size).toBeGreaterThan(5);
    // Saturno é grave e devagar; Suki-Chan é aguda e rápida.
    expect(CHARACTER_VOICES.saturno.pitch).toBeLessThan(CHARACTER_VOICES.suki.pitch);
    expect(CHARACTER_VOICES.saturno.rate).toBeLessThan(CHARACTER_VOICES.suki.rate);
    expect(DEFAULT_VOICE_PROFILE.lang).toBe('pt-BR');
  });

  it('só uma voz por vez: a fala nova interrompe a anterior', () => {
    const fake = fakeHost();
    const voice = new VoiceSystem(fake.host, new EmptyVoiceBank());
    voice.setMode('sintese');
    voice.speak(LINE);
    voice.speak({ ...LINE, line: 1, text: 'Outra frase.' });
    expect(fake.cancels).toBeGreaterThan(0);
    expect(fake.spoken).toHaveLength(2);
  });

  it('volume zero ou som mudo calam o sistema', () => {
    const fake = fakeHost();
    const voice = new VoiceSystem(fake.host, new EmptyVoiceBank());
    voice.setMode('sintese');
    voice.setVolume(0);
    expect(voice.audible).toBe(false);
    expect(voice.speak(LINE)).toBe(false);
    voice.setVolume(0.8, true);
    expect(voice.speak(LINE)).toBe(false);
    voice.setVolume(0.8, false);
    expect(voice.speak(LINE)).toBe(true);
  });

  it('a boca acompanha as sílabas e fecha depois da última', () => {
    const fake = fakeHost();
    const voice = new VoiceSystem(fake.host, new EmptyVoiceBank());
    voice.setMode('sintese');
    voice.speak(LINE);
    voice.update(1 / 60);
    expect(voice.level).toBeGreaterThan(0);
    // Sem novas sílabas, a boca fecha.
    for (let step = 0; step < 60; step++) voice.update(1 / 30);
    expect(voice.level).toBeLessThan(0.05);
    // Uma sílaba nova reabre.
    fake.spoken[0].onboundary?.({} as SpeechSynthesisEvent);
    voice.update(1 / 60);
    expect(voice.level).toBeGreaterThan(0);
  });

  it('o texto também move a boca quando não há áudio nenhum', () => {
    const voice = new VoiceSystem({ synthesis: null }, new EmptyVoiceBank());
    expect(voice.speak(LINE)).toBe(false);
    voice.pulse(1);
    voice.update(1 / 60);
    expect(voice.level).toBeGreaterThan(0);
  });
});

describe('clipes gravados (quando existirem)', () => {
  it('o banco vazio é o estado em que o jogo é entregue', () => {
    const bank = new EmptyVoiceBank();
    expect(bank.size).toBe(0);
    expect(bank.resolve()).toBeNull();
  });

  it('com arquivos instalados, o clipe tem preferência sobre a síntese', () => {
    const fake = fakeHost();
    const played: string[] = [];
    const host: VoiceHost = { ...fake.host, playClip: (url) => (played.push(url), () => undefined) };
    const voice = new VoiceSystem(host, new MapVoiceBank({ 'suki/primeira/0': '/voz/suki/primeira-0.mp3' }));
    expect(voice.hasClips).toBe(true);
    expect(voice.audible).toBe(true);
    expect(voice.speak(LINE)).toBe(true);
    expect(played).toEqual(['/voz/suki/primeira-0.mp3']);
    // Nada foi pedido ao sintetizador.
    expect(fake.spoken).toHaveLength(0);
  });

  it('sem clipe para aquela linha, cai para o que estiver disponível', () => {
    const fake = fakeHost();
    const host: VoiceHost = { ...fake.host, playClip: () => () => undefined };
    const voice = new VoiceSystem(host, new MapVoiceBank({ 'suki/outro/0': '/voz/x.mp3' }));
    voice.setMode('sintese');
    expect(voice.speak(LINE)).toBe(true);
    expect(fake.spoken).toHaveLength(1);
  });

  it('parar a voz interrompe o clipe em andamento', () => {
    const stop = vi.fn();
    const host: VoiceHost = { playClip: () => stop };
    const voice = new VoiceSystem(host, new MapVoiceBank({ 'suki/primeira/0': '/voz/a.mp3' }));
    voice.speak(LINE);
    voice.stop();
    expect(stop).toHaveBeenCalled();
    expect(voice.active).toBe(false);
    expect(voice.level).toBe(0);
  });

  it('trocar de modo ou desligar o som encerra a fala em curso', () => {
    const stop = vi.fn();
    const host: VoiceHost = { playClip: () => stop };
    const voice = new VoiceSystem(host, new MapVoiceBank({ 'suki/primeira/0': '/voz/a.mp3' }));
    voice.speak(LINE);
    voice.setMode('sintese');
    expect(stop).toHaveBeenCalled();
  });
});
