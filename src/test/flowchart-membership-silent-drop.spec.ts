import { test, expect } from "@playwright/test";

// Silent no-op drop (PR #145 review): a top-level node with no standalone
// declaration (edge-only, e.g. `X1 --> X2`) cannot move anywhere, but dropping
// it back on empty canvas requests NO change — that drop must stay silent (no
// toast) and leave the source untouched. A genuinely blocked drop (the same
// node into a subgraph) must still toast, so the fix doesn't mute real
// feedback (control below).
const SEED_CODE = `graph TD
    X1 --> X2
    subgraph SG["Group"]
        Y1["Yak"]
    end`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Membership Silent Drop", type: "flowchart", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openFlowchartEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
  await page.waitForTimeout(2000);
  return page.locator("svg[id^='mermaid-svg']");
}

function nodeByLabel(svg: import("@playwright/test").Locator, text: string) {
  return svg.locator("g.node").filter({ hasText: text }).first();
}

function clusterById(svg: import("@playwright/test").Locator, id: string) {
  return svg.locator(`g.cluster[id*='${id}']`).first();
}

function dropOverlay(page: import("@playwright/test").Page) {
  return page.locator("[data-flowchart-drop-overlay]");
}

function normalize(code: string) {
  return code.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
}

async function getEditorValue(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: { editor: { getModels: () => Array<{ getValue: () => string }> } };
      }
    ).monaco;
    return monaco?.editor.getModels()[0]?.getValue() ?? "";
  });
}

/** Pointer-down on a node + nudge past the 5px arm threshold; button held. */
async function startNodeDrag(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  label: string,
) {
  const node = nodeByLabel(svg, label);
  await expect(node).toBeVisible({ timeout: 15000 });
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 10, cy + 10, { steps: 5 });
}

/** Park the pointer over the center of a cluster during an active drag. */
async function hoverCluster(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  id: string,
) {
  const cluster = clusterById(svg, id);
  await expect(cluster).toBeVisible();
  const box = await cluster.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 12 });
  await page.waitForTimeout(150);
}

/**
 * Move the held pointer to empty canvas: below every rendered node/cluster
 * box, so no cluster rect can contain the cursor (dest resolves to null).
 */
async function moveToEmptyCanvas(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
) {
  const target = await svg.evaluate((el) => {
    let maxBottom = 0;
    let minX = Number.POSITIVE_INFINITY;
    for (const g of Array.from(el.querySelectorAll("g.node, g.cluster"))) {
      const r = g.getBoundingClientRect();
      maxBottom = Math.max(maxBottom, r.bottom);
      minX = Math.min(minX, r.left);
    }
    if (!Number.isFinite(minX)) minX = 40;
    return { x: minX + 40, y: Math.min(maxBottom + 80, window.innerHeight - 40) };
  });
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.waitForTimeout(200);
}

async function release(page: import("@playwright/test").Page) {
  await page.mouse.up();
  await page.waitForTimeout(1500);
}

test.describe("flowchart membership silent top-level drop", () => {
  test.setTimeout(120000);

  test("edge-only node dropped on empty canvas stays silent; blocked drop still toasts", async ({
    page,
  }) => {
    const svg = await openFlowchartEditor(page);
    const toasts = page.locator("[data-sonner-toast]");

    // No-op drop: arm a drag on the edge-only top-level node, release on empty
    // canvas (dest null, owner null → no change requested → must stay silent).
    await startNodeDrag(page, svg, "X1");
    await moveToEmptyCanvas(page, svg);
    await release(page);
    await page.waitForTimeout(1000);

    const toastTexts = await toasts.allTextContents();
    expect(toastTexts, `toast shown for a no-change drop: ${toastTexts.join(" | ")}`).toEqual([]);
    expect(normalize(await getEditorValue(page))).toBe(normalize(SEED_CODE));

    // Control: the same node dropped INTO a subgraph is genuinely blocked, so
    // the rejection ring shows and the drop must surface the error toast.
    await startNodeDrag(page, svg, "X1");
    await hoverCluster(page, svg, "SG");
    await expect(dropOverlay(page)).toBeVisible({ timeout: 5000 });
    await expect(dropOverlay(page).locator('[data-flowchart-drop-rect="rejected"]')).toBeVisible();
    await release(page);
    await expect(toasts.first()).toContainText("can't be moved", { timeout: 5000 });
    expect(normalize(await getEditorValue(page))).toBe(normalize(SEED_CODE));
  });
});
