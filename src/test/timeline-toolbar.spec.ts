import { test, expect } from "@playwright/test";

// Timeline two-way editing: node selection shows the timeline toolbar with directional
// + buttons (add event/period/section before/after along the component's rendered axis),
// plus rename, delete, and drag-reorder nodes.
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

function addButton(
  page: import("@playwright/test").Page,
  kind: "event" | "period" | "section",
  placement: string,
) {
  return page.locator(`[data-timeline-add-${kind}="${placement}"]`);
}

async function clickNode(
  svg: import("@playwright/test").Locator,
  page: import("@playwright/test").Page,
  text: string,
) {
  const node = nodeByLabel(svg, text);
  await expect(node).toBeVisible({ timeout: 15000 });
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(700);
  await expect(toolbar(page)).toBeVisible({ timeout: 10000 });
}

async function selectNode(page: import("@playwright/test").Page, text: string) {
  const svg = await openTimelineEditor(page);
  await clickNode(svg, page, text);
  return svg;
}

test.describe("timeline node toolbar", () => {
  test("selecting an event shows event add buttons + rename/delete actions", async ({ page }) => {
    await selectNode(page, "Research");
    await expect(page.locator('[data-timeline-add-event="before"]')).toBeVisible();
    await expect(page.locator('[data-timeline-add-event="after"]')).toBeVisible();
    await expect(page.locator("[data-timeline-add-event]")).toHaveCount(2);
    await expect(page.locator("[data-timeline-add-period]")).toHaveCount(0);
    await expect(page.locator("[data-timeline-add-section]")).toHaveCount(0);
    await expect(toolbar(page).locator('button[title="Rename element"]')).toBeVisible();
    await expect(toolbar(page).locator('button[title="Delete element"]')).toBeVisible();
  });

  test("adding an event after the target renders a new event", async ({ page }) => {
    const svg = await selectNode(page, "Research");
    await addButton(page, "event", "after").click();
    await expect(nodeByLabel(svg, "New Event 1")).toBeVisible({ timeout: 15000 });
  });

  test("adding an event before the target renders a new event", async ({ page }) => {
    const svg = await selectNode(page, "Build");
    await addButton(page, "event", "before").click();
    await expect(nodeByLabel(svg, "New Event 1")).toBeVisible({ timeout: 15000 });
  });

  test("selecting a period shows before/after + child event-add buttons", async ({ page }) => {
    await selectNode(page, "2026 Q1");
    await expect(page.locator('[data-timeline-add-period="before"]')).toBeVisible();
    await expect(page.locator('[data-timeline-add-period="after"]')).toBeVisible();
    await expect(page.locator('[data-timeline-add-event-to-period="true"]')).toBeVisible();
    await expect(page.locator("[data-timeline-add-period]")).toHaveCount(2);
    await expect(page.locator("[data-timeline-add-event-to-period]")).toHaveCount(1);
    await expect(page.locator("[data-timeline-add-section]")).toHaveCount(0);
  });

  test("adding an event to the selected period via the child button renders a new event", async ({
    page,
  }) => {
    const svg = await selectNode(page, "2026 Q1");
    await page.locator('[data-timeline-add-event-to-period="true"]').click();
    await expect(nodeByLabel(svg, "New Event 1")).toBeVisible({ timeout: 15000 });
  });

  test("adding a period after the selected period renders a new period", async ({ page }) => {
    const svg = await selectNode(page, "2026 Q1");
    await addButton(page, "period", "after").click();
    await expect(nodeByLabel(svg, "New Period 1")).toBeVisible({ timeout: 15000 });
  });

  test("selecting a section shows before/after + child period-add buttons", async ({ page }) => {
    await selectNode(page, "Phase 1");
    await expect(page.locator('[data-timeline-add-section="before"]')).toBeVisible();
    await expect(page.locator('[data-timeline-add-section="after"]')).toBeVisible();
    await expect(page.locator('[data-timeline-add-period-to-section="true"]')).toBeVisible();
    await expect(page.locator("[data-timeline-add-section]")).toHaveCount(2);
    await expect(page.locator("[data-timeline-add-period-to-section]")).toHaveCount(1);
    await expect(page.locator("[data-timeline-add-event]")).toHaveCount(0);
  });

  test("adding a period to the selected section via the child button renders a new period", async ({
    page,
  }) => {
    const svg = await selectNode(page, "Phase 1");
    await page.locator('[data-timeline-add-period-to-section="true"]').click();
    await expect(nodeByLabel(svg, "New Period 1")).toBeVisible({ timeout: 15000 });
  });

  test("adding a section appends a new section block", async ({ page }) => {
    const svg = await selectNode(page, "Phase 1");
    await addButton(page, "section", "after").click();
    await expect(nodeByLabel(svg, "New Section 1")).toBeVisible({ timeout: 15000 });
  });

  test("adding a section after a multi-period section inserts after its subtree", async ({
    page,
  }) => {
    const svg = await selectNode(page, "Phase 1");
    await addButton(page, "section", "after").click();
    await page.waitForTimeout(1500);

    const newSection = nodeByLabel(svg, "New Section 1");
    const phase2 = nodeByLabel(svg, "Phase 2");
    const newBox = await newSection.boundingBox();
    const phase2Box = await phase2.boundingBox();
    expect(newBox).not.toBeNull();
    expect(phase2Box).not.toBeNull();
    // In LR mode the new section renders between Phase 1 and Phase 2.
    expect(newBox!.x).toBeLessThan(phase2Box!.x);

    // Phase 2's period/event children are untouched.
    await expect(nodeByLabel(svg, "Launch")).toBeVisible({ timeout: 15000 });
  });

  test("adding a section before the target inserts it immediately before", async ({ page }) => {
    const svg = await selectNode(page, "Phase 2");
    await addButton(page, "section", "before").click();
    await page.waitForTimeout(1500);

    const newSection = nodeByLabel(svg, "New Section 1");
    const phase2 = nodeByLabel(svg, "Phase 2");
    await expect(newSection).toBeVisible({ timeout: 15000 });
    const newBox = await newSection.boundingBox();
    const phase2Box = await phase2.boundingBox();
    expect(newBox).not.toBeNull();
    expect(phase2Box).not.toBeNull();
    expect(newBox!.x).toBeLessThan(phase2Box!.x);
  });

  test("inserted section title enters inline edit for immediate renaming", async ({ page }) => {
    const svg = await selectNode(page, "Phase 1");
    await addButton(page, "section", "after").click();
    await page.waitForTimeout(800);
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect(editor).toHaveText("New Section 1");

    await editor.click();
    await editor.fill("Refactor Phase");
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(1500);
    await expect(nodeByLabel(svg, "Refactor Phase")).toBeVisible({ timeout: 15000 });
    await expect(nodeByLabel(svg, "New Section 1")).toHaveCount(0);
  });

  test("vertical direction shows top/bottom before/after + right child buttons", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    // Switch direction to Vertical via the header toolbar.
    await page.getByRole("button", { name: "Direction" }).click();
    await page.getByRole("menuitem", { name: "Vertical" }).click();
    await page.waitForTimeout(1500);

    // A selected period gets top/bottom (before/after) buttons plus a right child button in TD mode.
    await clickNode(svg, page, "2026 Q1");
    await expect(page.locator('[data-timeline-add-period="before"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('[data-timeline-add-period="after"]')).toBeVisible();
    await expect(page.locator('[data-timeline-add-event-to-period="true"]')).toBeVisible();

    // A selected event gets top/bottom (before/after) buttons in TD mode, and insertion works.
    await clickNode(svg, page, "Research");
    await expect(page.locator('[data-timeline-add-event="before"]')).toBeVisible();
    await expect(page.locator('[data-timeline-add-event="after"]')).toBeVisible();
    await addButton(page, "event", "after").click();
    await expect(nodeByLabel(svg, "New Event 1")).toBeVisible({ timeout: 15000 });
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
