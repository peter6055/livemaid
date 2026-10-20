import { describe, it, expect } from "vitest";
import { moveFlowchartSubgraph } from "@/lib/diagrams/flowchart/subgraphMove";

/**
 * Resolve every `linkStyle <index> <style>` directive to the edge it actually
 * styles. Mermaid's semantics are positional: only edges declared BEFORE the
 * directive count, and an index past those throws "out of bounds" at parse
 * time. Returns sorted `"<src>-><dst> <style>"` strings so old/new documents
 * can be compared as sets (indices may legitimately change after a move).
 */
function linkStyleTargets(code: string): string[] {
  const edges: string[] = [];
  const targets: string[] = [];
  for (const raw of code.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    const style = line.match(/^linkStyle\s+(\d+)\s+(.+)$/);
    if (style) {
      const index = Number(style[1]);
      const edge = edges[index] ?? `<out-of-range:${index}>`;
      targets.push(`${edge} ${style[2].trim()}`);
      continue;
    }
    if (/^(flowchart|graph|subgraph|end|style|classDef|class|direction)\b/.test(line)) continue;
    if (!line.includes("-->")) continue;
    const ids = line.split("-->").map((part) => part.trim().match(/^[A-Za-z0-9_-]+/)?.[0] ?? "?");
    edges.push(`${ids[0]}->${ids[1]}`);
  }
  return targets.sort();
}

describe("moveFlowchartSubgraph linkStyle remapping", () => {
  it("keeps linkStyle pointing at the dragged edges when nesting into a later subgraph", () => {
    const code = `flowchart TD
    subgraph src
        A[Alpha]
        A --> B[Beta]
    end
    subgraph dest
        C[Gamma]
        C --> D[Delta]
    end
    linkStyle 0 stroke:#0f0`;

    const result = moveFlowchartSubgraph(code, "src", "dest");

    // Precondition: the move really reorders the edges (dest's edge now first).
    expect(result.indexOf("C --> D")).toBeLessThan(result.indexOf("A -->"));
    // linkStyle 0 styled A->B before the move; it must still style A->B.
    expect(linkStyleTargets(result)).toEqual(["A->B stroke:#0f0"]);
    expect(result.match(/linkStyle/g)).toHaveLength(1);
    // Edge-dependent directives are emitted after the edge lines.
    expect(result.indexOf("linkStyle")).toBeGreaterThan(result.lastIndexOf("-->"));
  });

  it("keeps linkStyle valid and edge-accurate when unnesting to top level", () => {
    const code = `flowchart TD
    subgraph outer
        subgraph inner
            A --> B
        end
        C --> D
    end
    linkStyle 0 stroke:#0f0
    linkStyle 1 stroke:#00f`;

    const result = moveFlowchartSubgraph(code, "inner", null);

    // Precondition: the block moved to top level and its edge order flipped.
    expect(result).toMatch(/^    subgraph inner$/m);
    expect(result.indexOf("C --> D")).toBeLessThan(result.indexOf("A -->"));
    // Every directive resolves to a real edge (no parse-time out-of-bounds)…
    expect(linkStyleTargets(result).some((t) => t.includes("<out-of-range"))).toBe(false);
    // …and each style still targets the same edge it targeted before the move.
    expect(linkStyleTargets(result)).toEqual(linkStyleTargets(code));
    expect(result.match(/linkStyle/g)).toHaveLength(2);
    // Edge-dependent directives are emitted after the edge lines.
    expect(result.indexOf("linkStyle")).toBeGreaterThan(result.lastIndexOf("-->"));
  });

  it("returns byte-identical code on every no-op case even with linkStyle lines present", () => {
    const suffix = "\n    linkStyle 0 stroke:#0f0";

    const selfDrop = `flowchart TD
    subgraph a
        A --> B
    end${suffix}`;
    expect(moveFlowchartSubgraph(selfDrop, "a", "a")).toBe(selfDrop);

    const alreadyChild = `flowchart TD
    subgraph dest
        subgraph src
            A --> B
        end
        C --> D
    end${suffix}`;
    expect(moveFlowchartSubgraph(alreadyChild, "src", "dest")).toBe(alreadyChild);

    const alreadyTop = `flowchart TD
    subgraph src
        A --> B
    end${suffix}`;
    expect(moveFlowchartSubgraph(alreadyTop, "src", null)).toBe(alreadyTop);

    const invalidDest = `flowchart TD
    subgraph src
        A --> B
    end${suffix}`;
    expect(moveFlowchartSubgraph(invalidDest, "src", "missing")).toBe(invalidDest);
    expect(moveFlowchartSubgraph(invalidDest, "src", "A")).toBe(invalidDest);
  });
});
