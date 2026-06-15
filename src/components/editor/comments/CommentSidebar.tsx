"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DiagramComment } from "@/lib/api/storage";
import { ArrowUpDown, Check, CheckCheck, ChevronDown, MessageSquarePlus, Star, X } from "lucide-react";

interface CommentSidebarProps {
  openComments: DiagramComment[];
  resolvedComments: DiagramComment[];
  activeCommentId: string | null;
  showResolvedComments: boolean;
  isCommentMode: boolean;
  sortStorageKey: string;
  onClose: () => void;
  onStartCommentMode: () => void;
  onActivateComment: (commentId: string) => void;
  onToggleResolvedComment: (commentId: string, resolved: boolean) => void;
  onToggleResolvedSection: () => void;
  onToggleStarComment: (commentId: string, starred: boolean) => void;
}

type CommentSortMode =
  | "activity-desc"
  | "activity-asc"
  | "starred-first";

type CommentCard = {
  id: string;
  snippet: string;
  timestamp: string;
  createdAt: string;
  comment: DiagramComment;
};

const DEFAULT_SORT_MODE: CommentSortMode = "activity-desc";

function isCommentSortMode(value: string | null): value is CommentSortMode {
  return (
    value === "activity-desc" ||
    value === "activity-asc" ||
    value === "starred-first"
  );
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function formatRelativeTime(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const deltaMinutes = Math.max(0, Math.round(deltaMs / 60000));

  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function messagePreview(comment: DiagramComment) {
  const latest = comment.messages[comment.messages.length - 1];
  return (latest?.content || "Comment thread").split(/\r?\n/)[0];
}

function getSortButtonLabel(mode: CommentSortMode) {
  switch (mode) {
    case "activity-asc":
      return "Sort: Last activity ↑";
    case "starred-first":
      return "Sort: Starred first";
    case "activity-desc":
    default:
      return "Sort: Last activity ↓";
  }
}

function getSortMenuLabel(mode: CommentSortMode) {
  switch (mode) {
    case "activity-desc":
      return "Last activity · Newest first";
    case "activity-asc":
      return "Last activity · Oldest first";
    case "starred-first":
      return "Starred first";
    default:
      return "Last activity · Newest first";
  }
}

function compareCommentCards(left: CommentCard, right: CommentCard, mode: CommentSortMode) {
  const leftActivity = new Date(left.timestamp).getTime() || 0;
  const rightActivity = new Date(right.timestamp).getTime() || 0;
  const leftStarred = Boolean(left.comment.starred);
  const rightStarred = Boolean(right.comment.starred);

  switch (mode) {
    case "activity-asc":
      return leftActivity - rightActivity;
    case "activity-desc":
      return rightActivity - leftActivity;
    case "starred-first":
      return Number(rightStarred) - Number(leftStarred) || rightActivity - leftActivity;
    default:
      return rightActivity - leftActivity;
  }
}

function sortCommentCards(cards: CommentCard[], mode: CommentSortMode) {
  return [...cards].sort((left, right) => compareCommentCards(left, right, mode));
}

function CommentThreadCard({
  snippet,
  timestamp,
  comment,
  active,
  starred,
  resolved,
  onActivate,
  onToggleStar,
  onToggleResolved,
}: {
  snippet: string;
  timestamp: string;
  comment: DiagramComment;
  active: boolean;
  starred: boolean;
  resolved: boolean;
  onActivate: () => void;
  onToggleStar: () => void;
  onToggleResolved: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
          className={`relative w-full cursor-pointer overflow-hidden rounded-xl border text-left transition-colors ${
        active
          ? "border-border bg-indigo-50/70 pl-[15px] dark:border-indigo-500/30 dark:bg-indigo-500/10"
          : "border-border bg-background hover:bg-accent/30"
      }`}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
    >
      {active && <div className="absolute inset-y-0 left-0 w-[3px] bg-indigo-500" />}
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-medium text-foreground">{snippet}</p>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatTimestamp(timestamp)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {comment.messages.length} message
              {comment.messages.length === 1 ? "" : "s"} · Last activity {formatRelativeTime(timestamp)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${
              starred
                ? "text-amber-500 hover:text-amber-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleStar();
            }}
            aria-label={starred ? "Unstar comment" : "Star comment"}
          >
            <Star className={`h-4 w-4 ${starred ? "fill-current" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={
              resolved
                ? "h-8 border-border bg-background text-foreground hover:bg-accent/60"
                : "h-8 border-emerald-600 bg-background text-emerald-700 hover:border-emerald-600 hover:bg-emerald-600 hover:text-white"
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggleResolved();
            }}
          >
            {resolved ? "Reopen" : "Resolve"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CommentSidebar({
  openComments,
  resolvedComments,
  activeCommentId,
  showResolvedComments,
  isCommentMode,
  sortStorageKey,
  onClose,
  onStartCommentMode,
  onActivateComment,
  onToggleResolvedComment,
  onToggleResolvedSection,
  onToggleStarComment,
}: CommentSidebarProps) {
  const [sortMode, setSortMode] = useState<CommentSortMode>(() => {
    if (typeof window === "undefined") return DEFAULT_SORT_MODE;
    const saved = window.localStorage.getItem(sortStorageKey);
    return isCommentSortMode(saved) ? saved : DEFAULT_SORT_MODE;
  });
  const openCount = openComments.length;
  const resolvedCount = resolvedComments.length;

  const openCommentCards = useMemo<CommentCard[]>(
    () =>
      openComments.map((comment) => ({
        id: comment.id,
        snippet: messagePreview(comment),
        timestamp: comment.messages[comment.messages.length - 1]?.timestamp || comment.updatedAt,
        createdAt: comment.createdAt,
        comment,
      })),
    [openComments],
  );

  const resolvedCommentCards = useMemo<CommentCard[]>(
    () =>
      resolvedComments.map((comment) => ({
        id: comment.id,
        snippet: messagePreview(comment),
        timestamp: comment.messages[comment.messages.length - 1]?.timestamp || comment.updatedAt,
        createdAt: comment.createdAt,
        comment,
      })),
    [resolvedComments],
  );

  const sortedOpenCommentCards = useMemo(
    () => sortCommentCards(openCommentCards, sortMode),
    [openCommentCards, sortMode],
  );
  const sortedResolvedCommentCards = useMemo(
    () => sortCommentCards(resolvedCommentCards, sortMode),
    [resolvedCommentCards, sortMode],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(sortStorageKey, sortMode);
  }, [sortMode, sortStorageKey]);

  return (
    <aside
      data-comment-sidebar
      className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background text-foreground"
      onWheelCapture={(event) => event.stopPropagation()}
    >
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Comments</h2>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                {openCount} open
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={isCommentMode ? "default" : "outline"}
              size="sm"
              className={isCommentMode ? "bg-indigo-600 text-white hover:bg-indigo-700" : ""}
              onClick={onStartCommentMode}
            >
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              Add comment
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Close comments"
              title="Close comments"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-between border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent/50"
                />
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{getSortButtonLabel(sortMode)}</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 border-border bg-background">
              <DropdownMenuItem
                className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground"
                onClick={() => setSortMode("activity-desc")}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{getSortMenuLabel("activity-desc")}</span>
                  {sortMode === "activity-desc" && <Check className="h-4 w-4 text-foreground" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground"
                onClick={() => setSortMode("activity-asc")}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{getSortMenuLabel("activity-asc")}</span>
                  {sortMode === "activity-asc" && <Check className="h-4 w-4 text-foreground" />}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground"
                onClick={() => setSortMode("starred-first")}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{getSortMenuLabel("starred-first")}</span>
                  {sortMode === "starred-first" && <Check className="h-4 w-4 text-foreground" />}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <div className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Open comments
        </div>
        <div className="space-y-2">
          {sortedOpenCommentCards.length > 0 ? (
            sortedOpenCommentCards.map(({ id, snippet, timestamp, comment }) => {
              return (
                <CommentThreadCard
                  key={id}
                  snippet={snippet}
                  timestamp={timestamp}
                  comment={comment}
                  active={activeCommentId === id}
                  starred={Boolean(comment.starred)}
                  resolved={false}
                  onActivate={() => onActivateComment(id)}
                  onToggleStar={() => onToggleStarComment(id, !comment.starred)}
                  onToggleResolved={() => onToggleResolvedComment(id, true)}
                />
              );
            })
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
              {sortedResolvedCommentCards.length > 0 ? (
                sortedResolvedCommentCards.map(({ id, snippet, timestamp, comment }) => {
                  return (
                    <CommentThreadCard
                      key={id}
                      snippet={snippet}
                      timestamp={timestamp}
                      comment={comment}
                      active={activeCommentId === id}
                      starred={Boolean(comment.starred)}
                      resolved
                      onActivate={() => onActivateComment(id)}
                      onToggleStar={() => onToggleStarComment(id, !comment.starred)}
                      onToggleResolved={() => onToggleResolvedComment(id, false)}
                    />
                  );
                })
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
