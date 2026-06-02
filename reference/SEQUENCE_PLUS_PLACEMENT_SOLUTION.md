# Sequence Plus Button Final Solution

This document records the final-stage solution for sequence diagram plus-button count and placement.

## Scope

This solution covers the interactive plus buttons shown on sequence lifelines while hovering and dragging.

Goal:
- Keep plus counts predictable.
- Keep placement visually aligned across participants.
- Preserve loop insertion usability.
- Avoid over-populated columns of plus buttons.
- Keep insertion index mapping stable.

## Problem Summary

Early versions had three recurring issues:
1. Overpopulation: plus buttons appeared at too many Y positions ("full wall" effect).
2. Inconsistency: different participants could show different top positions/counts.
3. Broken insertion under config frontmatter: YAML config lines (with `:`) were misclassified as sequence messages, causing invalid code insertion inside config blocks.

## Final Technical Model

### 1) Message Rows Source

Rendered sequence message lines (`.messageLine`) are measured from SVG and converted to canvas-space Y coordinates.

Inputs:
- `containerRect`
- current zoom `scale`
- `scrollTop`

Per message line center:

- `centerY = (rect.top - containerTop + scrollTop + rect.height / 2) / scale`

Rows are deduplicated and sorted ascending.

### 2) Shared Insertion Lanes Across Participants

Instead of computing unique lane sets per participant, a flattened global lane model is used so all participant columns show the same plus positions.

Given sorted message row centers: `rows[0..n-1]`

Construct insertion lanes:
1. one lane above first row
2. one lane between each adjacent row pair
3. one lane below last row

Formula:
- `topLane = rows[0] - firstGap`
- `middleLane[i] = (rows[i] + rows[i+1]) / 2`
- `bottomLane = rows[n-1] + lastGap`

Then clamp each lane to safe `[start, end]` and deduplicate.

### 3) Top Lane Bias (Final-Stage Adjustment)

To match expected UX, the first lane is intentionally higher than simple midpoint spacing.

Current approach:
- `start = globalTop + 8`
- `firstGap = max(38, round((rows[1] - rows[0]) * 0.9))` (fallback to fixed step when only one row)

This makes the first plus clearly visible above the first message area and consistent across participant types (including boundary/database heads).

### 4) Frontmatter-Safe Message Indexing

A dedicated extractor now ignores YAML frontmatter delimited by `---`.

Algorithm:
- split code by lines
- toggle `inFrontmatter` whenever a line is exactly `---`
- while `inFrontmatter`, skip all lines
- outside frontmatter, keep only true sequence message lines

This extractor is used for:
- insertion index lookup
- message line lookup by sequence index
- sequence message text editing lookup

Result: drag insertion no longer writes `actor->>actor: msg` into config blocks.

## Solution-Based Rationale

### Why this works

1. Predictable density:
- One lane per vertical gap means no lane spam.

2. User mental model alignment:
- Users think in "insert between existing interactions"; shared lanes directly represent those insertion opportunities.

3. Cross-participant consistency:
- Same lane set for all participants avoids confusion when comparing columns.

4. Loop support:
- Shared lane construction naturally gives insertion opportunities above and below self-loop rows.

5. Safety:
- Frontmatter isolation prevents YAML corruption from sequence operations.

### Tradeoffs accepted

1. Shared lanes may surface insertion points on participants not directly involved in nearby rows.
- Accepted because consistency and predictability were prioritized.

2. Top-lane is intentionally biased upward.
- This is a UX tuning decision to improve discoverability near the top of dense diagrams.

## Implementation Anchors

Primary logic lives in:
- `src/hooks/useCanvasInteraction.ts`

Supporting visual behavior:
- `src/components/editor/EditorCanvas.tsx`

## Verification Checklist

Use this checklist when modifying lane behavior later:

1. Hover any participant in a dense sequence diagram:
- plus lanes should align with other participants.

2. Check top lane on boundary/database participants:
- first plus should be visible and not clipped.

3. Check loop-heavy sections:
- insertion options should appear above/below loop regions without duplicates in one gap.

4. Drag-insert with YAML frontmatter present:
- inserted message must land in sequence body, never inside config block.

5. Build and type checks:
- `npm run build` passes.

## Future Enhancements (Optional)

1. Dynamic top bias by viewport density.
2. Lane virtualization for extremely large diagrams.
3. Optional "minimal lanes" mode (nearest-lane only around pointer).
