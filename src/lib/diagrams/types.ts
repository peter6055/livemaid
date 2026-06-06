/**
 * Minimal structural type for the Monaco editor instance we hold in a ref.
 * We only ever call `trigger(...)` on it (undo/redo). Monaco's real
 * `IStandaloneCodeEditor` is structurally assignable to this.
 */
export interface MonacoCodeEditor {
  trigger(source: string | null | undefined, handlerId: string, payload: unknown): void;
}

export interface EditorContext {
  code: string;
  setCode: (code: string) => void;
  editorRef: React.MutableRefObject<MonacoCodeEditor | null>;
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
