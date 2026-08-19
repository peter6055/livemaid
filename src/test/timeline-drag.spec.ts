import { test, expect } from "@playwright/test";

// Timeline drag-and-drop: issue #8 — child events get a column-centered drop guide inside the
// hovered parent period column, while sections and period columns keep the boundary guide.
// Also covers the "what moves" outline, the drag ghost, and same-kind-only drop rules.
const SEED_CODE = `timeline
    title Product Milestones
    section Phase 1
        2026 Q1 : Research
        : Prototype
        : Pitch
        2026 Q2 : Build : Test
    section Phase 2
        2026 Q3 : Launch
    section Phase 3
        2027 Q1`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Timeline Drag", type: "timeline", code: SEED_CODE },
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

function reorderOverlay(page: import("@playwright/test").Page) {
  return page.locator("[data-timeline-reorder-overlay]");
}

function columnGuide(page: import("@playwright/test").Page) {
  return page.locator("[data-timeline-reorder-column-guide]");
}

function boundaryGuide(page: import("@playwright/test").Page) {
  return page.locator("[data-timeline-reorder-guide]");
}

async function getDiagramCode(page: import("@playwright/test").Page): Promise<string> {
  // Autosave is debounced (1500ms) + an in-flight PUT, so poll until the edit is persisted.
  for (let i = 0; i < 20; i += 1) {
    const res = await page.request.get(`/api/diagrams/${DIAGRAM_ID}`);
    expect(res.ok()).toBeTruthy();
    const code = (await res.json()).code as string;
    if (code !== SEED_CODE) return code;
    await page.waitForTimeout(300);
  }
  const res = await page.request.get(`/api/diagrams/${DIAGRAM_ID}`);
  return (await res.json()).code as string;
}

/** Start a drag on the given node and hold it (pointer-down, small nudge). */
async function startDrag(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  label: string,
) {
  const node = nodeByLabel(svg, label);
  await expect(node).toBeVisible({ timeout: 15000 });
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 6, box!.y + box!.height / 2 + 6, { steps: 3 });
  return box!;
}

/**
 * Park the pointer over a target node during an active drag. `pos`:
 *  - "before"/"after": the boundary edges (section/period boundary drops)
 *  - "center": the node middle (child-event column drops)
 */
async function hoverTarget(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  targetLabel: string,
  pos: "before" | "after" | "center",
  horizontal: boolean,
) {
  const target = nodeByLabel(svg, targetLabel);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  let x = box!.x + box!.width / 2;
  let y = box!.y + box!.height / 2;
  if (pos === "before") {
    if (horizontal) x = box!.x + 5;
    else y = box!.y + 5;
  } else if (pos === "after") {
    if (horizontal) x = box!.x + box!.width - 5;
    else y = box!.y + box!.height - 5;
  }
  await page.mouse.move(x, y, { steps: 12 });
  await page.waitForTimeout(150);
}

async function release(page: import("@playwright/test").Page) {
  await page.mouse.up();
  await page.waitForTimeout(1500);
}

