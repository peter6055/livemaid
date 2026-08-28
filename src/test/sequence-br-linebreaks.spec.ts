import { test, expect } from "@playwright/test";

/**
 * Regression for https://github.com/peter6055/livemaid-project/issues/20
 * Enter in a sequence message must serialize as Mermaid <br/>, not a raw newline.
 */
const SEED_CODE = `sequenceDiagram
    participant A
    participant B
    A->>B: Message
`;

let diagramId = "";

test.describe("Sequence message line breaks (issue #20)", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/diagrams", {
      data: {
        name: "Issue20 br linebreaks",
        type: "sequence",
        code: SEED_CODE,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();
    diagramId = doc.id;
  });

  test.afterAll(async ({ request }) => {
    if (diagramId) {
      await request.delete(`/api/diagrams/${diagramId}`);
    }
  });

  test("Enter in message label saves as <br/> in Mermaid source", async ({ page }) => {
    await page.goto(`/editor/${diagramId}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 30000 });
    await page.waitForTimeout(1500);

    const overlay = page.locator("[data-seq-msg-index]").first();
    await expect(overlay).toBeVisible({ timeout: 10000 });
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    await overlay.dblclick({ position: { x: 12, y: box!.height / 2 } });
    await page.waitForTimeout(800);

    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("Control+A");
    await page.keyboard.type("Hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("World");
    await page.waitForTimeout(300);

    const innerHTML = await editor.evaluate((el) => (el as HTMLElement).innerHTML);
    // Browser wraps the second line in a div on Enter
    expect(innerHTML).toMatch(/Hello.*World/i);

    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(1500);

    const code = await page.evaluate(() => {
      const eds =
        (
          window as unknown as {
            monaco?: { editor?: { getEditors?: () => { getValue: () => string }[] } };
          }
        ).monaco?.editor?.getEditors?.() || [];
      return eds[0]?.getValue?.() || "";
    });

    const msgLines = code.split("\n").filter((l) => l.includes("A->>B"));
    expect(msgLines).toHaveLength(1);
    expect(msgLines[0]).toMatch(/Hello<br\s*\/?>World/);
    expect(msgLines[0]).not.toMatch(/Hello\s*$/);
  });
});
