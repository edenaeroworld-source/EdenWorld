/**
 * Superfícies orgânicas por varredura de perfil.
 *
 * O corpo antigo era um amontoado de primitivas: uma esfera para o
 * ombro, um cilindro para o braço, outra esfera para o cotovelo. Cada
 * peça tinha a própria superfície, as próprias normais e a própria
 * borda, e as peças se encaixavam por sobreposição. Daí vinham as três
 * marcas da aparência de boneco: a quina onde uma primitiva termina e
 * a outra começa, o perfil facetado de um cilindro de dez lados, e a
 * dobra seca da articulação, que girava um pedaço rígido inteiro.
 *
 * Aqui a ideia é outra. Um membro é **uma** superfície: uma sequência
 * de anéis empilhados ao longo de um eixo, cada anel com o seu raio, e
 * os anéis costurados em quadriláteros. Não há emenda entre o ombro e
 * o bíceps porque não há duas peças — há um perfil que engrossa e
 * afina. As normais saem da média dos triângulos vizinhos, que é
 * contínua porque os vértices são **compartilhados**: o anel fecha em
 * si mesmo em vez de duplicar a coluna de costura.
 *
 * E cada anel carrega o seu peso de esqueleto. Um anel 4 cm acima do
 * cotovelo pertence ao braço; 4 cm abaixo, ao antebraço; no meio, aos
 * dois, meio a meio. É isso que faz o cotovelo dobrar como carne em
 * vez de estalar como dobradiça — e é a diferença que nenhuma
 * quantidade de polígonos a mais consegue produzir sozinha.
 *
 * Só Three.js e matemática: nada daqui sabe o que é um personagem.
 */

import * as THREE from 'three';

/** A que osso (ou par de ossos) um anel pertence. */
export interface SkinBinding {
  /** Índice do osso principal. */
  bone: number;
  /** Índice do osso secundário, quando o anel está numa articulação. */
  bone2?: number;
  /** Fração que vai para `bone2` (0 = só o principal, 1 = só o secundário). */
  blend?: number;
}

/** Um anel do perfil: a seção transversal numa altura. */
export interface Station {
  /** Altura ao longo do eixo da varredura (metros, espaço de bind). */
  y: number;
  /** Meia-largura lateral. */
  rx: number;
  /** Profundidade para a frente (z > 0). */
  rz: number;
  /** Profundidade para trás. Igual a `rz` quando omitida. */
  rzBack?: number;
  /** Deslocamento do eixo — curva a coluna, abre o quadril. */
  x?: number;
  z?: number;
  color: THREE.ColorRepresentation;
  skin: SkinBinding;
  /** Zona de deformação dos Afters (`AftersMorph.Zone`). */
  zone?: number;
  /** Origem da junta que a zona usa como referência (espaço de bind). */
  origin?: readonly [number, number, number];
}

/** Opções de uma varredura. */
export interface LoftOptions {
  /** Quantos vértices por anel. */
  segments: number;
  /** Fecha o topo com uma cúpula desta altura (metros). */
  capTop?: number;
  /** Fecha a base com uma cúpula desta altura. */
  capBottom?: number;
  /** Quantos anéis a cúpula usa. */
  capRings?: number;
  /**
   * As estações vêm da ponta para a raiz (mão → ombro, pé → quadril).
   *
   * Um membro é mais natural de descrever de cima para baixo, mas a
   * varredura precisa subir: é a ordem dos anéis que decide para que
   * lado os triângulos olham, e um membro descrito ao contrário fica
   * com as normais para dentro — acende escuro, como se estivesse
   * sempre na sombra. Esta opção inverte a lista e troca as cúpulas de
   * ponta, para que o perfil continue legível no código.
   */
  descending?: boolean;
}

const WHITE = new THREE.Color();

/**
 * Acumula superfícies e as funde numa malha indexada com normais suaves.
 *
 * Indexada de propósito. A malha antiga chamava `toNonIndexed()` em
 * cada primitiva antes de fundir: 6 496 triângulos viravam 18 405
 * vértices, três por triângulo, nenhum compartilhado. Além do
 * desperdício, vértices não compartilhados **não podem** ter normal
 * média — e sem normal média não existe sombreado suave de verdade,
 * só a suavidade que cada primitiva já trazia de fábrica, interrompida
 * em toda junção.
 */
