/**
 * Unit tests voor rcCalculation.ts — specifiek de lambdaOverride fallback.
 *
 * Deze tests dekken het scenario waarbij de Revit thermal import layers
 * aanlevert zonder een geldige materialId (geen database-match) maar mét
 * een lambda-waarde. Zonder de fix retourneerde calculateRc() een R-waarde
 * van 0 voor zo'n laag, waardoor u_value 0 bleef en transmissieverlies op
 * álle geïmporteerde schillen op 0 W/K viel.
 *
 * **Uitvoering:** zelfde patroon als `deltaT.test.ts` — pure TypeScript die
 * schoon compileert met `npx tsc -b`. Functies gooien een Error bij een
 * assertion failure; `runAllTests()` draait ze sequentieel.
 */

import { calculateRc, type LayerInput } from "./rcCalculation.ts";

// ---------------------------------------------------------------------------
// Mini assertion helpers (geen externe dependency)
// ---------------------------------------------------------------------------

function assertClose(
  actual: number,
  expected: number,
  eps: number,
  message: string,
): void {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(
      `[assertClose FAIL] ${message}: expected ${expected} (±${eps}), got ${actual}`,
    );
  }
}

function assertTrue(value: boolean, message: string): void {
  if (!value) {
    throw new Error(`[assertTrue FAIL] ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Test 1 — lambdaOverride zonder database-match levert correcte R-waarde
// ---------------------------------------------------------------------------

/**
 * Scenario: één laag van 100 mm met een exotische Revit materiaal-naam
 * (`i1_hout_bamboe`) die NIET matcht in materialsDatabase, maar de exporter
 * heeft `lambda: 0.035` meegegeven.
 *
 * Verwachting:
 *   R_laag = 0.100 m / 0.035 W/mK = 2.857... m²K/W
 *   Rc = 2.857 (alleen één laag)
 *   R_totaal = Rsi(0.13) + Rc + Rse(0.04) = 3.027...
 *   U = 1 / 3.027 ≈ 0.330 W/m²K
 */
export function test_lambdaOverride_without_material_match(): void {
  const layers: LayerInput[] = [
    {
      materialId: "i1_hout_bamboe", // raw Revit naam, niet in database
      thickness: 100,
      lambdaOverride: 0.035,
    },
  ];

  const result = calculateRc(layers, "wall");

  const expectedRLayer = 0.1 / 0.035;
  assertClose(
    result.layers[0]!.r,
    expectedRLayer,
    1e-6,
    "R-laag = d/lambdaOverride ook zonder database-match",
  );
  assertClose(
    result.rc,
    expectedRLayer,
    1e-6,
    "Rc = som van R-lagen (1 laag)",
  );
  assertClose(
    result.rTotal,
    0.13 + expectedRLayer + 0.04,
    1e-6,
    "R_totaal = Rsi + Rc + Rse voor wall",
  );
  const expectedU = 1 / (0.13 + expectedRLayer + 0.04);
  assertClose(
    result.uValue,
    expectedU,
    1e-6,
    "U = 1 / R_totaal ≈ 0.330 W/m²K",
  );
  assertTrue(result.uValue > 0, "U-waarde moet > 0 zijn met lambdaOverride");
}

// ---------------------------------------------------------------------------
// Test 2 — Wand conform opdracht: layers [{foo, 100mm, lambda 0.04}] → U~0.37
// ---------------------------------------------------------------------------

/**
 * Exact het voorbeeld uit de delegatie-opdracht:
 *   CatalogEntry layers = [{material:"foo", thickness_mm:100, lambda:0.04}]
 *   → calculateRc → R_laag = 0.100/0.04 = 2.5 m²K/W
 *   → R_totaal = 0.13 + 2.5 + 0.04 = 2.67
 *   → U ≈ 0.3745 W/m²K
 */
export function test_roundtrip_wall_100mm_lambda_004(): void {
  const layers: LayerInput[] = [
    {
      materialId: "foo", // onbekend materiaal
      thickness: 100,
      lambdaOverride: 0.04,
    },
  ];

  const result = calculateRc(layers, "wall");

  assertClose(result.layers[0]!.r, 2.5, 1e-6, "R = 100mm / 0.04 = 2.5");
  assertClose(result.rc, 2.5, 1e-6, "Rc = 2.5 voor single-layer opbouw");
  assertClose(result.rTotal, 2.67, 1e-6, "R_totaal = 0.13 + 2.5 + 0.04");
  assertClose(result.uValue, 1 / 2.67, 1e-4, "U ≈ 0.3745 W/m²K");
}

// ---------------------------------------------------------------------------
// Test 3 — lambdaOverride ontbreekt → R = 0 (graceful fallback)
// ---------------------------------------------------------------------------

/**
 * Als zowel de material-match als de lambdaOverride ontbreken, moet de laag
 * 0 bijdragen (niet NaN of crashen) en de hele berekening stabiel blijven.
 */
export function test_missing_material_and_lambda_gives_zero(): void {
  const layers: LayerInput[] = [
    {
      materialId: "does-not-exist",
      thickness: 150,
      // geen lambdaOverride
    },
  ];

  const result = calculateRc(layers, "wall");

  assertClose(
    result.layers[0]!.r,
    0,
    1e-9,
    "Laag zonder match én zonder lambdaOverride → R = 0",
  );
  assertClose(result.rc, 0, 1e-9, "Rc = 0 wanneer enige laag R=0");
  // R_totaal = 0.13 + 0 + 0.04 = 0.17 → U ≈ 5.88
  assertClose(result.rTotal, 0.17, 1e-9, "R_totaal = Rsi + Rse alleen");
  assertTrue(
    Number.isFinite(result.uValue),
    "U-waarde moet eindig blijven (geen NaN)",
  );
}

// ---------------------------------------------------------------------------
// Test 4 — Meerlaagse opbouw zonder enkele database-match
// ---------------------------------------------------------------------------

/**
 * Realistischer scenario met drie lagen uit een Revit export — geen enkele
 * laag matcht in de database, maar de exporter heeft alle lambdas meegegeven.
 * We verifiëren dat Rc = som van R-lagen en dat U > 0 is.
 */
export function test_multilayer_all_fallback(): void {
  const layers: LayerInput[] = [
    { materialId: "revit-binnenblad", thickness: 100, lambdaOverride: 1.0 },
    { materialId: "revit-isolatie", thickness: 120, lambdaOverride: 0.035 },
    { materialId: "revit-buitenblad", thickness: 100, lambdaOverride: 0.9 },
  ];

  const result = calculateRc(layers, "wall");

  const rBinnen = 0.1 / 1.0;
  const rIso = 0.12 / 0.035;
  const rBuiten = 0.1 / 0.9;
  const expectedRc = rBinnen + rIso + rBuiten;

  assertClose(result.rc, expectedRc, 1e-6, "Rc = som drie R-lagen");
  assertClose(
    result.rTotal,
    0.13 + expectedRc + 0.04,
    1e-6,
    "R_totaal met Rsi/Rse voor wall",
  );
  assertTrue(result.uValue > 0, "U > 0 met volledige fallback-stack");
  assertTrue(
    result.uValue < 1.0,
    "U voor 120mm isolatie moet ruim < 1.0 W/m²K zijn",
  );
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

/** Run all tests in sequence and throw on the first failure. */
export function runAllTests(): void {
  test_lambdaOverride_without_material_match();
  test_roundtrip_wall_100mm_lambda_004();
  test_missing_material_and_lambda_gives_zero();
  test_multilayer_all_fallback();
}
