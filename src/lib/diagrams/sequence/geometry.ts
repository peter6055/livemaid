/**
 * Pure sequence diagram geometry: message visual model, trigger areas, block
 * types/parsers, and line/label resolution. No React / no "use client".
 */

// Padding (canvas units) added around a sequence message's raw line+label bounds to
// produce the unified hover/selection border box. The hover box and the selection box
// MUST both use this exact value so they stay pixel-identical (one single border box).
export const SEQ_MSG_SELECTION_PADDING = { x: 0, y: 1 };
// Padding (canvas units) for the clickable/hoverable hit-test band. Kept SMALLER than the
// visible box padding (especially vertically) so the interactive area is tighter than the
// drawn box, preventing accidental clicks on adjacent message rows.
const SEQ_MSG_HITTEST_PADDING = { x: 0, y: 1 };

export function unionClientRects(elements: SVGElement[]): DOMRect | null {
  if (elements.length === 0) return null;
  const rects = elements.map((el) => el.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

// Mermaid renders multi-line sequence messages using a <switch> element containing both
// a visible <foreignObject class="messageText"> and multiple invisible <text class="messageText">
// elements (one per line via byTspan fallback). querySelectorAll(".messageText") returns ALL of
// them, breaking the 1:1 message-to-element mapping. This helper filters to only visible elements
// (non-zero bounding rect), restoring the correct count.
export function getVisibleSequenceMessageTexts(container: HTMLElement): SVGElement[] {
  const allTexts = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
  return allTexts.filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

export interface SequenceMessageVisual {
  index: number;
  sourceLineIndex: number;
  lineEl: SVGElement | null;
  labelEls: SVGElement[];
  lineRect: DOMRect | null;
  labelRect: DOMRect | null;
  selectionBox: { x: number; y: number; width: number; height: number };
  textBox: { x: number; y: number; width: number; height: number } | null;
  hitBox: { x: number; y: number; width: number; height: number };
}

function getSequenceMessageLabelRoots(container: HTMLElement): SVGElement[] {
  const candidates = Array.from(container.querySelectorAll(".messageText")) as SVGElement[];
  const roots = new Set<SVGElement>();

  for (const el of candidates) {
    const foreignObject = el.closest("foreignObject.messageText") as SVGElement | null;
    if (foreignObject) {
      const rect = foreignObject.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        roots.add(foreignObject);
      }
      continue;
    }

    const textEl = el.closest("text.messageText") as SVGElement | null;
    if (textEl) {
      const rect = textEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        roots.add(textEl);
      }
    }
  }

  return [...roots];
}

export function findOwningLineForSequenceLabel(
  labelEl: SVGElement,
  lineEls: SVGElement[],
): SVGElement | null {
  if (lineEls.length === 0) return null;
  const labelRect = labelEl.getBoundingClientRect();
  const labelCenterX = labelRect.left + labelRect.width / 2;
  const labelTop = labelRect.top;

  const belowCandidates = lineEls
    .map((lineEl) => {
      const rect = lineEl.getBoundingClientRect();
      const lineCenterY = rect.top + rect.height / 2;

      const horizontalGap =
        labelCenterX < rect.left
          ? rect.left - labelCenterX
          : labelCenterX > rect.right
            ? labelCenterX - rect.right
            : 0;

      return {
        lineEl,
        lineCenterY,
        horizontalGap,
      };
    })
    .filter((item) => item.lineCenterY >= labelTop - 2)
    .sort((a, b) => a.lineCenterY - b.lineCenterY || a.horizontalGap - b.horizontalGap);

  if (belowCandidates[0]) return belowCandidates[0].lineEl;

  // Fallback for multi-line byTspan rows that sit slightly below their own arrow line:
  // the filter above excludes that arrow (lineCenterY < labelTop), so score all lines.
  const textX = labelRect.left + labelRect.width / 2;
  const textY = labelRect.top + labelRect.height / 2;
  let nearest = lineEls[0];
  let best = Number.POSITIVE_INFINITY;
  for (const lineEl of lineEls) {
    const lineRect = lineEl.getBoundingClientRect();
    const lineY = lineRect.top + lineRect.height / 2;
    const dx =
      textX < lineRect.left
        ? lineRect.left - textX
        : textX > lineRect.right
          ? textX - lineRect.right
          : 0;
    const dy = Math.abs(lineY - textY);
    const underPenalty = lineY < textY ? 15 : 0;
    const score = dy * 3 + dx + underPenalty;
    if (score < best) {
      best = score;
      nearest = lineEl;
    }
  }
  return nearest;
}

export function findSequenceMessageVisualAtClientPoint(
  clientX: number,
  clientY: number,
  container: HTMLElement,
  code: string,
  getSequenceMessageEntries: (sourceCode: string) => Array<{ index: number; line: string }>,
  existingVisuals?: SequenceMessageVisual[],
): SequenceMessageVisual | null {
  const rect = container.getBoundingClientRect();
  const scale = rect.width / container.offsetWidth;

  const canvasX = (clientX - rect.left + container.scrollLeft) / scale;
  const canvasY = (clientY - rect.top + container.scrollTop) / scale;

  const visuals =
    existingVisuals ??
    buildSequenceMessageVisualModel(
      container,
      code,
      getSequenceMessageEntries,
      findOwningLineForSequenceLabel,
    );

  return (
    visuals.find((v) => {
      const b = v.hitBox;
      return (
        canvasX >= b.x && canvasX <= b.x + b.width && canvasY >= b.y && canvasY <= b.y + b.height
      );
    }) ?? null
  );
}

export function buildSequenceMessageVisualModel(
  container: HTMLElement,
  code: string,
  getSequenceMessageEntries: (sourceCode: string) => Array<{ index: number; line: string }>,
  findOwningLine: (labelEl: SVGElement, lineEls: SVGElement[]) => SVGElement | null,
): SequenceMessageVisual[] {
  const entries = getSequenceMessageEntries(code);
  if (entries.length === 0) return [];

  const messageLineEls = Array.from(
    container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
  ) as SVGElement[];

  const labelRoots = getSequenceMessageLabelRoots(container);
  const visibleTexts = getVisibleSequenceMessageTexts(container);

  const containerRect = container.getBoundingClientRect();
  const scale = containerRect.width / container.offsetWidth;
  const toCanvasX = (vx: number) => (vx - containerRect.left + container.scrollLeft) / scale;
  const toCanvasY = (vy: number) => (vy - containerRect.top + container.scrollTop) / scale;
  const toCanvasRect = (r: DOMRect | null) =>
    r
      ? {
          x: toCanvasX(r.left),
          y: toCanvasY(r.top),
          width: r.width / scale,
          height: r.height / scale,
        }
      : null;

  const visuals: SequenceMessageVisual[] = [];

  for (let i = 0; i < messageLineEls.length && i < entries.length; i += 1) {
    const lineEl = messageLineEls[i];
    const entry = entries[i];
    const lineRect = lineEl.getBoundingClientRect();

    const labelEls = [
      ...new Set([
        ...labelRoots.filter((labelEl) => findOwningLine(labelEl, messageLineEls) === lineEl),
        ...visibleTexts.filter((labelEl) => findOwningLine(labelEl, messageLineEls) === lineEl),
      ]),
    ];

    const labelRect = labelEls.length > 0 ? unionClientRects(labelEls) : null;

    const srcLineRect = lineRect ? toCanvasRect(lineRect)! : null;
    const srcLabelRect = labelRect ? toCanvasRect(labelRect) : null;

    const selectionPaddingX = SEQ_MSG_SELECTION_PADDING.x;
    const selectionPaddingY = SEQ_MSG_SELECTION_PADDING.y;

    const selLeft = Math.min(
      srcLineRect?.x ?? Number.POSITIVE_INFINITY,
      srcLabelRect?.x ?? Number.POSITIVE_INFINITY,
    );
    const selTop = Math.min(
      srcLineRect?.y ?? Number.POSITIVE_INFINITY,
      srcLabelRect?.y ?? Number.POSITIVE_INFINITY,
    );
    const selRight = Math.max(
      (srcLineRect?.x ?? Number.NEGATIVE_INFINITY) + (srcLineRect?.width ?? 0),
      (srcLabelRect?.x ?? Number.NEGATIVE_INFINITY) + (srcLabelRect?.width ?? 0),
    );
    const selBottom = Math.max(
      (srcLineRect?.y ?? Number.NEGATIVE_INFINITY) + (srcLineRect?.height ?? 0),
      (srcLabelRect?.y ?? Number.NEGATIVE_INFINITY) + (srcLabelRect?.height ?? 0),
    );

    const selectionBox = {
      x: selLeft - selectionPaddingX,
      y: selTop - selectionPaddingY,
      width: Math.max(0, selRight - selLeft + selectionPaddingX * 2),
      height: Math.max(0, selBottom - selTop + selectionPaddingY * 2),
    };

    const textBox = srcLabelRect ? { ...srcLabelRect } : null;

    const hitPaddingX = SEQ_MSG_HITTEST_PADDING.x;
    const hitPaddingY = SEQ_MSG_HITTEST_PADDING.y;
    const hitBox = {
      x: selLeft - hitPaddingX,
      y: selTop - hitPaddingY,
      width: Math.max(0, selRight - selLeft + hitPaddingX * 2),
      height: Math.max(0, selBottom - selTop + hitPaddingY * 2),
    };

    visuals.push({
      index: i,
      sourceLineIndex: entry.index,
      lineEl,
      labelEls,
      lineRect,
      labelRect,
      selectionBox,
      textBox,
      hitBox,
    });
  }

  return visuals;
}

export function buildSequenceMessageTriggerAreas(
  visuals: SequenceMessageVisual[],
  padding: { x: number; y: number },
): Array<{ index: number; x: number; y: number; width: number; height: number }> {
  const expanded = visuals.map((v) => {
    const base = v.hitBox;
    return {
      index: v.index,
      x: base.x - padding.x,
      y: base.y - padding.y,
      width: Math.max(0, base.width + padding.x * 2),
      height: Math.max(0, base.height + padding.y * 2),
    };
  });

  const sorted = [...expanded].sort((a, b) => {
    const aCenter = a.y + a.height / 2;
    const bCenter = b.y + b.height / 2;
    return aCenter - bCenter || a.index - b.index;
  });

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const currentBottom = current.y + current.height;
    if (currentBottom <= next.y) continue;

    const currentCenter = current.y + current.height / 2;
    const nextCenter = next.y + next.height / 2;
    const boundary = (currentCenter + nextCenter) / 2;
    const clampedBoundary = Math.min(Math.max(boundary, current.y), next.y + next.height);

    current.height = Math.max(0, clampedBoundary - current.y);
    const nextBottom = next.y + next.height;
    next.y = clampedBoundary;
    next.height = Math.max(0, nextBottom - next.y);
  }

  return expanded;
}

