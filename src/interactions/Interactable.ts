import type * as THREE from 'three';

/** Posição e orientação de um assento. */
export interface SeatSpot {
  x: number;
  y: number;
  z: number;
  /** Direção para a qual o personagem olha sentado. */
  heading: number;
}

/** Vista panorâmica usada por telescópios e mirantes. */
export interface ScenicView {
  /** Posição do observador. */
  eye: { x: number; y: number; z: number };
  /** Direção inicial (yaw) e inclinação (pitch) do olhar. */
  yaw: number;
  pitch: number;
}

/** Conteúdo específico de cada tipo de interação. */
export type InteractionPayload =
  | { type: 'assento'; seat: SeatSpot }
  | { type: 'fonte'; splashAt: { x: number; y: number; z: number } }
  | { type: 'placa'; title: string; paragraphs: readonly string[]; entryId?: string }
  | { type: 'portal'; portalId: string }
  | { type: 'esfera' }
  | { type: 'telescopio'; view: ScenicView }
  | { type: 'atelie'; stand?: { x: number; z: number; heading: number } }
  | { type: 'holomapa' }
  | { type: 'eventos' }
  /** Conversa com um habitante: `personId` é o id do panteão ou a semente do cidadão. */
  | { type: 'conversa'; personId: string; divino: boolean };

export type InteractionType = InteractionPayload['type'];

/**
 * Objeto do mundo com o qual o jogador pode interagir.
 * Os construtores do cenário apenas declaram interativos (dados);
 * o comportamento de cada tipo é registrado no `InteractionSystem`.
 */
export interface Interactable {
  /** Identificador único e estável (usado em salvamento e progresso). */
  id: string;
  /** Nome exibido ao jogador (ex.: "Fonte dos Desejos"). */
  name: string;
  /** Verbo da ação (ex.: "Fazer um pedido"). */
  action: string;
  position: THREE.Vector3;
  /** Distância máxima (m) para interagir. */
  range: number;
  enabled: boolean;
  payload: InteractionPayload;
  /** Tempo mínimo (s) entre usos consecutivos. */
  cooldown?: number;
  /** Uso interno: instante do último uso. */
  lastUsedAt?: number;
}
