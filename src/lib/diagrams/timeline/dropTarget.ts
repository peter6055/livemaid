/**
 * Drop-target selection for timeline reorder drags (issue #15).
 *
 * Slot centerlines hug node edges, so near a section boundary the nearest slot centre can
 * sit on the far side of the visible boundary, making the indicator highlight the opposite
 * section from the one under the cursor. Arbitration therefore ranks candidate sections by
 * screen distance from the cursor to their bounds and picks the closest section's best
 * slot; when the cursor is closest to the source section and no eligible slot resolves to
 * it, the result is "stay put" (null) so the preview always matches the final move.
 */

export type TimelineDropPlacement = "before" | "after";

export type TimelineDropSlot = {
  id: string;
  placement: TimelineDropPlacement;
  axis: "x" | "y";
  x: number;
  y: number;
  w: number;
  h: number;
  crossStart: number;
  crossEnd: number;
  hitTol?: number;
};

export type TimelineDropSectionRect = {
  sectionId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TimelineDropTarget = { id: string; placement: TimelineDropPlacement };

export type TimelineDropSelection = {
  /** Slot to highlight/insert at, or null when the cursor should stay put. */
  target: TimelineDropTarget | null;
  /** Section whose bounds contain the cursor, if any (used for the stay highlight). */
  cursorInSectionId: string | null;
};

function distanceToRect(
  r: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

export function selectTimelineDropTarget(params: {
  slots: TimelineDropSlot[];
  sectionBounds: TimelineDropSectionRect[];
  /** Resolved section id per target node id (absent = outside any section). */
  sectionOfNode: (nodeId: string) => string | null;
  sourceSectionId: string | null;
  cursorX: number;
  cursorY: number;
  crossTolX: number;
  crossTolY: number;
}): TimelineDropSelection {
  const {
    slots,
    sectionBounds,
    sectionOfNode,
    sourceSectionId,
    cursorX,
    cursorY,
    crossTolX,
    crossTolY,
  } = params;

  // Nearest eligible slot per candidate section ("" keys the no-section area).
  const bestBySection = new Map<string, TimelineDropTarget & { dist: number }>();
  for (const s of slots) {
    const crossOk =
      s.axis === "y"
        ? cursorX >= s.crossStart - crossTolX && cursorX <= s.crossEnd + crossTolX
        : cursorY >= s.crossStart - crossTolY && cursorY <= s.crossEnd + crossTolY;
    if (!crossOk) continue;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const dist = s.axis === "y" ? Math.abs(cursorY - cy) : Math.abs(cursorX - cx);
    const tol = s.hitTol ?? (s.axis === "y" ? s.h / 2 : s.w / 2) + crossTolX;
    if (dist > tol) continue;
    const key = sectionOfNode(s.id) ?? "";
    const cur = bestBySection.get(key);
    if (!cur || dist < cur.dist) {
      bestBySection.set(key, { id: s.id, placement: s.placement, dist });
    }
  }

  const rectOf = (sectionId: string | null) =>
    sectionId ? (sectionBounds.find((b) => b.sectionId === sectionId) ?? null) : null;

  // Rank candidate sections by how close their visible bounds are to the cursor.
  // Slots outside any section ("") have no bounds and are only used as a fallback.
  const ranked = [...bestBySection.keys()]
    .map((key) => {
      const rect = rectOf(key || null);
      return { key, d: rect ? distanceToRect(rect, cursorX, cursorY) : Number.POSITIVE_INFINITY };
    })
    .filter((r) => Number.isFinite(r.d))
    .sort((a, b) => a.d - b.d);

  const cursorInSectionId =
    sectionBounds.find(
      (b) => cursorX >= b.x && cursorX <= b.x + b.w && cursorY >= b.y && cursorY <= b.y + b.h,
    )?.sectionId ?? null;

  const closest = ranked[0];
  if (!closest) {
    const fallback = bestBySection.get("");
    if (!fallback) return { target: null, cursorInSectionId };
    const { dist: _f, ...target } = fallback;
    void _f;
    return { target, cursorInSectionId };
  }

  const sourceRect = rectOf(sourceSectionId);
  const sourceDist = sourceRect
    ? distanceToRect(sourceRect, cursorX, cursorY)
    : Number.POSITIVE_INFINITY;
  const sourceSlot = sourceSectionId ? bestBySection.get(sourceSectionId) : undefined;

  if (sourceDist <= closest.d) {
    // Cursor sits on the home side of every rival section: prefer the home slot, or stay
    // put when nothing can be inserted there.
    if (!sourceSlot) return { target: null, cursorInSectionId };
    const { dist: _d, ...target } = sourceSlot;
    void _d;
    return { target, cursorInSectionId };
  }

  const winner = bestBySection.get(closest.key)!;
  const { dist: _w, ...target } = winner;
  void _w;
  return { target, cursorInSectionId };
}
