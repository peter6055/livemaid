import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function seedFlowchart(request: APIRequestContext, name: string, code: string) {
  const res = await request.post("/api/diagrams", {
    data: { name, type: "flowchart", code },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function getEditorValue(page: Page) {
  const value = await page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: { editor: { getModels: () => Array<{ getValue: () => string }> } };
      }
    ).monaco;
    return monaco?.editor.getModels()[0]?.getValue() ?? "";
  });
  return value.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
}

const SEED = `flowchart TD
    A[Start] --> B[End]`;

async function selectNodeA(page: Page) {
  const nodeA = page.locator("g.node", { hasText: /Start/ }).first();
  await expect(nodeA).toBeVisible({ timeout: 10000 });
  await nodeA.click();
  await page.waitForTimeout(300);
}

function toolbarShapeTrigger(page: Page) {
  // The toolbar Shape trigger is the only button holding this unique shape-palette icon path.
  return page.locator('button:has(svg path[d^="M6.5 11L12 2"])').first();
}

test.describe("Create shape inside a new subgraph (issue #42)", () => {
  test.setTimeout(120000);

  test("top toolbar: option off keeps the existing shape-creation behaviour", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(request, "New subgraph option off", SEED);
    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await selectNodeA(page);

      await toolbarShapeTrigger(page).click();
      const menu = page.locator('[data-slot="dropdown-menu-content"]');
      await expect(menu).toBeVisible();

      const checkbox = menu.locator('input[type="checkbox"]');
      await expect(checkbox).not.toBeChecked();

      await menu.locator('[title="Square"]').first().click();
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      expect(code).toContain("A --> n1[New Node]");
      expect(code).not.toContain("subgraph sub");
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("top toolbar: option on wraps only the new shape and leaves the existing node/edge outside", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(request, "New subgraph option on", SEED);
    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await selectNodeA(page);

      await toolbarShapeTrigger(page).click();
      const menu = page.locator('[data-slot="dropdown-menu-content"]');
      await expect(menu).toBeVisible();
      await menu.locator('input[type="checkbox"]').check();

      await menu.locator('[title="Square"]').first().click();
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      expect(code).toContain("A[Start] --> B[End]");
      expect(code).toContain('subgraph sub1["Untitled subgraph"]');
      expect(code).toContain("n1[New Node]");
      expect(code).toContain("end");
      expect(code).toContain("A --> n1");

      // The original node must not be inside the new subgraph: the edge line sits before
      // the subgraph declaration and the original connection is unchanged.
      const normalized = code;
      const originalEdge = normalized.indexOf("A[Start] --> B[End]");
      const subgraphStart = normalized.indexOf('subgraph sub1["Untitled subgraph"]');
      expect(originalEdge).toBeGreaterThan(-1);
      expect(subgraphStart).toBeGreaterThan(originalEdge);

      const svg = page.locator("svg[id^='mermaid-svg']");
      await expect(svg.locator("g.cluster")).toHaveCount(1);
      await expect(svg.locator("g.node", { hasText: "New Node" })).toHaveCount(1);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("node + button: option on creates a subgraph containing only the new shape", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(request, "New subgraph plus option on", SEED);
    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await selectNodeA(page);

      await page.locator('button[title="Drag to Connect or Click to Add Node"]').first().click();
      const picker = page.locator("[data-flowchart-shape-picker]");
      await expect(picker).toBeVisible({ timeout: 10000 });
      await picker.locator('input[type="checkbox"]').check();
      await picker.locator('button[title="Circle"]').first().click();
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      expect(code).toContain("A[Start] --> B[End]");
      expect(code).toContain('subgraph sub1["Untitled subgraph"]');
      expect(code).toContain("A1((New Node))");
      expect(code).toContain("A --> A1");

      const svg = page.locator("svg[id^='mermaid-svg']");
      await expect(svg.locator("g.cluster")).toHaveCount(1);
      await expect(svg.locator("g.node", { hasText: "New Node" })).toHaveCount(1);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("node + button: option off keeps the existing shape-creation behaviour", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(request, "New subgraph plus option off", SEED);
    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await selectNodeA(page);

      await page.locator('button[title="Drag to Connect or Click to Add Node"]').first().click();
      const picker = page.locator("[data-flowchart-shape-picker]");
      await expect(picker).toBeVisible({ timeout: 10000 });
      await expect(picker.locator('input[type="checkbox"]')).not.toBeChecked();
      await picker.locator('button[title="Square"]').first().click();
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      expect(code).toContain("A --> A1[New Node]");
      expect(code).not.toContain("subgraph sub");
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("option on is a single undo/redo step", async ({ page, request }) => {
    const doc = await seedFlowchart(request, "New subgraph undo", SEED);
    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await selectNodeA(page);

      await page.locator('button[title="Drag to Connect or Click to Add Node"]').first().click();
      const picker = page.locator("[data-flowchart-shape-picker]");
      await picker.locator('input[type="checkbox"]').check();
      await picker.locator('button[title="Square"]').first().click();
      await page.waitForTimeout(500);
      expect(await getEditorValue(page)).toContain('subgraph sub1["Untitled subgraph"]');

      await page.keyboard.press("Control+z");
      await page.waitForTimeout(500);
      const undone = await getEditorValue(page);
      expect(undone).not.toContain("subgraph sub1");
      expect(undone).toContain("A[Start] --> B[End]");

      await page.keyboard.press("Control+Shift+z");
      await page.waitForTimeout(500);
      expect(await getEditorValue(page)).toContain('subgraph sub1["Untitled subgraph"]');
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("checkbox stays visible while the extended shape list is scrolled, and extended shapes work", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(request, "New subgraph extended shape", SEED);
    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await selectNodeA(page);

      await page.locator('button[title="Drag to Connect or Click to Add Node"]').first().click();
      const picker = page.locator("[data-flowchart-shape-picker]");
      const checkbox = picker.locator('input[type="checkbox"]');
      await expect(checkbox).toBeVisible();

      await picker
        .locator(".custom-scrollbar")
        .first()
        .evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
      await expect(checkbox).toBeVisible();

      await checkbox.check();
      await picker.locator('button[title="Cloud"]').first().click();
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      expect(code).toContain('subgraph sub1["Untitled subgraph"]');
      expect(code).toContain('A1@{ shape: cloud, label: "New Node" }');
      expect(code).toContain("A --> A1");
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});
