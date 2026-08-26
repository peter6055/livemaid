import type { TimelineNodeKind } from "@/lib/diagrams/timeline";

export const DEFAULT_CANVAS_INITIAL_SCALE = 2.75;

export type TimelineReorderNode = {
  id: string;
  kind: TimelineNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * A candidate drop slot during a timeline reorder drag. For sections/periods the slot is a
 * boundary band between adjacent columns and the guide sits on that boundary (`columnMode: false`).
 * For child events the slot spans the hovered parent period column and the guide is centered on the
 * column's cross-axis (`columnMode: true`) so it never overlaps the column division lines.
 * `axis` is the cursor axis used for hit-testing distance, `crossStart/crossEnd` the column span on
 * the OTHER axis used for containment, and `guidePos` the guide line position (boundary position for
 * columns, cross-axis center for events). `spanStart/spanEnd` bound the guide line's extent.
 */
export type TimelineReorderSlot = {
  id: string;
  placement: "before" | "after";
  x: number;
  y: number;
  w: number;
  h: number;
  axis: "x" | "y";
  crossStart: number;
  crossEnd: number;
  guidePos: number;
  spanStart: number;
  spanEnd: number;
  columnMode: boolean;
  /**
   * Optional main-axis hit tolerance override. For child-event slots this covers the target
   * event's own extent (e.g. 300px-wide TD events) so dropping anywhere on the event activates
   * the slot; boundary slots fall back to the default (slot marker half-width + tolerance).
   */
  hitTol?: number;
};

/** Screenspace bounding box of a timeline section container, for section highlight on period drag. */
export type TimelineSectionBounds = {
  sectionId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
