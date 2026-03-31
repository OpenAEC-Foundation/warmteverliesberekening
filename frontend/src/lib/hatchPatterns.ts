/**
 * NEN 47-conforme materiaal-arceringen voor constructiediagrammen.
 *
 * Elke MaterialCategory krijgt een uniek SVG hatch pattern conform de
 * Nederlandse bouwtekennorm NEN 47 (FR_DP_xx naamgeving).
 *
 * Exporteert zowel string-based SVG (voor glaserSvg.ts PDF-generator)
 * als React JSX (voor GlaserDiagram.tsx interactief diagram).
 */

import type { MaterialCategory } from "./materialsDatabase";

// ---------- Pattern ID Registry ----------

/**
 * Alle beschikbare hatch pattern IDs.
 * Category-defaults plus materiaal-specifieke sub-varianten.
 */
export type HatchPatternId =
  // Category defaults
  | "hatch-masonry"
  | "hatch-concrete"
  | "hatch-insulation-mineral"
  | "hatch-insulation-plastic"
  | "hatch-insulation-natural"
  | "hatch-wood"
  | "hatch-cavity"
  | "hatch-foil"
  | "hatch-finish"
  | "hatch-board"
  | "hatch-mortar"
  | "hatch-natural-stone"
  | "hatch-floor"
  | "hatch-metal"
  | "hatch-plastic"
  | "hatch-glass"
  | "hatch-other"
  // Sub-varianten isolatie
  | "hatch-insulation-glasswool"
  | "hatch-insulation-rockwool"
  | "hatch-insulation-pir"
  | "hatch-insulation-eps"
  | "hatch-insulation-xps"
  | "hatch-insulation-pur"
  // Sub-varianten hout
  | "hatch-wood-softwood"
  | "hatch-wood-hardwood"
  // Sub-varianten plaatmateriaal
  | "hatch-board-osb"
  | "hatch-board-mdf"
  | "hatch-board-gypsum";

/** Stroke kleur voor arceringen — grijstint, niet zwart. */
const S = "#555";
/** Lichtere stroke voor secundaire lijnen. */
const SL = "#777";
/** Nog lichtere stroke voor tertiaire elementen. */
const SLL = "#999";

// ---------- Pattern Definitions (SVG strings) ----------

interface PatternDef {
  id: HatchPatternId;
  width: number;
  height: number;
  /** Extra attributen op het <pattern> element (bv. patternTransform). */
  attrs?: string;
  /** Inner SVG content (lijnen, paden, cirkels etc.). */
  content: string;
}

