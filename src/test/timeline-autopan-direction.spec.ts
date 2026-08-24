import { test, expect } from "@playwright/test";

// Timeline edge-drag auto-pan direction — issue peter6055/livemaid-project#16.
// While a timeline reorder drag is active, holding the cursor near a canvas shell edge must
// auto-pan so MORE CONTENT IS REVEALED in that direction. react-zoom-pan-pinch's positionX/Y
// translate the CONTENT (positive positionX renders content further right on screen), so:
//   drag toward right edge → content moves LEFT on screen (transform tx decreases)
//   drag toward left edge  → content moves RIGHT (tx increases)
//   drag toward bottom edge → content moves UP (ty decreases)
//   drag toward top edge   → content moves DOWN (ty increases)
// We measure the applied pan precisely via the computed transform matrix of the
// `.react-transform-component` element (the direct TransformWrapper child that carries the
// transform), which avoids SVG bbox stroke-overflow noise.
const SEED_CODE = `timeline
    title Product Milestones
    section Phase 1
        2026 Q1 : Research : Prototype : Pitch
        2026 Q2 : Build : Test
    section Phase 2
        2026 Q3 : Launch : Iterate
    section Phase 3
        2027 Q1 : Plan`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: {
      name: "Seed Timeline AutoPan Direction",
      type: "timeline",
      code: SEED_CODE,
    },
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

/** Applied pan as the screen-space translation of the transformed canvas content. */
async function readContentPan(
  page: import("@playwright/test").Page,
): Promise<{ tx: number; ty: number }> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".react-transform-component");
    if (!el) throw new Error(".react-transform-component not found");
    const raw = getComputedStyle(el).transform;
    if (!raw || raw === "none") return { tx: 0, ty: 0 };
    const m = new DOMMatrixReadOnly(raw);
    return { tx: m.e, ty: m.f };
  });
}

/**
 * Bounding box of the static shell container that wraps TransformWrapper. The shell is the
 * same element the drag handler measures against (`closest('.relative.overflow-hidden')`,
 * mirroring EditorCanvas's own viewport lookup).
 */
async function shellBox(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const content = document.querySelector(".react-transform-component");
    const shell = content?.closest(".relative.overflow-hidden");
    if (!shell) throw new Error("canvas shell (.relative.overflow-hidden) not found");
    const r = shell.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/**
 * Start a reorder drag on the given node (pointer-down + nudge >3px so `dragging` engages),
 * then wiggle the pointer inside the requested edge zone to keep feeding mousemove events.
 * Auto-pan steps are applied per mousemove, so the pointer must keep moving while parked.
 * Returns first/last samples of the content translation along both axes.
 */
async function dragAndParkAtEdge(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  edge: "right" | "left" | "bottom" | "top",
): Promise<{ tx0: number; tx1: number; ty0: number; ty1: number }> {
  const node = nodeByLabel(svg, "Research");
  await expect(node).toBeVisible({ timeout: 15000 });
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Nudge past the 3px drag threshold without leaving the node area.
  await page.mouse.move(startX + 5, startY + 4, { steps: 4 });

  const shell = await shellBox(page);
  const INSET = 20; // inside the 64px EDGE_MARGIN band
  let ax: number;
  let ay: number;
  let bx: number;
  let by: number;
  if (edge === "right" || edge === "left") {
    const x = edge === "right" ? shell.left + shell.width - INSET : shell.left + INSET;
    const yMid = shell.top + shell.height / 2;
    ax = x;
    ay = yMid - 2;
    bx = x;
    by = yMid + 2; // avoid the zoom buttons in the bottom-right corner
  } else {
    const y = edge === "bottom" ? shell.top + shell.height - INSET : shell.top + INSET;
    const xMid = shell.left + shell.width / 2;
    ax = xMid - 2;
    ay = y;
    bx = xMid + 2;
    by = y;
  }
  await page.mouse.move(ax, ay, { steps: 8 });

  // Hold ~1s: oscillate between two points 4px apart, sampling the content pan.
  const samples: Array<{ tx: number; ty: number }> = [];
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.move(i % 2 === 0 ? bx : ax, i % 2 === 0 ? by : ay, { steps: 2 });
    samples.push(await readContentPan(page));
    await page.waitForTimeout(60);
  }

  return {
    tx0: samples[0].tx,
    ty0: samples[0].ty,
    tx1: samples[samples.length - 1].tx,
    ty1: samples[samples.length - 1].ty,
  };
}

for (const edge of ["right", "left", "bottom", "top"] as const) {
  test(`Timeline edge-drag auto-pan direction (#16): ${edge} edge reveals content beyond it`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const svg = await openTimelineEditor(page);
    const { tx0, tx1, ty0, ty1 } = await dragAndParkAtEdge(page, svg, edge);

    if (edge === "right") {
      expect(tx1).toBeLessThan(tx0);
    } else if (edge === "left") {
      expect(tx1).toBeGreaterThan(tx0);
    } else if (edge === "bottom") {
      expect(ty1).toBeLessThan(ty0);
    } else {
      expect(ty1).toBeGreaterThan(ty0);
    }

    // Release away from any slot bands (back over the dragged node) and make sure nothing
    // crashed and the editor is still alive with its render intact.
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(page.locator("svg[id^='mermaid-svg']")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
}
