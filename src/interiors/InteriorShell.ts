/**
 * A casca do prédio: piso, paredes, teto, janelas e escada.
 *
 * O que estava errado antes:
 *
 * - **o piso tinha buracos.** Cada cômodo ganhava uma laje do tamanho
 *   do próprio retângulo, e qualquer ponto fora dele não tinha chão.
 *   Fora do chão, o motor lia o relevo (−7 m) e o jogador "nadava".
 * - **só o térreo existia.** Um prédio de três andares construía um.
 *   A loja EdenTech, declarada no primeiro andar da Torre Zênite,
 *   nunca foi montada — a escada só mostrava um aviso.
 * - **as paredes eram por cômodo.** Dois cômodos encostados erguiam
 *   duas paredes no mesmo lugar, ou nenhuma, dependendo de um teste
 *   de centro que falhava em qualquer planta em L.
 *
 * A correção é classificar cada trecho de parede percorrendo o
 * perímetro de cada cômodo e perguntando, metro a metro: **do outro
 * lado tem cômodo?** Se tem, é divisória (e ganha vão de passagem).
 * Se não tem, é fachada (e ganha janela). Assim qualquer planta —
 * em L, em U, com pátio — fecha certo, sem caso particular.
 */

import * as THREE from 'three';
import type { InteriorDef, InteriorRoom, RoomKind } from './Interior';
import { roomsOnFloor } from './Interior';
import { FLOOR_HEIGHT, type InteriorBuild, type Rect, WALL_THICKNESS } from './InteriorKit';
import type { InteriorPalette } from './InteriorPalette';

/** Passo de amostragem ao classificar o perímetro, em metros. */
const PROBE = 0.25;
/** Vão mínimo para virar passagem entre dois cômodos. */
const MIN_OPENING = 2.2;
/** Altura de subida de um degrau. Abaixo do passo do jogador (0,42 m). */
const STEP_RISE = 0.34;

/** Acabamento de piso por tipo de cômodo. */
export function floorFinish(palette: InteriorPalette, kind: RoomKind | undefined, category: InteriorDef['category']): { material: THREE.Material; surface: 'wood' | 'stone' } {
  switch (kind) {
    case 'sala':
    case 'quarto':
      return { material: palette.floorWood, surface: 'wood' };
    case 'banheiro':
    case 'cozinha':
      return { material: palette.floorTile, surface: 'stone' };
    case 'varanda':
      return { material: palette.floorWood, surface: 'wood' };
    case 'corredor':
      return { material: palette.floorLight, surface: 'stone' };
    default:
      break;
  }
  if (category === 'casa' || category === 'apartamento') return { material: palette.floorWood, surface: 'wood' };
  return { material: palette.floorLight, surface: 'stone' };
}

function contains(room: InteriorRoom, x: number, z: number): boolean {
  return x >= room.x && x <= room.x + room.w && z >= room.z && z <= room.z + room.d;
}

/** Subtrai um retângulo de outro, devolvendo até quatro pedaços. */
export function subtractRect(rect: Rect, hole: Rect | null): Rect[] {
  if (!hole) return [rect];
  const x0 = Math.max(rect.x, hole.x);
  const x1 = Math.min(rect.x + rect.w, hole.x + hole.w);
  const z0 = Math.max(rect.z, hole.z);
  const z1 = Math.min(rect.z + rect.d, hole.z + hole.d);
  if (x1 - x0 <= 0.01 || z1 - z0 <= 0.01) return [rect];
  const pieces: Rect[] = [];
  const push = (x: number, z: number, w: number, d: number): void => {
    if (w > 0.01 && d > 0.01) pieces.push({ x, z, w, d });
  };
  push(rect.x, rect.z, rect.w, z0 - rect.z);
  push(rect.x, z1, rect.w, rect.z + rect.d - z1);
  push(rect.x, z0, x0 - rect.x, z1 - z0);
  push(x1, z0, rect.x + rect.w - x1, z1 - z0);
  return pieces;
}

interface Span {
  /** Distância do início do lado até onde o trecho começa. */
  from: number;
  to: number;
  /**
   * Índice do cômodo vizinho do outro lado, ou −1 quando dá para a rua.
   *
   * Guardar **qual** é o vizinho, e não apenas se existe um, é o que
   * impede dois cômodos diferentes de virarem um trecho só. Uma
   * parede de corredor que encosta em duas salas precisa de duas
   * portas; tratada como um trecho único, ganhava uma só — e a
   * segunda sala ficava lacrada.
   */
  neighbour: number;
}