const PATTERN_DEFS: PatternDef[] = [
  // ---- FR_DP_01: Metselwerk — diagonale parallelle lijnen 45° ----
  {
    id: "hatch-masonry",
    width: 8,
    height: 8,
    attrs: 'patternTransform="rotate(45)"',
    content: `<line x1="0" y1="0" x2="0" y2="8" stroke="${S}" stroke-width="0.8" stroke-opacity="0.5"/>`,
  },

  // ---- FR_DP_05/07: Beton — stippen in rasterpatroon ----
  {
    id: "hatch-concrete",
    width: 8,
    height: 8,
    content: [
      `<circle cx="2" cy="2" r="0.9" fill="${S}" fill-opacity="0.4"/>`,
      `<circle cx="6" cy="6" r="0.9" fill="${S}" fill-opacity="0.4"/>`,
      `<circle cx="6" cy="2" r="0.5" fill="${SL}" fill-opacity="0.3"/>`,
      `<circle cx="2" cy="6" r="0.5" fill="${SL}" fill-opacity="0.3"/>`,
    ].join(""),
  },

  // ---- FR_DP_17 glaswol: Minerale isolatie — zigzag lijnen ----
  {
    id: "hatch-insulation-mineral",
    width: 12,
    height: 10,
    content: `<polyline points="0,7 3,3 6,7 9,3 12,7" fill="none" stroke="${S}" stroke-width="0.9" stroke-opacity="0.4" stroke-linejoin="round"/>`,
  },

  // ---- FR_DP_17 PIR: Kunststof isolatie — kruisjes (X-grid) ----
  {
    id: "hatch-insulation-plastic",
    width: 10,
    height: 10,
    content: [
      `<line x1="2" y1="2" x2="8" y2="8" stroke="${S}" stroke-width="0.7" stroke-opacity="0.35"/>`,
      `<line x1="8" y1="2" x2="2" y2="8" stroke="${S}" stroke-width="0.7" stroke-opacity="0.35"/>`,
    ].join(""),
  },

  // ---- FR_DP_17 variant: Natuurlijke isolatie — organische zigzag ----
  {
    id: "hatch-insulation-natural",
    width: 14,
    height: 10,
    content: `<path d="M0,6 C2,3 4,3 5,6 S8,9 9,6 S12,3 14,6" fill="none" stroke="${S}" stroke-width="0.8" stroke-opacity="0.4"/>`,
  },

  // ---- FR_DP_12: Hout — gebogen nerflijnen (cubic bezier) ----
  {
    id: "hatch-wood",
    width: 16,
    height: 12,
    content: [
      `<path d="M0,2.5 C4,1.5 8,3.5 16,2" fill="none" stroke="${S}" stroke-width="0.8" stroke-opacity="0.45"/>`,
      `<path d="M0,6 C5,5 10,7.5 16,5.5" fill="none" stroke="${S}" stroke-width="0.6" stroke-opacity="0.35"/>`,
      `<path d="M0,9.5 C3,10.5 9,8.5 16,9.5" fill="none" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.3"/>`,
    ].join(""),
  },

  // ---- Spouw — leeg met lichte horizontale stippellijn ----
  {
    id: "hatch-cavity",
    width: 12,
    height: 12,
    content: `<line x1="0" y1="6" x2="12" y2="6" stroke="${SLL}" stroke-width="0.5" stroke-opacity="0.3" stroke-dasharray="2,3"/>`,
  },

  // ---- FR_DP_04: Folie — dunne zwarte horizontale lijn (membraan) ----
  {
    id: "hatch-foil",
    width: 8,
    height: 4,
    content: `<line x1="0" y1="2" x2="8" y2="2" stroke="${S}" stroke-width="1.2" stroke-opacity="0.5"/>`,
  },

  // ---- FR_DP_10: Afwerking — dunne horizontale streepjes ----
  {
    id: "hatch-finish",
    width: 10,
    height: 6,
    content: [
      `<line x1="1" y1="2" x2="5" y2="2" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.35"/>`,
      `<line x1="6" y1="5" x2="9" y2="5" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.35"/>`,
    ].join(""),
  },

  // ---- FR_DP_16: Plaatmateriaal — horizontale lijnen met korte verticale streepjes ----
  {
    id: "hatch-board",
    width: 12,
    height: 8,
    content: [
      `<line x1="0" y1="4" x2="12" y2="4" stroke="${S}" stroke-width="0.6" stroke-opacity="0.35"/>`,
      `<line x1="3" y1="2" x2="3" y2="6" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.3"/>`,
      `<line x1="9" y1="2" x2="9" y2="6" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.3"/>`,
    ].join(""),
  },

  // ---- FR_DP_01 variant: Mortel — lichte diagonale lijnen ----
  {
    id: "hatch-mortar",
    width: 8,
    height: 8,
    attrs: 'patternTransform="rotate(45)"',
    content: `<line x1="0" y1="0" x2="0" y2="8" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.3"/>`,
  },

  // ---- FR_DP_09: Natuursteen — onregelmatige horizontale streepjes ----
  {
    id: "hatch-natural-stone",
    width: 14,
    height: 8,
    content: [
      `<line x1="1" y1="2" x2="6" y2="2" stroke="${S}" stroke-width="0.7" stroke-opacity="0.4"/>`,
      `<line x1="8" y1="5" x2="13" y2="5" stroke="${S}" stroke-width="0.7" stroke-opacity="0.4"/>`,
      `<line x1="3" y1="7" x2="7" y2="7" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.3"/>`,
    ].join(""),
  },

  // ---- FR_DP_05: Vloer — stippen (als beton, iets groter) ----
  {
    id: "hatch-floor",
    width: 8,
    height: 8,
    content: [
      `<circle cx="2" cy="2" r="1.0" fill="${S}" fill-opacity="0.35"/>`,
      `<circle cx="6" cy="6" r="1.0" fill="${S}" fill-opacity="0.35"/>`,
    ].join(""),
  },

  // ---- FR_DP_18: Metaal — dichte diagonale lijnen 45° ----
  {
    id: "hatch-metal",
    width: 4,
    height: 4,
    attrs: 'patternTransform="rotate(45)"',
    content: `<line x1="0" y1="0" x2="0" y2="4" stroke="${S}" stroke-width="1" stroke-opacity="0.5"/>`,
  },

  // ---- FR_DP_22: Kunststof — lichte stippels ----
  {
    id: "hatch-plastic",
    width: 8,
    height: 8,
    content: `<circle cx="4" cy="4" r="0.6" fill="${SL}" fill-opacity="0.3"/>`,
  },

  // ---- FR_DP_29: Glas — diagonale lijnen breed gespaced ----
  {
    id: "hatch-glass",
    width: 12,
    height: 12,
    attrs: 'patternTransform="rotate(45)"',
    content: `<line x1="0" y1="0" x2="0" y2="12" stroke="${S}" stroke-width="0.6" stroke-opacity="0.35"/>`,
  },

  // ---- Overig — lichte kruisarcering ----
  {
    id: "hatch-other",
    width: 10,
    height: 10,
    content: [
      `<line x1="0" y1="5" x2="10" y2="5" stroke="${SLL}" stroke-width="0.4" stroke-opacity="0.25"/>`,
      `<line x1="5" y1="0" x2="5" y2="10" stroke="${SLL}" stroke-width="0.4" stroke-opacity="0.25"/>`,
    ].join(""),
  },

  // ======== Sub-varianten isolatie ========

  // Glaswol — klassiek zigzag, wijder
  {
    id: "hatch-insulation-glasswool",
    width: 14,
    height: 10,
    content: `<polyline points="0,7 3.5,3 7,7 10.5,3 14,7" fill="none" stroke="${S}" stroke-width="0.8" stroke-opacity="0.4" stroke-linejoin="round"/>`,
  },

  // Steenwol — dichter zigzag
  {
    id: "hatch-insulation-rockwool",
    width: 10,
    height: 8,
    content: `<polyline points="0,6 2.5,2 5,6 7.5,2 10,6" fill="none" stroke="${S}" stroke-width="1.0" stroke-opacity="0.45" stroke-linejoin="round"/>`,
  },

  // PIR — kruisjes
  {
    id: "hatch-insulation-pir",
    width: 10,
    height: 10,
    content: [
      `<line x1="2" y1="2" x2="8" y2="8" stroke="${S}" stroke-width="0.7" stroke-opacity="0.35"/>`,
      `<line x1="8" y1="2" x2="2" y2="8" stroke="${S}" stroke-width="0.7" stroke-opacity="0.35"/>`,
    ].join(""),
  },

  // EPS — cirkeltjes (piepschuim-bolletjes)
  {
    id: "hatch-insulation-eps",
    width: 10,
    height: 10,
    content: [
      `<circle cx="3" cy="3" r="1.8" fill="none" stroke="${S}" stroke-width="0.5" stroke-opacity="0.35"/>`,
      `<circle cx="8" cy="8" r="1.8" fill="none" stroke="${S}" stroke-width="0.5" stroke-opacity="0.35"/>`,
    ].join(""),
  },

  // XPS — vierkantjes
  {
    id: "hatch-insulation-xps",
    width: 10,
    height: 10,
    content: `<rect x="2.5" y="2.5" width="5" height="5" fill="none" stroke="${S}" stroke-width="0.6" stroke-opacity="0.35" rx="0.5"/>`,
  },

  // PUR — kruisjes variant (iets kleiner)
  {
    id: "hatch-insulation-pur",
    width: 8,
    height: 8,
    content: [
      `<line x1="2" y1="2" x2="6" y2="6" stroke="${S}" stroke-width="0.6" stroke-opacity="0.35"/>`,
      `<line x1="6" y1="2" x2="2" y2="6" stroke="${S}" stroke-width="0.6" stroke-opacity="0.35"/>`,
    ].join(""),
  },

  // ======== Sub-varianten hout ========

  // Naaldhout — lichtere, bredere nerf
  {
    id: "hatch-wood-softwood",
    width: 16,
    height: 14,
    content: [
      `<path d="M0,3 C5,2 10,4.5 16,2.5" fill="none" stroke="${S}" stroke-width="0.7" stroke-opacity="0.4"/>`,
      `<path d="M0,7.5 C4,7 9,9 16,7" fill="none" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.3"/>`,
      `<path d="M0,12 C6,11 12,12.5 16,11" fill="none" stroke="${SLL}" stroke-width="0.4" stroke-opacity="0.25"/>`,
    ].join(""),
  },

  // Loofhout — dichtere, krachtigere nerf
  {
    id: "hatch-wood-hardwood",
    width: 14,
    height: 10,
    content: [
      `<path d="M0,2 C3,1 7,3 14,1.5" fill="none" stroke="${S}" stroke-width="0.9" stroke-opacity="0.5"/>`,
      `<path d="M0,5 C4,4.5 8,6 14,5" fill="none" stroke="${S}" stroke-width="0.7" stroke-opacity="0.4"/>`,
      `<path d="M0,8 C5,7.5 10,9 14,8" fill="none" stroke="${SL}" stroke-width="0.6" stroke-opacity="0.35"/>`,
    ].join(""),
  },

  // ======== Sub-varianten plaatmateriaal ========

  // OSB — dichte horizontale + korte willekeurige streepjes
  {
    id: "hatch-board-osb",
    width: 14,
    height: 10,
    content: [
      `<line x1="0" y1="3" x2="6" y2="3" stroke="${S}" stroke-width="0.6" stroke-opacity="0.35"/>`,
      `<line x1="8" y1="3" x2="14" y2="3.5" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.3"/>`,
      `<line x1="2" y1="7" x2="9" y2="7" stroke="${S}" stroke-width="0.6" stroke-opacity="0.35"/>`,
      `<line x1="10" y1="7.5" x2="13" y2="7" stroke="${SL}" stroke-width="0.4" stroke-opacity="0.25"/>`,
      `<line x1="4" y1="1" x2="4" y2="5" stroke="${SLL}" stroke-width="0.4" stroke-opacity="0.2"/>`,
      `<line x1="11" y1="5" x2="11" y2="9" stroke="${SLL}" stroke-width="0.4" stroke-opacity="0.2"/>`,
    ].join(""),
  },

  // MDF — gladde horizontale lijnen
  {
    id: "hatch-board-mdf",
    width: 12,
    height: 8,
    content: [
      `<line x1="0" y1="2.5" x2="12" y2="2.5" stroke="${S}" stroke-width="0.5" stroke-opacity="0.3"/>`,
      `<line x1="0" y1="5.5" x2="12" y2="5.5" stroke="${SL}" stroke-width="0.4" stroke-opacity="0.25"/>`,
    ].join(""),
  },

  // Gipskarton — streepjes met puntjes
  {
    id: "hatch-board-gypsum",
    width: 10,
    height: 8,
    content: [
      `<line x1="0" y1="4" x2="10" y2="4" stroke="${SL}" stroke-width="0.5" stroke-opacity="0.3"/>`,
      `<circle cx="3" cy="2" r="0.4" fill="${SLL}" fill-opacity="0.3"/>`,
      `<circle cx="7" cy="6" r="0.4" fill="${SLL}" fill-opacity="0.3"/>`,
    ].join(""),
  },
];

