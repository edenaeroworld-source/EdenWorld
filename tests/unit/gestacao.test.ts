/**
 * A camada de gestação: silhueta, paridade TS ↔ GLSL e cânone.
 *
 * A gestação de Amara é identidade declarada pelo criador, não um produto
 * cosmético e não uma configuração do jogador. Estes testes guardam as
 * três coisas que isso implica: a conta do ventre está certa, o shader
 * calcula exatamente a mesma conta, e não existe caminho na interface
 * para alguém aplicar gestação em quem quer que seja.
 */

import { describe, expect, it } from 'vitest';
import { MORPH_BANDS, Zone, aftersMorphGLSL, displaceNormal, displaceVertex } from '../../src/afters/AftersMorph';
import { PANTHEON, getCharacter } from '../../src/characters/Pantheon';
import { Avatar } from '../../src/player/Avatar';
import {
  GESTATION_BAND,
  GESTATION_BANDS,
  GESTATION_HIP_BAND,
  GESTATION_HIP_SCALE,
  MAX_GESTATION,
  TORSO_JOINT_Y,
  bellyDepth,
  displaceGestation,
  gestationBandForZone,
  gestationGLSL,
  gestationNormal,
} from '../../src/player/Gestation';

/** Raio do peito e do quadril na malha, para medir a silhueta. */
const CHEST_R = 0.142;
const HIP_R = 0.15;

/* ------------------------- 1. A forma do ventre ------------------------- */