/**
 * Percorre um lado do cômodo e devolve os trechos com e sem vizinho.
 *
 * `(ax, az) → (bx, bz)` é o lado; `(nx, nz)` aponta para fora dele.
 */
function classify(ax: number, az: number, bx: number, bz: number, nx: number, nz: number, rooms: readonly InteriorRoom[], self: number): Span[] {
  const length = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.round(length / PROBE));
  const spans: Span[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const px = ax + (bx - ax) * t + nx * 0.2;
    const pz = az + (bz - az) * t + nz * 0.2;
    const neighbour = rooms.findIndex((room, index) => index !== self && contains(room, px, pz));
    const last = spans[spans.length - 1];
    if (last && last.neighbour === neighbour) last.to = ((i + 1) / steps) * length;
    else spans.push({ from: (i / steps) * length, to: ((i + 1) / steps) * length, neighbour });
  }
  return spans;
}

/** O retângulo que envolve todos os cômodos de um andar. */
export function footprintOf(rooms: readonly InteriorRoom[]): Rect {
  if (rooms.length === 0) return { x: 0, z: 0, w: 0, d: 0 };
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const room of rooms) {
    minX = Math.min(minX, room.x);
    minZ = Math.min(minZ, room.z);
    maxX = Math.max(maxX, room.x + room.w);
    maxZ = Math.max(maxZ, room.z + room.d);
  }
  return { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
}

/** Onde fica a escada de um prédio de mais de um andar. */
export function stairwellOf(interior: InteriorDef): Rect & { yaw: number } {
  if (interior.stairwell) return interior.stairwell;
  // Sem declaração, encosta a escada no canto mais afastado do térreo.
  const area = footprintOf(roomsOnFloor(interior, 0));
  const w = Math.min(4.4, area.w - 1);
  const d = Math.min(4.4, area.d - 1);
  return { x: area.x + area.w - w - 0.5, z: area.z + area.d - d - 0.5, w, d, yaw: Math.PI };
}

export interface ShellOptions {
  interior: InteriorDef;
  floor: number;
  /** Já há outro andar por cima deste? */
  hasFloorAbove: boolean;
}

/**
 * Levanta um andar inteiro: lajes, perímetro, divisórias e forro.
 *
 * Devolve o vão da escada deste andar, para quem for montar os
 * degraus saber onde eles cabem.
 */
