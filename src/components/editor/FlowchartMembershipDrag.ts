"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  isValidSubgraphDrop,
  resolveFlowchartDropTarget,
  type FlowchartClusterRect,
} from "@/lib/diagrams/flowchart/dropTarget";
import {
  getFlowchartNodeMoveEligibility,
  moveFlowchartNode,
  type FlowchartNodeMoveBlockReason,
} from "@/lib/diagrams/flowchart/membership";
import {
  findFlowchartNodeLine,
  findFlowchartNodeSubgraphId,
  findFlowchartSubgraphEndLine,
  findFlowchartSubgraphLine,
} from "@/lib/diagrams/flowchart/selectionLineMap";
import { moveFlowchartSubgraph } from "@/lib/diagrams/flowchart/subgraphMove";

export type FlowchartDragKind = "node" | "subgraph";

export type FlowchartHighlightRect = { x: number; y: number; w: number; h: number };

export type FlowchartMembershipHighlight =
  | { kind: "node-target"; subgraphId: string; rect: FlowchartHighlightRect }
  | { kind: "subgraph-target"; subgraphId: string; rect: FlowchartHighlightRect }
  | {
      kind: "rejected";
      rect: FlowchartHighlightRect;
      reason?: FlowchartNodeMoveBlockReason | "same-owner" | null;
    }
  | null;

export type FlowchartDragVia = "node" | "cluster-label" | "cluster-border" | "none";

export interface FlowchartDragClassification {
  kind: FlowchartDragKind | null;
  via: FlowchartDragVia;
  element: Element | null;
}

/** Viewport movement (px) required before a pointerdown becomes a drag. */
export const FLOWCHART_MEMBERSHIP_DRAG_THRESHOLD = 5;

const NO_TARGET: FlowchartDragClassification = { kind: null, via: "none", element: null };

/**
 * Classify a pointerdown target: `.node` (child-node drag wins, even inside a
 * cluster), then `g.cluster` (label hit → subgraph drag, border hit → subgraph
 * drag), else ignore. Never touches code state — pure DOM check.
 */
export function classifyFlowchartDragTarget(target: Element | null): FlowchartDragClassification {
  if (!target || typeof target.closest !== "function") return NO_TARGET;
  const nodeEl = target.closest(".node");
  if (nodeEl) return { kind: "node", via: "node", element: nodeEl };
  const clusterEl = target.closest("g.cluster, .cluster");
  if (clusterEl) {
    const viaLabel = target.closest(".cluster-label");
    return {
      kind: "subgraph",
      via: viaLabel ? "cluster-label" : "cluster-border",
      element: clusterEl,
    };
  }
  const labelEl = target.closest(".cluster-label");
  if (labelEl) return { kind: "subgraph", via: "cluster-label", element: labelEl };
  return NO_TARGET;
}

/** Chebyshev arm check: true once movement exceeds the threshold on either axis. */
export function isBeyondDragThreshold(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  threshold: number = FLOWCHART_MEMBERSHIP_DRAG_THRESHOLD,
): boolean {
  return Math.abs(clientX - startX) > threshold || Math.abs(clientY - startY) > threshold;
}

/** Mirror of the flowchart-relevant `normalizeId` steps (no render-id context here). */
export function normalizeFlowchartDragId(rawId: string): string {
  if (!rawId) return "";
  let id = rawId.replace("-hit-target", "");
  id = id.replace(/^svg-/, "").replace(/^flowchart-/, "");
  id = id.replace(/[-_]\d+$/, "");
  return id;
}

/** True when `id` names a known node (node drag) or subgraph (subgraph drag). */
export function isKnownFlowchartId(code: string, id: string, kind: FlowchartDragKind): boolean {
  if (!id) return false;
  return kind === "node"
    ? findFlowchartNodeLine(code, id) !== -1
    : findFlowchartSubgraphLine(code, id) !== -1;
}

/**
 * Resolve a raw SVG group id to a code id. Mermaid prefixes ids with the render
 * id (`flowchart-<renderId>-<id>-<n>`); after normalization, strip leading
 * dash-segments until a known code id matches. Returns null when unresolvable
 * (caller treats it as ignore — never guess).
 */
export function resolveFlowchartDraggedId(
  code: string,
  rawId: string,
  kind: FlowchartDragKind,
): string | null {
  const normalized = normalizeFlowchartDragId(rawId);
  if (!normalized) return null;
  if (isKnownFlowchartId(code, normalized, kind)) return normalized;
  const parts = normalized.split("-");
  for (let i = 1; i < parts.length; i += 1) {
    const candidate = parts.slice(i).join("-");
    if (candidate && isKnownFlowchartId(code, candidate, kind)) return candidate;
  }
  return null;
}

export type FlowchartDomRectEntry = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FlowchartShellOrigin = { left: number; top: number };

/** Map viewport rects into canvasShell-relative space (captured shell origin). */
export function toShellRelativeClusterRects(
  entries: FlowchartDomRectEntry[],
  origin: FlowchartShellOrigin,
): FlowchartClusterRect[] {
  return entries.map((e) => ({
    id: e.id,
    x: e.left - origin.left,
    y: e.top - origin.top,
    w: e.width,
    h: e.height,
  }));
}

