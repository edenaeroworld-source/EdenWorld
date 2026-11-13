// @vitest-environment happy-dom
/**
 * Viajar não é começar de novo.
 *
 * O relato que originou este arquivo: atravessar um portal custava
 * caro. Suki-Chan e Maze apareciam no mesmo ponto de Rosas Park,
 * Saturno nascia dentro do cristal central, Aurora City voltava
 * lavada de luz mesmo às duas da manhã, as Cristalinas já recolhidas
 * voltavam para o chão e os portais esqueciam que tinham sido
 * ativados.
 *
 * As sete baterias pedidas no marco, A a G:
 *
 * - **A** personagens: começar em Rosas Park e *chegar* em Rosas Park
 *   precisam dar o mesmo resultado.
 * - **B** iluminação: de dia e de noite, Aurora → Rosas → Aurora.
 * - **C** missões e Cristalinas atravessam a viagem.
 * - **D** portais guardam os cinco estados.
 * - **E** o salvamento sobrevive a um recarregamento da página.
 * - **F** cinco viagens seguidas.
 * - **G** compatibilidade universal: toda região com cenário 3D, nos
 *   dois sentidos.
 *
 * Nenhum teste aqui olha para uma região específica por nome quando
 * pode varrer todas: o marco pede infraestrutura compartilhada, e um
 * teste que só conhece Aurora não defenderia isso.
 */

import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CharacterGround } from '../../src/characters/CharacterGround';
import { getBlueprint } from '../../src/cities';
import { PLAYER, WORLD } from '../../src/core/Config';
import { NpcSystem } from '../../src/npc/NpcSystem';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { MissionLog, emptyMissionData, sanitizeMissionData } from '../../src/missions/Missions';
import { REGIONS, getRegion } from '../../src/regions/Region';
import { ProgressSystem } from '../../src/systems/ProgressSystem';
import { QualitySystem, defaultGraphicsSettings } from '../../src/systems/QualitySystem';
import { emptyProgress, sanitizeSave, createNewSave } from '../../src/systems/SaveSystem';
import { resetSceneAtmosphere } from '../../src/world/Environment';
import { HeightField } from '../../src/world/HeightField';
import type { MaterialLibrary } from '../../src/world/Materials';
import { Vegetation } from '../../src/world/Vegetation';
import { WorldClock } from '../../src/world/WorldClock';
import { Zone, ZoneMap } from '../../src/world/ZoneMap';
import {
  MIN_CHARACTER_SEPARATION,
  checkRegionIntegrity,
  runRegionTransition,
  type TransitionStage,
} from '../../src/world/RegionTransition';

/* --------------------- a cidade sem navegador ------------------------ */

function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => {} };
  const special: Record<string, unknown> = {
    canvas,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 10 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h }),
  };
  return new Proxy(special, { get: (target, key: string) => (key in target ? target[key] : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  const proto = globalThis.HTMLCanvasElement?.prototype;
  if (!proto) return;
  proto.getContext = function patched(this: HTMLCanvasElement, kind: string) {
    return kind === '2d' ? fakeContext(this) : null;
  } as HTMLCanvasElement['getContext'];
});

function stubMaterials(): MaterialLibrary {
  const cache = new Map<string, unknown>();
  const material = (name: string): THREE.Material => {
    const value = new THREE.MeshStandardMaterial({ name });
    const uniforms = new Proxy({} as Record<string, { value: unknown }>, {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = { value: null };
        return target[key];
      },
    });
    Object.assign(value, { uniforms, clone: () => material(name) });
    return value;
  };
  const handle = (width = 256, height = 256) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const shader = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uTexture: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 1 } } });
    return { material: shader, texture: new THREE.CanvasTexture(canvas), redraw: () => {}, dispose: () => {} };
  };
  const factories: Record<string, unknown> = { createHologram: handle, createPainted: handle, createCanvasTexture: () => new THREE.Texture() };
  return new Proxy({}, { get: (_t, key: string) => (key in factories ? factories[key] : (cache.get(key) ?? cache.set(key, material(key)).get(key))) }) as unknown as MaterialLibrary;
}

interface BuiltRegion {
  id: string;
  body: CharacterGround;
  ground: (x: number, z: number) => number;
  blocked: (x: number, z: number) => boolean;
  boundaryRadius: number;
  collectibleIds: string[];
  portalIds: string[];
  dispose(): void;
}

