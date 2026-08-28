import { describe, it, expect } from "vitest";
import { removeEmptySequenceBlocks } from "./mutations";

describe("removeEmptySequenceBlocks", () => {
  it("removes an opt block left with no children", () => {
    const result = removeEmptySequenceBlocks(["sequenceDiagram", "opt Optional", "end"].join("\n"));
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
    const code = ["sequenceDiagram", "opt A", "  A->>B: one", "  A->>B: two", "end"].join("\n");
    const lines = code
      .split("\n")
      .filter((l) => !l.includes("one"))
      .join("\n");
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
    const lines = code
      .split("\n")
      .filter((l) => !l.includes("msg"))
      .join("\n");
    expect(removeEmptySequenceBlocks(lines)).toBe("sequenceDiagram");
  });

  it("collapses an empty alt with an else divider", () => {
    const code = ["sequenceDiagram", "alt A", "  A->>B: one", "else B", "  A->>B: two", "end"].join(
      "\n",
    );
    const lines = code
      .split("\n")
      .filter((l) => !l.includes("one") && !l.includes("two"))
      .join("\n");
    expect(removeEmptySequenceBlocks(lines)).toBe("sequenceDiagram");
    expect(removeEmptySequenceBlocks(lines)).not.toContain("else");
  });

  it("keeps a block whose only content is a keyword-only activate/deactivate declaration", () => {
    const code = [
      "sequenceDiagram",
      "participant A",
      "participant B",
      "opt Optional",
      "  activate B",
      "  B-->>A: done",
      "  deactivate B",
      "end",
    ].join("\n");
    // Deleting the message leaves activate/deactivate declarations inside the block.
    const lines = code
      .split("\n")
      .filter((l) => !l.includes("done"))
      .join("\n");
    expect(removeEmptySequenceBlocks(lines)).toBe(
      [
        "sequenceDiagram",
        "participant A",
        "participant B",
        "opt Optional",
        "  activate B",
        "  deactivate B",
        "end",
      ].join("\n"),
    );
    expect(removeEmptySequenceBlocks(lines)).toContain("opt Optional");
  });

  it("keeps a block whose only content is a create/destroy declaration", () => {
    const code = [
      "sequenceDiagram",
      "opt Setup",
      "  create participant B",
      "  A->>B: hi",
      "  destroy B",
      "end",
    ].join("\n");
    const lines = code
      .split("\n")
      .filter((l) => !l.includes("hi"))
      .join("\n");
    expect(removeEmptySequenceBlocks(lines)).toContain("opt Setup");
    expect(removeEmptySequenceBlocks(lines)).toContain("destroy B");
  });
});
