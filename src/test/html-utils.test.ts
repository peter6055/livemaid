import { describe, it, expect } from "vitest";
import { htmlToPlainText, containsHtml, normalizeHtmlForMermaid } from "@/lib/utils";

describe("htmlToPlainText", () => {
  it("strips simple tags", () => {
    expect(htmlToPlainText("<b>Bold</b>")).toBe("Bold");
    expect(htmlToPlainText("<i>Italic</i>")).toBe("Italic");
    expect(htmlToPlainText("<span>Span</span>")).toBe("Span");
  });

  it("converts br to newlines", () => {
    expect(htmlToPlainText("Line1<br/>Line2")).toBe("Line1\nLine2");
    expect(htmlToPlainText("Line1<br>Line2")).toBe("Line1\nLine2");
    expect(htmlToPlainText("Line1<br />Line2")).toBe("Line1\nLine2");
  });

  it("converts block elements to newlines", () => {
    expect(htmlToPlainText("<div>Block</div>")).toBe("Block");
    expect(htmlToPlainText("<p>Paragraph</p>")).toBe("Paragraph");
    expect(htmlToPlainText("<h1>Heading</h1>")).toBe("Heading");
    expect(htmlToPlainText("<h2>Heading</h2>")).toBe("Heading");
    expect(htmlToPlainText("<h3>Heading</h3>")).toBe("Heading");
    expect(htmlToPlainText("<li>List item</li>")).toBe("List item");
    expect(htmlToPlainText("<blockquote>Quote</blockquote>")).toBe("Quote");
  });

  it("handles complex nested HTML", () => {
    const input =
      "<div style='text-align:left;'><b>Azure DNS / cloudapp.azure.com</b><br/>CNAME target</div>";
    expect(htmlToPlainText(input)).toBe("Azure DNS / cloudapp.azure.com\nCNAME target");
  });

  it("handles multiple nested tags", () => {
    const input = "<p><b><i>Nested</i></b> text</p>";
    expect(htmlToPlainText(input)).toBe("Nested text");
  });

  it("decodes HTML entities", () => {
    expect(htmlToPlainText("&amp;")).toBe("&");
    expect(htmlToPlainText("&lt;")).toBe("<");
    expect(htmlToPlainText("&gt;")).toBe(">");
    expect(htmlToPlainText("&quot;")).toBe('"');
    expect(htmlToPlainText("&#39;")).toBe("'");
    expect(htmlToPlainText("text&nbsp;here")).toBe("text here");
  });

  it("collapses multiple newlines", () => {
    expect(htmlToPlainText("A\n\n\n\nB")).toBe("A\n\nB");
  });

  it("trims whitespace", () => {
    expect(htmlToPlainText("  <b>Hello</b>  ")).toBe("Hello");
  });

  it("handles plain text without HTML", () => {
    expect(htmlToPlainText("Just plain text")).toBe("Just plain text");
  });

  it("handles empty string", () => {
    expect(htmlToPlainText("")).toBe("");
  });

  it("handles tags with attributes", () => {
    expect(htmlToPlainText('<div class="test" id="main">Content</div>')).toBe("Content");
    expect(htmlToPlainText('<span style="color: red;">Red text</span>')).toBe("Red text");
  });

  it("handles multiple block elements", () => {
    const input = "<div>First</div><div>Second</div>";
    expect(htmlToPlainText(input)).toBe("First\n\nSecond");
  });

  it("handles mixed inline and block elements", () => {
    const input = "<div><b>Bold</b> and <i>italic</i></div><p>Paragraph</p>";
    expect(htmlToPlainText(input)).toBe("Bold and italic\n\nParagraph");
  });
});

