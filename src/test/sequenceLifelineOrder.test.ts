import { describe, expect, it } from "vitest";
import { getSequenceLifelineOrder } from "@/lib/diagrams/sequence/actors";

describe("getSequenceLifelineOrder", () => {
  it("orders lifelines by first appearance, not declaration order", () => {
    const code = ["sequenceDiagram", "A->>B: hi", "participant C"].join("\n");

    expect(getSequenceLifelineOrder(code)).toEqual(["A", "B", "C"]);
  });

  it("keeps declaration order when all participants are declared before any message", () => {
    const code = [
      "sequenceDiagram",
      "participant A as Alice",
      "participant B as Bob",
      "actor C as Carol",
      "C->>B: hey",
      "B-->>A: ok",
    ].join("\n");

    expect(getSequenceLifelineOrder(code)).toEqual(["A", "B", "C"]);
  });

  it("dedupes ids across declarations and message endpoints case-sensitively", () => {
    const code = [
      "sequenceDiagram",
      "A->>B: hi",
      "participant B",
      "participant C",
      "C->>a: low",
    ].join("\n");

    expect(getSequenceLifelineOrder(code)).toEqual(["A", "B", "C", "a"]);
  });
});