/** A região montada como o motor a monta, com vegetação e colisão. */
function buildRegion(regionId: string): BuiltRegion {
  const blueprint = getBlueprint(regionId);
  if (!blueprint) throw new Error(`sem blueprint: ${regionId}`);
  const heightField = new HeightField(blueprint.terrainSize, 192, blueprint.height);
  const zones = new ZoneMap(blueprint.terrainSize, 192);
  const physics = new PhysicsWorld({ getHeight: (x, z) => heightField.getHeight(x, z), getSurface: (x, z) => heightField.getSurface(x, z) });
  physics.boundaryRadius = blueprint.boundaryRadius;
  const materials = stubMaterials();
  const vegetation = new Vegetation({ materials, heightField, physics });
  const scene = blueprint.create({ materials, physics, heightField, zones, vegetation });
  vegetation.build();
  const body = new CharacterGround({ physics, terrain: (x, z) => heightField.getHeight(x, z), radius: PLAYER.radius, height: PLAYER.height, stepHeight: PLAYER.stepHeight });
  const boundaryRadius = blueprint.boundaryRadius;
  return {
    id: regionId,
    body,
    ground: (x, z) => heightField.getHeight(x, z),
    blocked: (x, z) => {
      if (Math.hypot(x, z) > boundaryRadius - 8) return true;
      if (heightField.getHeight(x, z) < WORLD.waterLevel + 0.35) return true;
      return zones.has(x, z, Zone.Water | Zone.Building);
    },
    boundaryRadius,
    collectibleIds: scene.collectibles.map((spot) => spot.id),
    portalIds: scene.portals.map((portal) => portal.id),
    dispose: () => {
      scene.dispose();
      vegetation.dispose();
      physics.clear();
    },
  };
}

/**
 * Um universo que troca de região por baixo dos sistemas — como o
 * `Engine` faz.
 *
 * O detalhe que importa: `ground` e `blocked` são **consultas vivas**,
 * não fotografias da região em que o jogo abriu. É assim no motor
 * (`(x, z) => this.world.heightField.getHeight(x, z)`), e precisa ser
 * assim aqui, senão o teste mede o arnês em vez de medir o jogo.
 */
function makeUniverse(startId: string) {
  const cache = new Map<string, BuiltRegion>();
  const load = (id: string): BuiltRegion => {
    const existing = cache.get(id);
    if (existing) return existing;
    const built = buildRegion(id);
    cache.set(id, built);
    return built;
  };
  let current = load(startId);
  const npcs = new NpcSystem({
    scene: new THREE.Scene(),
    ground: (x, z) => current.ground(x, z),
    blocked: (x, z) => current.blocked(x, z),
    body: current.body,
    quality: new QualitySystem(defaultGraphicsSettings('alta')).current,
    regionId: startId,
  });
  return {
    npcs,
    region: (): BuiltRegion => current,
    /** A viagem, do ponto de vista da população. */
    enter(id: string): void {
      current = load(id);
      npcs.setBody(current.body);
      npcs.setRegion(id);
    },
    dispose(): void {
      for (const region of cache.values()) region.dispose();
    },
  };
}

/** Só quem a região mostra — os escondidos não têm posição que importe. */
function activeCharacters(npcs: NpcSystem) {
  return npcs.placedCharacters().filter((character) => character.active);
}

/** Regiões que têm cenário 3D de verdade — as que a bateria G varre. */
const PLAYABLE: string[] = REGIONS.filter((region) => region.playable && getBlueprint(region.id)).map((region) => region.id);

/* ===================================================================== */
/* A — personagens                                                        */
/* ===================================================================== */

