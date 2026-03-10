/**
 * Project construction library panel — shows all constructions used in
 * the current project, grouped by category.  Includes both catalogue
 * entries and per-project (custom) constructions.
 */
import { useMemo, useState } from "react";

import { useModellerStore } from "./modellerStore";
import { useAllConstructions } from "../../hooks/useAllConstructions";
import {
  CATALOGUE_CATEGORY_LABELS,
  type CatalogueCategory,
  type CatalogueEntry,
} from "../../lib/constructionCatalogue";

const CATEGORY_ORDER: CatalogueCategory[] = [
  "wanden",
  "vloeren_plafonds",
  "daken",
  "kozijnen_vullingen",
];

interface UsedConstruction {
  entry: CatalogueEntry & { isProjectEntry?: boolean };
  /** Number of assignments (walls/floors/roofs) using this construction. */
  assignmentCount: number;
  /** Which surface types use this construction. */
  usedAs: ("wand" | "vloer" | "dak")[];
}

export function ProjectLibraryPanel() {
  const wallConstructions = useModellerStore((s) => s.wallConstructions);
  const floorConstructions = useModellerStore((s) => s.floorConstructions);
  const roofConstructions = useModellerStore((s) => s.roofConstructions);
  const removeProjectConstruction = useModellerStore(
    (s) => s.removeProjectConstruction,
  );
  const allConstructions = useAllConstructions();

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Collect all assigned construction IDs with counts and surface types
  const usedConstructions = useMemo(() => {
    const counts = new Map<string, { count: number; types: Set<string> }>();

    const addIds = (
      rec: Record<string, string>,
      surfaceType: "wand" | "vloer" | "dak",
    ) => {
      for (const id of Object.values(rec)) {
        const existing = counts.get(id) ?? { count: 0, types: new Set() };
        existing.count++;
        existing.types.add(surfaceType);
        counts.set(id, existing);
      }
    };

    addIds(wallConstructions, "wand");
    addIds(floorConstructions, "vloer");
    addIds(roofConstructions, "dak");

    // Resolve to full entries
    const result: UsedConstruction[] = [];
    for (const [id, { count, types }] of counts) {
      const entry = allConstructions.find((e) => e.id === id);
      if (entry) {
        result.push({
          entry,
          assignmentCount: count,
          usedAs: [...types] as ("wand" | "vloer" | "dak")[],
        });
      }
    }

    return result;
  }, [wallConstructions, floorConstructions, roofConstructions, allConstructions]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<CatalogueCategory, UsedConstruction[]>();
    for (const uc of usedConstructions) {
      const cat = uc.entry.category;
      const list = map.get(cat) ?? [];
      list.push(uc);
      map.set(cat, list);
    }
    return map;
  }, [usedConstructions]);

  const totalUsed = usedConstructions.length;

  if (totalUsed === 0) {
    return (
      <div className="px-3 py-3">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Projectbibliotheek
        </h3>
        <p className="text-[10px] text-stone-400">
          Nog geen constructies toegewezen. Selecteer een wand, vloer of dak in
          het project-tab en kies een constructie.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        Projectbibliotheek ({totalUsed})
      </h3>

      {CATEGORY_ORDER.map((cat) => {
        const entries = grouped.get(cat);
        if (!entries?.length) return null;

        return (
          <div key={cat} className="mb-3">
            <div className="mb-1 text-[10px] font-medium text-stone-400">
              {CATALOGUE_CATEGORY_LABELS[cat]}
            </div>
            <div className="space-y-1">
              {entries.map(({ entry, assignmentCount, usedAs }) => {
                const isProject = !!(entry as { isProjectEntry?: boolean })
                  .isProjectEntry;

                return (
                  <div
                    key={entry.id}
                    className="rounded border border-stone-100 px-2 py-1.5"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isProject && (
                            <span className="shrink-0 rounded bg-teal-50 px-1 py-0.5 text-[9px] font-medium text-teal-700">
                              Project
                            </span>
                          )}
                          <span className="truncate text-[10px] font-medium text-stone-700">
                            {entry.name}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-stone-500">
                          <span>
                            U = {entry.uValue} W/(m{"\u00B2"}{"\u00B7"}K)
                          </span>
                          <span className="text-stone-300">{"\u2022"}</span>
                          <span>
                            {assignmentCount}x ({usedAs.join(", ")})
                          </span>
                        </div>
                      </div>
                      {isProject && (
                        <div className="flex shrink-0 gap-0.5">
                          {confirmDelete === entry.id ? (
                            <>
                              <button
                                onClick={() => {
                                  removeProjectConstruction(entry.id);
                                  setConfirmDelete(null);
                                }}
                                className="rounded px-1 py-0.5 text-[9px] text-red-600 hover:bg-red-50"
                              >
                                Bevestig
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="rounded px-1 py-0.5 text-[9px] text-stone-400 hover:bg-stone-50"
                              >
                                Annuleer
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(entry.id)}
                              className="rounded p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
                              title="Verwijderen"
                            >
                              <svg
                                className="h-3 w-3"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