// A parsed sequence block fragment (loop/alt/opt/par/critical/break) or `rect` highlight, with its
// source-line range, nesting depth, internal section dividers, and computed canvas geometry.
export type SequenceBlockType = "loop" | "alt" | "opt" | "par" | "critical" | "break" | "rect";
export interface SequenceBlockEntry {
  id: string;
  type: SequenceBlockType;
  isHighlight: boolean; // true for `rect`
  label: string; // the text after the keyword (e.g. "Condition", "rgb(...)")
  startLine: number; // source line index of the opener keyword
  endLine: number; // source line index of the matching `end`
  depth: number; // nesting depth (0 = outermost)
  sections: Array<{ keyword: string; line: number }>; // opener + else/and/option dividers
}
export interface SequenceBlockArea extends SequenceBlockEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isSequenceMessageLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("%%")) return false;
  const keywords = [
    "sequenceDiagram",
    "Note",
    "note",
    "rect",
    "alt",
    "opt",
    "loop",
    "par",
    "critical",
    "option",
    "else",
    "end",
    "participant",
    "actor",
    "autonumber",
    "activate",
    "deactivate",
    "box",
    "links",
    "link",
    "properties",
    "details",
  ];
  if (keywords.some((kw) => trimmed === kw || trimmed.startsWith(kw + " "))) return false;
  return trimmed.includes(":");
}

