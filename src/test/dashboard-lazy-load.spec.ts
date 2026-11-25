import { expect, test, type Page } from "@playwright/test";

const now = "2026-07-08T12:00:00.000Z";
const CODE = "flowchart TD\n  A[Start] --> B[End]";

// 20 diagrams: only the first batch of 12 is rendered before scrolling.
const diagrams = Array.from({ length: 20 }, (_, i) => ({
  id: `diagram-${i}`,
  name: `Diagram ${i}`,
  createdAt: now,
  updatedAt: new Date(Date.parse(now) - i * 60_000).toISOString(),
  deletedAt: null,
  type: "flowchart",
  code: CODE,
  folderId: null,
  starred: false,
  starredAt: null,
  subPages: [],
  comments: [],
  versionHistory: [],
}));

async function mockDashboardData(page: Page) {
  await page.route("**/api/diagrams", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: diagrams, total: diagrams.length }),
    });
  });

  await page.route("**/api/folders", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });
}

test.describe("dashboard scroll loading", () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardData(page);
    await page.setViewportSize({ width: 1100, height: 600 });
  });

  test("shows a skeleton while the next batch loads, then reveals the cards", async ({ page }) => {
    await page.goto("/");

    // First batch only.
    await expect(page.locator("[data-diagram-id]")).toHaveCount(12);
    await expect(page.locator("[data-diagram-id='diagram-12']")).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // The skeleton placeholder is shown before the next batch appears.
    await expect(page.getByTestId("dashboard-load-more-skeleton")).toBeVisible();
    await expect(page.locator("[data-diagram-id]")).toHaveCount(20, { timeout: 10_000 });
    await expect(page.getByTestId("dashboard-load-more-skeleton")).toHaveCount(0);
  });

  test("defers mermaid previews of cards that are still off screen", async ({ page }) => {
    await page.goto("/");

    // Visible cards compile their preview.
    await expect(
      page.locator("[data-diagram-id='diagram-0'] [data-preview-state='ready']"),
    ).toBeVisible({ timeout: 15_000 });

    // The last card of the first batch is below the fold and must not have compiled yet.
    await expect(
      page.locator("[data-diagram-id='diagram-11'] [data-preview-compiled='false']"),
    ).toHaveCount(1);

    await page.locator("[data-diagram-id='diagram-11']").scrollIntoViewIfNeeded();
    await expect(
      page.locator("[data-diagram-id='diagram-11'] [data-preview-compiled='true']"),
    ).toHaveCount(1, { timeout: 15_000 });
  });
});
