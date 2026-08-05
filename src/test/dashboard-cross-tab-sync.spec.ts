import { test, expect, type Page } from "@playwright/test";

const now = "2026-07-08T12:00:00.000Z";

const initialDiagrams = [
  {
    id: "diagram-alpha",
    name: "Alpha Flow",
    createdAt: now,
    updatedAt: "2026-07-08T12:03:00.000Z",
    deletedAt: null,
    type: "flowchart",
    folderId: null,
    starred: true,
    starredAt: "2026-07-08T12:04:00.000Z",
    subPages: [],
    comments: [],
    versionHistory: [],
  },
  {
    id: "diagram-beta",
    name: "Beta Map",
    createdAt: "2026-07-08T11:00:00.000Z",
    updatedAt: "2026-07-08T11:05:00.000Z",
    deletedAt: null,
    type: "flowchart",
    folderId: null,
    starred: false,
    starredAt: null,
    subPages: [],
    comments: [],
    versionHistory: [],
  },
  {
    id: "diagram-gamma",
    name: "Gamma Spec",
    createdAt: "2026-07-08T10:00:00.000Z",
    updatedAt: "2026-07-08T10:05:00.000Z",
    deletedAt: null,
    type: "flowchart",
    folderId: null,
    starred: false,
    starredAt: null,
    subPages: [],
    comments: [],
    versionHistory: [],
  },
];

const updatedDiagrams = [
  ...initialDiagrams,
  {
    id: "diagram-delta",
    name: "Delta Flow",
    createdAt: "2026-07-08T13:00:00.000Z",
    updatedAt: "2026-07-08T13:05:00.000Z",
    deletedAt: null,
    type: "flowchart",
    folderId: null,
    starred: false,
    starredAt: null,
    subPages: [],
    comments: [],
    versionHistory: [],
  },
];

const folders: unknown[] = [];

async function mockDashboardData(page: Page, getDiagrams: () => unknown[]) {
  await page.route("**/api/diagrams", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const items = getDiagrams();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items, total: items.length }),
    });
  });

  await page.route("**/api/folders", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(folders),
    });
  });
}

async function triggerVisibilityRefresh(page: Page) {
  await page.evaluate(() => {
    // Override visibilityState so the handler treats the event as becoming visible.
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.describe("dashboard cross-tab sync", () => {
  test("refreshes the file list when the tab becomes visible again", async ({ page }) => {
    let diagrams = initialDiagrams;
    await mockDashboardData(page, () => diagrams);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Your Diagrams" })).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "Alpha Flow" })).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "Beta Map" })).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "Gamma Spec" })).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "Delta Flow" })).toHaveCount(
      0,
    );

    // Simulate a new diagram being created in another tab/window.
    diagrams = updatedDiagrams;
    await triggerVisibilityRefresh(page);

    await expect(page.locator("[data-slot='card-title']", { hasText: "Delta Flow" })).toBeVisible();
  });

  test("refreshes the file list when another tab broadcasts a refresh", async ({ context }) => {
    let diagrams = initialDiagrams;

    const dashboardPage = await context.newPage();
    await mockDashboardData(dashboardPage, () => diagrams);
    await dashboardPage.setViewportSize({ width: 1440, height: 900 });
    await dashboardPage.goto("/");

    await expect(dashboardPage.getByRole("heading", { name: "Your Diagrams" })).toBeVisible();
    await expect(
      dashboardPage.locator("[data-slot='card-title']", { hasText: "Delta Flow" }),
    ).toHaveCount(0);

    // Open another tab on the Dashboard and broadcast a refresh from it.
    const otherPage = await context.newPage();
    await mockDashboardData(otherPage, () => diagrams);
    await otherPage.setViewportSize({ width: 1440, height: 900 });
    await otherPage.goto("/");
    await expect(otherPage.getByRole("heading", { name: "Your Diagrams" })).toBeVisible();

    // Simulate the backend now containing a new diagram, then notify the Dashboard.
    diagrams = updatedDiagrams;
    await otherPage.evaluate(() => {
      const channel = new BroadcastChannel("livemaid-dashboard-sync");
      channel.postMessage({ type: "refresh-diagrams" });
      channel.close();
    });

    await expect(
      dashboardPage.locator("[data-slot='card-title']", { hasText: "Delta Flow" }),
    ).toBeVisible();
  });
});