export class SurfaceBuilder {
  private readonly position: number[] = [];
  private readonly color: number[] = [];
  private readonly skinIndex: number[] = [];
  private readonly skinWeight: number[] = [];
  private readonly zone: number[] = [];
  private readonly origin: number[] = [];
  private readonly index: number[] = [];

  /** Quantos vértices já foram emitidos. */
  get vertexCount(): number {
    return this.position.length / 3;
  }

  /** Quantos triângulos já foram emitidos. */
  get triangleCount(): number {
    return this.index.length / 3;
  }

  private pushVertex(x: number, y: number, z: number, station: Station): number {
    const id = this.position.length / 3;
    this.position.push(x, y, z);
    WHITE.set(station.color);
    this.color.push(WHITE.r, WHITE.g, WHITE.b);
    const { bone, bone2, blend } = station.skin;
    const w = bone2 === undefined ? 0 : Math.min(1, Math.max(0, blend ?? 0));
    this.skinIndex.push(bone, bone2 ?? bone, 0, 0);
    this.skinWeight.push(1 - w, w, 0, 0);
    this.zone.push(station.zone ?? 0);
    const o = station.origin ?? ORIGIN_ZERO;
    this.origin.push(o[0], o[1], o[2]);
    return id;
  }

  /** Os vértices de um anel, já no espaço de bind. */
  private ring(station: Station, segments: number, scale = 1): number[] {
    const ids: number[] = [];
    const cx = station.x ?? 0;
    const cz = station.z ?? 0;
    const rzBack = station.rzBack ?? station.rz;
    for (let k = 0; k < segments; k += 1) {
      const angle = (k / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const depth = sin >= 0 ? station.rz : rzBack;
      ids.push(this.pushVertex(cx + cos * station.rx * scale, station.y, cz + sin * depth * scale, station));
    }
    return ids;
  }

  /** Costura dois anéis de mesmo tamanho. */
  private stitch(lower: number[], upper: number[]): void {
    const n = lower.length;
    for (let k = 0; k < n; k += 1) {
      const next = (k + 1) % n;
      this.index.push(lower[k], upper[k], upper[next]);
      this.index.push(lower[k], upper[next], lower[next]);
    }
  }

  /** Liga um anel a um vértice único (polo da cúpula). */
  private fan(ring: number[], pole: number, up: boolean): void {
    const n = ring.length;
    for (let k = 0; k < n; k += 1) {
      const next = (k + 1) % n;
      if (up) this.index.push(ring[k], pole, ring[next]);
      else this.index.push(ring[k], ring[next], pole);
    }
  }

  /**
   * Varre um perfil e devolve a superfície.
   *
   * As estações precisam vir em ordem crescente de `y`. Entre duas
   * estações a superfície é reta; a suavidade vem de haver estações
   * suficientes, e é por isso que as curvas do corpo são descritas por
   * muitos anéis baixos em vez de poucos anéis altos.
   */
  loft(input: readonly Station[], options: LoftOptions): void {
    if (input.length < 2) return;
    const { segments } = options;
    const capRings = options.capRings ?? 3;
    const stations = options.descending ? [...input].reverse() : input;
    const capTop = options.descending ? options.capBottom : options.capTop;
    const capBottom = options.descending ? options.capTop : options.capBottom;

    const rings = stations.map((station) => this.ring(station, segments));
    for (let i = 0; i < rings.length - 1; i += 1) this.stitch(rings[i], rings[i + 1]);

    if (capBottom && capBottom > 0) {
      this.dome(stations[0], rings[0], segments, -capBottom, capRings);
    }
    if (capTop && capTop > 0) {
      this.dome(stations[stations.length - 1], rings[rings.length - 1], segments, capTop, capRings);
    }
  }

  /**
   * Fecha a ponta de uma varredura com uma cúpula.
   *
   * Um quarto de elipse: o raio encolhe pelo cosseno enquanto a altura
   * avança pelo seno. A tangente no encontro com o último anel é
   * vertical, então não há quina onde a cúpula começa — a diferença
   * entre uma ponta de dedo e um cano serrado.
   */
  private dome(station: Station, edge: number[], segments: number, height: number, rings: number): void {
    let previous = edge;
    for (let j = 1; j <= rings; j += 1) {
      const phi = (j / (rings + 1)) * (Math.PI / 2);
      const next = this.ring({ ...station, y: station.y + Math.sin(phi) * height }, segments, Math.cos(phi));
      if (height >= 0) this.stitch(previous, next);
      else this.stitch(next, previous);
      previous = next;
    }
    const pole = this.pushVertex(station.x ?? 0, station.y + height, station.z ?? 0, station);
    this.fan(previous, pole, height >= 0);
  }

  /**
   * Uma bola lisa: varredura fechada nas duas pontas.
   *
   * Usada onde o objeto **é** redondo — um olho, a conta de um colar —
   * e não como peça de montar um corpo.
   */
  ball(center: readonly [number, number, number], radius: readonly [number, number, number], station: Omit<Station, 'y' | 'rx' | 'rz'>, rings: number): void {
    const [cx, cy, cz] = center;
    const [rx, ry, rz] = radius;
    const stations: Station[] = [];
    for (let i = 1; i < rings; i += 1) {
      const phi = (i / rings) * Math.PI - Math.PI / 2;
      stations.push({ ...station, x: cx, z: cz, y: cy + Math.sin(phi) * ry, rx: rx * Math.cos(phi), rz: rz * Math.cos(phi) });
    }
    this.loft(stations, { segments: Math.max(6, rings * 2), capTop: ry * 0.32, capBottom: ry * 0.32, capRings: 2 });
  }

  /**
   * Costura uma geometria pronta do Three.js na mesma malha.
   *
   * Para o que de fato é um objeto à parte: a armação de um óculos, o
   * aro de um fone, a aba de um chapéu. Entra na malha única para não
   * custar uma chamada de desenho a mais, e recebe o peso de esqueleto
   * do osso que a carrega — um chapéu acompanha a cabeça porque está
   * preso ao osso da cabeça, não porque alguém o reposiciona por quadro.
   */
  addGeometry(geometry: THREE.BufferGeometry, station: Omit<Station, 'y' | 'rx' | 'rz'>, matrix?: THREE.Matrix4): void {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute('position');
    if (!position) return;
    const base = this.position.length / 3;
    const point = new THREE.Vector3();
    const carrier: Station = { ...station, y: 0, rx: 0, rz: 0 };
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i);
      if (matrix) point.applyMatrix4(matrix);
      this.pushVertex(point.x, point.y, point.z, carrier);
    }
    for (let i = 0; i < position.count; i += 3) this.index.push(base + i, base + i + 1, base + i + 2);
    if (source !== geometry) source.dispose();
  }

  /**
   * Empurra vértices para fora ao longo da direção radial, em volta de
   * um ponto — o nariz, o queixo, a maçã do rosto.
   *
   * É assim que um traço do rosto nasce **da** superfície em vez de ser
   * uma esfera colada nela. A queda é gaussiana, com raios próprios em
   * cada eixo, então um nariz pode ser estreito e comprido sem inflar a
   * bochecha ao lado.
   *
   * Precisa rodar depois de `loft` e antes de `build`.
   *
   * @param center ponto de origem do traço, no espaço de bind
   * @param radius alcance em cada eixo (metros)
   * @param amount quanto empurrar no pico (metros); negativo afunda
   * @param direction para onde empurrar; `undefined` usa a direção
   *   radial a partir do eixo vertical do corpo
   */
  feature(
    center: readonly [number, number, number],
    radius: readonly [number, number, number],
    amount: number,
    direction?: readonly [number, number, number],
  ): void {
    const [cx, cy, cz] = center;
    const [rx, ry, rz] = radius;
    for (let i = 0; i < this.position.length; i += 3) {
      const x = this.position[i];
      const y = this.position[i + 1];
      const z = this.position[i + 2];
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dz = (z - cz) / rz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 9) continue; // além de três desvios o peso é ruído
      const weight = Math.exp(-d2 * 1.4);
      if (weight < 0.002) continue;
      const push = amount * weight;
      if (direction) {
        this.position[i] += direction[0] * push;
        this.position[i + 1] += direction[1] * push;
        this.position[i + 2] += direction[2] * push;
      } else {
        const len = Math.hypot(x, z) || 1;
        this.position[i] += (x / len) * push;
        this.position[i + 2] += (z / len) * push;
      }
    }
  }

  /**
   * Achata uma região contra um plano horizontal — a sola do pé.
   *
   * Sem isto o pé é um ovo e o personagem parece flutuar. Com isto há
   * uma base, e ela continua fazendo parte da mesma superfície.
   */
  flattenBelow(y: number, from: readonly [number, number, number], radius: number): void {
    const [fx, fy, fz] = from;
    for (let i = 0; i < this.position.length; i += 3) {
      if (this.position[i + 1] >= y) continue;
      const dx = this.position[i] - fx;
      const dy = this.position[i + 1] - fy;
      const dz = this.position[i + 2] - fz;
      if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
      this.position[i + 1] = y;
    }
  }

  /** Fecha a malha: normais médias, limites, atributos de pele e morph. */
  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    geometry.setAttribute('aZone', new THREE.Float32BufferAttribute(this.zone, 1));
    geometry.setAttribute('aMorphOrigin', new THREE.Float32BufferAttribute(this.origin, 3));
    geometry.setIndex(this.index);
    // A média dos triângulos que compartilham cada vértice. Como os anéis
    // fecham sobre si mesmos, a média atravessa a costura e a superfície
    // não tem uma linha de sombra na lateral.
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const ORIGIN_ZERO: readonly [number, number, number] = [0, 0, 0];

