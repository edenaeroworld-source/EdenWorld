import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SurfaceBuilder } from '../../src/player/body/BodySurface';
import { Avatar } from '../../src/player/Avatar';
import { DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';

/** Conta quantos triângulos usam cada aresta da malha. */
function edgeUse(geometry: THREE.BufferGeometry): Map<string, number> {
  const index = geometry.getIndex();
  if (!index) throw new Error('malha sem índice');
  const uses = new Map<string, number>();
  for (let t = 0; t < index.count; t += 3) {
    const v = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    for (let k = 0; k < 3; k += 1) {
      const a = v[k];
      const b = v[(k + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return uses;
}

function sphere(segments: number): SurfaceBuilder {
  const b = new SurfaceBuilder();
  const skin = { color: '#f6c9a4', skin: { bone: 0 } } as const;
  b.ball([0, 0, 0], [1, 1, 1], skin, segments);
  return b;
}

describe('refinamento local da malha', () => {
  it('a esfera de partida é fechada', () => {
    const uses = edgeUse(sphere(14).build());
    expect([...uses.values()].filter((n) => n !== 2)).toHaveLength(0);
  });

  it('refinar um pedaço não racha a malha', () => {
    // É o teste que importa: subdividir só uma região é a receita
    // clássica para o T — um triângulo ganha vértice no meio de uma
    // aresta e o vizinho não, e abre um rasgo exatamente na borda da
    // região. Toda aresta tem de continuar com dois triângulos.
    const b = sphere(14);
    const antes = b.triangleCount;
    b.refine([0, 0, 1], 0.5, 0.08, 4);
    expect(b.triangleCount).toBeGreaterThan(antes);
    const soltas = [...edgeUse(b.build()).entries()].filter(([, n]) => n !== 2);
    expect(soltas).toHaveLength(0);
  });

  it('refinar não mexe em quem já estava lá', () => {
    const b = sphere(14);
    const antes = b.build().getAttribute('position').array.slice(0, 300);
    const c = sphere(14);
    c.refine([0, 0, 1], 0.5, 0.08, 4);
    const depois = c.build().getAttribute('position').array.slice(0, 300);
    expect(Array.from(depois)).toEqual(Array.from(antes));
  });

  it('o alvo de aresta é respeitado dentro da bola', () => {
    const b = sphere(14);
    b.refine([0, 0, 1], 0.5, 0.08, 6);
    const g = b.build();
    const p = g.getAttribute('position');
    const index = g.getIndex()!;
    let piores = 0;
    for (let t = 0; t < index.count; t += 3) {
      for (let k = 0; k < 3; k += 1) {
        const a = index.getX(t + k);
        const c = index.getX(t + ((k + 1) % 3));
        const inside = (v: number) =>
          new THREE.Vector3(p.getX(v), p.getY(v), p.getZ(v)).distanceTo(new THREE.Vector3(0, 0, 1)) <= 0.5;
        if (!inside(a) || !inside(c)) continue;
        const len = new THREE.Vector3(p.getX(a), p.getY(a), p.getZ(a)).distanceTo(
          new THREE.Vector3(p.getX(c), p.getY(c), p.getZ(c)),
        );
        if (len > 0.08 * 1.01) piores += 1;
      }
    }
    expect(piores).toBe(0);
  });

  it('sculptFront nunca puxa a pele para trás', () => {
    const b = sphere(14);
    b.refine([0, 0, 1], 0.5, 0.08, 4);
    const antes = Array.from(b.build().getAttribute('position').array);
    const c = sphere(14);
    c.refine([0, 0, 1], 0.5, 0.08, 4);
    c.sculptFront([0, 0, 1], 0.5, (x, y) => (Math.hypot(x, y) < 0.2 ? 1.3 : -Infinity), 0.05);
    const depois = Array.from(c.build().getAttribute('position').array);
    let subiu = 0;
    for (let i = 2; i < antes.length; i += 3) {
      expect(depois[i]).toBeGreaterThanOrEqual(antes[i] - 1e-9);
      if (depois[i] > antes[i] + 1e-6) subiu += 1;
    }
    expect(subiu).toBeGreaterThan(0);
  });

  it('refinar o rosto não inventa acabamento nem osso', () => {
    // `midpoint` herda categoria do primeiro extremo, porque a média
    // de `pele` com `cabelo` não é meio material — é um valor que o
    // shader lê como outra coisa. A bola do nariz encosta mesmo no
    // cabelo e na órbita, então a garantia tem de estar no algoritmo:
    // aresta entre partes diferentes não se parte. Se essa guarda cair,
    // aparece aqui um acabamento fracionário ou um peso que não soma 1.
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE });
    avatar.setDetail('ultra');
    const geometry = (avatar as unknown as { body: THREE.Mesh }).body.geometry as THREE.BufferGeometry;
    const finish = geometry.getAttribute('aFinish');
    const weight = geometry.getAttribute('skinWeight');
    for (let i = 0; i < finish.count; i += 1) {
      const f = finish.getX(i);
      expect(Math.abs(f - Math.round(f))).toBeLessThan(1e-6);
      expect(Math.round(f)).toBeGreaterThanOrEqual(0);
      expect(Math.round(f)).toBeLessThanOrEqual(5);
      const soma = weight.getX(i) + weight.getY(i) + weight.getZ(i) + weight.getW(i);
      expect(Math.abs(soma - 1)).toBeLessThan(1e-5);
    }
    avatar.dispose();
  });

  it('o nariz ficou denso o bastante para ter forma', () => {
    // Antes do refinamento havia três vértices atravessando o nariz.
    // Com asa, dorso e ponta para desenhar, menos de uma centena na
    // bola não seria um nariz, seria um morro.
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE });
    avatar.setDetail('ultra');
    const geometry = (avatar as unknown as { body: THREE.Mesh }).body.geometry as THREE.BufferGeometry;
    const p = geometry.getAttribute('position');
    const finish = geometry.getAttribute('aFinish');
    const centre = new THREE.Vector3(0, 0.665, 0.1549);
    let pele = 0;
    for (let i = 0; i < p.count; i += 1) {
      if (Math.round(finish.getX(i)) !== 0) continue;
      if (new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).distanceTo(centre) > 0.088) continue;
      pele += 1;
    }
    expect(pele).toBeGreaterThan(100);
    avatar.dispose();
  });

});

