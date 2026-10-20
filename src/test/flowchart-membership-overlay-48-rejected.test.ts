// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  FlowchartMembershipDropLayer,
  type FlowchartMembershipHighlight,
} from "@/components/editor/FlowchartMembershipOverlay";

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
): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => {
    root.render(createElement(FlowchartMembershipDropLayer, { highlight, draggedKind }));
  });
  mounted.push({ root, el });
  return el;
}

function rectEl(el: HTMLDivElement, kind: string): HTMLElement {
  const rect = el.querySelector<HTMLElement>(`[data-flowchart-drop-rect="${kind}"]`);
  expect(rect).not.toBeNull();
  return rect!;
}

const RECT = { x: 10, y: 20, w: 100, h: 50 };

describe("issue #48 overlay rejected feedback", () => {
  it("rejected rect has light-red bg + not-allowed cursor + dashed red border", () => {
    const el = renderOverlay({ kind: "rejected", rect: RECT, reason: "same-owner" }, "node");
    const rect = rectEl(el, "rejected");
    expect(rect.style.backgroundColor).toContain("239");
    expect(rect.style.backgroundColor).toContain("68");
    expect(rect.style.cursor).toBe("not-allowed");
    expect(rect.style.border).toContain("dashed");
    expect(rect.style.border).toContain("239, 68, 68");
    expect(rect.style.pointerEvents).toBe("auto");
    expect(getComputedStyle(rect).cursor).toBe("not-allowed");
  });

  it("node-target keeps indigo bg/border and NOT not-allowed", () => {
    const el = renderOverlay({ kind: "node-target", subgraphId: "sg", rect: RECT }, "node");
    const rect = rectEl(el, "node-target");
    expect(rect.style.backgroundColor).toContain("99");
    expect(rect.style.border).toContain("99, 102, 241");
    expect(rect.style.cursor).not.toBe("not-allowed");
  });

  it("subgraph-target keeps transparent bg + indigo border and NOT not-allowed", () => {
    const el = renderOverlay({ kind: "subgraph-target", subgraphId: "sg", rect: RECT }, "subgraph");
    const rect = rectEl(el, "subgraph-target");
    expect(rect.style.backgroundColor).toBe("transparent");
    expect(rect.style.border).toContain("79, 70, 229");
    expect(rect.style.cursor).not.toBe("not-allowed");
  });

  it("all rect kinds use box-sizing border-box", () => {
    const highlights: FlowchartMembershipHighlight[] = [
      { kind: "node-target", subgraphId: "sg", rect: RECT },
      { kind: "subgraph-target", subgraphId: "sg", rect: RECT },
      { kind: "rejected", rect: RECT, reason: "same-owner" },
    ];
    for (const highlight of highlights) {
      const el = renderOverlay(highlight, "node");
      const rect = el.querySelector<HTMLElement>("[data-flowchart-drop-rect]");
      expect(rect?.style.boxSizing).toBe("border-box");
    }
  });

  it("no-reason rejected still renders rect without badge", () => {
    const el = renderOverlay({ kind: "rejected", rect: RECT }, "node");
    expect(el.querySelector("[data-flowchart-drop-reason]")).toBeNull();
    const rect = rectEl(el, "rejected");
    expect(rect.style.cursor).toBe("not-allowed");
    expect(rect.style.backgroundColor).toContain("239");
  });
});
