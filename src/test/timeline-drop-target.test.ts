import { describe, expect, it } from "vitest";
import {
  selectTimelineDropTarget,
  type TimelineDropSectionRect,
  type TimelineDropSlot,
} from "@/lib/diagrams/timeline/dropTarget";

/**
 * Geometry mirrors the LR fixture from issue #15:
 * Phase 4 column x∈[629,806], New Section 1 column x∈[810,896]; boundary ≈ x=808.
 * Slots are vertical bands (axis "x", w=22) spanning the full content height y∈[293,485].
 */
const BAND_H = 192;

/** Slots visible while dragging Q2 (periods Q1 in S1 and Q3 in S2). */
const SLOTS_DRAG_Q2: TimelineDropSlot[] = [
  {
    id: "Q1",
    placement: "before",
    axis: "x",
    x: 613,
    y: 293,
    w: 22,
    h: BAND_H,
    crossStart: 293,
    crossEnd: 485,
  },
  {
    id: "Q1",
    placement: "after",
    axis: "x",
    x: 709,
    y: 293,
    w: 22,
    h: BAND_H,
    crossStart: 293,
    crossEnd: 485,
  },
  {
    id: "Q3",
    placement: "before",
    axis: "x",
    x: 794,
    y: 293,
    w: 22,
    h: BAND_H,
    crossStart: 293,
    crossEnd: 485,
  },
  {
    id: "Q3",
    placement: "after",
    axis: "x",
    x: 890,
    y: 293,
    w: 22,
    h: BAND_H,
    crossStart: 293,
    crossEnd: 485,
  },
];

/** Slots visible while dragging Q3 (only periods Q1/Q2 in S1 — nothing else lives in S2). */
const SLOTS_DRAG_Q3: TimelineDropSlot[] = [
  {
    id: "Q1",
    placement: "before",
    axis: "x",
    x: 613,
    y: 293,
    w: 22,
    h: BAND_H,
    crossStart: 293,
    crossEnd: 485,
  },
  {
    id: "Q1",
    placement: "after",
    axis: "x",
    x: 709,
    y: 293,
    w: 22,
    h: BAND_H,
    crossStart: 293,
    crossEnd: 485,
  },
  {
    id: "Q2",
    placement: "before",
    axis: "x",
    x: 704,
    y: 293,
    w: 22,
    h: BAND_H,
    crossStart: 293,
    crossEnd: 485,
  },
  {
    id: "Q2",
    placement: "after",
    axis: "x",
    x: 800,
    y: 293,
    w: 22,
    h: BAND_H,
    crossStart: 293,
    crossEnd: 485,
  },
];

const SECTION_BOUNDS: TimelineDropSectionRect[] = [
  { sectionId: "S1", x: 629, y: 293, w: 177, h: 192 },
  { sectionId: "S2", x: 810, y: 293, w: 86, h: 192 },
];

function select(
  slots: TimelineDropSlot[],
  sourceSectionId: string | null,
  cursorX: number,
  cursorY = 360,
) {
  return selectTimelineDropTarget({
    slots,
    sectionBounds: SECTION_BOUNDS,
    sectionOfNode: (nodeId) => (nodeId === "Q3" ? "S2" : "S1"),
    sourceSectionId,
    cursorX,
    cursorY,
    crossTolX: 34,
    crossTolY: 34,
  });
}

