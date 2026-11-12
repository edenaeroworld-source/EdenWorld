import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU } from '../../utils/math';

/**
 * "Kit de peças" procedurais usadas para montar Aurora City.
 * Todas as peças nascem com a base em y = 0 e centradas em XZ.
 */

export function cyl(radiusTop: number, radiusBottom: number, height: number, radial = 24, openEnded = false): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial, 1, openEnded);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

export function box(width: number, height: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

export function sphere(radius: number, widthSegments = 20, heightSegments = 14): THREE.BufferGeometry {
  return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
}

/** Meia-esfera (cúpula) com a base em y = 0. */
export function dome(radius: number, widthSegments = 28, heightSegments = 12, squash = 1): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments, 0, TAU, 0, Math.PI / 2);
  if (squash !== 1) geometry.scale(1, squash, 1);
  return geometry;
}

/** Toro deitado no plano XZ. */
export function torus(radius: number, tube: number, radialSegments = 10, tubularSegments = 48, arc = TAU): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Superfície de revolução a partir de um perfil [raio, altura] (de baixo para cima). */
export function lathe(profile: readonly (readonly [number, number])[], segments = 32, phiStart = 0, phiLength = TAU): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
    segments,
    phiStart,
    phiLength,
  );
}

/** Converte um arco na convenção do layout (x = cos a, z = sin a) para phi do LatheGeometry. */
function toPhi(angleStart: number, angleLength: number): { phiStart: number; phiLength: number } {
  return { phiStart: Math.PI / 2 - angleStart - angleLength, phiLength: angleLength };
}

