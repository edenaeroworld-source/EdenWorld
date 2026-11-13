/**
 * Registro das regiões que existem em três dimensões.
 *
 * `Region.ts` lista todas as regiões do universo; este arquivo lista
 * as que têm chão. A diferença entre as duas listas é exatamente o que
 * o Atlas chama de "cenário em construção" — e é honesta por
 * construção, porque `isPlayableRegion` lê daqui.
 */

import { auroraBlueprint } from './aurora-city/AuroraBlueprint';
import { rosasBlueprint } from './rosas-park/RosasBlueprint';
import type { RegionBlueprint } from '../world/RegionScene';

const BLUEPRINTS: readonly RegionBlueprint[] = [auroraBlueprint, rosasBlueprint];

/** Região padrão quando nada mais serve. */
export const DEFAULT_REGION_ID = 'aurora-city';

export function getBlueprint(regionId: string): RegionBlueprint | null {
  return BLUEPRINTS.find((blueprint) => blueprint.id === regionId) ?? null;
}

/** Tem cenário 3D construído? */
export function hasScene(regionId: string): boolean {
  return BLUEPRINTS.some((blueprint) => blueprint.id === regionId);
}

export function builtRegionIds(): readonly string[] {
  return BLUEPRINTS.map((blueprint) => blueprint.id);
}
