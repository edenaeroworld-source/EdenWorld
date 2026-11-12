/**
 * Sistema de transformação de silhueta dos Afters®.
 *
 * Liga o estado (`AftersBody`) aos dois canais animados e escreve o
 * resultado no avatar a cada quadro. A escrita custa dois `float`: não
 * reconstrói geometria, não troca material, não recarrega a cena e não
 * interrompe o movimento — por isso a transformação acontece ao vivo,
 * andando, correndo ou conversando com alguém.
 */

import type { GameSystem } from '../core/GameSystem';
import type { Avatar } from '../player/Avatar';
import { AfterBustController, AfterCurveController, type ChannelSnapshot } from './AftersChannel';
import {
  type AftersBody,
  type AftersChannelId,
  type AftersPreset,
  applyPreset,
  clampDuration,
  defaultAftersBody,
  effectiveIntensity,
  matchingPreset,
  resetChannel,
  statusLabel,
} from './AftersState';

export interface AftersBodyCallbacks {
  /** Avisa quando uma transição começa (para som e aviso na tela). */
  onTransition?(channel: AftersChannelId, from: number, to: number): void;
  /** Avisa a cada mudança de estado, para o salvamento marcar sujeira. */
  onChange?(body: AftersBody): void;
}

export interface AftersBodyStatus {
  bust: ChannelSnapshot;
  curve: ChannelSnapshot;
  /** Os dois canais ligados ao mesmo tempo. */
  combined: boolean;
  /** Alguma transição em andamento. */
  animating: boolean;
  label: string;
}

export class AftersBodySystem implements GameSystem {
  readonly id = 'afters-body';
  readonly bust = new AfterBustController();
  readonly curve = new AfterCurveController();

  private body: AftersBody = defaultAftersBody();
  private avatars: Avatar[] = [];
  private disposed = false;

  constructor(private readonly callbacks: AftersBodyCallbacks = {}) {
    this.bust.duration = this.body.duration;
    this.curve.duration = this.body.duration;
  }

  /**
   * Avatares que recebem a transformação. Normalmente é só o do jogador,
   * mas o manequim do criador de avatar também entra, para o jogador ver
   * o resultado enquanto escolhe a aparência.
   */
  setAvatars(avatars: readonly Avatar[]): void {
    this.avatars = [...avatars];
    this.push();
  }

  addAvatar(avatar: Avatar): void {
    if (this.avatars.includes(avatar)) return;
    this.avatars.push(avatar);
    this.push();
  }

  removeAvatar(avatar: Avatar): void {
    const index = this.avatars.indexOf(avatar);
    if (index >= 0) {
      this.avatars.splice(index, 1);
      // Devolve a silhueta original ao avatar que sai do sistema.
      avatar.setMorph(0, 0);
    }
  }

  get current(): AftersBody {
    return { ...this.body };
  }

  get status(): AftersBodyStatus {
    return {
      bust: this.bust.snapshot(),
      curve: this.curve.snapshot(),
      combined: this.bust.active && this.curve.active,
      animating: this.bust.animating || this.curve.animating,
      label: statusLabel(this.body),
    };
  }

  /**
   * Carrega o estado inteiro (salvamento, importação, novo jogo).
   *
   * @param animate `false` salta direto para o destino, sem transição.
   */
  setBody(body: AftersBody, animate = true): void {
    this.body = { ...body };
    this.bust.duration = body.duration;
    this.curve.duration = body.duration;
    this.bust.apply(body.bust, body.bustActive, animate);
    this.curve.apply(body.curve, body.curveActive, animate);
    if (!animate) {
      this.bust.snap();
      this.curve.snap();
    }
    this.push();
    this.callbacks.onChange?.(this.current);
  }

  /** Intensidade de um canal, em unidade interna (0–2.5). */
  setIntensity(channel: AftersChannelId, value: number): void {
    const before = channel === 'bust' ? this.bust.target : this.curve.target;
    if (channel === 'bust') {
      this.bust.setIntensity(value);
      this.body.bust = this.bust.stored;
    } else {
      this.curve.setIntensity(value);
      this.body.curve = this.curve.stored;
    }
    this.afterEdit(channel, before);
  }

