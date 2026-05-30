<!-- BEGIN:livemaid-architecture-rules -->
# Architecture and Feature Truths

Before implementing ANY features or modifying the editor logic, you MUST read the following core documentation files in the `reference/` directory:
1. `reference/FEATURES_AND_TRUTHS.md`: Outlines critical implementations like pan/zoom logic, event propagation rules, and two-way sync constraints. Do not proceed with code changes until you understand these constraints. Furthermore, you MUST constantly update this file whenever you implement a new feature or change core architecture logic so that it remains an accurate source of truth.
2. `reference/ARCHITECTURE.md`: High-level system architecture overview.
3. `reference/DESIGN.md`: UI/UX design specifications and aesthetic guidelines.
<!-- END:livemaid-architecture-rules -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mermaid-agent-rules -->
# Mermaid Implementation Rules

Before planning or implementing any Mermaid diagram logic (parsers, rendering, features, themes, etc.) or support for new diagram types, you MUST thoroughly read the relevant Mermaid documentation to understand the official syntax and standard behavior. **Do not guess the syntax.**

1. Navigate to or clone the relevant docs from the official repository: https://github.com/mermaid-js/mermaid/tree/develop/docs
2. Read the specific `.md` files related to the syntax you are trying to implement.
3. Do not perform the implementation until you have thoroughly understood the official syntax.
<!-- END:mermaid-agent-rules -->

<!-- BEGIN:testing-agent-rules -->
# Test-Driven Development Loop & Robust UI Testing

When implementing UI features, rendering logic, or complex client-side changes, you MUST follow this robust operational loop:
1. **Implement**: Write the code and implement the changes.
2. **Execute Interactive Testing (Browser)**: Trigger the `/browser` subagent to perform the exact sequence of actions that a user would do to utilize the newly implemented feature. For example, if you implemented a button click that adds an object, the subagent MUST click the button and verify the object appears.
3. **Capture Comprehensive Visuals**: The subagent must capture a screenshot at every step of the process to provide a complete visual track of the interaction flow.
4. **Return Results**: The subagent must return the results (including all screenshots and DOM observations) to the main agent.
5. **Scale Testing (If Needed)**: You can spawn multiple subagents to test the implementation to different degrees or in parallel if the feature is complex.
6. **Address All Errors**: Every error discovered during testing MUST be addressed. This applies equally to errors caused by the new implementation itself, as well as unrelated errors that were accidentally discovered during the test run.
7. **Iterate**: You are expected to extend your session and perform as many test/fix iterations as necessary. Your ultimate goal is to present a product to the user that is as bug-free as possible. Do not consider the task complete until this is achieved.
<!-- END:testing-agent-rules -->

<!-- BEGIN:git-workflow-rules -->
# Git Workflow & Commit Rules

To ensure we can safely rollback changes if anything goes wrong, you MUST follow this git workflow:

1. **Commit Frequently**: Commit and push changes after EVERY significant logical change or implementation step.
2. **Explicit Permissions**: Only commit and push when the human user explicitly tells you to do so in the *current request*, unless previously agreed upon. 
3. **Conventional Commits**: You MUST follow the Conventional Commits specification for all git commits. The commit message should be structured as follows: `<type>[optional scope]: <description>`
   - `fix`: patches a bug in your codebase.
   - `feat`: introduces a new feature to the codebase.
   - `BREAKING CHANGE`: introduces a breaking API change.
   - Other allowed types: `build:`, `chore:`, `ci:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, etc.
4. **Human Verification Tags**: If a commit is explicitly requested or verified by the human user, you MUST append the `[Human Verified]` tag to the end of the first line (the description) of your Conventional Commit.
   - *Example*: `fix(editor): resolve trackpad panning conflicts [Human Verified]`
   - *Example*: `feat: support sequence diagram syntax [Human Verified]`
5. **No Historical Precedent for Tags**: Do NOT use conversation history as a precedent for applying the `[Human Verified]` tag. The tag must ONLY be applied if the user explicitly authorizes it for the specific, current action.
<!-- END:git-workflow-rules -->
