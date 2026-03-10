/**
 * IFC importer for the 2D modeller.
 *
 * Reads IFC2x3/IFC4 files via web-ifc, extracts IfcSpace entities,
 * and converts them to ModelRoom[] with 2D polygons.
 *
 * Architecture:
 *   Per IfcSpace → classifyRepresentationItems → per-item extractor
 *   → merge multi-item → mesh fallback → floor assignment → validate
 *
 * Supports: SweptSolid, FacetedBrep, FaceBasedSurfaceModel, multi-item merge.
 */
import * as WebIfc from "web-ifc";

import type { ModelRoom, Point2D } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_UNIT_TO_MM = 1000; // fallback: assume meters
const MIN_ROOM_AREA_MM2 = 500_000; // 0.5 m2
const MIN_POLYGON_POINTS = 3;
const FLOOR_HEIGHT_DEFAULT_MM = 2600;

// web-ifc entity type constants
const IFCSPACE = WebIfc.IFCSPACE;
const IFCBUILDINGSTOREY = WebIfc.IFCBUILDINGSTOREY;
const IFCPROJECT = WebIfc.IFCPROJECT;
const IFCEXTRUDEDAREASOLID = WebIfc.IFCEXTRUDEDAREASOLID;
const IFCARBITRARYCLOSEDPROFILEDEF = WebIfc.IFCARBITRARYCLOSEDPROFILEDEF;
const IFCRECTANGLEPROFILEDEF = WebIfc.IFCRECTANGLEPROFILEDEF;
const IFCPOLYLINE = WebIfc.IFCPOLYLINE;
const IFCFACETEDBREP = WebIfc.IFCFACETEDBREP;
const IFCFACEBASEDSURFACEMODEL = WebIfc.IFCFACEBASEDSURFACEMODEL;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

type GeometryKind = "SweptSolid" | "FacetedBrep" | "SurfaceModel" | "Unknown";

interface RepresentationItemInfo {
  expressId: number;
  ifcType: number;
  kind: GeometryKind;
}

interface ItemExtractionResult {
  /** Floor polygon in local coordinate system, converted to mm. */
  polygon: Point2D[];
  /** Room height in mm. */
  height: number;
  kind: GeometryKind;
}

interface SpaceDiagnostic {
  spaceId: number;
  spaceName: string;
  items: {
    expressId: number;
    kind: GeometryKind;
    success: boolean;
    reason?: string;
  }[];
  finalStrategy: GeometryKind | "merged" | "mesh-fallback" | "none";
  polygonPoints: number;
  areaMm2: number;
}

export interface IfcImportResult {
  rooms: Omit<ModelRoom, "id">[];
  warnings: { spaceName: string; message: string }[];
  diagnostics: SpaceDiagnostic[];
  stats: { spacesFound: number; spacesImported: number; spacesSkipped: number };
}

// ---------------------------------------------------------------------------
// IfcAPI singleton with lazy init
// ---------------------------------------------------------------------------

let apiInstance: WebIfc.IfcAPI | null = null;

async function getIfcApi(): Promise<WebIfc.IfcAPI> {
  if (apiInstance) return apiInstance;

  const api = new WebIfc.IfcAPI();
  api.SetWasmPath("/wasm/");
  await api.Init();
  apiInstance = api;
  return api;
}

// ---------------------------------------------------------------------------
// Keyword → room function mapping
// ---------------------------------------------------------------------------

const FUNCTION_KEYWORDS: [RegExp, string][] = [
  [/woonkamer|huiskamer|living|zitkamer/i, "woonkamer"],
  [/slaapkamer|bedroom/i, "slaapkamer"],
  [/keuken|kitchen/i, "keuken"],
  [/badkamer|bathroom/i, "badkamer"],
  [/toilet|wc/i, "toilet"],
  [/hal|gang|entree|corridor|overloop/i, "hal"],
  [/berging|storage|opslag/i, "berging"],
  [/garage/i, "garage"],
  [/kantoor|office|studeerkamer|werkruimte/i, "kantoor"],
  [/wasruimte|laundry|bijkeuken/i, "bijkeuken"],
  [/zolder|attic/i, "zolder"],
  [/kelder|basement|souterrain/i, "kelder"],
];

function matchRoomFunction(name: string): string {
  for (const [pattern, func] of FUNCTION_KEYWORDS) {
    if (pattern.test(name)) return func;
  }
  return "custom";
}

// ---------------------------------------------------------------------------
// IFC length unit detection
// ---------------------------------------------------------------------------

/** SI prefix → multiplier to get base unit (meters). */
const SI_PREFIX_FACTOR: Record<string, number> = {
  ".EXA.": 1e18,  ".PETA.": 1e15, ".TERA.": 1e12, ".GIGA.": 1e9,
  ".MEGA.": 1e6,  ".KILO.": 1e3,  ".HECTO.": 1e2, ".DECA.": 1e1,
  ".DECI.": 1e-1, ".CENTI.": 1e-2, ".MILLI.": 1e-3, ".MICRO.": 1e-6,
  ".NANO.": 1e-9, ".PICO.": 1e-12,
};

/**
 * Detect the IFC file's length unit and return the conversion factor to mm.
 * Falls back to 1000 (assumes meters) when detection fails.
 */
function detectUnitToMm(api: WebIfc.IfcAPI, modelId: number): number {
  try {
    const projectIds = api.GetLineIDsWithType(modelId, IFCPROJECT);
    if (projectIds.size() === 0) return DEFAULT_UNIT_TO_MM;

    const project = api.GetLine(modelId, projectIds.get(0));
    const unitsCtxRef = project?.UnitsInContext;
    const unitsAssignment = unitsCtxRef?.value != null
      ? api.GetLine(modelId, unitsCtxRef.value)
      : unitsCtxRef;

    const units = unitsAssignment?.Units;
    if (!Array.isArray(units)) return DEFAULT_UNIT_TO_MM;

    for (const unitRef of units) {
      const unit = unitRef?.value != null
        ? api.GetLine(modelId, unitRef.value)
        : unitRef;
      if (!unit) continue;

      const unitType = String(unit.UnitType?.value ?? "");
      if (!unitType.includes("LENGTHUNIT")) continue;

      // IfcSIUnit: check prefix to determine scale
      const prefix = String(unit.Prefix?.value ?? "");
      if (prefix && prefix !== "undefined" && prefix !== "null") {
        const key = prefix.startsWith(".") ? prefix : `.${prefix}.`;
        const factor = SI_PREFIX_FACTOR[key.toUpperCase()];
        if (factor !== undefined) {
          // prefix gives base-unit fraction → meters * 1000 = mm
          return factor * 1000;
        }
      }

      // IfcConversionBasedUnit: check ConversionFactor
      const convFactor = unit.ConversionFactor;
      if (convFactor?.value != null) {
        const measure = api.GetLine(modelId, convFactor.value);
        const val = Number(
          measure?.ValueComponent?.value ?? measure?.ValueComponent ?? 1,
        );
        // val is the conversion to SI meters
        return val * 1000;
      }

      // No prefix, no conversion → base SI = meters
      return 1000;
    }
  } catch {
    // Detection failed
  }
  return DEFAULT_UNIT_TO_MM;
}

// ---------------------------------------------------------------------------
// Coordinate transform: IFC → Modeller (mm, Y-down screen)
// ---------------------------------------------------------------------------

