import { describe, it, expect } from "vitest";
import { deleteLink } from "@/lib/diagrams/utils";

describe("deleteLink preserves inline node definitions", () => {
  it("preserves @{...} node label on the destination side", () => {
    const code = 'A --> B@{ label: "My Label" }';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B@{ label: "My Label" }');
    expect(result).not.toContain("-->");
  });

  it("preserves full @{...} block with shape and label", () => {
    const code = 'A --> B@{ shape: circle, label: "Round" }';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B@{ shape: circle, label: "Round" }');
    expect(result).not.toContain("-->");
  });

  it('preserves circle shape definition B(("Label"))', () => {
    const code = 'A --> B(("Label"))';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B(("Label"))');
    expect(result).not.toContain("-->");
  });

  it('preserves double circle shape definition B((("Label")))', () => {
    const code = 'A --> B((("Label")))';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B((("Label")))');
    expect(result).not.toContain("-->");
  });

  it('preserves subroutine shape definition B[["Label"]]', () => {
    const code = 'A --> B[["Label"]]';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B[["Label"]]');
    expect(result).not.toContain("-->");
  });

  it('preserves database shape definition B[("Label")]', () => {
    const code = 'A --> B[("Label")]';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B[("Label")]');
    expect(result).not.toContain("-->");
  });

  it('preserves hexagon shape definition B{{"Label"}}', () => {
    const code = 'A --> B{{"Label"}}';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B{{"Label"}}');
    expect(result).not.toContain("-->");
  });

  it('preserves stadium shape definition B(["Label"])', () => {
    const code = 'A --> B(["Label"])';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B(["Label"])');
    expect(result).not.toContain("-->");
  });

  it("does not duplicate an existing standalone bracket definition", () => {
    const code = 'B["Label"]\nA --> B["Label"]';
    const result = deleteLink(code, "A", "B");
    const matches = result.match(/B\["Label"\]/g) || [];
    expect(matches).toHaveLength(1);
    expect(result).not.toMatch(/^B$/m);
    expect(result).not.toContain("-->");
  });

  it("does not duplicate an existing standalone @{...} definition", () => {
    const code = 'B@{ label: "X" }\nA --> B@{ label: "Y" }';
    const result = deleteLink(code, "A", "B");
    const matches = result.match(/B@\{/g) || [];
    expect(matches).toHaveLength(1);
    expect(result).not.toContain("-->");
  });

  it("keeps a valid edge and label when deleting one of two identical edges", () => {
    const code = 'A --> B["Label"]\nA --> B["Label"]';
    const result = deleteLink(code, "A", "B", 0);
    expect(result).toBe('A --> B["Label"]');
  });

  it("preserves source-side inline label definition", () => {
    const code = 'A["Source"] --> B';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('A["Source"]');
    expect(result).not.toContain("-->");
  });

  it("finds the node definition even when the id appears earlier in an edge label", () => {
    const code = 'A -->|B| B["Important"]';
    const result = deleteLink(code, "A", "B");
    expect(result).toContain('B["Important"]');
    expect(result).not.toContain("-->");
  });
});
