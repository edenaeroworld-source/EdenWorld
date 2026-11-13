/**
 * Viajar de Aurora City até Rosas Park — e voltar.
 *
 * O pedido foi explícito: nada de botão decorativo. Então os casos
 * aqui não perguntam "existe um botão?", perguntam "depois de clicar,
 * o jogador está no outro lugar, com as mesmas coisas, e o cenário de
 * lá é carregável?".
 *
 * A montagem 3D em si é verificada em `rosas-cena.test.ts`; aqui o que
 * se prova é a ligação: destino registrado, caminho conhecido, ponto de
 * chegada pisável, estação no mundo e nada perdido no caminho.
 */

import { describe, expect, it } from 'vitest';
import { getBlueprint, hasScene } from '../../src/cities';
import { isWaterAt, rosasHeight } from '../../src/cities/rosas-park/RosasTerrain';
import { ROSAS_BOUNDARY } from '../../src/cities/rosas-park/RosasLayout';
import { REGIONS, getRegion, initialRegions, routeBetween } from '../../src/regions/Region';
import { RegionManager } from '../../src/regions/RegionManager';
import { createNewSave } from '../../src/systems/SaveSystem';
import { UniverseSystem, type UniverseSaveData } from '../../src/universe/UniverseSystem';

const NOW = 1_700_000_000_000;

function newUniverse(): UniverseSystem {
  return new UniverseSystem(createNewSave(NOW) as unknown as UniverseSaveData);
}

describe('Rosas Park é um destino de verdade', () => {
  it('está registrada no sistema de regiões e conhecida desde o começo', () => {
    const region = getRegion('rosas-park');
    expect(region).toBeDefined();
    expect(initialRegions()).toContain('rosas-park');
    expect(new RegionManager().knows('rosas-park')).toBe(true);
  });

  it('tem caminho conhecido a partir de Aurora City, sem bloqueio', () => {
    const manager = new RegionManager();
    expect(routeBetween('aurora-city', 'rosas-park').length).toBeGreaterThan(0);
    expect(manager.travelBlocker('rosas-park')).toBeNull();
    expect(manager.canTravelTo('rosas-park')).toBe(true);
    expect(manager.travelTimeTo('rosas-park')).toBeGreaterThan(0);
  });

  it('tem cenário 3D registrado, e o blueprint é carregável', () => {
    expect(hasScene('rosas-park')).toBe(true);
    const blueprint = getBlueprint('rosas-park');
    expect(blueprint).not.toBeNull();
    expect(blueprint?.terrainSize).toBeGreaterThan(0);
    expect(blueprint?.loadingSteps.length).toBe(5);
  });

  it('o ponto de chegada é o mesmo que o cenário usa — nada de cair em outro lugar', () => {
    for (const region of REGIONS) {
      if (!hasScene(region.id)) continue;
      const spawn = getBlueprint(region.id)?.spawn;
      expect(spawn, region.id).toBeDefined();
      if (!spawn) continue;
      expect(region.arrival.x, `${region.id}: chegada fora do nascedouro`).toBeCloseTo(spawn.x, 3);
      expect(region.arrival.z, `${region.id}: chegada fora do nascedouro`).toBeCloseTo(spawn.z, 3);
      expect(region.arrival.heading).toBeCloseTo(spawn.heading, 3);
    }
  });

  it('chega em chão seco, dentro do limite, e não dentro de uma parede', () => {
    const arrival = getRegion('rosas-park')?.arrival;
    expect(arrival).toBeDefined();
    if (!arrival) return;
    expect(Math.hypot(arrival.x, arrival.z)).toBeLessThan(ROSAS_BOUNDARY);
    expect(isWaterAt(arrival.x, arrival.z)).toBe(false);
    expect(rosasHeight(arrival.x, arrival.z)).toBeGreaterThan(0.2);
  });
});

describe('a viagem de ida e volta', () => {
  it('leva o jogador para lá e o traz de volta', () => {
    const universe = newUniverse();
    expect(universe.regions.currentRegionId).toBe('aurora-city');

    const indo = universe.travelTo('rosas-park', { x: 12, y: 0, z: -40, heading: 1 });
    expect(indo).not.toBeNull();
    expect(indo?.from).toBe('aurora-city');
    expect(indo?.to).toBe('rosas-park');
    expect(universe.regions.currentRegionId).toBe('rosas-park');

    const voltando = universe.travelTo('aurora-city', { x: -8, y: 0, z: 70, heading: 2 });
    expect(voltando).not.toBeNull();
    expect(universe.regions.currentRegionId).toBe('aurora-city');
  });

  it('devolve o jogador onde ele estava, não na entrada da cidade', () => {
    const universe = newUniverse();
    // Sai de Aurora de um ponto específico.
    universe.travelTo('rosas-park', { x: 12, y: 0, z: -40, heading: 1 });
    // Anda em Rosas e volta.
    universe.travelTo('aurora-city', { x: -8, y: 0, z: 70, heading: 2 });

    const backInAurora = universe.regions.entryPoint('aurora-city');
    expect(backInAurora.x).toBeCloseTo(12, 3);
    expect(backInAurora.z).toBeCloseTo(-40, 3);

    // E voltando a Rosas, o parque lembra onde ele parou.
    universe.travelTo('rosas-park', { x: 1, y: 0, z: 2, heading: 0 });
    const backInRosas = universe.regions.entryPoint('rosas-park');
    expect(backInRosas.x).toBeCloseTo(-8, 3);
    expect(backInRosas.z).toBeCloseTo(70, 3);
  });

  it('na primeira visita, chega no ponto de chegada da região', () => {
    const universe = newUniverse();
    const entry = universe.regions.entryPoint('rosas-park');
    const arrival = getRegion('rosas-park')?.arrival;
    expect(entry.x).toBeCloseTo(arrival?.x ?? NaN, 3);
    expect(entry.z).toBeCloseTo(arrival?.z ?? NaN, 3);
  });

  it('recusa a viagem para onde o jogador já está', () => {
    const universe = newUniverse();
    expect(universe.travelTo('aurora-city')).toBeNull();
    expect(universe.regions.travelBlocker('aurora-city')).toBe('Você já está aqui.');
  });

  it('recusa destino inventado, sem quebrar o estado', () => {
    const universe = newUniverse();
    expect(universe.travelTo('atlantida')).toBeNull();
    expect(universe.regions.currentRegionId).toBe('aurora-city');
  });
});

