/**
 * Step 3 — Construction review with LayerEditor integration.
 *
 * Shows all constructions with room_a -> room_b, orientation, area, layer count.
 * Users can open the LayerEditor to match materials, adjust thicknesses,
 * and calculate Rc/U-values per construction.
 */
import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
  Pencil,
  Check,
} from "lucide-react";

import type {
  ThermalConstruction,
  ThermalConstructionLayer,
  ThermalRoom,
  ThermalImportConstructionReview,
} from "../../lib/thermalImport";
import { searchMaterials } from "../../lib/materialsDatabase";
import type { ConstructionElementLayer, VerticalPosition } from "../../types";
import { LayerEditor } from "../construction/LayerEditor";

interface ConstructionImportStepProps {
  constructions: ThermalConstruction[];
  rooms: ThermalRoom[];
  constructionLayers: ThermalImportConstructionReview[];
  /** Called when user applies LayerEditor results for a construction. */
  onConstructionUValue?: (constructionId: string, uValue: number) => void;
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

/** Map orientation to VerticalPosition for Rc calculation. */
function orientationToPosition(o: string): VerticalPosition {
  if (o === "floor") return "floor";
  if (o === "ceiling" || o === "roof") return "ceiling";
  return "wall";
}

/**
 * Convert Revit thermal layers to ConstructionElementLayer format
 * that the LayerEditor understands. Auto-matches materials from the database.
 */
function thermalLayersToEditorLayers(
  layers: ThermalConstructionLayer[],
): ConstructionElementLayer[] {
  return layers.map((tl) => {
    // Try to match the Revit material name to a known material in the database
    let materialId = "";

    if (tl.type === "air_gap") {
      // Air gap layers get the special "luchtspouw" material
      const airMatches = searchMaterials("luchtspouw");
      materialId = airMatches.length > 0 ? airMatches[0]!.id : "";
    } else {
      // Try matching by Revit material name
      const matches = searchMaterials(tl.material);
      if (matches.length > 0 && matches[0] != null) {
        materialId = matches[0].id;
      }
    }

    return {
      materialId,
      thickness: tl.thickness_mm,
    };
  });
}

export function ConstructionImportStep({
  constructions,
  rooms,
  constructionLayers,
  onConstructionUValue,
}: ConstructionImportStepProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Track which construction is being edited in LayerEditor
  const [editingId, setEditingId] = useState<string | null>(null);

  // Store calculated U-values per construction (from LayerEditor)
  const [calculatedUValues, setCalculatedUValues] = useState<
    Map<string, number>
  >(new Map());

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

  // Open LayerEditor for a construction
  const handleEdit = useCallback(
    (construction: ThermalConstruction) => {
      setEditingId(construction.id);
    },
    [],
  );

  // LayerEditor apply: save U-value
  const handleLayerApply = useCallback(
    (_layers: ConstructionElementLayer[], uValue: number) => {
      if (editingId) {
        setCalculatedUValues((prev) => {
          const next = new Map(prev);
          next.set(editingId, uValue);
          return next;
        });
        onConstructionUValue?.(editingId, uValue);
      }
      setEditingId(null);
    },
    [editingId, onConstructionUValue],
  );

  const handleLayerClose = useCallback(() => {
    setEditingId(null);
  }, []);

  const withoutLayers = constructions.filter(
    (c) => !c.layers || c.layers.length === 0,
  );

  // Find the construction being edited (for LayerEditor)
  const editingConstruction = editingId
    ? constructions.find((c) => c.id === editingId)
    : null;
  const editingLayers = editingConstruction?.layers
    ? thermalLayersToEditorLayers(editingConstruction.layers)
    : [];
  const editingPosition = editingConstruction
    ? orientationToPosition(editingConstruction.orientation)
    : ("wall" as VerticalPosition);

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold text-gray-100">
        Constructies controleren
      </h2>
      <p className="mb-6 text-sm text-gray-400">
        Controleer de constructie-opbouwen. Klik op{" "}
        <Pencil className="inline h-3 w-3" /> om de lagen te bewerken,
        materialen te matchen en de Rc/U-waarde te berekenen.
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
          const calculatedU = calculatedUValues.get(c.id);
          const hasCalculatedU = calculatedU != null && calculatedU > 0;

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
                    {hasCalculatedU && (
                      <Check className="h-3.5 w-3.5 text-green-400" />
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
                    {c.gross_area_m2.toFixed(1)} m²
                  </span>
                  <span className="flex items-center gap-1 text-gray-500">
                    <Layers className="h-3 w-3" />
                    {hasLayers ? c.layers!.length : 0}
                  </span>
                  {hasCalculatedU ? (
                    <span className="rounded bg-green-900/50 px-1.5 py-0.5 tabular-nums text-green-300">
                      U={calculatedU.toFixed(3)}
                    </span>
                  ) : review?.u_value != null ? (
                    <span className="rounded bg-gray-700 px-1.5 py-0.5 tabular-nums text-gray-300">
                      U={review.u_value.toFixed(3)}
                    </span>
                  ) : null}
                </div>
              </button>

              {/* Expanded: layer detail + edit button */}
              {isExpanded && (
                <div className="border-t border-gray-700 px-4 py-3">
                  {hasLayers ? (
                    <>
                      <ConstructionLayerTable layers={c.layers!} />

                      {/* Edit button */}
                      <div className="mt-3 flex items-center justify-between border-t border-gray-700/50 pt-3">
                        <div className="text-xs text-gray-500">
                          {hasCalculatedU ? (
                            <span className="text-green-400">
                              U = {calculatedU.toFixed(3)} W/m²K (berekend)
                            </span>
                          ) : (
                            <span>
                              U-waarde nog niet berekend
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(c);
                          }}
                          className="flex items-center gap-1.5 rounded bg-[#45B6A8] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#3da396]"
                        >
                          <Pencil className="h-3 w-3" />
                          Bewerken in Rc-calculator
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs italic text-gray-500">
                      Geen laag-opbouw beschikbaar uit Revit. Voeg na import
                      handmatig een constructie toe.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <span>
          {constructions.length} constructies totaal &middot;{" "}
          {constructions.length - withoutLayers.length} met laag-opbouw
        </span>
        {calculatedUValues.size > 0 && (
          <span className="text-green-400">
            {calculatedUValues.size} berekend
          </span>
        )}
      </div>

      {/* LayerEditor modal */}
      {editingId && editingConstruction && (
        <LayerEditor
          layers={editingLayers}
          position={editingPosition}
          onApply={handleLayerApply}
          onClose={handleLayerClose}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: read-only layer table for preview
// ---------------------------------------------------------------------------

interface ConstructionLayerTableProps {
  layers: NonNullable<ThermalConstruction["layers"]>;
}

function ConstructionLayerTable({ layers }: ConstructionLayerTableProps) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-700/50 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          <th className="pb-1.5 pr-3">Materiaal (Revit)</th>
          <th className="pb-1.5 pr-3">Database match</th>
          <th className="pb-1.5 pr-3 text-right">Dikte [mm]</th>
          <th className="pb-1.5 text-right">Lambda [W/mK]</th>
        </tr>
      </thead>
      <tbody>
        {layers.map((layer, i) => {
          const matches = layer.type === "air_gap"
            ? searchMaterials("luchtspouw")
            : searchMaterials(layer.material);
          const matchName = matches.length > 0 ? matches[0]!.name : null;

          return (
            <tr key={i} className="border-b border-gray-700/30">
              <td className="py-1.5 pr-3 text-gray-300">
                {layer.material}
                {layer.type === "air_gap" && (
                  <span className="ml-1.5 text-[10px] text-gray-500">
                    (spouw)
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-3">
                {matchName ? (
                  <span className="text-[#45B6A8]">{matchName}</span>
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
