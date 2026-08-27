"use client";

import type { RefObject } from "react";
import type { DiagramComment, DiagramCommentAnchor } from "@/lib/api/storage";
import { CommentLayer } from "./CommentLayer";
import { EmptyCanvas } from "./EmptyCanvas";
import { StableMermaidHtml } from "./StableMermaidHtml";

type CommentComposerState = {
  anchor: DiagramCommentAnchor;
  position: { x: number; y: number };
  targetLabel: string;
  commentMode: "shape" | "canvas";
} | null;

/**
 * Dotted canvas backdrop plus the blank-diagram overlay. Rendered as direct
 * children of the canvas shell, before the pan/zoom transform wrapper.
 */
export function CanvasBackdrop({
  isBlankDiagram,
  handleCodeChange,
}: {
  isBlankDiagram: boolean;
  handleCodeChange?: (code: string) => void;
}) {
  return (
    <>
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-100"
        style={{
          backgroundImage: "radial-gradient(circle at 2px 2px, #cbd5e1 1.5px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
      {isBlankDiagram && (
        <div className="absolute inset-0 z-40 bg-white/90">
          <EmptyCanvas handleCodeChange={handleCodeChange} />
        </div>
      )}
    </>
  );
}

interface CanvasSvgLayerProps {
  isBlankDiagram: boolean;
  svgContent: string;
  parseError: string | null;
  code: string;
  comments?: DiagramComment[];
  scale: number;
  containerRef: RefObject<HTMLDivElement | null>;
  renderIdRef: RefObject<string | null>;
  activeCommentId?: string | null;
  onActivateComment?: (commentId: string | null) => void;
  commentComposer?: CommentComposerState;
  commentDraft?: string;
  setCommentDraft?: (value: string) => void;
  onSubmitComposer?: (content?: string) => void;
  commentReplyDrafts?: Record<string, string>;
  onChangeReplyDraft?: (commentId: string, value: string) => void;
  onSubmitReply?: (commentId: string) => void;
  onToggleResolved?: (commentId: string, resolved: boolean) => void;
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

/**
 * The rendered Mermaid SVG plus the comment layer. Must be mounted inside the
 * TransformComponent content container so it pans/zooms with the diagram.
 */
export default function CanvasSvgLayer({
  isBlankDiagram,
  svgContent,
  parseError,
  code,
  comments = [],
  scale,
  containerRef,
  renderIdRef,
  activeCommentId = null,
  onActivateComment,
  commentComposer = null,
  commentDraft = "",
  setCommentDraft,
  onSubmitComposer,
  commentReplyDrafts = {},
  onChangeReplyDraft,
  onSubmitReply,
  onToggleResolved,
  commentsRailWidth = 0,
  sequenceMessageEntries = [],
  getSequenceMessageEndpointGeometry,
}: CanvasSvgLayerProps) {
  return (
    <>
      {!isBlankDiagram && (
        <StableMermaidHtml
          html={svgContent}
          className={`mermaid-container select-none ${parseError ? "opacity-30" : ""}`}
        />
      )}

      <CommentLayer
        code={code}
        comments={comments}
        scale={scale}
        containerRef={containerRef}
        renderIdRef={renderIdRef}
        activeCommentId={activeCommentId}
        onActivateComment={onActivateComment ?? (() => {})}
        commentComposer={commentComposer}
        commentDraft={commentDraft}
        setCommentDraft={setCommentDraft ?? (() => {})}
        onSubmitComposer={onSubmitComposer ?? (() => {})}
        commentReplyDrafts={commentReplyDrafts}
        onChangeReplyDraft={onChangeReplyDraft ?? (() => {})}
        onSubmitReply={onSubmitReply ?? (() => {})}
        onToggleResolved={onToggleResolved ?? (() => {})}
        commentsRailWidth={commentsRailWidth}
        sequenceMessageEntries={sequenceMessageEntries}
        getSequenceMessageEndpointGeometry={getSequenceMessageEndpointGeometry}
      />
    </>
  );
}
