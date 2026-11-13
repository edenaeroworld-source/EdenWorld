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
 */
export function buildCreature(species: Species, scale = 1): CreatureParts {
  const main = new THREE.Color(species.colors[0]);
  const accent = new THREE.Color(species.colors[1]);

  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const makeMaterial = (color: THREE.Color): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: species.glows ? 0.3 : 0.78,
      metalness: 0,
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
    const body = new THREE.Mesh(track(new THREE.SphereGeometry(s * 0.5, 10, 8)), skin);
    body.scale.set(1, 0.85, bodyLength / (s * 1.0));
    root.add(body);
    parts.body = body;

    const head = new THREE.Mesh(track(new THREE.SphereGeometry(s * 0.34, 9, 7)), skin);
    head.position.set(0, s * 0.2, bodyLength * 0.55);
    root.add(head);
    parts.head = head;

    const beak = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.12, s * 0.34, 6)), trim);
    beak.rotation.x = Math.PI / 2;
    beak.position.z = s * 0.3;
    head.add(beak);

    // Borboleta tem asa chata e larga; pássaro tem asa estreita.
    const butterfly = species.id.includes('borboleta');
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      const shape = butterfly ? track(new THREE.CircleGeometry(s * 1.1, 10)) : track(new THREE.SphereGeometry(s * 0.9, 8, 5));
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

    const tail = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.26, s * 0.8, 6)), trim);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -bodyLength * 0.6;
    root.add(tail);
    parts.tail = tail;
    parts.standHeight = s * 0.6;
    return parts;
  }

  if (plan === 'nada') {
    // Quem nada: corpo fusiforme e cauda que varre.
    const body = new THREE.Mesh(track(new THREE.SphereGeometry(s * 0.6, 12, 9)), skin);
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
      const fin = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.26, s * 0.5, 4)), trim);
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
    const core = new THREE.Mesh(track(new THREE.IcosahedronGeometry(s * 0.6, 1)), skin);
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

  const body = new THREE.Mesh(track(new THREE.CapsuleGeometry(bodyRadius, bodyLength - bodyRadius * 2, 5, 10)), skin);
  body.rotation.x = Math.PI / 2;
  body.position.y = s * (crawl ? 0.3 : 0.72);
  root.add(body);
  parts.body = body;

  const head = new THREE.Group();
  const skull = new THREE.Mesh(track(new THREE.SphereGeometry(s * (hop ? 0.4 : 0.36), 10, 8)), skin);
  head.add(skull);
  const snout = new THREE.Mesh(track(new THREE.SphereGeometry(s * 0.2, 8, 6)), trim);
  snout.scale.set(0.8, 0.7, 1.4);
  snout.position.set(0, -s * 0.08, s * 0.36);
  head.add(snout);

  // Orelhas: altas e longas em quem salta, triangulares em quem anda.
  for (const side of [-1, 1]) {
    const ear = hop
      ? new THREE.Mesh(track(new THREE.CapsuleGeometry(s * 0.09, s * 0.6, 3, 6)), trim)
      : new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.16, s * 0.3, 5)), trim);
    ear.position.set(side * s * 0.2, s * (hop ? 0.55 : 0.32), hop ? -s * 0.05 : 0);
    ear.rotation.z = side * 0.18;
    head.add(ear);
  }

  // Chifres do veado: só onde o nome diz que há.
  if (species.id === 'veado') {
    for (const side of [-1, 1]) {
      const antler = new THREE.Mesh(track(new THREE.ConeGeometry(s * 0.07, s * 0.75, 5)), trim);
      antler.position.set(side * s * 0.18, s * 0.6, 0);
      antler.rotation.z = side * 0.4;
      head.add(antler);
    }
  }

  head.position.set(0, s * (crawl ? 0.36 : 0.95), bodyLength * 0.52);
  root.add(head);
  parts.head = head;

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
    const leg = new THREE.Mesh(track(new THREE.CapsuleGeometry(legRadius, legLength, 3, 6)), trim);
    leg.position.y = -legLength / 2;
    pivot.add(leg);
    root.add(pivot);
    parts.legs.push(pivot);
  }

  // Rabo.
  const tailPivot = new THREE.Group();
  const bushy = species.id === 'raposa' || species.id === 'esquilo';
  const tail = bushy
    ? new THREE.Mesh(track(new THREE.CapsuleGeometry(s * 0.26, s * 0.8, 4, 8)), trim)
    : new THREE.Mesh(track(new THREE.CapsuleGeometry(s * 0.08, s * 0.6, 3, 6)), trim);
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
