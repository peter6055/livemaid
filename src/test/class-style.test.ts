import { describe, it, expect } from "vitest";
import { getClassStyle, setClassStyle, removeClassStyle } from "@/lib/diagrams/classDiagram";

const BASE_CODE = [
  "classDiagram",
  "class Animal {",
  "  +String name",
  "  +makeSound()",
  "}",
  "class Dog",
  "Animal <|-- Dog",
].join("\n");

describe("getClassStyle", () => {
  it("returns an empty map when the class has no style line", () => {
    expect(getClassStyle(BASE_CODE, "Animal")).toEqual({});
    expect(getClassStyle(BASE_CODE, "Dog")).toEqual({});
  });

  it("parses a style line into a property map", () => {
    const code = `${BASE_CODE}\n    style Animal fill:#ff0000,stroke:#000`;
    expect(getClassStyle(code, "Animal")).toEqual({ fill: "#ff0000", stroke: "#000" });
  });

  it("ignores malformed pairs without a colon", () => {
    const code = `${BASE_CODE}\n    style Animal fill:#ff0000,garbage`;
    expect(getClassStyle(code, "Animal")).toEqual({ fill: "#ff0000" });
  });

  it("does not match a different class with a similar name", () => {
    const code = `${BASE_CODE}\n    style Animal2 fill:#ff0000`;
    expect(getClassStyle(code, "Animal")).toEqual({});
  });
});

describe("setClassStyle", () => {
  it("upserts a style line for a class without one", () => {
    const out = setClassStyle(BASE_CODE, "Animal", { fill: "#ff0000" });
    expect(out).toContain("style Animal fill:#ff0000");
    expect(getClassStyle(out, "Animal")).toEqual({ fill: "#ff0000" });
  });

  it("merges patches into an existing style line", () => {
    const code = `${BASE_CODE}\n    style Animal fill:#ff0000`;
    const out = setClassStyle(code, "Animal", { stroke: "#00ff00" });
    expect(getClassStyle(out, "Animal")).toEqual({ fill: "#ff0000", stroke: "#00ff00" });
  });

  it("replaces an existing property value", () => {
    const code = `${BASE_CODE}\n    style Animal fill:#ff0000`;
    const out = setClassStyle(code, "Animal", { fill: "#0000ff" });
    expect(getClassStyle(out, "Animal")).toEqual({ fill: "#0000ff" });
  });

  it("removes a single property when patched with an empty string", () => {
    const code = `${BASE_CODE}\n    style Animal fill:#ff0000,stroke:#000`;
    const out = setClassStyle(code, "Animal", { fill: "" });
    expect(getClassStyle(out, "Animal")).toEqual({ stroke: "#000" });
  });

  it("removes the whole style line when the last property is cleared", () => {
    const code = `${BASE_CODE}\n    style Animal fill:#ff0000`;
    const out = setClassStyle(code, "Animal", { fill: "" });
    expect(getClassStyle(out, "Animal")).toEqual({});
    expect(out).not.toContain("style Animal");
  });

  it("only touches the target class", () => {
    const code = `${BASE_CODE}\n    style Dog fill:#00ff00`;
    const out = setClassStyle(code, "Animal", { fill: "#ff0000" });
    expect(getClassStyle(out, "Animal")).toEqual({ fill: "#ff0000" });
    expect(getClassStyle(out, "Dog")).toEqual({ fill: "#00ff00" });
  });

  it("handles names that are regex-special", () => {
    const code = "classDiagram\nclass C++ { }";
    const out = setClassStyle(code, "C++", { fill: "#ff0000" });
    expect(out).toContain("style C++ fill:#ff0000");
    expect(getClassStyle(out, "C++")).toEqual({ fill: "#ff0000" });
  });
});

describe("removeClassStyle", () => {
  it("removes the class's style line", () => {
    const code = `${BASE_CODE}\n    style Animal fill:#ff0000`;
    const out = removeClassStyle(code, "Animal");
    expect(out).not.toContain("style Animal");
    expect(out).not.toContain("fill:#ff0000");
  });

  it("keeps style lines of other classes", () => {
    const code = `${BASE_CODE}\n    style Animal fill:#ff0000\n    style Dog fill:#00ff00`;
    const out = removeClassStyle(code, "Animal");
    expect(out).toContain("style Dog fill:#00ff00");
    expect(out).not.toContain("style Animal");
  });
});