describe('o que atravessa a viagem', () => {
  /** Monta um jogador com coisas a perder. */
  function loadedPlayer(): UniverseSystem {
    const universe = newUniverse();
    universe.economy.earn(500, 'teste');
    universe.economy.restore('fone-aurora', 2);
    universe.pets.adopt('gato', 'Pitanga');
    universe.housing.acquire('apto-aurora-12', 'alugada');
    universe.startMission('primeiros-passos');
    universe.sightSpecies('gato');

    // Se o jogador não tem nada, "nada se perdeu" é verdade à toa.
    expect(universe.economy.inventory().length).toBeGreaterThan(0);
    expect(universe.pets.list().length).toBeGreaterThan(0);
    expect(universe.housing.list().length).toBeGreaterThan(0);
    expect(universe.missions.active().length).toBeGreaterThan(0);
    expect(universe.wildlife.hasSeen('gato')).toBe(true);
    return universe;
  }

  it('cristais, inventário, bichos, casa, missões e descobertas continuam lá', () => {
    const universe = loadedPlayer();

    const before = {
      crystals: universe.economy.crystals,
      inventory: universe.economy.inventory().map((entry) => `${entry.item.id}x${entry.quantity}`).sort(),
      pets: universe.pets.list().map((pet) => `${pet.id}:${pet.name}`).sort(),
      homes: universe.housing.list().map((home) => home.propertyId).sort(),
      missions: universe.missions.active().map((mission) => mission.id).sort(),
      known: universe.regions.knownRegions().map((region) => region.id).sort(),
      sightings: universe.wildlife.hasSeen('gato'),
    };

    universe.travelTo('rosas-park', { x: 0, y: 0, z: 0, heading: 0 });
    universe.travelTo('aurora-city', { x: 0, y: 0, z: 0, heading: 0 });

    expect(universe.economy.crystals).toBe(before.crystals);
    expect(universe.economy.inventory().map((e) => `${e.item.id}x${e.quantity}`).sort()).toEqual(before.inventory);
    expect(universe.pets.list().map((pet) => `${pet.id}:${pet.name}`).sort()).toEqual(before.pets);
    expect(universe.housing.list().map((home) => home.propertyId).sort()).toEqual(before.homes);
    expect(universe.missions.active().map((mission) => mission.id).sort()).toEqual(before.missions);
    expect(universe.regions.knownRegions().map((region) => region.id).sort()).toEqual(before.known);
    expect(universe.wildlife.hasSeen('gato')).toBe(before.sightings);
  });

  it('o salvamento guarda a região e reabre nela', () => {
    const universe = loadedPlayer();
    universe.travelTo('rosas-park', { x: 4, y: 0, z: 8, heading: 0.5 });
    const saved = JSON.parse(JSON.stringify(universe.toJSON())) as UniverseSaveData;

    const reopened = new UniverseSystem(saved);
    expect(reopened.regions.currentRegionId).toBe('rosas-park');
    expect(reopened.economy.crystals).toBe(universe.economy.crystals);
    expect(reopened.economy.inventory().length).toBe(universe.economy.inventory().length);
    expect(reopened.missions.active().length).toBe(universe.missions.active().length);
    expect(reopened.pets.list().length).toBe(universe.pets.list().length);
    expect(reopened.housing.list().length).toBe(universe.housing.list().length);
  });

  it('sair e voltar não duplica nem apaga nada do inventário', () => {
    const universe = loadedPlayer();
    const count = universe.economy.inventory().length;
    for (let i = 0; i < 3; i += 1) {
      universe.travelTo('rosas-park', { x: 0, y: 0, z: 0, heading: 0 });
      universe.travelTo('aurora-city', { x: 0, y: 0, z: 0, heading: 0 });
    }
    expect(universe.economy.inventory().length).toBe(count);
    expect(universe.regions.currentRegionId).toBe('aurora-city');
  });
});
