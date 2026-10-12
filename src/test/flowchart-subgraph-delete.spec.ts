import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function seedFlowchart(request: APIRequestContext, code: string) {
  const res = await request.post("/api/diagrams", {
    data: { name: "Subgraph delete regression (#37)", type: "flowchart", code },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function getEditorValue(page: Page) {
  return page.evaluate(() => {
    const monaco = (
      window as unknown as {
        monaco?: { editor: { getModels: () => Array<{ getValue: () => string }> } };
      }
    ).monaco;
    return monaco?.editor.getModels()[0]?.getValue() ?? "";
  });
}

test.describe("Delete flowchart subgraph container (Issue #37)", () => {
  test.setTimeout(120000);

  test("Deleting a subgraph unwraps children and keeps the diagram renderable", async ({
    page,
    request,
  }) => {
    const doc = await seedFlowchart(
      request,
      `flowchart TD
    subgraph chunk1["Chunk 1 Ingester process"]
        E["Chunk N<br>Ingester process"]
        E -->|link| E1@{ shape: cyl, label: "Chunk 1 Valid File" }
    end`,
    );

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      const svg = page.locator("svg[id^='mermaid-svg']");
      const cluster = svg.locator("g.cluster[id*='chunk1']");
      await expect(cluster).toHaveCount(1);
      // Click the cluster background rect near the top-left corner so we don't land on a child node.
      await cluster.locator("rect").click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(200);

      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      const normalized = code.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");

      expect(normalized).not.toContain("subgraph chunk1");
      expect(normalized).not.toMatch(/^\s*end$/m);
      expect(normalized).toContain('E["Chunk N<br>Ingester process"]');
      expect(normalized).toContain('E -->|link| E1@{ shape: cyl, label: "Chunk 1 Valid File" }');

      // Diagram should still render the previously-nested nodes.
      await expect(svg.locator("g.node").filter({ hasText: "Chunk N" })).toHaveCount(1);
      await expect(svg.locator("g.node").filter({ hasText: "Chunk 1 Valid File" })).toHaveCount(1);

      // Undo restores the subgraph wrapper; redo removes it again.
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(500);
      const undoneCode = await getEditorValue(page);
      expect(undoneCode.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n")).toContain(
        "subgraph chunk1",
      );

      await page.keyboard.press("Control+Shift+z");
      await page.waitForTimeout(500);
      const redoneCode = await getEditorValue(page);
      expect(redoneCode.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n")).not.toContain(
        "subgraph chunk1",
      );
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("Deleting a nested subgraph promotes it to the parent scope", async ({ page, request }) => {
    const doc = await seedFlowchart(
      request,
      `flowchart TD
    subgraph outer
        A[Outer]
        subgraph inner
            B[Inner]
        end
    end`,
    );

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });

      const svg = page.locator("svg[id^='mermaid-svg']");
      const outerCluster = svg.locator("g.cluster[id*='outer']");
      await expect(outerCluster).toHaveCount(1);
      // Click the outer cluster background rect near the top-left corner to select the container.
      await outerCluster
        .locator("rect")
        .first()
        .click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(200);

      await page.keyboard.press("Delete");
      await page.waitForTimeout(500);

      const code = await getEditorValue(page);
      const normalized = code.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");

      expect(normalized).not.toContain("subgraph outer");
      expect(normalized).toContain("subgraph inner");
      expect(normalized).toContain("A[Outer]");
      expect(normalized).toContain("B[Inner]");
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});
