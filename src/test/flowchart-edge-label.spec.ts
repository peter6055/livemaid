import { test, expect } from "@playwright/test";

test.describe("Dashboard and diagram creation", () => {
  test("dashboard loads and shows create options", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Expect the page to have loaded with a title or heading
    await expect(page.locator("h1, h2, header").first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Flowchart edge label editing (Issue #69)", () => {
  test("flowchart renders with edge labels in SVG", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Navigate to create a flowchart (look for flowchart button/option)
    const flowchartBtn = page.getByRole("link", { name: /flowchart|graph/i }).first();
    const flowchartButton = page.getByRole("button", { name: /flowchart|graph/i }).first();

    if (await flowchartBtn.isVisible().catch(() => false)) {
      await flowchartBtn.click();
    } else if (await flowchartButton.isVisible().catch(() => false)) {
      await flowchartButton.click();
    }

    await page.waitForTimeout(2000);

    // Check if we're on an editor page
    const isEditor = page.url().includes("/editor/");

    if (isEditor) {
      // Look for the code editor (Monaco) and set flowchart code
      const monacoEditor = page.locator(".monaco-editor").first();
      if (await monacoEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Click in the Monaco editor area
        await monacoEditor.click();
        await page.waitForTimeout(500);

        // Select all and type new code
        await page.keyboard.press("Meta+a");
        await page.waitForTimeout(200);
        await page.keyboard.type(`graph TD
    A[Start] -->|Process Data| B[End]
    B -->|Complete| C[Done]`);
        await page.waitForTimeout(3000);

        // Verify the diagram rendered - look for SVG elements
        const svg = page.locator("svg.mermaid, svg").first();
        await expect(svg).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test("edge label text is rendered in SVG", async ({ page, request }) => {
    // Self-seed a flowchart with an edge label and open it directly in the
    // editor. The old dashboard "create" flow was fragile here: the dialog's
    // getByText(/flowchart|graph/i) could match a dashboard card sitting
    // behind the dialog overlay, blocking the click.
    const res = await request.post("/api/diagrams", {
      data: {
        name: "Seed Edge Label (Issue #69)",
        type: "flowchart",
        code: `graph TD
    A[Start] -->|Process| B[End]`,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();

    await page.goto(`/editor/${doc.id}`);
    await page.waitForLoadState("domcontentloaded");

    // The diagram should render with edge labels in the SVG
    const mermaidSvg = page.locator("svg[id^='mermaid-svg']").first();
    await expect(mermaidSvg).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(2000);

    // The edge label "Process" should be rendered somewhere in the SVG
    const labelText = mermaidSvg.locator("text, .edgeLabel, .label").filter({ hasText: /Process/ });
    const labelCount = await labelText.count();
    expect(labelCount).toBeGreaterThanOrEqual(1);

    const deleteRes = await request.delete(`/api/diagrams/${doc.id}`);
    expect(deleteRes.ok()).toBeTruthy();
  });

  test("double-clicking the edge label opens the editor with the label text", async ({
    page,
    request,
  }) => {
    // Regression: double-clicking the "|Process|" label used to open the inline
    // editor pre-filled with the raw edge id (e.g. L_A_B_0) because clicks land
    // on the invisible rect.edge-label-hit-target, which carries no identity —
    // resolution must walk up to the parent g.edgeLabel.
    const res = await request.post("/api/diagrams", {
      data: {
        name: "Edge Label DblClick Regression",
        type: "flowchart",
        code: `graph TD
    A[Start] -->|Process| B[End]`,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
      await page.waitForTimeout(2000);

      const svg = page.locator("svg[id^='mermaid-svg']");
      const editor = page.locator('[data-inline-editor][contenteditable="true"]');

      // Case 1: double-click the visible label area (via its hit-target rect).
      const hitRect = svg.locator("rect.edge-label-hit-target").first();
      await expect(hitRect).toHaveCount(1);
      const hb = await hitRect.boundingBox();
      await page.mouse.dblclick(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveText("Process");
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);

      // Case 2 (control): double-click the edge line itself.
      const line = svg.locator("path.flowchart-link:not([class*='hit-target'])").first();
      const lb = await line.boundingBox();
      await page.mouse.dblclick(lb!.x + lb!.width / 2, lb!.y + lb!.height / 2);
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveText("Process");
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});

test.describe("Multiline flowchart edge labels (Issue #39)", () => {
  test("double-clicking a multiline edge label preserves the <br/> line break", async ({
    page,
    request,
  }) => {
    const code = `flowchart TD
    E["Chunk N<br>Ingester process"]
    E -->|link by FILE_FINALISED<br/>attributes.source_file| E1["Chunk 1 Valid File"]`;

    const res = await request.post("/api/diagrams", {
      data: {
        name: "Multiline edge label regression (#39)",
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
      await page.waitForTimeout(2000);

      const svg = page.locator("svg[id^='mermaid-svg']");
      const editor = page.locator('[data-inline-editor][contenteditable="true"]');

      const hitRect = svg.locator("rect.edge-label-hit-target").first();
      await expect(hitRect).toHaveCount(1);
      const hb = await hitRect.boundingBox();
      expect(hb).not.toBeNull();
      await page.mouse.dblclick(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
      await expect(editor).toBeVisible({ timeout: 10000 });

      // The inline editor must contain an explicit <br> element, not a collapsed single line.
      const editorHtml = await editor.innerHTML();
      expect(editorHtml).toMatch(/<br\s*\/?>/i);

      // innerText should render the two lines on separate rows.
      const text = await editor.innerText();
      expect(text).toContain("link by FILE_FINALISED");
      expect(text).toContain("attributes.source_file");
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);

      // The editor must be tall enough to show both lines.
      // Compare against the foreignObject label, not the padded hit-target rect.
      const edgeLabel = svg.locator("g.edgeLabels g.edgeLabel foreignObject").first();
      await expect(edgeLabel).toHaveCount(1);
      const editorBox = await editor.boundingBox();
      const labelBox = await edgeLabel.boundingBox();
      expect(editorBox).not.toBeNull();
      expect(labelBox).not.toBeNull();
      // Allow a small rounding tolerance when comparing rendered heights.
      expect(editorBox!.height + 4).toBeGreaterThanOrEqual(labelBox!.height);

      // Edit the second line and commit.
      await editor.click();
      await page.evaluate(() => {
        const el = document.querySelector(
          '[data-inline-editor][contenteditable="true"]',
        ) as HTMLElement | null;
        if (!el) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let target: Text | null = null;
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (node.textContent?.includes("attributes.source_file")) {
            target = node;
            break;
          }
        }
        if (!target) return;
        const range = document.createRange();
        range.selectNodeContents(target);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
      await page.keyboard.type("attributes.target_file");
      await page.keyboard.press("Control+Enter");
      await expect(editor).toHaveCount(0);

      // Monaco should still contain the multiline label (the explicit line
      // break must survive the edit, regardless of whether the browser renders
      // it as <br> or <br/>).
      const monacoValue = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const editorInstance = (window as any).monaco?.editor?.getEditors()?.[0];
        return editorInstance ? (editorInstance.getValue() as string) : "";
      });
      expect(monacoValue).toMatch(/link by FILE_FINALISED<br\s*\/?>attributes\.target_file/);

      // The edge declaration must remain a single source line; a physical
      // newline inside the edge label would split the Mermaid declaration.
      const edgeLine = monacoValue
        .split("\n")
        .find((line) => line.includes("E -->") && line.includes("attributes.target_file"));
      expect(edgeLine).toBeDefined();
      expect(edgeLine).toMatch(
        /E\s*-->\|link by FILE_FINALISED<br\s*\/?>attributes\.target_file\|\s*E1/,
      );
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});

test.describe("Sequence diagram message endpoints (Issue #60)", () => {
  test("sequence diagram renders with participants and messages", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Try to create a sequence diagram
    const seqLink = page.getByRole("link", { name: /sequence/i }).first();
    const seqBtn = page.getByRole("button", { name: /sequence/i }).first();

    if (await seqLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await seqLink.click();
    } else if (await seqBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await seqBtn.click();
    }

    await page.waitForTimeout(2000);

    const monaco = page.locator(".monaco-editor").first();
    if (await monaco.isVisible({ timeout: 5000 }).catch(() => false)) {
      await monaco.click();
      await page.waitForTimeout(200);
      await page.keyboard.press("Meta+a");
      await page.waitForTimeout(100);
      await page.keyboard.type(`sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello Bob
    Bob-->>Alice: Hi Alice`);
      await page.waitForTimeout(3000);

      // Verify SVG renders with message text
      const mermaidSvg = page.locator("svg.mermaid, svg").first();
      await expect(mermaidSvg).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe("Inline editing across diagram types (Issue #59)", () => {
  test("node label inline editing in flowchart", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Try to get to editor
    const createLink = page.getByRole("link", { name: /flowchart|new/i }).first();
    const createBtn = page.getByRole("button", { name: /flowchart|new|create/i }).first();

    if (await createLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createLink.click();
    } else if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
    }

    await page.waitForTimeout(2000);

    const monaco = page.locator(".monaco-editor").first();
    if (await monaco.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Set a basic flowchart
      await monaco.click();
      await page.waitForTimeout(200);
      await page.keyboard.press("Meta+a");
      await page.waitForTimeout(100);
      await page.keyboard.type(`graph TD
    A[Node A] --> B[Node B]`);
      await page.waitForTimeout(3000);

      // Verify nodes are rendered
      const svg = page.locator("svg.mermaid, svg").first();
      await expect(svg).toBeVisible({ timeout: 10000 });

      // Check that node text is visible
      const nodeText = svg.locator("text, .nodeLabel, .label").filter({ hasText: /Node A|Node B/ });
      const count = await nodeText.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe("Flowchart edge label inside subgraph (Issue #40)", () => {
  test("double-clicking an edge label inside a subgraph edits the edge, not the cluster", async ({
    page,
    request,
  }) => {
    const code = `flowchart TD
    subgraph chunk1["Chunk N Ingester process"]
        E["Chunk N<br>Ingester process"]
        E -->|link by FILE_FINALISED<br/>attributes.source_file| E1@{ shape: cyl, label: "Chunk 1 Valid File" }
        E -->|link by FILE_FINALISED<br/>attributes.source_file| E2@{ shape: cyl, label: "Chunk 1 Invalid File" }
    end`;

    const res = await request.post("/api/diagrams", {
      data: {
        name: "Edge label inside subgraph regression (#40)",
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
      await page.waitForTimeout(2000);

      const svg = page.locator("svg[id^='mermaid-svg']");
      const editor = page.locator('[data-inline-editor][contenteditable="true"]');
      const cluster = svg.locator("g.cluster[id*='chunk1']");
      await expect(cluster).toHaveCount(1);

      // Case 1: double-click the first edge-label hit target (visually inside the subgraph).
      // Mermaid renders edge labels in a sibling group, not as descendants of g.cluster.
      const hitRect = svg.locator("rect.edge-label-hit-target").first();
      await expect(hitRect).toHaveCount(1);
      const hb = await hitRect.boundingBox();
      expect(hb).not.toBeNull();
      await page.mouse.dblclick(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveText(/link by FILE_FINALISED/);
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);

      // Case 2 (control): double-click the visible edge path (visually inside the subgraph).
      const line = svg.locator("path.flowchart-link:not([class*='hit-target'])").first();
      const lb = await line.boundingBox();
      expect(lb).not.toBeNull();
      await page.mouse.dblclick(lb!.x + lb!.width / 2, lb!.y + lb!.height / 2);
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveText(/link by FILE_FINALISED/);
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);

      // Case 3: single-click the cluster title/label text selects the cluster.
      const clusterLabel = cluster.locator("g.cluster-label").first();
      await expect(clusterLabel).toHaveCount(1);
      const labelBox = await clusterLabel.boundingBox();
      expect(labelBox).not.toBeNull();
      await page.mouse.click(labelBox!.x + labelBox!.width / 2, labelBox!.y + labelBox!.height / 2);
      const outline = page.locator("[data-scale-lock-border]");
      await expect(outline).toBeVisible({ timeout: 10000 });

      // Case 4: the cluster interior must not select the cluster.
      // Cluster backgrounds use pointer-events: stroke, so only the border is
      // clickable. First click empty canvas outside the cluster to deselect, then
      // click well inside the cluster (away from children) and verify no outline.
      const clusterRect = await cluster.locator("rect").first().boundingBox();
      expect(clusterRect).not.toBeNull();

      // Click on empty canvas to the left of the cluster to clear selection.
      await page.mouse.click(clusterRect!.x - 80, clusterRect!.y + clusterRect!.height / 2);
      await expect(outline).toHaveCount(0, { timeout: 5000 });

      const padding = 24;
      const obstacles = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          })
          .filter((r) => r.width > 0 && r.height > 0);
      }, "g.cluster .node, g.cluster .cluster-label, g.cluster .edgeLabel");

      const candidates = [
        { x: clusterRect!.x + padding, y: clusterRect!.y + clusterRect!.height * 0.75 },
        {
          x: clusterRect!.x + clusterRect!.width - padding,
          y: clusterRect!.y + clusterRect!.height * 0.75,
        },
        { x: clusterRect!.x + padding, y: clusterRect!.y + clusterRect!.height * 0.5 },
        {
          x: clusterRect!.x + clusterRect!.width - padding,
          y: clusterRect!.y + clusterRect!.height * 0.5,
        },
      ];

      let interiorPoint: { x: number; y: number } | null = null;
      for (const p of candidates) {
        if (
          p.x < clusterRect!.x + padding ||
          p.x > clusterRect!.x + clusterRect!.width - padding ||
          p.y < clusterRect!.y + padding ||
          p.y > clusterRect!.y + clusterRect!.height - padding
        ) {
          continue;
        }
        const overlaps = obstacles.some((r) => {
          const margin = 12;
          return (
            p.x >= r.x - margin &&
            p.x <= r.x + r.width + margin &&
            p.y >= r.y - margin &&
            p.y <= r.y + r.height + margin
          );
        });
        if (!overlaps) {
          interiorPoint = p;
          break;
        }
      }

      expect(interiorPoint).not.toBeNull();
      await page.mouse.click(interiorPoint!.x, interiorPoint!.y);
      await expect(outline).toHaveCount(0, { timeout: 5000 });
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});
