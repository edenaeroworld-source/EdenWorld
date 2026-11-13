/**
 * Gente dentro dos prédios.
 *
 * Os moradores e atendentes já existiam nos dados (`residents`), mas
 * no 3D viravam um disco de cristal no chão: o jogador "conversava
 * com Saturno" olhando para um ladrilho aceso. Aqui eles ganham
 * corpo.
 *
 * São figuras simples de propósito — o avatar completo do jogador tem
 * morfologia facial, roupas e gestos, e dez deles numa loja custariam
 * caro num celular. Estas têm oito peças, respiram, olham em volta e
 * algumas caminham por um trajeto fechado.
 *
 * **O trajeto respeita o prédio**: os pontos são dados pelo
 * acabamento, que sabe onde estão as paredes e os móveis. Ninguém
 * atravessa balcão.
 */

import * as THREE from 'three';
import type { InteriorPalette } from './InteriorPalette';

/** De onde vem o corpo de uma pessoa. */
export interface PersonSpec {
  id: string;
  /** Posição em coordenadas locais do interior. */
  x: number;
  z: number;
  /** Para onde olha, quando parada. */
  yaw?: number;
  /** Altura em metros. */
  height?: number;
  tone?: 'clara' | 'morena' | 'escura';
  /** Cor da roupa. Por padrão, o uniforme da casa. */
  outfit?: THREE.Material;
  /** Trajeto fechado, em coordenadas locais. Sem isto, fica parada. */
  path?: readonly { x: number; z: number }[];
  /** Metros por segundo ao caminhar. */
  speed?: number;
  /** Altura do piso do andar em que ela está. */
  baseY?: number;
}

interface Person {
  spec: PersonSpec;
  /** Piso do andar desta pessoa — não o do térreo. */
  baseY: number;
  root: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  torso: THREE.Object3D;
  phase: number;
  leg: number;
  distance: number;
}

/** Comprimento acumulado de um trajeto fechado. */
function pathLength(points: readonly { x: number; z: number }[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Ponto e direção a `distance` metros do início do trajeto. */
function along(points: readonly { x: number; z: number }[], distance: number): { x: number; z: number; yaw: number } {
  let remaining = distance;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const segment = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= segment || i === points.length - 1) {
      const t = segment < 0.001 ? 0 : remaining / segment;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(-(b.z - a.z), b.x - a.x) - Math.PI / 2 };
    }
    remaining -= segment;
  }
  return { x: points[0].x, z: points[0].z, yaw: 0 };
}

export class InteriorPeople {
  readonly group = new THREE.Group();
  private readonly people: Person[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(
    private readonly palette: InteriorPalette,
    private readonly origin: { x: number; z: number },
    private readonly baseY: number,
  ) {
    this.group.name = 'InteriorPessoas';
  }

  get count(): number {
    return this.people.length;
  }

  /** Posição de uma pessoa no mundo, para apontar o diálogo. */
  positionOf(id: string): THREE.Vector3 | null {
    const person = this.people.find((candidate) => candidate.spec.id === id);
    return person ? person.root.position.clone() : null;
  }

  add(spec: PersonSpec): void {
    const height = spec.height ?? 1.72;
    const scale = height / 1.72;
    const skin = spec.tone === 'escura' ? this.palette.skinDeep : spec.tone === 'morena' ? this.palette.skinWarm : this.palette.skin;
    const outfit = spec.outfit ?? this.palette.uniform;

    const root = new THREE.Group();
    root.name = `pessoa:${spec.id}`;
    const baseY = this.baseY + (spec.baseY ?? 0);
    root.position.set(this.origin.x + spec.x, baseY, this.origin.z + spec.z);
    root.rotation.y = spec.yaw ?? 0;
    root.scale.setScalar(scale);

    const piece = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };

    // Tronco e cabeça.
    const torso = new THREE.Group();
    torso.position.set(0, 0.86, 0);
    torso.add(piece(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), outfit, 0, 0.08, 0));
    torso.add(piece(new THREE.SphereGeometry(0.135, 12, 10), skin, 0, 0.52, 0));
    torso.add(piece(new THREE.SphereGeometry(0.142, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), this.palette.hair, 0, 0.545, 0));
    root.add(torso);

    // Braços, pendurados no ombro para poderem balançar.
    const armL = new THREE.Group();
    armL.position.set(-0.24, 1.16, 0);
    armL.add(piece(new THREE.CapsuleGeometry(0.058, 0.44, 3, 7), outfit, 0, -0.24, 0));
    armL.add(piece(new THREE.SphereGeometry(0.06, 8, 6), skin, 0, -0.5, 0));
    const armR = armL.clone();
    armR.position.set(0.24, 1.16, 0);
    root.add(armL, armR);

    // Pernas.
    const legL = new THREE.Group();
    legL.position.set(-0.1, 0.78, 0);
    legL.add(piece(new THREE.CapsuleGeometry(0.075, 0.5, 3, 7), this.palette.graphite, 0, -0.29, 0));
    legL.add(piece(new THREE.BoxGeometry(0.14, 0.08, 0.26), this.palette.gloss, 0, -0.58, 0.04));
    const legR = legL.clone();
    legR.position.set(0.1, 0.78, 0);
    root.add(legL, legR);

    this.group.add(root);
    this.people.push({
      spec,
      baseY,
      root,
      legL,
      legR,
      armL,
      armR,
      torso,
      phase: (spec.id.length * 13 + spec.x * 7 + spec.z * 3) % 6.283,
      leg: 0,
      distance: 0,
    });
  }

  update(dt: number, elapsed: number): void {
    for (const person of this.people) {
      const breath = Math.sin(elapsed * 1.5 + person.phase);
      person.torso.position.y = 0.86 + breath * 0.012;

      if (person.spec.path && person.spec.path.length > 1) {
        const speed = person.spec.speed ?? 0.85;
        const total = pathLength(person.spec.path);
        person.distance = (person.distance + speed * dt) % total;
        const at = along(person.spec.path, person.distance);
        person.root.position.x = this.origin.x + at.x;
        person.root.position.z = this.origin.z + at.z;
        person.root.rotation.y = at.yaw;
        person.leg += speed * dt * 3.4;
        const swing = Math.sin(person.leg) * 0.5;
        person.legL.rotation.x = swing;
        person.legR.rotation.x = -swing;
        person.armL.rotation.x = -swing * 0.7;
        person.armR.rotation.x = swing * 0.7;
        person.root.position.y = person.baseY + Math.abs(Math.sin(person.leg)) * 0.025;
        continue;
      }

      // Parada: respira, troca o peso de pé e olha em volta devagar.
      const sway = Math.sin(elapsed * 0.7 + person.phase) * 0.06;
      person.root.rotation.y = (person.spec.yaw ?? 0) + sway;
      person.armL.rotation.x = Math.sin(elapsed * 0.9 + person.phase) * 0.07;
      person.armR.rotation.x = Math.sin(elapsed * 0.9 + person.phase + 1.1) * 0.07;
      person.legL.rotation.x = 0;
      person.legR.rotation.x = 0;
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.people.length = 0;
    this.group.clear();
    this.group.removeFromParent();
  }
}
