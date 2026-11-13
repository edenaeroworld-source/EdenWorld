/**
 * O catálogo de móveis dos interiores.
 *
 * Cada função desenha **uma peça de mobiliário** a partir de caixas e
 * cilindros: sem arquivo de modelo, sem textura, sem download. A peça
 * é desenhada de frente para +Z e girada por `yaw`, então o mesmo sofá
 * serve para qualquer parede.
 *
 * Toda peça que ocupa espaço também registra colisão, e é por isso que
 * o jogador circula **entre** os móveis em vez de atravessá-los.
 *
 * As peças não sabem em que prédio estão. Quem dá identidade a um
 * ambiente é a combinação escolhida pelo acabamento (`fitouts/`), não
 * a peça — é assim que cinco lojas feitas das mesmas caixas não
 * parecem a mesma loja.
 */

import * as THREE from 'three';
import type { InteriorBuild } from './InteriorKit';

/* ------------------------------ estar ------------------------------- */

/** Sofá de três lugares, com almofadas e pés cromados. */
export function sofa(b: InteriorBuild, x: number, z: number, yaw: number, width = 2.4): void {
  const p = b.at(x, z, yaw);
  const half = width / 2;
  p.box(width, 0.3, 0.95, b.palette.fabric, 0, 0.5, 0);
  p.box(width, 0.75, 0.25, b.palette.fabric, 0, 0.72, -0.48);
  for (const side of [-1, 1]) p.box(0.25, 0.5, 0.95, b.palette.fabric, side * (half - 0.12), 0.6, 0);
  for (let i = 0; i < 3; i += 1) {
    p.box(width / 3 - 0.18, 0.16, 0.5, b.palette.glossAqua, -half + width / 6 + (i * width) / 3, 0.72, 0.06);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.05, 0.05, 0.34, 8, b.palette.chrome, sx * (half - 0.2), 0.17, sz * 0.36);
  p.solid(half, 0.52, 0.85, 'sofa');
}

/** Poltrona redonda. */
export function armchair(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.cyl(0.52, 0.46, 0.28, 16, b.palette.fabric, 0, 0.48, 0);
  p.box(0.95, 0.62, 0.22, b.palette.fabric, 0, 0.75, -0.42);
  p.cyl(0.14, 0.2, 0.34, 10, b.palette.chrome, 0, 0.17, 0);
  p.cyl(0.34, 0.34, 0.05, 12, b.palette.chrome, 0, 0.03, 0);
  p.solid(0.52, 0.52, 0.8, 'poltrona');
}

/** Mesa de centro com tampo de vidro. */
export function coffeeTable(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(1.25, 0.07, 0.68, b.palette.glass, 0, 0.44, 0);
  p.box(1.1, 0.05, 0.56, b.palette.gloss, 0, 0.2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.035, 0.035, 0.44, 8, b.palette.chrome, sx * 0.52, 0.22, sz * 0.26);
  p.sph(0.1, b.palette.glossMint, 0.3, 0.52, 0);
  p.solid(0.65, 0.36, 0.48, 'mesa-centro');
}

/** Televisão de parede com rack embaixo. */
export function television(b: InteriorBuild, x: number, z: number, yaw: number, width = 1.7): void {
  const p = b.at(x, z, yaw);
  p.box(width + 0.5, 0.42, 0.42, b.palette.gloss, 0, 0.21, 0);
  p.box(width + 0.4, 0.06, 0.34, b.palette.neonAqua, 0, 0.44, 0.02);
  p.box(width, width * 0.58, 0.07, b.palette.graphite, 0, 1.45, -0.1);
  p.box(width - 0.09, width * 0.58 - 0.09, 0.02, b.palette.screen, 0, 1.45, -0.055);
  p.lamp(0x6fd8ff, 3.5, 5.5, 0, 1.45, 0.5);
  p.solid(width / 2 + 0.25, 0.22, 0.46, 'rack-tv');
}

/** Tapete macio: só decoração, sem colisão. */
export function rug(b: InteriorBuild, x: number, z: number, yaw: number, w = 2.6, d = 1.8): void {
  b.at(x, z, yaw).box(w, 0.025, d, b.palette.carpet, 0, 0.013, 0).box(w - 0.3, 0.028, d - 0.3, b.palette.glossAqua, 0, 0.015, 0);
}

