import { describe, it, expect } from "vitest";
import {
  getSortedSequenceNoteTextElements,
  getSequenceNoteTextElementAtIndex,
  getSequenceNoteRectForText,
} from "./sequenceNotes";

// ---------------------------------------------------------------------------
// Minimal SVG-element mocks — the production code only needs:
//   querySelectorAll, parentElement, instanceOf SVGElement, getBoundingClientRect
// No actual DOM / jsdom needed.
// ---------------------------------------------------------------------------

class FakeSVGElement {
  tagName = "";
  classList = new Set<string>();
  children_: FakeSVGElement[] = [];
  parent_: FakeSVGElement | null = null;
  rect: { top: number; left: number; bottom: number; right: number } = {
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  };

  constructor(tag: string, cls?: string) {
    this.tagName = tag;
    if (cls) this.classList.add(cls);
  }

  setAttribute(attr: string, val: string) {
    if (attr === "class") {
      this.classList.clear();
      for (const c of val.split(/\s+/)) this.classList.add(c);
    }
  }

  getAttribute(attr: string): string | null {
    if (attr === "class") return [...this.classList].join(" ");
    return null;
  }

  get parentElement(): FakeSVGElement | null {
    return this.parent_ ?? null;
  }

  getBoundingClientRect() {
    return {
      top: this.rect.top,
      left: this.rect.left,
      bottom: this.rect.bottom,
      right: this.rect.right,
      width: this.rect.right - this.rect.left,
      height: this.rect.bottom - this.rect.top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  append(...kids: FakeSVGElement[]) {
    for (const k of kids) {
      k.parent_ = this;
      this.children_.push(k);
    }
  }

  /** Supports `.cls`, `tag.cls`, and `tag` selectors. */
  querySelectorAll(sel: string): FakeSVGElement[] {
    const dot = sel.indexOf(".");
    const tag = dot === -1 ? sel : sel.slice(0, dot);
    const cls = dot === -1 ? "" : sel.slice(dot + 1);
    const out: FakeSVGElement[] = [];
    const walk = (n: FakeSVGElement) => {
      for (const c of n.children_) {
        if ((!tag || c.tagName === tag) && (!cls || c.classList.has(cls))) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  querySelector(sel: string): FakeSVGElement | null {
    const dot = sel.indexOf(".");
    const tag = dot === -1 ? sel : sel.slice(0, dot);
    const cls = dot === -1 ? "" : sel.slice(dot + 1);
    const walk = (n: FakeSVGElement): FakeSVGElement | null => {
      for (const c of n.children_) {
        if ((!tag || c.tagName === tag) && (!cls || c.classList.has(cls))) return c;
        const f = walk(c);
        if (f) return f;
      }
      return null;
    };
    return walk(this);
  }
}

if (typeof SVGElement === "undefined") {
  (globalThis as unknown as { SVGElement: typeof FakeSVGElement }).SVGElement = FakeSVGElement;
}

describe("sequenceNotes", () => {
  describe("getSortedSequenceNoteTextElements", () => {
    it("deduplicates two .noteText in the same <g> (wrapped note)", () => {
      const g = new FakeSVGElement("g");
      const t1 = new FakeSVGElement("text", "noteText");
      t1.rect = { top: 100, left: 50, bottom: 120, right: 150 };
      const t2 = new FakeSVGElement("text", "noteText");
      t2.rect = { top: 120, left: 50, bottom: 140, right: 150 };
      g.append(t1, t2);

      const root = new FakeSVGElement("svg");
      root.append(g);

      const result = getSortedSequenceNoteTextElements(
        root as unknown as ParentNode,
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(t1);
    });

    it("preserves distinct notes in separate <g> elements", () => {
      const g1 = new FakeSVGElement("g");
      const t1 = new FakeSVGElement("text", "noteText");
      t1.rect = { top: 100, left: 50, bottom: 120, right: 150 };
      g1.append(t1);

      const g2 = new FakeSVGElement("g");
      const t2 = new FakeSVGElement("text", "noteText");
      t2.rect = { top: 200, left: 50, bottom: 220, right: 150 };
      g2.append(t2);

      const root = new FakeSVGElement("svg");
      root.append(g1, g2);

      const result = getSortedSequenceNoteTextElements(
        root as unknown as ParentNode,
      );
      expect(result).toHaveLength(2);
    });

    it("deduplicates three wrapped .noteText in one <g>", () => {
      const g = new FakeSVGElement("g");
      const t1 = new FakeSVGElement("text", "noteText");
      t1.rect = { top: 100, left: 50, bottom: 110, right: 150 };
      const t2 = new FakeSVGElement("text", "noteText");
      t2.rect = { top: 110, left: 50, bottom: 120, right: 150 };
      const t3 = new FakeSVGElement("text", "noteText");
      t3.rect = { top: 120, left: 50, bottom: 130, right: 150 };
      g.append(t1, t2, t3);

      const root = new FakeSVGElement("svg");
      root.append(g);

      const result = getSortedSequenceNoteTextElements(
        root as unknown as ParentNode,
      );
      expect(result).toHaveLength(1);
    });

    it("sorts distinct notes by visual position", () => {
      const g1 = new FakeSVGElement("g");
      const t1 = new FakeSVGElement("text", "noteText");
      t1.rect = { top: 300, left: 50, bottom: 320, right: 150 };
      g1.append(t1);

      const g2 = new FakeSVGElement("g");
      const t2 = new FakeSVGElement("text", "noteText");
      t2.rect = { top: 100, left: 50, bottom: 120, right: 150 };
      g2.append(t2);

      const root = new FakeSVGElement("svg");
      root.append(g1, g2);

      const result = getSortedSequenceNoteTextElements(
        root as unknown as ParentNode,
      );
      expect(result).toHaveLength(2);
      expect(result[0].getBoundingClientRect().top).toBe(100);
      expect(result[1].getBoundingClientRect().top).toBe(300);
    });

    it("returns empty array for null/undefined container", () => {
      expect(getSortedSequenceNoteTextElements(null)).toEqual([]);
      expect(getSortedSequenceNoteTextElements(undefined)).toEqual([]);
    });

    it("returns empty array when no noteText elements exist", () => {
      const root = new FakeSVGElement("svg");
      expect(
        getSortedSequenceNoteTextElements(root as unknown as ParentNode),
      ).toEqual([]);
    });
  });

  describe("getSequenceNoteTextElementAtIndex", () => {
    it("returns element at deduped index and null past end", () => {
      const g = new FakeSVGElement("g");
      const t1 = new FakeSVGElement("text", "noteText");
      t1.rect = { top: 100, left: 50, bottom: 120, right: 150 };
      const t2 = new FakeSVGElement("text", "noteText");
      t2.rect = { top: 120, left: 50, bottom: 140, right: 150 };
      g.append(t1, t2);

      const root = new FakeSVGElement("svg");
      root.append(g);

      expect(
        getSequenceNoteTextElementAtIndex(root as unknown as ParentNode, 0),
      ).not.toBeNull();
      expect(
        getSequenceNoteTextElementAtIndex(root as unknown as ParentNode, 1),
      ).toBeNull();
    });
  });

  describe("getSequenceNoteRectForText", () => {
    it("finds rect.note in the same parent group", () => {
      const g = new FakeSVGElement("g");
      const rect = new FakeSVGElement("rect", "note");
      const text = new FakeSVGElement("text", "noteText");
      g.append(rect, text);

      const result = getSequenceNoteRectForText(
        text as unknown as SVGElement,
      );
      expect(result!.getAttribute("class")).toBe("note");
    });

    it("finds rect.note in grandparent when direct parent has none", () => {
      const outerG = new FakeSVGElement("g");
      const rect = new FakeSVGElement("rect", "note");
      const innerG = new FakeSVGElement("g");
      const text = new FakeSVGElement("text", "noteText");
      innerG.append(text);
      outerG.append(rect, innerG);

      const result = getSequenceNoteRectForText(
        text as unknown as SVGElement,
      );
      expect(result!.getAttribute("class")).toBe("note");
    });

    it("returns null when no rect.note exists in ancestry", () => {
      const g = new FakeSVGElement("g");
      const text = new FakeSVGElement("text", "noteText");
      g.append(text);

      const result = getSequenceNoteRectForText(
        text as unknown as SVGElement,
      );
      expect(result).toBeNull();
    });
  });
});