test.describe("timeline drag guide (issue #8)", () => {
  test("LR: child-event drag shows a column-centered guide inside the hovered parent column", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    await startDrag(page, svg, "Prototype");

    const launch = nodeByLabel(svg, "Launch");
    const period = nodeByLabel(svg, "2026 Q3");
    await expect(launch).toBeVisible();
    const launchBox = await launch.boundingBox();
    const periodBox = await period.boundingBox();
    expect(launchBox).not.toBeNull();
    expect(periodBox).not.toBeNull();
    await hoverTarget(page, svg, "Launch", "center", true);

    await expect(columnGuide(page)).toBeVisible({ timeout: 5000 });
    await expect(reorderOverlay(page)).toBeVisible();
    await expect(page.locator("[data-timeline-reorder-ghost]")).toBeVisible();
    await expect(page.locator("[data-timeline-reorder-moving]")).toBeVisible();

    const guideBox = await columnGuide(page).boundingBox();
    expect(guideBox).not.toBeNull();
    const guideCenterX = guideBox!.x + guideBox!.width / 2;
    const periodCenterX = periodBox!.x + periodBox!.width / 2;
    expect(Math.abs(guideCenterX - periodCenterX)).toBeLessThan(4);
    expect(guideCenterX).toBeGreaterThan(periodBox!.x + 2);
    expect(guideCenterX).toBeLessThan(periodBox!.x + periodBox!.width - 2);

    await release(page);
    const code = await getDiagramCode(page);
    // Prototype moved into the 2026 Q3 period (cross-column child-event reorder). It may land
    // before or after Launch depending on which half of the target the pointer sat over.
    expect(code).toMatch(/2026 Q3 : (Launch|Prototype)(?:\n\s*: (Launch|Prototype))/);
  });

  test("LR: section drag keeps the boundary guide (no column guide)", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    await startDrag(page, svg, "Phase 1");
    await hoverTarget(page, svg, "Phase 2", "before", true);

    await expect(boundaryGuide(page)).toBeVisible({ timeout: 5000 });
    await expect(columnGuide(page)).toHaveCount(0);

    await release(page);
    const code = await getDiagramCode(page);
    expect(code.indexOf("section Phase 1")).toBeLessThan(code.indexOf("section Phase 2"));
  });

  test("LR: period drag keeps the boundary guide (no column guide)", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    await startDrag(page, svg, "2026 Q2");
    await hoverTarget(page, svg, "2026 Q1", "before", true);

    await expect(boundaryGuide(page)).toBeVisible({ timeout: 5000 });
    await expect(columnGuide(page)).toHaveCount(0);

    await release(page);
    const code = await getDiagramCode(page);
    expect(code.indexOf("2026 Q2 : Build")).toBeLessThan(code.indexOf("2026 Q1 : Research"));
  });

  test("LR: dropping an event on a period column (cross-kind) is rejected", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    await startDrag(page, svg, "Prototype");
    await hoverTarget(page, svg, "2026 Q2", "center", true);

    await expect(reorderOverlay(page)).toHaveAttribute("data-timeline-reorder-target", "none", {
      timeout: 5000,
    });

    await release(page);
    const code = await getDiagramCode(page);
    expect(code).toContain("2026 Q1 : Research\n        : Prototype");
  });

  test("TD: child-event drag shows a column-centered guide on the vertical axis", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    await page.getByRole("button", { name: "Direction" }).click();
    await page.getByRole("menuitem", { name: "Vertical" }).click();
    await page.waitForTimeout(1500);

    await startDrag(page, svg, "Prototype");

    const launch = nodeByLabel(svg, "Launch");
    const period = nodeByLabel(svg, "2026 Q3");
    await expect(launch).toBeVisible();
    const launchBox = await launch.boundingBox();
    const periodBox = await period.boundingBox();
    expect(launchBox).not.toBeNull();
    expect(periodBox).not.toBeNull();
    await hoverTarget(page, svg, "Launch", "center", false);

    await expect(columnGuide(page)).toBeVisible({ timeout: 5000 });

    const guideBox = await columnGuide(page).boundingBox();
    expect(guideBox).not.toBeNull();
    const guideCenterY = guideBox!.y + guideBox!.height / 2;
    const periodCenterY = periodBox!.y + periodBox!.height / 2;
    expect(Math.abs(guideCenterY - periodCenterY)).toBeLessThan(4);

    await release(page);
    const code = await getDiagramCode(page);
    expect(code).toMatch(/2026 Q3 : (Launch|Prototype)(?:\n\s*: (Launch|Prototype))/);
  });

  test("TD: section drag keeps the boundary guide", async ({ page }) => {
    const svg = await openTimelineEditor(page);
    await page.getByRole("button", { name: "Direction" }).click();
    await page.getByRole("menuitem", { name: "Vertical" }).click();
    await page.waitForTimeout(1500);

    await startDrag(page, svg, "Phase 1");
    await hoverTarget(page, svg, "Phase 3", "before", false);

    await expect(boundaryGuide(page)).toBeVisible({ timeout: 5000 });
    await expect(columnGuide(page)).toHaveCount(0);

    await release(page);
    const code = await getDiagramCode(page);
    expect(code.indexOf("section Phase 1")).toBeLessThan(code.indexOf("section Phase 3"));
  });
});
