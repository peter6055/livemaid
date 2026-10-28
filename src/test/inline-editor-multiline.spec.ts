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

/**
 * Scroll-top-aware variant of allLinesVisible: pins the editor to
 * scrollTop = 0 and reports whether the FIRST line ("Line 1") sits fully
 * inside the editor's bounding box, together with the measured rects so a
 * failure prints exactly how the line is clipped. With plain
 * justify-content: center, content taller than the maxHeight cap is centred
 * past the scroll origin, and scrollTop = 0 can never reveal those leading
 * lines (livemaid-project#44).
 */
async function firstLineStateAtTop(editor: import("@playwright/test").Locator) {
  return editor.evaluate((el) => {
    el.scrollTop = 0;
    const editorRect = el.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let lineRect: DOMRect | null = null;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const index = (node.textContent ?? "").indexOf("Line 1");
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + "Line 1".length);
      lineRect = range.getBoundingClientRect();
      break;
    }
    const inside =
      !!lineRect &&
      lineRect.height > 0 &&
      lineRect.top >= editorRect.top - 1 &&
      lineRect.bottom <= editorRect.bottom + 1 &&
      lineRect.left >= editorRect.left - 1 &&
      lineRect.right <= editorRect.right + 1;
    return {
      inside,
      overflows: el.scrollHeight > el.clientHeight,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      line: lineRect ? { top: lineRect.top, bottom: lineRect.bottom } : null,
      editor: { top: editorRect.top, bottom: editorRect.bottom },
    };
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

  test("overflowing node label keeps the first line reachable at scrollTop 0", async ({ page }) => {
    const { editor } = await openNodeEditor(page);

    const html = Array.from({ length: 20 }, (_, i) => `<div>Line ${i + 1}</div>`).join("");
    await editor.evaluate((el, htmlValue) => {
      el.innerHTML = htmlValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, html);

    // Only proves something if the content actually exceeds the height cap.
    await expect
      .poll(() => firstLineStateAtTop(editor), { message: "editor must exceed its height cap" })
      .toMatchObject({ overflows: true });

    // scrollTop = 0 must show the first line fully inside the editor box.
    const state = await firstLineStateAtTop(editor);
    expect(state.inside, `first line clipped at scrollTop 0: ${JSON.stringify(state)}`).toBe(true);
    await expect(editor).toContainText("Line 20");
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