function ifcToModeller(x: number, y: number, unitToMm: number): Point2D {
  return { x: x * unitToMm, y: -y * unitToMm };
}

// ---------------------------------------------------------------------------
// Polygon area (2D, signed) for filtering degenerate spaces
// ---------------------------------------------------------------------------

function polygonAreaMm2(polygon: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    area += pi.x * pj.y;
    area -= pj.x * pi.y;
  }
  return Math.abs(area / 2);
}

// ---------------------------------------------------------------------------
// Spatial structure: extract storey elevations for floor index assignment
// ---------------------------------------------------------------------------

interface StoreyInfo {
  expressId: number;
  elevation: number;
  floorIndex: number;
  childSpaceIds: Set<number>;
}

function extractStoreys(
  api: WebIfc.IfcAPI,
  modelId: number,
): Map<number, StoreyInfo> {
  const storeyMap = new Map<number, StoreyInfo>();
  const storeyIds = api.GetLineIDsWithType(modelId, IFCBUILDINGSTOREY);
  const storeys: { expressId: number; elevation: number }[] = [];

  for (let i = 0; i < storeyIds.size(); i++) {
    const id = storeyIds.get(i);
    const props = api.GetLine(modelId, id);
    const elevation = props?.Elevation?.value ?? 0;
    storeys.push({ expressId: id, elevation: Number(elevation) });
  }

  // Sort by elevation ascending → floor index 0, 1, 2...
  storeys.sort((a, b) => a.elevation - b.elevation);

  for (let idx = 0; idx < storeys.length; idx++) {
    const s = storeys[idx]!;
    storeyMap.set(s.expressId, {
      expressId: s.expressId,
      elevation: s.elevation,
      floorIndex: idx,
      childSpaceIds: new Set(),
    });
  }

  return storeyMap;
}

interface FloorAssignment {
  floorIndex: number;
  /** Storey elevation in meters (IFC units). */
  elevationMeters: number | undefined;
}

function findFloorForSpace(
  api: WebIfc.IfcAPI,
  modelId: number,
  spaceId: number,
  storeyMap: Map<number, StoreyInfo>,
): FloorAssignment {
  // Walk spatial containment: IfcSpace is typically contained in IfcBuildingStorey
  // via IfcRelContainedInSpatialStructure or IfcRelAggregates.
  try {
    const spaceProps = api.GetLine(modelId, spaceId);
    // Check IfcRelAggregates / Decomposes
    const decomposes = spaceProps?.Decomposes;
    if (decomposes) {
      const rels = Array.isArray(decomposes) ? decomposes : [decomposes];
      for (const rel of rels) {
        const relObj = rel?.value != null
          ? api.GetLine(modelId, rel.value)
          : null;
        if (relObj?.RelatingObject?.value != null) {
          const parentId = relObj.RelatingObject.value;
          if (storeyMap.has(parentId)) {
            const storey = storeyMap.get(parentId)!;
            return {
              floorIndex: storey.floorIndex,
              elevationMeters: storey.elevation,
            };
          }
        }
      }
    }
  } catch {
    // Spatial lookup failed — fall through to fallback
  }

  // Fallback: floor 0, no elevation
  return { floorIndex: 0, elevationMeters: undefined };
}

// ---------------------------------------------------------------------------
// Representation item classification
// ---------------------------------------------------------------------------

/**
 * Walk the ShapeRepresentation.Items[] of an IfcSpace and classify each
 * item by its IFC geometry type. Gives upfront insight into what needs
 * parsing, rather than blindly attempting strategies.
 */
function classifyRepresentationItems(
  api: WebIfc.IfcAPI,
  modelId: number,
  spaceId: number,
): RepresentationItemInfo[] {
  const items: RepresentationItemInfo[] = [];

  try {
    const space = api.GetLine(modelId, spaceId);
    const representation = space?.Representation;
    if (!representation) return items;

    const reps =
      representation.Representations ??
      representation.value?.Representations;
    const repList = Array.isArray(reps) ? reps : [];

    for (const repRef of repList) {
      const rep =
        repRef?.value != null
          ? api.GetLine(modelId, repRef.value)
          : repRef;
      const repItems = rep?.Items ?? [];
      const itemList = Array.isArray(repItems) ? repItems : [];

      for (const itemRef of itemList) {
        const expressId: number =
          itemRef?.value != null ? itemRef.value : itemRef?.expressID;
        if (expressId == null) continue;

        const item =
          itemRef?.value != null
            ? api.GetLine(modelId, expressId)
            : itemRef;
        if (!item) continue;

        const ifcType: number = item.type ?? 0;

        let kind: GeometryKind;
        if (
          ifcType === IFCEXTRUDEDAREASOLID ||
          item.Depth != null
        ) {
          kind = "SweptSolid";
        } else if (ifcType === IFCFACETEDBREP) {
          kind = "FacetedBrep";
        } else if (ifcType === IFCFACEBASEDSURFACEMODEL) {
          kind = "SurfaceModel";
        } else {
          kind = "Unknown";
        }

        items.push({ expressId, ifcType, kind });
      }
    }
  } catch (err) {
    console.warn(
      `[IFC] classifyRepresentationItems failed for #${spaceId}:`,
      err,
    );
  }

  return items;
}

// ---------------------------------------------------------------------------
// Per-item extractor: SweptSolid (IfcExtrudedAreaSolid)
// ---------------------------------------------------------------------------

/**
 * Extract floor polygon from a single IfcExtrudedAreaSolid item.
 * Returns polygon in LOCAL coordinates (file units → mm, Y-down).
 * ObjectPlacement transform is NOT applied here — the orchestrator does that.
 */
function extractSweptSolid(
  api: WebIfc.IfcAPI,
  modelId: number,
  itemExpressId: number,
  unitToMm: number,
): ItemExtractionResult | null {
  try {
    const item = api.GetLine(modelId, itemExpressId);
    if (!item) return null;

    const depth = Number(item.Depth?.value ?? item.Depth ?? 0);
    const height = depth > 0 ? depth * unitToMm : FLOOR_HEIGHT_DEFAULT_MM;

    const sweptArea =
      item.SweptArea?.value != null
        ? api.GetLine(modelId, item.SweptArea.value)
        : item.SweptArea;
    if (!sweptArea) return null;

    const polygon = extractPolygonFromProfile(
      api,
      modelId,
      sweptArea,
      unitToMm,
    );
    if (!polygon || polygon.length < MIN_POLYGON_POINTS) return null;

    // Apply extrusion's own Position (profile → representation space)
    let extrusionPos = IDENTITY_TRANSFORM;
    const posRef = item.Position;
    if (posRef?.value != null) {
      extrusionPos = extractAxisPlacement2D(
        api,
        modelId,
        posRef.value,
        unitToMm,
      );
    }

    const transformed = polygon.map((p) =>
      applyTransform2D(p, extrusionPos),
    );

    return { polygon: transformed, height, kind: "SweptSolid" };
  } catch (err) {
    console.warn(
      `[IFC] extractSweptSolid failed for item #${itemExpressId}:`,
      err,
    );
    return null;
  }
}

