"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Renders Mermaid SVG HTML without React re-applying innerHTML on unrelated parent
 * re-renders. `dangerouslySetInnerHTML` can replace the SVG subtree whenever the
 * parent re-renders (e.g. selection/hover overlays), wiping DOM mutations such as
 * sequence-message hover classes. This component only writes innerHTML when `html`
 * actually changes.
 */

/** Diagram-title text elements that are double-click-to-edit on the canvas. */
const TITLE_TEXT_SELECTOR =
  "text.classDiagramTitleText, text.erDiagramTitleText, text.statediagramTitleText, text.timelineDiagramTitleText";

const HIT_TARGET_ATTR = "data-title-hit-target";

/**
 * The title `<text>` hit-tests only its glyph fills, so hovering the gaps around
 * the title shows the canvas grab cursor and double-click misses. Insert an
 * invisible padded `<rect>` behind each title that carries the same title class:
 * the dblclick routers match it, and CSS gives it the pointer cursor. Works in
 * every browser (unlike SVG2 `pointer-events: bounding-box`).
 */
function addTitleHitTargets(root: HTMLElement) {
  root.querySelectorAll(TITLE_TEXT_SELECTOR).forEach((text) => {
    const parent = text.parentNode;
    if (!parent || text.previousElementSibling?.hasAttribute(HIT_TARGET_ATTR)) return;
    let box: DOMRect;
    try {
      box = (text as SVGTextElement).getBBox();
    } catch {
      return; // Not laid out yet — next render retries.
    }
    const pad = 10;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute(HIT_TARGET_ATTR, "");
    // Carry the title class so the class/ER/timeline dblclick routers recognize it.
    rect.setAttribute("class", text.getAttribute("class") ?? "");
    rect.setAttribute("x", String(box.x - pad));
    rect.setAttribute("y", String(box.y - pad));
    rect.setAttribute("width", String(box.width + pad * 2));
    rect.setAttribute("height", String(box.height + pad * 2));
    rect.setAttribute("fill", "transparent");
    rect.setAttribute("stroke", "none");
    rect.setAttribute("pointer-events", "all");
    parent.insertBefore(rect, text);
  });
}

export function StableMermaidHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (lastHtmlRef.current === html) return;
    lastHtmlRef.current = html;
    el.innerHTML = html;
    addTitleHitTargets(el);
  }, [html]);

  return <div ref={ref} className={className} />;
}
