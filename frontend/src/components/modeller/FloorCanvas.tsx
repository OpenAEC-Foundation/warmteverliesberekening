import { useCallback, useEffect, useRef, useState } from "react";

import type { ModelRoom, ModelWindow, ModellerTool, Point2D, SnapSettings } from "./types";
import { pointInPolygon, polygonArea, polygonCenter } from "./geometry";

interface FloorCanvasProps {
  rooms: ModelRoom[];
  windows: ModelWindow[];
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  tool: ModellerTool;
  snap: SnapSettings;
  onSelectRoom: (id: string | null) => void;
  onHoverRoom: (id: string | null) => void;
}

const WALL_THICKNESS_MM = 200;

export function FloorCanvas({
  rooms,
  windows,
  selectedRoomId,
  hoveredRoomId,
  tool,
  snap,
  onSelectRoom,
  onHoverRoom,
}: FloorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [viewCenter, setViewCenter] = useState<Point2D>({ x: 5000, y: 5000 });
  const [zoom, setZoom] = useState(0.07);

  // Refs for event handlers that need current state without re-attaching
  const isPanningRef = useRef(false);
  const panStartScreenRef = useRef<Point2D>({ x: 0, y: 0 });
  const panStartWorldRef = useRef<Point2D>({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const viewCenterRef = useRef(viewCenter);
  const sizeRef = useRef(size);
  zoomRef.current = zoom;
  viewCenterRef.current = viewCenter;
  sizeRef.current = size;

  const worldToScreen = useCallback(
    (p: Point2D): Point2D => ({
      x: (p.x - viewCenter.x) * zoom + size.width / 2,
      y: (p.y - viewCenter.y) * zoom + size.height / 2,
    }),
    [viewCenter, zoom, size],
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number): Point2D => ({
      x: (sx - size.width / 2) / zoom + viewCenter.x,
      y: (sy - size.height / 2) / zoom + viewCenter.y,
    }),
    [viewCenter, zoom, size],
  );

  // --- Resize observer ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // --- Drawing ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = size;
    canvas.width = width;
    canvas.height = height;

    const w2s = (p: Point2D) => worldToScreen(p);

    // Background
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(0, 0, width, height);

    // Grid
    drawGrid(ctx, width, height, viewCenter, zoom);

    // Room fills
    for (const room of rooms) {
      drawRoomFill(ctx, room, w2s, room.id === selectedRoomId, room.id === hoveredRoomId);
    }

    // Wall outlines
    for (const room of rooms) {
      drawRoomWalls(ctx, room, w2s, zoom);
    }

    // Windows (blue markers on walls)
    for (const win of windows) {
      const room = rooms.find((r) => r.id === win.roomId);
      if (room) drawWindowMarker(ctx, room, win, w2s, zoom);
    }

    // Room labels
    for (const room of rooms) {
      drawRoomLabel(ctx, room, w2s, room.id === selectedRoomId);
    }

    // Dimensions on selected room
    if (selectedRoomId) {
      const sel = rooms.find((r) => r.id === selectedRoomId);
      if (sel) drawDimensions(ctx, sel, w2s);
    }

    // Scale bar
    drawScaleBar(ctx, width, height, zoom);

    // Snap indicator
    if (snap.enabled) {
      drawSnapIndicator(ctx, width, height, snap);
    }
  }, [rooms, windows, selectedRoomId, hoveredRoomId, viewCenter, zoom, size, worldToScreen, snap]);

  // --- Wheel zoom (needs passive: false) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const z = zoomRef.current;
      const vc = viewCenterRef.current;
      const s = sizeRef.current;

      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.005, Math.min(0.5, z * factor));

      // Zoom toward cursor
      const wx = (sx - s.width / 2) / z + vc.x;
      const wy = (sy - s.height / 2) / z + vc.y;
      const wx2 = (sx - s.width / 2) / newZoom + vc.x;
      const wy2 = (sy - s.height / 2) / newZoom + vc.y;

      setViewCenter({ x: vc.x + (wx - wx2), y: vc.y + (wy - wy2) });
      setZoom(newZoom);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // --- Mouse handlers ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 1 || e.button === 2 || tool === "pan") {
        isPanningRef.current = true;
        panStartScreenRef.current = { x: e.clientX, y: e.clientY };
        panStartWorldRef.current = { ...viewCenter };
        e.preventDefault();
      }
    },
    [tool, viewCenter],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) {
        const dx = (e.clientX - panStartScreenRef.current.x) / zoom;
        const dy = (e.clientY - panStartScreenRef.current.y) / zoom;
        setViewCenter({
          x: panStartWorldRef.current.x - dx,
          y: panStartWorldRef.current.y - dy,
        });
        return;
      }

      // Hover detection
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      let found: string | null = null;
      for (let i = rooms.length - 1; i >= 0; i--) {
        const r = rooms[i]!;
        if (pointInPolygon(wp, r.polygon)) {
          found = r.id;
          break;
        }
      }
      onHoverRoom(found);
    },
    [zoom, rooms, screenToWorld, onHoverRoom],
  );

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (tool !== "select") return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const wp = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      let found: string | null = null;
      for (let i = rooms.length - 1; i >= 0; i--) {
        const r = rooms[i]!;
        if (pointInPolygon(wp, r.polygon)) {
          found = r.id;
          break;
        }
      }
      onSelectRoom(found);
    },
    [tool, rooms, screenToWorld, onSelectRoom],
  );

  const cursor =
    tool === "pan"
      ? isPanningRef.current ? "grabbing" : "grab"
      : tool === "select"
        ? hoveredRoomId ? "pointer" : "default"
        : "crosshair";

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-stone-50">
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="block"
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* Cursor world position */}
      <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white">
        1:{Math.round(1000 / (zoom * 1000))}
      </div>
    </div>
  );
}

