// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  getClusterVisualRect,
  toShellRelativeClusterRects,
  type FlowchartShellOrigin,
} from "@/components/editor/FlowchartMembershipDrag";
import {
  FlowchartMembershipDropLayer,
  type FlowchartMembershipHighlight,
} from "@/components/editor/FlowchartMembershipOverlay";

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

const SVGNS = "http://www.w3.org/2000/svg";

function mockRect(el: Element, r: DOMRect): void {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => r;
}

/** g.cluster with a background rect plus a taller label group (label union inflates g). */
function clusterWithLabel(inner: DOMRect, outer: DOMRect): SVGGElement {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "cluster");
  const rect = document.createElementNS(SVGNS, "rect");
  const label = document.createElementNS(SVGNS, "g");
  label.setAttribute("class", "cluster-label");
  g.append(rect, label);
  mockRect(rect, inner);
  mockRect(g, outer);
  return g as unknown as SVGGElement;
}

describe("getClusterVisualRect alignment", () => {
  it("returns the inner background rect when the label inflates the group bbox", () => {
    const r = getClusterVisualRect(
      clusterWithLabel(domRect(10, 30, 200, 100), domRect(10, 10, 200, 140)),
    );
    expect(r).toMatchObject({ left: 10, top: 30, width: 200, height: 100 });
  });

  it("never returns a nested node rect: falls back to the group bbox", () => {
    // Background rect missing as a direct child; the only rect lives nested
    // inside a member node group. The old descendant-querySelector fallback
    // would return the tiny 40x20 node box; the fix must return the group box.
    const tiny = domRect(50, 50, 40, 20);
    const outer = domRect(10, 10, 200, 140);
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "cluster");
    const nodes = document.createElementNS(SVGNS, "g");
    const nodeRect = document.createElementNS(SVGNS, "rect");
    nodes.append(nodeRect);
    g.append(nodes);
    mockRect(nodeRect, tiny);
    mockRect(g, outer);
    expect(getClusterVisualRect(g)).toMatchObject({ left: 10, top: 10, width: 200, height: 140 });
  });

  it("picks the largest-area rect when several direct-child rects exist", () => {
    const big = domRect(10, 30, 200, 100);
    const small = domRect(12, 32, 40, 20);
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "cluster");
    const r1 = document.createElementNS(SVGNS, "rect");
    const r2 = document.createElementNS(SVGNS, "rect");
    g.append(r1, r2);
    mockRect(r1, small);
    mockRect(r2, big);
    mockRect(g, domRect(10, 10, 200, 140));
    expect(getClusterVisualRect(g)).toMatchObject({ left: 10, top: 30, width: 200, height: 100 });
  });

  it("falls back to the g bbox when no direct-child rect exists", () => {
    const g = document.createElementNS(SVGNS, "g");
    mockRect(g, domRect(5, 5, 50, 60));
    expect(getClusterVisualRect(g)).toMatchObject({ left: 5, top: 5, width: 50, height: 60 });
  });
});

describe("toShellRelativeClusterRects alignment", () => {
  // The overlay renders in the shell's viewport space, so a cluster rect is just
  // its viewport rect minus the captured shell origin — no scale/scroll involved.
  const origin: FlowchartShellOrigin = { left: 100, top: 50 };

  it("maps a viewport rect onto the identical box in shell space", () => {
    const entry = { id: "outer", left: 310, top: 200, width: 300, height: 150 };
    expect(toShellRelativeClusterRects([entry], origin)).toEqual([
      { id: "outer", x: 210, y: 150, w: 300, h: 150 },
    ]);
  });

  it("is zoom-agnostic: the box keeps its screen size and never grows with zoom", () => {
    // A cluster measured at 300 screen px stays a 300px box, so the overlay's
    // plain-px border (2px) is a constant 2 screen px at any zoom.
    const [r] = toShellRelativeClusterRects(
      [{ id: "sg", left: 400, top: 100, width: 300, height: 150 }],
      { left: 100, top: 50 },
    );
    expect(r).toMatchObject({ w: 300, h: 150 });
  });
});

let mounted: Array<{ root: Root; el: HTMLDivElement }> = [];

afterEach(() => {
  for (const { root, el } of mounted) {
    root.unmount();
    el.remove();
  }
  mounted = [];
});

function renderOverlay(
  highlight: FlowchartMembershipHighlight,
  draggedKind: "node" | "subgraph" | null,
  showTopLevelHint?: boolean,
): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => {
    root.render(
      createElement(FlowchartMembershipDropLayer, {
        highlight,
        draggedKind,
        showTopLevelHint,
      }),
    );
  });
  mounted.push({ root, el });
  return el;
}

describe("FlowchartMembershipDropLayer rect alignment", () => {
  it("renders the highlight rect with exact left/top/width/height and border-box", () => {
    const el = renderOverlay(
      { kind: "subgraph-target", subgraphId: "outer", rect: { x: 100, y: 60, w: 200, h: 100 } },
      "node",
    );
    const box = el.querySelector('[data-flowchart-drop-rect="subgraph-target"]') as HTMLElement;
    expect(box).not.toBeNull();
    // No extra offset: style matches the incoming rect px-for-px.
    expect(box.style.left).toBe("100px");
    expect(box.style.top).toBe("60px");
    expect(box.style.width).toBe("200px");
    expect(box.style.height).toBe("100px");
    // Border drawn INSIDE the measured box.
    expect(box.style.boxSizing).toBe("border-box");
  });
});

// The layer renders OUTSIDE the pan/zoom transform, so a plain-px border is a
// constant on-screen width at any zoom. It must NOT try to scale-lock with
// `calc(px * 1/zoom)`: Chrome floors `border-width` to 1 CSS px, so the border
// would render 3, 4, 6 … screen px as you zoom in.
describe("FlowchartMembershipDropLayer stays zoom-independent", () => {
  const RECT = { x: 10, y: 20, w: 100, h: 50 };

  it("uses plain-px borders with no zoom compensation", () => {
    for (const highlight of [
      { kind: "node-target", subgraphId: "sg", rect: RECT },
      { kind: "subgraph-target", subgraphId: "sg", rect: RECT },
      { kind: "rejected", rect: RECT, reason: "same-owner" },
    ] as FlowchartMembershipHighlight[]) {
      const el = renderOverlay(highlight, "node");
      const box = el.querySelector<HTMLElement>("[data-flowchart-drop-rect]")!;
      expect(box.style.border).not.toContain("var(");
      expect(box.style.border).not.toContain("calc(");
      expect(box.style.borderRadius).not.toContain("var(");
    }
  });

  it("keeps the hint chips free of zoom scaling", () => {
    const nodeHint = renderOverlay(
      { kind: "node-target", subgraphId: "sg", rect: RECT },
      "node",
    ).querySelector<HTMLElement>("[data-flowchart-drop-node-hint]")!;
    expect(nodeHint.style.transform).toBe("");

    const blocked = renderOverlay(
      { kind: "rejected", rect: RECT, reason: "same-owner" },
      "node",
    ).querySelector<HTMLElement>("[data-flowchart-drop-reason]")!;
    expect(blocked.style.transform).toBe("translateY(-110%)");

    const topLevel = renderOverlay(null, "node", true).querySelector<HTMLElement>(
      "[data-flowchart-top-level-hint]",
    )!;
    expect(topLevel.style.transform).toBe("");
    expect(topLevel.className).toContain("-translate-x-1/2");
  });
});
