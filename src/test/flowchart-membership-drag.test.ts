import { describe, expect, it } from "vitest";
import {
  classifyFlowchartDragTarget,
  computeFlowchartMembershipHighlight,
  findFlowchartSubgraphParentId,
  isBeyondDragThreshold,
  isFlowchartSubgraphDescendant,
  isKnownFlowchartId,
  normalizeFlowchartDragId,
  resolveFlowchartDraggedId,
  toShellRelativeClusterRects,
} from "@/components/editor/FlowchartMembershipDrag";
import { resolveFlowchartDropTarget } from "@/lib/diagrams/flowchart/dropTarget";

const CODE = `flowchart TD
    subgraph outer
        A[Alpha]
        subgraph inner
            B[Beta]
        end
    end
    subgraph sib
        D[Delta]
    end
    C[Gamma]
`;

const RECTS = [
  { id: "outer", x: 0, y: 0, w: 300, h: 300 },
  { id: "inner", x: 20, y: 20, w: 150, h: 150 },
  { id: "sib", x: 320, y: 0, w: 100, h: 100 },
];

/** Minimal `{ closest(sel){} }` fake — no real DOM needed. */
function stubTarget(hits: Record<string, object | null>): Element {
  return {
    closest: (sel: string) => {
      for (const [key, el] of Object.entries(hits)) {
        if (sel.split(",").some((part) => part.trim() === key || part.includes(key))) return el;
      }
      return null;
    },
  } as unknown as Element;
}

describe("classifyFlowchartDragTarget", () => {
  it("classifies a node target as a node drag (child-node wins inside clusters)", () => {
    const nodeEl = {};
    const el = stubTarget({ ".node": nodeEl as object, "g.cluster": {} });
    const result = classifyFlowchartDragTarget(el);
    expect(result.kind).toBe("node");
    expect(result.element).toBe(nodeEl);
  });

  it("classifies a cluster label hit as a subgraph drag via cluster-label", () => {
    const clusterEl = {};
    const el = stubTarget({ ".cluster-label": {}, "g.cluster": clusterEl as object });
    const result = classifyFlowchartDragTarget(el);
    expect(result.kind).toBe("subgraph");
    expect(result.via).toBe("cluster-label");
    expect(result.element).toBe(clusterEl);
  });

  it("classifies a cluster border hit as a subgraph drag via cluster-border", () => {
    const clusterEl = {};
    const el = stubTarget({ "g.cluster": clusterEl as object });
    const result = classifyFlowchartDragTarget(el);
    expect(result.kind).toBe("subgraph");
    expect(result.via).toBe("cluster-border");
  });

  it("ignores empty-space hits without side effects", () => {
    expect(classifyFlowchartDragTarget(stubTarget({}))).toEqual({
      kind: null,
      via: "none",
      element: null,
    });
    expect(classifyFlowchartDragTarget(null)).toEqual({ kind: null, via: "none", element: null });
    expect(classifyFlowchartDragTarget({} as Element)).toEqual({
      kind: null,
      via: "none",
      element: null,
    });
  });
});

describe("isBeyondDragThreshold", () => {
  it("arms only past 5px viewport movement", () => {
    expect(isBeyondDragThreshold(0, 0, 5, 0)).toBe(false);
    expect(isBeyondDragThreshold(0, 0, 5, 5)).toBe(false);
    expect(isBeyondDragThreshold(0, 0, 6, 0)).toBe(true);
    expect(isBeyondDragThreshold(0, 0, 0, -6)).toBe(true);
  });
});

describe("toShellRelativeClusterRects", () => {
  it("maps viewport rects into shell-relative space", () => {
    expect(
      toShellRelativeClusterRects([{ id: "outer", left: 110, top: 60, width: 300, height: 200 }], {
        left: 10,
        top: 20,
      }),
    ).toEqual([{ id: "outer", x: 100, y: 40, w: 300, h: 200 }]);
  });
});