/** Estante de livros, com lombadas coloridas. */
export function bookshelf(b: InteriorBuild, x: number, z: number, yaw: number, width = 1.6): void {
  const p = b.at(x, z, yaw);
  const height = 2.1;
  p.box(width, height, 0.36, b.palette.woodDark, 0, height / 2, 0);
  const tones = [b.palette.glossAqua, b.palette.glossRose, b.palette.glossMint, b.palette.glossAmber, b.palette.gloss];
  for (let shelf = 0; shelf < 4; shelf += 1) {
    const y = 0.42 + shelf * 0.5;
    p.box(width - 0.1, 0.045, 0.32, b.palette.wood, 0, y, 0.02);
    for (let i = 0; i < 9; i += 1) {
      const h = 0.26 + ((i * 7 + shelf * 3) % 5) * 0.025;
      p.box(0.055, h, 0.2, tones[(i + shelf) % tones.length], -width / 2 + 0.14 + i * ((width - 0.26) / 9), y + h / 2 + 0.02, 0.04);
    }
  }
  p.solid(width / 2, 0.18, height, 'estante');
}

/** Mesa de jantar com cadeiras em volta. */
export function diningSet(b: InteriorBuild, x: number, z: number, yaw: number, seats = 4): void {
  const p = b.at(x, z, yaw);
  p.box(1.5, 0.08, 0.95, b.palette.wood, 0, 0.74, 0);
  p.box(1.4, 0.03, 0.85, b.palette.gloss, 0, 0.79, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.05, 0.05, 0.74, 8, b.palette.chrome, sx * 0.62, 0.37, sz * 0.36);
  p.cyl(0.13, 0.1, 0.22, 12, b.palette.ceramic, 0, 0.89, 0);
  p.sph(0.09, b.palette.leafPale, 0, 1.06, 0);
  p.solid(0.78, 0.5, 0.78, 'mesa-jantar');
  const spots: [number, number, number][] = [
    [-0.95, 0, Math.PI / 2],
    [0.95, 0, -Math.PI / 2],
    [0, -0.85, 0],
    [0, 0.85, Math.PI],
  ];
  for (let i = 0; i < Math.min(seats, spots.length); i += 1) {
    const [dx, dz, spin] = spots[i];
    const at = p.local(dx, dz);
    chair(b, at.x, at.z, yaw + spin);
  }
}

/** Cadeira de uma peça, casco curvo. */
export function chair(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.46, 0.07, 0.46, b.palette.gloss, 0, 0.45, 0);
  p.box(0.46, 0.55, 0.06, b.palette.gloss, 0, 0.72, -0.2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.025, 0.025, 0.45, 6, b.palette.chrome, sx * 0.18, 0.22, sz * 0.18);
  p.solid(0.26, 0.26, 0.5, 'cadeira');
}

/* ----------------------------- cozinha ------------------------------- */

/**
 * Bancada de cozinha: armários embaixo, tampo, armários aéreos.
 *
 * `sink` e `stove` abrem pia e cooktop no tampo, nas posições dadas em
 * metros a partir da ponta esquerda.
 */
export function kitchenRun(
  b: InteriorBuild,
  x: number,
  z: number,
  yaw: number,
  length: number,
  options: { sink?: number; stove?: number; uppers?: boolean } = {},
): void {
  const p = b.at(x, z, yaw);
  p.box(length, 0.86, 0.62, b.palette.gloss, 0, 0.43, 0);
  p.box(length, 0.06, 0.68, b.palette.trim, 0, 0.89, 0);
  // Portas dos armários, com puxador.
  const doors = Math.max(1, Math.round(length / 0.62));
  for (let i = 0; i < doors; i += 1) {
    const dx = -length / 2 + length / doors / 2 + (i * length) / doors;
    p.box(length / doors - 0.05, 0.78, 0.03, b.palette.glossAqua, dx, 0.45, 0.33);
    p.box(0.3, 0.025, 0.025, b.palette.chrome, dx, 0.78, 0.36);
  }
  if (options.sink !== undefined) {
    const dx = -length / 2 + options.sink;
    p.box(0.56, 0.1, 0.42, b.palette.aluminium, dx, 0.88, 0);
    p.box(0.48, 0.03, 0.34, b.palette.water, dx, 0.9, 0);
    p.cyl(0.022, 0.022, 0.3, 8, b.palette.chrome, dx, 1.05, -0.2);
    p.box(0.03, 0.03, 0.18, b.palette.chrome, dx, 1.2, -0.12);
  }
  if (options.stove !== undefined) {
    const dx = -length / 2 + options.stove;
    p.box(0.58, 0.04, 0.5, b.palette.graphite, dx, 0.93, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.1, 0.1, 0.015, 12, b.palette.chrome, dx + sx * 0.14, 0.955, sz * 0.12);
  }
  if (options.uppers !== false) {
    p.box(length, 0.72, 0.36, b.palette.gloss, 0, 1.95, -0.14);
    p.box(length - 0.04, 0.05, 0.38, b.palette.neonAqua, 0, 1.57, -0.12);
    for (let i = 0; i < doors; i += 1) {
      const dx = -length / 2 + length / doors / 2 + (i * length) / doors;
      p.box(0.26, 0.022, 0.022, b.palette.chrome, dx, 1.64, 0.05);
    }
  }
  p.solid(length / 2, 0.34, 0.92, 'bancada');
}