// ---------- Build lookup ----------

const PATTERN_MAP = new Map<HatchPatternId, PatternDef>(
  PATTERN_DEFS.map((p) => [p.id, p]),
);

// ---------- Category → default pattern mapping ----------

/** Default hatch pattern per MaterialCategory. */
export const CATEGORY_PATTERN_MAP: Record<MaterialCategory, HatchPatternId> = {
  metselwerk: "hatch-masonry",
  beton: "hatch-concrete",
  isolatie_mineraal: "hatch-insulation-mineral",
  isolatie_kunststof: "hatch-insulation-plastic",
  isolatie_natuurlijk: "hatch-insulation-natural",
  hout: "hatch-wood",
  spouw: "hatch-cavity",
  folie: "hatch-foil",
  afwerking: "hatch-finish",
  plaatmateriaal: "hatch-board",
  mortel: "hatch-mortar",
  natuursteen: "hatch-natural-stone",
  vloer: "hatch-floor",
  metaal: "hatch-metal",
  kunststof: "hatch-plastic",
  glas: "hatch-glass",
  overig: "hatch-other",
};

// ---------- SVG String Export (for glaserSvg.ts) ----------

/** Genereer <defs> blok met alle hatch patterns als SVG string. */
export function generateHatchPatternDefs(): string {
  const patterns = PATTERN_DEFS.map((p) => {
    const attrs = p.attrs ? ` ${p.attrs}` : "";
    return `  <pattern id="${p.id}" width="${p.width}" height="${p.height}" patternUnits="userSpaceOnUse"${attrs}>${p.content}</pattern>`;
  }).join("\n");
  return `<defs>\n${patterns}\n</defs>`;
}

