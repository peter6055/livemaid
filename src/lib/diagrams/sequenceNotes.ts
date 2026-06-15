export function getSortedSequenceNoteTextElements(container: ParentNode | null | undefined) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(".noteText"))
    .filter((el): el is SVGElement => el instanceof SVGElement)
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return (
        leftRect.top - rightRect.top ||
        leftRect.left - rightRect.left ||
        leftRect.bottom - rightRect.bottom
      );
    });
}

export function getSequenceNoteTextElementAtIndex(container: ParentNode | null | undefined, index: number) {
  return getSortedSequenceNoteTextElements(container)[index] ?? null;
}

export function getSequenceNoteRectForText(noteTextEl: SVGElement) {
  const parentGroup = noteTextEl.parentElement;
  return (
    (parentGroup?.querySelector("rect.note") ??
      parentGroup?.parentElement?.querySelector("rect.note")) as SVGElement | null
  );
}
