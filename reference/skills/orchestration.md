# Agent Orchestration Standard

Default working mode for multi-step tasks in this repository: **the main agent orchestrates,
subagents execute.** Proven in practice on livemaid-project#16/#17 (two parallel bug fixes plus a
sequential refactor, zero cross-breakage). Follow this unless a task is too small to split
(single trivial edit = do it inline).

## 1. Roles

| Role        | Owns                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Main agent  | Issue/docs recon, root-cause diagnosis, task decomposition, brief writing, dispatch, integration, final gates |
| Subagent(s) | One isolated component each: implement + test + self-verify inside its file boundary, then report back        |

The main agent never delegates git commits, final verification gates (`prepush`), or integration
review. Subagents never commit, never touch port 3434 / tmux session `livemaid`, and stay inside
their declared file boundary.

## 2. Workflow

1. **Recon (main agent, itself).** Read the issues and the mandated `reference/` docs. Locate the
   affected code and confirm root causes well enough to write precise briefs — do not outsource
   thinking about _what_ to fix; outsource the _doing_ and the grind of test authoring/iteration.
2. **Decompose into small verifiable components.** Split work so every component:
   - touches a disjoint set of files from every other concurrent component (this is what makes
     parallel dispatch safe), or
   - runs sequentially after its predecessor when files genuinely overlap.
3. **Dispatch** one subagent per component, in parallel where boundaries are disjoint.
4. **Integrate.** Review every diff personally; restore dev artifacts (e.g. `git checkout -- tsconfig.json`
   after dev-server runs); run the full gate once (`npm run prepush`).
5. **Independent verification (main agent).** Re-execute the real user flows in a browser
   (Playwright script or spec) with screenshots at each checkpoint. Do not trust subagent reports
   alone; do treat their red-before/green-after evidence as required.

## 3. Brief Contract (every subagent prompt contains)

1. Goal + full issue context (paste the issue summary; subagents cannot see your chat).
2. Pre-diagnosed root cause with exact file/line locations — verified by the main agent first.
3. **Strict allowed-files list** ("you may modify ONLY X and new files named Y\*"). Name the exact
   other files another agent owns so the boundary is unambiguous.
4. Test requirements: which specs to model on, what scenarios must be covered, and proof-of-detection
   (run against unfixed code expecting failure, then green after — or mutation-check).
5. Verification commands with non-interactive shell rules (byte-capped output, `--yes` flags,
   tmux test server protocol) and generous timeouts.
6. Safety rails: no `git commit/add/push`; never port 3434 or session `livemaid`.
7. The report-back format (below).

## 4. Report-Back Contract (what the main agent demands back)

- Root-cause confirmation: before→after of the actual change.
- Diff summary limited to the allowed files.
- Every added test name + pass/fail tails of the commands that were run, including the
  red-before/green-after (or mutation) evidence.
- **Deviations from the brief** — corrections, extra findings, rejected instructions — called out
  explicitly (a good subagent corrects a wrong orchestrator assumption and proves it).
- Unrelated failures observed but not fixed (with reason), so nothing silently rots.

## 5. Decomposition Patterns That Worked

| Situation                                  | Pattern                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Two independent bugs                       | Parallel agents, disjoint files, each adds its own namespaced spec        |
| Fix landed but architecture should improve | Sequential refactor agent over the merged tree, keeping prior specs green |
| Shared file unavoidable                    | Strictly sequential dispatch, or main agent edits the shared seam itself  |
| Verification needs browser flows           | Each agent ships runnable specs; main agent re-verifies live afterwards   |

## 6. Anti-Patterns

- Dispatching a subagent without pre-verified root cause ("go explore and fix") — slow and risky.
- Overlapping file boundaries between concurrent agents — guarantees conflicts.
- Accepting "tests pass" without output tails or detection-proof — unverifiable claims.
- Letting subagents run the full build/prepush concurrently — wasteful; orchestrator runs it once.
- Skipping the orchestrator's own live-browser pass because specs are green — specs can share a
  blind spot; screenshots catch what assertions miss.
