"use client";

import { CheckCheck, MessageSquareText } from "lucide-react";

interface CommentPinProps {
  id: string;
  left: number;
  top: number;
  scale: number;
  threadCount: number;
  active?: boolean;
  missingTarget?: boolean;
  resolved?: boolean;
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export function CommentPin({
  id,
  left,
  top,
  scale,
  threadCount,
  active = false,
  missingTarget = false,
  resolved = false,
  onMouseDown,
  onClick,
}: CommentPinProps) {
  const stateClass = missingTarget
    ? "border-amber-400 bg-amber-500 text-white"
    : resolved
      ? "border-slate-300 bg-slate-200 text-slate-500"
      : "border-indigo-500 bg-indigo-600 text-white";

  return (
    <button
      id={`comment-pin-${id}`}
      type="button"
      data-scale-lock
      data-base-transform="translate(-50%, -50%)"
      aria-label={`Open comment thread with ${threadCount} message${threadCount === 1 ? "" : "s"}`}
      className={`absolute z-50 pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border shadow-lg transition-transform hover:scale-110 ${stateClass} ${active ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950" : ""}`}
      style={{
        left,
        top,
        transform: `translate(-50%, -50%) scale(var(--zoom-inverse-scale, ${1 / scale}))`,
      }}
      title={`Open comment thread (${threadCount} message${threadCount === 1 ? "" : "s"})${
        missingTarget ? " - target missing" : ""
      }`}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <MessageSquareText className="h-3.5 w-3.5" />
      {resolved && (
        <span className="absolute -bottom-1 -right-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCheck className="h-2 w-2" />
        </span>
      )}
    </button>
  );
}
