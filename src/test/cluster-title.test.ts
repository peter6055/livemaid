import { describe, it, expect } from "vitest";
import { resolveFlowchartSubgraphTitleTarget } from "@/hooks/useInlineEditing";
import { subgraphTitleId } from "@/lib/diagrams/flowchart/subgraphTitle";

// Stand-in for useSelectionState's normalizeId (that file is owned elsewhere).
// Mirrors the flowchart-relevant steps for ids, including the render-id infix
// strip and the trailing `[-_]\d+` heuristic that is the subject of this test.
const normalizeId = (id: string): string =>
  id
    .replace("-hit-target", "")
    .replace(/^.*?-?mermaid-svg-\d+-/, "")
    .replace(/^svg-/, "")
    .replace(/^flowchart-/, "")
    .replace(/[-_]\d+$/, "");

const CODE = [
  "flowchart TD",
  '  subgraph group["Group"]',
  "    A --> B",
  "  end",
  '  subgraph group_1["Group One"]',
  "    C --> D",
  "  end",
].join("\n");

describe("resolveFlowchartSubgraphTitleTarget", () => {
  it("keeps a legitimate trailing _<digits> of the subgraph id (group_1 stays group_1)", () => {
    const { subgraphId, titleId } = resolveFlowchartSubgraphTitleTarget(
      CODE,
      "flowchart-group_1",
      normalizeId,
    );
    expect(subgraphId).toBe("group_1");
    expect(titleId).toBe(subgraphTitleId("group_1"));
  });

  it("keeps the full id even when a shorter declared subgraph (group) also exists", () => {
    const { subgraphId } = resolveFlowchartSubgraphTitleTarget(
      CODE,
      "flowchart-group_1",
      normalizeId,
    );
    expect(subgraphId).not.toBe("group");
  });

  it("still strips Mermaid's per-render numeric suffix (flowchart-group-5 → group)", () => {
    const { subgraphId, titleId } = resolveFlowchartSubgraphTitleTarget(
      CODE,
      "flowchart-group-5",
      normalizeId,
    );
    expect(subgraphId).toBe("group");
    expect(titleId).toBe(subgraphTitleId("group"));
  });

  it("handles the full Mermaid id shape flowchart-<renderId>-<id>-<n>", () => {
    const { subgraphId } = resolveFlowchartSubgraphTitleTarget(
      CODE,
      "flowchart-mermaid-svg-1698522334411-group_1-5",
      normalizeId,
    );
    expect(subgraphId).toBe("group_1");
  });

  it("falls back to the normalized id when no candidate resolves to a declared subgraph", () => {
    const { subgraphId, titleId } = resolveFlowchartSubgraphTitleTarget(
      CODE,
      "flowchart-unknown_9",
      normalizeId,
    );
    // normalizeId heuristic yields "unknown" — preserve today's fallback.
    expect(subgraphId).toBe("unknown");
    expect(titleId).toBe(subgraphTitleId("unknown"));
  });
});