  /** Liga ou desliga um canal, preservando a intensidade escolhida. */
  setActive(channel: AftersChannelId, active: boolean): void {
    const before = channel === 'bust' ? this.bust.target : this.curve.target;
    if (channel === 'bust') {
      this.bust.setActive(active);
      this.body.bustActive = active;
    } else {
      this.curve.setActive(active);
      this.body.curveActive = active;
    }
    this.afterEdit(channel, before);
  }

  /** Liga ou desliga os dois canais de uma vez (modo combinado). */
  setCombined(active: boolean): void {
    const bustBefore = this.bust.target;
    const curveBefore = this.curve.target;
    this.bust.setActive(active);
    this.curve.setActive(active);
    this.body.bustActive = active;
    this.body.curveActive = active;
    this.afterEdit('bust', bustBefore);
    this.afterEdit('curve', curveBefore);
  }

  /** Duração da transição, igual para os dois canais. */
  setDuration(seconds: number): void {
    const value = clampDuration(seconds);
    this.body.duration = value;
    this.bust.duration = value;
    this.curve.duration = value;
    this.callbacks.onChange?.(this.current);
  }

  applyPreset(preset: AftersPreset): void {
    const bustBefore = this.bust.target;
    const curveBefore = this.curve.target;
    this.body = applyPreset(this.body, preset);
    this.bust.apply(this.body.bust, this.body.bustActive);
    this.curve.apply(this.body.curve, this.body.curveActive);
    if (Math.abs(this.bust.target - bustBefore) > 1e-4) this.callbacks.onTransition?.('bust', bustBefore, this.bust.target);
    if (Math.abs(this.curve.target - curveBefore) > 1e-4) this.callbacks.onTransition?.('curve', curveBefore, this.curve.target);
    this.callbacks.onChange?.(this.current);
  }

  /** Desliga os dois canais sem perder os valores escolhidos. */
  turnOff(): void {
    this.setCombined(false);
  }

  /**
   * Reinicia um canal: 0% e desligado, apagando a porcentagem guardada.
   *
   * O outro canal não é tocado — reiniciar o AfterBust® não mexe em nada do
   * AfterCurve®, nem na duração da transição, nem no efeito de luz.
   */
  reset(channel: AftersChannelId): void {
    const before = channel === 'bust' ? this.bust.target : this.curve.target;
    this.body = resetChannel(this.body, channel);
    if (channel === 'bust') this.bust.apply(0, false);
    else this.curve.apply(0, false);
    if (Math.abs(before) > 1e-4) this.callbacks.onTransition?.(channel, before, 0);
    this.callbacks.onChange?.(this.current);
  }

  /** Reinicia os dois canais e a duração: volta tudo ao padrão de fábrica. */
  resetAll(): void {
    const bustBefore = this.bust.target;
    const curveBefore = this.curve.target;
    this.setBody(defaultAftersBody(), true);
    if (Math.abs(bustBefore) > 1e-4) this.callbacks.onTransition?.('bust', bustBefore, 0);
    if (Math.abs(curveBefore) > 1e-4) this.callbacks.onTransition?.('curve', curveBefore, 0);
  }

  private afterEdit(channel: AftersChannelId, before: number): void {
    const target = channel === 'bust' ? this.bust.target : this.curve.target;
    this.body.preset = matchingPreset(this.body)?.id ?? null;
    if (Math.abs(target - before) > 1e-4) this.callbacks.onTransition?.(channel, before, target);
    this.callbacks.onChange?.(this.current);
  }

  /** Escreve as intensidades atuais em todos os avatares ligados. */
  private push(): void {
    const bust = this.bust.current;
    const curve = this.curve.current;
    for (const avatar of this.avatars) avatar.setMorph(bust, curve);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const wasAnimating = this.bust.animating || this.curve.animating;
    this.bust.update(dt);
    this.curve.update(dt);
    // Fora da transição a escrita é redundante, mas custa dois `float` e
    // garante que um avatar recém-criado já nasça com a silhueta certa.
    this.push();
    if (wasAnimating && !this.bust.animating && !this.curve.animating) this.callbacks.onChange?.(this.current);
  }

  /** Intensidade que o avatar está mostrando agora (para rede e HUD). */
  effective(channel: AftersChannelId): number {
    return channel === 'bust' ? this.bust.current : this.curve.current;
  }

  /** Intensidade pedida pelo jogador (o destino da transição). */
  requested(channel: AftersChannelId): number {
    return effectiveIntensity(this.body, channel);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const avatar of this.avatars) avatar.setMorph(0, 0);
    this.avatars.length = 0;
  }
}
