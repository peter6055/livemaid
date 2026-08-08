import { describe, expect, it } from "vitest";
import { formatMermaidSource } from "@/lib/mermaid-format";

describe("formatMermaidSource", () => {
  describe("status model", () => {
    it("returns unchanged for already-formatted source", () => {
      const code = "flowchart LR\n    A --> B\n";
      const result = formatMermaidSource(code);
      expect(result.status).toBe("unchanged");
      expect(result.formatted).toBe(code);
    });

    it("returns changed and reformats when indentation is missing", () => {
      const result = formatMermaidSource("flowchart LR\nA --> B\n");
      expect(result.status).toBe("changed");
      expect(result.formatted).toBe("flowchart LR\n    A --> B\n");
    });

    it("reports skippedIndentSensitive only for indent-sensitive types", () => {
      expect(formatMermaidSource("mindmap\n  root\n").skippedIndentSensitive).toBe(true);
      expect(formatMermaidSource("timeline\n  title A\n").skippedIndentSensitive).toBe(true);
      expect(
        formatMermaidSource("flowchart LR\n    A --> B\n").skippedIndentSensitive,
      ).toBeUndefined();
    });
  });

  describe("trailing newline preservation", () => {
    it("keeps an existing trailing newline so formatted docs stay unchanged", () => {
      const code = "flowchart LR\n    A --> B\n";
      const result = formatMermaidSource(code);
      expect(result.status).toBe("unchanged");
      expect(result.formatted).toBe(code);
    });

    it("does not add a trailing newline that was not present", () => {
      const result = formatMermaidSource("flowchart LR\n    A --> B");
      expect(result.status).toBe("unchanged");
      expect(result.formatted.endsWith("\n")).toBe(false);
    });
  });

  describe("block indentation", () => {
    it("indents nested subgraphs", () => {
      const code = "flowchart TB\nsubgraph A\nsubgraph B\nA1-->B1\nend\nend\n";
      const result = formatMermaidSource(code);
      expect(result.formatted).toBe(
        "flowchart TB\n    subgraph A\n        subgraph B\n            A1-->B1\n        end\n    end\n",
      );
    });

    it("indents sequence diagram box...end groups", () => {
      const code = "sequenceDiagram\nbox Aqua Alice & Bob\nalice->>bob: hi\nend\n";
      const result = formatMermaidSource(code);
      expect(result.formatted).toBe(
        "sequenceDiagram\n    box Aqua Alice & Bob\n        alice->>bob: hi\n    end\n",
      );
    });

    it("aligns else at the parent block level inside sequence alt", () => {
      const code =
        "sequenceDiagram\nAlice->>Bob: OK\nalt success\nAlice->>Bob: done\nelse failure\nAlice->>Bob: fail\nend\n";
      const result = formatMermaidSource(code);
      expect(result.formatted).toBe(
        "sequenceDiagram\n    Alice->>Bob: OK\n    alt success\n        Alice->>Bob: done\n    else failure\n        Alice->>Bob: fail\n    end\n",
      );
    });
  });

  describe("brace bodies", () => {
    it("re-indents class diagram brace bodies", () => {
      const code = "classDiagram\nclass Animal {\nString name\n}\n";
      const result = formatMermaidSource(code);
      expect(result.formatted).toBe(
        "classDiagram\n    class Animal {\n        String name\n    }\n",
      );
    });

    it("re-indents ER diagram entity bodies", () => {
      const code = "erDiagram\nCUSTOMER {\nstring id\n}\n";
      const result = formatMermaidSource(code);
      expect(result.formatted).toBe("erDiagram\n    CUSTOMER {\n        string id\n    }\n");
    });
  });

  describe("diagram declaration detection", () => {
    it.each([
      ["flowchart-elk", "flowchart-elk LR"],
      ["kanban", "kanban"],
      ["packet-beta", "packet-beta"],
      ["radar-beta", "radar-beta"],
      ["treemap-beta", "treemap-beta"],
      ["zenuml", "zenuml"],
    ])("indents body after %s declaration", (_label, decl) => {
      const code = `${decl}\nline one\n`;
      const result = formatMermaidSource(code);
      expect(result.status).toBe("changed");
      expect(result.formatted).toBe(`${decl}\n    line one\n`);
    });
  });

  describe("front matter", () => {
    it("preserves YAML front matter and indents the body", () => {
      const code = "---\nconfig:\n  theme: dark\n---\nflowchart LR\nA --> B\n";
      const result = formatMermaidSource(code);
      expect(result.formatted).toBe(
        "---\nconfig:\n  theme: dark\n---\nflowchart LR\n    A --> B\n",
      );
    });
  });

  describe("whitespace handling", () => {
    it("collapses consecutive blank lines", () => {
      const result = formatMermaidSource("flowchart LR\nA --> B\n\n\nC --> D\n");
      expect(result.formatted).toBe("flowchart LR\n    A --> B\n\n    C --> D\n");
    });
  });

  describe("indent-sensitive diagrams", () => {
    it("keeps mindmap leading indentation intact", () => {
      const code = "mindmap\n  root\n    child\n  leaf\n";
      const result = formatMermaidSource(code);
      expect(result.status).toBe("unchanged");
      expect(result.skippedIndentSensitive).toBe(true);
      expect(result.formatted).toBe(code);
    });

    it("applies light cleanup (trailing whitespace) without re-indenting", () => {
      const code = "timeline\n  title A  \n";
      const result = formatMermaidSource(code);
      expect(result.status).toBe("changed");
      expect(result.skippedIndentSensitive).toBe(true);
      expect(result.formatted).toBe("timeline\n  title A\n");
    });
  });
});
