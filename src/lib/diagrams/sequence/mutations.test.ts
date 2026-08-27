import { describe, it, expect } from "vitest";
import { removeEmptySequenceBlocks } from "./mutations";

describe("removeEmptySequenceBlocks", () => {
  it("removes an opt block left with no children", () => {
    const code = ["sequenceDiagram", "opt Optional", "  A->>B: msg", "end"]
      .join("\n");
    const result = removeEmptySequenceBlocks(
      ["sequenceDiagram", "opt Optional", "end"].join("\n"),
    );
    expect(result).toBe("sequenceDiagram");
    expect(result).not.toContain("opt");
    expect(result).not.toContain("end");
  });

  it("removes a rect highlight left with no children", () => {
    const result = removeEmptySequenceBlocks(
      ["sequenceDiagram", "rect rgb(0,0,0)", "end"].join("\n"),
    );
    expect(result).toBe("sequenceDiagram");
  });

  it("keeps a block with remaining siblings", () => {
    const code = ["sequenceDiagram", "opt A", "  A->>B: one", "  A->>B: two", "end"].join(
      "\n",
    );
    const lines = code.split("\n").filter((l) => !l.includes("one")).join("\n");
    expect(removeEmptySequenceBlocks(lines)).toBe(
      ["sequenceDiagram", "opt A", "  A->>B: two", "end"].join("\n"),
    );
  });

  it("cascades: removing inner block empties the outer block", () => {
    const code = [
      "sequenceDiagram",
      "opt Outer",
      "  loop Inner",
      "    A->>B: msg",
      "  end",
      "end",
    ].join("\n");
    const lines = code.split("\n").filter((l) => !l.includes("msg")).join("\n");
    expect(removeEmptySequenceBlocks(lines)).toBe("sequenceDiagram");
  });

  it("collapses an empty alt with an else divider", () => {
    const code = [
      "sequenceDiagram",
      "alt A",
      "  A->>B: one",
      "else B",
      "  A->>B: two",
      "end",
    ].join("\n");
    const lines = code.split("\n").filter((l) => !l.includes("one") && !l.includes("two")).join("\n");
    expect(removeEmptySequenceBlocks(lines)).toBe("sequenceDiagram");
    expect(removeEmptySequenceBlocks(lines)).not.toContain("else");
  });
});
