import { describe, it, expect } from "vitest";
import { maskShapeBodies } from "@/lib/diagrams/flowchart/shapeScan";
import { findFlowchartNodeLine } from "@/lib/diagrams/flowchart/selectionLineMap";
import {
  getFlowchartNodeMoveEligibility,
  moveFlowchartNode,
} from "@/lib/diagrams/flowchart/membership";

// Regression specs for the PR #145 membership review defects (CodeRabbit
// 4300459591 + Copilot 4300464820/4300464878/4300464903/4300464916/4300464925).
// Every `moveFlowchartNode` spec below FAILS against the pre-fix lib (bare
// edge left in the source subgraph, whole compound lines moved, apostrophe /
// trapezoid labels rejected, quoted-label false matches) and passes once the
// re-scoping + shapeScan fixes land.

const KEYWORDS = new Set([
  "flowchart",
  "graph",
  "subgraph",
  "end",
  "direction",
  "style",
  "linkStyle",
  "classDef",
  "class",
  "click",
]);

/**
 * Rendered subgraph ownership as Mermaid 11.16.1 computes it: every id
 * referenced inside a subgraph block (declared or edge endpoint) is a
 * candidate member, and `makeUniq` keeps only ids not already claimed by an
 * EARLIER subgraph — the first subgraph wins (flowDb.ts, verified against
 * 11.16.1). Returns the member id list per subgraph id in document order.
 *
 * shortcut: assumes single-level subgraphs (the fixtures below); nested
 * parent/child claim order is not modeled.
 */
function renderedOwnership(code: string): Record<string, string[]> {
  const lines = code.split("\n");
  const claims: Array<{ id: string; start: number; end: number }> = [];
  const stack: Array<{ id: string; start: number }> = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    const m = t.match(/^subgraph\s+([A-Za-z0-9_-]+)/);
    if (m) {
      stack.push({ id: m[1], start: i });
      continue;
    }
    if (t === "end") {
      const open = stack.pop();
      if (open) claims.push({ id: open.id, start: open.start, end: i });
    }
  }
  claims.sort((a, b) => a.start - b.start);

  const owners: Record<string, string[]> = {};
  const claimed = new Set<string>();
  for (const c of claims) {
    const seen = new Set<string>();
    for (let i = c.start + 1; i < c.end; i += 1) {
      const masked = maskShapeBodies(lines[i]).trim();
      if (!masked || masked.startsWith("%%")) continue;
      if (KEYWORDS.has(masked.split(/\s+/)[0])) continue;
      for (const tok of masked.split(/[^A-Za-z0-9_-]+/)) {
        // Require an alnum char so connector fragments (`-->`, `-.-`) never
        // count as ids; label interiors are already masked away.
        if (!tok || !/[A-Za-z0-9]/.test(tok) || KEYWORDS.has(tok)) continue;
        seen.add(tok);
      }
    }
    const members: string[] = [];
    for (const id of seen) {
      if (claimed.has(id)) continue; // first subgraph wins (makeUniq)
      claimed.add(id);
      members.push(id);
    }
    owners[c.id] = members;
  }
  return owners;
}

describe("moveFlowchartNode re-scopes incident edges (defect 1)", () => {
  const SIBLING_CODE = `flowchart TD
    subgraph s1
        A[X] --> B
    end
    subgraph s2
        C[Z]
    end`;

  it("stale edge no longer keeps the source subgraph owning the node (move to sibling)", () => {
    expect(getFlowchartNodeMoveEligibility(SIBLING_CODE, "A")).toEqual({
      eligible: true,
      reason: null,
    });
    const out = moveFlowchartNode(SIBLING_CODE, "A", "s2");
    expect(out).not.toBe(SIBLING_CODE);
    const own = renderedOwnership(out);
    expect(own.s1).not.toContain("A"); // Mermaid would claim A via `A --> B`
    expect(own.s1).toContain("B"); // other endpoint keeps its membership
    expect(own.s2).toContain("A");
    expect(out).toContain("        A[X]");
    expect(out).toContain("A --> B");
  });

  it("stale edge no longer keeps the source subgraph owning the node (move to top level)", () => {
    const code = `flowchart TD
    subgraph s1
        A[X] --> B
    end`;
    const out = moveFlowchartNode(code, "A", null);
    expect(out).not.toBe(code);
    const own = renderedOwnership(out);
    expect(own.s1).not.toContain("A");
    expect(own.s1).toContain("B");
    expect(out).toMatch(/^    A\[X\]$/m);
    expect(out.indexOf("A --> B")).toBeGreaterThan(out.indexOf("    end"));
  });

  it("re-scopes every incident edge in the source subgraph in relative order", () => {
    const code = `flowchart TD
    subgraph s1
        A[X] --> B
        A --> C
    end
    subgraph s2
        D[Z]
    end`;
    const out = moveFlowchartNode(code, "A", "s2");
    expect(out).not.toBe(code);
    const own = renderedOwnership(out);
    expect(own.s1).not.toContain("A");
    expect(own.s1).toContain("B");
    expect(own.s1).toContain("C");
    expect(own.s2).toContain("A");
    const edges = out.split("\n").filter((l) => l.includes("-->"));
    expect(edges.map((l) => l.trim())).toEqual(["A --> B", "A --> C"]);
  });

  it("heals positional linkStyle indices after re-scoping", () => {
    const code = `flowchart TD
    subgraph s1
        A[X] --> B
        C --> D
    end
    linkStyle 0 stroke:#f00`;
    const out = moveFlowchartNode(code, "A", null);
    expect(out).not.toBe(code);
    // A --> B was link 0 before the move but now follows `C --> D`, so the
    // positional index must be rebuilt (rebuildLinkStyles), not left stale.
    expect(out).toContain("    linkStyle 1 stroke:#f00");
    expect(out).not.toContain("linkStyle 0");
    const own = renderedOwnership(out);
    expect(own.s1).not.toContain("A");
    expect(own.s1).toContain("B");
    expect(own.s1).toContain("C");
    expect(own.s1).toContain("D");
  });
});