/** Face plana que fecha a extremidade de um arco no ângulo dado. */
function arcCap(inner: number, outer: number, y0: number, y1: number, angle: number, forward: boolean): THREE.BufferGeometry {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const sign = forward ? 1 : -1;
  const nx = -dz * sign;
  const nz = dx * sign;
  const positions = new Float32Array([
    dx * inner, y0, dz * inner,
    dx * outer, y0, dz * outer,
    dx * outer, y1, dz * outer,
    dx * inner, y1, dz * inner,
  ]);
  const normals = new Float32Array([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(forward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  return geometry;
}

export interface AnnulusOptions {
  angleStart?: number;
  angleLength?: number;
  segments?: number;
  /** Inclui a face inferior (necessário apenas para peças suspensas). */
  bottom?: boolean;
}

/**
 * Anel (ou arco) com seção retangular: pisos circulares, muretas, bordas
 * de fontes, lajes de terraços. Arestas vivas (faces separadas).
 */
export function annulus(inner: number, outer: number, y0: number, y1: number, options: AnnulusOptions = {}): THREE.BufferGeometry {
  const full = options.angleLength === undefined || options.angleLength >= TAU - 1e-6;
  const { phiStart, phiLength } = full ? { phiStart: 0, phiLength: TAU } : toPhi(options.angleStart ?? 0, options.angleLength ?? TAU);
  const segments = options.segments ?? Math.max(8, Math.round((48 * phiLength) / TAU));
  const parts: THREE.BufferGeometry[] = [];
  const face = (a: [number, number], b: [number, number]): void => {
    parts.push(lathe([a, b], segments, phiStart, phiLength));
  };
  face([outer, y0], [outer, y1]); // parede externa
  face([outer, y1], [Math.max(inner, 0.0001), y1]); // topo
  if (inner > 0.001) face([inner, y1], [inner, y0]); // parede interna
  if (options.bottom) face([Math.max(inner, 0.0001), y0], [outer, y0]);

  if (!full) {
    // Tampas das extremidades do arco (normal = tangente do arco, para fora).
    const a0 = options.angleStart ?? 0;
    const a1 = a0 + (options.angleLength ?? 0);
    parts.push(arcCap(inner, outer, y0, y1, a0, false), arcCap(inner, outer, y0, y1, a1, true));
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('[Kit] Falha ao gerar anel');
  return merged;
}

/** Disco sólido (cilindro baixo) entre y0 e y1. */
export function disc(radius: number, y0: number, y1: number, segments = 48): THREE.BufferGeometry {
  return annulus(0, radius, y0, y1, { segments });
}

/** Tubo ao longo de uma curva suave que passa pelos pontos dados. */
export function tube(points: readonly THREE.Vector3[], radius: number, tubularSegments = 24, radialSegments = 8, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points as THREE.Vector3[], closed, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
}

/** Multiplica as coordenadas UV (repete texturas de fachada por metro). */
export function scaleUV<T extends THREE.BufferGeometry>(geometry: T, su: number, sv: number): T {
  const uv = geometry.getAttribute('uv');
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
  }
  return geometry;
}

/** Cristal: prisma hexagonal com ponta. */
export function crystalShard(radius: number, height: number): THREE.BufferGeometry {
  const body = height * 0.68;
  const prism = new THREE.CylinderGeometry(radius, radius * 0.82, body, 6, 1, false);
  prism.translate(0, body / 2, 0);
  const tip = new THREE.ConeGeometry(radius, height - body, 6, 1, false);
  tip.translate(0, body + (height - body) / 2, 0);
  const merged = mergeGeometries([prism, tip], false);
  prism.dispose();
  tip.dispose();
  if (!merged) throw new Error('[Kit] Falha ao gerar cristal');
  return merged;
}

/** Massa de folhagem: icosaedro levemente irregular. */
export function blob(radius: number, detail: number, rng: () => number, irregularity = 0.18): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute('position');
  // Vértices coincidentes devem receber o mesmo deslocamento (sem abrir fendas).
  const cache = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) {
      k = 1 + (rng() - 0.5) * 2 * irregularity;
      cache.set(key, k);
    }
    position.setXYZ(i, x * k, y * k, z * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Pinta cores de vértice em gradiente vertical (base → topo). */
export function paintVerticalGradient(
  geometry: THREE.BufferGeometry,
  bottom: THREE.ColorRepresentation,
  top: THREE.ColorRepresentation,
  yMin?: number,
  yMax?: number,
): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  geometry.computeBoundingBox();
  const box3 = geometry.boundingBox;
  const lo = yMin ?? box3?.min.y ?? 0;
  const hi = yMax ?? box3?.max.y ?? 1;
  const cBottom = new THREE.Color(bottom);
  const cTop = new THREE.Color(top);
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const t = hi > lo ? THREE.MathUtils.clamp((position.getY(i) - lo) / (hi - lo), 0, 1) : 1;
    c.copy(cBottom).lerp(cTop, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Funde geometrias preservando cores de vértice (todas devem ter os mesmos atributos). */
export function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(prepared, false);
  for (const part of parts) part.dispose();
  for (const part of prepared) part.dispose();
  if (!merged) throw new Error('[Kit] Falha ao fundir geometrias');
  return merged;
}

/** Inverte a orientação das faces (para ver uma casca por dentro). */
export function flip<T extends THREE.BufferGeometry>(geometry: T): T {
  const index = geometry.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
    index.needsUpdate = true;
  } else {
    for (const name of Object.keys(geometry.attributes)) {
      const attribute = geometry.getAttribute(name);
      const size = attribute.itemSize;
      for (let i = 0; i < attribute.count; i += 3) {
        for (let k = 0; k < size; k++) {
          const b = attribute.getComponent(i + 1, k);
          attribute.setComponent(i + 1, k, attribute.getComponent(i + 2, k));
          attribute.setComponent(i + 2, k, b);
        }
      }
      attribute.needsUpdate = true;
    }
  }
  const normal = geometry.getAttribute('normal');
  if (normal) {
    for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
    normal.needsUpdate = true;
  }
  return geometry;
}

/** Casca de duas faces: devolve a geometria original e uma cópia invertida. */
export function doubleSided(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  return [geometry, flip(geometry.clone())];
}
