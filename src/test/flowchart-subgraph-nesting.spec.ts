import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Flowchart subgraph nesting (issue #41): drag a WHOLE subgraph into another
// subgraph so it becomes a nested child. The moved group keeps its identity +
// contents, the Mermaid source updates, self/descendant drops are rejected,
// and undo/redo + save/reopen round-trip the nesting.
const SEED_CODE = `flowchart TD
    subgraph A["Subgraph A"]
        A1["A1"]
    end
    subgraph B["Subgraph B"]
        B1["B1"]
        B2["B2"]
        B1 --> B2
    end`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Subgraph Nesting", type: "flowchart", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openDiagram(page: Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
  await page.waitForTimeout(2500);
  return page.locator("svg[id^='mermaid-svg']");
}

function cluster(svg: import("@playwright/test").Locator, title: string) {
  // Mermaid renders child nodes as siblings of (not inside) the cluster, so
  // filtering by the title text resolves the container group uniquely.
  return svg.locator("g.cluster").filter({ hasText: title }).first();
}

function dropOverlay(page: Page) {
  return page.locator("[data-flowchart-drop-overlay]");
}

async function getEditorValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: { editor: { getModels: () => Array<{ getValue: () => string }> } };
      }
    ).monaco;
    return monaco?.editor.getModels()[0]?.getValue() ?? "";
  });
}

function normalize(code: string) {
  return code.replace(/ /g, " ").replace(/\r\n/g, "\n");
}

/** Poll the API until the persisted code differs from `prev` (autosave ~1500ms). */
async function waitForPersistedChange(page: Page, prev: string): Promise<string> {
  let last = prev;
  for (let i = 0; i < 25; i += 1) {
    // Transient non-OK polls (dev-server hiccup) must not fail the test.
    const res = await page.request.get(`/api/diagrams/${DIAGRAM_ID}`);
    if (res.ok()) {
      last = (await res.json()).code as string;
      if (normalize(last) !== normalize(prev)) return last;
    }
    await page.waitForTimeout(300);
  }
  return last;
}