describe("source resolution ignores declaration-like text inside labels (defect 2)", () => {
  const code = `flowchart TD
    A["B[example]"]
    subgraph sg
        C[Z]
    end
    B[Actual]`;

  it("finds the real declaration line, not another node's quoted label", () => {
    expect(findFlowchartNodeLine(code, "B")).toBe(5);
  });

  it("moves B's declaration instead of A's label-bearing line", () => {
    const out = moveFlowchartNode(code, "B", "sg");
    expect(out).not.toBe(code);
    expect(out).toContain("        B[Actual]");
    expect(out.split("\n")[1]).toBe(`    A["B[example]"]`);
    expect(out).not.toContain(`        A["B[example]"]`);
    expect(out.match(/B\[Actual\]/g)).toHaveLength(1);
  });
});

describe("labels with apostrophes and trapezoid shapes are movable (defects 3+4)", () => {
  it("moves an edge declaration whose label contains an apostrophe", () => {
    const code = `flowchart TD
    subgraph sg
        A[Bob's task] --> B
        C[Z]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({
      eligible: true,
      reason: null,
    });
    const out = moveFlowchartNode(code, "A", null);
    expect(out).not.toBe(code);
    expect(out).toContain("A[Bob's task]");
    expect(out).toContain("A --> B");
    expect(renderedOwnership(out).sg).not.toContain("A");
  });

  it("splits both trapezoid variants [/...\\] and [\\.../]", () => {
    const cases: Array<[string, string]> = [
      ["A[/Task\\] --> B", "A[/Task\\]"],
      ["A[\\Task/] --> B", "A[\\Task/]"],
    ];
    for (const [src, decl] of cases) {
      const code = `flowchart TD
    ${src}
    subgraph sg
        C[Z]
    end`;
      expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({
        eligible: true,
        reason: null,
      });
      const out = moveFlowchartNode(code, "A", "sg");
      expect(out).not.toBe(code);
      expect(out).toContain(`        ${decl}`);
      expect(out.split("\n")[1].trim()).toBe("A --> B");
    }
  });
});

describe("compound ';' lines move only the dragged statement (defect 6)", () => {
  it("leaves the other statement's declaration in the source subgraph", () => {
    const code = `flowchart TD
    subgraph s1
        A[Alpha]; B[Beta]
    end
    subgraph s2
        C[Z]
    end`;
    expect(getFlowchartNodeMoveEligibility(code, "A")).toEqual({
      eligible: true,
      reason: null,
    });
    expect(getFlowchartNodeMoveEligibility(code, "B")).toEqual({
      eligible: true,
      reason: null,
    });
    const out = moveFlowchartNode(code, "A", "s2");
    expect(out).not.toBe(code);
    expect(out).not.toContain("A[Alpha]; B[Beta]");
    expect(out).toContain("        B[Beta]"); // stayed in s1
    expect(out).toContain("        A[Alpha]"); // moved into s2
    const own = renderedOwnership(out);
    expect(own.s1).toContain("B");
    expect(own.s1).not.toContain("A");
    expect(own.s2).toContain("A");
    expect(own.s2).not.toContain("B");
  });

  it("leaves no bare id behind when another statement carries the edge", () => {
    const code = `flowchart TD
    subgraph s1
        A[Hi]; B --> C
    end`;
    const out = moveFlowchartNode(code, "A", null);
    expect(out).not.toBe(code);
    // Old split produced `A; B --> C`, keeping a bare A statement inside s1.
    expect(out.split("\n")[2].trim()).toBe("B --> C");
    expect(out).not.toContain("A; B");
    const own = renderedOwnership(out);
    expect(own.s1).not.toContain("A");
    expect(own.s1).toContain("B");
    expect(own.s1).toContain("C");
    expect(out).toMatch(/^    A\[Hi\]$/m);
  });
});
