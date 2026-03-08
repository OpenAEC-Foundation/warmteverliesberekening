/** Shared geometry helpers for the modeller. */
import type { Point2D } from "./types";

export function polygonCenter(polygon: Point2D[]): Point2D {
  const n = polygon.length;
  return {
    x: polygon.reduce((s, p) => s + p.x, 0) / n,
    y: polygon.reduce((s, p) => s + p.y, 0) / n,
  };
}

/** Shoelace formula — returns positive area in mm². */
export function polygonArea(polygon: Point2D[]): number {
  return Math.abs(signedPolygonArea(polygon));
}

/** Signed area (positive for CW in screen coords / Y-down). */
export function signedPolygonArea(polygon: Point2D[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Offset a 2D polygon outward by `dist` mm.
 * Uses mitered corners for clean joins.
 */
export function offsetPolygon(polygon: Point2D[], dist: number): Point2D[] {
  const n = polygon.length;
  const area = signedPolygonArea(polygon);
  // CW in screen coords (area > 0): outward normal of edge (dx,dy) is (dy,-dx)/len
  const sign = area > 0 ? 1 : -1;

  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]!;
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % n]!;

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

    const n1x = sign * e1dy / e1len;
    const n1y = sign * (-e1dx) / e1len;
    const n2x = sign * e2dy / e2len;
    const n2y = sign * (-e2dx) / e2len;

    const mx = n1x + n2x;
    const my = n1y + n2y;
    const mlen = Math.hypot(mx, my);

    if (mlen < 0.001) {
      result.push({ x: curr.x + n1x * dist, y: curr.y + n1y * dist });
    } else {
      const dot = n1x * (mx / mlen) + n1y * (my / mlen);
      const miterScale = Math.abs(dot) > 0.25 ? dist / dot : dist * 2;
      result.push({
        x: curr.x + (mx / mlen) * miterScale,
        y: curr.y + (my / mlen) * miterScale,
      });
    }
  }

  return result;
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(p: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Check if two collinear segments share a non-trivial overlap. */
export function segmentsShareEdge(
  a: Point2D, b: Point2D,
  c: Point2D, d: Point2D,
): boolean {
  const eps = 1;
  const cross1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const cross2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  if (Math.abs(cross1) > eps || Math.abs(cross2) > eps) return false;

  const horiz = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
  const [a1, b1] = horiz
    ? [Math.min(a.x, b.x), Math.max(a.x, b.x)]
    : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  const [c1, d1] = horiz
    ? [Math.min(c.x, d.x), Math.max(c.x, d.x)]
    : [Math.min(c.y, d.y), Math.max(c.y, d.y)];

  return Math.min(b1, d1) - Math.max(a1, c1) > eps;
}
