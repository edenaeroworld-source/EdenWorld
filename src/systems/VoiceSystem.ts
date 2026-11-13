/**
 * Voz dos personagens.
 *
 * O EDENWORLD não tem dublagem. Isto aqui é a **estrutura** para ter:
 * três fontes de som, escolhidas nesta ordem e sem nenhuma depender de
 * serviço pago:
 *
 * 1. **Clipes gravados** — arquivos de áudio indexados por personagem e
 *    por nó de diálogo. O jogo não traz nenhum: o banco vem vazio e
 *    `hasClips` responde `false` até alguém colocar arquivos lá.
 * 2. **Síntese do navegador** (`speechSynthesis`) — grátis, já instalada
 *    no sistema de quem joga, e desligada por padrão. É voz de robô, e o
 *    jogo diz isso com todas as letras na tela de ajustes.
 * 3. **Texto** — o padrão. A boca do personagem se mexe no ritmo em que
 *    as letras aparecem; não há áudio nenhum.
 *
 * O nível da boca (`level`) sai daqui em todos os casos, então a
 * sincronia labial funciona igual com voz ou sem voz.
 */

import { clamp01 } from '../utils/math';

export type VoiceMode = 'texto' | 'sintese';

export const VOICE_MODES: readonly VoiceMode[] = ['texto', 'sintese'];

export const VOICE_MODE_LABELS: Record<VoiceMode, string> = {
  texto: 'Só texto',
  sintese: 'Síntese do navegador',
};

export function isVoiceMode(value: unknown): value is VoiceMode {
  return value === 'texto' || value === 'sintese';
}

/**
 * Perfil de voz de um personagem.
 *
 * Os números valem para a síntese do navegador e para a escolha do
 * clipe; o tom também tempera o ritmo da boca quando não há áudio.
 */
export interface VoiceProfile {
  /** Altura da voz (0.5 grave – 2 aguda). */
  pitch: number;
  /** Velocidade da fala (0.5 devagar – 1.6 depressa). */
  rate: number;
  /** Idioma preferido da síntese. */
  lang: string;
  /** Pedaço do nome da voz do sistema a procurar (opcional). */
  prefer?: string;
}

export const DEFAULT_VOICE_PROFILE: VoiceProfile = Object.freeze({ pitch: 1, rate: 1, lang: 'pt-BR' });

/**
 * Banco de clipes gravados.
 *
 * Implementação de teste e de produção compartilham esta interface. O
 * jogo usa `EmptyVoiceBank` enquanto não existirem arquivos.
 */
export interface VoiceBank {
  /** Caminho do clipe desta fala, ou `null` se não houver. */
  resolve(characterId: string, nodeId: string, line: number): string | null;
  /** `true` quando o banco tem pelo menos um clipe. */
  readonly size: number;
}

/** Banco sem nenhum clipe — o estado em que o jogo é entregue. */
export class EmptyVoiceBank implements VoiceBank {
  readonly size = 0;

  resolve(): string | null {
    return null;
  }
}

/** Banco em memória: um mapa `personagem/nó/linha` → arquivo. */
export class MapVoiceBank implements VoiceBank {
  constructor(private readonly clips: Readonly<Record<string, string>>) {}

  get size(): number {
    return Object.keys(this.clips).length;
  }

  resolve(characterId: string, nodeId: string, line: number): string | null {
    return this.clips[`${characterId}/${nodeId}/${line}`] ?? this.clips[`${characterId}/${nodeId}`] ?? null;
  }
}

export interface VoiceRequest {
  characterId: string;
  nodeId: string;
  /** Índice do parágrafo dentro do nó. */
  line: number;
  text: string;
  profile?: VoiceProfile;
}

/** Peças do navegador que o sistema usa, injetáveis para teste. */
export interface VoiceHost {
  synthesis?: SpeechSynthesis | null;
  /** Fábrica de falas (`SpeechSynthesisUtterance`). */
  utterance?: (text: string) => SpeechSynthesisUtterance;
  /** Tocador de clipes; devolve uma função que interrompe. */
  playClip?: (url: string, volume: number) => (() => void) | null;
}

