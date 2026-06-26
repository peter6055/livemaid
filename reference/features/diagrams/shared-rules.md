# Shared Plugin Rules

## 4. Shared Plugin Rules

- New diagram support should land as a plugin plus targeted shared-editor wiring, not as a
  growing pile of type checks spread throughout unrelated modules.
- Diagram-specific mutation helpers should remain local to the relevant plugin or diagram
  utility area.
- When a diagram has Mermaid syntax edge-cases that can break rendering, capture that truth
  here rather than bloating the global mandatory docs.
