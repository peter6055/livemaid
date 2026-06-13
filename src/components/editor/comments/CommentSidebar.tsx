"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DiagramComment } from "@/lib/api/storage";
import {
  ChevronDown,
  CheckCheck,
  MessageSquarePlus,
  MessageSquareText,
  Pin,
  X,
} from "lucide-react";

interface CommentSidebarProps {
  openComments: DiagramComment[];
  resolvedComments: DiagramComment[];
  activeCommentId: string | null;
  showResolvedComments: boolean;
  isCommentMode: boolean;
  onClose: () => void;
  onStartCommentMode: () => void;
  onActivateComment: (commentId: string) => void;
  onToggleResolvedComment: (commentId: string, resolved: boolean) => void;
  onToggleResolvedSection: () => void;
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function messagePreview(comment: DiagramComment) {
  const latest = comment.messages[comment.messages.length - 1];
  return (latest?.content || "Comment thread").split(/\r?\n/)[0];
}

export function CommentSidebar({
  openComments,
  resolvedComments,
  activeCommentId,
  showResolvedComments,
  isCommentMode,
  onClose,
  onStartCommentMode,
  onActivateComment,
  onToggleResolvedComment,
  onToggleResolvedSection,
}: CommentSidebarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  const openCount = openComments.length;
  const resolvedCount = resolvedComments.length;

  const openCommentCards = useMemo(
    () =>
      openComments.map((comment) => {
        const latest = comment.messages[comment.messages.length - 1];
        return {
          id: comment.id,
          snippet: messagePreview(comment),
          author: latest?.authorId || "anonymous",
          timestamp: latest?.timestamp || comment.updatedAt,
          comment,
        };
      }),
    [openComments],
  );

  const resolvedCommentCards = useMemo(
    () =>
      resolvedComments.map((comment) => {
        const latest = comment.messages[comment.messages.length - 1];
        return {
          id: comment.id,
          snippet: messagePreview(comment),
          author: latest?.authorId || "anonymous",
          timestamp: latest?.timestamp || comment.updatedAt,
          comment,
        };
      }),
    [resolvedComments],
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest('[data-comment-bubble]')) return;
      if (target.closest('[id^="comment-pin-"]')) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [hasMounted, onClose]);

  return (
    <aside
      ref={rootRef}
      data-comment-sidebar
      className="absolute right-4 top-4 z-50 w-[24rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-background/95 text-foreground shadow-2xl backdrop-blur-md"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Comments</h2>
            <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-300">
              {openCount} open
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isCommentMode ? "default" : "outline"}
            size="sm"
            className={isCommentMode ? "bg-indigo-600 text-white hover:bg-indigo-700" : ""}
            onClick={onStartCommentMode}
          >
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Add comment
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {openCommentCards.length > 0 ? (
            openCommentCards.map(({ id, snippet, author, timestamp, comment }) => (
              <div
                key={id}
                role="button"
                tabIndex={0}
                className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-colors hover:border-indigo-500/60 hover:bg-accent/50 ${activeCommentId === id ? "border-indigo-500 ring-2 ring-indigo-500 ring-offset-2 ring-offset-background" : "border-border bg-background"}`}
                onClick={() => onActivateComment(id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onActivateComment(id);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                    <MessageSquareText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{snippet}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatTimestamp(timestamp)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {author} · {comment.messages.length} message
                      {comment.messages.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Pin className="h-3 w-3" />
                      Thread
                    </p>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onToggleResolvedComment(id, true);
                    }}
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No open comment threads yet.
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/50"
            onClick={onToggleResolvedSection}
            disabled={resolvedCount === 0}
          >
            <span className="flex items-center gap-2">
              <CheckCheck className="h-4 w-4 text-emerald-600" />
              Resolved comments
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {resolvedCount}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showResolvedComments ? "rotate-180" : ""}`}
              />
            </span>
          </button>

          {showResolvedComments && (
            <div className="mt-2 space-y-2">
              {resolvedCommentCards.length > 0 ? (
                resolvedCommentCards.map(({ id, snippet, author, timestamp, comment }) => (
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    className={`w-full cursor-pointer rounded-xl border border-border bg-muted/30 p-3 text-left transition-colors hover:border-indigo-500/50 hover:bg-accent/40 ${activeCommentId === id ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-background" : ""}`}
                    onClick={() => onActivateComment(id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onActivateComment(id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <CheckCheck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{snippet}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatTimestamp(timestamp)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {author} · {comment.messages.length} message
                          {comment.messages.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onToggleResolvedComment(id, false);
                        }}
                      >
                        Reopen
                        </Button>
                      </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  No resolved threads.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
