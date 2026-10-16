import { describe, expect, it } from "vitest";
import {
  computeFlowchartMembershipHighlight,
  resolveFlowchartNodeDropOutcome,
} from "@/components/editor/FlowchartMembershipDrag";
import { moveFlowchartNode } from "@/lib/diagrams/flowchart/membership";

// Issue #47 (follow-up to #35): edge-bearing declarations that carry a shape
// (e.g. `A[X] --> B`) must auto-split on drop instead of rejecting with
// `edge-declaration`. These specs assert the NEW contract, so they FAIL on
// the current unfixed lib (red baseline) and flip green once the lib lands.
// shortcut: duplicate-standalone-decl reject case omitted; lib contract for
// the dup reason string is still unsettled (see report).

const SPLIT_SOURCE_CODE = `flowchart TD
A[X] --> B
subgraph sg
    C[Z]
end
`;

const SPLIT_DEST_CODE = `flowchart TD
A --> B[Y]
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

const MULTILINE_CODE = `flowchart TD
A@{
shape: rect
}
subgraph sg
    C[Z]
end
`;

const LINKSTYLE_CODE = `flowchart TD
A[X] --> B
subgraph sg
    C[Z]
end
linkStyle 0 stroke:#f00
`;

const RECTS = [{ id: "sg", x: 0, y: 0, w: 100, h: 100 }];

describe("flowchart membership drag autosplit (issue #47)", () => {
  it("resolves ok:true when dropping an edge-bearing source node into a subgraph", () => {
    expect(resolveFlowchartNodeDropOutcome(SPLIT_SOURCE_CODE, "A", "sg")).toEqual({
      ok: true,
      reason: null,
    });
  });

  it("resolves ok:true when dropping an edge-bearing dest node into a subgraph", () => {
    expect(resolveFlowchartNodeDropOutcome(SPLIT_DEST_CODE, "B", "sg")).toEqual({
      ok: true,
      reason: null,
    });
  });

  it("highlights a node-target (not rejected) for splittable edge declarations", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "A",
        code: SPLIT_SOURCE_CODE,
        destId: "sg",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "node-target", subgraphId: "sg" });
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "B",
        code: SPLIT_DEST_CODE,
        destId: "sg",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "node-target", subgraphId: "sg" });
  });

  it("still rejects edge-only drops with edge-only", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "A",
        code: EDGE_ONLY_CODE,
        destId: "sg",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "rejected", reason: "edge-only" });
    expect(resolveFlowchartNodeDropOutcome(EDGE_ONLY_CODE, "A", "sg")).toEqual({
      ok: false,
      reason: "edge-only",
    });
  });

  it("still rejects multiline @{ blocks, unknown nodes, same-owner, and unknown dests", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "A",
        code: MULTILINE_CODE,
        destId: "sg",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "rejected", reason: "multiline-block" });
    expect(resolveFlowchartNodeDropOutcome(SPLIT_SOURCE_CODE, "nope", "sg")).toEqual({
      ok: false,
      reason: "unknown-node",
    });
    expect(resolveFlowchartNodeDropOutcome(SPLIT_SOURCE_CODE, "C", "sg")).toEqual({
      ok: false,
      reason: "same-owner",
    });
    expect(resolveFlowchartNodeDropOutcome(SPLIT_SOURCE_CODE, "A", "nope")).toEqual({
      ok: false,
      reason: "unknown-dest",
    });
  });

  it("preserves linkStyle order: bare edge stays, linkStyle line byte-identical", () => {
    const moved = moveFlowchartNode(LINKSTYLE_CODE, "A", "sg");
    // Autosplit must commit (changed string), not no-op.
    expect(moved).not.toBe(LINKSTYLE_CODE);
    const before = LINKSTYLE_CODE.split("\n");
    const after = moved.split("\n");
    const linkLine = before.find((l) => l.trim().startsWith("linkStyle"))!;
    // The linkStyle line survives byte-for-byte (index order preserved).
    expect(after).toContain(linkLine);
    // Edge count identical: exactly one connector line before and after.
    const edges = (ls: string[]) => ls.filter((l) => /-->/.test(l));
    expect(edges(after)).toHaveLength(edges(before).length);
    expect(edges(after)[0].trim()).toBe("A --> B");
    // Declaration moved with dest indent, no duplicate declarations.
    expect(after).toContain("    A[X]");
    expect(moved.match(/A\[X\]/g)).toHaveLength(1);
  });
});
