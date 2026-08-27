import { test, expect } from "@playwright/test";

// State diagram title: pointer cursor + double-click-to-edit via the shared
// ClassTextEditor. Guards the statediagramTitleText hit-target work — the title
// must show a pointer cursor (text + padded hit rect) and Enter must commit.
const SEED_CODE = `---
title: Diagram Title
---
stateDiagram-v2
    [*] --> Idle
    Idle --> Running`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "State Title", type: "stateDiagram", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openStateEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
  await page.waitForTimeout(2500);
  return page.locator("svg[id^='mermaid-svg']");
}

function titleTextSvg(page: import("@playwright/test").Page) {
  return page.locator("svg[id^='mermaid-svg']").locator("text.statediagramTitleText").first();
}

async function canvasDoubleClick(
  page: import("@playwright/test").Page,
  el: import("@playwright/test").Locator,
) {
  const box = await el.boundingBox();
  if (!box) throw new Error("Target element has no bounding box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test("canvas shows the state title with a pointer cursor and a padded hit rect", async ({
  page,
}) => {
  const svg = await openStateEditor(page);
  const title = titleTextSvg(page);
  await expect(title).toHaveText("Diagram Title", { timeout: 15000 });
  await expect(svg.locator("rect[data-title-hit-target]")).toHaveCount(1);

  const cursor = await title.evaluate((el) => window.getComputedStyle(el).cursor);
  expect(cursor).toBe("pointer");
});

test("double-clicking the title opens the inline editor and Enter commits", async ({ page }) => {
  await openStateEditor(page);
  const title = titleTextSvg(page);

  await canvasDoubleClick(page, title);
  const editor = page.locator("[data-class-text-editor] textarea");
  await expect(editor).toBeVisible({ timeout: 10000 });
  await expect(editor).toHaveValue("Diagram Title");

  await editor.fill("Renamed Machine");
  await editor.press("Enter");
  await expect(editor).toHaveCount(0, { timeout: 10000 });
  await expect(titleTextSvg(page)).toHaveText("Renamed Machine", { timeout: 15000 });
});

test("double-clicking the title's padding also opens the editor", async ({ page }) => {
  await openStateEditor(page);
  const title = titleTextSvg(page);
  const box = await title.boundingBox();
  if (!box) throw new Error("Title element has no bounding box");

  // Click in the hit-rect padding just left of the glyphs (no glyph pixels there).
  await page.mouse.click(box.x - 8, box.y + box.height / 2);
  await page.waitForTimeout(120);
  await page.mouse.click(box.x - 8, box.y + box.height / 2);
  const editor = page.locator("[data-class-text-editor] textarea");
  await expect(editor).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("Escape");
});
