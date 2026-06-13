"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DiagramComment } from "@/lib/api/storage";
import { MessageSquareText, Send, X } from "lucide-react";

type BubblePosition = { x: number; y: number };

type ComposeBubbleProps = {
  kind: "compose";
  position: BubblePosition;
  scale: number;
  targetLabel: string;
  value: string;
  onChangeValue: (value: string) => void;
  onSubmit: (value: string) => void;
  onClose: () => void;
};

type ThreadBubbleProps = {
  kind: "thread";
  position: BubblePosition;
  scale: number;
  comment: DiagramComment;
  replyValue: string;
  missingTarget?: boolean;
  onChangeReplyValue: (value: string) => void;
  onSubmitReply: () => void;
  onToggleResolved: () => void;
  onClose: () => void;
};

type CommentBubbleProps = ComposeBubbleProps | ThreadBubbleProps;

export function CommentBubble(props: CommentBubbleProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const composeInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = props.kind === "compose" ? composeInputRef.current : replyInputRef.current;
    el?.focus();
    if (props.kind === "compose") {
      composeInputRef.current?.select();
    }
  }, [props.kind, props.position.x, props.position.y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      if (target.closest('[data-comment-sidebar]')) return;
      if (target.closest('[id^="comment-pin-"]')) return;
      props.onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [props.onClose]);

  return (
    <div
      ref={rootRef}
      className="absolute z-[80] pointer-events-auto"
      data-scale-lock
      data-inline-toolbar
      data-comment-bubble
      style={{
        left: props.position.x,
        top: props.position.y,
        transform: `scale(var(--zoom-inverse-scale, ${1 / props.scale}))`,
        transformOrigin: "top left",
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {props.kind === "compose" ? (
        <div className="w-[19rem] rounded-2xl border border-border bg-background p-3 shadow-2xl">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <MessageSquareText className="h-4 w-4 text-indigo-500" />
                New comment
              </p>
              <p className="truncate text-xs text-muted-foreground">{props.targetLabel}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={props.onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <textarea
            ref={composeInputRef}
            value={props.value}
            onChange={(event) => props.onChangeValue(event.target.value)}
            placeholder="Write the first message..."
            className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => props.onSubmit(props.value)}
              disabled={!props.value.trim()}
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      ) : (
        <div className="w-[22rem] rounded-2xl border border-border bg-background p-3 shadow-2xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Comment thread</p>
              <p className="text-xs text-muted-foreground">
                {props.comment.messages.length} message
                {props.comment.messages.length === 1 ? "" : "s"}
                {props.comment.resolved ? " · Resolved" : ""}
              </p>
              {props.missingTarget && (
                <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                  The shape has been deleted.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={props.comment.resolved ? "outline" : "default"}
                size="sm"
                className={`h-11 px-5 text-base ${
                  props.comment.resolved
                    ? ""
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
                onClick={props.onToggleResolved}
              >
                {props.comment.resolved ? "Reopen" : "Resolve"}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={props.onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {props.comment.messages.map((message) => (
              <div key={message.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{message.authorId}</span>
                  <span>{new Date(message.timestamp).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              ref={replyInputRef}
              value={props.replyValue}
              onChange={(event) => props.onChangeReplyValue(event.target.value)}
              placeholder="Reply..."
              className="h-11"
            />
            <Button
              size="sm"
              className="h-11 px-4"
              onClick={props.onSubmitReply}
              disabled={!props.replyValue.trim()}
            >
              Reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
