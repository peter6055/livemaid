---
version: alpha
name: LiveMaid-design-analysis
description: "LiveMaid presents a premium, state-of-the-art developer tool aesthetic. It is rigorously dark-themed, utilizing deep slates for surfaces and vibrant indigo as the primary brand accent. The interface feels alive and dynamic through the use of glassmorphism (translucent headers), subtle micro-animations on interactive elements, and a split-screen architecture that balances a dense code editor with an infinite, floating visual canvas. It is designed to feel like a high-end IDE merged with a modern design tool."

colors:
  primary: "#4f46e5" # indigo-600
  on-primary: "#ffffff"
  primary-hover: "#4338ca" # indigo-700
  canvas: "#020617" # slate-950
  surface: "#0f172a" # slate-900
  surface-soft: "#1e293b" # slate-800
  surface-glass: "rgba(15, 23, 42, 0.5)" # slate-900/50
  ink: "#e2e8f0" # slate-200
  ink-muted: "#94a3b8" # slate-400
  ink-subtle: "#64748b" # slate-500
  hairline: "#1e293b" # slate-800
  hairline-soft: "#334155" # slate-700
  semantic-success: "#10b981" # emerald-500
  semantic-warning: "#f59e0b" # amber-500
  semantic-danger: "#ef4444" # red-500
  code-bg: "#1e1e1e" # VS Code Dark base

typography:
  display-lg:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.3
  body-lg:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  button:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
  code:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
    fontSize: 13px
    fontWeight: 400

rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  canvas-gap: 16px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card-base:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    border: "1px solid {colors.hairline}"
    padding: "{spacing.lg}"
  floating-toolbar:
    backgroundColor: "#ffffff"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    border: "1px solid #e2e8f0"
    padding: "8px 16px"
  inline-editor-toolbar:
    backgroundColor: "#1c1c21"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "4px"
    shadow: "xl"
  canvas-node:
    backgroundColor: "#ffffff"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    border: "2px solid {colors.hairline}"
    padding: "12px 24px"
---

## Overview

LiveMaid is a local-first WYSIWYG editor for Mermaid diagrams. Its design language bridges the gap between a serious developer environment (like VS Code) and a premium, modern design tool (like Figma or Miro).

Because the core value proposition is "diagrams as code", the application defaults to a strict dark mode (`slate-950`) to ease eye strain during long coding sessions. The UI is built on top of `shadcn/ui`, utilizing sharp, minimal borders, subtle translucency (glassmorphism), and a vibrant indigo accent color to draw attention to primary actions and selected states.

**Key Characteristics:**

- **Dark Mode First:** The entire application lives in a dark slate environment. White is reserved exclusively for the visual canvas nodes to ensure maximum contrast and readability of the diagrams.
- **Glassmorphism:** Headers and structural elements use translucent backgrounds with background-blur, creating a sense of depth without relying heavily on drop shadows.
- **Split-Screen Dominance:** The editor view is dominated by the resizer. The left side is a pure, unstyled Monaco editor; the right side is an infinite canvas.
- **Floating Context:** Toolbars inside the canvas float above the grid as pill-shaped, light-themed elements (like the zoom controls), providing a stark contrast to the dark IDE surroundings. The inline-editing text toolbar uses a dark `#1c1c21` theme to closely hug the active node without visually blending into the white canvas.

## Colors

### Brand & Accent

- **Primary Indigo** (`{colors.primary}`): Used for primary CTAs ("New Diagram"), active selection states on the canvas, and quick-add node handles.
- **Success Emerald** (`{colors.semantic-success}`): Used for the "Saved" indicator in the editor header.
- **Warning Amber** (`{colors.semantic-warning}`): Used for the "Saving..." indicator to show network/disk activity.
- **Danger Red** (`{colors.semantic-danger}`): Used for destructive actions like deleting a diagram.

### Surface

