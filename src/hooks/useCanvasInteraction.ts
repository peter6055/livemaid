import { useState, useCallback, useRef, MutableRefObject, useEffect } from "react";
import { isEdgeId, parseEdgeId, CONNECTOR_PATTERN } from "@/lib/diagrams/utils";


export function useCanvasInteraction({ 
    code, 
    svgContent,
    renderIdRef, 
    containerRef, 
    isLocked,
    handleCodeChange,
    determineDiagramType
}: { 
    code: string;
    svgContent?: string;
    renderIdRef: MutableRefObject<string | null>;
    containerRef: MutableRefObject<HTMLDivElement | null>;
    isLocked: boolean;
    handleCodeChange: (code: string) => void;
    determineDiagramType: (code: string) => string;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  // Keep ref in sync with state
  const setSelectedNodeIdWithRef = useCallback((id: string | null) => {
    selectedNodeIdRef.current = id;
    setSelectedNodeId(id);
  }, []);
  const [selectedSvgId, setSelectedSvgId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [textBox, setTextBox] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [shapePicker, setShapePicker] = useState<{ x: number, y: number, startNodeId: string } | null>(null);
  
  const [connectionState, setConnectionState] = useState<{
      active: boolean;
      startNodeId: string | null;
      startPos: { x: number, y: number } | null;
      mousePos: { x: number, y: number } | null;
      isDragging: boolean;
      snapTargetId: string | null;
      snapTargetPos: { x: number, y: number } | null;
      anchorY: number | null;
    }>({ active: false, startNodeId: null, startPos: null, mousePos: null, isDragging: false, snapTargetId: null, snapTargetPos: null, anchorY: null });

  const [sequenceLifelineOverlay, setSequenceLifelineOverlay] = useState<{
    actorId: string;
    x: number;
    slots: number[];
  } | null>(null);
  const [hoveredSequenceActorBox, setHoveredSequenceActorBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [hoveredSequenceMessageBox, setHoveredSequenceMessageBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [hoveredFlowchartNodeBox, setHoveredFlowchartNodeBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [sequenceMessageTriggerAreas, setSequenceMessageTriggerAreas] = useState<Array<{ index: number; x: number; y: number; width: number; height: number }>>([]);
  const hoveredSequenceTargetsRef = useRef<{ textEl: SVGElement | null; lineEl: SVGElement | null }>({ textEl: null, lineEl: null });

  const findNearestLineForText = useCallback((textEl: SVGElement, lineEls: SVGElement[]) => {
    if (lineEls.length === 0) return null;
    const textRect = textEl.getBoundingClientRect();
    const textX = textRect.left + textRect.width / 2;
    const textY = textRect.top + textRect.height / 2;
    let nearest = lineEls[0];
    let best = Number.POSITIVE_INFINITY;
    for (const lineEl of lineEls) {
      const lineRect = lineEl.getBoundingClientRect();
      const lineY = lineRect.top + lineRect.height / 2;
      const dx = textX < lineRect.left
        ? (lineRect.left - textX)
        : textX > lineRect.right
          ? (textX - lineRect.right)
          : 0;
      const dy = Math.abs(lineY - textY);

      // Prefer lines at/under the text and with horizontal overlap.
      const underPenalty = lineY < textY ? 60 : 0;
      const score = (dy * 3) + dx + underPenalty;

      if (score < best) {
        best = score;
        nearest = lineEl;
      }
    }
    return nearest;
  }, []);

  const findNearestTextForLine = useCallback((lineEl: SVGElement, textEls: SVGElement[]) => {
    if (textEls.length === 0) return null;
    const lineRect = lineEl.getBoundingClientRect();
    const lineX = lineRect.left + lineRect.width / 2;
    const lineY = lineRect.top + lineRect.height / 2;
    let nearest = textEls[0];
    let best = Number.POSITIVE_INFINITY;
    for (const textEl of textEls) {
      const textRect = textEl.getBoundingClientRect();
      const textX = textRect.left + textRect.width / 2;
      const textY = textRect.top + textRect.height / 2;

      const dx = Math.abs(textX - lineX);
      const dy = Math.abs(textY - lineY);
      // Prefer label positioned above the connection line.
      const abovePenalty = textY > lineY ? 40 : 0;
      const score = (dy * 3) + dx + abovePenalty;

      if (score < best) {
        best = score;
        nearest = textEl;
      }
    }
    return nearest;
  }, []);

  const clearSequenceMessageHoverHighlight = useCallback(() => {
    hoveredSequenceTargetsRef.current.textEl?.classList.remove('sequence-msg-hover-highlight-text');
    hoveredSequenceTargetsRef.current.lineEl?.classList.remove('sequence-msg-hover-highlight-line');
    hoveredSequenceTargetsRef.current = { textEl: null, lineEl: null };
    setHoveredSequenceMessageBox(null);
  }, []);

  const updateSequenceMessageHoverHighlight = useCallback((target: EventTarget | null) => {
    const container = containerRef.current;
    if (!container || !(target instanceof Element)) {
      clearSequenceMessageHoverHighlight();
      return;
    }

    // The hover trigger overlay sits above message primitives. When the cursor is on it,
    // preserve the current paired highlight instead of clearing.
    if (target.closest('[data-seq-msg-hover-trigger="true"]')) {
      return;
    }

    const messageTextEls = Array.from(container.querySelectorAll('.messageText')) as SVGElement[];
    const messageLineEls = Array.from(
      container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
    ) as SVGElement[];

    const messageTextEl = target.closest('.messageText') as SVGElement | null;
    const messageLineEl = target.closest('[class^="messageLine"], [class*=" messageLine"]') as SVGElement | null;

    const getCenterY = (el: SVGElement) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    };

    let nextTextEl: SVGElement | null = null;
    let nextLineEl: SVGElement | null = null;

    if (messageTextEl) {
      nextTextEl = messageTextEl;
      nextLineEl = findNearestLineForText(messageTextEl, messageLineEls);
    } else if (messageLineEl) {
      nextLineEl = messageLineEl;
      nextTextEl = findNearestTextForLine(nextLineEl, messageTextEls);
    }

    if (
      hoveredSequenceTargetsRef.current.textEl === nextTextEl &&
      hoveredSequenceTargetsRef.current.lineEl === nextLineEl
    ) {
      return;
    }

    hoveredSequenceTargetsRef.current.textEl?.classList.remove('sequence-msg-hover-highlight-text');
    hoveredSequenceTargetsRef.current.lineEl?.classList.remove('sequence-msg-hover-highlight-line');

    if (nextTextEl || nextLineEl) {
      nextTextEl?.classList.add('sequence-msg-hover-highlight-text');
      nextLineEl?.classList.add('sequence-msg-hover-highlight-line');

      hoveredSequenceTargetsRef.current = { textEl: nextTextEl, lineEl: nextLineEl };

      const lineEl = nextLineEl;
      const textEl = nextTextEl;
      const lineRect = lineEl?.getBoundingClientRect();
      const textRect = textEl?.getBoundingClientRect();
      if (lineRect || textRect) {
        const containerRect = container.getBoundingClientRect();
        const scale = containerRect.width / container.offsetWidth;
        const left = Math.min(lineRect?.left ?? Number.POSITIVE_INFINITY, textRect?.left ?? Number.POSITIVE_INFINITY);
        const top = Math.min(lineRect?.top ?? Number.POSITIVE_INFINITY, textRect?.top ?? Number.POSITIVE_INFINITY);
        const right = Math.max(lineRect?.right ?? Number.NEGATIVE_INFINITY, textRect?.right ?? Number.NEGATIVE_INFINITY);
        const bottom = Math.max(lineRect?.bottom ?? Number.NEGATIVE_INFINITY, textRect?.bottom ?? Number.NEGATIVE_INFINITY);
        const paddingX = 12;
        const paddingY = 3;

        setHoveredSequenceMessageBox({
          x: (left - containerRect.left + container.scrollLeft) / scale - paddingX,
          y: (top - containerRect.top + container.scrollTop) / scale - paddingY,
          width: Math.max(0, (right - left) / scale + paddingX * 2),
          height: Math.max(0, (bottom - top) / scale + paddingY * 2),
        });
      } else {
        setHoveredSequenceMessageBox(null);
      }
      return;
    }

    hoveredSequenceTargetsRef.current = { textEl: null, lineEl: null };
    setHoveredSequenceMessageBox(null);
  }, [containerRef, clearSequenceMessageHoverHighlight, findNearestLineForText, findNearestTextForLine]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseOver = (e: MouseEvent) => {
      if (determineDiagramType(code) !== 'sequence') return;
      updateSequenceMessageHoverHighlight(e.target);
    };

    const onMouseOut = (e: MouseEvent) => {
      if (determineDiagramType(code) !== 'sequence') {
        clearSequenceMessageHoverHighlight();
        return;
      }
      updateSequenceMessageHoverHighlight(e.relatedTarget);
    };

    container.addEventListener('mouseover', onMouseOver);
    container.addEventListener('mouseout', onMouseOut);

    return () => {
      container.removeEventListener('mouseover', onMouseOver);
      container.removeEventListener('mouseout', onMouseOut);
    };
  }, [containerRef, code, determineDiagramType, updateSequenceMessageHoverHighlight, clearSequenceMessageHoverHighlight]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (determineDiagramType(code) !== 'sequence') {
      setSequenceMessageTriggerAreas([]);
      return;
    }

    const messageTextEls = Array.from(container.querySelectorAll('.messageText')) as SVGElement[];
    const messageLineEls = Array.from(
      container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
    ) as SVGElement[];
    const containerRect = container.getBoundingClientRect();
    const scale = containerRect.width / container.offsetWidth;
    const paddingX = 12;
    const paddingY = 6;

    const areas: Array<{ index: number; x: number; y: number; width: number; height: number }> = [];
    for (let i = 0; i < messageTextEls.length; i += 1) {
      const textEl = messageTextEls[i];
      const lineEl = findNearestLineForText(textEl, messageLineEls);
      const textRect = textEl.getBoundingClientRect();
      const lineRect = lineEl?.getBoundingClientRect();
      const left = Math.min(textRect.left, lineRect?.left ?? textRect.left);
      const top = Math.min(textRect.top, lineRect?.top ?? textRect.top);
      const right = Math.max(textRect.right, lineRect?.right ?? textRect.right);
      const bottom = Math.max(textRect.bottom, lineRect?.bottom ?? textRect.bottom);

      areas.push({
        index: i,
        x: (left - containerRect.left + container.scrollLeft) / scale - paddingX,
        y: (top - containerRect.top + container.scrollTop) / scale - paddingY,
        width: Math.max(0, (right - left) / scale + paddingX * 2),
        height: Math.max(0, (bottom - top) / scale + paddingY * 2),
      });
    }

    setSequenceMessageTriggerAreas(areas);
  }, [containerRef, code, svgContent, determineDiagramType, findNearestLineForText]);

  const getSequenceParticipantEntries = useCallback(() => {
    const participantDecl = /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+/i;
    return code
      .split('\n')
      .map(l => l.trim())
      .filter(l => participantDecl.test(l))
      .map(l => {
        const m = l.match(/^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+([^\s@]+)(?:\s*@\{[^}]*\})?(?:\s+as\s+(.+))?$/i);
        if (!m) return null;
        return {
          id: m[1].trim(),
          alias: m[2]?.trim() || null,
        };
      })
      .filter((v): v is { id: string; alias: string | null } => Boolean(v));
  }, [code]);

  const normalizeSequenceLabel = useCallback((value: string | null | undefined) => {
    return (value || "")
      .replace(/^['\"]|['\"]$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }, []);

  const getSvgTextDisplayName = useCallback((el: SVGElement | null) => {
    if (!el) return '';
    const tspans = Array.from(el.querySelectorAll('tspan'))
      .map((t) => (t.textContent || '').trim())
      .filter(Boolean);
    if (tspans.length > 0) {
      return tspans.join(' ').replace(/\s+/g, ' ').trim();
    }
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }, []);

  const resolveSequenceActorIdFromDisplayName = useCallback((displayName: string) => {
    const entries = getSequenceParticipantEntries();
    const normalizedDisplayName = normalizeSequenceLabel(displayName);

    const byAlias = entries.find((e) => normalizeSequenceLabel(e.alias) === normalizedDisplayName);
    if (byAlias) return byAlias.id;

    const byId = entries.find((e) => normalizeSequenceLabel(e.id) === normalizedDisplayName);
    if (byId) return byId.id;

    return displayName;
  }, [getSequenceParticipantEntries, normalizeSequenceLabel]);

  const resolveSequenceDisplayNameFromActorId = useCallback((actorId: string) => {
    const entries = getSequenceParticipantEntries();
    const found = entries.find(e => e.id === actorId);
    return found?.alias || found?.id || actorId;
  }, [getSequenceParticipantEntries]);

  const getSequenceLifelines = useCallback(() => {
    if (!containerRef.current) return [] as Array<{ actorId: string; x: number; y1: number; y2: number }>;

    const containerRect = containerRef.current.getBoundingClientRect();
    const scale = containerRect.width / containerRef.current.offsetWidth;

    const lineEls = Array.from(containerRef.current.querySelectorAll('line.actor-line')) as SVGLineElement[];
    const topActorTextEls = Array.from(containerRef.current.querySelectorAll('text.actor'))
      .sort((a, b) => {
        const ay = Number(a.getAttribute('y') || '0');
        const by = Number(b.getAttribute('y') || '0');
        return ay - by;
      })
      .slice(0, lineEls.length);

    const participantIds = getSequenceParticipantEntries().map(e => e.id);

    const lifelines = lineEls
      .map((lineEl, index) => {
        const rect = lineEl.getBoundingClientRect();
        const x = (rect.left - containerRect.left + containerRef.current!.scrollLeft + rect.width / 2) / scale;
        const y1 = (rect.top - containerRect.top + containerRef.current!.scrollTop) / scale;
        const y2 = (rect.bottom - containerRect.top + containerRef.current!.scrollTop) / scale;

        const nearestText = topActorTextEls
          .map(t => {
            const tRect = t.getBoundingClientRect();
            const tx = (tRect.left - containerRect.left + containerRef.current!.scrollLeft + tRect.width / 2) / scale;
            return {
              text: getSvgTextDisplayName(t as SVGElement),
              x: tx,
              distance: Math.abs(tx - x),
            };
          })
          .sort((a, b) => a.distance - b.distance)[0];

        const displayName = nearestText?.text || topActorTextEls[index]?.textContent?.trim() || `Actor${index + 1}`;
        const actorId = resolveSequenceActorIdFromDisplayName(displayName);

        return { actorId, x, y1, y2 };
      })
      .sort((a, b) => a.x - b.x);

    // Primary mapping strategy: Mermaid places participants in declaration order from left to right.
    // This avoids alias collisions (e.g. multiple "New Boundary" labels).
    if (participantIds.length === lifelines.length) {
      return lifelines.map((l, idx) => ({ ...l, actorId: participantIds[idx] }));
    }

    return lifelines;
  }, [containerRef, resolveSequenceActorIdFromDisplayName, getSvgTextDisplayName]);

  const findNearestSlot = useCallback((slots: number[], y: number) => {
    let nearest = slots[0] ?? y;
    let bestDistance = Math.abs(nearest - y);
    for (const slot of slots) {
      const d = Math.abs(slot - y);
      if (d < bestDistance) {
        bestDistance = d;
        nearest = slot;
      }
    }
    return nearest;
  }, []);

  const isSequenceMessageLine = useCallback((line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) return false;
    const keywords = ['sequenceDiagram', 'Note', 'note', 'rect', 'alt', 'opt', 'loop', 'par', 'critical', 'option', 'else', 'end', 'participant', 'actor', 'autonumber', 'activate', 'deactivate', 'box', 'links', 'link', 'properties', 'details'];
    if (keywords.some(kw => trimmed === kw || trimmed.startsWith(kw + ' '))) return false;
    return trimmed.includes(':');
  }, []);

  const getSequenceMessageEntries = useCallback((sourceCode: string) => {
    const lines = sourceCode.split('\n');
    const entries: Array<{ index: number; line: string }> = [];
    let inFrontmatter = false;

    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed === '---') {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter) continue;

      if (isSequenceMessageLine(lines[i])) {
        entries.push({ index: i, line: lines[i] });
      }
    }

    return entries;
  }, [isSequenceMessageLine]);

  const insertSequenceMessageAtIndex = useCallback((sourceCode: string, messageLine: string, messageIndex: number) => {
    const lines = sourceCode.split('\n');
    const messageEntries = getSequenceMessageEntries(sourceCode);
    const insertAt = messageEntries[messageIndex]?.index ?? lines.length;

    lines.splice(insertAt, 0, `    ${messageLine}`);
    return lines.join('\n');
  }, [getSequenceMessageEntries]);

  const getSequenceMessageLineByIndex = useCallback((idx: number) => {
    const entries = getSequenceMessageEntries(code);
    return entries[idx]?.line || null;
  }, [code, getSequenceMessageEntries]);

  const triggerHoveredSequenceMessageSelection = useCallback((startInlineEdit = false, explicitIndex?: number) => {
    const container = containerRef.current;
    if (!container) return;

    const messageTextEls = Array.from(container.querySelectorAll('.messageText')) as SVGElement[];
    const messageLineEls = Array.from(
      container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
    ) as SVGElement[];

    const textEl = typeof explicitIndex === 'number'
      ? (messageTextEls[explicitIndex] || null)
      : hoveredSequenceTargetsRef.current.textEl;
    const lineEl = textEl
      ? findNearestLineForText(textEl, messageLineEls)
      : hoveredSequenceTargetsRef.current.lineEl;
    if (!textEl && !lineEl) return;

    const centerY = (el: SVGElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2;
    };

    let messageIndex = typeof explicitIndex === 'number'
      ? explicitIndex
      : (textEl ? messageTextEls.indexOf(textEl) : -1);
    if (messageIndex < 0 && lineEl && messageTextEls.length > 0) {
      const lineCenterY = centerY(lineEl) ?? 0;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < messageTextEls.length; i += 1) {
        const d = Math.abs((centerY(messageTextEls[i]) ?? 0) - lineCenterY);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      messageIndex = nearest;
    }

    if (messageIndex < 0) return;

    const lineRect = lineEl?.getBoundingClientRect();
    const textRect = textEl?.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scale = containerRect.width / container.offsetWidth;

    const left = Math.min(lineRect?.left ?? Number.POSITIVE_INFINITY, textRect?.left ?? Number.POSITIVE_INFINITY);
    const top = Math.min(lineRect?.top ?? Number.POSITIVE_INFINITY, textRect?.top ?? Number.POSITIVE_INFINITY);
    const right = Math.max(lineRect?.right ?? Number.NEGATIVE_INFINITY, textRect?.right ?? Number.NEGATIVE_INFINITY);
    const bottom = Math.max(lineRect?.bottom ?? Number.NEGATIVE_INFINITY, textRect?.bottom ?? Number.NEGATIVE_INFINITY);
    const paddingX = 12;
    const paddingY = 3;

    if (Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)) {
      setSelectionBox({
        x: (left - containerRect.left + container.scrollLeft) / scale - paddingX,
        y: (top - containerRect.top + container.scrollTop) / scale - paddingY,
        width: Math.max(0, (right - left) / scale + paddingX * 2),
        height: Math.max(0, (bottom - top) / scale + paddingY * 2),
      });
    }

    if (textRect) {
      setTextBox({
        x: (textRect.left - containerRect.left + container.scrollLeft) / scale,
        y: (textRect.top - containerRect.top + container.scrollTop) / scale,
        width: textRect.width / scale,
        height: textRect.height / scale,
      });
    }

    const nodeId = `SEQ_MSG_${messageIndex}`;
    setSelectedNodeIdWithRef(nodeId);
    setSelectedSvgId(lineEl?.id || textEl?.id || null);

    if (startInlineEdit) {
      const msgLine = getSequenceMessageLineByIndex(messageIndex);
      const colonIdx = msgLine?.indexOf(':') ?? -1;
      setEditingText(colonIdx !== -1 && msgLine ? msgLine.substring(colonIdx + 1).trim() : '');
      setIsInlineEditing(true);
    }
  }, [containerRef, getSequenceMessageLineByIndex, findNearestLineForText]);

  const triggerSequenceMessageHoverByIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const messageTextEls = Array.from(container.querySelectorAll('.messageText')) as SVGElement[];
    const messageLineEls = Array.from(
      container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
    ) as SVGElement[];
    const textEl = messageTextEls[index] || null;
    const lineEl = textEl ? findNearestLineForText(textEl, messageLineEls) : null;
    if (!textEl && !lineEl) return;

    hoveredSequenceTargetsRef.current.textEl?.classList.remove('sequence-msg-hover-highlight-text');
    hoveredSequenceTargetsRef.current.lineEl?.classList.remove('sequence-msg-hover-highlight-line');

    textEl?.classList.add('sequence-msg-hover-highlight-text');
    lineEl?.classList.add('sequence-msg-hover-highlight-line');
    hoveredSequenceTargetsRef.current = { textEl, lineEl };

    const textRect = textEl?.getBoundingClientRect();
    const lineRect = lineEl?.getBoundingClientRect();
    if (!textRect && !lineRect) {
      setHoveredSequenceMessageBox(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const scale = containerRect.width / container.offsetWidth;
    const left = Math.min(textRect?.left ?? Number.POSITIVE_INFINITY, lineRect?.left ?? Number.POSITIVE_INFINITY);
    const top = Math.min(textRect?.top ?? Number.POSITIVE_INFINITY, lineRect?.top ?? Number.POSITIVE_INFINITY);
    const right = Math.max(textRect?.right ?? Number.NEGATIVE_INFINITY, lineRect?.right ?? Number.NEGATIVE_INFINITY);
    const bottom = Math.max(textRect?.bottom ?? Number.NEGATIVE_INFINITY, lineRect?.bottom ?? Number.NEGATIVE_INFINITY);
    const paddingX = 12;
    const paddingY = 3;
    setHoveredSequenceMessageBox({
      x: (left - containerRect.left + container.scrollLeft) / scale - paddingX,
      y: (top - containerRect.top + container.scrollTop) / scale - paddingY,
      width: Math.max(0, (right - left) / scale + paddingX * 2),
      height: Math.max(0, (bottom - top) / scale + paddingY * 2),
    });
  }, [containerRef, findNearestLineForText]);

  const parseSequenceMessageActors = useCallback((line: string) => {
    const match = line.trim().match(/^(\S+)\s*(?:-->>|-->|->>|->|-\))\s*(\S+)\s*:/);
    if (!match) return null;
    return {
      from: match[1],
      to: match[2],
    };
  }, []);

  // Parse sequence notes with structure: Note [left|right|over] of [Participant]: [Text]
  const getSequenceNoteEntries = useCallback((sourceCode: string) => {
    const lines = sourceCode.split('\n');
    const entries: Array<{ 
      index: number; 
      line: string; 
      position: 'left' | 'right' | 'over'; 
      participant: string; 
      text: string;
    }> = [];
    let inFrontmatter = false;

    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (trimmed === '---') {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter) continue;

      // Match: Note [left|right|over] of [Participant]: [Text]
      const noteMatch = trimmed.match(/^Note\s+(left|right|over)\s+of\s+(.+?)(?:\s*:\s*(.*))?$/i);
      if (noteMatch) {
        const [, position, participant, text] = noteMatch;
        entries.push({
          index: i,
          line: lines[i],
          position: (position.toLowerCase() as 'left' | 'right' | 'over'),
          participant: participant.trim(),
          text: text?.trim() || 'new note',
        });
      }
    }

    return entries;
  }, []);

  // Insert a note at a specific message index
  const insertSequenceNoteAtIndex = useCallback((
    sourceCode: string, 
    position: 'left' | 'right' | 'over', 
    participant: string, 
    messageIndex: number
  ) => {
    const lines = sourceCode.split('\n');
    const messageEntries = getSequenceMessageEntries(sourceCode);
    const insertAt = messageEntries[messageIndex]?.index ?? lines.length;

    const noteLine = position === 'over'
      ? `    Note over ${participant}: new note`
      : `    Note ${position} of ${participant}: new note`;
    lines.splice(insertAt, 0, noteLine);
    return lines.join('\n');
  }, [getSequenceMessageEntries]);

  // Update note position (e.g., from "left" to "right")
  const updateNotePosition = useCallback((
    sourceCode: string, 
    noteIndex: number, 
    newPosition: 'left' | 'right' | 'over'
  ) => {
    const noteEntries = getSequenceNoteEntries(sourceCode);
    if (noteIndex >= noteEntries.length) return sourceCode;

    const lines = sourceCode.split('\n');
    const noteEntry = noteEntries[noteIndex];
    const newLine = `    Note ${newPosition} of ${noteEntry.participant}: ${noteEntry.text}`;
    lines[noteEntry.index] = newLine;

    return lines.join('\n');
  }, [getSequenceNoteEntries]);

  // Delete a note
  const deleteSequenceNote = useCallback((sourceCode: string, noteIndex: number) => {
    const noteEntries = getSequenceNoteEntries(sourceCode);
    if (noteIndex >= noteEntries.length) return sourceCode;

    const lines = sourceCode.split('\n');
    lines.splice(noteEntries[noteIndex].index, 1);

    return lines.join('\n');
  }, [getSequenceNoteEntries]);

  const getSequenceAnchorSlots = useCallback((lifeline: { actorId: string; x: number; y1: number; y2: number }, hoverY?: number) => {
    const allLifelines = getSequenceLifelines();
    const globalTop = allLifelines.length > 0
      ? Math.min(...allLifelines.map((l) => l.y1))
      : lifeline.y1;
    const start = globalTop + 8;

    let boxTopLimit = lifeline.y2;
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = containerRect.width / containerRef.current.offsetWidth;
      const bottomActors = Array.from(containerRef.current.querySelectorAll('rect.actor.actor-bottom')) as SVGElement[];
      if (bottomActors.length > 0) {
        const nearestBottom = bottomActors
          .map((el) => {
            const r = el.getBoundingClientRect();
            const x = (r.left - containerRect.left + containerRef.current!.scrollLeft + r.width / 2) / scale;
            const top = (r.top - containerRect.top + containerRef.current!.scrollTop) / scale;
            return { x, top, dx: Math.abs(x - lifeline.x) };
          })
          .sort((a, b) => a.dx - b.dx)[0];
        if (nearestBottom && nearestBottom.dx < 80) {
          boxTopLimit = Math.min(boxTopLimit, nearestBottom.top - 2);
        }
      }
    }

    const end = Math.max(start, Math.min(lifeline.y2 - 2, boxTopLimit));

    const rowAnchors: number[] = [];

    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = containerRect.width / containerRef.current.offsetWidth;
      const messageLines = Array.from(
        containerRef.current.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
      ) as SVGGraphicsElement[];

      for (const line of messageLines) {
        const rect = line.getBoundingClientRect();
        const centerY = (rect.top - containerRect.top + containerRef.current.scrollTop + rect.height / 2) / scale;
        if (centerY >= globalTop && centerY <= lifeline.y2 + 28) {
          rowAnchors.push(Math.round(centerY));
        }
      }
    }

    const rows = [...new Set(rowAnchors)].sort((a, b) => a - b);

    // Collect note vertical ranges (only for notes that overlap this lifeline's X position).
    // Notes on other lifelines share Y-rows but don't visually overlap this lifeline's + buttons.
    const noteRanges: Array<{ top: number; bottom: number }> = [];
    let noteScale = 1;
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      noteScale = containerRect.width / containerRef.current.offsetWidth;
      const noteRects = Array.from(containerRef.current.querySelectorAll('rect.note')) as SVGElement[];
      for (const noteRect of noteRects) {
        const r = noteRect.getBoundingClientRect();
        // Convert note X range to canvas coordinates
        const noteLeft = (r.left - containerRect.left) / noteScale;
        const noteRight = (r.right - containerRect.left) / noteScale;
        // Only consider notes that horizontally overlap this lifeline's X position (with button radius margin)
        const buttonRadius = 12 / noteScale;
        if (lifeline.x < noteLeft - buttonRadius || lifeline.x > noteRight + buttonRadius) continue;
        const top = (r.top - containerRect.top + containerRef.current.scrollTop) / noteScale;
        const bottom = (r.bottom - containerRect.top + containerRef.current.scrollTop) / noteScale;
        noteRanges.push({ top, bottom });
      }
    }
    // The + button has a 12px physical radius. Add 1 extra canvas unit for strict clearance.
    const noteBuffer = Math.ceil(12 / noteScale);

    // Push a Y value below any note whose visual extent (±noteBuffer) the slot would overlap.
    // A slot overlaps a note if the button (radius=noteBuffer) reaches the note boundary.
    const pushBelowNotes = (y: number): number => {
      let result = y;
      for (let iter = 0; iter < noteRanges.length * 2 + 1; iter++) {
        // Find ALL notes the button would visually overlap and take the one with the highest bottom
        const overlapping = noteRanges.filter(n => result >= n.top - noteBuffer && result <= n.bottom + noteBuffer);
        if (overlapping.length === 0) break;
        const maxBottom = Math.max(...overlapping.map(n => n.bottom));
        const next = maxBottom + noteBuffer;
        if (next <= result) break; // no forward progress, avoid infinite loop
        result = next;
      }
      return Math.round(result);
    };

    // Empty lifeline: one dynamic handle that follows hover and snaps to safe bounds.
    if (rows.length === 0) {
      const fallbackY = hoverY ?? ((start + end) / 2);
      return [Math.round(Math.max(start, Math.min(end, fallbackY)))];
    }

    // Existing messages: one slot above the first, one midpoint between each adjacent pair,
    // one slot below the last. Each slot is pushed below any note it would visually overlap.
    const VERTICAL_GRID_STEP = 56;
    const firstGap = 12;
    const lastGap = rows.length > 1
      ? Math.max(28, Math.round((rows[rows.length - 1] - rows[rows.length - 2]) / 2))
      : VERTICAL_GRID_STEP;
    const targetYs: number[] = [];
    // Above-first-row slot: push below any overlapping note. If pushed past rows[0],
    // push UPWARD to sit just above the note instead.
    const firstSlotRaw = Math.round(rows[0] - firstGap);
    const firstSlotPushed = pushBelowNotes(firstSlotRaw);
    let firstSlot: number;
    if (firstSlotPushed <= rows[0]) {
      firstSlot = firstSlotPushed; // fits between note and first row
    } else {
      // Note fills the gap — place button above the note instead
      const minNoteTop = noteRanges
        .filter(n => firstSlotRaw >= n.top - noteBuffer)
        .reduce((min, n) => Math.min(min, n.top), Infinity);
      firstSlot = Number.isFinite(minNoteTop)
        ? Math.floor(minNoteTop - noteBuffer) - 1  // just above the note's buffer zone
        : firstSlotRaw;
    }
    targetYs.push(firstSlot);

    for (let i = 0; i < rows.length - 1; i += 1) {
      targetYs.push(pushBelowNotes(Math.round((rows[i] + rows[i + 1]) / 2)));
    }

    targetYs.push(pushBelowNotes(Math.round(rows[rows.length - 1] + lastGap)));

    // The first slot (targetYs[0]) is already well-placed by the firstSlot logic above —
    // it sits at rows[0]-firstGap (or above a note), which may be above start when the
    // first message is close to the actor box. We keep it as-is (only clamping to the
    // lifeline bottom); all other slots clamp to [start, end] as usual.
    const contextual = targetYs
      .map((y, i) => {
        if (i === 0) {
          // First slot: clamp only to lifeline extent (not to start), then push below notes.
          // This ensures a button always appears ABOVE the first message even in dense diagrams.
          return pushBelowNotes(Math.max(globalTop, Math.min(end, y)));
        }
        return pushBelowNotes(Math.max(start, Math.min(end, y)));
      })
      .sort((a, b) => a - b);

    if (contextual.length === 0) {
      return [Math.round(Math.max(start, Math.min(end, rows[0])))] ;
    }

    return [...new Set(contextual)];
  }, [containerRef, getSequenceLifelines]);

  const getSelectedMessageOverlay = useCallback((selectedId: string) => {
    if (!selectedId.startsWith('SEQ_MSG_') || !containerRef.current) return null as { actorId: string; x: number; slots: number[] } | null;
    const idx = parseInt(selectedId.replace('SEQ_MSG_', ''), 10);
    if (!Number.isFinite(idx)) return null;

    const msgLine = getSequenceMessageLineByIndex(idx);
    if (!msgLine) return null;
    const actors = parseSequenceMessageActors(msgLine);
    if (!actors?.from) return null;

    const lifelines = getSequenceLifelines();
    const lifeline = lifelines.find(l => l.actorId === actors.from);
    if (!lifeline) return null;

    return {
      actorId: lifeline.actorId,
      x: lifeline.x,
      slots: getSequenceAnchorSlots(lifeline),
    };
  }, [containerRef, getSequenceMessageLineByIndex, parseSequenceMessageActors, getSequenceLifelines, getSequenceAnchorSlots]);

  const getSequenceInsertIndexForAnchor = useCallback((anchorY: number) => {
    if (!containerRef.current) return Number.MAX_SAFE_INTEGER;

    const containerRect = containerRef.current.getBoundingClientRect();
    const scale = containerRect.width / containerRef.current.offsetWidth;

    const messageLineEls = Array.from(
      containerRef.current.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
    ) as SVGGraphicsElement[];

    const messageYsFromLines = messageLineEls
      .map(el => {
        const rect = el.getBoundingClientRect();
        return (rect.top - containerRect.top + containerRef.current!.scrollTop + rect.height / 2) / scale;
      })
      .filter(y => Number.isFinite(y));

    const baseYs = messageYsFromLines.length > 0
      ? messageYsFromLines
      : (Array.from(containerRef.current.querySelectorAll('.messageText')) as SVGGraphicsElement[])
          .map(m => {
            const rect = m.getBoundingClientRect();
            return (rect.top - containerRect.top + containerRef.current!.scrollTop + rect.height / 2) / scale;
          })
          .filter(y => Number.isFinite(y));

    if (baseYs.length === 0) return 0;

    const msgYs = [...baseYs].sort((a, b) => a - b);

    let idx = 0;
    while (idx < msgYs.length && msgYs[idx] < anchorY) {
      idx += 1;
    }
    return idx;
  }, [containerRef]);

  const normalizeId = useCallback((id: string) => {
    let cleanId = id.replace('-hit-target', '');
    
    // 1. Remove render ID prefix if present
    if (renderIdRef.current && cleanId.includes(renderIdRef.current)) {
        const prefixRegex = new RegExp(`^.*?-?${renderIdRef.current}-`);
        cleanId = cleanId.replace(prefixRegex, '');
    }
    
    // Also remove generic svg- or flowchart- prefixes that might be added
    cleanId = cleanId.replace(/^svg-/, '').replace(/^flowchart-/, '');

    // 2. Check if it is an edge ID pattern: e.g., L_n2_n4_2 or L-n2-n4-3
    // We want to match L, followed by src, followed by dst, followed by a raw index.
    const edgeMatch = cleanId.match(/^L[_-]([a-zA-Z0-9]+)[_-]([a-zA-Z0-9]+)[_-](\d+)$/);
    if (edgeMatch) {
        const src = edgeMatch[1];
        const dst = edgeMatch[2];
        const rawIndex = parseInt(edgeMatch[3], 10);
        // Canonicalize edge ID to use underscores and even rawIndex
        const canonicalIndex = 2 * Math.floor(rawIndex / 2);
        return `L_${src}_${dst}_${canonicalIndex}`;
    }

    // 3. For non-edge IDs, strip trailing render suffixes like -1, _2
    cleanId = cleanId.replace(/[-_]\d+$/, '');
    
    return cleanId;
  }, [renderIdRef]);

  const recalculateSelection = useCallback(() => {
    if (!selectedNodeId || !containerRef.current) return;

    // Search for the element corresponding to selectedNodeId
    let foundElement: SVGElement | null = null;
    let foundRawSvgId: string | null = null;

    if (selectedNodeId.startsWith('SEQ_ACTOR_')) {
      const actorId = selectedNodeId.replace('SEQ_ACTOR_', '');
      const actorDisplayName = resolveSequenceDisplayNameFromActorId(actorId);

      // First, preserve the exact clicked actor element (top or bottom) when possible.
      if (selectedSvgId) {
        const exactEl = containerRef.current.querySelector(`#${CSS.escape(selectedSvgId)}`) as SVGElement | null;
        if (exactEl && exactEl.classList?.contains('actor')) {
          foundElement = exactEl;
          foundRawSvgId = exactEl.id || null;
        }
      }

      // Prefer geometry-based matching from actorId -> lifeline x.
      let bestRect: Element | null = null;
      const lifeline = getSequenceLifelines().find(l => l.actorId === actorId);
      if (!foundElement && lifeline) {
        const selectedCenterY = selectionBox ? (selectionBox.y + selectionBox.height / 2) : null;
        const actorElements = Array.from(containerRef.current.querySelectorAll('.actor')) as SVGElement[];
        const byX = actorElements
          .map(el => {
            const b = el.getBoundingClientRect();
            const centerX = b.left + b.width / 2;
            const centerY = b.top + b.height / 2;
            const containerRect = containerRef.current!.getBoundingClientRect();
            const scale = containerRect.width / containerRef.current!.offsetWidth;
            const canvasX = (centerX - containerRect.left + containerRef.current!.scrollLeft) / scale;
            const canvasY = (centerY - containerRect.top + containerRef.current!.scrollTop) / scale;
            return {
              el,
              top: b.top,
              centerX: canvasX,
              centerY: canvasY,
              dx: Math.abs(canvasX - lifeline.x),
              dy: selectedCenterY === null ? 0 : Math.abs(canvasY - selectedCenterY),
            };
          })
          .filter(item => Number.isFinite(item.centerX) && Number.isFinite(item.dx) && item.dx < 120)
          .sort((a, b) => (a.dx - b.dx) || (a.dy - b.dy) || (a.top - b.top));
        if (byX[0]) {
          const minDx = byX[0].dx;
          const sameTrack = byX
            .filter(item => Math.abs(item.dx - minDx) < 1.5)
            .sort((a, b) => (a.dy - b.dy) || (a.top - b.top));
          bestRect = (sameTrack[0] || byX[0]).el;
        }
      }

      // Fallback to text-based matching when geometry resolution fails.
      if (!foundElement && !bestRect) {
        const selectedCenterY = selectionBox ? (selectionBox.y + selectionBox.height / 2) : null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const g of Array.from(containerRef.current.querySelectorAll('g'))) {
          const directTexts = Array.from(g.children).filter((c): c is Element => c.tagName === 'text');
          if (directTexts.some(t => t.textContent?.trim() === actorDisplayName)) {
            const rectEl = g.querySelector('rect') || g;
            const b = (rectEl as SVGElement).getBoundingClientRect();
            const containerRect = containerRef.current.getBoundingClientRect();
            const scale = containerRect.width / containerRef.current.offsetWidth;
            const centerY = (b.top - containerRect.top + containerRef.current.scrollTop + b.height / 2) / scale;
            const score = selectedCenterY === null ? b.top : Math.abs(centerY - selectedCenterY);
            if (score < bestScore) {
              bestScore = score;
              bestRect = rectEl;
            }
          }
        }
      }

      if (!foundElement && bestRect) {
        foundElement = bestRect as SVGElement;
        if (!bestRect.id) {
          const b = (bestRect as SVGElement).getBoundingClientRect();
          (bestRect as SVGElement).id = `seq-actor-${actorId.replace(/[^a-zA-Z0-9_]/g, '')}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }
        foundRawSvgId = (bestRect as SVGElement).id || null;
      }
    } else if (selectedNodeId.startsWith('SEQ_MSG_')) {
      const idx = parseInt(selectedNodeId.replace('SEQ_MSG_', ''), 10);
      const allMsgs = Array.from(containerRef.current.querySelectorAll('.messageText'));
      if (allMsgs[idx]) {
        foundElement = allMsgs[idx] as SVGElement;
        if (!foundElement.id) foundElement.id = `seq-msg-${idx}`;
        foundRawSvgId = foundElement.id || null;
      }
    } else if (selectedNodeId.startsWith('SEQ_NOTE_')) {
      const idx = parseInt(selectedNodeId.replace('SEQ_NOTE_', ''), 10);
      const allNotes = Array.from(containerRef.current.querySelectorAll('.noteText'));
      if (allNotes[idx]) {
        foundElement = allNotes[idx] as SVGElement;
        if (!foundElement.id) foundElement.id = `seq-note-${idx}`;
        foundRawSvgId = foundElement.id || null;
      }
    } else if (selectedNodeId.startsWith('SEQ_')) {
      // Legacy fallback
      const name = selectedNodeId.replace('SEQ_', '');
      const candidates = containerRef.current.querySelectorAll('.actor, .messageText, .noteText');
      for (const candidate of Array.from(candidates)) {
        if (candidate.textContent?.trim() === name) {
          foundElement = candidate as SVGElement;
          foundRawSvgId = candidate.id || null;
          break;
        }
      }
    } else {
      // It's a flowchart node, cluster, or link
      if (selectedSvgId) {
        const exact = containerRef.current.querySelector(`#${CSS.escape(selectedSvgId)}`) as SVGElement | null;
        if (exact) {
          foundElement = exact;
          foundRawSvgId = exact.id || null;
        }
      }

      if (foundElement) {
        // Exact raw SVG id match wins. This preserves selection identity when multiple
        // elements normalize to the same clean id (e.g. duplicate subgraph titles).
      } else {
      let candidatesList: SVGElement[] = [];
      if (isEdgeId(selectedNodeId)) {
        const edgeLabels = Array.from(containerRef.current.querySelectorAll('.edgeLabel'));
        const flowchartLinks = Array.from(containerRef.current.querySelectorAll('path.flowchart-link:not(.flowchart-link-hit-target)'));
        const otherNodes = Array.from(containerRef.current.querySelectorAll('.node, .cluster'));
        candidatesList = [...edgeLabels, ...flowchartLinks, ...otherNodes] as SVGElement[];
      } else {
        candidatesList = Array.from(containerRef.current.querySelectorAll('.node, .cluster, path.flowchart-link:not(.flowchart-link-hit-target), .edgeLabel')) as SVGElement[];
      }

      for (const candidate of candidatesList) {
        let nodeId = candidate.id;
        if (!nodeId && candidate.classList?.contains('edgeLabel')) {
          const dataIdEl = candidate.querySelector('[data-id]');
          if (dataIdEl) {
            const rawId = dataIdEl.getAttribute('data-id');
            if (rawId) {
              const canonical = normalizeId(rawId);
              // Only snap selection to labeled edge labels (non-empty text).
              // For empty/unlabeled edge labels, do not set nodeId so that the loop
              // bypasses this candidate and selects the path element instead.
              const hasText = candidate.textContent?.trim() !== '';
              if (hasText) {
                const paths = Array.from(containerRef.current.querySelectorAll('path.flowchart-link:not(.flowchart-link-hit-target)'));
                const matchingPath = paths.find(p => p.id && normalizeId(p.id) === canonical);
                if (matchingPath) {
                  nodeId = matchingPath.id;
                }
              }
            }
          }
        }

        if (nodeId) {
          const cleanId = normalizeId(nodeId);

          if (cleanId === selectedNodeId) {
            foundElement = candidate;
            if (candidate.classList?.contains('edgeLabel') && !candidate.id) {
              candidate.id = `edge-label-${cleanId}`;
            }
            foundRawSvgId = candidate.id || null;
            break;
          }
        }
      }
      }
    }

    if (foundElement && containerRef.current) {
      let rect = foundElement.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = containerRect.width / containerRef.current.offsetWidth;
      
      let elementToMeasure = foundElement;
      const innerText = foundElement.querySelector('.label > div, foreignObject > div, .label, foreignObject, text, .messageText, .noteText, .nodeLabel, .cluster-label');
      if (innerText) {
          elementToMeasure = innerText as SVGElement;
      } else if (foundElement.tagName === 'text' || foundElement.tagName === 'foreignObject' || foundElement.classList?.contains('label')) {
          elementToMeasure = foundElement;
      }
      let textRect = elementToMeasure.getBoundingClientRect();

      // For sequence messages, preserve the larger combined selection bounds (line + label)
      // so the outer message selection frame remains stable after recalc.
      if (selectedNodeId.startsWith('SEQ_MSG_')) {
        const idx = parseInt(selectedNodeId.replace('SEQ_MSG_', ''), 10);
        if (Number.isFinite(idx) && idx >= 0) {
          const allMsgTexts = Array.from(containerRef.current.querySelectorAll('.messageText')) as SVGElement[];
          const allMsgLines = Array.from(
            containerRef.current.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
          ) as SVGElement[];

          const pairedText = allMsgTexts[idx] || foundElement;
          const pairedLine = findNearestLineForText(pairedText as SVGElement, allMsgLines);

          const lineRect = pairedLine?.getBoundingClientRect();
          const labelRect = (pairedText as SVGElement | null)?.getBoundingClientRect();
          if (lineRect || labelRect) {
            const left = Math.min(lineRect?.left ?? Number.POSITIVE_INFINITY, labelRect?.left ?? Number.POSITIVE_INFINITY);
            const top = Math.min(lineRect?.top ?? Number.POSITIVE_INFINITY, labelRect?.top ?? Number.POSITIVE_INFINITY);
            const right = Math.max(lineRect?.right ?? Number.NEGATIVE_INFINITY, labelRect?.right ?? Number.NEGATIVE_INFINITY);
            const bottom = Math.max(lineRect?.bottom ?? Number.NEGATIVE_INFINITY, labelRect?.bottom ?? Number.NEGATIVE_INFINITY);
            rect = {
              left,
              top,
              right,
              bottom,
              width: Math.max(0, right - left),
              height: Math.max(0, bottom - top),
              x: left,
              y: top,
              toJSON: () => ({})
            } as DOMRect;
            textRect = (labelRect || lineRect)!;
          }
        }
      }
      
      const newSelectionBox = {
          x: (rect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
          y: (rect.top - containerRect.top + containerRef.current.scrollTop) / scale,
          width: rect.width / scale,
          height: rect.height / scale
      };

      const newTextBox = {
          x: (textRect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
          y: (textRect.top - containerRect.top + containerRef.current.scrollTop) / scale,
          width: textRect.width / scale,
          height: textRect.height / scale
      };

      setSelectionBox(newSelectionBox);
      setTextBox(newTextBox);
      setSelectedSvgId(foundRawSvgId);
    } else {
      // If we couldn't find the selected element in the new SVG, clear the selection
      setSelectionBox(null);
      setTextBox(null);
      setSelectedNodeIdWithRef(null);
      setSelectedSvgId(null);
    }
  }, [selectedNodeId, selectedSvgId, selectionBox, containerRef, renderIdRef, normalizeId, resolveSequenceDisplayNameFromActorId, getSequenceLifelines]);

  // Effect to recalculate selection on code or svgContent (re-render) change
  useEffect(() => {
    if (!selectedNodeId) return;

    const timeoutId = setTimeout(() => {
      recalculateSelection();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [code, svgContent, selectedNodeId, recalculateSelection]);

  // Effect to recalculate selection on container or mermaid-container resize (e.g. dragging panel splitter or window resize)
  useEffect(() => {
    if (!selectedNodeId || !containerRef.current) return;

    const observer = new ResizeObserver(() => {
      recalculateSelection();
    });

    const mermaidContainer = containerRef.current.querySelector('.mermaid-container');
    
    observer.observe(containerRef.current);
    if (mermaidContainer) {
      observer.observe(mermaidContainer);
    }

    return () => {
      observer.disconnect();
    };
  }, [selectedNodeId, containerRef, recalculateSelection, svgContent]);


  const getClickedNode = useCallback((target: Element) => {
    const isSequenceMessageLineElement = (el: SVGElement | null) => {
      if (!el?.classList) return false;
      return Array.from(el.classList).some((c) => c.startsWith('messageLine'));
    };

    let currentNode: SVGElement | null = target as SVGElement;
    let foundNodeClass = false;
    let nodeId = null;

    while (currentNode && currentNode.tagName !== 'svg') {
      if (currentNode.classList?.contains('node') || currentNode.classList?.contains('cluster')) {
        foundNodeClass = true;
        nodeId = currentNode.id;
        break;
      }
      if (currentNode.classList?.contains('flowchart-link') || currentNode.classList?.contains('flowchart-link-hit-target') || currentNode.classList?.contains('edgeLabel')) {
        foundNodeClass = true;
        nodeId = currentNode.id;
        if (!nodeId) {
            if (currentNode.classList?.contains('edgeLabel')) {
                const dataIdEl = currentNode.querySelector('[data-id]');
                if (dataIdEl) {
                    const rawId = dataIdEl.getAttribute('data-id');
                    if (rawId) {
                        const canonical = normalizeId(rawId);
                        const paths = Array.from(containerRef.current?.querySelectorAll('path.flowchart-link:not(.flowchart-link-hit-target)') || []);
                        const path = paths.find(p => p.id && normalizeId(p.id) === canonical);
                        if (path && path.id) nodeId = path.id;
                    }
                }
            } else {
                const path = currentNode.parentElement?.querySelector('path.flowchart-link:not(.flowchart-link-hit-target)') || currentNode.closest('.edgeLabel')?.previousElementSibling;
                if (path && path.id) nodeId = path.id;
            }
        }
        break;
      }
      // Sequence diagram elements: actors
      if (currentNode.classList?.contains('actor')) {
        foundNodeClass = true;

        const containerEl = containerRef.current;
        if (!containerEl) break;

        const actorDisplayName = getSvgTextDisplayName(currentNode);
        const clickedRect = currentNode.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();
        const scale = containerRect.width / containerEl.offsetWidth;
        const clickedX = (clickedRect.left - containerRect.left + containerEl.scrollLeft + clickedRect.width / 2) / scale;

        const lifelines = getSequenceLifelines();
        const nearest = lifelines
          .map(l => ({ actorId: l.actorId, d: Math.abs(l.x - clickedX) }))
          .sort((a, b) => a.d - b.d)[0];

        // Resolve by actor label first; geometry is only a fallback when label resolution is ambiguous.
        const resolvedByName = actorDisplayName
          ? resolveSequenceActorIdFromDisplayName(actorDisplayName)
          : null;
        const hasResolvedLifeline = Boolean(
          resolvedByName && lifelines.some((lifeline) => lifeline.actorId === resolvedByName)
        );

        const actorId = hasResolvedLifeline
          ? (resolvedByName as string)
          : (nearest?.actorId || resolvedByName || actorDisplayName);
        nodeId = `SEQ_ACTOR_${actorId}`;
        break;
      }
      // Sequence message text
      if (currentNode.classList?.contains('messageText')) {
        foundNodeClass = true;
        // Find index among all messageText elements in the container
        const allMsgs = Array.from(containerRef.current?.querySelectorAll('.messageText') || []);
        const idx = allMsgs.indexOf(currentNode);
        nodeId = `SEQ_MSG_${idx >= 0 ? idx : 0}`;
        break;
      }
      // Sequence message line
      if (isSequenceMessageLineElement(currentNode)) {
        foundNodeClass = true;
        const allMsgTexts = Array.from(containerRef.current?.querySelectorAll('.messageText') || []) as SVGElement[];
        const lineRect = currentNode.getBoundingClientRect();
        const lineCenterY = lineRect.top + lineRect.height / 2;
        let idx = 0;
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < allMsgTexts.length; i += 1) {
          const tRect = allMsgTexts[i].getBoundingClientRect();
          const textCenterY = tRect.top + tRect.height / 2;
          const d = Math.abs(textCenterY - lineCenterY);
          if (d < best) {
            best = d;
            idx = i;
          }
        }
        nodeId = `SEQ_MSG_${idx}`;
        break;
      }
      // Sequence note text
      if (currentNode.classList?.contains('noteText')) {
        foundNodeClass = true;
        const allNotes = Array.from(containerRef.current?.querySelectorAll('.noteText') || []);
        const idx = allNotes.indexOf(currentNode);
        nodeId = `SEQ_NOTE_${idx >= 0 ? idx : 0}`;
        break;
      }
      currentNode = currentNode.parentElement as SVGElement | null;
    }

    if (foundNodeClass && currentNode && containerRef.current) {
        const cleanId = nodeId ? (nodeId.startsWith('SEQ_') ? nodeId : normalizeId(nodeId)) : null;

        // If it's an edge and we clicked the path itself, check if there is an .edgeLabel in the container for this edge.
        // If so, snap the currentNode to that label so that our selection/text boxes align perfectly on the label text.
        if (cleanId && isEdgeId(cleanId) && (currentNode.classList?.contains('flowchart-link') || currentNode.classList?.contains('flowchart-link-hit-target'))) {
            const edgeLabels = Array.from(containerRef.current.querySelectorAll('.edgeLabel'));
            const matchingLabel = edgeLabels.find(labelEl => {
                const dIdEl = labelEl.querySelector('[data-id]');
                const hasText = labelEl.textContent?.trim() !== '';
                return hasText && dIdEl && dIdEl.getAttribute('data-id') && normalizeId(dIdEl.getAttribute('data-id')!) === cleanId;
            });
            if (matchingLabel) {
                currentNode = matchingLabel as SVGElement;
            }
        }

        if (cleanId && isEdgeId(cleanId) && currentNode.classList?.contains('edgeLabel') && !currentNode.id) {
            currentNode.id = `edge-label-${cleanId}`;
        }

        if (cleanId && cleanId.startsWith('SEQ_ACTOR_') && !currentNode.id) {
          const b = currentNode.getBoundingClientRect();
          const actorKey = cleanId.replace('SEQ_ACTOR_', '').replace(/[^a-zA-Z0-9_]/g, '');
          currentNode.id = `seq-actor-${actorKey}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }
        if (cleanId && (cleanId.startsWith('SEQ_MSG_') || cleanId.startsWith('SEQ_NOTE_')) && !currentNode.id) {
            const seqIdx = cleanId.split('_').pop();
            currentNode.id = `seq-${cleanId.startsWith('SEQ_MSG_') ? 'msg' : 'note'}-${seqIdx}`;
        }

        let pathElementToMeasure = currentNode;
        if (currentNode.classList?.contains('flowchart-link-hit-target')) {
            const next = currentNode.nextElementSibling;
            const prev = currentNode.previousElementSibling;
            if (next && (next.classList?.contains('flowchart-link') || next.classList?.contains('path'))) {
                pathElementToMeasure = next as SVGElement;
            } else if (prev && (prev.classList?.contains('flowchart-link') || prev.classList?.contains('path'))) {
                pathElementToMeasure = prev as SVGElement;
            } else if (containerRef.current && cleanId) {
                const paths = Array.from(containerRef.current.querySelectorAll('path.flowchart-link:not(.flowchart-link-hit-target)'));
                for (const p of paths) {
                    if (p.id && normalizeId(p.id) === cleanId) {
                        pathElementToMeasure = p as SVGElement;
                        break;
                    }
                }
            }
        }

        if (cleanId && !currentNode.id && (currentNode.classList?.contains('node') || currentNode.classList?.contains('cluster'))) {
          const b = currentNode.getBoundingClientRect();
          const kind = currentNode.classList?.contains('cluster') ? 'cluster' : 'node';
          const key = cleanId.replace(/[^a-zA-Z0-9_]/g, '_');
          currentNode.id = `${kind}-${key}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }

        let rawSvgId = currentNode.id;
        let rect = pathElementToMeasure.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;
        
        let elementToMeasure = pathElementToMeasure;
        
        // For sequence actors (including special types like database), find rect.actor for accurate bounds
        if (cleanId && cleanId.startsWith('SEQ_ACTOR_')) {
            // Use rect.actor sibling for full-width selection bounds; text.actor is just the narrow label
            const parentGroup = currentNode.parentElement;
            const rectActor = parentGroup?.querySelector('rect.actor') as SVGElement | null;
            if (rectActor) {
                elementToMeasure = rectActor;
                rect = rectActor.getBoundingClientRect();
            } else {
                // Fallback: look for the first text element within the actor
                const textEls = Array.from(currentNode.querySelectorAll('text, tspan'));
                if (textEls.length > 0) {
                    elementToMeasure = textEls[0] as SVGElement;
                }
            }
        } else {
            // For non-actor elements, use the existing logic
            const innerText = currentNode.querySelector('.label > div, foreignObject > div, .label, foreignObject, text, .messageText, .noteText, .nodeLabel, .cluster-label');
            if (innerText) {
                elementToMeasure = innerText as SVGElement;
            } else if (currentNode.tagName === 'text' || currentNode.tagName === 'foreignObject' || currentNode.classList?.contains('label')) {
                elementToMeasure = currentNode;
            }
        }
        
        let textRect = elementToMeasure.getBoundingClientRect();

        // For sequence messages, always select text + underlying connection together.
        if (cleanId && cleanId.startsWith('SEQ_MSG_')) {
            const idx = parseInt(cleanId.replace('SEQ_MSG_', ''), 10);
            const allMsgTexts = Array.from(containerRef.current.querySelectorAll('.messageText')) as SVGElement[];
            const allMsgLines = Array.from(
              containerRef.current.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]')
            ) as SVGElement[];

            const pairedText = allMsgTexts[idx] || (currentNode.classList?.contains('messageText') ? currentNode : null);
            const pairedLine = pairedText
              ? findNearestLineForText(pairedText as SVGElement, allMsgLines)
              : (isSequenceMessageLineElement(currentNode) ? currentNode : null);

            const lineRect = pairedLine?.getBoundingClientRect();
            const labelRect = pairedText?.getBoundingClientRect();
            if (lineRect || labelRect) {
              const left = Math.min(lineRect?.left ?? Number.POSITIVE_INFINITY, labelRect?.left ?? Number.POSITIVE_INFINITY);
              const top = Math.min(lineRect?.top ?? Number.POSITIVE_INFINITY, labelRect?.top ?? Number.POSITIVE_INFINITY);
              const right = Math.max(lineRect?.right ?? Number.NEGATIVE_INFINITY, labelRect?.right ?? Number.NEGATIVE_INFINITY);
              const bottom = Math.max(lineRect?.bottom ?? Number.NEGATIVE_INFINITY, labelRect?.bottom ?? Number.NEGATIVE_INFINITY);
              rect = {
                left,
                top,
                right,
                bottom,
                width: Math.max(0, right - left),
                height: Math.max(0, bottom - top),
                x: left,
                y: top,
                toJSON: () => ({})
              } as DOMRect;
              textRect = (labelRect || lineRect)!;
              rawSvgId = (pairedLine as SVGElement | null)?.id || (pairedText as SVGElement | null)?.id || rawSvgId;
            }
        }
        
        const newSelectionBox = {
            x: (rect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
            y: (rect.top - containerRect.top + containerRef.current.scrollTop) / scale,
            width: rect.width / scale,
            height: rect.height / scale
        };

        const newTextBox = {
            x: (textRect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
            y: (textRect.top - containerRect.top + containerRef.current.scrollTop) / scale,
            width: textRect.width / scale,
            height: textRect.height / scale
        };
        
        return { cleanId, rawSvgId, newSelectionBox, newTextBox };
    }
    return null;
  }, [containerRef, normalizeId, resolveSequenceActorIdFromDisplayName, getSequenceLifelines, getSvgTextDisplayName]);

  const inlineInputRef = useRef<HTMLTextAreaElement>(null);
  // commitEditRef is a ref slot that LiveMaidEditor fills with handleEditSubmit.
  // The hook calls it before any cross-element or background transition so that
  // typed edits are committed to the diagram code before the selection changes.
  const commitEditRef = useRef<(() => void) | null>(null);
  const DOUBLE_CLICK_MS = 300;
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  // Set to true when click(detail=2) already handled the dblclick gesture so the capture-phase
  // native dblclick listener knows to skip — prevents double-invocation of handleEditClick.
  const dblClickHandledRef = useRef(false);
  // requestAnimationFrame handle for throttling mousemove
  const mouseMoveRafRef = useRef<number | null>(null);
  const mouseMoveInnerRef = useRef<((x: number, y: number, t: EventTarget | null, r: DOMRect | null) => void) | null>(null);

  const handleEditClick = useCallback((e: React.MouseEvent | Event) => {
    if ('stopPropagation' in e) e.stopPropagation();

    const currentType = determineDiagramType(code);
    if (!(currentType === 'graph' || currentType === 'flowchart' || currentType === 'sequence')) {
        return;
    }

    // Resolve actual SVG element via elementsFromPoint to bypass overlay divs
    let targetElement = e.target as Element;
    if ('clientX' in e && 'clientY' in e) {
      const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
      const svgElement = elementsAtPoint.find(el => el.tagName.toLowerCase() !== 'div' && el.namespaceURI === 'http://www.w3.org/2000/svg');
      if (svgElement) {
        targetElement = svgElement;
      } else {
        const firstEl = elementsAtPoint[0];
        if (firstEl) targetElement = firstEl;
      }
    }

    const result = getClickedNode(targetElement);
    // Use ref for selectedNodeId to avoid stale closure
    let targetNodeId = selectedNodeIdRef.current;

    // STATE MACHINE: handle EDIT_MODE → EDIT_MODE transitions (cross-element or empty-space double-click)
    if (isInlineEditing) {
      if (!result) {
        // Double-click on empty space while editing → commit and go to IDLE
        commitEditRef.current?.();
        setIsInlineEditing(false);
        return;
      }
      if (result.cleanId === selectedNodeIdRef.current) {
        return; // Same element — already in EDIT_MODE, no-op
      }
      // Cross-element double-click → commit current edit, then enter EDIT_MODE for new element
      commitEditRef.current?.();
      setIsInlineEditing(false);
    }

    if (result) {
        setSelectionBox(result.newSelectionBox);
        setTextBox(result.newTextBox);
        setSelectedNodeIdWithRef(result.cleanId);
        setSelectedSvgId(result.rawSvgId);
        targetNodeId = result.cleanId;
    }
    
    if (!targetNodeId) return;
    
    let currentText = targetNodeId;
    
    if (targetNodeId.startsWith('SEQ_ACTOR_')) {
        // Read the current display label from the actor declaration
        const actorId = targetNodeId.replace('SEQ_ACTOR_', '');
        const lines = code.split('\n');
        let foundLabel = actorId;
        for (const line of lines) {
            const trimmed = line.trim();
          const match = trimmed.match(/^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+)(?:\s*@\{[^}]*\})?(?:\s+as\s+(.+))?$/i);
            if (match) {
                const id = match[1];
                const alias = match[2];
                if (id === actorId) {
                    foundLabel = alias?.trim() || id;
                    break;
                }
            }
        }
        currentText = foundLabel;
    } else if (targetNodeId.startsWith('SEQ_MSG_')) {
        const idx = parseInt(targetNodeId.replace('SEQ_MSG_', ''), 10);
      const msgLines = getSequenceMessageEntries(code).map((entry) => entry.line);
      if (msgLines[idx]) {
        const colonIdx = msgLines[idx].indexOf(':');
        currentText = colonIdx !== -1 ? msgLines[idx].substring(colonIdx + 1).trim() : '';
        }
    } else if (targetNodeId.startsWith('SEQ_NOTE_')) {
        const idx = parseInt(targetNodeId.replace('SEQ_NOTE_', ''), 10);
        const noteLines = code.split('\n').filter(l => {
            const t = l.trim();
            return t.startsWith('Note ') || t.startsWith('note ');
        });
        if (noteLines[idx]) {
            const colonIdx = noteLines[idx].indexOf(':');
            currentText = colonIdx !== -1 ? noteLines[idx].substring(colonIdx + 1).trim() : '';
        }
    } else if (targetNodeId.startsWith('SEQ_')) {
        currentText = targetNodeId.replace('SEQ_', '');
        currentText = currentText.replace(/<br\/>/g, '\n');
    } else if (isEdgeId(targetNodeId)) {
        const { src, dst, occurrenceIndex } = parseEdgeId(targetNodeId);
        if (src && dst) {
            const lines = code.split('\n');
            let currentOccurrence = 0;
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
                    continue;
                }
                const linkLineRegex = new RegExp(`(^|\\s*)${src}(?:\\b|(?=[xoXO]))[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)(?:\\b|(?<=[xoXO]))${dst}\\b`, 'i');
                const match = line.match(linkLineRegex);
                if (match) {
                    if (currentOccurrence === occurrenceIndex) {
                        const middlePart = match[2];
                        const barMatch = middlePart.match(/\|([^|]*)\|/);
                        const quoteMatch = middlePart.match(/"([^"]*)"/);
                        if (quoteMatch) {
                            currentText = quoteMatch[1];
                        } else if (barMatch) {
                            currentText = barMatch[1];
                        } else {
                            currentText = '';
                        }
                        break;
                    }
                    currentOccurrence++;
                }
            }
        }
    } else {
        const nodeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${targetNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`, 'm');
        const match = code.match(nodeRegex);
        if (match && match[3]) {
            currentText = match[3];
        } else {
            const innerText = result?.rawSvgId ? document.querySelector(`#${result.rawSvgId} .label, #${result.rawSvgId} text, #${result.rawSvgId} foreignObject, #${result.rawSvgId} .nodeLabel`) : null;
            if (innerText && innerText.textContent) {
                currentText = innerText.textContent.trim();
            }
        }
    }
    
    setEditingText(currentText);
    setIsInlineEditing(true);
    setTimeout(() => {
        if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            inlineInputRef.current.select();
        }
    }, 10);
  }, [code, getClickedNode, setSelectedNodeIdWithRef, determineDiagramType, getSequenceMessageEntries, isInlineEditing]);


  const handleSvgClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const debugClicks = (() => {
      if (typeof window === 'undefined') return false;
      const w = window as Window & { __LM_DEBUG_CLICKS?: boolean };
      return Boolean(w.__LM_DEBUG_CLICKS) || window.localStorage.getItem('livemaid:debug-clicks') === '1';
    })();

    const debugLog = (...args: unknown[]) => {
      if (debugClicks) console.log('[canvas-click]', ...args);
    };

    if (isLocked) return;

    const target = e.target as HTMLElement;
    if (target.closest('[data-scale-lock]') || target.closest('[data-scale-lock-border]') || target.closest('[data-inline-toolbar]')) {
      debugLog('ignored-ui-target', target.tagName);
      return;
    }

    const clicked = getClickedNode(target);
    debugLog('target', target.tagName, { id: target.id, clicked: clicked?.cleanId ?? null, inlineEditing: isInlineEditing });

    // Robust double-click entry: some Mermaid SVG/foreignObject targets do not
    // consistently dispatch React onDoubleClick. Use click count from the shared
    // handler so double-click on the currently selected element always enters edit mode.
    if (e.detail >= 2 && clicked && clicked.cleanId === selectedNodeIdRef.current && !isInlineEditing) {
      debugLog('enter-edit-mode-double-click', clicked.cleanId);
      handleEditClick(e);
      return;
    }

    // State transition rule:
    // - Same element while editing: keep editing.
    // - Different element/background while editing: commit current edit, then continue selection flow.
    if (isInlineEditing) {
      if (clicked && clicked.cleanId === selectedNodeIdRef.current) {
        debugLog('stay-in-edit-mode', clicked.cleanId);
        return;
      }
      debugLog('commit-edit-before-transition', { from: selectedNodeIdRef.current, to: clicked?.cleanId ?? null });
      commitEditRef.current?.();
      setIsInlineEditing(false);
    }
    
    if (clicked) {
      debugLog('select', clicked.cleanId);
      setSelectedNodeIdWithRef(clicked.cleanId);
      setSelectedSvgId(clicked.rawSvgId);
      setSelectionBox(clicked.newSelectionBox);
      setTextBox(clicked.newTextBox);
    } else {
      debugLog('clear-selection');
      setSelectedNodeIdWithRef(null);
      setSelectedSvgId(null);
      setSelectionBox(null);
      setTextBox(null);
    }
  }, [getClickedNode, isLocked, isInlineEditing, setSelectedNodeIdWithRef, setIsInlineEditing, handleEditClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      // Throttle to one execution per animation frame — prevents expensive DOM work
      // (getBoundingClientRect, SVG traversal, lifeline calculations) from running on
      // every pixel of mouse movement.
      if (mouseMoveRafRef.current !== null) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      const eventTarget = e.target;
      // Capture the container rect SYNCHRONOUSLY at event time so that the RAF
      // callback uses a rect that is consistent with the clientX/clientY values.
      // If we defer getBoundingClientRect() to RAF time, a CSS animation or
      // velocity-based pan that runs between the event and the RAF can shift the
      // container, producing a systematic offset in the computed canvas position.
      const containerRect = containerRef.current?.getBoundingClientRect() ?? null;
      mouseMoveRafRef.current = requestAnimationFrame(() => {
        mouseMoveRafRef.current = null;
        mouseMoveInnerRef.current?.(clientX, clientY, eventTarget, containerRect);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const _handleMouseMoveInner = useCallback((clientX: number, clientY: number, eventTarget: EventTarget | null, capturedContainerRect: DOMRect | null) => {
      const container = containerRef.current;
      if (!container) return;
      // Use the rect captured synchronously at event time. Falling back to a fresh
      // getBoundingClientRect() only when no pre-captured rect is provided (e.g.,
      // callers that don't go through the RAF throttle path).
      const containerRectForScale = capturedContainerRect ?? container.getBoundingClientRect();
      const scale = containerRectForScale.width / container.offsetWidth;
      const diagramType = determineDiagramType(code);
      const e = { clientX, clientY, target: eventTarget } as React.MouseEvent<HTMLDivElement>;

      const mouseX = (e.clientX - containerRectForScale.left + container.scrollLeft) / scale;
      const mouseY = (e.clientY - containerRectForScale.top + container.scrollTop) / scale;

      if (diagramType === 'sequence') {
        const actorTarget = (e.target as Element | null)?.closest('.actor') as SVGElement | null;
        if (actorTarget) {
          // Prefer rect.actor for accurate full-width bounds; text.actor is just the label (narrow)
          let boundsEl: SVGElement = actorTarget;
          if (actorTarget.tagName.toLowerCase() === 'text') {
            const parentGroup = actorTarget.parentElement;
            const rectActor = parentGroup?.querySelector('rect.actor') as SVGElement | null;
            if (rectActor) boundsEl = rectActor;
          }
          const actorRect = boundsEl.getBoundingClientRect();
          setHoveredSequenceActorBox({
            x: (actorRect.left - containerRectForScale.left + container.scrollLeft) / scale,
            y: (actorRect.top - containerRectForScale.top + container.scrollTop) / scale,
            width: actorRect.width / scale,
            height: actorRect.height / scale,
          });
        } else {
          setHoveredSequenceActorBox(null);
        }
        setHoveredFlowchartNodeBox(null);
        updateSequenceMessageHoverHighlight(e.target);
      } else if (diagramType === 'flowchart' || diagramType === 'graph') {
        setHoveredSequenceActorBox(null);
        clearSequenceMessageHoverHighlight();
        // Show hover highlight on flowchart nodes.
        // Fallback: tiny rendered nodes can miss direct target resolution and surface as svg/container.
        let nodeTarget = (e.target as Element | null)?.closest('.node') as SVGElement | null;
        if (!nodeTarget) {
          const candidates = Array.from(
            container.querySelectorAll('.node')
          ) as SVGGraphicsElement[];
          const pad = 8;
          let best: { el: SVGGraphicsElement; area: number } | null = null;
          for (const el of candidates) {
            const r = el.getBoundingClientRect();
            const inside =
              clientX >= r.left - pad &&
              clientX <= r.right + pad &&
              clientY >= r.top - pad &&
              clientY <= r.bottom + pad;
            if (!inside) continue;
            const area = Math.max(1, r.width * r.height);
            if (!best || area < best.area) {
              best = { el, area };
            }
          }
          nodeTarget = best ? (best.el as SVGElement) : null;
        }

        if (nodeTarget && !isInlineEditing) {
          const nodeRect = nodeTarget.getBoundingClientRect();
          const hoverBox = {
            x: (nodeRect.left - containerRectForScale.left + container.scrollLeft) / scale,
            y: (nodeRect.top - containerRectForScale.top + container.scrollTop) / scale,
            width: nodeRect.width / scale,
            height: nodeRect.height / scale,
          };
          setHoveredFlowchartNodeBox(hoverBox);
        } else {
          setHoveredFlowchartNodeBox(null);
        }
      } else {
        setHoveredSequenceActorBox(null);
        setHoveredFlowchartNodeBox(null);
        clearSequenceMessageHoverHighlight();
      }

        if (diagramType === 'sequence') {
          const lifelines = getSequenceLifelines();

          if (connectionState.active && connectionState.startNodeId?.startsWith('SEQ_ACTOR_')) {
              const sourceActorId = connectionState.startNodeId.replace('SEQ_ACTOR_', '');
              const sourceLifeline = lifelines.find(l => l.actorId === sourceActorId);
              if (!sourceLifeline) return;

              const sourceSlots = getSequenceAnchorSlots(sourceLifeline);
              const anchorY = connectionState.anchorY ?? findNearestSlot(sourceSlots, mouseY);
              const snappedAnchorY = findNearestSlot(sourceSlots, anchorY);

              const snapThreshold = 28 / scale;
              let snapTargetId: string | null = null;
              let snapTargetPos: { x: number, y: number } | null = null;
              for (const lifeline of lifelines) {
                if (Math.abs(lifeline.x - mouseX) <= snapThreshold) {
                  snapTargetId = `SEQ_ACTOR_${lifeline.actorId}`;
                  snapTargetPos = { x: lifeline.x, y: snappedAnchorY };
                  break;
                }
              }

              setConnectionState(prev => ({
                  ...prev,
                  isDragging: true,
                  mousePos: {
                      x: snapTargetPos?.x ?? mouseX,
                      y: snappedAnchorY
                  },
                  anchorY: snappedAnchorY,
                  snapTargetId,
                  snapTargetPos
              }));
              setSequenceLifelineOverlay(null);
              return;
          }

          // Compute adaptive threshold based on lifeline spacing to prevent false triggers
          // on dense diagrams (many participants). With 16+ participants zoomed out,
          // a fixed 44px threshold matches almost everywhere — so we cap at 45% of spacing.
          const sortedByX = [...lifelines].sort((a, b) => a.x - b.x);
          const minSpacing = sortedByX.length > 1
            ? Math.min(...sortedByX.slice(1).map((l, i) => l.x - sortedByX[i].x))
            : Infinity;
          const hoverThreshold = Number.isFinite(minSpacing) ? Math.min(44, minSpacing * 0.45) : 44;

          // Find the nearest lifeline (not just the first within threshold)
          const nearestLifeline = lifelines.reduce<{ l: (typeof lifelines)[0] | null; dist: number }>(
            (best, l) => {
              if (mouseY < l.y1 - 8 || mouseY > l.y2 + 30) return best;
              const dist = Math.abs(l.x - mouseX);
              return dist < best.dist ? { l, dist } : best;
            },
            { l: null, dist: hoverThreshold }
          ).l;
          if (nearestLifeline) {
            setSequenceLifelineOverlay({
              actorId: nearestLifeline.actorId,
              x: nearestLifeline.x,
              slots: getSequenceAnchorSlots(nearestLifeline, mouseY),
            });
          } else if (!connectionState.active) {
            setSequenceLifelineOverlay(null);
          }
      } else {
        setSequenceLifelineOverlay(null);
        setHoveredSequenceActorBox(null);
      }

      if (connectionState.active && connectionState.startNodeId) {
          setConnectionState(prev => ({
              ...prev,
              isDragging: true,
              mousePos: {
                  x: mouseX,
                  y: mouseY
              }
          }));
      }
  }, [
    connectionState.active,
    connectionState.startNodeId,
    connectionState.anchorY,
    containerRef,
    code,
    determineDiagramType,
    findNearestSlot,
    getSequenceAnchorSlots,
    getSequenceLifelines,
    selectedNodeId,
    getSelectedMessageOverlay,
    updateSequenceMessageHoverHighlight,
    clearSequenceMessageHoverHighlight
  ]);
  // Keep mouseMoveInnerRef always pointing at the latest version (avoids stale closure in RAF)
  mouseMoveInnerRef.current = _handleMouseMoveInner;

  const handleAddNodeFromSelected = useCallback((
      startId: string | null, 
      targetNodeId?: string,
      shape?: { b?: [string, string] | null, isText?: boolean, expanded?: string, l?: string },
      sequenceInsertIndex?: number
  ) => {
      if (!startId) return;
      
      const diagramType = determineDiagramType(code);
      let newCode = code;

      const getNextNodeId = (codeStr: string, prefix: string = 'n'): string => {
          let i = 1;
          while (new RegExp(`(^|[^a-zA-Z0-9_])${prefix}${i}([^a-zA-Z0-9_]|$)`, 'm').test(codeStr)) i++;
          return `${prefix}${i}`;
      };

      if (diagramType === 'flowchart' || diagramType === 'graph') {
          if (targetNodeId && targetNodeId !== startId) {
              newCode += `\n    ${startId} --> ${targetNodeId}`;
          } else {
              const prefix = startId.match(/^([a-zA-Z]+)/)?.[1] || 'n';
              const newNodeId = getNextNodeId(code, prefix);
              const label = "New Node";
              let nodeDef = "";
              if (shape) {
                  if (shape.isText) {
                      nodeDef = `${newNodeId}["Text Block"]\n    ${newNodeId}@{ shape: text }`;
                  } else if (shape.expanded) {
                      nodeDef = `${newNodeId}@{ shape: ${shape.expanded}, label: "${label}" }`;
                  } else if (shape.b) {
                      const brackets = shape.b as [string, string];
                      nodeDef = `${newNodeId}${brackets[0]}${label}${brackets[1]}`;
                  } else {
                      nodeDef = `${newNodeId}[${label}]`;
                  }
              } else {
                  nodeDef = `${newNodeId}[${label}]`;
              }
              
              if (shape && (shape.expanded || shape.isText)) {
                  newCode += `\n    ${nodeDef}\n    ${startId} --> ${newNodeId}`;
              } else {
                  newCode += `\n    ${startId} --> ${nodeDef}`;
              }
          }
      } else if (diagramType === 'sequence') {
          const actor = startId.replace('SEQ_ACTOR_', '');
          if (targetNodeId && targetNodeId !== startId && targetNodeId.startsWith('SEQ_ACTOR_')) {
              const targetActor = targetNodeId.replace('SEQ_ACTOR_', '');
              const messageLine = `${actor}->>${targetActor}: new msg`;
              if (typeof sequenceInsertIndex === 'number' && Number.isFinite(sequenceInsertIndex) && sequenceInsertIndex >= 0) {
                newCode = insertSequenceMessageAtIndex(newCode, messageLine, sequenceInsertIndex);
              } else {
                newCode += `\n    ${messageLine}`;
              }
          } else if (targetNodeId && targetNodeId === startId) {
              const selfLoopLine = `${actor}->>${actor}: new msg`;
              if (typeof sequenceInsertIndex === 'number' && Number.isFinite(sequenceInsertIndex) && sequenceInsertIndex >= 0) {
                newCode = insertSequenceMessageAtIndex(newCode, selfLoopLine, sequenceInsertIndex);
              } else {
                newCode += `\n    ${selfLoopLine}`;
              }
          } else {
              newCode += `\n    ${actor}->>NewActor: new msg`;
          }
      }
      
      handleCodeChange(newCode);
  }, [code, handleCodeChange, determineDiagramType, insertSequenceMessageAtIndex]);

  const startSequenceConnection = useCallback((actorId: string, anchorY: number) => {
    const lifeline = getSequenceLifelines().find(l => l.actorId === actorId);
    setConnectionState({
      active: true,
      startNodeId: `SEQ_ACTOR_${actorId}`,
      startPos: lifeline ? { x: lifeline.x, y: anchorY } : null,
      mousePos: { x: 0, y: anchorY },
      isDragging: false,
      snapTargetId: null,
      snapTargetPos: null,
      anchorY,
    });
  }, [getSequenceLifelines]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      clearSequenceMessageHoverHighlight();
      setHoveredFlowchartNodeBox(null);
      if (connectionState.active && connectionState.startNodeId) {
        const diagramType = determineDiagramType(code);
        if (connectionState.isDragging) {
          if (diagramType === 'sequence' && connectionState.startNodeId.startsWith('SEQ_ACTOR_')) {
            const targetId = connectionState.snapTargetId;
            if (targetId) {
              const insertIndex = connectionState.anchorY !== null
                ? getSequenceInsertIndexForAnchor(connectionState.anchorY)
                : undefined;
              handleAddNodeFromSelected(connectionState.startNodeId, targetId, undefined, insertIndex);
            }
          } else {
            const result = getClickedNode(e.target as Element);
            if (result && result.cleanId && result.cleanId !== connectionState.startNodeId) {
              handleAddNodeFromSelected(connectionState.startNodeId, result.cleanId);
            } else if (!result) {
              // Dropped on empty space - trigger the shape selector
              if (diagramType === 'flowchart' || diagramType === 'graph') {
                if (containerRef.current) {
                  const viewport = containerRef.current.closest('.relative.overflow-hidden');
                  const rect = viewport ? viewport.getBoundingClientRect() : containerRef.current.getBoundingClientRect();
                  setShapePicker({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    startNodeId: connectionState.startNodeId
                  });
                }
              }
            }
          }
        }
        setConnectionState({
          active: false,
          startNodeId: null,
          startPos: null,
          mousePos: null,
          isDragging: false,
          snapTargetId: null,
          snapTargetPos: null,
          anchorY: null,
        });
      }
      setSequenceLifelineOverlay(null);
  }, [
    connectionState,
    getClickedNode,
    handleAddNodeFromSelected,
    code,
    determineDiagramType,
    containerRef,
    getSequenceInsertIndexForAnchor,
    clearSequenceMessageHoverHighlight
  ]);

  useEffect(() => {
    return () => {
      clearSequenceMessageHoverHighlight();
      setHoveredSequenceActorBox(null);
    };
  }, [clearSequenceMessageHoverHighlight]);

  // Synchronized hover highlighting for edge paths and their labels
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const getCanonicalEdgeId = (el: HTMLElement | SVGElement | null): string | null => {
      if (!el) return null;
      
      // 1. If it has class edgeLabel or is inside one, find the data-id
      const labelEl = el.closest('.edgeLabel');
      if (labelEl) {
        const dataIdEl = labelEl.querySelector('[data-id]');
        if (dataIdEl) {
          const rawId = dataIdEl.getAttribute('data-id');
          if (rawId) return normalizeId(rawId);
        }
      }

      // 2. If it's a path or flowchart-link or hit target
      let current: SVGElement | null = el as SVGElement;
      while (current && current.tagName !== 'svg') {
        if (current.id) {
          const cleanId = normalizeId(current.id);
          if (isEdgeId(cleanId)) {
            return cleanId;
          }
        }
        current = current.parentElement as SVGElement | null;
      }
      return null;
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const canonicalEdgeId = getCanonicalEdgeId(target);

      if (canonicalEdgeId) {
        // Clear any existing hover highlights first to prevent stale highlights
        container.querySelectorAll('.edge-hover-highlight').forEach(el => {
          el.classList.remove('edge-hover-highlight');
        });

        // Highlight matched visible paths
        const allPaths = container.querySelectorAll('path.flowchart-link, path.path');
        allPaths.forEach((path: any) => {
          if (path.id && normalizeId(path.id) === canonicalEdgeId && !path.classList.contains('flowchart-link-hit-target')) {
            path.classList.add('edge-hover-highlight');
          }
        });

        // Highlight matched labels
        const allLabels = container.querySelectorAll('.edgeLabel');
        allLabels.forEach((label: any) => {
          const dataIdEl = label.querySelector('[data-id]');
          if (dataIdEl) {
            const rawId = dataIdEl.getAttribute('data-id');
            if (rawId && normalizeId(rawId) === canonicalEdgeId) {
              label.classList.add('edge-hover-highlight');
            }
          }
        });
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const relatedTarget = e.relatedTarget as HTMLElement;
      
      const currentCanonicalId = getCanonicalEdgeId(target);
      const relatedCanonicalId = getCanonicalEdgeId(relatedTarget);

      // If we are moving within the same edge, don't clear highlights
      if (currentCanonicalId && currentCanonicalId === relatedCanonicalId) {
        return;
      }

      // Otherwise, clear highlights
      container.querySelectorAll('.edge-hover-highlight').forEach(el => {
        el.classList.remove('edge-hover-highlight');
      });

      // If we moved to another edge, highlight it
      if (relatedCanonicalId) {
        const allPaths = container.querySelectorAll('path.flowchart-link, path.path');
        allPaths.forEach((path: any) => {
          if (path.id && normalizeId(path.id) === relatedCanonicalId && !path.classList.contains('flowchart-link-hit-target')) {
            path.classList.add('edge-hover-highlight');
          }
        });

        const allLabels = container.querySelectorAll('.edgeLabel');
        allLabels.forEach((label: any) => {
          const dataIdEl = label.querySelector('[data-id]');
          if (dataIdEl) {
            const rawId = dataIdEl.getAttribute('data-id');
            if (rawId && normalizeId(rawId) === relatedCanonicalId) {
              label.classList.add('edge-hover-highlight');
            }
          }
        });
      }
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
    };
  }, [containerRef, svgContent, normalizeId]);

  // Capture-phase native dblclick listener: fires BEFORE any child element handlers,
  // bypassing toolbar buttons that call e.stopPropagation() on 'click' (not 'dblclick').
  // This ensures double-clicking when the toolbar overlaps the node still enters EDIT_MODE.
  // handleEditClick is idempotent — if already in EDIT_MODE for the same node, it no-ops.
  const handleEditClickRef = useRef(handleEditClick);
  handleEditClickRef.current = handleEditClick; // always current; updated every render

  useEffect(() => {
    if (isLocked) return;

    const handleNativeDblClick = (e: MouseEvent) => {
      // Only handle dblclicks within the canvas container (not toolbar overlays outside it, etc.)
      const container = containerRef.current;
      if (!container || !container.contains(e.target as Node)) return;

      // If click(detail=2) already handled this dblclick gesture, skip to avoid double-invocation.
      // (The capture listener fires AFTER click(detail=2) has already entered EDIT_MODE.)
      if (dblClickHandledRef.current) {
        dblClickHandledRef.current = false;
        return;
      }
      handleEditClickRef.current(e as unknown as React.MouseEvent);
    };

    // Register on document (capture phase) — above react-zoom-pan-pinch's TransformWrapper which
    // intercepts dblclick at its own capture listener (even when doubleClick.disabled=true).
    document.addEventListener('dblclick', handleNativeDblClick, true);
    return () => document.removeEventListener('dblclick', handleNativeDblClick, true);
  }, [isLocked]); // re-runs if locked state changes

  return {
    selectedNodeId, setSelectedNodeId,
    selectedNodeIds: [] as string[],
    setSelectedNodeIds: (_: string[]) => {},
    selectedSvgId, setSelectedSvgId,
    selectionBox, setSelectionBox,
    textBox, setTextBox,
    editingText, setEditingText,
    isInlineEditing, setIsInlineEditing,
    connectionState, setConnectionState,
    sequenceLifelineOverlay,
    hoveredSequenceActorBox,
    hoveredSequenceMessageBox,
    hoveredFlowchartNodeBox,
    sequenceMessageTriggerAreas,
    dragState: null as null,
    setDragState: (_: any) => {},
    startSequenceConnection,
    inlineInputRef,
    commitEditRef,
    getClickedNode,
    handleSvgClick,
    handleMouseMove,
    handleMouseUp,
    handleEditClick,
    handleAddNodeFromSelected,
    triggerHoveredSequenceMessageSelection,
    triggerSequenceMessageHoverByIndex,
    shapePicker,
    setShapePicker,
    // Note handling functions
    getSequenceNoteEntries,
    insertSequenceNoteAtIndex,
    updateNotePosition,
    deleteSequenceNote,
    getSequenceInsertIndexForAnchor,
  };
}
