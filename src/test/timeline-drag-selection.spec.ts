import { test, expect } from "@playwright/test";

// Issue #17: dragging a SELECTED timeline event must keep THAT event selected after the move.
// The old handler selected the drop-slot anchor (targetId) instead of the dragged node
// (sourceId), so afterwards a different node was selected or selection was lost entirely.
// Harness modeled on timeline-drag.spec.ts / timeline-direction.spec.ts.
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
    data: { name: "Seed Timeline Drag Selection", type: "timeline", code: SEED_CODE },
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

type Box = { x: number; y: number; width: number; height: number };

/**
 * True when the CENTER of box `a` lies inside box `b`. The selection outline carries padding
 * around the selected node, so its edges can graze an adjacent node's bbox; the center point
 * pins WHICH node is selected without that edge noise.
 */
function centerInside(a: Box, b: Box): boolean {
  const cx = a.x + a.width / 2;
  const cy = a.y + a.height / 2;
  return cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height;
}

async function bboxOf(svg: import("@playwright/test").Locator, text: string): Promise<Box> {
  const box = await nodeByLabel(svg, text).boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

// The selection outline EditorCanvas renders from its selectionBox state. For timeline diagrams
// this div is the only [data-scale-lock-border] element on screen (the other ones are
// sequence-only hover overlays), so it identifies the selected node uniquely.
function selectionOutline(page: import("@playwright/test").Page) {
  return page.locator("[data-scale-lock-border]");
}

/**
 * Locate the timeline reorder handle covering point (x, y). A plain mouse press on an already
 * SELECTED node can be swallowed by its edge `+` buttons (tiny event nodes put a button right
 * over the node center), so the initiating mousedown is dispatched straight to the handle;
 * the rest of the drag runs on real input events.
 */
async function grabHandle(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
): Promise<import("@playwright/test").Locator> {
  const handles = page.locator("[data-timeline-reorder-handle]");
  const count = await handles.count();
  for (let i = 0; i < count; i += 1) {
    const handle = handles.nth(i);
    const box = await handle.boundingBox();
    if (!box) continue;
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
      return handle;
    }
  }
  throw new Error(`No timeline reorder handle covers (${x}, ${y})`);
}

/** Click-select a node and verify the outline hugs it. Returns the outline rect. */
async function clickSelect(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  label: string,
): Promise<Box> {
  const nodeBox = await bboxOf(svg, label);
  const cx = nodeBox.x + nodeBox.width / 2;
  const cy = nodeBox.y + nodeBox.height / 2;
  const handle = await grabHandle(page, cx, cy);
  await handle.dispatchEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: cx,
    clientY: cy,
  });
  await handle.dispatchEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: cx,
    clientY: cy,
  });
  await expect(selectionOutline(page)).toBeVisible({ timeout: 10000 });
  const outBox = (await selectionOutline(page).boundingBox())!;
  expect(outBox).not.toBeNull();
  expect(centerInside(outBox!, nodeBox)).toBeTruthy();
  return outBox!;
}

/** Start a drag on the given node and hold it (pointer-down, small nudge). */
async function startDrag(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  label: string,
) {
  const box = await bboxOf(svg, label);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const handle = await grabHandle(page, cx, cy);
  await handle.dispatchEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: cx,
    clientY: cy,
  });
  await page.mouse.move(cx + 6, cy + 6, { steps: 3 });
  await page.waitForTimeout(150);
}

/**
 * Park the pointer over a target node during an active drag. `pos`:
 *  - "center": the node middle (child-event column drops)
 *  - "before": the leading edge on the event-stack axis (top in LR, left in TD)
 */
async function hoverTarget(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  targetLabel: string,
  pos: "before" | "center",
  horizontal: boolean,
) {
  const box = await bboxOf(svg, targetLabel);
  let x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  // Events stack along the perpendicular axis (LR: vertically, TD: horizontally).
  if (pos === "before") {
    if (horizontal) y = box.y + 5;
    else x = box.x + 5;
  }
  await page.mouse.move(x, y, { steps: 12 });
  await page.waitForTimeout(150);
}

async function release(page: import("@playwright/test").Page) {
  await page.mouse.up();
  await page.waitForTimeout(1500);
}

