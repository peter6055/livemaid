/**
 * Given a target node's bounding box (shell-relative `cx`/`cy`/`w`/`h`) and a cursor point (also
 * shell-relative), return the nearest perimeter "anchor" — the midpoint of whichever edge
 * (Top / Bottom / Left / Right) is closest to the cursor. Used purely as a VISUAL docking
 * affordance for connect-drag previews: the dashed preview line snaps its endpoint to this anchor
 * and a dot is drawn there. It never affects serialization — drops always resolve to the target
 * node identity (`source --> target`), since Mermaid owns all edge layout and has no anchor-side
 * syntax.
 */
export function nearestPerimeterAnchor(
  box: { cx: number; cy: number; w: number; h: number },
  cursorX: number,
  cursorY: number,
): { x: number; y: number } {
  const left = box.cx;
  const right = box.cx + box.w;
  const top = box.cy;
  const bottom = box.cy + box.h;
  const midX = box.cx + box.w / 2;
  const midY = box.cy + box.h / 2;
  const anchors = [
    { x: midX, y: top }, // Top
    { x: midX, y: bottom }, // Bottom
    { x: left, y: midY }, // Left
    { x: right, y: midY }, // Right
  ];
  let best = anchors[0];
  let bestDist = Infinity;
  for (const a of anchors) {
    const dx = a.x - cursorX;
    const dy = a.y - cursorY;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

export function shellBoxFromRect(
  rect: DOMRect,
  shellRect: DOMRect,
): { cx: number; cy: number; w: number; h: number } {
  return {
    cx: rect.left - shellRect.left,
    cy: rect.top - shellRect.top,
    w: rect.width,
    h: rect.height,
  };
}

export function shellBoxFromElement(
  el: Element | null,
  shellRect: DOMRect,
): { cx: number; cy: number; w: number; h: number } | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return shellBoxFromRect(rect, shellRect);
}
