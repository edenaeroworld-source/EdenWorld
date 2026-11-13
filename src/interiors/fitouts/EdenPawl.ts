/**
 * Casa EdenPawl — a loja de bichos de Saturno.
 *
 * O lote a descrevia como "Abrigo dos companheiros do Éden (em
 * breve)". O "em breve" durou o jogo inteiro: dentro havia um balcão
 * genérico, uma estante genérica e um disco de cristal no chão
 * chamado "Mesa de Saturno".
 *
 * São dois ambientes de verdade: a loja, com produtos e aquários, e a
 * sala de adoção, onde ficam os bichos à espera de casa. Saturno está
 * em pé na sala de adoção, que é onde ela realmente passa o dia.
 */

import * as f from '../InteriorFurniture';
import type { FitoutContext } from './index';

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const NORTH = Math.PI;
const SOUTH = 0;

export function edenpawl(ctx: FitoutContext): void {
  const { b } = ctx;

  /* ------------------------------- loja -------------------------------- */
  // Produtos à esquerda de quem entra, aquários à direita, caixa ao fundo.
  f.aisleShelf(b, 4.0, 5.6, SOUTH, 6.4, 1.7);
  f.wallShelf(b, 1.0, 8.6, EAST, 4.2, 3);
  f.wallShelf(b, 8.0, 0.4, SOUTH, 5.0, 2);

  f.aquarium(b, 12.4, 2.0, SOUTH, 1.8);
  f.aquarium(b, 12.4, 4.2, SOUTH, 1.8);
  f.birdCage(b, 14.6, 6.6, WEST);
  f.scratchPost(b, 11.0, 7.6, SOUTH);

  // Caixa encostado no canto oeste: o eixo da porta (x = 8) fica livre
  // da entrada até o fundo da loja.
  f.counter(b, 2.6, 10.4, NORTH, 3.0);
  // Caixa de brinquedos: bolinhas de verdade, espalhadas.
  const toys = b.at(9.6, 9.0, NORTH);
  toys.box(1.0, 0.5, 0.8, b.palette.glossMint, 0, 0.25, 0);
  for (let i = 0; i < 6; i += 1) toys.sph(0.09, i % 2 ? b.palette.glossRose : b.palette.glossAmber, -0.35 + (i % 3) * 0.35, 0.56, (i > 2 ? 0.2 : -0.2), 8);
  toys.solid(0.5, 0.4, 0.55, 'brinquedos');

  // Banho e tosa, no fundo da loja: mesa de inox, chuveirinho e
  // prateleira de shampoo. É serviço, não só estante.
  const grooming = b.at(12.8, 10.2, NORTH);
  grooming.box(1.9, 0.9, 0.08, b.palette.chrome, 0, 0.9, 0);
  for (const sx of [-0.8, 0.8]) {
    for (const sz of [-0.33, 0.33]) grooming.cyl(0.035, 0.035, 0.9, 6, b.palette.aluminium, sx, 0.45, sz);
  }
  grooming.box(1.7, 0.7, 0.12, b.palette.glossAqua, 0, 0.98, 0);
  grooming.cyl(0.03, 0.03, 0.7, 6, b.palette.chrome, 0.82, 1.45, -0.3);
  grooming.box(0.26, 0.1, 0.1, b.palette.chrome, 0.82, 1.78, -0.18);
  grooming.solid(1.0, 0.5, 1.0, 'banho-e-tosa');
  f.wallShelf(b, 12.8, 11.6, NORTH, 2.4, 2);

  // Ilha de camas e caixas de transporte, no meio do salão.
  const beds = b.at(6.2, 8.4, NORTH);
  beds.box(2.6, 1.8, 0.35, b.palette.wood, 0, 0.17, 0);
  for (let i = 0; i < 3; i += 1) {
    const tone = i === 0 ? b.palette.glossRose : i === 1 ? b.palette.glossMint : b.palette.glossAmber;
    beds.cyl(0.42, 0.46, 0.18, 14, tone, -0.8 + i * 0.8, 0.44, -0.3);
    beds.cyl(0.3, 0.32, 0.06, 14, b.palette.linen, -0.8 + i * 0.8, 0.56, -0.3);
  }
  for (let i = 0; i < 2; i += 1) {
    beds.box(0.56, 0.44, 0.4, b.palette.gloss, -0.5 + i * 1.0, 0.55, 0.52);
    beds.box(0.3, 0.06, 0.26, b.palette.chrome, -0.5 + i * 1.0, 0.58, 0.75);
  }
  beds.solid(1.4, 1.0, 0.6, 'ilha-camas');

  f.planter(b, 0.9, 1.0, SOUTH, 1.2);
  f.plantBox(b, 13.6, 11.2, NORTH, 3.4);

  b.light(5.0, 2.9, 4.0, 0xffe0bb, 7, 13);
  b.light(11.5, 2.8, 9.0, 0xffe0bb, 5, 10);

  /* --------------------------- sala de adoção -------------------------- */
  // Recantos cercados, baixos o bastante para ver quem está dentro.
  f.petPen(b, 19.6, 3.2, SOUTH, 3.4, 2.8);
  f.petPen(b, 19.6, 7.6, SOUTH, 3.4, 2.8);
  f.petPen(b, 24.8, 3.2, SOUTH, 3.4, 2.8);
  f.petPen(b, 24.8, 7.6, SOUTH, 3.4, 2.8);

  // Mesa de atendimento de Saturno, virada para os recantos.
  f.counter(b, 22.2, 11.0, NORTH, 2.6);
  f.officeChair(b, 22.2, 11.9, SOUTH);
  f.wallArt(b, 18.4, 0.35, SOUTH, 1.4, 0.9);
  f.wallArt(b, 25.6, 0.35, SOUTH, 1.4, 0.9);
  f.planter(b, 17.0, 11.4, NORTH, 1.1);
  f.planter(b, 27.2, 11.4, NORTH, 1.1);
  f.waterCooler(b, 27.2, 1.0, SOUTH);

  // Tapete de triagem no meio: é onde bicho e pessoa se conhecem.
  f.rug(b, 22.2, 6.0, 0, 3.0, 2.0);

  b.light(22.2, 3.0, 5.0, 0xfff0d4, 8, 15);
  b.light(22.2, 2.7, 10.4, 0xffe6c8, 4.5, 9);

  ctx.people.push(
    // A dona da casa, com o modelo oficial — o mesmo de Aurora City.
    { id: 'saturno-balcao', character: 'saturno', x: 22.2, z: 12.0, yaw: NORTH },
    { id: 'atendente-pawl', x: 2.6, z: 11.4, yaw: NORTH, tone: 'clara', outfit: b.palette.glossMint },
    {
      id: 'visitante-pawl',
      x: 22.2,
      z: 6.0,
      tone: 'escura',
      outfit: b.palette.glossAqua,
      speed: 0.55,
      path: [
        { x: 22.2, z: 6.0 },
        { x: 22.2, z: 9.4 },
        { x: 17.4, z: 9.4 },
        { x: 17.4, z: 2.0 },
        { x: 22.2, z: 2.0 },
      ],
    },
  );
}
