import { describe, it, expect } from "vitest";
import {
  getSubgraphTitle,
  setSubgraphTitle,
  subgraphTitleId,
  subgraphIdFromTitleId,
  isSubgraphTitleId,
} from "@/lib/diagrams/flowchart/subgraphTitle";

const CODE = [
  "flowchart TD",
  '    subgraph chunk1["Chunk N Ingester process"]',
  '        E["Chunk N<br>Ingester process"]',
  '        E -->|link| E1@{ shape: cyl, label: "Chunk 1 Valid File" }',
  "    end",
].join("\n");

describe("getSubgraphTitle", () => {
  it("returns the bracketed title", () => {
    expect(getSubgraphTitle(CODE, "chunk1")).toBe("Chunk N Ingester process");
  });

  it("returns the bare id when there is no bracket title", () => {
    expect(getSubgraphTitle("flowchart TD\n    subgraph outer\n    end", "outer")).toBe("outer");
  });

  it("returns null when the subgraph is missing", () => {
    expect(getSubgraphTitle(CODE, "nope")).toBeNull();
  });
});

describe("setSubgraphTitle", () => {
  it("rewrites only the title and preserves everything else", () => {
    const out = setSubgraphTitle(CODE, "chunk1", "Renamed Group");
    expect(out).toBe(
      [
        "flowchart TD",
        '    subgraph chunk1["Renamed Group"]',
        '        E["Chunk N<br>Ingester process"]',
        '        E -->|link| E1@{ shape: cyl, label: "Chunk 1 Valid File" }',
        "    end",
      ].join("\n"),
    );
    expect(getSubgraphTitle(out, "chunk1")).toBe("Renamed Group");
  });

  it("adds a bracketed title to a bare-id declaration", () => {
    expect(setSubgraphTitle("flowchart TD\n    subgraph outer\n    end", "outer", "Outer")).toBe(
      'flowchart TD\n    subgraph outer["Outer"]\n    end',
    );
  });

  it("targets the correct nested subgraph", () => {
    const nested = [
      "flowchart TD",
      "    subgraph outer",
      "        subgraph inner",
      "            A[A]",
      "        end",
      "    end",
    ].join("\n");
    const out = setSubgraphTitle(nested, "inner", "Inner");
    expect(out).toContain('subgraph inner["Inner"]');
    expect(out).toContain("    subgraph outer\n");
  });

  it("leaves the source untouched when the subgraph is missing", () => {
    expect(setSubgraphTitle(CODE, "missing", "X")).toBe(CODE);
  });

  it("uses single quotes when the title contains a double quote", () => {
    expect(setSubgraphTitle(CODE, "chunk1", 'Say "hi"')).toContain(`subgraph chunk1['Say "hi"']`);
  });
});

describe("title-target id helpers", () => {
  it("round-trips the title id", () => {
    expect(isSubgraphTitleId(subgraphTitleId("chunk1"))).toBe(true);
    expect(subgraphIdFromTitleId(subgraphTitleId("chunk1"))).toBe("chunk1");
    expect(isSubgraphTitleId("chunk1")).toBe(false);
    expect(isSubgraphTitleId(null)).toBe(false);
  });
});
