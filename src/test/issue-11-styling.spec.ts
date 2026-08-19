import { test, expect } from "@playwright/test";

// Issue #11: flowchart styling is the reference. Class diagrams get the same
// `style <id>` popover; sequence/timeline must not offer B/I/align (those types
// render labels as plain SVG text, so markup would show as literal HTML).

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

async function clickFillRedSwatch(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-class-node-toolbar]");
    if (!root) return false;
    const fillLabel = Array.from(root.querySelectorAll("span")).find(
      (s) => s.textContent?.trim() === "Fill",
    );
    const fillRow = fillLabel?.closest("div.flex.flex-col");
    const red = fillRow?.querySelector('button[title="Red"]') as HTMLButtonElement | null;
    red?.click();
    return !!red;
  });
}

test.describe("issue 11 styling", () => {
  test("class toolbar applies and resets a fill style statement", async ({ page, request }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "Issue 11 Class Style",
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
    await expect(toolbar.getByText("Fill", { exact: true })).toBeVisible();

    expect(await clickFillRedSwatch(page)).toBe(true);

    const redFillSwatch = toolbar.locator('button[title="Red"]').nth(2);
    await expect(redFillSwatch).toHaveClass(/ring-2/);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .toContain("style Animal fill:#ef4444");

    const resetClicked = await page.evaluate(() => {
      const root = document.querySelector("[data-class-node-toolbar]");
      const btn = root
        ?.querySelector("button")
        ?.parentElement?.querySelector("button:not([title])");
      const reset = Array.from(root?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent?.trim() === "Reset style",
      ) as HTMLButtonElement | null;
      reset?.click();
      return !!reset;
    });
    expect(resetClicked).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("style Animal");

    await request.delete(`/api/diagrams/${id}`);
  });

  test("sequence inline editor has no B/I/align toolbar", async ({ page, request }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "Issue 11 Sequence Format",
      type: "sequence",
      code: [
        "sequenceDiagram",
        "    participant Alice",
        "    participant Bob",
        "    Alice->>Bob: Hello",
      ].join("\n"),
    });

    const text = svg.locator("text.actor").filter({ hasText: "Alice" }).first();
    await text.click({ force: true });
    await text.dblclick({ force: true });
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('[data-inline-toolbar] button[title="Bold (Ctrl+B)"]')).toHaveCount(
      0,
    );

    await page.keyboard.press("Escape");
    await request.delete(`/api/diagrams/${id}`);
  });

  test("timeline rename editor has no B/I/align toolbar", async ({ page, request }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "Issue 11 Timeline Format",
      type: "timeline",
      code: [
        "timeline",
        "    title Product Milestones",
        "    section Phase 1",
        "    2026 Q1 : Research",
      ].join("\n"),
    });

    const node = svg.locator("g.timeline-node").filter({ hasText: "Research" }).first();
    await expect(node).toBeVisible({ timeout: 15000 });
    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(700);
    await expect(page.locator("[data-timeline-node-toolbar]")).toBeVisible({ timeout: 10000 });
    await page.locator('[data-timeline-node-toolbar] button[title="Rename element"]').click();
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('[data-inline-toolbar] button[title="Bold (Ctrl+B)"]')).toHaveCount(
      0,
    );

    await page.keyboard.press("Escape");
    await request.delete(`/api/diagrams/${id}`);
  });

  test("flowchart inline editor still offers B/I/align and bold survives save", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "Issue 11 Flowchart Format",
      type: "flowchart",
      code: ["graph TD", "    A[Start] -->|Process| B[End]"].join("\n"),
    });

    const node = svg.locator("g.node").filter({ hasText: "Start" }).first();
    await node.dblclick({ force: true });
    const editor = page.locator('[data-inline-editor][contenteditable="true"]');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('[data-inline-toolbar] button[title="Bold (Ctrl+B)"]').first(),
    ).toBeVisible();

    await page.locator('[data-inline-toolbar] button[title="Bold (Ctrl+B)"]').first().click();
    await expect(editor.locator("b", { hasText: "Start" })).toBeVisible();
    await page.keyboard.press("Control+Enter");
    await expect(page.locator('[data-inline-editor][contenteditable="true"]')).toHaveCount(0);
    await expect(svg.locator("b", { hasText: "Start" })).toBeVisible({ timeout: 15000 });

    await request.delete(`/api/diagrams/${id}`);
  });
});