- **Canvas Slate** (`{colors.canvas}`): The deepest dark (`slate-950`). Used as the absolute background of the dashboard and the root layout.
- **Surface** (`{colors.surface}`): Slightly lighter (`slate-900`). Used for cards and panels.
- **Surface Glass** (`{colors.surface-glass}`): A 50% opaque variant of the surface color used with `backdrop-blur` for sticky headers.
- **Hairline** (`{colors.hairline}`): Subtle borders (`slate-800`) used to separate panes in the split-screen layout and frame cards.

### Text

- **Ink** (`{colors.ink}`): Primary text color for headings and body content (`slate-200`).
- **Ink Muted** (`{colors.ink-muted}`): Secondary text for metadata, timestamps, and ghost buttons (`slate-400`).

## Typography

- **System Sans:** We rely on the system sans-serif stack (Inter on Mac/Windows) to keep the application feeling native and fast.
- **Code:** The editor uses standard monospace fonts.
- **Hierarchy:** We avoid oversized marketing typography since this is an internal utility tool. The largest type is the 30px dashboard header.

## Layout & Architecture

### The Split View

The core of LiveMaid is the resizable split view (`react-resizable-panels`).

- **Code Pane:** Minimal chrome. A single 40px header indicating "Code", followed by the Monaco editor. No margins, no padding.
- **Visual Canvas:** Features an infinite pannable area with a subtle dotted background grid pattern (`bg-[radial-gradient(#e5e7eb_1px,transparent_1px)]`).
- **Resizer:** A 1px hairline border that turns indigo on hover, indicating interactivity.

### Dashboard Grid

A clean CSS grid (1 column on mobile, 3 on desktop) for displaying saved diagrams. Empty states feature a dashed border and an inviting call-to-action to prevent "blank slate syndrome."

## Elevation & Depth

Because the base theme is so dark, traditional drop shadows are ineffective. We create depth using three techniques:

1. **Borders:** 1px `slate-800` borders define boundaries.
2. **Glassmorphism:** The editor header uses `bg-slate-900/50 backdrop-blur` to ensure that if canvas elements scroll underneath, they are blurred, establishing the header's z-index dominance.
3. **Contrast Inversion:** The floating toolbar inside the canvas is explicitly white with a subtle drop shadow. By inverting the theme for this specific element, it instantly registers as floating "above" the dark IDE.

## Shapes

- **Standard UI:** `{rounded.md}` (6px) is used for cards, standard buttons, and dialogs.
- **Floating UI:** `{rounded.full}` (pill shape) is used exclusively for floating contextual toolbars in the canvas, echoing modern design tools like Mermaid AI and Miro.
- **Canvas Nodes:** Nodes match the shape defined in the Mermaid syntax (e.g., standard rectangles, rounded rectangles, diamonds).

## Interaction & Polish

- **Hover States:** All buttons and cards have subtle background color transitions (`transition-colors`).
- **Micro-animations:** The quick-add node button (`+`) scales up on hover (`hover:scale-110 transition-transform`).
- **Feedback:** We use `sonner` for toast notifications to provide instant feedback on destructive actions (deletes) or background errors. Auto-saving is communicated via a subtle, non-intrusive text label in the header rather than a popup.
- **Version History Workspace:** Rollback is exposed through a split workspace — a scrollable list of saved snapshots on the right and a read-only pan/zoom preview canvas of the selected snapshot on the left. Each list entry shows a timestamp, an editable name, a star (pin) affordance, and Preview / Rollback actions. (The raw-code `<pre>` snippet that older versions showed per entry has been removed to keep the list compact.)
- **History Metadata Controls:** Each snapshot row includes a small editable name field and a star affordance so users can pin or categorize important versions without leaving the workspace.

## Do's and Don'ts

### Do

- Ensure the code editor remains the source of truth.
- Use glassmorphism (`bg-slate-900/50 backdrop-blur`) for sticky headers.
- Keep the visual canvas nodes readable (high contrast, usually dark text on light backgrounds).
- Provide immediate visual feedback for saves (Saving... -> Saved).

### Don't

- Don't use light mode for the main application shell.
- Don't clutter the code editor pane with excessive toolbars.
- Don't rely on drop shadows on dark surfaces; use borders instead.
