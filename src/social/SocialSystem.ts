import type { AftersNetState } from '../afters/AftersNet';
import type { GameSystem } from '../core/GameSystem';
import type { AvatarAppearance } from '../player/AvatarAppearance';

/**
 * Camada social — ponto de extensão para multijogador, amigos e
 * conversas. A Genesis 0.1 é uma experiência para um jogador: esta
 * implementação local não se conecta a nada e não exibe outros
 * jogadores. O contrato abaixo descreve o que um futuro serviço
 * precisa oferecer para ser plugado sem alterar o restante do jogo.
 */
export interface RemotePlayerState {
  id: string;
  name: string;
  appearance: AvatarAppearance;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Estado de animação (ex.: "walk", "sit"). */
  motion: string;
  /**
   * Transformação de silhueta Afters®, quando houver servidor.
   *
   * Campo opcional de propósito: hoje nada o preenche, porque o EDENWORLD
   * não tem multijogador (`LocalSocial.online` é `false`). Ele existe para
   * que a transformação já tenha um lugar definido no estado remoto — ver
   * `src/afters/AftersNet.ts`.
   */
  afters?: AftersNetState;
}

export interface LocalPlayerState {
  x: number;
  y: number;
  z: number;
  heading: number;
  motion: string;
}

export interface SocialService extends GameSystem {
  /** `true` quando há conexão com outros jogadores. */
  readonly online: boolean;
  /** Jogadores visíveis na região atual. */
  readonly nearby: readonly RemotePlayerState[];
  /** Publica o estado do jogador local (ignorado quando off-line). */
  publish(state: LocalPlayerState): void;
  /** Envia um aceno ou emote aos jogadores próximos. */
  sendEmote(emote: string): void;
}

/** Implementação de um jogador: nenhuma rede, nenhuma coleta de dados. */
export class LocalSocial implements SocialService {
  readonly id = 'social';
  readonly online = false;
  readonly nearby: readonly RemotePlayerState[] = [];

  publish(_state: LocalPlayerState): void {
    /* off-line: nada é enviado */
  }

  sendEmote(_emote: string): void {
    /* off-line: nada é enviado */
  }
}