/**
 * Genereer een enkele <pattern> als SVG string.
 * Nuttig voor preview-blokken.
 */
export function getPatternSvgString(id: HatchPatternId): string | undefined {
  const p = PATTERN_MAP.get(id);
  if (!p) return undefined;
  const attrs = p.attrs ? ` ${p.attrs}` : "";
  return `<pattern id="${p.id}" width="${p.width}" height="${p.height}" patternUnits="userSpaceOnUse"${attrs}>${p.content}</pattern>`;
}

// ---------- React JSX Export (for GlaserDiagram.tsx) ----------

/**
 * Retourneer alle pattern-definities als raw data, zodat de React component
 * ze kan renderen via dangerouslySetInnerHTML (eenvoudigst en performant).
 */
export function getAllPatternDefs(): PatternDef[] {
  return PATTERN_DEFS;
}

/**
 * Resolve het effectieve pattern ID voor een materiaal.
 * Als het materiaal een specifiek hatchPattern heeft, gebruik dat.
 * Anders, fall back op de category default.
 */
export function resolvePatternId(
  category: MaterialCategory,
  hatchPattern?: string,
): HatchPatternId {
  if (hatchPattern && PATTERN_MAP.has(hatchPattern as HatchPatternId)) {
    return hatchPattern as HatchPatternId;
  }
  return CATEGORY_PATTERN_MAP[category];
}

