"use client";

import { useEffect, useRef } from "react";
import { useControls } from "react-zoom-pan-pinch";
import { Lock, Plus, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CommentFocusSync({
  activeCommentId,
  activeCommentFocusToken,
  commentsRailWidth,
}: {
  activeCommentId: string | null;
  activeCommentFocusToken: number;
  commentsRailWidth: number;
}) {
  const { state, zoomToElement } = useControls();
  const commentsRailWidthRef = useRef(commentsRailWidth);
  const lastAppliedFocusTokenRef = useRef<number | null>(null);

  useEffect(() => {
    commentsRailWidthRef.current = commentsRailWidth;
  }, [commentsRailWidth]);

  useEffect(() => {
    if (!activeCommentId) return;
    if (lastAppliedFocusTokenRef.current === activeCommentFocusToken) return;
    lastAppliedFocusTokenRef.current = activeCommentFocusToken;

    const frame = window.requestAnimationFrame(() => {
      const node = document.getElementById(`comment-pin-${activeCommentId}`);
      if (!node) return;

      zoomToElement(
        node,
        state.scale,
        320,
        "easeOut",
        commentsRailWidthRef.current > 0 ? -(commentsRailWidthRef.current / 2) : 0,
        0,
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeCommentId, activeCommentFocusToken, state.scale, zoomToElement]);

  return null;
}

export function CanvasZoomControls({
  zoomIn,
  zoomOut,
  resetTransform,
  isLocked,
  setIsLocked,
  onDeselect,
}: {
  zoomIn: () => void;
  zoomOut: () => void;
  resetTransform: () => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  onDeselect?: () => void;
}) {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 bg-background border border-border p-1 rounded-lg shadow-sm">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          if (onDeselect) onDeselect();
          zoomIn();
        }}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
      </Button>
      <div className="h-px bg-border" />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          if (onDeselect) onDeselect();
          resetTransform();
        }}
        title="Reset zoom"
      >
        <span className="text-[10px] font-bold">1:1</span>
      </Button>
      <div className="h-px bg-border" />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={() => {
          if (onDeselect) onDeselect();
          zoomOut();
        }}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <path fill="currentColor" d="M19 13H5v-2h14v2z" />
        </svg>
      </Button>
      <div className="h-px bg-border" />
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 hover:bg-accent hover:text-accent-foreground ${isLocked ? "text-red-500" : "text-foreground"}`}
        onClick={() => setIsLocked(!isLocked)}
        title={isLocked ? "Unlock diagram" : "Lock diagram"}
      >
        {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
      </Button>
    </div>
  );
}
