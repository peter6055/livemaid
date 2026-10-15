import { describe, expect, it } from "vitest";
import {
  computeFlowchartMembershipHighlight,
  resolveFlowchartNodeDropOutcome,
} from "@/components/editor/FlowchartMembershipDrag";

// Dragging a node whose line also defines an edge (e.g. `A[X] --> B`) must
// never show a success target: the move would silently no-op. See private
// issue peter6055/livemaid-project#35 comment 6190306005.
const EDGE_CODE = `flowchart TD
A[X] --> B[Y]
subgraph sg
C[Z]
end
`;

const EDGE_ONLY_CODE = `flowchart TD
A --> B
subgraph sg
C[Z]
end
`;

const MIXED_CODE = `flowchart TD
T[Top]
A[X] --> B[Y]
subgraph sg
C[Z]
end
`;

const RECTS = [{ id: "sg", x: 0, y: 0, w: 100, h: 100 }];

describe("flowchart membership drag eligibility", () => {
  it("rejects an edge-declared node over a new subgraph (no false success target)", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "A",
        code: EDGE_CODE,
        destId: "sg",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "rejected", reason: "edge-declaration" });
  });

  it("rejects an edge-only node over a new subgraph", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "B",
        code: EDGE_ONLY_CODE,
        destId: "sg",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "rejected", reason: "edge-only" });
  });

  it("still targets a new subgraph for an eligible node", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "T",
        code: MIXED_CODE,
        destId: "sg",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "node-target", subgraphId: "sg" });
  });

  it("rejects same-owner hovers with reason same-owner", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "C",
        code: MIXED_CODE,
        destId: "sg",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "rejected", reason: "same-owner" });
  });

  it("returns null for top-level (empty-space) hovers", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "A",
        code: EDGE_CODE,
        destId: null,
        rects: RECTS,
      }),
    ).toBe(null);
  });
});

describe("resolveFlowchartNodeDropOutcome", () => {
  it("blocks ineligible nodes with their block reason", () => {
    expect(resolveFlowchartNodeDropOutcome(EDGE_CODE, "A", "sg")).toEqual({
      ok: false,
      reason: "edge-declaration",
    });
    expect(resolveFlowchartNodeDropOutcome(EDGE_ONLY_CODE, "B", "sg")).toEqual({
      ok: false,
      reason: "edge-only",
    });
    expect(resolveFlowchartNodeDropOutcome(EDGE_CODE, "nope", "sg")).toEqual({
      ok: false,
      reason: "unknown-node",
    });
  });

  it("blocks same-owner and unknown-dest drops", () => {
    expect(resolveFlowchartNodeDropOutcome(MIXED_CODE, "C", "sg")).toEqual({
      ok: false,
      reason: "same-owner",
    });
    expect(resolveFlowchartNodeDropOutcome(MIXED_CODE, "T", "nope")).toEqual({
      ok: false,
      reason: "unknown-dest",
    });
  });

  it("allows eligible moves into a subgraph and out to top level", () => {
    expect(resolveFlowchartNodeDropOutcome(MIXED_CODE, "T", "sg")).toEqual({
      ok: true,
      reason: null,
    });
    expect(resolveFlowchartNodeDropOutcome(MIXED_CODE, "C", null)).toEqual({
      ok: true,
      reason: null,
    });
  });
});
