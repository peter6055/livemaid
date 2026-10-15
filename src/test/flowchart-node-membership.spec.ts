import { test, expect } from "@playwright/test";

// Flowchart node membership drag (issue #35): drag a node into, out of, or
// between subgraphs to change its membership. Hovering a dest cluster shows
// the node-target overlay; mouseup commits via handleCodeChange (autosaved,
// debounced ~1500ms); sub-threshold release is a plain click and Escape
// cancels — both leave the code unchanged.
const SEED_CODE = `flowchart TD
    subgraph S1["Team A"]
        A1["Alpha"]
    end
    subgraph S2["Team B"]
        B1["Beta"]
    end
    T1["Lone"]
    A1 --> T1`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Flowchart Membership", type: "flowchart", code: SEED_CODE },
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

async function getApiCode(page: import("@playwright/test").Page): Promise<string> {
  const res = await page.request.get(`/api/diagrams/${DIAGRAM_ID}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).code as string;
}

async function waitForCodeChange(
  page: import("@playwright/test").Page,
  before: string,
): Promise<string> {
  // Autosave is debounced (1500ms) + an in-flight PUT, so poll until persisted.
  for (let i = 0; i < 20; i += 1) {
    const code = await getApiCode(page);
    if (normalize(code) !== normalize(before)) return code;
    await page.waitForTimeout(300);
  }
  return getApiCode(page);
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

/** Park the pointer over a top-level node (outside all clusters). */
async function hoverNodeCenter(
  page: import("@playwright/test").Page,
  svg: import("@playwright/test").Locator,
  label: string,
) {
  const node = nodeByLabel(svg, label);
  await expect(node).toBeVisible();
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 12 });
  await page.waitForTimeout(150);
}

async function release(page: import("@playwright/test").Page) {
  await page.mouse.up();
  await page.waitForTimeout(1500);
}

function subgraphBlock(code: string, id: string): string {
  const lines = normalize(code).split("\n");
  const start = lines.findIndex((l) => l.includes(`subgraph ${id}`));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((l, i) => i > start && l.trim() === "end");
  expect(end).toBeGreaterThan(start);
  return lines.slice(start, end + 1).join("\n");
}

test.describe("flowchart node membership drag (issue #35)", () => {
  test.setTimeout(120000);

  test("hover dest subgraph shows node overlay; leaving clears it", async ({ page }) => {
    const svg = await openFlowchartEditor(page);
    await startNodeDrag(page, svg, "Lone");
    await hoverCluster(page, svg, "S2");

    const overlay = dropOverlay(page);
    await expect(overlay).toBeVisible({ timeout: 5000 });
    await expect(overlay).toHaveAttribute("data-flowchart-drop-kind", "node");
    await expect(overlay).toHaveAttribute("data-flowchart-drop-target", "S2");
    await expect(overlay.locator('[data-flowchart-drop-rect="node-target"]')).toBeVisible();

    // Leaving all clusters shows the top-level hint (null dest means top-level).
    await hoverNodeCenter(page, svg, "Lone");
    await expect(dropOverlay(page)).toHaveAttribute("data-flowchart-drop-target", "root", {
      timeout: 5000,
    });
    await expect(page.locator("[data-flowchart-top-level-hint]")).toBeVisible();

    await release(page);
    expect(normalize(await getApiCode(page))).toBe(normalize(SEED_CODE));
  });

  test("drop top-level node into S2 nests its decl with correct indent", async ({ page }) => {
    const svg = await openFlowchartEditor(page);
    await startNodeDrag(page, svg, "Lone");
    await hoverCluster(page, svg, "S2");
    await expect(dropOverlay(page)).toHaveAttribute("data-flowchart-drop-target", "S2", {
      timeout: 5000,
    });
    await release(page);

    const code = normalize(await waitForCodeChange(page, SEED_CODE));
    const s2 = subgraphBlock(code, "S2");
    expect(s2).toContain('        T1["Lone"]');
    // No duplicate or stale top-level declaration.
    expect(code.match(/T1\["Lone"\]/g)).toHaveLength(1);
    expect(code).not.toMatch(/^    T1\["Lone"\]$/m);
    expect(code).toContain("A1 --> T1");
  });

  test("drop node out of S1 to top level unwraps its decl", async ({ page }) => {
    const svg = await openFlowchartEditor(page);
    await startNodeDrag(page, svg, "Alpha");
    await hoverNodeCenter(page, svg, "Lone");
    // Top-level hint (null dest means "release to make top-level").
    await expect(dropOverlay(page)).toHaveAttribute("data-flowchart-drop-target", "root", {
      timeout: 5000,
    });
    await expect(page.locator("[data-flowchart-top-level-hint]")).toBeVisible();
    await release(page);

    const code = normalize(await waitForCodeChange(page, SEED_CODE));
    expect(code).toMatch(/^    A1\["Alpha"\]$/m);
    expect(subgraphBlock(code, "S1")).not.toContain('A1["Alpha"]');
    expect(code.match(/A1\["Alpha"\]/g)).toHaveLength(1);
    expect(code).toContain("A1 --> T1");
  });

  test("drop node directly S1 to S2", async ({ page }) => {
    const svg = await openFlowchartEditor(page);
    await startNodeDrag(page, svg, "Alpha");
    await hoverCluster(page, svg, "S2");
    await expect(dropOverlay(page)).toHaveAttribute("data-flowchart-drop-target", "S2", {
      timeout: 5000,
    });
    await release(page);

    const code = normalize(await waitForCodeChange(page, SEED_CODE));
    expect(subgraphBlock(code, "S2")).toContain('        A1["Alpha"]');
    expect(subgraphBlock(code, "S1")).not.toContain('A1["Alpha"]');
    expect(code.match(/A1\["Alpha"\]/g)).toHaveLength(1);
  });

  test("moved node preserves label and cross-boundary edge stays intact", async ({ page }) => {
    const svg = await openFlowchartEditor(page);
    await startNodeDrag(page, svg, "Beta");
    await hoverCluster(page, svg, "S1");
    await expect(dropOverlay(page)).toHaveAttribute("data-flowchart-drop-target", "S1", {
      timeout: 5000,
    });
    await release(page);

    const code = normalize(await waitForCodeChange(page, SEED_CODE));
    // Full label/shape declaration preserved, moved into S1.
    expect(subgraphBlock(code, "S1")).toContain('        B1["Beta"]');
    // The unrelated cross-boundary edge survives byte-for-byte.
    expect(code).toContain("    A1 --> T1");
    expect(code).toContain('    T1["Lone"]');
  });

  test("same-scope drop and Escape-cancel leave code unchanged", async ({ page }) => {
    const svg = await openFlowchartEditor(page);

    // Same-scope hover shows the rejected ring; dropping changes nothing.
    await startNodeDrag(page, svg, "Beta");
    await hoverCluster(page, svg, "S2");
    const overlay = dropOverlay(page);
    await expect(overlay).toBeVisible({ timeout: 5000 });
    await expect(overlay).toHaveAttribute("data-flowchart-drop-target", "root");
    await expect(overlay.locator('[data-flowchart-drop-rect="rejected"]')).toBeVisible();
    await release(page);
    await page.waitForTimeout(1500);
    expect(normalize(await getApiCode(page))).toBe(normalize(SEED_CODE));

    // Escape cancels an armed drag; the follow-up mouseup is a no-op.
    await startNodeDrag(page, svg, "Alpha");
    await hoverCluster(page, svg, "S2");
    await expect(dropOverlay(page)).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(dropOverlay(page)).toHaveCount(0);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    expect(normalize(await getApiCode(page))).toBe(normalize(SEED_CODE));
    expect(normalize(await getEditorValue(page))).toBe(normalize(SEED_CODE));
  });

  test("undo restores pre-move source, redo reapplies in a single step", async ({ page }) => {
    const svg = await openFlowchartEditor(page);
    await startNodeDrag(page, svg, "Lone");
    await hoverCluster(page, svg, "S2");
    await release(page);
    await waitForCodeChange(page, SEED_CODE);

    const moved = normalize(await getEditorValue(page));
    expect(moved).toContain('        T1["Lone"]');

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(800);
    const undone = normalize(await getEditorValue(page));
    expect(undone).toBe(normalize(SEED_CODE));

    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(800);
    const redone = normalize(await getEditorValue(page));
    expect(redone).toBe(moved);
  });

  test("reload persists the moved membership", async ({ page }) => {
    const svg = await openFlowchartEditor(page);
    await startNodeDrag(page, svg, "Lone");
    await hoverCluster(page, svg, "S2");
    await release(page);
    const saved = normalize(await waitForCodeChange(page, SEED_CODE));
    expect(saved).toContain('        T1["Lone"]');

    await page.reload();
    await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
    await page.waitForTimeout(2000);
    expect(normalize(await getEditorValue(page))).toBe(saved);
  });

  test("drag works after zoom-in with re-measured boxes", async ({ page }) => {
    const svg = await openFlowchartEditor(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(500);

    // Re-query boxes post-transform (helpers measure fresh each call).
    await startNodeDrag(page, svg, "Beta");
    await hoverCluster(page, svg, "S1");
    await expect(dropOverlay(page)).toHaveAttribute("data-flowchart-drop-target", "S1", {
      timeout: 5000,
    });
    await release(page);

    const code = normalize(await waitForCodeChange(page, SEED_CODE));
    expect(subgraphBlock(code, "S1")).toContain('        B1["Beta"]');
    expect(code.match(/B1\["Beta"\]/g)).toHaveLength(1);
  });
});