async function fetchCode(page: import("@playwright/test").Page): Promise<string> {
  const res = await page.request.get(`/api/diagrams/${DIAGRAM_ID}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).code as string;
}

/** Poll the API until the persisted code satisfies `pred` (autosave is debounced). */
async function waitForPersistedCode(
  page: import("@playwright/test").Page,
  pred: (code: string) => boolean,
): Promise<string> {
  let code = "";
  for (let i = 0; i < 25; i += 1) {
    code = await fetchCode(page);
    if (pred(code)) return code;
    await page.waitForTimeout(300);
  }
  return code;
}

async function switchToVertical(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Direction" }).click();
  await page.getByRole("menuitem", { name: /Vertical/ }).click();
  await page.waitForTimeout(1500);
}

/**
 * After the move: the SAME dragged event must still be selected — the outline overlaps the
 * dragged node's NEW bounding box and none of the untouched events'.
 */
async function expectStillSelected(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  draggedLabel: string,
  otherLabels: string[],
) {
  const movedBox = await bboxOf(svg, draggedLabel);
  const otherBoxes: Box[] = [];
  for (const label of otherLabels) otherBoxes.push(await bboxOf(svg, label));
  await expect(selectionOutline(page)).toBeVisible({ timeout: 15000 });
  const outBox = (await selectionOutline(page).boundingBox())!;
  expect(centerInside(outBox!, movedBox)).toBeTruthy();
  for (const other of otherBoxes) {
    expect(centerInside(outBox!, other)).toBeFalsy();
  }
}

function expectMovedAcrossSections(code: string, label: string, fromSection: string) {
  const idx = code.indexOf(label);
  expect(idx).toBeGreaterThanOrEqual(0);
  expect(idx).toBeGreaterThan(code.indexOf("section Phase 2"));
  const fromSlice = code.slice(
    code.indexOf(`section ${fromSection}`),
    code.indexOf("section Phase 2"),
  );
  expect(fromSlice).not.toContain(label);
}

test.describe("Timeline drag preserves selection of the dragged event (#17)", () => {
  test("LR: dropping a selected event into an indented period column keeps it selected", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);

    // Select Research, remember the outline rect, confirm it hugs Research.
    await clickSelect(page, svg, "Research");

    // Drag Research into the 2026 Q3 column (child-event column-mode drop).
    await startDrag(page, svg, "Research");
    await hoverTarget(page, svg, "Launch", "center", true);
    await expect(page.locator("[data-timeline-reorder-column-guide]")).toBeVisible({
      timeout: 5000,
    });
    await release(page);

    const code = await waitForPersistedCode(page, (c) => c !== SEED_CODE);
    expect(code).not.toBe(SEED_CODE);
    expectMovedAcrossSections(code, "Research", "Phase 1");

    // Research must STILL be the selected node (not Launch/Pitch, not cleared).
    await expectStillSelected(page, svg, "Research", ["Pitch", "Launch"]);

    // Sanity: clicking a different node still moves selection to it.
    await clickSelect(page, svg, "Pitch");
    const pitchBox = await bboxOf(svg, "Pitch");
    const researchBox = await bboxOf(svg, "Research");
    const outBox = (await selectionOutline(page).boundingBox())!;
    expect(centerInside(outBox!, pitchBox)).toBeTruthy();
    expect(centerInside(outBox!, researchBox)).toBeFalsy();
  });

  test("LR: boundary slot drop across sections keeps the dragged event selected", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    await clickSelect(page, svg, "Prototype");

    // Drop on the leading-edge slot of Launch (another section, deeper indent level).
    await startDrag(page, svg, "Prototype");
    await hoverTarget(page, svg, "Launch", "before", true);
    await release(page);

    const code = await waitForPersistedCode(page, (c) => c !== SEED_CODE);
    expectMovedAcrossSections(code, "Prototype", "Phase 1");

    await expectStillSelected(page, svg, "Prototype", ["Build", "Launch"]);
  });

  test("TD: dropping a selected event into an indented period column keeps it selected", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    await switchToVertical(page);
    const baseline = await waitForPersistedCode(page, (c) => /\btimeline\s+TD\b/.test(c));
    expect(baseline).toMatch(/\btimeline\s+TD\b/);

    await clickSelect(page, svg, "Research");
    await startDrag(page, svg, "Research");
    await hoverTarget(page, svg, "Launch", "center", false);
    await expect(page.locator("[data-timeline-reorder-column-guide]")).toBeVisible({
      timeout: 5000,
    });
    await release(page);

    const code = await waitForPersistedCode(page, (c) => c !== baseline);
    expectMovedAcrossSections(code, "Research", "Phase 1");

    await expectStillSelected(page, svg, "Research", ["Pitch", "Launch"]);

    // Sanity: clicking a different node still moves selection to it.
    await clickSelect(page, svg, "Pitch");
    const pitchBox = await bboxOf(svg, "Pitch");
    const researchBox = await bboxOf(svg, "Research");
    const outBox = (await selectionOutline(page).boundingBox())!;
    expect(centerInside(outBox!, pitchBox)).toBeTruthy();
    expect(centerInside(outBox!, researchBox)).toBeFalsy();
  });

  test("TD: boundary slot drop across sections keeps the dragged event selected", async ({
    page,
  }) => {
    const svg = await openTimelineEditor(page);
    await switchToVertical(page);
    const baseline = await waitForPersistedCode(page, (c) => /\btimeline\s+TD\b/.test(c));
    expect(baseline).toMatch(/\btimeline\s+TD\b/);

    await clickSelect(page, svg, "Prototype");
    await startDrag(page, svg, "Prototype");
    await hoverTarget(page, svg, "Launch", "before", false);
    await release(page);

    const code = await waitForPersistedCode(page, (c) => c !== baseline);
    expectMovedAcrossSections(code, "Prototype", "Phase 1");

    await expectStillSelected(page, svg, "Prototype", ["Build", "Launch"]);
  });
});
