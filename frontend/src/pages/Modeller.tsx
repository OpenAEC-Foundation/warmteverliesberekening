import { useCallback, useEffect, useState } from "react";

import {
  FloorCanvas,
  FloorCanvas3D,
  PropertiesPanel,
  DEFAULT_SNAP_SETTINGS,
} from "../components/modeller";
import { Ribbon } from "../components/modeller/Ribbon";
import { useModellerStore } from "../components/modeller/modellerStore";
import type { ModellerTool, Point2D, SnapSettings, ViewMode } from "../components/modeller";
import { useToastStore } from "../store/toastStore";

const ROOM_FUNCTIONS = [
  "living_room", "kitchen", "bedroom", "bathroom", "toilet",
  "hallway", "landing", "storage", "attic", "custom",
];

export function Modeller() {
  const [tool, setTool] = useState<ModellerTool>("select");
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [activeFloor, setActiveFloor] = useState(0);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [snap, setSnap] = useState<SnapSettings>(DEFAULT_SNAP_SETTINGS);
  const addToast = useToastStore((s) => s.addToast);

  // Store
  const rooms = useModellerStore((s) => s.rooms);
  const windows = useModellerStore((s) => s.windows);
  const underlay = useModellerStore((s) => s.underlay);
  const wallConstructions = useModellerStore((s) => s.wallConstructions);
  const floorConstructions = useModellerStore((s) => s.floorConstructions);
  const roofConstructions = useModellerStore((s) => s.roofConstructions);

  const addRoom = useModellerStore((s) => s.addRoom);
  const updateRoom = useModellerStore((s) => s.updateRoom);
  const removeRoom = useModellerStore((s) => s.removeRoom);
  const addWindow = useModellerStore((s) => s.addWindow);
  const setUnderlay = useModellerStore((s) => s.setUnderlay);
  const assignWallConstruction = useModellerStore((s) => s.assignWallConstruction);
  const assignFloorConstruction = useModellerStore((s) => s.assignFloorConstruction);
  const assignRoofConstruction = useModellerStore((s) => s.assignRoofConstruction);
  const undo = useModellerStore((s) => s.undo);
  const redo = useModellerStore((s) => s.redo);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  // Filter rooms by active floor
  const floorRooms = rooms.filter((r) => r.floor === activeFloor);
  const floorWindows = windows.filter((w) =>
    floorRooms.some((r) => r.id === w.roomId),
  );

  // --- Handlers ---

  const handleAddRoom = useCallback(
    (polygon: Point2D[]) => {
      const id = addRoom({
        name: "Nieuwe ruimte",
        function: ROOM_FUNCTIONS[Math.floor(Math.random() * 3)]!,
        polygon,
        floor: activeFloor,
        height: 2600,
      });
      setSelectedRoomId(id);
      setTool("select");
      addToast(`Ruimte ${id} aangemaakt`, "success");
    },
    [addRoom, activeFloor, addToast],
  );

  const handleAddWindow = useCallback(
    (roomId: string, wallIndex: number, offset: number, width: number) => {
      addWindow({ roomId, wallIndex, offset, width });
      addToast("Raam geplaatst", "success");
    },
    [addWindow, addToast],
  );

  const handleRemoveRoom = useCallback(
    (id: string) => {
      removeRoom(id);
      if (selectedRoomId === id) setSelectedRoomId(null);
      addToast("Ruimte verwijderd", "info");
    },
    [removeRoom, selectedRoomId, addToast],
  );

  const handleImportPdf = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      // For images, read directly. For PDF, we'd need pdf.js but for now just support images.
      if (!file.type.startsWith("image/")) {
        addToast("Momenteel alleen afbeeldingen ondersteund als onderlegger (PNG, JPG)", "info");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Get image dimensions
        const img = new Image();
        img.onload = () => {
          // Scale to fit: assume 1 pixel = 10mm (user can rescale)
          const scale = 10;
          setUnderlay({
            dataUrl,
            fileName: file.name,
            x: 0,
            y: 0,
            width: img.width * scale,
            height: img.height * scale,
            opacity: 0.3,
            rotation: 0,
            locked: false,
          });
          addToast(`Onderlegger "${file.name}" geladen`, "success");
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [setUnderlay, addToast]);

  const handleImportDwg = useCallback(() => {
    addToast("DWG import wordt binnenkort beschikbaar. Gebruik een afbeelding (PNG/JPG) als onderlegger.", "info");
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
    undo();
  }, [undo]);

  const handleRedo = useCallback(() => {
    redo();
  }, [redo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); return; }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "Delete" && selectedRoomId) {
        handleRemoveRoom(selectedRoomId);
        return;
      }

      const keyMap: Record<string, ModellerTool> = {
        v: "select",
        h: "pan",
        r: "draw_rect",
        p: "draw_polygon",
        c: "draw_circle",
        w: "draw_wall",
        n: "draw_window",
        m: "measure",
      };
      const mapped = keyMap[e.key.toLowerCase()];
      if (mapped) setTool(mapped);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedRoomId, handleRemoveRoom]);

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
              rooms={floorRooms}
              windows={floorWindows}
              selectedRoomId={selectedRoomId}
              hoveredRoomId={hoveredRoomId}
              tool={tool}
              snap={snap}
              underlay={underlay}
              onSelectRoom={setSelectedRoomId}
              onHoverRoom={setHoveredRoomId}
              onAddRoom={handleAddRoom}
              onAddWindow={handleAddWindow}
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <FloorCanvas3D
              rooms={floorRooms}
              windows={floorWindows}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
            />
          </div>
        )}

        {/* Right: Properties panel */}
        <PropertiesPanel
          room={selectedRoom}
          rooms={floorRooms}
          windows={floorWindows}
          onUpdateRoom={updateRoom}
          onRemoveRoom={handleRemoveRoom}
          wallConstructions={wallConstructions}
          floorConstructions={floorConstructions}
          roofConstructions={roofConstructions}
          onAssignWall={assignWallConstruction}
          onAssignFloor={assignFloorConstruction}
          onAssignRoof={assignRoofConstruction}
        />
      </div>
    </div>
  );
}
