<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mermaid-agent-rules -->
# Mermaid Implementation Rules

Before planning or implementing any Mermaid diagram logic (parsers, rendering, features, themes, etc.), you MUST thoroughly read the relevant Mermaid documentation to understand the official syntax and standard behavior. 
You can refer to the documentation instructions left in `reference/README.md`.
Never assume the syntax—always verify with the official specs first.
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

