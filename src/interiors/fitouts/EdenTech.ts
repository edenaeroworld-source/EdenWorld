/**
 * Torre Zênite — recepção, EdenTech e laboratório.
 *
 * A EdenTech estava declarada no primeiro andar desde sempre, e o
 * primeiro andar nunca foi construído: a escada mostrava um aviso
 * dizendo que os outros andares "ainda não têm móveis colocados".
 * Era a loja de tecnologia mais importante do Éden, e ninguém jamais
 * esteve dentro dela.
 *
 * Agora os três andares existem e a escada sobe de verdade:
 *
 * - **térreo** — recepção da torre, com atendente e espera;
 * - **1.º** — EdenTech: vitrines, mesa de demonstração, EdenPhones em
 *   pedestal, consoles e painel de telas;
 * - **2.º** — laboratório de redes, de onde Nexara cuida do Éden.
 */

import * as f from '../InteriorFurniture';
import type { FitoutContext } from './index';

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const NORTH = Math.PI;
const SOUTH = 0;

export function edentech(ctx: FitoutContext): void {
  if (ctx.floor === 0) return recepcao(ctx);
  if (ctx.floor === 1) return loja(ctx);
  return laboratorio(ctx);
}

/* ------------------------------ térreo -------------------------------- */

function recepcao(ctx: FitoutContext): void {
  const { b } = ctx;
  // Balcão atravessado no eixo de entrada: quem entra é recebido.
  f.receptionDesk(b, 6.4, 3.2, SOUTH, 3.6);
  f.waitingBench(b, 2.6, 8.4, NORTH, 2.4);
  f.waitingBench(b, 2.6, 6.2, SOUTH, 2.4);
  f.coffeeTable(b, 2.6, 7.3, SOUTH);
  f.plantBox(b, 9.6, 7.6, SOUTH, 3.0);
  f.planter(b, 0.8, 1.0, SOUTH, 1.3);
  f.planter(b, 11.4, 1.0, SOUTH, 1.3);
  f.infoTotem(b, 11.2, 4.4, WEST);
  f.screenWall(b, 6.4, 0.3, SOUTH, 3, 1);
  f.waterCooler(b, 0.6, 9.6, EAST);

  // Ala leste: café de espera. A recepção tem 18 m de largura; sem
  // isto, um terço do saguão era chão liso.
  f.counter(b, 16.4, 2.4, WEST, 3.2);
  f.wallShelf(b, 17.4, 5.6, WEST, 2.6, 3);
  for (let i = 0; i < 2; i += 1) {
    f.diningSet(b, 13.6, 1.8 + i * 3.2, SOUTH, 2);
  }
  f.armchair(b, 13.0, 5.2, EAST);
  f.wallArt(b, 14.6, 0.3, SOUTH, 1.6, 1.0);
  f.planter(b, 17.2, 7.2, WEST, 1.2);
  f.pendantLamp(b, 15.0, 2.4, 2.9);
  b.light(15.2, 2.8, 3.4, 0xffe3c0, 5, 9);

  // Elevador decorativo junto à escada: a torre tem 62 m de fachada,
  // seria estranho só ter degraus.
  const lift = b.at(11.6, 10.6, NORTH);
  lift.box(2.6, 2.8, 0.3, b.palette.aluminium, 0, 1.4, 0);
  lift.box(1.1, 2.3, 0.08, b.palette.glass, -0.56, 1.15, 0.18);
  lift.box(1.1, 2.3, 0.08, b.palette.glass, 0.56, 1.15, 0.18);
  lift.box(0.7, 0.2, 0.1, b.palette.neonAqua, 0, 2.6, 0.2);
  lift.solid(1.3, 0.2, 2.8, 'elevador');

  b.light(6.4, 3.0, 4.0, 0xd6ecff, 9, 16);
  b.light(3.0, 2.8, 9.0, 0xd6ecff, 5, 10);

  ctx.people.push(
    { id: 'recepcionista-zenite', x: 6.4, z: 4.4, yaw: SOUTH, tone: 'morena', outfit: b.palette.glossAqua },
    { id: 'visitante-zenite', x: 2.6, z: 6.9, yaw: NORTH, tone: 'clara', outfit: b.palette.glossAmber },
    {
      id: 'mensageiro-zenite',
      x: 9.0,
      z: 9.5,
      tone: 'escura',
      outfit: b.palette.glossMint,
      speed: 0.9,
      path: [
        { x: 9.0, z: 9.6 },
        { x: 2.2, z: 9.6 },
        { x: 2.2, z: 4.8 },
        { x: 9.6, z: 4.8 },
      ],
    },
  );
}

/* ------------------------------ EdenTech ------------------------------ */

