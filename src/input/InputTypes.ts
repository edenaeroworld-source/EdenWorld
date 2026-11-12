import type { GameAction } from './InputSettings';

/** Dispositivo usado por último (define os ícones de ajuda exibidos no HUD). */
export type InputDevice = 'teclado' | 'toque' | 'controle';

/** Comandos de navegação de menus (teclado e controle). */
export type NavCommand = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'prevTab' | 'nextTab' | 'menu';

/** Estado contínuo dos comandos em um quadro. */
export interface InputFrame {
  /** Direita (+) / esquerda (−), de −1 a 1. */
  moveX: number;
  /** Frente (+) / trás (−), de −1 a 1. */
  moveY: number;
  /** Giro da câmera neste quadro (radianos). */
  lookX: number;
  lookY: number;
  /** Zoom neste quadro (positivo afasta). */
  zoom: number;
  run: boolean;
  jumpHeld: boolean;
}

export interface GamepadStatus {
  connected: boolean;
  id: string;
  /** `true` quando o navegador reconhece o layout padrão. */
  standard: boolean;
}

export interface InputEvents {
  action: GameAction;
  nav: NavCommand;
  device: InputDevice;
  gamepad: GamepadStatus;
  /** O navegador liberou o cursor (ex.: tecla Esc com o mouse capturado). */
  pointerUnlock: undefined;
}

/** Leitura bruta do controle, para a tela de teste. */
export interface GamepadSnapshot {
  axes: number[];
  buttons: number[];
}
