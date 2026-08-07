import { test, expect } from "@playwright/test";

// PR: sequence participant toolbar extraction — 8 archetypes, auto-ID, right-side insertion.
const SEED_CODE = `sequenceDiagram
    participant Alice
    participant Bob
    Alice->>Bob: Hello`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Seed Sequence Toolbar", type: "sequence", code: SEED_CODE },
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
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 20000 });
  await page.waitForTimeout(2000);
  return page.locator("svg[id^='mermaid-svg']");
}

function lifelineLabel(svg: import("@playwright/test").Locator, text: string) {
  return svg.locator("text, p, div, span, tspan").filter({ hasText: text }).first();
}

async function lifelineX(svg: import("@playwright/test").Locator, text: string) {
  const box = await lifelineLabel(svg, text).boundingBox();
  expect(box, `lifeline ${text} should render`).not.toBeNull();
  return box!.x;
}

test.describe("sequence participant toolbar", () => {
  test("picker exposes all eight participant archetypes", async ({ page }) => {
    await openSequenceEditor(page);

    await page.getByRole("button", { name: "Participants" }).first().click();
    await page.waitForTimeout(500);
    for (const label of [
      "Participant",
      "Actor",
      "Boundary",
      "Control",
      "Entity",
      "Database",
      "Collections",
      "Queue",
    ]) {
      await expect(page.locator(`button[title="${label}"]`)).toBeVisible();
    }
  });

  test("adding a database participant places it rightmost with an auto-ID", async ({ page }) => {
    const svg = await openSequenceEditor(page);

    await page.getByRole("button", { name: "Participants" }).first().click();
    await page.locator('button[title="Database"]').click();

    // The new lifeline renders with a unique label…
    await expect(lifelineLabel(svg, "New Database")).toBeVisible({ timeout: 15000 });
    // …and on the far right (Mermaid renders columns in declaration order).
    const bobX = await lifelineX(svg, "Bob");
    const dbX = await lifelineX(svg, "New Database");
    expect(dbX).toBeGreaterThan(bobX);
  });

  test("repeated additions get sequential auto-IDs and deduplicated labels", async ({ page }) => {
    const svg = await openSequenceEditor(page);

    for (const expected of ["New Database", "New Database 2"]) {
      await page.getByRole("button", { name: "Participants" }).first().click();
      await page.locator('button[title="Database"]').click();
      await expect(lifelineLabel(svg, expected)).toBeVisible({ timeout: 15000 });
    }

    // A different archetype uses its own label and the next free ID.
    await page.getByRole("button", { name: "Participants" }).first().click();
    await page.locator('button[title="Actor"]').click();
    await expect(lifelineLabel(svg, "New Actor")).toBeVisible({ timeout: 15000 });
  });
});
