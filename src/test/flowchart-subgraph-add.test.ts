import { describe, it, expect } from "vitest";
import { addFlowchartConnectedNode } from "@/lib/diagrams/flowchart";
import {
  findFlowchartNodeSubgraphId,
  findFlowchartSubgraphEndLine,
} from "@/lib/diagrams/flowchart/selectionLineMap";

describe("addFlowchartConnectedNode", () => {
  it("appends a basic-shape child at top level when parent is top-level", () => {
    const code = "flowchart TD\n    A[Start]";
    const result = addFlowchartConnectedNode(code, "A", { b: ["[", "]"] }, "n");
    expect(result).toBe("flowchart TD\n    A[Start]\n    A --> n1[New Node]");
  });

  it("inserts a basic-shape child inside the parent subgraph before end", () => {
    const code = "flowchart TD\n    subgraph S1\n        A[Start]\n    end";
    const result = addFlowchartConnectedNode(code, "A", { b: ["[", "]"] }, "n");
    expect(result).toBe(
      "flowchart TD\n    subgraph S1\n        A[Start]\n        A --> n1[New Node]\n    end",
    );
  });

  it("inserts a text-block child inside the parent subgraph with correct indentation", () => {
    const code = "flowchart TD\n    subgraph S1\n        A[Start]\n    end";
    const result = addFlowchartConnectedNode(code, "A", { b: null, isText: true }, "n");
    expect(result).toBe(
      'flowchart TD\n    subgraph S1\n        A[Start]\n        n1["Text Block"]\n        n1@{ shape: text }\n        A --> n1\n    end',
    );
  });

  it("inserts an expanded-shape child inside the parent subgraph with correct indentation", () => {
    const code = "flowchart TD\n    subgraph S1\n        A[Start]\n    end";
    const result = addFlowchartConnectedNode(code, "A", { expanded: "cloud" }, "n");
    expect(result).toBe(
      'flowchart TD\n    subgraph S1\n        A[Start]\n        n1@{ shape: cloud, label: "New Node" }\n        A --> n1\n    end',
    );
  });

  it("inserts into the innermost subgraph when parent is nested", () => {
    const code = `flowchart TD
    subgraph outer
        A[Outer Node]
        subgraph inner
            B[Inner Node]
        end
    end`;
    const result = addFlowchartConnectedNode(code, "B", { b: ["(", ")"] }, "n");
    expect(result).toBe(
      `flowchart TD
    subgraph outer
        A[Outer Node]
        subgraph inner
            B[Inner Node]
            B --> n1(New Node)
        end
    end`,
    );
  });

  it("inserts before the correct end when duplicate node declarations exist outside the subgraph", () => {
    const code = `graph LR
    subgraph chunk1["Chunk N Ingester process"]
        E["Chunk N<br>Ingester process"]
        E -->|link| E1@{ shape: cyl, label: "Chunk 1 Valid File" }
    end

    E["Chunk N<br>Ingester process"]
    E["Chunk N<br>Ingester process"]`;
    const result = addFlowchartConnectedNode(code, "E", { b: ["(", ")"] }, "E");
    expect(result).toContain("subgraph chunk1");
    const chunkEndIndex = result.indexOf("    end\n\n");
    const newNodeIndex = result.indexOf("E --> E2(New Node)");
    expect(newNodeIndex).toBeGreaterThan(-1);
    expect(newNodeIndex).toBeLessThan(chunkEndIndex);
  });

  it("appends an unconnected node at top level when there is no parent", () => {
    const code = "flowchart TD\n    A[Start]";
    const result = addFlowchartConnectedNode(code, null, { b: ["[", "]"] }, "n");
    expect(result).toBe("flowchart TD\n    A[Start]\n    n1[New Node]");
  });

  it("avoids reusing existing node ids", () => {
    const code = "flowchart TD\n    n1[First]\n    n2[Second]";
    const result = addFlowchartConnectedNode(code, "n2", { b: ["[", "]"] }, "n");
    expect(result).toBe("flowchart TD\n    n1[First]\n    n2[Second]\n    n2 --> n3[New Node]");
  });

  it("falls back to a default square shape when no shape is provided", () => {
    const code = "flowchart TD\n    subgraph S1\n        A[Start]\n    end";
    const result = addFlowchartConnectedNode(code, "A", undefined, "n");
    expect(result).toBe(
      "flowchart TD\n    subgraph S1\n        A[Start]\n        A --> n1[New Node]\n    end",
    );
  });
});

describe("findFlowchartNodeSubgraphId", () => {
  it("returns null for a top-level node", () => {
    const code = "flowchart TD\n    A[Start]";
    expect(findFlowchartNodeSubgraphId(code, "A")).toBeNull();
  });

  it("returns the containing subgraph id", () => {
    const code = "flowchart TD\n    subgraph S1\n        A[Start]\n    end";
    expect(findFlowchartNodeSubgraphId(code, "A")).toBe("S1");
  });

  it("returns the innermost subgraph for a nested node", () => {
    const code = `flowchart TD
    subgraph outer
        A[Outer]
        subgraph inner
            B[Inner]
        end
    end`;
    expect(findFlowchartNodeSubgraphId(code, "B")).toBe("inner");
    expect(findFlowchartNodeSubgraphId(code, "A")).toBe("outer");
  });

  it("returns null when the node is not found", () => {
    const code = "flowchart TD\n    subgraph S1\n        A[Start]\n    end";
    expect(findFlowchartNodeSubgraphId(code, "Z")).toBeNull();
  });
});

describe("findFlowchartSubgraphEndLine", () => {
  it("returns the 0-indexed line of the matching end", () => {
    const code = "flowchart TD\n    subgraph S1\n        A[Start]\n    end";
    expect(findFlowchartSubgraphEndLine(code, "S1")).toBe(3);
  });

  it("returns -1 when the subgraph is not found", () => {
    const code = "flowchart TD\n    A[Start]";
    expect(findFlowchartSubgraphEndLine(code, "S1")).toBe(-1);
  });

  it("accounts for nested subgraphs", () => {
    const code = `flowchart TD
    subgraph outer
        A[Outer]
        subgraph inner
            B[Inner]
        end
    end`;
    expect(findFlowchartSubgraphEndLine(code, "outer")).toBe(6);
    expect(findFlowchartSubgraphEndLine(code, "inner")).toBe(5);
  });
});
