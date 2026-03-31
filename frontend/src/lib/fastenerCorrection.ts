/**
 * Bevestigingsmiddelencorrectie conform NEN-EN-ISO 6946 Annex F.
 *
 * Berekent de correctie ΔU_f voor mechanische bevestigingsmiddelen
 * die door de isolatielaag gaan (spouwankers, schroeven, etc.).
 */

import type { FastenerConfig } from "./rcCalculation";

/** Correctiefactor α voor volledig doorsnijdend bevestigingsmiddel. */
const ALPHA_FULL = 0.8;

/**
 * Bereken ΔU_f correctie voor bevestigingsmiddelen.
 *
 * Formule (ISO 6946 Annex F):
 *   ΔU_f = α × (λ_f × A_f × n_f) / d_0
 *
 * - α = 0.8 bij volledig doorsnijdend (penetrationDepth ≥ insulationThickness)
 * - α = 0.8 × (d_1/d_0) bij gedeeltelijke doorsnijding
 * - Geen correctie bij λ_f < 1.0 W/(m·K) (kunststof bevestigingsmiddelen)
 *
 * @param config Bevestigingsmiddel configuratie
 * @param insulationThicknessMm Totale isolatielaagdikte [mm]
 * @returns ΔU_f [W/(m²·K)]
 */
export function calculateFastenerCorrection(
  config: FastenerConfig,
  insulationThicknessMm: number,
): number {
  // Geen correctie voor kunststof bevestigingsmiddelen
  if (config.lambdaFastener < 1.0) return 0;

  // Geen correctie als er geen bevestigingsmiddelen zijn
  if (config.countPerM2 <= 0 || config.crossSection <= 0) return 0;

  const d0 = insulationThicknessMm / 1000; // isolatiedikte [m]
  if (d0 <= 0) return 0;

  const d1 = config.penetrationDepth / 1000; // doorsnijdingsdiepte [m]

  // A_f in m² (invoer is mm²)
  const aF = config.crossSection / 1_000_000;

  // α: correctiefactor
  const alpha = d1 >= d0 ? ALPHA_FULL : ALPHA_FULL * (d1 / d0);

  // ΔU_f = α × (λ_f × A_f × n_f) / d_0
  return alpha * (config.lambdaFastener * aF * config.countPerM2) / d0;
}

/** Voorgedefinieerde bevestigingsmiddelmaterialen. */
export const FASTENER_MATERIALS = [
  { label: "Staal", lambdaFastener: 50 },
  { label: "RVS", lambdaFastener: 17 },
  { label: "Kunststof", lambdaFastener: 0.5 },
] as const;

/**
 * Bereken doorsnede-oppervlak uit diameter [mm].
 * A = π × (d/2)²
 */
export function diameterToCrossSection(diameterMm: number): number {
  return Math.PI * (diameterMm / 2) ** 2;
}
