"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Renders Mermaid SVG HTML without React re-applying innerHTML on unrelated parent
 * re-renders. `dangerouslySetInnerHTML` can replace the SVG subtree whenever the
 * parent re-renders (e.g. selection/hover overlays), wiping DOM mutations such as
 * sequence-message hover classes. This component only writes innerHTML when `html`
 * actually changes.
 */
export function StableMermaidHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (lastHtmlRef.current === html) return;
    lastHtmlRef.current = html;
    el.innerHTML = html;
  }, [html]);

  return <div ref={ref} className={className} />;
}
