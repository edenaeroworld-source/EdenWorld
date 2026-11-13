/**
 * A vida de um habitante fora e dentro da conversa.
 *
 * Esta classe é a **intenção**: que expressão a pessoa tem agora, para
 * onde ela olha, que gesto ela quer fazer, se está falando. Quem desenha
 * (o `NpcSystem`) lê essa intenção a cada quadro e a aplica no avatar.
 *
 * A separação existe porque os avatares são de um conjunto reutilizável:
 * o mesmo avatar serve a vários habitantes ao longo do passeio. Se o
 * estado morasse no avatar, a pessoa esqueceria quem é ao sair de vista
 * — e herdaria o humor de outra ao voltar. Aqui o estado mora na pessoa.
 *
 * Módulo puro: sem DOM, sem Three.js.
 */

import type { Persona } from '../characters/Personas';
import { DEFAULT_PERSONA } from '../characters/Personas';
import type { Expression } from '../player/Expressions';
import type { GestureId } from '../player/Gestures';
import { createRng, type Rng } from '../utils/math';
import type { DayPeriod } from '../world/WorldClock';

/** Distância (m) a partir da qual o habitante percebe o jogador. */
export const NOTICE_RANGE = 9;
/** Distância (m) em que ele cumprimenta quem chega. */
export const GREET_RANGE = 5.5;
/** Intervalo mínimo (s) entre dois cumprimentos à mesma pessoa. */
export const GREET_COOLDOWN = 26;
/** Duração (s) de um bate-papo entre dois habitantes. */
export const CHAT_TIME = 7;

export interface LifeContext {
  /** Posição do jogador no mundo. */
  playerX: number;
  playerZ: number;
  /** Distância do jogador (m). */
  distance: number;
  /** Período do dia — de madrugada ninguém faz escândalo. */
  period: DayPeriod | null;
  /** `false` quando o habitante está longe demais para alguém ver. */
  visible: boolean;
}

/** Para onde a pessoa olha. */
export interface LookTarget {
  x: number;
  z: number;
}

export class NpcLife {
  readonly persona: Persona;

  /** Expressão desejada agora. */
  private mood: Expression;
  /** Gesto pedido e ainda não entregue ao avatar. */
  private pending: GestureId | null = null;
  private pendingStrength = 1;
  /** Ponto que a pessoa está olhando (nulo = olhar solto). */
  private look: LookTarget | null = null;
  private lookTimer = 0;
  private talkLevel = 0;
  private greetTimer = 0;
  private idleTimer: number;
  private chatTimer = 0;
  private conversing = false;
  private readonly rng: Rng;

  /**
   * @param persona jeito da pessoa (gestos, expressões, energia).
   * @param seed desencontra os relógios: ninguém gesticula em coro.
   */
  constructor(persona: Persona = DEFAULT_PERSONA, seed = 1) {
    this.persona = persona;
    this.mood = persona.rest;
    this.rng = createRng(Math.floor(Math.abs(seed)) * 7919 + 13);
    // O primeiro gesto de ócio cai em um instante qualquer da janela.
    this.idleTimer = persona.idleEvery * (0.3 + this.rng() * 1.2);
  }

  /* --------------------------- Leitura ---------------------------- */

  get expression(): Expression {
    return this.mood;
  }

  get talking(): number {
    return this.talkLevel;
  }

  get lookTarget(): LookTarget | null {
    return this.look;
  }

  /** `true` enquanto a pessoa está em conversa com o jogador. */
  get inConversation(): boolean {
    return this.conversing;
  }

  /** `true` durante um bate-papo com outro habitante. */
  get chatting(): boolean {
    return this.chatTimer > 0;
  }

  /**
   * Retira o gesto pendente (o avatar o executa).
   * Devolve `null` quando não há nada a fazer.
   */
  takeGesture(): { id: GestureId; strength: number } | null {
    if (!this.pending) return null;
    const gesture = { id: this.pending, strength: this.pendingStrength };
    this.pending = null;
    return gesture;
  }

  /* --------------------------- Comandos --------------------------- */

  /** Pede um gesto. Um pedido novo substitui o anterior não entregue. */
  request(id: GestureId, strength = 1): void {
    this.pending = id;
    this.pendingStrength = strength;
  }

  setExpression(expression: Expression): void {
    this.mood = expression;
  }

  /** Volta ao rosto de descanso do personagem. */
  restExpression(): void {
    this.mood = this.persona.rest;
  }

  setTalking(level: number): void {
    this.talkLevel = level < 0 ? 0 : level > 1 ? 1 : level;
  }

  lookAt(x: number, z: number, seconds = 4): void {
    this.look = { x, z };
    this.lookTimer = seconds;
  }

  clearLook(): void {
    this.look = null;
    this.lookTimer = 0;
  }

  /** Sorteia um gesto da lista do perfil. */
  pickFrom(list: readonly GestureId[]): GestureId | null {
    if (list.length === 0) return null;
    return list[Math.min(list.length - 1, Math.floor(this.rng() * list.length))];
  }

  /* ------------------------- Conversa ----------------------------- */

