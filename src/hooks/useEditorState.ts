import { useState, useRef, useCallback, useEffect } from "react";
import { DiagramDocument } from "@/lib/api/storage";
import { toast } from "sonner";
import mermaid from "mermaid";
import { FONT_OPTIONS } from "@/lib/diagrams/constants";

const DEBOUNCE_MS = 1000;
const VALID_MERMAID_THEMES = new Set(['default', 'forest', 'dark', 'neutral', 'base', 'redux']);
const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function useEditorState(documentId: string) {
  const [doc, setDoc] = useState<DiagramDocument | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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
      flowchart: { htmlLabels: true },
    });
  }, []);

  const renderMermaid = useCallback(async (mermaidCode: string, onResetSelection?: () => void) => {
    try {
      setParseError(null);
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose', // allow clicks
        flowchart: { htmlLabels: true },
      });
      await mermaid.parse(mermaidCode, { suppressErrors: true });
      const id = `mermaid-svg-${Date.now()}`;
      renderIdRef.current = id;
      const { svg } = await mermaid.render(id, mermaidCode);
      const interactiveSvg = addInteractionHelpersToSvg(svg);
      setSvgContent(interactiveSvg);

      // Try to extract theme
      const match = mermaidCode.match(/theme:\s*(?:'|")?([^'"\s\n]+)/);
      if (match) {
        const parsedTheme = match[1].trim();
        setCurrentTheme(VALID_MERMAID_THEMES.has(parsedTheme) ? parsedTheme : 'default');
      } else {
        setCurrentTheme('default');
      }

      // Try to extract font. We parse the full value to support nested quotes like
      // fontFamily: '"Inter Variable", sans-serif'.
      const fontLineMatch = mermaidCode.match(/fontFamily:\s*([^\n\r]+)/);
      if (fontLineMatch) {
        let fontVal = fontLineMatch[1].trim();
        if ((fontVal.startsWith("'") && fontVal.endsWith("'")) || (fontVal.startsWith('"') && fontVal.endsWith('"'))) {
          fontVal = fontVal.slice(1, -1);
        }

        const normalizedFont = fontVal.replace(/["']/g, '').toLowerCase();
        const found = FONT_OPTIONS.find((f) => {
          const optionPrimary = f.value.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
          return normalizedFont.includes(optionPrimary);
        });

        setCurrentFont(found?.label || 'Default');
      } else {
        setCurrentFont('Default');
      }

      if (onResetSelection) {
        onResetSelection();
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Syntax Error");
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
        } else if (res.status === 404) {
          // The requested diagram does not exist — surface a dedicated not-found screen
          // instead of silently rendering an empty editor.
          setNotFound(true);
        } else {
          toast.error("Failed to load diagram");
        }
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime < 600) {
          await new Promise(resolve => setTimeout(resolve, 600 - elapsedTime));
        }
      } catch {
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

      const updatedDoc = await res.json();
      setDoc(updatedDoc);
    } catch {
      toast.error("Failed to auto-save");
    } finally {
      setSaving(false);
    }
  }, [documentId]);

  const handleCodeChange = useCallback((value: string | undefined, onResetSelection?: () => void) => {
    const newCode = value || "";
    setCode(newCode);

    renderMermaid(newCode, onResetSelection);

    if (IS_DEMO_MODE) return;

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
    notFound,
    saving, setSaving,
    svgContent, setSvgContent,
    currentTheme, setCurrentTheme,
    currentFont, setCurrentFont,
    parseError, setParseError,
    renderIdRef,
    handleCodeChange
  };
}

function addInteractionHelpersToSvg(svgString: string): string {
  if (typeof window === "undefined") return svgString;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");

    // Mermaid flowchart labels are often rendered in foreignObject HTML blocks.
    // In some browsers those inner HTML clicks do not bubble reliably to outer SVG
    // containers, so single-click selection never fires. Make labels transparent
    // to pointer events so clicks hit the underlying SVG node/edge geometry.
    const foreignObjects = doc.querySelectorAll("foreignObject");
    foreignObjects.forEach((fo) => {
      const existingStyle = fo.getAttribute("style") || "";
      fo.setAttribute("style", `${existingStyle};pointer-events:none !important;`);
      fo.setAttribute("pointer-events", "none");
      const descendants = fo.querySelectorAll("*");
      descendants.forEach((el) => {
        const childStyle = el.getAttribute("style") || "";
        el.setAttribute("style", `${childStyle};pointer-events:none !important;`);
      });
    });

    const paths = doc.querySelectorAll("path.flowchart-link, .edgePath path.path");
    paths.forEach((path) => {
      const clone = path.cloneNode(true) as SVGElement;

      clone.classList.add("flowchart-link-hit-target");
      if (path.id) {
        clone.id = `${path.id}-hit-target`;
      }

      clone.removeAttribute("stroke-dasharray");
      clone.setAttribute("stroke-width", "16px");
      clone.setAttribute("stroke", "transparent");
      clone.setAttribute("fill", "none");
      clone.setAttribute("opacity", "0.01");
      clone.setAttribute("style", "stroke-width: 16px !important; stroke: transparent !important; fill: none !important; opacity: 0.01 !important; cursor: pointer !important; pointer-events: stroke !important;");

      if (path.parentNode) {
        path.parentNode.insertBefore(clone, path);
      }
    });

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (error) {
    console.error("Failed to add SVG interaction helpers:", error);
    return svgString;
  }
}
