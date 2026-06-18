# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flowchart-edge-label.spec.ts >> Flowchart edge label editing (Issue #69) >> edge label text is rendered in SVG
- Location: e2e/flowchart-edge-label.spec.ts:56:7

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 1
Received:    0
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - button [ref=e5] [cursor=pointer]:
          - img
        - link "LiveMaid logo" [ref=e6] [cursor=pointer]:
          - /url: /
          - img "LiveMaid logo" [ref=e7]
        - generic [ref=e13]: LiveMaid
        - navigation "breadcrumb" [ref=e14]:
          - list [ref=e15]:
            - listitem [ref=e16]:
              - link "Workspace" [ref=e17] [cursor=pointer]:
                - /url: /
            - listitem [ref=e18]:
              - img [ref=e19]
            - listitem [ref=e21]:
              - generic [ref=e22]:
                - link "New Diagram" [disabled] [ref=e23] [cursor=pointer]
                - button "Rename diagram" [ref=e24] [cursor=pointer]:
                  - img [ref=e25]
      - generic [ref=e28]:
        - button "Export diagram" [ref=e29] [cursor=pointer]:
          - img [ref=e30]
          - generic [ref=e33]: Export
        - button "Open version history" [ref=e34] [cursor=pointer]:
          - img [ref=e35]
          - generic [ref=e39]: History
        - button "Open comments" [ref=e40] [cursor=pointer]:
          - img [ref=e41]
          - generic [ref=e43]: Comments
        - generic [ref=e44]:
          - img [ref=e45]
          - text: Saved
    - generic [ref=e48]:
      - generic [ref=e50]:
        - generic [ref=e52]: Mermaid Code
        - generic [ref=e53]:
          - code [ref=e57]:
            - generic [ref=e58]:
              - textbox "Editor content" [active]
              - textbox [ref=e59]
              - generic [ref=e61]:
                - generic [ref=e62]:
                  - generic [ref=e63] [cursor=pointer]: 
                  - generic [ref=e64]: "1"
                - generic [ref=e67]: "2"
              - generic [ref=e75]:
                - generic [ref=e77]: graph TD
                - generic [ref=e79]: "[StProcess| B[End]"
          - generic [ref=e82]:
            - generic [ref=e83]: Syntax Error
            - text: "Parse error on line 2: graph TD [StProcess| B[End] ----------^ Expecting 'SEMI', 'NEWLINE', 'SPACE', 'EOF', 'subgraph', 'end', 'acc_title', 'acc_descr', 'acc_descr_multiline_value', 'AMP', 'COLON', 'STYLE', 'LINKSTYLE', 'CLASSDEF', 'CLASS', 'CLICK', 'DOWN', 'DEFAULT', 'NUM', 'COMMA', 'NODE_STRING', 'BRKT', 'MINUS', 'MULT', 'UNICODE_TEXT', 'direction_tb', 'direction_bt', 'direction_rl', 'direction_lr', 'direction_td', got 'SQS'"
      - separator [ref=e84]
      - generic [ref=e86]:
        - generic [ref=e88]:
          - button "Collapse code section" [ref=e89] [cursor=pointer]:
            - img
          - button "Undo" [ref=e91] [cursor=pointer]:
            - img
          - button "Redo" [ref=e92] [cursor=pointer]:
            - img
          - button [ref=e94] [cursor=pointer]
          - button "Enter comment mode" [ref=e96] [cursor=pointer]:
            - img
          - button [ref=e97] [cursor=pointer]:
            - img
          - button "Direction" [ref=e99] [cursor=pointer]:
            - img
            - generic [ref=e100]: Direction
          - generic "Auto Layout is locked" [ref=e102]:
            - generic [ref=e103]:
              - img [ref=e104]
              - generic [ref=e108]: Auto layout
          - 'button "Curve: Orthogonal" [ref=e112] [cursor=pointer]':
            - img
            - generic [ref=e113]: "Curve:"
            - generic [ref=e114]: Orthogonal
          - generic [ref=e116]:
            - button "Shape" [ref=e117] [cursor=pointer]:
              - img
              - generic [ref=e118]: Shape
            - button "Text" [ref=e119] [cursor=pointer]:
              - img
              - generic [ref=e120]: Text
            - button "Subgraph" [ref=e121] [cursor=pointer]:
              - img
              - generic [ref=e122]: Subgraph
        - generic [ref=e123]:
          - generic [ref=e124]:
            - button [ref=e125] [cursor=pointer]:
              - img
            - button "1:1" [ref=e127] [cursor=pointer]:
              - generic [ref=e128]: 1:1
            - button [ref=e130] [cursor=pointer]:
              - img
            - button "Lock diagram" [ref=e132] [cursor=pointer]:
              - img
          - document [ref=e138]:
            - generic [ref=e144] [cursor=pointer]:
              - generic:
                - generic:
                  - generic:
                    - paragraph: Aart
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e150] [cursor=pointer]:
    - img [ref=e151]
  - alert [ref=e154]
  - generic [ref=e155]:
    - alert
    - alert
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | test.describe("Dashboard and diagram creation", () => {
  4   |   test("dashboard loads and shows create options", async ({ page }) => {
  5   |     await page.goto("/");
  6   |     await page.waitForLoadState("networkidle");
  7   | 
  8   |     // Expect the page to have loaded with a title or heading
  9   |     await expect(page.locator("h1, h2, header").first()).toBeVisible({ timeout: 10000 });
  10  |   });
  11  | });
  12  | 
  13  | test.describe("Flowchart edge label editing (Issue #69)", () => {
  14  |   test("flowchart renders with edge labels in SVG", async ({ page }) => {
  15  |     await page.goto("/");
  16  |     await page.waitForLoadState("networkidle");
  17  | 
  18  |     // Navigate to create a flowchart (look for flowchart button/option)
  19  |     const flowchartBtn = page.getByRole("link", { name: /flowchart|graph/i }).first();
  20  |     const flowchartButton = page.getByRole("button", { name: /flowchart|graph/i }).first();
  21  | 
  22  |     if (await flowchartBtn.isVisible().catch(() => false)) {
  23  |       await flowchartBtn.click();
  24  |     } else if (await flowchartButton.isVisible().catch(() => false)) {
  25  |       await flowchartButton.click();
  26  |     }
  27  | 
  28  |     await page.waitForTimeout(2000);
  29  | 
  30  |     // Check if we're on an editor page
  31  |     const isEditor = page.url().includes("/editor/");
  32  | 
  33  |     if (isEditor) {
  34  |       // Look for the code editor (Monaco) and set flowchart code
  35  |       const monacoEditor = page.locator(".monaco-editor").first();
  36  |       if (await monacoEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
  37  |         // Click in the Monaco editor area
  38  |         await monacoEditor.click();
  39  |         await page.waitForTimeout(500);
  40  | 
  41  |         // Select all and type new code
  42  |         await page.keyboard.press("Meta+a");
  43  |         await page.waitForTimeout(200);
  44  |         await page.keyboard.type(`graph TD
  45  |     A[Start] -->|Process Data| B[End]
  46  |     B -->|Complete| C[Done]`);
  47  |         await page.waitForTimeout(3000);
  48  | 
  49  |         // Verify the diagram rendered - look for SVG elements
  50  |         const svg = page.locator("svg.mermaid, svg").first();
  51  |         await expect(svg).toBeVisible({ timeout: 10000 });
  52  |       }
  53  |     }
  54  |   });
  55  | 
  56  |   test("edge label text is rendered in SVG", async ({ page }) => {
  57  |     await page.goto("/");
  58  |     await page.waitForLoadState("networkidle");
  59  | 
  60  |     // Navigate to editor with a flowchart
  61  |     const createBtn = page.getByRole("button", { name: /new|create/i }).first();
  62  |     if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  63  |       await createBtn.click();
  64  |       await page.waitForTimeout(1000);
  65  |     }
  66  | 
  67  |     // Look for flowchart option
  68  |     const flowOption = page.getByText(/flowchart|graph/i).first();
  69  |     if (await flowOption.isVisible({ timeout: 3000 }).catch(() => false)) {
  70  |       await flowOption.click();
  71  |     }
  72  | 
  73  |     await page.waitForTimeout(2000);
  74  | 
  75  |     // If we have a Monaco editor, we can verify edge label rendering
  76  |     const monaco = page.locator(".monaco-editor").first();
  77  |     if (await monaco.isVisible({ timeout: 5000 }).catch(() => false)) {
  78  |       await monaco.click();
  79  |       await page.waitForTimeout(200);
  80  |       await page.keyboard.press("Meta+a");
  81  |       await page.waitForTimeout(100);
  82  |       await page.keyboard.type(`graph TD
  83  |     A[Start] -->|Process| B[End]`);
  84  |       await page.waitForTimeout(3000);
  85  | 
  86  |       // Check for SVG edge label content
  87  |       const mermaidSvg = page.locator("svg.mermaid, svg").first();
  88  |       await expect(mermaidSvg).toBeVisible({ timeout: 10000 });
  89  | 
  90  |       // The edge label "Process" should be rendered somewhere in the SVG
  91  |       const labelText = mermaidSvg
  92  |         .locator("text, .edgeLabel, .label")
  93  |         .filter({ hasText: /Process/ });
  94  |       const labelCount = await labelText.count();
> 95  |       expect(labelCount).toBeGreaterThanOrEqual(1);
      |                          ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  96  |     }
  97  |   });
  98  | });
  99  | 
  100 | test.describe("Sequence diagram message endpoints (Issue #60)", () => {
  101 |   test("sequence diagram renders with participants and messages", async ({ page }) => {
  102 |     await page.goto("/");
  103 |     await page.waitForLoadState("networkidle");
  104 | 
  105 |     // Try to create a sequence diagram
  106 |     const seqLink = page.getByRole("link", { name: /sequence/i }).first();
  107 |     const seqBtn = page.getByRole("button", { name: /sequence/i }).first();
  108 | 
  109 |     if (await seqLink.isVisible({ timeout: 3000 }).catch(() => false)) {
  110 |       await seqLink.click();
  111 |     } else if (await seqBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  112 |       await seqBtn.click();
  113 |     }
  114 | 
  115 |     await page.waitForTimeout(2000);
  116 | 
  117 |     const monaco = page.locator(".monaco-editor").first();
  118 |     if (await monaco.isVisible({ timeout: 5000 }).catch(() => false)) {
  119 |       await monaco.click();
  120 |       await page.waitForTimeout(200);
  121 |       await page.keyboard.press("Meta+a");
  122 |       await page.waitForTimeout(100);
  123 |       await page.keyboard.type(`sequenceDiagram
  124 |     participant Alice
  125 |     participant Bob
  126 |     Alice->>Bob: Hello Bob
  127 |     Bob-->>Alice: Hi Alice`);
  128 |       await page.waitForTimeout(3000);
  129 | 
  130 |       // Verify SVG renders with message text
  131 |       const mermaidSvg = page.locator("svg.mermaid, svg").first();
  132 |       await expect(mermaidSvg).toBeVisible({ timeout: 10000 });
  133 |     }
  134 |   });
  135 | });
  136 | 
  137 | test.describe("Inline editing across diagram types (Issue #59)", () => {
  138 |   test("node label inline editing in flowchart", async ({ page }) => {
  139 |     await page.goto("/");
  140 |     await page.waitForLoadState("networkidle");
  141 | 
  142 |     // Try to get to editor
  143 |     const createLink = page.getByRole("link", { name: /flowchart|new/i }).first();
  144 |     const createBtn = page.getByRole("button", { name: /flowchart|new|create/i }).first();
  145 | 
  146 |     if (await createLink.isVisible({ timeout: 3000 }).catch(() => false)) {
  147 |       await createLink.click();
  148 |     } else if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  149 |       await createBtn.click();
  150 |     }
  151 | 
  152 |     await page.waitForTimeout(2000);
  153 | 
  154 |     const monaco = page.locator(".monaco-editor").first();
  155 |     if (await monaco.isVisible({ timeout: 5000 }).catch(() => false)) {
  156 |       // Set a basic flowchart
  157 |       await monaco.click();
  158 |       await page.waitForTimeout(200);
  159 |       await page.keyboard.press("Meta+a");
  160 |       await page.waitForTimeout(100);
  161 |       await page.keyboard.type(`graph TD
  162 |     A[Node A] --> B[Node B]`);
  163 |       await page.waitForTimeout(3000);
  164 | 
  165 |       // Verify nodes are rendered
  166 |       const svg = page.locator("svg.mermaid, svg").first();
  167 |       await expect(svg).toBeVisible({ timeout: 10000 });
  168 | 
  169 |       // Check that node text is visible
  170 |       const nodeText = svg.locator("text, .nodeLabel, .label").filter({ hasText: /Node A|Node B/ });
  171 |       const count = await nodeText.count();
  172 |       expect(count).toBeGreaterThanOrEqual(1);
  173 |     }
  174 |   });
  175 | });
  176 | 
```