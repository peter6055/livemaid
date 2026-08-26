import { test, expect, type Page } from "@playwright/test";

// livemaid-project#23: comments anchored to sequence participants (actor and
// other types) must resolve to the rendered shape — pin stays connected
// (no "target missing" state), sits beside the shape instead of on top of it,
// and commenting must not break actor clickability.

const SEED_CODE = `sequenceDiagram
    participant A as Alice
    participant B as Bob
    actor C as New Actor
    participant D@{ "type": "boundary" } as New Boundary
    B-->>A: Great!
    A->>B: new msg
    A->>B: werew
    B->>C: new msg3dwcwcwe
    D->>C: werew`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Sequence Actor Comment", type: "sequence", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function addCommentToShape(page: Page, shapeLocator: ReturnType<Page["locator"]>) {
  await page.waitForLoadState("domcontentloaded");
  const svg = page.locator("svg[id^='mermaid-svg']");
  await svg.waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);

  await shapeLocator.click({ force: true });
  await page.waitForTimeout(600);
  await expect(page.locator('button[title="Add comment to selection"]')).toBeVisible({
    timeout: 10000,
  });
  await page.locator('button[title="Add comment to selection"]').click();

  const bubble = page.locator("[data-comment-bubble]");
  await expect(bubble).toBeVisible({ timeout: 10000 });
  await bubble.locator('textarea[placeholder="Write the first message..."]').fill("Thread text");
  await bubble.getByRole("button", { name: "Add", exact: true }).click();

  const pin = page.locator('[aria-label^="Open comment thread"]').first();
  await expect(pin).toBeVisible({ timeout: 10000 });
  return pin;
}

async function expectPinAnchoredRightOf(page: Page, pinTitle: string | null, shapeIndex: number) {
  // No disconnected/missing-target state.
  expect(pinTitle ?? "").not.toContain("target missing");

  // Pin center must sit at or beyond the right edge of the target shape
  // (pins hang off the right side of their anchor element).
  const comparison = await page.evaluate((idx) => {
    const svg = document.querySelector("svg[id^='mermaid-svg']")!;
    const shape = [...svg.querySelectorAll(".actor-top")][idx]!;
    const sr = shape.getBoundingClientRect();
    const pin = document.querySelector('[aria-label^="Open comment thread"]')!;
    const pr = pin.getBoundingClientRect();
    return {
      shapeRight: sr.right,
      shapeCenterY: sr.top + sr.height / 2,
      pinCenterX: pr.left + pr.width / 2,
      pinCenterY: pr.top + pr.height / 2,
    };
  }, shapeIndex);
  expect(comparison.pinCenterX).toBeGreaterThanOrEqual(comparison.shapeRight - 8);
}

test.describe("sequence participant comments", () => {
  test("actor stick figure keeps the pin connected and stays clickable", async ({ page }) => {
    await page.goto(`/editor/${DIAGRAM_ID}`);
    const svg = page.locator("svg[id^='mermaid-svg']");
    const actorMan = svg.locator("g.actor-man").first();

    const pin = await addCommentToShape(page, actorMan);
    await expectPinAnchoredRightOf(page, await pin.getAttribute("title"), 2);

    // The actor must remain selectable after a comment exists. The hover
    // reorder-handle is the app's intended click surface for actors.
    await actorMan.click({ force: true });
    await page.waitForTimeout(600);
    await expect(page.locator('button[title="Add comment to selection"]')).toBeVisible({
      timeout: 10000,
    });
  });

  test("plain participant box keeps the pin connected", async ({ page }) => {
    await page.goto(`/editor/${DIAGRAM_ID}`);
    const svg = page.locator("svg[id^='mermaid-svg']");
    const aliceRect = svg.locator("rect.actor-top").first();

    const pin = await addCommentToShape(page, aliceRect);
    await expectPinAnchoredRightOf(page, await pin.getAttribute("title"), 0);
  });

  test("metadata-typed participant (database) keeps the pin connected", async ({
    page,
    request,
  }) => {
    const CODE = `sequenceDiagram
    participant A as Alice
    participant DB@{ "type": "database" } as Store
    A->>DB: insert`;
    const res = await request.post("/api/diagrams", {
      data: { name: "Seq DB Comment", type: "sequence", code: CODE },
    });
    const dbId = (await res.json()).id;
    try {
      await page.goto(`/editor/${dbId}`);
      const svg = page.locator("svg[id^='mermaid-svg']");
      const dbShape = svg.locator(".actor-top").nth(1);

      const pin = await addCommentToShape(page, dbShape);
      await expectPinAnchoredRightOf(page, await pin.getAttribute("title"), 1);
    } finally {
      await request.delete(`/api/diagrams/${dbId}`);
    }
  });
});