/** Geladeira de duas portas. */
export function fridge(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.78, 1.95, 0.7, b.palette.aluminium, 0, 0.975, 0);
  p.box(0.74, 1.2, 0.04, b.palette.gloss, 0, 1.33, 0.36);
  p.box(0.74, 0.68, 0.04, b.palette.gloss, 0, 0.37, 0.36);
  p.box(0.03, 0.9, 0.03, b.palette.chrome, 0.3, 1.33, 0.4);
  p.box(0.03, 0.5, 0.03, b.palette.chrome, 0.3, 0.42, 0.4);
  p.box(0.22, 0.14, 0.02, b.palette.screen, -0.2, 1.6, 0.38);
  p.solid(0.4, 0.36, 1.95, 'geladeira');
}

/* ------------------------------ quarto ------------------------------- */

/** Cama de casal, com cabeceira e criado-mudo opcional. */
export function bed(b: InteriorBuild, x: number, z: number, yaw: number, width = 1.6): void {
  const p = b.at(x, z, yaw);
  p.box(width, 0.3, 2.0, b.palette.wood, 0, 0.3, 0);
  p.box(width - 0.08, 0.26, 1.94, b.palette.linen, 0, 0.58, 0.02);
  p.box(width, 0.9, 0.14, b.palette.fabric, 0, 0.75, -1.03);
  p.box(width - 0.3, 0.26, 0.75, b.palette.glossAqua, 0, 0.73, 0.55);
  for (const sx of [-1, 1]) p.box(0.46, 0.14, 0.3, b.palette.gloss, sx * 0.34, 0.78, -0.72);
  p.solid(width / 2, 1.0, 0.7, 'cama');
}

/** Guarda-roupa de portas espelhadas. */
export function wardrobe(b: InteriorBuild, x: number, z: number, yaw: number, width = 1.8): void {
  const p = b.at(x, z, yaw);
  p.box(width, 2.3, 0.6, b.palette.gloss, 0, 1.15, 0);
  p.box(width / 2 - 0.05, 2.1, 0.03, b.palette.glass, -width / 4, 1.16, 0.31);
  p.box(width / 2 - 0.05, 2.1, 0.03, b.palette.glossAqua, width / 4, 1.16, 0.31);
  for (const sx of [-1, 1]) p.box(0.025, 0.5, 0.025, b.palette.chrome, sx * 0.08, 1.2, 0.34);
  p.solid(width / 2, 0.3, 2.3, 'guarda-roupa');
}

/** Criado-mudo com abajur aceso. */
export function nightstand(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.48, 0.52, 0.42, b.palette.wood, 0, 0.26, 0);
  p.box(0.42, 0.03, 0.36, b.palette.gloss, 0, 0.53, 0);
  p.cyl(0.04, 0.06, 0.22, 8, b.palette.chrome, 0, 0.64, 0);
  p.cyl(0.13, 0.09, 0.2, 12, b.palette.lampOn, 0, 0.85, 0);
  p.lamp(0xffd9a6, 2.2, 4, 0, 0.9, 0);
  p.solid(0.25, 0.22, 0.55, 'criado-mudo');
}

/* ----------------------------- banheiro ------------------------------ */

/** Vaso sanitário. */
export function toilet(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.36, 0.78, 0.2, b.palette.gloss, 0, 0.39, -0.3);
  p.cyl(0.21, 0.17, 0.4, 14, b.palette.gloss, 0, 0.2, 0);
  p.cyl(0.23, 0.23, 0.06, 14, b.palette.gloss, 0, 0.42, 0);
  p.box(0.14, 0.03, 0.08, b.palette.chrome, 0, 0.8, -0.2);
  p.solid(0.25, 0.3, 0.8, 'vaso');
}

/** Pia de banheiro com espelho. */
export function bathSink(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.8, 0.5, 0.45, b.palette.gloss, 0, 0.62, 0);
  p.box(0.84, 0.05, 0.5, b.palette.trim, 0, 0.89, 0);
  p.cyl(0.19, 0.15, 0.1, 14, b.palette.gloss, 0, 0.89, 0);
  p.cyl(0.02, 0.02, 0.22, 8, b.palette.chrome, 0, 1.02, -0.14);
  p.box(0.7, 0.9, 0.03, b.palette.glass, 0, 1.65, -0.2);
  p.box(0.76, 0.05, 0.05, b.palette.neonAqua, 0, 2.14, -0.2);
  p.solid(0.4, 0.24, 0.92, 'pia');
}

