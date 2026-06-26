# Sequence Lifeline `+` Button Placement — Model & Regression Guards

This document records the current model for sequence-diagram lifeline `+` button count and
placement, plus the regression guards that protect it. It supersedes the earlier "top-lane
bias / note-avoidance" model.

## Scope

The interactive `+` buttons shown on sequence lifelines while hovering and dragging.

Goals:

- Predictable count (one `+` per vertical gap — no "full wall").
- **Identical placement on every lifeline** (columns must not drift relative to each other).
- Preserve loop insertion usability (top + bottom of self-loop rows).
- Stable insertion-index mapping (never write into the YAML config block).

## Final Technical Model — Flat-Surface, Note-Independent

**Primary logic:** `getSequenceAnchorSlots()` in `src/hooks/useCanvasInteraction.ts`.

Every lifeline is treated as a single flat plane. The slot grid is derived **purely from the
shared global message rows**, so it is **identical for every lifeline** regardless of which
lifeline is hovered. **Notes have ZERO effect on placement** — their presence or absence never
inserts, removes, shifts, or resizes a slot. This is the "Order 1 rule applied everywhere".

> **Do NOT reintroduce note-avoidance / `pushBelowNotes` / `noteRanges` logic.** It breaks the
> flat-surface guarantee by making columns drift relative to one another. (Verified earlier:
> with note-avoidance removed, e.g. participants Tax, Order, and Fraud all return identical
> slots like `[7, 20, 32, 36, 41, 47, …]`.)

### 1) Message rows source

Rendered message lines are measured from the SVG and projected into canvas-space Y via
`(rect.top - containerTop + scrollTop + rect.height/2) / scale`, then deduplicated and sorted
ascending into `rows`.

The lower bound for collecting a row is `globalTop` (the actor-box top boundary), **not** the
lifeline start below the actor box, so the first message row is never missed on dense/zoomed
diagrams.

### 2) Slot construction (current constants)

For `rows` of length `n`:

- One slot above the first row: `rows[0] - firstGap`, where `firstGap = 12`.
- One midpoint between each adjacent pair: `(rows[i] + rows[i+1]) / 2`.
  - The **second slot** (first midpoint, between `rows[0]` and `rows[1]`) is nudged up by a
    uniform `SECOND_SLOT_LIFT = 6` so it doesn't graze the first arrow. This offset is
    index-based and identical on every lifeline, preserving the flat-surface guarantee.
- One slot below the last row: `rows[n-1] + lastGap`, where
  `lastGap = max(28, round((rows[n-1] - rows[n-2]) / 2))` (or `VERTICAL_GRID_STEP = 56` when
  there is only one row).
- Empty lifeline (`n === 0`): a single dynamic handle that follows hover, clamped to bounds.

### 3) Clamping

- The **first** slot clamps only to `[globalTop, end]` (so a `+` always appears ABOVE the first
  message, even when `rows[0] - firstGap` is above the lifeline `start`).
- **All other** slots clamp to `[start, end]`.
- The list is sorted and deduplicated (`new Set`).

### 4) Frontmatter-safe message indexing

`getSequenceMessageEntries()` ignores YAML frontmatter delimited by `---`: it toggles an
`inFrontmatter` flag on lines that are exactly `---` and skips everything inside, collecting
only true sequence message lines outside the block. This is used for insertion-index lookup,
message-line-by-index lookup, and message-text editing. Without it, config lines containing
`:` get misclassified as messages and drag-insertion can corrupt the config block.

> Note: a similar message-entry extractor also exists in `LiveMaidEditor.tsx` for the commit
> side of mutations. Keep the two in sync (or consolidate) if you change the parsing rules.

## Regression Guards — Do Not Break

Validate these before changing any sequence `+` / slot code. Use **function-name anchors**,
not line numbers (line numbers drift).

### Guard 1 — `getSequenceAnchorSlots()` (flat-surface invariant)

- Slots must be derived from shared global message rows only; notes must have no effect.
- First slot clamps to `[globalTop, end]`; others to `[start, end]`.
- Do not reintroduce per-note avoidance or per-lifeline custom lane sets.
- **Test**: hover several participants in a dense (10+ message) diagram and confirm every
  lifeline shows the SAME `+` count at the SAME Y positions. Confirm a `+` appears above the
  first message and around self-loop rows (top + bottom).

### Guard 2 — `getSequenceMessageEntries()` (frontmatter safety)

- Must skip `---`-delimited frontmatter and index only real message lines.
- **Test**: with a YAML config block present (`theme:`, `fontFamily:`, `themeVariables:`),
  drag-insert a message and confirm it lands in the sequence body, never inside config.

### Guard 3 — `+` button visual render (`EditorCanvas.tsx`, sequence lifeline overlay)

- Button: `w-6 h-6`, `bg-indigo-600`, `ring-2 ring-white/90`, `Plus` icon; snap target is a
  small green dot. Keep it clearly visible/clickable.
- **Test**: confirm the `+` stays the same physical size and remains clickable at zoom 0.5x,
  1x, 2x, and 5x (scale-locking must hold).

### Build / type checks

- `npm run build` passes; TypeScript diagnostics clean for edited files.

## Files With `+` / Slot Logic (do not move without updating this doc)

1. `src/hooks/useCanvasInteraction.ts` — `getSequenceAnchorSlots()`, `getSequenceMessageEntries()`, slot math.
2. `src/components/editor/EditorCanvas.tsx` — `+` button render and SVG overlays.

For the full sequence-interaction feature set (drag-to-connect, message/note reorder, hover
rings, etc.) see `reference/features/reading-map.md` § 15.