async function readPersistedCode(request: APIRequestContext): Promise<string> {
  const res = await request.get(`/api/diagrams/${DIAGRAM_ID}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).code as string;
}

/** Pointer-down on the cluster TITLE label (click-through interior workaround). */
async function startSubgraphDrag(
  page: Page,
  svg: import("@playwright/test").Locator,
  title: string,
) {
  const label = cluster(svg, title).locator("g.cluster-label").first();
  await expect(label).toBeVisible({ timeout: 15000 });
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 6, box!.y + box!.height / 2 + 6, {
    steps: 3,
  });
}

/** Pointer-down on the cluster BORDER (left edge): same subgraph-drag as the
 *  title, but works when the title sits under the top toolbar (nested A). */
async function startSubgraphDragFromBorder(
  page: Page,
  svg: import("@playwright/test").Locator,
  title: string,
) {
  const target = cluster(svg, title);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  // Probe the rect perimeter (stroke is the only hittable part; the interior
  // is click-through) for a point on cluster chrome, not on a child node.
  const point = await page.evaluate(
    ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => {
      const candidates: Array<{ x: number; y: number }> = [];
      for (const frac of [0.5, 0.35, 0.65, 0.25, 0.75, 0.85, 0.15]) {
        for (const dx of [1, 2, 0]) {
          candidates.push({ x: x + dx, y: y + h * frac }); // left edge
          candidates.push({ x: x + w - dx, y: y + h * frac }); // right edge
        }
        for (const dy of [1, 2, 0]) {
          candidates.push({ x: x + w * frac, y: y + h - dy }); // bottom edge
        }
      }
      for (const c of candidates) {
        const hit = document.elementFromPoint(c.x, c.y) as Element | null;
        if (hit && !hit.closest(".node") && hit.closest("g.cluster")) {
          return { x: c.x, y: c.y };
        }
      }
      return null;
    },
    { x: box!.x, y: box!.y, w: box!.width, h: box!.height },
  );
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await page.mouse.down();
  await page.mouse.move(point!.x + 6, point!.y + 6, { steps: 3 });
}

/** Park the pointer over a cluster center during an active drag. */
async function hoverCluster(page: Page, svg: import("@playwright/test").Locator, title: string) {
  const target = cluster(svg, title);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 12 });
  await page.waitForTimeout(200);
}

async function cancelDrag(page: Page) {
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function release(page: Page) {
  await page.mouse.up();
  await page.waitForTimeout(300);
}

function expectNested(code: string) {
  const flat = normalize(code);
  // Whole B block nested inside A with children + internal edge intact.
  expect(flat).toMatch(/subgraph A[\s\S]*subgraph B[\s\S]*end[\s\S]*end/);
  expect(flat).toContain('B1["B1"]');
  expect(flat).toContain('B2["B2"]');
  expect(flat).toContain("B1 --> B2");
  expect(flat).toContain('A1["A1"]');
  // Single declaration, no orphan/duplicated block closers.
  expect(flat.match(/subgraph\s+B\b/g)?.length).toBe(1);
  expect(flat.match(/subgraph\s+A\b/g)?.length).toBe(1);
  expect(flat.match(/^\s*end\s*$/gm)?.length).toBe(2);
  // Nested decl is indented deeper than its parent.
  const indentOf = (line: string) => line.match(/^(\s*)/)?.[1].length ?? 0;
  const lines = flat.split("\n");
  const aDecl = lines.find((l) => /subgraph\s+A\b/.test(l))!;
  const bDecl = lines.find((l) => /subgraph\s+B\b/.test(l))!;
  expect(indentOf(bDecl)).toBeGreaterThan(indentOf(aDecl));
  expect(flat.indexOf("subgraph A")).toBeLessThan(flat.indexOf("subgraph B"));
  expect(flat.indexOf("subgraph B")).toBeLessThan(flat.indexOf("B1 --> B2"));
}

test.describe("flowchart subgraph nesting (issue #41)", () => {
  test.setTimeout(120000);

  test("hover shows subgraph-target overlay on dest, rejected ring on self", async ({ page }) => {
    const svg = await openDiagram(page);

    // Valid dest: overlay kind=subgraph, target=A, subgraph-target ring.
    await startSubgraphDrag(page, svg, "Subgraph B");
    await hoverCluster(page, svg, "Subgraph A");
    const overlay = dropOverlay(page);
    await expect(overlay).toBeVisible({ timeout: 5000 });
    await expect(overlay).toHaveAttribute("data-flowchart-drop-kind", "subgraph");
    await expect(overlay).toHaveAttribute("data-flowchart-drop-target", "A");
    await expect(overlay.locator('[data-flowchart-drop-rect="subgraph-target"]')).toBeVisible();
    await cancelDrag(page);

    // Self hover: rejected ring (overlay kind stays subgraph, rect=rejected).
    await startSubgraphDrag(page, svg, "Subgraph B");
    await hoverCluster(page, svg, "Subgraph B");
    const rejected = dropOverlay(page);
    await expect(rejected).toBeVisible({ timeout: 5000 });
    await expect(rejected).toHaveAttribute("data-flowchart-drop-kind", "subgraph");
    await expect(rejected.locator('[data-flowchart-drop-rect="rejected"]')).toBeVisible();
    await cancelDrag(page);

    // Cancels committed nothing: editor + persisted code still the flat seed.
    expect(normalize(await getEditorValue(page))).toBe(normalize(SEED_CODE));
  });

  test("drop B into A nests the whole block with contents intact", async ({ page }) => {
    const svg = await openDiagram(page);
    await startSubgraphDrag(page, svg, "Subgraph B");
    await hoverCluster(page, svg, "Subgraph A");
    await release(page);

    const persisted = await waitForPersistedChange(page, SEED_CODE);
    expectNested(persisted);
    // Monaco agrees with the API once autosave lands.
    expect(normalize(await getEditorValue(page))).toBe(normalize(persisted));
    // Nested cluster still renders both titles.
    await expect(svg.locator("g.cluster").filter({ hasText: "Subgraph A" }).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(svg.locator("g.cluster").filter({ hasText: "Subgraph B" }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("self-drop leaves the code unchanged", async ({ page, request }) => {
    const svg = await openDiagram(page);
    await startSubgraphDrag(page, svg, "Subgraph B");
    await hoverCluster(page, svg, "Subgraph B");
    await release(page);

    await page.waitForTimeout(2500); // past the ~1500ms autosave debounce
    expect(normalize(await getEditorValue(page))).toBe(normalize(SEED_CODE));
    expect(normalize(await readPersistedCode(request))).toBe(normalize(SEED_CODE));
  });

  test("descendant-drop (A into B after nesting) leaves the code unchanged", async ({
    page,
    request,
  }) => {
    const svg = await openDiagram(page);
    // Arrange: nest B into A first.
    await startSubgraphDrag(page, svg, "Subgraph B");
    await hoverCluster(page, svg, "Subgraph A");
    await release(page);
    const nested = await waitForPersistedChange(page, SEED_CODE);
    expectNested(nested);

    // Act: drag ancestor A onto its own descendant B (innermost rect wins).
    // Fresh render resets the post-drop pan (nested A's title sits under the
    // floating toolbar right after the drop); nesting itself persists.
    const svg2 = await openDiagram(page);
    await startSubgraphDragFromBorder(page, svg2, "Subgraph A");
    await hoverCluster(page, svg2, "Subgraph B");
    await expect(dropOverlay(page).locator('[data-flowchart-drop-rect="rejected"]')).toBeVisible({
      timeout: 5000,
    });
    await release(page);

    await page.waitForTimeout(2500);
    expect(normalize(await getEditorValue(page))).toBe(normalize(nested));
    expect(normalize(await readPersistedCode(request))).toBe(normalize(nested));
  });

  test("undo restores flat hierarchy, redo re-nests in a single step", async ({ page }) => {
    const svg = await openDiagram(page);
    await startSubgraphDrag(page, svg, "Subgraph B");
    await hoverCluster(page, svg, "Subgraph A");
    await release(page);
    const nested = await waitForPersistedChange(page, SEED_CODE);
    expectNested(nested);

    await page.keyboard.press("Control+z");
    await page.waitForTimeout(800);
    expect(normalize(await getEditorValue(page))).toBe(normalize(SEED_CODE));

    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(800);
    const redone = normalize(await getEditorValue(page));
    expectNested(redone);
    expect(redone).toBe(normalize(nested));
  });

  test("reload persists the nesting; API and editor agree", async ({ page, request }) => {
    const svg = await openDiagram(page);
    await startSubgraphDrag(page, svg, "Subgraph B");
    await hoverCluster(page, svg, "Subgraph A");
    await release(page);
    const nested = await waitForPersistedChange(page, SEED_CODE);
    expectNested(nested);

    await page.reload();
    await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
    await page.waitForTimeout(2500);
    const persisted = normalize(await readPersistedCode(request));
    expectNested(persisted);
    expect(normalize(await getEditorValue(page))).toBe(persisted);
  });

  test("drag works after zoom-in (boxes re-measured post-transform)", async ({ page }) => {
    const svg = await openDiagram(page);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(1000);

    await startSubgraphDrag(page, svg, "Subgraph B");
    await hoverCluster(page, svg, "Subgraph A");
    await release(page);

    const persisted = await waitForPersistedChange(page, SEED_CODE);
    expectNested(persisted);
  });
});
