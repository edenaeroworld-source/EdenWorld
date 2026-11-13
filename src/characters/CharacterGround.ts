/**
 * O chão, para quem não é o jogador.
 *
 * Havia duas ideias de "chão" no EdenWorld, e elas discordavam.
 *
 * O jogador perguntava à física: `PhysicsWorld.groundAt`, que conhece
 * o relevo **e** os colisores caminháveis — o estrado da Praça
 * Central, o tablado do Palco Aurora, o arco das pontes de Rosas, os
 * decks dos mirantes. Os habitantes e o panteão perguntavam ao
 * relevo puro, `HeightField.getHeight`, que não sabe que existe uma
 * ponte ali em cima.
 *
 * O resultado era mensurável: em Aurora, 37 dos 348 nós da rede de
 * caminhada ficam acima do terreno, até **0,66 m**; Aérion afundava
 * 0,21 m no piso da praça e Lilly 0,90 m no palco — metade do corpo.
 * Em Rosas Park, as pontes passam **0,88 m** acima do terreno, e
 * quem as atravessava ia com a cintura dentro do tabuleiro.
 *
 * Esta classe existe para que só haja uma resposta. Ela é a mesma
 * consulta que o jogador faz, embrulhada para quem não tem um
 * `PlayerMotor`: onde é o chão aqui, e o que me empurra se eu insistir
 * em passar.
 *
 * Não há um sistema para Aurora e outro para Rosas. É uma consulta à
 * física da região montada, seja ela qual for.
 */

import type { GroundInfo, PhysicsWorld } from '../physics/PhysicsWorld';
import type { MutablePoint } from '../physics/Collision';

/** Altura de degrau que um personagem comum sobe sem pular. */
export const CHARACTER_STEP = 0.42;
/** Raio do corpo no plano, em metros. */
export const CHARACTER_RADIUS = 0.32;
/** Altura do corpo, em metros. */
export const CHARACTER_HEIGHT = 1.7;

export interface CharacterGroundOptions {
  physics: PhysicsWorld;
  /**
   * Altura do relevo, para quando não houver física montada (testes de
   * unidade da simulação pura, por exemplo).
   */
  terrain?: (x: number, z: number) => number;
  radius?: number;
  height?: number;
  stepHeight?: number;
}

export class CharacterGround {
  readonly radius: number;
  readonly height: number;
  readonly stepHeight: number;

  private readonly physics: PhysicsWorld;
  private readonly terrain: ((x: number, z: number) => number) | null;
  /** Reaproveitado a cada consulta: isto roda para dezenas de pessoas por quadro. */
  private readonly info: GroundInfo = { height: 0, surface: 'grass', onPlatform: false };
  private readonly point: MutablePoint = { x: 0, z: 0 };

  constructor(options: CharacterGroundOptions) {
    this.physics = options.physics;
    this.terrain = options.terrain ?? null;
    this.radius = options.radius ?? CHARACTER_RADIUS;
    this.height = options.height ?? CHARACTER_HEIGHT;
    this.stepHeight = options.stepHeight ?? CHARACTER_STEP;
  }

  /**
   * Altura do chão sob um ponto — a mesma que o jogador pisaria.
   *
   * @param feetY altura atual dos pés. É ela que decide se uma
   *   plataforma conta: um tabuleiro de ponte a 0,9 m do chão não é
   *   piso para quem está embaixo dele, e é para quem já subiu a
   *   rampa. Sem este parâmetro, um personagem embaixo de uma
   *   passarela seria colado no tabuleiro.
   */
  heightAt(x: number, z: number, feetY?: number): number {
    const base = feetY ?? this.terrainAt(x, z);
    this.physics.groundAt(x, z, base, this.stepHeight, this.info);
    return this.info.height;
  }

  /** Igual a `heightAt`, mas devolve também superfície e se é plataforma. */
  probe(x: number, z: number, feetY?: number): Readonly<GroundInfo> {
    const base = feetY ?? this.terrainAt(x, z);
    return this.physics.groundAt(x, z, base, this.stepHeight, this.info);
  }

  /**
   * Pousa um personagem que acabou de nascer (ou de ser teleportado).
   *
   * Procura a partir de bem acima da cabeça, para encontrar o deck, o
   * tablado ou a ponte em que o ponto está, e não o terreno que passa
   * por baixo deles.
   */
  settle(x: number, z: number): number {
    return this.heightAt(x, z, this.terrainAt(x, z) + this.height);
  }

  /**
   * Tira o personagem de dentro de qualquer coisa sólida.
   *
   * É literalmente a mesma rotina que segura o jogador
   * (`PhysicsWorld.resolveCircle`), com o mesmo tratamento de degrau e
   * de obstáculo acima da cabeça. Um habitante que esbarra num banco
   * desliza ao longo dele, como o jogador faria.
   *
   * @returns `true` se houve empurrão.
   */
  resolve(pos: MutablePoint, feetY: number, radius = this.radius): boolean {
    return this.physics.resolveCircle(pos, radius, feetY, this.height, this.stepHeight);
  }

