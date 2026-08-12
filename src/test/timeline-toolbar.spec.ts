import { test, expect } from "@playwright/test";

// Timeline two-way editing: node selection shows the timeline toolbar, which can add
// events/periods/sections, rename, delete, and drag-reorder nodes.
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
    data: { name: "Seed Timeline Toolbar", type: "timeline", code: SEED_CODE },
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

function nodeByLabel(svg: import("@playwright/test").Locator, text: string) {
  return svg.locator("g.timeline-node").filter({ hasText: text }).first();
}

function toolbar(page: import("@playwright/test").Page) {
  return page.locator("[data-timeline-node-toolbar]");
}

async function selectNode(page: import("@playwright/test").Page, text: string) {
  const svg = await openTimelineEditor(page);
  const node = nodeByLabel(svg, text);
  await expect(node).toBeVisible({ timeout: 15000 });
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(700);
  await expect(toolbar(page)).toBeVisible({ timeout: 10000 });
  return svg;
}

test.describe("timeline node toolbar", () => {
  test("selecting an event shows the timeline toolbar with add/rename/delete actions", async ({
    page,
  }) => {
    await selectNode(page, "Research");
    await expect(toolbar(page).locator('button[title="Add event"]')).toBeVisible();
    await expect(toolbar(page).locator('button[title="Rename element"]')).toBeVisible();
    await expect(toolbar(page).locator('button[title="Delete element"]')).toBeVisible();
  });

  test("adding an event after the target renders a new event", async ({ page }) => {
    const svg = await selectNode(page, "Research");
    await toolbar(page).locator('button[title="Add event"]').click();
    await toolbar(page).getByText("Insert event after").click();
    await expect(nodeByLabel(svg, "New Event 1")).toBeVisible({ timeout: 15000 });
  });

  test("adding an event before the target renders a new event", async ({ page }) => {
    const svg = await selectNode(page, "Build");
    await toolbar(page).locator('button[title="Add event"]').click();
    await toolbar(page).getByText("Insert event before").click();
    await expect(nodeByLabel(svg, "New Event 1")).toBeVisible({ timeout: 15000 });
  });

  test("adding a period below the selected period renders a new period", async ({ page }) => {
    const svg = await selectNode(page, "2026 Q1");
    await toolbar(page).locator('button[title="Add period"]').click();
    await toolbar(page).getByText("Add period below").click();
    await expect(nodeByLabel(svg, "New Period 1")).toBeVisible({ timeout: 15000 });
  });

  test("adding a section appends a new section block", async ({ page }) => {
    const svg = await selectNode(page, "Phase 1");
    await toolbar(page).locator('button[title="Add section"]').click();
    await expect(nodeByLabel(svg, "New Section 1")).toBeVisible({ timeout: 15000 });
  });

  test("renaming an event via the toolbar updates the canvas label", async ({ page }) => {
    const svg = await selectNode(page, "Research");
    await toolbar(page).locator('button[title="Rename element"]').click();
    await page.waitForTimeout(500);
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await editor.fill("Study");
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(1500);
    await expect(nodeByLabel(svg, "Study")).toBeVisible({ timeout: 15000 });
    await expect(nodeByLabel(svg, "Research")).toHaveCount(0);
  });

  test("deleting a node removes it from the canvas", async ({ page }) => {
    const svg = await selectNode(page, "Research");
    await toolbar(page).locator('button[title="Delete element"]').click();
    await page.waitForTimeout(1500);
    await expect(nodeByLabel(svg, "Research")).toHaveCount(0);
  });

  test("dragging a selected node reorders a period before another period", async ({ page }) => {
    const svg = await selectNode(page, "2026 Q3");
    // All timeline nodes render full-box hit overlays; the selected period's own
    // overlay is the one covering "2026 Q3".
    const source = nodeByLabel(svg, "2026 Q3");
    const target = nodeByLabel(svg, "2026 Q1");
    await expect(target).toBeVisible();
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    // Drag from the center of the period's full-box overlay (sequence-style direct-drag).
    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2,
    );
    await page.mouse.down();
    // Drop at the LEFT edge of the target period to land in the "before" slot.
    await page.mouse.move(targetBox!.x + 5, targetBox!.y + targetBox!.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1500);

    // 2026 Q3 (Launch) should now render BEFORE 2026 Q1 (Research) on the LR axis.
    const q1 = await nodeByLabel(svg, "Research").boundingBox();
    const q3 = await nodeByLabel(svg, "Launch").boundingBox();
    expect(q1).not.toBeNull();
    expect(q3).not.toBeNull();
    expect(q3!.x).toBeLessThan(q1!.x);
  });

  test("click+drag on an unselected node starts reorder without select-first", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    const source = nodeByLabel(svg, "2026 Q3");
    const target = nodeByLabel(svg, "2026 Q1");
    await expect(source).toBeVisible({ timeout: 15000 });
    await expect(target).toBeVisible();
    // Wait for all-node hit overlays (not only the selected-node handle).
    await expect(page.locator("[data-timeline-reorder-handle]")).not.toHaveCount(0, {
      timeout: 10000,
    });

    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + 5, targetBox!.y + targetBox!.height / 2, { steps: 12 });
    await expect(page.locator("[data-timeline-reorder-overlay]")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("[data-timeline-reorder-guide]")).toBeVisible();
    await page.mouse.up();
    await page.waitForTimeout(1500);

    const q1 = await nodeByLabel(svg, "Research").boundingBox();
    const q3 = await nodeByLabel(svg, "Launch").boundingBox();
    expect(q1).not.toBeNull();
    expect(q3).not.toBeNull();
    expect(q3!.x).toBeLessThan(q1!.x);
  });
});
