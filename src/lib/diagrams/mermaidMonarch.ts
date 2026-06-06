import type { Monaco } from "@monaco-editor/react";

/**
 * Registers a lightweight "mermaid" language with Monaco (idempotent).
 *
 * Monaco ships no Mermaid grammar, and Mermaid is not MDX — so we provide a
 * Monarch tokenizer that highlights the constructs shared across Mermaid diagram
 * types (declarations, keywords, arrows, comments, strings, directives). This is
 * intentionally permissive rather than a full per-diagram parser: it colours the
 * common surface of flowchart/sequence/class/state/er/gantt/pie/etc. without
 * fighting the live Mermaid renderer that already validates the code.
 */
export function registerMermaidLanguage(monaco: Monaco): void {
  const LANG_ID = "mermaid";
  if (monaco.languages.getLanguages().some((l: { id: string }) => l.id === LANG_ID)) return;

  monaco.languages.register({ id: LANG_ID });

  monaco.languages.setLanguageConfiguration(LANG_ID, {
    comments: { lineComment: "%%" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });

  monaco.languages.setMonarchTokensProvider(LANG_ID, {
    defaultToken: "",
    ignoreCase: true,

    // Diagram declarations (start of a diagram).
    diagrams: [
      "flowchart",
      "graph",
      "sequenceDiagram",
      "classDiagram",
      "classDiagram-v2",
      "stateDiagram",
      "stateDiagram-v2",
      "erDiagram",
      "journey",
      "gantt",
      "pie",
      "gitGraph",
      "mindmap",
      "timeline",
      "quadrantChart",
      "requirementDiagram",
      "C4Context",
      "sankey-beta",
      "xychart-beta",
      "block-beta",
    ],

    // Structural / statement keywords across diagram types.
    keywords: [
      "subgraph",
      "end",
      "participant",
      "actor",
      "activate",
      "deactivate",
      "note",
      "loop",
      "alt",
      "else",
      "opt",
      "par",
      "and",
      "critical",
      "option",
      "break",
      "rect",
      "autonumber",
      "over",
      "left",
      "right",
      "of",
      "class",
      "classDef",
      "click",
      "style",
      "linkStyle",
      "direction",
      "state",
      "section",
      "title",
      "accTitle",
      "accDescr",
      "call",
      "link",
      "callback",
    ],

    // Flow directions.
    directions: ["TB", "TD", "BT", "RL", "LR"],

    tokenizer: {
      root: [
        // Comments: %% to end of line.
        [/%%.*$/, "comment"],

        // Frontmatter / directive block markers.
        [/^---$/, "keyword"],
        [/@\{/, { token: "delimiter.curly", next: "@directive" }],

        // Diagram declaration at the start of a logical line.
        [
          /[a-zA-Z][\w-]*/,
          {
            cases: {
              "@diagrams": "keyword.diagram",
              "@keywords": "keyword",
              "@directions": "type",
              "@default": "identifier",
            },
          },
        ],

        // Strings.
        [/"/, { token: "string.quote", next: "@string" }],

        // Arrows / links / connectors (sequence + flowchart + class + er).
        [
          /(-{1,3}>{1,2}|<-{1,3}|-{2,3}|={2,3}>?|-\.->?|\.{1,2}->?|x-{1,2}|o-{1,2}|-{1,2}[xo])/,
          "operator",
        ],
        [/(\|\||&|:{1,2}|\|)/, "operator"],

        // Node-shape & label brackets.
        [/[{}[\]()]/, "@brackets"],

        // Numbers (gantt durations, pie values, etc.).
        [/\d+/, "number"],

        // Punctuation.
        [/[;,.]/, "delimiter"],
      ],

      string: [
        [/[^"]+/, "string"],
        [/"/, { token: "string.quote", next: "@pop" }],
      ],

      directive: [
        [/[^}]+/, "attribute.value"],
        [/\}/, { token: "delimiter.curly", next: "@pop" }],
      ],
    },
  });
}
