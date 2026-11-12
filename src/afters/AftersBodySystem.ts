/**
 * Sistema de transformação de silhueta dos Afters®.
 *
 * Um sistema, dois tipos de cliente:
 *
 * - **o jogador**, sempre presente, atualizado todo quadro;
 * - **os habitantes de Aurora City**, dezenas deles, atualizados em
 *   frequência reduzida enquanto ninguém os vê.
 *
 * Os dois usam a mesma classe (`AftersActor`), a mesma animação e os mesmos
 * limites de 0% a 250%. Escrever a silhueta custa dois `float` por avatar:
 * não reconstrói geometria, não troca material e não interrompe o movimento.
 */

import type { GameSystem } from '../core/GameSystem';
import type { Avatar } from '../player/Avatar';
import { AftersActor, type AftersActorCallbacks, type AftersActorStatus } from './AftersActor';
import type { AfterBustController, AfterCurveController } from './AftersChannel';
import { type AftersActorNetState, sampleNetState, toActorNetState } from './AftersNet';
import { type AftersBody, type AftersChannelId, type AftersPreset, defaultAftersBody, isNeutral, sanitizeAftersBody } from './AftersState';

export type AftersBodyCallbacks = AftersActorCallbacks;
export type AftersBodyStatus = AftersActorStatus;

/** Quantos atores adormecidos são acordados por fatia de atualização. */
const SLEEPER_SLICE = 8;
/** Intervalo (s) entre fatias de atualização dos atores sem avatar. */
const SLEEPER_INTERVAL = 0.25;

export class AftersBodySystem implements GameSystem {
  readonly id = 'afters-body';
  /** O ator do jogador: o mesmo tipo usado por qualquer habitante. */
  readonly player: AftersActor;

  private readonly actors = new Map<string, AftersActor>();
  private order: AftersActor[] = [];
  private cursor = 0;
  private sleeperClock = 0;
  private disposed = false;

  constructor(callbacks: AftersBodyCallbacks = {}) {
    this.player = new AftersActor('jogador', callbacks);
  }

  /* -------------------------- Jogador (fachada) ------------------------- */
  /* A interface do EdenPhone e o Engine continuam falando com o sistema.  */

  get bust(): AfterBustController {
    return this.player.bust;
  }

  get curve(): AfterCurveController {
    return this.player.curve;
  }

  get current(): AftersBody {
    return this.player.current;
  }

  get status(): AftersBodyStatus {
    return this.player.status;
  }

  setAvatars(avatars: readonly Avatar[]): void {
    this.player.setAvatars(avatars);
  }

  addAvatar(avatar: Avatar): void {
    this.player.addAvatar(avatar);
  }

  removeAvatar(avatar: Avatar): void {
    this.player.removeAvatar(avatar);
  }

  setBody(body: AftersBody, animate = true): void {
    this.player.setBody(body, animate);
  }

  setIntensity(channel: AftersChannelId, value: number): void {
    this.player.setIntensity(channel, value);
  }

  setActive(channel: AftersChannelId, active: boolean): void {
    this.player.setActive(channel, active);
  }

  setCombined(active: boolean): void {
    this.player.setCombined(active);
  }

  setDuration(seconds: number): void {
    this.player.setDuration(seconds);
  }

  applyPreset(preset: AftersPreset): void {
    this.player.applyPreset(preset);
  }

  turnOff(): void {
    this.player.turnOff();
  }

  reset(channel: AftersChannelId): void {
    this.player.reset(channel);
  }

  resetAll(): void {
    this.player.resetAll();
  }

  effective(channel: AftersChannelId): number {
    return this.player.effective(channel);
  }

  requested(channel: AftersChannelId): number {
    return this.player.requested(channel);
  }

  /* --------------------------- População da cidade ---------------------- */

  /**
   * Cria (ou devolve) o ator de um habitante.
   *
   * O id é o do cidadão ou do personagem do panteão. Chamar duas vezes com o
   * mesmo id devolve o mesmo ator — nada é duplicado quando um habitante sai
   * e volta ao campo de visão.
   */
  actor(id: string, body?: AftersBody): AftersActor {
    let actor = this.actors.get(id);
    if (!actor) {
      actor = new AftersActor(id);
      this.actors.set(id, actor);
      this.order.push(actor);
      actor.setBody(body ?? defaultAftersBody(), false);
    } else if (body) {
      actor.setBody(body, false);
    }
    return actor;
  }

  hasActor(id: string): boolean {
    return this.actors.has(id);
  }

  findActor(id: string): AftersActor | undefined {
    return this.actors.get(id);
  }

  get actorCount(): number {
    return this.actors.size;
  }

