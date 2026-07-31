import { DiagramPlugin } from "./types";
import { SequenceToolbar } from "@/components/editor/SequenceToolbar";

// The plugin module itself is imported server-side (registry → catalog → /api/diagrams), so it
// must not carry client-only directives or hooks. The stateful toolbar (and the shared participant
// icon/type helpers it uses) live in the client component module below.
export { ParticipantIcon, PARTICIPANT_TYPES } from "@/components/editor/SequenceToolbar";

export const SequencePlugin: DiagramPlugin = {
  id: "sequence",
  label: "Sequence Diagram",
  defaultCode: `sequenceDiagram\n    participant A as Alice\n    participant B as Bob\n    A->>B: Hello Bob, how are you?\n    B-->>A: Great!`,
  ToolbarComponent: SequenceToolbar,
};
