import { ReactNode } from "react";

export interface EditorContext {
  code: string;
  setCode: (code: string) => void;
  editorRef: React.MutableRefObject<any>;
  theme?: string;
  direction?: string;
  handleThemeChange?: (theme: string) => void;
  handleDirectionChange?: (dir: string) => void;
  selectedNodeId?: string | null;
}

export interface DiagramPlugin {
  id: string;
  label: string;
  defaultCode: string;
  ToolbarComponent: React.FC<EditorContext>;
}
