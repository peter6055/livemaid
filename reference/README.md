# Mermaid Syntax Documentation Reference

For future agents and developers:

When you need to understand how Mermaid syntax works in order to implement or plan support for new diagram types (e.g., Sequence Diagrams, Class Diagrams, Entity Relationship diagrams) in LiveMaid, **do not guess the syntax.**

Please refer directly to the official Mermaid documentation repository:

**URL:** [https://github.com/mermaid-js/mermaid/tree/develop/docs](https://github.com/mermaid-js/mermaid/tree/develop/docs)

### Instructions for Agents:
1. When a user requests support for a new diagram type, navigate to or clone the relevant docs from the repository linked above.
2. Read the specific `.md` files related to the syntax.
3. Use that exact specification to plan how `parseMermaidToReactFlow` and `serializeReactFlowToMermaid` should be updated.
4. Do not perform the implementation until you have thoroughly understood the official syntax.
