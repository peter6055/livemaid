import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function seedFlowchart(request: APIRequestContext, code: string) {
  const res = await request.post("/api/diagrams", {
    data: { name: "Delete focus bug (#32)", type: "flowchart", code },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function getEditorValue(page: Page) {
  return page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: { editor: { getModels: () => Array<{ getValue: () => string }> } };
      }
    ).monaco;
    return monaco?.editor.getModels()[0]?.getValue() ?? "";
  });
}

test.describe("Delete selected canvas object (Issue #32)", () => {
  test.setTimeout(60000);

  test("Delete removes a selected node even when Monaco still has focus", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(
      request,
      `graph TD
    A --> B
    B --> C`,
    );

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      // Put cursor in Monaco, away from the line that defines B
      const monaco = page.locator(".monaco-editor").first();
      await monaco.click();
      await page.keyboard.press("Home");

      // Select the B node on the canvas by clicking its shape
      const svg = page.locator("svg[id^='mermaid-svg']");
      const nodeB = svg.locator("g.node").filter({ hasText: "B" }).locator("rect").first();
      await nodeB.click();
      await page.waitForTimeout(200);

      // Press Delete
      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);

      // B should be gone; A and C should remain
      const code = await getEditorValue(page);
      expect(code).not.toContain("B");
      expect(code).toContain("A");
      expect(code).toContain("C");

      // The node should no longer render
      await expect(svg.locator("g.node").filter({ hasText: "B" })).toHaveCount(0);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("Delete removes a selected edge", async ({ page, request }) => {
    const doc = await seedFlowchart(
      request,
      `graph TD
    A --> B`,
    );

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      // Select edge line by clicking its hit-target path
      const svg = page.locator("svg[id^='mermaid-svg']");
      const edgeLine = svg.locator("path[class*='hit-target']").first();
      await edgeLine.click({ force: true });
      await page.waitForTimeout(200);

      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);

      // Edge line removed; source no longer contains A --> B
      const code = await getEditorValue(page);
      expect(code).not.toContain("A --> B");
      expect(code).toContain("A");
      expect(code).toContain("B");
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("Delete edits source normally when no canvas object is selected", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(
      request,
      `graph TD
    A --> B`,
    );

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      // Focus Monaco to clear any incidental canvas selection
      const monaco = page.locator(".monaco-editor").first();
      await monaco.click();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight");

      const before = await getEditorValue(page);
      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);
      const after = await getEditorValue(page);

      // Source should have changed, but both nodes are still present
      expect(after).not.toBe(before);
      expect(after).toContain("A");
      expect(after).toContain("B");
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});
