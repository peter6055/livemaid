# INSTRUCTION_FOR_REPORTING_BUG_AND_FEATURE_EPIC

## Purpose

Use this instruction when reporting **bugs** or **feature epics** for the LiveMaid project.

The goal is to create reports that are clear enough for an engineer or AI coding agent to understand, reproduce (for bugs), implement (for epics), and hand off — without needing repeated follow-up questions.

This workflow applies to:

- Internal issue creation in the private planning repo
- Public GitHub issue creation (sanitized, contributor-facing only)
- Direct report output without creating any issue
- AI-agent handover prompts
- PR follow-up notes
- Regression reports after a fix was attempted

---

## Repository routing (mandatory)

LiveMaid uses **two GitHub repositories**. Choose the correct destination before creating any issue.

| Repository           | URL                                             | Use for                                                                            |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Public code**      | `https://github.com/peter6055/livemaid`         | Sanitized, contributor-facing bugs and features only                               |
| **Private planning** | `https://github.com/peter6055/livemaid-project` | Internal issues, full epics, handover notes, agent session logs, sensitive context |

### Default rule

**Use `livemaid-project` by default** for all internal work:

- Full feature epics and specs
- Agent handover notes and session transcripts
- Personal deadlines, business context, or non-public rationale
- Bug reports that include private diagram content, credentials, or internal context
- Communication between maintainer, AI agents, and verified contributors

**Use public `livemaid` only when** the content is sanitized and ready for open-source contributors:

- Short bug summary with no private content
- Thin feature summary with acceptance criteria
- Community-visible tracking that does not expose internal notes

### Cross-linking

When both repos have related work, cross-link them:

```markdown
## Tracking

- Private spec: peter6055/livemaid-project#N
- Public mirror: peter6055/livemaid#N
```

Public issues should **never** contain private spec text, handover logs, or sensitive context. Point to the private issue instead.

### Access

Only the maintainer, AI agents, and **verified contributors** may access `livemaid-project`. Do not reference private issue content in public issues, PRs, commits, or code comments unless explicitly sanitized.

---

## First questions to clarify

Before preparing any report, clarify these if the user has not already specified them:

### 1. Output format

> Do you want me to output the report directly here, or create a GitHub issue?

Follow the user's instruction exactly:

- **Create a GitHub issue** → create the issue in the correct repo (see Repository routing)
- **Output directly** → do not create anything on GitHub
- **Put all items in one issue** → create exactly one issue
- **Create separate issues** → one issue per item
- **Do not put on GitHub** → only provide the report text
- **Existing issue referenced** → prefer a follow-up comment or draft note unless a new issue is explicitly requested

Never create a GitHub issue when the user only asks for wording, a draft, or direct output.

### 2. Destination repo (when creating an issue)

> Should this go in the private planning repo (`livemaid-project`) or the public repo (`livemaid`)?

If unclear, default to **`livemaid-project`** unless the content is fully sanitized and contributor-ready.

---

# Part A — Bug reports

## Important limitation: recordings

Assume that future AI agents, engineers, or GitHub readers may **not be able to view uploaded recordings**.

Every bug report based on a recording must include a written description of what happens in the recording.

Do not only write:

> See recording.

Instead, include:

- Recording filename
- Approximate timeframe
- What the user does
- What appears on screen
- Expected behaviour
- Actual behaviour
- Visible state before and after the action
- Any affected diagram element, label, participant, comment, note, or connection
- Any code line or Mermaid line visible in the editor, if relevant

Example:

```markdown
Recording: `Screen Recording 2026-06-19 at 12.09.54 am.mov`

0s–3s:
The sequence diagram is open. The selected message is `MS->>EE: Validate quota`.
The purple selection box is shown around the message.

4s–7s:
The user drags the selected connection downward toward the gap below `[Quota Valid]`.
A purple drop guide appears.

8s–13s:
After releasing the mouse, the connection does not move to the visual gap where it was dropped.
The final position differs from the expected drop target.
```

The written description should allow someone to understand the bug without the video.

---

## Standard bug report structure

```markdown
## Title

Bug: [short, specific description]

## Summary

Briefly explain the problem in one or two paragraphs.

## Context

- Project: LiveMaid
- Repository: livemaid-project | livemaid
- Diagram type:
- Branch / PR:
- Related issue (private):
- Related issue (public):
- Recording:
- Status of related issue/fix:

## Detailed recording description

### 0s–3s

Describe what is visible and what the user does.

### 4s–7s

Describe the key interaction.

### 8s–13s

Describe the failure or unexpected result.

## Steps to reproduce

1. Open ...
2. Select ...
3. Drag / click / hover ...
4. Observe ...

## Actual behaviour

- What currently happens.

## Expected behaviour

- What should happen.

## Suspected cause

Explain likely cause if there is enough evidence. Use cautious wording if uncertain.

## Suggested fix direction

Give practical implementation ideas.

## Acceptance criteria

- [ ] The bug is fixed.
- [ ] Related behaviours still work.
- [ ] No regression to previous fixes.

## Suggested files to inspect

- `src/components/editor/EditorCanvas.tsx`
- `src/hooks/useCanvasInteraction.ts`
- Other relevant files.

## Regression checks

- [ ] Existing fixed issue remains fixed.
- [ ] Existing selection behaviour still works.
- [ ] Existing drag/hover/click behaviour still works.
```