export function buildShell(b: InteriorBuild, options: ShellOptions): void {
  const { interior, floor } = options;
  const rooms = roomsOnFloor(interior, floor);
  if (rooms.length === 0) return;
  const stair = interior.floors > 1 ? stairwellOf(interior) : null;
  // O buraco da laje só existe nos andares de cima: no térreo a
  // escada apoia no chão.
  const hole = floor > 0 ? stair : null;

  /* ------------------------------- piso ------------------------------- */
  for (const room of rooms) {
    const finish = floorFinish(b.palette, room.kind, interior.category);
    for (const piece of subtractRect({ x: room.x, z: room.z, w: room.w, d: room.d }, hole)) {
      b.floor(piece, finish.material, finish.surface, `piso:${room.id}`);
    }
    // Rodapé de luz junto à parede mais comprida: a assinatura da casa.
    b.mesh(new THREE.BoxGeometry(room.w - 0.5, 0.05, 0.07), b.palette.neonAqua, room.x + room.w / 2, 0.14, room.z + 0.18);
  }

  /* ------------------------- paredes e janelas ------------------------ */
  const entrance = interior.entrance;
  rooms.forEach((room, index) => {
    const sides: { ax: number; az: number; bx: number; bz: number; nx: number; nz: number }[] = [
      { ax: room.x, az: room.z, bx: room.x + room.w, bz: room.z, nx: 0, nz: -1 },
      { ax: room.x + room.w, az: room.z + room.d, bx: room.x, bz: room.z + room.d, nx: 0, nz: 1 },
      { ax: room.x, az: room.z + room.d, bx: room.x, bz: room.z, nx: -1, nz: 0 },
      { ax: room.x + room.w, az: room.z, bx: room.x + room.w, bz: room.z + room.d, nx: 1, nz: 0 },
    ];
    for (const side of sides) {
      const length = Math.hypot(side.bx - side.ax, side.bz - side.az);
      const ux = (side.bx - side.ax) / length;
      const uz = (side.bz - side.az) / length;
      for (const span of classify(side.ax, side.az, side.bx, side.bz, side.nx, side.nz, rooms, index)) {
        const width = span.to - span.from;
        if (width < 0.05) continue;
        const x1 = side.ax + ux * span.from;
        const z1 = side.az + uz * span.from;
        const x2 = side.ax + ux * span.to;
        const z2 = side.az + uz * span.to;

        if (span.neighbour !== -1) {
          // Divisória: constrói só uma vez por par de cômodos, e abre
          // passagem quando o trecho comporta uma porta.
          if (span.neighbour < index) continue;
          if (width <= MIN_OPENING) continue; // vão largo: ambientes contínuos
          // A passagem vai onde o projeto mandou; no meio, só se o
          // projeto não disser nada.
          const declared = (interior.openings ?? []).find(
            (opening) =>
              Math.abs((opening.x - x1) * uz - (opening.z - z1) * ux) < 0.7 &&
              (opening.x - x1) * ux + (opening.z - z1) * uz > 0.2 &&
              (opening.x - x1) * ux + (opening.z - z1) * uz < width - 0.2,
          );
          const at = declared ? (declared.x - x1) * ux + (declared.z - z1) * uz : width / 2;
          const gap = Math.min(declared?.width ?? 2.4, width - 0.8);
          b.wall(x1, z1, x2, z2, { material: b.palette.wall, gap: { at, width: gap }, suffix: `parede:divisoria:${room.id}` });
          continue;
        }

        // Fachada. A porta da rua, quando cai neste trecho, vira vão.
        const doorHere =
          floor === 0 &&
          entrance &&
          Math.abs((entrance.x - x1) * uz - (entrance.z - z1) * ux) < 0.6 &&
          (entrance.x - x1) * ux + (entrance.z - z1) * uz > -0.2 &&
          (entrance.x - x1) * ux + (entrance.z - z1) * uz < width + 0.2;
        if (doorHere) {
          const at = (entrance.x - x1) * ux + (entrance.z - z1) * uz;
          b.wall(x1, z1, x2, z2, { material: b.palette.wallAccent, gap: { at, width: 2.2 }, suffix: `parede:fachada:${room.id}` });
          continue;
        }
        // Janela quando o trecho é largo o bastante e o cômodo aceita.
        if (room.windows !== false && width >= 3.2) {
          const margin = Math.min(1.1, width * 0.18);
          const glass = width - margin * 2;
          b.wall(x1, z1, x1 + ux * margin, z1 + uz * margin, { material: b.palette.wall, suffix: `parede:fachada:${room.id}` });
          b.window(x1 + ux * margin, z1 + uz * margin, x1 + ux * (margin + glass), z1 + uz * (margin + glass), {
            sill: room.kind === 'varanda' ? 0.5 : 0.95,
            suffix: `parede:janela:${room.id}`,
          });
          b.wall(x1 + ux * (margin + glass), z1 + uz * (margin + glass), x2, z2, { material: b.palette.wall, suffix: `parede:fachada:${room.id}` });
          continue;
        }
        b.wall(x1, z1, x2, z2, { material: b.palette.wall, suffix: `parede:fachada:${room.id}` });
      }
    }
  });

  /* ------------------------------- teto -------------------------------- */
  for (const room of rooms) {
    b.ceiling({ x: room.x, z: room.z, w: room.w, d: room.d }, { panel: !options.hasFloorAbove, cove: true });
  }
}

/**
 * A escada, medida: onde começa, para onde sobe, quantos degraus.
 *
 * Tudo que precisa saber a forma da escada — os degraus, o corrimão,
 * o guarda-corpo do vão lá em cima, e as pessoas que sobem por ela —
 * lê daqui. Era a falta disto que deixava cada pedaço com a sua
 * própria ideia de qual lado era o de cima.
 */
export interface StairFlight {
  /** `true` quando a subida corre ao longo de Z. */
  alongZ: boolean;
  /** `+1` sobe no sentido positivo do eixo; `−1`, no oposto. */
  forward: 1 | -1;
  /** Coordenada, no eixo da subida, onde o primeiro degrau encosta no piso. */
  start: number;
  /** Coordenada, no eixo da subida, onde o último degrau encontra o andar de cima. */
  end: number;
  /** Centro do vão no eixo transversal. */
  cross: number;
  run: number;
  width: number;
  steps: number;
  rise: number;
  depth: number;
  /**
   * Lado do vão por onde se chega ao andar de cima.
   *
   * O guarda-corpo fecha os outros três. Este era o erro que prendia
   * o jogador no supermercado: a boca era calculada invertida, então
   * o vidro ficava justamente em cima do último degrau — dava para
   * subir a escada inteira e não dava para pôr o pé no andar.
   */
  mouth: 'norte' | 'sul' | 'leste' | 'oeste';
}

