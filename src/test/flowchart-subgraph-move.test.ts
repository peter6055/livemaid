import { describe, it, expect } from "vitest";
import { moveFlowchartSubgraph } from "@/lib/diagrams/flowchart/subgraphMove";

describe("moveFlowchartSubgraph", () => {
  it("nests a sibling subgraph into another sibling before its end", () => {
    const code = `flowchart TD
    subgraph src
        A[Alpha]
        A --> B[Beta]
    end
    subgraph dest
        C[Gamma]
    end`;

    const result = moveFlowchartSubgraph(code, "src", "dest");

    expect(result).toBe(`flowchart TD
    subgraph dest
        C[Gamma]
        subgraph src
            A[Alpha]
            A --> B[Beta]
        end
    end`);
  });

  it("unnests an inner subgraph to top level with outdented children", () => {
    const code = `flowchart TD
    subgraph outer
        A[Outer]
        subgraph inner
            B[Inner]
        end
    end`;

    const result = moveFlowchartSubgraph(code, "inner", null);

    expect(result).toBe(`flowchart TD
    subgraph outer
        A[Outer]
    end
    subgraph inner
        B[Inner]
    end`);
    expect(result).toMatch(/^    subgraph inner$/m);
    expect(result).toMatch(/^        B\[Inner\]$/m);
  });

  it("moves a nested subgraph from one parent to another parent", () => {
    const code = `flowchart TD
    subgraph p1
        subgraph kid
            K[Kid]
        end
    end
    subgraph p2
        Z[Zed]
    end`;

    const result = moveFlowchartSubgraph(code, "kid", "p2");

    expect(result).not.toContain("subgraph p1\n        subgraph kid");
    expect(result).toMatch(/^    subgraph p1$/m);
    expect(result).toMatch(/^    subgraph p2$/m);
    expect(result).toContain("subgraph kid");
    expect(result).toMatch(/^        subgraph kid$/m);
    expect(result).toMatch(/^            K\[Kid\]$/m);
  });

  it("returns unchanged code on self-drop", () => {
    const code = `flowchart TD
    subgraph a
        A[Node]
    end`;
    expect(moveFlowchartSubgraph(code, "a", "a")).toBe(code);
  });

  it("returns unchanged code when dropping an outer subgraph into its own descendant", () => {
    const code = `flowchart TD
    subgraph outer
        A[Outer]
        subgraph inner
            B[Inner]
        end
    end`;
    expect(moveFlowchartSubgraph(code, "outer", "inner")).toBe(code);
  });

  it("relocates an empty subgraph without breaking dest end-balance", () => {
    const code = `flowchart TD
    subgraph empty
    end
    subgraph dest
        C[Gamma]
    end`;

    const result = moveFlowchartSubgraph(code, "empty", "dest");

    expect(result).toBe(`flowchart TD
    subgraph dest
        C[Gamma]
        subgraph empty
        end
    end`);
    const ends = result.match(/^\s*end$/gm) ?? [];
    expect(ends).toHaveLength(2);
  });

  it("carries an inner direction line inside the moved block", () => {
    const code = `flowchart TD
    subgraph src
        direction LR
        A[Alpha]
    end
    subgraph dest
        C[Gamma]
    end`;

    const result = moveFlowchartSubgraph(code, "src", "dest");

    expect(result).toContain("direction LR");
    expect(result).toMatch(/^            direction LR$/m);
  });

  it("leaves global style/classDef/linkStyle lines outside the block in place", () => {
    const code = `flowchart TD
    subgraph src
        A[Alpha]
    end
    subgraph dest
        C[Gamma]
    end
    style src fill:#f9f
    classDef hot fill:#f00
    linkStyle 0 stroke:#0f0`;

    const result = moveFlowchartSubgraph(code, "src", "dest");

    expect(result).toContain("style src fill:#f9f");
    expect(result).toContain("classDef hot fill:#f00");
    expect(result).toContain("linkStyle 0 stroke:#0f0");
    // Globals stay after the dest block, untouched.
    expect(result.indexOf("style src")).toBeGreaterThan(result.indexOf("C[Gamma]"));
    expect(result.indexOf("linkStyle 0")).toBeGreaterThan(result.indexOf("style src"));
    // Edge ordinal positions did not shift: only one edge line, still one linkStyle.
    expect(result.match(/linkStyle/g)).toHaveLength(1);
  });

  it("returns unchanged code when the dragged block has no matching end", () => {
    const code = `flowchart TD
    subgraph broken
        A[Alpha]
    subgraph dest
        C[Gamma]
    end`;
    expect(moveFlowchartSubgraph(code, "broken", "dest")).toBe(code);
  });

  it("returns unchanged code when dest is a node id or missing", () => {
    const code = `flowchart TD
    subgraph src
        A[Alpha]
    end
    subgraph dest
        C[Gamma]
    end
    A --> C`;
    expect(moveFlowchartSubgraph(code, "src", "A")).toBe(code);
    expect(moveFlowchartSubgraph(code, "src", "nope")).toBe(code);
  });

  it("moves a multi-level nested block wholesale with relative indents intact", () => {
    const code = `flowchart TD
    subgraph outer
        direction TB
        A[Outer]
        subgraph mid
            B[Mid]
            subgraph leaf
                L[Leaf]
            end
        end
    end
    subgraph dest
        Z[Zed]
    end`;

    const result = moveFlowchartSubgraph(code, "outer", "dest");

    expect(result).toContain("subgraph mid");
    expect(result).toContain("subgraph leaf");
    expect(result).toContain("L[Leaf]");
    expect(result).toContain("direction TB");
    expect(result).toMatch(/^        subgraph outer$/m);
    expect(result).toMatch(/^                subgraph leaf$/m);
    expect(result).toMatch(/^                    L\[Leaf\]$/m);
    const ends = result.match(/^\s*end$/gm) ?? [];
    expect(ends).toHaveLength(4);
  });

  it("carries comments inside the block and leaves outside comments in place", () => {
    const code = `flowchart TD
    %% top comment
    subgraph src
        %% inside comment
        A[Alpha]
    end
    subgraph dest
        C[Gamma]
    end`;

    const result = moveFlowchartSubgraph(code, "src", "dest");

    expect(result).toContain("%% inside comment");
    expect(result.indexOf("%% inside comment")).toBeGreaterThan(result.indexOf("subgraph dest"));
    expect(result.indexOf("%% top comment")).toBeLessThan(result.indexOf("subgraph dest"));
  });

  it("is a no-op when the block is already a child of dest or already top level", () => {
    const nested = `flowchart TD
    subgraph dest
        subgraph src
            A[Alpha]
        end
        C[Gamma]
    end`;
    expect(moveFlowchartSubgraph(nested, "src", "dest")).toBe(nested);

    const top = `flowchart TD
    subgraph src
        A[Alpha]
    end`;
    expect(moveFlowchartSubgraph(top, "src", null)).toBe(top);
  });

  it("returns unchanged code for empty ids", () => {
    const code = `flowchart TD
    subgraph src
        A[Alpha]
    end`;
    expect(moveFlowchartSubgraph(code, "", "src")).toBe(code);
    expect(moveFlowchartSubgraph(code, "src", "")).toBe(code);
  });
});
