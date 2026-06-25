# ER Diagram Plugin

## 2. ER Diagrams

- ER diagrams are implemented as a dedicated plugin registered under `erDiagram`.
- Plugin modules follow the same server-safe rule: no top-level `"use client"` or client-only
  imports.
- Entity discovery and mutation must respect Mermaid ER syntax quirks, especially relationship
  operators and attribute-block parsing.
- Attribute editing is structured and validated by field. Invalid rows must not be committed
  into Mermaid code.
- Relationship creation and editing must emit Mermaid-safe labels and operators.
- Locking and property-panel behavior must remain diagram-local without regressing shared
  canvas interactions.