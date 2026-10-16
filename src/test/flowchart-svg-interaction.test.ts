// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(),
    render: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { addInteractionHelpersToSvg } from "@/hooks/useEditorState";

describe("flowchart SVG interaction helpers", () => {
  it("sets cluster background rects to pointer-events: stroke and cluster labels to pointer-events: bounding-box", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g class="cluster" id="sub1">
          <rect class="rect" x="0" y="0" width="200" height="100" fill="#f0f0f0" />
          <g class="cluster-label">
            <text x="10" y="20">Subgraph</text>
          </g>
        </g>
        <g class="cluster" id="sub2">
          <rect x="0" y="0" width="200" height="100" />
        </g>
      </svg>
    `;

    const result = addInteractionHelpersToSvg(svg);
    const doc = new DOMParser().parseFromString(result, "image/svg+xml");

    const clusterRects = doc.querySelectorAll("g.cluster > rect.rect, g.cluster > rect");
    expect(clusterRects.length).toBeGreaterThan(0);
    clusterRects.forEach((rect) => {
      expect(rect.getAttribute("pointer-events")).toBe("stroke");
      expect(rect.getAttribute("style")).toMatch(/pointer-events:\s*stroke\s*!important/);
    });

    const clusterLabels = doc.querySelectorAll("g.cluster-label");
    expect(clusterLabels.length).toBeGreaterThan(0);
    clusterLabels.forEach((label) => {
      expect(label.getAttribute("pointer-events")).toBe("bounding-box");
      expect(label.getAttribute("style")).toMatch(/pointer-events:\s*bounding-box\s*!important/);
    });
  });

  it("gives flowchart-link-hit-target clones a 30px stroke and stroke pointer-events", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <path id="e1" class="flowchart-link" d="M0,0 L100,100" stroke="#000" />
        <g class="edgePath">
          <path id="e2" class="path" d="M10,10 L110,110" stroke="#000" />
        </g>
      </svg>
    `;

    const result = addInteractionHelpersToSvg(svg);
    const doc = new DOMParser().parseFromString(result, "image/svg+xml");
    const hitTargets = doc.querySelectorAll(".flowchart-link-hit-target");

    expect(hitTargets.length).toBe(2);
    hitTargets.forEach((target) => {
      expect(target.getAttribute("stroke-width")).toBe("30px");
      expect(target.getAttribute("style")).toMatch(/stroke-width:\s*30px\s*!important/);
      expect(target.getAttribute("style")).toMatch(/pointer-events:\s*stroke\s*!important/);
    });
  });

  it("pads edge-label-hit-target rects by 16px around the foreignObject bounds", () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g class="edgeLabel" data-id="edge1">
          <foreignObject x="50" y="60" width="80" height="30">
            <div xmlns="http://www.w3.org/1999/xhtml">label</div>
          </foreignObject>
        </g>
      </svg>
    `;

    const result = addInteractionHelpersToSvg(svg);
    const doc = new DOMParser().parseFromString(result, "image/svg+xml");
    const target = doc.querySelector(".edge-label-hit-target");

    expect(target).not.toBeNull();
    expect(target?.getAttribute("x")).toBe("34"); // 50 - 16
    expect(target?.getAttribute("y")).toBe("44"); // 60 - 16
    expect(target?.getAttribute("width")).toBe("112"); // 80 + 32
    expect(target?.getAttribute("height")).toBe("62"); // 30 + 32
  });
});
