import type React from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { stateNameFromSvgId } from "@/lib/diagrams/stateDiagram";
import { nearestPerimeterAnchor, shellBoxFromElement, shellBoxFromRect } from "./canvasCoord";
import type { StateConnectMenuState } from "./StateConnectMenu";
import type { ShapePicker } from "@/hooks/useCanvasInteraction";

type ConnectDragPreview = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  snap: { cx: number; cy: number; w: number; h: number } | null;
  anchor: { x: number; y: number } | null;
} | null;

interface StateConnectDragDeps {
  canvasShellRef: RefObject<HTMLDivElement | null>;
  selectedSvgId: string | null;
  setStateConnecting: Dispatch<SetStateAction<boolean>>;
  setStateConnect: Dispatch<SetStateAction<ConnectDragPreview>>;
  setStateConnectMenu: Dispatch<SetStateAction<StateConnectMenuState | null>>;
  setShapePicker: (state: SetStateAction<ShapePicker | null>) => void;
  onAddStateTransition?: (source: string, target: string) => void;
}

export function makeStateConnectDrag({
  canvasShellRef,
  selectedSvgId,
  setStateConnecting,
  setStateConnect,
  setStateConnectMenu,
  setShapePicker,
  onAddStateTransition,
}: StateConnectDragDeps) {
  return (e: React.MouseEvent<HTMLButtonElement>, sourceId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setStateConnectMenu(null);
    setShapePicker(null);
    const shell = canvasShellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const anchorX = btnRect.left + btnRect.width / 2 - shellRect.left;
    const anchorY = btnRect.top + btnRect.height / 2 - shellRect.top;
    const sourceEl =
      Array.from(
        shell.querySelectorAll(
          ".mermaid-container g.node, .mermaid-container g.statediagram-cluster",
        ),
      ).find((el) => stateNameFromSvgId(el.id) === sourceId) ??
      (selectedSvgId ? document.getElementById(selectedSvgId) : null);
    const sourceBox = shellBoxFromElement(sourceEl, shellRect);

    const resolveTarget = (
      clientX: number,
      clientY: number,
    ): { id: string; el: Element } | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      for (const el of els) {
        const g = el.closest("g.node, g.statediagram-state");
        if (
          g &&
          !g.classList.contains("statediagram-cluster") &&
          /-state-.+-\d+$/.test(g.id) &&
          !/----note-\d+$/.test(g.id)
        ) {
          const id = stateNameFromSvgId(g.id);
          if (!id || id === sourceId) return null; // self / [*] pseudo → ignore
          return { id, el: g };
        }
        const cluster = el.closest("g.statediagram-cluster");
        if (cluster) {
          const id = stateNameFromSvgId(cluster.id);
          if (!id || id === sourceId) return null;
          return { id, el: cluster };
        }
      }
      return null;
    };

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let dragging = false;
    setStateConnecting(true);

    const onMove = (ev: MouseEvent) => {
      if (
        !dragging &&
        (Math.abs(ev.clientX - startClientX) > 3 || Math.abs(ev.clientY - startClientY) > 3)
      ) {
        dragging = true;
        setStateConnectMenu(null);
        setShapePicker(null);
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
      setStateConnect({
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
      setStateConnect(null);
      setStateConnecting(false);
      if (!dragging) return; // a plain click on the + (no drag) is a no-op
      const tgt = resolveTarget(ev.clientX, ev.clientY);
      if (tgt) {
        onAddStateTransition?.(sourceId, tgt.id);
      } else {
        // Dropped on empty canvas → ask which shape to create (then link source --> shape).
        setStateConnectMenu({
          source: sourceId,
          x: ev.clientX - shellRect.left,
          y: ev.clientY - shellRect.top,
        });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}
