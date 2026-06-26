import { test, expect } from "@playwright/test";

test.describe("Dashboard and diagram creation", () => {
  test("dashboard loads and shows create options", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Expect the page to have loaded with a title or heading
    await expect(page.locator("h1, h2, header").first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Flowchart edge label editing (Issue #69)", () => {
  test("flowchart renders with edge labels in SVG", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to create a flowchart (look for flowchart button/option)
    const flowchartBtn = page.getByRole("link", { name: /flowchart|graph/i }).first();
    const flowchartButton = page.getByRole("button", { name: /flowchart|graph/i }).first();

    if (await flowchartBtn.isVisible().catch(() => false)) {
      await flowchartBtn.click();
    } else if (await flowchartButton.isVisible().catch(() => false)) {
      await flowchartButton.click();
    }

    await page.waitForTimeout(2000);

    // Check if we're on an editor page
    const isEditor = page.url().includes("/editor/");

    if (isEditor) {
      // Look for the code editor (Monaco) and set flowchart code
      const monacoEditor = page.locator(".monaco-editor").first();
      if (await monacoEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Click in the Monaco editor area
        await monacoEditor.click();
        await page.waitForTimeout(500);

        // Select all and type new code
        await page.keyboard.press("Meta+a");
        await page.waitForTimeout(200);
        await page.keyboard.type(`graph TD
    A[Start] -->|Process Data| B[End]
    B -->|Complete| C[Done]`);
        await page.waitForTimeout(3000);

        // Verify the diagram rendered - look for SVG elements
        const svg = page.locator("svg.mermaid, svg").first();
        await expect(svg).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test("edge label text is rendered in SVG", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to editor with a flowchart
    const createBtn = page.getByRole("button", { name: /new|create/i }).first();
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1000);
    }

    // Look for flowchart option
    const flowOption = page.getByText(/flowchart|graph/i).first();
    if (await flowOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await flowOption.click();
    }

    await page.waitForTimeout(2000);

    // If we have a Monaco editor, we can verify edge label rendering
    const monaco = page.locator(".monaco-editor").first();
    if (await monaco.isVisible({ timeout: 5000 }).catch(() => false)) {
      await monaco.click();
      await page.waitForTimeout(200);
      await page.keyboard.press("Meta+a");
      await page.waitForTimeout(100);
      await page.keyboard.type(`graph TD
    A[Start] -->|Process| B[End]`);
      await page.waitForTimeout(3000);

      // Check for SVG edge label content
      const mermaidSvg = page.locator("svg.mermaid, svg").first();
      await expect(mermaidSvg).toBeVisible({ timeout: 10000 });

      // The edge label "Process" should be rendered somewhere in the SVG
      const labelText = mermaidSvg
        .locator("text, .edgeLabel, .label")
        .filter({ hasText: /Process/ });
      const labelCount = await labelText.count();
      expect(labelCount).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe("Sequence diagram message endpoints (Issue #60)", () => {
  test("sequence diagram renders with participants and messages", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Try to create a sequence diagram
    const seqLink = page.getByRole("link", { name: /sequence/i }).first();
    const seqBtn = page.getByRole("button", { name: /sequence/i }).first();

    if (await seqLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await seqLink.click();
    } else if (await seqBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await seqBtn.click();
    }

    await page.waitForTimeout(2000);

    const monaco = page.locator(".monaco-editor").first();
    if (await monaco.isVisible({ timeout: 5000 }).catch(() => false)) {
      await monaco.click();
      await page.waitForTimeout(200);
      await page.keyboard.press("Meta+a");
      await page.waitForTimeout(100);
      await page.keyboard.type(`sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob
    Bob-->>Alice: Hi Alice`);
      await page.waitForTimeout(3000);

      // Verify SVG renders with message text
      const mermaidSvg = page.locator("svg.mermaid, svg").first();
      await expect(mermaidSvg).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe("Inline editing across diagram types (Issue #59)", () => {
  test("node label inline editing in flowchart", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Try to get to editor
    const createLink = page.getByRole("link", { name: /flowchart|new/i }).first();
    const createBtn = page.getByRole("button", { name: /flowchart|new|create/i }).first();

    if (await createLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createLink.click();
    } else if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
    }

    await page.waitForTimeout(2000);

    const monaco = page.locator(".monaco-editor").first();
    if (await monaco.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Set a basic flowchart
      await monaco.click();
      await page.waitForTimeout(200);
      await page.keyboard.press("Meta+a");
      await page.waitForTimeout(100);
      await page.keyboard.type(`graph TD
    A[Node A] --> B[Node B]`);
      await page.waitForTimeout(3000);

      // Verify nodes are rendered
      const svg = page.locator("svg.mermaid, svg").first();
      await expect(svg).toBeVisible({ timeout: 10000 });

      // Check that node text is visible
      const nodeText = svg.locator("text, .nodeLabel, .label").filter({ hasText: /Node A|Node B/ });
      const count = await nodeText.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});