  /**
   * `true` se um corpo deste tamanho não cabe neste ponto.
   *
   * Pergunta de planejamento, não de reação: é usada para podar a rede
   * de caminhada e para escolher desvios antes de andar.
   */
  blocked(x: number, z: number, feetY?: number, radius = this.radius): boolean {
    const base = feetY ?? this.heightAt(x, z);
    this.point.x = x;
    this.point.z = z;
    this.physics.resolveCircle(this.point, radius, base, this.height, this.stepHeight);
    // Tolerância: `resolveCircle` devolve `true` por encostar de raspão
    // na borda de um colisor caminhável. O que interessa aqui é se o
    // ponto é inviável, e isso se mede pelo tamanho do empurrão.
    return Math.hypot(this.point.x - x, this.point.z - z) > 0.02;
  }

  /**
   * `true` se um corpo que **vem de** (fromX, fromZ) consegue parar em
   * (x, z).
   *
   * A pergunta tem de citar de onde se vem, e é por um motivo medido.
   * `blocked(x, z)` sem altura usa `heightAt(x, z)`, que devolve o
   * **topo** do que estiver ali: em cima do canteiro de 50 cm da Praça
   * Central não há colisão nenhuma, logo o ponto parecia livre. Só que
   * quem chega anda pelo piso da praça, 50 cm abaixo, e 50 cm é mais
   * que o passo de 42 cm — a pessoa bate na parede do canteiro e para.
   *
   * Quatro nós da rede de Aurora caíam exatamente assim, dentro dos
   * canteiros do anel da praça, e quem era mandado para lá ficava
   * empurrando a borda para sempre. Daí a roda de gente em volta da
   * árvore.
   *
   * A altura de quem vem é lida com `settle`, não com `heightAt`: no
   * tabuleiro de uma ponte de Rosas os pés estão no tabuleiro, não no
   * terreno 88 cm abaixo, e perguntar pelo terreno condenaria as
   * pontes inteiras.
   */
  reachableFrom(x: number, z: number, fromX: number, fromZ: number, radius = this.radius): boolean {
    return !this.blocked(x, z, this.settle(fromX, fromZ), radius);
  }

  /**
   * `true` se o trecho reto entre dois pontos encosta em algo sólido.
   *
   * Amostra ao longo do segmento com passo menor que o raio do corpo,
   * senão um poste fino passa entre duas amostras — e foi exatamente
   * assim que os habitantes passaram a atravessar postes e troncos.
   */
  segmentBlocked(ax: number, az: number, bx: number, bz: number, radius = this.radius): boolean {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-4) return this.blocked(ax, az, undefined, radius);
    const steps = Math.max(2, Math.ceil(length / Math.max(0.3, radius)));
    // A altura dos pés acompanha o trecho: numa ponte em arco, o chão
    // do começo não serve para julgar o meio.
    const startY = this.heightAt(ax, az);
    const endY = this.heightAt(bx, bz);
    // Só o miolo, sem as pontas. As pontas são onde o personagem já
    // está (ou aonde já decidiu ir): alguém encostado num banco não
    // está impedido de andar, está encostado num banco. Testá-las
    // declarava bloqueado todo trecho que **começa** perto de algo —
    // e isso apagava 19% da rede de Aurora.
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (this.blocked(x, z, startY + (endY - startY) * t, radius)) return true;
    }
    return false;
  }

  /**
   * `true` quando **não há como passar** de um ponto ao outro.
   *
   * Diferente de `segmentBlocked`, que pergunta se a linha reta está
   * limpa. Uma calçada com um poste no meio tem a reta obstruída e
   * mesmo assim se atravessa: desvia-se do poste. Aqui a pergunta é
   * outra — existe alguma faixa, dentro de um corredor de `halfWidth`
   * metros em volta da reta, por onde um corpo passe?
   *
   * A distinção não é teórica. Apagar toda aresta com a reta suja
   * cortava 16 trechos do anel da Praça Central (por causa dos postes
   * de luz plantados exatamente sobre ele) e os quatro acessos aos
   * pátios dos edifícios, derrubando 19% da rede de Aurora. O anel
   * continua caminhável: é só andar ao lado do poste.
   */
  corridorBlocked(ax: number, az: number, bx: number, bz: number, radius = this.radius, halfWidth = 1.5): boolean {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1e-4) return this.blocked(ax, az, undefined, radius);
    const dirX = (bx - ax) / length;
    const dirZ = (bz - az) / length;
    const steps = Math.max(2, Math.ceil(length / Math.max(0.4, radius * 1.5)));
    const startY = this.heightAt(ax, az);
    const endY = this.heightAt(bx, bz);
    const offsets = [0, radius * 1.6, -radius * 1.6, halfWidth, -halfWidth];
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = startY + (endY - startY) * t;
      let open = false;
      for (const offset of offsets) {
        if (Math.abs(offset) > halfWidth) continue;
        if (!this.blocked(x - dirZ * offset, z + dirX * offset, y, radius)) {
          open = true;
          break;
        }
      }
      if (!open) return true;
    }
    return false;
  }

  private terrainAt(x: number, z: number): number {
    return this.terrain ? this.terrain(x, z) : 0;
  }
}