/** True when `candidateId` names a subgraph nested inside `ancestorId` (exclusive). */
export function isFlowchartSubgraphDescendant(
  code: string,
  ancestorId: string,
  candidateId: string,
): boolean {
  if (!ancestorId || !candidateId || ancestorId === candidateId) return false;
  const start = findFlowchartSubgraphLine(code, ancestorId);
  const end = findFlowchartSubgraphEndLine(code, ancestorId);
  const candidateStart = findFlowchartSubgraphLine(code, candidateId);
  if (start === -1 || end === -1 || candidateStart === -1) return false;
  return candidateStart > start && candidateStart < end;
}

/** Innermost subgraph containing the `subgraphId` declaration, or null at top level. */
export function findFlowchartSubgraphParentId(code: string, subgraphId: string): string | null {
  const start = findFlowchartSubgraphLine(code, subgraphId);
  if (start === -1) return null;
  const lines = code.split("\n");
  const stack: string[] = [];
  for (let i = 0; i < start; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("%%")) continue;
    const match = trimmed.match(/^subgraph\s+([A-Za-z0-9_-]+)(?:\s*\[|\s*$)/);
    if (match) {
      stack.push(match[1]);
      continue;
    }
    if (trimmed === "end") stack.pop();
  }
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/** Prefer the lib eligibility contract; fall back until it lands. */
function resolveFlowchartNodeMoveEligibility(
  code: string,
  nodeId: string,
): { eligible: boolean; reason: FlowchartNodeMoveBlockReason | null } {
  return getFlowchartNodeMoveEligibility(code, nodeId);
}

export type FlowchartNodeDropReason =
  | FlowchartNodeMoveBlockReason
  | "same-owner"
  | "unknown-dest"
  | null;

/**
 * Drop verdict for a node hover: ineligible nodes plus same-owner / unknown
 * dests never commit (mirrors the `moveFlowchartNode` no-ops). Exported for
 * the overlay/EditorCanvas agent; `destId` null means top-level canvas.
 */
export function resolveFlowchartNodeDropOutcome(
  code: string,
  draggedId: string,
  destId: string | null,
): { ok: boolean; reason: FlowchartNodeDropReason } {
  const eligibility = resolveFlowchartNodeMoveEligibility(code, draggedId);
  if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };
  if (destId === null) {
    if (findFlowchartNodeSubgraphId(code, draggedId) === null)
      return { ok: false, reason: "same-owner" };
    return { ok: true, reason: null };
  }
  if (findFlowchartSubgraphLine(code, destId) === -1) return { ok: false, reason: "unknown-dest" };
  if (findFlowchartNodeSubgraphId(code, draggedId) === destId)
    return { ok: false, reason: "same-owner" };
  return { ok: true, reason: null };
}

/**
 * Derive the live highlight for a hovered dest: null dest (top-level
 * empty-space) has no box to draw so yields null; ineligible nodes (edge
 * declaration, edge-only, multiline, unknown) yield `rejected` for ANY dest
 * so the drag never shows a false success target; same-owner / self /
 * descendant / same-parent hovers yield `rejected`; anything else yields the
 * kind-specific target state.
 */
export function computeFlowchartMembershipHighlight(args: {
  kind: FlowchartDragKind;
  draggedId: string;
  code: string;
  destId: string | null;
  rects: FlowchartClusterRect[];
}): FlowchartMembershipHighlight {
  const { kind, draggedId, code, destId, rects } = args;
  if (destId === null) return null;
  const rect = rects.find((r) => r.id === destId);
  if (!rect) return null;
  const box: FlowchartHighlightRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  if (kind === "node") {
    const eligibility = resolveFlowchartNodeMoveEligibility(code, draggedId);
    if (!eligibility.eligible) return { kind: "rejected", rect: box, reason: eligibility.reason };
    if (findFlowchartNodeSubgraphId(code, draggedId) === destId)
      return { kind: "rejected", rect: box, reason: "same-owner" };
    return { kind: "node-target", subgraphId: destId, rect: box };
  }
  const parentId = findFlowchartSubgraphParentId(code, draggedId);
  const valid =
    isValidSubgraphDrop(draggedId, destId, (dragged, dest) =>
      isFlowchartSubgraphDescendant(code, dragged, dest),
    ) && parentId !== destId;
  if (!valid) return { kind: "rejected", rect: box };
  return { kind: "subgraph-target", subgraphId: destId, rect: box };
}

interface FlowchartMembershipDragMachineDeps {
  canvasShellRef: RefObject<HTMLElement | null>;
  containerRef: RefObject<HTMLElement | null>;
  code: string;
  selectedNodeId: string | null;
  isInlineEditing: boolean;
  isConnectActive: boolean;
  handleCodeChange: (code: string) => void;
  onNoDragTap: () => void;
}

interface ActiveFlowchartMembershipDrag {
  kind: FlowchartDragKind;
  id: string;
  highlight: FlowchartMembershipHighlight;
  cursor: { x: number; y: number };
}

