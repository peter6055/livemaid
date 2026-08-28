import { test, expect } from "@playwright/test";

// Issue #31: unify the node style popover. Class + ER diagrams must NOT offer a Border
// (stroke-dasharray) line-style section (Mermaid doesn't support it), and the swatch rows must
// show STRONG (600) shades for Border color / Text color and LIGHT (100) tints + Transparent
// for Fill. These assertions would FAIL against the pre-refactor code (which had the Border
// section and mid-tone 500 shades), so this spec doubles as the red-before detection.

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

test.describe("class + er unified style popover (issue #31)", () => {
  test("class style popover: no Border section, strong/light swatches, reset removes line", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "Class ER Style Popover",
      type: "classDiagram",
      code: [
        "classDiagram",
        "class Animal {",
        "  +String name",
        "}",
        "class Dog",
        "Animal <|-- Dog",
      ].join("\n"),
    });

    const node = svg.locator("g.node").filter({ hasText: "Animal" }).first();
    await expect(node).toBeVisible({ timeout: 15000 });
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(700);

    const toolbar = page.locator("[data-class-node-toolbar]");
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await toolbar.locator('button[title="Custom style"]').click();
    await expect(toolbar.getByText("Border color", { exact: true })).toBeVisible();

    await toolbar.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/opencode/class-style-popover.png" });

    // Core new behavior: the Border (stroke-dasharray) section must be ABSENT for class diagrams.
    for (const label of ["Border", "Solid", "Dashed", "Dotted", "Large Dashed"]) {
      await expect(toolbar.getByText(label, { exact: true })).toHaveCount(0);
    }

    // Border color + Text color rows: 9 swatches, STRONG shades, no Transparent.
    const borderSwatches = await readRowSwatches(page, "[data-class-node-toolbar]", "Border color");
    expect(borderSwatches.map((s) => s.title)).toEqual([
      "Salmon",
      "Sand",
      "Kelp",
      "Lagoon",
      "Harbor",
      "Deep",
      "Urchin",
      "Shell",
      "Drift",
    ]);
    expect(borderSwatches.find((s) => s.title === "Salmon")?.bg).toBe(STRONG_SALMON);
    expect(borderSwatches.find((s) => s.title === "Salmon")?.bg).not.toBe(LIGHT_SALMON);

    const textSwatches = await readRowSwatches(page, "[data-class-node-toolbar]", "Text color");
    expect(textSwatches.find((s) => s.title === "Salmon")?.bg).toBe(STRONG_SALMON);

    // Fill row: LIGHT tints + a 10th Transparent swatch.
    const fillSwatches = await readRowSwatches(page, "[data-class-node-toolbar]", "Fill");
    expect(fillSwatches.find((s) => s.title === "Salmon")?.bg).toBe(LIGHT_SALMON);
    expect(fillSwatches).toHaveLength(10);
    expect(fillSwatches.at(-1)?.title).toBe("Transparent");

    // Wiring: clicking Border-color Red writes the strong hex.
    expect(await clickRowSwatch(page, "[data-class-node-toolbar]", "Border color", "Salmon")).toBe(
      true,
    );
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style Animal stroke:#ef6351");

    // Wiring: clicking Fill Red writes the light tint.
    expect(await clickRowSwatch(page, "[data-class-node-toolbar]", "Fill", "Salmon")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("fill:#ffe3dc");

    // Reset removes the whole style line.
    expect(await clickResetStyle(page, "[data-class-node-toolbar]")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style Animal");

    await request.delete(`/api/diagrams/${id}`);
  });

  test("er style popover: no Border section, strong/light swatches, transparent fill, reset removes line", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "ER Style Popover",
      type: "erDiagram",
      code: [
        "erDiagram",
        "CUSTOMER {",
        "    string id",
        "    string name",
        "}",
        "ORDER {",
        "    string id",
        "}",
        "CUSTOMER ||--o{ ORDER : places",
      ].join("\n"),
    });

    // ORDER sits low enough that its floating toolbar clears the top-left editor chrome, so a
    // real Playwright click is hit-testable (clicking CUSTOMER puts the toolbar under that chrome).
    const entity = svg.locator("g.node[id*='-entity-']").filter({ hasText: "ORDER" }).first();
    await expect(entity).toBeVisible({ timeout: 15000 });
    const box = await entity.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(700);

    const toolbar = page.locator("[data-er-node-toolbar]");
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    // A real click (not a synthetic DOM dispatch) — verifies the trigger is actually reachable.
    await toolbar.locator('button[title="Custom style"]').click();
    await expect(toolbar.getByText("Border color", { exact: true })).toBeVisible();

    await toolbar.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/opencode/er-style-popover.png" });

    // Core new behavior: the Border (stroke-dasharray) section must be ABSENT for ER diagrams.
    for (const label of ["Border", "Solid", "Dashed", "Dotted", "Large Dashed"]) {
      await expect(toolbar.getByText(label, { exact: true })).toHaveCount(0);
    }

    const borderSwatches = await readRowSwatches(page, "[data-er-node-toolbar]", "Border color");
    expect(borderSwatches.find((s) => s.title === "Salmon")?.bg).toBe(STRONG_SALMON);

    const textSwatches = await readRowSwatches(page, "[data-er-node-toolbar]", "Text color");
    expect(textSwatches.find((s) => s.title === "Salmon")?.bg).toBe(STRONG_SALMON);

    const fillSwatches = await readRowSwatches(page, "[data-er-node-toolbar]", "Fill");
    expect(fillSwatches.find((s) => s.title === "Salmon")?.bg).toBe(LIGHT_SALMON);
    expect(fillSwatches).toHaveLength(10);
    expect(fillSwatches.at(-1)?.title).toBe("Transparent");

    // Wiring: clicking Transparent fill writes an explicit `fill:transparent`.
    expect(await clickRowSwatch(page, "[data-er-node-toolbar]", "Fill", "Transparent")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style ORDER fill:transparent");
    // Toggle Transparent off removes the fill property (line emptied -> removed).
    expect(await clickRowSwatch(page, "[data-er-node-toolbar]", "Fill", "Transparent")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style ORDER");

    // Wiring: clicking Text-color Red writes the strong hex to the entity's style line.
    expect(await clickRowSwatch(page, "[data-er-node-toolbar]", "Text color", "Salmon")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style ORDER color:#ef6351");

    // Reset removes the whole style line.
    expect(await clickResetStyle(page, "[data-er-node-toolbar]")).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style ORDER");

    await request.delete(`/api/diagrams/${id}`);
  });
});
