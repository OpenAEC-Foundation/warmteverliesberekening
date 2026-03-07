import { useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { ModelRoom, ModelWindow, Point2D } from "./types";
import { polygonCenter } from "./geometry";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FloorCanvas3DProps {
  rooms: ModelRoom[];
  windows: ModelWindow[];
  selectedRoomId: string | null;
  onSelectRoom: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// Color scheme
// ---------------------------------------------------------------------------

const FUNCTION_COLORS: Record<string, string> = {
  living_room: "#fef3c7",
  kitchen: "#fef9c3",
  bedroom: "#dbeafe",
  bathroom: "#cffafe",
  toilet: "#e0e7ff",
  hallway: "#f5f5f4",
  landing: "#f5f5f4",
  storage: "#e7e5e4",
  attic: "#fce7f3",
  custom: "#f3f4f6",
};

const WALL_COLOR = "#44403c";
const WALL_THICKNESS = 200; // mm
const SELECTED_COLOR = "#f59e0b";
const WINDOW_COLOR = "#60a5fa";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FloorCanvas3D({
  rooms,
  windows,
  selectedRoomId,
  onSelectRoom,
}: FloorCanvas3DProps) {
  // Calculate scene center for camera target
  const sceneCenter = useMemo(() => {
    if (rooms.length === 0) return [0, 0, 0] as const;
    let cx = 0, cy = 0;
    for (const room of rooms) {
      const c = polygonCenter(room.polygon);
      cx += c.x;
      cy += c.y;
    }
    cx /= rooms.length;
    cy /= rooms.length;
    const avgHeight = rooms.reduce((s, r) => s + r.height, 0) / rooms.length;
    return [cx / 1000, avgHeight / 2000, cy / 1000] as const;
  }, [rooms]);

  return (
    <div className="h-full w-full">
      <Canvas
        camera={{
          position: [
            sceneCenter[0] + 15,
            sceneCenter[1] + 12,
            sceneCenter[2] + 15,
          ],
          fov: 45,
          near: 0.1,
          far: 1000,
        }}
        onPointerMissed={() => onSelectRoom(null)}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[20, 30, 10]} intensity={0.8} castShadow />
        <directionalLight position={[-10, 20, -10]} intensity={0.3} />

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sceneCenter[0], -0.01, sceneCenter[2]]}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#e7e5e4" />
        </mesh>

        {/* Rooms */}
        {rooms.map((room) => (
          <RoomMesh
            key={room.id}
            room={room}
            isSelected={room.id === selectedRoomId}
            onSelect={() => onSelectRoom(room.id)}
          />
        ))}

        {/* Walls */}
        {rooms.map((room) => (
          <WallMeshes key={`walls-${room.id}`} room={room} />
        ))}

        {/* Windows */}
        {windows.map((win, i) => {
          const room = rooms.find((r) => r.id === win.roomId);
          if (!room) return null;
          return <WindowMesh key={i} room={room} window={win} />;
        })}

        {/* Room labels */}
        {rooms.map((room) => (
          <RoomLabel key={`label-${room.id}`} room={room} isSelected={room.id === selectedRoomId} />
        ))}

        <OrbitControls
          target={[sceneCenter[0], sceneCenter[1], sceneCenter[2]]}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={3}
          maxDistance={80}
        />
        <GridHelper center={sceneCenter} />
      </Canvas>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Room floor/ceiling mesh
// ---------------------------------------------------------------------------

function RoomMesh({
  room,
  isSelected,
  onSelect,
}: {
  room: ModelRoom;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const floorGeom = useMemo(() => createPolygonGeometry(room.polygon, 0), [room.polygon]);
  const ceilGeom = useMemo(
    () => createPolygonGeometry(room.polygon, room.height / 1000),
    [room.polygon, room.height],
  );

  const color = isSelected
    ? SELECTED_COLOR
    : FUNCTION_COLORS[room.function] ?? FUNCTION_COLORS.custom;

  const floorY = room.floor * (room.height / 1000 + 0.3);

  return (
    <group position={[0, floorY, 0]}>
      {/* Floor */}
      <mesh geometry={floorGeom} onClick={onSelect}>
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      {/* Ceiling — slightly transparent */}
      <mesh geometry={ceilGeom} onClick={onSelect}>
        <meshStandardMaterial color="#f5f5f4" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Wall meshes (thick outlines extruded vertically)
// ---------------------------------------------------------------------------

function WallMeshes({ room }: { room: ModelRoom }) {
  const wallGeometries = useMemo(() => {
    const geoms: { geometry: THREE.BufferGeometry; position: [number, number, number] }[] = [];
    const poly = room.polygon;
    const n = poly.length;
    const h = room.height / 1000;
    const t = WALL_THICKNESS / 1000;

    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % n]!;

      const ax = a.x / 1000;
      const az = a.y / 1000;
      const bx = b.x / 1000;
      const bz = b.y / 1000;

      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;

      // Normal pointing outward (perpendicular to edge)
      const nx = -dz / len;
      const nz = dx / len;

      geoms.push({
        geometry: createWallGeometry(ax, az, bx, bz, h, t, nx, nz),
        position: [0, 0, 0] as [number, number, number],
      });
    }

    return geoms;
  }, [room.polygon, room.height]);

  const floorY = room.floor * (room.height / 1000 + 0.3);

  return (
    <group position={[0, floorY, 0]}>
      {wallGeometries.map((w, i) => (
        <mesh key={i} geometry={w.geometry} position={w.position}>
          <meshStandardMaterial color={WALL_COLOR} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Window mesh (blue rectangle on wall)
// ---------------------------------------------------------------------------

function WindowMesh({ room, window: win }: { room: ModelRoom; window: ModelWindow }) {
  const geometry = useMemo(() => {
    const poly = room.polygon;
    const n = poly.length;
    const idx = win.wallIndex % n;
    const a = poly[idx]!;
    const b = poly[(idx + 1) % n]!;

    const ax = a.x / 1000;
    const az = a.y / 1000;
    const bx = b.x / 1000;
    const bz = b.y / 1000;

    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return null;

    const ux = dx / len;
    const uz = dz / len;
    const nx = -dz / len;
    const nz = dx / len;

    const offset = win.offset / 1000;
    const hw = (win.width / 2) / 1000;
    const t = WALL_THICKNESS / 1000;

    // Window center on the wall
    const cx = ax + ux * offset + nx * t;
    const cz = az + uz * offset + nz * t;

    // Window rectangle: from 0.8m to 2.0m height, width = win.width
    const sillH = 0.8;
    const headH = 2.0;

    const geom = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      // p0: left bottom
      cx - ux * hw, sillH, cz - uz * hw,
      // p1: right bottom
      cx + ux * hw, sillH, cz + uz * hw,
      // p2: right top
      cx + ux * hw, headH, cz + uz * hw,
      // p3: left top
      cx - ux * hw, headH, cz - uz * hw,
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    return geom;
  }, [room.polygon, win]);

  if (!geometry) return null;

  const floorY = room.floor * (room.height / 1000 + 0.3);

  return (
    <mesh geometry={geometry} position={[0, floorY, 0]}>
      <meshStandardMaterial color={WINDOW_COLOR} transparent opacity={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Room label (floating text sprite)
// ---------------------------------------------------------------------------

function RoomLabel({ room, isSelected }: { room: ModelRoom; isSelected: boolean }) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const { gl } = useThree();

  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.clearRect(0, 0, 256, 128);

    // Background
    ctx.fillStyle = isSelected ? "rgba(245, 158, 11, 0.85)" : "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 112, 8);
    ctx.fill();

    // Room ID
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(room.id, 128, 40);

    // Room name
    ctx.font = "24px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(room.name, 128, 80);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [room.id, room.name, isSelected, gl]);

  const center = polygonCenter(room.polygon);
  const floorY = room.floor * (room.height / 1000 + 0.3);

  if (!texture) return null;

  return (
    <sprite
      ref={spriteRef}
      position={[center.x / 1000, floorY + room.height / 2000, center.y / 1000]}
      scale={[2.5, 1.25, 1]}
    >
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

// ---------------------------------------------------------------------------
// Grid helper
// ---------------------------------------------------------------------------

function GridHelper({ center }: { center: readonly [number, number, number] }) {
  return (
    <gridHelper
      args={[50, 50, "#d6d3d1", "#e7e5e4"]}
      position={[center[0], 0, center[2]]}
    />
  );
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Create a flat polygon geometry from 2D points at given Y height. */
function createPolygonGeometry(polygon: Point2D[], yHeight: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const p0 = polygon[0]!;
  shape.moveTo(p0.x / 1000, p0.y / 1000);
  for (let i = 1; i < polygon.length; i++) {
    const p = polygon[i]!;
    shape.lineTo(p.x / 1000, p.y / 1000);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  // ShapeGeometry creates in XY plane; rotate to XZ (floor) plane
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, yHeight, 0);
  return geom;
}

/** Create wall geometry as a thin box between two points. */
function createWallGeometry(
  ax: number, az: number,
  bx: number, bz: number,
  h: number,
  t: number,
  nx: number, nz: number,
): THREE.BufferGeometry {
  // 8 vertices: 4 bottom, 4 top
  // Inner edge (room side) and outer edge (offset by normal * t)
  const vertices = new Float32Array([
    // Bottom inner
    ax, 0, az,
    bx, 0, bz,
    // Bottom outer
    ax + nx * t, 0, az + nz * t,
    bx + nx * t, 0, bz + nz * t,
    // Top inner
    ax, h, az,
    bx, h, bz,
    // Top outer
    ax + nx * t, h, az + nz * t,
    bx + nx * t, h, bz + nz * t,
  ]);

  const indices = new Uint16Array([
    // Outer face
    2, 3, 7, 2, 7, 6,
    // Inner face
    1, 0, 4, 1, 4, 5,
    // Left cap
    0, 2, 6, 0, 6, 4,
    // Right cap
    3, 1, 5, 3, 5, 7,
    // Top
    4, 6, 7, 4, 7, 5,
    // Bottom
    0, 1, 3, 0, 3, 2,
  ]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  geom.computeVertexNormals();
  return geom;
}
