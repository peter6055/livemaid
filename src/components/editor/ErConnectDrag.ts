import type React from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { entityNameFromSvgId } from "@/lib/diagrams/erDiagram";
import { nearestPerimeterAnchor, shellBoxFromElement, shellBoxFromRect } from "./canvasCoord";

type ConnectDragPreview = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  snap: { cx: number; cy: number; w: number; h: number } | null;
  anchor: { x: number; y: number } | null;
} | null;

interface ErConnectDragDeps {
  canvasShellRef: RefObject<HTMLDivElement | null>;
  selectedSvgId: string | null;
  setErConnecting: Dispatch<SetStateAction<boolean>>;
  setErConnect: Dispatch<SetStateAction<ConnectDragPreview>>;
  onAddErRelationship?: (source: string, target: string) => void;
  onCreateErEntityLinked?: (source: string) => void;
}

export function makeErConnectDrag({
  canvasShellRef,
  selectedSvgId,
  setErConnecting,
  setErConnect,
  onAddErRelationship,
  onCreateErEntityLinked,
}: ErConnectDragDeps) {
  return (e: React.MouseEvent<HTMLButtonElement>, sourceName: string) => {
    e.stopPropagation();
    e.preventDefault();
    const shell = canvasShellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const anchorX = btnRect.left + btnRect.width / 2 - shellRect.left;
    const anchorY = btnRect.top + btnRect.height / 2 - shellRect.top;
    const sourceEl =
      Array.from(shell.querySelectorAll(".mermaid-container g.node")).find(
        (el) => entityNameFromSvgId(el.id) === sourceName,
      ) ?? (selectedSvgId ? document.getElementById(selectedSvgId) : null);
    const sourceBox = shellBoxFromElement(sourceEl, shellRect);

    const resolveTarget = (
      clientX: number,
      clientY: number,
    ): { name: string; el: Element } | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const g = el.closest("g.node");
        if (!g || !/-entity-.+-\d+$/.test(g.id)) continue;
        const name = entityNameFromSvgId(g.id);
        if (!name || name === sourceName) return null; // self → ignore
        return { name, el: g };
      }
      return null;
    };

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;
    setErConnecting(true);

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
      setErConnect({
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
      setErConnect(null);
      setErConnecting(false);
      if (!dragging) return; // a plain click on the + (no drag) is a no-op
      const tgt = resolveTarget(ev.clientX, ev.clientY);
      if (tgt) {
        onAddErRelationship?.(sourceName, tgt.name);
      } else {
        // Dropped on empty canvas → create a NEW entity linked to the source.
        onCreateErEntityLinked?.(sourceName);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}
