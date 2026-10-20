// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  computeFlowchartMembershipHighlight,
  getClusterVisualRect,
  toShellRelativeClusterRects,
} from "@/components/editor/FlowchartMembershipDrag";

const CODE = `flowchart TD
    subgraph outer
        A[Alpha]
    end
    C[Gamma]
`;

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => {},
  } as DOMRect;
}

/** g.cluster with an inner background rect (visual box) plus a taller label group. */
function clusterWithLabel(inner: DOMRect, outer: DOMRect): SVGGElement {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "cluster");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const label = document.createElementNS("http://www.w3.org/2000/svg", "g");
  label.setAttribute("class", "cluster-label");
  g.append(rect, label);
  (rect as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => inner;
  (g as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => outer;
  return g as unknown as SVGGElement;
}

describe("getClusterVisualRect (livemaid-project#48 Bug 1)", () => {
  it("prefers the inner rect over the taller outer g bbox", () => {
    const inner = domRect(10, 30, 200, 100);
    const outer = domRect(10, 10, 200, 140); // label union makes g taller
    const r = getClusterVisualRect(clusterWithLabel(inner, outer));
    expect(r).toMatchObject({ left: 10, top: 30, width: 200, height: 100 });
  });

  it("falls back to the g bbox when no inner rect exists", () => {
    const outer = domRect(5, 5, 50, 60);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    (g as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => outer;
    expect(getClusterVisualRect(g)).toMatchObject({ left: 5, top: 5, width: 50, height: 60 });
  });

  it("documents the bug: outer g bbox is taller than the visual box", () => {
    const inner = domRect(10, 30, 200, 100);
    const outer = domRect(10, 10, 200, 140);
    const g = clusterWithLabel(inner, outer);
    const buggy = (g as unknown as SVGGraphicsElement).getBoundingClientRect();
    const fixed = getClusterVisualRect(g);
    expect(buggy.height).toBeGreaterThan(inner.height);
    expect(fixed?.height).toBe(inner.height);
    expect(fixed?.top).toBe(inner.top);
  });

  it("keeps shell-relative conversion intact for inner-rect entries", () => {
    expect(
      toShellRelativeClusterRects([{ id: "outer", left: 110, top: 80, width: 200, height: 100 }], {
        left: 10,
        top: 20,
      }),
    ).toEqual([{ id: "outer", x: 100, y: 60, w: 200, h: 100 }]);
  });

  it("computeFlowchartMembershipHighlight still resolves kinds with inner-rect rects", () => {
    const rects = [{ id: "outer", x: 100, y: 60, w: 200, h: 100 }];
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "C",
        code: CODE,
        destId: "outer",
        rects,
      }),
    ).toMatchObject({
      kind: "node-target",
      subgraphId: "outer",
      rect: { x: 100, y: 60, w: 200, h: 100 },
    });
    expect(
      computeFlowchartMembershipHighlight({
        kind: "node",
        draggedId: "A",
        code: CODE,
        destId: "outer",
        rects,
      }),
    ).toMatchObject({ kind: "rejected" });
  });
});