/**
 * Interpola um perfil para gerar estações intermediárias.
 *
 * Uma curva de corpo é descrita por poucos pontos de controle — ombro,
 * bíceps, cotovelo, punho — e a malha precisa de muitos anéis. Esta
 * função é a ponte: recebe os pontos e devolve a sequência densa, com
 * suavização de Hermite entre eles para que o raio não mude de
 * inclinação de repente no ponto de controle.
 *
 * @param steps quantos anéis gerar entre cada par de pontos
 */
export function subdivideProfile(control: readonly Station[], steps: number): Station[] {
  if (control.length < 2 || steps < 1) return [...control];
  const out: Station[] = [];
  for (let i = 0; i < control.length - 1; i += 1) {
    const a = control[i];
    const b = control[i + 1];
    const last = i === control.length - 2;
    const count = last ? steps + 1 : steps;
    for (let s = 0; s < count; s += 1) {
      const t = s / steps;
      // Hermite suave: derivada zero nos extremos, sem bico no controle.
      const k = t * t * (3 - 2 * t);
      out.push(blendStations(a, b, k));
    }
  }
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Os pesos de uma estação como mapa osso → fração.
 *
 * Passar por um mapa parece rodeio, mas é o que torna a mistura
 * **associativa**: sem isso, a fronteira entre "anel que já declara
 * dois ossos" e "anel que declara um só" fazia o peso saltar para
 * trás, e um salto de peso é uma dobra que aparece na tela.
 */
function weightsOf(station: Station): Map<number, number> {
  const out = new Map<number, number>();
  const second = station.skin.bone2;
  const w = second === undefined ? 0 : Math.min(1, Math.max(0, station.skin.blend ?? 0));
  out.set(station.skin.bone, (out.get(station.skin.bone) ?? 0) + (1 - w));
  if (second !== undefined && w > 0) out.set(second, (out.get(second) ?? 0) + w);
  return out;
}

/** Mistura duas estações. A zona vem da mais próxima. */
function blendStations(a: Station, b: Station, t: number): Station {
  const near = t < 0.5 ? a : b;

  // Interpola osso a osso e fica com os dois mais pesados: é o que o
  // atributo `skinWeight` comporta, e o terceiro osso nunca pesa o
  // suficiente para valer a conta.
  const wa = weightsOf(a);
  const wb = weightsOf(b);
  const mixed = new Map<number, number>();
  for (const bone of new Set([...wa.keys(), ...wb.keys()])) {
    mixed.set(bone, lerp(wa.get(bone) ?? 0, wb.get(bone) ?? 0, t));
  }
  const ranked = [...mixed.entries()].filter(([, w]) => w > 1e-4).sort((x, y) => y[1] - x[1]);
  const total = ranked.slice(0, 2).reduce((sum, [, w]) => sum + w, 0) || 1;
  const skin: SkinBinding = { bone: ranked[0][0] };
  if (ranked.length > 1) {
    skin.bone2 = ranked[1][0];
    skin.blend = ranked[1][1] / total;
  }

  const color = new THREE.Color(a.color).lerp(new THREE.Color(b.color), t > 0.5 ? 1 : 0).getHex();
  return {
    y: lerp(a.y, b.y, t),
    rx: lerp(a.rx, b.rx, t),
    rz: lerp(a.rz, b.rz, t),
    rzBack: lerp(a.rzBack ?? a.rz, b.rzBack ?? b.rz, t),
    x: lerp(a.x ?? 0, b.x ?? 0, t),
    z: lerp(a.z ?? 0, b.z ?? 0, t),
    color,
    skin,
    zone: near.zone,
    origin: near.origin,
  };
}