function browserHost(): VoiceHost {
  const synthesis = typeof globalThis !== 'undefined' ? ((globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null) : null;
  const Utterance = typeof globalThis !== 'undefined' ? (globalThis as { SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtterance }).SpeechSynthesisUtterance : undefined;
  return {
    synthesis,
    utterance: Utterance ? (text: string) => new Utterance(text) : undefined,
  };
}

/**
 * Tempo (s) que a boca leva para fechar depois da última sílaba.
 * Sem isto a boca trava aberta quando a frase acaba.
 */
const MOUTH_DECAY = 0.12;

export class VoiceSystem {
  readonly id = 'voz';

  private host: VoiceHost;
  private bank: VoiceBank;
  private modeId: VoiceMode = 'texto';
  private volume = 0.8;
  private muted = false;
  /** Nível da boca agora (0–1). */
  private mouth = 0;
  /** Alvo do nível da boca, empurrado por sílabas ou pelo texto. */
  private mouthTarget = 0;
  private speaking = false;
  private stopCurrent: (() => void) | null = null;
  private profiles = new Map<string, VoiceProfile>();

  constructor(host: VoiceHost = browserHost(), bank: VoiceBank = new EmptyVoiceBank()) {
    this.host = host;
    this.bank = bank;
  }

  /* --------------------------- Estado ----------------------------- */

  get mode(): VoiceMode {
    return this.modeId;
  }

  /** `true` quando o navegador oferece síntese de fala. */
  get canSynthesize(): boolean {
    return Boolean(this.host.synthesis && this.host.utterance);
  }

  /** `true` quando existem clipes gravados instalados. */
  get hasClips(): boolean {
    return this.bank.size > 0;
  }

  /** `true` quando alguma voz sai de fato pelos alto-falantes. */
  get audible(): boolean {
    if (this.muted || this.volume <= 0) return false;
    if (this.hasClips) return true;
    return this.modeId === 'sintese' && this.canSynthesize;
  }

  get active(): boolean {
    return this.speaking;
  }

  /** Nível da boca para a sincronia labial (0–1). */
  get level(): number {
    return this.mouth;
  }

  /**
   * Frase honesta sobre o que está disponível, para a tela de ajustes.
   * Nunca promete dublagem que não existe.
   */
  describe(): string {
    if (this.hasClips) return 'Clipes de voz instalados.';
    if (this.modeId === 'sintese') {
      return this.canSynthesize
        ? 'Sem dublagem: as falas usam a voz sintética do seu navegador.'
        : 'Seu navegador não oferece síntese de fala. As falas ficam só em texto.';
    }
    return 'Sem dublagem. As falas aparecem em texto, com a boca acompanhando.';
  }

  /* -------------------------- Ajustes ----------------------------- */

  setMode(mode: VoiceMode): void {
    if (this.modeId === mode) return;
    this.modeId = mode;
    this.stop();
  }

  setVolume(volume: number, muted = false): void {
    this.volume = clamp01(volume);
    this.muted = muted;
    if (!this.audible) this.stop();
  }

  setBank(bank: VoiceBank): void {
    this.bank = bank;
  }

  /** Registra o perfil de voz de um personagem. */
  setProfile(characterId: string, profile: VoiceProfile): void {
    this.profiles.set(characterId, profile);
  }

  profileOf(characterId: string): VoiceProfile {
    return this.profiles.get(characterId) ?? DEFAULT_VOICE_PROFILE;
  }

  /* --------------------------- Fala ------------------------------- */

  /**
   * Diz uma fala.
   *
   * Devolve `true` quando saiu som. `false` quer dizer modo texto — e
   * nesse caso quem chamou continua movendo a boca pelo texto, via
   * `pulse()`.
   *
   * Só uma voz por vez: a fala anterior é interrompida. É o que acontece
   * numa conversa de verdade, e evita um coro de vozes na praça.
   */
  speak(request: VoiceRequest): boolean {
    this.stop();
    if (!this.audible) return false;
    const profile = request.profile ?? this.profileOf(request.characterId);

    const clip = this.bank.resolve(request.characterId, request.nodeId, request.line);
    if (clip && this.host.playClip) {
      const stop = this.host.playClip(clip, this.volume);
      if (stop) {
        this.speaking = true;
        this.mouthTarget = 1;
        this.stopCurrent = () => {
          stop();
          this.speaking = false;
          this.mouthTarget = 0;
        };
        return true;
      }
    }

    if (this.modeId !== 'sintese' || !this.host.synthesis || !this.host.utterance) return false;
    const synthesis = this.host.synthesis;
    const utterance = this.host.utterance(request.text);
    utterance.lang = profile.lang;
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;
    utterance.volume = this.volume;
    // Cada palavra pronunciada abre a boca; o decaimento a fecha.
    utterance.onboundary = () => {
      this.mouthTarget = 1;
    };
    utterance.onend = () => {
      this.speaking = false;
      this.mouthTarget = 0;
    };
    utterance.onerror = () => {
      this.speaking = false;
      this.mouthTarget = 0;
    };
    this.speaking = true;
    this.mouthTarget = 1;
    this.stopCurrent = () => {
      synthesis.cancel();
      this.speaking = false;
      this.mouthTarget = 0;
    };
    synthesis.speak(utterance);
    return true;
  }

  /**
   * Empurra a boca sem áudio (modo texto).
   * Chamado pela caixa de diálogo a cada letra revelada.
   */
  pulse(level = 1): void {
    this.mouthTarget = Math.max(this.mouthTarget, clamp01(level));
  }

  /** Interrompe a fala atual. Seguro de chamar a qualquer momento. */
  stop(): void {
    const stop = this.stopCurrent;
    this.stopCurrent = null;
    this.speaking = false;
    this.mouthTarget = 0;
    if (stop) stop();
  }

  /** Fecha a boca aos poucos entre uma sílaba e outra. */
  update(dt: number): void {
    if (dt <= 0) return;
    const fall = Math.min(1, dt / MOUTH_DECAY);
    this.mouth += (this.mouthTarget - this.mouth) * fall;
    if (this.mouth < 0.004) this.mouth = 0;
    // Toda sílaba é um pico isolado: o alvo cai sozinho logo depois.
    this.mouthTarget = Math.max(0, this.mouthTarget - dt * 6);
  }

  dispose(): void {
    this.stop();
    this.profiles.clear();
  }
}

/**
 * Perfis de voz do panteão.
 *
 * Derivados do que cada personagem já é no texto: Saturno é grave e
 * devagar, Suki-Chan é aguda e rápida, Haru fala baixo e pausado.
 */
export const CHARACTER_VOICES: Readonly<Record<string, VoiceProfile>> = Object.freeze({
  aerion: { pitch: 0.9, rate: 0.95, lang: 'pt-BR' },
  haru: { pitch: 1.05, rate: 0.85, lang: 'pt-BR' },
  nexara: { pitch: 1.15, rate: 1.05, lang: 'pt-BR' },
  suki: { pitch: 1.5, rate: 1.2, lang: 'pt-BR' },
  luma: { pitch: 1.3, rate: 1.05, lang: 'pt-BR' },
  lilly: { pitch: 1.25, rate: 0.95, lang: 'pt-BR' },
  akemi: { pitch: 1.55, rate: 1.15, lang: 'pt-BR' },
  saturno: { pitch: 0.7, rate: 0.82, lang: 'pt-BR' },
  maze: { pitch: 1.1, rate: 1.1, lang: 'pt-BR' },
  jupiter: { pitch: 0.75, rate: 0.95, lang: 'pt-BR' },
  amara: { pitch: 1.2, rate: 0.9, lang: 'pt-BR' },
});
