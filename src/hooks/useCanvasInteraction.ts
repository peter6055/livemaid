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

  const resolveSequenceActorIdFromDisplayName = useCallback((displayName: string) => {
    const entries = getSequenceParticipantEntries();
    const byAlias = entries.find(e => e.alias === displayName);
    if (byAlias) return byAlias.id;
    const byId = entries.find(e => e.id === displayName);
    if (byId) return byId.id;
    return displayName;
  }, [getSequenceParticipantEntries]);

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
              text: t.textContent?.trim() || '',
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
  }, [containerRef, resolveSequenceActorIdFromDisplayName]);

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

  const parseSequenceMessageActors = useCallback((line: string) => {
    const match = line.trim().match(/^(\S+)\s*(?:-->>|-->|->>|->|-\))\s*(\S+)\s*:/);
    if (!match) return null;
    return {
      from: match[1],
      to: match[2],
    };
  }, []);

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
        if (centerY >= start && centerY <= lifeline.y2 + 28) {
          rowAnchors.push(Math.round(centerY));
        }
      }
    }

    const rows = [...new Set(rowAnchors)].sort((a, b) => a - b);

    // Empty lifeline: one dynamic handle that follows hover and snaps to safe bounds.
    if (rows.length === 0) {
      const fallbackY = hoverY ?? ((start + end) / 2);
      return [Math.round(Math.max(start, Math.min(end, fallbackY)))];
    }

    // Existing messages: create insertion lanes around attached messages.
    // This yields one slot above the first, one between each adjacent pair,
    // and one below the last (rows + 1 total before clamping/dedup).
    const VERTICAL_GRID_STEP = 56;
    const firstGap = rows.length > 1 ? Math.max(38, Math.round((rows[1] - rows[0]) * 0.9)) : VERTICAL_GRID_STEP;
    const lastGap = rows.length > 1
      ? Math.max(28, Math.round((rows[rows.length - 1] - rows[rows.length - 2]) / 2))
      : VERTICAL_GRID_STEP;
    const targetYs: number[] = [];
    targetYs.push(Math.round(rows[0] - firstGap));

    for (let i = 0; i < rows.length - 1; i += 1) {
      targetYs.push(Math.round((rows[i] + rows[i + 1]) / 2));
    }

    targetYs.push(Math.round(rows[rows.length - 1] + lastGap));

    const contextual = targetYs
      .map((y) => Math.max(start, Math.min(end, y)))
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
      // Prefer geometry-based matching from actorId -> lifeline x, then choose header (topmost) rect at that x.
      let bestRect: Element | null = null;
      const lifeline = getSequenceLifelines().find(l => l.actorId === actorId);
      if (lifeline) {
        const actorElements = Array.from(containerRef.current.querySelectorAll('.actor')) as SVGElement[];
        const byX = actorElements
          .map(el => {
            const b = el.getBoundingClientRect();
            return {
              el,
              top: b.top,
              centerX: b.left + b.width / 2,
              dx: Math.abs((b.left + b.width / 2) - lifeline.x),
            };
          })
          .filter(item => Number.isFinite(item.centerX) && Number.isFinite(item.dx) && item.dx < 120)
          .sort((a, b) => (a.dx - b.dx) || (a.top - b.top));
        if (byX[0]) {
          const minDx = byX[0].dx;
          const sameTrack = byX.filter(item => Math.abs(item.dx - minDx) < 1.5).sort((a, b) => a.top - b.top);
          bestRect = (sameTrack[0] || byX[0]).el;
        }
      }

      // Fallback to text-based matching when geometry resolution fails.
      if (!bestRect) {
        let bestY = Infinity;
        for (const g of Array.from(containerRef.current.querySelectorAll('g'))) {
          const directTexts = Array.from(g.children).filter((c): c is Element => c.tagName === 'text');
          if (directTexts.some(t => t.textContent?.trim() === actorDisplayName)) {
            const rectEl = g.querySelector('rect') || g;
            const b = (rectEl as SVGElement).getBoundingClientRect();
            if (b.top < bestY) {
              bestY = b.top;
              bestRect = rectEl;
            }
          }
        }
      }

      if (bestRect) {
        foundElement = bestRect as SVGElement;
        if (!bestRect.id) {
          (bestRect as SVGElement).id = `seq-actor-${actorId.replace(/[^a-zA-Z0-9_]/g, '')}`;
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

    if (foundElement && containerRef.current) {
      const rect = foundElement.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = containerRect.width / containerRef.current.offsetWidth;
      
      let elementToMeasure = foundElement;
      const innerText = foundElement.querySelector('.label > div, foreignObject > div, .label, foreignObject, text, .messageText, .noteText, .nodeLabel, .cluster-label');
      if (innerText) {
          elementToMeasure = innerText as SVGElement;
      } else if (foundElement.tagName === 'text' || foundElement.tagName === 'foreignObject' || foundElement.classList?.contains('label')) {
          elementToMeasure = foundElement;
      }
      const textRect = elementToMeasure.getBoundingClientRect();
      
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
      setSelectedNodeId(null);
      setSelectedSvgId(null);
    }
  }, [selectedNodeId, containerRef, renderIdRef, normalizeId, resolveSequenceDisplayNameFromActorId, getSequenceLifelines]);

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

        const actorDisplayName = currentNode.textContent?.trim() || '';
        const clickedRect = currentNode.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();
        const scale = containerRect.width / containerEl.offsetWidth;
        const clickedX = (clickedRect.left - containerRect.left + containerEl.scrollLeft + clickedRect.width / 2) / scale;

        const lifelines = getSequenceLifelines();
        const nearest = lifelines
          .map(l => ({ actorId: l.actorId, d: Math.abs(l.x - clickedX) }))
          .sort((a, b) => a.d - b.d)[0];

        const actorId = nearest?.actorId || resolveSequenceActorIdFromDisplayName(actorDisplayName);
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
        const allMsgLines = Array.from(containerRef.current?.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]') || []);
        const idx = allMsgLines.indexOf(currentNode);
        nodeId = `SEQ_MSG_${idx >= 0 ? idx : 0}`;
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
            currentNode.id = `seq-actor-${cleanId.replace('SEQ_ACTOR_', '').replace(/[^a-zA-Z0-9_]/g, '')}`;
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

        const rawSvgId = currentNode.id;
        const rect = pathElementToMeasure.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;
        
        let elementToMeasure = pathElementToMeasure;
        
        // For sequence actors (including special types like database), find the text more precisely
        if (cleanId && cleanId.startsWith('SEQ_ACTOR_')) {
            // For sequence actors, look for the actual text element (tspan or text) within the actor
            const textEls = Array.from(currentNode.querySelectorAll('text, tspan'));
            if (textEls.length > 0) {
                // Use the first text element found within the actor
                elementToMeasure = textEls[0] as SVGElement;
            } else {
                // Fallback to looking for label containers
                const innerText = currentNode.querySelector('.label > div, foreignObject > div, .label, foreignObject');
                if (innerText) {
                    elementToMeasure = innerText as SVGElement;
                } else if (currentNode.tagName === 'foreignObject') {
                    elementToMeasure = currentNode;
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
        
        const textRect = elementToMeasure.getBoundingClientRect();
        
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
  }, [containerRef, normalizeId, resolveSequenceActorIdFromDisplayName, getSequenceLifelines]);

  const inlineInputRef = useRef<HTMLTextAreaElement>(null);

  const handleEditClick = useCallback((e: React.MouseEvent | Event) => {
    if ('stopPropagation' in e) e.stopPropagation();
    
    const currentType = determineDiagramType(code);
    if (!(currentType === 'graph' || currentType === 'flowchart' || currentType === 'sequence')) {
        return;
    }

    const result = getClickedNode(e.target as Element);
    let targetNodeId = selectedNodeId;

    if (result) {
        setSelectionBox(result.newSelectionBox);
        setTextBox(result.newTextBox);
        setSelectedNodeId(result.cleanId);
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
  }, [code, getClickedNode, selectedNodeId, determineDiagramType, getSequenceMessageEntries]);

  const lastClickTimeRef = useRef<number>(0);

  const handleSvgClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isLocked) return;
    if (isInlineEditing) return;

    const container = containerRef.current;
    if (!container) return;
    const containerRectForScale = container.getBoundingClientRect();
    const scale = containerRectForScale.width / container.offsetWidth;

    const currentTime = new Date().getTime();
    const timeSinceLastClick = currentTime - lastClickTimeRef.current;
    
    if (timeSinceLastClick < 300) {
        lastClickTimeRef.current = 0;
        handleEditClick(e);
        return;
    }
    lastClickTimeRef.current = currentTime;

    // Shift browser focus away from any text editors/inputs so global delete shortcuts are active
    if (typeof document !== 'undefined' && document.activeElement && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
    // Prevent triggering click on selection components
    const target = e.target as HTMLElement;
    if (target.closest('[data-scale-lock]') || target.closest('[data-scale-lock-border]') || target.closest('[data-inline-toolbar]')) {
        return;
    }

    const clicked = getClickedNode(target);
    if (clicked) {
        setSelectedNodeId(clicked.cleanId);
        setSelectedSvgId(clicked.rawSvgId);
        
        const parent = document.getElementById(clicked.rawSvgId);
        if (parent) {
            const rect = parent.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Unscaled canvas coordinates
            const x = (rect.left - containerRect.left + container.scrollLeft) / scale;
            const y = (rect.top - containerRect.top + container.scrollTop) / scale;
            const w = rect.width / scale;
            const h = rect.height / scale;
            
            setSelectionBox({ x, y, width: w, height: h });
            
            // Node-level label extraction for inline editor
            const labelEl = parent.querySelector('.label, text, .nodeLabel');
            if (labelEl) {
                const labelRect = labelEl.getBoundingClientRect();
                const tx = (labelRect.left - containerRect.left + container.scrollLeft) / scale;
                const ty = (labelRect.top - containerRect.top + container.scrollTop) / scale;
                const tw = labelRect.width / scale;
                const th = labelRect.height / scale;
                setTextBox({ x: tx, y: ty, width: tw, height: th });
            } else {
                setTextBox({ x, y, width: w, height: h });
            }
        }
    } else {
        // If clicking background/empty space, check if clicking a flowchart link (edge path) or edge label
        let current: SVGElement | null = e.target as SVGElement;
        let edgeFound = false;
        
        // Let's check if we clicked on an edge path or label
        while (current && current.tagName !== 'svg') {
          if (current.id) {
            const cleanId = normalizeId(current.id);
            if (isEdgeId(cleanId)) {
              setSelectedNodeId(cleanId);
              setSelectedSvgId(current.id);
              
              const rect = current.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              
              const x = (rect.left - containerRect.left + container.scrollLeft) / scale;
              const y = (rect.top - containerRect.top + container.scrollTop) / scale;
              const w = rect.width / scale;
              const h = rect.height / scale;
              
              setSelectionBox({ x, y, width: w, height: h });
              
              // Edge-level label selection
              const labelEl = current.closest('.edgePath')?.querySelector('.edgeLabel') || current.querySelector('.edgeLabel');
              if (labelEl) {
                const labelRect = labelEl.getBoundingClientRect();
                const tx = (labelRect.left - containerRect.left + container.scrollLeft) / scale;
                const ty = (labelRect.top - containerRect.top + container.scrollTop) / scale;
                const tw = labelRect.width / scale;
                const th = labelRect.height / scale;
                setTextBox({ x: tx, y: ty, width: tw, height: th });
              } else {
                setTextBox({ x, y, width: w, height: h });
              }
              
              edgeFound = true;
              break;
            }
          }
          current = current.parentElement as SVGElement | null;
        }

        if (!edgeFound) {
          setSelectedNodeId(null);
          setSelectedSvgId(null);
          setSelectionBox(null);
          setTextBox(null);
          setIsInlineEditing(false);
        }
    }
  }, [getClickedNode, containerRef, normalizeId, handleEditClick, isLocked, isInlineEditing]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      const containerRectForScale = container.getBoundingClientRect();
      const scale = containerRectForScale.width / container.offsetWidth;
      const diagramType = determineDiagramType(code);

      const mouseX = (e.clientX - containerRectForScale.left + container.scrollLeft) / scale;
      const mouseY = (e.clientY - containerRectForScale.top + container.scrollTop) / scale;

        if (diagramType === 'sequence') {
          const lifelines = getSequenceLifelines();

          if (connectionState.active && connectionState.startNodeId?.startsWith('SEQ_ACTOR_')) {
              const sourceActorId = connectionState.startNodeId.replace('SEQ_ACTOR_', '');
              const sourceLifeline = lifelines.find(l => l.actorId === sourceActorId);
              if (!sourceLifeline) return;

              const sourceSlots = getSequenceAnchorSlots(sourceLifeline);
              const anchorY = connectionState.anchorY ?? findNearestSlot(sourceSlots, mouseY);
              const snappedAnchorY = findNearestSlot(sourceSlots, anchorY);

              const snapThreshold = 28;
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

          const hoverThreshold = 44;
          const nearestLifeline = lifelines.find(l => Math.abs(l.x - mouseX) <= hoverThreshold && mouseY >= l.y1 - 8 && mouseY <= l.y2 + 30);
          if (nearestLifeline) {
            setSequenceLifelineOverlay({
              actorId: nearestLifeline.actorId,
              x: nearestLifeline.x,
              slots: getSequenceAnchorSlots(nearestLifeline, mouseY),
            });
          } else if (!connectionState.active && selectedNodeId?.startsWith('SEQ_ACTOR_')) {
            const selectedActorId = selectedNodeId.replace('SEQ_ACTOR_', '');
            const selectedLifeline = lifelines.find(l => l.actorId === selectedActorId);
            if (selectedLifeline) {
              setSequenceLifelineOverlay({
                actorId: selectedLifeline.actorId,
                x: selectedLifeline.x,
                slots: getSequenceAnchorSlots(selectedLifeline),
              });
            } else {
              setSequenceLifelineOverlay(null);
            }
          } else if (!connectionState.active && selectedNodeId?.startsWith('SEQ_MSG_')) {
            const msgOverlay = getSelectedMessageOverlay(selectedNodeId);
            if (msgOverlay) {
              setSequenceLifelineOverlay(msgOverlay);
            } else {
              setSequenceLifelineOverlay(null);
            }
          } else if (!connectionState.active) {
            setSequenceLifelineOverlay(null);
          }
      } else {
        setSequenceLifelineOverlay(null);
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
    getSelectedMessageOverlay
  ]);

  useEffect(() => {
    if (connectionState.active) return;
    if (!selectedNodeId?.startsWith('SEQ_ACTOR_')) return;
    const lifelines = getSequenceLifelines();
    const actorId = selectedNodeId.replace('SEQ_ACTOR_', '');
    const lifeline = lifelines.find(l => l.actorId === actorId);
    if (!lifeline) return;
    setSequenceLifelineOverlay({
      actorId: lifeline.actorId,
      x: lifeline.x,
      slots: getSequenceAnchorSlots(lifeline),
    });
  }, [selectedNodeId, connectionState.active, getSequenceLifelines, getSequenceAnchorSlots]);

  useEffect(() => {
    if (connectionState.active) return;
    if (!selectedNodeId?.startsWith('SEQ_MSG_')) return;
    const overlay = getSelectedMessageOverlay(selectedNodeId);
    if (!overlay) return;
    setSequenceLifelineOverlay(overlay);
  }, [selectedNodeId, connectionState.active, getSelectedMessageOverlay]);

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
    getSequenceInsertIndexForAnchor
  ]);

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
    dragState: null as null,
    setDragState: (_: any) => {},
    startSequenceConnection,
    inlineInputRef,
    getClickedNode,
    handleSvgClick,
    handleMouseMove,
    handleMouseUp,
    handleEditClick,
    handleAddNodeFromSelected,
    shapePicker,
    setShapePicker
  };
}
