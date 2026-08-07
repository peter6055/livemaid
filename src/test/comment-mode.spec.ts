import { test, expect } from "@playwright/test";

// PR: comment mode now places comment anchors on shapes (comment composers refactored).
const SEED_CODE = `graph TD
    A[Start] -->|Process| B[End]`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Comment Mode", type: "flowchart", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

test.describe("comment mode on shapes", () => {
  test("comment mode places a composer on a flowchart node and submits it", async ({ page }) => {
    await page.goto(`/editor/${DIAGRAM_ID}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Enter comment mode via the header toggle.
    await page.locator('button[title="Enter comment mode"]').click();
    await page.waitForTimeout(500);

    // Clicking a node opens the shape comment composer.
    const svg = page.locator("svg[id^='mermaid-svg']");
    const node = svg.locator("g.node").filter({ hasText: "Start" }).first();
    await node.click();

    const bubble = page.locator("[data-comment-bubble]");
    await expect(bubble).toBeVisible({ timeout: 10000 });
    const composer = bubble.locator('textarea[placeholder="Write the first message..."]');
    await composer.fill("Looks good");

    await bubble.getByRole("button", { name: "Add", exact: true }).click();

    // A pinned comment appears and its thread opens with the submitted message.
    const pin = page.locator('[aria-label^="Open comment thread"]');
    await expect(pin).toBeVisible({ timeout: 10000 });
    await pin.first().click();
    await expect(page.locator("[data-comment-bubble]")).toContainText("Looks good", {
      timeout: 10000,
    });
  });
});
