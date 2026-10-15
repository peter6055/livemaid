import { describe, expect, it } from "vitest";
import { resolveFlowchartDropTarget } from "@/lib/diagrams/flowchart/dropTarget";

describe("resolveFlowchartDropTarget", () => {
  it("resolves a point inside a single cluster to its id", () => {
    const rects = [{ id: "A", x: 0, y: 0, w: 100, h: 100 }];
    expect(resolveFlowchartDropTarget(rects, { x: 50, y: 50 })).toEqual({ subgraphId: "A" });
  });

  it("returns null when the point is outside all clusters", () => {
    const rects = [{ id: "A", x: 0, y: 0, w: 100, h: 100 }];
    expect(resolveFlowchartDropTarget(rects, { x: 150, y: 150 })).toEqual({ subgraphId: null });
  });

  it("resolves nested rects to the innermost cluster", () => {
    const rects = [
      { id: "outer", x: 0, y: 0, w: 200, h: 200 },
      { id: "inner", x: 50, y: 50, w: 100, h: 100 },
    ];
    expect(resolveFlowchartDropTarget(rects, { x: 75, y: 75 })).toEqual({ subgraphId: "inner" });
    expect(resolveFlowchartDropTarget(rects, { x: 10, y: 10 })).toEqual({ subgraphId: "outer" });
  });

  it("resolves three-level nesting to the deepest cluster", () => {
    const rects = [
      { id: "a", x: 0, y: 0, w: 300, h: 300 },
      { id: "b", x: 20, y: 20, w: 200, h: 200 },
      { id: "c", x: 40, y: 40, w: 100, h: 100 },
    ];
    expect(resolveFlowchartDropTarget(rects, { x: 60, y: 60 })).toEqual({ subgraphId: "c" });
    expect(resolveFlowchartDropTarget(rects, { x: 30, y: 30 })).toEqual({ subgraphId: "b" });
  });

  it("prefers the smaller-area rect among overlapping siblings", () => {
    const rects = [
      { id: "big", x: 0, y: 0, w: 200, h: 200 },
      { id: "small", x: 100, y: 100, w: 50, h: 50 },
    ];
    expect(resolveFlowchartDropTarget(rects, { x: 120, y: 120 })).toEqual({
      subgraphId: "small",
    });
  });

  it("resolves a point on a shared border to the innermost cluster", () => {
    const rects = [
      { id: "outer", x: 0, y: 0, w: 100, h: 100 },
      { id: "inner", x: 0, y: 0, w: 50, h: 50 },
    ];
    // (0,0) is on the edge of both; innermost wins.
    expect(resolveFlowchartDropTarget(rects, { x: 0, y: 0 })).toEqual({ subgraphId: "inner" });
    // Right edge inclusive.
    expect(resolveFlowchartDropTarget(rects, { x: 100, y: 100 })).toEqual({
      subgraphId: "outer",
    });
  });

  it("returns null for an empty rect list", () => {
    expect(resolveFlowchartDropTarget([], { x: 10, y: 10 })).toEqual({ subgraphId: null });
  });

  it("ignores degenerate rects with zero or negative w/h", () => {
    const rects = [
      { id: "flat", x: 0, y: 0, w: 0, h: 100 },
      { id: "neg", x: 0, y: 0, w: 100, h: -10 },
      { id: "ok", x: 0, y: 0, w: 100, h: 100 },
    ];
    expect(resolveFlowchartDropTarget(rects, { x: 50, y: 50 })).toEqual({ subgraphId: "ok" });
    expect(
      resolveFlowchartDropTarget(
        [
          { id: "flat", x: 0, y: 0, w: 0, h: 100 },
          { id: "neg", x: 0, y: 0, w: 100, h: -10 },
        ],
        { x: 50, y: 50 },
      ),
    ).toEqual({ subgraphId: null });
  });

  it("breaks identical-rect ties deterministically by first-in-array", () => {
    const rects = [
      { id: "first", x: 0, y: 0, w: 100, h: 100 },
      { id: "second", x: 0, y: 0, w: 100, h: 100 },
    ];
    expect(resolveFlowchartDropTarget(rects, { x: 50, y: 50 })).toEqual({
      subgraphId: "first",
    });
  });

  it("resolves identically under uniform scaling (zoom-invariance)", () => {
    const rects = [
      { id: "outer", x: 0, y: 0, w: 200, h: 200 },
      { id: "inner", x: 50, y: 50, w: 100, h: 100 },
    ];
    const scaled = rects.map((r) => ({ id: r.id, x: r.x * 2, y: r.y * 2, w: r.w * 2, h: r.h * 2 }));
    expect(resolveFlowchartDropTarget(rects, { x: 75, y: 75 })).toEqual(
      resolveFlowchartDropTarget(scaled, { x: 150, y: 150 }),
    );
    expect(resolveFlowchartDropTarget(scaled, { x: 150, y: 150 })).toEqual({
      subgraphId: "inner",
    });
  });

  it("returns null in the gap between clusters", () => {
    const rects = [
      { id: "left", x: 0, y: 0, w: 100, h: 100 },
      { id: "right", x: 200, y: 0, w: 100, h: 100 },
    ];
    expect(resolveFlowchartDropTarget(rects, { x: 150, y: 50 })).toEqual({ subgraphId: null });
  });

  it("rejects self and descendant drops via isValidSubgraphDrop", async () => {
    const { isValidSubgraphDrop } = await import("@/lib/diagrams/flowchart/dropTarget");
    const isDescendant = (dragged: string, dest: string) => dragged === "outer" && dest === "inner";
    expect(isValidSubgraphDrop("outer", "outer", isDescendant)).toBe(false);
    expect(isValidSubgraphDrop("outer", "inner", isDescendant)).toBe(false);
    expect(isValidSubgraphDrop("outer", null, isDescendant)).toBe(true);
    expect(isValidSubgraphDrop("leaf", "outer", isDescendant)).toBe(true);
  });
});
