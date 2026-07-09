import { DiagramRegistry } from "./registry";

export type DiagramCapability = "two-way" | "code-only";

export interface DiagramCatalogItem {
  id: string;
  label: string;
  description: string;
  capability: DiagramCapability;
  defaultCode: string;
  group: "scratch" | "template" | "code-only";
}

export interface DiagramTemplate {
  id: string;
  type: string;
  name: string;
  description: string;
  code: string;
}

const REGISTRY_TYPES = Object.values(DiagramRegistry).map((plugin) => ({
  id: plugin.id,
  label: plugin.label,
  defaultCode: plugin.defaultCode,
}));

const TWO_WAY_TYPES = new Set(REGISTRY_TYPES.map((item) => item.id));

export const DIAGRAM_CATALOG: DiagramCatalogItem[] = [
  {
    id: "blank",
    label: "Blank",
    description: "Start with an empty document and choose the Mermaid syntax later.",
    capability: "code-only",
    defaultCode: "",
    group: "scratch",
  },
  ...REGISTRY_TYPES.map(
    (item): DiagramCatalogItem => ({
      ...item,
      description:
        item.id === "flowchart"
          ? "Build node-and-edge flows with visual editing support."
          : item.id === "sequence"
            ? "Describe interactions between participants over time."
            : item.id === "classDiagram"
              ? "Model classes, members, and relationships."
              : item.id === "erDiagram"
                ? "Sketch entities, attributes, and relationships."
                : item.id === "stateDiagram"
                  ? "Represent states, transitions, and composite states."
                  : "Create a hierarchical mindmap from Mermaid text.",
      capability: TWO_WAY_TYPES.has(item.id) ? "two-way" : "code-only",
      group: "template",
    }),
  ),
  {
    id: "gantt",
    label: "Gantt Chart",
    description: "Plan tasks across a dated project timeline.",
    capability: "code-only",
    defaultCode: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Planning
        Discovery      :a1, 2026-01-01, 5d
        Implementation :after a1, 10d`,
    group: "code-only",
  },
  {
    id: "pie",
    label: "Pie Chart",
    description: "Compare positive numeric values as slices.",
    capability: "code-only",
    defaultCode: `pie title Diagram Types
    "Flowcharts" : 45
    "Sequences" : 30
    "Other" : 25`,
    group: "code-only",
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Show chronological events by period or section.",
    capability: "code-only",
    defaultCode: `timeline
    title Product Milestones
    2026 Q1 : Research
    2026 Q2 : Build
    2026 Q3 : Launch`,
    group: "code-only",
  },
  {
    id: "journey",
    label: "User Journey",
    description: "Map user tasks with satisfaction scores and actors.",
    capability: "code-only",
    defaultCode: `journey
    title New user onboarding
    section Discover
      Find product: 4: User
      Read docs: 3: User
    section Adopt
      Create first diagram: 5: User`,
    group: "code-only",
  },
  {
    id: "gitGraph",
    label: "Git Graph",
    description: "Visualize commits, branches, checkouts, and merges.",
    capability: "code-only",
    defaultCode: `gitGraph
   commit id: "init"
   branch feature
   checkout feature
   commit id: "work"
   checkout main
   merge feature`,
    group: "code-only",
  },
  {
    id: "requirementDiagram",
    label: "Requirement Diagram",
    description: "Connect requirements to elements using SysML-style relationships.",
    capability: "code-only",
    defaultCode: `requirementDiagram

requirement req_login {
    id: 1
    text: Users can sign in securely.
    risk: high
    verifymethod: test
}

element auth_service {
    type: service
}

auth_service - satisfies -> req_login`,
    group: "code-only",
  },
  {
    id: "C4Context",
    label: "C4 Context",
    description: "Document people, systems, and relationships at system-context level.",
    capability: "code-only",
    defaultCode: `C4Context
  title System Context
  Person(user, "User", "Creates diagrams")
  System(livemaid, "LiveMaid", "Mermaid diagram workspace")
  Rel(user, livemaid, "Creates and edits diagrams")`,
    group: "code-only",
  },
];

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = DIAGRAM_CATALOG.filter(
  (item) => item.group === "template",
).map((item) => ({
  id: `${item.id}-starter`,
  type: item.id,
  name: `${item.label} starter`,
  description: item.description,
  code: item.defaultCode,
}));

export function getDiagramCatalogItem(type: string | null | undefined): DiagramCatalogItem {
  return DIAGRAM_CATALOG.find((item) => item.id === type) ?? DIAGRAM_CATALOG[0];
}

export function getDiagramTemplate(templateId: string | null | undefined): DiagramTemplate | null {
  return DIAGRAM_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function getDiagramCapability(type: string | null | undefined): DiagramCapability {
  return getDiagramCatalogItem(type).capability;
}

export function isCreatableDiagramType(type: string): boolean {
  return DIAGRAM_CATALOG.some((item) => item.id === type);
}
