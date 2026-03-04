import { create } from "zustand";

import {
  CONSTRUCTION_CATALOGUE,
  type CatalogueCategory,
  type CatalogueEntry,
} from "../lib/constructionCatalogue";

interface CatalogueStore {
  /** All catalogue entries (built-in + custom). */
  entries: CatalogueEntry[];

  /** Add a custom entry to the catalogue. */
  addEntry: (entry: Omit<CatalogueEntry, "id">) => void;
  /** Update an existing entry. */
  updateEntry: (id: string, partial: Partial<CatalogueEntry>) => void;
  /** Remove an entry by id. */
  removeEntry: (id: string) => void;
  /** Duplicate an existing entry. */
  duplicateEntry: (id: string) => void;

  /** Get entries grouped by category. */
  byCategory: () => Map<CatalogueCategory, CatalogueEntry[]>;
}

export const useCatalogueStore = create<CatalogueStore>((set, get) => ({
  entries: [...CONSTRUCTION_CATALOGUE],

  addEntry: (entry) =>
    set((state) => ({
      entries: [
        ...state.entries,
        { ...entry, id: crypto.randomUUID() },
      ],
    })),

  updateEntry: (id, partial) =>
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, ...partial } : e,
      ),
    })),

  removeEntry: (id) =>
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
    })),

  duplicateEntry: (id) =>
    set((state) => {
      const source = state.entries.find((e) => e.id === id);
      if (!source) return state;
      return {
        entries: [
          ...state.entries,
          { ...source, id: crypto.randomUUID(), name: `${source.name} (kopie)` },
        ],
      };
    }),

  byCategory: () => {
    const map = new Map<CatalogueCategory, CatalogueEntry[]>();
    for (const entry of get().entries) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  },
}));
