import { describe, expect, it } from "vitest";
import {
  addMindmapChild,
  addRootMindmapNode,
  changeMindmapNodeShape,
  deleteMindmapNode,
  parseMindmap,
} from "@/lib/diagrams/mindmap";

describe("mindmap parser", () => {
  it("parses a single root", () => {
    const parsed = parseMindmap("mindmap\n  Root");
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]).toMatchObject({ label: "Root", parentId: null, indent: 2 });
  });

  it("parses children, nesting, and sibling order", () => {
    const parsed = parseMindmap("mindmap\n  Root\n    A\n      B\n    C");
    expect(parsed.nodes.map((node) => node.label)).toEqual(["Root", "A", "B", "C"]);
    expect(parsed.nodes[1].parentId).toBe(parsed.nodes[0].id);
    expect(parsed.nodes[2].parentId).toBe(parsed.nodes[1].id);
    expect(parsed.nodes[3].parentId).toBe(parsed.nodes[0].id);
  });

  it("ignores blank lines, comments, icons, and class metadata", () => {
    const parsed = parseMindmap(
      "mindmap\n  Root\n\n    %% note\n    A\n    ::icon(fa fa-book)\n    :::urgent",
    );
    expect(parsed.nodes.map((node) => node.label)).toEqual(["Root", "A"]);
  });

  it("preserves frontmatter and parses supported shape syntax", () => {
    const parsed = parseMindmap(
      "---\nconfig:\n  layout: tidy-tree\n---\nmindmap\n  id((Root))\n    child[Child]",
    );
    expect(parsed.headerLineIndex).toBe(4);
    expect(parsed.nodes[0]).toMatchObject({ label: "Root", shape: "circle", syntaxId: "id" });
    expect(parsed.nodes[1]).toMatchObject({ label: "Child", shape: "square", syntaxId: "child" });
  });
});

describe("mindmap mutations", () => {
  it("adds a root to an empty mindmap body", () => {
    const result = addRootMindmapNode("mindmap", "Root");
    expect(result.code).toBe("mindmap\n  Root");
    expect(parseMindmap(result.code).nodes[0].id).toBe(result.nodeId);
  });

  it("adds children below the selected node and preserves sibling order", () => {
    const root = parseMindmap("mindmap\n  Root").nodes[0];
    const first = addMindmapChild("mindmap\n  Root", root.id, "A");
    const second = addMindmapChild(first.code, root.id, "B");
    expect(second.code).toBe("mindmap\n  Root\n    A\n    B");
  });

  it("auto-numbers default child labels", () => {
    const root = parseMindmap("mindmap\n  Root").nodes[0];
    const first = addMindmapChild("mindmap\n  Root", root.id);
    const rootAfterFirst = parseMindmap(first.code).nodes[0];
    const second = addMindmapChild(first.code, rootAfterFirst.id);
    expect(second.code).toBe("mindmap\n  Root\n    New Element 1\n    New Element 2");
  });

  it("adds a child under a nested node after its descendants", () => {
    const code = "mindmap\n  Root\n    A\n      B\n    C";
    const nodeA = parseMindmap(code).nodes.find((node) => node.label === "A")!;
    const result = addMindmapChild(code, nodeA.id, "D");
    expect(result.code).toBe("mindmap\n  Root\n    A\n      B\n      D\n    C");
  });

  it("deletes a leaf node only", () => {
    const code = "mindmap\n  Root\n    A\n    B";
    const nodeA = parseMindmap(code).nodes.find((node) => node.label === "A")!;
    expect(deleteMindmapNode(code, nodeA.id)).toBe("mindmap\n  Root\n    B");
  });

  it("deletes a parent node with descendants", () => {
    const code = "mindmap\n  Root\n    A\n      B\n      C\n    D";
    const nodeA = parseMindmap(code).nodes.find((node) => node.label === "A")!;
    expect(deleteMindmapNode(code, nodeA.id)).toBe("mindmap\n  Root\n    D");
  });

  it("changes shape without changing label or descendants", () => {
    const code = "mindmap\n  Root\n    A\n      B";
    const nodeA = parseMindmap(code).nodes.find((node) => node.label === "A")!;
    const result = changeMindmapNodeShape(code, nodeA.id, "hexagon");
    expect(result).toBe("mindmap\n  Root\n    A{{A}}\n      B");
    expect(parseMindmap(result).nodes.find((node) => node.label === "B")?.parentId).toBe(
      parseMindmap(result).nodes.find((node) => node.label === "A")?.id,
    );
  });
});
