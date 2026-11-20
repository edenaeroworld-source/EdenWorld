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
  /**
   * Acabamento desta estação. Omitido, vale o do construtor.
   *
   * Existe porque uma varredura só costuma atravessar materiais: o
   * braço vai da manga ao pulso nu e à mão, e a perna da calça ao
   * tênis. Marcar a varredura inteira de uma vez daria pele com
   * brilho de borracha.
   */
  finish?: number;
  skin: SkinBinding;
  /** Zona de deformação dos Afters (`AftersMorph.Zone`). */
  zone?: number;
  /** Origem da junta que a zona usa como referência (espaço de bind). */
  origin?: readonly [number, number, number];
  /** Acompanhamento das pernas, por vértice (ver `FollowSpec`). */
  follow?: FollowSpec;
}

/**
 * Como um anel acompanha as pernas, vértice a vértice.
 *
 * Uma saia não é nem um tubo rígido nem uma calça. Presa só ao
 * quadril, ela fica parada enquanto a coxa avança e o joelho sai pelo
 * tecido; presa à coxa, cada metade segue a sua perna e a peça se
 * abre ao meio como uma tesoura. O meio-termo é dar a cada vértice um
 * peso que depende de onde ele está: máximo em cima de cada coxa,
 * **zero nas colunas da frente e de trás**, onde os dois lados se
 * encontram. Como o peso varia de forma contínua e os dois lados
 * concordam (zero) onde se tocam, a superfície continua inteira — é
 * uma única malha costurada, não duas abas.
 */
export interface FollowSpec {
  /**
   * Os quatro ossos do pano, na ordem dos azimutes: lado esquerdo
   * (`+x`), frente (`+z`), lado direito (`−x`), costas (`−z`).
   */
  quadrants: readonly [number, number, number, number];
  /** Quanto do vértice pertence ao pano, e não ao quadril. */
  weight: number;
}

/** Peso de um vértice: até três ossos, já normalizado. */
interface VertexSkin {
  bones: readonly number[];
  weights: readonly number[];
}

/**
 * Reparte um vértice entre os dois quadrantes vizinhos.
 *
 * Os quatro ossos ficam a 90° um do outro e cada vértice pertence aos
 * dois que o cercam, com peso que soma um. Nas direções exatas de
 * cada osso a repartição é inteira; no meio do caminho é meio a
 * meio. Como dois quadrantes vizinhos sempre concordam na fronteira,
 * o pano não ganha vinco nenhum ao girar — e é essa continuidade que
 * substitui, com vantagem, a antiga mistura em volta da costura.
 *
 * A vantagem é a seguinte: antes, as colunas da frente e de trás
 * ficavam **sem** acompanhamento, porque era a única forma de os dois
 * lados concordarem ali. Agora elas têm osso próprio, que anda com a
 * média das duas pernas: zero quando se caminha (uma perna vai,
 * outra vem) e tudo quando se senta (as duas dobram juntas). O que
 * era um ponto cego virou o osso que resolve o colo.
 */
