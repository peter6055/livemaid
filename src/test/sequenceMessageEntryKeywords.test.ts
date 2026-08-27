import { describe, expect, it } from "vitest";
import { getSequenceMessageEntries, isSequenceMessageLine } from "@/lib/diagrams/sequence/geometry";

describe("isSequenceMessageLine block keyword exclusion", () => {
  it("excludes break and and descriptions from message lines", () => {
    expect(isSequenceMessageLine("break reason: with colon")).toBe(false);
    expect(isSequenceMessageLine("and B: y")).toBe(false);
    expect(isSequenceMessageLine("A->>B: hi")).toBe(true);
  });

  it("keeps real message indexes stable when break/and descriptions contain colons", () => {
    const code = [
      "sequenceDiagram",
      "    par A: x",
      "        A->>B: real one",
      "    and B: y",
      "        C->>D: real two",
      "    end",
      "    break reason: with colon",
      "        E->>F: real three",
      "    end",
    ].join("\n");

    const entries = getSequenceMessageEntries(code);

    expect(entries.map((entry) => entry.index)).toEqual([2, 4, 7]);
    expect(entries.map((entry) => entry.line.trim())).toEqual([
      "A->>B: real one",
      "C->>D: real two",
      "E->>F: real three",
    ]);
  });
});