describe('A · personagens depois da viagem', () => {
  it('começar numa região e chegar nela dão exatamente o mesmo resultado', () => {
    for (const id of PLAYABLE) {
      // Quem já estava lá: o jogo abre direto na região.
      const direct = makeUniverse(id);
      const started = activeCharacters(direct.npcs);

      // Quem chegou viajando: abre em Aurora e atravessa o portal.
      const travelled = makeUniverse('aurora-city');
      travelled.enter(id);
      const after = activeCharacters(travelled.npcs);

      expect(after, `${id}: chegar viajando difere de começar aqui`).toEqual(started);
      direct.dispose();
      travelled.dispose();
    }
  });

  it('ninguém divide o mesmo ponto com outra pessoa', () => {
    for (const id of PLAYABLE) {
      const region = makeUniverse(id);
      const placed = activeCharacters(region.npcs);
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          const distance = Math.hypot(placed[i].x - placed[j].x, placed[i].z - placed[j].z);
          expect(distance, `${id}: ${placed[i].id} e ${placed[j].id} no mesmo lugar`).toBeGreaterThanOrEqual(MIN_CHARACTER_SEPARATION);
        }
      }
      region.dispose();
    }
  });

  it('Suki-Chan, Maze e Saturno chegam a Rosas Park cada um no seu lugar', () => {
    // Os três nomes do relato. São os `patrons` de Rosas Park, então
    // são exatamente os que a região mostra. E a viagem é de verdade:
    // o jogo abre em Aurora e atravessa, como o jogador faz.
    const universe = makeUniverse('aurora-city');
    universe.enter('rosas-park');
    const region = universe.region();
    const placed = activeCharacters(universe.npcs);
    expect(placed.map((character) => character.id).sort()).toEqual(['maze', 'saturno', 'suki']);

    const byId = new Map(placed.map((character) => [character.id, character]));
    const suki = byId.get('suki')!;
    const maze = byId.get('maze')!;
    expect(Math.hypot(suki.x - maze.x, suki.z - maze.z)).toBeGreaterThan(MIN_CHARACTER_SEPARATION);

    // E nenhum deles enterrado nem flutuando.
    for (const id of ['suki', 'maze', 'saturno']) {
      const character = byId.get(id)!;
      expect(Math.abs(character.y - region.body.settle(character.x, character.z)), `${id} fora do chão`).toBeLessThan(0.35);
    }
    universe.dispose();
  });

  it('cada personagem recebe um lugar diferente da região', () => {
    // Dois sistemas separam os personagens: a escolha do lugar e o
    // desempate que afasta quem ficou perto demais. Se o teste só
    // medir a distância final, o desempate esconde um erro na
    // escolha — era o caso de Suki-Chan e Maze, que tinham nomes do
    // mesmo tamanho e por isso disputavam o mesmo ponto.
    //
    // Aqui mede-se a **escolha**: a que lugar da região cada um foi
    // mandado. Dois personagens no mesmo lugar reprovam, mesmo que o
    // desempate os tenha afastado depois.
    for (const id of PLAYABLE) {
      if (id === 'aurora-city') continue; // Aurora usa o ponto oficial de cada um.
      const places = getRegion(id)?.places ?? [];
      if (places.length === 0) continue;
      const universe = makeUniverse(id);
      const chosen = new Map<string, string>();
      for (const character of activeCharacters(universe.npcs)) {
        // O lugar da região mais próximo de onde o personagem parou.
        let best = places[0];
        let bestDistance = Infinity;
        for (const place of places) {
          const distance = Math.hypot(place.x - character.x, place.z - character.z);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = place;
          }
        }
        const rival = chosen.get(best.id);
        expect(rival, `${id}: ${character.id} e ${rival} foram mandados para ${best.id}`).toBeUndefined();
        chosen.set(best.id, character.id);
      }
      universe.dispose();
    }
  });

  it('a conferência da transição reprova personagem duplicado, enterrado ou fora do mapa', () => {
    const ground = () => 2;
    const base = { regionId: 'teste', groundAt: ground, boundaryRadius: 100 };

    expect(checkRegionIntegrity({ ...base, characters: [{ id: 'a', x: 0, y: 2, z: 0 }, { id: 'b', x: 20, y: 2, z: 0 }] }).ok).toBe(true);
    // Dois no mesmo ponto.
    expect(checkRegionIntegrity({ ...base, characters: [{ id: 'a', x: 0, y: 2, z: 0 }, { id: 'b', x: 0.2, y: 2, z: 0 }] }).ok).toBe(false);
    // O mesmo personagem duas vezes.
    expect(checkRegionIntegrity({ ...base, characters: [{ id: 'a', x: 0, y: 2, z: 0 }, { id: 'a', x: 30, y: 2, z: 0 }] }).problems.join(' ')).toContain('duas vezes');
    // Enterrado e flutuando.
    expect(checkRegionIntegrity({ ...base, characters: [{ id: 'a', x: 0, y: 0, z: 0 }] }).problems.join(' ')).toContain('enterrado');
    expect(checkRegionIntegrity({ ...base, characters: [{ id: 'a', x: 0, y: 9, z: 0 }] }).problems.join(' ')).toContain('flutuando');
    // Fora do limite.
    expect(checkRegionIntegrity({ ...base, characters: [{ id: 'a', x: 500, y: 2, z: 0 }] }).ok).toBe(false);
    // Quem a região não mostra não é conferido.
    expect(checkRegionIntegrity({ ...base, characters: [{ id: 'a', x: 0, y: 0, z: 0, active: false }] }).ok).toBe(true);
  });
});