function loja(ctx: FitoutContext): void {
  const { b } = ctx;

  // Corredor central livre entre duas fileiras de vitrine.
  for (let i = 0; i < 3; i += 1) {
    f.displayCase(b, 2.4, 2.2 + i * 3.2, EAST, 2.4, b.palette.glossAqua);
    f.displayCase(b, 15.6, 2.2 + i * 3.2, WEST, 2.4, b.palette.glossMint);
  }

  // Mesa de demonstração: notebooks abertos, ligados.
  f.demoTable(b, 9.0, 3.0, SOUTH, 3);
  f.demoTable(b, 9.0, 5.6, NORTH, 3);

  // EdenPhones em pedestal, no eixo de quem sobe a escada.
  for (let i = 0; i < 4; i += 1) f.phonePedestal(b, 6.0 + i * 2.0, 8.6, SOUTH);

  // Consoles e televisões, no fundo.
  f.screenWall(b, 9.0, 0.3, SOUTH, 4, 2);
  f.wallShelf(b, 4.2, 11.6, NORTH, 3.4, 3);
  f.counter(b, 11.8, 11.4, NORTH, 3.0);
  f.planter(b, 0.8, 11.0, SOUTH, 1.2);
  f.planter(b, 17.2, 1.0, SOUTH, 1.2);

  b.light(9.0, 3.0, 4.0, 0xcfe8ff, 10, 18);
  b.light(9.0, 3.0, 9.5, 0xcfe8ff, 8, 14);

  // Letreiro da loja, visível de quem chega pela escada.
  const sign = b.at(9.0, 0.45, SOUTH);
  sign.box(5.2, 0.7, 0.12, b.palette.graphite, 0, 2.75, 0);
  sign.box(4.6, 0.4, 0.06, b.palette.neonAqua, 0, 2.75, 0.1);

  ctx.people.push(
    { id: 'vendedor-edentech', x: 11.8, z: 10.4, yaw: SOUTH, tone: 'clara', outfit: b.palette.glossAqua },
    {
      id: 'cliente-edentech',
      x: 6.4,
      z: 7.4,
      tone: 'morena',
      outfit: b.palette.glossRose,
      speed: 0.7,
      path: [
        { x: 6.2, z: 7.4 },
        { x: 12.4, z: 7.4 },
        { x: 12.4, z: 9.8 },
        { x: 6.2, z: 9.8 },
      ],
    },
  );
}

/* --------------------------- laboratório ------------------------------ */

function laboratorio(ctx: FitoutContext): void {
  const { b } = ctx;
  for (let i = 0; i < 5; i += 1) f.serverRack(b, 1.2, 1.6 + i * 2.1, EAST);
  for (let i = 0; i < 3; i += 1) f.serverRack(b, 16.8, 2.4 + i * 2.1, WEST);

  f.officeDesk(b, 7.0, 2.4, SOUTH);
  f.officeDesk(b, 10.6, 2.4, SOUTH);
  f.screenWall(b, 9.0, 0.35, SOUTH, 4, 2);
  f.demoTable(b, 8.8, 6.4, SOUTH, 2);
  f.waterCooler(b, 15.6, 10.6, NORTH);
  f.planter(b, 4.4, 10.8, NORTH, 1.1);
  f.wallArt(b, 4.0, 0.3, SOUTH, 1.2, 0.8);
  // Bancada de reparo e canto de pausa, ala leste do laboratório.
  f.counter(b, 14.0, 2.2, SOUTH, 3.0);
  f.officeChair(b, 14.0, 3.4, NORTH);
  f.bookshelf(b, 17.3, 6.6, WEST, 2.2);
  f.armchair(b, 13.4, 6.4, EAST);
  f.coffeeTable(b, 14.6, 6.4, EAST);
  f.plantBox(b, 11.0, 11.4, NORTH, 2.4);

  // Mesa de rede: a maquete viva do Éden, com as sete regiões acesas.
  const table = b.at(9.0, 9.4, SOUTH);
  table.cyl(1.5, 1.6, 0.86, 24, b.palette.gloss, 0, 0.43, 0);
  table.cyl(1.45, 1.45, 0.06, 24, b.palette.glass, 0, 0.9, 0);
  table.cyl(1.2, 1.2, 0.02, 24, b.palette.screen, 0, 0.93, 0);
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    table.sph(0.1, i === 0 ? b.palette.neonRose : b.palette.neonAqua, Math.cos(a) * 0.85, 1.02, Math.sin(a) * 0.85, 8);
  }
  table.lamp(0x6fd8ff, 3.2, 7, 0, 1.4, 0);
  table.solid(1.6, 1.6, 0.95, 'mesa-rede');

  b.light(9.0, 3.0, 5.0, 0xbfe0ff, 8, 16);
  b.light(9.0, 2.6, 9.4, 0x7fd8ff, 5, 10);

  ctx.people.push({ id: 'tecnico-zenite', x: 12.4, z: 9.4, yaw: WEST, tone: 'escura', outfit: b.palette.gloss });
}
