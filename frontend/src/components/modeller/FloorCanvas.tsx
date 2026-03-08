import { useCallback, useEffect, useRef, useState } from "react";

import type { ModelRoom, ModelWindow, ModellerTool, Point2D, SnapSettings } from "./types";
import { pointInPolygon, polygonArea, polygonCenter } from "./geometry";
import type { UnderlayImage } from "./modellerStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FloorCanvasProps {
  rooms: ModelRoom[];
  windows: ModelWindow[];
  selectedRoomId: string | null;
  hoveredRoomId: string | null;
  tool: ModellerTool;
  snap: SnapSettings;
  underlay: UnderlayImage | null;
  onSelectRoom: (id: string | null) => void;
  onHoverRoom: (id: string | null) => void;
  onAddRoom: (polygon: Point2D[]) => void;
  onAddWindow: (roomId: string, wallIndex: number, offset: number, width: number) => void;
}

const WALL_THICKNESS_MM = 200;
const DEFAULT_WINDOW_WIDTH = 1200;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FloorCanvas({
  rooms,
  windows,
  selectedRoomId,
  hoveredRoomId,
  tool,
  snap,
  underlay,
  onSelectRoom,
  onHoverRoom,
  onAddRoom,
  onAddWindow,
}: FloorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [viewCenter, setViewCenter] = useState<Point2D>({ x: 5000, y: 5000 });
  const [zoom, setZoom] = useState(0.07);

  // Drawing state
  const [drawPoints, setDrawPoints] = useState<Point2D[]>([]);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);

  // Refs for event handlers
  const isPanningRef = useRef(false);
  const panStartScreenRef = useRef<Point2D>({ x: 0, y: 0 });
  const panStartWorldRef = useRef<Point2D>({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const viewCenterRef = useRef(viewCenter);
  const sizeRef = useRef(size);
  const underlayImgRef = useRef<HTMLImageElement | null>(null);
  zoomRef.current = zoom;
  viewCenterRef.current = viewCenter;
  sizeRef.current = size;

  // Load underlay image
  useEffect(() => {
    if (!underlay) {
      underlayImgRef.current = null;
      return;
    }
    const img = new Image();
    img.src = underlay.dataUrl;
    img.onload = () => { underlayImgRef.current = img; };
  }, [underlay?.dataUrl]);

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

  /** Apply snap to a world point. */
  const applySnap = useCallback(
    (p: Point2D): Point2D => {
      if (!snap.enabled) return p;
      let best = p;
      let bestDist = Infinity;

      // Endpoint snap
      if (snap.modes.includes("endpoint")) {
        for (const room of rooms) {
          for (const v of room.polygon) {
            const d = Math.hypot(v.x - p.x, v.y - p.y);
            if (d < bestDist && d < snap.gridSize * 2) {
              bestDist = d;
              best = v;
            }
          }
        }
        // Also snap to drawing points in progress
        for (const v of drawPoints) {
          const d = Math.hypot(v.x - p.x, v.y - p.y);
          if (d < bestDist && d < snap.gridSize * 2) {
            bestDist = d;
            best = v;
          }
        }
      }

      // Midpoint snap
      if (snap.modes.includes("midpoint")) {
        for (const room of rooms) {
          const poly = room.polygon;
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!;
            const b = poly[(i + 1) % poly.length]!;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const d = Math.hypot(mid.x - p.x, mid.y - p.y);
            if (d < bestDist && d < snap.gridSize * 2) {
              bestDist = d;
              best = mid;
            }
          }
        }
      }

      // Grid snap (fallback if no closer snap found)
      if (snap.modes.includes("grid") && bestDist === Infinity) {
        const gs = snap.gridSize;
        best = {
          x: Math.round(p.x / gs) * gs,
          y: Math.round(p.y / gs) * gs,
        };
      }

      return best;
    },
    [snap, rooms, drawPoints],
  );

  // Cancel drawing on Escape or tool change
  useEffect(() => {
    setDrawPoints([]);
    setCursorWorld(null);
  }, [tool]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawPoints([]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

    // Underlay
    if (underlay && underlayImgRef.current) {
      drawUnderlay(ctx, underlay, underlayImgRef.current, w2s, zoom);
    }

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

    // Drawing preview
    if (drawPoints.length > 0 || cursorWorld) {
      drawPreview(ctx, tool, drawPoints, cursorWorld, w2s);
    }

    // Scale bar
    drawScaleBar(ctx, width, height, zoom);

    // Snap indicator
    if (snap.enabled) {
      drawSnapIndicator(ctx, width, height, snap);
    }
  }, [rooms, windows, selectedRoomId, hoveredRoomId, viewCenter, zoom, size, worldToScreen, snap, drawPoints, cursorWorld, tool, underlay]);

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
      if (e.button === 1 || e.button === 2 || (tool === "pan" && e.button === 0)) {
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

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rawWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const snapped = applySnap(rawWorld);

      // Update cursor position for drawing preview
      if (isDrawingTool(tool)) {
        setCursorWorld(snapped);
      } else {
        setCursorWorld(null);
      }

      // Hover detection
      if (tool === "select") {
        let found: string | null = null;
        for (let i = rooms.length - 1; i >= 0; i--) {
          const r = rooms[i]!;
          if (pointInPolygon(rawWorld, r.polygon)) {
            found = r.id;
            break;
          }
        }
        onHoverRoom(found);
      }
    },
    [zoom, rooms, screenToWorld, onHoverRoom, tool, applySnap],
  );

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const rawWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const snapped = applySnap(rawWorld);

      // Select tool
      if (tool === "select") {
        let found: string | null = null;
        for (let i = rooms.length - 1; i >= 0; i--) {
          const r = rooms[i]!;
          if (pointInPolygon(rawWorld, r.polygon)) {
            found = r.id;
            break;
          }
        }
        onSelectRoom(found);
        return;
      }

      // Rectangle tool: 2 clicks
      if (tool === "draw_rect") {
        if (drawPoints.length === 0) {
          setDrawPoints([snapped]);
        } else {
          const p0 = drawPoints[0]!;
          const p1 = snapped;
          if (Math.abs(p1.x - p0.x) > 100 && Math.abs(p1.y - p0.y) > 100) {
            const polygon: Point2D[] = [
              { x: p0.x, y: p0.y },
              { x: p1.x, y: p0.y },
              { x: p1.x, y: p1.y },
              { x: p0.x, y: p1.y },
            ];
            onAddRoom(polygon);
          }
          setDrawPoints([]);
        }
        return;
      }

      // Polygon tool: click to add points
      if (tool === "draw_polygon") {
        // Close polygon if clicking near first point
        if (drawPoints.length >= 3) {
          const first = drawPoints[0]!;
          const closeDist = Math.hypot(snapped.x - first.x, snapped.y - first.y);
          if (closeDist < snap.gridSize * 1.5) {
            onAddRoom([...drawPoints]);
            setDrawPoints([]);
            return;
          }
        }
        setDrawPoints([...drawPoints, snapped]);
        return;
      }

      // Window tool: click on a wall to place
      if (tool === "draw_window") {
        const hit = findWallHit(rawWorld, rooms, snap.gridSize * 3);
        if (hit) {
          onAddWindow(hit.roomId, hit.wallIndex, hit.offset, DEFAULT_WINDOW_WIDTH);
        }
        return;
      }
    },
    [tool, rooms, screenToWorld, applySnap, onSelectRoom, drawPoints, onAddRoom, onAddWindow, snap.gridSize],
  );

  const handleDoubleClick = useCallback(
    (_e: React.MouseEvent<HTMLCanvasElement>) => {
      // Polygon: close on double-click
      if (tool === "draw_polygon" && drawPoints.length >= 3) {
        onAddRoom([...drawPoints]);
        setDrawPoints([]);
      }
    },
    [tool, drawPoints, onAddRoom],
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
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* Scale ratio */}
      <div className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white">
        1:{Math.round(1000 / (zoom * 1000))}
      </div>
      {/* Drawing hint */}
      {isDrawingTool(tool) && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1.5 text-[11px] text-white">
          {getDrawingHint(tool, drawPoints.length)}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function isDrawingTool(tool: ModellerTool): boolean {
  return tool.startsWith("draw_");
}

function getDrawingHint(tool: ModellerTool, pointCount: number): string {
  if (tool === "draw_rect") {
    return pointCount === 0
      ? "Klik om eerste hoek te plaatsen"
      : "Klik om rechthoek af te ronden";
  }
  if (tool === "draw_polygon") {
    if (pointCount < 3) return `Klik om punt ${pointCount + 1} te plaatsen`;
    return "Klik om punt toe te voegen, dubbelklik of klik bij startpunt om te sluiten";
  }
  if (tool === "draw_window") {
    return "Klik op een wand om een raam te plaatsen";
  }
  if (tool === "draw_door") {
    return "Klik op een wand om een deur te plaatsen";
  }
  return "Klik om te tekenen";
}

/** Find the closest wall edge to a point, returns room/wall/offset. */
function findWallHit(
  p: Point2D,
  rooms: ModelRoom[],
  maxDist: number,
): { roomId: string; wallIndex: number; offset: number } | null {
  let best: { roomId: string; wallIndex: number; offset: number } | null = null;
  let bestDist = maxDist;

  for (const room of rooms) {
    const poly = room.polygon;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % n]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1) continue;

      // Project point onto edge
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));

      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const dist = Math.hypot(p.x - px, p.y - py);

      if (dist < bestDist) {
        bestDist = dist;
        best = {
          roomId: room.id,
          wallIndex: i,
          offset: t * Math.sqrt(lenSq),
        };
      }
    }
  }

  return best;
}

