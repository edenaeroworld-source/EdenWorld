/**
 * Corpos 3D dos bichos do Éden.
 *
 * O registro de espécies (`Species.ts`) sempre teve os dados — porte,
 * cores, jeito de andar — mas nenhum deles virava imagem. Aqui eles
 * viram.
 *
 * Nada é modelo importado: cada bicho é montado com primitivas a
 * partir do `Movement` e do `size` da espécie. Isso tem duas vantagens
 * que importam: uma espécie nova ganha corpo só por ser registrada, e
 * o custo em memória é quase nada, o que é o que torna possível ter
 * fauna no celular.
 *
 * Cada corpo expõe as partes que a animação move (`legs`, `head`,
 * `tail`, `wings`), e é `CreatureAnimator` quem as move.
 */

import * as THREE from 'three';
import type { Movement, Species } from './Species';

export interface CreatureParts {
  root: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Object3D | null;
  tail: THREE.Object3D | null;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  /** Altura do bicho em pé, para assentar no chão. */
  standHeight: number;
  /** Materiais criados para este corpo (liberados no dispose). */
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

/**
 * Monta o corpo de uma espécie.
 *
 * @param scale multiplicador global, para filhotes e variação.
 * @param detail densidade de malha, vinda do perfil de qualidade.
 */

/** Densidade de malha dos bichos, por nível de qualidade. */
export interface CreatureDetail {
  /** Gomos em volta do corpo. */
  radial: number;
  /** Estações ao longo do dorso. */
  along: number;
  /** Gomos das peças pequenas (focinho, patas, orelhas). */
  small: number;
}

export const CREATURE_DETAIL: Readonly<Record<'ultra' | 'alta' | 'media' | 'baixa', CreatureDetail>> = Object.freeze({
  ultra: { radial: 20, along: 18, small: 10 },
  alta: { radial: 14, along: 13, small: 8 },
  media: { radial: 10, along: 9, small: 6 },
  baixa: { radial: 7, along: 6, small: 4 },
});

/** Uma estação do dorso: distância ao longo do eixo e raio ali. */
interface Spine {
  /** Posição em z, de −1 (rabo) a 1 (cabeça). */
  t: number;
  /** Raio lateral, em múltiplos de `radius`. */
  rx: number;
  /** Raio vertical. */
  ry: number;
  /** Deslocamento vertical do eixo — é o que curva o lombo. */
  y?: number;
}

/**
 * Varre um perfil ao longo do dorso e fecha as pontas.
 *
 * O corpo de todo bicho era uma cápsula: um cilindro de raio
 * constante com duas meias-esferas. Nenhum animal tem raio constante
 * — o peito é mais largo que a cintura, a garupa é mais alta que o
 * ombro, e é essa variação que faz a diferença entre um bicho e um
 * comprimido. Uma varredura custa os mesmos vértices que a cápsula e
 * aceita qualquer silhueta.
 */
function sweptBody(spine: readonly Spine[], radius: number, length: number, detail: CreatureDetail): THREE.BufferGeometry {
  const radial = Math.max(4, detail.radial);
  const position: number[] = [];
  const index: number[] = [];
  const ring = (t: number, rx: number, ry: number, y: number): number => {
    const first = position.length / 3;
    for (let i = 0; i < radial; i += 1) {
      const a = (i / radial) * Math.PI * 2;
      position.push(Math.cos(a) * rx, y + Math.sin(a) * ry, (t * length) / 2);
    }
    return first;
  };

  // Ponta do rabo: um só vértice, para a varredura fechar sem disco.
  const tail = spine[0];
  position.push(0, (tail.y ?? 0) * radius, (tail.t * length) / 2);
  const tailTip = 0;

  const rings: number[] = [];
  for (const st of spine) rings.push(ring(st.t, st.rx * radius, st.ry * radius, (st.y ?? 0) * radius));

  const nose = spine[spine.length - 1];
  position.push(0, (nose.y ?? 0) * radius, (nose.t * length) / 2);
  const noseTip = position.length / 3 - 1;

  for (let i = 0; i < radial; i += 1) {
    const j = (i + 1) % radial;
    index.push(tailTip, rings[0] + j, rings[0] + i);
    index.push(noseTip, rings[rings.length - 1] + i, rings[rings.length - 1] + j);
  }
  for (let r = 0; r + 1 < rings.length; r += 1) {
    for (let i = 0; i < radial; i += 1) {
      const j = (i + 1) % radial;
      const a = rings[r] + i;
      const b = rings[r] + j;
      const c = rings[r + 1] + i;
      const d = rings[r + 1] + j;
      index.push(a, b, d, a, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildCreature(species: Species, scale = 1, detail: CreatureDetail = CREATURE_DETAIL.alta): CreatureParts {
  const main = new THREE.Color(species.colors[0]);
  const accent = new THREE.Color(species.colors[1]);

  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const makeMaterial = (color: THREE.Color): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      color,
      // Pelo e pena são superfícies muito difusas, mas não mates: o
      // realce largo é o que faz o lombo parecer curvo. Quem brilha é
      // quase liso, para a luz própria ter onde escorregar.
      roughness: species.glows ? 0.3 : 0.82,
      metalness: 0,
      // O mundo guarda um PMREM do céu em `scene.environment`; sem
      // ler dele, o bicho ficava mais fosco que o chão em que pisa.
      envMapIntensity: species.glows ? 0.6 : 1.1,
      emissive: species.glows ? color.clone().multiplyScalar(0.7) : new THREE.Color(0x000000),
      emissiveIntensity: species.glows ? 1.4 : 0,
      transparent: species.glows,
      opacity: species.glows ? 0.88 : 1,
    });
    materials.push(material);
    return material;
  };

  const skin = makeMaterial(main);
  const trim = makeMaterial(accent);

  const track = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };

  const root = new THREE.Group();
  root.name = `bicho:${species.id}`;

  // `size` é altura no lombo (ou envergadura, para quem voa). O corpo
  // é dimensionado a partir dele para que um veado seja mesmo maior
  // que um esquilo, sem tabela à parte.
  const s = Math.max(0.08, species.size) * scale;

  const parts: CreatureParts = {
    root,
    body: root,
    head: null,
    tail: null,
    legs: [],
    wings: [],
    standHeight: s,
    materials,
    geometries,
  };

  const plan: Movement = species.movement;

  if (plan === 'voa') {
    // Quem voa: corpo pequeno, asas grandes, sem pernas visíveis.
    const bodyLength = s * 1.6;
    // Fuso de ave: peito cheio à frente, afinando para a cauda.
    const body = new THREE.Mesh(
      track(
        sweptBody(
          [
            { t: -1, rx: 0.18, ry: 0.18 },
            { t: -0.55, rx: 0.58, ry: 0.5 },
            { t: -0.1, rx: 0.95, ry: 0.84 },
            { t: 0.45, rx: 1.0, ry: 0.9 },
            { t: 1, rx: 0.42, ry: 0.44 },
          ],
          s * 0.5,
          bodyLength,
          detail,
        ),
      ),
      skin,
    );
    root.add(body);
    parts.body = body;

    const head = new THREE.Mesh(track(new THREE.SphereGeometry(s * 0.34, detail.small + 1, detail.small - 1)), skin);
    head.position.set(0, s * 0.2, bodyLength * 0.55);
    root.add(head);
    parts.head = head;

    const beak = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.12, s * 0.34, detail.small)), trim);
    beak.rotation.x = Math.PI / 2;
    beak.position.z = s * 0.3;
    head.add(beak);

    // Borboleta tem asa chata e larga; pássaro tem asa estreita.
    const butterfly = species.id.includes('borboleta');
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      const shape = butterfly
        ? track(new THREE.CircleGeometry(s * 1.1, detail.small + 2))
        : track(new THREE.SphereGeometry(s * 0.9, detail.small, Math.max(4, detail.small - 3)));
      const mesh = new THREE.Mesh(shape, trim);
      if (butterfly) {
        mesh.position.x = side * s * 0.95;
        mesh.rotation.y = side * Math.PI * 0.5;
        (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      } else {
        mesh.scale.set(1, 0.14, 0.45);
        mesh.position.x = side * s * 0.78;
      }
      wing.add(mesh);
      wing.position.set(0, s * 0.12, 0);
      root.add(wing);
      parts.wings.push(wing);
    }

    const tail = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.26, s * 0.8, detail.small)), trim);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -bodyLength * 0.6;
    root.add(tail);
    parts.tail = tail;
    parts.standHeight = s * 0.6;
    return parts;
  }

  if (plan === 'nada') {
    // Quem nada: corpo fusiforme e cauda que varre.
    const body = new THREE.Mesh(
      track(
        sweptBody(
          [
            { t: -1, rx: 0.1, ry: 0.22 },
            { t: -0.6, rx: 0.42, ry: 0.62 },
            { t: -0.1, rx: 0.86, ry: 1.02 },
            { t: 0.45, rx: 0.94, ry: 1.0 },
            { t: 1, rx: 0.3, ry: 0.38 },
          ],
          s * 0.6,
          s * 1.9,
          detail,
        ),
      ),
      skin,
    );
    body.scale.set(0.7, 0.72, 1.9);
    root.add(body);
    parts.body = body;

    const head = new THREE.Mesh(track(new THREE.SphereGeometry(s * 0.42, 10, 8)), skin);
    head.position.z = s * 0.95;
    root.add(head);
    parts.head = head;

    const tail = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.5, s * 0.9, 5)), trim);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -s * 1.2;
    root.add(tail);
    parts.tail = tail;

    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.26, s * 0.5, Math.max(4, detail.small - 2))), trim);
      fin.rotation.z = (side * Math.PI) / 2.4;
      fin.position.set(side * s * 0.46, -s * 0.1, s * 0.2);
      root.add(fin);
      parts.legs.push(fin);
    }
    parts.standHeight = s * 0.5;
    return parts;
  }

  if (plan === 'flutua') {
    // Criaturas do Éden: um núcleo luminoso e satélites em volta.
    const core = new THREE.Mesh(track(new THREE.IcosahedronGeometry(s * 0.6, detail.radial >= 14 ? 2 : 1)), skin);
    root.add(core);
    parts.body = core;

    for (let i = 0; i < 4; i += 1) {
      const shard = new THREE.Mesh(track(new THREE.TetrahedronGeometry(s * 0.22)), trim);
      const angle = (i / 4) * Math.PI * 2;
      shard.position.set(Math.cos(angle) * s * 0.95, Math.sin(i) * s * 0.3, Math.sin(angle) * s * 0.95);
      root.add(shard);
      parts.wings.push(shard);
    }
    parts.standHeight = s * 1.4;
    return parts;
  }

  // Quem anda, salta ou rasteja: quadrúpede.
  const hop = plan === 'salta';
  const crawl = plan === 'rasteja';
  const bodyLength = s * (crawl ? 2.6 : hop ? 1.5 : 1.9);
  const bodyRadius = s * (crawl ? 0.38 : hop ? 0.52 : 0.45);

  // Peito largo, cintura marcada, garupa alta: é o perfil que separa
  // um bicho de um comprimido. Quem rasteja é quase cilíndrico, quem
  // salta tem a garupa bem acima do ombro.
  const rump = hop ? 1.08 : crawl ? 0.96 : 1.0;
  const spine: Spine[] = [
    { t: -1, rx: 0.16, ry: 0.16, y: crawl ? 0 : 0.1 },
    { t: -0.76, rx: 0.68 * rump, ry: 0.72 * rump, y: crawl ? 0 : 0.08 },
    { t: -0.4, rx: 0.96 * rump, ry: 1.0 * rump, y: crawl ? 0 : 0.04 },
    // A cintura é de verdade, mas discreta: afundá-la mais partia o
    // bicho em dois caroços, um atrás e um à frente.
    { t: -0.05, rx: 0.93, ry: 0.92, y: 0 },
    { t: 0.32, rx: 1.0, ry: 0.98, y: 0.02 },
    // A frente não afina até virar bico. Ela termina na base do
    // pescoço, larga o bastante para a cabeça assentar em cima sem
    // deixar degrau — era o degrau que fazia o corpo e a cabeça
    // parecerem duas peças soltas encostadas uma na outra.
    { t: 0.74, rx: 0.86, ry: 0.84, y: 0.07 },
    { t: 1, rx: 0.62, ry: 0.6, y: 0.14 },
  ];
  const body = new THREE.Mesh(track(sweptBody(spine, bodyRadius, bodyLength, detail)), skin);
  body.position.y = s * (crawl ? 0.3 : 0.72);
  root.add(body);
  parts.body = body;

  const head = new THREE.Group();
  const skull = new THREE.Mesh(track(new THREE.SphereGeometry(s * (hop ? 0.4 : 0.36), detail.small + 2, detail.small)), skin);
  head.add(skull);
  const snout = new THREE.Mesh(track(new THREE.SphereGeometry(s * 0.2, detail.small, detail.small - 2)), trim);
  snout.scale.set(0.8, 0.7, 1.4);
  snout.position.set(0, -s * 0.08, s * 0.36);
  head.add(snout);

  // Orelhas: altas e longas em quem salta, triangulares em quem anda.
  for (const side of [-1, 1]) {
    const ear = hop
      ? new THREE.Mesh(track(new THREE.CapsuleGeometry(s * 0.09, s * 0.6, 3, detail.small)), trim)
      : new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.16, s * 0.3, detail.small - 1)), trim);
    ear.position.set(side * s * 0.2, s * (hop ? 0.55 : 0.32), hop ? -s * 0.05 : 0);
    ear.rotation.z = side * 0.18;
    head.add(ear);
  }

  // Chifres do veado: só onde o nome diz que há.
  if (species.id === 'veado') {
    for (const side of [-1, 1]) {
      const antler = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.07, s * 0.75, detail.small - 1)), trim);
      antler.position.set(side * s * 0.18, s * 0.6, 0);
      antler.rotation.z = side * 0.4;
      head.add(antler);
    }
  }

  head.position.set(0, s * (crawl ? 0.36 : 0.95), bodyLength * (crawl ? 0.52 : 0.46));
  root.add(head);
  parts.head = head;

  // Pescoço: sem ele a cabeça flutuava à frente do tronco. Quem
  // rasteja não tem — a cabeça sai direto do corpo, que é o que faz
  // um lagarto parecer um lagarto.
  if (!crawl) {
    const neck = new THREE.Mesh(
      track(new THREE.CylinderGeometry(s * 0.19, s * 0.3, s * 0.42, detail.small + 2, 1, true)),
      skin,
    );
    neck.position.set(0, s * 0.82, bodyLength * 0.4);
    neck.rotation.x = -0.5;
    root.add(neck);
  }

  // Patas.
  const legLength = s * (crawl ? 0.26 : hop ? 0.5 : 0.7);
  const legRadius = s * (crawl ? 0.06 : 0.09);
  const spread = bodyRadius * 0.85;
  const positions: [number, number][] = [
    [spread, bodyLength * 0.3],
    [-spread, bodyLength * 0.3],
    [spread, -bodyLength * 0.3],
    [-spread, -bodyLength * 0.3],
  ];
  for (const [lx, lz] of positions) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, s * (crawl ? 0.3 : 0.72) - bodyRadius * 0.4, lz);
    const leg = new THREE.Mesh(track(new THREE.CapsuleGeometry(legRadius, legLength, 3, detail.small)), trim);
    leg.position.y = -legLength / 2;
    pivot.add(leg);
    root.add(pivot);
    parts.legs.push(pivot);
  }

  // Rabo.
  const tailPivot = new THREE.Group();
  const bushy = species.id === 'raposa' || species.id === 'esquilo';
  const tail = bushy
    ? new THREE.Mesh(track(new THREE.CapsuleGeometry(s * 0.26, s * 0.8, 4, detail.small + 1)), trim)
    : new THREE.Mesh(track(new THREE.CapsuleGeometry(s * 0.08, s * 0.6, 3, detail.small)), trim);
  tail.position.y = -(bushy ? s * 0.5 : s * 0.35);
  tailPivot.add(tail);
  tailPivot.position.set(0, s * (crawl ? 0.34 : 0.8), -bodyLength * 0.52);
  tailPivot.rotation.x = bushy ? -0.9 : -0.4;
  root.add(tailPivot);
  parts.tail = tailPivot;

  parts.standHeight = s * (crawl ? 0.3 : 0.72) + legLength * 0.1;
  return parts;
}

/** Libera a geometria e os materiais de um corpo. */
export function disposeCreature(parts: CreatureParts): void {
  for (const geometry of parts.geometries) geometry.dispose();
  for (const material of parts.materials) material.dispose();
  parts.root.clear();
  parts.root.removeFromParent();
}
