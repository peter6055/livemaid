import { test, expect } from "@playwright/test";

const SEED_CODE = `timeline TD
    title Product Milestones
    section Phase 1
        2026 Q2 : Research
        : Build
        : Test
        2026 Q1
        : Pitch
    section Phase 2
        2026 Q3 : Prototype
        : Launch
    section Phase 3
        2027 Q1`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Timeline Splice", type: "timeline", code: SEED_CODE },
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

async function getDiagramCode(page: import("@playwright/test").Page): Promise<string> {
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

test("TD: drag Build between Prototype and Launch splices (does not replace)", async ({ page }) => {
  const svg = await openTimelineEditor(page);

  const build = nodeByLabel(svg, "Build");
  const prototype = nodeByLabel(svg, "Prototype");
  const launch = nodeByLabel(svg, "Launch");
  await expect(build).toBeVisible({ timeout: 15000 });
  await expect(prototype).toBeVisible();
  await expect(launch).toBeVisible();

  const buildBox = await build.boundingBox();
  const protoBox = await prototype.boundingBox();
  const launchBox = await launch.boundingBox();
  expect(buildBox).not.toBeNull();
  expect(protoBox).not.toBeNull();
  expect(launchBox).not.toBeNull();

  // Start drag on Build
  await page.mouse.move(buildBox!.x + buildBox!.width / 2, buildBox!.y + buildBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    buildBox!.x + buildBox!.width / 2 + 6,
    buildBox!.y + buildBox!.height / 2 + 6,
    {
      steps: 3,
    },
  );

  // Drop in the gap between Prototype and Launch (TD: vertical stack)
  const x = protoBox!.x + protoBox!.width / 2;
  const y = protoBox!.y + protoBox!.height + (launchBox!.y - (protoBox!.y + protoBox!.height)) / 2;
  await page.mouse.move(x, y, { steps: 16 });
  await page.waitForTimeout(200);

  // Capture overlay target/placement before release
  const overlay = page.locator("[data-timeline-reorder-overlay]");
  await expect(overlay).toBeVisible({ timeout: 5000 });
  const targetAttr = await overlay.getAttribute("data-timeline-reorder-target");
  const placementAttr = await overlay.getAttribute("data-timeline-reorder-placement");
  console.log("target=", targetAttr, "placement=", placementAttr);

  await page.mouse.up();
  await page.waitForTimeout(1500);

  const result = await getDiagramCode(page);
  console.log("=== Result ===\n" + result);

  const parsed = result;
  // Build must sit between Prototype and Launch in Phase 2
  expect(parsed).toMatch(/2026 Q3 : Prototype\n\s*: Build\n\s*: Launch/);
  expect(parsed).toContain(": Research");
  expect(parsed).toContain(": Test");
  expect(parsed).toContain(": Pitch");
});
