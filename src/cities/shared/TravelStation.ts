/**
 * Estação do Éden: o jeito de sair de uma região a pé.
 *
 * Existe uma em cada região construída, sempre com a mesma forma — um
 * disco de pedra, um arco e uma esfera girando dentro dele. A forma é
 * a mesma de propósito: quem reconhece uma reconhece todas, e é assim
 * que o jogador aprende que aquilo leva a outro lugar sem ninguém
 * precisar explicar.
 *
 * Quem usa a estação abre o Mapa do Éden já na lista de destinos. A
 * viagem em si é do `UniverseSystem`; aqui só fica a porta.
 */

import * as THREE from 'three';
import type { CityContext } from '../aurora-city/CityContext';
import { annulus, cyl, disc, sphere, torus } from '../aurora-city/Kit';

export interface TravelStationOptions {
  /** Id do interativo (único na região). */
  id: string;
  /** Nome mostrado no aviso de interação. */
  name: string;
  x: number;
  z: number;
  /** Altura do chão ali. Quando omitida, é lida do relevo. */
  groundY?: number;
  /** Cor do halo e do anel, para combinar com a paleta da região. */
  color?: number;
}

/** Raio do piso da estação, em metros. */
export const STATION_RADIUS = 3.6;

/**
 * Constrói uma estação e devolve o interativo criado.
 *
 * O piso é pisável e o pilar central barra: dá para subir no disco e
 * dar a volta, mas não atravessar o arco como se fosse ar.
 */
export function buildTravelStation(ctx: CityContext, options: TravelStationOptions): void {
  const { id, name, x, z } = options;
  const color = options.color ?? 0x8fe6ff;
  const y = options.groundY ?? ctx.ground(x, z);
  const batch = ctx.batch();
  const m = ctx.materials;

  // Piso: um disco baixo de pedra com borda clara.
  batch.add(cyl(STATION_RADIUS, STATION_RADIUS + 0.25, 0.34, 32), m.stone, new THREE.Matrix4().makeTranslation(x, y + 0.17, z));
  batch.add(annulus(STATION_RADIUS - 0.75, STATION_RADIUS - 0.1, y + 0.34, y + 0.37, { segments: 40 }), m.white, new THREE.Matrix4().makeTranslation(x, 0, z));

  // Arco: dois pés e um anel no alto.
  for (const side of [-1, 1]) {
    batch.add(cyl(0.2, 0.26, 3.6, 14), m.metal, new THREE.Matrix4().makeTranslation(x + side * (STATION_RADIUS - 0.9), y + 1.8, z));
  }
  const ring = torus(1.9, 0.16, 8, 40);
  batch.add(ring, m.crystal, new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(x, y + 3.5, z)));

  // Pedestal central, na altura da mão.
  batch.add(cyl(0.42, 0.58, 1.1, 16), m.metal, new THREE.Matrix4().makeTranslation(x, y + 0.89, z));
  batch.add(disc(0.56, 0, 0.06, 20), m.white, new THREE.Matrix4().makeTranslation(x, y + 1.44, z));
  ctx.commit(batch, `estacao:${id}`);

  // A esfera do destino: gira devagar dentro do arco.
  const orbGeometry = sphere(0.52, 22, 16);
  const orb = new THREE.Mesh(orbGeometry, m.crystal);
  orb.position.set(x, y + 2.3, z);
  ctx.root.add(orb);
  ctx.disposables.push(orbGeometry);
  ctx.animate(({ dt, elapsed }) => {
    orb.rotation.y += dt * 0.6;
    orb.position.y = y + 2.3 + Math.sin(elapsed * 0.9) * 0.08;
  });

  // Física: o disco é piso, o pedestal é obstáculo.
  ctx.physics.addCylinder({ x, z, radius: STATION_RADIUS + 0.25, yMin: y - 1, yMax: y + 0.34, walkable: true, tag: `estacao:${id}:piso` });
  ctx.physics.addCylinder({ x, z, radius: 0.72, yMin: y, yMax: y + 1.5, walkable: false, blocksCamera: false, tag: `estacao:${id}` });

  ctx.lightSpots.push({ x, y: y + 0.4, z, radius: 7, color });
  ctx.reserve(x, z, STATION_RADIUS + 2);

  ctx.addInteractable({
    id,
    name,
    action: 'Viajar',
    x,
    y: y + 1.4,
    z,
    range: STATION_RADIUS + 1.4,
    payload: { type: 'estacao' },
  });
}
