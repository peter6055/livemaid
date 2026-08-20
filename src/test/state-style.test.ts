import { describe, it, expect } from "vitest";
import { getStateStyle, setStateStyle, removeStateStyle } from "@/lib/diagrams/stateDiagram";

const BASE_CODE = [
  "stateDiagram-v2",
  "    [*] --> Still",
  "    Still --> [*]",
  "    Still --> Moving",
  "    Moving --> Still",
  "    Moving --> Crash",
  "    Crash --> [*]",
].join("\n");

describe("getStateStyle", () => {
  it("reads a style line", () => {
    const code = `${BASE_CODE}\n    style Still fill:#ff0000`;
    expect(getStateStyle(code, "Still")).toEqual({ fill: "#ff0000" });
  });

  it("reads a classDef applied via class statement", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000,stroke:#cc0000\n    class Still red`;
    expect(getStateStyle(code, "Still")).toEqual({ fill: "#ff0000", stroke: "#cc0000" });
  });

  it("reads a classDef applied via ::: shorthand", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    [*] --> Still:::red`;
    expect(getStateStyle(code, "Still")).toEqual({ fill: "#ff0000" });
  });

  it("merges multiple classDefs", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    classDef bold stroke-width:2px\n    class Still red\n    class Still bold`;
    expect(getStateStyle(code, "Still")).toEqual({ fill: "#ff0000", "stroke-width": "2px" });
  });

  it("style line wins over classDef", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    class Still red\n    style Still fill:#22c55e`;
    expect(getStateStyle(code, "Still")).toEqual({ fill: "#22c55e" });
  });

  it("returns empty when no style or class applies", () => {
    expect(getStateStyle(BASE_CODE, "Still")).toEqual({});
  });

  it("does not read classDefs applied to other states", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    class Moving red`;
    expect(getStateStyle(code, "Still")).toEqual({});
  });
});

describe("setStateStyle", () => {
  it("writes a style line and leaves class assignments intact", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    class Still red`;
    const out = setStateStyle(code, "Still", { fill: "#22c55e" });
    expect(out).toContain("style Still fill:#22c55e");
    expect(out).toContain("class Still red");
  });

  it("updates an existing style line without touching classDef", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    class Still red\n    style Still fill:#22c55e`;
    const out = setStateStyle(code, "Still", { stroke: "#000" });
    expect(out).toContain("style Still fill:#22c55e,stroke:#000");
    expect(out).not.toContain("style Still fill:#ff0000");
    expect(out).toContain("class Still red");
  });

  it("removes the style line when the last property is cleared", () => {
    const code = `${BASE_CODE}\n    style Still fill:#ff0000`;
    const out = setStateStyle(code, "Still", { fill: "" });
    expect(out).not.toContain("style Still");
  });
});

describe("removeStateStyle", () => {
  it("removes the style line", () => {
    const code = `${BASE_CODE}\n    style Still fill:#ff0000`;
    const out = removeStateStyle(code, "Still");
    expect(out).not.toContain("style Still");
  });

  it("removes a class assignment", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    class Still red`;
    const out = removeStateStyle(code, "Still");
    expect(out).not.toContain("class Still red");
    expect(out).toContain("classDef red fill:#ff0000");
  });

  it("removes an id from a multi-id class assignment", () => {
    const code = `${BASE_CODE}\n    class Still, Moving red`;
    const out = removeStateStyle(code, "Still");
    expect(out).toContain("class Moving red");
    expect(out).not.toContain("class Still, Moving red");
  });

  it("removes ::: shorthand from transitions", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    [*] --> Still:::red`;
    const out = removeStateStyle(code, "Still");
    expect(out).toContain("[*] --> Still");
    expect(out).not.toContain("Still:::red");
  });

  it("removes both style line and class assignment", () => {
    const code = `${BASE_CODE}\n    classDef red fill:#ff0000\n    class Still red\n    style Still fill:#22c55e`;
    const out = removeStateStyle(code, "Still");
    expect(out).not.toContain("style Still");
    expect(out).not.toContain("class Still red");
  });
});
