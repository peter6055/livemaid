import { describe, it, expect } from "vitest";
import { CONNECTOR_REGEX } from "@/lib/diagrams/utils";
import {
  getFlowchartNodeMoveEligibility,
  moveFlowchartNode,
} from "@/lib/diagrams/flowchart/membership";

// Issue #47 lib contract: an edge-bearing declaration (e.g. `A[X] --> B`)
// auto-splits on move — the bare edge stays at its original index (preserving
// positional linkStyle order) and only the declaration moves.

function edgeCount(code: string): number {
  return code.split("\n").filter((l) => CONNECTOR_REGEX.test(l)).length;
}

describe("moveFlowchartNode autosplit (issue #47)", () => {
  it("splits A[X] --> B into a moved decl and a bare edge at the original index", () => {
    const code = `flowchart TD
    A[X] --> B
    subgraph sg
        C[Other]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({
      eligible: true,
      reason: null,
    });
    const before = edgeCount(code);
    const result = moveFlowchartNode(code, "A", "sg");
    expect(result).not.toBe(code);
    const after = result.split("\n");
    expect(after[1].trim()).toBe("A --> B");
    expect(result).toMatch(/^        A\[X\]$/m);
    expect(edgeCount(result)).toBe(before);
  });

  it("splits to top level: bare edge stays in the subgraph, decl outdented", () => {
    const code = `flowchart TD
    subgraph sg
        A[X] --> B
        C[Other]
    end`;
    const before = edgeCount(code);
    const result = moveFlowchartNode(code, "A", null);
    expect(result).not.toBe(code);
    const after = result.split("\n");
    expect(after[2].trim()).toBe("A --> B");
    expect(result).toMatch(/^    A\[X\]$/m);
    expect(edgeCount(result)).toBe(before);
  });

  it("splits A --> B[Y] when dragging the dest node B", () => {
    const code = `flowchart TD
    A --> B[Y]
    subgraph sg
        C[Other]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "B")).toEqual({
      eligible: true,
      reason: null,
    });
    const result = moveFlowchartNode(code, "B", "sg");
    expect(result).not.toBe(code);
    expect(result.split("\n")[1].trim()).toBe("A --> B");
    expect(result).toMatch(/^        B\[Y\]$/m);
    expect(edgeCount(result)).toBe(edgeCount(code));
  });

  it("moves only the dragged node when both ends carry shapes", () => {
    const code = `flowchart TD
    A[X] --> B[Y]
    subgraph sg
        C[Other]
    end`;
    const result = moveFlowchartNode(code, "A", "sg");
    expect(result).not.toBe(code);
    expect(result.split("\n")[1].trim()).toBe("A --> B[Y]");
    expect(result).toMatch(/^        A\[X\]$/m);
    expect(result.match(/B\[Y\]/g)).toHaveLength(1);
  });

  it("preserves labels and non-arrow connectors verbatim", () => {
    const cases: Array<[string, string, string]> = [
      ["A[X] -->|hi| B", "A[X]", "A -->|hi| B"],
      ["A(X) --> B", "A(X)", "A --> B"],
      ["A{{X}} --> B", "A{{X}}", "A --> B"],
      ["A@{shape: rect} --> B", "A@{shape: rect}", "A --> B"],
      ["A[X] --- B", "A[X]", "A --- B"],
      ["A[X] ==> B", "A[X]", "A ==> B"],
      ["A[X] -.-> B", "A[X]", "A -.-> B"],
      ["A[X] ~~~ B", "A[X]", "A ~~~ B"],
    ];
    for (const [src, decl, bare] of cases) {
      const code = `flowchart TD
    ${src}
    subgraph sg
        C[Other]
    end`;
      const result = moveFlowchartNode(code, "A", "sg");
      expect(result.split("\n")[1].trim()).toBe(bare);
      expect(result).toContain(`        ${decl}`);
      expect(edgeCount(result)).toBe(edgeCount(code));
    }
  });

  it("leaves style/class/linkStyle/click lines byte-identical, linkStyle 0 intact", () => {
    const code = `flowchart TD
    subgraph sg
        A[X] --> B
    end
    style A fill:#f9f
    class A myClass
    classDef myClass fill:#fff
    linkStyle 0 stroke:#333
    click A "https://example.com"`;
    const result = moveFlowchartNode(code, "A", null);
    expect(result).not.toBe(code);
    for (const line of [
      "    style A fill:#f9f",
      "    class A myClass",
      "    classDef myClass fill:#fff",
      "    linkStyle 0 stroke:#333",
      '    click A "https://example.com"',
    ]) {
      expect(result).toContain(line);
    }
    expect(result.split("\n")[2].trim()).toBe("A --> B");
    expect(result).toMatch(/^    A\[X\]$/m);
    expect(edgeCount(result)).toBe(edgeCount(code));
  });

  it("splits only the first declaration of a chain A[X] --> B --> C", () => {
    const code = `flowchart TD
    A[X] --> B --> C
    subgraph sg
        D[Other]
    end`;
    const result = moveFlowchartNode(code, "A", "sg");
    expect(result).not.toBe(code);
    expect(result.split("\n")[1].trim()).toBe("A --> B --> C");
    expect(result).toMatch(/^        A\[X\]$/m);
    expect(edgeCount(result)).toBe(edgeCount(code));
  });

  it("splits a quoted id with spaces via the sanitized fallback", () => {
    const code = `flowchart TD
    "My Node"[Label] --> B
    subgraph sg
        C[Other]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "MyNode")).toEqual({
      eligible: true,
      reason: null,
    });
    const result = moveFlowchartNode(code, "MyNode", "sg");
    expect(result).not.toBe(code);
    expect(result.split("\n")[1].trim()).toBe('"My Node" --> B');
    expect(result).toMatch(/^        "My Node"\[Label\]$/m);
  });

  it("is a no-op when a standalone duplicate declaration exists elsewhere", () => {
    const code = `flowchart TD
    A[X] --> B
    A[X]
    subgraph sg
        C[Other]
    end`;
    expect(moveFlowchartNode(code, "A", "sg")).toBe(code);
    expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({
      eligible: false,
      reason: "edge-declaration",
    });
  });

  it("is a no-op for &-fanout, unclosed @{-blocks, and same-owner drops", () => {
    const fanout = `flowchart TD
    A[X] & B[Y] --> C
    subgraph sg
        D[Other]
    end`;
    expect(moveFlowchartNode(fanout, "A", "sg")).toBe(fanout);
    expect(getFlowchartNodeMoveEligibility(fanout, "A")).toEqual({
      eligible: false,
      reason: "edge-declaration",
    });
    const multiline = `flowchart TD
    A@{ shape: rect
    label: "Start"
    }
    subgraph sg
        B[End]
    end`;
    expect(moveFlowchartNode(multiline, "A", "sg")).toBe(multiline);
    const sameOwner = `flowchart TD
    subgraph sg
        A[X] --> B
    end`;
    expect(moveFlowchartNode(sameOwner, "A", "sg")).toBe(sameOwner);
  });
});
