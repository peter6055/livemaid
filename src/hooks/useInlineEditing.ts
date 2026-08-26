import { useState, useCallback, useRef, useEffect, type MutableRefObject } from "react";
import {
  isEdgeId,
  parseEdgeId,
  getLinkLabelFromMiddle,
  matchFlowchartLinkLine,
} from "@/lib/diagrams/utils";
import { escapeRegExp } from "@/lib/utils";
import {
  getSequenceBlockEntries,
  getSequenceMessageEntries,
} from "@/lib/diagrams/sequence/geometry";
import { timelineNodeLabel } from "@/lib/diagrams/timeline";

/**
 * Inline-editing state + entry logic extracted verbatim from useCanvasInteraction
 * (Phase 5 of the canvas-interaction split).
 *
 * Owns: editingText, isInlineEditing, isInlineEditingRef, inlineInputRef,
 * commitEditRef, handleEditClick, and resolveSequenceBlockLabelTarget.
 *
 * All other hooks/components continue to read the returned state directly.
 */

export type PendingEditTarget = {
  cleanId: string | null;
  rawSvgId: string;
  newSelectionBox: { x: number; y: number; width: number; height: number };
  newTextBox: { x: number; y: number; width: number; height: number };
};

export type ClickedNode = {
  cleanId: string | null;
  rawSvgId: string;
  newSelectionBox: { x: number; y: number; width: number; height: number };
  newTextBox: { x: number; y: number; width: number; height: number };
};

