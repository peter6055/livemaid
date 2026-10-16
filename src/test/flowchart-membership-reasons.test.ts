import { describe, it, expect } from "vitest";
import {
  flowchartNodeMoveBlockedMessage,
  getFlowchartNodeMoveEligibility,
  moveFlowchartNode,
} from "@/lib/diagrams/flowchart/membership";

describe("getFlowchartNodeMoveEligibility", () => {
  it("marks a pure node declaration eligible", () => {
    const code = `flowchart TD
    A[Start]
    subgraph sg
        B[End]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({ eligible: true, reason: null });
  });

  it("marks a quoted id with spaces eligible via the sanitized fallback", () => {
    const code = `flowchart TD
    "My Node"[Label]
    subgraph sg
        B[End]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "MyNode")).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it("auto-splits an edge-bearing declaration into a moved decl and a bare edge", () => {
    const code = `flowchart TD
    A[Start] --> B[End]
    subgraph sg
        C[Other]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({
      eligible: true,
      reason: null,
    });
    const result = moveFlowchartNode(code, "A", "sg");
    expect(result).not.toBe(code);
    expect(result).toContain("A --> B[End]");
    expect(result).toMatch(/^        A\[Start\]$/m);
  });

  it("reports edge-only for a node known only via an edge", () => {
    const code = `flowchart TD
    A --> B
    subgraph sg
        C[Other]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({
      eligible: false,
      reason: "edge-only",
    });
    expect(moveFlowchartNode(code, "A", "sg")).toBe(code);
    expect(moveFlowchartNode(code, "A", null)).toBe(code);
  });

  it("reports multiline-block for an unclosed @{ block", () => {
    const code = `flowchart TD
    A@{ shape: rect
    label: "Start"
    }
    subgraph sg
        B[End]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({
      eligible: false,
      reason: "multiline-block",
    });
    expect(moveFlowchartNode(code, "A", "sg")).toBe(code);
  });

  it("reports unknown-node for missing and empty ids", () => {
    const code = `flowchart TD
    A[Start]
    subgraph sg
        B[End]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "ZZZ")).toEqual({
      eligible: false,
      reason: "unknown-node",
    });
    expect(getFlowchartNodeMoveEligibility(code, "")).toEqual({
      eligible: false,
      reason: "unknown-node",
    });
    expect(moveFlowchartNode(code, "ZZZ", "sg")).toBe(code);
  });
});

describe("flowchartNodeMoveBlockedMessage", () => {
  it("returns the exact contract wording for every reason", () => {
    expect(flowchartNodeMoveBlockedMessage("edge-declaration")).toBe(
      "This node can't be moved directly because its Mermaid declaration also defines a connection. Move the node declaration and connection into separate lines, then try again.",
    );
    expect(flowchartNodeMoveBlockedMessage("edge-only")).toBe(
      "This node can't be moved directly because it has no standalone declaration to move. Add a separate `ID[Label]` line, then try again.",
    );
    expect(flowchartNodeMoveBlockedMessage("multiline-block")).toBe(
      "This node can't be moved directly because its declaration spans multiple lines.",
    );
    expect(flowchartNodeMoveBlockedMessage("unknown-node")).toBe(
      "This node can't be moved. Its declaration wasn't found.",
    );
    expect(flowchartNodeMoveBlockedMessage("same-owner")).toBe("Already in this subgraph.");
    expect(flowchartNodeMoveBlockedMessage("unknown-dest")).toBe(
      "This drop target isn't valid. Try another subgraph or empty canvas.",
    );
  });
});