function quadrantSplit(angle: number): { a: number; b: number; t: number } {
  const turns = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  const slot = turns * 4;
  const a = Math.floor(slot) % 4;
  const frac = slot - Math.floor(slot);
  // Suavização de Hermite: a derivada zera em cima de cada osso, o
  // que tira o bico que uma mistura linear deixaria.
  const t = frac * frac * (3 - 2 * frac);
  return { a, b: (a + 1) % 4, t };
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
  private readonly finish: number[] = [];
  /** Oclusão por vértice: 1 = céu aberto, 0 = totalmente fechado. */
  private readonly ao: number[] = [];

  /**
   * Acabamento dos próximos vértices. Quem monta uma parte do corpo
   * ajusta isto antes de varrer, e tudo o que sair dali carrega o
   * valor — não é preciso passar o acabamento em cada estação.
   */
  surface: number = 0;
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

  private pushVertex(x: number, y: number, z: number, station: Station, override?: VertexSkin): number {
    const id = this.position.length / 3;
    this.position.push(x, y, z);
    WHITE.set(station.color);
    this.color.push(WHITE.r, WHITE.g, WHITE.b);
    this.finish.push(station.finish ?? this.surface);
    this.ao.push(1);
    if (override !== undefined) {
      const [b0, b1, b2] = [override.bones[0], override.bones[1] ?? 0, override.bones[2] ?? 0];
      const [w0, w1, w2] = [override.weights[0], override.weights[1] ?? 0, override.weights[2] ?? 0];
      this.skinIndex.push(b0, b1, b2, 0);
      this.skinWeight.push(w0, w1, w2, 0);
      this.zone.push(station.zone ?? 0);
      const base = station.origin ?? ORIGIN_ZERO;
      this.origin.push(base[0], base[1], base[2]);
      return id;
    }
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
      let bind: VertexSkin | undefined;
      if (station.follow !== undefined) {
        const f = station.follow;
        const cloth = Math.min(1, Math.max(0, f.weight));
        const { a, b, t } = quadrantSplit(angle);
        // O quadril segura o que ainda não é saia: na cintura o
        // vértice é todo dele, na barra não é nada dele. É esse
        // degradê que mantém a costura parada enquanto a barra anda.
        bind = {
          bones: [station.skin.bone, f.quadrants[a], f.quadrants[b]],
          weights: [1 - cloth, cloth * (1 - t), cloth * t],
        };
      }
      ids.push(this.pushVertex(cx + cos * station.rx * scale, station.y, cz + sin * depth * scale, station, bind));
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

  /** Normais por vértice, médias dos triângulos — as mesmas de `build()`. */
  private vertexNormals(): Float32Array {
    const normal = new Float32Array(this.position.length);
    for (let t = 0; t < this.index.length; t += 3) {
      const ia = this.index[t] * 3;
      const ib = this.index[t + 1] * 3;
      const ic = this.index[t + 2] * 3;
      const ux = this.position[ib] - this.position[ia];
      const uy = this.position[ib + 1] - this.position[ia + 1];
      const uz = this.position[ib + 2] - this.position[ia + 2];
      const vx = this.position[ic] - this.position[ia];
      const vy = this.position[ic + 1] - this.position[ia + 1];
      const vz = this.position[ic + 2] - this.position[ia + 2];
      const fx = uy * vz - uz * vy;
      const fy = uz * vx - ux * vz;
      const fz = ux * vy - uy * vx;
      for (const i of [ia, ib, ic]) {
        normal[i] += fx;
        normal[i + 1] += fy;
        normal[i + 2] += fz;
      }
    }
    for (let i = 0; i < normal.length; i += 3) {
      const len = Math.hypot(normal[i], normal[i + 1], normal[i + 2]);
      if (len < 1e-12) continue;
      normal[i] /= len;
      normal[i + 1] /= len;
      normal[i + 2] /= len;
    }
    return normal;
  }

  /**
   * Um vértice novo no meio da aresta `a`–`b`, com os atributos dos dois.
   *
   * A posição **não** é a média simples. O ponto médio de uma corda
   * cai sobre o triângulo antigo, e subdividir assim não acrescenta
   * curvatura nenhuma: a superfície continua exatamente a mesma, só
   * que com mais vértices. O estrago é no sombreado — a normal de um
   * vértice é a média dos triângulos que o cercam, e depois de
   * subdividir todos esses triângulos são coplanares, então cada
   * vértice passa a ter a normal da faceta em vez da normal da
   * curva. O rosto inteiro amanhece facetado, com as facetas
   * grosseiras do original agora visíveis uma a uma.
   *
   * A correção é a tesselação de Phong: projetar o ponto médio nos
   * planos tangentes dos dois extremos e ir até a média das duas
   * projeções. Isso devolve a curvatura que a malha grossa só
   * insinuava nas normais, e os triângulos novos deixam de ser
   * coplanares. O peso 0,75 é o usual — a projeção inteira exagera a
   * barriga em arestas muito abertas.
   */
  private midpoint(a: number, b: number, normal?: number[]): number {
    const id = this.position.length / 3;
    let bulge: readonly [number, number, number] = [0, 0, 0];
    if (normal) {
      const mx = (this.position[a * 3] + this.position[b * 3]) / 2;
      const my = (this.position[a * 3 + 1] + this.position[b * 3 + 1]) / 2;
      const mz = (this.position[a * 3 + 2] + this.position[b * 3 + 2]) / 2;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const v of [a, b]) {
        const nx = normal[v * 3];
        const ny = normal[v * 3 + 1];
        const nz = normal[v * 3 + 2];
        const d = (mx - this.position[v * 3]) * nx + (my - this.position[v * 3 + 1]) * ny + (mz - this.position[v * 3 + 2]) * nz;
        sx += mx - d * nx;
        sy += my - d * ny;
        sz += mz - d * nz;
      }
      bulge = [(sx / 2 - mx) * 0.75, (sy / 2 - my) * 0.75, (sz / 2 - mz) * 0.75];
      // O vértice novo herda a normal interpolada dos extremos, para
      // que o nível seguinte tenha de onde estimar a curvatura sem
      // varrer a malha inteira de novo.
      const nx = normal[a * 3] + normal[b * 3];
      const ny = normal[a * 3 + 1] + normal[b * 3 + 1];
      const nz = normal[a * 3 + 2] + normal[b * 3 + 2];
      const len = Math.hypot(nx, ny, nz) || 1;
      normal.push(nx / len, ny / len, nz / len);
    }
    for (let k = 0; k < 3; k += 1) {
      this.position.push((this.position[a * 3 + k] + this.position[b * 3 + k]) / 2 + bulge[k]);
      this.color.push((this.color[a * 3 + k] + this.color[b * 3 + k]) / 2);
      this.origin.push(this.origin[a * 3 + k]);
    }
    this.ao.push((this.ao[a] + this.ao[b]) / 2);
    // Acabamento, osso e zona são categorias, não quantidades: a média
    // de `pele` com `pano` não é meio tecido, é um valor que o shader
    // não sabe ler. Herdam de `a`. Toda região que se refina precisa,
    // portanto, ser de um acabamento e de um osso só — no rosto é o
    // caso, e `refinamento-nariz.test.ts` verifica que continua sendo.
    this.finish.push(this.finish[a]);
    this.zone.push(this.zone[a]);
    for (let k = 0; k < 4; k += 1) {
      this.skinIndex.push(this.skinIndex[a * 4 + k]);
      this.skinWeight.push(this.skinWeight[a * 4 + k]);
    }
    return id;
  }

  /**
   * Subdivide a malha dentro de uma bola, sem rachar nada.
   *
   * Serve para esculpir um traço fino numa superfície grossa. O crânio
   * tem um anel a cada 2πR/44 ≈ 0,14R no nível `ultra`; um nariz tem
   * 0,47R de largura. São três vértices atravessados — não dá para
   * desenhar asa, dorso e ponta com três vértices, e é por isso que o
   * nariz vinha sendo uma superfície separada, colada por cima.
   *
   * O risco de subdividir só um pedaço é o **T**: se um triângulo
   * ganha um vértice no meio de uma aresta e o vizinho não, a malha
   * racha exatamente ali, e a emenda volta — agora pior, porque é um
   * buraco. A saída é decidir pela **aresta**, nunca pelo triângulo:
   * uma aresta se parte se os dois extremos estão na bola e ela é mais
   * comprida que o alvo. Como os dois triângulos que a dividem fazem a
   * mesma pergunta sobre os mesmos dois vértices, respondem igual
   * sempre, e nenhum T aparece. Cada triângulo vira 1, 2, 3 ou 4
   * conforme quantas das suas arestas partiram.
   *
   * O custo é limitado pela bola e pelo alvo, não pelo nível de
   * qualidade: a malha grossa de `baixa` se parte mais vezes que a de
   * `ultra` e as duas chegam perto do mesmo tamanho de aresta no
   * rosto. É o oposto de subir a densidade do corpo inteiro.
   *
   * Precisa rodar depois de `loft` e antes de `sculptFront`.
   */
  refine(center: readonly [number, number, number], radius: number, targetEdge: number, maxLevels = 4): void {
    const [cx, cy, cz] = center;
    const r2 = radius * radius;
    const target2 = targetEdge * targetEdge;
    const inside = (v: number): boolean => {
      const dx = this.position[v * 3] - cx;
      const dy = this.position[v * 3 + 1] - cy;
      const dz = this.position[v * 3 + 2] - cz;
      return dx * dx + dy * dy + dz * dz <= r2;
    };
    const tooLong = (a: number, b: number): boolean => {
      const dx = this.position[a * 3] - this.position[b * 3];
      const dy = this.position[a * 3 + 1] - this.position[b * 3 + 1];
      const dz = this.position[a * 3 + 2] - this.position[b * 3 + 2];
      return dx * dx + dy * dy + dz * dz > target2;
    };

    // Calculadas **uma vez**, da malha original. É o que a tesselação
    // de Phong pede — a curvatura a reproduzir é a que a superfície de
    // partida insinua, não a que o nível anterior já acrescentou — e
    // de quebra evita varrer a malha inteira a cada nível, que era o
    // grosso do custo: com quatro níveis, quatro passagens de normais
    // sobre 62 mil triângulos para refinar um palmo de rosto.
    const normal = Array.from(this.vertexNormals());

    for (let level = 0; level < maxLevels; level += 1) {
      const stride = this.position.length / 3;
      // Quem está na bola, decidido uma vez por vértice. Sem isto, a
      // pergunta era refeita seis vezes por triângulo — duas por
      // aresta — sobre os 62 mil triângulos do corpo, para refinar um
      // palmo de rosto. O resto do corpo agora sai do caminho com uma
      // consulta a um byte.
      const dentro = new Uint8Array(stride);
      for (let v = 0; v < stride; v += 1) dentro[v] = inside(v) ? 1 : 0;
      const cache = new Map<number, number>();
      // Uma aresta entre dois acabamentos (ou dois ossos) diferentes
      // nunca se parte. O vértice do meio teria de herdar categoria de
      // um dos lados, e herdaria errado metade das vezes — pele com
      // acabamento de olho, ou cabelo preso ao osso da bochecha. A
      // bola do nariz encosta no cabelo e na órbita, então isto não é
      // hipótese: é o que acontece. Assim o método fica correto para
      // qualquer bola que o chamador escolher, em vez de depender de
      // ele escolher bem.
      const samePart = (a: number, b: number): boolean => {
        if (this.finish[a] !== this.finish[b]) return false;
        if (this.zone[a] !== this.zone[b]) return false;
        for (let k = 0; k < 4; k += 1) {
          if (this.skinIndex[a * 4 + k] !== this.skinIndex[b * 4 + k]) return false;
          if (Math.abs(this.skinWeight[a * 4 + k] - this.skinWeight[b * 4 + k]) > 1e-6) return false;
        }
        return true;
      };
      const splits = (a: number, b: number): boolean =>
        dentro[a] === 1 && dentro[b] === 1 && samePart(a, b) && tooLong(a, b);
      const cut = (a: number, b: number): number => {
        const key = a < b ? a * stride + b : b * stride + a;
        const found = cache.get(key);
        if (found !== undefined) return found;
        const m = this.midpoint(a, b, normal);
        cache.set(key, m);
        return m;
      };

      const src = this.index.slice();
      this.index.length = 0;
      for (let t = 0; t < src.length; t += 3) {
        const i0 = src[t];
        const i1 = src[t + 1];
        const i2 = src[t + 2];
        // Longe da bola não há o que perguntar: é o caso de quase
        // todo o corpo.
        if (dentro[i0] === 0 && dentro[i1] === 0 && dentro[i2] === 0) {
          this.index.push(i0, i1, i2);
          continue;
        }
        const s0 = splits(i0, i1);
        const s1 = splits(i1, i2);
        const s2 = splits(i2, i0);
        const n = (s0 ? 1 : 0) + (s1 ? 1 : 0) + (s2 ? 1 : 0);
        if (n === 0) {
          this.index.push(i0, i1, i2);
        } else if (n === 3) {
          const m0 = cut(i0, i1);
          const m1 = cut(i1, i2);
          const m2 = cut(i2, i0);
          this.index.push(i0, m0, m2, m0, i1, m1, m2, m1, i2, m0, m1, m2);
        } else if (n === 1) {
          // Bissecção: o vértice novo liga ao canto oposto.
          if (s0) {
            const m = cut(i0, i1);
            this.index.push(i0, m, i2, m, i1, i2);
          } else if (s1) {
            const m = cut(i1, i2);
            this.index.push(i1, m, i0, m, i2, i0);
          } else {
            const m = cut(i2, i0);
            this.index.push(i2, m, i1, m, i0, i1);
          }
        } else if (s0 && s1) {
          // Duas arestas: uma ponta mais o quadrilátero que sobra.
          const m0 = cut(i0, i1);
          const m1 = cut(i1, i2);
          this.index.push(m0, i1, m1, i0, m0, m1, i0, m1, i2);
        } else if (s1 && s2) {
          const m1 = cut(i1, i2);
          const m2 = cut(i2, i0);
          this.index.push(m1, i2, m2, i1, m1, m2, i1, m2, i0);
        } else {
          const m2 = cut(i2, i0);
          const m0 = cut(i0, i1);
          this.index.push(m2, i0, m0, i2, m2, m0, i2, m0, i1);
        }
      }
      if (cache.size === 0) break; // já está fino o bastante
    }
  }

  /**
   * Levanta a frente da superfície até um campo de altura, com união
   * suave.
   *
   * `height(x, y)` devolve até onde a pele deve avançar em z naquele
   * ponto, ou `-Infinity` onde o traço não alcança. O vértice vai para
   * o **máximo suave** entre onde já estava e esse alvo — nunca para
   * trás. Onde o alvo está atrás da pele (a raiz do nariz, que é mais
   * funda que a testa) nada acontece, e o traço termina sozinho, sem
   * borda: é a união que faz a integração, não um disfarce por cima.
   *
   * O máximo suave é o polinomial, `mix(a, b, h) + k·h·(1 − h)`, que é
   * contínuo na primeira derivada. O `max` cru também uniria as duas
   * superfícies, mas deixaria uma quina de luz em toda a linha de
   * encontro — exatamente o defeito que se quer eliminar.
   */
  sculptFront(
    center: readonly [number, number, number],
    radius: number,
    height: (x: number, y: number) => number,
    blend: number,
  ): void {
    const [cx, cy, cz] = center;
    const r2 = radius * radius;
    for (let i = 0; i < this.position.length; i += 3) {
      const x = this.position[i];
      const y = this.position[i + 1];
      const z = this.position[i + 2];
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      // A bola também é o que protege a nuca: ela fica a mais de um
      // raio de cabeça daqui, e um campo de altura em z puxaria o
      // crânio inteiro para a frente se fosse aplicado sem limite.
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      const aim = height(x, y);
      if (!Number.isFinite(aim)) continue;
      const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (aim - z)) / blend));
      this.position[i + 2] = z * (1 - h) + aim * h + blend * h * (1 - h);
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

  /**
   * Tinge os vértices dentro de uma região elipsoidal.
   *
   * O irmão de `feature`: aquele empurra a superfície, este pinta a
   * que já existe. Serve para o que é cor e não é forma — o rubor das
   * maçãs, o vermelho dos lábios, a sombra de uma dobra. Antes, o
   * rubor eram duas bolas achatadas coladas na bochecha, e elas
   * furavam a silhueta: de perfil, apareciam duas abas rosa saindo do
   * rosto. Cor não precisa de geometria.
   *
   * @param amount 0 não muda nada, 1 substitui a cor no centro.
   */
  paint(
    center: readonly [number, number, number],
    radius: readonly [number, number, number],
    color: THREE.ColorRepresentation,
    amount: number,
    falloff = 1.4,
  ): void {
    const [cx, cy, cz] = center;
    const [rx, ry, rz] = radius;
    const tone = new THREE.Color(color);
    for (let i = 0, c = 0; i < this.position.length; i += 3, c += 3) {
      const dx = (this.position[i] - cx) / rx;
      const dy = (this.position[i + 1] - cy) / ry;
      const dz = (this.position[i + 2] - cz) / rz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 9) continue;
      const w = Math.exp(-d2 * falloff) * amount;
      if (w < 0.002) continue;
      this.color[c] += (tone.r - this.color[c]) * w;
      this.color[c + 1] += (tone.g - this.color[c + 1]) * w;
      this.color[c + 2] += (tone.b - this.color[c + 2]) * w;
    }
  }

  /**
   * Oclusão ambiente assada na cor dos vértices.
   *
   * É o que mais separa um modelo cru de um acabado, e o que as
   * referências de qualidade têm e este rosto não tinha: sombra nas
   * órbitas, sob o queixo, na dobra do pescoço, embaixo do lábio,
   * entre as pernas, por baixo da saia. Sem isso cada superfície
   * recebe a mesma luz do céu e o rosto fica chapado, por mais
   * anatomia que tenha.
   *
   * O método é o de nuvem de pontos: para cada vértice, os vizinhos
   * que estão **à frente da sua normal** o ocludem, tanto mais quanto
   * mais perto. Numa dobra, o vértice tem vizinhos dos dois lados
   * dentro do hemisfério e escurece; numa superfície aberta, quase
   * nenhum.
   *
   * Uma grade espacial evita o custo quadrático: com 37 mil vértices,
   * comparar todos contra todos seriam 1,4 bilhão de pares. Dividido
   * em células do tamanho do raio, cada vértice só olha as 27 células
   * à sua volta.
   */
  /** Amostras de vizinhança por célula, na oclusão. Ver `occlude`. */
  private static readonly OCCLUSION_SAMPLES = 3;

  occlude(radius: number, strength: number, floor = 0.45): void {
    const count = this.position.length / 3;
    if (count === 0 || radius <= 0) return;

    const normal = this.vertexNormals();

    // Grade espacial, uma célula por raio.
    const cell = radius;
    const grid = new Map<number, number[]>();
    const key = (x: number, y: number, z: number): number =>
      (Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663) ^ (Math.floor(z / cell) * 83492791);
    for (let v = 0; v < count; v += 1) {
      const i = v * 3;
      const k = key(this.position[i], this.position[i + 1], this.position[i + 2]);
      const bucket = grid.get(k);
      if (bucket) bucket.push(v);
      else grid.set(k, [v]);
    }

    // As vinte e sete células vizinhas são uma propriedade da
    // célula, não do vértice: todos os vértices de uma mesma célula
    // enxergam exatamente a mesma vizinhança. Montar essa lista uma
    // vez por célula, e não uma vez por vértice, tira um milhão de
    // consultas à tabela sem mudar um número sequer do resultado.
    const r2 = radius * radius;
    const candidates: number[] = [];
    for (const [, cellMembers] of grid) {
      const first = cellMembers[0] * 3;
      const cxi = Math.floor(this.position[first] / cell);
      const cyi = Math.floor(this.position[first + 1] / cell);
      const czi = Math.floor(this.position[first + 2] / cell);
      candidates.length = 0;
      for (let gx = -1; gx <= 1; gx += 1) {
        for (let gy = -1; gy <= 1; gy += 1) {
          for (let gz = -1; gz <= 1; gz += 1) {
            const bucket = grid.get(((cxi + gx) * 73856093) ^ ((cyi + gy) * 19349663) ^ ((czi + gz) * 83492791));
            if (!bucket) continue;
            // A amostragem acontece **aqui**, ao montar a lista — não
            // depois, ao percorrê-la. Copiar as vinte e sete células
            // inteiras para só então ler uma amostra seria pagar a
            // enumeração completa de novo, que é exatamente o custo
            // que a grade existe para evitar.
            const stride = Math.max(1, Math.ceil(bucket.length / SurfaceBuilder.OCCLUSION_SAMPLES));
            for (let bi = 0; bi < bucket.length; bi += stride) candidates.push(bucket[bi]);
          }
        }
      }
      // Amostragem, não enumeração. A cabeça concentra dezenas de
      // milhares de vértices num palmo, então a vizinhança lá dentro
      // tem milhares — e varrê-la inteira devolvia o custo quadrático
      // que a grade existe para evitar. A oclusão é um sinal de
      // frequência muito baixa: algumas dezenas de amostras dão o
      // mesmo número (medido: o canto do olho
      // dá 0,33 com três amostras por célula e 0,33 com doze).
      for (const v of cellMembers) {
        const i = v * 3;
        const px = this.position[i];
        const py = this.position[i + 1];
        const pz = this.position[i + 2];
        let nx = normal[i];
        let ny = normal[i + 1];
        let nz = normal[i + 2];
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) continue;
        nx /= len;
        ny /= len;
        nz /= len;

        let sum = 0;
        let seen = 0;
        for (let ci = 0; ci < candidates.length; ci += 1) {
          const w = candidates[ci];
          if (w === v) continue;
          const j = w * 3;
          const dx = this.position[j] - px;
          const dy = this.position[j + 1] - py;
          const dz = this.position[j + 2] - pz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2 || d2 < 1e-12) continue;
          seen += 1;
          const d = Math.sqrt(d2);
          // Só ocludem os vizinhos à frente da normal.
          const facing = (dx * nx + dy * ny + dz * nz) / d;
          if (facing <= 0) continue;
          sum += facing * (1 - d / radius);
        }
        // Normalizado pela vizinhança: assim a malha densa e a
        // esparsa recebem a mesma sombra, e o LOD não muda a cor do
        // personagem.
        //
        // E vai para um atributo próprio, **não** multiplicado na cor.
        // Oclusão ambiente descreve quanta luz do céu chega a um
        // ponto; não tem nada a dizer sobre o sol, que vem de uma
        // direção só e ou bate ou não bate. Misturá-la no albedo
        // apagava os dois juntos: a pele na dobra perdia a luz direta
        // também e saía cinza-oliva, porque o que restava era o
        // ambiente esverdeado do chão. Quem separa os dois é o
        // shader.
        if (seen === 0) continue;
        this.ao[v] = Math.max(floor, 1 - (sum / seen) * strength);
      }
    }

    this.smoothOcclusion(2);
  }

  /**
   * Passa um filtro de média na oclusão, pelos vizinhos da malha.
   *
   * A estimativa acima é uma **amostra**: três vértices por célula,
   * não a vizinhança inteira. Onde a malha tem densidade parecida com
   * a do resto, a amostra é quase a enumeração e o resultado é
   * estável. Onde a malha é localmente muito mais fina — o nariz, que
   * é refinado de propósito — cada célula passa a ter dezenas de
   * vértices, a mesma amostra de três passa a representar muito mais
   * gente, e a variância entre vizinhos explode. O efeito na tela é
   * exatamente o que apareceu no primeiro render do nariz esculpido:
   * manchas, do tamanho de um vértice, confinadas à região refinada.
   *
   * Aumentar o número de amostras custaria em toda a malha para
   * resolver num palmo dela. Filtrar é mais barato e mais correto:
   * oclusão ambiente é um sinal de frequência muito baixa, então
   * média com os vizinhos não apaga informação nenhuma — só o ruído
   * da amostragem. Duas passadas bastam, e o custo é linear no número
   * de arestas.
   */
  private smoothOcclusion(passes: number): void {
    const count = this.ao.length;
    if (count === 0 || this.index.length === 0) return;
    const total = new Float32Array(count);
    const degree = new Uint16Array(count);
    for (let t = 0; t < this.index.length; t += 3) {
      const a = this.index[t];
      const b = this.index[t + 1];
      const c = this.index[t + 2];
      degree[a] += 2;
      degree[b] += 2;
      degree[c] += 2;
    }
    for (let pass = 0; pass < passes; pass += 1) {
      total.fill(0);
      for (let t = 0; t < this.index.length; t += 3) {
        const a = this.index[t];
        const b = this.index[t + 1];
        const c = this.index[t + 2];
        total[a] += this.ao[b] + this.ao[c];
        total[b] += this.ao[a] + this.ao[c];
        total[c] += this.ao[a] + this.ao[b];
      }
      for (let v = 0; v < count; v += 1) {
        if (degree[v] === 0) continue;
        // Metade do próprio valor, metade da vizinhança: suaviza sem
        // achatar o contraste que a dobra realmente tem.
        this.ao[v] = this.ao[v] * 0.5 + (total[v] / degree[v]) * 0.5;
      }
    }
  }

  /** Fecha a malha: normais médias, limites, atributos de pele e morph. */
  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geometry.setAttribute('aFinish', new THREE.Float32BufferAttribute(this.finish, 1));
    geometry.setAttribute('aAo', new THREE.Float32BufferAttribute(this.ao, 1));
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
    // O acompanhamento é interpolado junto: é o que faz o peso subir
    // suavemente da cintura (zero) para a barra, sem degrau entre os
    // anéis de controle.
    follow: blendFollow(a.follow, b.follow, t),
  };
}

function blendFollow(a: FollowSpec | undefined, b: FollowSpec | undefined, t: number): FollowSpec | undefined {
  if (a === undefined && b === undefined) return undefined;
  const spec = a ?? b!;
  return { quadrants: spec.quadrants, weight: lerp(a?.weight ?? 0, b?.weight ?? 0, t) };
}
