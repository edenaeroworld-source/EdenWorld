import { AVENUES, BUILDINGS, PLAZA, RING, TERRAIN_PATHS, forecourtRadius } from '../cities/aurora-city/Layout';
import { KEEP_OUT_CLEARANCE, type KeepOutZone, crossesKeepOut, insideKeepOut, keepOutsFor } from '../world/KeepOut';
import { BRIDGES as ROSAS_BRIDGES, PATHS as ROSAS_PATHS, PAVILIONS as ROSAS_PAVILIONS, ROSE_GARDEN as ROSAS_ROSE_GARDEN } from '../cities/rosas-park/RosasLayout';
import { TAU, type Point2, type Rng } from '../utils/math';

/**
 * Rede de caminhada das regiões.
 *
 * Um grafo de nós (pontos de passagem) e arestas (trechos caminháveis)
 * derivado da própria planta da região: em Aurora, praça, avenidas,
 * anel viário e trilhas; em Rosas Park, os caminhos do parque, as
 * pontes e os anéis do roseiral. É o que permite aos habitantes andar
 * sem atravessar prédios, canteiros ou água.
 *
 * Módulo puro: não depende de Three.js nem do DOM (testável).
 */

export type WalkKind = 'praca' | 'avenida' | 'anel' | 'caminho' | 'ponte';

export interface WalkNode {
  id: number;
  x: number;
  z: number;
  kind: WalkKind;
}

export interface WalkNetworkOptions {
  /** `true` para pontos onde ninguém pode pisar (água, encosta, obra). */
  blocked?: (x: number, z: number) => boolean;
  /**
   * `true` para trechos retos obstruídos por algo sólido no mundo
   * montado — uma árvore, um banco, um poste, a borda de uma fonte.
   *
   * A planta da cidade não sabe onde o paisagismo plantou o quê.
   * Enquanto esta consulta não existiu, a rede ligava dois pontos
   * atravessando o tronco, e os habitantes seguiam a ligação ao pé da
   * letra: passavam pela árvore.
   */
  edgeBlocked?: (ax: number, az: number, bx: number, bz: number) => boolean;
  /**
   * `true` quando um corpo que **vem de** (fromX, fromZ) não consegue
   * parar em (x, z).
   *
   * A planta diz por onde passa a calçada; não diz que o paisagismo
   * pôs um canteiro de 50 cm em cima dela. Quatro nós do anel da Praça
   * Central caíam dentro dos canteiros — pontos que parecem livres a
   * quem olha de cima (em cima do canteiro não há colisão) e são
   * inalcançáveis para quem anda pelo piso, 50 cm abaixo. Quem fosse
   * mandado para lá ficava empurrando a borda do canteiro para sempre.
   *
   * A pergunta cita a origem porque é ela que dá a altura dos pés: um
   * tabuleiro de ponte é intransponível para quem está embaixo e é
   * chão para quem já subiu.
   */
  pointBlocked?: (x: number, z: number, fromX: number, fromZ: number) => boolean;
  /**
   * Áreas proibidas desta região.
   *
   * O padrão é a lista declarada para a região, que é o que o jogo
   * usa. O parâmetro existe para que se possa **medir a regra
   * sozinha**: com uma zona de mentira sobre um trecho movimentado
   * dá para provar que a rede a contorna, sem depender de a física
   * estar ligada.
   */
  keepOuts?: readonly KeepOutZone[];
  /** Distância máxima (m) para ligar dois trechos vizinhos. */
  joinRadius?: number;
  /** Espaçamento (m) entre nós ao longo de um trecho. */
  spacing?: number;
}

interface RawNode {
  x: number;
  z: number;
  kind: WalkKind;
}

/** Distância máxima entre dois nós para serem considerados o mesmo ponto. */
/**
 * Folga entre a borda de uma área proibida e o ponto de passagem mais
 * próximo. Encostar a rede na barreira põe gente andando raspando nela.
 */
const KEEP_OUT_MARGIN = KEEP_OUT_CLEARANCE;

const MERGE_DISTANCE = 3.2;

/** `true` se o ponto cai dentro da base de um edifício (ou do seu pátio). */
export function insideBuilding(x: number, z: number, margin = 0.5): boolean {
  for (const lot of BUILDINGS) {
    if (Math.hypot(x - lot.x, z - lot.z) < lot.radius + margin) return true;
  }
  return false;
}

