# Regression Guards: Sequence Plus Button Placement & Count

This document identifies code sections and functions that **must not be modified** without validating plus-button behavior remains correct.

## Critical Code Sections (Do Not Modify Without Testing)

### 1. Plus Slot Calculation
**File:** `src/hooks/useCanvasInteraction.ts`
**Function:** `getSequenceAnchorSlots()`
**Lines:** ~193-266

**Critical Logic:**
- Global top bound calculation: `const globalTop = Math.min(...allLifelines.map(l => l.y1))`
- Start boundary: `const start = globalTop + 8`
- First gap bias: `const firstGap = Math.max(38, Math.round((rows[1] - rows[0]) * 0.9))`
- Last gap: `const lastGap = Math.max(28, Math.round((rows[rows.length-1] - rows[rows.length-2])/2))`
- Shared lanes: one above first, between each pair, one below last

**Why It Matters:**
- Shared lanes across participants depend on this exact formula.
- Any Y-coordinate math change affects alignment and count.
- The top bias (factor 0.9) is intentional; changing it breaks visibility.

**Change Protocol:**
- Before modifying: run visual test on dense sequence diagram (10+ messages).
- Hover each participant; confirm all show same plus count and positions.
- Screenshot before/after to document impact.

### 2. Frontmatter-Safe Message Indexing
**File:** `src/hooks/useCanvasInteraction.ts`
**Function:** `getSequenceMessageEntries()`
**Lines:** ~152-171

**Critical Logic:**
- Toggle `inFrontmatter` on line `===` `---`
- Skip all lines while inside frontmatter
- Collect only true sequence messages outside frontmatter

**Why It Matters:**
- If this breaks, drag insertion will corrupt YAML config blocks.
- Message index mapping will misalign with rendered positions.

**Change Protocol:**
- Before modifying: confirm YAML config blocks are present in test diagram.
- Drag-insert a message near config-heavy sections.
- Verify inserted message lands in sequence body, not config.

### 3. Plus Visual Rendering
**File:** `src/components/editor/EditorCanvas.tsx`
**Lines:** ~256-280 (sequence lifeline overlay button render)

**Critical Style:**
- Button size: `w-6 h-6` (24px)
- Color: `bg-indigo-600` with `ring-2 ring-white/90`
- Icon: `Plus` with `strokeWidth={3}`
- Green snap target: `r={4}` (smaller than before)

**Why It Matters:**
- Size/color/stroke directly control visual strength and discoverability.
- If reverted to smaller sizes, users may not find plus buttons.

**Change Protocol:**
- Before modifying: document reason for visual change.
- Test at multiple zoom levels (0.5x, 1.0x, 2.0x, 5.0x).
- Confirm readability and clickability at each level.

## Pre-Commit Verification Checklist

Use this checklist before pushing any changes to sequence interaction code:

**Plus Button Tests:**
- [ ] Hover any participant in a sequence with 5+ messages → confirm plus count ≥ 6
- [ ] Hover boundary/database participants → confirm top plus is visible and not clipped
- [ ] Check zoom in/out (0.5x, 2x, 5x) → confirm plus remains same size and clickable
- [ ] Compare two participants side-by-side → confirm same plus positions and count
- [ ] Loop-heavy section (5+ self-loops) → confirm insertion options above/below each loop

**Frontmatter Safety Tests:**
- [ ] Add YAML config block with `theme:`, `fontFamily:`, `themeVariables:` fields
- [ ] Drag-insert a message in sequence body → confirm message lands after sequence block, not inside config
- [ ] Edit message text in config section by mistake → verify no code injection

**Type & Build:**
- [ ] `npm run build` passes with no errors
- [ ] TypeScript diagnostics clean for edited files

## Files with Plus Logic (Do Not Delete or Move)

1. `src/hooks/useCanvasInteraction.ts` — Core slot calculation and message indexing
2. `src/components/editor/EditorCanvas.tsx` — Plus button rendering and SVG overlays
3. `reference/SEQUENCE_PLUS_PLACEMENT_SOLUTION.md` — Design rationale (for reference only)

## Related PRD Features (Will Coexist)

The upcoming **Note Insertion** feature will:
- Use similar hover/overlay patterns but for note anchors, not plus buttons
- NOT modify `getSequenceAnchorSlots()` or `getSequenceMessageEntries()`
- Add new code paths for note DSL parsing and insertion

This guard ensures both features can coexist without collision.