describe("selectTimelineDropTarget (issue #15)", () => {
  it("flips to the target section exactly at the boundary when dragging out of the home section", () => {
    // Dragging Q2 (home S1) rightwards: inside S1 → stay put; past boundary → before(Q3).
    expect(select(SLOTS_DRAG_Q2, "S1", 800).target).toBeNull();
    expect(select(SLOTS_DRAG_Q2, "S1", 806).target).toBeNull();
    expect(select(SLOTS_DRAG_Q2, "S1", 812).target).toEqual({ id: "Q3", placement: "before" });
    expect(select(SLOTS_DRAG_Q2, "S1", 850).target).toEqual({ id: "Q3", placement: "before" });
  });

  it("keeps the home section until the cursor crosses back when dragging from the other side", () => {
    // Dragging Q3 (home S2) leftwards: still inside S2 → stay; across boundary → after(Q2).
    expect(select(SLOTS_DRAG_Q3, "S2", 830).target).toBeNull();
    expect(select(SLOTS_DRAG_Q3, "S2", 812).target).toBeNull();
    expect(select(SLOTS_DRAG_Q3, "S2", 804).target).toEqual({ id: "Q2", placement: "after" });
    expect(select(SLOTS_DRAG_Q3, "S2", 770).target).toEqual({ id: "Q2", placement: "after" });
  });

  it("reports the section containing the cursor for the stay highlight", () => {
    expect(select(SLOTS_DRAG_Q2, "S1", 800).cursorInSectionId).toBe("S1");
    expect(select(SLOTS_DRAG_Q3, "S2", 812).cursorInSectionId).toBe("S2");
    expect(select(SLOTS_DRAG_Q2, "S1", 808).cursorInSectionId).toBeNull(); // dead zone
  });

  it("still reorders within the home section using the nearest slot half", () => {
    // Dragging Q2 over the region right of Q1 → after(Q1).
    expect(select(SLOTS_DRAG_Q2, "S1", 740).target).toEqual({ id: "Q1", placement: "after" });
  });

  it("targets a non-adjacent section when the cursor rests deep inside it", () => {
    const slots = [
      ...SLOTS_DRAG_Q2,
      {
        id: "Q9",
        placement: "before" as const,
        axis: "x" as const,
        x: 1090,
        y: 293,
        w: 22,
        h: BAND_H,
        crossStart: 293,
        crossEnd: 485,
      },
      {
        id: "Q9",
        placement: "after" as const,
        axis: "x" as const,
        x: 1190,
        y: 293,
        w: 22,
        h: BAND_H,
        crossStart: 293,
        crossEnd: 485,
      },
    ];
    const bounds = [...SECTION_BOUNDS, { sectionId: "S9", x: 1100, y: 293, w: 100, h: 192 }];
    const sel = selectTimelineDropTarget({
      slots,
      sectionBounds: bounds,
      sectionOfNode: (id) => (id === "Q3" ? "S2" : id === "Q9" ? "S9" : "S1"),
      sourceSectionId: "S1",
      cursorX: 1140,
      cursorY: 360,
      crossTolX: 34,
      crossTolY: 34,
    });
    expect(sel.target).toEqual({ id: "Q9", placement: "before" });
  });

  it("works along the vertical axis for TD timelines", () => {
    // TD: sections are rows stacked vertically. S1 y∈[293,485], S2 y∈[500,600].
    const tdSlots: TimelineDropSlot[] = [
      {
        id: "P1",
        placement: "after",
        axis: "y",
        x: 100,
        y: 463,
        w: 400,
        h: 22,
        crossStart: 100,
        crossEnd: 500,
      },
      {
        id: "P2",
        placement: "before",
        axis: "y",
        x: 100,
        y: 495,
        w: 400,
        h: 22,
        crossStart: 100,
        crossEnd: 500,
      },
    ];
    const tdBounds = [
      { sectionId: "S1", x: 100, y: 293, w: 400, h: 192 },
      { sectionId: "S2", x: 100, y: 500, w: 400, h: 100 },
    ];
    const base = {
      slots: tdSlots,
      sectionBounds: tdBounds,
      sectionOfNode: (id: string) => (id === "P2" ? "S2" : "S1"),
      cursorX: 300,
      crossTolX: 34,
      crossTolY: 34,
    };
    const above = selectTimelineDropTarget({ ...base, sourceSectionId: "S1", cursorY: 492 });
    expect(above.target).toEqual({ id: "P1", placement: "after" }); // home side wins ties
    const below = selectTimelineDropTarget({ ...base, sourceSectionId: "S1", cursorY: 505 });
    expect(below.target).toEqual({ id: "P2", placement: "before" });
  });

  it("falls back to plain nearest-slot targeting when no sections are involved", () => {
    const sel = selectTimelineDropTarget({
      slots: SLOTS_DRAG_Q2,
      sectionBounds: [],
      sectionOfNode: () => null,
      sourceSectionId: null,
      cursorX: 800,
      cursorY: 360,
      crossTolX: 34,
      crossTolY: 34,
    });
    expect(sel.target).toEqual({ id: "Q3", placement: "before" });
  });
});

