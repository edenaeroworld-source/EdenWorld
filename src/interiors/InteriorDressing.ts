/**
 * O mínimo que faz um cômodo parecer um cômodo.
 *
 * Um ambiente sem acabamento próprio (`fitouts/`) subia com a casca
 * completa e um móvel por `prop` declarado. Num salão de 20 × 16 m com
 * dois props, isso é um galpão com duas coisas dentro — a porta não
 * mentia, mas quase.
 *
 * Esta camada passa depois da casca e antes da mobília declarada, e
 * veste **cada cômodo** com um punhado de peças: tapete no meio, vaso
 * e abajur nos cantos, quadro na parede mais comprida, e uma peça
 * assinatura conforme a serventia do cômodo.
 *
 * **Tudo encostado nas bordas.** O miolo do cômodo fica livre, exceto
 * pelo tapete, que é raso e não tem colisor. É de propósito: a
 * circulação é o que o teste de jogabilidade mede, e decoração que
 * tranca passagem é pior que decoração nenhuma. Os cantos também são
 * onde as portas nunca estão — elas ficam no meio das paredes.
 */

import type { InteriorRoom } from './Interior';
import * as f from './InteriorFurniture';
import type { InteriorBuild } from './InteriorKit';

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const NORTH = Math.PI;
const SOUTH = 0;

/** Distância das peças até a parede, em metros. */
const MARGIN = 0.9;

/**
 * Veste um cômodo sem acabamento próprio.
 *
 * @param occupied Pontos já ocupados pelos móveis declarados do
 *   ambiente (coordenadas locais). Nada é posto a menos de 1,6 m
 *   deles, para a decoração não nascer dentro da cama.
 */
export function dressRoom(b: InteriorBuild, room: InteriorRoom, occupied: readonly { x: number; z: number }[] = []): void {
  // Cômodo apertado (corredor, banheiro) não leva nada: ali o que
  // falta é espaço, não enfeite.
  if (room.w < 3.2 || room.d < 3.2) return;

  const x0 = room.x + MARGIN;
  const x1 = room.x + room.w - MARGIN;
  const z0 = room.z + MARGIN;
  const z1 = room.z + room.d - MARGIN;
  const cx = room.x + room.w / 2;
  const cz = room.z + room.d / 2;
  const kind = room.kind ?? 'sala';

  const free = (x: number, z: number): boolean => occupied.every((spot) => Math.hypot(spot.x - x, spot.z - z) > 1.6);
  /** Executa `place` apenas se o ponto estiver livre. */
  const put = (x: number, z: number, place: (x: number, z: number) => void): void => {
    if (free(x, z)) place(x, z);
  };

  // Tapete central: raso, sem colisor, e é o que mais muda a cara de
  // um cômodo vazio por metro quadrado gasto.
  if (room.w >= 4.5 && room.d >= 4.5 && kind !== 'estufa' && kind !== 'varanda') {
    f.rug(b, cx, cz, 0, Math.min(4.2, room.w * 0.45), Math.min(3.0, room.d * 0.45));
  }

  // Verde e luz, em cantos opostos.
  put(x0, z0, (x, z) => f.planter(b, x, z, SOUTH, 1));
  put(x1, z1, (x, z) => f.floorLamp(b, x, z, NORTH));

  // Quadro na parede mais comprida, à altura dos olhos.
  if (room.w >= room.d) f.wallArt(b, cx, room.z + 0.25, SOUTH, 1.2, 0.85);
  else f.wallArt(b, room.x + 0.25, cz, EAST, 1.2, 0.85);

  // Peça assinatura: o que aquele cômodo teria de ter.
  switch (kind) {
    case 'cozinha':
      put(cx, z0, (x, z) => f.kitchenRun(b, x, z, SOUTH, Math.min(4.4, room.w - 2), { sink: 1.4 }));
      break;
    case 'quarto':
      put(x1, z0, (x, z) => f.wardrobe(b, x, z, SOUTH, 1.6));
      break;
    case 'banheiro':
      put(x0, z1, (x, z) => f.bathSink(b, x, z, NORTH));
      break;
    case 'loja':
    case 'deposito':
      put(x0, cz, (x, z) => f.aisleShelf(b, x, z, EAST, Math.min(5.0, room.d - 2), 1.8));
      break;
    case 'recepcao':
      put(x1, cz, (x, z) => f.waitingBench(b, x, z, WEST, Math.min(3.0, room.d - 2)));
      break;
    case 'escritorio':
      put(x1, z0, (x, z) => f.bookshelf(b, x, z, SOUTH, 1.8));
      break;
    case 'oficina':
      put(x0, cz, (x, z) => f.wallShelf(b, x, z, EAST, Math.min(3.6, room.d - 2), 3));
      break;
    case 'estufa':
      // Estufa é canteiro: bancadas rentes às paredes, verde no resto.
      put(x0, cz, (x, z) => f.plantBox(b, x, z, EAST, Math.min(5.0, room.d - 2)));
      put(x1, cz, (x, z) => f.plantBox(b, x, z, WEST, Math.min(5.0, room.d - 2)));
      put(cx, z1, (x, z) => f.planter(b, x, z, NORTH, 1.3));
      break;
    case 'varanda':
      put(x0, cz, (x, z) => f.planter(b, x, z, EAST, 0.9));
      put(x1, cz, (x, z) => f.chair(b, x, z, WEST));
      break;
    case 'corredor':
      break;
    default:
      // Sala, e tudo que não se declarou: um canto de sentar.
      if (room.w >= 6 && room.d >= 5) {
        put(x1, z0, (x, z) => f.armchair(b, x, z, NORTH));
        put(x0, z1, (x, z) => f.bookshelf(b, x, z, EAST, 1.7));
      } else {
        put(x1, z0, (x, z) => f.armchair(b, x, z, NORTH));
      }
      break;
  }

  // Cômodo grande ganha um segundo ponto de luz, senão o fundo fica
  // escuro — e escuro parece vazio.
  if (room.w * room.d >= 90) b.light(cx, 2.7, cz, 0xffeccd, 5.5, Math.max(room.w, room.d));
}
