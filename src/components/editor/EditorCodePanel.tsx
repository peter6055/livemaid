import Editor, { type OnMount, type BeforeMount, type Monaco } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef } from "react";
import { registerMermaidLanguage } from "@/lib/diagrams/mermaidMonarch";
import { Copy, AlignLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MonacoStandaloneEditor = Parameters<OnMount>[0];

interface EditorCodePanelProps {
  code: string;
  handleCodeChange: (value: string | undefined) => void;
  handleEditorDidMount: OnMount;
  parseError: string | null;
  /** 0-indexed inclusive source-line range to highlight (canvas selection), or null. */
  highlightRange?: { startLine: number; endLine: number } | null;
}

export function EditorCodePanel({
  code,
  handleCodeChange,
  handleEditorDidMount,
  parseError,
  highlightRange = null,
}: EditorCodePanelProps) {
  // `resolvedTheme` (NOT `theme`): with `defaultTheme="system"` + `enableSystem`, `theme` is the
  // literal setting ("system") on a fresh load, so `theme === "dark"` is false even when the OS is
  // dark — which left the Monaco editor stuck on the light theme. `resolvedTheme` collapses
  // "system" down to the concrete "dark"/"light" actually in effect.
  const { resolvedTheme } = useTheme();

  const editorRef = useRef<MonacoStandaloneEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<ReturnType<
    MonacoStandaloneEditor["createDecorationsCollection"]
  > | null>(null);

  // Apply (or clear) the canvas-selection line highlight and scroll it into view.
  const applyHighlight = useCallback((range: { startLine: number; endLine: number } | null) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    if (!decorationsRef.current) {
      decorationsRef.current = editor.createDecorationsCollection();
    }
    if (!range) {
      decorationsRef.current.clear();
      return;
    }
    // Monaco line numbers are 1-indexed; our ranges are 0-indexed.
    const startLine = range.startLine + 1;
    const endLine = range.endLine + 1;
    decorationsRef.current.set([
      {
        range: new monaco.Range(startLine, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: "canvas-code-highlight-line",
          linesDecorationsClassName: "canvas-code-highlight-gutter",
        },
      },
    ]);
    editor.revealLineInCenter(startLine);
  }, []);

  // Register the custom Mermaid syntax highlighting before the editor mounts.
  const handleBeforeMount: BeforeMount = (monaco) => {
    registerMermaidLanguage(monaco);
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    handleEditorDidMount(editor, monaco);
    // Apply any highlight that was already pending before the editor mounted.
    applyHighlight(highlightRange);
  };

  // Re-apply whenever the selected element's line range changes (a null range
  // clears the decoration — AC 4.1.2).
  useEffect(() => {
    applyHighlight(highlightRange);
  }, [highlightRange, applyHighlight]);

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [code]);

  const handleFormat = useCallback(() => {
    const INDENT = "    ";
    const BLOCK_OPEN = new Set([
      "subgraph",
      "loop",
      "alt",
      "opt",
      "par",
      "critical",
      "break",
      "rect",
      "section",
    ]);
    const BLOCK_SAME = new Set(["else", "and", "option"]);
    const BLOCK_CLOSE = "end";

    const lines = code.split("\n");

    // Pass 1: trim trailing whitespace on every line.
    const trimmed = lines.map((l) => l.replace(/\s+$/, ""));

    // Pass 2: collapse consecutive blank lines.
    const collapsed: string[] = [];
    let prevBlank = false;
    for (const line of trimmed) {
      const isBlank = line.trim() === "";
      if (isBlank && prevBlank) continue;
      collapsed.push(line);
      prevBlank = isBlank;
    }
    while (collapsed.length > 0 && collapsed[0].trim() === "") collapsed.shift();
    while (collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === "") collapsed.pop();

    // Pass 3: re-indent based on block depth.
    let depth = 0;
    const reformatted: string[] = [];
    for (const rawLine of collapsed) {
      const stripped = rawLine.trim();
      if (stripped === "") {
        reformatted.push("");
        continue;
      }

      // Extract the first keyword (case-insensitive).
      const firstWord = stripped.split(/\s+/)[0].toLowerCase();

      // "end" closes a block — outdent BEFORE printing.
      if (firstWord === BLOCK_CLOSE) {
        depth = Math.max(0, depth - 1);
        reformatted.push(INDENT.repeat(depth) + stripped);
        continue;
      }

      // "else", "and", "option" are at the SAME level as their parent block.
      if (BLOCK_SAME.has(firstWord)) {
        reformatted.push(INDENT.repeat(Math.max(0, depth - 1)) + stripped);
        // Re-open the depth since the block continues after these keywords.
        continue;
      }

      // Normal line — print at current depth.
      reformatted.push(INDENT.repeat(depth) + stripped);

      // If this line opens a block, increase depth for subsequent lines.
      if (BLOCK_OPEN.has(firstWord)) {
        depth++;
      }
    }

    const formatted = reformatted.join("\n");
    if (formatted === code) {
      toast.info("Already formatted");
      return;
    }
    const editor = editorRef.current;
    if (editor) {
      const model = editor.getModel();
      if (model) {
        editor.pushUndoStop();
        editor.executeEdits("format", [
          { range: model.getFullModelRange(), text: formatted, forceMoveMarkers: true },
        ]);
      }
    }
    handleCodeChange(formatted);
    toast.success("Code formatted");
  }, [code, handleCodeChange]);

  return (
    <>
      <div className="h-10 border-b border-border bg-muted/50 flex items-center px-4 shrink-0 justify-between">
        <span className="text-xs font-mono text-foreground font-bold tracking-wide uppercase">
          Mermaid Code
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={handleFormat} title="Format code">
            <AlignLeft className="w-3 h-3" />
            <span>Format</span>
          </Button>
          <Button variant="ghost" size="xs" onClick={handleCopyAll} title="Copy all">
            <Copy className="w-3 h-3" />
            <span>Copy All</span>
          </Button>
        </div>
      </div>
      <div className="flex-grow relative flex flex-col min-h-0">
        <div className="flex-grow min-h-0 relative">
          <Editor
            height="100%"
            defaultLanguage="mermaid"
            theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
            value={code}
            onChange={(value) => handleCodeChange(value)}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
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
