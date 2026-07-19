"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import type { DiagramComment, DiagramCommentAnchor } from "@/lib/api/storage";
import { CommentBubble } from "./comments/CommentBubble";
import { CommentPin } from "./comments/CommentPin";
import {
  findSequenceMessageIndexByAnchor,
  type SequenceMessageAnchorSignature,
} from "@/lib/diagrams/sequenceCommentAnchor";
import {
  getSequenceNoteRectForText,
  getSortedSequenceNoteTextElements,
} from "@/lib/diagrams/sequenceNotes";
import {
  getVisibleSequenceMessageTexts,
  findOwningLineForSequenceLabel,
} from "@/hooks/useCanvasInteraction";
import { findMindmapSvgElementByNodeId } from "@/lib/diagrams/mindmap";

const SHAPE_COMMENT_OFFSET = 4;
const SEQUENCE_COMMENT_OFFSET = 5;
type CommentComposerState = {
  anchor: DiagramCommentAnchor;
  position: { x: number; y: number };
  targetLabel: string;
  commentMode: "shape" | "canvas";
} | null;

interface CommentLayerProps {
  code: string;
  comments: DiagramComment[];
  scale: number;
  containerRef: RefObject<HTMLDivElement | null>;
  renderIdRef: RefObject<string | null>;
  activeCommentId: string | null;
  onActivateComment: (commentId: string | null) => void;
  commentComposer: CommentComposerState;
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  onSubmitComposer: (content?: string) => void;
  commentReplyDrafts: Record<string, string>;
  onChangeReplyDraft: (commentId: string, value: string) => void;
  onSubmitReply: (commentId: string) => void;
  onToggleResolved: (commentId: string, resolved: boolean) => void;
  commentsRailWidth?: number;
  sequenceMessageEntries?: Array<{ index: number; line: string }>;
  getSequenceMessageEndpointGeometry?: (messageIndex: number) => {
    from: string;
    to: string;
    isSelf: boolean;
    source: { x: number; y: number };
    target: { x: number; y: number };
    lifelines: Array<{ actorId: string; x: number }>;
  } | null;
}

function normalizeSvgId(rawId: string | null | undefined, renderId: string | null): string {
  if (!rawId) return "";
  let cleanId = rawId.replace("-hit-target", "");
  if (renderId && cleanId.includes(renderId)) {
    cleanId = cleanId.replace(new RegExp(`^.*?-?${renderId}-`), "");
  }
  cleanId = cleanId.replace(/^svg-/, "").replace(/^flowchart-/, "");
  const edgeMatch = cleanId.match(/^L[_-]([a-zA-Z0-9]+)[_-]([a-zA-Z0-9]+)[_-](\d+)$/);
  if (edgeMatch) {
    const rawIndex = parseInt(edgeMatch[3], 10);
    const canonicalIndex = 2 * Math.floor(rawIndex / 2);
    return `L_${edgeMatch[1]}_${edgeMatch[2]}_${canonicalIndex}`;
  }
  return cleanId.replace(/[-_]\d+$/, "");
}

function isEdgeAnchorElement(el: Element) {
  return el.tagName.toLowerCase() === "path" || el.tagName.toLowerCase() === "line";
}

