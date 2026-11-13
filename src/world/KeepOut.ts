/**
 * Áreas proibidas de uma região.
 *
 * Há construções que são para olhar, não para entrar. O Coração do
 * Roseiral, no meio de Rosas Park, é uma delas: um mirante de vidro
 * sob uma pérgula de arcos, com luz própria, que serve de ponto de
 * referência do parque inteiro. Ele nunca teve barreira — o piso era
 * um colisor **caminhável**, e o ponto oficial do Roseiral Maior cai
 * no seu centro exato, (0, −24). Quem o sistema mandasse para lá
 * aparecia dentro dele.
 *
 * Esse foi o bug: primeiro Saturno, depois — quando a distribuição do
 * panteão mudou — Suki-Chan, exatamente no mesmo ponto. Trocar quem
 * recebe o lugar só passa o problema para o próximo da fila. O que
 * faltava era o conceito: **uma área que ninguém ocupa**.
 *
 * É o que este módulo é. Uma zona proibida é declarada uma vez, na
 * planta da região, e passa a valer em quatro lugares de uma só vez:
 *
 *  1. **Física** — vira um colisor sólido, alto e invisível.
 *  2. **Navegação** — a rede de caminhada não põe ponto de passagem
 *     dentro dela, e nenhuma aresta a atravessa.
 *  3. **Posicionamento** — quem for mandado para dentro é empurrado
 *     para a borda de fora antes de pousar.
 *  4. **Conferência** — a validação da viagem reprova qualquer
 *     personagem encontrado lá dentro.
 *
 * Nenhuma das quatro cita um personagem pelo nome, e é de propósito:
 * a regra vale para o jogador, para os habitantes, para o panteão
 * inteiro e para quem for criado depois.
 *
 * Módulo puro: só números e funções. Sem Three.js, sem DOM.
 */

import { ROSE_GARDEN } from '../cities/rosas-park/RosasLayout';

/** Uma área circular em que nenhum personagem pode estar. */
export interface KeepOutZone {
  id: string;
  /** Nome legível — é o que aparece na reprovação da conferência. */
  name: string;
  x: number;
  z: number;
  /** Raio da estrutura, em metros. */
  radius: number;
  /**
   * Altura da barreira acima do chão, em metros.
   *
   * O pulo do jogador sobe 1,44 m (`v²/2g`, com `jumpSpeed 8.3` e
   * `gravity 24`). Qualquer valor bem acima disso fecha o acesso por
   * cima; o padrão é folgado de propósito.
   */
  height: number;
}

/** Altura padrão da barreira: muito acima do ápice de qualquer pulo. */
export const KEEP_OUT_HEIGHT = 6;

/**
 * Folga mínima entre a borda da estrutura e quem é empurrado para
 * fora dela.
 *
 * Tem de ser maior que o raio do corpo (0,34 m), senão o personagem
 * encosta na barreira e a física o empurra de novo no quadro
 * seguinte — um tremor permanente em vez de uma posição estável.
 */
export const KEEP_OUT_CLEARANCE = 1.2;

/**
 * A zona que contém este ponto, ou `null`.
 *
 * @param margin folga somada ao raio. Positiva para perguntar "está
 *   dentro ou perto demais"; zero para o contorno exato.
 */
export function insideKeepOut(
  zones: readonly KeepOutZone[],
  x: number,
  z: number,
  margin = 0,
): KeepOutZone | null {
  for (const zone of zones) {
    if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + margin) return zone;
  }
  return null;
}

/**
 * Leva um ponto para fora de toda zona proibida.
 *
 * O empurrão é radial, a partir do centro da estrutura: quem estava
 * dentro sai pelo lado mais próximo, que é também o lado por onde
 * teria entrado. Um ponto já livre volta inalterado — a função é
 * segura de chamar em qualquer lugar, inclusive no caminho quente.
 *
 * Duas zonas podem se tocar, então o empurrão é repetido: sair de uma
 * pode cair na outra. O limite de voltas evita um laço infinito caso
 * alguém declare zonas que se cercam mutuamente.
 *
 * Caso de borda que importa: um personagem **no centro exato** não tem
 * direção radial. Suki-Chan estava assim, em (0,000; −24,000). Sem um
 * rumo escolhido à mão, a conta daria `0/0`. O rumo fixo (+X) mantém o
 * resultado estável: a mesma entrada dá sempre a mesma saída, e a
 * região monta igual todas as vezes.
 */
