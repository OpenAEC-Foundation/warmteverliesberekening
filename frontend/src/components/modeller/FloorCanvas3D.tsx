/**
 * 3D building viewer using ThatOpen Components + Three.js.
 *
 * Features:
 * - Multi-layer walls with mitered corner connections
 * - Window and door openings cut into walls
 * - Transparent glass panes in window openings
 * - Floor slabs and semi-transparent ceiling/roof
 * - Room labels as sprites
 * - Click-to-select rooms
 */
import { useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import * as OBC from "@thatopen/components";

import type { ModelRoom, ModelWindow, ModelDoor, Point2D } from "./types";
import { polygonCenter } from "./geometry";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FloorCanvas3DProps {
  rooms: ModelRoom[];
  windows: ModelWindow[];
  doors: ModelDoor[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Wall layers (inner → outer, thicknesses in mm, total = 200mm)
// ---------------------------------------------------------------------------

interface WallLayer {
  thickness: number; // mm
  color: number;
}

const WALL_LAYERS: WallLayer[] = [
  { thickness: 15,  color: 0xf2efea }, // inner plaster
  { thickness: 140, color: 0xeae7e2 }, // structural
  { thickness: 30,  color: 0xe0ddd8 }, // insulation
  { thickness: 15,  color: 0xd8d5d0 }, // outer finish
];

// ---------------------------------------------------------------------------
// Colors & constants
// ---------------------------------------------------------------------------

const FUNCTION_COLORS: Record<string, number> = {
  living_room: 0xfef3c7,
  kitchen: 0xfef9c3,
  bedroom: 0xdbeafe,
  bathroom: 0xcffafe,
  toilet: 0xe0e7ff,
  hallway: 0xf5f5f4,
  landing: 0xf5f5f4,
  storage: 0xe7e5e4,
  attic: 0xfce7f3,
  custom: 0xf3f4f6,
};

const SELECTED_COLOR = 0xf59e0b;
const WINDOW_COLOR = 0x93c5fd;
const ROOF_COLOR = 0xdc2626;
const FLOOR_OPACITY = 0.95;
const CEILING_OPACITY = 0.15;
const WINDOW_SILL_H = 0.8;  // meters
const WINDOW_HEAD_H = 2.1;  // meters
const DOOR_HEAD_H = 2.1;    // meters

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FloorCanvas3D({
  rooms,
  windows,
  doors,
  selectedRoomId,
  onSelectRoom,
}: FloorCanvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<OBC.SimpleScene | null>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const modelGroupRef = useRef<THREE.Group>(new THREE.Group());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const roomMeshMapRef = useRef(new Map<THREE.Mesh, string>());

  // Scene center for camera positioning
  const sceneCenter = useMemo(() => {
    if (rooms.length === 0) return new THREE.Vector3(0, 1.3, 0);
    let cx = 0, cy = 0;
    for (const room of rooms) {
      const c = polygonCenter(room.polygon);
      cx += c.x / 1000;
      cy += c.y / 1000;
    }
    cx /= rooms.length;
    cy /= rooms.length;
    return new THREE.Vector3(cx, 1.3, cy);
  }, [rooms]);

  // Initialize ThatOpen components
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const components = new OBC.Components();
    componentsRef.current = components;

    const worlds = components.get(OBC.Worlds);
    const world = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();

    world.scene = new OBC.SimpleScene(components);
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.SimpleCamera(components);

    components.init();
    world.scene.setup();

    // Background
    world.scene.three.background = new THREE.Color(0xf5f5f4);

    // Lighting
    const scene = world.scene.three;
    scene.children
      .filter((c) => c instanceof THREE.Light)
      .forEach((l) => scene.remove(l));

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(20, 30, 10);
    dir1.castShadow = true;
    scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-15, 20, -15);
    scene.add(dir2);

    // Grid
    const grids = components.get(OBC.Grids);
    grids.create(world);

    // Camera position
    world.camera.controls.setLookAt(
      sceneCenter.x + 12, 10, sceneCenter.z + 12,
      sceneCenter.x, sceneCenter.y, sceneCenter.z,
      true,
    );

    // Add model group to scene
    scene.add(modelGroupRef.current);

    worldRef.current = world.scene;

    return () => {
      modelGroupRef.current.removeFromParent();
      components.dispose();
      componentsRef.current = null;
      worldRef.current = null;
    };
  }, [sceneCenter]);

  // Build/update 3D geometry when rooms/windows/doors/selection change
  useEffect(() => {
    const group = modelGroupRef.current;
    clearGroup(group);
    roomMeshMapRef.current.clear();

    for (const room of rooms) {
      const isSelected = room.id === selectedRoomId;
      const floorY = room.floor * (room.height / 1000 + 0.3);
      const h = room.height / 1000;
      const poly = room.polygon;
      const n = poly.length;

      // Floor slab
      const floorGeom = createPolygonGeometry(poly);
      const floorColor = isSelected
        ? SELECTED_COLOR
        : (FUNCTION_COLORS[room.function] ?? FUNCTION_COLORS.custom!);
      const floorMat = new THREE.MeshStandardMaterial({
        color: floorColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: FLOOR_OPACITY,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const floorMesh = new THREE.Mesh(floorGeom, floorMat);
      floorMesh.position.y = floorY + 0.01;
      group.add(floorMesh);
      roomMeshMapRef.current.set(floorMesh, room.id);

      // Ceiling / Roof
      const ceilGeom = createPolygonGeometry(poly);
      const ceilMat = new THREE.MeshStandardMaterial({
        color: ROOF_COLOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: CEILING_OPACITY,
        roughness: 0.9,
      });
      const ceilMesh = new THREE.Mesh(ceilGeom, ceilMat);
      ceilMesh.position.y = floorY + h;
      group.add(ceilMesh);

      // Compute offset polygons for each layer boundary
      const layerOffsets = [0]; // mm from inner face
      for (const layer of WALL_LAYERS) {
        layerOffsets.push(layerOffsets[layerOffsets.length - 1]! + layer.thickness);
      }
      const offsetPolys = layerOffsets.map((d) =>
        d === 0 ? poly : offsetPolygon2D(poly, d),
      );

      // Room's windows and doors
      const roomWindows = windows.filter((w) => w.roomId === room.id);
      const roomDoors = doors.filter((d) => d.roomId === room.id);

      // Build walls per edge
      for (let i = 0; i < n; i++) {
        const ni = (i + 1) % n;
        const edgeLen = Math.hypot(
          poly[ni]!.x - poly[i]!.x,
          poly[ni]!.y - poly[i]!.y,
        );
        if (edgeLen < 1) continue;
        const wallLenM = edgeLen / 1000;

        // Collect openings on this wall
        const openings: Opening[] = [];
        for (const win of roomWindows) {
          if (win.wallIndex % n !== i) continue;
          openings.push({
            start: (win.offset - win.width / 2) / 1000,
            end: (win.offset + win.width / 2) / 1000,
            sillH: WINDOW_SILL_H,
            headH: Math.min(WINDOW_HEAD_H, h),
          });
        }
        for (const dr of roomDoors) {
          if (dr.wallIndex % n !== i) continue;
          openings.push({
            start: (dr.offset - dr.width / 2) / 1000,
            end: (dr.offset + dr.width / 2) / 1000,
            sillH: 0,
            headH: Math.min(DOOR_HEAD_H, h),
          });
        }
        openings.sort((a, b) => a.start - b.start);

        const pieces = computeWallPieces(wallLenM, h, openings);

        // For each layer, create wall pieces
        for (let j = 0; j < WALL_LAYERS.length; j++) {
          const innerPoly = offsetPolys[j]!;
          const outerPoly = offsetPolys[j + 1]!;

          const iStart = { x: innerPoly[i]!.x / 1000, z: innerPoly[i]!.y / 1000 };
          const iEnd = { x: innerPoly[ni]!.x / 1000, z: innerPoly[ni]!.y / 1000 };
          const oStart = { x: outerPoly[i]!.x / 1000, z: outerPoly[i]!.y / 1000 };
          const oEnd = { x: outerPoly[ni]!.x / 1000, z: outerPoly[ni]!.y / 1000 };

          for (const piece of pieces) {
            const geom = createWallPieceGeom(iStart, iEnd, oStart, oEnd, piece);
            const mat = new THREE.MeshStandardMaterial({
              color: WALL_LAYERS[j]!.color,
              side: THREE.DoubleSide,
              flatShading: true,
              roughness: 0.85,
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.y = floorY;
            group.add(mesh);
          }
        }

        // Window glass panes (placed at wall mid-thickness)
        const midIdx = Math.floor(offsetPolys.length / 2);
        const midPoly = offsetPolys[midIdx]!;
        const midStart = { x: midPoly[i]!.x / 1000, z: midPoly[i]!.y / 1000 };
        const midEnd = { x: midPoly[ni]!.x / 1000, z: midPoly[ni]!.y / 1000 };

        for (const win of roomWindows) {
          if (win.wallIndex % n !== i) continue;
          const paneGeom = createPaneGeom(midStart, midEnd, wallLenM, win);
          if (paneGeom) {
            const paneMat = new THREE.MeshStandardMaterial({
              color: WINDOW_COLOR,
              transparent: true,
              opacity: 0.35,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            const paneMesh = new THREE.Mesh(paneGeom, paneMat);
            paneMesh.position.y = floorY;
            paneMesh.renderOrder = 1;
            group.add(paneMesh);
          }
        }
      }

      // Room label sprite
      const center = polygonCenter(poly);
      const sprite = createLabelSprite(room.id, room.name, isSelected);
      sprite.position.set(center.x / 1000, floorY + h / 2, center.y / 1000);
      sprite.scale.set(2, 1, 1);
      group.add(sprite);
    }
  }, [rooms, windows, doors, selectedRoomId]);

  // Click handler for room selection
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container || !worldRef.current) return;

      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const components = componentsRef.current;
      if (!components) return;
      const worlds = components.get(OBC.Worlds);
      const worldsList = Array.from(worlds.list.values());
      if (worldsList.length === 0) return;
      const cam = worldsList[0]!.camera.three;

      raycasterRef.current.setFromCamera(mouseRef.current, cam);

      const meshes = Array.from(roomMeshMapRef.current.keys());
      const intersects = raycasterRef.current.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const roomId = roomMeshMapRef.current.get(intersects[0]!.object as THREE.Mesh);
        if (roomId) {
          onSelectRoom(roomId);
          return;
        }
      }
      onSelectRoom(null);
    },
    [onSelectRoom],
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onClick={handleClick}
    />
  );
}

// =============================================================================
// Geometry helpers
// =============================================================================

/** Dispose all children of a Three.js group. */
function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0]!;
    group.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
    }
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  }
}

