import { DiagramPlugin } from "./types";
import { FlowchartPlugin } from "./flowchart";
import { SequencePlugin } from "./sequence";
import { ClassDiagramPlugin } from "./classDiagram";

export const DiagramRegistry: Record<string, DiagramPlugin> = {
  flowchart: FlowchartPlugin,
  sequence: SequencePlugin,
  classDiagram: ClassDiagramPlugin,
};
