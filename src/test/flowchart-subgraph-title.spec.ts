import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * E2E coverage for flowchart subgraph *title* editing.
 *
 * Double-clicking a subgraph header opens the node-label inline editor sized to
 * the title only. Committing rewrites ONLY the `subgraph <id>["…"]` title,
 * preserving id, children, edges, nesting and indentation.
 */

const EDITOR = '[data-inline-editor][contenteditable="true"]';

// One shared seed: title, a child node and a labeled edge, with a deliberately
// long child label so the cluster is much wider than the title-sized editor.
const CODE = `flowchart TD
    subgraph chunk1["Old Title"]
        E["Chunk N<br>Ingester process"]
        E -->|link by FILE_FINALISED| E1["Chunk 1 Valid File Whole Ingester Output"]
    end`;

const DATA_DIR = path.join(process.cwd(), process.env.DEMO_MODE === "true" ? "demo" : "data");

async function seedFlowchart(request: APIRequestContext, code: string) {
  const res = await request.post("/api/diagrams", {
    data: { name: "Subgraph title editing (#36)", type: "flowchart", code },
  });
  if (res.ok()) return (await res.json()) as { id: string };

  // Fallback when the collection route is broken by unrelated WIP (a server
  // component boundary error importing the diagram catalog). Write the document
  // straight to the file-system backend the editor reads.
  const id = `subtitletest${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
  const now = new Date().toISOString();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(
    path.join(DATA_DIR, `${id}.json`),
    JSON.stringify(
      {
        id,
        name: "Subgraph title editing (#36)",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        code,
        type: "flowchart",
        folderId: null,
        starred: false,
        starredAt: null,
        subPages: [],
        comments: [],
        versionHistory: [],
      },
      null,
      2,
    ),
  );
  return { id };
}

async function removeSeed(request: APIRequestContext, id: string) {
  await request.delete(`/api/diagrams/${id}`).catch(() => {});
  rmSync(path.join(DATA_DIR, `${id}.json`), { force: true });
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

function normalize(code: string) {
  return code.replace(/\u00A0/g, " ").replace(/\r\n/g, "\n");
}

async function openDiagram(page: Page, request: APIRequestContext, code: string) {
  const doc = await seedFlowchart(request, code);
  await page.goto(`/editor/${doc.id}`);
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
  await page.waitForTimeout(1800); // fonts + layout settle before measuring hit boxes
  return doc;
}

async function openTitleEditor(page: Page, clusterLabelIndex = 0) {
  const svg = page.locator("svg[id^='mermaid-svg']");
  const label = svg.locator("g.cluster g.cluster-label").nth(clusterLabelIndex);
  await expect(label).toHaveCount(1);
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const editor = page.locator(EDITOR);
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

test.describe("Flowchart subgraph title editing (Issue #36)", () => {
  test.setTimeout(120000);

  test("1. double-click opens a title-sized inline editor, not the whole cluster", async ({
    page,
    request,
  }) => {
    const doc = await openDiagram(page, request, CODE);
    try {
      const cluster = page.locator("svg[id^='mermaid-svg'] g.cluster[id*='chunk1']");
      await expect(cluster).toHaveCount(1);

      const editor = await openTitleEditor(page);
      await expect(editor).toHaveText(/Old Title/);
      await page.screenshot({ path: "/tmp/opencode/subtitle-editor-open.png" });

      const editorBox = await editor.boundingBox();
      const clusterBox = await cluster.boundingBox();
      expect(editorBox).not.toBeNull();
      expect(clusterBox).not.toBeNull();
      // Title-sized: the editor must be far narrower than the whole cluster.
      expect(editorBox!.width).toBeLessThan(clusterBox!.width * 0.6);
    } finally {
      await removeSeed(request, doc.id);
    }
  });

  test("2. Escape cancels without changing the source", async ({ page, request }) => {
    const doc = await openDiagram(page, request, CODE);
    try {
      const editor = await openTitleEditor(page);
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);

      const source = normalize(await getEditorValue(page));
      expect(source).toContain('subgraph chunk1["Old Title"]');
      expect(source).toBe(CODE);
    } finally {
      await removeSeed(request, doc.id);
    }
  });

  test("3. Enter commits only the title and preserves the rest of the source", async ({
    page,
    request,
  }) => {
    const doc = await openDiagram(page, request, CODE);
    try {
      const lineCountBefore = normalize(await getEditorValue(page)).split("\n").length;

      const editor = await openTitleEditor(page);
      await editor.click();
      await page.keyboard.press("Control+a");
      await page.keyboard.type("New Title");
      // The shared InlineTextEditor commits on Ctrl/Cmd+Enter (plain Enter inserts
      // a line break); see the accompanying report for the deviation from the brief.
      await page.keyboard.press("Control+Enter");
      await page.waitForTimeout(800);

      const source = normalize(await getEditorValue(page));
      expect(source).toContain('subgraph chunk1["New Title"]');
      // Child node declaration and the full edge line are untouched.
      expect(source).toContain('E["Chunk N<br>Ingester process"]');
      expect(source).toContain(
        'E -->|link by FILE_FINALISED| E1["Chunk 1 Valid File Whole Ingester Output"]',
      );
      expect(source.split("\n").length).toBe(lineCountBefore);
      // The new title is rendered.
      await expect(page.locator("svg[id^='mermaid-svg']")).toContainText("New Title", {
        timeout: 10000,
      });
      await page.screenshot({ path: "/tmp/opencode/subtitle-after-commit.png" });
    } finally {
      await removeSeed(request, doc.id);
    }
  });

  test("4. undo restores the old title and redo reapplies the new one", async ({
    page,
    request,
  }) => {
    const doc = await openDiagram(page, request, CODE);
    try {
      const editor = await openTitleEditor(page);
      await editor.click();
      await page.keyboard.press("Control+a");
      await page.keyboard.type("New Title");
      await page.keyboard.press("Control+Enter");
      await page.waitForTimeout(800);
      expect(normalize(await getEditorValue(page))).toContain('subgraph chunk1["New Title"]');

      await page.keyboard.press("Control+z");
      await page.waitForTimeout(800);
      expect(normalize(await getEditorValue(page))).toContain('subgraph chunk1["Old Title"]');

      await page.keyboard.press("Control+Shift+z");
      await page.waitForTimeout(800);
      expect(normalize(await getEditorValue(page))).toContain('subgraph chunk1["New Title"]');
    } finally {
      await removeSeed(request, doc.id);
    }
  });

  test("5. double-clicking a child node still edits that node's label", async ({
    page,
    request,
  }) => {
    const doc = await openDiagram(page, request, CODE);
    try {
      const svg = page.locator("svg[id^='mermaid-svg']");
      const child = svg.locator("g.node").filter({ hasText: "Chunk 1 Valid File" }).first();
      await expect(child).toHaveCount(1);
      const box = await child.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);

      const editor = page.locator(EDITOR);
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveText(/Chunk 1 Valid File/);
      await expect(editor).not.toHaveText(/Old Title/);

      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);
    } finally {
      await removeSeed(request, doc.id);
    }
  });

  test("6. identically titled siblings resolve to the clicked subgraph only", async ({
    page,
    request,
  }) => {
    const code = `flowchart TD
    subgraph a["Group"]
        A1[Alpha]
    end
    subgraph b["Group"]
        B1[Beta]
    end`;
    const doc = await openDiagram(page, request, code);
    try {
      const svg = page.locator("svg[id^='mermaid-svg']");
      // Mermaid renders each subgraph as `g.cluster` whose id ends with the
      // source subgraph id (`...-b`). Child nodes are siblings, not descendants,
      // so the cluster cannot be located by its children's text.
      const clusterB = svg.locator("g.cluster[id$='-b']").first();
      await expect(clusterB).toHaveCount(1);
      // Key risk: the rendered cluster id must carry the source subgraph id.
      const clusterId = await clusterB.getAttribute("id");
      expect(clusterId).toContain("b");

      const label = clusterB.locator("g.cluster-label").first();
      const box = await label.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);

      const editor = page.locator(EDITOR);
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveText(/Group/);
      await editor.click();
      await page.keyboard.press("Control+a");
      await page.keyboard.type("Bee");
      await page.keyboard.press("Control+Enter");
      await page.waitForTimeout(800);

      const source = normalize(await getEditorValue(page));
      expect(source).toContain('subgraph b["Bee"]');
      expect(source).toContain('subgraph a["Group"]');
    } finally {
      await removeSeed(request, doc.id);
    }
  });

  test("7. the toolbar pencil opens the title editor for the selected cluster", async ({
    page,
    request,
  }) => {
    const doc = await openDiagram(page, request, CODE);
    try {
      const svg = page.locator("svg[id^='mermaid-svg']");
      const label = svg.locator("g.cluster g.cluster-label").first();
      const box = await label.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      // Cluster selection outline appears (the pencil only edits a selected cluster).
      await expect(page.locator("[data-scale-lock-border]")).toBeVisible({ timeout: 10000 });

      await page.locator('button[title="Rename (double-click)"]').first().click();
      const editor = page.locator(EDITOR);
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveText(/Old Title/);
    } finally {
      await removeSeed(request, doc.id);
    }
  });

  test("8. a node under the pointer does not divert the double-click to the whole-container editor", async ({
    page,
    request,
  }) => {
    const doc = await openDiagram(page, request, CODE);
    try {
      const cluster = page.locator("svg[id^='mermaid-svg'] g.cluster[id*='chunk1']");
      const label = cluster.locator("g.cluster-label").first();
      const box = await label.boundingBox();
      expect(box).not.toBeNull();

      // Reproduce the real-world disagreement: the click event resolves to the cluster,
      // but `document.elementsFromPoint` reports a node element under the pointer. The node
      // is detached (not inside the canvas container) so click routing is unaffected — only
      // the editor's internal `elementsFromPoint` re-resolution sees it. Before the fix this
      // fell through to the generic path and opened the whole-container editor.
      await page.evaluate(() => {
        const w = window as unknown as { __efpRestore?: () => void };
        const real = document.elementsFromPoint.bind(document);
        const ghost = document.createElementNS("http://www.w3.org/2000/svg", "g");
        ghost.setAttribute("class", "node");
        w.__efpRestore = () => {
          document.elementsFromPoint = real;
        };
        document.elementsFromPoint = (x: number, y: number) => [ghost, ...real(x, y)];
      });

      await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);

      const editor = page.locator(EDITOR);
      await expect(editor).toBeVisible({ timeout: 10000 });
      await expect(editor).toHaveText(/Old Title/);

      const editorBox = await editor.boundingBox();
      const clusterBox = await cluster.boundingBox();
      expect(editorBox).not.toBeNull();
      expect(clusterBox).not.toBeNull();
      expect(editorBox!.width).toBeLessThan(clusterBox!.width * 0.6);

      await page.keyboard.press("Escape");
    } finally {
      await page.evaluate(() =>
        (window as unknown as { __efpRestore?: () => void }).__efpRestore?.(),
      );
      await removeSeed(request, doc.id);
    }
  });
});
