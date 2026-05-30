import { useState, useRef, useCallback, useEffect } from "react";
import { DiagramDocument } from "@/lib/api/storage";
import { toast } from "sonner";
import mermaid from "mermaid";
import { FONT_OPTIONS } from "@/lib/diagrams/constants";

const DEBOUNCE_MS = 1000;

export function useEditorState(documentId: string) {
  const [doc, setDoc] = useState<DiagramDocument | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [svgContent, setSvgContent] = useState<string>("");
  const [currentTheme, setCurrentTheme] = useState('default');
  const [currentFont, setCurrentFont] = useState('Default');
  const [parseError, setParseError] = useState<string | null>(null);
  
  const renderIdRef = useRef<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose', // allow clicks
      flowchart: { htmlLabels: false },
    });
  }, []);

  const renderMermaid = useCallback(async (mermaidCode: string, onResetSelection?: () => void) => {
    try {
      setParseError(null);
      await mermaid.parse(mermaidCode, { suppressErrors: true });
      const id = `mermaid-svg-${Date.now()}`;
      renderIdRef.current = id;
      const { svg } = await mermaid.render(id, mermaidCode);
      setSvgContent(svg);
      
      // Try to extract theme
      const match = mermaidCode.match(/theme:\s*(?:'|")?([^'"\s\n]+)/);
      if (match) {
          setCurrentTheme(match[1]);
      } else {
          setCurrentTheme('default');
      }

      // Try to extract font
      const fontMatch = mermaidCode.match(/fontFamily:\s*(?:'|")?([^'"\n]+)/);
      if (fontMatch) {
          const fontVal = fontMatch[1].trim();
          // Find the label by checking if the value in config contains the first part of our option
          const found = FONT_OPTIONS.find(f => f.value.includes(fontVal.split(',')[0].replace(/["']/g, '')));
          if (found) {
              setCurrentFont(found.label);
          } else {
              setCurrentFont('Default');
          }
      } else {
          setCurrentFont('Default');
      }
      
      if (onResetSelection) {
        onResetSelection();
      }
    } catch (e: any) {
      setParseError(e?.message || "Syntax Error");
    }
  }, []);

  // Fetch Initial Data
  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const startTime = Date.now();
        const res = await fetch(`/api/diagrams/${documentId}`);
        if (res.ok) {
          const data = await res.json();
          setDoc(data);
          setCode(data.code);
          renderMermaid(data.code);
        }
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 600) {
            await new Promise(resolve => setTimeout(resolve, 600 - elapsedTime));
        }
      } catch (error) {
        toast.error("Failed to load diagram");
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [documentId, renderMermaid]);

  // Auto-Save Logic
  const saveCode = useCallback(async (newCode: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/diagrams/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (error) {
      toast.error("Failed to auto-save");
    } finally {
      setSaving(false);
    }
  }, [documentId]);

  const handleCodeChange = useCallback((value: string | undefined, onResetSelection?: () => void) => {
    const newCode = value || "";
    setCode(newCode);

    renderMermaid(newCode, onResetSelection);

    // Trigger auto-save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveCode(newCode);
    }, DEBOUNCE_MS);
  }, [renderMermaid, saveCode]);

  return {
    doc, setDoc,
    code, setCode,
    loading, setLoading,
    saving, setSaving,
    svgContent, setSvgContent,
    currentTheme, setCurrentTheme,
    currentFont, setCurrentFont,
    parseError, setParseError,
    renderIdRef,
    handleCodeChange
  };
}
