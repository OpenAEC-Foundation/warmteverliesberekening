/**
 * Example house data for the modeller mockup.
 *
 * L-shaped terraced house (rijwoning) similar to the ISSO 51 reference.
 * Main body: 6500mm wide x 10000mm deep.
 * Wing: extends right from bottom, 5500mm wide x 4500mm deep.
 *
 * Coordinate system: Y-down (screen convention), mm.
 */
import type { ModelRoom, ModelWindow, Point2D } from "./types";

function rect(x1: number, y1: number, x2: number, y2: number): Point2D[] {
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

export const FLOOR_LABELS = ["BG", "V1", "V2"] as const;

export const EXAMPLE_ROOMS: ModelRoom[] = [
  // --- Top (back of house) ---
  {
    id: "0.06", name: "Slaapkamer", function: "bedroom",
    polygon: rect(0, 0, 6500, 2500), floor: 0, height: 2600,
  },
  // --- Middle row (main body) ---
  {
    id: "0.05", name: "Berging", function: "storage",
    polygon: rect(0, 2500, 2000, 5500), floor: 0, height: 2600,
  },
  {
    id: "0.01", name: "Hal", function: "hallway",
    polygon: rect(2000, 2500, 4500, 5500), floor: 0, height: 2600,
  },
  {
    id: "0.02", name: "WC", function: "toilet",
    polygon: rect(4500, 2500, 6500, 5500), floor: 0, height: 2600,
  },
  // --- Bottom row (front + wing) ---
  {
    id: "0.04", name: "Keuken", function: "kitchen",
    polygon: rect(0, 5500, 6500, 10000), floor: 0, height: 2600,
  },
  {
    id: "0.03", name: "Woonkamer", function: "living_room",
    polygon: rect(6500, 5500, 12000, 10000), floor: 0, height: 2600,
  },
];

export const EXAMPLE_WINDOWS: ModelWindow[] = [
  // Slaapkamer — north wall (top edge, wall 0)
  { roomId: "0.06", wallIndex: 0, offset: 1500, width: 1200 },
  { roomId: "0.06", wallIndex: 0, offset: 4500, width: 1200 },
  // Berging — west wall (left edge, wall 3)
  { roomId: "0.05", wallIndex: 3, offset: 1500, width: 800 },
  // Keuken — south wall (bottom edge, wall 2)
  { roomId: "0.04", wallIndex: 2, offset: 1500, width: 1200 },
  { roomId: "0.04", wallIndex: 2, offset: 3500, width: 1000 },
  { roomId: "0.04", wallIndex: 2, offset: 5500, width: 1200 },
  // Keuken — west wall (left edge, wall 3)
  { roomId: "0.04", wallIndex: 3, offset: 1500, width: 1200 },
  { roomId: "0.04", wallIndex: 3, offset: 3500, width: 1200 },
  // Woonkamer — south wall (bottom edge, wall 2)
  { roomId: "0.03", wallIndex: 2, offset: 1500, width: 1500 },
  { roomId: "0.03", wallIndex: 2, offset: 4000, width: 1500 },
  // Woonkamer — east wall (right edge, wall 1)
  { roomId: "0.03", wallIndex: 1, offset: 1200, width: 2000 },
  // Slaapkamer — east wall (right edge, wall 1) — above wing
  { roomId: "0.06", wallIndex: 1, offset: 1200, width: 800 },
];
