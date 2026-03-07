import { useCallback, useState } from "react";

import { FloorCanvas } from "../components/modeller/FloorCanvas";
import { ModellerToolbar } from "../components/modeller/ModellerToolbar";
import { PropertiesPanel } from "../components/modeller/PropertiesPanel";
import { EXAMPLE_ROOMS, EXAMPLE_WINDOWS } from "../components/modeller/exampleData";
import type { ModellerTool, ViewMode } from "../components/modeller/types";
import { useToastStore } from "../store/toastStore";

export function Modeller() {
  const [tool, setTool] = useState<ModellerTool>("select");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [activeFloor, setActiveFloor] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const rooms = EXAMPLE_ROOMS;
  const windows = EXAMPLE_WINDOWS;
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  const handleImportDwg = useCallback(() => {
    addToast("DWG import wordt binnenkort beschikbaar", "info");
  }, [addToast]);

  const handleImportPdf = useCallback(() => {
    addToast("PDF import wordt binnenkort beschikbaar", "info");
  }, [addToast]);

  const handleFitView = useCallback(() => {
    addToast("Zoom passend", "info");
  }, [addToast]);

  return (
    <div className="flex h-screen flex-col">
      <ModellerToolbar
        tool={tool}
        viewMode={viewMode}
        activeFloor={activeFloor}
        onToolChange={setTool}
        onViewModeChange={setViewMode}
        onFloorChange={setActiveFloor}
        onImportDwg={handleImportDwg}
        onImportPdf={handleImportPdf}
        onFitView={handleFitView}
      />

      <div className="flex min-h-0 flex-1">
        {viewMode === "2d" ? (
          <div className="min-w-0 flex-1">
            <FloorCanvas
              rooms={rooms}
              windows={windows}
              selectedRoomId={selectedRoomId}
              hoveredRoomId={hoveredRoomId}
              tool={tool}
              onSelectRoom={setSelectedRoomId}
              onHoverRoom={setHoveredRoomId}
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-center bg-stone-50">
            <div className="text-center">
              <p className="text-lg font-medium text-stone-400">3D weergave</p>
              <p className="mt-1 text-sm text-stone-400">
                Wordt binnenkort toegevoegd (Three.js)
              </p>
            </div>
          </div>
        )}

        <PropertiesPanel room={selectedRoom} rooms={rooms} windows={windows} />
      </div>
    </div>
  );
}
