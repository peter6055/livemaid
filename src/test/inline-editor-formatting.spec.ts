import { test, expect } from "@playwright/test";

// PR: WYSIWYG inline editor with formatting toolbar (bold/italic/alignment).
// Each test seeds a fresh flowchart so edits never leak between tests.
const SEED_CODE = `graph TD
    A[Start] -->|Process| B[End]`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Formatting Probe", type: "flowchart", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
  await page.waitForTimeout(2000);
  const svg = page.locator("svg[id^='mermaid-svg']");
  const node = svg.locator("g.node").filter({ hasText: "Start" }).first();
  await node.dblclick({ force: true });
  const editor = page.locator('[data-inline-editor][contenteditable="true"]');
  await expect(editor).toBeVisible({ timeout: 10000 });
  return { page, svg, editor };
}

test.describe("inline editor formatting toolbar", () => {
  test("double-clicking a node opens the editor with all five controls", async ({ page }) => {
    const { editor } = await openEditor(page);

    const toolbar = page.locator("[data-inline-toolbar]");
    await expect(toolbar.first()).toBeVisible();
    for (const title of [
      "Bold (Ctrl+B)",
      "Italic (Ctrl+I)",
      "Align Left",
      "Align Center",
      "Align Right",
    ]) {
      await expect(toolbar.locator(`button[title="${title}"]`).first()).toBeVisible();
    }
    await expect(editor).toHaveText("Start");
  });

  test("Bold button wraps the label and survives save", async ({ page }) => {
    const { svg, editor } = await openEditor(page);

    await page.locator('[data-inline-toolbar] button[title="Bold (Ctrl+B)"]').first().click();
    await expect(editor.locator("b", { hasText: "Start" })).toBeVisible();

    // Save and confirm the rich text round-trips into the rendered SVG.
    await page.keyboard.press("Control+Enter");
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toHaveCount(0);
    await expect(svg.locator("b", { hasText: "Start" })).toBeVisible({ timeout: 15000 });
  });

  test("Ctrl+I italic shortcut wraps the selected label", async ({ page }) => {
    const { editor } = await openEditor(page);

    await page.keyboard.press("Control+i");
    await expect(editor.locator("i", { hasText: "Start" })).toBeVisible();

    // Escape cancels without saving: the canvas label stays untouched.
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toHaveCount(0);
  });

  test("Align Center adds an alignment wrapper", async ({ page }) => {
    const { editor } = await openEditor(page);

    await page.locator('[data-inline-toolbar] button[title="Align Center"]').first().click();
    await expect(editor.locator('div[style*="text-align"]')).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toHaveCount(0);
  });

  test("Align Left / Align Right visually move the text, not just wrap it", async ({ page }) => {
    const { editor } = await openEditor(page);

    // Helper: gap between the editor's left edge and the actual text start (viewport coords).
    const textGaps = async () => {
      return page.evaluate(() => {
        const editor = document.querySelector(
          '[data-inline-editor][contenteditable="true"]',
        ) as HTMLElement;
        if (!editor) return { leftGap: -1, rightGap: -1 };
        const wrapper = editor.querySelector('div[style*="text-align"]');
        const textNode = wrapper ?? editor;
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const textRect = range.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        return {
          leftGap: Math.round(textRect.left - editorRect.left),
          rightGap: Math.round(editorRect.right - textRect.right),
        };
      });
    };

    // Default: centered text sits roughly in the middle of the editor.
    const centered = await textGaps();
    expect(centered.leftGap).toBeGreaterThan(2);
    expect(Math.abs(centered.leftGap - centered.rightGap)).toBeLessThanOrEqual(2);

    await page.locator('[data-inline-toolbar] button[title="Align Left"]').first().click();
    const left = await textGaps();
    expect(left.leftGap).toBeLessThanOrEqual(2);

    await page.locator('[data-inline-toolbar] button[title="Align Right"]').first().click();
    const right = await textGaps();
    expect(right.rightGap).toBeLessThanOrEqual(2);

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toHaveCount(0);
  });

  test("empty save closes silently and keeps the label", async ({ page }) => {
    const { svg, editor } = await openEditor(page);

    await editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await expect(editor).toHaveText("");
    await page.keyboard.press("Control+Enter");
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toHaveCount(0);
    await expect(svg.locator("text, p, div, span", { hasText: "Start" }).first()).toBeVisible();
  });
});
