/**
 * Pure drop-target resolver for flowchart membership drags (issues #35, #41).
 *
 * Consumes pre-scaled shell-relative viewport rects (same coordinate frame the
 * caller captures, cf. `TimelineInteractions.tsx`); never touches the DOM.
 * Returns the innermost (smallest-area) rect containing the point, inclusive of
 * edges. Identical-area ties resolve deterministically to first-in-array.
 */

export type FlowchartClusterRect = { id: string; x: number; y: number; w: number; h: number };

export type FlowchartDropPoint = { x: number; y: number };

export function resolveFlowchartDropTarget(
  rects: FlowchartClusterRect[],
  point: FlowchartDropPoint,
): { subgraphId: string | null } {
  let bestId: string | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const r of rects) {
    if (!(r.w > 0 && r.h > 0)) continue; // ignore zero/negative rects
    if (point.x < r.x || point.x > r.x + r.w || point.y < r.y || point.y > r.y + r.h) continue;
    const area = r.w * r.h;
    if (area < bestArea) {
      bestArea = area;
      bestId = r.id;
    }
    // Equal area: keep first-in-array (deterministic tie-break).
  }
  return { subgraphId: bestId };
}

/** Thin validity wrapper; the caller owns scope rules via `isDescendant`. */
export function isValidSubgraphDrop(
  draggedId: string,
  destId: string | null,
  isDescendant: (dragged: string, dest: string) => boolean,
): boolean {
  if (destId === null) return true;
  if (destId === draggedId) return false;
  return !isDescendant(draggedId, destId);
}
