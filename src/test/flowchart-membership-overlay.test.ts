// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  FlowchartMembershipDropLayer,
  flowchartDropBlockedMessage,
  flowchartTopLevelHint,
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
  showTopLevelHint?: boolean,
): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  flushSync(() => {
    root.render(
      createElement(FlowchartMembershipDropLayer, { highlight, draggedKind, showTopLevelHint }),
    );
  });
  mounted.push({ root, el });
  return el;
}

const RECT = { x: 10, y: 20, w: 100, h: 50 };

describe("flowchartDropBlockedMessage", () => {
  it("returns the exact contract wording for every reason", () => {
    expect(flowchartDropBlockedMessage("edge-declaration")).toBe(
      "This node can't be moved directly because its Mermaid declaration also defines a connection. Move the node declaration and connection into separate lines, then try again.",
    );
    expect(flowchartDropBlockedMessage("edge-only")).toBe(
      "This node can't be moved directly because it has no standalone declaration to move. Add a separate `ID[Label]` line, then try again.",
    );
    expect(flowchartDropBlockedMessage("multiline-block")).toBe(
      "This node can't be moved directly because its declaration spans multiple lines.",
    );
    expect(flowchartDropBlockedMessage("unknown-node")).toBe(
      "This node can't be moved. Its declaration wasn't found.",
    );
    expect(flowchartDropBlockedMessage("same-owner")).toBe("Already in this subgraph.");
    expect(flowchartDropBlockedMessage("unknown-dest")).toBe(
      "This drop target isn't valid. Try another subgraph or empty canvas.",
    );
  });

  it("falls back to the unknown-dest wording for missing reasons", () => {
    expect(flowchartDropBlockedMessage(null)).toBe(
      "This drop target isn't valid. Try another subgraph or empty canvas.",
    );
    expect(flowchartDropBlockedMessage("bogus")).toBe(
      "This drop target isn't valid. Try another subgraph or empty canvas.",
    );
  });
});

describe("flowchartTopLevelHint", () => {
  it("returns the top-level release hint", () => {
    expect(flowchartTopLevelHint("node")).toBe("Release to make top-level");
  });
});

describe("FlowchartMembershipDropLayer", () => {
  it("shows actionable text for rejected edge-declaration drags", () => {
    const el = renderOverlay({ kind: "rejected", rect: RECT, reason: "edge-declaration" }, "node");
    const badge = el.querySelector("[data-flowchart-drop-reason]");
    expect(badge?.textContent).toContain("separate lines");
    expect(el.querySelector('[data-flowchart-drop-rect="rejected"]')).not.toBeNull();
  });

  it("shows Already for rejected same-owner drags", () => {
    const el = renderOverlay({ kind: "rejected", rect: RECT, reason: "same-owner" }, "node");
    expect(el.querySelector("[data-flowchart-drop-reason]")?.textContent).toContain("Already");
  });

  it("renders no message badge when a rejected highlight carries no reason", () => {
    const el = renderOverlay({ kind: "rejected", rect: RECT }, "node");
    expect(el.querySelector("[data-flowchart-drop-reason]")).toBeNull();
    expect(el.querySelector('[data-flowchart-drop-rect="rejected"]')).not.toBeNull();
  });

  it("keeps the node-target rect and adds a Move into hint chip", () => {
    const el = renderOverlay({ kind: "node-target", subgraphId: "sg", rect: RECT }, "node");
    expect(el.querySelector('[data-flowchart-drop-rect="node-target"]')).not.toBeNull();
    expect(el.querySelector("[data-flowchart-drop-node-hint]")?.textContent).toBe("Move into sg");
    expect(el.querySelector("[data-flowchart-drop-reason]")).toBeNull();
  });

  it("renders the top-level hint for node drags over empty space when enabled", () => {
    const el = renderOverlay(null, "node", true);
    expect(el.querySelector("[data-flowchart-top-level-hint]")?.textContent).toBe(
      "Release to make top-level",
    );
  });

  it("renders nothing for empty space when the top-level hint is off", () => {
    const el = renderOverlay(null, "node");
    expect(el.innerHTML).toBe("");
  });
});