// ---------------------------------------------------------------------------
// Polygon offset (mitered corners)
// ---------------------------------------------------------------------------

function signedArea2D(poly: Point2D[]): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Offset a 2D polygon outward by `dist` mm.
 * Uses mitered corners for clean connections.
 */
function offsetPolygon2D(poly: Point2D[], dist: number): Point2D[] {
  const n = poly.length;
  const area = signedArea2D(poly);
  // CW in screen coords (area > 0): outward normal of edge (dx,dy) is (dy,-dx)/len
  const sign = area > 0 ? 1 : -1;

  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!;
    const curr = poly[i]!;
    const next = poly[(i + 1) % n]!;

    const e1dx = curr.x - prev.x;
    const e1dy = curr.y - prev.y;
    const e1len = Math.hypot(e1dx, e1dy);

    const e2dx = next.x - curr.x;
    const e2dy = next.y - curr.y;
    const e2len = Math.hypot(e2dx, e2dy);

    if (e1len < 0.1 || e2len < 0.1) {
      result.push({ x: curr.x, y: curr.y });
      continue;
    }

    // Outward normals
    const n1x = sign * e1dy / e1len;
    const n1y = sign * (-e1dx) / e1len;
    const n2x = sign * e2dy / e2len;
    const n2y = sign * (-e2dx) / e2len;

    // Miter bisector
    const mx = n1x + n2x;
    const my = n1y + n2y;
    const mlen = Math.hypot(mx, my);

    if (mlen < 0.001) {
      // Parallel edges
      result.push({ x: curr.x + n1x * dist, y: curr.y + n1y * dist });
    } else {
      const dot = n1x * (mx / mlen) + n1y * (my / mlen);
      // Clamp miter to avoid huge spikes at acute angles
      const miterScale = Math.abs(dot) > 0.25 ? dist / dot : dist * 2;
      result.push({
        x: curr.x + (mx / mlen) * miterScale,
        y: curr.y + (my / mlen) * miterScale,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Wall pieces (segments around openings)
// ---------------------------------------------------------------------------

interface Opening {
  start: number; // meters from wall start
  end: number;
  sillH: number; // meters from floor
  headH: number;
}

interface WallPiece {
  t1: number; // 0..1 along wall
  t2: number;
  yBot: number; // meters
  yTop: number;
}

/**
 * Split a wall into pieces around window/door openings.
 * Returns rectangles that represent solid wall regions.
 */
function computeWallPieces(wallLen: number, wallH: number, openings: Opening[]): WallPiece[] {
  if (openings.length === 0) {
    return [{ t1: 0, t2: 1, yBot: 0, yTop: wallH }];
  }

  const pieces: WallPiece[] = [];
  let cursor = 0;

  for (const op of openings) {
    const tStart = Math.max(0, op.start) / wallLen;
    const tEnd = Math.min(wallLen, op.end) / wallLen;

    // Solid wall before opening
    if (tStart > cursor + 0.001) {
      pieces.push({ t1: cursor, t2: tStart, yBot: 0, yTop: wallH });
    }

    // Below sill (skip for doors where sillH = 0)
    if (op.sillH > 0.01) {
      pieces.push({ t1: tStart, t2: tEnd, yBot: 0, yTop: op.sillH });
    }

    // Above head
    if (op.headH < wallH - 0.01) {
      pieces.push({ t1: tStart, t2: tEnd, yBot: op.headH, yTop: wallH });
    }

    cursor = tEnd;
  }

  // Solid wall after last opening
  if (cursor < 1 - 0.001) {
    pieces.push({ t1: cursor, t2: 1, yBot: 0, yTop: wallH });
  }

  return pieces;
}

// ---------------------------------------------------------------------------
// Wall piece 3D geometry (box with 6 faces)
// ---------------------------------------------------------------------------

interface XZ { x: number; z: number }

function lerp(a: XZ, b: XZ, t: number): XZ {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Create a wall box geometry for one piece (segment) of one layer.
 *
 * Vertices layout (looking from outside):
 *   4---5  top
 *   |   |
 *   0---1  bottom
 *
 * Inner face: 0,1,5,4  Outer face: 3,2,6,7
 * Top: 4,5,6,7  Bottom: 0,3,2,1
 * Left cap: 0,4,7,3  Right cap: 1,2,6,5
 */
function createWallPieceGeom(
  iStart: XZ, iEnd: XZ,
  oStart: XZ, oEnd: XZ,
  piece: WallPiece,
): THREE.BufferGeometry {
  const is = lerp(iStart, iEnd, piece.t1);
  const ie = lerp(iStart, iEnd, piece.t2);
  const os = lerp(oStart, oEnd, piece.t1);
  const oe = lerp(oStart, oEnd, piece.t2);
  const yb = piece.yBot;
  const yt = piece.yTop;

  // 8 vertices
  const positions = new Float32Array([
    is.x, yb, is.z,   // 0: inner-start-bot
    ie.x, yb, ie.z,   // 1: inner-end-bot
    oe.x, yb, oe.z,   // 2: outer-end-bot
    os.x, yb, os.z,   // 3: outer-start-bot
    is.x, yt, is.z,   // 4: inner-start-top
    ie.x, yt, ie.z,   // 5: inner-end-top
    oe.x, yt, oe.z,   // 6: outer-end-top
    os.x, yt, os.z,   // 7: outer-start-top
  ]);

  // 6 faces × 2 triangles = 12 triangles × 3 indices = 36
  const indices = new Uint16Array([
    // Inner face
    0, 5, 4,  0, 1, 5,
    // Outer face
    3, 7, 6,  3, 6, 2,
    // Top
    4, 5, 6,  4, 6, 7,
    // Bottom
    0, 3, 2,  0, 2, 1,
    // Left cap (start)
    0, 4, 7,  0, 7, 3,
    // Right cap (end)
    1, 2, 6,  1, 6, 5,
  ]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

// ---------------------------------------------------------------------------
// Floor/ceiling polygon geometry
// ---------------------------------------------------------------------------

function createPolygonGeometry(polygon: Point2D[]): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const p0 = polygon[0]!;
  shape.moveTo(p0.x / 1000, -p0.y / 1000);
  for (let i = 1; i < polygon.length; i++) {
    const p = polygon[i]!;
    shape.lineTo(p.x / 1000, -p.y / 1000);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2);
  return geom;
}

// ---------------------------------------------------------------------------
// Window glass pane
// ---------------------------------------------------------------------------

function createPaneGeom(
  edgeStart: XZ, edgeEnd: XZ,
  wallLenM: number,
  win: ModelWindow,
): THREE.BufferGeometry | null {
  if (wallLenM < 0.001) return null;

  const tLeft = Math.max(0, (win.offset - win.width / 2) / 1000 / wallLenM);
  const tRight = Math.min(1, (win.offset + win.width / 2) / 1000 / wallLenM);

  const left = lerp(edgeStart, edgeEnd, tLeft);
  const right = lerp(edgeStart, edgeEnd, tRight);

  const verts = new Float32Array([
    left.x, WINDOW_SILL_H, left.z,
    right.x, WINDOW_SILL_H, right.z,
    right.x, WINDOW_HEAD_H, right.z,
    left.x, WINDOW_HEAD_H, left.z,
  ]);

  const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geom.setIndex(new THREE.BufferAttribute(idx, 1));
  geom.computeVertexNormals();
  return geom;
}

// ---------------------------------------------------------------------------
// Room label sprite
// ---------------------------------------------------------------------------

function createLabelSprite(id: string, name: string, isSelected: boolean): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 256, 96);

  ctx.fillStyle = isSelected ? "rgba(245, 158, 11, 0.9)" : "rgba(0, 0, 0, 0.65)";
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 88, 8);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(id, 128, 32);

  ctx.font = "22px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(name, 128, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
}
