# How to Write a Regression Testing Plan

Regression testing ensures that recent code changes (new features, bug fixes) do not negatively impact existing, working functionality. When planning a feature or epic, a dedicated Regression Testing Plan should be established.

## The Role of Regression Testing in TDD/BDD

While Test-Driven Development (TDD) and Behavior-Driven Development (BDD) are methodologies for creating tests _during_ the development of a feature, Regression Testing is the methodology for ensuring _past_ features continue to work.

In a robust BDD framework, existing BDD scenarios inherently act as automated regression tests. When writing a Regression Testplan, you are identifying which historical scenarios are at highest risk of breaking due to the new implementation.

## Format of a Regression Testplan

A Regression Testplan should be included as a section in your `implementation_plan.md` or Formal Verification Plan. It must outline the subset of existing features that need to be re-tested.

The Regression Testplan should contain the following fields:

- **Target Component:** The existing system or module being tested for regression.
- **Risk Rationale:** Why is this component at risk? (e.g., "The new Sequence Diagram logic modifies the shared `useCanvasInteraction` hook").
- **Regression Scenarios (BDD):** The specific Given/When/Then scenarios from the _original_ feature's testplan that must be re-run.
- **Execution Method:** How the regression will be verified (e.g., Automated Browser Smoke Test, Jest Unit Tests, Manual testing).

### Example Regression Scenario

| Target Component    | Risk Rationale                                                                                           | Regression Scenarios (BDD)                                                                                                                              | Execution Method                   |
| :------------------ | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------- |
| Flowchart Core      | Shared drag-and-drop hook (`useCanvasInteraction.ts`) was heavily modified to support Sequence messages. | **Given** a flowchart with 2 nodes<br>**When** the user drags a line between them<br>**Then** a link should be created without sequence-related errors. | Automated Browser Smoke Test (MCP) |
| Architecture Export | The `LiveMaidEditor` component was updated, potentially affecting the export button state.               | **Given** an existing diagram<br>**When** the user clicks Export to PNG<br>**Then** the file downloads correctly.                                       | Manual Verification                |

## Guidelines for Agents

When an agent is asked to provide a verification plan for a new feature, they MUST include a **Regression Testplan** section that explicitly identifies at least one existing feature that could theoretically be broken by the new code, and provide the BDD scenario to verify it remains intact.
