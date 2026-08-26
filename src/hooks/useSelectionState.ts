import { useState, useCallback, useRef, useEffect, type MutableRefObject } from "react";
import { isEdgeId } from "@/lib/diagrams/utils";
import { findMindmapSvgElementByNodeId } from "@/lib/diagrams/mindmap";
import { findTimelineSvgElementByNodeId } from "@/lib/diagrams/timeline";
import {
  buildSequenceMessageVisualModel,
  findOwningLineForSequenceLabel,
  getSequenceMessageEntries,
  getVisibleSequenceMessageTexts,
  unionClientRects,
  SEQ_MSG_SELECTION_PADDING,
  type SequenceMessageVisual,
} from "@/lib/diagrams/sequence/geometry";

export type RecalcDeps = {
  setTextBox: (val: { x: number; y: number; width: number; height: number } | null) => void;
  getSequenceParticipantEntries: () => Array<{
    id: string;
    alias: string | null;
  }>;
  resolveCompactActorElement: (
    container: HTMLElement | null,
    candidate: Element | null,
    candidateSvgId: string | null,
  ) => Element | null;
  getSortedNoteTextEls: (container: ParentNode | null | undefined) => SVGElement[];
  getSequenceLifelines: () => Array<{
    actorId: string;
    x: number;
    y1: number;
    y2: number;
  }>;
  getSequenceTextElsForLine: (
    lineEl: SVGElement | null,
    textEls: SVGElement[],
    lineEls: SVGElement[],
  ) => SVGElement[];
};

/**
 * Generic selection state extracted from useCanvasInteraction (Phase 4a).
 *
 * Owns: selectedNodeId, selectedSvgId, selectionBox + refs + setter-with-ref
 * helpers, normalizeId, recalculateSelection, recalculateSelectionRef, and
 * the recalculate-on-change effect.
 *
 * Dependencies that are defined earlier in the orchestrator (renderIdRef,
 * code, svgContent, containerRef) are passed as direct params.
 *
 * Dependencies that are defined later in the orchestrator are passed via
 * recalcDepsRef — a ref populated synchronously during render before any
 * effect fires. recalculateSelection reads from this ref at invocation time.
 * sequenceMessageVisualsRef is created before both hooks to break the
 * circular dep between useSelectionState and useSequenceHover.
 */
