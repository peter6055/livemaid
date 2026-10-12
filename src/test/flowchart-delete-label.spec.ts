import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function seedFlowchart(request: APIRequestContext, code: string) {
  const res = await request.post("/api/diagrams", {
    data: { name: "Delete edge label preservation (#38)", type: "flowchart", code },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function getEditorValue(page: Page): Promise<string> {
  await page.locator(".monaco-editor").first().waitFor({ state: "visible", timeout: 10000 });
  const handle = await page.waitForFunction(
    () => {
      const monaco = (
        window as unknown as {
          monaco?: { editor: { getModels: () => Array<{ getValue: () => string }> } };
        }
      ).monaco;
      const value = monaco?.editor.getModels()[0]?.getValue() ?? "";
      return value || null;
    },
    { timeout: 10000 },
  );
  return handle.jsonValue() as Promise<string>;
}

test.describe("Flowchart edge deletion preserves inline node labels (Issue #38)", () => {
  test.setTimeout(60000);

  test("Deleting edge with bracket inline label keeps the label as a standalone definition", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(
      request,
      `graph TD
    A --> B["Important Label"]`,
    );

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      const svg = page.locator("svg[id^='mermaid-svg']");
      const edgeLine = svg.locator("path[class*='hit-target']").first();
      await edgeLine.click({ force: true });
      await page.waitForTimeout(200);

      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      expect(code).toContain('B["Important Label"]');
      expect(code).not.toContain("A --> B");

      // The node should still render its label, not fall back to bare B
      await expect(svg.locator("g.node").filter({ hasText: "Important Label" })).toHaveCount(1);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("Deleting edge with @{...} inline label keeps the label", async ({ page, request }) => {
    const doc = await seedFlowchart(
      request,
      `graph TD
    A --> B@{ label: "Important Label" }`,
    );

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      const svg = page.locator("svg[id^='mermaid-svg']");
      const edgeLine = svg.locator("path[class*='hit-target']").first();
      await edgeLine.click({ force: true });
      await page.waitForTimeout(200);

      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      expect(code).toContain('B@{ label: "Important Label" }');
      expect(code).not.toContain("A --> B");

      await expect(svg.locator("g.node").filter({ hasText: "Important Label" })).toHaveCount(1);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("Deleting edge with circle shape keeps the full shape definition", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(
      request,
      `graph TD
    A --> B(("Round Node"))`,
    );

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      const svg = page.locator("svg[id^='mermaid-svg']");
      const edgeLine = svg.locator("path[class*='hit-target']").first();
      await edgeLine.click({ force: true });
      await page.waitForTimeout(200);

      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      expect(code).toContain('B(("Round Node"))');
      expect(code).not.toContain("A --> B");

      await expect(svg.locator("g.node").filter({ hasText: "Round Node" })).toHaveCount(1);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});