  /**
   * O jogador puxou conversa: a pessoa vira, cumprimenta e fica atenta.
   * O olhar não tem prazo enquanto a conversa durar.
   */
  beginConversation(x: number, z: number): void {
    this.conversing = true;
    this.chatTimer = 0;
    this.lookAt(x, z, Number.POSITIVE_INFINITY);
    this.mood = this.persona.greetMood;
    const greet = this.pickFrom(this.persona.greet);
    if (greet) this.request(greet, this.persona.energy);
    this.greetTimer = GREET_COOLDOWN;
  }

  /**
   * Uma fala começou.
   *
   * @param mood expressão pedida pelo nó do diálogo (ou a do perfil).
   * @param gesture gesto pedido pelo nó (ou um sorteado para pontuar).
   */
  speak(mood?: Expression, gesture?: GestureId): void {
    this.mood = mood ?? this.persona.rest;
    this.talkLevel = 1;
    const pick = gesture ?? (this.rng() < this.persona.energy * 0.7 ? this.pickFrom(this.persona.talk) : null);
    if (pick) this.request(pick, this.persona.energy);
  }

  /** A fala terminou de aparecer na tela: a boca para, o rosto fica. */
  stopSpeaking(): void {
    this.talkLevel = 0;
  }

  /**
   * Fim da conversa — por escolha ou por interrupção.
   * A pessoa se despede e volta ao que estava fazendo.
   */
  endConversation(farewell = true): void {
    if (!this.conversing) return;
    this.conversing = false;
    this.talkLevel = 0;
    this.mood = this.persona.rest;
    if (farewell) this.request(this.persona.farewell, this.persona.energy);
    this.lookTimer = 2.5;
  }

  /** Bate-papo entre dois habitantes: olham um para o outro e gesticulam. */
  startChat(x: number, z: number, seconds = CHAT_TIME): void {
    if (this.conversing) return;
    this.chatTimer = seconds;
    this.lookAt(x, z, seconds);
    this.mood = this.persona.greetMood;
    const gesture = this.pickFrom(this.persona.talk);
    if (gesture) this.request(gesture, this.persona.energy * 0.8);
  }

  /**
   * Responde a um aceno do jogador.
   *
   * Respeita o intervalo de cumprimento: quem acabou de cumprimentar
   * apenas olha, sem acenar de novo. É o que impede a praça inteira de
   * virar um coral de acenos.
   */
  greetBack(x: number, z: number): boolean {
    if (this.conversing) return false;
    this.lookAt(x, z, 3);
    if (this.greetTimer > 0) return false;
    this.greetTimer = GREET_COOLDOWN;
    this.mood = this.persona.greetMood;
    const greet = this.pickFrom(this.persona.greet);
    if (greet) this.request(greet, this.persona.energy);
    return true;
  }

  /* ---------------------------- Vida ------------------------------ */

  /**
   * Um passo de vida.
   *
   * Fora da conversa decide sozinho: reparar em quem chega, cumprimentar,
   * fazer um gesto de ócio, soltar o olhar. Durante a conversa não decide
   * nada — quem manda é o diálogo.
   */
  update(dt: number, context: LifeContext): void {
    if (dt <= 0) return;
    this.greetTimer = Math.max(0, this.greetTimer - dt);

    if (this.conversing) {
      // A conversa manda: nada de gesto espontâneo no meio da fala.
      return;
    }

    if (this.chatTimer > 0) {
      this.chatTimer -= dt;
      this.talkLevel = this.chatTimer > 0 ? 0.75 : 0;
      if (this.chatTimer <= 0) {
        this.mood = this.persona.rest;
        this.clearLook();
      }
      return;
    }

    if (this.lookTimer !== Number.POSITIVE_INFINITY) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) this.look = null;
    }

    // Longe de qualquer olho: só os relógios correm, nada é decidido.
    if (!context.visible) {
      this.idleTimer = Math.max(0, this.idleTimer - dt);
      return;
    }

    // Reparar em quem chega perto: a cabeça acompanha o jogador.
    if (context.distance <= NOTICE_RANGE) this.lookAt(context.playerX, context.playerZ, 1.5);

    // Cumprimentar: só uma vez por aproximação, e nunca de madrugada.
    const quiet = context.period === 'madrugada';
    if (context.distance <= GREET_RANGE && this.greetTimer <= 0 && !quiet) {
      this.greetTimer = GREET_COOLDOWN;
      this.mood = this.persona.greetMood;
      const greet = this.pickFrom(this.persona.greet);
      if (greet) this.request(greet, this.persona.energy);
      return;
    }

    // Gesto de ócio: cada pessoa no seu tempo, mais raro de madrugada.
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      const every = this.persona.idleEvery * (quiet ? 2.2 : 1);
      this.idleTimer = every * (0.6 + this.rng() * 0.9);
      if (this.rng() < this.persona.energy) {
        const idle = this.pickFrom(this.persona.idle);
        if (idle) this.request(idle, this.persona.energy * 0.7);
      }
      if (this.mood !== this.persona.rest && this.rng() < 0.5) this.mood = this.persona.rest;
    }
  }
}
