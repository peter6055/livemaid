import { describe, it, expect } from "vitest";
import { getLinkLabelFromMiddle } from "@/lib/diagrams/utils";

describe("getLinkLabelFromMiddle", () => {
  it("returns the pipe-delimited label even when it contains quoted HTML attributes", () => {
    // Regression: the quote-first branch used to leak `color:red` from the
    // <span style="..."> attribute instead of returning the label.
    expect(getLinkLabelFromMiddle('-->|<span style="color:red">Hello</span>|')).toBe(
      '<span style="color:red">Hello</span>',
    );
  });

  it("returns a plain pipe-delimited label", () => {
    expect(getLinkLabelFromMiddle("-->|plain|")).toBe("plain");
  });

  it("returns the inline text form", () => {
    expect(getLinkLabelFromMiddle("-- text -->")).toBe("text");
  });

  it("does NOT treat a quoted node id after the connector as a label", () => {
    expect(getLinkLabelFromMiddle('--> "Some Node Id"')).toBe("");
  });

  it("strips quotes wrapping the entire pipe label (matches Mermaid's renderer)", () => {
    expect(getLinkLabelFromMiddle('|"quoted inside bar"|')).toBe("quoted inside bar");
  });

  it("preserves quotes that do not wrap the whole pipe label", () => {
    expect(getLinkLabelFromMiddle('|say "hi"|')).toBe('say "hi"');
  });

  it("accepts a middle that is entirely a quoted label", () => {
    expect(getLinkLabelFromMiddle('"just a label"')).toBe("just a label");
  });
});
