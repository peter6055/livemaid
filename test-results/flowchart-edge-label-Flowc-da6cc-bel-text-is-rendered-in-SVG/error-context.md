# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flowchart-edge-label.spec.ts >> Flowchart edge label editing (Issue #69) >> edge label text is rendered in SVG
- Location: e2e/flowchart-edge-label.spec.ts:56:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByText(/flowchart|graph/i).first()
    - locator resolved to <span class="truncate">QA Flowchart Edge Labels</span>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div data-open="" aria-hidden="true" role="presentation" data-base-ui-inert="" data-slot="dialog-overlay" class="fixed inset-0 isolate z-50 bg-black/35 dark:bg-black/70 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"></div> from <div id="_r_18_" data-base-ui-portal="" data-slot="dialog-portal">…</div> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div data-open="" aria-hidden="true" role="presentation" data-base-ui-inert="" data-slot="dialog-overlay" class="fixed inset-0 isolate z-50 bg-black/35 dark:bg-black/70 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"></div> from <div id="_r_18_" data-base-ui-portal="" data-slot="dialog-portal">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    54 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div data-open="" aria-hidden="true" role="presentation" data-base-ui-inert="" data-slot="dialog-overlay" class="fixed inset-0 isolate z-50 bg-black/35 dark:bg-black/70 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"></div> from <div id="_r_18_" data-base-ui-portal="" data-slot="dialog-portal">…</div> subtree intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - img [ref=e6]
        - generic [ref=e12]: LiveMaid
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]:
            - img [ref=e16]
            - generic [ref=e19]: Recent
          - generic [ref=e20]:
            - button [ref=e21] [cursor=pointer]:
              - img [ref=e22]
              - generic [ref=e25]: QA Flowchart Edge Labels
            - button [ref=e26] [cursor=pointer]:
              - img [ref=e27]
              - generic [ref=e30]: New Diagram
            - button [ref=e31] [cursor=pointer]:
              - img [ref=e32]
              - generic [ref=e35]: QA Sequence Endpoint Handles
            - button [ref=e36] [cursor=pointer]:
              - img [ref=e37]
              - generic [ref=e40]: Test Sequence Diagram
            - button [ref=e41] [cursor=pointer]:
              - img [ref=e42]
              - generic [ref=e45]: QA Blank Comments
        - generic [ref=e46]:
          - generic [ref=e48]:
            - generic [ref=e49]:
              - img [ref=e50]
              - generic [ref=e52]: Folders
            - button [ref=e53] [cursor=pointer]:
              - img [ref=e54]
          - generic [ref=e56]:
            - generic [ref=e57] [cursor=pointer]:
              - img [ref=e58]
              - generic [ref=e61]: Workspace
            - generic [ref=e63] [cursor=pointer]:
              - img [ref=e64]
              - generic [ref=e66]: My folder
              - button [ref=e68]:
                - img [ref=e69]
      - button [ref=e74] [cursor=pointer]:
        - generic [ref=e75]:
          - img [ref=e76]
          - text: Light mode
    - generic [ref=e85]:
      - generic [ref=e86]:
        - navigation [ref=e87]:
          - button [ref=e88] [cursor=pointer]:
            - img [ref=e89]
            - text: Workspace
        - generic [ref=e92]:
          - heading [level=1] [ref=e93]: Your Diagrams
          - generic [ref=e94]:
            - generic [ref=e95]:
              - generic [ref=e96]:
                - img
                - textbox [ref=e97]:
                  - /placeholder: Search diagrams
              - button [ref=e98] [cursor=pointer]:
                - img
                - text: Last edited
              - generic [ref=e99]:
                - button [pressed] [ref=e100] [cursor=pointer]:
                  - img [ref=e101]
                - button [ref=e106] [cursor=pointer]:
                  - img [ref=e107]
            - generic [ref=e108]:
              - button [ref=e109] [cursor=pointer]:
                - img
                - text: New Folder
              - button [ref=e110] [cursor=pointer]:
                - img
                - text: New Diagram
      - generic [ref=e111]:
        - heading [level=2] [ref=e112]:
          - text: Folders
          - generic [ref=e113]: (1)
        - generic [ref=e115] [cursor=pointer]:
          - button [ref=e117]:
            - img
          - img [ref=e119]
          - generic [ref=e121]:
            - paragraph [ref=e122]: My folder
            - paragraph [ref=e123]: 1 item
      - generic [ref=e124]:
        - heading [level=2] [ref=e125]:
          - text: Diagrams
          - generic [ref=e126]: (50)
        - generic [ref=e127]:
          - generic [ref=e128] [cursor=pointer]:
            - generic [ref=e129]:
              - generic [ref=e130]:
                - generic [ref=e131]: QA Flowchart Edge Labels
                - generic [ref=e132]:
                  - button [ref=e133]:
                    - img
                  - button [ref=e134]:
                    - img
                  - button [ref=e135]:
                    - img
              - generic [ref=e136]:
                - img [ref=e137]
                - generic [ref=e139]: Flowchart
                - generic [ref=e140]:
                  - img [ref=e141]
                  - generic [ref=e146]: 2-way
            - link [ref=e148]:
              - /url: /editor/0FJb4E-RoqL_NU0ONVwWD
              - generic [ref=e150]:
                - generic [ref=e151]: Preview unavailable
                - generic [ref=e152]: Mermaid syntax could not be rendered.
            - generic [ref=e153]:
              - img [ref=e154]
              - text: Edited less than a minute ago
          - generic [ref=e157] [cursor=pointer]:
            - generic [ref=e158]:
              - generic [ref=e159]:
                - generic [ref=e160]: New Diagram
                - generic [ref=e161]:
                  - button [ref=e162]:
                    - img
                  - button [ref=e163]:
                    - img
                  - button [ref=e164]:
                    - img
              - generic [ref=e165]:
                - img [ref=e166]
                - generic [ref=e168]: Flowchart
                - generic [ref=e169]:
                  - img [ref=e170]
                  - generic [ref=e175]: 2-way
            - link [ref=e177]:
              - /url: /editor/Y6RUQfyuNB4TV6yrQC2-S
              - generic [ref=e178]:
                - generic:
                  - document:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - generic:
                              - generic:
                                - generic:
                                  - generic:
                                    - paragraph: Process
                        - generic:
                          - generic:
                            - generic:
                              - generic:
                                - generic:
                                  - generic:
                                    - paragraph: A
                          - generic:
                            - generic:
                              - generic:
                                - generic:
                                  - generic:
                                    - paragraph: End
            - generic [ref=e179]:
              - img [ref=e180]
              - text: Edited less than a minute ago
          - generic [ref=e183] [cursor=pointer]:
            - generic [ref=e184]:
              - generic [ref=e185]:
                - generic [ref=e186]: QA Sequence Endpoint Handles
                - generic [ref=e187]:
                  - button [ref=e188]:
                    - img
                  - button [ref=e189]:
                    - img
                  - button [ref=e190]:
                    - img
              - generic [ref=e191]:
                - img [ref=e192]
                - generic [ref=e194]: Sequence Diagram
                - generic [ref=e195]:
                  - img [ref=e196]
                  - generic [ref=e201]: 2-way
            - link [ref=e203]:
              - /url: /editor/39_y8UEfyD9BGZmlW88EH
              - generic [ref=e204]:
                - generic:
                  - document:
                    - generic:
                      - generic: Bob
                    - generic:
                      - generic: Alice
                    - generic:
                      - generic:
                        - generic: Bob
                    - generic:
                      - generic:
                        - generic: Alice
                    - generic: old message
                    - generic: duplicate
                    - generic: duplicate
                    - generic: responsdvf. ssdjkfhdskjfh jnjjxdsjc xsd
                    - generic: sdfhjsdhfjshd
                    - generic: sdfjksdjfksdj
                    - generic: sdkfjsdfkjkdsf
                    - generic: skfjsdkfjsdk
                    - generic: deoo
                    - generic: sdcsdmkcl
            - generic [ref=e205]:
              - img [ref=e206]
              - text: Edited 3 minutes ago
          - generic [ref=e209] [cursor=pointer]:
            - generic [ref=e210]:
              - generic [ref=e211]:
                - generic [ref=e212]: Test Sequence Diagram
                - generic [ref=e213]:
                  - button [ref=e214]:
                    - img
                  - button [ref=e215]:
                    - img
                  - button [ref=e216]:
                    - img
              - generic [ref=e217]:
                - img [ref=e218]
                - generic [ref=e220]: Sequne Diagram
                - generic [ref=e221]:
                  - img [ref=e222]
                  - generic [ref=e226]: Code Only
            - link [ref=e228]:
              - /url: /editor/test-seq-diagram
              - generic [ref=e230]:
                - generic [ref=e231]: Preview unavailable
                - generic [ref=e232]: Mermaid syntax could not be rendered.
            - generic [ref=e233]:
              - img [ref=e234]
              - text: Edited about 4 hours ago
          - generic [ref=e237] [cursor=pointer]:
            - generic [ref=e238]:
              - generic [ref=e239]:
                - generic [ref=e240]: QA Blank Comments
                - generic [ref=e241]:
                  - button [ref=e242]:
                    - img
                  - button [ref=e243]:
                    - img
                  - button [ref=e244]:
                    - img
              - generic [ref=e245]:
                - img [ref=e246]
                - generic [ref=e248]: Flowchart
                - generic [ref=e249]:
                  - img [ref=e250]
                  - generic [ref=e255]: 2-way
            - link [ref=e257]:
              - /url: /editor/o5tTXu6IrSwtVulh9gkOv
              - generic [ref=e259]:
                - generic [ref=e260]: Preview unavailable
                - generic [ref=e261]: Preview is not available.
            - generic [ref=e262]:
              - img [ref=e263]
              - text: Edited 2 days ago
          - generic [ref=e266] [cursor=pointer]:
            - generic [ref=e267]:
              - generic [ref=e268]:
                - generic [ref=e269]: QA State Comments
                - generic [ref=e270]:
                  - button [ref=e271]:
                    - img
                  - button [ref=e272]:
                    - img
                  - button [ref=e273]:
                    - img
              - generic [ref=e274]:
                - img [ref=e275]
                - generic [ref=e277]: State Diagram
                - generic [ref=e278]:
                  - img [ref=e279]
                  - generic [ref=e284]: 2-way
            - link [ref=e286]:
              - /url: /editor/GTjWOmtZz9Tk0uctGCxdR
              - generic [ref=e287]:
                - generic:
                  - document:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - generic:
                              - generic:
                                - generic:
                                  - generic:
                                    - paragraph: starts
                          - generic:
                            - generic:
                              - generic:
                                - generic:
                                  - generic:
                                    - paragraph: stops
                        - generic:
                          - generic:
                            - generic:
                              - generic:
                                - generic:
                                  - generic:
                                    - paragraph: Still
                          - generic:
                            - generic:
                              - generic:
                                - generic:
                                  - generic:
                                    - paragraph: Moving
            - generic [ref=e288]:
              - img [ref=e289]
              - text: Edited 2 days ago
      - img [ref=e293]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e300] [cursor=pointer]:
    - img [ref=e301]
  - alert [ref=e304]
  - dialog "Create New Folder" [ref=e308]:
    - heading "Create New Folder" [level=2] [ref=e310]
    - textbox "Folder name" [active] [ref=e312]: New Folder
    - generic [ref=e313]:
      - button "Cancel" [ref=e314] [cursor=pointer]
      - button "Create" [ref=e315] [cursor=pointer]
    - button "Close" [ref=e316] [cursor=pointer]:
      - img
      - generic [ref=e317]: Close
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
> 70  |       await flowOption.click();
      |                        ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  95  |       expect(labelCount).toBeGreaterThanOrEqual(1);
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
```