export function CommentLayer({
  code,
  comments,
  scale,
  containerRef,
  renderIdRef,
  activeCommentId,
  onActivateComment,
  commentComposer,
  commentDraft,
  setCommentDraft,
  onSubmitComposer,
  commentReplyDrafts,
  onChangeReplyDraft,
  onSubmitReply,
  onToggleResolved,
  commentsRailWidth = 0,
  sequenceMessageEntries = [],
  getSequenceMessageEndpointGeometry,
}: CommentLayerProps) {
  const renderId = renderIdRef.current;
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setContainerEl(containerRef.current);
  }, [containerRef, comments.length, activeCommentId, commentComposer, scale, renderId]);

  const container = containerEl;
  const containerRect = container?.getBoundingClientRect() ?? null;
  const contentWidth = container?.offsetWidth || 1;
  const contentHeight = container?.offsetHeight || 1;
  const canMeasure = Boolean(container && containerRect);
  const sidebarRect =
    container?.ownerDocument
      ?.querySelector<HTMLElement>("[data-comment-sidebar]")
      ?.getBoundingClientRect() ?? null;

  const commentPositions = useMemo(() => {
    if (!canMeasure) return new Map<string, { x: number; y: number; missingTarget: boolean }>();

    const safeContainer = container!;
    const safeContainerRect = containerRect!;
    const entries = new Map<string, { x: number; y: number; missingTarget: boolean }>();
    const elements = Array.from(safeContainer.querySelectorAll("[id], [data-id]"));
    const messageTextEls = getVisibleSequenceMessageTexts(safeContainer);
    const messageLineEls = Array.from(
      safeContainer.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
    ) as SVGElement[];
    const noteTextEls = getSortedSequenceNoteTextElements(safeContainer);

    const getSequenceMessageCanvasPosition = (index: number) => {
      if (getSequenceMessageEndpointGeometry) {
        const geometry = getSequenceMessageEndpointGeometry(index);
        if (geometry) {
          const anchorX = Math.max(geometry.source.x, geometry.target.x) + SEQUENCE_COMMENT_OFFSET;
          const anchorY = (geometry.source.y + geometry.target.y) / 2;
          return { x: anchorX, y: anchorY };
        }
      }

      const lineEl = messageLineEls[index] ?? null;
      const textEl = lineEl
        ? (messageTextEls.filter(
            (t) => findOwningLineForSequenceLabel(t, messageLineEls) === lineEl,
          )[0] ?? null)
        : (messageTextEls[index] ?? null);
      if (!textEl && !lineEl) return null;

      const textRect = textEl?.getBoundingClientRect();
      const lineRect = lineEl?.getBoundingClientRect();
      const referenceTop = lineRect?.top ?? textRect?.top ?? Number.POSITIVE_INFINITY;
      const referenceRight = lineRect?.right ?? textRect?.right ?? Number.NEGATIVE_INFINITY;
      const referenceBottom = lineRect?.bottom ?? textRect?.bottom ?? Number.NEGATIVE_INFINITY;
      const rawX = referenceRight + SEQUENCE_COMMENT_OFFSET * scale;
      const rawY =
        lineRect && Number.isFinite(lineRect.top) && Number.isFinite(lineRect.height)
          ? lineRect.top + lineRect.height / 2
          : referenceTop + (referenceBottom - referenceTop) / 2;
      return {
        x: (rawX - safeContainerRect.left) / scale,
        y: (rawY - safeContainerRect.top) / scale,
      };
    };

    const getSequenceNoteCanvasPosition = (index: number) => {
      const textEl = noteTextEls[index] ?? null;
      if (!textEl) return null;
      const rectEl = getSequenceNoteRectForText(textEl) ?? textEl;
      const rect = rectEl.getBoundingClientRect();
      return {
        x: (rect.right + SHAPE_COMMENT_OFFSET * scale - safeContainerRect.left) / scale,
        y: (rect.top + rect.height / 2 - safeContainerRect.top) / scale,
      };
    };

    for (const comment of comments) {
      let x = contentWidth / 2;
      let y = contentHeight / 2;
      let missingTarget = false;

      if (comment.anchor.type === "canvas" && comment.anchor.position) {
        x = comment.anchor.position.x * contentWidth;
        y = comment.anchor.position.y * contentHeight;
      } else if (comment.anchor.type === "shape") {
        const hasSequenceSignature = Boolean(comment.anchor.sequenceMessage);
        const stateEdgeMatch = comment.anchor.shapeId?.match(/^STATE_EDGE_(edge\d+)$/);
        if (stateEdgeMatch) {
          const stateEdge = safeContainer.querySelector(
            `path.transition[data-id="${stateEdgeMatch[1]}"]`,
          ) as SVGGraphicsElement | null;
          if (stateEdge) {
            const rect = stateEdge.getBoundingClientRect();
            x = (rect.left + rect.width / 2 - safeContainerRect.left) / scale;
            y = (rect.top + rect.height / 2 - safeContainerRect.top) / scale;
            x = Math.min(contentWidth - 16, Math.max(16, x));
            y = Math.min(contentHeight - 16, Math.max(16, y));
            entries.set(comment.id, { x, y, missingTarget: false });
            continue;
          }
          if (comment.anchor.fallbackPos) {
            x = comment.anchor.fallbackPos.x;
            y = comment.anchor.fallbackPos.y;
            missingTarget = true;
            entries.set(comment.id, { x, y, missingTarget });
            continue;
          }
        }

        if (comment.anchor.shapeId?.startsWith("MINDMAP_")) {
          const node = findMindmapSvgElementByNodeId(code, safeContainer, comment.anchor.shapeId);
          if (node) {
            const rect = node.getBoundingClientRect();
            x = (rect.right + SHAPE_COMMENT_OFFSET * scale - safeContainerRect.left) / scale;
            y = (rect.top - SHAPE_COMMENT_OFFSET * scale - safeContainerRect.top) / scale;
            x = Math.min(contentWidth - 16, Math.max(16, x));
            y = Math.min(contentHeight - 16, Math.max(16, y));
            entries.set(comment.id, { x, y, missingTarget: false });
            continue;
          }
          if (comment.anchor.fallbackPos) {
            x = comment.anchor.fallbackPos.x;
            y = comment.anchor.fallbackPos.y;
            missingTarget = true;
            entries.set(comment.id, { x, y, missingTarget });
            continue;
          }
        }

        const directSequenceIndex = Number(
          comment.anchor.shapeId?.match(/^SEQ_MSG_(\d+)$/)?.[1] ?? -1,
        );
        const directSequenceNoteIndex = Number(
          comment.anchor.shapeId?.match(/^SEQ_NOTE_(\d+)$/)?.[1] ?? -1,
        );
        let sequenceIndex =
          Number.isFinite(directSequenceIndex) && directSequenceIndex >= 0
            ? directSequenceIndex
            : hasSequenceSignature
              ? findSequenceMessageIndexByAnchor(
                  sequenceMessageEntries,
                  comment.anchor.sequenceMessage as SequenceMessageAnchorSignature,
                )
              : directSequenceIndex;

        if (Number.isFinite(directSequenceNoteIndex) && directSequenceNoteIndex >= 0) {
          const notePos = getSequenceNoteCanvasPosition(directSequenceNoteIndex);
          if (notePos) {
            x = notePos.x;
            y = notePos.y;
            x = Math.min(contentWidth - 16, Math.max(16, x));
            y = Math.min(contentHeight - 16, Math.max(16, y));
            entries.set(comment.id, { x, y, missingTarget: false });
            continue;
          }
          if (comment.anchor.fallbackPos) {
            x = comment.anchor.fallbackPos.x;
            y = comment.anchor.fallbackPos.y;
            missingTarget = true;
            entries.set(comment.id, { x, y, missingTarget });
            continue;
          }
        }

        if (
          !hasSequenceSignature &&
          Number.isFinite(sequenceIndex) &&
          sequenceIndex >= 0 &&
          comment.anchor.fallbackPos &&
          sequenceMessageEntries.length > 0
        ) {
          let bestIndex = sequenceIndex;
          let bestDist = Number.POSITIVE_INFINITY;
          for (let i = 0; i < sequenceMessageEntries.length; i += 1) {
            const pos = getSequenceMessageCanvasPosition(i);
            if (!pos) continue;
            const dist = Math.hypot(
              pos.x - comment.anchor.fallbackPos.x,
              pos.y - comment.anchor.fallbackPos.y,
            );
            if (dist < bestDist) {
              bestDist = dist;
              bestIndex = i;
            }
          }
          sequenceIndex = bestIndex;
        }

        if (Number.isFinite(sequenceIndex) && sequenceIndex >= 0) {
          const index = sequenceIndex;
          const textEl = messageTextEls[index] ?? null;
          const lineEl =
            messageLineEls[index] ??
            (textEl ? findOwningLineForSequenceLabel(textEl, messageLineEls) : null);
          if (textEl || lineEl) {
            const pos = getSequenceMessageCanvasPosition(index);
            if (pos) {
              x = pos.x;
              y = pos.y;
            }
            x = Math.min(contentWidth - 16, Math.max(16, x));
            y = Math.min(contentHeight - 16, Math.max(16, y));
            entries.set(comment.id, { x, y, missingTarget: false });
            continue;
          }
          if (comment.anchor.fallbackPos) {
            x = comment.anchor.fallbackPos.x;
            y = comment.anchor.fallbackPos.y;
            missingTarget = hasSequenceSignature;
          }
        }

        if (!missingTarget && !hasSequenceSignature) {
          const match = elements.find((el) => {
            const candidateId = el.getAttribute("data-id") || el.id;
            return normalizeSvgId(candidateId, renderId) === comment.anchor.shapeId;
          });
          if (match) {
            const rect = match.getBoundingClientRect();
            const isSequenceMessage =
              Array.from(match.classList).some(
                (cls) => cls === "messageText" || cls.startsWith("messageLine"),
              ) ||
              Boolean(
                match.closest?.(".messageText, [class^='messageLine'], [class*=' messageLine']"),
              );
            const offset = isSequenceMessage ? SEQUENCE_COMMENT_OFFSET : SHAPE_COMMENT_OFFSET;
            const rawX = isSequenceMessage
              ? rect.right + offset * scale
              : isEdgeAnchorElement(match)
                ? rect.left + rect.width / 2
                : rect.right + offset * scale;
            const rawY = isSequenceMessage
              ? rect.top + rect.height / 2
              : isEdgeAnchorElement(match)
                ? rect.top + rect.height / 2
                : rect.top - offset * scale;
            x = (rawX - safeContainerRect.left) / scale;
            y = (rawY - safeContainerRect.top) / scale;
            x = Math.min(contentWidth - 16, Math.max(16, x));
            y = Math.min(contentHeight - 16, Math.max(16, y));
          } else if (comment.anchor.fallbackPos) {
            x = comment.anchor.fallbackPos.x;
            y = comment.anchor.fallbackPos.y;
            missingTarget = true;
          }
        }
      }

      entries.set(comment.id, { x, y, missingTarget });
    }

    return entries;
  }, [
    canMeasure,
    code,
    comments,
    container,
    containerRect,
    contentHeight,
    contentWidth,
    renderId,
    scale,
    sequenceMessageEntries,
  ]);

  const activeComment = comments.find((comment) => comment.id === activeCommentId) ?? null;
  const visibleComments = useMemo(
    () => comments.filter((comment) => !comment.resolved),
    [comments],
  );

  const clampBubblePosition = (
    preferredLeft: number,
    preferredTop: number,
    bubbleWidth: number,
    bubbleHeight: number,
  ) => {
    const railLeftBound =
      commentsRailWidth > 0 ? contentWidth - commentsRailWidth - bubbleWidth - 16 : null;
    const rightBoundFromSidebar =
      sidebarRect && containerRect
        ? sidebarRect.left - containerRect.left - bubbleWidth - 12
        : contentWidth - bubbleWidth - 16;
    const left = Math.min(
      Math.max(16, preferredLeft),
      Math.max(
        16,
        Math.min(
          contentWidth - bubbleWidth - 16,
          rightBoundFromSidebar,
          railLeftBound ?? Number.POSITIVE_INFINITY,
        ),
      ),
    );
    const top = Math.min(
      Math.max(16, preferredTop),
      Math.max(16, contentHeight - bubbleHeight - 16),
    );
    return { left, top };
  };

  return (
    <>
      <div className="absolute inset-0 pointer-events-none z-20">
        {visibleComments.map((comment) => {
          const pos = commentPositions.get(comment.id) || {
            x: contentWidth / 2,
            y: contentHeight / 2,
            missingTarget: false,
          };
          const threadCount = comment.messages.length;

          return (
            <CommentPin
              key={comment.id}
              id={comment.id}
              left={pos.x}
              top={pos.y}
              scale={scale}
              threadCount={threadCount}
              missingTarget={pos.missingTarget}
              resolved={comment.resolved}
              active={activeCommentId === comment.id}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onActivateComment(comment.id);
              }}
            />
          );
        })}
      </div>
      <div className="absolute inset-0 pointer-events-none z-[70]">
        {commentComposer && (
          <CommentBubble
            kind="compose"
            position={(() => {
              const bubbleWidth = 304 / scale;
              const bubbleHeight = 240 / scale;
              const next = clampBubblePosition(
                commentComposer.position.x - bubbleWidth / 2,
                commentComposer.position.y - bubbleHeight / 2,
                bubbleWidth,
                bubbleHeight,
              );
              return { x: next.left, y: next.top };
            })()}
            scale={scale}
            targetLabel={commentComposer.targetLabel}
            value={commentDraft}
            onChangeValue={setCommentDraft}
            onSubmit={(value) => onSubmitComposer(value)}
            onClose={() => onActivateComment(null)}
          />
        )}
        {activeComment && !commentComposer && (
          <CommentBubble
            kind="thread"
            position={(() => {
              const next = clampBubblePosition(
                (commentPositions.get(activeComment.id)?.x ?? contentWidth / 2) + 18,
                (commentPositions.get(activeComment.id)?.y ?? contentHeight / 2) - 12,
                352 / scale,
                312 / scale,
              );
              return { x: next.left, y: next.top };
            })()}
            scale={scale}
            comment={activeComment}
            replyValue={commentReplyDrafts[activeComment.id] ?? ""}
            missingTarget={commentPositions.get(activeComment.id)?.missingTarget ?? false}
            onChangeReplyValue={(value) => onChangeReplyDraft(activeComment.id, value)}
            onSubmitReply={() => onSubmitReply(activeComment.id)}
            onToggleResolved={() => onToggleResolved(activeComment.id, !activeComment.resolved)}
            onClose={() => onActivateComment(null)}
          />
        )}
      </div>
    </>
  );
}
