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
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    area += pi.x * pj.y;
    area -= pj.x * pi.y;
  }
  return Math.abs(area) / 2;
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