/**
 * Viewport-space flowchart membership drag machine (issues #35, #41): drag a
 * node into/out of/between subgraphs, or a whole subgraph into another.
 * Cluster rects are captured ONCE at pointerdown in shell-relative space and
 * reused across moves; drops resolve via `resolveFlowchartDropTarget`
 * (smallest-area wins) and commit once through `handleCodeChange` (only when
 * the Wave-1 move fn returns a changed string). Sub-threshold pointerups fall
 * through to `onNoDragTap` so normal selection still works; Escape cancels.
 */
export function useFlowchartMembershipDragMachine({
  canvasShellRef,
  containerRef,
  code,
  selectedNodeId,
  isInlineEditing,
  isConnectActive,
  handleCodeChange,
  onNoDragTap,
}: FlowchartMembershipDragMachineDeps): {
  active: boolean;
  draggedKind: FlowchartDragKind | null;
  draggedId: string | null;
  highlight: FlowchartMembershipHighlight;
  cursor: { x: number; y: number } | null;
  startDrag: (e: React.PointerEvent | PointerEvent) => void;
} {
  const [drag, setDrag] = useState<ActiveFlowchartMembershipDrag | null>(null);

  // Window listeners outlive the render that armed them — always read latest via refs.
  const codeRef = useRef(code);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const gatesRef = useRef({ isInlineEditing, isConnectActive });
  const handleCodeChangeRef = useRef(handleCodeChange);
  const onNoDragTapRef = useRef(onNoDragTap);
  useEffect(() => {
    codeRef.current = code;
    selectedNodeIdRef.current = selectedNodeId;
    gatesRef.current = { isInlineEditing, isConnectActive };
    handleCodeChangeRef.current = handleCodeChange;
    onNoDragTapRef.current = onNoDragTap;
  });

  const startDrag = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (gatesRef.current.isInlineEditing || gatesRef.current.isConnectActive) return;
      const classification = classifyFlowchartDragTarget(e.target as Element | null);
      if (!classification.kind || !classification.element) return;
      const snapshotCode = codeRef.current;
      const rawId = (classification.element as SVGElement).id ?? "";
      const fallback = selectedNodeIdRef.current;
      const draggedId =
        resolveFlowchartDraggedId(snapshotCode, rawId, classification.kind) ??
        (fallback && isKnownFlowchartId(snapshotCode, fallback, classification.kind)
          ? fallback
          : null);
      if (!draggedId) return;
      const kind: FlowchartDragKind = classification.kind;
      const shell = canvasShellRef.current;
      const container = containerRef.current;
      if (!shell || !container) return;
      // Capture shell origin + cluster rects once (cf. TimelineInteractions);
      // reused across moves, never re-queried per move.
      const shellRect = shell.getBoundingClientRect();
      const origin: FlowchartShellOrigin = { left: shellRect.left, top: shellRect.top };
      const entries: FlowchartDomRectEntry[] = [];
      container.querySelectorAll("g.cluster").forEach((g) => {
        const r = (g as SVGGraphicsElement).getBoundingClientRect();
        const id = resolveFlowchartDraggedId(snapshotCode, (g as SVGElement).id ?? "", "subgraph");
        if (!id) return;
        entries.push({ id, left: r.left, top: r.top, width: r.width, height: r.height });
      });
      const rects = toShellRelativeClusterRects(entries, origin);
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      let armed = false;

      const finish = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("keydown", onKey);
      };
      const onMove = (ev: MouseEvent) => {
        if (!armed) {
          if (!isBeyondDragThreshold(startClientX, startClientY, ev.clientX, ev.clientY)) return;
          armed = true;
          // Past threshold: this gesture is ours — keep it out of click routing.
          ev.stopPropagation();
          ev.preventDefault();
        } else {
          ev.preventDefault();
        }
        const cursor = { x: ev.clientX - origin.left, y: ev.clientY - origin.top };
        const destId = resolveFlowchartDropTarget(rects, cursor).subgraphId;
        setDrag({
          kind,
          id: draggedId,
          highlight: computeFlowchartMembershipHighlight({
            kind,
            draggedId,
            code: snapshotCode,
            destId,
            rects,
          }),
          cursor,
        });
      };
      const onUp = (ev: MouseEvent) => {
        finish();
        if (!armed) {
          onNoDragTapRef.current();
          return;
        }
        const cursor = { x: ev.clientX - origin.left, y: ev.clientY - origin.top };
        const destId = resolveFlowchartDropTarget(rects, cursor).subgraphId;
        const result =
          kind === "node"
            ? moveFlowchartNode(snapshotCode, draggedId, destId)
            : moveFlowchartSubgraph(snapshotCode, draggedId, destId);
        if (result !== snapshotCode) handleCodeChangeRef.current(result);
        setDrag(null);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          finish();
          setDrag(null);
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("keydown", onKey);
    },
    [canvasShellRef, containerRef],
  );

  return {
    active: drag !== null,
    draggedKind: drag?.kind ?? null,
    draggedId: drag?.id ?? null,
    highlight: drag?.highlight ?? null,
    cursor: drag?.cursor ?? null,
    startDrag,
  };
}