---

## What to include in every bug report

Every bug report should include these details when available:

### 1. Diagram type

Examples:

- Sequence diagram
- Flowchart
- Class diagram
- ER diagram
- State diagram
- Timeline

### 2. User action

Describe exactly what the user did:

- Clicked
- Double-clicked
- Dragged
- Hovered
- Panned
- Opened comment panel
- Added comment
- Added note
- Moved a connection
- Dragged endpoint
- Reordered a sequence message

### 3. Target element

Name the affected element:

- Message/connection
- Participant
- Actor
- Lifeline
- Note
- Comment
- Purple `+`
- Endpoint handle
- Selection box
- Toolbar
- Inline editor
- Comment panel
- Mermaid source line

### 4. Actual result

Describe the incorrect result:

- Wrong item selected
- Wrong comment opened
- Wrong note target
- Flicker
- Canvas pans unexpectedly
- Selection box jumps
- Drop target does not match final position
- Purple `+` hard to click
- Line/edge not editable
- Toolbar appears in the wrong place

### 5. Expected result

Describe the intended behaviour clearly:

- The clicked item should be selected.
- The dragged item should move to the visible drop target.
- Hover should remain stable.
- The purple `+` should take priority over connection selection.
- The note should be added to the selected participant.
- The canvas should not move when interacting with comments.

### 6. Regression warning

If a related issue has already been fixed, explicitly warn not to break it.

Example:

```markdown
Important: issue #71 was already fixed. Do not rewrite or break the existing #71 fix. This is a smaller follow-up bug only.
```

---

## Handling existing PRs and issues

When the user references a PR or issue, include that context with repo name:

```markdown
Related PR: https://github.com/peter6055/livemaid/pull/76
Related issue (private): peter6055/livemaid-project#59
Related issue (public): peter6055/livemaid#59
```

If the user says the bug is unrelated to a PR, include this clearly:

```markdown
This issue is unrelated to the changes introduced in PR #76.
```

If the bug is a follow-up to an existing issue, state whether the old issue is fixed or still relevant.

Example:

```markdown
The original #71 duplicate selection issue has been fixed. This report tracks only the remaining hover flicker problem.
```

Do not conflate separate issues.

---

## When multiple bugs are provided

Ask or follow the user's instruction:

- One issue for all bugs
- Separate issue per bug
- Direct output only

If the user says:

> put all of them in one issue

Then create one GitHub issue with sections:

```markdown
## Bug 1: ...

## Bug 2: ...

## Bug 3: ...

## Bug 4: ...
```

Do not create four separate issues.

If the user says:

> four bugs only

Do not add extra unrelated bugs, even if you notice them.

---

## When the user asks for a GitHub bug issue

If creating a GitHub issue:

1. Confirm destination repo (private by default).
2. Inspect the supplied recording or screenshots.
3. Search for duplicates if appropriate.
4. Create a clear title.
5. Include recording filenames and detailed descriptions.
6. Add `bug` label when available.
7. Confirm the issue number and link to the user.

If also creating a public mirror, keep it thin:

```markdown
## Summary

[2–3 sentences, no private content]

## Acceptance criteria

- [ ] ...

## Tracking

Private spec: peter6055/livemaid-project#N
```

Final response example:

```markdown
Created the GitHub issue:

[peter6055/livemaid-project#73 — Bug: Sequence diagram interaction issues](URL)

It is open and labelled `bug`.
```

Do not claim the issue was created if the GitHub action failed.

---

## When the user asks for direct output only

Do not create a GitHub issue.

Provide a copy-paste-ready issue draft.

Use a clear title and full body.

Example response:

```markdown
Here is the issue text without creating it on GitHub:
```

Then output the issue.

---

# Part B — Feature epics

## Purpose of a feature epic

A feature epic describes **what to build, why it matters, and how to verify it** — at a level sufficient for an AI agent or engineer to implement without guessing scope.

Epics belong in **`livemaid-project` by default**. Create a thin public mirror in `livemaid` only when the feature is ready for community visibility or contributor help.

---

## Standard feature epic structure

