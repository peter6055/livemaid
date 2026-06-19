export function getSortedSequenceNoteTextElements(container: ParentNode | null | undefined) {
  if (!container) return [];
  const allTextEls = Array.from(container.querySelectorAll(".noteText")).filter(
    (el): el is SVGElement => el instanceof SVGElement,
  );

  // Deduplicate wrapped notes: when Mermaid wraps a long note it creates multiple .noteText
  // elements for a single rendered note. Use the associated rect.note as identity key, falling
  // back to parent <g>, then the element itself, so every physical note contributes exactly
  // one representative element.
  const seen = new Set<Element>();
  const deduped: SVGElement[] = [];
  for (const el of allTextEls) {
    const key = getSequenceNoteRectForText(el) ?? el.parentElement ?? el;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(el);
    }
  }

  return deduped.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    return (
      leftRect.top - rightRect.top ||
      leftRect.left - rightRect.left ||
      leftRect.bottom - rightRect.bottom
    );
  });
}

export function getSequenceNoteTextElementAtIndex(
  container: ParentNode | null | undefined,
  index: number,
) {
  return getSortedSequenceNoteTextElements(container)[index] ?? null;
}

export function getSequenceNoteRectForText(noteTextEl: SVGElement) {
  const parentGroup = noteTextEl.parentElement;
  if (!parentGroup) return null;
  const direct = parentGroup.querySelector("rect.note");
  if (direct) return direct as SVGElement;
  const grandparent = parentGroup.parentElement;
  if (!grandparent) return null;
  return grandparent.querySelector("rect.note") as SVGElement | null;
}
