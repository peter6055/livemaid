// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeHtml, normalizeHtmlForMermaid } from "@/lib/utils";

describe("sanitizeHtml (jsdom/DOMPurify path)", () => {
  it("keeps formatting tags", () => {
    expect(sanitizeHtml("<b>Bold</b><i>Italic</i>")).toBe("<b>Bold</b><i>Italic</i>");
  });

  it("drops script tags with their content", () => {
    expect(sanitizeHtml("a<script>alert(1)</script>b")).toBe("ab");
  });

  it("drops iframe/object/embed/style tags but keeps their text content", () => {
    expect(sanitizeHtml("<iframe src=x></iframe>x")).toBe("x");
    expect(sanitizeHtml("<style>body{}</style>x")).toBe("x");
    // DOMPurify strips the <object> element but keeps its fallback text.
    expect(sanitizeHtml("<object>data</object>x")).toBe("datax");
  });

  it("drops event handler attributes", () => {
    expect(sanitizeHtml('<b onmouseover="x()">B</b>')).toBe("<b>B</b>");
    expect(sanitizeHtml('<img src=x onerror="x()">')).toBe("");
  });

  it("strips dangerous style values", () => {
    expect(
      sanitizeHtml('<span style="background:url(https://evil.example)">x</span>'),
    ).toBe("<span>x</span>");
  });

  it("keeps text-align style", () => {
    expect(sanitizeHtml('<div style="text-align:center;">x</div>')).toBe(
      '<div style="text-align:center;">x</div>',
    );
  });

  it("drops non-allowlisted tags but keeps their text", () => {
    expect(sanitizeHtml("<table><tr><td>cell</td></tr></table>")).toBe("cell");
  });

  it("normalizeHtmlForMermaid strips scripts through DOMPurify", () => {
    expect(normalizeHtmlForMermaid("<b>B</b><script>alert(1)</script>")).toBe("<b>B</b>");
  });
});
