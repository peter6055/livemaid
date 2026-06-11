# Diagram Plugin Details

This document holds the deep implementation truths for diagram-specific plugins. Read the
relevant section before changing plugin parsing, toolbars, mutation helpers, or DOM routing.

## 1. Class Diagrams

- Class diagrams are implemented as a dedicated plugin registered under `classDiagram`.
- Plugin modules used by the server-side registry must not carry `"use client"` or import
  client-only modules at the module top.
- Double-click behavior for class nodes, notes, and titles is timing-based rather than relying
  purely on native `dblclick`, because overlays and Mermaid DOM replacement interfere with
  browser dispatch.
- The property panel is sticky across Mermaid re-renders and must not derive its open state
  solely from transient live selection ids.
- Class mutations must preserve Mermaid-valid structure when editing names, members,
  annotations, notes, titles, relationships, and namespaces.
- Namespace mutations must prevent empty namespaces from surviving if Mermaid would reject or
  break on the resulting structure.

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

## 3. State Diagrams

- State diagrams are implemented as a dedicated plugin registered under `stateDiagram`, while
  the emitted Mermaid header remains `stateDiagram-v2`.
- Plugin modules follow the same server-safe rule: no top-level `"use client"` or client-only
  imports.
- State labels are written through the syntax path that is most robust for Mermaid parsing;
  label editing must prefer syntax that tolerates user text safely.
- Root-level Start and End pseudo-states are singleton concepts. UI and mutation helpers must
  enforce that constraint.
- Empty composites must not be produced if Mermaid renders them unreliably or crashes on them.
- Transition selection, rename, and deletion rely on Mermaid's generated edge identifiers and
  must not accidentally target note connectors.
- State quick-note, composite, divider, and styling actions are syntax-backed editor
  operations, not free-positioning gestures.
- The state shape palette and drag-connect menu expose these creation targets: State, Fork, Join,
  Choice, Start, End, Composite, Multiline, and Concurrency. Multiline emits a `note ... end note`
  block. Concurrency emits a pre-seeded composite containing a `--` divider because Mermaid
  concurrency is a composite-region divider, not an independent node shape. Fork emits the fork node
  plus two outgoing target-state transitions so the fork is useful immediately.
- Composite container selection intentionally shows only Rename and a destructive Delete action in
  the floating toolbar. State-specific actions such as Style, Note, Divider, and Move into
  composite stay off the composite container toolbar.

## 4. Shared Plugin Rules

- New diagram support should land as a plugin plus targeted shared-editor wiring, not as a
  growing pile of type checks spread throughout unrelated modules.
- Diagram-specific mutation helpers should remain local to the relevant plugin or diagram
  utility area.
- When a diagram has Mermaid syntax edge-cases that can break rendering, capture that truth
  here rather than bloating the global mandatory docs.
