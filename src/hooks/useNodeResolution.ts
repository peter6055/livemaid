import { useCallback, MutableRefObject } from "react";
import { isEdgeId } from "@/lib/diagrams/utils";
import { mindmapNodeIdFromSvgElement } from "@/lib/diagrams/mindmap";
import { timelineNodeIdFromSvgElement } from "@/lib/diagrams/timeline";
import {
  buildSequenceMessageVisualModel,
  findOwningLineForSequenceLabel,
  getSequenceMessageEntries,
  SEQ_MSG_SELECTION_PADDING,
} from "@/lib/diagrams/sequence/geometry";
import { getSequenceNoteRectForText } from "@/lib/diagrams/sequence/notes";
import type { SequenceMessageVisual } from "@/lib/diagrams/sequence/geometry";

/**
 * Cross-diagram click classifier: walks up the DOM from a click target,
 * identifies which node/edge was clicked, and returns the normalized id +
 * bounding box for selection / text editing.
 *
 * Extracted verbatim from useCanvasInteraction (Micro-task 4b of the
 * canvas-interaction split).
 */
export function useNodeResolution({
  code,
  containerRef,
  determineDiagramType,
  normalizeId,
  resolveSequenceActorIdFromDisplayName,
  getSequenceLifelines,
  getSvgTextDisplayName,
  getSequenceParticipantEntries,
  findNearestLineForText,
  getSequenceTextElsForLine,
  normalizeSequenceLabel,
  resolveCompactActorElement,
  getSortedNoteTextEls,
  sequenceMessageVisualsRef,
}: {
  code: string;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  determineDiagramType: (code: string) => string;
  normalizeId: (id: string) => string;
  resolveSequenceActorIdFromDisplayName: (displayName: string) => string;
  getSequenceLifelines: () => Array<{
    actorId: string;
    x: number;
    y1: number;
    y2: number;
  }>;
  getSvgTextDisplayName: (el: SVGElement | null) => string;
  getSequenceParticipantEntries: () => Array<{
    id: string;
    alias: string | null;
  }>;
  findNearestLineForText: (textEl: SVGElement, lineEls: SVGElement[]) => SVGElement | null;
  getSequenceTextElsForLine: (
    lineEl: SVGElement | null,
    textEls: SVGElement[],
    lineEls: SVGElement[],
  ) => SVGElement[];
  normalizeSequenceLabel: (value: string | null | undefined) => string;
  resolveCompactActorElement: (
    container: HTMLElement | null,
    candidate: Element | null,
    candidateSvgId: string | null,
  ) => Element | null;
  getSortedNoteTextEls: (container: ParentNode | null | undefined) => SVGElement[];
  sequenceMessageVisualsRef: MutableRefObject<SequenceMessageVisual[]>;
}) {
  const getClickedNode = useCallback(
    (target: Element) => {
      const isSequenceMessageLineElement = (el: SVGElement | null) => {
        if (!el?.classList) return false;
        return Array.from(el.classList).some((c) => c.startsWith("messageLine"));
      };

      let currentNode: SVGElement | null = target as SVGElement;
      let foundNodeClass = false;
      let nodeId = null;
      const currentDiagramType = determineDiagramType(code);

      while (currentNode && currentNode.tagName !== "svg") {
        if (currentDiagramType === "mindmap") {
          const mindmapNodeId = containerRef.current
            ? mindmapNodeIdFromSvgElement(code, containerRef.current, currentNode)
            : null;
          if (mindmapNodeId) {
            const group = currentNode.closest("g.mindmap-node, g.node, g[class*='mindmap']");
            foundNodeClass = true;
            nodeId = mindmapNodeId;
            currentNode = (group?.closest("g") ?? group ?? currentNode) as SVGElement;
            break;
          }
        }

        if (currentDiagramType === "timeline") {
          const timelineNodeId = containerRef.current
            ? timelineNodeIdFromSvgElement(code, containerRef.current, currentNode)
            : null;
          if (timelineNodeId) {
            const group = currentNode.closest("g.timeline-node");
            foundNodeClass = true;
            nodeId = timelineNodeId;
            currentNode = (group ?? currentNode) as SVGElement;
            break;
          }
        }

        if (
          currentNode.classList?.contains("node") ||
          currentNode.classList?.contains("statediagram-state") ||
          currentNode.classList?.contains("cluster") ||
          currentNode.classList?.contains("statediagram-cluster")
        ) {
          foundNodeClass = true;
          nodeId = currentNode.id;
          break;
        }
        if (
          currentNode.classList?.contains("flowchart-link") ||
          currentNode.classList?.contains("flowchart-link-hit-target") ||
          currentNode.classList?.contains("edgeLabel")
        ) {
          foundNodeClass = true;
          // NOTE: clicks on an edge label land on the invisible
          // `rect.edge-label-hit-target` sitting inside the `g.edgeLabel`. We deliberately do NOT
          // break on that rect: continuing the walk reaches the parent `g.edgeLabel`, which is the
          // element that carries the resolvable identity (id assignment + label text extraction).
          if (currentNode.classList?.contains("edgeLabel")) {
            // Walk up to the <g class="edgeLabel"> container if we landed on
            // a child element (e.g. <span class="edgeLabel"> inside foreignObject).
            const edgeLabelG = currentNode.closest("g.edgeLabel") as Element | null;
            const labelEl = edgeLabelG || currentNode;
            const rawId =
              labelEl.getAttribute("data-id") ??
              labelEl.querySelector("[data-id]")?.getAttribute("data-id") ??
              null;
            if (rawId) {
              const canonical = normalizeId(rawId);
              const paths = Array.from(
                containerRef.current?.querySelectorAll(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ) || [],
              );
              const path = paths.find((p) => p.id && normalizeId(p.id) === canonical);
              if (path && path.id) nodeId = path.id;
            }
            if (!nodeId) {
              const path =
                labelEl.parentElement?.querySelector(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ) || (labelEl as Element).previousElementSibling;
              if (path && path.id) nodeId = path.id;
            }
            // Fallback: find edge path by matching position in edgeLabels container
            if (!nodeId && containerRef.current) {
              const labelsContainer = containerRef.current.querySelector("g.edgeLabels");
              if (labelsContainer) {
                const allLabels = Array.from(
                  labelsContainer.querySelectorAll(":scope > g.edgeLabel"),
                );
                const labelIdx = allLabels.indexOf(labelEl);
                if (labelIdx >= 0) {
                  const edgePathsContainer = containerRef.current.querySelector("g.edgePaths");
                  if (edgePathsContainer) {
                    const allPaths = Array.from(
                      edgePathsContainer.querySelectorAll(
                        "path.flowchart-link:not(.flowchart-link-hit-target)",
                      ),
                    );
                    if (labelIdx < allPaths.length && allPaths[labelIdx].id) {
                      nodeId = allPaths[labelIdx].id;
                    }
                  }
                }
              }
            }
          } else {
            nodeId = currentNode.id;
            if (!nodeId) {
              const path =
                currentNode.parentElement?.querySelector(
                  "path.flowchart-link:not(.flowchart-link-hit-target)",
                ) || currentNode.closest(".edgeLabel")?.previousElementSibling;
              if (path && path.id) nodeId = path.id;
            }
          }
          break;
        }
        // Class-diagram relationship edges. The relation path (and its wide transparent hit-target
        // clone) carries a stable `data-id`. Only a UML RELATIONSHIP (`id_<Src>_<Dst>_<N>`) is
        // selectable as an edge → surface it as `CLASS_EDGE_<dataId>` (kept verbatim, not
        // normalized) so the class edge toolbar can resolve it. A note↔class attachment edge
        // (`data-id="edgeNote<N>"`) is deliberately NOT selected (it has no relationship type /
        // cardinality, so the toolbar would render empty); it is still double-clickable to edit the
        // connected note's text via the LiveMaidEditor router.
        if (
          currentNode.classList?.contains("relation") ||
          currentNode.classList?.contains("class-relation-hit-target")
        ) {
          const dataId = currentNode.getAttribute("data-id");
          if (dataId && dataId.startsWith("id_")) {
            foundNodeClass = true;
            nodeId = `CLASS_EDGE_${dataId}`;
            break;
          }
        }
        // ER-diagram relationship edges. Mermaid renders each as `path.relationshipLine` with a
        // stable `data-id="id_<srcSvgId>_<dstSvgId>_<N>"` (and we clone a wide transparent
        // `er-relation-hit-target`). Surface it as `ER_EDGE_<dataId>` (kept verbatim, not
        // normalized) so the ER edge toolbar can resolve it via the trailing `_<N>` index.
        if (
          currentNode.classList?.contains("relationshipLine") ||
          currentNode.classList?.contains("er-relation-hit-target")
        ) {
          const dataId = currentNode.getAttribute("data-id");
          if (dataId && dataId.startsWith("id_")) {
            foundNodeClass = true;
            nodeId = `ER_EDGE_${dataId}`;
            break;
          }
        }
        // State-diagram transitions. Mermaid renders each as `path.transition` with a code-order
        // `data-id="edge<N>"` (and we clone a wide transparent `state-transition-hit-target`). Note-
        // edges carry a `note-edge` class and a `<src>-<src>----note-<N>` data-id and are NOT
        // selectable. Surface a real transition as `STATE_EDGE_<dataId>` (kept verbatim) so the state
        // edge toolbar can resolve it via the `edge<N>` index.
        if (
          currentNode.classList?.contains("transition") ||
          currentNode.classList?.contains("state-transition-hit-target")
        ) {
          const dataId = currentNode.getAttribute("data-id");
          if (dataId && /^edge\d+$/.test(dataId) && !currentNode.classList?.contains("note-edge")) {
            foundNodeClass = true;
            nodeId = `STATE_EDGE_${dataId}`;
            break;
          }
        }
        // Sequence diagram elements: actors. Match both the plain `actor` class (rect headers and
        // the Entity/Database/Queue <g class="actor"> groups) AND `actor-man` (the Actor/Boundary/
        // Control stick-figure <g class="actor-man"> groups, which do NOT carry the bare `actor`
        // class). With CSS `pointer-events: bounding-box` on these groups, a click in their interior
        // whitespace lands on the group element itself, so resolving it here makes the whole shape
        // selectable. (`actor-line` lifelines are excluded — classList.contains('actor') is a token
        // match and never matches 'actor-line'.) Note the class also sits directly on
        // `text.actor`/`text.actor-box` glyphs; the measurement block below resolves those to the
        // real actor shape (sibling rect or containing group) so the inline editor always sizes to
        // the object, never the text glyph.
        if (
          currentNode.classList?.contains("actor") ||
          currentNode.classList?.contains("actor-man")
        ) {
          foundNodeClass = true;

          const containerEl = containerRef.current;
          if (!containerEl) break;

          const actorDisplayName = getSvgTextDisplayName(currentNode);
          const clickedRect = currentNode.getBoundingClientRect();
          const containerRect = containerEl.getBoundingClientRect();
          const scale = containerRect.width / containerEl.offsetWidth;
          const clickedX =
            (clickedRect.left -
              containerRect.left +
              containerEl.scrollLeft +
              clickedRect.width / 2) /
            scale;

          const lifelines = getSequenceLifelines();
          const nearest = lifelines
            .map((l) => ({ actorId: l.actorId, d: Math.abs(l.x - clickedX) }))
            .sort((a, b) => a.d - b.d)[0];

          // Resolve by actor label first; geometry is only a fallback when label resolution is ambiguous.
          const resolvedByName = actorDisplayName
            ? resolveSequenceActorIdFromDisplayName(actorDisplayName)
            : null;
          const hasResolvedLifeline = Boolean(
            resolvedByName && lifelines.some((lifeline) => lifeline.actorId === resolvedByName),
          );

          // AMBIGUOUS LABEL GUARD: when MULTIPLE participants share the same display label (e.g. two
          // participants both aliased "New Boundary"), label-first resolution always returns the
          // FIRST match — so clicking the right "New Boundary" would wrongly select the left one.
          // In that case geometry (nearest lifeline to the clicked X) is the only reliable signal,
          // so prefer it. Unique labels keep using the robust label-first path.
          const normalizedClickedLabel = normalizeSequenceLabel(actorDisplayName);
          const labelMatchCount = actorDisplayName
            ? getSequenceParticipantEntries().filter(
                (entry) =>
                  normalizeSequenceLabel(entry.alias) === normalizedClickedLabel ||
                  normalizeSequenceLabel(entry.id) === normalizedClickedLabel,
              ).length
            : 0;
          const labelIsAmbiguous = labelMatchCount > 1;

          const actorId =
            labelIsAmbiguous && nearest?.actorId
              ? nearest.actorId
              : hasResolvedLifeline
                ? (resolvedByName as string)
                : nearest?.actorId || resolvedByName || actorDisplayName;
          nodeId = `SEQ_ACTOR_${actorId}`;
          break;
        }
        // Sequence message text
        if (currentNode.classList?.contains("messageText")) {
          foundNodeClass = true;
          const allMsgLines = Array.from(
            containerRef.current?.querySelectorAll(
              '[class^="messageLine"], [class*=" messageLine"]',
            ) || [],
          ) as SVGElement[];
          const lineEl = findOwningLineForSequenceLabel(currentNode, allMsgLines);
          const idx = lineEl ? allMsgLines.indexOf(lineEl) : 0;
          nodeId = `SEQ_MSG_${idx >= 0 ? idx : 0}`;
          break;
        }
        // Sequence message line
        if (isSequenceMessageLineElement(currentNode)) {
          foundNodeClass = true;
          const allMsgLines = Array.from(
            containerRef.current?.querySelectorAll(
              '[class^="messageLine"], [class*=" messageLine"]',
            ) || [],
          ) as SVGElement[];
          const idx = allMsgLines.indexOf(currentNode);
          nodeId = `SEQ_MSG_${idx}`;
          break;
        }
        // Sequence note text (clicking the label text)
        if (currentNode.classList?.contains("noteText")) {
          foundNodeClass = true;
          const allNotes = getSortedNoteTextEls(containerRef.current || document.body);
          const idx = allNotes.indexOf(currentNode);
          nodeId = `SEQ_NOTE_${idx >= 0 ? idx : 0}`;
          break;
        }
        // Sequence note rect (clicking the yellow background — rect.note)
        if (
          currentNode.tagName?.toLowerCase() === "rect" &&
          currentNode.classList?.contains("note")
        ) {
          foundNodeClass = true;
          // Find the nearest .noteText sibling in the same parent group to resolve the index
          const allNoteRects = Array.from(
            containerRef.current?.querySelectorAll("rect.note") || [],
          );
          const rectIdx = allNoteRects.indexOf(currentNode);
          // .noteText elements are in 1:1 correspondence with rect.note elements
          const allNoteTexts = getSortedNoteTextEls(containerRef.current || document.body);
          const idx = rectIdx >= 0 && rectIdx < allNoteTexts.length ? rectIdx : 0;
          // Remap currentNode to the paired .noteText so selection/textBox logic finds the label
          if (allNoteTexts[idx]) {
            currentNode = allNoteTexts[idx] as SVGElement;
          }
          nodeId = `SEQ_NOTE_${idx}`;
          break;
        }
        currentNode = currentNode.parentElement as SVGElement | null;
      }

      if (foundNodeClass && currentNode && containerRef.current) {
        const cleanId = nodeId
          ? nodeId.startsWith("SEQ_") ||
            nodeId.startsWith("CLASS_EDGE_") ||
            nodeId.startsWith("ER_EDGE_") ||
            nodeId.startsWith("STATE_EDGE_") ||
            nodeId.startsWith("MINDMAP_") ||
            nodeId.startsWith("TIMELINE_")
            ? nodeId
            : normalizeId(nodeId)
          : null;

        // If it's an edge and we clicked the path itself, check if there is an .edgeLabel in the container for this edge.
        // If so, snap the currentNode to that label so that our selection/text boxes align perfectly on the label text.
        if (
          cleanId &&
          isEdgeId(cleanId) &&
          (currentNode.classList?.contains("flowchart-link") ||
            currentNode.classList?.contains("flowchart-link-hit-target"))
        ) {
          const edgeLabels = Array.from(containerRef.current.querySelectorAll(".edgeLabel"));
          const matchingLabel = edgeLabels.find((labelEl) => {
            const rawId =
              labelEl.getAttribute("data-id") ??
              labelEl.querySelector("[data-id]")?.getAttribute("data-id") ??
              null;
            const hasText = labelEl.textContent?.trim() !== "";
            return hasText && rawId !== null && normalizeId(rawId) === cleanId;
          });
          if (matchingLabel) {
            currentNode = matchingLabel as SVGElement;
          }
        }

        if (
          cleanId &&
          isEdgeId(cleanId) &&
          currentNode.classList?.contains("edgeLabel") &&
          !currentNode.id
        ) {
          currentNode.id = `edge-label-${cleanId}`;
        }

        if (cleanId && cleanId.startsWith("SEQ_ACTOR_") && !currentNode.id) {
          const resolved = containerRef.current
            ? resolveCompactActorElement(containerRef.current, currentNode, null)
            : currentNode;
          if (resolved !== currentNode) {
            currentNode = resolved as SVGElement;
          }
          const b = currentNode.getBoundingClientRect();
          const actorKey = cleanId.replace("SEQ_ACTOR_", "").replace(/[^a-zA-Z0-9_]/g, "");
          currentNode.id = `seq-actor-${actorKey}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }
        if (
          cleanId &&
          (cleanId.startsWith("SEQ_MSG_") || cleanId.startsWith("SEQ_NOTE_")) &&
          !currentNode.id
        ) {
          const seqIdx = cleanId.split("_").pop();
          currentNode.id = `seq-${cleanId.startsWith("SEQ_MSG_") ? "msg" : "note"}-${seqIdx}`;
        }

        let pathElementToMeasure = currentNode;
        if (currentNode.classList?.contains("flowchart-link-hit-target")) {
          const next = currentNode.nextElementSibling;
          const prev = currentNode.previousElementSibling;
          if (
            next &&
            (next.classList?.contains("flowchart-link") || next.classList?.contains("path"))
          ) {
            pathElementToMeasure = next as SVGElement;
          } else if (
            prev &&
            (prev.classList?.contains("flowchart-link") || prev.classList?.contains("path"))
          ) {
            pathElementToMeasure = prev as SVGElement;
          } else if (containerRef.current && cleanId) {
            const paths = Array.from(
              containerRef.current.querySelectorAll(
                "path.flowchart-link:not(.flowchart-link-hit-target)",
              ),
            );
            for (const p of paths) {
              if (p.id && normalizeId(p.id) === cleanId) {
                pathElementToMeasure = p as SVGElement;
                break;
              }
            }
          }
        }

        if (
          cleanId &&
          !currentNode.id &&
          (currentNode.classList?.contains("node") || currentNode.classList?.contains("cluster"))
        ) {
          const b = currentNode.getBoundingClientRect();
          const kind = currentNode.classList?.contains("cluster") ? "cluster" : "node";
          const key = cleanId.replace(/[^a-zA-Z0-9_]/g, "_");
          currentNode.id = `${kind}-${key}-${Math.round(b.left)}-${Math.round(b.top)}`;
        }

        let rawSvgId = currentNode.id;
        let rect = pathElementToMeasure.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;

        // For sequence actors (including the specialised vector shapes), measure the EXACT clicked
        // instance (top header vs bottom footer) — never a broad `rect.actor` query that could resolve
        // to another actor or the other twin.
        if (cleanId && cleanId.startsWith("SEQ_ACTOR_")) {
          const tag = currentNode.tagName.toLowerCase();
          if (
            tag === "g" &&
            (currentNode.classList?.contains("actor") ||
              currentNode.classList?.contains("actor-man"))
          ) {
            // Complex shape: the clicked node IS the per-twin group (Actor/Boundary/Control =
            // g.actor-man, Entity/Database/Queue = g.actor). It has no inner rect.actor, so its own
            // bounding box is the precise clicked-instance box.
            rect = currentNode.getBoundingClientRect();
          } else if (tag === "rect" && currentNode.classList?.contains("actor")) {
            // Standard rect header clicked directly — that rect is the exact twin.
            rect = currentNode.getBoundingClientRect();
          } else {
            // Narrow text label clicked: resolve to the nearest actor shape by walking up
            // the DOM. Prefer a direct sibling rect.actor, then the closest ancestor group
            // (g.actor-man / g.actor), then any ancestor rect.actor, before falling back
            // to the clicked element's own box.
            const siblingRect = currentNode.parentElement?.querySelector(
              ":scope > rect.actor",
            ) as SVGElement | null;
            if (siblingRect) {
              rect = siblingRect.getBoundingClientRect();
            } else {
              const actorGroup = currentNode.closest("g.actor-man, g.actor") as SVGElement | null;
              if (actorGroup) {
                rect = actorGroup.getBoundingClientRect();
              } else {
                const ancestorRect = currentNode.parentElement?.closest(
                  "rect.actor",
                ) as SVGElement | null;
                if (ancestorRect) {
                  rect = ancestorRect.getBoundingClientRect();
                } else {
                  rect = currentNode.getBoundingClientRect();
                }
              }
            }
          }
        }

        // For sequence messages, always select text + underlying connection together.
        if (cleanId && cleanId.startsWith("SEQ_MSG_")) {
          const idx = parseInt(cleanId.replace("SEQ_MSG_", ""), 10);
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
            const pairedTextEl = visual.labelEls[0] || null;
            if (pairedTextEl && !pairedTextEl.id) pairedTextEl.id = `seq-msg-${idx}`;

            const lineRect = visual.lineRect;
            const labelRect = visual.labelRect;
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
              rawSvgId = pairedTextEl?.id || visual.lineEl?.id || rawSvgId;
            }
          }
        }

        // For sequence notes, use the full rect.note box for the selection outline.
        // The foundElement is .noteText (for editing), but visually we want the yellow box bounds.
        if (cleanId && cleanId.startsWith("SEQ_NOTE_")) {
          const idx = parseInt(cleanId.replace("SEQ_NOTE_", ""), 10);
          const allNoteTexts = getSortedNoteTextEls(containerRef.current);
          const noteTextEl =
            allNoteTexts[idx] || (currentNode.classList?.contains("noteText") ? currentNode : null);
          if (noteTextEl) {
            const rectNote = getSequenceNoteRectForText(noteTextEl);
            if (rectNote) {
              rect = rectNote.getBoundingClientRect();
            }
          }
        }

        // Sequence messages get equal padding so the selection box matches the hover box.
        const msgPadX = cleanId && cleanId.startsWith("SEQ_MSG_") ? SEQ_MSG_SELECTION_PADDING.x : 0;
        const msgPadY = cleanId && cleanId.startsWith("SEQ_MSG_") ? SEQ_MSG_SELECTION_PADDING.y : 0;
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

        return { cleanId, rawSvgId, newSelectionBox, newTextBox };
      }
      return null;
    },
    [
      containerRef,
      code,
      determineDiagramType,
      normalizeId,
      resolveSequenceActorIdFromDisplayName,
      getSequenceLifelines,
      getSvgTextDisplayName,
      getSequenceParticipantEntries,
      findNearestLineForText,
      getSequenceTextElsForLine,
      normalizeSequenceLabel,
    ],
  );

  return { getClickedNode };
}
