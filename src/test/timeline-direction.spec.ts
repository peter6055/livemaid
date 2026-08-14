import { test, expect } from "@playwright/test";

// Timeline direction: the global toolbar "Direction" dropdown toggles between
// Horizontal (LR) and Vertical (TD), syncing the Mermaid source and canvas.
const SEED_CODE = `timeline
    title Product Milestones
    section Phase 1
    2026 Q1 : Research
    2026 Q2 : Build
    section Phase 2
    2026 Q3 : Launch`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Timeline Direction", type: "timeline", code: SEED_CODE },
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

function directionButton(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: "Direction" });
}

// Read the Monaco source from the rendered view lines.
async function readSource(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll(".monaco-editor .view-line"));
    return lines
      .map((l) => (l as HTMLElement).innerText ?? "")
      .join("\n");
  });
}

function monaco(page: import("@playwright/test").Page) {
  return page.locator(".monaco-editor").first();
}

test.describe("timeline direction dropdown", () => {
  test("toolbar shows a Direction dropdown instead of a Horizontal/Vertical toggle", async ({
    page,
  }) => {
    await openTimelineEditor(page);
    const trigger = directionButton(page);
    await expect(trigger).toBeVisible({ timeout: 15000 });
    // The primary control label reads "Direction", not the current orientation.
    await expect(page.getByRole("button", { name: "Horizontal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Vertical" })).toHaveCount(0);

    await trigger.click();
    await expect(page.getByRole("menuitem", { name: /Horizontal/ })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("menuitem", { name: /Vertical/ })).toBeVisible();
  });

  test("default timeline is LR and the Horizontal option is marked active", async ({ page }) => {
    await openTimelineEditor(page);
    await directionButton(page).click();

    const horizontal = page.getByRole("menuitem", { name: /Horizontal/ });
    await expect(horizontal).toBeVisible({ timeout: 10000 });
    // Active option carries the indigo check indicator.
    await expect(horizontal.locator("svg.text-indigo-500")).toHaveCount(1);
    const vertical = page.getByRole("menuitem", { name: /Vertical/ });
    // Vertical is not active, so no check icon.
    await expect(vertical.locator("svg.text-indigo-500")).toHaveCount(0);
  });

  test("selecting Vertical changes the Mermaid source to TD and the canvas to vertical layout", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    await directionButton(page).click();
    await page.getByRole("menuitem", { name: /Vertical/ }).click();
    await page.waitForTimeout(2500);

    // Source now carries the TD token.
    const source = await readSource(page);
    expect(source).toMatch(/^\s*timeline\s+TD/m);

    // Canvas: the timeline renders vertically (a node stack). The two phase
    // sections share the same horizontal position, stacked vertically.
    const phase1 = svg.locator("g.timeline-node").filter({ hasText: "Phase 1" }).first();
    const phase2 = svg.locator("g.timeline-node").filter({ hasText: "Phase 2" }).first();
    await expect(phase1).toBeVisible({ timeout: 15000 });
    const box1 = await phase1.boundingBox();
    const box2 = await phase2.boundingBox();
    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    expect(Math.abs(box1!.x - box2!.x)).toBeLessThan(2);
    expect(box2!.y).toBeGreaterThan(box1!.y);
  });

  test("selecting Vertical then Horizontal switches source back to LR", async ({ page }) => {
    await openTimelineEditor(page);
    await directionButton(page).click();
    await page.getByRole("menuitem", { name: /Vertical/ }).click();
    await page.waitForTimeout(1500);

    await directionButton(page).click();
    await page.getByRole("menuitem", { name: /Horizontal/ }).click();
    await page.waitForTimeout(2500);

    const source = await readSource(page);
    expect(source).toMatch(/^\s*timeline\s+LR/m);
  });

  test("direction change participates in undo/redo", async ({ page }) => {
    await openTimelineEditor(page);
    await directionButton(page).click();
    await page.getByRole("menuitem", { name: /Vertical/ }).click();
    await page.waitForTimeout(2000);

    let source = await readSource(page);
    expect(source).toMatch(/^\s*timeline\s+TD/m);

    // Undo reverts to the original source (the seed has no direction token).
    await monaco(page).click();
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(2000);
    source = await readSource(page);
    expect(source).toMatch(/^\s*timeline(\s+title|$)/m);
    expect(source).not.toMatch(/^\s*timeline\s+TD/m);

    // Redo re-applies TD.
    await monaco(page).click();
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.waitForTimeout(2000);
    source = await readSource(page);
    expect(source).toMatch(/^\s*timeline\s+TD/m);
  });
});