export function getSequenceMessageEntries(
  sourceCode: string,
): Array<{ index: number; line: string }> {
  const lines = sourceCode.split("\n");
  const entries: Array<{ index: number; line: string }> = [];
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    if (isSequenceMessageLine(lines[i])) {
      entries.push({ index: i, line: lines[i] });
    }
  }

  return entries;
}

// Parse the code into a flat list of block fragments (loop/alt/opt/par/critical/break/rect),
// each with its source-line range, nesting depth, and internal section dividers. Stack-based so
// nested blocks resolve correctly; `depth` reflects how many enclosing blocks each one sits in.
// A deterministic `id` (`SEQ_BLOCK_<startLine>`) keys selection + geometry across re-renders.

export function getSequenceBlockEntries(sourceCode: string): SequenceBlockEntry[] {
  const lines = sourceCode.split("\n");
  const openerRe = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i;
  const sectionRe = /^(else|and|option)\b/i;
  const closerRe = /^end\b/i;

  const stack: SequenceBlockEntry[] = [];
  const out: SequenceBlockEntry[] = [];
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter || !trimmed || trimmed.startsWith("%%")) continue;

    const opener = trimmed.match(openerRe);
    if (opener) {
      const type = opener[1].toLowerCase() as SequenceBlockType;
      stack.push({
        id: `SEQ_BLOCK_${i}`,
        type,
        isHighlight: type === "rect",
        label: (opener[2] || "").trim(),
        startLine: i,
        endLine: i,
        depth: stack.length,
        sections: [{ keyword: type, line: i }],
      });
      continue;
    }
    if (sectionRe.test(trimmed) && stack.length > 0) {
      stack[stack.length - 1].sections.push({
        keyword: trimmed.split(/\s+/)[0].toLowerCase(),
        line: i,
      });
      continue;
    }
    if (closerRe.test(trimmed) && stack.length > 0) {
      const blk = stack.pop()!;
      blk.endLine = i;
      out.push(blk);
    }
  }

  // Stable order: outermost first, then by start line (matches DOM paint order for overlays).
  return out.sort((a, b) => a.depth - b.depth || a.startLine - b.startLine);
}

export function parseSequenceMessageActors(line: string): { from: string; to: string } | null {
  // Match all Mermaid sequence message operators (longest-first to avoid prefix conflicts):
  // bidirectional, dotted/solid filled-arrow, cross, and async-open variants. The sender group
  // is LAZY (`\S+?`): a greedy `\S+` would swallow the first dash of a double-dash operator
  // (e.g. `B-->>A` parses as sender `B-` + op `-->>`), so lazy matching is required to keep the
  // sender id intact for dotted/cross messages.
  const match = line
    .trim()
    .match(/^(\S+?)\s*(?:<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)\s*(\S+)\s*:/);
  if (!match) return null;
  return {
    from: match[1],
    to: match[2],
  };
}