/** Lê a geometria de um vão de escada. */
export function stairFlight(stair: Rect & { yaw: number }): StairFlight {
  const alongZ = stair.d >= stair.w;
  const run = alongZ ? stair.d : stair.w;
  const width = alongZ ? stair.w : stair.d;
  const steps = Math.max(2, Math.round(FLOOR_HEIGHT / STEP_RISE));
  // yaw = 0 sobe no sentido positivo do eixo; π sobe no sentido oposto.
  const forward: 1 | -1 = Math.cos(stair.yaw) >= 0 ? 1 : -1;
  const low = alongZ ? stair.z : stair.x;
  const high = low + run;
  return {
    alongZ,
    forward,
    start: forward > 0 ? low : high,
    end: forward > 0 ? high : low,
    cross: alongZ ? stair.x + stair.w / 2 : stair.z + stair.d / 2,
    run,
    width,
    steps,
    rise: FLOOR_HEIGHT / steps,
    depth: run / steps,
    // Chega-se em cima no fim da subida: se ela corre para o lado
    // negativo do eixo, a boca é a borda de menor coordenada.
    mouth: alongZ ? (forward > 0 ? 'sul' : 'norte') : forward > 0 ? 'leste' : 'oeste',
  };
}

/**
 * Altura do piso da escada no ponto (x, z) local, em metros acima do
 * andar de baixo — ou `null` fora do vão.
 *
 * É a mesma função que os colisores dos degraus descrevem, degrau a
 * degrau, e é com ela que as pessoas de dentro do prédio sobem: quem
 * anda e quem é desenhado pisam exatamente no mesmo lugar.
 */
export function stairHeightAt(stair: Rect & { yaw: number }, x: number, z: number): number | null {
  if (x < stair.x || x > stair.x + stair.w || z < stair.z || z > stair.z + stair.d) return null;
  const flight = stairFlight(stair);
  const along = flight.alongZ ? z : x;
  const travelled = (along - flight.start) * flight.forward;
  const index = Math.min(flight.steps - 1, Math.max(0, Math.floor(travelled / flight.depth)));
  return (index + 1) * flight.rise;
}

/**
 * Monta a escada que liga este andar ao de cima.
 *
 * Degraus de 34 cm — abaixo da altura de passo do jogador (42 cm), então
 * a subida é só andar para a frente, sem pulo e sem animação de escalar.
 * Cada degrau é pisável de verdade; o corrimão é sólido na parte alta do
 * lance, para ninguém cair de lado; e o guarda-corpo fecha o vão no andar
 * de cima **menos na boca**, que é por onde se chega.
 */
