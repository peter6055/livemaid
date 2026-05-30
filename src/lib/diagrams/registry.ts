import { DiagramPlugin } from "./types";
import { FlowchartPlugin } from "./flowchart";
import { SequencePlugin } from "./sequence";

export const DiagramRegistry: Record<string, DiagramPlugin> = {
  flowchart: FlowchartPlugin,
  sequence: SequencePlugin,
};
