# Flowchart Interaction

## 4. Flowchart Interaction

- Flowchart nodes and edges support two-way editing through code mutation, not a separate graph
  model.
- Parallel edges must map by Mermaid's stable edge identifiers, not array position.
- Unlabeled edges need geometry from the visual path rather than an empty edge-label box.
- Edge toolbar mutations should preserve Mermaid compatibility when switching among connector,
  stroke, color, and animation states.

### 4.1 Membership drop highlight (drag node/subgraph into a subgraph)

- The highlight box measures a cluster with `getClusterVisualRect`, which returns the largest
  direct-child `rect` of `g.cluster` (the drawn box). Never use the group bbox — it unions
  `g.cluster-label` and reads taller than the visible box — and never use a descendant
  `querySelector("rect")`, which can return a tiny nested node rect.
- It renders in **viewport space**, outside the pan/zoom transform, with plain-px borders. Do not
  move it inside the transform and scale-lock the border with `calc(px * 1/zoom)`: Chrome floors
  `border-width` to 1 CSS px, so the border renders 2, 3, 6 … screen px as you zoom in. The
  viewport-space overlay pattern (as used for sequence endpoint handles) keeps chrome a constant
  screen size at any zoom.
- Cluster rects and the shell origin are captured together at pointerdown and re-captured once when
  the drag arms, so a pre-threshold pan cannot leave a stale origin.
