import { describe, it, expect } from "vitest";
import {
  getLinkLabelFromMiddle,
  updateLinkStyleAndLabel,
  parseEdgeId,
  isEdgeId,
} from "@/lib/diagrams/utils";

describe("getLinkLabelFromMiddle", () => {
  it("extracts label from bar syntax |label|", () => {
    expect(getLinkLabelFromMiddle("|hello world|")).toBe("hello world");
    expect(getLinkLabelFromMiddle("-->|label text|")).toBe("label text");
    expect(getLinkLabelFromMiddle("==>|thick label|")).toBe("thick label");
  });

  it('extracts label from quote syntax "label"', () => {
    expect(getLinkLabelFromMiddle('-->"quoted label"')).toBe("quoted label");
    expect(getLinkLabelFromMiddle('==>"quoted thick"')).toBe("quoted thick");
  });

  it("extracts label from inline text syntax -- label -->", () => {
    expect(getLinkLabelFromMiddle("-- inline label -->")).toBe("inline label");
    expect(getLinkLabelFromMiddle("== inline thick ==>")).toBe("inline thick");
    expect(getLinkLabelFromMiddle("-. inline dashed .->")).toBe("inline dashed");
  });

  it("returns empty string for unlabeled edge", () => {
    expect(getLinkLabelFromMiddle("-->")).toBe("");
    expect(getLinkLabelFromMiddle("==>")).toBe("");
    expect(getLinkLabelFromMiddle("-.-")).toBe("");
  });

  it("strips edge ID prefix before extracting label", () => {
    expect(getLinkLabelFromMiddle("myEdgeId@-->|label|")).toBe("label");
    expect(getLinkLabelFromMiddle("e_A_B_0@-->|test|")).toBe("test");
  });

  it("handles double-quoted labels inside bar syntax (inner quotes stripped by parser)", () => {
    // The bar match extracts "quoted inside bar", then the quote match strips the inner quotes.
    expect(getLinkLabelFromMiddle('|"quoted inside bar"|')).toBe("quoted inside bar");
  });
});

describe("updateLinkStyleAndLabel", () => {
  it("updates label on a single edge", () => {
    const code = "A-->B";
    const result = updateLinkStyleAndLabel(code, "A", "B", { label: "new label" });
    expect(result).toContain("-->" + "|new label|");
  });

  it("preserves connector type when updating label", () => {
    const code = "A==>B";
    const result = updateLinkStyleAndLabel(code, "A", "B", { label: "thick label" });
    expect(result).toContain("==>|thick label|");
  });

  it("preserves connector type when updating label on dashed edge", () => {
    const code = "A-.->B";
    const result = updateLinkStyleAndLabel(code, "A", "B", { label: "dashed" });
    expect(result).toContain("-.-" + ">|dashed|");
  });

  it("preserves existing label when updating only stroke", () => {
    const code = "A-->|existing|B";
    const result = updateLinkStyleAndLabel(code, "A", "B", { stroke: "thick" });
    expect(result).toContain("==>|existing|");
  });

  it("preserves existing label when updating only arrow type", () => {
    const code = "A-->|hello|B";
    const result = updateLinkStyleAndLabel(code, "A", "B", { arrowType: "cross" });
    expect(result).toContain("--x|hello|");
  });

  it("handles empty label update (remove label)", () => {
    const code = "A-->|remove me|B";
    const result = updateLinkStyleAndLabel(code, "A", "B", { label: "" });
    expect(result).toContain("-->");
  });

  it("handles multi-character node names", () => {
    const code = "NodeAlpha-->|label|NodeBeta";
    const result = updateLinkStyleAndLabel(code, "NodeAlpha", "NodeBeta", {
      label: "updated",
    });
    expect(result).toContain("-->|updated|");
  });

  it("handles parallel edges - updates correct occurrence", () => {
    const code = "A-->B\nA-->B";
    const result = updateLinkStyleAndLabel(code, "A", "B", { label: "second" }, 1);
    const lines = result.split("\n");
    expect(lines[0]).toContain("-->");
    expect(lines[1]).toContain("-->|second|");
  });
});

describe("isEdgeId", () => {
  it("returns true for L_ prefixed IDs", () => {
    expect(isEdgeId("L_A_B_0")).toBe(true);
    expect(isEdgeId("L_A_B_1")).toBe(true);
  });

  it("returns true for L- prefixed IDs", () => {
    expect(isEdgeId("L-A-B-0")).toBe(true);
  });

  it("returns true for e_ prefixed IDs", () => {
    expect(isEdgeId("e_A_B_0")).toBe(true);
  });

  it("returns true for e- prefixed IDs", () => {
    expect(isEdgeId("e-A-B-0")).toBe(true);
  });

  it("returns false for null", () => {
    expect(isEdgeId(null)).toBe(false);
  });

  it("returns false for node IDs", () => {
    expect(isEdgeId("A")).toBe(false);
    expect(isEdgeId("Node1")).toBe(false);
  });

  it("returns false for sequence IDs", () => {
    expect(isEdgeId("SEQ_MSG_0")).toBe(false);
    expect(isEdgeId("SEQ_ACTOR_Alice")).toBe(false);
  });
});

describe("parseEdgeId", () => {
  it("parses standard L_ prefixed ID with occurrence", () => {
    const result = parseEdgeId("L_A_B_0");
    expect(result.src).toBe("A");
    expect(result.dst).toBe("B");
    expect(result.occurrenceIndex).toBe(0);
  });

  it("parses standard e_ prefixed ID", () => {
    const result = parseEdgeId("e_Alice_Bob_1");
    expect(result.src).toBe("Alice");
    expect(result.dst).toBe("Bob");
    expect(result.occurrenceIndex).toBe(0); // floor(rawIndex=1 / 2) = 0
  });

  it("calculates occurrenceIndex as floor(rawIndex / 2)", () => {
    expect(parseEdgeId("e_A_B_0").occurrenceIndex).toBe(0);
    expect(parseEdgeId("e_A_B_1").occurrenceIndex).toBe(0);
    expect(parseEdgeId("e_A_B_2").occurrenceIndex).toBe(1);
    expect(parseEdgeId("e_A_B_3").occurrenceIndex).toBe(1);
    expect(parseEdgeId("e_A_B_4").occurrenceIndex).toBe(2);
  });

  it("parses L- prefixed ID with hyphen separators", () => {
    const result = parseEdgeId("L-A-B-0");
    expect(result.src).toBe("A");
    expect(result.dst).toBe("B");
  });

  it("handles occurrence index calculation (floor(index/2))", () => {
    const result = parseEdgeId("L_A_B_3");
    expect(result.occurrenceIndex).toBe(1);
  });

  it("handles complex node names with underscores", () => {
    const result = parseEdgeId("e_my_node_other_node_0");
    expect(result.src).toBe("my");
    expect(result.dst).toBe("node");
    expect(result.occurrenceIndex).toBe(0);
  });
});
