import { create } from "zustand";

import type {
  ModellerTool,
  ViewMode,
  SnapSettings,
  SnapMode,
} from "../components/modeller/types";
import { DEFAULT_SNAP_SETTINGS } from "../components/modeller/types";

interface ModellerToolStore {
  tool: ModellerTool;
  viewMode: ViewMode;
  activeFloor: number;
  snap: SnapSettings;

  setTool: (tool: ModellerTool) => void;
  setViewMode: (mode: ViewMode) => void;
  setActiveFloor: (floor: number) => void;
  setSnap: (snap: SnapSettings) => void;
  toggleSnapMode: (mode: SnapMode) => void;
  toggleSnapEnabled: () => void;
}

export const useModellerToolStore = create<ModellerToolStore>()((set) => ({
  tool: "select",
  viewMode: "2d",
  activeFloor: 0,
  snap: DEFAULT_SNAP_SETTINGS,

  setTool: (tool) => set({ tool }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveFloor: (floor) => set({ activeFloor: floor }),
  setSnap: (snap) => set({ snap }),

  toggleSnapMode: (mode) =>
    set((state) => {
      const modes = state.snap.modes.includes(mode)
        ? state.snap.modes.filter((m) => m !== mode)
        : [...state.snap.modes, mode];
      return { snap: { ...state.snap, modes } };
    }),

  toggleSnapEnabled: () =>
    set((state) => ({
      snap: { ...state.snap, enabled: !state.snap.enabled },
    })),
}));
