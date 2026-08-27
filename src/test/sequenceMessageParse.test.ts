import { describe, expect, it } from "vitest";
import { parseSequenceMessageLine } from "@/lib/diagrams/sequence/commentAnchor";

describe("parseSequenceMessageLine half-arrow operators", () => {
  it.each([
    ["-A -|\\ B: x", { sender: "-A", operator: "-|\\", receiver: "B", label: "x" }],
    ["A --|\\ B: x", { sender: "A", operator: "--|\\", receiver: "B", label: "x" }],
    ["A -|/ B: x", { sender: "A", operator: "-|/", receiver: "B", label: "x" }],
    ["A --\\ B: x", { sender: "A", operator: "--\\", receiver: "B", label: "x" }],
    ["A--\\B: tight", { sender: "A", operator: "--\\", receiver: "B", label: "tight" }],
  ])("parses %j", (line, expected) => {
    expect(parseSequenceMessageLine(line)).toEqual(expected);
  });

  it("still parses the existing operators with unchanged captures", () => {
    expect(parseSequenceMessageLine("A->>B: hello world")).toEqual({
      sender: "A",
      operator: "->>",
      receiver: "B",
      label: "hello world",
    });
    expect(parseSequenceMessageLine("B-->>A: Great!")).toMatchObject({ operator: "-->>" });
    expect(parseSequenceMessageLine("A-xB: cross")).toMatchObject({ operator: "-x" });
    expect(parseSequenceMessageLine("A --xB: dotted cross")).toMatchObject({ operator: "--x" });
    expect(parseSequenceMessageLine("A-)B: async")).toMatchObject({ operator: "-)" });
    expect(parseSequenceMessageLine("A--)B: dotted async")).toMatchObject({ operator: "--)" });
    expect(parseSequenceMessageLine("A-->B: plain")).toMatchObject({ operator: "-->" });
    expect(parseSequenceMessageLine("A<<->>B: both")).toMatchObject({ operator: "<<->>" });
  });
});
