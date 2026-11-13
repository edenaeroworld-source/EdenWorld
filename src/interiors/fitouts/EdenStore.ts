/**
 * Mercado Éden — a loja geral, em dois andares.
 *
 * O lote já prometia: "Feira permanente — futura EdenStore". O
 * interior tinha dois andares declarados e só o térreo montado, e o
 * térreo era um galpão vazio com um balcão.
 *
 * Agora o térreo é um mercado de verdade — corredores paralelos,
 * gôndolas cheias, geladeira de bebidas, caixas na saída — e a
 * galeria de cima abriga as duas lojas que sempre estiveram nos dados
 * e nunca no mundo: EdenHome (móveis) e EdenGame (consoles).
 */

import * as f from '../InteriorFurniture';
import type { FitoutContext } from './index';

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const NORTH = Math.PI;
const SOUTH = 0;

export function edenstore(ctx: FitoutContext): void {
  if (ctx.floor === 0) return mercado(ctx);
  return galeria(ctx);
}

/* ------------------------------- térreo ------------------------------- */

function mercado(ctx: FitoutContext): void {
  const { b } = ctx;

  // Quatro corredores no sentido norte-sul, com 2,4 m livres entre
  // gôndolas — largura de duas pessoas e um carrinho.
  for (let i = 0; i < 4; i += 1) {
    const x = 4.0 + i * 3.4;
    f.aisleShelf(b, x, 7.4, SOUTH, 8.4, 1.9);
    // Placa de corredor pendurada.
    const sign = b.at(x, 7.4, SOUTH);
    sign.box(1.5, 0.45, 0.06, b.palette.gloss, 0, 2.7, 0);
    sign.box(1.3, 0.3, 0.03, b.palette.glossAqua, 0, 2.7, 0.05);
    sign.cyl(0.012, 0.012, 0.5, 5, b.palette.chrome, 0, 3.12, 0);
  }

  // Banca da Akemi: pão e fruta, logo na entrada, como sempre foi.
  f.counter(b, 5.6, 3.6, SOUTH, 3.2);
  const bakery = b.at(5.6, 3.1, SOUTH);
  for (let i = 0; i < 7; i += 1) {
    bakery.sph(0.13, i % 2 ? b.palette.glossAmber : b.palette.wood, -1.2 + i * 0.4, 1.16, -0.12, 8);
  }
  f.wallShelf(b, 5.6, 0.4, SOUTH, 4.2, 3);

  // Geladeira de bebidas na parede leste.
  for (let i = 0; i < 3; i += 1) {
    const cooler = b.at(23.4, 3.2 + i * 2.4, WEST);
    cooler.box(2.1, 2.2, 0.8, b.palette.aluminium, 0, 1.1, 0);
    cooler.box(1.9, 1.8, 0.05, b.palette.glass, 0, 1.2, 0.4);
    cooler.box(1.9, 0.07, 0.3, b.palette.neonAqua, 0, 2.15, 0.3);
    for (let shelf = 0; shelf < 4; shelf += 1) {
      for (let k = 0; k < 6; k += 1) {
        cooler.cyl(0.055, 0.055, 0.22, 7, k % 2 ? b.palette.glossMint : b.palette.glossRose, -0.8 + k * 0.32, 0.5 + shelf * 0.42, 0.1);
      }
    }
    cooler.solid(1.05, 0.4, 2.2, `geladeira-${i}`);
  }

  // Hortifrúti: caixotes inclinados perto da entrada.
  for (let i = 0; i < 3; i += 1) {
    const bin = b.at(19.4, 2.6 + i * 1.9, WEST);
    bin.box(1.6, 0.7, 1.3, b.palette.wood, 0, 0.35, 0);
    bin.box(1.5, 0.1, 1.2, i === 0 ? b.palette.glossMint : i === 1 ? b.palette.glossAmber : b.palette.glossRose, 0, 0.74, 0);
    for (let k = 0; k < 5; k += 1) bin.sph(0.11, i === 0 ? b.palette.leaf : b.palette.glossAmber, -0.5 + k * 0.25, 0.84, (k % 2) * 0.3 - 0.15, 8);
    bin.solid(0.8, 0.65, 0.78, `caixote-${i}`);
  }

  // Caixas na saída, de frente para a porta.
  for (let i = 0; i < 3; i += 1) f.checkout(b, 4.2 + i * 3.6, 15.4, NORTH);
  // Cestas empilhadas.
  const baskets = b.at(1.6, 15.8, NORTH);
  for (let i = 0; i < 4; i += 1) baskets.box(0.56, 0.2, 0.42, b.palette.glossAqua, 0, 0.12 + i * 0.17, 0);
  baskets.solid(0.3, 0.24, 0.9, 'cestas');

  f.planter(b, 1.2, 1.2, SOUTH, 1.3);
  f.planter(b, 22.8, 16.6, SOUTH, 1.3);
  f.plantBox(b, 16.4, 15.6, NORTH, 3.0);

  // Ala leste: frios, ilhas de oferta e um canto de café. O quadrante
  // entre as gôndolas e a escada estava vazio.
  f.counter(b, 17.8, 10.4, NORTH, 3.4);
  f.wallShelf(b, 23.4, 8.0, WEST, 3.2, 3);
  for (let i = 0; i < 2; i += 1) {
    const island = b.at(17.4 + i * 3.2, 13.6, SOUTH);
    island.box(2.2, 1.6, 0.72, b.palette.gloss, 0, 0.36, 0);
    island.box(2.0, 1.4, 0.1, i === 0 ? b.palette.glossRose : b.palette.glossMint, 0, 0.76, 0);
    for (let k = 0; k < 6; k += 1) {
      island.box(0.26, 0.26, 0.2, k % 2 === 0 ? b.palette.glossAmber : b.palette.glossAqua, -0.7 + (k % 3) * 0.7, 0.9, -0.3 + Math.floor(k / 3) * 0.6);
    }
    island.solid(1.2, 0.9, 0.8, 'ilha-oferta');
  }
  f.planter(b, 15.8, 10.0, NORTH, 1.1);
  b.light(19.6, 3.0, 12.0, 0xffffff, 6, 12);

  // Carrinhos encaixados junto à porta.
  const carts = b.at(2.0, 12.6, EAST);
  for (let i = 0; i < 4; i += 1) {
    carts.box(0.62, 0.9, 0.5, b.palette.chrome, 0, 0.62, i * 0.34);
    carts.box(0.6, 0.06, 0.4, b.palette.glossAqua, 0, 0.36, i * 0.34);
  }
  carts.solid(0.4, 1.0, 1.1, 'carrinhos');

  b.light(12, 3.1, 5, 0xffffff, 10, 20);
  b.light(12, 3.1, 13, 0xffffff, 10, 20);
  b.light(5.6, 2.9, 2.6, 0xffe6c0, 5, 9);

  ctx.people.push(
    { id: 'akemi-banca', x: 5.6, z: 2.4, yaw: SOUTH, tone: 'clara', outfit: b.palette.glossRose },
    { id: 'caixa-mercado', x: 7.8, z: 16.4, yaw: NORTH, tone: 'morena', outfit: b.palette.glossAqua },
    {
      id: 'cliente-mercado-1',
      x: 2.2,
      z: 6,
      tone: 'escura',
      outfit: b.palette.glossAmber,
      speed: 0.75,
      path: [
        { x: 2.2, z: 6 },
        { x: 2.2, z: 12.4 },
        { x: 17.4, z: 12.4 },
        { x: 17.4, z: 6 },
      ],
    },
    {
      id: 'cliente-mercado-2',
      x: 9.4,
      z: 13.6,
      tone: 'clara',
      outfit: b.palette.glossMint,
      speed: 0.6,
      path: [
        { x: 9.4, z: 13.6 },
        { x: 14.6, z: 13.6 },
        { x: 14.6, z: 3.4 },
        { x: 9.4, z: 3.4 },
      ],
    },
  );
}

