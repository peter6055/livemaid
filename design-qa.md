# Design QA

- source visual truth path: `/var/folders/74/sf57q5rx3cg45zxjwft4gv7c0000gn/T/TemporaryItems/NSIRD_screencaptureui_Psg7wh/Screenshot 2026-06-13 at 6.07.22 pm.png`
- implementation screenshot path: live Chrome capture from the current `localhost:3000/editor/RSM3t6m-RMefELxTUEFuj` session; no saved file path was exported from the browser state
- viewport: desktop Chrome, approximately 1824x999
- state: comments sidebar open, 4 open threads, sort mode set to `newest`, resolved section collapsed

## Full-View Comparison Evidence
- The source image is a focused thread bubble crop, while the implementation capture is a full editor view with the comments sidebar visible. I normalized by comparing the top-right comments panel region in both views.
- The implementation matches the overall product direction: compact sidebar, minimal thread rows, and threaded content below the header.

## Focused Region Comparison Evidence
- The top header row in the implementation has a strong left action (`Resolve`), a centered title (`Comment thread`), and a right close icon. The combination reads slightly over-determined at this size.
- The row beneath it introduces a second control line (`Sort`) immediately after the header separator, which makes the top area feel busy before the user reaches the thread list.

## Findings
- [P3] Top row could use a clearer visual hierarchy
  Location: comments bubble header in the top-right panel.
  Evidence: the header currently combines an action button, centered title, and close icon on one row, with equal visual weight competing for attention.
  Impact: the panel feels a bit awkward at first glance, especially on a compact bubble where users expect a simpler title/action balance.
  Fix: simplify the header into a more deliberate structure, such as keeping the title centered and moving actions into a single right-aligned cluster, or split the row into a compact action strip above a title row.

- [P3] Sort row feels detached from the thread list
  Location: sort control immediately below the header separator.
  Evidence: the sort label and dropdown sit alone above the list, separated by a full-width divider, which makes the top section feel like two unrelated UI blocks.
  Impact: users may read the sort control as a leftover toolbar rather than part of the list controls.
  Fix: make the list header more intentional by tightening spacing, reducing the separator emphasis, or embedding the sort control alongside the open-thread count.

## Open Questions
- Should the bubble prioritize a stronger review workflow header, or stay as lightweight as possible with only one primary action and one dismiss control?
- Do you want sorting to remain visible at all times, or should it collapse into an overflow/menu control to reduce top-of-panel density?

## Implementation Checklist
- Rebalance the bubble header so the title and actions feel optically centered.
- Reduce the visual separation between the header separator and the sort control.
- Decide whether the sort control should remain always visible or move into an overflow menu.

## Follow-up Polish
- Use a slightly quieter visual treatment for the top action row if you want the bubble to feel more like a lightweight comment popover than a modal card.
- Consider aligning the sort control with the open-thread count so the panel reads as one compact list header.

final result: passed
