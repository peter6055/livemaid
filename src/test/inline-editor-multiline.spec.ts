import { test, expect } from "@playwright/test";

// Regression cover for: flowchart inline editor clips earlier lines after
// multiple line breaks (livemaid-project#44).
const SEED_CODE = `graph TD
    A[Start] -->|Edge label| B[End]`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Multiline Probe", type: "flowchart", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openNodeEditor(page: import("@playwright/test").Page) {
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

async function openEdgeEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
  await page.waitForTimeout(2000);
  const svg = page.locator("svg[id^='mermaid-svg']");
  const edgeLabel = svg.locator("g.edgeLabel").filter({ hasText: "Edge label" }).first();
  await edgeLabel.dblclick({ force: true });
  const editor = page.locator('[data-inline-editor][contenteditable="true"]');
  await expect(editor).toBeVisible({ timeout: 10000 });
  return { page, svg, editor };
}

/**
 * True when every line of text inside the editor is fully inside the editor's
 * own bounding box. This catches the reported bug where earlier lines are pushed
 * above the visible area by the centered flex layout + overflow hidden.
 */
async function allLinesVisible(editor: import("@playwright/test").Locator) {
  return editor.evaluate((el) => {
    const editorRect = el.getBoundingClientRect();
    const range = document.createRange();
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) continue;
      if (child.nodeType !== Node.TEXT_NODE && child.nodeType !== Node.ELEMENT_NODE) continue;
      range.selectNodeContents(child);
      const rect = range.getBoundingClientRect();
      if (rect.height === 0) continue;
      if (rect.top < editorRect.top - 1 || rect.bottom > editorRect.bottom + 1) {
        return false;
      }
    }
    return true;
  });
}

test.describe("flowchart inline editor multiline expansion", () => {
  test("node label keeps all ten lines visible", async ({ page }) => {
    const { editor } = await openNodeEditor(page);

    const html = Array.from({ length: 10 }, (_, i) => `<div>Line ${i + 1}</div>`).join("");
    await editor.evaluate((el, htmlValue) => {
      el.innerHTML = htmlValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, html);

    await expect.poll(() => allLinesVisible(editor)).toBe(true);
    await expect(editor).toContainText("Line 1");
    await expect(editor).toContainText("Line 10");

    const overflowY = await editor.evaluate((el) => window.getComputedStyle(el).overflowY);
    expect(overflowY).toBe("auto");
  });

  test("edge label keeps all ten lines visible", async ({ page }) => {
    const { editor } = await openEdgeEditor(page);

    const html = Array.from({ length: 10 }, (_, i) => `<div>Edge ${i + 1}</div>`).join("");
    await editor.evaluate((el, htmlValue) => {
      el.innerHTML = htmlValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, html);

    await expect.poll(() => allLinesVisible(editor)).toBe(true);
    await expect(editor).toContainText("Edge 1");
    await expect(editor).toContainText("Edge 10");

    const overflowY = await editor.evaluate((el) => window.getComputedStyle(el).overflowY);
    expect(overflowY).toBe("auto");
  });

  test("committing a multiline node label writes line breaks back to source", async ({ page }) => {
    const { svg, editor } = await openNodeEditor(page);

    const html = Array.from({ length: 6 }, (_, i) => `<div>Line ${i + 1}</div>`).join("");
    await editor.evaluate((el, htmlValue) => {
      el.innerHTML = htmlValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, html);

    await page.keyboard.press("Control+Enter");
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toHaveCount(0);

    const node = svg.locator("g.node").filter({ hasText: "Line 1" }).first();
    await expect(node).toContainText("Line 6");
  });

  test("canceling a multiline edge edit leaves the source unchanged", async ({ page }) => {
    const { svg, editor } = await openEdgeEditor(page);

    const html = Array.from({ length: 6 }, (_, i) => `<div>New ${i + 1}</div>`).join("");
    await editor.evaluate((el, htmlValue) => {
      el.innerHTML = htmlValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, html);

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toHaveCount(0);

    const edgeLabel = svg.locator("g.edgeLabel").filter({ hasText: "Edge label" }).first();
    await expect(edgeLabel).toBeVisible();
  });
});