// =============================================================================
// Drawing functions
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

function drawUnderlay(
  ctx: CanvasRenderingContext2D,
  ul: UnderlayImage,
  img: HTMLImageElement,
  w2s: (p: Point2D) => Point2D,
  _zoom: number,
) {
  const topLeft = w2s({ x: ul.x, y: ul.y });
  const bottomRight = w2s({ x: ul.x + ul.width, y: ul.y + ul.height });
  const w = bottomRight.x - topLeft.x;
  const h = bottomRight.y - topLeft.y;

  ctx.save();
  ctx.globalAlpha = ul.opacity;
  if (ul.rotation !== 0) {
    const cx = topLeft.x + w / 2;
    const cy = topLeft.y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((ul.rotation * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.drawImage(img, topLeft.x, topLeft.y, w, h);
  }
  ctx.restore();
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

function drawPreview(
  ctx: CanvasRenderingContext2D,
  tool: ModellerTool,
  points: Point2D[],
  cursor: Point2D | null,
  w2s: (p: Point2D) => Point2D,
) {
  if (!cursor && points.length === 0) return;

  ctx.save();

  if (tool === "draw_rect" && points.length === 1 && cursor) {
    // Rectangle preview
    const p0 = w2s(points[0]!);
    const p1 = w2s(cursor);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 2;
    ctx.fillStyle = "rgba(217, 119, 6, 0.08)";
    ctx.beginPath();
    ctx.rect(
      Math.min(p0.x, p1.x),
      Math.min(p0.y, p1.y),
      Math.abs(p1.x - p0.x),
      Math.abs(p1.y - p0.y),
    );
    ctx.fill();
    ctx.stroke();

    // Dimension labels
    const w = Math.abs(cursor.x - points[0]!.x);
    const h = Math.abs(cursor.y - points[0]!.y);
    ctx.setLineDash([]);
    ctx.fillStyle = "#d97706";
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      `${(w / 1000).toFixed(2)} m`,
      (p0.x + p1.x) / 2,
      Math.min(p0.y, p1.y) - 6,
    );
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(
      `${(h / 1000).toFixed(2)} m`,
      Math.max(p0.x, p1.x) + 8,
      (p0.y + p1.y) / 2,
    );
  }

  if (tool === "draw_polygon") {
    // Polygon preview
    const screenPts = points.map(w2s);

    if (screenPts.length > 0) {
      // Fill
      ctx.fillStyle = "rgba(217, 119, 6, 0.08)";
      ctx.beginPath();
      ctx.moveTo(screenPts[0]!.x, screenPts[0]!.y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i]!.x, screenPts[i]!.y);
      }
      if (cursor) {
        const sc = w2s(cursor);
        ctx.lineTo(sc.x, sc.y);
      }
      ctx.closePath();
      ctx.fill();

      // Edges
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenPts[0]!.x, screenPts[0]!.y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i]!.x, screenPts[i]!.y);
      }
      if (cursor) {
        const sc = w2s(cursor);
        ctx.lineTo(sc.x, sc.y);
      }
      ctx.stroke();

      // Close line (dashed)
      if (cursor && screenPts.length >= 2) {
        const sc = w2s(cursor);
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = "rgba(217, 119, 6, 0.4)";
        ctx.beginPath();
        ctx.moveTo(sc.x, sc.y);
        ctx.lineTo(screenPts[0]!.x, screenPts[0]!.y);
        ctx.stroke();
      }
    }

    // Vertex markers
    ctx.setLineDash([]);
    for (const sp of screenPts) {
      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Close indicator (circle around first point)
    if (cursor && screenPts.length >= 3) {
      const first = screenPts[0]!;
      const sc = w2s(cursor);
      const closeDist = Math.hypot(sc.x - first.x, sc.y - first.y);
      if (closeDist < 20) {
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(first.x, first.y, 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Crosshair at snapped cursor
  if (cursor) {
    const sc = w2s(cursor);
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(217, 119, 6, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sc.x - 12, sc.y);
    ctx.lineTo(sc.x + 12, sc.y);
    ctx.moveTo(sc.x, sc.y - 12);
    ctx.lineTo(sc.x, sc.y + 12);
    ctx.stroke();

    // Snap dot
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
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

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(x - 6, y - 16, barPx + 12, h + 28);

  const segments = 4;
  const segPx = barPx / segments;
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#1c1917" : "#ffffff";
    ctx.fillRect(x + i * segPx, y, segPx, h);
  }

  ctx.strokeStyle = "#1c1917";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barPx, h);

  ctx.beginPath();
  ctx.moveTo(x, y - 3);
  ctx.lineTo(x, y + h + 3);
  ctx.moveTo(x + barPx, y - 3);
  ctx.lineTo(x + barPx, y + h + 3);
  ctx.stroke();

  ctx.fillStyle = "#1c1917";
  ctx.font = "bold 10px Inter, system-ui, sans-serif";
  ctx.textBaseline = "top";

  ctx.textAlign = "left";
  ctx.fillText("0", x, y + h + 4);

  ctx.textAlign = "right";
  const label = barMm >= 1000 ? `${barMm / 1000} m` : `${barMm} mm`;
  ctx.fillText(label, x + barPx, y + h + 4);

  ctx.textAlign = "center";
  ctx.font = "9px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#78716c";
  ctx.fillText(`1:${Math.round(1000 / (zoom * 1000))}`, x + barPx / 2, y - 13);
}

// ---------------------------------------------------------------------------
// Snap indicator
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