/** Alle beschikbare pattern IDs met labels voor de UI. */
export const HATCH_PATTERN_OPTIONS: { id: HatchPatternId; label: string }[] = [
  { id: "hatch-masonry", label: "Metselwerk (diagonaal)" },
  { id: "hatch-concrete", label: "Beton (stippen)" },
  { id: "hatch-insulation-mineral", label: "Minerale wol (zigzag)" },
  { id: "hatch-insulation-plastic", label: "Kunststof isolatie (kruisjes)" },
  { id: "hatch-insulation-natural", label: "Natuurlijke isolatie (golf)" },
  { id: "hatch-insulation-glasswool", label: "Glaswol (zigzag wijd)" },
  { id: "hatch-insulation-rockwool", label: "Steenwol (zigzag dicht)" },
  { id: "hatch-insulation-pir", label: "PIR/PUR (kruisjes)" },
  { id: "hatch-insulation-eps", label: "EPS (cirkels)" },
  { id: "hatch-insulation-xps", label: "XPS (vierkanten)" },
  { id: "hatch-insulation-pur", label: "PUR (kruisjes klein)" },
  { id: "hatch-wood", label: "Hout (nerf)" },
  { id: "hatch-wood-softwood", label: "Naaldhout (lichte nerf)" },
  { id: "hatch-wood-hardwood", label: "Loofhout (dichte nerf)" },
  { id: "hatch-cavity", label: "Spouw (leeg)" },
  { id: "hatch-foil", label: "Folie (membraan)" },
  { id: "hatch-finish", label: "Afwerking (streepjes)" },
  { id: "hatch-board", label: "Plaatmateriaal (raster)" },
  { id: "hatch-board-osb", label: "OSB (strand)" },
  { id: "hatch-board-mdf", label: "MDF (glad)" },
  { id: "hatch-board-gypsum", label: "Gipskarton (stippen)" },
  { id: "hatch-mortar", label: "Mortel (licht diagonaal)" },
  { id: "hatch-natural-stone", label: "Natuursteen (streepjes)" },
  { id: "hatch-floor", label: "Vloer (stippen)" },
  { id: "hatch-metal", label: "Metaal (dicht diagonaal)" },
  { id: "hatch-plastic", label: "Kunststof (stippels)" },
  { id: "hatch-glass", label: "Glas (wijd diagonaal)" },
  { id: "hatch-other", label: "Overig (kruisarcering)" },
];
