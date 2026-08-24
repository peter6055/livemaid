import { test, expect } from "@playwright/test";

const SEED_CODE = `timeline LR
    title Product Milestones
    section Phase 4
        2026 Q1 : Kickoff
        : Research
        2026 Q2
        : Build
    section New Section 1
        2026 Q3 : Prototype
        : Launch`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Issue15 Boundary", type: "timeline", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
});

async function openEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
  await page.waitForTimeout(2500);
  return page.locator("svg[id^='mermaid-svg']");
}

function period(svg: import("@playwright/test").Locator, text: string) {
  return svg.locator("g.timeline-node").filter({ hasText: text }).first();
}

async function getDiagramCode(page: import("@playwright/test").Page): Promise<string> {
  const res = await page.request.get(`/api/diagrams/${DIAGRAM_ID}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).code as string;
}

/** Column x-extents of the two sections, read from their period nodes. */
async function sectionColumns(page: import("@playwright/test").Page) {
  const svg = page.locator("svg[id^='mermaid-svg']");
  const q1 = (await period(svg, "2026   Q1").boundingBox())!;
  const q3 = (await period(svg, "2026   Q3").boundingBox())!;
  // Periods span their column width in LR timelines (Q1 starts the column; Q3 is alone).
  const q2 = (await period(svg, "2026   Q2").boundingBox())!;
  return {
    home: { x1: q1.x, x2: Math.max(q2.x + q2.width, q1.x + q1.width) },
    other: { x1: q3.x, x2: q3.x + q3.width },
  };
}

async function startDrag(page: import("@playwright/test").Page, label: string) {
  const svg = page.locator("svg[id^='mermaid-svg']");
  const box = (await period(svg, label).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 5, cy + 5, { steps: 3 });
  await page.waitForTimeout(150);
  return cy;
}

async function sampleAt(page: import("@playwright/test").Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(120);
  const overlay = page.locator("[data-timeline-reorder-overlay]");
  const target = await overlay.getAttribute("data-timeline-reorder-target");
  const placement = await overlay.getAttribute("data-timeline-reorder-placement");
  const hl = page.locator("[data-timeline-section-highlight]");
  let highlightColumn: "home" | "other" | null = null;
  if ((await hl.count()) > 0) {
    const hb = (await hl.boundingBox())!;
    const cols = await sectionColumns(page);
    const mid = hb.x + hb.width / 2;
    highlightColumn =
      mid >= cols.home.x1 - 6 && mid <= cols.home.x2 + 6
        ? "home"
        : mid >= cols.other.x1 - 6 && mid <= cols.other.x2 + 6
          ? "other"
          : null;
  }
  return { target, placement, highlightColumn };
}

test("LR: indicator flips at the section boundary and preview matches the drop", async ({
  page,
}) => {
  test.setTimeout(90000);
  const svg = await openEditor(page);
  void svg;
  const cy = await startDrag(page, "2026   Q2");

  // Inside home section near boundary: no cross-section commitment; home glows.
  const homeSide = await sampleAt(page, 790, cy);
  expect(homeSide.target).toBe("none");
  expect(homeSide.highlightColumn).toBe("home");
  await page.screenshot({ path: "test-results/issue15-home-side.png" });

  // Past the boundary: neighbouring section is targeted and glows.
  const otherSide = await sampleAt(page, 820, cy);
  expect(otherSide.placement).toBe("before");
  expect(otherSide.highlightColumn).toBe("other");
  await page.screenshot({ path: "test-results/issue15-other-side.png" });

  // Preview == final: release where the indicator pointed.
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const code = await getDiagramCode(page);
  const phase4 = code.slice(code.indexOf("section Phase 4"), code.indexOf("section New"));
  expect(code).toMatch(/section New Section 1\s*\n\s*2026 Q2/);
  expect(phase4).toContain("2026 Q1");
  expect(phase4).not.toContain("2026 Q2");
});

test("LR: releasing on the home side of the boundary leaves the diagram unchanged", async ({
  page,
}) => {
  test.setTimeout(90000);
  await openEditor(page);
  const cy = await startDrag(page, "2026   Q2");
  const s = await sampleAt(page, 790, cy);
  expect(s.highlightColumn).toBe("home");
  await page.mouse.up();
  await page.waitForTimeout(1200);
  expect(await getDiagramCode(page)).toBe(SEED_CODE);
});

test("LR: mirrored direction — dragging the neighbour back flips at the same boundary", async ({
  page,
}) => {
  test.setTimeout(90000);
  await openEditor(page);
  const cy = await startDrag(page, "2026   Q3");

  // Still over the home column of the dragged period: stay put, glow home.
  const still = await sampleAt(page, 850, cy);
  expect(still.target).toBe("none");
  expect(still.highlightColumn).toBe("other");

  // Across the boundary into Phase 4: insert after Q2, glow Phase 4.
  const crossed = await sampleAt(page, 780, cy);
  expect(crossed.placement).toBe("after");
  expect(crossed.highlightColumn).toBe("home");

  await page.mouse.up();
  await page.waitForTimeout(1500);
  const code = await getDiagramCode(page);
  const phase4 = code.slice(code.indexOf("section Phase 4"), code.indexOf("section New"));
  const newSection = code.slice(code.indexOf("section New"));
  expect(phase4).toContain("2026 Q3");
  expect(newSection).not.toContain("2026 Q3");
});

test("LR: intra-section reorder still works", async ({ page }) => {
  test.setTimeout(90000);
  await openEditor(page);
  const cy = await startDrag(page, "2026   Q2");
  // Drop left of Q1 → before(Q1).
  await page.mouse.move(645, cy, { steps: 10 });
  await page.waitForTimeout(200);
  const overlay = page.locator("[data-timeline-reorder-overlay]");
  expect(await overlay.getAttribute("data-timeline-reorder-placement")).toBe("before");
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const code = await getDiagramCode(page);
  const phase4 = code.slice(code.indexOf("section Phase 4"), code.indexOf("section New"));
  expect(phase4.indexOf("2026 Q2")).toBeLessThan(phase4.indexOf("2026 Q1"));
});