describe("containsHtml", () => {
  it("detects HTML tags", () => {
    expect(containsHtml("<b>Bold</b>")).toBe(true);
    expect(containsHtml("<div class='test'>Content</div>")).toBe(true);
    expect(containsHtml("<br/>")).toBe(true);
    expect(containsHtml("<p>Paragraph</p>")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(containsHtml("No HTML here")).toBe(false);
    expect(containsHtml("Just text")).toBe(false);
    expect(containsHtml("")).toBe(false);
  });

  it("returns false for angle brackets that are not HTML tags", () => {
    expect(containsHtml("Just < some > brackets")).toBe(false);
    expect(containsHtml("Math: 5 < 10 > 3")).toBe(false);
  });

  it("detects self-closing tags", () => {
    expect(containsHtml("<br/>")).toBe(true);
    expect(containsHtml("<hr/>")).toBe(true);
    expect(containsHtml("<img src='test'/>")).toBe(true);
  });

  it("detects tags with attributes", () => {
    expect(containsHtml('<div class="test">Content</div>')).toBe(true);
    expect(containsHtml('<span style="color: red;">Text</span>')).toBe(true);
  });
});

describe("normalizeHtmlForMermaid", () => {
  it("converts div tags to br", () => {
    expect(normalizeHtmlForMermaid("<div>Line 1</div><div>Line 2</div>")).toBe("Line 1<br/>Line 2");
  });

  it("converts p tags to br", () => {
    expect(normalizeHtmlForMermaid("<p>Paragraph 1</p><p>Paragraph 2</p>")).toBe(
      "Paragraph 1<br/>Paragraph 2",
    );
  });

  it("preserves existing br tags", () => {
    expect(normalizeHtmlForMermaid("Line 1<br/>Line 2")).toBe("Line 1<br/>Line 2");
  });

  it("removes empty br at start", () => {
    expect(normalizeHtmlForMermaid("<br/>Content")).toBe("Content");
  });

  it("removes empty br at end", () => {
    expect(normalizeHtmlForMermaid("Content<br/>")).toBe("Content");
  });

  it("collapses multiple br tags", () => {
    expect(normalizeHtmlForMermaid("A<br/><br/><br/><br/>B")).toBe("A<br/><br/>B");
  });

  it("removes empty formatting tags", () => {
    expect(normalizeHtmlForMermaid("<b></b>Content<i></i>")).toBe("Content");
  });

  it("preserves formatting tags with content", () => {
    expect(normalizeHtmlForMermaid("<b>Bold</b> text")).toBe("<b>Bold</b> text");
  });

  it("handles complex HTML from contentEditable", () => {
    const input = "<div><b>Bold text</b></div><div>Normal text</div>";
    expect(normalizeHtmlForMermaid(input)).toBe("<b>Bold text</b><br/>Normal text");
  });

  it("trims whitespace", () => {
    expect(normalizeHtmlForMermaid("  Content  ")).toBe("Content");
  });

  it("handles empty string", () => {
    expect(normalizeHtmlForMermaid("")).toBe("");
  });

  it("preserves text-align style", () => {
    const input = "<div style='text-align:left;'><b>Azure DNS</b><br/>CNAME target</div>";
    expect(normalizeHtmlForMermaid(input)).toBe(
      '<div style="text-align:left;"><b>Azure DNS</b><br/>CNAME target',
    );
  });

  it("preserves text-align center", () => {
    const input = "<div style='text-align:center;'>Centered text</div>";
    expect(normalizeHtmlForMermaid(input)).toBe('<div style="text-align:center;">Centered text');
  });

  it("preserves text-align right", () => {
    const input = '<div style="text-align:right;">Right aligned</div>';
    expect(normalizeHtmlForMermaid(input)).toBe('<div style="text-align:right;">Right aligned');
  });

  it("removes browser-added br at word boundary characters", () => {
    // Browser wraps at "/" character
    const input1 = "<b>Azure DNS /<br>cloudapp.azure.com</b><br/>CNAME target";
    expect(normalizeHtmlForMermaid(input1)).toBe(
      "<b>Azure DNS /cloudapp.azure.com</b><br/>CNAME target",
    );

    // Browser wraps at "-" character
    const input2 = "some-long-<br>word";
    expect(normalizeHtmlForMermaid(input2)).toBe("some-long-word");

    // Browser wraps at "." character
    const input3 = "example.<br>com";
    expect(normalizeHtmlForMermaid(input3)).toBe("example.com");
  });

  it("preserves intentional br tags", () => {
    const input = "Line 1<br/>Line 2";
    expect(normalizeHtmlForMermaid(input)).toBe("Line 1<br/>Line 2");
  });
});
