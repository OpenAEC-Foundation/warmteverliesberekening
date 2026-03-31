/**
 * Rc/U-waarde berekening conform NEN-EN-ISO 6946.
 *
 * Ondersteunt zowel homogene als inhomogene lagen (combined method §6.7).
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

/** Stijl/keper configuratie voor inhomogene lagen (ISO 6946 §6.7). */
export interface StudConfig {
  /** Materiaal-ID van de stijl (bijv. "hout-naaldhout"). */
  materialId: string;
  /** Breedte stijl loodrecht op de laag [mm]. */
  width: number;
  /** Hart-op-hart afstand [mm]. */
  spacing: number;
}

/** Bevestigingsmiddelen correctie (ISO 6946 Annex F). */
export interface FastenerConfig {
  /** Lambda bevestigingsmiddel [W/(m·K)]. Staal=50, RVS=17, kunststof<1. */
  lambdaFastener: number;
  /** Doorsnede-oppervlak per bevestigingsmiddel [mm²]. */
  crossSection: number;
  /** Aantal per m². */
  countPerM2: number;
  /** Lengte door isolatielaag [mm]. */
  penetrationDepth: number;
}

export interface LayerInput {
  materialId: string;
  /** Laagdikte in mm. */
  thickness: number;
  /** Optionele handmatige lambda-override [W/(m·K)]. */
  lambdaOverride?: number;
  /** Stijlen/kepers in deze laag (ISO 6946 inhomogene laag). */
  stud?: StudConfig;
}

export interface LayerResult {
  name: string;
  thickness: number;
  lambda: number | null;
  /** Thermische weerstand van deze laag [m²·K/W] (homogeen of effectief). */
  r: number;
  /** Effectieve R na inhomogeen-correctie [m²·K/W]. Alleen bij stud. */
  rEffective?: number;
  /** Fractioneel oppervlak stijl [-]. Alleen bij stud. */
  studFraction?: number;
}

export interface RcResult {
  layers: LayerResult[];
  /** Binnenoppervlakteweerstand [m²·K/W]. */
  rSi: number;
  /** Buitenoppervlakteweerstand [m²·K/W]. */
  rSe: number;
  /** Constructieweerstand Rc = Σ R_lagen [m²·K/W]. */
  rc: number;
  /** Totale weerstand R_totaal = Rsi + Rc + Rse [m²·K/W]. */
  rTotal: number;
  /** U-waarde = 1 / R_totaal [W/(m²·K)]. */
  uValue: number;
  /** Bovengrens R'_T [m²·K/W] — alleen bij inhomogene lagen. */
  rUpper?: number;
  /** Ondergrens R''_T [m²·K/W]. */
  rLower?: number;
  /** Ratio R'_T / R''_T — moet < 1.5 zijn (ISO 6946 §6.7.2). */
  ratio?: number;
  /** Correctie bevestigingsmiddelen ΔU_f [W/(m²·K)]. */
  deltaUf?: number;
}

// ---------- Helpers ----------

/** Bereken R-waarde voor één homogene laag. */
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

// ---------- Berekening ----------

/**
 * Bereken Rc en U-waarde voor een constructie-opbouw.
 *
 * Conform NEN-EN-ISO 6946:
 * - Homogene lagen: R_totaal = Rsi + Σ(d/λ) + Rse
 * - Inhomogene lagen (stud): combined method (§6.7) met bovengrens/ondergrens
 *
 * Backward compatible: als geen enkele laag een stud heeft, gedraagt de
 * functie zich identiek aan de originele versie.
 */
export function calculateRc(
  layers: LayerInput[],
  position: VerticalPosition,
): RcResult {
  const rSi = R_SI[position];
  const rSe = R_SE;

  const hasInhomogeneous = layers.some((l) => l.stud);

  // Bouw per-laag resultaten op
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
    const rHomogeneous = layerResistance(material, input.thickness, input.lambdaOverride);

    if (input.stud) {
      const studMaterial = getMaterialById(input.stud.materialId);
      const studLambda = studMaterial?.lambda ?? 0;
      const fStud = input.stud.width / input.stud.spacing;
      const dMeters = input.thickness / 1000;

      // R per sectie
      const rInsulation = rHomogeneous;
      const rStud = studLambda > 0 ? dMeters / studLambda : 0;

      // Effectieve R (ondergrens-methode per laag: parallel)
      const rEff =
        rInsulation > 0 && rStud > 0
          ? 1 / ((1 - fStud) / rInsulation + fStud / rStud)
          : rHomogeneous;

      return {
        name: material.name,
        thickness: input.thickness,
        lambda,
        r: rEff,
        rEffective: rEff,
        studFraction: fStud,
      };
    }

    return {
      name: material.name,
      thickness: input.thickness,
      lambda,
      r: rHomogeneous,
    };
  });

  // Als er inhomogene lagen zijn → combined method
  if (hasInhomogeneous) {
    return calculateCombined(layers, layerResults, rSi, rSe);
  }

  // Standaard homogene berekening
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

