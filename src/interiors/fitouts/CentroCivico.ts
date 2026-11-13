/**
 * Centro Éden Connect — o edifício público de Aurora City.
 *
 * O lote existia no mapa desde a primeira versão da cidade ("Coração
 * dos serviços digitais do Éden") e nunca teve porta: era fachada e
 * mais nada.
 *
 * É o quinto ambiente do marco e o que mais depende de circulação
 * funcionar: recepção com guichês, sala de espera, corredor e duas
 * salas internas. Se o jogador trava numa quina ou atravessa um
 * balcão, aparece aqui primeiro.
 */

import * as f from '../InteriorFurniture';
import type { FitoutContext } from './index';

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const NORTH = Math.PI;
const SOUTH = 0;

export function centroCivico(ctx: FitoutContext): void {
  const { b } = ctx;

  /* ----------------------------- recepção ------------------------------ */
  // Balcão longo atravessado na sala, atendentes atrás.
  f.receptionDesk(b, 8.0, 2.8, SOUTH, 4.6);
  f.screenWall(b, 8.0, 0.35, SOUTH, 4, 1);
  f.infoTotem(b, 2.2, 7.2, NORTH);
  f.infoTotem(b, 13.8, 7.2, NORTH);
  f.plantBox(b, 8.0, 8.4, NORTH, 4.0);
  f.planter(b, 0.9, 0.9, SOUTH, 1.3);
  f.planter(b, 15.1, 0.9, SOUTH, 1.3);

  // Cordão de fila: duas colunas e uma fita, o detalhe que faz a sala
  // parecer repartição pública.
  for (let i = 0; i < 4; i += 1) {
    const post = b.at(4.4 + i * 2.4, 5.6, SOUTH);
    post.cyl(0.18, 0.22, 0.06, 12, b.palette.chrome, 0, 0.03, 0);
    post.cyl(0.035, 0.035, 0.95, 8, b.palette.chrome, 0, 0.5, 0);
    post.sph(0.06, b.palette.gloss, 0, 1.0, 0);
    if (i < 3) post.box(2.4, 0.04, 0.02, b.palette.glossAqua, 1.2, 0.9, 0);
  }

  b.light(8.0, 3.0, 3.4, 0xe4f1ff, 10, 18);
  b.light(8.0, 2.9, 8.6, 0xe4f1ff, 6, 12);

  /* --------------------------- sala de espera -------------------------- */
  for (let row = 0; row < 2; row += 1) {
    f.waitingBench(b, 4.0, 13.2 + row * 2.6, SOUTH, 2.6);
    f.waitingBench(b, 11.4, 13.2 + row * 2.6, SOUTH, 2.6);
  }
  f.coffeeTable(b, 7.7, 14.5, SOUTH);
  f.waterCooler(b, 0.7, 16.8, EAST);
  f.planter(b, 15.1, 16.8, WEST, 1.2);
  f.wallArt(b, 4.0, 17.65, NORTH, 1.4, 0.9);
  f.wallArt(b, 11.4, 17.65, NORTH, 1.4, 0.9);

  // Painel de senha: o número grande na parede.
  const panel = b.at(13.6, 17.6, NORTH);
  panel.box(1.8, 0.9, 0.1, b.palette.graphite, 0, 2.3, 0);
  panel.box(1.5, 0.62, 0.03, b.palette.screen, 0, 2.3, 0.07);

  b.light(8.0, 2.9, 14.4, 0xdeeeff, 7, 13);

  /* ------------------------------ corredor ----------------------------- */
  f.waterCooler(b, 18.0, 9.0, WEST);
  f.planter(b, 16.6, 1.4, SOUTH, 0.9);
  f.planter(b, 16.6, 16.6, NORTH, 0.9);
  for (let i = 0; i < 3; i += 1) f.wallArt(b, 16.3, 4.0 + i * 5.0, EAST, 0.9, 0.7);
  b.light(18.0, 3.0, 4.5, 0xd8eaff, 4, 9);
  b.light(18.0, 3.0, 13.5, 0xd8eaff, 4, 9);

  /* -------------------------- salas internas --------------------------- */
  // Atendimento: duas mesas de frente uma para a outra.
  f.officeDesk(b, 23.4, 3.0, SOUTH);
  f.officeDesk(b, 26.8, 3.0, SOUTH);
  f.waitingBench(b, 24.8, 7.4, NORTH, 2.2);
  f.bookshelf(b, 20.5, 6.4, EAST, 1.8);
  f.planter(b, 28.1, 8.1, NORTH, 1.0);
  b.light(24.5, 3.0, 4.2, 0xe4f1ff, 6, 12);

  // Registros: arquivo de parede a parede.
  for (let i = 0; i < 5; i += 1) f.bookshelf(b, 21.0 + i * 1.7, 9.8, SOUTH, 1.6);
  f.officeDesk(b, 24.5, 15.6, NORTH);
  f.waterCooler(b, 28.2, 16.9, WEST);
  f.wallArt(b, 20.4, 13.0, EAST, 1.0, 0.8);
  b.light(24.5, 3.0, 13.6, 0xe4f1ff, 6, 12);

  ctx.people.push(
    { id: 'atendente-connect-1', x: 6.6, z: 4.1, yaw: SOUTH, tone: 'clara', outfit: b.palette.glossAqua },
    { id: 'atendente-connect-2', x: 9.4, z: 4.1, yaw: SOUTH, tone: 'escura', outfit: b.palette.glossAqua },
    { id: 'servidor-atendimento', x: 23.4, z: 3.95, yaw: NORTH, tone: 'morena', outfit: b.palette.gloss },
    { id: 'arquivista', x: 24.5, z: 14.65, yaw: SOUTH, tone: 'clara', outfit: b.palette.gloss },
    { id: 'esperando-1', x: 4.0, z: 12.6, yaw: SOUTH, tone: 'morena', outfit: b.palette.glossAmber },
    {
      id: 'cidadao-andando',
      x: 8.0,
      z: 10.0,
      tone: 'escura',
      outfit: b.palette.glossMint,
      speed: 0.8,
      path: [
        { x: 8.0, z: 10.2 },
        { x: 18.0, z: 10.2 },
        { x: 18.0, z: 15.4 },
        { x: 8.0, z: 15.4 },
      ],
    },
  );
}
