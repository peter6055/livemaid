# Class Diagram Plugin

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