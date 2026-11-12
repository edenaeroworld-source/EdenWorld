import type { GameSystem } from '../core/GameSystem';

/**
 * Éden Connect — ponto de extensão para a futura conta on-line do
 * universo Éden. A Genesis 0.1 é totalmente off-line: esta camada
 * define o contrato e fornece uma implementação local que NÃO faz
 * nenhuma chamada de rede nem coleta dados.
 */
export type ConnectStatus = 'indisponivel' | 'desconectado' | 'conectado';

export interface EdenProfile {
  /** Identificador do perfil (local nesta versão). */
  id: string;
  displayName: string;
  /** `true` enquanto o perfil existe apenas neste dispositivo. */
  local: boolean;
}

export interface EdenConnectService extends GameSystem {
  readonly status: ConnectStatus;
  readonly profile: EdenProfile;
  /** Indica se os serviços on-line existem nesta versão. */
  readonly available: boolean;
  setDisplayName(name: string): void;
  /**
   * Inicia sessão nos serviços on-line. Nesta versão sempre resolve
   * `false`: não há servidor.
   */
  signIn(): Promise<boolean>;
  signOut(): Promise<void>;
}

/** Implementação off-line: mantém apenas um perfil local, sem rede. */
export class OfflineEdenConnect implements EdenConnectService {
  readonly id = 'eden-connect';
  readonly status: ConnectStatus = 'indisponivel';
  readonly available = false;
  readonly profile: EdenProfile;

  constructor(displayName: string) {
    this.profile = { id: 'local', displayName, local: true };
  }

  setDisplayName(name: string): void {
    this.profile.displayName = name;
  }

  signIn(): Promise<boolean> {
    return Promise.resolve(false);
  }

  signOut(): Promise<void> {
    return Promise.resolve();
  }
}
