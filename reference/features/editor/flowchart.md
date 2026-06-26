# Flowchart Interaction

## 4. Flowchart Interaction

- Flowchart nodes and edges support two-way editing through code mutation, not a separate graph
  model.
- Parallel edges must map by Mermaid's stable edge identifiers, not array position.
- Unlabeled edges need geometry from the visual path rather than an empty edge-label box.
- Edge toolbar mutations should preserve Mermaid compatibility when switching among connector,
  stroke, color, and animation states.
