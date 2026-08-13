import { test, expect } from "@playwright/test";

// Timeline title: ER-style title toggle + click-to-edit, syncing with Mermaid source.
const SEED_CODE = `timeline
    title Product Milestones
    section Phase 1
    2026 Q1 : Research
    2026 Q2 : Build
    section Phase 2
    2026 Q3 : Launch`;

const SEED_CODE_NO_TITLE = `timeline
    section Phase 1
    2026 Q1 : Research
    2026 Q2 : Build`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Timeline Title", type: "timeline", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openTimelineEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
  await page.waitForTimeout(2500);
  return page.locator("svg[id^='mermaid-svg']");
}

function titleToggle(page: import("@playwright/test").Page) {
  return page.locator('button[aria-label="Toggle diagram title"]');
}

function titleTextSvg(svg: import("@playwright/test").Locator) {
  return svg.locator("text.timelineDiagramTitleText");
}

function monaco(page: import("@playwright/test").Page) {
  return page.locator(".monaco-editor").first();
}

test.describe("timeline title toggle", () => {
  test("renders the title pill-switch toggle with the title on", async ({ page }) => {
    await openTimelineEditor(page);
    const toggle = titleToggle(page);
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("canvas shows the title with a pointer cursor", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    const title = titleTextSvg(svg);
    await expect(title).toBeVisible({ timeout: 15000 });
    await expect(title).toHaveText("Product Milestones");
    const cursor = await title.evaluate((el) => window.getComputedStyle(el).cursor);
    expect(cursor).toBe("pointer");
  });

  test("canvas title re-renders when the Mermaid title in source changes", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    const title = titleTextSvg(svg);
    await expect(title).toBeVisible({ timeout: 15000 });
    await expect(title).toHaveText("Product Milestones");

    // Change the title in the Mermaid source editor.
    const editor = monaco(page);
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText(
      "timeline\n    title Renamed Via Source\n    2026 Q1 : Research\n    2026 Q2 : Build\n    2026 Q3 : Launch",
    );
    await page.waitForTimeout(3000);
    await expect(title).toHaveText("Renamed Via Source", { timeout: 15000 });
  });

  test("toggling the title off removes it from source and canvas", async ({ page }) => {
    await openTimelineEditor(page);
    const toggle = titleToggle(page);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // The confirm is an in-app AlertDialog (not window.confirm).
    const removeTitle = page.getByRole("button", { name: "Remove title" });
    await toggle.click();
    await expect(removeTitle).toBeVisible({ timeout: 10000 });
    await removeTitle.click();
    await page.waitForTimeout(1500);

    // Toggle is now off.
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    // Canvas title is gone.
    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(titleTextSvg(svg)).toHaveCount(0);
  });

  test("cancelling the confirmation keeps the title on", async ({ page }) => {
    await openTimelineEditor(page);
    const toggle = titleToggle(page);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // The confirm is an in-app AlertDialog (not window.confirm).
    const cancel = page.getByRole("button", { name: "Cancel" });
    await toggle.click();
    await expect(cancel).toBeVisible({ timeout: 10000 });
    await cancel.click();
    await page.waitForTimeout(1000);

    // Title stays.
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(titleTextSvg(svg)).toHaveText("Product Milestones");
  });

  test("toggling the title on for a title-less timeline inserts a default title", async ({
    page,
    request,
  }) => {
    // Replace the seeded diagram with a title-less one.
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
    const res = await request.post("/api/diagrams", {
      data: { name: "Timeline Title", type: "timeline", code: SEED_CODE_NO_TITLE },
    });
    DIAGRAM_ID = (await res.json()).id;

    await openTimelineEditor(page);
    const toggle = titleToggle(page);
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await page.waitForTimeout(1500);

    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(titleTextSvg(svg)).toHaveText("Diagram Title", { timeout: 15000 });
  });
});

test.describe("timeline title click-to-edit", () => {
  test("double-clicking the canvas title opens the inline editor and commits on Enter", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    const title = titleTextSvg(svg);
    await expect(title).toBeVisible({ timeout: 15000 });

    const box = await title.boundingBox();
    if (!box) throw new Error("Title element has no bounding box");

    // Simulate a double-click using the same timing the app uses.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);

    const textEditor = page.locator("[data-class-text-editor] textarea");
    await expect(textEditor).toBeVisible({ timeout: 10000 });
    await textEditor.fill("New Timeline Title");
    await textEditor.press("Enter");
    await page.waitForTimeout(2000);

    // Canvas updated.
    await expect(title).toHaveText("New Timeline Title", { timeout: 15000 });
  });

  test("Escape cancels the inline title edit and preserves the previous title", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    const title = titleTextSvg(svg);
    await expect(title).toBeVisible({ timeout: 15000 });

    const box = await title.boundingBox();
    if (!box) throw new Error("Title element has no bounding box");

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);

    const textEditor = page.locator("[data-class-text-editor] textarea");
    await expect(textEditor).toBeVisible({ timeout: 10000 });
    await textEditor.fill("Discarded Title");
    await textEditor.press("Escape");
    await page.waitForTimeout(1000);

    // Canvas preserved.
    await expect(title).toHaveText("Product Milestones", { timeout: 15000 });
  });

  test("clearing the editor commits by removing the title", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    const title = titleTextSvg(svg);
    await expect(title).toBeVisible({ timeout: 15000 });

    const box = await title.boundingBox();
    if (!box) throw new Error("Title element has no bounding box");

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);

    const textEditor = page.locator("[data-class-text-editor] textarea");
    await expect(textEditor).toBeVisible({ timeout: 10000 });
    await textEditor.fill("");
    await textEditor.press("Enter");
    await page.waitForTimeout(2000);

    const toggle = titleToggle(page);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(titleTextSvg(svg)).toHaveCount(0);
  });

  test("title edit is a single undo step", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    const title = titleTextSvg(svg);
    await expect(title).toBeVisible({ timeout: 15000 });

    const box = await title.boundingBox();
    if (!box) throw new Error("Title element has no bounding box");

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);

    const textEditor = page.locator("[data-class-text-editor] textarea");
    await expect(textEditor).toBeVisible({ timeout: 10000 });
    await textEditor.fill("Undo Me");
    await textEditor.press("Enter");
    await page.waitForTimeout(2000);
    await expect(title).toHaveText("Undo Me", { timeout: 15000 });

    // Undo via keyboard shortcut (focus Monaco first).
    await monaco(page).click();
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(2000);

    await expect(title).toHaveText("Product Milestones", { timeout: 15000 });
  });
});
