/**
 * Unit tests voor ΔT-logica in ConstructionLossChart.
 *
 * Covers spec §4.4 tests 10, 11 en 12:
 *   10. ΔT lookup voor adjacent_room via room-id
 *   11. Water boundary gebruikt theta_water uit DesignConditions
 *   12. Adjacent-room picker (id-wissel) triggert nieuwe ΔT
 *
 * **Uitvoering:** deze tests zijn opgesteld als pure TypeScript zonder
 * runtime dependencies. Ze compileren schoon met `npm run build` (tsc).
 * Wanneer vitest in `devDependencies` wordt opgenomen, kunnen de
 * `test(...)`-aanroepen hieronder vervangen worden door de vitest-import
 * `import { describe, it, expect } from "vitest"` zonder logic-wijzigingen.
 *
 * Tot die tijd kan dit bestand handmatig gedraaid worden via:
 *   npx tsc --noEmit src/components/charts/ConstructionLossChart.test.ts
 *
 * De testfuncties retourneren bij succes stilzwijgend en gooien een Error
 * bij falen, zodat ze compatibel zijn met elke test-runner.
 */

// Note: explicit `.ts` extensions are used so Node's native type-stripping
// (node --experimental-strip-types) can resolve the modules without a
// bundler. TypeScript accepts this because `allowImportingTsExtensions` is
// enabled in `tsconfig.json`.
import {
  buildRoomLookup,
  computeDeltaT,
  getRoomDesignTemperature,
  hasWaterBoundaries,
} from "./deltaT.ts";
import type { ConstructionElement, Room } from "../../types/project.ts";

// ---------------------------------------------------------------------------
// Mini assertion helpers (geen externe dependency)
// ---------------------------------------------------------------------------

function assertEqual(actual: number, expected: number, message: string): void {
  const eps = 1e-9;
  if (Math.abs(actual - expected) > eps) {
    throw new Error(
      `[assertEqual FAIL] ${message}: expected ${expected}, got ${actual}`,
    );
  }
}

function assertTrue(value: boolean, message: string): void {
  if (!value) {
    throw new Error(`[assertTrue FAIL] ${message}`);
  }
}