/** Reamostra uma polilinha em pontos igualmente espaçados. */
function resample(points: readonly Point2[], spacing: number): Point2[] {
  if (points.length === 0) return [];
  const out: Point2[] = [{ x: points[0].x, z: points[0].z }];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length <= 1e-6) continue;
    let travelled = spacing - carry;
    while (travelled <= length) {
      const t = travelled / length;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      travelled += spacing;
    }
    carry = (length - (travelled - spacing)) % spacing;
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > spacing * 0.45) out.push({ x: last.x, z: last.z });
  return out;
}

/** Grade espacial simples para consultas de vizinhança. */
class Grid {
  private readonly cells = new Map<number, number[]>();

  constructor(private readonly cellSize: number) {}

  private key(x: number, z: number): number {
    const i = Math.floor(x / this.cellSize) + 4096;
    const j = Math.floor(z / this.cellSize) + 4096;
    return j * 8192 + i;
  }

  add(x: number, z: number, index: number): void {
    const key = this.key(x, z);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
  }

  /** Índices candidatos nas 9 células ao redor do ponto. */
  around(x: number, z: number): number[] {
    const out: number[] = [];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const bucket = this.cells.get(this.key(x + di * this.cellSize, z + dj * this.cellSize));
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }
}

/**
 * Grafo de caminhada: nós, vizinhos, nó mais próximo e busca de caminho.
 */
export class WalkNetwork {
  readonly nodes: readonly WalkNode[];
  private readonly adjacency: readonly (readonly number[])[];
  private readonly grid: Grid;
  private readonly cellSize: number;

  constructor(nodes: readonly WalkNode[], adjacency: readonly (readonly number[])[], cellSize = 16) {
    this.nodes = nodes;
    this.adjacency = adjacency;
    this.cellSize = cellSize;
    this.grid = new Grid(cellSize);
    for (const node of nodes) this.grid.add(node.x, node.z, node.id);
  }

  get size(): number {
    return this.nodes.length;
  }

  neighbors(id: number): readonly number[] {
    return this.adjacency[id] ?? [];
  }

  node(id: number): WalkNode {
    return this.nodes[id];
  }

  distance(a: number, b: number): number {
    const na = this.nodes[a];
    const nb = this.nodes[b];
    return Math.hypot(na.x - nb.x, na.z - nb.z);
  }

  /** Nó mais próximo de um ponto (busca em espiral na grade; -1 se vazio). */
  nearest(x: number, z: number): number {
    if (this.nodes.length === 0) return -1;
    let best = -1;
    let bestDistance = Infinity;
    for (let ring = 0; ring < 6 && best < 0; ring++) {
      const radius = this.cellSize * (ring + 1);
      const candidates = ring === 0 ? this.grid.around(x, z) : this.wideScan(x, z, radius);
      for (const index of candidates) {
        const node = this.nodes[index];
        const d = Math.hypot(node.x - x, node.z - z);
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      }
    }
    if (best >= 0) return best;
    // Último recurso: varredura completa (rede muito pequena ou ponto distante).
    for (const node of this.nodes) {
      const d = Math.hypot(node.x - x, node.z - z);
      if (d < bestDistance) {
        bestDistance = d;
        best = node.id;
      }
    }
    return best;
  }

  private wideScan(x: number, z: number, radius: number): number[] {
    const out: number[] = [];
    const steps = Math.ceil(radius / this.cellSize);
    for (let dj = -steps; dj <= steps; dj++) {
      for (let di = -steps; di <= steps; di++) {
        out.push(...this.grid.around(x + di * this.cellSize, z + dj * this.cellSize));
      }
    }
    return out;
  }

