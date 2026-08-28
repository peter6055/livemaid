import { test, expect } from "@playwright/test";

// Issue #31: unify the node style popover. State diagrams keep the "Border" (stroke-dasharray)
// line-style section (`showBorderStyle`), and the flowchart node toolbar replaces its three
// separate color dropdowns with a single "Style" trigger opening the shared popover. This spec
// verifies, in a real browser, the shared popover's Border grid, strong/light swatch shades, the
// empty-value toggle-off (property removed; whole line removed when emptied), and Reset.

async function readDiagramCode(request: import("@playwright/test").APIRequestContext, id: string) {
  const res = await request.get(`/api/diagrams/${id}`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { code: string }).code;
}

async function openEditor(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  opts: { name: string; type: string; code: string },
) {
  const res = await request.post("/api/diagrams", {
    data: { name: opts.name, type: opts.type, code: opts.code },
  });
  expect(res.ok()).toBeTruthy();
  const id = (await res.json()).id as string;
  expect(id).toBeTruthy();
  await page.goto(`/editor/${id}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
  await page.waitForTimeout(2500);
  return { id, svg: page.locator("svg[id^='mermaid-svg']") };
}

/** Read the swatches (title + inline background-color) of the row whose label matches `rowLabel`. */
async function readRowSwatches(
  page: import("@playwright/test").Page,
  toolbarSelector: string,
  rowLabel: string,
) {
  return page.evaluate(
    ({ sel, label }) => {
      const root = document.querySelector(sel);
      const span = Array.from(root?.querySelectorAll("span") ?? []).find(
        (s) => s.textContent?.trim() === label,
      );
      const row = span?.closest("div.flex.flex-col");
      const buttons = Array.from(row?.querySelectorAll("button") ?? []);
      return buttons.map((b) => ({
        title: (b as HTMLButtonElement).title,
        bg: (b as HTMLButtonElement).style.backgroundColor,
      }));
    },
    { sel: toolbarSelector, label: rowLabel },
  );
}

/** Native-click a swatch in the row whose label matches `rowLabel`. */
async function clickRowSwatch(
  page: import("@playwright/test").Page,
  toolbarSelector: string,
  rowLabel: string,
  swatchTitle: string,
) {
  return page.evaluate(
    ({ sel, label, title }) => {
      const root = document.querySelector(sel);
      const span = Array.from(root?.querySelectorAll("span") ?? []).find(
        (s) => s.textContent?.trim() === label,
      );
      const row = span?.closest("div.flex.flex-col");
      const swatch = row?.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
      swatch?.click();
      return !!swatch;
    },
    { sel: toolbarSelector, label: rowLabel, title: swatchTitle },
  );
}

async function clickResetStyle(page: import("@playwright/test").Page, toolbarSelector: string) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const reset = Array.from(root?.querySelectorAll("button") ?? []).find(
      (b) => b.textContent?.trim() === "Reset style",
    ) as HTMLButtonElement | null;
    reset?.click();
    return !!reset;
  }, toolbarSelector);
}

const STRONG_SALMON = "rgb(239, 99, 81)";
const LIGHT_SALMON = "rgb(255, 227, 220)";

test.describe("state + flowchart unified style popover (issue #31)", () => {
  test("state popover: Border section present, strong/light swatches, fill toggle-off + reset", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "State Flow Style State",
      type: "stateDiagram",
      code: ["stateDiagram-v2", "    [*] --> Still", "    Still --> [*]"].join("\n"),
    });

    const node = svg.locator("g.statediagram-state").filter({ hasText: "Still" }).first();
    await expect(node).toBeVisible({ timeout: 15000 });
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(700);

    const toolbar = page.locator("[data-state-node-toolbar]");
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await toolbar.locator('button[title="Custom style"]').click();
    await expect(toolbar.getByText("Border color", { exact: true })).toBeVisible();

    // State KEEPS the Border (stroke-dasharray) line-style section.
    await expect(toolbar.getByText("Border", { exact: true })).toBeVisible();
    await expect(toolbar.getByText("Solid", { exact: true })).toBeVisible();
    await expect(toolbar.getByText("Dashed", { exact: true })).toBeVisible();

    await toolbar.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/opencode/state-style-popover.png" });

    // Border + Text rows use STRONG shades; Fill uses LIGHT tints + a 10th Transparent swatch.
    const borderSwatches = await readRowSwatches(page, "[data-state-node-toolbar]", "Border color");
    expect(borderSwatches).toHaveLength(9);
    expect(borderSwatches.find((s) => s.title === "Salmon")?.bg).toBe(STRONG_SALMON);
    const textSwatches = await readRowSwatches(page, "[data-state-node-toolbar]", "Text color");
    expect(textSwatches).toHaveLength(9);
    expect(textSwatches.find((s) => s.title === "Salmon")?.bg).toBe(STRONG_SALMON);
    const fillSwatches = await readRowSwatches(page, "[data-state-node-toolbar]", "Fill");
    expect(fillSwatches.find((s) => s.title === "Salmon")?.bg).toBe(LIGHT_SALMON);
    expect(fillSwatches).toHaveLength(10);
    expect(fillSwatches.at(-1)?.title).toBe("Transparent");

    // Click Transparent fill -> writes an explicit `fill:transparent` (distinct from toggle-off).
    expect(await clickRowSwatch(page, "[data-state-node-toolbar]", "Fill", "Transparent")).toBe(
      true,
    );
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style Still fill:transparent");
    // Click Transparent again -> toggle-off removes the fill property entirely.
    expect(await clickRowSwatch(page, "[data-state-node-toolbar]", "Fill", "Transparent")).toBe(
      true,
    );
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style Still");

    // Click Red fill (light) -> writes `style Still fill:#ffe3dc`.
    expect(await clickRowSwatch(page, "[data-state-node-toolbar]", "Fill", "Salmon")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style Still fill:#ffe3dc");

    // Click Red fill again -> toggle-off removes `fill:`; the style line is now empty so it is
    // removed entirely.
    expect(await clickRowSwatch(page, "[data-state-node-toolbar]", "Fill", "Salmon")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style Still");

    // Re-apply then Reset -> style line gone.
    expect(await clickRowSwatch(page, "[data-state-node-toolbar]", "Fill", "Salmon")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style Still fill:#ffe3dc");
    expect(await clickResetStyle(page, "[data-state-node-toolbar]")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style Still");

    await request.delete(`/api/diagrams/${id}`);
  });

  test("flowchart: single Style trigger (no three color dropdowns), border present, fill+text toggle-off, reset", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "State Flow Style Flowchart",
      type: "flowchart",
      code: ["graph TD", "    A[Start] --> B[End]"].join("\n"),
    });

    const node = svg.locator("g.node").filter({ hasText: "Start" }).first();
    await expect(node).toBeVisible({ timeout: 15000 });
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(700);

    // Exactly one unified Style trigger; the three old color dropdowns are gone.
    await expect(page.locator('button[title="Custom style"]')).toHaveCount(1);
    await expect(page.locator('button[title="Background Color"]')).toHaveCount(0);
    await expect(page.locator('button[title="Border Color"]')).toHaveCount(0);
    await expect(page.locator('button[title="Text Color"]')).toHaveCount(0);

    // The flowchart NodeManipulationToolbar is the only `[data-inline-toolbar]` div present here
    // (an "Add comment to selection" button also carries `data-inline-toolbar`, so exclude buttons).
    const toolbar = page.locator("[data-inline-toolbar]:not(button)");
    // Real click on the trigger — verifies the Style button is actually reachable, not just that a
    // synthetic DOM dispatch fires it.
    await toolbar.locator('button[title="Custom style"]').click();
    await expect(toolbar.getByText("Border color", { exact: true })).toBeVisible();

    // Flowchart does NOT offer a Border (stroke-dasharray) section.
    for (const label of ["Border", "Solid", "Dashed", "Dotted", "Large Dashed"]) {
      await expect(toolbar.getByText(label, { exact: true })).toHaveCount(0);
    }

    await toolbar.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/opencode/flowchart-style-popover.png" });

    // Red fill swatch (light) -> writes `style A fill:#ffe3dc` (toggles the trigger open state off
    // is NOT what happens here — we click the swatch, which stays).
    expect(await clickRowSwatch(page, "[data-inline-toolbar]:not(button)", "Fill", "Salmon")).toBe(
      true,
    );
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style A fill:#ffe3dc");

    // Click Red fill again -> toggle-off (handleUpdateStyle empty path) removes `fill:`; line empty
    // so the whole style line is removed.
    expect(await clickRowSwatch(page, "[data-inline-toolbar]:not(button)", "Fill", "Salmon")).toBe(
      true,
    );
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style A");

    // Text color: click strong Red in the Text color row -> `color:#ef6351`.
    expect(
      await clickRowSwatch(page, "[data-inline-toolbar]:not(button)", "Text color", "Salmon"),
    ).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style A color:#ef6351");

    // Text color toggle-off (handleFormatNodeLabel + handleUpdateStyle empty path): line emptied
    // so removed entirely.
    expect(
      await clickRowSwatch(page, "[data-inline-toolbar]:not(button)", "Text color", "Salmon"),
    ).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style A");

    // Re-apply then Reset -> style line gone.
    expect(
      await clickRowSwatch(page, "[data-inline-toolbar]:not(button)", "Text color", "Salmon"),
    ).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style A color:#ef6351");
    expect(await clickResetStyle(page, "[data-inline-toolbar]:not(button)")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style A");

    await request.delete(`/api/diagrams/${id}`);
  });
});