// =============================================================================
// Drawing helpers
// =============================================================================

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: Point2D,
  zoom: number,
) {
  const pxPerM = zoom * 1000;

  let minor: number;
  let major: number;
  if (pxPerM > 150) { minor = 100; major = 1000; }
  else if (pxPerM > 40) { minor = 500; major = 1000; }
  else if (pxPerM > 15) { minor = 1000; major = 5000; }
  else { minor = 5000; major = 10000; }

  const wL = center.x - width / (2 * zoom);
  const wT = center.y - height / (2 * zoom);
  const wR = center.x + width / (2 * zoom);
  const wB = center.y + height / (2 * zoom);

  // Minor
  ctx.strokeStyle = "#e7e5e4";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let wx = Math.floor(wL / minor) * minor; wx <= wR; wx += minor) {
    const sx = (wx - center.x) * zoom + width / 2;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (let wy = Math.floor(wT / minor) * minor; wy <= wB; wy += minor) {
    const sy = (wy - center.y) * zoom + height / 2;
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();

  // Major
  ctx.strokeStyle = "#d6d3d1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let wx = Math.floor(wL / major) * major; wx <= wR; wx += major) {
    const sx = (wx - center.x) * zoom + width / 2;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
  }
  for (let wy = Math.floor(wT / major) * major; wy <= wB; wy += major) {
    const sy = (wy - center.y) * zoom + height / 2;
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
  }
  ctx.stroke();

  // Axis labels
  if (pxPerM > 20) {
    ctx.fillStyle = "#a8a29e";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let wx = Math.floor(wL / major) * major; wx <= wR; wx += major) {
      const sx = (wx - center.x) * zoom + width / 2;
      if (sx > 5 && sx < width - 30) {
        ctx.fillText(`${(wx / 1000).toFixed(0)}m`, sx + 3, 3);
      }
    }
  }
}

function drawRoomFill(
  ctx: CanvasRenderingContext2D,
  room: ModelRoom,
  w2s: (p: Point2D) => Point2D,
  isSelected: boolean,
  isHovered: boolean,
) {
  const pts = room.polygon.map(w2s);
  if (pts.length < 3) return;

  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();

  ctx.fillStyle = isSelected ? "#fef3c7" : isHovered ? "#f5f5f4" : "#ffffff";
  ctx.fill();
}

function drawRoomWalls(
  ctx: CanvasRenderingContext2D,
  room: ModelRoom,
  w2s: (p: Point2D) => Point2D,
  zoom: number,
) {
  const pts = room.polygon.map(w2s);
  if (pts.length < 3) return;

  const wallPx = Math.max(3, WALL_THICKNESS_MM * zoom);

  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();

  ctx.strokeStyle = "#1c1917";
  ctx.lineWidth = wallPx;
  ctx.lineJoin = "miter";
  ctx.stroke();
}