/**
 * ISO 6946 §6.7 combined method voor inhomogene constructies.
 *
 * Stap 1: Identificeer secties (door isolatie / door stijl)
 * Stap 2: Bereken bovengrens R'_T (secties parallel over hele opbouw)
 * Stap 3: Bereken ondergrens R''_T (per laag parallel, dan in serie)
 * Stap 4: R_T = (R'_T + R''_T) / 2
 */
function calculateCombined(
  inputs: LayerInput[],
  layerResults: LayerResult[],
  rSi: number,
  rSe: number,
): RcResult {
  // Bepaal fractionele oppervlakken.
  // Vereenvoudiging: we nemen aan dat alle inhomogene lagen dezelfde
  // stijlpositie hebben (typisch HSB: alle stijlen op zelfde h.o.h.).
  // Bij meerdere inhomogene lagen met verschillende stud-config
  // gebruiken we de eerste als referentie voor de secties.
  const firstStud = inputs.find((l) => l.stud)?.stud;
  if (!firstStud) {
    // Geen stijlen → homogeen (zou niet bereikt moeten worden)
    const rc = layerResults.reduce((sum, l) => sum + l.r, 0);
    const rTotal = rSi + rc + rSe;
    return {
      layers: layerResults,
      rSi,
      rSe,
      rc,
      rTotal,
      uValue: rTotal > 0 ? 1 / rTotal : 0,
    };
  }

  // --- Bovengrens R'_T (secties parallel) ---
  // Sectie A = door isolatie, Sectie B = door stijl
  let rTotalA = rSi + rSe; // R door isolatiesectie
  let rTotalB = rSi + rSe; // R door stijlsectie
  let fA = 1.0; // fractie isolatie (wordt overschreven per inhomogene laag)
  let fB = 0.0; // fractie stijl

  // --- Ondergrens R''_T (per laag parallel) ---
  let rLowerSum = rSi + rSe;

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    const material = getMaterialById(input.materialId);
    if (!material) continue;

    const dMeters = input.thickness / 1000;

    if (input.stud) {
      const studMaterial = getMaterialById(input.stud.materialId);
      const studLambda = studMaterial?.lambda ?? 0;
      const lambdaIns = input.lambdaOverride ?? material.lambda ?? 0;

      const fStud = input.stud.width / input.stud.spacing;
      const fIns = 1 - fStud;
      fA = fIns;
      fB = fStud;

      // R per sectie per materiaal
      const rIns = lambdaIns > 0 ? dMeters / lambdaIns : 0;
      const rStud = studLambda > 0 ? dMeters / studLambda : 0;

      // Bovengrens: voeg per sectie toe
      rTotalA += rIns;
      rTotalB += rStud;

      // Ondergrens: parallelle R voor deze laag
      if (rIns > 0 && rStud > 0) {
        rLowerSum += 1 / (fIns / rIns + fStud / rStud);
      } else {
        rLowerSum += rIns || rStud;
      }
    } else {
      // Homogene laag — zelfde R in alle secties
      const rLayer = layerResistance(material, input.thickness, input.lambdaOverride);
      rTotalA += rLayer;
      rTotalB += rLayer;
      rLowerSum += rLayer;
    }
  }

  // Bovengrens: 1/R'_T = fA/R_T,A + fB/R_T,B
  const rUpper =
    rTotalA > 0 && rTotalB > 0
      ? 1 / (fA / rTotalA + fB / rTotalB)
      : Math.max(rTotalA, rTotalB);

  const rLower = rLowerSum;

  // Combined: gemiddelde
  const rTotal = (rUpper + rLower) / 2;
  const rc = rTotal - rSi - rSe;
  const uValue = rTotal > 0 ? 1 / rTotal : 0;
  const ratio = rLower > 0 ? rUpper / rLower : 1;

  return {
    layers: layerResults,
    rSi,
    rSe,
    rc,
    rTotal,
    uValue,
    rUpper,
    rLower,
    ratio,
  };
}
