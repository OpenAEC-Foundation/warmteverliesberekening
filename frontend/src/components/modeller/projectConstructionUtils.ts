/**
 * Helpers voor `ProjectConstruction` — single source of truth voor de
 * "layers → calculateRc  |  geen layers → pc.uValue fallback" logica.
 *
 * Deze helpers werden geïntroduceerd met Bug G: voorheen stond hetzelfde
 * ternair patroon op 6+ call sites (useAllConstructions, RoomTable,
 * ConstructionRow, ConstructionPicker, ProjectConstructions). Door het te
 * centraliseren kan toekomstige semantiek-verandering op één plek.
 */

import { calculateRc, roundUValue } from "../../lib/rcCalculation";

import type { ProjectConstruction } from "./types";

/**
 * Bepaal de effectieve U-waarde van een ProjectConstruction.
 *
 * - Heeft `pc.layers` lagen → `calculateRc(layers, verticalPosition)`,
 *   afgerond op 3 decimalen.
 * - Anders → `pc.uValue` (voor kozijnen/vullingen zoals triple-glas, deur).
 * - Beide leeg → `fallback` (default 0).
 */
export function getProjectConstructionUValue(
  pc: ProjectConstruction,
  fallback = 0,
): number {
  if (pc.layers.length > 0) {
    return roundUValue(calculateRc(pc.layers, pc.verticalPosition).uValue);
  }
  return pc.uValue ?? fallback;
}

/**
 * Normaliseer het `uValue` veld volgens de ProjectConstruction invariant:
 * alleen geset wanneer `layers` leeg is. Voorkomt dat een stale `uValue`
 * blijft hangen nadat er lagen zijn toegevoegd.
 */
export function normalizeProjectConstructionUValue(
  layers: readonly unknown[],
  uValue: number | undefined,
): number | undefined {
  return layers.length === 0 ? uValue : undefined;
}