describe("normalizeFlowchartDragId / resolveFlowchartDraggedId", () => {
  it("strips mermaid svg prefixes and numeric suffixes", () => {
    expect(normalizeFlowchartDragId("flowchart-A-0")).toBe("A");
    expect(normalizeFlowchartDragId("svg-foo-2")).toBe("foo");
    expect(normalizeFlowchartDragId("A")).toBe("A");
    expect(normalizeFlowchartDragId("")).toBe("");
  });

  it("resolves render-prefixed raw ids against code ids", () => {
    expect(resolveFlowchartDraggedId(CODE, "flowchart-diagram1-A-0", "node")).toBe("A");
    expect(resolveFlowchartDraggedId(CODE, "flowchart-outer-4", "subgraph")).toBe("outer");
    expect(resolveFlowchartDraggedId(CODE, "flowchart-nope-0", "node")).toBe(null);
    expect(resolveFlowchartDraggedId(CODE, "", "node")).toBe(null);
  });

  it("recognizes known node and subgraph ids", () => {
    expect(isKnownFlowchartId(CODE, "A", "node")).toBe(true);
    expect(isKnownFlowchartId(CODE, "outer", "node")).toBe(false);
    expect(isKnownFlowchartId(CODE, "inner", "subgraph")).toBe(true);
    expect(isKnownFlowchartId(CODE, "A", "subgraph")).toBe(false);
  });
});

describe("isFlowchartSubgraphDescendant / findFlowchartSubgraphParentId", () => {
  it("detects nesting via code line ranges", () => {
    expect(isFlowchartSubgraphDescendant(CODE, "outer", "inner")).toBe(true);
    expect(isFlowchartSubgraphDescendant(CODE, "inner", "outer")).toBe(false);
    expect(isFlowchartSubgraphDescendant(CODE, "outer", "outer")).toBe(false);
    expect(isFlowchartSubgraphDescendant(CODE, "outer", "sib")).toBe(false);
  });

  it("finds the innermost parent subgraph", () => {
    expect(findFlowchartSubgraphParentId(CODE, "inner")).toBe("outer");
    expect(findFlowchartSubgraphParentId(CODE, "outer")).toBe(null);
    expect(findFlowchartSubgraphParentId(CODE, "nope")).toBe(null);
  });
});

describe("computeFlowchartMembershipHighlight", () => {
  it("rejects a node hover over its current owner, targets a new subgraph", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "B",
        code: CODE,
        destId: "inner",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "rejected" });
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "B",
        code: CODE,
        destId: "outer",
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "node-target", subgraphId: "outer" });
  });

  it("returns null for top-level (empty-space) hovers — no box to draw", () => {
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "B",
        code: CODE,
        destId: null,
        rects: RECTS,
      }),
    ).toBe(null);
    expect(
      computeFlowchartMembershipHighlight({
        kind: "subgraph",
        draggedId: "inner",
        code: CODE,
        destId: null,
        rects: RECTS,
      }),
    ).toBe(null);
  });

  it("rejects subgraph self/descendant/same-parent drops, targets valid ones", () => {
    const base = { kind: "subgraph" as const, code: CODE, rects: RECTS };
    expect(
      computeFlowchartMembershipHighlight({ ...base, draggedId: "outer", destId: "outer" }),
    ).toMatchObject({ kind: "rejected" });
    expect(
      computeFlowchartMembershipHighlight({ ...base, draggedId: "outer", destId: "inner" }),
    ).toMatchObject({ kind: "rejected" });
    expect(
      computeFlowchartMembershipHighlight({ ...base, draggedId: "inner", destId: "outer" }),
    ).toMatchObject({ kind: "rejected" });
    expect(
      computeFlowchartMembershipHighlight({ ...base, draggedId: "inner", destId: "sib" }),
    ).toMatchObject({ kind: "subgraph-target", subgraphId: "sib" });
  });

  it("delegates innermost selection to the resolver (nested rects)", () => {
    const destId = resolveFlowchartDropTarget(RECTS, { x: 30, y: 30 }).subgraphId;
    expect(destId).toBe("inner");
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "C",
        code: CODE,
        destId,
        rects: RECTS,
      }),
    ).toMatchObject({ kind: "node-target", subgraphId: "inner" });
  });
});