function drawWindowMarker(
  ctx: CanvasRenderingContext2D,
  room: ModelRoom,
  win: ModelWindow,
  w2s: (p: Point2D) => Point2D,
  zoom: number,
) {
  const poly = room.polygon;
  const n = poly.length;
  const i = win.wallIndex % n;
  const j = (i + 1) % n;
  const a = poly[i]!;
  const b = poly[j]!;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const ux = dx / len;
  const uy = dy / len;

  const cx = a.x + ux * win.offset;
  const cy = a.y + uy * win.offset;
  const hw = win.width / 2;

  const p1 = w2s({ x: cx - ux * hw, y: cy - uy * hw });
  const p2 = w2s({ x: cx + ux * hw, y: cy + uy * hw });

  const wallPx = Math.max(3, WALL_THICKNESS_MM * zoom);

  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = wallPx * 0.85;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

function drawRoomLabel(
  ctx: CanvasRenderingContext2D,
  room: ModelRoom,
  w2s: (p: Point2D) => Point2D,
  isSelected: boolean,
) {
  const c = polygonCenter(room.polygon);
  const sc = w2s(c);
  const areaM2 = polygonArea(room.polygon) / 1e6;

  ctx.fillStyle = isSelected ? "#92400e" : "#44403c";
  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(room.id, sc.x, sc.y - 10);

  ctx.fillStyle = "#78716c";
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.fillText(room.name, sc.x, sc.y + 4);
  ctx.fillText(`${areaM2.toFixed(1)} m\u00B2`, sc.x, sc.y + 17);
}

function drawDimensions(
  ctx: CanvasRenderingContext2D,
  room: ModelRoom,
  w2s: (p: Point2D) => Point2D,
) {
  const poly = room.polygon;
  const n = poly.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = poly[i]!;
    const b = poly[j]!;
    const sa = w2s(a);
    const sb = w2s(b);

    const length = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const label = (length / 1000).toFixed(2);

    const mx = (sa.x + sb.x) / 2;
    const my = (sa.y + sb.y) / 2;

    // Perpendicular offset pointing outward (CW winding)
    const angle = Math.atan2(sb.y - sa.y, sb.x - sa.x);
    const off = 18;
    const nx = Math.cos(angle - Math.PI / 2) * off;
    const ny = Math.sin(angle - Math.PI / 2) * off;

    ctx.fillStyle = "#d97706";
    ctx.font = "bold 10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx + nx, my + ny);
  }
}

// ---------------------------------------------------------------------------
// Scale bar
// ---------------------------------------------------------------------------

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  _width: number,
  height: number,
  zoom: number,
) {
  const pxPerMm = zoom;
  const maxBarPx = 200;

  // Find a nice round length that fits within maxBarPx
  const niceSteps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  let barMm = 1000;
  for (const step of niceSteps) {
    if (step * pxPerMm <= maxBarPx && step * pxPerMm >= 40) {
      barMm = step;
    }
  }
  const barPx = barMm * pxPerMm;

  const x = 20;
  const y = height - 24;
  const h = 8;

  // Background
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(x - 6, y - 16, barPx + 12, h + 28);

  // Bar segments (alternating black/white like an architectural scale bar)
  const segments = 4;
  const segPx = barPx / segments;
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#1c1917" : "#ffffff";
    ctx.fillRect(x + i * segPx, y, segPx, h);
  }

  // Border
  ctx.strokeStyle = "#1c1917";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barPx, h);

  // Ticks at ends
  ctx.beginPath();
  ctx.moveTo(x, y - 3);
  ctx.lineTo(x, y + h + 3);
  ctx.moveTo(x + barPx, y - 3);
  ctx.lineTo(x + barPx, y + h + 3);
  ctx.stroke();

  // Labels
  ctx.fillStyle = "#1c1917";
  ctx.font = "bold 10px Inter, system-ui, sans-serif";
  ctx.textBaseline = "top";

  ctx.textAlign = "left";
  ctx.fillText("0", x, y + h + 4);

  ctx.textAlign = "right";
  const label = barMm >= 1000 ? `${barMm / 1000} m` : `${barMm} mm`;
  ctx.fillText(label, x + barPx, y + h + 4);

  // Scale ratio
  ctx.textAlign = "center";
  ctx.font = "9px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#78716c";
  ctx.fillText(`1:${Math.round(1000 / (zoom * 1000))}`, x + barPx / 2, y - 13);
}

// ---------------------------------------------------------------------------
// Snap indicator (small badge in corner)
// ---------------------------------------------------------------------------

function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  width: number,
  _height: number,
  snap: SnapSettings,
) {
  const activeCount = snap.modes.length;
  const label = `SNAP: ${activeCount}`;

  ctx.font = "bold 9px Inter, system-ui, sans-serif";
  const tw = ctx.measureText(label).width;

  const px = 6;
  const x = width - tw - px * 2 - 12;
  const y = 8;

  ctx.fillStyle = "rgba(217, 119, 6, 0.15)";
  ctx.beginPath();
  ctx.roundRect(x, y, tw + px * 2, 16, 3);
  ctx.fill();

  ctx.fillStyle = "#92400e";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + px, y + 8);
}
