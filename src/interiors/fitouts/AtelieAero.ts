/**
 * Ateliê Aero — o estúdio de Luma, em Aurora City.
 *
 * É o lugar onde os Afters foram inventados, e era o único prédio de
 * Aurora que ainda entregava o galpão cru: piso, parede, teto e três
 * caixas genéricas chamadas "Balcão", "Espelho de ajuste" e "Sofá de
 * espera". Entrar aqui parecia entrar num ambiente vazio — e era.
 *
 * São dois ambientes. O **salão** é oficina à vista: mesa de corte no
 * meio, araras de roupa, rolos de tecido em pé, manequins e o balcão
 * de atendimento virado para quem chega. A **cabine de ajuste** é a
 * sala fechada ao lado, com o espelho de três folhas, o tablado e a
 * cortina — é dela que sai o painel Afters.
 *
 * O eixo da porta (x ≈ 7, z de 10 para dentro) e a passagem para a
 * cabine (x = 14, z ≈ 5) ficam livres de propósito: a inundação do
 * teste de jogabilidade entra por ali.
 */

import * as f from '../InteriorFurniture';
import type { FitoutContext } from './index';

const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;
const NORTH = Math.PI;
const SOUTH = 0;

export function atelieAero(ctx: FitoutContext): void {
  const { b } = ctx;
  const p = b.palette;

  /* ------------------------------- salão -------------------------------- */

  // Balcão de atendimento, de frente para a porta. O móvel fica onde o
  // interativo `balcao` está declarado, senão a ação sai do nada.
  f.counter(b, 7.0, 2.0, SOUTH, 3.2);
  // Prateleira de amostras atrás do balcão: potes de pigmento Afters,
  // em fila, cada um de uma cor.
  f.wallShelf(b, 7.0, 0.4, SOUTH, 4.4, 3);
  const jars = b.at(7.0, 0.72, SOUTH);
  const tones = [p.glossAqua, p.glossRose, p.glossMint, p.glossAmber, p.gloss, p.neonAqua];
  tones.forEach((tone, i) => {
    const dx = -1.75 + i * 0.7;
    jars.cyl(0.085, 0.085, 0.2, 8, tone, dx, 1.02, 0);
    jars.cyl(0.075, 0.075, 0.17, 8, i % 2 ? p.glossRose : p.glossAqua, dx, 1.58, 0);
  });

  // Mesa de corte, no meio do salão: tampo comprido, tecido dobrado em
  // cima, tesoura e régua. É a bancada de trabalho da casa.
  const cut = b.at(7.0, 5.2, SOUTH);
  cut.box(3.6, 0.09, 1.5, p.wood, 0, 0.92, 0);
  for (const sx of [-1.6, 1.6]) {
    for (const sz of [-0.6, 0.6]) cut.box(0.1, 0.9, 0.1, p.aluminium, sx, 0.45, sz);
  }
  cut.box(3.4, 0.06, 1.3, p.linen, 0, 0.98, 0);
  cut.box(0.9, 0.12, 0.6, p.glossAqua, -1.0, 1.03, 0.1, 0.2);
  cut.box(0.7, 0.1, 0.5, p.glossRose, 0.4, 1.02, -0.2, -0.15);
  cut.cyl(0.02, 0.02, 0.5, 6, p.chrome, 1.3, 1.22, 0.3);
  cut.solid(1.85, 0.8, 0.98, 'mesa-corte');

  // Araras de roupa na parede oeste: a coleção pendurada, que é o que
  // faz um ateliê parecer um ateliê.
  for (const [rx, rz] of [
    [1.1, 2.4],
    [1.1, 5.0],
  ] as const) {
    const rack = b.at(rx, rz, EAST);
    for (const sx of [-0.9, 0.9]) rack.cyl(0.035, 0.035, 1.75, 6, p.chrome, sx, 0.88, 0);
    rack.cyl(0.03, 0.03, 1.9, 6, p.chrome, 0, 1.74, 0);
    rack.box(1.9, 0.05, 0.5, p.chrome, 0, 0.06, 0);
    // As peças, alternando entre os tons da casa.
    for (let i = 0; i < 7; i += 1) {
      const tone = [p.glossAqua, p.linen, p.glossRose, p.fabric, p.glossMint, p.linen, p.glossAmber][i];
      rack.box(0.16, 0.95, 0.42, tone, -0.78 + i * 0.26, 1.2, 0);
    }
    rack.solid(1.0, 0.35, 1.9, `arara-${rz}`);
  }

  // Rolos de tecido em pé, encostados no canto noroeste.
  const rolls = b.at(1.2, 8.3, EAST);
  for (let i = 0; i < 5; i += 1) {
    const tone = [p.linen, p.glossAqua, p.fabric, p.glossRose, p.glossMint][i];
    rolls.cyl(0.16, 0.16, 1.7 + (i % 2) * 0.2, 8, tone, -0.7 + i * 0.35, 0.9, (i % 2) * 0.12);
  }
  rolls.solid(0.95, 0.4, 1.8, 'rolos');

  // Sofá de espera, onde o interativo diz que ele está.
  f.sofa(b, 3.0, 8.0, NORTH, 2.2);
  f.rug(b, 4.4, 7.4, 0, 3.0, 2.2);
  f.coffeeTable(b, 4.9, 8.2, NORTH);
  f.floorLamp(b, 1.4, 6.9, SOUTH);

  // Dois manequins junto à vitrine leste, virados para o salão. São o
  // mostruário: é neles que a roupa nova aparece primeiro.
  for (const [mx, mz, yaw] of [
    [11.6, 7.8, WEST],
    [12.8, 6.2, WEST],
  ] as const) {
    const doll = b.at(mx, mz, yaw);
    doll.cyl(0.34, 0.26, 0.05, 10, p.chrome, 0, 0.03, 0);
    doll.cyl(0.04, 0.04, 0.75, 6, p.aluminium, 0, 0.4, 0);
    doll.box(0.42, 0.62, 0.26, mz > 7 ? p.glossAqua : p.glossRose, 0, 1.08, 0);
    doll.box(0.3, 0.3, 0.22, p.linen, 0, 1.52, 0);
    doll.sph(0.1, p.gloss, 0, 1.76, 0, 8);
    doll.solid(0.3, 0.26, 1.8, `manequim-${mx}`);
  }

  // Mesa de desenho junto à janela sul: pranchetas, lápis e um retrato
  // do primeiro Afters — a casa tem memória.
  const desk = b.at(11.9, 2.2, WEST);
  desk.box(1.5, 0.08, 0.8, p.woodDark, 0, 0.88, 0);
  desk.box(1.4, 0.04, 0.7, p.gloss, 0, 0.95, 0, 0.08);
  for (const sx of [-0.65, 0.65]) desk.box(0.08, 0.86, 0.08, p.woodDark, sx, 0.43, 0);
  desk.cyl(0.05, 0.05, 0.14, 8, p.glossAmber, 0.5, 1.0, 0.22);
  desk.solid(0.8, 0.45, 0.95, 'mesa-desenho');
  f.chair(b, 11.9, 3.3, EAST);
  f.wallArt(b, 13.6, 4.4, WEST, 1.0, 0.75);
  f.wallArt(b, 5.2, 0.25, SOUTH, 1.2, 0.85);

  f.planter(b, 12.9, 9.1, NORTH, 1.0);
  f.pendantLamp(b, 7.0, 5.2, 3.3, 0xfff1d8);
  b.light(4.0, 2.7, 4.0, 0xffe6c4, 7, 12);
  b.light(10.6, 2.7, 6.0, 0xfff0dc, 6, 11);

  /* --------------------------- cabine de ajuste -------------------------- */
  // A sala vizinha (x 14..20, z 2..8), com a passagem em x = 14, z ≈ 5.
  // Tudo aqui é assentado sem giro (yaw 0): o eixo local é o do
  // prédio, e espelho encostado na parede errada é o tipo de erro que
  // só aparece depois de medir.

  // Espelho de três folhas contra a parede leste, de frente para quem
  // entra. A folha do meio é lisa; as laterais abrem um pouco.
  const mirror = b.at(19.5, 5.0, SOUTH);
  mirror.box(0.16, 2.24, 1.78, p.trim, 0.1, 1.12, 0);
  mirror.box(0.1, 2.05, 1.5, p.glass, -0.01, 1.15, 0);
  mirror.box(0.09, 1.8, 0.66, p.glass, -0.14, 1.06, 1.02, 0.3);
  mirror.box(0.09, 1.8, 0.66, p.glass, -0.14, 1.06, -1.02, -0.3);
  mirror.solid(0.2, 1.1, 2.2, 'espelho');

  // Tablado diante do espelho: é onde se sobe para a prova.
  const dais = b.at(18.1, 5.0, SOUTH);
  dais.cyl(0.95, 1.0, 0.16, 16, p.floorWood, 0, 0.08, 0);
  dais.walkable(0.95, 0.95, 0.16, 'tablado', 0, 0, 'wood');

  // Cortina de prova na parede norte, com trilho e tudo.
  const curtain = b.at(16.6, 7.4, SOUTH);
  curtain.box(2.3, 0.07, 0.07, p.chrome, 0, 2.22, 0);
  for (let i = 0; i < 7; i += 1) curtain.box(0.3, 1.95, 0.08, i % 2 ? p.fabric : p.linen, -0.9 + i * 0.3, 1.22, 0);
  curtain.solid(1.15, 0.12, 2.25, 'cortina');

  // Pufe e banqueta: a cabine é de duas pessoas, quem prova e quem
  // opina.
  const pouf = b.at(18.6, 2.9, SOUTH);
  pouf.cyl(0.42, 0.45, 0.42, 12, p.glossMint, 0, 0.21, 0);
  pouf.solid(0.42, 0.42, 0.42, 'pufe');
  f.chair(b, 16.4, 3.0, SOUTH);

  // Cabideiro de peças separadas, junto à passagem.
  const hooks = b.at(14.7, 6.6, SOUTH);
  hooks.box(0.1, 1.9, 1.4, p.trim, 0, 0.95, 0);
  for (let i = 0; i < 3; i += 1) {
    hooks.box(0.26, 0.85, 0.3, [p.glossRose, p.linen, p.glossAqua][i], 0.2, 1.1, -0.45 + i * 0.45);
  }
  hooks.solid(0.22, 0.75, 1.9, 'cabideiro');

  f.planter(b, 14.9, 2.9, SOUTH, 0.8);
  f.pendantLamp(b, 17.4, 5.0, 3.2, 0xffe8c0);
  b.light(17.4, 2.6, 5.0, 0xfff2e0, 6, 10);

  /* -------------------------------- gente -------------------------------- */
  ctx.people.push(
    // A dona da casa, com o modelo oficial — a mesma Luma da rua.
    { id: 'luma-atelie', character: 'luma', x: 7.0, z: 3.3, yaw: SOUTH },
    {
      id: 'costureira-atelie',
      x: 9.0,
      z: 5.2,
      yaw: WEST,
      tone: 'morena',
      outfit: p.glossMint,
      path: [
        { x: 9.0, z: 5.2 },
        { x: 9.0, z: 7.6 },
        { x: 5.4, z: 7.6 },
        { x: 9.0, z: 5.2 },
      ],
      speed: 0.5,
    },
    { id: 'cliente-atelie', x: 16.0, z: 3.4, yaw: EAST, tone: 'clara', outfit: p.glossRose },
  );
}