/* ------------------------------ galeria ------------------------------- */

function galeria(ctx: FitoutContext): void {
  const { b } = ctx;

  // EdenHome, metade oeste: ambientes montados, como numa loja de
  // móveis — um sofá que se pode olhar de perto antes de comprar.
  f.rug(b, 5.0, 4.4, 0, 4.0, 3.0);
  f.sofa(b, 4.0, 3.2, SOUTH, 2.4);
  f.armchair(b, 7.0, 4.0, WEST);
  f.coffeeTable(b, 5.0, 4.8, SOUTH);
  f.floorLamp(b, 2.2, 5.4, SOUTH);
  f.bed(b, 3.0, 10.0, EAST, 1.7);
  f.nightstand(b, 3.0, 8.3, SOUTH);
  f.wardrobe(b, 6.6, 9.2, WEST, 1.8);
  f.diningSet(b, 8.6, 13.0, SOUTH, 4);
  f.bookshelf(b, 0.45, 13.4, EAST, 2.0);
  f.counter(b, 2.4, 15.8, NORTH, 2.4);
  f.planter(b, 9.2, 1.0, SOUTH, 1.2);

  // EdenGame, metade leste: consoles ligados e telas acesas.
  f.screenWall(b, 17.6, 0.4, SOUTH, 4, 2);
  for (let i = 0; i < 3; i += 1) {
    f.displayCase(b, 13.2, 3.0 + i * 3.0, EAST, 2.2, b.palette.glossRose);
  }
  for (let i = 0; i < 3; i += 1) {
    // Posto de jogo: poltrona, televisão e console no chão.
    const seat = 14.8 + i * 2.6;
    f.armchair(b, seat, 5.6, SOUTH);
    f.television(b, seat, 2.6, NORTH, 1.1);
  }
  f.wallShelf(b, 18.0, 10.6, NORTH, 4.0, 3);
  f.counter(b, 14.6, 10.2, NORTH, 2.6);
  f.planter(b, 22.6, 2.2, SOUTH, 1.2);

  // Divisória vazada entre as duas lojas: separa sem fechar.
  for (let i = 0; i < 5; i += 1) f.plantBox(b, 11.2, 1.8 + i * 2.6, EAST, 2.2);

  // Faixa sul: cozinha de mostruário e uma segunda sala montada. Sem
  // ela a galeria tinha seis metros de piso liso de parede a parede.
  f.kitchenRun(b, 6.0, 16.6, NORTH, 4.4, { sink: -1.2, stove: 1.0, uppers: true });
  f.fridge(b, 8.9, 16.5, NORTH);
  f.diningSet(b, 4.2, 13.6, SOUTH, 4);
  f.rug(b, 14.4, 15.0, 0, 3.6, 2.6);
  f.sofa(b, 14.4, 13.8, NORTH, 2.4);
  f.television(b, 14.4, 16.4, SOUTH, 1.5);
  f.floorLamp(b, 16.6, 14.0, NORTH);
  f.wallArt(b, 11.0, 17.5, NORTH, 1.6, 1.0);
  f.bookshelf(b, 17.5, 13.0, WEST, 1.8);
  b.light(6.0, 2.9, 15.0, 0xffe8cc, 6, 11);
  b.light(14.6, 2.9, 15.0, 0xd8e6ff, 6, 11);

  b.light(5.5, 3.0, 6.0, 0xffe8cc, 8, 16);
  b.light(17.5, 3.0, 6.0, 0xd8e6ff, 8, 16);
  b.light(11.5, 2.9, 14.0, 0xffffff, 5, 11);

  ctx.people.push(
    { id: 'vendedor-edenhome', x: 2.4, z: 14.8, yaw: NORTH, tone: 'morena', outfit: b.palette.glossAmber },
    { id: 'vendedor-edengame', x: 14.6, z: 9.2, yaw: NORTH, tone: 'clara', outfit: b.palette.glossRose },
    {
      id: 'cliente-galeria',
      x: 11.2,
      z: 16.4,
      tone: 'escura',
      outfit: b.palette.glossAqua,
      speed: 0.65,
      path: [
        { x: 8.6, z: 16.4 },
        { x: 20.4, z: 16.4 },
        { x: 20.4, z: 12.6 },
        { x: 8.6, z: 12.6 },
      ],
    },
  );
}
