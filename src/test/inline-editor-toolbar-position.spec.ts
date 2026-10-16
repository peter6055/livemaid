import { test, expect } from "@playwright/test";

// Regression cover for: floating formatting toolbar does not reliably stay
// above the inline text editor when the contenteditable editor grows after
// line breaks (livemaid-project#45).
const SEED_CODE = `graph TD
    A[Start] -->|Edge label| B[End]`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Toolbar Probe", type: "flowchart", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openPage(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
  await page.waitForTimeout(2000);
}

async function openNodeEditor(page: import("@playwright/test").Page) {
  await openPage(page);
  const svg = page.locator("svg[id^='mermaid-svg']");
  const node = svg.locator("g.node").filter({ hasText: "Start" }).first();
  await node.dblclick({ force: true });
  const editor = page.locator('[data-inline-editor][contenteditable="true"]');
  const toolbar = page.locator("[data-inline-editor][data-inline-toolbar]");
  await expect(editor).toBeVisible({ timeout: 10000 });
  await expect(toolbar).toBeVisible({ timeout: 10000 });
  return { page, svg, editor, toolbar };
}

async function openEdgeEditor(page: import("@playwright/test").Page) {
  await openPage(page);
  const svg = page.locator("svg[id^='mermaid-svg']");
  const edgeLabel = svg.locator("g.edgeLabel").filter({ hasText: "Edge label" }).first();
  await edgeLabel.dblclick({ force: true });
  const editor = page.locator('[data-inline-editor][contenteditable="true"]');
  const toolbar = page.locator("[data-inline-editor][data-inline-toolbar]");
  await expect(editor).toBeVisible({ timeout: 10000 });
  await expect(toolbar).toBeVisible({ timeout: 10000 });
  return { page, svg, editor, toolbar };
}

async function injectLines(
  editor: import("@playwright/test").Locator,
  prefix: string,
  count: number,
) {
  const html = Array.from({ length: count }, (_, i) => `<div>${prefix} ${i + 1}</div>`).join("");
  await editor.evaluate((el, htmlValue) => {
    el.innerHTML = htmlValue;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, html);
}

/**
 * Returns the vertical clearance between the toolbar's bottom and the editor's
 * top in CSS pixels. Positive means the toolbar is fully above the editor.
 */
async function toolbarClearance(
  toolbar: import("@playwright/test").Locator,
  editor: import("@playwright/test").Locator,
) {
  const toolbarRect = await toolbar.boundingBox();
  const editorRect = await editor.boundingBox();
  if (!toolbarRect || !editorRect) return Number.NEGATIVE_INFINITY;
  return editorRect.y - (toolbarRect.y + toolbarRect.height);
}

test.describe("flowchart inline editor toolbar position", () => {
  test("node label toolbar stays above editor after expanding to ten lines", async ({ page }) => {
    const { editor, toolbar } = await openNodeEditor(page);
    await injectLines(editor, "Line", 10);

    await expect.poll(() => toolbarClearance(toolbar, editor)).toBeGreaterThan(2);
    await expect(editor).toContainText("Line 1");
    await expect(editor).toContainText("Line 10");
  });

  test("edge label toolbar stays above editor after expanding to ten lines", async ({ page }) => {
    const { editor, toolbar } = await openEdgeEditor(page);
    await injectLines(editor, "Edge", 10);

    await expect.poll(() => toolbarClearance(toolbar, editor)).toBeGreaterThan(2);
    await expect(editor).toContainText("Edge 1");
    await expect(editor).toContainText("Edge 10");
  });

  test("node label toolbar tracks above editor after zooming in", async ({ page }) => {
    await openPage(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(500);

    const svg = page.locator("svg[id^='mermaid-svg']");
    const node = svg.locator("g.node").filter({ hasText: "Start" }).first();
    await node.dblclick({ force: true });
    const editor = page.locator('[data-inline-editor][contenteditable="true"]');
    const toolbar = page.locator("[data-inline-editor][data-inline-toolbar]");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    await injectLines(editor, "Line", 8);

    await expect.poll(() => toolbarClearance(toolbar, editor)).toBeGreaterThan(2);
  });

  test("edge label toolbar tracks above editor after zooming in", async ({ page }) => {
    await openPage(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(500);

    const svg = page.locator("svg[id^='mermaid-svg']");
    const edgeLabel = svg.locator("g.edgeLabel").filter({ hasText: "Edge label" }).first();
    await edgeLabel.dblclick({ force: true });
    const editor = page.locator('[data-inline-editor][contenteditable="true"]');
    const toolbar = page.locator("[data-inline-editor][data-inline-toolbar]");
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    await injectLines(editor, "Edge", 8);

    await expect.poll(() => toolbarClearance(toolbar, editor)).toBeGreaterThan(2);
  });
});
