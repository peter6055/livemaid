import { describe, it, expect } from "vitest";
import { addFlowchartConnectedNode } from "@/lib/diagrams/flowchart";

describe("addFlowchartConnectedNode insideNewSubgraph", () => {
  it("option off keeps existing behavior", () => {
    const code = "flowchart TD\n    A[Start]";
    expect(addFlowchartConnectedNode(code, "A", { b: ["[", "]"] }, "n")).toBe(
      "flowchart TD\n    A[Start]\n    A --> n1[New Node]",
    );
    expect(addFlowchartConnectedNode(code, "A", { b: ["[", "]"] }, "n", false)).toBe(
      "flowchart TD\n    A[Start]\n    A --> n1[New Node]",
    );
  });

  it("option on from a top-level node wraps only the new shape in a subgraph and keeps the connection untouched", () => {
    const code = "flowchart TD\n    A[Start]";
    const result = addFlowchartConnectedNode(code, "A", { b: ["[", "]"] }, "n", true);
    expect(result).toBe(
      [
        "flowchart TD",
        "    A[Start]",
        '    subgraph sub1["Untitled subgraph"]',
        "        n1[New Node]",
        "    end",
        "    A --> n1",
      ].join("\n"),
    );
  });

  it("option on from a nested node creates the subgraph at the same scope with the source outside it", () => {
    const code = `flowchart TD
    subgraph outer
        A[Outer Node]
        subgraph inner
            B[Inner Node]
        end
    end`;
    const result = addFlowchartConnectedNode(code, "B", { b: ["(", ")"] }, "n", true);
    expect(result).toBe(
      `flowchart TD
    subgraph outer
        A[Outer Node]
        subgraph inner
            B[Inner Node]
            subgraph sub1["Untitled subgraph"]
                n1(New Node)
            end
            B --> n1
        end
    end`,
    );
  });

  it("option on with no source appends an unconnected subgraph", () => {
    const code = "flowchart TD\n    A[Start]";
    const result = addFlowchartConnectedNode(code, null, { b: ["[", "]"] }, "n", true);
    expect(result).toBe(
      [
        "flowchart TD",
        "    A[Start]",
        '    subgraph sub1["Untitled subgraph"]',
        "        n1[New Node]",
        "    end",
      ].join("\n"),
    );
  });

  it("option on with a text shape puts both declaration lines inside the subgraph", () => {
    const code = "flowchart TD\n    A[Start]";
    const result = addFlowchartConnectedNode(code, "A", { b: null, isText: true }, "n", true);
    expect(result).toBe(
      [
        "flowchart TD",
        "    A[Start]",
        '    subgraph sub1["Untitled subgraph"]',
        '        n1["Text Block"]',
        "        n1@{ shape: text }",
        "    end",
        "    A --> n1",
      ].join("\n"),
    );
  });

  it("option on with an expanded shape puts the @{...} declaration inside the subgraph", () => {
    const code = "flowchart TD\n    A[Start]";
    const result = addFlowchartConnectedNode(code, "A", { expanded: "cloud" }, "n", true);
    expect(result).toBe(
      [
        "flowchart TD",
        "    A[Start]",
        '    subgraph sub1["Untitled subgraph"]',
        '        n1@{ shape: cloud, label: "New Node" }',
        "    end",
        "    A --> n1",
      ].join("\n"),
    );
  });

  it("option on avoids reusing existing subgraph and node ids", () => {
    const code = 'flowchart TD\n    sub1["Existing Sub"]\n    n1["First"]\n    A[Start]';
    const result = addFlowchartConnectedNode(code, "A", { b: ["[", "]"] }, "n", true);
    expect(result).toBe(
      [
        "flowchart TD",
        '    sub1["Existing Sub"]',
        '    n1["First"]',
        "    A[Start]",
        '    subgraph sub2["Untitled subgraph"]',
        "        n2[New Node]",
        "    end",
        "    A --> n2",
      ].join("\n"),
    );
  });
});