export function buildStaircase(b: InteriorBuild, stair: Rect & { yaw: number }, options: { withRailing: boolean }): void {
  const flight = stairFlight(stair);
  const { alongZ, forward, depth, rise, run, steps, width, cross } = flight;

  for (let i = 0; i < steps; i += 1) {
    const centre = flight.start + forward * (i * depth + depth / 2);
    const x = alongZ ? cross : centre;
    const z = alongZ ? centre : cross;
    const top = (i + 1) * rise;
    // Espelho do degrau, visível por baixo.
    b.mesh(
      new THREE.BoxGeometry(alongZ ? width : depth, top, alongZ ? depth : width),
      b.palette.floorLight,
      x,
      top / 2,
      z,
    );
    // O degrau é pisável e barra a câmera: sem isso ela mergulha por
    // dentro da escada e mostra o prédio pelo avesso.
    b.step(x, z, (alongZ ? width : depth) / 2, (alongZ ? depth : width) / 2, top, 0, `escada:${i}`, 'stone', {
      blocksCamera: true,
      thickness: Math.max(0.2, rise),
    });
    // Focinho iluminado: dá para ver onde pisar.
    b.mesh(
      new THREE.BoxGeometry(alongZ ? width - 0.2 : 0.06, 0.04, alongZ ? 0.06 : width - 0.2),
      b.palette.neonAqua,
      alongZ ? x : x + forward * depth * 0.45,
      top + 0.02,
      alongZ ? z + forward * depth * 0.45 : z,
    );
  }

  /* ------------------------------ corrimão ----------------------------- */
  // Acompanha a inclinação, em vez de flutuar na horizontal no meio do
  // lance. Os montantes nascem do degrau que está embaixo deles.
  const railPosts = Math.max(3, Math.round(run / 1.1));
  for (const side of [-1, 1]) {
    for (let i = 0; i <= railPosts; i += 1) {
      const t = i / railPosts;
      const along = flight.start + forward * t * run;
      const surface = Math.min(FLOOR_HEIGHT, Math.max(rise, (Math.floor((t * run) / depth) + 1) * rise));
      const offset = (side * (width - 0.16)) / 2;
      const x = alongZ ? cross + offset : along;
      const z = alongZ ? along : cross + offset;
      b.mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), b.palette.chrome, x, surface + 0.5, z);
    }
    // O passamão: uma barra por trecho, seguindo os degraus.
    const bars = steps;
    for (let i = 0; i < bars; i += 1) {
      const along = flight.start + forward * ((i + 0.5) * depth);
      const surface = (i + 1) * rise;
      const offset = (side * (width - 0.16)) / 2;
      const x = alongZ ? cross + offset : along;
      const z = alongZ ? along : cross + offset;
      b.mesh(
        new THREE.BoxGeometry(alongZ ? 0.08 : depth + 0.04, 0.08, alongZ ? depth + 0.04 : 0.08),
        b.palette.chrome,
        x,
        surface + 1.0,
        z,
      );
    }
    // Colisão do corrimão só na parte alta do lance: embaixo o jogador
    // ainda precisa poder entrar na escada de lado, que é como quase
    // todo mundo entra.
    const guarded = run * 0.62;
    const centreAlong = flight.start + forward * (run - guarded / 2);
    const offset = (side * (width - 0.1)) / 2;
    const rx = alongZ ? cross + offset : centreAlong;
    const rz = alongZ ? centreAlong : cross + offset;
    b.collide(
      rx,
      rz,
      (alongZ ? 0.1 : guarded) / 2,
      (alongZ ? guarded : 0.1) / 2,
      rise,
      FLOOR_HEIGHT + 1.0,
      0,
      `corrimao:${side > 0 ? 'direito' : 'esquerdo'}`,
    );
  }

  if (!options.withRailing) return;
  // Guarda-corpo em volta do vão no andar de cima, deixando a boca da
  // escada aberta. Sem isto, dá para cair no buraco — e com a boca no
  // lado errado, não dá para sair da escada.
  const top = FLOOR_HEIGHT;
  const edges: { x: number; z: number; w: number; d: number; id: StairFlight['mouth'] }[] = [
    { x: stair.x + stair.w / 2, z: stair.z, w: stair.w, d: 0.1, id: 'norte' },
    { x: stair.x + stair.w / 2, z: stair.z + stair.d, w: stair.w, d: 0.1, id: 'sul' },
    { x: stair.x, z: stair.z + stair.d / 2, w: 0.1, d: stair.d, id: 'oeste' },
    { x: stair.x + stair.w, z: stair.z + stair.d / 2, w: 0.1, d: stair.d, id: 'leste' },
  ];
  for (const edge of edges) {
    if (edge.id === flight.mouth) continue;
    b.mesh(new THREE.BoxGeometry(edge.w, 0.08, edge.d), b.palette.chrome, edge.x, top + 1.0, edge.z);
    b.mesh(new THREE.BoxGeometry(edge.w, 0.9, edge.d * 0.4), b.palette.glass, edge.x, top + 0.55, edge.z);
    b.collide(edge.x, edge.z, Math.max(edge.w, 0.12) / 2, Math.max(edge.d, 0.12) / 2, top, top + 1.1, 0, `guarda-corpo:${edge.id}`);
  }
}

/**
 * Painel de fundo visto pelas janelas.
 *
 * O exterior fica escondido enquanto o jogador está dentro do prédio,
 * então sem isto as janelas dariam para o vazio. São poucas caixas
 * bem longe: silhueta de torres, horizonte e um pouco de verde.
 */
export function buildBackdrop(b: InteriorBuild, area: Rect): void {
  const cx = area.x + area.w / 2;
  const cz = area.z + area.d / 2;
  const reach = Math.max(area.w, area.d) * 1.6 + 26;
  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2 + 0.3;
    const distance = reach + ((i * 37) % 17);
    const height = 10 + ((i * 53) % 9) * 3.2;
    const width = 6 + ((i * 29) % 7);
    b.mesh(
      new THREE.BoxGeometry(width, height, width),
      i % 3 === 0 ? b.palette.glossAqua : b.palette.wallAccent,
      cx + Math.cos(angle) * distance,
      height / 2 - 6,
      cz + Math.sin(angle) * distance,
    );
  }
  // Chão lá fora, para a vista não terminar no nada.
  b.mesh(new THREE.BoxGeometry(reach * 3, 0.6, reach * 3), b.palette.leafPale, cx, -6.4, cz);
}

/** Espessura das paredes, exportada para quem precisar alinhar móveis. */
export { WALL_THICKNESS };
