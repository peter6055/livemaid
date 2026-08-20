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

  test("state toolbar reads classDef/class styles and reset removes the assignment", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "Issue 11 State ClassDef",
      type: "stateDiagram",
      code: [
        "stateDiagram-v2",
        "    [*] --> Still",
        "    Still --> [*]",
        "    Still --> Moving",
        "    Moving --> Still",
        "    Moving --> Crash",
        "    Crash --> [*]",
        "    classDef red fill:#ef4444",
        "    class Still red",
      ].join("\n"),
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
    await expect(toolbar.getByText("Fill", { exact: true })).toBeVisible();

    // The Red fill swatch should already be active because classDef red is applied.
    const fillRedClass = await page.evaluate(() => {
      const root = document.querySelector("[data-state-node-toolbar]");
      const fillLabel = Array.from(root?.querySelectorAll("span") ?? []).find(
        (s) => s.textContent?.trim() === "Fill",
      );
      const fillRow = fillLabel?.closest("div.flex.flex-col");
      const red = fillRow?.querySelector('button[title="Red"]') as HTMLButtonElement | null;
      return red?.className ?? "";
    });
    expect(fillRedClass).toMatch(/ring-2/);

    // Reset should remove the class assignment (not write a style line). Use a native click
    // (HTMLElement.click) so the handler fires even though the diagram toolbox overlaps the button.
    const resetClicked = await page.evaluate(() => {
      const root = document.querySelector("[data-state-node-toolbar]");
      const reset = Array.from(root?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent?.trim() === "Reset style",
      ) as HTMLButtonElement | null;
      reset?.click();
      return !!reset;
    });
    expect(resetClicked).toBe(true);
    await expect
      .poll(async () => readDiagramCode(request, id), { timeout: 10000 })
      .not.toContain("class Still red");
    const finalCode = await readDiagramCode(request, id);
    expect(finalCode).not.toContain("style Still");

    await request.delete(`/api/diagrams/${id}`);
  });

  test("state composite toolbar offers the style bar (regression: composites were excluded)", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "Issue 11 State Composite Style",
      type: "stateDiagram",
      code: [
        "stateDiagram-v2",
        "    [*] --> Parent",
        "    state Parent {",
        "        [*] --> Child",
        "        Child --> [*]",
        "    }",
        "    Parent --> [*]",
      ].join("\n"),
    });

    const cluster = svg.locator("g.statediagram-cluster").first();
    await expect(cluster).toBeVisible({ timeout: 15000 });
    // Click the composite's own title (the "Parent" cluster label), not its center — the center is
    // occupied by the nested "Child" state, which would select the child instead.
    const title = cluster
      .locator(".state-title, .cluster-label, text, foreignObject div")
      .filter({ hasText: "Parent" })
      .first();
    await title.click({ force: true });
    await page.waitForTimeout(700);

    const toolbar = page.locator("[data-state-node-toolbar]");
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await expect(toolbar.locator('button[title="Custom style"]')).toBeVisible();
    // Shape morphing is state-nodes-only and must NOT appear for a composite.
    await expect(toolbar.locator('button[title="Change shape"]')).toHaveCount(0);

    await request.delete(`/api/diagrams/${id}`);
  });

  test("double-clicking a nested node inside a composite selects the node, not the composite", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "State Composite Inner Node Double-click",
      type: "stateDiagram",
      code: [
        "stateDiagram-v2",
        "    [*] --> Parent",
        "    state Parent {",
        "        [*] --> Child",
        "        Child --> [*]",
        "    }",
        "    Parent --> [*]",
      ].join("\n"),
    });

    const cluster = svg.locator("g.statediagram-cluster").first();
    await expect(cluster).toBeVisible({ timeout: 15000 });

    // Double-click the nested "Child" state that lives inside the composite. The first click must
    // select the inner node (not the parent composite), so the state toolbar — with its
    // state-only "Change shape" button — appears instead of the composite toolbar.
    // NOTE: Mermaid renders the nested state as a sibling of the cluster group (its own
    // `g.node.statediagram-state`), not as a DOM child of `g.statediagram-cluster`.
    const child = svg.locator("g.statediagram-state").filter({ hasText: "Child" }).first();
    await expect(child).toBeVisible({ timeout: 10000 });
    const box = await child.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(700);

    const toolbar = page.locator("[data-state-node-toolbar]");
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    // A nested state must show the state-only shape-morph control...
    await expect(toolbar.locator('button[title="Change shape"]')).toBeVisible();
    // ...and must NOT be misidentified as the composite (which never shows "Change shape").
    await expect(toolbar.locator('button[title="Delete composite"]')).toHaveCount(0);

    await request.delete(`/api/diagrams/${id}`);
  });

  test("double-clicking empty space inside a composite selects the composite", async ({
    page,
    request,
  }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "State Composite Empty Space Double-click",
      type: "stateDiagram",
      code: [
        "stateDiagram-v2",
        "    [*] --> Parent",
        "    state Parent {",
        "        [*] --> Child",
        "        Child --> [*]",
        "    }",
        "    Parent --> [*]",
      ].join("\n"),
    });

    const cluster = svg.locator("g.statediagram-cluster").first();
    await expect(cluster).toBeVisible({ timeout: 15000 });

    // Double-click a point inside the composite's interior but away from the nested "Child" state
    // (which sits centered). The click must select the composite itself — the composite toolbar
    // shows "Delete composite" and never the state-only "Change shape" button.
    const clusterBox = await cluster.boundingBox();
    const child = svg.locator("g.statediagram-state").filter({ hasText: "Child" }).first();
    const childBox = await child.boundingBox();
    expect(clusterBox).not.toBeNull();
    expect(childBox).not.toBeNull();

    // Pick a point left of the child but inside the composite interior.
    const x = clusterBox!.x + 16;
    const y = (clusterBox!.y + childBox!.y) / 2;
    await page.mouse.dblclick(x, y);
    await page.waitForTimeout(700);

    const toolbar = page.locator("[data-state-node-toolbar]");
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await expect(toolbar.locator('button[title="Delete composite"]')).toBeVisible();
    await expect(toolbar.locator('button[title="Change shape"]')).toHaveCount(0);

    await request.delete(`/api/diagrams/${id}`);
  });

  test("double-clicking a composite title enters inline edit mode", async ({ page, request }) => {
    const { id, svg } = await openEditor(page, request, {
      name: "State Composite Title Double-click Edit",
      type: "stateDiagram",
      code: [
        "stateDiagram-v2",
        "    [*] --> parent_1",
        "    state parent_1 {",
        "        [*] --> Still",
        "        Still --> [*]",
        "    }",
        "    parent_1 --> [*]",
      ].join("\n"),
    });

    const cluster = svg.locator("g.statediagram-cluster").first();
    await expect(cluster).toBeVisible({ timeout: 15000 });

    // Double-click the composite's own title label. Mermaid forces the label's inner content to
    // `pointer-events: none`, so we target the label group's bounding box rather than its text.
    const title = cluster.locator(".cluster-label").first();
    await expect(title).toBeVisible({ timeout: 10000 });
    const box = await title.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(700);

    // The composite rename editor (a textarea) must open.
    await expect(page.locator("[data-class-text-editor] textarea")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator("[data-class-text-editor] textarea")).toHaveValue("parent_1");

    await page.keyboard.press("Escape");
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
