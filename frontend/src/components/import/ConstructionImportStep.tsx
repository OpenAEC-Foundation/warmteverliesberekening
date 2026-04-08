/**
 * Step 3 — Construction review.
 *
 * Shows all constructions with room_a -> room_b, orientation, area, layer count.
 * Selecting a construction shows inline layer details with material matching.
 * Displays Rc/U-value if layers are available. Warns if no layers.
 */
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Layers } from "lucide-react";

import type {
  ThermalConstruction,
  ThermalRoom,
  ThermalImportConstructionReview,
} from "../../lib/thermalImport";
import { searchMaterials } from "../../lib/materialsDatabase";

interface ConstructionImportStepProps {
  constructions: ThermalConstruction[];
  rooms: ThermalRoom[];
  constructionLayers: ThermalImportConstructionReview[];
}

/** Get room name by ID. */
function getRoomName(rooms: ThermalRoom[], id: string): string {
  const room = rooms.find((r) => r.id === id);
  return room?.name ?? id;
}

/** Display label for orientation. */
function orientationLabel(o: string): string {
  const labels: Record<string, string> = {
    wall: "Wand",
    floor: "Vloer",
    ceiling: "Plafond",
    roof: "Dak",
  };
  return labels[o] ?? o;
}

export function ConstructionImportStep({
  constructions,
  rooms,
  constructionLayers,
}: ConstructionImportStepProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Map construction_id -> review data
  const reviewMap = useMemo(() => {
    const map = new Map<string, ThermalImportConstructionReview>();
    for (const cl of constructionLayers) {
      map.set(cl.construction_id, cl);
    }
    return map;
  }, [constructionLayers]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const withoutLayers = constructions.filter(
    (c) => !c.layers || c.layers.length === 0,
  );

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold text-gray-100">
        Constructies controleren
      </h2>
      <p className="mb-6 text-sm text-gray-400">
        Controleer de constructie-opbouwen. Klik op een constructie om de lagen
        te bekijken. Materialen worden automatisch gematcht aan de
        materialendatabase.
      </p>

      {/* Warning for constructions without layers */}
      {withoutLayers.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <div>
            <p className="text-sm text-amber-300">
              {withoutLayers.length} constructie(s) zonder laag-opbouw
            </p>
            <p className="mt-0.5 text-xs text-amber-400/70">
              Deze constructies hebben geen materiaallagen uit Revit. De
              U-waarde moet handmatig worden ingevoerd na import.
            </p>
          </div>
        </div>
      )}

      {/* Construction list */}
      <div className="space-y-1">
        {constructions.map((c) => {
          const isExpanded = expandedId === c.id;
          const review = reviewMap.get(c.id);
          const hasLayers = c.layers && c.layers.length > 0;

          return (
            <div
              key={c.id}
              className="rounded-lg border border-gray-700 bg-gray-800/50"
            >
              {/* Construction header */}
              <button
                onClick={() => handleToggle(c.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-500" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">
                      {c.revit_type_name ?? c.id}
                    </span>
                    {!hasLayers && (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                    <span>
                      {getRoomName(rooms, c.room_a)} &rarr;{" "}
                      {getRoomName(rooms, c.room_b)}
                    </span>
                    <span>{orientationLabel(c.orientation)}</span>
                    {c.compass && <span>{c.compass}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <span className="tabular-nums text-gray-400">
                    {c.gross_area_m2.toFixed(1)} m2
                  </span>
                  <span className="flex items-center gap-1 text-gray-500">
                    <Layers className="h-3 w-3" />
                    {hasLayers ? c.layers!.length : 0}
                  </span>
                  {review && review.u_value != null && (
                    <span className="rounded bg-gray-700 px-1.5 py-0.5 tabular-nums text-gray-300">
                      U={review.u_value.toFixed(3)}
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded: layer detail */}
              {isExpanded && (
                <div className="border-t border-gray-700 px-4 py-3">
                  {hasLayers ? (
                    <ConstructionLayerTable
                      layers={c.layers!}
                      review={review}
                    />
                  ) : (
                    <p className="text-xs italic text-gray-500">
                      Geen laag-opbouw beschikbaar uit Revit.
                    </p>
                  )}

                  {/* Rc/U summary */}
                  {review && review.rc != null && review.u_value != null && (
                    <div className="mt-3 flex items-center gap-4 border-t border-gray-700/50 pt-2 text-xs text-gray-400">
                      <span>
                        Rc ={" "}
                        <strong className="text-gray-200">
                          {review.rc.toFixed(2)}
                        </strong>{" "}
                        m2K/W
                      </span>
                      <span>
                        U ={" "}
                        <strong className="text-gray-200">
                          {review.u_value.toFixed(3)}
                        </strong>{" "}
                        W/m2K
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="mt-4 text-xs text-gray-500">
        {constructions.length} constructies totaal &middot;{" "}
        {constructions.length - withoutLayers.length} met laag-opbouw
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: layer table for an expanded construction
// ---------------------------------------------------------------------------

interface ConstructionLayerTableProps {
  layers: NonNullable<ThermalConstruction["layers"]>;
  review?: ThermalImportConstructionReview;
}

function ConstructionLayerTable({
  layers,
  review,
}: ConstructionLayerTableProps) {
  // Build review layer map by index
  const reviewLayers = review?.layers ?? [];

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-700/50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          <th className="pb-1.5 pr-3">Materiaal (Revit)</th>
          <th className="pb-1.5 pr-3">Match</th>
          <th className="pb-1.5 pr-3 text-right">Dikte [mm]</th>
          <th className="pb-1.5 text-right">Lambda [W/mK]</th>
        </tr>
      </thead>
      <tbody>
        {layers.map((layer, i) => {
          const rl = reviewLayers[i];
          const matchedName = rl?.matched_material_id
            ? findMaterialDisplayName(rl.matched_material_id)
            : null;

          return (
            <tr
              key={i}
              className="border-b border-gray-700/30"
            >
              <td className="py-1.5 pr-3 text-gray-300">
                {layer.material}
                {layer.type === "air_gap" && (
                  <span className="ml-1.5 text-[10px] text-gray-500">
                    (spouw)
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-3">
                {matchedName ? (
                  <span className="text-[#45B6A8]">{matchedName}</span>
                ) : (
                  <span className="italic text-gray-600">geen match</span>
                )}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-gray-400">
                {layer.thickness_mm.toFixed(1)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-400">
                {layer.lambda != null ? layer.lambda.toFixed(3) : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Try to find a material display name from the database by ID. */
function findMaterialDisplayName(materialId: string): string | null {
  // Search for the exact material by id or keyword match
  const results = searchMaterials(materialId);
  if (results.length > 0 && results[0] != null) {
    return results[0].name;
  }
  return materialId;
}