describe("selectTimelineDropTarget tolerance axes", () => {
  const noSections = {
    sectionBounds: [] as TimelineDropSectionRect[],
    sectionOfNode: () => null,
    sourceSectionId: null as string | null,
  };

  it("uses crossTolX for the along-axis fallback of x-axis slots", () => {
    const slots: TimelineDropSlot[] = [
      {
        id: "QX",
        placement: "before",
        axis: "x",
        x: 100,
        y: 293,
        w: 22,
        h: 192,
        crossStart: 293,
        crossEnd: 485,
      },
    ];
    // cx = 111. dist 55 ≤ w/2(11) + crossTolX(50); dist 62 exceeds it.
    expect(
      selectTimelineDropTarget({
        ...noSections,
        slots,
        cursorX: 166,
        cursorY: 360,
        crossTolX: 50,
        crossTolY: 0,
      }).target,
    ).toEqual({ id: "QX", placement: "before" });
    expect(
      selectTimelineDropTarget({
        ...noSections,
        slots,
        cursorX: 173,
        cursorY: 360,
        crossTolX: 50,
        crossTolY: 0,
      }).target,
    ).toBeNull();
  });

  it("uses crossTolY for the along-axis fallback of y-axis slots", () => {
    const slots: TimelineDropSlot[] = [
      {
        id: "PY",
        placement: "after",
        axis: "y",
        x: 100,
        y: 463,
        w: 400,
        h: 22,
        crossStart: 100,
        crossEnd: 500,
      },
    ];
    // cy = 474. dist 55 ≤ h/2(11) + crossTolY(50); dist 62 exceeds it.
    expect(
      selectTimelineDropTarget({
        ...noSections,
        slots,
        cursorX: 300,
        cursorY: 529,
        crossTolX: 0,
        crossTolY: 50,
      }).target,
    ).toEqual({ id: "PY", placement: "after" });
    expect(
      selectTimelineDropTarget({
        ...noSections,
        slots,
        cursorX: 300,
        cursorY: 536,
        crossTolX: 0,
        crossTolY: 50,
      }).target,
    ).toBeNull();
  });

  it("explicit hitTol overrides both axis fallbacks", () => {
    const tightX: TimelineDropSlot = {
      id: "QT",
      placement: "before",
      axis: "x",
      x: 100,
      y: 293,
      w: 22,
      h: 192,
      crossStart: 293,
      crossEnd: 485,
      hitTol: 5,
    };
    const looseY: TimelineDropSlot = {
      id: "PL",
      placement: "after",
      axis: "y",
      x: 100,
      y: 463,
      w: 400,
      h: 22,
      crossStart: 100,
      crossEnd: 500,
      hitTol: 100,
    };
    // dist 8 would fit the default fallback (≤ 61) but exceeds hitTol 5.
    expect(
      selectTimelineDropTarget({
        ...noSections,
        slots: [tightX],
        cursorX: 119,
        cursorY: 360,
        crossTolX: 50,
        crossTolY: 0,
      }).target,
    ).toBeNull();
    // dist 90 exceeds the default fallback (> 61) but fits hitTol 100.
    expect(
      selectTimelineDropTarget({
        ...noSections,
        slots: [looseY],
        cursorX: 300,
        cursorY: 564,
        crossTolX: 0,
        crossTolY: 50,
      }).target,
    ).toEqual({ id: "PL", placement: "after" });
  });
});
