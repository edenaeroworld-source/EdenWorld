/**
 * Contrato de uma região em três dimensões.
 *
 * Até aqui o `World` sabia montar exatamente uma coisa: Aurora City.
 * Isso impedia que qualquer outra região existisse de verdade — ela
 * podia constar do Atlas, mas não tinha chão.
 *
 * `RegionScene` é o que o `World` hospeda sem saber qual região é.
 * `RegionBlueprint` é a receita: relevo, zonas, paleta, bolhas e o
 * construtor da cena. Uma região nova é um blueprint novo, e nada no
 * `World` precisa mudar.
 */

import type * as THREE from 'three';
import type { HabitatAnchor } from '../creatures/WildlifeView';
import type { Interactable } from '../interactions/Interactable';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { CityFrame, CollectibleSpot, JetEmitter, LightSpot, PortalStation, SphereController, WaterSoundSource } from '../cities/aurora-city/CityContext';
import type { HeightField } from './HeightField';
import type { MaterialLibrary } from './Materials';
import type { TerrainPalette } from './Terrain';
import type { Vegetation } from './Vegetation';
import type { ZoneMap } from './ZoneMap';

/** Uma região montada e viva na cena. */
export interface RegionScene {
  readonly id: string;
  readonly name: string;
  readonly group: THREE.Group;
  readonly interactables: readonly Interactable[];
  readonly portals: readonly PortalStation[];
  readonly collectibles: readonly CollectibleSpot[];
  readonly jets: readonly JetEmitter[];
  readonly waterSounds: readonly WaterSoundSource[];
  readonly lightSpots: readonly LightSpot[];
  /** A Esfera Aurora só existe em Aurora; as outras devolvem `null`. */
  readonly sphere: SphereController | null;
  setDetailScale(scale: number): void;
  update(frame: CityFrame): void;
  dispose(): void;
}

/** Uma sub-área nomeada da região. */
export interface NamedArea {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

/** Nuvem de bolhas/vaga-lumes ambiente. */
export interface BubbleZone {
  x: number;
  z: number;
  y: number;
  radius: number;
  count: number;
}

export interface RegionSceneOptions {
  materials: MaterialLibrary;
  physics: PhysicsWorld;
  heightField: HeightField;
  zones: ZoneMap;
  vegetation: Vegetation;
}

/** A receita de uma região: tudo que o `World` precisa para montá-la. */
export interface RegionBlueprint {
  id: string;
  name: string;
  /** Lado do terreno, em metros. */
  terrainSize: number;
  /** Resolução da malha de altura. */
  terrainSegments: number;
  /** Até onde o jogador pode andar. */
  boundaryRadius: number;
  waterLevel: number;
  /** Mensagens da tela de carregamento, na voz da região. */
  loadingSteps: readonly [string, string, string, string, string];
  palette?: Partial<TerrainPalette>;
  /** Relevo: função pura de altura. */
  height(x: number, z: number): number;
  /** Onde não se pode construir nem plantar. */
  buildZones(heightField: HeightField): ZoneMap;
  /** Pinta o mapa de controle do terreno (R = caminho, G = canteiro, B = pavimento). */
  paintControl(canvas: HTMLCanvasElement, zones: ZoneMap, heightField: HeightField): void;
  bubbles(): readonly BubbleZone[];
  /** Onde cada tipo de bicho se sente em casa, nesta região. */
  habitats(): readonly HabitatAnchor[];
  /** Sub-áreas nomeadas: é o que o HUD mostra como "onde você está". */
  areas(): readonly NamedArea[];
  /** Raio da linha de costa num ângulo — alimenta o som de água ao longe. */
  coastRadius(angle: number): number;
  /** Ponto de partida de quem chega pela primeira vez. */
  spawn: { x: number; z: number; heading: number };
  /** Monta a região. Chamado uma vez por visita. */
  create(options: RegionSceneOptions): RegionScene;
}
