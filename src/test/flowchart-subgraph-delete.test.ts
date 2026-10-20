import { describe, it, expect } from "vitest";
import { deleteFlowchartSubgraph } from "@/lib/diagrams/flowchart/deletion";

describe("deleteFlowchartSubgraph", () => {
  it("unwraps a top-level subgraph and preserves its children", () => {
    const code = `flowchart TD
    subgraph chunk1["Chunk 1 Ingester process"]
        E["Chunk N<br>Ingester process"]
        E -->|link| E1@{ shape: cyl, label: "Chunk 1 Valid File" }
    end`;

    const result = deleteFlowchartSubgraph(code, "chunk1");

    expect(result).not.toContain("subgraph chunk1");
    expect(result).not.toMatch(/^\s*end$/m);
    expect(result).toContain('E["Chunk N<br>Ingester process"]');
    expect(result).toContain('E -->|link| E1@{ shape: cyl, label: "Chunk 1 Valid File" }');
    // Children should be promoted to the parent (root) indentation level.
    expect(result).toMatch(/^    E\[/m);
    expect(result).toMatch(/^    E -->/m);
  });

  it("preserves internal edges and node definitions", () => {
    const code = `flowchart LR
    subgraph sg
        A[Start]
        B((End))
        A --> B
    end`;

    const result = deleteFlowchartSubgraph(code, "sg");

    expect(result).toBe(`flowchart LR
    A[Start]
    B((End))
    A --> B`);
  });

  it("moves a nested subgraph to the parent scope with correct indentation", () => {
    const code = `flowchart TD
    subgraph outer
        A[Outer]
        subgraph inner
            B[Inner]
        end
    end`;

    const result = deleteFlowchartSubgraph(code, "outer");

    expect(result).not.toContain("subgraph outer");
    expect(result).toContain("subgraph inner");
    expect(result).toContain("B[Inner]");
    // Inner subgraph should now sit at root indentation.
    expect(result).toMatch(/^    subgraph inner/m);
    expect(result).toMatch(/^        B\[Inner\]/m);
  });

  it("promotes children of a nested subgraph to the parent subgraph", () => {
    const code = `flowchart TD
    subgraph outer
        A[Outer]
        subgraph inner
            B[Inner]
        end
    end`;

    const result = deleteFlowchartSubgraph(code, "inner");

    expect(result).not.toContain("subgraph inner");
    expect(result).toContain("subgraph outer");
    expect(result).toContain("A[Outer]");
    expect(result).toContain("B[Inner]");
    // B should now be indented inside outer, not inside an inner block.
    expect(result).toMatch(/^        B\[Inner\]/m);
  });

  it("removes edges that had the deleted subgraph as an endpoint", () => {
    const code = `flowchart TD
    subgraph sg
        B[Inside]
    end
    sg --> C[Outside]
    C --> D[End]`;

    const result = deleteFlowchartSubgraph(code, "sg");

    expect(result).not.toContain("sg --> C");
    expect(result).toContain("B[Inside]");
    expect(result).toContain("C --> D[End]");
  });

  it("removes styles and class assignments attached to the subgraph", () => {
    const code = `flowchart TD
    subgraph sg
        A[Node]
    end
    style sg fill:#f9f,stroke:#333
    class sg myClass`;

    const result = deleteFlowchartSubgraph(code, "sg");

    expect(result).not.toContain("style sg");
    expect(result).not.toContain("class sg");
    expect(result).toContain("A[Node]");
  });

  it("removes an empty subgraph cleanly", () => {
    const code = `flowchart TD
    subgraph sg
    end
    A[Node]`;

    const result = deleteFlowchartSubgraph(code, "sg");

    expect(result).not.toContain("subgraph sg");
    expect(result).not.toMatch(/^\s*end$/m);
    expect(result).toContain("A[Node]");
  });

  it("preserves child nodes whose quoted label equals the subgraph id", () => {
    const code = `flowchart TD
    subgraph sg
        A["sg"]
    end`;

    const result = deleteFlowchartSubgraph(code, "sg");

    expect(result).not.toContain("subgraph sg");
    expect(result).not.toMatch(/^\s*end$/m);
    expect(result).toContain('A["sg"]');
  });

  it("preserves comments that mention the subgraph id", () => {
    const code = `flowchart TD
    subgraph sg
        A[Node]
    end
    %% sg is now gone`;

    const result = deleteFlowchartSubgraph(code, "sg");

    expect(result).not.toContain("subgraph sg");
    expect(result).toContain("%% sg is now gone");
  });

  it("removes only the deleted id from multi-id class assignments", () => {
    const code = `flowchart TD
    subgraph sg
        A[Node]
    end
    class sg,A highlighted`;

    const result = deleteFlowchartSubgraph(code, "sg");

    expect(result).not.toContain("class sg,A highlighted");
    expect(result).toContain("class A highlighted");
    expect(result).toContain("A[Node]");
  });

  it("returns the original code when the subgraph id is not found", () => {
    const code = `flowchart TD
    A[Node]`;

    const result = deleteFlowchartSubgraph(code, "missing");

    expect(result).toBe(code);
  });
});
