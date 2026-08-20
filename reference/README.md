# Reference Documentation

Source of truth for LiveMaid architecture, design, and features. **Read only what your task needs.**

> All agent/developer reference docs live under `reference/`. Do not add docs at the repo root.

## Start Here

| Doc                                                      | When to read                             |
| -------------------------------------------------------- | ---------------------------------------- |
| [`features/reading-map.md`](./features/reading-map.md)   | **Always first** for editor/feature work |
| [`architecture/overview.md`](./architecture/overview.md) | System structure, storage, editor model  |
| [`standards/design.md`](./standards/design.md)           | UI/UX tokens, layout, interaction polish |

## By Subfolder

### `features/` — Product behavior & editor truths

| Doc                                                                                 | Topic                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------- |
| [`reading-map.md`](./features/reading-map.md)                                       | Invariants, support matrix, reading map |
| [`editor/overview.md`](./features/editor/overview.md)                               | Canvas selection, overlays              |
| [`editor/quick-add.md`](./features/editor/quick-add.md)                             | `+` button, drag-to-connect             |
| [`editor/flowchart.md`](./features/editor/flowchart.md)                             | Flowchart interaction                   |
| [`editor/sequence.md`](./features/editor/sequence.md)                               | Sequence messages, hover, reorder       |
| [`editor/sequence-plus-placement.md`](./features/editor/sequence-plus-placement.md) | Lifeline `+` slot model                 |
| [`editor/canvas-highlighting.md`](./features/editor/canvas-highlighting.md)         | Canvas-to-Monaco highlight              |
| [`editor/demo-chrome.md`](./features/editor/demo-chrome.md)                         | Demo mode, header chrome                |
| [`diagrams/overview.md`](./features/diagrams/overview.md)                           | All diagram plugins                     |
| [`diagrams/class.md`](./features/diagrams/class.md)                                 | Class diagram                           |
| [`diagrams/er.md`](./features/diagrams/er.md)                                       | ER diagram                              |
| [`diagrams/state.md`](./features/diagrams/state.md)                                 | State diagram                           |

### `architecture/` — System design

| Doc                                                           | Topic                             |
| ------------------------------------------------------------- | --------------------------------- |
| [`overview.md`](./architecture/overview.md)                   | Full architecture reference       |
| [`storage.md`](./architecture/storage.md)                     | Local-first storage, adapter seam |
| [`editor-split.md`](./architecture/editor-split.md)           | Split-screen WYSIWYG model        |
| [`plugins.md`](./architecture/plugins.md)                     | Diagram plugin architecture       |
| [`mongodb-migration.md`](./architecture/mongodb-migration.md) | Deferred MongoDB plan             |

### `standards/` — Conventions & rules

| Doc                                                  | Topic                                    |
| ---------------------------------------------------- | ---------------------------------------- |
| [`design.md`](./standards/design.md)                 | Design specification                     |
| [`testing.md`](./standards/testing.md)               | Tests, browser verification, dev servers |
| [`mermaid.md`](./standards/mermaid.md)               | Mermaid syntax rules                     |
| [`nextjs.md`](./standards/nextjs.md)                 | Next.js version caveats                  |
| [`command-output.md`](./standards/command-output.md) | Shell output byte caps                   |

### `git/` — Version control

| Doc                                | Topic                  |
| ---------------------------------- | ---------------------- |
| [`workflow.md`](./git/workflow.md) | Branches, commits, PRs |
| [`prepush.md`](./git/prepush.md)   | Pre-push validation    |

### `plans/` — Verification writing

| Doc                                                    | Topic                         |
| ------------------------------------------------------ | ----------------------------- |
| [`verification-plan.md`](./plans/verification-plan.md) | How to write test plans       |
| [`regression-plan.md`](./plans/regression-plan.md)     | How to write regression plans |

### `skills/` — Agent workflows

| Doc                                                                   | Topic                             |
| --------------------------------------------------------------------- | --------------------------------- |
| [`opencode-workflow.md`](./skills/opencode-workflow.md)               | OpenCode orchestration            |
| [`reporting-bugs-and-epics.md`](./skills/reporting-bugs-and-epics.md) | Bug/epic reporting & repo routing |