/** Box de chuveiro, com vidro e ralo. */
export function shower(b: InteriorBuild, x: number, z: number, yaw: number, w = 1.0, d = 1.0): void {
  const p = b.at(x, z, yaw);
  p.box(w, 0.1, d, b.palette.floorTile, 0, 0.05, 0);
  p.box(w, 2.2, 0.03, b.palette.glass, 0, 1.1, d / 2);
  p.box(0.03, 2.2, d, b.palette.glass, w / 2, 1.1, 0);
  p.box(w, 0.05, 0.05, b.palette.chrome, 0, 2.2, d / 2);
  p.cyl(0.02, 0.02, 0.3, 8, b.palette.chrome, 0, 2.05, -d / 2 + 0.15);
  p.cyl(0.1, 0.1, 0.04, 12, b.palette.chrome, 0, 1.9, -d / 2 + 0.3);
  p.solid(w / 2, d / 2, 0.12, 'box');
}

/* ------------------------------ lojas -------------------------------- */

/** Balcão de atendimento, com tampo e frente iluminada. */
export function counter(b: InteriorBuild, x: number, z: number, yaw: number, length = 2.6): void {
  const p = b.at(x, z, yaw);
  p.box(length, 1.0, 0.7, b.palette.gloss, 0, 0.5, 0);
  p.box(length + 0.16, 0.08, 0.84, b.palette.trim, 0, 1.03, 0);
  p.box(length - 0.1, 0.09, 0.03, b.palette.neonAqua, 0, 0.3, 0.36);
  p.box(length - 0.6, 0.55, 0.02, b.palette.glass, 0, 1.35, -0.1);
  p.solid(length / 2, 0.38, 1.05, 'balcao');
}

/** Vitrine de vidro iluminada, com produtos dentro. */
export function displayCase(b: InteriorBuild, x: number, z: number, yaw: number, length = 1.8, tone?: THREE.Material): void {
  const p = b.at(x, z, yaw);
  const product = tone ?? b.palette.glossAqua;
  p.box(length, 0.78, 0.66, b.palette.gloss, 0, 0.39, 0);
  p.box(length, 1.0, 0.62, b.palette.glass, 0, 1.3, 0);
  p.box(length + 0.08, 0.06, 0.7, b.palette.trim, 0, 0.81, 0);
  p.box(length + 0.08, 0.06, 0.7, b.palette.trim, 0, 1.83, 0);
  p.box(length - 0.2, 0.04, 0.5, b.palette.neonAqua, 0, 1.78, 0);
  const slots = Math.max(2, Math.round(length / 0.6));
  for (let i = 0; i < slots; i += 1) {
    const dx = -length / 2 + length / slots / 2 + (i * length) / slots;
    p.box(0.3, 0.18, 0.22, product, dx, 0.95, 0);
    p.box(0.26, 0.02, 0.18, b.palette.screen, dx, 1.05, 0);
  }
  p.lamp(0xbdf0ff, 2.2, 4.5, 0, 1.7, 0);
  p.solid(length / 2, 0.35, 1.85, 'vitrine');
}

/** Gôndola de supermercado: dois lados de prateleira cheios. */
export function aisleShelf(b: InteriorBuild, x: number, z: number, yaw: number, length = 4.0, height = 1.9): void {
  const p = b.at(x, z, yaw);
  p.box(length, height, 0.12, b.palette.aluminium, 0, height / 2, 0);
  p.box(length, 0.1, 0.9, b.palette.aluminium, 0, 0.06, 0);
  const tones = [b.palette.glossRose, b.palette.glossMint, b.palette.glossAmber, b.palette.glossAqua, b.palette.gloss];
  for (let level = 0; level < 4; level += 1) {
    const y = 0.4 + level * 0.44;
    for (const side of [-1, 1]) {
      p.box(length, 0.05, 0.42, b.palette.aluminium, 0, y, side * 0.26);
      p.box(length, 0.07, 0.03, b.palette.trim, 0, y + 0.04, side * 0.46);
      const items = Math.max(3, Math.round(length / 0.34));
      for (let i = 0; i < items; i += 1) {
        const dx = -length / 2 + 0.2 + i * ((length - 0.4) / Math.max(1, items - 1));
        const h = 0.2 + ((i * 5 + level * 3) % 4) * 0.035;
        p.box(0.22, h, 0.26, tones[(i + level + (side > 0 ? 1 : 0)) % tones.length], dx, y + h / 2 + 0.03, side * 0.26);
      }
    }
  }
  p.solid(length / 2, 0.5, height, 'gondola');
}