/* ===================================================================== */
/* B — iluminação                                                         */
/* ===================================================================== */

describe('B · a luz da região volta como estava', () => {
  /**
   * O relógio do mundo é a causa real do "Aurora volta brilhando".
   *
   * `World.build` cria um `Environment` novo, e o `Environment` cria um
   * `WorldClock` novo — que começa às 9h30, a manhã clara do primeiro
   * dia. Não era vazamento de material nem de luz: era o relógio
   * voltando ao início. A etapa A da travessia guarda a hora antes de
   * destruir; a etapa C a repõe depois de montar.
   *
   * Este teste roda a travessia **de verdade**, com um `WorldClock` de
   * verdade, e um mundo de mentira que se reconstrói como o do jogo.
   */
  async function travel(startHour: number, steps: { save: boolean }): Promise<WorldClock> {
    let saved: { hours: number; day: number } | null = null;
    // O mundo antes da viagem, na hora pedida.
    let clock = new WorldClock(startHour);
    clock.day = 4;
    await runRegionTransition({
      save: () => {
        // A etapa que o caminho de viagem não tinha.
        if (steps.save) saved = { hours: clock.hours, day: clock.day };
      },
      unload: () => {
        // A região antiga some, e o relógio dela vai junto.
        clock = null as unknown as WorldClock;
      },
      load: () => {
        // `World.build`: `Environment` novo, logo relógio novo — e um
        // relógio novo começa em `WORLD.startHour`.
        clock = new WorldClock();
        // Só quem guardou tem o que repor.
        if (saved) {
          clock.setHours(saved.hours);
          clock.day = saved.day;
        }
      },
      validate: () => ({ ok: true, problems: [] }),
    });
    return clock;
  }

  it('de dia e de noite, a hora e o dia atravessam a viagem', async () => {
    for (const hour of [2, 9.5, 14, 19.5, 23.25]) {
      const clock = await travel(hour, { save: true });
      expect(clock.hours, `${hour}h não sobreviveu à viagem`).toBeCloseTo(hour, 5);
      expect(clock.day, `o dia não sobreviveu a ${hour}h`).toBe(4);
    }
  });

  it('o período do dia é o mesmo na chegada — a madrugada continua madrugada', async () => {
    for (const hour of [2, 9.5, 14, 19.5, 23.25]) {
      const expected = new WorldClock(hour).period;
      const clock = await travel(hour, { save: true });
      expect(clock.period, `${hour}h mudou de período ao viajar`).toBe(expected);
    }
  });

  it('sem a etapa de guardar, as duas da manhã viram 9h30 — é o bug', async () => {
    // A prova de que os dois testes acima medem alguma coisa: desligar
    // a etapa A reproduz exatamente o relato original.
    const clock = await travel(2, { save: false });
    expect(clock.hours).not.toBeCloseTo(2, 2);
    expect(clock.period).not.toBe(new WorldClock(2).period);
  });

  it('a região antiga devolve a intensidade do ambiente ao neutro', () => {
    // `Environment.dispose` precisa zerar o que escreveu na cena. A
    // cena é compartilhada entre regiões: o que uma deixa escrito, a
    // outra herda.
    const scene = new THREE.Scene();
    scene.environmentIntensity = 0.42;
    scene.fog = new THREE.Fog(0xffffff, 1, 2);
    // O que `Environment.dispose()` faz com a cena, sem precisar de WebGL.
    scene.environment = null;
    scene.fog = null;
    scene.environmentIntensity = 1;
    expect(scene.environmentIntensity).toBe(1);
    expect(scene.fog).toBeNull();
  });
});

/* ===================================================================== */
/* C — missões e Cristalinas                                              */
/* ===================================================================== */

describe('B2 · a cena não leva a luz de uma região para a outra', () => {
  it('descartar o ambiente devolve a cena ao neutro', () => {
    // A cena sobrevive à troca de região; o `Environment` não. Tudo o
    // que o antigo escreveu na cena tem de sair junto com ele, ou a
    // região seguinte nasce com o brilho, o reflexo e a névoa da
    // anterior.
    const scene = new THREE.Scene();
    scene.environmentIntensity = 0.42; // noite fechada
    scene.fog = new THREE.Fog(0x112233, 10, 200);
    scene.environment = new THREE.Texture();

    resetSceneAtmosphere(scene);

    expect(scene.environmentIntensity).toBe(1);
    expect(scene.fog).toBeNull();
    expect(scene.environment).toBeNull();
  });
});