  /** Atores de habitante com alguma transformação ligada. */
  get activeActorCount(): number {
    let total = 0;
    for (const actor of this.actors.values()) if (!isNeutral(actor.current)) total += 1;
    return total;
  }

  /**
   * Liga um avatar a um habitante.
   *
   * O avatar vem de um conjunto reutilizável: ele pode ter acabado de servir
   * a outra pessoa. Por isso a silhueta é acertada **de uma vez** (`snap`),
   * e não animada — ninguém deve ver um habitante inflando ao surgir na rua.
   */
  bindAvatar(id: string, avatar: Avatar, body?: AftersBody): AftersActor {
    const actor = this.actor(id, body);
    actor.setAvatars([avatar]);
    actor.visible = true;
    actor.snap();
    return actor;
  }

  /** Solta o avatar de um habitante que saiu de vista (o ator continua). */
  unbindAvatar(id: string): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.release();
    actor.visible = false;
  }

  /** Remove o ator por completo (habitante descartado). */
  removeActor(id: string): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.release();
    this.actors.delete(id);
    this.order = this.order.filter((candidate) => candidate !== actor);
  }

  /** Estado de todos os habitantes com transformação, para salvar/depurar. */
  snapshotActors(): Record<string, AftersBody> {
    const out: Record<string, AftersBody> = {};
    for (const [id, actor] of this.actors) {
      const body = actor.current;
      if (!isNeutral(body)) out[id] = body;
    }
    return out;
  }

  /** Recarrega estados de habitantes vindos do salvamento. */
  restoreActors(states: Record<string, AftersBody> | undefined | null): void {
    if (!states) return;
    for (const [id, raw] of Object.entries(states)) {
      this.actor(id).setBody(sanitizeAftersBody(raw), false);
    }
  }

  /* ------------------------------ Rede ---------------------------------- */

  /**
   * Instantâneos dos habitantes para enviar a outros jogadores.
   *
   * Só vão os que não estão com a silhueta original: a cidade é gerada da
   * mesma semente em todas as máquinas, então o padrão não precisa viajar.
   */
  netStates(ids?: readonly string[], now = Date.now()): AftersActorNetState[] {
    const out: AftersActorNetState[] = [];
    const source = ids ?? [...this.actors.keys()];
    for (const id of source) {
      const actor = this.actors.get(id);
      if (!actor || isNeutral(actor.current)) continue;
      out.push(toActorNetState(id, actor.current, { fromBust: actor.effective('bust'), fromCurve: actor.effective('curve'), now }));
    }
    return out;
  }

  /**
   * Aplica instantâneos recebidos de outro cliente.
   *
   * O ponto da transição é reconstruído localmente (`sampleNetState`), de
   * modo que quem entra no meio de uma transformação vê o habitante no mesmo
   * estágio que os demais — e o mesmo habitante não fica diferente para cada
   * jogador. Habitantes ausentes do pacote voltam à configuração local.
   */
  applyNetStates(states: readonly AftersActorNetState[], now = Date.now()): void {
    for (const state of states) {
      const actor = this.actor(state.id);
      const sample = sampleNetState(state, now);
      actor.setBody(
        {
          bust: state.bust,
          curve: state.curve,
          bustActive: state.bust > 0,
          curveActive: state.curve > 0,
          duration: state.duration,
          preset: null,
        },
        false,
      );
      // Sem avatar à vista não há o que mostrar; com avatar, entra no mesmo
      // ponto da transição que o remetente já está mostrando.
      actor.seek(sample.bust, sample.curve);
    }
  }

  /* ------------------------------ Atualização --------------------------- */

  update(dt: number): void {
    if (this.disposed) return;
    this.player.update(dt);

    // Quem está à vista acompanha o quadro.
    for (const actor of this.order) if (actor.visible) actor.update(dt);

    // Quem não está é atualizado em fatias, com o tempo acumulado: sem
    // avatar ligado não há nada para mostrar, basta manter o estado
    // coerente para que ele chegue certo quando o habitante aparecer.
    this.sleeperClock += dt;
    if (this.sleeperClock < SLEEPER_INTERVAL) return;
    const sleeperDt = this.sleeperClock;
    this.sleeperClock = 0;

    const total = this.order.length;
    if (total === 0) return;
    const slice = Math.min(SLEEPER_SLICE, total);
    for (let i = 0; i < slice; i += 1) {
      const actor = this.order[(this.cursor + i) % total];
      if (!actor.visible) actor.update(sleeperDt);
    }
    this.cursor = (this.cursor + slice) % total;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.player.release();
    for (const actor of this.actors.values()) actor.release();
    this.actors.clear();
    this.order.length = 0;
  }
}