function extractPolygonFromProfile(
  api: WebIfc.IfcAPI,
  modelId: number,
  profile: Record<string, unknown>,
  unitToMm: number,
): Point2D[] | null {
  const profileType = (profile as { type?: number }).type;

  // IfcArbitraryClosedProfileDef → OuterCurve → IfcPolyline
  if (
    profileType === IFCARBITRARYCLOSEDPROFILEDEF ||
    (profile as { OuterCurve?: unknown }).OuterCurve
  ) {
    const curveRef = (profile as { OuterCurve?: { value?: number } })
      .OuterCurve;
    const curve =
      curveRef?.value != null
        ? api.GetLine(modelId, curveRef.value)
        : curveRef;
    if (!curve) return null;

    return extractPointsFromCurve(
      api,
      modelId,
      curve as Record<string, unknown>,
      unitToMm,
    );
  }

  // IfcRectangleProfileDef → generate 4-point rectangle
  if (
    profileType === IFCRECTANGLEPROFILEDEF ||
    (profile as { XDim?: unknown }).XDim
  ) {
    const xDim = Number(
      (profile as { XDim?: { value?: number } }).XDim?.value ??
        (profile as { XDim?: number }).XDim ??
        0,
    );
    const yDim = Number(
      (profile as { YDim?: { value?: number } }).YDim?.value ??
        (profile as { YDim?: number }).YDim ??
        0,
    );
    if (xDim <= 0 || yDim <= 0) return null;

    const hw = xDim / 2;
    const hh = yDim / 2;
    return [
      ifcToModeller(-hw, -hh, unitToMm),
      ifcToModeller(hw, -hh, unitToMm),
      ifcToModeller(hw, hh, unitToMm),
      ifcToModeller(-hw, hh, unitToMm),
    ];
  }

  return null;
}