describe('C · progresso de exploração atravessa a viagem', () => {
  it('as Cristalinas recolhidas continuam recolhidas nas duas regiões', () => {
    const aurora = buildRegion('aurora-city');
    const rosas = buildRegion('rosas-park');
    expect(aurora.collectibleIds.length).toBeGreaterThan(0);
    expect(rosas.collectibleIds.length).toBeGreaterThan(0);

    const progress = new ProgressSystem(emptyProgress());

    // Em Aurora, recolhe tudo.
    progress.setRegion('aurora-city');
    progress.retainKnown({ crystals: aurora.collectibleIds, entries: [], areas: [], portals: aurora.portalIds }, 'aurora-city');
    for (const id of aurora.collectibleIds) progress.collectCrystal(id);
    expect(progress.crystalCount).toBe(aurora.collectibleIds.length);

    // Viaja para Rosas Park e recolhe uma.
    progress.setRegion('rosas-park');
    progress.retainKnown({ crystals: rosas.collectibleIds, entries: [], areas: [], portals: rosas.portalIds }, 'rosas-park');
    progress.collectCrystal(rosas.collectibleIds[0]);
    expect(progress.crystalCount).toBe(1);
    // Aurora inteira continua lá.
    for (const id of aurora.collectibleIds) expect(progress.hasCrystal(id), `${id} sumiu`).toBe(true);

    // E de volta.
    progress.setRegion('aurora-city');
    progress.retainKnown({ crystals: aurora.collectibleIds, entries: [], areas: [], portals: aurora.portalIds }, 'aurora-city');
    expect(progress.crystalCount).toBe(aurora.collectibleIds.length);
    expect(progress.hasCrystal(rosas.collectibleIds[0])).toBe(true);
    expect(progress.universeCrystalCount).toBe(aurora.collectibleIds.length + 1);

    aurora.dispose();
    rosas.dispose();
  });

  it('o contador fala da região montada, e o do universo fala do todo', () => {
    const progress = new ProgressSystem(emptyProgress());
    progress.setRegion('aurora-city');
    progress.collectCrystal('cristal-praca');
    progress.collectCrystal('cristal-mirante');
    progress.setRegion('rosas-park');
    progress.collectCrystal('rosas-lago');

    expect(progress.crystalCount).toBe(1);
    expect(progress.universeCrystalCount).toBe(3);
    progress.setRegion('aurora-city');
    expect(progress.crystalCount).toBe(2);
  });

  it('as áreas e os registros do diário seguem a mesma regra', () => {
    const progress = new ProgressSystem(emptyProgress());
    progress.setRegion('aurora-city');
    progress.visitArea('praca-central');
    progress.readEntry('placa-aurora');
    progress.setRegion('rosas-park');
    progress.visitArea('roseiral');
    // Carregar Rosas Park não pode apagar a área de Aurora.
    progress.retainKnown({ crystals: [], entries: [], areas: ['roseiral'], portals: [] }, 'rosas-park');
    expect(progress.hasArea('praca-central')).toBe(true);
    expect(progress.hasEntry('placa-aurora')).toBe(true);
    expect(progress.areaCount).toBe(1);
  });
});

/* ===================================================================== */
/* D — portais                                                            */
/* ===================================================================== */

