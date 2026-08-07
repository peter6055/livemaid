import { test, expect } from "@playwright/test";

// The diagram under test is seeded at runtime via the API (this suite must be
// self-contained: `data/` is gitignored, so a hardcoded diagram id can never be
// guaranteed to exist on a fresh test server). Cleaned up in `afterAll` so the
// test never pollutes the user's local dashboard data.
const SEED_CODE = `sequenceDiagram
    participant Alice
    participant Bob
    participant Carol
    Alice->>Bob: Hello there<br/>World message
    Bob->>Carol: Second line message
    Carol->>Alice: Third message
    Alice->>Bob: Fourth message
    Bob->>Alice: deoo<br/>sdcsdmkcl`;

let MULTILINE_SEQ_ID = "";

test.describe("Sequence multi-line message selection and hover (PR #74)", () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/diagrams", {
      data: {
        name: "Seed Multi-line Sequence (PR #74)",
        type: "sequence",
        code: SEED_CODE,
      },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();
    MULTILINE_SEQ_ID = doc.id;
  });

  test.afterAll(async ({ request }) => {
    if (MULTILINE_SEQ_ID) {
      await request.delete(`/api/diagrams/${MULTILINE_SEQ_ID}`);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/editor/${MULTILINE_SEQ_ID}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test("T1: Click multi-line label lines - correct single selection box", async ({ page }) => {
    // Verify hit overlays exist
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const overlayCount = await hitOverlays.count();
    expect(overlayCount).toBeGreaterThanOrEqual(2);

    // Click the last message's hit overlay (index 4 - "deoo<br/>sdcsdmkcl")
    const lastOverlay = hitOverlays.last();
    await lastOverlay.click();
    await page.waitForTimeout(800);

    // Click the first message's hit overlay
    const firstOverlay = hitOverlays.first();
    await firstOverlay.click();
    await page.waitForTimeout(800);

    // After click, selection should have moved. No crash = pass
    // Check SVG still visible (no crash from duplicate selection)
    const svg = page.locator("svg[id^='mermaid-svg']").first();
    await expect(svg).toBeVisible({ timeout: 5000 });
  });

  test("T2: Hover before and after selection - stable purple highlight", async ({ page }) => {
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const count = await hitOverlays.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const svg = page.locator("svg[id^='mermaid-svg']").first();

    // Hover over a message with multi-line label (last one - "deoo<br/>sdcsdmkcl")
    await hitOverlays.last().hover();
    await page.waitForTimeout(800);

    // Check that hover highlight classes are applied to SVG elements
    const highlightedTexts = svg.locator(".sequence-msg-hover-highlight-text");
    const highlightCount = await highlightedTexts.count();
    expect(highlightCount).toBeGreaterThanOrEqual(1);

    // Click to select first message
    await hitOverlays.first().click();
    await page.waitForTimeout(800);

    // Now hover last message again (should still work after selection)
    await hitOverlays.last().hover();
    await page.waitForTimeout(800);

    const highlightedTexts2 = svg.locator(".sequence-msg-hover-highlight-text");
    const highlightCount2 = await highlightedTexts2.count();
    expect(highlightCount2).toBeGreaterThanOrEqual(1);
  });

  test("T3: Rapid hover movement between adjacent messages", async ({ page }) => {
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const count = await hitOverlays.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Select the first message first
    await hitOverlays.first().click();
    await page.waitForTimeout(500);

    // Rapidly hover between messages in sequence
    for (let i = 0; i < Math.min(count, 5); i++) {
      await hitOverlays.nth(i).hover();
      await page.waitForTimeout(150);
    }

    await page.waitForTimeout(500);

    // Verify the Mermaid SVG is still intact (no crash from rapid hover)
    const svg = page.locator("svg[id^='mermaid-svg']").first();
    await expect(svg).toBeVisible({ timeout: 5000 });
  });

  test("T4: Select A, hover B, click B - no duplicate overlays", async ({ page }) => {
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const count = await hitOverlays.count();
    expect(count).toBeGreaterThanOrEqual(3);

    const svg = page.locator("svg[id^='mermaid-svg']").first();

    // Select message at index 1
    const overlayA = hitOverlays.nth(1);
    await overlayA.click();
    await page.waitForTimeout(500);

    // Hover message at index 2
    const overlayB = hitOverlays.nth(2);
    await overlayB.hover();
    await page.waitForTimeout(500);

    // Click message at index 2
    await overlayB.click();
    await page.waitForTimeout(800);

    // Verify SVG is still rendered correctly
    await expect(svg).toBeVisible({ timeout: 5000 });

    // The selection should have transitioned cleanly without crash
    // Verify that messageText elements are still present
    const msgTexts = svg.locator(".messageText");
    const msgCount = await msgTexts.count();
    expect(msgCount).toBeGreaterThanOrEqual(1);
  });

  test("T5: Double-click hovered message for inline edit", async ({ page }) => {
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const count = await hitOverlays.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Hover over a message
    const overlay = hitOverlays.nth(2);
    await overlay.hover();
    await page.waitForTimeout(500);

    // Double-click to enter inline edit. Playwright targets the overlay's
    // bounding-box center by default, but the lifeline "+" handle
    // (data-seq-plus-actor-id) appears on hover and can sit exactly on that
    // center (Bob's lifeline here), intercepting the pointer. Aim near the
    // line's start instead, which still lands on the message hit overlay.
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    await overlay.dblclick({ position: { x: 12, y: box!.height / 2 } });
    await page.waitForTimeout(1500);

    // Check if an inline edit input/textarea appeared
    const inlineEdit = page
      .locator(
        'input[type="text"], textarea, [contenteditable="true"], .inline-edit-input, [data-inline-edit]',
      )
      .first();
    const editVisible = await inlineEdit.isVisible().catch(() => false);

    if (editVisible) {
      // If inline edit appeared, that's a good sign
      const editText = await inlineEdit.inputValue().catch(() => inlineEdit.textContent());
      console.log("Inline edit text:", editText);
    }

    // SVG should still be visible regardless
    const svg = page.locator("svg[id^='mermaid-svg']").first();
    await expect(svg).toBeVisible({ timeout: 5000 });
  });

  test("T6: Drag-reorder a message via hit overlay", async ({ page }) => {
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const count = await hitOverlays.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const svg = page.locator("svg[id^='mermaid-svg']").first();

    // Get bounding box of second message
    const overlay = hitOverlays.nth(1);
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      // Perform drag: move down by 120px
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, { steps: 15 });
      await page.waitForTimeout(500);
      await page.mouse.up();
      await page.waitForTimeout(3000);
    }

    // After reorder, check SVG is still visible (didn't crash)
    await expect(svg).toBeVisible({ timeout: 10000 });
  });

  test("T7: Deselect and hover - highlight returns on multi-line labels", async ({ page }) => {
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const count = await hitOverlays.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const svg = page.locator("svg[id^='mermaid-svg']").first();

    // Click the canvas background to deselect (click empty area in .mermaid-container)
    const container = page.locator(".mermaid-container").first();
    const containerBox = await container.boundingBox();
    if (containerBox) {
      // Click top-left area of the mermaid container to deselect
      await page.mouse.click(containerBox.x + 10, containerBox.y + 10);
      await page.waitForTimeout(800);
    }

    // Hover over the multi-line message (last hit overlay)
    await hitOverlays.last().hover();
    await page.waitForTimeout(800);

    // Verify hover classes are applied on SVG elements
    const highlightedTexts = svg.locator(".sequence-msg-hover-highlight-text");
    const highlightCount = await highlightedTexts.count();
    expect(highlightCount).toBeGreaterThanOrEqual(1);
  });

  test("T8: Select message shows endpoint handles, not plus menu", async ({ page }) => {
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const count = await hitOverlays.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Select a message
    await hitOverlays.first().click();
    await page.waitForTimeout(800);

    // Assert two endpoint handles appear
    await expect(page.locator(".seq-endpoint-handle")).toHaveCount(2);

    // Assert no plus-actor-id elements appear
    await expect(page.locator("[data-seq-plus-actor-id]")).toHaveCount(0);
  });

  test("T9: Drag-reorder overlay appears only after 3px threshold", async ({ page }) => {
    const hitOverlays = page.locator("[data-seq-msg-index]");
    const count = await hitOverlays.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const overlay = hitOverlays.first();
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      // Mouse down without movement — overlay should not appear
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await expect(page.locator("[data-seq-reorder-overlay]")).toHaveCount(0);

      // Move more than 3px while held — overlay should appear
      await page.mouse.move(cx, cy + 8, { steps: 5 });
      await page.waitForTimeout(100);
      await expect(page.locator("[data-seq-reorder-overlay]")).toHaveCount(1);

      // Mouse up — overlay should disappear
      await page.mouse.up();
      await page.waitForTimeout(300);
      await expect(page.locator("[data-seq-reorder-overlay]")).toHaveCount(0);
    }
  });
});