describe('pálpebras', () => {
  it('as calotas olham para fora do globo', () => {
    // O defeito que isto tranca: com o winding invertido a pálpebra é
    // descartada pelo backface culling e o olho fica com o globo
    // inteiro exposto. Não dá para ver num teste de contagem nem num
    // `tsc` — só no render ou aqui.
    const avatar = new Avatar({ ...DEFAULT_APPEARANCE });
    avatar.setDetail('ultra');
    const face = (avatar as unknown as { faceMesh: THREE.Mesh }).faceMesh;
    const geometry = face.geometry as THREE.BufferGeometry;
    const p = geometry.getAttribute('position');
    const index = geometry.getIndex();
    // A malha do rosto vive em espaço local do osso da cabeça, com o
    // centro dela em y = 0,16 — não em `cy`.
    const centro = new THREE.Vector3(0.38 * 0.176, 0.16 + 0.12 * 0.176, 0.695 * 0.176);
    const raio = 0.158 * 0.176 * 1.035;
    let olhandoFora = 0;
    let olhandoDentro = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const total = index ? index.count : p.count;
    for (let t = 0; t < total; t += 3) {
      const i0 = index ? index.getX(t) : t;
      const i1 = index ? index.getX(t + 1) : t + 1;
      const i2 = index ? index.getX(t + 2) : t + 2;
      a.set(p.getX(i0), p.getY(i0), p.getZ(i0));
      b.set(p.getX(i1), p.getY(i1), p.getZ(i1));
      c.set(p.getX(i2), p.getY(i2), p.getZ(i2));
      const centroide = a.clone().add(b).add(c).divideScalar(3);
      const dist = centroide.distanceTo(centro);
      // Só a casca da pálpebra: entre o globo e um fio além dele.
      if (dist < raio * 0.92 || dist > raio * 1.12) continue;
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.dot(centroide.clone().sub(centro)) > 0) olhandoFora += 1;
      else olhandoDentro += 1;
    }
    expect(olhandoFora + olhandoDentro).toBeGreaterThan(20);
    expect(olhandoDentro).toBeLessThan((olhandoFora + olhandoDentro) * 0.25);
    avatar.dispose();
  });
});
