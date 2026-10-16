import { describe, it, expect } from "vitest";
import { moveFlowchartNode } from "@/lib/diagrams/flowchart/membership";

function edgeCount(code: string): number {
  return code.split("\n").filter((l) => /-->|---|==>/.test(l)).length;
}

describe("moveFlowchartNode", () => {
  it("moves a top-level node into a subgraph before its end with indent", () => {
    const code = `flowchart TD
    A[Start]
    subgraph sg
        B[Inside]
    end`;
    const result = moveFlowchartNode(code, "A", "sg");
    expect(result).toMatch(/^        A\[Start\]$/m);
    expect(result).toContain("B[Inside]");
    // Inserted just before the dest end.
    const lines = result.split("\n");
    expect(lines[lines.length - 2]).toMatch(/^\s*A\[Start\]/);
    expect(lines[lines.length - 1].trim()).toBe("end");
  });

  it("moves a subgraph node to top level outdented, edges untouched", () => {
    const code = `flowchart TD
    subgraph sg
        A[Start]
        B[End]
        A --> B
    end`;
    const before = edgeCount(code);
    const result = moveFlowchartNode(code, "A", null);
    expect(result).not.toBe(code);
    expect(result).toMatch(/^    A\[Start\]$/m);
    expect(result).toContain("A --> B");
    expect(edgeCount(result)).toBe(before);
  });

  it("moves a node between sibling subgraphs, source loses it, edge count identical", () => {
    const code = `flowchart TD
    subgraph s1
        A[Start]
    end
    subgraph s2
        B[End]
    end
    A --> B`;
    const before = edgeCount(code);
    const result = moveFlowchartNode(code, "A", "s2");
    expect(result).not.toContain("subgraph s1\n        A[Start]");
    expect(result).toMatch(/^        A\[Start\]$/m);
    expect(result).toContain("A --> B");
    expect(edgeCount(result)).toBe(before);
    // Source block no longer mentions the id outside quoted labels.
    const s1Block = result.slice(result.indexOf("subgraph s1"), result.indexOf("end"));
    expect(s1Block).not.toMatch(/\bA\b/);
  });

  it("is a no-op when the node is already owned by the destination", () => {
    const code = `flowchart TD
    subgraph sg
        A[Start]
    end`;
    expect(moveFlowchartNode(code, "A", "sg")).toBe(code);
  });

  it("auto-splits when the declaration line contains an edge connector", () => {
    const code = `flowchart TD
    A[Start] --> B[End]
    subgraph sg
        C[Other]
    end`;
    const result = moveFlowchartNode(code, "A", "sg");
    expect(result).not.toBe(code);
    expect(result).toContain("A --> B[End]");
    expect(result).toMatch(/^        A\[Start\]$/m);
  });

  it("is a no-op for a node defined only inside an edge line", () => {
    const code = `flowchart TD
    A --> B
    subgraph sg
        C[Other]
    end`;
    expect(moveFlowchartNode(code, "A", "sg")).toBe(code);
    expect(moveFlowchartNode(code, "A", null)).toBe(code);
  });

  it("relocates a quoted id with spaces via the sanitized fallback", () => {
    const code = `flowchart TD
    "My Node"[Label]
    subgraph sg
        B[End]
    end`;
    const result = moveFlowchartNode(code, "MyNode", "sg");
    expect(result).not.toBe(code);
    expect(result).toMatch(/^        "My Node"\[Label\]$/m);
  });

  it("leaves style/class/linkStyle/click lines byte-identical, moving only the def", () => {
    const code = `flowchart TD
    subgraph sg
        A[Start]
        B[End]
        A --> B
    end
    style A fill:#f9f
    class A myClass
    classDef myClass fill:#fff
    linkStyle 0 stroke:#333
    click A "https://example.com"`;
    const result = moveFlowchartNode(code, "B", null);
    for (const line of [
      "    style A fill:#f9f",
      "    class A myClass",
      "    classDef myClass fill:#fff",
      "    linkStyle 0 stroke:#333",
      '    click A "https://example.com"',
    ]) {
      expect(result).toContain(line);
    }
    expect(result).toMatch(/^    B\[End\]$/m);
  });

  it("leaves %% comments at their original indices", () => {
    const code = `flowchart TD
    %% header comment
    subgraph sg
        %% inner comment
        A[Start]
    end
    %% footer`;
    const before = code.split("\n");
    const result = moveFlowchartNode(code, "A", null);
    const after = result.split("\n");
    // Comments are never transported with the moved node: same lines survive,
    // in the same relative order, and none is duplicated next to the moved def.
    const comments = ["    %% header comment", "        %% inner comment", "    %% footer"];
    for (const comment of comments) {
      expect(after.filter((l) => l === comment)).toHaveLength(1);
    }
    expect(after.indexOf(comments[0])).toBeLessThan(after.indexOf(comments[1]));
    expect(after.indexOf(comments[1])).toBeLessThan(after.indexOf(comments[2]));
    expect(before.indexOf(comments[1])).toBe(after.indexOf(comments[1]));
  });

  it("returns input unchanged for unknown node, unknown dest, and missing end", () => {
    const base = `flowchart TD
    A[Start]
    subgraph sg
        B[End]
    end`;
    expect(moveFlowchartNode(base, "ZZZ", "sg")).toBe(base);
    expect(moveFlowchartNode(base, "A", "nope")).toBe(base);
    const missingEnd = `flowchart TD
    A[Start]
    subgraph sg
        B[End]`;
    expect(moveFlowchartNode(missingEnd, "A", "sg")).toBe(missingEnd);
  });

  it("moves a node from the innermost nested subgraph to the outer subgraph", () => {
    const code = `flowchart TD
    subgraph outer
        subgraph inner
            A[Deep]
        end
    end`;
    const result = moveFlowchartNode(code, "A", "outer");
    expect(result).not.toBe(code);
    expect(result).toContain("subgraph inner");
    // A now sits directly in outer (8 spaces), before outer's end.
    expect(result).toMatch(/^        A\[Deep\]$/m);
  });

  it("adopts child indent and leaves direction lines untouched", () => {
    const code = `flowchart TD
    A[Start]
    subgraph sg
        direction LR
        B[End]
    end`;
    const result = moveFlowchartNode(code, "A", "sg");
    expect(result).toMatch(/^        A\[Start\]$/m);
    expect(result).toContain("        direction LR");
  });

  it("is a no-op for empty node ids and node-named destinations", () => {
    const code = `flowchart TD
    A[Start]
    B[End]`;
    expect(moveFlowchartNode(code, "", null)).toBe(code);
    // B is a node, not a subgraph.
    expect(moveFlowchartNode(code, "A", "B")).toBe(code);
  });
});
