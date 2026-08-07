// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getActiveFormats } from "@/components/editor/InlineTextEditor";

describe("InlineTextEditor getActiveFormats", () => {
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement("div");
    el.contentEditable = "true";
    document.body.appendChild(el);
  });

  const selectContents = (node: Node = el) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const setCaret = (node: Node, offset: number) => {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  it("detects bold when entire content is bold", () => {
    el.innerHTML = "<b>test</b>";
    selectContents();
    expect(getActiveFormats(el)).toEqual({
      bold: true,
      italic: false,
      align: "",
    });
  });

  it("detects italic when entire content is italic", () => {
    el.innerHTML = "<i>test</i>";
    selectContents();
    expect(getActiveFormats(el)).toEqual({
      bold: false,
      italic: true,
      align: "",
    });
  });

  it("detects mixed bold and italic active states", () => {
    el.innerHTML = "<b><i>test</i></b>";
    selectContents();
    expect(getActiveFormats(el)).toEqual({
      bold: true,
      italic: true,
      align: "",
    });
  });

  it("does not detect bold for plain text", () => {
    el.innerHTML = "test";
    selectContents();
    expect(getActiveFormats(el)).toEqual({
      bold: false,
      italic: false,
      align: "",
    });
  });

  it("detects bold at collapsed caret inside bold text", () => {
    el.innerHTML = "<b>test</b>";
    const textNode = el.querySelector("b")?.firstChild as Text;
    setCaret(textNode, 2);
    expect(getActiveFormats(el)).toEqual({
      bold: true,
      italic: false,
      align: "",
    });
  });

  it("detects alignment on the editor wrapper", () => {
    el.innerHTML = '<div style="text-align: center;">test</div>';
    selectContents();
    expect(getActiveFormats(el)).toEqual({
      bold: false,
      italic: false,
      align: "center",
    });
  });

  it("detects active state for partial selection inside bold", () => {
    el.innerHTML = "<b>bold text</b> normal";
    const b = el.querySelector("b") as HTMLElement;
    const range = document.createRange();
    range.setStart(b.firstChild as Node, 0);
    range.setEnd(b.firstChild as Node, 4);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    expect(getActiveFormats(el)).toEqual({
      bold: true,
      italic: false,
      align: "",
    });
  });

  it("returns false when partial selection spans bold and normal text", () => {
    el.innerHTML = "<b>bold</b> normal";
    const b = el.querySelector("b") as HTMLElement;
    const text = b.nextSibling as Text;
    const range = document.createRange();
    range.setStart(b.firstChild as Node, 0);
    range.setEnd(text, 4);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    expect(getActiveFormats(el)).toEqual({
      bold: false,
      italic: false,
      align: "",
    });
  });
});
