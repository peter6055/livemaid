import { DiagramPlugin } from "./types";
import { FlowchartPlugin } from "./flowchart";
import { SequencePlugin } from "./sequence";
import { ClassDiagramPlugin } from "./classDiagram";
import { ErDiagramPlugin } from "./erDiagram";
import { StateDiagramPlugin } from "./stateDiagram";

export const DiagramRegistry: Record<string, DiagramPlugin> = {
  flowchart: FlowchartPlugin,
  sequence: SequencePlugin,
  classDiagram: ClassDiagramPlugin,
  erDiagram: ErDiagramPlugin,
  stateDiagram: StateDiagramPlugin,
};
