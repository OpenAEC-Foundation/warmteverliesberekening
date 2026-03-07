import { useCallback, useState } from "react";

import {
  FloorCanvas,
  FloorCanvas3D,
  PropertiesPanel,
  EXAMPLE_ROOMS,
  EXAMPLE_WINDOWS,
  DEFAULT_SNAP_SETTINGS,
} from "../components/modeller";
import { Ribbon } from "../components/modeller/Ribbon";
import type { ModellerTool, SnapSettings, ViewMode } from "../components/modeller";
import { useToastStore } from "../store/toastStore";

export function Modeller() {
  const [tool, setTool] = useState<ModellerTool>("select");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [activeFloor, setActiveFloor] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [snap, setSnap] = useState<SnapSettings>(DEFAULT_SNAP_SETTINGS);
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

  const handleImportIfc = useCallback(() => {
    addToast("IFC import wordt binnenkort beschikbaar", "info");
  }, [addToast]);

  const handleExportIfc = useCallback(() => {
    addToast("IFC export wordt binnenkort beschikbaar", "info");
  }, [addToast]);

  const handleFitView = useCallback(() => {
    addToast("Zoom passend", "info");
  }, [addToast]);

  const handleUndo = useCallback(() => {
    addToast("Ongedaan maken", "info");
  }, [addToast]);

  const handleRedo = useCallback(() => {
    addToast("Opnieuw", "info");
  }, [addToast]);

  return (
    <div className="flex h-screen flex-col">
      <Ribbon
        tool={tool}
        viewMode={viewMode}
        activeFloor={activeFloor}
        snap={snap}
        onToolChange={setTool}
        onViewModeChange={setViewMode}
        onFloorChange={setActiveFloor}
        onSnapChange={setSnap}
        onFitView={handleFitView}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onImportDwg={handleImportDwg}
        onImportPdf={handleImportPdf}
        onImportIfc={handleImportIfc}
        onExportIfc={handleExportIfc}
      />

      <div className="flex min-h-0 flex-1">
        {/* Center: Canvas or 3D view */}
        {viewMode === "2d" ? (
          <div className="min-w-0 flex-1">
            <FloorCanvas
              rooms={rooms}
              windows={windows}
              selectedRoomId={selectedRoomId}
              hoveredRoomId={hoveredRoomId}
              tool={tool}
              snap={snap}
              onSelectRoom={setSelectedRoomId}
              onHoverRoom={setHoveredRoomId}
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <FloorCanvas3D
              rooms={rooms}
              windows={windows}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
            />
          </div>
        )}

        {/* Right: Properties panel */}
        <PropertiesPanel room={selectedRoom} rooms={rooms} windows={windows} />
      </div>
    </div>
  );
}
