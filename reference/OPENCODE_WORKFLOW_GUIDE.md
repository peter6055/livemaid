# OpenCode Workflow Guide for Future Tasks

This document defines the default operating policy for future OpenCode-assisted work in this
repository. The goal is to keep the main Codex session small, spend free models first, and
reserve expensive reasoning for cases where it actually changes the outcome.

## 1. Core Operating Principles

- Treat Codex as the manager and OpenCode as the worker layer.
- Keep the main chat short, decision-focused, and free of repeated transcripts.
- Use the cheapest model that can produce a credible next action.
- Escalate only when the cheaper pass is insufficient or the task is clearly high risk.
- Verify with browser/tests after analysis instead of asking models to restate the same conclusion.
- Do not re-run the same reasoning across multiple models unless the prior pass clearly failed.

## 2. Default Model Ladder

### Start here

- `Big Pickle` for orchestration, planning, and compact summaries.
- `DeepSeek V4 Flash Free` for first-pass inspection, file reading, and quick triage.
- `MiMo V2.5 Free` or `North Mini Code Free` for repetitive search and lightweight extraction.
- `Nemotron 3 Ultra Free` only when it is clearly the best free option for the subtask.

### Escalate when needed

- `DeepSeek V4 Flash` when a free pass gives direction but not enough confidence.
- `DeepSeek V4 Pro` or `Qwen3.7 Plus` / `Qwen3.6 Plus` for multi-file reasoning and synthesis.
- `Qwen3.7 Max`, `GLM-5.1`, `GLM-5.2`, or `Kimi K2.7 Code` for genuinely hard cases:
  - subtle off-by-one bugs
  - cross-file causal chains
  - repeated failed attempts
  - architecture-level ambiguity
  - high-regression-risk changes

## 3. OpenCode Output Rules

- Require short checkpoints only:
  - `[Progress]`
  - `[Finding]`
  - `[Decision]`
- Keep each checkpoint to 1 to 2 sentences.
- Do not request detailed chain-of-thought.
- Prefer one focused question or one focused task per OpenCode run.
- Cap output aggressively when a command could be noisy.
- Keep full logs local unless a summary is enough for the main session.

## 4. Token-Saving Rules

- Keep stable instructions at the top of prompts so repeated prefixes can benefit from caching.
- Put changing task details at the end of the prompt.
- Ask for less output by default.
- Use `gpt-5.5` surgically: it is valuable, but expensive.
- Use strong models only when the reasoning quality materially changes the result.
- Treat repeated restatement as waste unless it changes the decision.

## 5. Efficiency Rules For Future Sessions

- Start with discovery on a free model.
- Read the result and decide if it is sufficient.
- Escalate only once if the answer is weak, incomplete, or inconsistent.
- Verify with browser/tests after the likely fix or conclusion is found.
- Return to the main session with a concise summary, not the full transcript.
- Avoid duplicating the same analysis in multiple places.

## 6. Budget Guardrails

- Treat the 5-hour limit as the main short-term cap.
- Keep premium usage as reserve capacity.
- Do not spend premium tokens on work that a free model can already do well.
- Reuse summaries instead of rerunning the same reasoning.
- Use the model ladder intentionally rather than defaulting to the most capable model.

## 7. Verification And Testing

- Use browser testing for UI behavior.
- Use unit tests for pure logic and index math.
- Use both when the bug touches user interaction and ordering.
- Treat browser evidence as the final arbiter for drag/drop or visual placement bugs.
- If a fix changes placement or ordering logic, test both upward and downward movement.
- If a fix touches selection or drag handling, check nearby interactions for regressions.

## 8. Assumptions

- The human will follow the best-practice workflow, so this guide focuses on how the agent
  should orchestrate efficiently.
- Balanced optimization is preferred over cost-only optimization.
- Free models are the default starting point.
- `gpt-5.5` is valuable, but only when its stronger reasoning changes the outcome.
