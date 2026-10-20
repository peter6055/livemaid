import { test, expect, type Page } from "@playwright/test";

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

test.describe("Flowchart + button shape picker (issue #33)", () => {
  test("clicking + opens shape picker without creating a node", async ({ page, request }) => {
    const res = await request.post("/api/diagrams", {
      data: {
        name: "Plus Shape Picker Open",
        type: "flowchart",
        code: `flowchart TD
    A[Start] --> B[End]`,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      // Select node A
      const nodeA = page.locator("g.node", { hasText: /Start/ }).first();
      await expect(nodeA).toBeVisible({ timeout: 10000 });
      await nodeA.click();
      await page.waitForTimeout(300);

      // Click the purple + button attached to the selection
      const plusButton = page
        .locator("button[title='Drag to Connect or Click to Add Node']")
        .first();
      await expect(plusButton).toBeVisible({ timeout: 10000 });
      await plusButton.click();
      await page.waitForTimeout(300);

      // Shape picker should appear; no New Node should exist yet
      const picker = page.locator("[data-flowchart-shape-picker]");
      await expect(picker).toBeVisible({ timeout: 10000 });
      await expect(page.locator("svg[id^='mermaid-svg']", { hasText: /New Node/ })).toHaveCount(0);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("selecting a shape from the picker creates exactly one node of that type", async ({
    page,
    request,
  }) => {
    const res = await request.post("/api/diagrams", {
      data: {
        name: "Plus Shape Picker Select",
        type: "flowchart",
        code: `flowchart TD
    A[Start] --> B[End]`,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      const nodeA = page.locator("g.node", { hasText: /Start/ }).first();
      await expect(nodeA).toBeVisible({ timeout: 10000 });
      await nodeA.click();
      await page.waitForTimeout(300);

      const plusButton = page
        .locator("button[title='Drag to Connect or Click to Add Node']")
        .first();
      await expect(plusButton).toBeVisible({ timeout: 10000 });
      await plusButton.click();
      await page.waitForTimeout(300);

      const picker = page.locator("[data-flowchart-shape-picker]");
      await expect(picker).toBeVisible({ timeout: 10000 });

      // Select the circle shape (title text comes from ShapeOption.l)
      const circleButton = picker.locator("button[title='Circle']").first();
      await expect(circleButton).toBeVisible({ timeout: 10000 });
      await circleButton.click();
      await page.waitForTimeout(500);

      // Picker closes and exactly one New Node is added
      await expect(picker).toHaveCount(0);
      const newNode = page.locator("svg[id^='mermaid-svg'] g.node", { hasText: /New Node/ });
      await expect(newNode).toHaveCount(1);

      // Verify code contains the new node with circle shape syntax
      const code = await getEditorValue(page);
      expect(code).toContain("((New Node))");
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("cancelling the picker creates no node", async ({ page, request }) => {
    const res = await request.post("/api/diagrams", {
      data: {
        name: "Plus Shape Picker Cancel",
        type: "flowchart",
        code: `flowchart TD
    A[Start] --> B[End]`,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      const nodeA = page.locator("g.node", { hasText: /Start/ }).first();
      await expect(nodeA).toBeVisible({ timeout: 10000 });
      await nodeA.click();
      await page.waitForTimeout(300);

      const plusButton = page
        .locator("button[title='Drag to Connect or Click to Add Node']")
        .first();
      await expect(plusButton).toBeVisible({ timeout: 10000 });
      await plusButton.click();
      await page.waitForTimeout(300);

      const picker = page.locator("[data-flowchart-shape-picker]");
      await expect(picker).toBeVisible({ timeout: 10000 });

      await picker
        .locator("button", { hasText: /Cancel/i })
        .first()
        .click();
      await page.waitForTimeout(300);

      await expect(picker).toHaveCount(0);
      await expect(
        page.locator("svg[id^='mermaid-svg'] g.node", { hasText: /New Node/ }),
      ).toHaveCount(0);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});