function extractPointsFromCurve(
  api: WebIfc.IfcAPI,
  modelId: number,
  curve: Record<string, unknown>,
  unitToMm: number,
): Point2D[] | null {
  const curveType = (curve as { type?: number }).type;

  // IfcPolyline → Points
  if (curveType === IFCPOLYLINE || (curve as { Points?: unknown }).Points) {
    const pointRefs = (curve as { Points?: unknown[] }).Points;
    if (!Array.isArray(pointRefs)) return null;

    const points: Point2D[] = [];
    for (const pRef of pointRefs) {
      const p =
        (pRef as { value?: number })?.value != null
          ? api.GetLine(
              modelId,
              (pRef as { value: number }).value,
            )
          : pRef;

      const coords = (p as { Coordinates?: unknown[] })?.Coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;

      const x = Number(
        (coords[0] as { value?: number })?.value ?? coords[0],
      );
      const y = Number(
        (coords[1] as { value?: number })?.value ?? coords[1],
      );

      points.push(ifcToModeller(x, y, unitToMm));
    }

    // Remove duplicate closing point if present
    if (points.length > 1) {
      const first = points[0]!;
      const last = points[points.length - 1]!;
      if (
        Math.abs(first.x - last.x) < 0.1 &&
        Math.abs(first.y - last.y) < 0.1
      ) {
        points.pop();
      }
    }

    return points.length >= MIN_POLYGON_POINTS ? points : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared helper: extract horizontal faces from a list of IfcFace refs
// ---------------------------------------------------------------------------

/**
 * Parse a list of IfcFace references and return all horizontal faces
 * (where all Z-values are within tolerance). Used by both FacetedBrep
 * and FaceBasedSurfaceModel extractors.
 */
function extractHorizontalFaces(
  api: WebIfc.IfcAPI,
  modelId: number,
  faceRefs: unknown[],
  zToleranceFileUnits: number,
): { z: number; points: { x: number; y: number; z: number }[] }[] {
  const result: { z: number; points: { x: number; y: number; z: number }[] }[] = [];

  for (const faceRef of faceRefs) {
    const face =
      (faceRef as { value?: number })?.value != null
        ? api.GetLine(
            modelId,
            (faceRef as { value: number }).value,
          )
        : faceRef;
    const bounds = (face as { Bounds?: unknown[] })?.Bounds ?? [];
    const boundList = Array.isArray(bounds) ? bounds : [];

    for (const boundRef of boundList) {
      const bound =
        (boundRef as { value?: number })?.value != null
          ? api.GetLine(
              modelId,
              (boundRef as { value: number }).value,
            )
          : boundRef;
      const loopRef = (bound as { Bound?: { value?: number } })?.Bound;
      const loop =
        loopRef?.value != null
          ? api.GetLine(modelId, loopRef.value)
          : loopRef;
      if (!loop) continue;

      const polyPoints =
        (loop as { Polygon?: unknown[] })?.Polygon ?? [];
      const pointList = Array.isArray(polyPoints) ? polyPoints : [];
      const pts: { x: number; y: number; z: number }[] = [];

      for (const ptRef of pointList) {
        const pt =
          (ptRef as { value?: number })?.value != null
            ? api.GetLine(
                modelId,
                (ptRef as { value: number }).value,
              )
            : ptRef;
        const coords =
          (pt as { Coordinates?: unknown[] })?.Coordinates ?? [];
        const coordList = Array.isArray(coords) ? coords : [];
        if (coordList.length < 3) continue;

        pts.push({
          x: Number(
            (coordList[0] as { value?: number })?.value ?? coordList[0],
          ),
          y: Number(
            (coordList[1] as { value?: number })?.value ?? coordList[1],
          ),
          z: Number(
            (coordList[2] as { value?: number })?.value ?? coordList[2],
          ),
        });
      }

      if (pts.length < MIN_POLYGON_POINTS) continue;

      // Check if face is horizontal (all Z values similar)
      const avgZ = pts.reduce((sum, p) => sum + p.z, 0) / pts.length;
      const isHorizontal = pts.every(
        (p) => Math.abs(p.z - avgZ) < zToleranceFileUnits,
      );
      if (isHorizontal) {
        result.push({ z: avgZ, points: pts });
      }
    }
  }

  return result;
}

/**
 * Build an ItemExtractionResult from horizontal faces (lowest = floor,
 * highest = ceiling). Shared by FacetedBrep and SurfaceModel extractors.
 */
function resultFromHorizontalFaces(
  facesWithZ: { z: number; points: { x: number; y: number; z: number }[] }[],
  unitToMm: number,
  kind: GeometryKind,
): ItemExtractionResult | null {
  if (facesWithZ.length === 0) return null;

  // Sort by Z, pick lowest (floor) and highest (ceiling) for height
  facesWithZ.sort((a, b) => a.z - b.z);
  const floorFace = facesWithZ[0]!;
  const ceilingFace = facesWithZ[facesWithZ.length - 1]!;
  const height = (ceilingFace.z - floorFace.z) * unitToMm;

  // Convert floor face to 2D (NO placement transform — orchestrator does that)
  const polygon = floorFace.points.map((p) => ifcToModeller(p.x, p.y, unitToMm));

  if (polygon.length < MIN_POLYGON_POINTS) return null;

  return {
    polygon,
    height: height > 0 ? height : FLOOR_HEIGHT_DEFAULT_MM,
    kind,
  };
}

// ---------------------------------------------------------------------------
// Per-item extractor: FacetedBrep (IfcFacetedBrep)
// ---------------------------------------------------------------------------

/**
 * Extract floor polygon from a single IfcFacetedBrep item.
 * Returns polygon in LOCAL coordinates (file units → mm, Y-down).
 */
function extractFacetedBrep(
  api: WebIfc.IfcAPI,
  modelId: number,
  itemExpressId: number,
  unitToMm: number,
): ItemExtractionResult | null {
  try {
    const item = api.GetLine(modelId, itemExpressId);
    if (!item) return null;

    // Get the ClosedShell → CfsFaces
    const shellRef = item.Outer;
    const shell =
      shellRef?.value != null
        ? api.GetLine(modelId, shellRef.value)
        : shellRef;
    if (!shell) return null;

    const faces = shell.CfsFaces ?? [];
    const faceList = Array.isArray(faces) ? faces : [];

    const horizontalFaces = extractHorizontalFaces(
      api,
      modelId,
      faceList,
      0.01,
    );

    return resultFromHorizontalFaces(horizontalFaces, unitToMm, "FacetedBrep");
  } catch (err) {
    console.warn(
      `[IFC] extractFacetedBrep failed for item #${itemExpressId}:`,
      err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Per-item extractor: SurfaceModel (IfcFaceBasedSurfaceModel) — NEW
// ---------------------------------------------------------------------------

/**
 * Extract floor polygon from a single IfcFaceBasedSurfaceModel item.
 * Returns polygon in LOCAL coordinates (file units → mm, Y-down).
 *
 * IFC structure:
 *   IfcFaceBasedSurfaceModel
 *     .FbsmFaces → IfcConnectedFaceSet[]
 *       .CfsFaces → IfcFace[]   ← same structure as FacetedBrep
 */
function extractSurfaceModel(
  api: WebIfc.IfcAPI,
  modelId: number,
  itemExpressId: number,
  unitToMm: number,
): ItemExtractionResult | null {
  try {
    const item = api.GetLine(modelId, itemExpressId);
    if (!item) return null;

    // FbsmFaces is an array of IfcConnectedFaceSet references
    const fbsmFaces = item.FbsmFaces ?? [];
    const faceSetRefs = Array.isArray(fbsmFaces) ? fbsmFaces : [];

    const allHorizontalFaces: {
      z: number;
      points: { x: number; y: number; z: number }[];
    }[] = [];

    for (const faceSetRef of faceSetRefs) {
      const faceSet =
        (faceSetRef as { value?: number })?.value != null
          ? api.GetLine(
              modelId,
              (faceSetRef as { value: number }).value,
            )
          : faceSetRef;
      if (!faceSet) continue;

      const faces =
        (faceSet as { CfsFaces?: unknown[] })?.CfsFaces ?? [];
      const faceList = Array.isArray(faces) ? faces : [];

      const horizontal = extractHorizontalFaces(
        api,
        modelId,
        faceList,
        0.01,
      );
      allHorizontalFaces.push(...horizontal);
    }

    return resultFromHorizontalFaces(
      allHorizontalFaces,
      unitToMm,
      "SurfaceModel",
    );
  } catch (err) {
    console.warn(
      `[IFC] extractSurfaceModel failed for item #${itemExpressId}:`,
      err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mesh extraction via GetFlatMesh (fallback strategy)
//
// GetFlatMesh returns geometry with a per-geometry 4x4 transform matrix
// (flatTransformation) that places vertices in global model space.
// ---------------------------------------------------------------------------

const VERTEX_STRIDE = 6; // x, y, z, nx, ny, nz per vertex
/** 50mm tolerance for "same Z level". */
const Z_TOLERANCE_MM = 50;
/**
 * GetFlatMesh always returns vertices in meters (web-ifc normalizes
 * internally), regardless of the IFC file's declared length unit.
 */
const MESH_UNIT_TO_MM = 1000;

interface MeshExtractionResult {
  polygon: Point2D[];
  height: number;
  /** Floor elevation in mm (from mesh Y-axis). Used for storey matching. */
  floorElevationMm: number;
}

/**
 * Extract a floor polygon from GetFlatMesh. Already in global space
 * (no ObjectPlacement needed). Used as fallback when direct parsing fails.
 */
function extractFromFlatMesh(
  api: WebIfc.IfcAPI,
  modelId: number,
  spaceId: number,
): MeshExtractionResult | null {
  try {
    const flatMesh = api.GetFlatMesh(modelId, spaceId);
    if (!flatMesh || flatMesh.geometries.size() === 0) return null;

    // Collect all vertices and triangle indices, applying flatTransformation
    const allVertices: { x: number; y: number; z: number }[] = [];
    const allIndices: number[] = [];

    for (let g = 0; g < flatMesh.geometries.size(); g++) {
      const geom = flatMesh.geometries.get(g);
      const meshData = api.GetGeometry(modelId, geom.geometryExpressID);

      const vertexData = api.GetVertexArray(
        meshData.GetVertexData(),
        meshData.GetVertexDataSize(),
      );
      const indexData = api.GetIndexArray(
        meshData.GetIndexData(),
        meshData.GetIndexDataSize(),
      );

      // 4x4 column-major transformation matrix (local → global)
      const m = geom.flatTransformation;
      const baseIndex = allVertices.length;

      for (let v = 0; v + 2 < vertexData.length; v += VERTEX_STRIDE) {
        const lx = vertexData[v]!;
        const ly = vertexData[v + 1]!;
        const lz = vertexData[v + 2]!;
        // Apply 4x4 column-major matrix: M * [lx, ly, lz, 1]
        allVertices.push({
          x: m[0]! * lx + m[4]! * ly + m[8]! * lz + m[12]!,
          y: m[1]! * lx + m[5]! * ly + m[9]! * lz + m[13]!,
          z: m[2]! * lx + m[6]! * ly + m[10]! * lz + m[14]!,
        });
      }

      // Offset indices to global vertex array
      for (let i = 0; i < indexData.length; i++) {
        allIndices.push(indexData[i]! + baseIndex);
      }

      meshData.delete();
    }

    if (allVertices.length < MIN_POLYGON_POINTS) return null;

    // web-ifc GetFlatMesh uses Y-up (WebGL convention):
    // X,Z = floor plan, Y = height
    let minY = Infinity;
    let maxY = -Infinity;
    for (const v of allVertices) {
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    const height = (maxY - minY) * MESH_UNIT_TO_MM;
    const floorElevationMm = Math.round(minY * MESH_UNIT_TO_MM);
    const yTol = Z_TOLERANCE_MM / MESH_UNIT_TO_MM; // 0.05m = 50mm

    // Try to extract accurate floor polygon outline from mesh triangles
    // Strict: all 3 triangle vertices must be at floor level
    const outline = extractFloorOutlineYUp(
      allVertices,
      allIndices,
      minY,
      MESH_UNIT_TO_MM,
      yTol,
      3,
    );
    if (outline && outline.length >= MIN_POLYGON_POINTS) {
      return {
        polygon: outline,
        height: height > 0 ? height : FLOOR_HEIGHT_DEFAULT_MM,
        floorElevationMm,
      };
    }

    // Relaxed: triangles with >= 2 bottom vertices (catches partial floors)
    const relaxedOutline = extractFloorOutlineYUp(
      allVertices,
      allIndices,
      minY,
      MESH_UNIT_TO_MM,
      yTol,
      2,
    );
    if (relaxedOutline && relaxedOutline.length >= MIN_POLYGON_POINTS) {
      return {
        polygon: relaxedOutline,
        height: height > 0 ? height : FLOOR_HEIGHT_DEFAULT_MM,
        floorElevationMm,
      };
    }

    // Ultimate fallback: convex hull of bottom vertices (Y = vertical)
    const bottomVerts = allVertices.filter(
      (v) => Math.abs(v.y - minY) < yTol,
    );
    if (bottomVerts.length < MIN_POLYGON_POINTS) return null;

    const points2D = bottomVerts.map((v) => ({
      x: v.x * MESH_UNIT_TO_MM,
      y: -v.z * MESH_UNIT_TO_MM,
    }));
    const hull = convexHull2D(points2D);

    if (hull.length >= MIN_POLYGON_POINTS) {
      return {
        polygon: hull,
        height: height > 0 ? height : FLOOR_HEIGHT_DEFAULT_MM,
        floorElevationMm,
      };
    }
  } catch (err) {
    console.warn(
      `[IFC] extractFromFlatMesh failed for space #${spaceId}:`,
      err,
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Floor polygon outline from mesh boundary edges
// ---------------------------------------------------------------------------

/**
 * Find all connected components in a boundary adjacency graph via BFS.
 * Returns the node set of the largest component.
 */
function findLargestComponent(
  adjacency: Map<number, Set<number>>,
): Set<number> {
  const visited = new Set<number>();
  let largest = new Set<number>();

  for (const startNode of adjacency.keys()) {
    if (visited.has(startNode)) continue;

    const component = new Set<number>();
    const queue: number[] = [startNode];
    visited.add(startNode);

    while (queue.length > 0) {
      const node = queue.shift()!;
      component.add(node);
      const neighbors = adjacency.get(node);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    if (component.size > largest.size) {
      largest = component;
    }
  }

  return largest;
}

/**
 * Walk boundary edges within a connected component to form an ordered
 * polygon chain. Returns vertex indices in chain order.
 */
function walkBoundaryChain(
  adjacency: Map<number, Set<number>>,
  componentNodes: Set<number>,
): number[] {
  const startNode = componentNodes.values().next().value!;
  const chain: number[] = [startNode];
  const visited = new Set<number>([startNode]);
  let current = startNode;

  for (let step = 0; step < componentNodes.size; step++) {
    const neighbors = adjacency.get(current);
    if (!neighbors) break;
    let next: number | undefined;
    for (const n of neighbors) {
      if (!visited.has(n) && componentNodes.has(n)) {
        next = n;
        break;
      }
    }
    if (!next) break;
    chain.push(next);
    visited.add(next);
    current = next;
  }

  return chain;
}

/**
 * Extract the floor polygon outline from triangulated mesh data (Y-up).
 * web-ifc GetFlatMesh uses Y-up: X,Z are the floor plan, Y is height.
 *
 * Uses vertex INDEX-based edge keys (not position-key rounding) for exact
 * boundary detection. Finds the largest connected boundary component and
 * chains it into an ordered polygon. Preserves concave shapes (L-/T-rooms).
 *
 * @param minBottomVerts - Minimum vertices per triangle at floor level.
 *   3 = strict (all vertices at bottom), 2 = relaxed (allows wall-adjacent
 *   triangles for better coverage of partial floor meshes).
 */
function extractFloorOutlineYUp(
  vertices: { x: number; y: number; z: number }[],
  indices: number[],
  minY: number,
  meshToMm: number,
  yTol: number,
  minBottomVerts: number = 3,
): Point2D[] | null {
  // 1. Find bottom-face triangles and collect edges by vertex INDEX
  const edgeCounts = new Map<string, number>();
  const edgeEndpoints = new Map<string, [number, number]>();

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const i0 = indices[i]!;
    const i1 = indices[i + 1]!;
    const i2 = indices[i + 2]!;
    const v0 = vertices[i0]!;
    const v1 = vertices[i1]!;
    const v2 = vertices[i2]!;

    // Check which vertices are at floor level (Y = vertical in Y-up)
    const atBottom0 = Math.abs(v0.y - minY) <= yTol;
    const atBottom1 = Math.abs(v1.y - minY) <= yTol;
    const atBottom2 = Math.abs(v2.y - minY) <= yTol;
    const bottomCount =
      (atBottom0 ? 1 : 0) + (atBottom1 ? 1 : 0) + (atBottom2 ? 1 : 0);
    if (bottomCount < minBottomVerts) continue;

    // Only add edges where BOTH endpoints are at floor level
    const pairs: [number, number][] = [];
    if (atBottom0 && atBottom1) pairs.push([i0, i1]);
    if (atBottom1 && atBottom2) pairs.push([i1, i2]);
    if (atBottom2 && atBottom0) pairs.push([i2, i0]);

    for (const [a, b] of pairs) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}_${hi}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      if (!edgeEndpoints.has(key)) {
        edgeEndpoints.set(key, [lo, hi]);
      }
    }
  }

  if (edgeCounts.size === 0) return null;

  // 2. Boundary edges appear exactly once — build adjacency graph
  const adjacency = new Map<number, Set<number>>();
  for (const [key, count] of edgeCounts) {
    if (count !== 1) continue;
    const [a, b] = edgeEndpoints.get(key)!;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  if (adjacency.size < MIN_POLYGON_POINTS) return null;

  // 3. Find largest connected component (handles holes, fragments)
  const component = findLargestComponent(adjacency);
  if (component.size < MIN_POLYGON_POINTS) return null;

  // 4. Walk boundary chain within the largest component
  const chain = walkBoundaryChain(adjacency, component);
  if (chain.length < MIN_POLYGON_POINTS) return null;

  // 5. Map vertex indices to XZ floor plan coordinates, convert to mm
  const polygon: Point2D[] = chain.map((idx) => {
    const v = vertices[idx]!;
    return { x: v.x * meshToMm, y: -v.z * meshToMm };
  });

  // 6. Remove collinear points
  return simplifyPolygon(polygon);
}

/** Remove collinear intermediate points from a polygon. */
function simplifyPolygon(polygon: Point2D[]): Point2D[] {
  if (polygon.length <= MIN_POLYGON_POINTS) return polygon;

  const COLLINEAR_TOLERANCE = 1; // 1 mm²
  const result: Point2D[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length]!;
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;

    const cross =
      (curr.x - prev.x) * (next.y - prev.y) -
      (curr.y - prev.y) * (next.x - prev.x);
    if (Math.abs(cross) > COLLINEAR_TOLERANCE) {
      result.push(curr);
    }
  }

  return result.length >= MIN_POLYGON_POINTS ? result : polygon;
}

// ---------------------------------------------------------------------------
// Convex hull (Andrew's monotone chain)
// ---------------------------------------------------------------------------

function convexHull2D(points: Point2D[]): Point2D[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;

  // Remove exact duplicates
  const unique: Point2D[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]!;
    const prev = pts[i - 1]!;
    if (cur.x !== prev.x || cur.y !== prev.y) {
      unique.push(cur);
    }
  }
  if (unique.length < MIN_POLYGON_POINTS) return unique;

  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  // Lower hull
  const lower: Point2D[] = [];
  for (const p of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: Point2D[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each half because it's repeated
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

// ---------------------------------------------------------------------------
// Placement transform — walks the full IfcLocalPlacement chain
// ---------------------------------------------------------------------------

interface Transform2D {
  tx: number;
  ty: number;
  cos: number;
  sin: number;
}

const IDENTITY_TRANSFORM: Transform2D = { tx: 0, ty: 0, cos: 1, sin: 0 };

/**
 * Compose two transforms: result = outer(inner(point)).
 * Both transforms are in modeller space (mm, Y-down).
 */
function composeTransforms(
  outer: Transform2D,
  inner: Transform2D,
): Transform2D {
  return {
    cos: outer.cos * inner.cos - outer.sin * inner.sin,
    sin: outer.sin * inner.cos + outer.cos * inner.sin,
    tx: outer.cos * inner.tx - outer.sin * inner.ty + outer.tx,
    ty: outer.sin * inner.tx + outer.cos * inner.ty + outer.ty,
  };
}

/**
 * Extract a 2D transform from an IfcAxis2Placement3D (or 2D).
 * Converts IFC coordinates (Y-up) → modeller (mm, Y-down).
 */
function extractAxisPlacement2D(
  api: WebIfc.IfcAPI,
  modelId: number,
  axisPlacementId: number,
  unitToMm: number,
): Transform2D {
  try {
    const ap = api.GetLine(modelId, axisPlacementId);

    let tx = 0;
    let ty = 0;
    let cos = 1;
    let sin = 0;

    // Location → IfcCartesianPoint
    const locationRef = ap?.Location;
    if (locationRef?.value != null) {
      const location = api.GetLine(modelId, locationRef.value);
      const coords = location?.Coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        tx = Number(coords[0]?.value ?? coords[0]) * unitToMm;
        ty = -(Number(coords[1]?.value ?? coords[1])) * unitToMm;
      }
    }

    // RefDirection → IfcDirection (X-axis) for in-plane rotation
    const refDirRef = ap?.RefDirection;
    if (refDirRef?.value != null) {
      const refDir = api.GetLine(modelId, refDirRef.value);
      const ratios = refDir?.DirectionRatios;
      if (Array.isArray(ratios) && ratios.length >= 2) {
        const dx = Number(ratios[0]?.value ?? ratios[0]);
        const dy = Number(ratios[1]?.value ?? ratios[1]);
        const len = Math.hypot(dx, dy);
        if (len > 1e-10) {
          cos = dx / len;
          sin = -(dy / len); // flip for Y-down
        }
      }
    }

    return { tx, ty, cos, sin };
  } catch {
    return IDENTITY_TRANSFORM;
  }
}

/**
 * Recursively walk an IfcLocalPlacement chain and compose all transforms.
 * Returns the cumulative transform from local → global in modeller space.
 */
function resolveLocalPlacement(
  api: WebIfc.IfcAPI,
  modelId: number,
  placementId: number,
  unitToMm: number,
  visited?: Set<number>,
): Transform2D {
  const seen = visited ?? new Set<number>();
  if (seen.has(placementId)) return IDENTITY_TRANSFORM;
  seen.add(placementId);

  try {
    const placement = api.GetLine(modelId, placementId);

    // This level's relative placement
    let local = IDENTITY_TRANSFORM;
    const relRef = placement?.RelativePlacement;
    if (relRef?.value != null) {
      local = extractAxisPlacement2D(api, modelId, relRef.value, unitToMm);
    }

    // Parent placement (IfcLocalPlacement.PlacementRelTo)
    const parentRef = placement?.PlacementRelTo;
    if (parentRef?.value != null) {
      const parent = resolveLocalPlacement(
        api,
        modelId,
        parentRef.value,
        unitToMm,
        seen,
      );
      return composeTransforms(parent, local);
    }

    return local;
  } catch {
    return IDENTITY_TRANSFORM;
  }
}

/**
 * Get the full placement transform for an IFC product (e.g. IfcSpace).
 * Walks the ObjectPlacement → IfcLocalPlacement chain up to the root.
 */
function getPlacementTransform(
  api: WebIfc.IfcAPI,
  modelId: number,
  expressId: number,
  unitToMm: number,
): Transform2D {
  try {
    const obj = api.GetLine(modelId, expressId);
    const placementRef = obj?.ObjectPlacement;
    if (placementRef?.value != null) {
      return resolveLocalPlacement(
        api,
        modelId,
        placementRef.value,
        unitToMm,
      );
    }
  } catch {
    // Fall through
  }
  return IDENTITY_TRANSFORM;
}

/**
 * Walk the IfcLocalPlacement chain and accumulate Z translations.
 * Returns the global Z position in mm (for storey matching).
 */
function resolveLocalPlacementZ(
  api: WebIfc.IfcAPI,
  modelId: number,
  placementId: number,
  unitToMm: number,
  visited?: Set<number>,
): number {
  const seen = visited ?? new Set<number>();
  if (seen.has(placementId)) return 0;
  seen.add(placementId);

  try {
    const placement = api.GetLine(modelId, placementId);
    let localZ = 0;

    const relRef = placement?.RelativePlacement;
    if (relRef?.value != null) {
      const ap = api.GetLine(modelId, relRef.value);
      const locationRef = ap?.Location;
      if (locationRef?.value != null) {
        const location = api.GetLine(modelId, locationRef.value);
        const coords = location?.Coordinates;
        if (Array.isArray(coords) && coords.length >= 3) {
          localZ = Number(coords[2]?.value ?? coords[2]) * unitToMm;
        }
      }
    }

    const parentRef = placement?.PlacementRelTo;
    if (parentRef?.value != null) {
      return (
        resolveLocalPlacementZ(
          api,
          modelId,
          parentRef.value,
          unitToMm,
          seen,
        ) + localZ
      );
    }

    return localZ;
  } catch {
    return 0;
  }
}

/**
 * Get the global Z position (floor elevation) for an IFC product.
 * Walks the ObjectPlacement chain and accumulates Z translations.
 */
function getPlacementZMm(
  api: WebIfc.IfcAPI,
  modelId: number,
  expressId: number,
  unitToMm: number,
): number {
  try {
    const obj = api.GetLine(modelId, expressId);
    const placementRef = obj?.ObjectPlacement;
    if (placementRef?.value != null) {
      return resolveLocalPlacementZ(
        api,
        modelId,
        placementRef.value,
        unitToMm,
      );
    }
  } catch {
    // Fall through
  }
  return 0;
}

function applyTransform2D(point: Point2D, t: Transform2D): Point2D {
  if (t === IDENTITY_TRANSFORM) return point;
  return {
    x: point.x * t.cos - point.y * t.sin + t.tx,
    y: point.x * t.sin + point.y * t.cos + t.ty,
  };
}

// ---------------------------------------------------------------------------
// Space name extraction
// ---------------------------------------------------------------------------

function getSpaceName(
  api: WebIfc.IfcAPI,
  modelId: number,
  spaceId: number,
): string {
  try {
    const space = api.GetLine(modelId, spaceId);
    const longName = space?.LongName?.value ?? space?.LongName;
    const name = space?.Name?.value ?? space?.Name;
    return String(longName || name || `Ruimte ${spaceId}`);
  } catch {
    return `Ruimte ${spaceId}`;
  }
}

// ---------------------------------------------------------------------------
// Multi-item polygon merge
// ---------------------------------------------------------------------------

/**
 * Merge multiple extracted item polygons into one combined polygon.
 * Uses shared edge detection + polygon merge when possible,
 * falls back to convex hull of all points.
 */
function mergeItemPolygons(
  results: ItemExtractionResult[],
): ItemExtractionResult | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0]!;

  // Try pairwise merge using shared edge detection
  let merged = results[0]!;
  let didMerge = true;
  const remaining = results.slice(1);

  while (didMerge && remaining.length > 0) {
    didMerge = false;
    for (let r = 0; r < remaining.length; r++) {
      const other = remaining[r]!;
      const mergeResult = tryMergeTwoPolygons(
        merged.polygon,
        other.polygon,
      );
      if (mergeResult) {
        merged = {
          polygon: mergeResult,
          height: Math.max(merged.height, other.height),
          kind: merged.kind,
        };
        remaining.splice(r, 1);
        didMerge = true;
        break;
      }
    }
  }

  // If all items merged successfully, done
  if (remaining.length === 0) {
    return merged;
  }

  // Fallback: convex hull of all points from all items
  const allPoints: Point2D[] = [];
  allPoints.push(...merged.polygon);
  for (const item of remaining) {
    allPoints.push(...item.polygon);
  }
  const hull = convexHull2D(allPoints);
  if (hull.length < MIN_POLYGON_POINTS) return null;

  let maxHeight = merged.height;
  for (const item of remaining) {
    maxHeight = Math.max(maxHeight, item.height);
  }

  return { polygon: hull, height: maxHeight, kind: merged.kind };
}

/**
 * Try to merge two polygons by finding a shared edge pair.
 * Returns merged polygon or null if no shared edge found.
 */
function tryMergeTwoPolygons(
  polyA: Point2D[],
  polyB: Point2D[],
): Point2D[] | null {
  const nA = polyA.length;
  const nB = polyB.length;

  for (let wA = 0; wA < nA; wA++) {
    const a1 = polyA[wA]!;
    const a2 = polyA[(wA + 1) % nA]!;
    for (let wB = 0; wB < nB; wB++) {
      const b1 = polyB[wB]!;
      const b2 = polyB[(wB + 1) % nB]!;

      // Use the same shared edge detection as geometry.ts
      if (itemSegmentsShareEdge(a1, a2, b1, b2)) {
        // Build merged polygon by walking both, skipping shared edge
        return buildMergedPolygon(polyA, wA, polyB, wB);
      }
    }
  }

  return null;
}

/** Shared edge test for merge — tighter tolerance for same-space items. */
function itemSegmentsShareEdge(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): boolean {
  const PERP_TOL = 5;
  const OVERLAP_TOL = 10; // tighter than cross-room (50mm)

  const abLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (abLen < 1) return false;

  const cross1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const cross2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  if (
    Math.abs(cross1) / abLen > PERP_TOL ||
    Math.abs(cross2) / abLen > PERP_TOL
  )
    return false;

  const horiz = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
  const [a1, b1] = horiz
    ? [Math.min(a.x, b.x), Math.max(a.x, b.x)]
    : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  const [c1, d1] = horiz
    ? [Math.min(c.x, d.x), Math.max(c.x, d.x)]
    : [Math.min(c.y, d.y), Math.max(c.y, d.y)];

  return Math.min(b1, d1) - Math.max(a1, c1) > OVERLAP_TOL;
}

/** Build merged polygon from two polygons sharing an edge. */
function buildMergedPolygon(
  polyA: Point2D[],
  wallA: number,
  polyB: Point2D[],
  wallB: number,
): Point2D[] | null {
  const nA = polyA.length;
  const nB = polyB.length;
  if (nA < 3 || nB < 3) return null;

  const merged: Point2D[] = [];

  // Walk polyA: start after shared edge
  for (let step = 0; step < nA - 1; step++) {
    const i = (wallA + 1 + step) % nA;
    merged.push(polyA[i]!);
  }

  // Walk polyB: start after shared edge
  for (let step = 0; step < nB - 1; step++) {
    const i = (wallB + 1 + step) % nB;
    merged.push(polyB[i]!);
  }

  // Clean up near-duplicate and collinear vertices
  const cleaned = simplifyPolygon(removeNearDuplicateVertices(merged));

  if (cleaned.length < MIN_POLYGON_POINTS) return null;
  if (polygonAreaMm2(cleaned) < 100) return null;

  return cleaned;
}

/** Remove consecutive near-duplicate vertices (< threshold mm apart). */
function removeNearDuplicateVertices(
  poly: Point2D[],
  threshold: number = 50,
): Point2D[] {
  const result: Point2D[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const next = poly[(i + 1) % n]!;
    const d = Math.hypot(poly[i]!.x - next.x, poly[i]!.y - next.y);
    if (d >= threshold) {
      result.push(poly[i]!);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Per-space orchestrator: processSpace()
// ---------------------------------------------------------------------------

interface ExtractionResult {
  polygon: Point2D[];
  height: number;
  /** Floor elevation in mm. Used for storey matching. */
  floorElevationMm?: number;
}

/**
 * Process a single IfcSpace: classify items, extract per-item, transform,
 * merge multi-item, mesh fallback, floor assignment, validate.
 */
function processSpace(
  api: WebIfc.IfcAPI,
  modelId: number,
  spaceId: number,
  unitToMm: number,
  storeyMap: Map<number, StoreyInfo>,
): {
  room: Omit<ModelRoom, "id">;
  diagnostic: SpaceDiagnostic;
} | null {
  const spaceName = getSpaceName(api, modelId, spaceId);

  const diagnostic: SpaceDiagnostic = {
    spaceId,
    spaceName,
    items: [],
    finalStrategy: "none",
    polygonPoints: 0,
    areaMm2: 0,
  };

  // 1. Classify representation items
  const repItems = classifyRepresentationItems(api, modelId, spaceId);

  // 2. Per-item extraction
  const successfulItems: ItemExtractionResult[] = [];

  for (const repItem of repItems) {
    let result: ItemExtractionResult | null = null;
    let reason: string | undefined;

    switch (repItem.kind) {
      case "SweptSolid":
        result = extractSweptSolid(
          api,
          modelId,
          repItem.expressId,
          unitToMm,
        );
        if (!result) reason = "Profile extraction failed";
        break;
      case "FacetedBrep":
        result = extractFacetedBrep(
          api,
          modelId,
          repItem.expressId,
          unitToMm,
        );
        if (!result) reason = "No horizontal faces found";
        break;
      case "SurfaceModel":
        result = extractSurfaceModel(
          api,
          modelId,
          repItem.expressId,
          unitToMm,
        );
        if (!result) reason = "No horizontal faces found";
        break;
      default:
        reason = `Unknown IFC type ${repItem.ifcType}`;
        break;
    }

    diagnostic.items.push({
      expressId: repItem.expressId,
      kind: repItem.kind,
      success: result != null,
      reason,
    });

    if (result) {
      successfulItems.push(result);
    }
  }

  // 3. Build extraction result from direct parsing
  let extracted: ExtractionResult | null = null;

  if (successfulItems.length > 0) {
    // Apply ObjectPlacement transform to all item polygons
    const spaceTransform = getPlacementTransform(
      api,
      modelId,
      spaceId,
      unitToMm,
    );
    for (const item of successfulItems) {
      item.polygon = item.polygon.map((p) =>
        applyTransform2D(p, spaceTransform),
      );
    }

    if (successfulItems.length === 1) {
      // Single item — use directly
      const item = successfulItems[0]!;
      const floorElevationMm = getPlacementZMm(
        api,
        modelId,
        spaceId,
        unitToMm,
      );
      extracted = {
        polygon: item.polygon,
        height: item.height,
        floorElevationMm,
      };
      diagnostic.finalStrategy = item.kind;
    } else {
      // Multiple items — merge
      const merged = mergeItemPolygons(successfulItems);
      if (merged) {
        const floorElevationMm = getPlacementZMm(
          api,
          modelId,
          spaceId,
          unitToMm,
        );
        extracted = {
          polygon: merged.polygon,
          height: merged.height,
          floorElevationMm,
        };
        diagnostic.finalStrategy = "merged";
      }
    }
  }

  // 4. Mesh fallback if direct parsing failed
  if (!extracted) {
    const meshResult = extractFromFlatMesh(api, modelId, spaceId);
    if (meshResult) {
      extracted = meshResult;
      diagnostic.finalStrategy = "mesh-fallback";
    }
  }

  // 5. No geometry at all
  if (!extracted) {
    diagnostic.finalStrategy = "none";
    const kindsList = repItems.map((r) => r.kind).join(", ") || "none";
    console.warn(
      `[IFC] ${spaceName} (#${spaceId}): no geometry extracted ` +
        `(items: [${kindsList}])`,
    );
    return null;
  }

  // 6. Validate polygon
  if (extracted.polygon.length < MIN_POLYGON_POINTS) {
    console.warn(
      `[IFC] ${spaceName} (#${spaceId}): too few points ` +
        `(${extracted.polygon.length})`,
    );
    return null;
  }

  const area = polygonAreaMm2(extracted.polygon);
  diagnostic.polygonPoints = extracted.polygon.length;
  diagnostic.areaMm2 = area;

  if (area < MIN_ROOM_AREA_MM2) {
    console.warn(
      `[IFC] ${spaceName} (#${spaceId}): area too small ` +
        `(${(area / 1e6).toFixed(2)}m2)`,
    );
    return null;
  }

  // 7. Floor assignment
  let floorIndex: number;
  let elevation: number | undefined;

  if (extracted.floorElevationMm !== undefined && storeyMap.size > 0) {
    // Match elevation against storey elevations
    const elev = extracted.floorElevationMm;
    let bestStorey: StoreyInfo | undefined;
    let bestDist = Infinity;
    for (const storey of storeyMap.values()) {
      const storeyMm = storey.elevation * unitToMm;
      const dist = Math.abs(elev - storeyMm);
      if (dist < bestDist) {
        bestDist = dist;
        bestStorey = storey;
      }
    }
    floorIndex = bestStorey?.floorIndex ?? 0;
    elevation = elev;
  } else {
    const spatial = findFloorForSpace(api, modelId, spaceId, storeyMap);
    floorIndex = spatial.floorIndex;
    elevation =
      spatial.elevationMeters !== undefined
        ? Math.round(spatial.elevationMeters * unitToMm)
        : undefined;
  }

  // 8. Build room
  const roomFunction = matchRoomFunction(spaceName);
  const room: Omit<ModelRoom, "id"> = {
    name: spaceName,
    function: roomFunction,
    polygon: extracted.polygon,
    floor: floorIndex,
    height: Math.round(extracted.height),
  };
  if (elevation !== undefined) {
    room.elevation = elevation;
  }

  // 9. Log diagnostic
  const itemKinds = repItems.map((r) => r.kind).join(", ");
  console.log(
    `[IFC] ${spaceName} (#${spaceId}): ` +
      `${repItems.length} item${repItems.length !== 1 ? "s" : ""} ` +
      `[${itemKinds}] → ${diagnostic.finalStrategy} ` +
      `(${diagnostic.polygonPoints} pts, ` +
      `${(diagnostic.areaMm2 / 1e6).toFixed(1)}m2)`,
  );

  return { room, diagnostic };
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

export async function importIfcFile(file: File): Promise<IfcImportResult> {
  const api = await getIfcApi();

  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  const modelId = api.OpenModel(data, {
    COORDINATE_TO_ORIGIN: false,
  });

  const result: IfcImportResult = {
    rooms: [],
    warnings: [],
    diagnostics: [],
    stats: { spacesFound: 0, spacesImported: 0, spacesSkipped: 0 },
  };

  try {
    // Detect length unit (meters, mm, etc.) → conversion factor to mm
    const unitToMm = detectUnitToMm(api, modelId);
    console.log(`[IFC] Detected unit conversion: 1 file unit = ${unitToMm}mm`);

    // Extract storey structure
    const storeyMap = extractStoreys(api, modelId);
    console.log(`[IFC] Found ${storeyMap.size} storeys`);

    // Find all IfcSpace entities
    const spaceIds = api.GetLineIDsWithType(modelId, IFCSPACE);
    result.stats.spacesFound = spaceIds.size();
    console.log(`[IFC] Found ${spaceIds.size()} IfcSpace entities`);

    for (let i = 0; i < spaceIds.size(); i++) {
      const spaceId = spaceIds.get(i);
      const spaceName = getSpaceName(api, modelId, spaceId);

      const processed = processSpace(
        api,
        modelId,
        spaceId,
        unitToMm,
        storeyMap,
      );

      if (processed) {
        result.rooms.push(processed.room);
        result.diagnostics.push(processed.diagnostic);
        result.stats.spacesImported++;
      } else {
        // processSpace returns null for validation failures too
        result.warnings.push({
          spaceName,
          message: "Geen geldige geometrie gevonden",
        });
        result.stats.spacesSkipped++;
      }
    }
  } finally {
    api.CloseModel(modelId);
  }

  // Origin normalization: shift all polygons so the model starts near (0, 0).
  normalizeOrigin(result.rooms);

  // Summary log
  console.log(
    `[IFC] Import complete: ${result.stats.spacesImported}/${result.stats.spacesFound} spaces imported, ` +
      `${result.stats.spacesSkipped} skipped`,
  );

  return result;
}

/**
 * Shift all room polygons so that the bounding box minimum is at
 * (MARGIN, MARGIN). Ensures models are visible regardless of their
 * original coordinate system.
 */
const ORIGIN_MARGIN_MM = 1000;

function normalizeOrigin(rooms: Omit<ModelRoom, "id">[]): void {
  if (rooms.length === 0) return;

  let globalMinX = Infinity;
  let globalMinY = Infinity;

  for (const room of rooms) {
    for (const p of room.polygon) {
      if (p.x < globalMinX) globalMinX = p.x;
      if (p.y < globalMinY) globalMinY = p.y;
    }
  }

  const offsetX = -globalMinX + ORIGIN_MARGIN_MM;
  const offsetY = -globalMinY + ORIGIN_MARGIN_MM;

  // Skip if already near origin (within 10m)
  if (
    Math.abs(offsetX - ORIGIN_MARGIN_MM) < 10_000 &&
    Math.abs(offsetY - ORIGIN_MARGIN_MM) < 10_000
  ) {
    return;
  }

  for (const room of rooms) {
    for (const p of room.polygon) {
      p.x += offsetX;
      p.y += offsetY;
    }
  }
}
