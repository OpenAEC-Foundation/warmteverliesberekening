import type { RoomFunction } from "../../types";

export interface Point2D {
  x: number;
  y: number;
}

export interface ModelRoom {
  id: string;
  name: string;
  function: RoomFunction;
  polygon: Point2D[];
  floor: number;
  /** Room height in mm. */
  height: number;
}

export interface ModelWindow {
  roomId: string;
  /** Edge index of the room polygon (0 = first edge). */
  wallIndex: number;
  /** Offset from wall start to window center, in mm. */
  offset: number;
  /** Window width in mm. */
  width: number;
}

export type ModellerTool = "select" | "draw_room" | "draw_wall" | "measure" | "pan";

export type ViewMode = "2d" | "3d";
