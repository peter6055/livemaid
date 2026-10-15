"use client";

import { flowchartNodeMoveBlockedMessage } from "@/lib/diagrams/flowchart/membership";

export type FlowchartHighlightRect = { x: number; y: number; w: number; h: number };
export type FlowchartMembershipHighlight =
  | { kind: "node-target"; subgraphId: string; rect: FlowchartHighlightRect }
  | { kind: "subgraph-target"; subgraphId: string; rect: FlowchartHighlightRect }
  | { kind: "rejected"; rect: FlowchartHighlightRect; reason?: string | null }
  | null;

export type FlowchartDropBlockedReason =
  | "edge-declaration"
  | "edge-only"
  | "multiline-block"
  | "unknown-node"
  | "same-owner"
  | "unknown-dest";

export function flowchartDropBlockedMessage(reason: string | null | undefined): string {
  if (
    reason === "edge-declaration" ||
    reason === "edge-only" ||
    reason === "multiline-block" ||
    reason === "unknown-node" ||
    reason === "same-owner" ||
    reason === "unknown-dest"
  )
    return flowchartNodeMoveBlockedMessage(reason);
  return flowchartNodeMoveBlockedMessage("unknown-dest");
}

// Hint shown while a node is dragged over empty canvas (highlight === null
// means top-level). Kept as a helper so copy stays consistent.
export function flowchartTopLevelHint(draggedKind: "node" | "subgraph" | null): string {
  void draggedKind;
  return "Release to make top-level";
}

export function FlowchartMembershipDropLayer(props: {
  highlight: FlowchartMembershipHighlight;
  draggedKind: "node" | "subgraph" | null;
  showTopLevelHint?: boolean;
}): React.ReactElement | null {
  const { highlight, draggedKind, showTopLevelHint } = props;
  if (highlight === null) {
    if (!(showTopLevelHint && draggedKind === "node")) return null;
    return (
      <div
        className="absolute inset-0 pointer-events-none z-30"
        data-flowchart-drop-overlay
        data-flowchart-drop-kind="node"
        data-flowchart-drop-target="root"
        aria-hidden="true"
      >
        <div
          className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-gray-900/90 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-white"
          data-flowchart-top-level-hint
          role="status"
        >
          {flowchartTopLevelHint(draggedKind)}
        </div>
      </div>
    );
  }
  const target = "subgraphId" in highlight ? highlight.subgraphId : "root";
  const rectStyle =
    highlight.kind === "node-target"
      ? {
          backgroundColor: "rgba(99,102,241,0.10)",
          border: "2px solid #6366f1",
          borderRadius: 8,
        }
      : highlight.kind === "subgraph-target"
        ? {
            backgroundColor: "transparent",
            border: "2.5px solid #4f46e5",
            borderRadius: 8,
          }
        : {
            backgroundColor: "transparent",
            border: "2px dashed #ef4444",
            borderRadius: 8,
          };
  const reason = highlight.kind === "rejected" ? (highlight as { reason?: unknown }).reason : null;
  const blockedMessage =
    typeof reason === "string" && reason ? flowchartDropBlockedMessage(reason) : null;
  const nodeHint = highlight.kind === "node-target" ? `Move into ${highlight.subgraphId}` : null;
  return (
    <div
      className="absolute inset-0 pointer-events-none z-30"
      data-flowchart-drop-overlay
      data-flowchart-drop-kind={draggedKind ?? "none"}
      data-flowchart-drop-target={target}
      aria-hidden="true"
    >
      <div
        className="absolute"
        data-flowchart-drop-rect={highlight.kind}
        style={{
          left: highlight.rect.x,
          top: highlight.rect.y,
          width: highlight.rect.w,
          height: highlight.rect.h,
          ...rectStyle,
        }}
      />
      {nodeHint ? (
        <span
          className="absolute rounded-full bg-indigo-600/95 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white"
          data-flowchart-drop-node-hint={
            highlight.kind === "node-target" ? highlight.subgraphId : undefined
          }
          style={{
            left: highlight.rect.x + 6,
            top: highlight.rect.y + 6,
          }}
        >
          {nodeHint}
        </span>
      ) : null}
      {blockedMessage ? (
        <span
          className="absolute max-w-72 rounded-md bg-gray-900/95 px-2 py-1 text-[11px] leading-snug text-white shadow-lg"
          data-flowchart-drop-reason={reason}
          role="status"
          style={{
            left: highlight.rect.x,
            top: highlight.rect.y,
            transform: "translateY(-110%)",
          }}
        >
          {blockedMessage}
        </span>
      ) : null}
    </div>
  );
}