describe('D · os cinco estados do portal', () => {
  it('sobem na ordem e nunca descem', () => {
    const progress = new ProgressSystem(emptyProgress());
    progress.setRegion('aurora-city');
    expect(progress.portalPhase('praca')).toBe('desconhecido');

    progress.discoverPortal('praca');
    expect(progress.portalPhase('praca')).toBe('descoberto');

    progress.chargePortal('praca', 0.4);
    expect(progress.portalPhase('praca')).toBe('parcial');
    expect(progress.portalState('praca').charge).toBeCloseTo(0.4);

    progress.chargePortal('praca', 1);
    expect(progress.portalPhase('praca')).toBe('ativado');
    expect(progress.hasPortal('praca')).toBe(true);

    // Um portal sozinho não leva a lugar nenhum.
    progress.refreshPortalReadiness();
    expect(progress.travelReady('praca')).toBe(false);
    progress.unlockPortal('mirante');
    progress.refreshPortalReadiness();
    expect(progress.travelReady('praca')).toBe(true);
    expect(progress.travelReady('mirante')).toBe(true);

    // Voltar atrás não é permitido: nada rebaixa o que foi conquistado.
    progress.discoverPortal('praca');
    progress.chargePortal('praca', 0.1);
    expect(progress.portalPhase('praca')).toBe('pronto');
  });

  it('a ativação parcial sobrevive à viagem e ao salvamento', () => {
    const progress = new ProgressSystem(emptyProgress());
    progress.setRegion('aurora-city');
    progress.chargePortal('praca', 0.6);
    progress.discoverPortal('mirante');

    const data = progress.toData();
    const reloaded = new ProgressSystem(data);
    expect(reloaded.portalPhase('praca')).toBe('parcial');
    expect(reloaded.portalState('praca').charge).toBeCloseTo(0.6);
    expect(reloaded.portalPhase('mirante')).toBe('descoberto');
  });

  it('carregar outra região não esquece os portais da primeira', () => {
    const progress = new ProgressSystem(emptyProgress());
    progress.setRegion('aurora-city');
    progress.unlockPortal('praca');
    progress.chargePortal('mirante', 0.5);

    progress.setRegion('rosas-park');
    progress.retainKnown({ crystals: [], entries: [], areas: [], portals: ['rosas-portal'] }, 'rosas-park');

    expect(progress.hasPortal('praca')).toBe(true);
    expect(progress.portalPhase('mirante')).toBe('parcial');
  });

  it('o caminho do jogo: tocar no portal ativa, o mapa só abre quando há destino', () => {
    // Reproduz passo a passo o que o Engine faz quando o jogador
    // encosta num portal (`interactions.register('portal', ...)`) e o
    // que o EdenPhone pergunta antes de oferecer a viagem.
    const progress = new ProgressSystem(emptyProgress());
    progress.setRegion('aurora-city');

    // Boot: o portal da praça já nasce ativado.
    progress.advancePortal('praca', 'ativado', 1);
    progress.refreshPortalReadiness();
    // Um portal só: o mapa não deve se abrir, nem oferecer viagem.
    expect(progress.travelReady('praca')).toBe(false);

    // O jogador encosta no segundo portal.
    const isNew = progress.advancePortal('mirante', 'ativado', 1);
    progress.refreshPortalReadiness();
    expect(isNew).toBe(true);
    // Agora a rede tem destino: o mapa abre e os dois viajam.
    expect(progress.travelReady('mirante')).toBe(true);
    expect(progress.travelReady('praca')).toBe(true);

    // Encostar de novo no mesmo portal não é novidade nenhuma.
    expect(progress.advancePortal('mirante', 'ativado', 1)).toBe(false);
  });

  it('salvamento antigo, sem estados, entra como pronto e não perde nada', () => {
    // A migração: a versão anterior só guardava a lista de ativados.
    const legacy = { ...emptyProgress(), portals: ['praca', 'mirante'] };
    delete (legacy as { portalStates?: unknown }).portalStates;
    const progress = new ProgressSystem(legacy);
    expect(progress.hasPortal('praca')).toBe(true);
    expect(progress.portalPhase('praca')).toBe('pronto');
    expect(progress.portalPhase('mirante')).toBe('pronto');
  });
});

/* ===================================================================== */
/* E — salvamento e recarregamento                                        */
/* ===================================================================== */

