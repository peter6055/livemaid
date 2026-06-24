import { getTelemetry } from "@/lib/telemetry";
import { useEffect, useState } from "react";
import mermaid from "mermaid";
import { ensureMermaidInitialized } from "@/lib/mermaid-client";

const svgCache = new Map<string, string>();
const MAX_CACHE = 200;

function codeHash(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = ((hash << 5) - hash + code.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export function clearMermaidCache() {
  svgCache.clear();
}

export function useMermaidPreview(code: string | undefined, id: string) {
  const [svg, setSvg] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setSvg("");
      setError(null);
      return;
    }

    const cacheKey = `${id}_${codeHash(code)}`;
    const cached = svgCache.get(cacheKey);
    if (cached) {
      setSvg(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const render = async () => {
      setLoading(true);
      setError(null);
      try {
        await ensureMermaidInitialized();
        await mermaid.parse(code, { suppressErrors: true });
        const { svg: renderedSvg } = await mermaid.render(`preview-${id}`, code);
        if (svgCache.size >= MAX_CACHE) {
          const firstKey = svgCache.keys().next().value;
          if (firstKey !== undefined) svgCache.delete(firstKey);
        }
        svgCache.set(cacheKey, renderedSvg);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSvg("");
          setError(e instanceof Error && e.message.trim() ? e.message : "Syntax error");
          getTelemetry()?.addBreadcrumb({
            category: "preview",
            message: "Preview render failed",
            level: "error",
            data: { id },
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  return { svg, loading, error };
}
