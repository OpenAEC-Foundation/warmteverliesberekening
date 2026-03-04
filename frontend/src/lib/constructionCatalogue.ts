import type { BoundaryType, MaterialType, VerticalPosition } from "../types";

export interface CatalogueEntry {
  id: string;
  name: string;
  category: CatalogueCategory;
  uValue: number;
  materialType: MaterialType;
  verticalPosition: VerticalPosition;
  boundaryType: BoundaryType;
}

export type CatalogueCategory =
  | "wanden"
  | "vloeren_plafonds"
  | "daken"
  | "kozijnen_vullingen";

export const CATALOGUE_CATEGORY_LABELS: Record<CatalogueCategory, string> = {
  wanden: "Wanden",
  vloeren_plafonds: "Vloeren / plafonds",
  daken: "Daken",
  kozijnen_vullingen: "Kozijnen / vullingen",
};

export const CONSTRUCTION_CATALOGUE: CatalogueEntry[] = [
  // -- Wanden --
  {
    id: "buitenwand-metselwerk",
    name: "Buitenwand (metselwerk)",
    category: "wanden",
    uValue: 0.36,
    materialType: "masonry",
    verticalPosition: "wall",
    boundaryType: "exterior",
  },
  {
    id: "binnenwand-licht",
    name: "Binnenwand (licht)",
    category: "wanden",
    uValue: 2.17,
    materialType: "non_masonry",
    verticalPosition: "wall",
    boundaryType: "adjacent_room",
  },
  {
    id: "woningscheidende-wand",
    name: "Woningscheidende wand",
    category: "wanden",
    uValue: 2.08,
    materialType: "masonry",
    verticalPosition: "wall",
    boundaryType: "adjacent_building",
  },
  {
    id: "buitenwand-houtskelet",
    name: "Buitenwand (houtskelet)",
    category: "wanden",
    uValue: 0.28,
    materialType: "non_masonry",
    verticalPosition: "wall",
    boundaryType: "exterior",
  },
  // -- Vloeren / plafonds --
  {
    id: "betonvloer-ongeisoleerd",
    name: "Betonvloer (onge\u00EFsoleerd)",
    category: "vloeren_plafonds",
    uValue: 2.5,
    materialType: "masonry",
    verticalPosition: "floor",
    boundaryType: "unheated_space",
  },
  {
    id: "betonvloer-geisoleerd",
    name: "Betonvloer (ge\u00EFsoleerd)",
    category: "vloeren_plafonds",
    uValue: 0.35,
    materialType: "masonry",
    verticalPosition: "floor",
    boundaryType: "exterior",
  },
  {
    id: "begane-grondvloer",
    name: "Begane grondvloer",
    category: "vloeren_plafonds",
    uValue: 0.29,
    materialType: "masonry",
    verticalPosition: "floor",
    boundaryType: "ground",
  },
  // -- Daken --
  {
    id: "plat-dak-geisoleerd",
    name: "Plat dak (ge\u00EFsoleerd)",
    category: "daken",
    uValue: 0.22,
    materialType: "masonry",
    verticalPosition: "ceiling",
    boundaryType: "exterior",
  },
  {
    id: "plat-dak-ongeisoleerd",
    name: "Plat dak (onge\u00EFsoleerd)",
    category: "daken",
    uValue: 3.5,
    materialType: "masonry",
    verticalPosition: "ceiling",
    boundaryType: "exterior",
  },
  {
    id: "hellend-dak-geisoleerd",
    name: "Hellend dak (ge\u00EFsoleerd)",
    category: "daken",
    uValue: 0.25,
    materialType: "non_masonry",
    verticalPosition: "ceiling",
    boundaryType: "exterior",
  },
  {
    id: "hellend-dak-ongeisoleerd",
    name: "Hellend dak (onge\u00EFsoleerd)",
    category: "daken",
    uValue: 3.0,
    materialType: "non_masonry",
    verticalPosition: "ceiling",
    boundaryType: "exterior",
  },
  // -- Kozijnen / vullingen --
  {
    id: "enkel-glas",
    name: "Enkel glas",
    category: "kozijnen_vullingen",
    uValue: 5.8,
    materialType: "non_masonry",
    verticalPosition: "wall",
    boundaryType: "exterior",
  },
  {
    id: "dubbel-glas-hr",
    name: "Dubbel glas HR++",
    category: "kozijnen_vullingen",
    uValue: 1.1,
    materialType: "non_masonry",
    verticalPosition: "wall",
    boundaryType: "exterior",
  },
  {
    id: "triple-glas",
    name: "Triple glas",
    category: "kozijnen_vullingen",
    uValue: 0.7,
    materialType: "non_masonry",
    verticalPosition: "wall",
    boundaryType: "exterior",
  },
  {
    id: "buitendeur-hout",
    name: "Buitendeur (hout)",
    category: "kozijnen_vullingen",
    uValue: 2.78,
    materialType: "non_masonry",
    verticalPosition: "wall",
    boundaryType: "exterior",
  },
  {
    id: "buitendeur-geisoleerd",
    name: "Buitendeur (ge\u00EFsoleerd)",
    category: "kozijnen_vullingen",
    uValue: 1.5,
    materialType: "non_masonry",
    verticalPosition: "wall",
    boundaryType: "exterior",
  },
];

/** Group catalogue entries by category. */
export function getCatalogueByCategory(): Map<CatalogueCategory, CatalogueEntry[]> {
  const map = new Map<CatalogueCategory, CatalogueEntry[]>();
  for (const entry of CONSTRUCTION_CATALOGUE) {
    const list = map.get(entry.category) ?? [];
    list.push(entry);
    map.set(entry.category, list);
  }
  return map;
}
