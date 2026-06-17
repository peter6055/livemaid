import { describe, it, expect } from "vitest";
import { matchFlowchartLinkLine, getLinkLabelFromMiddle } from "@/lib/diagrams/utils";

describe("matchFlowchartLinkLine", () => {
  it("matches simple edge A-->B", () => {
    const result = matchFlowchartLinkLine("A-->B", "A", "B");
    expect(result).not.toBeNull();
  });

  it("matches edge with bar label A-->|label|B", () => {
    const result = matchFlowchartLinkLine("A-->|label|B", "A", "B");
    expect(result).not.toBeNull();
    if (result) {
      const label = getLinkLabelFromMiddle(result[2]);
      expect(label).toBe("label");
    }
  });

  it("matches thick edge A==>B", () => {
    const result = matchFlowchartLinkLine("A==>B", "A", "B");
    expect(result).not.toBeNull();
  });

  it("matches dashed edge A-.->B", () => {
    const result = matchFlowchartLinkLine("A-.->B", "A", "B");
    expect(result).not.toBeNull();
  });

  it("matches edge with quote label", () => {
    const result = matchFlowchartLinkLine('A-->"quoted"B', "A", "B");
    expect(result).not.toBeNull();
    if (result) {
      const label = getLinkLabelFromMiddle(result[2]);
      expect(label).toBe("quoted");
    }
  });

  it("handles inline text edge -- label --> by matching only the connector part (standard regex wins)", () => {
    // The standard regex treats "-- inline label " as prefix and captures only "-->"
    // as the connector, so the label is not extractable from this match.
    const result = matchFlowchartLinkLine("A-- inline label -->B", "A", "B");
    expect(result).not.toBeNull();
    // The inline-text syntax is not fully supported for label extraction via the
    // standard regex path. This test documents current behavior.
    if (result) {
      const label = getLinkLabelFromMiddle(result[2]);
      expect(label).toBe("");
    }
  });

  it("returns null for non-matching nodes", () => {
    const result = matchFlowchartLinkLine("A-->C", "A", "B");
    expect(result).toBeNull();
  });

  it("matches edge with edge ID prefix", () => {
    const result = matchFlowchartLinkLine("A edgeID@-->|label|B", "A", "B");
    expect(result).not.toBeNull();
    if (result) {
      const label = getLinkLabelFromMiddle(result[2]);
      expect(label).toBe("label");
    }
  });

  it("matches double arrow <-->", () => {
    const result = matchFlowchartLinkLine("A<-->B", "A", "B");
    expect(result).not.toBeNull();
  });

  it("matches double thick arrow <==>", () => {
    const result = matchFlowchartLinkLine("A<==>B", "A", "B");
    expect(result).not.toBeNull();
  });

  it("matches edge with circle endpoint --o", () => {
    const result = matchFlowchartLinkLine("A--oB", "A", "B");
    expect(result).not.toBeNull();
  });

  it("matches edge with cross endpoint --x", () => {
    const result = matchFlowchartLinkLine("A--xB", "A", "B");
    expect(result).not.toBeNull();
  });
});
