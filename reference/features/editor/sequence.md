# Sequence Interaction

## 5. Sequence Interaction

Sequence editing is unusually DOM-sensitive. When touching sequence behavior, preserve these
truths:

- Message selection, note selection, and logic-block interaction are geometry-driven and must
  tolerate Mermaid reflow.
- Message mapping must pair each label element to its owning message line via
  `findOwningLineForSequenceLabel` (label top vs line center-Y scoring), not raw `.messageText`
  DOM order, because multiline messages render multiple text nodes (foreignObject + byTspan
  fallbacks).
- Multiline sequence-message selection must union ALL visible rendered label rows for the
  owning message (including Mermaid's separate wrapped/byTspan `.messageText` nodes), and a
  click routed through the hover/reorder overlay with an explicit message index must honor
  that index directly rather than falling back to Y-position guessing.
- Hover and selection geometry for sequence messages must stay pixel-identical, differing only
  in emphasis, not in box size or position.
- Hover listeners must remain attached through React-managed props on the live canvas
  container, not brittle `addEventListener` effects on stale DOM nodes.
- Full message bands, not just the thin arrow line, are intentionally interactive.
- Reorder, endpoint reassignment, and connection-drag indicators run in shell/viewport
  coordinates so pan/zoom does not skew hit-testing.
- Sequence message endpoint drag handles are rendered as a **viewport-space overlay** (inside the
  TransformWrapper render function but outside TransformComponent), so their screen size stays
  fixed regardless of zoom level. Canvas coordinates from `getSequenceMessageEndpointGeometry`
  are converted to viewport coordinates via:
  ```
  vpX = pt.x * state.scale + containerRect.left - container.scrollLeft - shellRect.left
  vpY = pt.y * state.scale + containerRect.top  - container.scrollTop  - shellRect.top
  ```
  This avoids `data-scale-lock` scaling entirely, preventing handles from becoming oversized at
  extreme zoom-out or undersized at extreme zoom-in. Handle dimensions are plain CSS (`width`/`height`)
  without any zoom compensation.
- Logic-block overlays depend on DOM measurement and must tolerate cold-load timing delays
  before the transformed container is ready.
- Toolbar hit areas, hover suppression, and stacking order must keep floating sequence UI from
  reselecting or highlighting content behind it.
- The selected-message comment button is a child overlay of the selection outline in
  `EditorCanvas.tsx`, but its position must be adjusted only with the button's own transform.
  Do not change sequence selection, hover, hit-test, or stored comment-pin geometry just to move
  that indigo button.

### 5.1 Multi-line message hover and selection (`fix/issue-71-sequence-duplicate-selection`)

**Problems addressed**

- **#71 — duplicate selection overlays:** clicking a wrapped label row on a multiline message
  could resolve the wrong message index, producing a second selection box offset from the
  clicked label.
- **#59 — hover flicker / intermittent purple highlight:** purple text+line hover sometimes
  vanished while the React hover outline remained, especially after selecting another message
  or when moving within a multiline label.
- **SVG DOM wipe on re-render:** selection and hover overlay state updates re-rendered
  `EditorCanvas`. The mermaid container used `dangerouslySetInnerHTML`, which replaced the SVG
  subtree even when `svgContent` was unchanged, destroying `classList` hover mutations while
  React hover state (`hoveredSequenceMessageIndex`, `hoveredSequenceMessageBox`) stayed set.

**Approach**

| Layer                 | Mechanism                                                                                                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable SVG host       | `StableMermaidHtml` writes `innerHTML` only when the `svgContent` string changes, so overlay-driven re-renders do not reset Mermaid DOM.                                                                                                                                                      |
| Canonical index       | DOM message-line index (`SEQ_MSG_${domIndex}`) everywhere — hit overlays, selection, reorder. Clicks via `startSeqReorderDrag` pass `explicitIndex`; `triggerHoveredSequenceMessageSelection(false, index)` must not fall back to Y guessing.                                                 |
| Label ↔ line pairing  | `getVisibleSequenceMessageTexts` + `getSequenceMessageLabelRoots` + `findOwningLineForSequenceLabel`; `buildSequenceMessageVisualModel` unions all label rows per line for selection/hover geometry.                                                                                          |
| Single hover owner    | `setHoveredSequenceMessage(index)` is the only state entry point. It calls `applySequenceMessageHoverClasses(index)` synchronously to stamp/remove `sequence-msg-hover-highlight-*` on live SVG nodes.                                                                                        |
| Hit overlays          | Precomputed `sequenceMessageTriggerAreas` (RAF retry on cold load) render stable `pointer-events-auto` divs (`data-seq-msg-index`, z-21) with `onPointerEnter` / `onPointerMove` / `onPointerLeave`. Reorder mousedown is merged into these overlays (no separate mount-on-hover grab layer). |
| Hover outline         | React div with `data-seq-msg-hover-outline` (not `data-scale-lock-border`). Shown when `hoveredSequenceMessageIndex !== null` and `selectedNodeId !== SEQ_MSG_${hoveredIndex}`.                                                                                                               |
| Floating-UI guard     | `isSequenceMessageHoverSuppressedByFloatingUi` walks `elementsFromPoint` top-down; hit overlay / hover outline own the stack; skips `pointer-events: none` elements before checking toolbar / selection chrome.                                                                               |
| Re-apply after layout | `useLayoutEffect` + `requestAnimationFrame` re-call `applySequenceMessageHoverClasses` when hover index, selection, `svgContent`, or trigger areas change — catches late DOM updates after selection.                                                                                         |
| Pointer re-sync       | `lastSequencePointerRef` + `syncSequenceMessageHoverAtPoint` on `selectedNodeId` / trigger-area / `svgContent` changes; `handleMouseUp` re-resolves hover instead of blind clear.                                                                                                             |

**Key files**

- `src/components/editor/StableMermaidHtml.tsx`
- `src/hooks/useCanvasInteraction.ts` — `applySequenceMessageHoverClasses`, `setHoveredSequenceMessage`, `buildSequenceMessageVisualModel`
- `src/components/editor/EditorCanvas.tsx` — hit overlays, hover outline, `StableMermaidHtml` host
- `src/app/globals.css` — `sequence-msg-hover-highlight-*` (no native `:hover` on unselected messages)

**Agent / dev-server testing**

- Only one Next.js dev instance is allowed per repo clone. Do **not** kill the user's dev server
  on port **3434** (user dev server).
- Automated browser tests must use the **agent test server** on port **3435** (`npm run test:dev`) or Playwright's configured `webServer`. Never kill the user's dev server on port **3434** (`npm run dev`, tmux session `livemaid`).

**Branch, commits, and PR** (pushed to `origin/fix/issue-71-sequence-duplicate-selection`)

| Commit    | Message                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `74e27e3` | `fix(editor): fix duplicate selection overlays on multi-line sequence messages`     |
| `083e396` | `fix(sequence): use message lines as canonical index for multi-line label geometry` |
| `8da1e59` | `fix(sequence): replace nearest-line mapping with owning-line-below-label resolver` |
| `7380364` | `fix(sequence): apply hover highlight to all multi-line label elements`             |
| `807cdd8` | `fix(sequence): prevent click-jumping and remove CSS hover flicker`                 |
| `f3c2714` | `fix(sequence): use labelTop not labelCenterY in findOwningLineForSequenceLabel`    |
| `69e15c4` | `fix(sequence): align multiline message selection box with clicked label`           |
| `1eb9b60` | `fix(sequence): stabilize message hover highlight after selection`                  |

Draft PR: [#74 — fix(sequence): stabilize multi-line message selection and hover](https://github.com/peter6055/livemaid/pull/74)

### 5.2 Sequence Selection Comment Button Placement (`#96` / `#97` guardrail)

The small indigo "Add comment to selection" button for a selected sequence message is rendered
inside the selection-outline overlay in `src/components/editor/EditorCanvas.tsx`. Its visual
placement is controlled by its own `translate(...) scale(...)` transform, not by the selection
box dimensions.

**Invariant**

- Moving the selected-message comment button must not modify `selectionBox`,
  `hoveredSequenceMessageBox`, `sequenceMessageTriggerAreas`, `SEQ_MSG_SELECTION_PADDING`, or
  `SEQ_MSG_HITTEST_PADDING` in `src/hooks/useCanvasInteraction.ts`. Change hit-test constants only
  when the task is explicitly about the invisible hit/reorder area.
- Moving that button must not modify `SEQUENCE_COMMENT_OFFSET` in
  `src/components/editor/CommentLayer.tsx`. That constant positions persisted comment pins and
  active comment-thread anchors, not the selection affordance button.
- Hover and selection geometry for sequence messages must remain pixel-identical after the button
  move; only the button's own transform may change.
- Sequence message selection intentionally uses no extra horizontal model padding and no extra
  horizontal render inflation; keep left/right edges tight while preserving vertical breathing room.

**Current fix**

- Non-sequence selections keep the existing `translate(100%, -50%)` placement.
- The selected-comment button uses `translate(60%, -50%)`, keeping the affordance anchored to the
  selection's right edge without changing selection, hit-area, or stored comment pin geometry.
- Sequence message hit areas use no extra horizontal padding beyond the line+label bounds. Keep
  vertical trigger padding for reliable row targeting, but do not widen the invisible hit overlay
  left/right.

**Regression checks**

- Select a sequence message and verify the indigo comment button sits fully outside the selection
  outline.
- Verify the purple selection outline still tightly matches the message line + label and does not
  jump compared with hover.
- Verify the transparent reorder/hit band still covers the intended message row vertically without
  extending farther left/right than the message line+label bounds.
- Add a comment and verify the persisted comment pin/thread anchor still appears at the expected
  sequence-message anchor.