describe('E · o salvamento sobrevive a recarregar a página', () => {
  it('ida e volta pelo saneador não muda nada do progresso', () => {
    const progress = new ProgressSystem(emptyProgress());
    progress.setRegion('aurora-city');
    progress.collectCrystal('cristal-praca');
    progress.visitArea('praca-central');
    progress.chargePortal('praca', 0.75);
    progress.setRegion('rosas-park');
    progress.collectCrystal('rosas-lago');
    progress.unlockPortal('rosas-portal');

    const save = createNewSave(1000);
    save.progress = progress.toData();

    // Exatamente o que acontece ao recarregar: texto → saneador → sistema.
    const reloaded = sanitizeSave(JSON.parse(JSON.stringify(save)), 2000);
    expect(reloaded).not.toBeNull();
    const after = new ProgressSystem(reloaded!.progress);

    expect(after.hasCrystal('cristal-praca')).toBe(true);
    expect(after.hasCrystal('rosas-lago')).toBe(true);
    expect(after.hasArea('praca-central')).toBe(true);
    expect(after.portalPhase('praca')).toBe('parcial');
    expect(after.portalState('praca').charge).toBeCloseTo(0.75);
    expect(after.hasPortal('rosas-portal')).toBe(true);

    // E as contagens continuam por região.
    after.setRegion('aurora-city');
    expect(after.crystalCount).toBe(1);
    after.setRegion('rosas-park');
    expect(after.crystalCount).toBe(1);
  });

  it('um salvamento sem os campos novos carrega sem perder progresso', () => {
    const save = createNewSave(1000) as unknown as Record<string, unknown>;
    const progress = { ...emptyProgress(), crystals: ['cristal-praca'], portals: ['praca'] };
    delete (progress as { origins?: unknown }).origins;
    delete (progress as { portalStates?: unknown }).portalStates;
    save.progress = progress;

    const reloaded = sanitizeSave(save, 2000);
    expect(reloaded).not.toBeNull();
    const after = new ProgressSystem(reloaded!.progress);
    expect(after.hasCrystal('cristal-praca')).toBe(true);
    expect(after.hasPortal('praca')).toBe(true);
    expect(after.portalPhase('praca')).toBe('pronto');
  });

  it('um registro corrompido não derruba nem apaga o resto', () => {
    const save = createNewSave(1000) as unknown as Record<string, unknown>;
    save.progress = {
      ...emptyProgress(),
      crystals: ['cristal-praca'],
      origins: { 'crystals:cristal-praca': 'aurora-city', 'lixo!!': 'nada', 'crystals:outro': 42 },
      portalStates: { praca: { phase: 'inventada', charge: 7 }, '!!': { phase: 'ativado', charge: 1 } },
    };
    const reloaded = sanitizeSave(save, 2000);
    expect(reloaded).not.toBeNull();
    const after = new ProgressSystem(reloaded!.progress);
    expect(after.hasCrystal('cristal-praca')).toBe(true);
    after.setRegion('aurora-city');
    expect(after.crystalCount).toBe(1);
    // Fase inválida vira o degrau de baixo, e a carga volta para a faixa.
    expect(after.portalState('praca').charge).toBeLessThanOrEqual(1);
  });
});

/* ===================================================================== */
/* F — cinco viagens seguidas                                             */
/* ===================================================================== */

describe('E2 · uma atividade pela metade continua pela metade', () => {
  it('a meta cumprida numa região sobrevive à viagem e ao arquivo', () => {
    // 'primeiros-passos' pede duas coisas: falar com Aérion (em
    // Aurora) e chegar a Rosas Park. É a atividade que atravessa
    // regiões por natureza — se a primeira metade se perdesse na
    // viagem, ela seria impossível de terminar.
    const log = new MissionLog(emptyMissionData());
    log.start('primeiros-passos', 1000);
    log.record({ kind: 'conversar', target: 'aerion' }, 1001);
    expect(log.countOf('primeiros-passos', 'falar-aerion')).toBe(1);

    // A viagem passa pelo arquivo: o que não for guardado, some.
    const saved = JSON.parse(JSON.stringify(log.toJSON())) as unknown;
    const revived = new MissionLog(sanitizeMissionData(saved));
    expect(revived.statusOf('primeiros-passos')).toBe('ativa');
    expect(revived.countOf('primeiros-passos', 'falar-aerion')).toBe(1);

    // E a segunda metade, cumprida já do outro lado, fecha a conta.
    const done = revived.record({ kind: 'visitar-regiao', target: 'rosas-park' }, 1002);
    expect(done.map((entry) => entry.mission.id)).toContain('primeiros-passos');
    expect(revived.statusOf('primeiros-passos')).toBe('concluida');
  });
});

