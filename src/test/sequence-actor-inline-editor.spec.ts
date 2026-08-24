import { test, expect } from "@playwright/test";

// PR: inline text editor must size to the FULL diagram object (issue #10), not the text glyph.
// Clicking directly on a sequence actor's label used to open the editor at the glyph's size.
// Now it must hug the actor shape for every archetype.

const SEED_CODE = `sequenceDiagram
    participant Alice
    participant DB@{ "type": "database" }
    Alice->>DB: Hello`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Actor Inline Editor", type: "sequence", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openSequenceEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
  await page.waitForTimeout(2500);
  return page.locator("svg[id^='mermaid-svg']");
}

async function editorBox(page: import("@playwright/test").Page) {
  const el = page.locator('[data-inline-editor][contenteditable="true"]');
  await expect(el).toBeVisible({ timeout: 10000 });
  return el.boundingBox();
}

test.describe("sequence actor inline editor sizing", () => {
  test("double-clicking the participant label opens the editor at the full actor rect size", async ({
    page,
  }) => {
    const svg = await openSequenceEditor(page);

    // The shape is the actor rect; the label is a text.actor glyph far smaller.
    const rect = svg.locator("rect.actor.actor-top").first();
    const rectBox = await rect.boundingBox();
    const text = svg.locator("text.actor").filter({ hasText: "Alice" }).first();
    const textBox = await text.boundingBox();
    expect(textBox!.width).toBeLessThan(rectBox!.width / 2);

    // Select then double-click the TEXT GLYPH (the case that used to break).
    await text.click({ force: true });
    await text.dblclick({ force: true });

    const box = await editorBox(page);
    // Editor must hug the rect (tolerance for the 4/scale padding offset), not the glyph.
    expect(box!.width).toBeGreaterThanOrEqual(rectBox!.width - 4);
    expect(box!.height).toBeGreaterThanOrEqual(rectBox!.height - 4);
    expect(box!.width).toBeGreaterThan(textBox!.width * 2);
  });

  test("double-clicking a database participant label opens the editor at the full cylinder size", async ({
    page,
  }) => {
    const svg = await openSequenceEditor(page);

    const text = svg.locator("text.actor").filter({ hasText: "DB" }).first();
    const textBox = await text.boundingBox();
    const cylinder = svg.locator("g.actor").filter({ has: text }).first();

    await text.click({ force: true });
    await text.dblclick({ force: true });

    const box = await editorBox(page);
    // The editor should be materially larger than the text glyph (which is ~22px wide).
    expect(box!.width).toBeGreaterThan(textBox!.width + 10);
    if ((await cylinder.count()) > 0) {
      const cylBox = await cylinder.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(cylBox!.width - 4);
    }
  });
});