export function useInlineEditing({
  code,
  containerRef,
  determineDiagramType,
  getClickedNodeRef,
  setSelectedNodeIdWithRef,
  setSelectedSvgIdWithRef,
  selectedNodeIdRef,
  selectedSvgIdRef,
  setSelectionBox,
  setTextBox,
  normalizeId,
  pendingEditTargetRef,
}: {
  code: string;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  determineDiagramType: (code: string) => string;
  getClickedNodeRef: MutableRefObject<(target: Element) => ClickedNode | null>;
  setSelectedNodeIdWithRef: (id: string | null) => void;
  setSelectedSvgIdWithRef: (id: string | null) => void;
  selectedNodeIdRef: MutableRefObject<string | null>;
  selectedSvgIdRef: MutableRefObject<string | null>;
  setSelectionBox: (box: { x: number; y: number; width: number; height: number } | null) => void;
  setTextBox: (box: { x: number; y: number; width: number; height: number } | null) => void;
  normalizeId: (id: string) => string;
  pendingEditTargetRef: MutableRefObject<PendingEditTarget | null>;
}) {
  const [editingText, setEditingText] = useState("");
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const isInlineEditingRef = useRef(isInlineEditing);
  useEffect(() => {
    isInlineEditingRef.current = isInlineEditing;
  }, [isInlineEditing]);

  const inlineInputRef = useRef<HTMLDivElement>(null);

  // commitEditRef is a ref slot that LiveMaidEditor fills with handleEditSubmit.
  // The hook calls it before any cross-element or background transition so that
  // typed edits are committed to the diagram code before the selection changes.
  const commitEditRef = useRef<(() => void) | null>(null);

  const resolveSequenceBlockLabelTarget = useCallback(
    (clickedEl: Element | null): { lineIndex: number } | null => {
      const container = containerRef.current;
      if (!container || !clickedEl) return null;
      if (determineDiagramType(code) !== "sequence") return null;

      const labelEl = clickedEl.closest(".loopText, .sectionTitle") as SVGElement | null;
      if (!labelEl) return null;
      const isSection = labelEl.classList.contains("sectionTitle");

      const blocks = getSequenceBlockEntries(code);
      const byTop = (els: SVGElement[]) =>
        els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

      if (isSection) {
        const els = byTop(Array.from(container.querySelectorAll(".sectionTitle")) as SVGElement[]);
        const idx = els.indexOf(labelEl);
        if (idx < 0) return null;
        const dividers = blocks
          .flatMap((b) => b.sections.filter((s) => /^(else|and|option)$/i.test(s.keyword)))
          .sort((a, b) => a.line - b.line);
        if (idx >= dividers.length) return null;
        return { lineIndex: dividers[idx].line };
      }

      const els = byTop(Array.from(container.querySelectorAll(".loopText")) as SVGElement[]);
      const idx = els.indexOf(labelEl);
      if (idx < 0) return null;
      const openers = blocks
        .filter((b) => b.type !== "rect")
        .sort((a, b) => a.startLine - b.startLine);
      if (idx >= openers.length) return null;
      return { lineIndex: openers[idx].startLine };
    },
    [containerRef, code, determineDiagramType, getSequenceBlockEntries],
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent | Event) => {
      if ("stopPropagation" in e) e.stopPropagation();

      const currentType = determineDiagramType(code);
      if (
        !(
          currentType === "graph" ||
          currentType === "flowchart" ||
          currentType === "sequence" ||
          currentType === "timeline"
        )
      ) {
        return;
      }

      // If the event originated inside an active inline editor (e.g. the user double-clicked to
      // select a word), do not treat it as a canvas double-click. Let the editor consume it.
      if (
        (e.target as Element | null)?.closest?.("[data-inline-editor], [data-class-text-editor]")
      ) {
        return;
      }

      // Resolve actual SVG element via elementsFromPoint to bypass overlay divs.
      // EXCEPTION: when invoked from a floating toolbar (e.g. the Rename button), the cursor is
      // over the toolbar — NOT the diagram element — so elementsFromPoint would resolve to whatever
      // SVG sits behind the toolbar (e.g. an actor header) and edit the WRONG element. In that case
      // we keep the currently-selected node and its existing selection/text boxes.
      // SECOND EXCEPTION: when invoked from handleSvgClick's double-click detection, the caller
      // may already have resolved the target via bounding-box heuristics (e.g. off-center edge
      // labels). We prefer that resolved result over elementsFromPoint since elementsFromPoint
      // bypasses pointer-events: none elements and hits the SVG background instead.
      const fromToolbar = Boolean(
        (e.target as Element | null)?.closest?.(
          "[data-inline-toolbar], [data-scale-lock], [data-inline-editor]",
        ),
      );
      const pendingResult = pendingEditTargetRef.current;
      pendingEditTargetRef.current = null;

      let targetElement = e.target as Element;
      if (!fromToolbar && "clientX" in e && "clientY" in e) {
        const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
        const svgElementsAtPoint = elementsAtPoint.filter(
          (el) =>
            el.tagName.toLowerCase() !== "div" && el.namespaceURI === "http://www.w3.org/2000/svg",
        );
        // Find an element that is or has a .node ancestor.
        // elementsFromPoint returns elements from front-to-back (top of z-order first).
        // We want the first (topmost) element that is part of a node.
        const insideNode = svgElementsAtPoint.find(
          (el) => el.classList?.contains("node") || el.closest?.(".node"),
        );
        if (insideNode) {
          targetElement = insideNode;
        } else {
          const svgElement = svgElementsAtPoint[0];
          if (svgElement) {
            targetElement = svgElement;
          } else {
            const firstEl = elementsAtPoint[0];
            if (firstEl) targetElement = firstEl;
          }
        }
      }

      // Logic-block / highlight label rename: double-clicking a block's label box (`.loopText` for
      // the opener label like `loop Retry`, `.sectionTitle` for an `else`/`and`/`option` divider)
      // enters inline edit on that label and rewrites ONLY the label portion of the source line.
      // Handled before the generic node resolver so it never falls through to flowchart-node logic.
      const blockTarget = fromToolbar ? null : resolveSequenceBlockLabelTarget(targetElement);
      if (blockTarget) {
        const container = containerRef.current;
        const labelEl = targetElement.closest?.(".loopText, .sectionTitle") as SVGElement | null;
        if (!container || !labelEl) return;
        const blockNodeId = `SEQ_BLK_${blockTarget.lineIndex}`;

        if (isInlineEditing) {
          if (blockNodeId === selectedNodeIdRef.current) return; // already editing this label
          commitEditRef.current?.();
          setIsInlineEditing(false);
        }

        const r = labelEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scale = containerRect.width / container.offsetWidth;
        const padX = 8;
        const padY = 4;
        setSelectionBox({
          x: (r.left - containerRect.left + container.scrollLeft) / scale - padX,
          y: (r.top - containerRect.top + container.scrollTop) / scale - padY,
          width: r.width / scale + padX * 2,
          height: r.height / scale + padY * 2,
        });
        setTextBox({
          x: (r.left - containerRect.left + container.scrollLeft) / scale,
          y: (r.top - containerRect.top + container.scrollTop) / scale,
          width: r.width / scale,
          height: r.height / scale,
        });
        setSelectedNodeIdWithRef(blockNodeId);
        setSelectedSvgIdWithRef(null);

        const lineStr = code.split("\n")[blockTarget.lineIndex] || "";
        const labelMatch = lineStr
          .trim()
          .match(/^(?:loop|alt|opt|par|critical|break|else|and|option)\b[ \t]*(.*)$/i);
        setEditingText(labelMatch ? labelMatch[1].trim() : "");
        setIsInlineEditing(true);
        setTimeout(() => {
          if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            // Select all content in contentEditable div
            const range = document.createRange();
            range.selectNodeContents(inlineInputRef.current);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }, 10);
        return;
      }

      let result = pendingResult ?? (fromToolbar ? null : getClickedNodeRef.current(targetElement));
      if (
        result?.rawSvgId &&
        !fromToolbar &&
        "clientX" in e &&
        "clientY" in e &&
        containerRef.current
      ) {
        const selectedEl = containerRef.current.querySelector(
          `#${CSS.escape(result.rawSvgId)}`,
        ) as SVGElement | null;
        if (selectedEl?.classList?.contains("cluster")) {
          // Check if ANY node in the diagram is at the click point.
          // If so, prefer that node over the cluster (topmost element wins).
          const allNodes = Array.from(
            containerRef.current.querySelectorAll(".node"),
          ) as SVGElement[];
          for (const node of allNodes) {
            const rect = node.getBoundingClientRect();
            if (
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= rect.bottom
            ) {
              result = getClickedNodeRef.current(node);
              break;
            }
          }
        }
      }

      // Use ref for selectedNodeId to avoid stale closure
      let targetNodeId = selectedNodeIdRef.current;

      // STATE MACHINE: handle EDIT_MODE → EDIT_MODE transitions (cross-element or empty-space double-click)
      if (isInlineEditing) {
        if (!result) {
          // For flowcharts/graphs, a null result on empty-space double-click is not meaningful
          // (it may happen when onDoubleClick fires after handleSvgClick already entered edit
          // mode and the click resolved to the SVG background). Only commit+exit for sequence.
          if (currentType === "sequence") {
            commitEditRef.current?.();
            setIsInlineEditing(false);
            return;
          }
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
        setSelectedSvgIdWithRef(result.rawSvgId);
        targetNodeId = result.cleanId;
      } else if (targetNodeId && containerRef.current && !fromToolbar) {
        // Edge label fallback: when the click resolved to the SVG background (because the
        // edgeLabel has pointer-events: none), we still have the valid targetNodeId from
        // the initial selection. Verify it exists in the DOM for text extraction, but
        // DON'T recompute selectionBox/textBox since they are already correct from the
        // prior selection (or will be restored by InlineTextEditor if needed).
        const candidates = Array.from(
          containerRef.current.querySelectorAll(
            ".node, .cluster, path.flowchart-link:not(.flowchart-link-hit-target), .edgeLabel",
          ),
        ) as SVGElement[];
        let foundMatch = false;
        for (const candidate of candidates) {
          let candidateId = candidate.id;
          if (candidate.classList?.contains("edgeLabel")) {
            const dataIdEl = candidate.querySelector("[data-id]");
            if (dataIdEl) {
              const rawId = dataIdEl.getAttribute("data-id");
              if (rawId) {
                const canonical = normalizeId(rawId);
                if (canonical === targetNodeId) {
                  candidateId = targetNodeId;
                }
              }
            }
          }
          if (candidateId && normalizeId(candidateId) === targetNodeId) {
            foundMatch = true;
            break;
          }
        }
        // If we can't find the candidate, targetNodeId is stale and we should bail
        if (!foundMatch) {
          return;
        }
      }

      if (!targetNodeId) return;

      let currentText = targetNodeId;

      if (targetNodeId.startsWith("SEQ_ACTOR_")) {
        // Read the current display label from the actor declaration
        const actorId = targetNodeId.replace("SEQ_ACTOR_", "");
        const lines = code.split("\n");
        let foundLabel = actorId;
        for (const line of lines) {
          const trimmed = line.trim();
          const match = trimmed.match(
            /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+)(?:\s*@\{[^}]*\})?(?:\s+as\s+(.+))?$/i,
          );
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
      } else if (targetNodeId.startsWith("SEQ_MSG_")) {
        const idx = parseInt(targetNodeId.replace("SEQ_MSG_", ""), 10);
        const msgLines = getSequenceMessageEntries(code).map((entry) => entry.line);
        if (msgLines[idx]) {
          const colonIdx = msgLines[idx].indexOf(":");
          currentText =
            colonIdx !== -1
              ? msgLines[idx]
                  .substring(colonIdx + 1)
                  .trim()
                  .replace(/<br\s*\/?>/gi, "\n")
              : "";
        }
      } else if (targetNodeId.startsWith("SEQ_NOTE_")) {
        const idx = parseInt(targetNodeId.replace("SEQ_NOTE_", ""), 10);
        const noteLines = code.split("\n").filter((l) => {
          const t = l.trim();
          return t.startsWith("Note ") || t.startsWith("note ");
        });
        if (noteLines[idx]) {
          const colonIdx = noteLines[idx].indexOf(":");
          currentText =
            colonIdx !== -1
              ? noteLines[idx]
                  .substring(colonIdx + 1)
                  .trim()
                  .replace(/<br\s*\/?>/gi, "\n")
              : "";
        }
      } else if (targetNodeId.startsWith("SEQ_")) {
        currentText = targetNodeId.replace("SEQ_", "");
        currentText = currentText.replace(/<br\/>/g, "\n");
      } else if (targetNodeId.startsWith("TIMELINE_")) {
        // Timeline event/period/section label — resolve directly from the parsed model
        // (the SVG group carries no stable id, so source-based label lookup is the
        // single reliable path for inline editing).
        currentText = timelineNodeLabel(code, targetNodeId) ?? "";
      } else if (isEdgeId(targetNodeId)) {
        // Distinguish a real edge (path / edgeLabel) from a node whose Mermaid
        // SVG id just happens to start with `L_` / `L-` / `e_` (e.g. a node
        // named `L_CF_AZ_CNAME`).
        const rawEl = result?.rawSvgId
          ? document.getElementById(result.rawSvgId)
          : selectedSvgIdRef.current
            ? document.getElementById(selectedSvgIdRef.current)
            : null;
        const isRealEdge =
          rawEl &&
          (rawEl.classList.contains("flowchart-link") ||
            rawEl.classList.contains("flowchart-link-hit-target") ||
            rawEl.classList.contains("edgeLabel"));

        if (isRealEdge) {
          // FIRST: Try to get the label from the SVG DOM (what the user
          // actually sees on the canvas). Mermaid renders edge labels in a
          // separate <g class="edgeLabels"> container, not as children of
          // the edge path.  Find the label by matching the edge-path's
          // position in <g class="edgePaths">.
          const effectiveRawSvgId = result?.rawSvgId ?? selectedSvgIdRef.current;
          if (effectiveRawSvgId && containerRef.current) {
            const edgePathsContainer = containerRef.current.querySelector("g.edgePaths");
            if (edgePathsContainer) {
              const allPaths = Array.from(
                edgePathsContainer.querySelectorAll(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ),
              );
              const labelsContainer = containerRef.current.querySelector("g.edgeLabels");
              const clickedPath = containerRef.current.querySelector(
                `#${CSS.escape(effectiveRawSvgId)}`,
              );
              let edgeIdx = -1;
              if (clickedPath) {
                if (clickedPath.classList.contains("flowchart-link-hit-target")) {
                  const actualPath = clickedPath.nextElementSibling as Element;
                  if (actualPath) edgeIdx = allPaths.indexOf(actualPath);
                } else if (clickedPath.classList.contains("flowchart-link")) {
                  edgeIdx = allPaths.indexOf(clickedPath);
                } else if (labelsContainer) {
                  // edgeLabel <g> — find by position in edgeLabels container
                  const allLabels = Array.from(
                    labelsContainer.querySelectorAll(":scope > g.edgeLabel"),
                  );
                  const labelG = clickedPath.closest("g.edgeLabel") as Element | null;
                  edgeIdx = labelG ? allLabels.indexOf(labelG) : allLabels.indexOf(clickedPath);
                }
              }
              if (edgeIdx >= 0 && labelsContainer) {
                const allLabels = Array.from(
                  labelsContainer.querySelectorAll(":scope > g.edgeLabel"),
                );
                const labelEl = allLabels[edgeIdx];
                if (labelEl) {
                  const labelDiv = labelEl.querySelector("foreignObject div, foreignObject span");
                  const labelText = labelDiv?.textContent || labelEl.textContent;
                  if (labelText?.trim()) {
                    currentText = labelText.trim();
                  }
                }
              }
            }
          }

          // SECOND: If SVG lookup failed, fall back to the source-code regex.
          if (currentText === targetNodeId) {
            const { src, dst, occurrenceIndex } = parseEdgeId(targetNodeId);
            if (src && dst) {
              const lines = code.split("\n");
              let currentOccurrence = 0;
              for (const line of lines) {
                const trimmed = line.trim();
                if (
                  !trimmed ||
                  trimmed.startsWith("%%") ||
                  trimmed.startsWith("subgraph") ||
                  trimmed.startsWith("end")
                ) {
                  continue;
                }
                const match = matchFlowchartLinkLine(line, src, dst);
                if (match) {
                  if (currentOccurrence === occurrenceIndex) {
                    currentText = getLinkLabelFromMiddle(match[2]);
                    break;
                  }
                  currentOccurrence++;
                }
              }
            }
          }
        }
        // When the DOM element is not a real edge (it's a node), fall through
        // to the generic node-text extraction below so the user sees the actual
        // label instead of the raw SVG id.
      }
      if (
        !targetNodeId.startsWith("SEQ_") &&
        !targetNodeId.startsWith("TIMELINE_") &&
        (!isEdgeId(targetNodeId) || currentText === targetNodeId)
      ) {
        // Try ["..."] shape first (e.g. NODE["label with (parens)"])
        // This must be separate because the generic regex's closing group
        // contains \) which matches parentheses inside label text.
        const quoteBracketRegex = new RegExp(
          `(^|[^a-zA-Z0-9_])(${escapeRegExp(targetNodeId)}\\s*\\[\\s*["'])([\\s\\S]*?)(["']\\s*\\])`,
          "m",
        );
        let match = code.match(quoteBracketRegex);
        if (match && match[3]) {
          currentText = match[3].replace(/<br\s*\/?>/gi, "<br/>");
        } else {
          const nodeRegex = new RegExp(
            `(^|[^a-zA-Z0-9_])(${escapeRegExp(targetNodeId)}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\]))`,
            "m",
          );
          match = code.match(nodeRegex);
          if (match && match[3]) {
            const rawLabel = match[3];
            // Preserve HTML tags for contentEditable editing
            // Convert <br> tags to ensure consistent line breaks
            currentText = rawLabel.replace(/<br\s*\/?>/gi, "<br/>");
          } else {
            const effectiveRawSvgId = result?.rawSvgId ?? selectedSvgIdRef.current;
            const innerText = effectiveRawSvgId
              ? document.querySelector(
                  `#${CSS.escape(effectiveRawSvgId)} .label, #${CSS.escape(effectiveRawSvgId)} text, #${CSS.escape(effectiveRawSvgId)} foreignObject, #${CSS.escape(effectiveRawSvgId)} .nodeLabel`,
                )
              : null;
            if (innerText && innerText.textContent) {
              currentText = innerText.textContent.trim();
            }
            // Edge-label fallback: Mermaid renders edge labels in a separate
            // <g class="edgeLabels"> container (not as children of the edge path).
            // Find the label by matching the edge-path's position in the edgePaths
            // container (each edge has a hit-target + actual path, so label index
            // = path index / 2).
            if (
              currentText === targetNodeId &&
              effectiveRawSvgId &&
              isEdgeId(targetNodeId) &&
              containerRef.current
            ) {
              const edgePathsContainer = containerRef.current.querySelector("g.edgePaths");
              if (edgePathsContainer) {
                const allPaths = Array.from(
                  edgePathsContainer.querySelectorAll(
                    "path.flowchart-link:not(.flowchart-link-hit-target)",
                  ),
                );
                const clickedPath = containerRef.current.querySelector(
                  `#${CSS.escape(effectiveRawSvgId)}`,
                );
                const edgeIdx = clickedPath
                  ? allPaths.indexOf(
                      clickedPath.classList.contains("flowchart-link-hit-target")
                        ? (clickedPath.nextElementSibling as Element) || clickedPath
                        : clickedPath,
                    )
                  : -1;
                if (edgeIdx >= 0) {
                  const labelsContainer = containerRef.current.querySelector("g.edgeLabels");
                  if (labelsContainer) {
                    const allLabels = Array.from(
                      labelsContainer.querySelectorAll(":scope > g.edgeLabel"),
                    );
                    const labelEl = allLabels[edgeIdx];
                    if (labelEl) {
                      const labelDiv = labelEl.querySelector(
                        "foreignObject div, foreignObject span",
                      );
                      const labelText = labelDiv?.textContent || labelEl.textContent;
                      if (labelText?.trim()) {
                        currentText = labelText.trim();
                      }
                    }
                  }
                }
              }
            }
          }
        } // close quoteBracketRegex else
      }

      setEditingText(currentText);
      setIsInlineEditing(true);
      setTimeout(() => {
        if (inlineInputRef.current) {
          inlineInputRef.current.focus();
          // Select all content in contentEditable div
          const range = document.createRange();
          range.selectNodeContents(inlineInputRef.current);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 10);
    },
    [
      code,
      getClickedNodeRef,
      setSelectedNodeIdWithRef,
      setSelectedSvgIdWithRef,
      determineDiagramType,
      getSequenceMessageEntries,
      isInlineEditing,
      resolveSequenceBlockLabelTarget,
    ],
  );

  return {
    editingText,
    setEditingText,
    isInlineEditing,
    setIsInlineEditing,
    isInlineEditingRef,
    inlineInputRef,
    commitEditRef,
    handleEditClick,
  } as const;
}