function assertFalse(value: boolean, message: string): void {
  if (value) {
    throw new Error(`[assertFalse FAIL] ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    name: "Test",
    function: "living_room",
    floor_area: 20,
    constructions: [],
    heating_system: "radiator_lt",
    ...overrides,
  };
}

function makeElement(
  overrides: Partial<ConstructionElement> = {},
): ConstructionElement {
  return {
    id: "ce-1",
    description: "Wand",
    area: 10,
    u_value: 0.3,
    boundary_type: "exterior",
    material_type: "masonry",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 10 — ConstructionLossChart ΔT lookup voor adjacent_room via room-id
// ---------------------------------------------------------------------------

export function test_ConstructionLossChart_adjacent_room_lookup(): void {
  // Woonkamer 20 °C, slaapkamer 18 °C via custom_temperature
  const living = makeRoom({
    id: "room-living",
    name: "Woonkamer",
    function: "living_room",
    custom_temperature: 20,
  });
  const bedroom = makeRoom({
    id: "room-bedroom",
    name: "Slaapkamer",
    function: "bedroom",
    custom_temperature: 18,
  });
  const rooms = buildRoomLookup([living, bedroom]);

  // Wand woonkamer → slaapkamer
  const wall = makeElement({
    boundary_type: "adjacent_room",
    adjacent_room_id: "room-bedroom",
  });

  const dT = computeDeltaT("adjacent_room", 20, -10, wall, {
    rooms,
    thetaWater: 5,
  });
  assertEqual(dT, 2, "ΔT woonkamer→slaapkamer = 20 − 18 = 2");

  // Verifieer dat getRoomDesignTemperature de custom_temperature respecteert
  assertEqual(
    getRoomDesignTemperature(bedroom),
    18,
    "custom_temperature heeft voorrang boven function default",
  );

  // Verifieer dat een function-default ook werkt (badkamer → 22)
  const bathroom = makeRoom({
    id: "room-bath",
    name: "Badkamer",
    function: "bathroom",
  });
  assertEqual(
    getRoomDesignTemperature(bathroom),
    22,
    "bathroom zonder custom_temperature valt terug op 22 °C",
  );

  // Orphan id → fallback 0 zonder ctx-match
  const orphan = makeElement({
    boundary_type: "adjacent_room",
    adjacent_room_id: "room-does-not-exist",
  });
  const dTOrphan = computeDeltaT("adjacent_room", 20, -10, orphan, {
    rooms,
    thetaWater: 5,
  });
  assertEqual(dTOrphan, 0, "orphan adjacent_room_id → ΔT = 0 (silent fallback)");
}

// ---------------------------------------------------------------------------
// Test 11 — Water boundary gebruikt theta_water uit DesignConditions
// ---------------------------------------------------------------------------

export function test_ConstructionLossChart_water_boundary(): void {
  const rooms = buildRoomLookup([]);
  const element = makeElement({
    boundary_type: "water",
    area: 8,
    u_value: 0.5,
  });

  // Default θ_water = 5, θᵢ = 20 → ΔT = 15
  const dTDefault = computeDeltaT("water", 20, -10, element, {
    rooms,
    thetaWater: 5,
  });
  assertEqual(dTDefault, 15, "water default ΔT = 20 − 5 = 15");

  // Override θ_water = 8 → ΔT = 12
  const dTOverride = computeDeltaT("water", 20, -10, element, {
    rooms,
    thetaWater: 8,
  });
  assertEqual(dTOverride, 12, "water override θ_water=8 → ΔT = 12");

  // Verifieer hasWaterBoundaries() detectie
  const waterRoom = makeRoom({
    id: "room-sauna",
    constructions: [element],
  });
  assertTrue(
    hasWaterBoundaries([waterRoom]),
    "hasWaterBoundaries true bij water-element",
  );
  assertFalse(
    hasWaterBoundaries([makeRoom({ constructions: [makeElement()] })]),
    "hasWaterBoundaries false zonder water-element",
  );
}

// ---------------------------------------------------------------------------
// Test 12 — Adjacent room picker: id-wissel triggert nieuwe ΔT
// ---------------------------------------------------------------------------

export function test_ConstructionLossChart_adjacent_room_picker_recalc(): void {
  // Drie rooms met verschillende setpoints
  const living = makeRoom({
    id: "room-living",
    custom_temperature: 21,
  });
  const hallway = makeRoom({
    id: "room-hall",
    function: "hallway",
    custom_temperature: 15,
  });
  const toilet = makeRoom({
    id: "room-wc",
    function: "toilet",
    custom_temperature: 18,
  });
  const rooms = buildRoomLookup([living, hallway, toilet]);

  // Wand vanuit woonkamer, aanvankelijk naar gang
  let wall: ConstructionElement = makeElement({
    boundary_type: "adjacent_room",
    adjacent_room_id: "room-hall",
  });
  const dT1 = computeDeltaT("adjacent_room", 21, -10, wall, {
    rooms,
    thetaWater: 5,
  });
  assertEqual(dT1, 6, "21 − 15 = 6 bij pick = room-hall");

  // Gebruiker wisselt picker naar toilet → nieuwe ΔT
  wall = { ...wall, adjacent_room_id: "room-wc" };
  const dT2 = computeDeltaT("adjacent_room", 21, -10, wall, {
    rooms,
    thetaWater: 5,
  });
  assertEqual(dT2, 3, "21 − 18 = 3 na wissel naar room-wc");

  // Nogmaals wissel, terug naar gang — herhaalbaarheid
  wall = { ...wall, adjacent_room_id: "room-hall" };
  const dT3 = computeDeltaT("adjacent_room", 21, -10, wall, {
    rooms,
    thetaWater: 5,
  });
  assertEqual(dT3, 6, "terug naar room-hall geeft weer ΔT = 6");
}

// ---------------------------------------------------------------------------
// Standalone runner (optional — invoked manually via `node` after tsc)
// ---------------------------------------------------------------------------

/** Run all tests in sequence and throw on the first failure. */
export function runAllTests(): void {
  test_ConstructionLossChart_adjacent_room_lookup();
  test_ConstructionLossChart_water_boundary();
  test_ConstructionLossChart_adjacent_room_picker_recalc();
}