export function useSelectionState({
  renderIdRef,
  code,
  svgContent,
  containerRef,
  sequenceMessageVisualsRef,
  recalcDepsRef,
}: {
  renderIdRef: MutableRefObject<string | null>;
  code: string;
  svgContent?: string;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  sequenceMessageVisualsRef: MutableRefObject<SequenceMessageVisual[]>;
  recalcDepsRef: MutableRefObject<RecalcDeps | null>;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  const setSelectedNodeIdWithRef = useCallback((id: string | null) => {
    selectedNodeIdRef.current = id;
    setSelectedNodeId(id);
  }, []);
  const [selectedSvgId, setSelectedSvgId] = useState<string | null>(null);
  const selectedSvgIdRef = useRef<string | null>(null);
  const setSelectedSvgIdWithRef = useCallback((id: string | null) => {
    selectedSvgIdRef.current = id;
    setSelectedSvgId(id);
  }, []);
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const normalizeId = useCallback(
    (id: string) => {
      if (id.startsWith("CLASS_EDGE_")) return id;
      if (id.startsWith("ER_EDGE_")) return id;
      if (id.startsWith("STATE_EDGE_")) return id;
      if (id.startsWith("MINDMAP_")) return id;
      if (id.startsWith("TIMELINE_")) return id;
      let cleanId = id.replace("-hit-target", "");

      if (renderIdRef.current && cleanId.includes(renderIdRef.current)) {
        const prefixRegex = new RegExp(`^.*?-?${renderIdRef.current}-`);
        cleanId = cleanId.replace(prefixRegex, "");
      }

      cleanId = cleanId.replace(/^svg-/, "").replace(/^flowchart-/, "");

      const edgeMatch = cleanId.match(/^L[_-]([a-zA-Z0-9]+)[_-]([a-zA-Z0-9]+)[_-](\d+)$/);
      if (edgeMatch) {
        const src = edgeMatch[1];
        const dst = edgeMatch[2];
        const rawIndex = parseInt(edgeMatch[3], 10);
        const canonicalIndex = 2 * Math.floor(rawIndex / 2);
        return `L_${src}_${dst}_${canonicalIndex}`;
      }

      cleanId = cleanId.replace(/[-_]\d+$/, "");

      return cleanId;
    },
    [renderIdRef],
  );

  const recalculateSelection = useCallback(() => {
    const deps = recalcDepsRef.current;
    if (!selectedNodeId || !containerRef.current || !deps) return;
    if (selectedNodeId.startsWith("SEQ_BLK_")) return;

    let foundElement: SVGElement | null = null;
    let foundRawSvgId: string | null = null;

    if (selectedNodeId.startsWith("CLASS_EDGE_")) {
      const dataId = selectedNodeId.replace("CLASS_EDGE_", "");
      const path = containerRef.current.querySelector(
        `path.relation[data-id="${dataId}"]`,
      ) as SVGElement | null;
      if (path) {
        foundElement = path;
        foundRawSvgId = path.id || null;
      }
    } else if (selectedNodeId.startsWith("ER_EDGE_")) {
      const dataId = selectedNodeId.replace("ER_EDGE_", "");
      const path = containerRef.current.querySelector(
        `path.relationshipLine[data-id="${dataId}"]`,
      ) as SVGElement | null;
      if (path) {
        foundElement = path;
        foundRawSvgId = path.id || null;
      }
    } else if (selectedNodeId.startsWith("STATE_EDGE_")) {
      const dataId = selectedNodeId.replace("STATE_EDGE_", "");
      const path = containerRef.current.querySelector(
        `path.transition[data-id="${dataId}"]`,
      ) as SVGElement | null;
      if (path) {
        foundElement = path;
        foundRawSvgId = path.id || null;
      }
    } else if (selectedNodeId.startsWith("MINDMAP_")) {
      const node = findMindmapSvgElementByNodeId(code, containerRef.current, selectedNodeId);
      if (node) {
        foundElement = node;
        foundRawSvgId = node.id || null;
      }
    } else if (selectedNodeId.startsWith("TIMELINE_")) {
      const node = findTimelineSvgElementByNodeId(code, containerRef.current, selectedNodeId);
      if (node) {
        foundElement = node;
        foundRawSvgId = node.id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_ACTOR_")) {
      const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
      const entries = deps.getSequenceParticipantEntries();
      const found = entries.find((e) => e.id === actorId);
      const actorDisplayName = found?.alias || found?.id || actorId;

      if (selectedSvgId) {
        const exactEl = containerRef.current.querySelector(
          `#${CSS.escape(selectedSvgId)}`,
        ) as SVGElement | null;
        if (
          exactEl &&
          (exactEl.classList?.contains("actor") || exactEl.classList?.contains("actor-man"))
        ) {
          foundElement = exactEl;
          foundRawSvgId = exactEl.id || null;
        }
      }

      let bestRect: Element | null = null;
      const lifeline = deps.getSequenceLifelines().find((l) => l.actorId === actorId);
      if (!foundElement && lifeline) {
        const selectedCenterY = selectionBox ? selectionBox.y + selectionBox.height / 2 : null;
        const actorElements = Array.from(
          containerRef.current.querySelectorAll(".actor, .actor-man"),
        ) as SVGElement[];
        const byX = actorElements
          .map((el) => {
            const b = el.getBoundingClientRect();
            const centerX = b.left + b.width / 2;
            const centerY = b.top + b.height / 2;
            const containerRect = containerRef.current!.getBoundingClientRect();
            const scale = containerRect.width / containerRef.current!.offsetWidth;
            const canvasX =
              (centerX - containerRect.left + containerRef.current!.scrollLeft) / scale;
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
          .filter(
            (item) => Number.isFinite(item.centerX) && Number.isFinite(item.dx) && item.dx < 120,
          )
          .sort((a, b) => a.dx - b.dx || a.dy - b.dy || a.top - b.top);
        if (byX[0]) {
          const minDx = byX[0].dx;
          const sameTrack = byX
            .filter((item) => Math.abs(item.dx - minDx) < 1.5)
            .sort((a, b) => a.dy - b.dy || a.top - b.top);
          bestRect = (sameTrack[0] || byX[0]).el;
        }
      }

      if (!foundElement && !bestRect) {
        const selectedCenterY = selectionBox ? selectionBox.y + selectionBox.height / 2 : null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const g of Array.from(containerRef.current.querySelectorAll("g"))) {
          const directTexts = Array.from(g.children).filter(
            (c): c is Element => c.tagName === "text",
          );
          if (directTexts.some((t) => t.textContent?.trim() === actorDisplayName)) {
            const rectEl = g.querySelector("rect") || g;
            const b = (rectEl as SVGElement).getBoundingClientRect();
            const containerRect = containerRef.current.getBoundingClientRect();
            const scale = containerRect.width / containerRef.current.offsetWidth;
            const centerY =
              (b.top - containerRect.top + containerRef.current.scrollTop + b.height / 2) / scale;
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
          (bestRect as SVGElement).id =
            `seq-actor-${actorId.replace(/[^a-zA-Z0-9_]/g, "")}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }
        foundRawSvgId = (bestRect as SVGElement).id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_MSG_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
      const visuals =
        sequenceMessageVisualsRef.current.length > 0
          ? sequenceMessageVisualsRef.current
          : buildSequenceMessageVisualModel(
              containerRef.current,
              code,
              getSequenceMessageEntries,
              findOwningLineForSequenceLabel,
            );
      const visual = visuals[idx];
      if (visual) {
        foundElement = (visual.labelEls[0] || visual.lineEl) as SVGElement;
        if (foundElement && !foundElement.id) foundElement.id = `seq-msg-${idx}`;
        foundRawSvgId = foundElement?.id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_NOTE_")) {
      const idx = parseInt(selectedNodeId.replace("SEQ_NOTE_", ""), 10);
      const allNotes = deps.getSortedNoteTextEls(containerRef.current);
      if (allNotes[idx]) {
        foundElement = allNotes[idx] as SVGElement;
        if (!foundElement.id) foundElement.id = `seq-note-${idx}`;
        foundRawSvgId = foundElement.id || null;
      }
    } else if (selectedNodeId.startsWith("SEQ_")) {
      const name = selectedNodeId.replace("SEQ_", "");
      const candidates = containerRef.current.querySelectorAll(".actor, .messageText, .noteText");
      for (const candidate of Array.from(candidates)) {
        if (candidate.textContent?.trim() === name) {
          foundElement = candidate as SVGElement;
          foundRawSvgId = candidate.id || null;
          break;
        }
      }
    } else {
      if (selectedSvgId) {
        const exact = containerRef.current.querySelector(
          `#${CSS.escape(selectedSvgId)}`,
        ) as SVGElement | null;
        if (exact) {
          foundElement = exact;
          foundRawSvgId = exact.id || null;
        }
      }

      if (foundElement) {
        // Exact raw SVG id match wins.
      } else {
        let candidatesList: SVGElement[] = [];
        if (isEdgeId(selectedNodeId)) {
          const edgeLabels = Array.from(containerRef.current.querySelectorAll(".edgeLabel"));
          const flowchartLinks = Array.from(
            containerRef.current.querySelectorAll(
              "path.flowchart-link:not(.flowchart-link-hit-target)",
            ),
          );
          const otherNodes = Array.from(containerRef.current.querySelectorAll(".node, .cluster"));
          candidatesList = [...edgeLabels, ...flowchartLinks, ...otherNodes] as SVGElement[];
        } else {
          candidatesList = Array.from(
            containerRef.current.querySelectorAll(
              ".node, .cluster, path.flowchart-link:not(.flowchart-link-hit-target), .edgeLabel",
            ),
          ) as SVGElement[];
        }

        for (const candidate of candidatesList) {
          let nodeId = candidate.id;
          if (candidate.classList?.contains("edgeLabel")) {
            const dataIdEl = candidate.querySelector("[data-id]");
            if (dataIdEl) {
              const rawId = dataIdEl.getAttribute("data-id");
              if (rawId) {
                const canonical = normalizeId(rawId);
                const hasText = candidate.textContent?.trim() !== "";
                if (hasText) {
                  const paths = Array.from(
                    containerRef.current.querySelectorAll(
                      "path.flowchart-link:not(.flowchart-link-hit-target)",
                    ),
                  );
                  const matchingPath = paths.find((p) => p.id && normalizeId(p.id) === canonical);
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
              if (candidate.classList?.contains("edgeLabel") && !candidate.id) {
                candidate.id = `edge-label-${cleanId}`;
              }
              foundRawSvgId = candidate.id || null;
              break;
            }
          }
        }
      }
    }

    if (selectedNodeId.startsWith("SEQ_ACTOR_") && foundElement && containerRef.current) {
      const resolved = deps.resolveCompactActorElement(
        containerRef.current,
        foundElement,
        selectedSvgId,
      );
      if (resolved !== foundElement) {
        foundElement = resolved as SVGElement;
        if (!foundElement.id) {
          const actorId = selectedNodeId.replace("SEQ_ACTOR_", "");
          const b = foundElement.getBoundingClientRect();
          foundElement.id = `seq-actor-${actorId.replace(/[^a-zA-Z0-9_]/g, "")}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }
        foundRawSvgId = foundElement.id || null;
      }
    }

    if (foundElement && containerRef.current) {
      let rect = foundElement.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = containerRect.width / containerRef.current.offsetWidth;

      if (selectedNodeId.startsWith("SEQ_MSG_")) {
        const idx = parseInt(selectedNodeId.replace("SEQ_MSG_", ""), 10);
        if (Number.isFinite(idx) && idx >= 0) {
          const allMsgTexts = getVisibleSequenceMessageTexts(containerRef.current);
          const allMsgLines = Array.from(
            containerRef.current.querySelectorAll(
              '[class^="messageLine"], [class*=" messageLine"]',
            ),
          ) as SVGElement[];

          const pairedLine =
            allMsgLines[idx] || findOwningLineForSequenceLabel(foundElement, allMsgLines);
          const pairedTextEls = deps.getSequenceTextElsForLine(
            pairedLine,
            allMsgTexts,
            allMsgLines,
          );
          const pairedText = pairedTextEls[0] || foundElement;

          const lineRect = pairedLine?.getBoundingClientRect();
          const labelRect =
            unionClientRects(pairedTextEls) ||
            (pairedText as SVGElement | null)?.getBoundingClientRect();
          if (lineRect || labelRect) {
            const left = Math.min(
              lineRect?.left ?? Number.POSITIVE_INFINITY,
              labelRect?.left ?? Number.POSITIVE_INFINITY,
            );
            const top = Math.min(
              lineRect?.top ?? Number.POSITIVE_INFINITY,
              labelRect?.top ?? Number.POSITIVE_INFINITY,
            );
            const right = Math.max(
              lineRect?.right ?? Number.NEGATIVE_INFINITY,
              labelRect?.right ?? Number.NEGATIVE_INFINITY,
            );
            const bottom = Math.max(
              lineRect?.bottom ?? Number.NEGATIVE_INFINITY,
              labelRect?.bottom ?? Number.NEGATIVE_INFINITY,
            );
            rect = {
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
        }
      }

      if (selectedNodeId.startsWith("SEQ_NOTE_")) {
        const parentGroup = foundElement.parentElement;
        const rectNote = (parentGroup?.querySelector("rect.note") ??
          parentGroup?.parentElement?.querySelector("rect.note")) as SVGElement | null;
        if (rectNote) {
          rect = rectNote.getBoundingClientRect();
        }
      }

      const msgPadX = selectedNodeId.startsWith("SEQ_MSG_") ? SEQ_MSG_SELECTION_PADDING.x : 0;
      const msgPadY = selectedNodeId.startsWith("SEQ_MSG_") ? SEQ_MSG_SELECTION_PADDING.y : 0;
      const newSelectionBox = {
        x: (rect.left - containerRect.left + containerRef.current.scrollLeft) / scale - msgPadX,
        y: (rect.top - containerRect.top + containerRef.current.scrollTop) / scale - msgPadY,
        width: rect.width / scale + msgPadX * 2,
        height: rect.height / scale + msgPadY * 2,
      };

      const newTextBox = {
        x: (rect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
        y: (rect.top - containerRect.top + containerRef.current.scrollTop) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      };

      setSelectionBox(newSelectionBox);
      deps.setTextBox(newTextBox);
      setSelectedSvgIdWithRef(foundRawSvgId);
    } else {
      setSelectionBox(null);
      deps.setTextBox(null);
      setSelectedNodeIdWithRef(null);
      setSelectedSvgIdWithRef(null);
    }
  }, [
    selectedNodeId,
    selectedSvgId,
    selectionBox,
    containerRef,
    renderIdRef,
    normalizeId,
    recalcDepsRef,
    sequenceMessageVisualsRef,
  ]);

  useEffect(() => {
    if (!selectedNodeId) return;

    const timeoutId = setTimeout(() => {
      recalculateSelection();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [code, svgContent, selectedNodeId, recalculateSelection]);

  const recalculateSelectionRef = useRef(recalculateSelection);
  useEffect(() => {
    recalculateSelectionRef.current = recalculateSelection;
  }, [recalculateSelection]);

  return {
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIdRef,
    setSelectedNodeIdWithRef,
    selectedSvgId,
    setSelectedSvgId,
    selectedSvgIdRef,
    setSelectedSvgIdWithRef,
    selectionBox,
    setSelectionBox,
    normalizeId,
    recalculateSelection,
    recalculateSelectionRef,
  } as const;
}
