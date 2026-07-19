# Demo Mode & Editor Chrome

## 7. Demo Mode & Editor Chrome

- Demo mode is runtime-driven and must stay read-only from both server and client mutation
  paths.
- Header/editor chrome behavior must preserve diagram-name editing, history/export controls,
  and status surfaces without fighting the shared save pipeline.
- Duplicating a diagram from the editor header creates the copy and opens the copied diagram in a
  separate browser window/tab, leaving the source editor open in its current window. The source
  editor opens `/editor/:id/duplicate` immediately and passes the current in-memory code through
  same-origin storage so the new tab performs creation and redirects itself.
