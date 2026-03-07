import type { ViewMode } from "./types";
import { FLOOR_LABELS } from "./exampleData";

interface ModellerToolbarProps {
  viewMode: ViewMode;
  activeFloor: number;
  onViewModeChange: (mode: ViewMode) => void;
  onFloorChange: (floor: number) => void;
  onFitView: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function ModellerToolbar({
  viewMode,
  activeFloor,
  onViewModeChange,
  onFloorChange,
  onFitView,
  onUndo,
  onRedo,
}: ModellerToolbarProps) {
  return (
    <div className="flex h-10 items-center gap-1 border-b border-stone-200 bg-white px-2">
      {/* 2D / 3D toggle */}
      <div className="flex overflow-hidden rounded border border-stone-200">
        <button
          onClick={() => onViewModeChange("2d")}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            viewMode === "2d"
              ? "bg-stone-800 text-white"
              : "text-stone-500 hover:bg-stone-100"
          }`}
        >
          2D
        </button>
        <button
          onClick={() => onViewModeChange("3d")}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            viewMode === "3d"
              ? "bg-stone-800 text-white"
              : "text-stone-500 hover:bg-stone-100"
          }`}
        >
          3D
        </button>
      </div>

      <div className="mx-1.5 h-5 w-px bg-stone-200" />

      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        title="Ongedaan maken (Ctrl+Z)"
        className="rounded px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
      >
        &#x21B6;
      </button>
      <button
        onClick={onRedo}
        title="Opnieuw (Ctrl+Y)"
        className="rounded px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
      >
        &#x21B7;
      </button>

      <div className="mx-1.5 h-5 w-px bg-stone-200" />

      {/* Floor selector */}
      <span className="text-xs text-stone-400">Verdieping:</span>
      <select
        value={activeFloor}
        onChange={(e) => onFloorChange(Number(e.target.value))}
        className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-xs"
      >
        {FLOOR_LABELS.map((label, i) => (
          <option key={i} value={i}>{label}</option>
        ))}
      </select>

      <div className="flex-1" />

      {/* Fit view */}
      <button
        onClick={onFitView}
        title="Passend (F)"
        className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700"
      >
        Passend
      </button>
    </div>
  );
}