  /**
   * Caminho mais curto entre dois nós (A\*), incluindo origem e destino.
   * Devolve lista vazia se não houver ligação.
   */
  path(from: number, to: number, avoid?: (id: number) => boolean): number[] {
    if (from === to) return [from];
    if (from < 0 || to < 0 || from >= this.nodes.length || to >= this.nodes.length) return [];
    if (avoid?.(to)) return [];
    const count = this.nodes.length;
    const cameFrom = new Int32Array(count).fill(-1);
    const gScore = new Float64Array(count).fill(Infinity);
    const closed = new Uint8Array(count);
    const open: number[] = [from];
    const fScore = new Float64Array(count).fill(Infinity);
    gScore[from] = 0;
    fScore[from] = this.distance(from, to);

    while (open.length > 0) {
      // Fila de prioridade simples: a rede tem poucas centenas de nós.
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[bestIndex]]) bestIndex = i;
      }
      const current = open.splice(bestIndex, 1)[0];
      if (current === to) {
        const path = [current];
        for (let node = cameFrom[current]; node >= 0; node = cameFrom[node]) path.push(node);
        return path.reverse();
      }
      closed[current] = 1;
      for (const next of this.adjacency[current]) {
        if (closed[next]) continue;
        // Nó que esta pessoa já descobriu não dar: sem isto, replanejar
        // devolvia sempre a mesma rota para dentro do mesmo obstáculo.
        if (next !== to && avoid?.(next)) continue;
        const tentative = gScore[current] + this.distance(current, next);
        if (tentative >= gScore[next]) continue;
        cameFrom[next] = current;
        gScore[next] = tentative;
        fScore[next] = tentative + this.distance(next, to);
        if (!open.includes(next)) open.push(next);
      }
    }
    return [];
  }

  /** Nó aleatório da rede. */
  randomNode(rng: Rng): number {
    return Math.min(this.nodes.length - 1, Math.floor(rng() * this.nodes.length));
  }

  /** Todos os nós dentro de um raio de um ponto. */
  nodesNear(x: number, z: number, radius: number): number[] {
    const candidates: number[] = [];
    for (const node of this.nodes) {
      if (Math.hypot(node.x - x, node.z - z) <= radius) candidates.push(node.id);
    }
    return candidates;
  }

  /** Nó aleatório dentro de um raio de um ponto (ou o mais próximo). */
  randomNodeNear(rng: Rng, x: number, z: number, radius: number): number {
    const candidates = this.nodesNear(x, z, radius);
    if (candidates.length === 0) return this.nearest(x, z);
    return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
  }
}

/** Trechos (sequências de pontos) que formam a rede de Aurora City. */
function auroraChains(spacing: number): RawNode[][] {
  const chains: RawNode[][] = [];

  // Anéis concêntricos da Praça Central.
  for (const radius of [PLAZA.radius * 0.42, PLAZA.radius * 0.78]) {
    const steps = Math.max(8, Math.round((TAU * radius) / spacing));
    const ring: RawNode[] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * TAU;
      ring.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, kind: 'praca' });
    }
    chains.push(ring);
  }

  // Quatro avenidas radiais, da praça ao anel viário.
  for (const avenue of AVENUES) {
    const points: Point2[] = [
      { x: Math.cos(avenue.angle) * avenue.from, z: Math.sin(avenue.angle) * avenue.from },
      { x: Math.cos(avenue.angle) * avenue.to, z: Math.sin(avenue.angle) * avenue.to },
    ];
    chains.push(resample(points, spacing).map((p) => ({ x: p.x, z: p.z, kind: 'avenida' as const })));
  }

  // Anel viário.
  const ringSteps = Math.max(16, Math.round((TAU * RING.radius) / spacing));
  const ringChain: RawNode[] = [];
  for (let i = 0; i <= ringSteps; i++) {
    const angle = (i / ringSteps) * TAU;
    ringChain.push({ x: Math.cos(angle) * RING.radius, z: Math.sin(angle) * RING.radius, kind: 'anel' });
  }
  chains.push(ringChain);

  // Trilhas e alamedas do terreno.
  for (const path of TERRAIN_PATHS) {
    chains.push(resample(path.points, spacing).map((p) => ({ x: p.x, z: p.z, kind: 'caminho' as const })));
  }

  // Pátio de cada edifício: um ponto de parada na frente da fachada.
  for (const lot of BUILDINGS) {
    const distance = Math.hypot(lot.x, lot.z);
    if (distance < 1) continue;
    const dx = -lot.x / distance;
    const dz = -lot.z / distance;
    const offset = forecourtRadius(lot) - 1.5;
    chains.push([
      { x: lot.x + dx * offset, z: lot.z + dz * offset, kind: 'caminho' },
      { x: lot.x + dx * (offset + spacing), z: lot.z + dz * (offset + spacing), kind: 'caminho' },
    ]);
  }

  return chains;
}

