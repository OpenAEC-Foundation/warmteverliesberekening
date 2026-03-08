/**
 * 3D building viewer using ThatOpen Components + Three.js.
 *
 * Features:
 * - Multi-layer walls with mitered corner connections (insulation yellow, cavity transparent)
 * - Window and door openings cut into walls
 * - Section planes (X/Y/Z axis + click-on-face)
 * - Right-click context menu
 * - Room selection via click
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import * as OBC from "@thatopen/components";

import type { ModelRoom, ModelWindow, ModelDoor, Point2D } from "./types";
import { polygonCenter, offsetPolygon } from "./geometry";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FloorCanvas3DProps {
  rooms: ModelRoom[];
  windows: ModelWindow[];
  doors: ModelDoor[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
  onDeleteRoom?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Wall layers (inner → outer, total = 200mm)
// ---------------------------------------------------------------------------

interface WallLayer {
  thickness: number; // mm
  color: number;
  opacity: number;
}

const WALL_LAYERS: WallLayer[] = [
  { thickness: 12,  color: 0xf0ede8, opacity: 1.0 },  // inner plaster
  { thickness: 88,  color: 0xe8e5e0, opacity: 1.0 },  // structural inner leaf
  { thickness: 50,  color: 0xfef9c3, opacity: 1.0 },  // insulation (pastel yellow)
  { thickness: 10,  color: 0xd0d0d0, opacity: 0.08 },  // spouw (cavity, transparent)
  { thickness: 40,  color: 0xe0ddd8, opacity: 1.0 },  // outer leaf
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
const WINDOW_SILL_H = 0.8;
const WINDOW_HEAD_H = 2.1;
const DOOR_HEAD_H = 2.1;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FloorCanvas3D({
  rooms,
  windows,
  doors,
  selectedRoomId,
  onSelectRoom,
  onDeleteRoom,
}: FloorCanvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentsRef = useRef<OBC.Components | null>(null);
  const modelGroupRef = useRef<THREE.Group>(new THREE.Group());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const roomMeshMapRef = useRef(new Map<THREE.Mesh, string>());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Section plane state
  const [sectionX, setSectionX] = useState<number | null>(null);
  const [sectionY, setSectionY] = useState<number | null>(null);
  const [sectionZ, setSectionZ] = useState<number | null>(null);
  const [customClip, setCustomClip] = useState<{ nx: number; ny: number; nz: number; d: number } | null>(null);
  const [sectionClickMode, setSectionClickMode] = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  // Bounding box for section plane sliders
  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let maxY = 0;
    for (const room of rooms) {
      for (const p of room.polygon) {
        const x = p.x / 1000;
        const z = p.y / 1000;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      const top = room.floor * (room.height / 1000 + 0.3) + room.height / 1000;
      if (top > maxY) maxY = top;
    }
    const m = 1;
    return {
      minX: (minX === Infinity ? -5 : minX) - m,
      maxX: (maxX === -Infinity ? 15 : maxX) + m,
      minY: -0.1,
      maxY: Math.max(maxY + m, 4),
      minZ: (minZ === Infinity ? -5 : minZ) - m,
      maxZ: (maxZ === -Infinity ? 15 : maxZ) + m,
    };
  }, [rooms]);

  // Initial camera target (computed once from rooms)
  const initialCenter = useMemo(() => {
    if (rooms.length === 0) return { x: 5, y: 1.3, z: 5 };
    let cx = 0, cz = 0;
    for (const room of rooms) {
      const c = polygonCenter(room.polygon);
      cx += c.x / 1000;
      cz += c.y / 1000;
    }
    cx /= rooms.length;
    cz /= rooms.length;
    return { x: cx, y: 1.3, z: cz };
  }, [rooms]);

  // -----------------------------------------------------------------------
  // Initialize ThatOpen scene ONCE (prevents zoom glitch on selection)
  // -----------------------------------------------------------------------
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

    // Enable clipping planes
    const threeRenderer = world.renderer.three as THREE.WebGLRenderer;
    threeRenderer.localClippingEnabled = true;
    rendererRef.current = threeRenderer;

    // Background & lighting
    const scene = world.scene.three;
    scene.background = new THREE.Color(0xf5f5f4);
    scene.children
      .filter((c) => c instanceof THREE.Light)
      .forEach((l) => scene.remove(l));

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
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

    // Camera (use initial center from closure)
    const c = initialCenter;
    world.camera.controls.setLookAt(
      c.x + 12, 10, c.z + 12,
      c.x, c.y, c.z,
      true,
    );

    // Add model group
    scene.add(modelGroupRef.current);

    return () => {
      modelGroupRef.current.removeFromParent();
      components.dispose();
      componentsRef.current = null;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once — camera position captured from initialCenter closure

  // -----------------------------------------------------------------------
  // Update clipping planes
  // -----------------------------------------------------------------------
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const planes: THREE.Plane[] = [];
    if (sectionX !== null) planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), sectionX));
    if (sectionY !== null) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), sectionY));
    if (sectionZ !== null) planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), sectionZ));
    if (customClip) {
      planes.push(new THREE.Plane(
        new THREE.Vector3(customClip.nx, customClip.ny, customClip.nz),
        customClip.d,
      ));
    }
    renderer.clippingPlanes = planes;
  }, [sectionX, sectionY, sectionZ, customClip]);

  // -----------------------------------------------------------------------
  // Build/update 3D geometry
  // -----------------------------------------------------------------------
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

      // Ceiling
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

      // Offset polygons for each layer boundary
      const layerOffsets = [0];
      for (const layer of WALL_LAYERS) {
        layerOffsets.push(layerOffsets[layerOffsets.length - 1]! + layer.thickness);
      }
      const offsetPolys = layerOffsets.map((d) =>
        d === 0 ? poly : offsetPolygon(poly, d),
      );

      const roomWindows = windows.filter((w) => w.roomId === room.id);
      const roomDoors = doors.filter((d) => d.roomId === room.id);

      // Build walls per edge
      for (let i = 0; i < n; i++) {
        const ni = (i + 1) % n;
        const edgeLen = Math.hypot(poly[ni]!.x - poly[i]!.x, poly[ni]!.y - poly[i]!.y);
        if (edgeLen < 1) continue;
        const wallLenM = edgeLen / 1000;

        // Openings on this wall
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

        // Each layer
        for (let j = 0; j < WALL_LAYERS.length; j++) {
          const layer = WALL_LAYERS[j]!;
          const innerPoly = offsetPolys[j]!;
          const outerPoly = offsetPolys[j + 1]!;

          const iStart = { x: innerPoly[i]!.x / 1000, z: innerPoly[i]!.y / 1000 };
          const iEnd = { x: innerPoly[ni]!.x / 1000, z: innerPoly[ni]!.y / 1000 };
          const oStart = { x: outerPoly[i]!.x / 1000, z: outerPoly[i]!.y / 1000 };
          const oEnd = { x: outerPoly[ni]!.x / 1000, z: outerPoly[ni]!.y / 1000 };

          for (const piece of pieces) {
            const geom = createWallPieceGeom(iStart, iEnd, oStart, oEnd, piece);
            const mat = new THREE.MeshStandardMaterial({
              color: layer.color,
              side: THREE.DoubleSide,
              flatShading: true,
              roughness: 0.85,
              transparent: layer.opacity < 1,
              opacity: layer.opacity,
              depthWrite: layer.opacity >= 1,
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.y = floorY;
            if (layer.opacity < 1) mesh.renderOrder = 2;
            group.add(mesh);
          }
        }

        // Window glass panes (at wall mid-thickness)
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
            paneMesh.renderOrder = 3;
            group.add(paneMesh);
          }
        }
      }

      // Room label
      const center = polygonCenter(poly);
      const sprite = createLabelSprite(room.id, room.name, isSelected);
      sprite.position.set(center.x / 1000, floorY + h / 2, center.y / 1000);
      sprite.scale.set(2, 1, 1);
      group.add(sprite);
    }
  }, [rooms, windows, doors, selectedRoomId]);

  // -----------------------------------------------------------------------
  // Click handler (room selection + section-click)
  // -----------------------------------------------------------------------
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setCtxMenu(null); // close context menu on any click
      if (e.button !== 0) return;

      const container = containerRef.current;
      if (!container) return;

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

      // Section click mode: create section plane on clicked face
      if (sectionClickMode) {
        const allMeshes = modelGroupRef.current.children.filter(
          (c): c is THREE.Mesh => c instanceof THREE.Mesh,
        );
        const intersects = raycasterRef.current.intersectObjects(allMeshes, false);
        if (intersects.length > 0 && intersects[0]!.face) {
          const hit = intersects[0]!;
          const normal = hit.face!.normal.clone();
          const mesh = hit.object as THREE.Mesh;
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
          normal.applyMatrix3(normalMatrix).normalize();

          // Negate so we clip the camera-facing side (reveals interior)
          const d = normal.dot(hit.point);
          setCustomClip({ nx: -normal.x, ny: -normal.y, nz: -normal.z, d });
          setSectionClickMode(false);
        }
        return;
      }

      // Normal room selection
      const meshes = Array.from(roomMeshMapRef.current.keys());
      const intersects = raycasterRef.current.intersectObjects(meshes, false);
      if (intersects.length > 0) {
        const roomId = roomMeshMapRef.current.get(intersects[0]!.object as THREE.Mesh);
        if (roomId) { onSelectRoom(roomId); return; }
      }
      onSelectRoom(null);
    },
    [onSelectRoom, sectionClickMode],
  );

  // Right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const cursor = sectionClickMode ? "crosshair" : "default";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ cursor }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Section plane controls */}
      <div
        className="absolute left-3 bottom-3 z-10 flex flex-col gap-1.5 rounded-lg bg-white/95 p-3 shadow-lg backdrop-blur-sm text-xs select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold text-stone-700 text-[11px] tracking-wide uppercase">Doorsnede</div>

        <SectionRow label="X" enabled={sectionX !== null}
          value={sectionX ?? (bounds.minX + bounds.maxX) / 2}
          min={bounds.minX} max={bounds.maxX}
          onToggle={(on) => setSectionX(on ? (bounds.minX + bounds.maxX) / 2 : null)}
          onChange={setSectionX}
        />
        <SectionRow label="Y" enabled={sectionY !== null}
          value={sectionY ?? bounds.maxY / 2}
          min={bounds.minY} max={bounds.maxY}
          onToggle={(on) => setSectionY(on ? bounds.maxY / 2 : null)}
          onChange={setSectionY}
        />
        <SectionRow label="Z" enabled={sectionZ !== null}
          value={sectionZ ?? (bounds.minZ + bounds.maxZ) / 2}
          min={bounds.minZ} max={bounds.maxZ}
          onToggle={(on) => setSectionZ(on ? (bounds.minZ + bounds.maxZ) / 2 : null)}
          onChange={setSectionZ}
        />

        {customClip && (
          <div className="flex items-center gap-1 text-[10px] text-indigo-600">
            <span>Vlak-doorsnede actief</span>
            <button className="underline" onClick={() => setCustomClip(null)}>wis</button>
          </div>
        )}

        <div className="flex gap-1 mt-1 border-t border-stone-200 pt-1.5">
          <button
            className={`flex-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              sectionClickMode
                ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
            onClick={() => setSectionClickMode(!sectionClickMode)}
          >
            {sectionClickMode ? "Klik een vlak..." : "Vlak selecteren"}
          </button>
          <button
            className="rounded bg-stone-100 px-2 py-1 text-[10px] text-stone-500 hover:bg-stone-200 hover:text-stone-700"
            onClick={() => {
              setSectionX(null);
              setSectionY(null);
              setSectionZ(null);
              setCustomClip(null);
              setSectionClickMode(false);
            }}
          >
            Wis alles
          </button>
        </div>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg bg-white/95 py-1 shadow-xl backdrop-blur-sm text-xs"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={() => setCtxMenu(null)}
        >
          {selectedRoomId && (
            <>
              <button
                className="w-full px-3 py-1.5 text-left hover:bg-stone-100 text-stone-700"
                onClick={() => onDeleteRoom?.(selectedRoomId)}
              >
                Verwijder ruimte
              </button>
              <div className="my-0.5 border-t border-stone-200" />
            </>
          )}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-stone-100 text-stone-700"
            onClick={() => { setSectionClickMode(true); setCtxMenu(null); }}
          >
            Doorsnede op vlak
          </button>
          {(sectionX !== null || sectionY !== null || sectionZ !== null || customClip) && (
            <button
              className="w-full px-3 py-1.5 text-left hover:bg-stone-100 text-stone-500"
              onClick={() => {
                setSectionX(null); setSectionY(null); setSectionZ(null);
                setCustomClip(null); setSectionClickMode(false);
              }}
            >
              Wis doorsnedes
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section row sub-component
// ---------------------------------------------------------------------------

function SectionRow({ label, enabled, value, min, max, onToggle, onChange }: {
  label: string; enabled: boolean; value: number; min: number; max: number;
  onToggle: (on: boolean) => void; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-stone-300 accent-amber-500"
        />
        <span className="font-mono font-semibold text-stone-600 w-3">{label}</span>
      </label>
      {enabled && (
        <input
          type="range"
          min={min}
          max={max}
          step={(max - min) / 200}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-28 h-1.5 accent-amber-500"
        />
      )}
    </div>
  );
}

// =============================================================================
// Geometry helpers
// =============================================================================

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
// Wall pieces (segments around openings)
// ---------------------------------------------------------------------------

interface Opening {
  start: number;
  end: number;
  sillH: number;
  headH: number;
}

interface WallPiece {
  t1: number;
  t2: number;
  yBot: number;
  yTop: number;
}

function computeWallPieces(wallLen: number, wallH: number, openings: Opening[]): WallPiece[] {
  if (openings.length === 0) {
    return [{ t1: 0, t2: 1, yBot: 0, yTop: wallH }];
  }

  const pieces: WallPiece[] = [];
  let cursor = 0;

  for (const op of openings) {
    const tStart = Math.max(0, op.start) / wallLen;
    const tEnd = Math.min(wallLen, op.end) / wallLen;

    if (tStart > cursor + 0.001) {
      pieces.push({ t1: cursor, t2: tStart, yBot: 0, yTop: wallH });
    }
    if (op.sillH > 0.01) {
      pieces.push({ t1: tStart, t2: tEnd, yBot: 0, yTop: op.sillH });
    }
    if (op.headH < wallH - 0.01) {
      pieces.push({ t1: tStart, t2: tEnd, yBot: op.headH, yTop: wallH });
    }
    cursor = tEnd;
  }

  if (cursor < 1 - 0.001) {
    pieces.push({ t1: cursor, t2: 1, yBot: 0, yTop: wallH });
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// Wall piece 3D box geometry
// ---------------------------------------------------------------------------

interface XZ { x: number; z: number }

function lerpXZ(a: XZ, b: XZ, t: number): XZ {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function createWallPieceGeom(
  iStart: XZ, iEnd: XZ, oStart: XZ, oEnd: XZ,
  piece: WallPiece,
): THREE.BufferGeometry {
  const is = lerpXZ(iStart, iEnd, piece.t1);
  const ie = lerpXZ(iStart, iEnd, piece.t2);
  const os = lerpXZ(oStart, oEnd, piece.t1);
  const oe = lerpXZ(oStart, oEnd, piece.t2);
  const yb = piece.yBot;
  const yt = piece.yTop;

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

  const indices = new Uint16Array([
    0, 5, 4,  0, 1, 5,   // inner face
    3, 7, 6,  3, 6, 2,   // outer face
    4, 5, 6,  4, 6, 7,   // top
    0, 3, 2,  0, 2, 1,   // bottom
    0, 4, 7,  0, 7, 3,   // left cap
    1, 2, 6,  1, 6, 5,   // right cap
  ]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}

// ---------------------------------------------------------------------------
// Floor/ceiling polygon
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
  edgeStart: XZ, edgeEnd: XZ, wallLenM: number, win: ModelWindow,
): THREE.BufferGeometry | null {
  if (wallLenM < 0.001) return null;

  const tLeft = Math.max(0, (win.offset - win.width / 2) / 1000 / wallLenM);
  const tRight = Math.min(1, (win.offset + win.width / 2) / 1000 / wallLenM);

  const left = lerpXZ(edgeStart, edgeEnd, tLeft);
  const right = lerpXZ(edgeStart, edgeEnd, tRight);

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