describe('gestação · a forma', () => {
  it('avança à frente muito mais do que para os lados ou para trás', () => {
    const front = bellyDepth(Zone.Bust, CHEST_R, GESTATION_BAND.center, 1) / CHEST_R;
    const back = Math.abs(bellyDepth(Zone.Bust, -CHEST_R, GESTATION_BAND.center, 1)) / CHEST_R;
    const side = displaceGestation({ x: CHEST_R, y: GESTATION_BAND.center, z: 0 }, Zone.Bust, 1).x / CHEST_R;
    expect(front).toBeGreaterThan(1.8);
    expect(front).toBeGreaterThan(side * 1.5);
    expect(back).toBeLessThan(1.1);
  });

  it('põe o volume na barriga, não no peito nem nos ombros', () => {
    // A banda do busto (peito) fica em 0.235: o ventre mal chega lá, e no
    // alto do tronco não chega de jeito nenhum. Volume, nunca anatomia.
    const belly = bellyDepth(Zone.Bust, CHEST_R, GESTATION_BAND.center, 1) / CHEST_R - 1;
    const chest = bellyDepth(Zone.Bust, CHEST_R, MORPH_BANDS.bust.center, 1) / CHEST_R - 1;
    const shoulder = bellyDepth(Zone.Bust, CHEST_R, 0.34, 1) / CHEST_R - 1;
    expect(belly).toBeGreaterThan(0.9);
    expect(chest).toBeLessThan(belly * 0.2);
    expect(shoulder).toBeLessThan(0.01);
  });

  it('não deixa degrau na cintura: tronco e quadril encontram-se', () => {
    // O quadril usa a mesma banda deslocada pela junta e com escala menor.
    // Na altura da costura as duas silhuetas têm de bater, ou aparece um
    // anel no avatar.
    expect(GESTATION_HIP_BAND.center).toBeCloseTo(GESTATION_BAND.center + TORSO_JOINT_Y, 10);
    const seamTorso = bellyDepth(Zone.Bust, CHEST_R, -0.02, 1);
    const seamHip = bellyDepth(Zone.Curve, HIP_R, -0.02 + TORSO_JOINT_Y, 1);
    expect(Math.abs(seamTorso - seamHip)).toBeLessThan(0.01);
  });

  it('é contínua e monótona na intensidade, e some em zero', () => {
    let previous = 0;
    for (const g of [0.25, 0.5, 0.75, 1]) {
      const depth = bellyDepth(Zone.Bust, CHEST_R, GESTATION_BAND.center, g);
      expect(depth).toBeGreaterThan(previous);
      previous = depth;
    }
    const none = displaceGestation({ x: 0.1, y: 0.12, z: 0.1 }, Zone.Bust, 0);
    expect(none).toEqual({ x: 0.1, y: 0.12, z: 0.1 });
  });

  it('não toca em cabeça, braços nem coxas', () => {
    expect(gestationBandForZone(Zone.None)).toBeNull();
    expect(gestationBandForZone(Zone.Thigh)).toBeNull();
    expect(gestationBandForZone(9)).toBeNull();
    const leg = displaceGestation({ x: 0.09, y: -0.1, z: 0.05 }, Zone.Thigh, 1);
    expect(leg).toEqual({ x: 0.09, y: -0.1, z: 0.05 });
  });

  it('nunca mexe na altura de um vértice', () => {
    for (const zone of [Zone.Bust, Zone.Curve, Zone.Thigh, Zone.None]) {
      for (const y of [-0.1, 0, 0.1, 0.235]) {
        expect(displaceGestation({ x: 0.1, y, z: 0.1 }, zone, 1).y).toBe(y);
      }
    }
  });

  it('mantém a normal unitária, inclusive junto com os Afters', () => {
    const position = { x: 0.1, y: 0.11, z: 0.09 };
    const afters = displaceNormal(position, { x: 0.3, y: 0.2, z: 0.9 }, Zone.Bust, 2.5, 0);
    const both = gestationNormal(position, afters, Zone.Bust, 1);
    expect(Math.hypot(both.x, both.y, both.z)).toBeCloseTo(1, 6);
    const untouched = gestationNormal({ x: 0.1, y: 0.1, z: 0 }, { x: 0, y: 1, z: 0 }, Zone.Thigh, 1);
    expect(untouched).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('compõe com os Afters sem que uma camada apague a outra', () => {
    // As duas são escalas radiais e nenhuma mexe em y, então compor é
    // multiplicar — e a ordem não pode alterar o resultado.
    const position = { x: 0.12, y: 0.12, z: 0.1 };
    const a = displaceGestation(displaceVertex(position, Zone.Bust, 2, 0), Zone.Bust, 1);
    const b = displaceVertex(displaceGestation(position, Zone.Bust, 1), Zone.Bust, 2, 0);
    expect(a.x).toBeCloseTo(b.x, 10);
    expect(a.z).toBeCloseTo(b.z, 10);
    // E a soma é maior que qualquer uma sozinha.
    expect(a.z).toBeGreaterThan(displaceVertex(position, Zone.Bust, 2, 0).z);
    expect(a.z).toBeGreaterThan(displaceGestation(position, Zone.Bust, 1).z);
  });
});

/* --------------------- 2. Paridade TypeScript ↔ GLSL -------------------- */

describe('gestação · paridade TypeScript ↔ GLSL', () => {
  const glsl = gestationGLSL();

  it('declara o que o avatar injeta', () => {
    expect(glsl).toContain('uniform float uGestation;');
    expect(glsl).toContain('vec3 edenGestationPosition(vec3 pos)');
    expect(glsl).toContain('vec3 edenGestationNormal(vec3 pos, vec3 nrm)');
  });

  it('reaproveita a matemática de banda dos Afters em vez de duplicá-la', () => {
    // Se o shader do ventre declarasse a sua própria struct ou as suas
    // próprias funções de banda, existiriam duas versões da mesma conta
    // para divergirem — e o shader nem compilaria, por redefinição.
    expect(glsl).not.toContain('struct EdenBand');
    expect(glsl).not.toContain('float edenBandWeight(');
    expect(glsl).not.toContain('attribute float aZone;');
    const afters = aftersMorphGLSL();
    expect(afters).toContain('struct EdenBand');
    expect(afters).toContain('attribute float aZone;');
    expect(glsl).toContain('edenBandWeight(');
    expect(glsl).toContain('aZone');
  });

  it('usa exatamente as constantes do TypeScript, e nenhuma a mais', () => {
    const literal = (band: typeof GESTATION_BAND): string =>
      `EdenBand(${[band.center, band.sigmaUp, band.sigmaDown, band.gainX, band.gainFront, band.gainBack].map((value) => value.toFixed(5)).join(', ')})`;
    for (const band of [GESTATION_BANDS.torso, GESTATION_BANDS.hip]) expect(glsl).toContain(literal(band));
    const calls = glsl.match(/EdenBand\([^)]*\)/g) ?? [];
    const known = new Set([literal(GESTATION_BAND), literal(GESTATION_HIP_BAND)]);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(known.has(call)).toBe(true);
    expect(glsl).toContain(GESTATION_HIP_SCALE.toFixed(5));
  });

  it('mapeia as zonas igual ao TypeScript', () => {
    expect(gestationBandForZone(Zone.Bust)).toMatchObject({ band: GESTATION_BAND, scale: 1 });
    expect(gestationBandForZone(Zone.Curve)).toMatchObject({ band: GESTATION_HIP_BAND, scale: GESTATION_HIP_SCALE });
    expect(glsl).toContain('if (zone == 1.0)');
    expect(glsl).toContain('} else if (zone == 2.0)');
    // Coxa (3.0) de fora: o ventre não desce para a perna.
    expect(glsl).not.toContain('zone == 3.0');
  });
});

/* ----------------------- 3. O avatar e o cânone ------------------------- */

describe('gestação · avatar', () => {
  it('limita a gestação entre 0 e 1 — não existe 250% de grávida', () => {
    const avatar = new Avatar();
    avatar.setGestation(5);
    expect(avatar.gestation).toBe(MAX_GESTATION);
    expect(MAX_GESTATION).toBe(1);
    avatar.setGestation(-2);
    expect(avatar.gestation).toBe(0);
    avatar.dispose();
  });

  it('sai do avatar comum em zero: ninguém nasce gestante', () => {
    const avatar = new Avatar();
    expect(avatar.gestation).toBe(0);
    avatar.dispose();
  });

  it('abre os braços para contornar o ventre sem mudar o corpo', () => {
    const avatar = new Avatar();
    const arm = avatar.root.getObjectByName('braco-e');
    expect(arm).toBeDefined();
    const plain = arm?.position.x ?? 0;
    avatar.setGestation(1);
    expect(arm?.position.x ?? 0).toBeGreaterThan(plain);
    // E a gestação não mexe nos canais Afters.
    expect(avatar.morph).toEqual({ bust: 0, curve: 0 });
    avatar.dispose();
  });
});

describe('gestação · cânone', () => {
  it('Amara é a única do panteão que o cânone declarou gestante', () => {
    const pregnant = PANTHEON.filter((character) => (character.gestation ?? 0) > 0);
    expect(pregnant.map((character) => character.id)).toEqual(['amara']);
    expect(getCharacter('amara')?.gestation).toBe(1);
  });

  it('a gestação não é um produto Afters e não tem painel', () => {
    // A garantia de que ninguém pode aplicar gestação a si mesmo: o valor
    // só existe na ficha do personagem. Se um dia virar canal de Afters,
    // este teste cai — e é para cair.
    const avatar = new Avatar();
    expect('gestation' in (avatar.morph as object)).toBe(false);
    avatar.dispose();
    expect(Object.keys(GESTATION_BANDS)).toEqual(['torso', 'hip']);
  });
});