/** Caixa registradora: bancada, esteira e terminal. */
export function checkout(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(2.2, 0.95, 0.75, b.palette.gloss, 0, 0.47, 0);
  p.box(2.3, 0.06, 0.82, b.palette.trim, 0, 0.98, 0);
  p.box(1.3, 0.03, 0.46, b.palette.graphite, -0.35, 1.0, 0);
  p.box(0.36, 0.3, 0.26, b.palette.graphite, 0.72, 1.14, 0);
  p.box(0.32, 0.24, 0.02, b.palette.screen, 0.72, 1.16, 0.14);
  p.box(2.1, 0.08, 0.03, b.palette.neonAqua, 0, 0.3, 0.38);
  p.cyl(0.05, 0.05, 1.9, 8, b.palette.chrome, 1.25, 0.95, 0);
  p.box(0.5, 0.3, 0.05, b.palette.glossAqua, 1.25, 2.0, 0);
  p.solid(1.1, 0.4, 1.0, 'caixa');
}

/** Araras e prateleiras de parede, para produtos leves. */
export function wallShelf(b: InteriorBuild, x: number, z: number, yaw: number, length = 2.4, levels = 3): void {
  const p = b.at(x, z, yaw);
  const tones = [b.palette.glossAqua, b.palette.glossMint, b.palette.glossRose, b.palette.glossAmber];
  for (let i = 0; i < levels; i += 1) {
    const y = 0.8 + i * 0.6;
    p.box(length, 0.06, 0.34, b.palette.gloss, 0, y, 0);
    p.box(length, 0.04, 0.03, b.palette.neonAqua, 0, y - 0.05, 0.16);
    const items = Math.max(2, Math.round(length / 0.5));
    for (let k = 0; k < items; k += 1) {
      const dx = -length / 2 + 0.25 + k * ((length - 0.5) / Math.max(1, items - 1));
      p.box(0.26, 0.3, 0.22, tones[(k + i) % tones.length], dx, y + 0.18, 0);
    }
  }
  p.solid(length / 2, 0.18, 0.8 + levels * 0.6, 'prateleira');
}

/* --------------------------- eletrônicos ----------------------------- */

/** Mesa de demonstração com notebooks abertos. */
export function demoTable(b: InteriorBuild, x: number, z: number, yaw: number, units = 3): void {
  const p = b.at(x, z, yaw);
  const length = Math.max(1.6, units * 0.95);
  p.box(length, 0.08, 0.8, b.palette.gloss, 0, 0.78, 0);
  p.box(length - 0.2, 0.05, 0.68, b.palette.neonAqua, 0, 0.72, 0);
  for (const sx of [-1, 1]) p.box(0.12, 0.74, 0.7, b.palette.aluminium, sx * (length / 2 - 0.18), 0.37, 0);
  for (let i = 0; i < units; i += 1) {
    const dx = -length / 2 + length / units / 2 + (i * length) / units;
    p.box(0.42, 0.02, 0.3, b.palette.aluminium, dx, 0.83, 0.04);
    p.box(0.42, 0.28, 0.015, b.palette.graphite, dx, 0.96, -0.11, 0.18);
    p.box(0.38, 0.24, 0.01, b.palette.screen, dx, 0.96, -0.1, 0.18);
  }
  p.solid(length / 2, 0.44, 0.86, 'mesa-demo');
}

/** Pedestal de celular, com aparelho em pé e luz por baixo. */
export function phonePedestal(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.cyl(0.26, 0.32, 0.92, 16, b.palette.gloss, 0, 0.46, 0);
  p.cyl(0.3, 0.3, 0.04, 16, b.palette.neonAqua, 0, 0.1, 0);
  p.cyl(0.28, 0.26, 0.05, 16, b.palette.trim, 0, 0.95, 0);
  p.box(0.16, 0.3, 0.02, b.palette.graphite, 0, 1.12, 0, 0.1);
  p.box(0.14, 0.27, 0.008, b.palette.screen, 0, 1.12, 0.012, 0.1);
  p.lamp(0x8fe6ff, 1.2, 2.6, 0, 1.2, 0);
  p.solid(0.32, 0.32, 1.0, 'pedestal');
}

/** Painel de telas na parede. */
export function screenWall(b: InteriorBuild, x: number, z: number, yaw: number, columns = 3, rows = 2): void {
  const p = b.at(x, z, yaw);
  const w = columns * 0.92;
  const h = rows * 0.62;
  p.box(w + 0.2, h + 0.2, 0.1, b.palette.graphite, 0, 1.2 + h / 2, 0);
  for (let c = 0; c < columns; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const dx = -w / 2 + 0.46 + c * 0.92;
      const dy = 1.3 + r * 0.62;
      p.box(0.82, 0.52, 0.03, b.palette.screen, dx, dy, 0.06);
    }
  }
  p.lamp(0x5fc8ff, 2.6, 6, 0, 1.2 + h / 2, 0.8);
}

