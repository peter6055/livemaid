import { test, expect } from "@playwright/test";

// Issue #47 (follow-up to #35): dragging an edge-bearing declared node
// (`A[X] --> B`) into a subgraph must auto-split — bare edge stays at its
// original index, declaration moves with dest indent, committed in one undo
// step via handleCodeChange. Edge-only (`A --> B`) stays blocked.
// shortcut: drag simulation reuses the mouse-path helpers from
// flowchart-node-membership.spec.ts; undo-step count is observed via
// editor value, not clipboard internals.
const SPLIT_SEED = `flowchart TD
    A[X] --> B
    subgraph sg
        C[Z]
    end`;

const EDGE_ONLY_SEED = `flowchart TD
    A --> B
    subgraph sg
        C[Z]
    end`;

test.describe("flowchart node autosplit drag (issue #47)", () => {
  async function createDiagram(
    request: import("@playwright/test").APIRequestContext,
    code: string,
  ): Promise<string> {
    const res = await request.post("/api/diagrams", {
      data: { name: "Seed Flowchart Autosplit Case", type: "flowchart", code },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).id as string;
  }

  async function openFlowchartEditor(page: import("@playwright/test").Page, id: string) {
    await page.goto(`/editor/${id}`);
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

  async function getApiCode(page: import("@playwright/test").Page, id: string): Promise<string> {
    const res = await page.request.get(`/api/diagrams/${id}`);
    expect(res.ok()).toBeTruthy();
    return (await res.json()).code as string;
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

  async function waitForCodeChange(
    page: import("@playwright/test").Page,
    id: string,
    before: string,
  ): Promise<string> {
    for (let i = 0; i < 20; i += 1) {
      const code = await getApiCode(page, id);
      if (normalize(code) !== normalize(before)) return code;
      await page.waitForTimeout(300);
    }
    return getApiCode(page, id);
  }

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

  test.setTimeout(120000);

  test("drag edge-declared node into sg auto-splits: bare edge stays, decl nests, one undo restores", async ({
    page,
    request,
  }) => {
    const id = await createDiagram(request, SPLIT_SEED);
    try {
      const svg = await openFlowchartEditor(page, id);
      await startNodeDrag(page, svg, "X");
      await hoverCluster(page, svg, "sg");

      // New contract: success target, not the blocked pill.
      await expect(dropOverlay(page)).toHaveAttribute("data-flowchart-drop-target", "sg", {
        timeout: 5000,
      });
      await expect(
        dropOverlay(page).locator('[data-flowchart-drop-rect="node-target"]'),
      ).toBeVisible({ timeout: 5000 });
      await release(page);

      const code = normalize(await waitForCodeChange(page, id, SPLIT_SEED));
      const sg = subgraphBlock(code, "sg");
      // Declaration nested with dest indent; bare edge left at original index.
      expect(sg).toContain("        A[X]");
      expect(code).toMatch(/^    A --> B$/m);
      // No duplicate declarations.
      expect(code.match(/A\[X\]/g)).toHaveLength(1);
      // Valid Mermaid render survives the split.
      await expect(svg.locator("g.node").filter({ hasText: "X" }).first()).toBeVisible({
        timeout: 15000,
      });

      // Single undo restores the pre-move source.
      const moved = normalize(await getEditorValue(page));
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(800);
      expect(normalize(await getEditorValue(page))).toBe(normalize(SPLIT_SEED));
      expect(moved).not.toBe(normalize(SPLIT_SEED));

      // Reload persists the moved membership.
      await page.keyboard.press("Control+Shift+z");
      await page.waitForTimeout(800);
      const saved = normalize(await waitForCodeChange(page, id, SPLIT_SEED));
      await page.reload();
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
      await page.waitForTimeout(2000);
      expect(normalize(await getEditorValue(page))).toBe(saved);
    } finally {
      await request.delete(`/api/diagrams/${id}`);
    }
  });

  test("edge-only node drop stays blocked with the rejected pill", async ({ page, request }) => {
    const id = await createDiagram(request, EDGE_ONLY_SEED);
    try {
      const svg = await openFlowchartEditor(page, id);
      await startNodeDrag(page, svg, "A");
      await hoverCluster(page, svg, "sg");

      const overlay = dropOverlay(page);
      await expect(overlay).toBeVisible({ timeout: 5000 });
      await expect(overlay.locator('[data-flowchart-drop-rect="rejected"]')).toBeVisible({
        timeout: 5000,
      });
      await release(page);
      await page.waitForTimeout(1500);
      expect(normalize(await getApiCode(page, id))).toBe(normalize(EDGE_ONLY_SEED));
    } finally {
      await request.delete(`/api/diagrams/${id}`);
    }
  });
});
