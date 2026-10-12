import { test, expect } from "@playwright/test";

test.describe("Flowchart subgraph add (Issue #34)", () => {
  test("clicking the purple + on a node inside a subgraph inserts the new node inside that subgraph", async ({
    page,
    request,
  }) => {
    const res = await request.post("/api/diagrams", {
      data: {
        name: "Subgraph Add Regression",
        type: "flowchart",
        code: `flowchart TD
    subgraph S1
        A[Start]
    end`,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await page.waitForTimeout(500);

      const svg = page.locator("svg[id^='mermaid-svg']");
      const nodeA = svg.locator("g.node").filter({ hasText: /^Start$/ });
      await expect(nodeA).toHaveCount(1);
      await nodeA.click();
      await page.waitForTimeout(300);

      const plusBtn = page.locator('button[title="Drag to Connect or Click to Add Node"]');
      await expect(plusBtn).toBeVisible();
      await plusBtn.click();
      await page.waitForTimeout(300);

      const squareShape = page
        .locator('[data-flowchart-shape-picker] button[title="Square"]')
        .first();
      await expect(squareShape).toBeVisible();
      await squareShape.click();
      await page.waitForTimeout(500);

      const code: string = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const models = (window as any).monaco?.editor?.getModels?.();
        return models?.[0] ? models[0].getValue() : "";
      });
      expect(code).toBeTruthy();

      const normalized = code.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
      expect(normalized).toContain("A --> A1[New Node]");
      const newNodeIndex = normalized.indexOf("A --> A1[New Node]");
      const endIndex = normalized.indexOf("end", newNodeIndex);
      expect(endIndex).toBeGreaterThan(newNodeIndex);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });

  test("inserts new node inside the correct subgraph with duplicate declarations (user regression)", async ({
    page,
    request,
  }) => {
    const code = `---
config:
  flowchart:
    curve: linear
---
graph LR
    A[Partner] -->|Uploads| B@{ shape: cyl, label: "Uningest File" }

    B -->|link by FILE_FINALISED<br/>attributes.source_file| C1@{ shape: cyl, label: "Bronze File" }

    subgraph chunk1["Chunk N Ingester process"]
        E["Chunk N<br>Ingester process"]

        E -->|link by FILE_FINALISED<br/>attributes.source_file| E1@{ shape: cyl, label: "Chunk 1 Valid File" }
        E -->|link by FILE_FINALISED<br/>attributes.source_file| E2@{ shape: cyl, label: "Chunk 1 Invalid File" }
    end

    subgraph chunkN["Chunk 1 Ingester process"]
        G["Chunk 1<br>Ingester process"]

        G -->|link by FILE_FINALISED<br/>attributes.source_file| G1@{ shape: cyl, label: "Chunk N Valid File" }
        G -->|link by FILE_FINALISED<br/>attributes.source_file| G2@{ shape: cyl, label: "Chunk N Invalid File" }
    end

    C1 -.->|Splits| E
    C1 -.->|Splits| G


    E["Chunk N<br>Ingester process"]
    E["Chunk N<br>Ingester process"]
    E["Chunk N<br>Ingester process"]
    E["Chunk N<br>Ingester process"]
    E["Chunk N<br>Ingester process"]
    C1@{ shape: cyl, label: "Bronze File" }
    C1@{ shape: cyl, label: "Bronze File" }
    C1@{ shape: cyl, label: "Bronze File" }`;

    const res = await request.post("/api/diagrams", {
      data: {
        name: "Subgraph Add Duplicate Regression",
        type: "flowchart",
        code,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await page.waitForTimeout(500);

      const svg = page.locator("svg[id^='mermaid-svg']");
      const nodeE = svg.locator("g.node[id*='flowchart-E-']");
      await expect(nodeE).toHaveCount(1);
      await nodeE.click();
      await page.waitForTimeout(300);

      const plusBtn = page.locator('button[title="Drag to Connect or Click to Add Node"]');
      await expect(plusBtn).toBeVisible();
      await plusBtn.click();
      await page.waitForTimeout(300);

      const squareShape = page
        .locator('[data-flowchart-shape-picker] button[title="Square"]')
        .first();
      await expect(squareShape).toBeVisible();
      await squareShape.click();
      await page.waitForTimeout(500);

      const updatedCode: string = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const models = (window as any).monaco?.editor?.getModels?.();
        return models?.[0] ? models[0].getValue() : "";
      });
      expect(updatedCode).toBeTruthy();

      const normalized = updatedCode.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
      expect(normalized).toContain("E --> E3[New Node]");

      const chunk1Index = normalized.indexOf('subgraph chunk1["Chunk N Ingester process"]');
      const chunk1EndIndex = normalized.indexOf("    end", chunk1Index + 1);
      const newNodeIndex = normalized.indexOf("E --> E3[New Node]");
      expect(newNodeIndex).toBeGreaterThan(chunk1Index);
      expect(newNodeIndex).toBeLessThan(chunk1EndIndex);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});