/** Rack de servidor piscando, para salas técnicas. */
export function serverRack(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.7, 2.0, 0.8, b.palette.graphite, 0, 1.0, 0);
  for (let i = 0; i < 9; i += 1) {
    p.box(0.6, 0.14, 0.03, b.palette.aluminium, 0, 0.3 + i * 0.19, 0.41);
    p.box(0.07, 0.05, 0.02, i % 3 === 0 ? b.palette.neonRose : b.palette.neonAqua, 0.22, 0.3 + i * 0.19, 0.43);
  }
  p.lamp(0x4fd8ff, 1.1, 3, 0, 1.2, 0.5);
  p.solid(0.35, 0.4, 2.0, 'rack');
}

/* ------------------------------ bichos ------------------------------- */

/** Recanto cercado para os bichos, com caminha e tigela. */
export function petPen(b: InteriorBuild, x: number, z: number, yaw: number, w = 3.0, d = 2.4): void {
  const p = b.at(x, z, yaw);
  p.box(w, 0.08, d, b.palette.carpet, 0, 0.04, 0);
  for (const [bw, bd, dx, dz] of [
    [w, 0.12, 0, -d / 2],
    [w, 0.12, 0, d / 2],
    [0.12, d, -w / 2, 0],
    [0.12, d, w / 2, 0],
  ] as const) {
    p.box(bw, 0.55, bd, b.palette.glossMint, dx, 0.28, dz);
    p.box(bw, 0.06, bd + 0.06, b.palette.gloss, dx, 0.58, dz);
  }
  p.cyl(0.42, 0.46, 0.18, 14, b.palette.glossRose, -w / 4, 0.17, 0);
  p.cyl(0.36, 0.36, 0.1, 14, b.palette.linen, -w / 4, 0.26, 0);
  p.cyl(0.14, 0.11, 0.1, 12, b.palette.gloss, w / 4, 0.13, d / 4);
  p.cyl(0.11, 0.11, 0.03, 12, b.palette.water, w / 4, 0.17, d / 4);
  p.sph(0.1, b.palette.glossAmber, w / 4 - 0.4, 0.18, -d / 4);
  // Cercado baixo: o jogador contorna, o olhar passa por cima.
  p.solid(w / 2, 0.08, 0.6, 'cerca-n', 0, -d / 2);
  p.solid(w / 2, 0.08, 0.6, 'cerca-s', 0, d / 2);
  p.solid(0.08, d / 2, 0.6, 'cerca-o', -w / 2, 0);
  p.solid(0.08, d / 2, 0.6, 'cerca-l', w / 2, 0);
}

/** Aquário iluminado sobre base. */
export function aquarium(b: InteriorBuild, x: number, z: number, yaw: number, w = 1.5): void {
  const p = b.at(x, z, yaw);
  p.box(w, 0.75, 0.6, b.palette.woodDark, 0, 0.38, 0);
  p.box(w, 0.9, 0.56, b.palette.glass, 0, 1.22, 0);
  p.box(w - 0.08, 0.78, 0.5, b.palette.water, 0, 1.18, 0);
  p.box(w, 0.09, 0.62, b.palette.trim, 0, 1.71, 0);
  p.box(w - 0.2, 0.04, 0.4, b.palette.neonAqua, 0, 1.66, 0);
  p.box(w - 0.1, 0.1, 0.46, b.palette.soil, 0, 0.82, 0);
  for (let i = 0; i < 4; i += 1) {
    p.box(0.05, 0.3 + (i % 3) * 0.1, 0.05, b.palette.leaf, -w / 2 + 0.25 + i * (w / 5), 1.0, (i % 2) * 0.12 - 0.06);
  }
  p.lamp(0x6fe0ff, 1.6, 3.4, 0, 1.5, 0);
  p.solid(w / 2, 0.3, 1.75, 'aquario');
}

/** Torre de arranhar, para gatos. */
export function scratchPost(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.7, 0.1, 0.7, b.palette.carpet, 0, 0.05, 0);
  p.cyl(0.11, 0.11, 1.1, 10, b.palette.glossAmber, 0, 0.65, 0);
  p.box(0.6, 0.1, 0.6, b.palette.carpet, 0, 1.25, 0);
  p.cyl(0.09, 0.09, 0.6, 10, b.palette.glossAmber, 0.18, 1.6, 0.18);
  p.cyl(0.3, 0.3, 0.1, 12, b.palette.glossRose, 0.18, 1.95, 0.18);
  p.sph(0.07, b.palette.glossMint, -0.2, 1.38, -0.2);
  p.solid(0.35, 0.35, 2.0, 'arranhador');
}

