# State Diagram Plugin

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
