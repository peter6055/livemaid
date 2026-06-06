import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { registerMermaidLanguage } from "@/lib/diagrams/mermaidMonarch";

interface EditorCodePanelProps {
  code: string;
  handleCodeChange: (value: string | undefined) => void;
  handleEditorDidMount: OnMount;
  parseError: string | null;
}

export function EditorCodePanel({
  code,
  handleCodeChange,
  handleEditorDidMount,
  parseError,
}: EditorCodePanelProps) {
  const { theme } = useTheme();

  // Register the custom Mermaid syntax highlighting before the editor mounts.
  const handleBeforeMount: BeforeMount = (monaco) => {
    registerMermaidLanguage(monaco);
  };

  return (
    <>
      <div className="h-10 border-b border-border bg-muted/50 flex items-center px-4 shrink-0 justify-between">
        <span className="text-xs font-mono text-foreground font-bold tracking-wide uppercase">
          Mermaid Code
        </span>
      </div>
      <div className="flex-grow relative flex flex-col min-h-0">
        <div className="flex-grow min-h-0 relative">
          <Editor
            height="100%"
            defaultLanguage="mermaid"
            theme={theme === "dark" ? "vs-dark" : "light"}
            value={code}
            onChange={(value) => handleCodeChange(value)}
            beforeMount={handleBeforeMount}
            onMount={handleEditorDidMount}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "off",
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 40 },
            }}
          />
        </div>
        {parseError && (
          <div className="flex-shrink-0 relative z-10 bg-red-50 text-red-600 p-4 text-[13px] leading-relaxed font-mono border-t border-red-200 max-h-[50%] overflow-y-auto whitespace-pre-wrap shadow-[0_-8px_20px_-5px_rgba(0,0,0,0.1)]">
            <span className="font-bold text-base mb-2 block sticky top-0 bg-red-50 py-1">
              Syntax Error
            </span>
            {parseError}
          </div>
        )}
      </div>
    </>
  );
}
