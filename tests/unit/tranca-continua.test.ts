// A trança era um colar de contas: sete bolas enfileiradas que nunca
// se encostavam. A inspeção visual pegou, e a medida abaixo diz por
// quê — em `baixa`, 40% da altura da peça era ar.
//
// O teste varre planos horizontais ao longo da queda da trança e conta
// quantos triângulos da peça cada plano atravessa. Plano que não
// atravessa nada é um vazio: ali a peça está partida. A testemunha é
// essa, e não a contagem de vértices, porque malha pode engordar sem
// nunca fechar o buraco.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Avatar } from '../../src/player/Avatar';
import { type HairStyle, DEFAULT_APPEARANCE } from '../../src/player/AvatarAppearance';
import { BODY_DETAIL, bodyMetrics } from '../../src/player/body/BodyRig';
import { DEFAULT_PROPORTIONS } from '../../src/player/body/BodyProportions';
import { SHAPE_FEM } from '../../src/player/body/BodyShape';

type Nivel = keyof typeof BODY_DETAIL;
const NIVEIS = Object.keys(BODY_DETAIL) as Nivel[];
const R = bodyMetrics(DEFAULT_PROPORTIONS, SHAPE_FEM).headR;
/** Atrás deste z fica o rabo da trança; a cabeça e a calota ficam de fora. */
const ATRAS = -R * 0.93;

function malhaDoCorpo(cabelo: HairStyle, nivel: Nivel): THREE.BufferGeometry {
  const avatar = new Avatar({
    ...DEFAULT_APPEARANCE,
    sex: 'fem',
    hairStyle: cabelo,
    accessory: 'nenhum',
    outfit: 'casual',
  });
  avatar.setDetail(nivel);
  let geo: THREE.BufferGeometry | null = null;
  avatar.root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name !== 'halo' && !geo) geo = o.geometry as THREE.BufferGeometry;
  });
  if (geo === null) throw new Error('malha do corpo não encontrada');
  return geo;
}

/** Alturas dos vértices de cada triângulo que fica atrás da nuca. */
function trisDaTranca(nivel: Nivel): number[][] {
  const g = malhaDoCorpo('tranca', nivel);
  const pos = g.getAttribute('position');
  const idx = g.getIndex();
  const total = idx ? idx.count : pos.count;
  const saida: number[][] = [];
  for (let i = 0; i < total; i += 3) {
    const v = [0, 1, 2].map((k) => {
      const j = idx ? idx.getX(i + k) : i + k;
      return { y: pos.getY(j), z: pos.getZ(j) };
    });
    if (v.every((p) => p.z < ATRAS)) saida.push(v.map((p) => p.y));
  }
  return saida;
}

/** Planos entre y0 e y1 que não cortam triângulo nenhum. */
function planosVazios(tris: number[][], y0 = 0.4, y1 = 0.8, passos = 200): number {
  let vazios = 0;
  for (let s = 0; s <= passos; s++) {
    const y = y0 + ((y1 - y0) * s) / passos;
    const cruza = tris.some((t) => Math.min(...t) <= y && Math.max(...t) >= y);
    if (!cruza) vazios++;
  }
  return vazios;
}

function vertices(cabelo: HairStyle, nivel: Nivel): number {
  return malhaDoCorpo(cabelo, nivel).getAttribute('position').count;
}

describe('A trança é um fio contínuo', () => {
  for (const nivel of NIVEIS) {
    it(`em ${nivel} nenhum plano horizontal cai no vazio`, () => {
      const tris = trisDaTranca(nivel);
      expect(tris.length).toBeGreaterThan(100);
      expect(planosVazios(tris)).toBe(0);
    });
  }

  it('a queda inteira tem corpo, da nuca à ponta', () => {
    // Faixa medida na peça: do laço (y≈0,39) ao alto da calota
    // (y≈0,83). Se a peça encolher ou subir, este caso avisa.
    const ys = trisDaTranca('alta').flat();
    expect(Math.min(...ys)).toBeLessThan(0.42);
    expect(Math.max(...ys)).toBeGreaterThan(0.8);
  });

  it('os nós continuam existindo: a peça não virou um tubo liso', () => {
    // A identidade da trança é o nó alternado. Se a correção tivesse
    // trocado o relevo por um loft liso, a largura em x pararia de
    // oscilar. Mede-se a largura por fatia e exige-se vaivém.
    const pos = malhaDoCorpo('tranca', 'alta').getAttribute('position');
    const fatias = new Map<number, { min: number; max: number }>();
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) >= ATRAS) continue;
      const y = pos.getY(i);
      if (y < 0.42 || y > 0.74) continue;
      const chave = Math.round(y * 100);
      const x = pos.getX(i);
      const f = fatias.get(chave);
      if (f) {
        f.min = Math.min(f.min, x);
        f.max = Math.max(f.max, x);
      } else fatias.set(chave, { min: x, max: x });
    }
    const larguras = [...fatias.entries()].sort((a, b) => a[0] - b[0]).map(([, f]) => f.max - f.min);
    expect(larguras.length).toBeGreaterThan(8);
    // Nó e vão entre nós têm de medir diferente: o relevo está lá.
    expect(Math.max(...larguras)).toBeGreaterThan(Math.min(...larguras) * 1.4);
  });

  it('a peça não ficou mais cara que o cabelo mais caro do acervo', () => {
    // O miolo acrescenta malha; o teto é o `cacheado`, a peça mais
    // pesada do catálogo. A trança tem de caber embaixo dele em todos
    // os níveis.
    for (const nivel of NIVEIS) {
      expect(vertices('tranca', nivel)).toBeLessThanOrEqual(vertices('cacheado', nivel));
    }
  });
});
