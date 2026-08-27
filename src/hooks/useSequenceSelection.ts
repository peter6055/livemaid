import { useCallback, MutableRefObject } from "react";
import {
  buildSequenceMessageVisualModel,
  findOwningLineForSequenceLabel,
  getSequenceMessageEntries,
  type SequenceMessageVisual,
} from "@/lib/diagrams/sequence/geometry";
import {
  getSequenceNoteRectForText,
  getSequenceNoteTextElementAtIndex,
} from "@/lib/diagrams/sequence/notes";

/**
 * Sequence-diagram selection triggers: resolving a hovered message/note into a
 * selection (selection box, text box, node id, optional inline edit). Extracted
 * verbatim from useCanvasInteraction (Phase 3 of the canvas-interaction split).
 */
export function useSequenceSelection({
  code,
  containerRef,
  setSelectedNodeIdWithRef,
  setSelectedSvgIdWithRef,
  setSelectionBox,
  setTextBox,
  getSequenceNoteEntries,
  getSequenceMessageLineByIndex,
  inlineInputRef,
  setEditingText,
  setIsInlineEditing,
  clearSequenceMessageHoverHighlight,
  hoveredSequenceTargetsRef,
  sequenceMessageVisualsRef,
}: {
  code: string;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  setSelectedNodeIdWithRef: (id: string | null) => void;
  setSelectedSvgIdWithRef: (id: string | null) => void;
  setSelectionBox: (box: { x: number; y: number; width: number; height: number } | null) => void;
  setTextBox: (box: { x: number; y: number; width: number; height: number } | null) => void;
  getSequenceNoteEntries: (sourceCode: string) => Array<{
    index: number;
    line: string;
    position: "left" | "right" | "over";
    participant: string;
    text: string;
  }>;
  getSequenceMessageLineByIndex: (idx: number) => string | null;
  inlineInputRef: MutableRefObject<HTMLDivElement | null>;
  setEditingText: (text: string) => void;
  setIsInlineEditing: (editing: boolean) => void;
  clearSequenceMessageHoverHighlight: () => void;
  hoveredSequenceTargetsRef: MutableRefObject<{
    labelEls: SVGElement[];
    lineEl: SVGElement | null;
  }>;
  sequenceMessageVisualsRef: MutableRefObject<SequenceMessageVisual[]>;
}) {
  const triggerHoveredSequenceMessageSelection = useCallback(
    (startInlineEdit = false, explicitIndex?: number) => {
      const container = containerRef.current;
      if (!container) return;
      clearSequenceMessageHoverHighlight();

      const messageLineEls = Array.from(
        container.querySelectorAll('[class^="messageLine"], [class*=" messageLine"]'),
      ) as SVGElement[];

      const messageIndex =
        typeof explicitIndex === "number"
          ? explicitIndex
          : (() => {
              const hoverLine = hoveredSequenceTargetsRef.current.lineEl;
              if (hoverLine) {
                const idx = messageLineEls.indexOf(hoverLine);
                return idx >= 0 ? idx : -1;
              }
              const hoverText = hoveredSequenceTargetsRef.current.labelEls[0];
              if (hoverText) {
                const owningLine = findOwningLineForSequenceLabel(hoverText, messageLineEls);
                if (owningLine) {
                  return messageLineEls.indexOf(owningLine);
                }
              }
              return -1;
            })();

      if (messageIndex < 0) return;

      let visuals = sequenceMessageVisualsRef.current;
      if (visuals.length === 0) {
        visuals = buildSequenceMessageVisualModel(
          container,
          code,
          getSequenceMessageEntries,
          findOwningLineForSequenceLabel,
        );
        sequenceMessageVisualsRef.current = visuals;
      }
      const visual = visuals[messageIndex];
      if (!visual) return;

      setSelectionBox(visual.selectionBox);
      setTextBox(visual.textBox);

      const nodeId = `SEQ_MSG_${messageIndex}`;
      setSelectedNodeIdWithRef(nodeId);

      const textEl = visual.labelEls[0] || null;
      const lineEl = visual.lineEl;
      if (textEl && !textEl.id) textEl.id = `seq-msg-${messageIndex}`;
      setSelectedSvgIdWithRef(textEl?.id || lineEl?.id || null);

      if (startInlineEdit) {
        const msgLine = getSequenceMessageLineByIndex(messageIndex);
        const colonIdx = msgLine?.indexOf(":") ?? -1;
        const label = colonIdx !== -1 && msgLine ? msgLine.substring(colonIdx + 1).trim() : "";
        setEditingText(label.replace(/<br\s*\/?>/gi, "\n"));
        setIsInlineEditing(true);
        setTimeout(() => {
          if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            // Select all content in contentEditable div
            const range = document.createRange();
            range.selectNodeContents(inlineInputRef.current);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }, 10);
      }
    },
    [
      clearSequenceMessageHoverHighlight,
      containerRef,
      getSequenceMessageLineByIndex,
      getSequenceMessageEntries,
      code,
      setSelectedNodeIdWithRef,
    ],
  );

  // Select (or edit) a sequence note by its `.noteText` DOM index. Mirrors
  // triggerHoveredSequenceMessageSelection but for notes (selection box = rect.note full box,
  // text box = noteText). Used by the note grab overlay's no-drag mouseup path so notes can be
  // selected/edited even though the overlay intercepts the underlying SVG click.
  const triggerHoveredSequenceNoteSelection = useCallback(
    (startInlineEdit = false, index = -1) => {
      const container = containerRef.current;
      if (!container) return;
      const textEl = getSequenceNoteTextElementAtIndex(container, index);
      if (!textEl) return;
      const rectNote = getSequenceNoteRectForText(textEl);
      const containerRect = container.getBoundingClientRect();
      const scale = containerRect.width / container.offsetWidth;
      const boxEl: SVGElement = rectNote || textEl;
      const rect = boxEl.getBoundingClientRect();
      const textRect = textEl.getBoundingClientRect();

      setSelectionBox({
        x: (rect.left - containerRect.left + container.scrollLeft) / scale,
        y: (rect.top - containerRect.top + container.scrollTop) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      });
      setTextBox({
        x: (textRect.left - containerRect.left + container.scrollLeft) / scale,
        y: (textRect.top - containerRect.top + container.scrollTop) / scale,
        width: textRect.width / scale,
        height: textRect.height / scale,
      });
      setSelectedNodeIdWithRef(`SEQ_NOTE_${index}`);
      setSelectedSvgIdWithRef(textEl.id || rectNote?.id || null);

      if (startInlineEdit) {
        const noteEntry = getSequenceNoteEntries(code)[index];
        setEditingText((noteEntry?.text || "").replace(/<br\s*\/?>/gi, "\n"));
        setIsInlineEditing(true);
        setTimeout(() => {
          if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            // Select all content in contentEditable div
            const range = document.createRange();
            range.selectNodeContents(inlineInputRef.current);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }, 10);
      }
    },
    [containerRef, code, getSequenceNoteEntries],
  );

  return {
    triggerHoveredSequenceMessageSelection,
    triggerHoveredSequenceNoteSelection,
  };
}