/** Mantém apenas o maior grupo de nós ligados entre si. */
function largestComponent(nodeCount: number, adjacency: number[][]): Set<number> {
  const seen = new Uint8Array(nodeCount);
  let best: number[] = [];
  for (let start = 0; start < nodeCount; start++) {
    if (seen[start]) continue;
    const group: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const current = stack.pop() as number;
      group.push(current);
      for (const next of adjacency[current]) {
        if (!seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    if (group.length > best.length) best = group;
  }
  return new Set(best);
}

/**
 * Constrói a rede de caminhada de Aurora City a partir da planta da cidade.
 *
 * @param options.blocked consulta do mundo (água, declive, zona proibida).
 */
export function buildAuroraWalkNetwork(options: WalkNetworkOptions = {}): WalkNetwork {
  return buildWalkNetwork(auroraChains, { ...options, insideLot: insideBuilding, keepOuts: options.keepOuts ?? keepOutsFor('aurora-city') });
}

/** Trechos caminháveis de Rosas Park: os caminhos, as pontes e o roseiral. */
function rosasChains(spacing: number): RawNode[][] {
  const chains: RawNode[][] = [];

  for (const path of ROSAS_PATHS) {
    chains.push(resample([...path], spacing).map((p) => ({ x: p.x, z: p.z, kind: 'caminho' as const })));
  }

  // As pontes são o único trecho que passa por cima d'água — por isso
  // têm tipo próprio: quem olhar a malha depois sabe que ali embaixo
  // não há chão.
  for (const bridge of ROSAS_BRIDGES) {
    chains.push(resample([bridge.from, bridge.to], spacing * 0.6).map((p) => ({ x: p.x, z: p.z, kind: 'ponte' as const })));
  }

  // Anéis do roseiral: é onde as pessoas se juntam.
  for (const radius of ROSAS_ROSE_GARDEN.tiers) {
    const steps = Math.max(10, Math.round((TAU * radius) / spacing));
    const ring: RawNode[] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * TAU;
      ring.push({ x: ROSAS_ROSE_GARDEN.x + Math.cos(angle) * radius, z: ROSAS_ROSE_GARDEN.z + Math.sin(angle) * radius, kind: 'praca' });
    }
    chains.push(ring);
  }

  // Um raio de cada pavilhão para o caminho mais próximo, para ninguém
  // ficar preso no pátio.
  for (const pavilion of ROSAS_PAVILIONS) {
    const dx = Math.cos(pavilion.doorAngle);
    const dz = Math.sin(pavilion.doorAngle);
    const from = pavilion.radius + 2;
    chains.push([
      { x: pavilion.x + dx * from, z: pavilion.z + dz * from, kind: 'caminho' },
      { x: pavilion.x + dx * (from + spacing), z: pavilion.z + dz * (from + spacing), kind: 'caminho' },
      { x: pavilion.x + dx * (from + spacing * 2), z: pavilion.z + dz * (from + spacing * 2), kind: 'caminho' },
    ]);
  }

  return chains;
}

export function buildRosasWalkNetwork(options: WalkNetworkOptions = {}): WalkNetwork {
  return buildWalkNetwork(rosasChains, {
    ...options,
    keepOuts: options.keepOuts ?? keepOutsFor('rosas-park'),
    insideLot: (x, z, margin = 0.5) => ROSAS_PAVILIONS.some((pavilion) => Math.hypot(x - pavilion.x, z - pavilion.z) < pavilion.radius + margin),
  });
}

/** A rede de caminhada de qualquer região: os trechos é que mudam. */
function buildWalkNetwork(
  chainsOf: (spacing: number) => RawNode[][],
  options: WalkNetworkOptions & {
    insideLot: (x: number, z: number, margin?: number) => boolean;
    /** Áreas em que a rede não pode entrar. */
    keepOuts?: readonly KeepOutZone[];
  },
): WalkNetwork {
  const spacing = options.spacing ?? 9;
  const joinRadius = options.joinRadius ?? 11;
  const blocked = options.blocked ?? (() => false);
  const edgeBlocked = options.edgeBlocked ?? (() => false);
  const pointBlocked = options.pointBlocked ?? (() => false);
  const keepOuts = options.keepOuts ?? [];
  // Um ponto dentro de uma área proibida não é lugar de passagem.
  //
  // Vale reparar que a física **sozinha** já daria quase isto: a
  // barreira é sólida, e `pointBlocked` pergunta à física. Quase não
  // basta. A rede é montada com `blocked` e `pointBlocked`
  // opcionais — um chamador sem física teria a rede entrando no meio
  // da estrutura. A zona é geometria declarada, e não depende de
  // ninguém ter lembrado de ligar a física.
  const isFree = (x: number, z: number): boolean =>
    !options.insideLot(x, z) && !blocked(x, z) && !insideKeepOut(keepOuts, x, z, KEEP_OUT_MARGIN);

  const nodes: WalkNode[] = [];
  const adjacency: number[][] = [];
  const merge = new Grid(MERGE_DISTANCE * 2);

  const addNode = (raw: RawNode): number => {
    for (const index of merge.around(raw.x, raw.z)) {
      const node = nodes[index];
      if (Math.hypot(node.x - raw.x, node.z - raw.z) <= MERGE_DISTANCE) return index;
    }
    const id = nodes.length;
    nodes.push({ id, x: raw.x, z: raw.z, kind: raw.kind });
    adjacency.push([]);
    merge.add(raw.x, raw.z, id);
    return id;
  };

  const connect = (a: number, b: number): void => {
    if (a === b) return;
    if (!adjacency[a].includes(b)) adjacency[a].push(b);
    if (!adjacency[b].includes(a)) adjacency[b].push(a);
  };

  /** `true` se o trecho entre dois pontos é caminhável de ponta a ponta. */
  const edgeFree = (ax: number, az: number, bx: number, bz: number): boolean => {
    // A zona proibida é medida pela distância do centro ao segmento,
    // não por amostragem: dois nós em lados opostos da estrutura
    // estão ambos livres, e mesmo assim a reta entre eles passa por
    // dentro. É essa aresta que faria um habitante cortar caminho
    // pelo meio do Coração em vez de contorná-lo.
    if (crossesKeepOut(keepOuts, ax, az, bx, bz, KEEP_OUT_MARGIN)) return false;
    const samples = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      if (!isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return !edgeBlocked(ax, az, bx, bz);
  };

  /**
   * Onde pôr este ponto de passagem, dado de onde se chega a ele.
   *
   * Se o ponto da planta caiu dentro de alguma coisa — o canteiro de
   * 50 cm do anel da praça, a base de uma fonte —, o caminho é que
   * desvia, não o cenário: procura-se o lugar livre mais próximo. Só
   * quando não há nenhum em três metros e meio o ponto é descartado.
   *
   * Apagar o canteiro resolveria o mesmo sintoma e estragaria a praça.
   */
  const placeNode = (raw: RawNode, from: Point2 | null): RawNode | null => {
    const anchor = from ?? raw;
    if (!pointBlocked(raw.x, raw.z, anchor.x, anchor.z)) return raw;
    for (const distance of [1.3, 2.6, 3.5]) {
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * TAU;
        const x = raw.x + Math.cos(angle) * distance;
        const z = raw.z + Math.sin(angle) * distance;
        if (!isFree(x, z)) continue;
        if (pointBlocked(x, z, anchor.x, anchor.z)) continue;
        return { x, z, kind: raw.kind };
      }
    }
    return null;
  };

  for (const chain of chainsOf(spacing)) {
    let previous = -1;
    for (const raw of chain) {
      if (!isFree(raw.x, raw.z)) {
        previous = -1;
        continue;
      }
      const spot = placeNode(raw, previous >= 0 ? nodes[previous] : null);
      if (!spot) {
        previous = -1;
        continue;
      }
      const id = addNode(spot);
      if (previous >= 0 && edgeFree(nodes[previous].x, nodes[previous].z, spot.x, spot.z)) connect(previous, id);
      previous = id;
    }
  }

  // Liga trechos que passam perto uns dos outros (cruzamentos, entradas).
  const joinGrid = new Grid(joinRadius);
  for (const node of nodes) joinGrid.add(node.x, node.z, node.id);
  for (const node of nodes) {
    for (const other of joinGrid.around(node.x, node.z)) {
      if (other <= node.id) continue;
      const target = nodes[other];
      const distance = Math.hypot(target.x - node.x, target.z - node.z);
      if (distance > joinRadius) continue;
      if (adjacency[node.id].length >= 6 || adjacency[other].length >= 6) continue;
      if (!edgeFree(node.x, node.z, target.x, target.z)) continue;
      connect(node.id, other);
    }
  }

  // Descarta ilhas isoladas: ninguém deve nascer em um trecho sem saída.
  const keep = largestComponent(nodes.length, adjacency);
  const remap = new Int32Array(nodes.length).fill(-1);
  const finalNodes: WalkNode[] = [];
  for (const node of nodes) {
    if (!keep.has(node.id)) continue;
    remap[node.id] = finalNodes.length;
    finalNodes.push({ id: finalNodes.length, x: node.x, z: node.z, kind: node.kind });
  }
  const finalAdjacency: number[][] = finalNodes.map(() => []);
  for (const node of nodes) {
    const from = remap[node.id];
    if (from < 0) continue;
    for (const other of adjacency[node.id]) {
      const to = remap[other];
      if (to >= 0) finalAdjacency[from].push(to);
    }
  }
  return new WalkNetwork(finalNodes, finalAdjacency);
}