/** Viveiro de pássaros, vertical e arejado. */
export function birdCage(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.cyl(0.38, 0.42, 0.5, 14, b.palette.gloss, 0, 0.25, 0);
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    p.cyl(0.015, 0.015, 1.5, 5, b.palette.chrome, Math.cos(a) * 0.36, 1.25, Math.sin(a) * 0.36);
  }
  p.cyl(0.38, 0.38, 0.06, 14, b.palette.chrome, 0, 0.53, 0);
  p.cyl(0.1, 0.4, 0.3, 14, b.palette.gloss, 0, 2.12, 0);
  p.box(0.5, 0.02, 0.02, b.palette.wood, 0, 1.3, 0);
  p.sph(0.08, b.palette.glossAqua, 0.12, 1.4, 0);
  p.solid(0.42, 0.42, 2.2, 'viveiro');
}

/* ------------------------------ público ------------------------------ */

/** Balcão curvo de recepção, com totem de senha ao lado. */
export function receptionDesk(b: InteriorBuild, x: number, z: number, yaw: number, length = 4.2): void {
  const p = b.at(x, z, yaw);
  p.box(length, 1.12, 0.9, b.palette.gloss, 0, 0.56, 0);
  p.box(length + 0.3, 0.09, 1.1, b.palette.trim, 0, 1.16, 0);
  p.box(length - 0.2, 0.1, 0.04, b.palette.neonAqua, 0, 0.34, 0.47);
  for (const sx of [-1, 1]) p.cyl(0.42, 0.42, 1.12, 16, b.palette.gloss, sx * length / 2, 0.56, 0);
  for (let i = 0; i < 3; i += 1) {
    p.box(0.34, 0.26, 0.2, b.palette.graphite, -length / 3 + i * (length / 3), 1.33, -0.2);
    p.box(0.3, 0.22, 0.02, b.palette.screen, -length / 3 + i * (length / 3), 1.33, -0.09);
  }
  p.solid(length / 2 + 0.42, 0.5, 1.2, 'recepcao');
}

/** Banco de espera, três lugares, sem encosto. */
export function waitingBench(b: InteriorBuild, x: number, z: number, yaw: number, length = 2.4): void {
  const p = b.at(x, z, yaw);
  p.box(length, 0.12, 0.56, b.palette.gloss, 0, 0.44, 0);
  p.box(length - 0.1, 0.1, 0.5, b.palette.fabric, 0, 0.53, 0);
  for (const sx of [-1, 1]) p.box(0.1, 0.44, 0.5, b.palette.chrome, sx * (length / 2 - 0.2), 0.22, 0);
  p.solid(length / 2, 0.3, 0.6, 'banco');
}

/** Totem de informação, com tela em pé. */
export function infoTotem(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.cyl(0.3, 0.38, 0.1, 16, b.palette.trim, 0, 0.05, 0);
  p.box(0.62, 1.7, 0.18, b.palette.gloss, 0, 0.9, 0);
  p.box(0.52, 0.9, 0.03, b.palette.screen, 0, 1.3, 0.1, 0);
  p.box(0.62, 0.06, 0.2, b.palette.neonAqua, 0, 1.78, 0);
  p.lamp(0x7fdcff, 1.2, 3, 0, 1.4, 0.4);
  p.solid(0.32, 0.14, 1.8, 'totem');
}

/** Mesa de escritório com cadeira e computador. */
export function officeDesk(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(1.6, 0.07, 0.8, b.palette.gloss, 0, 0.75, 0);
  for (const sx of [-1, 1]) p.box(0.08, 0.72, 0.72, b.palette.aluminium, sx * 0.74, 0.36, 0);
  p.box(0.52, 0.6, 0.6, b.palette.glossAqua, -0.5, 0.42, -0.06);
  p.box(0.52, 0.34, 0.02, b.palette.graphite, 0.25, 1.05, -0.2);
  p.box(0.48, 0.3, 0.01, b.palette.screen, 0.25, 1.05, -0.19);
  p.cyl(0.05, 0.07, 0.17, 10, b.palette.chrome, 0.25, 0.87, -0.2);
  p.box(0.34, 0.015, 0.13, b.palette.gloss, 0.25, 0.79, 0.12);
  p.solid(0.8, 0.4, 0.8, 'mesa-escritorio');
  const seat = p.local(0, 0.95);
  officeChair(b, seat.x, seat.z, yaw + Math.PI);
}

/** Cadeira giratória de cinco pés. */
export function officeChair(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.5, 0.1, 0.48, b.palette.fabric, 0, 0.47, 0);
  p.box(0.48, 0.6, 0.09, b.palette.fabric, 0, 0.78, -0.2);
  p.cyl(0.05, 0.05, 0.4, 8, b.palette.chrome, 0, 0.24, 0);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    p.box(0.3, 0.05, 0.06, b.palette.graphite, Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15, -a);
  }
  p.solid(0.3, 0.3, 0.85, 'cadeira-giratoria');
}