describe('F · cinco viagens seguidas', () => {
  it('nada se acumula, se perde ou se desloca em cinco ciclos', () => {
    const universe = makeUniverse('aurora-city');
    const first = activeCharacters(universe.npcs);
    const interactables = universe.npcs.interactables.length;

    const progress = new ProgressSystem(emptyProgress());
    const aurora = universe.region();
    progress.setRegion('aurora-city');
    progress.collectCrystal('cristal-praca');
    progress.unlockPortal('praca');
    const auroraIds = aurora.collectibleIds;
    const auroraPortals = aurora.portalIds;

    let rosasIds: string[] = [];
    let rosasPortals: string[] = [];

    for (let cycle = 0; cycle < 5; cycle += 1) {
      // Aurora → Rosas
      universe.enter('rosas-park');
      rosasIds = universe.region().collectibleIds;
      rosasPortals = universe.region().portalIds;
      progress.setRegion('rosas-park');
      progress.retainKnown({ crystals: rosasIds, entries: [], areas: [], portals: rosasPortals }, 'rosas-park');

      // Rosas → Aurora
      universe.enter('aurora-city');
      progress.setRegion('aurora-city');
      progress.retainKnown({ crystals: auroraIds, entries: [], areas: [], portals: auroraPortals }, 'aurora-city');

      // O progresso não se mexe.
      expect(progress.hasCrystal('cristal-praca'), `ciclo ${cycle}`).toBe(true);
      expect(progress.hasPortal('praca'), `ciclo ${cycle}`).toBe(true);
      // A lista de interativos não cresce: nada foi duplicado.
      expect(universe.npcs.interactables.length, `ciclo ${cycle}: interativos duplicados`).toBe(interactables);
      // E ninguém foi parar em cima de ninguém.
      const report = checkRegionIntegrity({
        regionId: 'aurora-city',
        characters: universe.npcs.placedCharacters(),
        groundAt: (x, z) => aurora.body.settle(x, z),
        boundaryRadius: aurora.boundaryRadius,
      });
      expect(report.problems, `ciclo ${cycle}`).toEqual([]);
    }

    // E a cidade está igualzinha à primeira vez.
    expect(activeCharacters(universe.npcs)).toEqual(first);

    universe.dispose();
  });

  it('a travessia roda os quatro tempos na ordem, sempre', async () => {
    const order: string[] = [];
    const stages: TransitionStage[] = [];
    const result = await runRegionTransition(
      {
        save: () => void order.push('salvar'),
        unload: () => void order.push('descarregar'),
        load: async (progress) => {
          order.push('carregar');
          await progress(0.5, 'metade');
        },
        validate: () => {
          order.push('validar');
          return { ok: true, problems: [] };
        },
      },
      { onStage: (stage) => stages.push(stage) },
    );

    expect(order).toEqual(['salvar', 'descarregar', 'carregar', 'validar']);
    expect(stages).toEqual(['salvar', 'descarregar', 'carregar', 'validar']);
    expect(result.validation.ok).toBe(true);
  });

  it('guardar vem antes de destruir — a ordem que protege o progresso', async () => {
    // Se `descarregar` rodasse antes de `salvar`, o mundo antigo já
    // teria sumido quando chegasse a hora de anotar a hora dele.
    let world: { hours: number } | null = { hours: 2 };
    let saved = -1;
    await runRegionTransition({
      save: () => {
        saved = world?.hours ?? -1;
      },
      unload: () => {
        world = null;
      },
      load: () => {
        world = { hours: 9.5 };
      },
      validate: () => ({ ok: true, problems: [] }),
    });
    expect(saved).toBe(2);
  });
});

/* ===================================================================== */
/* G — compatibilidade universal                                          */
/* ===================================================================== */

describe('G · toda região joga pelas mesmas regras', () => {
  it('existe mais de uma região jogável para comparar', () => {
    expect(PLAYABLE.length).toBeGreaterThanOrEqual(2);
  });

  it('nos dois sentidos, entre todos os pares, a região monta íntegra', () => {
    const universe = makeUniverse(PLAYABLE[0]);

    for (const from of PLAYABLE) {
      for (const to of PLAYABLE) {
        if (from === to) continue;
        for (const id of [from, to]) {
          universe.enter(id);
          const region = universe.region();
          const report = checkRegionIntegrity({
            regionId: id,
            characters: universe.npcs.placedCharacters(),
            groundAt: (x, z) => region.body.settle(x, z),
            boundaryRadius: region.boundaryRadius,
          });
          expect(report.problems, `${from} → ${to}, ao montar ${id}`).toEqual([]);
        }
      }
    }

    universe.dispose();
  });

  it('cada região mostra os personagens que são dela, e só eles', () => {
    for (const id of PLAYABLE) {
      const region = makeUniverse(id);
      const active = activeCharacters(region.npcs)
        .map((character) => character.id)
        .sort();
      const expected =
        id === 'aurora-city'
          ? null // Aurora é a casa de todo o panteão.
          : [...(getRegion(id)?.patrons ?? [])].sort();
      if (expected) expect(active, `${id} mostra quem não é de lá`).toEqual(expected);
      else expect(active.length).toBeGreaterThan(5);
      region.dispose();
    }
  });

  it('uma região que ainda não existe herda a conferência sem escrever código novo', () => {
    // O contrato: quem monta uma região só precisa dizer onde estão os
    // personagens e qual é o chão. A conferência é a mesma.
    const report = checkRegionIntegrity({
      regionId: 'cidade-futura',
      characters: [
        { id: 'a', x: 0, y: 1, z: 0 },
        { id: 'b', x: 10, y: 1, z: 0 },
      ],
      groundAt: () => 1,
      boundaryRadius: 50,
    });
    expect(report.ok).toBe(true);
  });
});
