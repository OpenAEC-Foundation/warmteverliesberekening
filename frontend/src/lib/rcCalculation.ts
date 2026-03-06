/**
 * Rc/U-waarde berekening conform NEN-EN-ISO 6946.
 *
 * Pure functies — geen side-effects, geen state.
 */

import type { VerticalPosition } from "../types";

import { getMaterialById, type Material } from "./materialsDatabase";

// ---------- Oppervlakteweerstanden (NEN-EN-ISO 6946) ----------

/** Binnenoppervlakteweerstand Rsi [m²·K/W] per constructiepositie. */
const R_SI: Record<VerticalPosition, number> = {
  wall: 0.13,
  ceiling: 0.10,
  floor: 0.17,
};

/** Buitenoppervlakteweerstand Rse [m²·K/W]. */
const R_SE = 0.04;

// ---------- Bouwbesluit 2024 minimale Rc-eisen (nieuwbouw) ----------

/** Minimale Rc [m²·K/W] per constructiepositie (Bouwbesluit 2024 nieuwbouw). */
export const RC_MIN_BOUWBESLUIT: Record<VerticalPosition, number> = {
  wall: 4.7,
  ceiling: 6.3,
  floor: 3.7,
};

// ---------- Types ----------

export interface LayerInput {
  materialId: string;
  /** Laagdikte in mm. */
  thickness: number;
  /** Optionele handmatige lambda-override [W/(m·K)]. */
  lambdaOverride?: number;
}

export interface LayerResult {
  name: string;
  thickness: number;
  lambda: number | null;
  /** Thermische weerstand van deze laag [m²·K/W]. */
  r: number;
}

export interface RcResult {
  layers: LayerResult[];
  /** Binnenoppervlakteweerstand [m²·K/W]. */
  rSi: number;
  /** Buitenoppervlakteweerstand [m²·K/W]. */
  rSe: number;
  /** Constructieweerstand Rc = \u03A3 R_lagen [m²·K/W]. */
  rc: number;
  /** Totale weerstand R_totaal = Rsi + Rc + Rse [m²·K/W]. */
  rTotal: number;
  /** U-waarde = 1 / R_totaal [W/(m²·K)]. */
  uValue: number;
}

// ---------- Berekening ----------

/** Bereken R-waarde voor één laag. */
function layerResistance(
  material: Material,
  thicknessMm: number,
  lambdaOverride?: number,
): number {
  // Spouwen/folies met vaste Rd-waarde
  if (material.rdFixed !== null) {
    return material.rdFixed;
  }

  const lambda = lambdaOverride ?? material.lambda;
  if (lambda === null || lambda <= 0) return 0;

  // d in meters
  const dMeters = thicknessMm / 1000;
  return dMeters / lambda;
}

/**
 * Bereken Rc en U-waarde voor een constructie-opbouw.
 *
 * Conform NEN-EN-ISO 6946:
 *   R_totaal = Rsi + \u03A3(d/\u03BB) + Rse
 *   U = 1 / R_totaal
 */
export function calculateRc(
  layers: LayerInput[],
  position: VerticalPosition,
): RcResult {
  const rSi = R_SI[position];
  const rSe = R_SE;

  const layerResults: LayerResult[] = layers.map((input) => {
    const material = getMaterialById(input.materialId);
    if (!material) {
      return {
        name: "Onbekend materiaal",
        thickness: input.thickness,
        lambda: null,
        r: 0,
      };
    }

    const lambda = input.lambdaOverride ?? material.lambda;
    const r = layerResistance(material, input.thickness, input.lambdaOverride);

    return {
      name: material.name,
      thickness: input.thickness,
      lambda,
      r,
    };
  });

  const rc = layerResults.reduce((sum, l) => sum + l.r, 0);
  const rTotal = rSi + rc + rSe;
  const uValue = rTotal > 0 ? 1 / rTotal : 0;

  return {
    layers: layerResults,
    rSi,
    rSe,
    rc,
    rTotal,
    uValue,
  };
}