```markdown
## Title

Epic: [Feature name]

## Business value

Why this feature matters. Who benefits. What problem it solves.

## Proposed solution

### Overview

High-level approach. Reuse existing architecture wherever possible.

### Design principles

- Reuse existing editor behaviour
- Maintain Mermaid compatibility
- Editor-first experience
- (Add feature-specific principles)

## Scope

### In scope

- ...

### Out of scope

- ...

## User stories / capabilities

Users can:

- ...

## Acceptance criteria

- [ ] ...
- [ ] ...

## Technical notes

- Files/modules likely involved
- Patterns to reuse from existing diagram types
- Mermaid syntax reference links

## Verification plan

How to test manually and with automated tests.

## Regression checks

- [ ] Existing diagram types still work
- [ ] Undo/redo still works
- [ ] Mermaid round-trip preserved

## Tracking

- Private epic: peter6055/livemaid-project#N
- Public mirror (if any): peter6055/livemaid#N
- Branch: feat/N-feature-name
```

---

## What to include in every feature epic

### 1. Mermaid compatibility

State whether the feature must parse/generate valid Mermaid syntax and preserve unknown syntax on round-trip.

### 2. Editor interaction parity

State which existing diagram editor patterns to reuse (selection, toolbar, inline edit, drag, direction toolbar, undo/redo).

### 3. Scope boundaries

Explicit in-scope and out-of-scope lists prevent scope creep.

### 4. Acceptance criteria

Testable checkboxes only. No vague goals like "works well."

### 5. Reference docs

Point agents to relevant `reference/` docs before implementation:

- `reference/features/reading-map.md` (always first)
- `reference/architecture/overview.md`
- `reference/standards/design.md`
- Diagram-specific docs as applicable

### 6. Handover section (for AI agents)

Include a self-contained handover block that does not rely on conversation history:

```markdown
## Agent handover

- Repo: peter6055/livemaid
- Branch: feat/N-feature-name
- Private epic: peter6055/livemaid-project#N
- Current status: [what is done / what remains]
- Do not change: [list of areas to leave alone]
- Next steps: [ordered list]
- Files to inspect: [list]
```

---

## When creating a GitHub epic issue

1. Confirm destination repo — **`livemaid-project` unless fully public-safe**.
2. Use title prefix `Epic:`.
3. Add labels such as `enhancement`, `epic` when available.
4. If a public mirror is needed, create a thin public issue and cross-link.
5. Confirm issue number and link.

Final response example:

```markdown
Created the epic:

[peter6055/livemaid-project#130 — Epic: Interactive Timeline Diagram Editor](URL)

Public mirror (optional): peter6055/livemaid#130
```

---

## Public vs private epic content

| Content                   | Private (`livemaid-project`) | Public (`livemaid`) |
| ------------------------- | ---------------------------- | ------------------- |
| Full spec                 | Yes                          | No — summary only   |
| Agent handover logs       | Yes                          | No                  |
| Session transcripts       | Yes                          | No                  |
| Business/personal context | Yes                          | No                  |
| Acceptance criteria       | Yes                          | Yes (sanitized)     |
| PR/branch links           | Yes                          | Yes                 |
| Community discussion      | Optional                     | Yes                 |

---

# Part C — Shared rules (bugs and epics)

## Special instruction for AI-agent handover

When the user wants text for a new AI-agent session, make the prompt self-contained.

Include:

- Repo name and branch/PR
- Private and public issue numbers
- Current status of previous fixes or implementation
- Exact bug or remaining work
- Recording description with timeframe (for bugs)
- What not to change
- Suggested files
- Acceptance criteria

The AI-agent prompt must not rely on hidden conversation history.

Example:

```markdown
I need help fixing only the remaining hover flicker issue in the LiveMaid sequence diagram editor.

Important:

- Private tracking: peter6055/livemaid-project#72
- #71 was fixed — do not break the #71 fix.
- This is only about hover flicker.
- Branch: fix/sequence-hover-flicker
- The latest recording shows the text flashing when the mouse moves inside the same message.
```

---

## Avoid vague language

Avoid vague bug reports like:

```markdown
The selection is broken.
```

Use specific language:

```markdown
When selecting `Alice->Bob: deoo<br/>sdcsdmkcl`, the purple selection box appears around the previous dotted response line instead of the clicked message.
```

Avoid:

```markdown
It does not work.
```

Use:

```markdown
After dropping the dragged connection into the gap below `[Quota Valid]`, the message remains in its original position or moves to a different slot than the visible drop guide.
```

---

## Be careful with uncertainty

If a recording suggests a likely cause but does not prove it, use cautious wording.

Good:

```markdown
This may be caused by hit-test priority between the purple `+` handle and the message selection overlay.
```

Bad:

```markdown
This is definitely caused by the hit-test code.
```

Good:

```markdown
The likely area to inspect is the sequence message visual model and drag/drop target calculation.
```

---

## Common LiveMaid bug categories from prior reports

