/**
 * Apartamento 12 — Aurora City.
 *
 * O jogador podia comprar este apartamento desde o marco do universo
 * vivo (4800 cristais, em `Housing`) e nunca entrar nele: não havia
 * interior nenhum ligado à propriedade. Agora há.
 *
 * Cinco ambientes de verdade — sala, cozinha, quarto, banheiro e
 * varanda —, ligados por um corredor, com janelas em todas as paredes
 * externas. É pequeno de propósito: é o primeiro imóvel de alguém.
 */

import * as THREE from 'three';
import * as f from '../InteriorFurniture';
import type { FitoutContext } from './index';

export function apartamentoAurora(ctx: FitoutContext): void {
  const { b } = ctx;
  const EAST = Math.PI / 2;
  const WEST = -Math.PI / 2;
  const NORTH = Math.PI;
  const SOUTH = 0;

  /* ------------------------------ sala ------------------------------- */
  // Estar voltado para dentro: o sofá olha a televisão, a televisão
  // encosta na divisória da cozinha, e a janela fica às costas de quem
  // senta — luz no livro, sem reflexo na tela.
  f.rug(b, 6.1, 3.5, 0, 3.4, 2.6);
  f.sofa(b, 4.5, 3.5, EAST, 2.3);
  f.television(b, 8.35, 3.5, WEST, 1.7);
  f.coffeeTable(b, 6.3, 3.5, EAST);
  f.armchair(b, 6.4, 1.3, SOUTH);
  f.bookshelf(b, 0.45, 5.3, EAST, 1.9);
  f.floorLamp(b, 0.7, 1.0, SOUTH);
  f.planter(b, 8.2, 6.6, NORTH, 1.1);
  f.wallArt(b, 4.4, 0.25, SOUTH, 1.3, 0.9);
  b.light(4.5, 2.7, 3.5, 0xffe2bd, 7, 11);

  /* ----------------------------- cozinha ------------------------------ */
  // Bancada em L encostada na divisória e na parede norte, deixando a
  // passagem (z = 6,4) livre. Pia sob a janela, como manda o costume.
  f.kitchenRun(b, 9.45, 3.0, EAST, 5.0, { sink: 1.6, stove: 3.4 });
  f.kitchenRun(b, 12.4, 0.42, SOUTH, 4.6, { uppers: false });
  f.fridge(b, 14.45, 6.3, WEST);
  f.diningSet(b, 12.4, 4.9, SOUTH, 2);
  f.pendantLamp(b, 12.4, 4.9, 3.4);
  b.light(12.0, 2.7, 2.4, 0xfff0d2, 5.5, 9);

  /* ---------------------------- corredor ------------------------------ */
  f.wallArt(b, 2.6, 7.62, SOUTH, 0.9, 0.7);
  f.planter(b, 14.4, 8.7, WEST, 0.85);
  b.light(7.5, 2.9, 8.7, 0xffe8cc, 3.4, 8);

  /* ------------------------------ quarto ------------------------------ */
  f.bed(b, 2.6, 12.9, SOUTH, 1.7);
  f.nightstand(b, 1.0, 11.5, SOUTH);
  f.nightstand(b, 4.2, 11.5, SOUTH);
  f.wardrobe(b, 6.5, 11.0, SOUTH, 1.9);
  f.rug(b, 2.6, 15.1, 0, 2.4, 1.5);
  f.planter(b, 7.2, 15.6, NORTH, 0.9);
  b.light(3.2, 2.7, 13.0, 0xffdcae, 5.5, 9);

  /* ----------------------------- banheiro ----------------------------- */
  // O banheiro inteiro é de porcelanato: o acabamento vem do `kind`,
  // então aqui só entram as peças.
  f.toilet(b, 8.6, 15.4, NORTH);
  f.bathSink(b, 9.9, 10.5, SOUTH);
  f.shower(b, 10.6, 14.6, NORTH, 1.6, 1.8);
  b.light(9.8, 2.8, 13.0, 0xdff2ff, 4.2, 7);

  /* ------------------------------ varanda ----------------------------- */
  f.chair(b, 13.2, 13.0, EAST);
  f.chair(b, 13.2, 14.6, EAST);
  b.at(14.1, 13.8, 0).box(0.6, 0.06, 0.6, b.palette.glass, 0, 0.6, 0).cyl(0.05, 0.05, 0.6, 8, b.palette.chrome, 0, 0.3, 0);
  f.plantBox(b, 12.2, 15.9, SOUTH, 2.4);
  f.planter(b, 12.2, 10.7, SOUTH, 1.0);
  b.light(13.3, 2.6, 13.3, 0xfff4de, 3.6, 8);

  // Varal: a coisa mais doméstica que existe, e custa três caixas.
  const line = b.at(13.3, 11.6, 0);
  line.cyl(0.015, 0.015, 3.2, 5, b.palette.chrome, 0, 2.1, 0.9);
  for (let i = 0; i < 3; i += 1) {
    line.box(0.34, 0.5, 0.02, i % 2 ? b.palette.glossAqua : b.palette.linen, -0.7 + i * 0.7, 1.82, 0.9);
  }
}

/** Vista da janela: o nome do conjunto, em placa, do lado de fora. */
export function orvalhoSign(b: FitoutContext['b'], x: number, z: number): void {
  b.mesh(new THREE.BoxGeometry(3.4, 0.6, 0.2), b.palette.glossMint, x, 2.4, z);
}
