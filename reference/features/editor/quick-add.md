# Quick Add & Drag-to-Connect

## 3. Quick Add and Drag-to-Connect

- The purple `+` affordance stays visually attached to the selected object.
- Once a connect drag starts, the preview line should visually dock to the selected object's
  nearest perimeter edge rather than the floating `+` button itself.
- Connect-drag overlays should be isolated from pan/zoom with their own drag listeners and
  render above the transformed canvas when the interaction requires viewport-relative geometry.
- Flowchart drag-drop shape pickers must use semantic theme tokens (`bg-popover`,
  `text-popover-foreground`, `border-border`, `bg-background`, `hover:bg-accent`) so they remain
  readable in light and dark mode.
- State drag-to-connect shape pickers must close as soon as the canvas moves or a pan/zoom
  gesture starts, and disabled Start/End tiles must expose a custom hover/focus tooltip explaining
  the singleton rule.
