import type React from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { classNameFromSvgId } from "@/lib/diagrams/classDiagram";
import { nearestPerimeterAnchor, shellBoxFromElement, shellBoxFromRect } from "./canvasCoord";
import type { ClassConnectMenuState } from "./ClassConnectMenu";

type ConnectDragPreview = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  snap: { cx: number; cy: number; w: number; h: number } | null;
  anchor: { x: number; y: number } | null;
} | null;

interface ClassConnectDragDeps {
  canvasShellRef: RefObject<HTMLDivElement | null>;
  selectedSvgId: string | null;
  setClassConnecting: Dispatch<SetStateAction<boolean>>;
  setClassConnect: Dispatch<SetStateAction<ConnectDragPreview>>;
  setClassConnectMenu: Dispatch<SetStateAction<ClassConnectMenuState | null>>;
  onLinkNoteToClass?: (noteIndex: number, className: string) => void;
  onAddClassRelationship?: (source: string, target: string, operator: string) => void;
}

export function makeClassConnectDrag({
  canvasShellRef,
  selectedSvgId,
  setClassConnecting,
  setClassConnect,
  setClassConnectMenu,
  onLinkNoteToClass,
  onAddClassRelationship,
}: ClassConnectDragDeps) {
  return (
    e: React.MouseEvent<HTMLButtonElement>,
    source: { kind: "class"; name: string } | { kind: "note"; index: number },
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const shell = canvasShellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const anchorX = btnRect.left + btnRect.width / 2 - shellRect.left;
    const anchorY = btnRect.top + btnRect.height / 2 - shellRect.top;
    const sourceEl =
      source.kind === "class"
        ? (Array.from(shell.querySelectorAll(".mermaid-container g.node")).find(
            (el) => classNameFromSvgId(el.id) === source.name,
          ) ?? (selectedSvgId ? document.getElementById(selectedSvgId) : null))
        : (Array.from(shell.querySelectorAll(".mermaid-container g.node")).find((el) => {
            const idx = parseInt(el.id.match(/-note(\d+)$/)?.[1] ?? "-1", 10);
            return idx === source.index;
          }) ?? (selectedSvgId ? document.getElementById(selectedSvgId) : null));
    const sourceBox = shellBoxFromElement(sourceEl, shellRect);

    type Target =
      | { kind: "class"; name: string; el: Element }
      | { kind: "note"; noteIndex: number; el: Element }
      | null;
    const resolveTarget = (clientX: number, clientY: number): Target => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const g = el.closest("g.node");
        if (!g) continue;
        if (/classId-/.test(g.id)) {
          const name = classNameFromSvgId(g.id);
          if (source.kind === "class" && name === source.name) return null; // self → ignore
          if (name) return { kind: "class", name, el: g };
        } else if (/-note\d+$/.test(g.id)) {
          const idx = parseInt(g.id.match(/-note(\d+)$/)?.[1] ?? "0", 10);
          // A note source can only attach to a CLASS — ignore note targets (incl. itself).
          if (source.kind === "note") continue;
          return { kind: "note", noteIndex: idx, el: g };
        }
      }
      return null;
    };

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;
    setClassConnecting(true);

    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
      }
      const tgt = resolveTarget(ev.clientX, ev.clientY);
      let snap: { cx: number; cy: number; w: number; h: number } | null = null;
      let anchor: { x: number; y: number } | null = null;
      const cursorX = ev.clientX - shellRect.left;
      const cursorY = ev.clientY - shellRect.top;
      if (tgt) {
        const r = tgt.el.getBoundingClientRect();
        snap = shellBoxFromRect(r, shellRect);
        anchor = nearestPerimeterAnchor(snap, cursorX, cursorY);
      }
      const end = anchor ?? { x: cursorX, y: cursorY };
      const sourceAnchor = sourceBox
        ? nearestPerimeterAnchor(sourceBox, end.x, end.y)
        : { x: anchorX, y: anchorY };
      setClassConnect({
        x1: sourceAnchor.x,
        y1: sourceAnchor.y,
        x2: end.x,
        y2: end.y,
        snap,
        anchor,
      });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setClassConnect(null);
      setClassConnecting(false);
      const tgt = dragging ? resolveTarget(ev.clientX, ev.clientY) : null;

      // Note source: the only meaningful drop is onto a class (attach this note to it). No drag, or
      // a drop anywhere else, is a silent no-op (notes have no create/relationship flow).
      if (source.kind === "note") {
        if (tgt?.kind === "class") onLinkNoteToClass?.(source.index, tgt.name);
        return;
      }

      // Class source.
      const menuX = ev.clientX - shellRect.left;
      const menuY = ev.clientY - shellRect.top;
      if (!dragging) {
        // Plain click on the + (no drag) → open the create chip at the button.
        setClassConnectMenu({
          source: source.name,
          target: null,
          step: "choose",
          x: anchorX,
          y: anchorY,
        });
        return;
      }
      if (tgt?.kind === "class") {
        // Dropping onto an existing class creates the connection directly with the default
        // association operator (`-->`); the user can change the relationship type afterwards via
        // the edge toolbar. No relationship-type prompt is shown.
        onAddClassRelationship?.(source.name, tgt.name, "-->");
      } else if (tgt?.kind === "note") {
        onLinkNoteToClass?.(tgt.noteIndex, source.name);
      } else {
        setClassConnectMenu({
          source: source.name,
          target: null,
          step: "choose",
          x: menuX,
          y: menuY,
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}
