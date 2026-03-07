import type { ModelRoom, ModelWindow, Point2D } from "./types";
import { polygonArea, segmentsShareEdge } from "./geometry";

interface PropertiesPanelProps {
  room: ModelRoom | null;
  rooms: ModelRoom[];
  windows: ModelWindow[];
}

const FUNCTION_LABELS: Record<string, string> = {
  living_room: "Woonkamer",
  kitchen: "Keuken",
  bedroom: "Slaapkamer",
  bathroom: "Badkamer",
  toilet: "Toilet",
  hallway: "Hal / Gang",
  landing: "Overloop",
  storage: "Berging",
  attic: "Zolder",
  custom: "Overig",
};

export function PropertiesPanel({ room, rooms, windows }: PropertiesPanelProps) {
  if (!room) {
    return (
      <div className="w-72 shrink-0 border-l border-stone-200 bg-white p-4">
        <p className="text-xs text-stone-400">
          Selecteer een ruimte om de eigenschappen te bekijken.
        </p>
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
            Ruimten ({rooms.length})
          </h3>
          <ul className="space-y-1">
            {rooms.map((r) => (
              <li key={r.id} className="text-xs text-stone-600">
                <span className="font-mono font-medium">{r.id}</span>{" "}
                {r.name} — {(polygonArea(r.polygon) / 1e6).toFixed(1)} m²
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const area = polygonArea(room.polygon) / 1e6;
  const walls = getWallInfo(room, rooms, windows);

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-l border-stone-200 bg-white">
      {/* Header */}
      <div className="border-b border-stone-100 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-bold text-stone-800">{room.id}</span>
          <span className="text-sm text-stone-600">{room.name}</span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-3">
        {/* Properties */}
        <Section title="Eigenschappen">
          <dl className="space-y-1 text-xs">
            <Row label="Functie" value={FUNCTION_LABELS[room.function] ?? room.function} />
            <Row label="Vloeroppervlak" value={`${area.toFixed(2)} m\u00B2`} />
            <Row label="Hoogte" value={`${room.height} mm`} />
            <Row label="Volume" value={`${((area * room.height) / 1e3).toFixed(1)} m\u00B3`} />
          </dl>
        </Section>

        {/* Walls */}
        <Section title={`Wanden (${walls.length})`}>
          <div className="space-y-1.5">
            {walls.map((w, i) => (
              <WallCard key={i} wall={w} />
            ))}
          </div>
        </Section>

        {/* Floor */}
        <Section title="Vloer">
          <ConstructionCard
            label={`Vloer — ${area.toFixed(2)} m\u00B2`}
            badge="Grond"
            badgeColor="green"
          />
        </Section>

        {/* Ceiling / Roof */}
        <Section title="Plafond / Dak">
          <ConstructionCard
            label={`Plafond — ${area.toFixed(2)} m\u00B2`}
            badge="Verdieping"
            badgeColor="purple"
          />
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-stone-500">{label}</dt>
      <dd className="font-mono text-stone-800">{value}</dd>
    </div>
  );
}

interface WallInfo {
  direction: string;
  length: number;
  type: "exterior" | "interior";
  adjacentName: string | null;
  windowCount: number;
}

function WallCard({ wall }: { wall: WallInfo }) {
  return (
    <div className="rounded border border-stone-100 px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-700">
          {wall.direction} — {(wall.length / 1000).toFixed(2)} m
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            wall.type === "exterior"
              ? "bg-red-50 text-red-700"
              : "bg-blue-50 text-blue-700"
          }`}
        >
          {wall.type === "exterior" ? "Gevel" : wall.adjacentName ?? "Intern"}
        </span>
      </div>
      {wall.windowCount > 0 && (
        <div className="mt-0.5 text-blue-600">
          {wall.windowCount} kozijn{wall.windowCount > 1 ? "en" : ""}
        </div>
      )}
      <button className="mt-1 text-[10px] text-amber-600 hover:text-amber-800">
        Constructie toewijzen uit bibliotheek...
      </button>
    </div>
  );
}

function ConstructionCard({
  label,
  badge,
  badgeColor,
}: {
  label: string;
  badge: string;
  badgeColor: "green" | "purple";
}) {
  const colors =
    badgeColor === "green"
      ? "bg-green-50 text-green-700"
      : "bg-purple-50 text-purple-700";

  return (
    <div className="rounded border border-stone-100 px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-stone-700">{label}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors}`}>
          {badge}
        </span>
      </div>
      <button className="mt-1 text-[10px] text-amber-600 hover:text-amber-800">
        Constructie toewijzen uit bibliotheek...
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wall analysis
// ---------------------------------------------------------------------------

function getWallInfo(
  room: ModelRoom,
  allRooms: ModelRoom[],
  allWindows: ModelWindow[],
): WallInfo[] {
  const poly = room.polygon;
  const n = poly.length;
  const roomWindows = allWindows.filter((w) => w.roomId === room.id);
  const walls: WallInfo[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = poly[i]!;
    const b = poly[j]!;
    const length = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);

    // Direction based on outward normal
    const direction = wallDirection(poly, i);

    // Interior or exterior?
    let type: "exterior" | "interior" = "exterior";
    let adjacentName: string | null = null;
    for (const other of allRooms) {
      if (other.id === room.id) continue;
      if (hasSharedWall(a, b, other.polygon)) {
        type = "interior";
        adjacentName = other.name;
        break;
      }
    }

    const windowCount = roomWindows.filter((w) => w.wallIndex === i).length;

    walls.push({ direction, length, type, adjacentName, windowCount });
  }

  return walls;
}

function wallDirection(polygon: Point2D[], edgeIndex: number): string {
  const n = polygon.length;
  const a = polygon[edgeIndex]!;
  const b = polygon[(edgeIndex + 1) % n]!;

  // Room center
  const cx = polygon.reduce((s, p) => s + p.x, 0) / n;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / n;

  // Midpoint of wall
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;

  // Outward normal (rough)
  const nx = mx - cx;
  const ny = my - cy;

  if (Math.abs(nx) > Math.abs(ny)) {
    return nx > 0 ? "Oost" : "West";
  }
  // Y-down: ny > 0 means outward toward bottom = south
  return ny > 0 ? "Zuid" : "Noord";
}

function hasSharedWall(a: Point2D, b: Point2D, polygon: Point2D[]): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    if (segmentsShareEdge(a, b, polygon[i]!, polygon[(i + 1) % n]!)) return true;
  }
  return false;
}
