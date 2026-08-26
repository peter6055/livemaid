import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { htmlToPlainText } from "@/lib/utils";

// htmlToPlainText takes the DOM-based branch when `document` exists; the default
// vitest environment is node, so stub one in from jsdom to cover that path.
describe("htmlToPlainText (browser DOM path)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", new JSDOM().window.document);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves plain text unchanged", () => {
    expect(htmlToPlainText("Just plain text")).toBe("Just plain text");
  });

  it("inserts a newline at <br> boundaries", () => {
    expect(htmlToPlainText("First<br>Second")).toBe("First\nSecond");
    expect(htmlToPlainText("First<br/>Second")).toBe("First\nSecond");
  });

  it("inserts newlines at block element boundaries", () => {
    expect(htmlToPlainText("First<div>Second</div>")).toBe("First\nSecond");
    expect(htmlToPlainText("<div>First</div><div>Second</div>")).toBe("First\n\nSecond");
  });

  it("does not add newlines for nested inline tags", () => {
    expect(htmlToPlainText("<b>Bold</b><u>Under</u>")).toBe("BoldUnder");
    expect(htmlToPlainText("<p>A<span>b</span>C</p>")).toBe("AbC");
  });
});
