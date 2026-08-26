# Timeline Drag Drop-Target Selection

How timeline reorder drags pick their drop target, and how section boundaries are arbitrated (issue peter6055/livemaid-project#15).

## Where

- Pure selection logic: `src/lib/diagrams/timeline/dropTarget.ts` (`selectTimelineDropTarget`) — unit tests in `src/test/timeline-drop-target.test.ts`.
- Slot construction, drag lifecycle, overlay rendering: `src/components/editor/EditorCanvas.tsx` (`findTarget`, `onMove`, `onUp` of the timeline reorder handler; overlay under `[data-timeline-reorder-overlay]`).
- E2E coverage: `src/test/timeline-boundary-target.spec.ts`.

## Slot model

Every same-kind node contributes a `before`/`after` slot band at its edges (`SLOT_THICK = 22`, hit tolerance `HIT_TOL = 34`). LR timelines use vertical bands (axis `"x"`); TD uses horizontal bands (axis `"y"`). Child-event drags use `columnMode` slots inside the hovered parent column. The preview (`setTimelineReorder`) and the final `onTimelineMove` both call the same `findTarget`, so they cannot disagree.

## Boundary arbitration

Slot centerlines hug node edges, so near a section boundary the nearest centerline can sit across the visible boundary, which used to make the indicator highlight the opposite section from the cursor. `selectTimelineDropTarget` therefore:

1. Keeps legacy nearest-centerline slot scoring within each candidate section.
2. Ranks candidate sections by screen distance from the cursor to their bounds (`sectionBounds`).
3. If the closest section is the source's own, prefer the home section: use its nearest eligible slot, or return no target (stay put) when nothing can be inserted there. Ties at equal distance resolve to the home section so the flip happens exactly at the boundary.
4. Otherwise returns the closest section's best slot.

While no target is selected and the cursor rests inside the source section, the source section still glows (stay highlight), so the indicator always matches what a release will do (no-op).

## Invariants

- Preview target === final insertion target (same function).
- Section-kind drags bypass section arbitration (all slots resolve outside sections) and keep plain nearest-slot behavior.
- Event drags inside a single period resolve to a single section, so arbitration reduces to the legacy nearest-slot result.
- The section glow exposes `data-timeline-section-highlight={sectionId}` for testing; the overlay exposes `data-timeline-reorder-target` / `-placement`.