Use these categories when relevant.

### Sequence diagram bugs

- Wrong message selected
- Multi-line message selection box wrong
- Hover flicker on message label
- Purple `+` hard to click
- Purple `+` slightly misaligned
- Endpoint handle overlaps insertion handle
- Dragged connection drops to wrong slot
- Note added to wrong participant
- Actor participant selection box too large
- Reorder/drop guides cluttered or misaligned
- Selection box or toolbar appears in wrong place

### Comment bugs

- Clicking/editing wrong comment
- Comment panel opens and canvas pans
- Comment composer placed incorrectly
- Comment snaps back after panning
- Comment interaction should not move canvas

### Flowchart bugs

- Flowchart line/edge label not editable
- Flowchart line selection wrong
- Edge label inline editing missing

### Timeline (and other diagram types)

- Parse/generate round-trip failures
- Canvas interaction does not match other diagram editors
- Direction change breaks layout or selection

---

## Specific guidance to preserve

### 1. Do not rely on recordings alone

Always describe the recording in text with approximate timestamps.

### 2. Confirm output mode

Ask whether the user wants:

- direct output only, or
- a GitHub issue created.

### 3. Confirm destination repo

Default to `livemaid-project` unless content is fully sanitized.

### 4. Respect "do not put on GitHub"

If the user says not to put it on GitHub, only draft the issue.

### 5. Respect "all bugs in one issue"

If the user asks for one issue with multiple bugs, create exactly one issue.

### 6. Preserve fixed issues

When the user says an issue is fixed, mark it as fixed and warn not to regress it.

Example:

```markdown
#71 is fixed. This issue is a smaller follow-up and must not break #71.
```

### 7. Do not over-solve by changing layout

For purple `+` clickability, prefer hit-test priority and larger invisible hitboxes before changing Mermaid's native line spacing.

Reason:

- Mermaid controls native layout.
- Changing line spacing may affect all diagrams.
- Hit target priority is safer and more local.

### 8. For drag/drop issues, match preview and final result

If the visual drop guide shows one target but the final moved item lands elsewhere, report this clearly.

Acceptance criteria should say:

```markdown
The visible drop guide must match the final insertion position after mouse release.
```

### 9. For hover flicker, identify competing hover systems

Hover flicker may be caused by:

- CSS `:hover`
- React hover classes
- SVG pointer events
- overlay mount/unmount
- mouseover/mouseout churn

A good report should recommend a single hover owner.

### 10. For hit-test conflicts, prioritise explicit targets

If the user is on a purple `+`, the purple `+` action should win.

If the user is on a comment button, the comment action should win.

If the user is on a toolbar, the toolbar action should win.

Do not allow underlying canvas/message selection to steal the action.

### 11. Always include regression checks

For example:

```markdown
- [ ] #71 remains fixed.
- [ ] Message selection still works.
- [ ] Endpoint dragging still works.
- [ ] Notes still work.
- [ ] Comments still work.
```

---

## Recommended issue title patterns

Use concise titles.

Bugs:

```markdown
Bug: Sequence diagram purple `+` handles are hard to click and slightly misaligned
Bug: Dragging a sequence diagram connection does not move it to the expected drop position
Bug: Comment composer snaps back after panning the diagram
Bug: Flowchart line/edge labels are not editable
Bug: Sequence diagram note is added to the wrong participant
```

Epics:

```markdown
Epic: Interactive Timeline Diagram Editor
Epic: Class diagram relationship inline editing
Epic: Export diagram as SVG with custom theme
```

---

## Recommended acceptance criteria style

Use checkboxes.

Example:

```markdown
## Acceptance criteria

- [ ] Hovering a multi-line sequence message does not flicker.
- [ ] Clicking the purple `+` triggers the `+` action.
- [ ] Clicking outside the `+` still selects the message.
- [ ] The selected box stays on the clicked message.
- [ ] No regression to #71.
```

Acceptance criteria should be testable.

---

## Final response style

When the task is complete, keep the final response short.

If created on GitHub:

```markdown
Created the GitHub issue:

[Repo#issue — Title](URL)

It is open and labelled `[label]`.
```

If direct output:

```markdown
Here is the issue text without creating it on GitHub:
```

Then provide the issue draft.

Do not over-explain unless the user asks for reasoning.

---

## Quick decision tree

```
User reports bug or epic
        │
        ▼
Output mode specified?
  No → Ask: direct output or GitHub issue?
        │
        ▼
GitHub issue requested?
  No → Output draft only
  Yes → Which repo?
        │
        ▼
Contains private/sensitive content OR full spec/handover?
  Yes → livemaid-project (default)
  No, sanitized & contributor-ready → livemaid (optional public mirror)
        │
        ▼
Create issue → cross-link if both repos involved → confirm link to user
```