/** Bebedouro de corredor. */
export function waterCooler(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.box(0.4, 1.0, 0.38, b.palette.gloss, 0, 0.5, 0);
  p.cyl(0.17, 0.14, 0.45, 14, b.palette.water, 0, 1.22, 0);
  p.cyl(0.08, 0.14, 0.12, 12, b.palette.gloss, 0, 0.99, 0);
  p.box(0.12, 0.1, 0.1, b.palette.chrome, 0, 0.8, 0.22);
  p.solid(0.22, 0.2, 1.45, 'bebedouro');
}

/* ---------------------------- decoração ------------------------------ */

/** Vaso com planta — a decoração mais reusada do Éden. */
export function planter(b: InteriorBuild, x: number, z: number, yaw: number, scale = 1): void {
  const p = b.at(x, z, yaw);
  p.cyl(0.26 * scale, 0.2 * scale, 0.42 * scale, 14, b.palette.ceramic, 0, 0.21 * scale, 0);
  p.cyl(0.24 * scale, 0.24 * scale, 0.05 * scale, 14, b.palette.soil, 0, 0.42 * scale, 0);
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const lean = 0.17 * scale;
    p.box(0.07 * scale, 0.66 * scale, 0.2 * scale, i % 2 ? b.palette.leaf : b.palette.leafPale, Math.cos(a) * lean, (0.72 + (i % 3) * 0.1) * scale, Math.sin(a) * lean, a);
  }
  p.solid(0.26 * scale, 0.26 * scale, 0.45 * scale, 'vaso');
}

/** Jardineira comprida, para separar ambientes sem fechar. */
export function plantBox(b: InteriorBuild, x: number, z: number, yaw: number, length = 2.2): void {
  const p = b.at(x, z, yaw);
  p.box(length, 0.5, 0.5, b.palette.ceramic, 0, 0.25, 0);
  p.box(length - 0.1, 0.06, 0.42, b.palette.soil, 0, 0.5, 0);
  const tufts = Math.max(3, Math.round(length / 0.42));
  for (let i = 0; i < tufts; i += 1) {
    const dx = -length / 2 + 0.22 + i * ((length - 0.44) / Math.max(1, tufts - 1));
    p.box(0.14, 0.5 + (i % 3) * 0.12, 0.18, i % 2 ? b.palette.leaf : b.palette.leafPale, dx, 0.78, 0);
  }
  p.solid(length / 2, 0.26, 0.55, 'jardineira');
}

/** Quadro ou painel na parede. */
export function wallArt(b: InteriorBuild, x: number, z: number, yaw: number, w = 1.1, h = 0.8): void {
  const p = b.at(x, z, yaw);
  p.box(w + 0.08, h + 0.08, 0.05, b.palette.trim, 0, 1.75, 0);
  p.box(w, h, 0.02, b.palette.glossAqua, 0, 1.75, 0.03);
  p.box(w * 0.55, h * 0.4, 0.01, b.palette.glossMint, -w * 0.1, 1.68, 0.04);
  p.box(w * 0.3, h * 0.25, 0.01, b.palette.gloss, w * 0.25, 1.86, 0.04);
}

/** Luminária de chão. */
export function floorLamp(b: InteriorBuild, x: number, z: number, yaw: number): void {
  const p = b.at(x, z, yaw);
  p.cyl(0.22, 0.26, 0.05, 14, b.palette.chrome, 0, 0.03, 0);
  p.cyl(0.03, 0.03, 1.6, 8, b.palette.chrome, 0, 0.83, 0);
  p.cyl(0.26, 0.17, 0.3, 14, b.palette.lampOn, 0, 1.75, 0);
  p.lamp(0xffe3b8, 3.2, 6, 0, 1.7, 0);
  p.solid(0.22, 0.22, 1.9, 'luminaria');
}

/** Pendente sobre mesa ou balcão. */
export function pendantLamp(b: InteriorBuild, x: number, z: number, height: number, color = 0xffe9c4): void {
  const p = b.at(x, z, 0);
  p.cyl(0.015, 0.015, height - 2.0, 6, b.palette.chrome, 0, (height + 2.0) / 2, 0);
  p.cyl(0.26, 0.1, 0.24, 14, b.palette.lampOn, 0, 1.92, 0);
  p.lamp(color, 3.4, 6.5, 0, 1.8, 0);
}

/** Tapete de boas-vindas com o nome da casa. */
export function doormat(b: InteriorBuild, x: number, z: number, yaw: number): void {
  b.at(x, z, yaw).box(1.8, 0.03, 1.1, b.palette.carpet, 0, 0.016, 0).box(1.4, 0.035, 0.75, b.palette.glossAqua, 0, 0.018, 0);
}