export function pushOutOfKeepOut(
  zones: readonly KeepOutZone[],
  x: number,
  z: number,
  clearance = KEEP_OUT_CLEARANCE,
): { x: number; z: number; zone: KeepOutZone | null } {
  let px = x;
  let pz = z;
  let first: KeepOutZone | null = null;

  for (let round = 0; round < 4; round += 1) {
    const zone = insideKeepOut(zones, px, pz, clearance);
    if (!zone) break;
    first ??= zone;
    let dx = px - zone.x;
    let dz = pz - zone.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 1e-6) {
      dx = 1;
      dz = 0;
      distance = 1;
    }
    const target = zone.radius + clearance;
    px = zone.x + (dx / distance) * target;
    pz = zone.z + (dz / distance) * target;
  }

  return { x: px, z: pz, zone: first };
}

/**
 * `true` se o trecho reto entre dois pontos atravessa alguma zona.
 *
 * Usada pela rede de caminhada: um ponto de cada lado da estrutura
 * pode estar livre e ainda assim a linha entre eles passar por dentro.
 * Mede-se a distância do centro da zona ao segmento, que é a conta
 * exata — amostrar ao longo da reta deixaria passar uma zona estreita
 * entre duas amostras.
 */
export function crossesKeepOut(
  zones: readonly KeepOutZone[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  margin = 0,
): KeepOutZone | null {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  for (const zone of zones) {
    let t = lengthSquared < 1e-9 ? 0 : ((zone.x - ax) * dx + (zone.z - az) * dz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t;
    const cz = az + dz * t;
    if (Math.hypot(zone.x - cx, zone.z - cz) < zone.radius + margin) return zone;
  }
  return null;
}

/* ===================================================================== */
/* Registro por região                                                    */
/* ===================================================================== */

/**
 * As zonas proibidas de cada região.
 *
 * Mesma forma que `regionAreas` tem no `NpcSystem`: uma função só,
 * consultada por quem precisa, em vez de a lista ser passada de mão em
 * mão pelo motor. Região sem zona declarada devolve a lista vazia e
 * todo o mecanismo vira um `for` que não roda — custo zero para quem
 * não tem nada a proteger.
 *
 * Para proteger uma estrutura nova: declare-a na planta da região e
 * acrescente-a aqui. Física, navegação, posicionamento e conferência
 * passam a respeitá-la sem mais nenhuma linha de código.
 */
export function keepOutsFor(regionId: string): readonly KeepOutZone[] {
  return KEEP_OUTS[regionId] ?? EMPTY;
}

const EMPTY: readonly KeepOutZone[] = Object.freeze([]);

/**
 * Rosas Park: o Coração do Roseiral.
 *
 * Centro e raio vêm do `ROSE_GARDEN`, não de números copiados: a
 * barreira tem exatamente a forma e o tamanho da estrutura que
 * protege, e acompanha qualquer mudança na planta do parque.
 */
const ROSAS_KEEP_OUTS: readonly KeepOutZone[] = Object.freeze([
  Object.freeze({
    id: 'coracao-roseiral',
    name: 'Coração do Roseiral',
    x: ROSE_GARDEN.x,
    z: ROSE_GARDEN.z,
    radius: ROSE_GARDEN.coreRadius,
    height: KEEP_OUT_HEIGHT,
  }),
]);

const KEEP_OUTS: Readonly<Record<string, readonly KeepOutZone[]>> = Object.freeze({
  'rosas-park': ROSAS_KEEP_OUTS,
});
