import { test, expect, type Page } from "@playwright/test";

const now = "2026-08-28T12:00:00.000Z";
const OFFLINE_MESSAGE = "This action requires an internet connection.";

const diagram = {
  id: "diagram-alpha",
  name: "Alpha Flow",
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  type: "flowchart",
  folderId: null,
  starred: false,
  starredAt: null,
  subPages: [],
  comments: [],
  versionHistory: [],
};

const folder = {
  id: "folder-projects",
  name: "Projects",
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  parentId: null,
  starred: false,
  starredAt: null,
};

type MutationCounts = {
  diagramPut: number;
  diagramDelete: number;
  diagramPost: number;
  folderPut: number;
  folderDelete: number;
  folderPost: number;
};

function newCounts(): MutationCounts {
  return {
    diagramPut: 0,
    diagramDelete: 0,
    diagramPost: 0,
    folderPut: 0,
    folderDelete: 0,
    folderPost: 0,
  };
}

async function mockDashboardData(page: Page, counts: MutationCounts) {
  const diagramsBody = JSON.stringify({ items: [diagram], total: 1 });
  const foldersBody = JSON.stringify([folder]);
  const fulfillOk = () => ({
    status: 200,
    contentType: "application/json",
    body: "{}",
  });

  await page.route("**/api/diagrams", async (route) => {
    if (route.request().method() !== "GET") {
      counts.diagramPost++;
      await route.fulfill(fulfillOk());
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: diagramsBody,
    });
  });

  await page.route("**/api/diagrams/*", async (route) => {
    const method = route.request().method();
    if (method === "PUT") counts.diagramPut++;
    if (method === "DELETE") counts.diagramDelete++;
    await route.fulfill(fulfillOk());
  });

  await page.route("**/api/folders", async (route) => {
    if (route.request().method() !== "GET") {
      counts.folderPost++;
      await route.fulfill(fulfillOk());
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: foldersBody,
    });
  });

  await page.route("**/api/folders/*", async (route) => {
    const method = route.request().method();
    if (method === "PUT") counts.folderPut++;
    if (method === "DELETE") counts.folderDelete++;
    await route.fulfill(fulfillOk());
  });
}

const offlineToast = (page: Page) =>
  page.locator("[data-sonner-toast]").filter({ hasText: OFFLINE_MESSAGE });

async function openDiagram(page: Page, name: string) {
  const card = page.locator("[data-slot='card']", { hasText: name }).first();
  await card.hover();
  return card;
}

async function openFolder(page: Page, name: string) {
  const card = page.locator("[data-slot='card']", { hasText: name }).first();
  await card.hover();
  return card;
}

test.describe("dashboard offline guard", () => {
  test("rename diagram offline shows toast and sends no PUT", async ({ page }) => {
    const counts = newCounts();
    await mockDashboardData(page, counts);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your Diagrams" })).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "Alpha Flow" })).toBeVisible();

    await page.context().setOffline(true);

    const card = await openDiagram(page, "Alpha Flow");
    await card.locator("button:has(svg[class*='lucide-file-pen'])").click();
    await expect(page.getByRole("heading", { name: "Rename Diagram" })).toBeVisible();
    await page.getByPlaceholder("Diagram name").fill("Alpha Renamed");
    await page.getByRole("button", { name: "Rename" }).click();

    await expect(offlineToast(page)).toBeVisible();
    expect(counts.diagramPut).toBe(0);
  });

  test("starring a diagram offline shows toast and sends no PUT", async ({ page }) => {
    const counts = newCounts();
    await mockDashboardData(page, counts);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("[data-slot='card-title']", { hasText: "Alpha Flow" })).toBeVisible();

    await page.context().setOffline(true);

    await page.getByRole("button", { name: "Star diagram" }).click();

    await expect(offlineToast(page)).toBeVisible();
    expect(counts.diagramPut).toBe(0);
  });

  test("deleting a diagram offline shows toast and sends no DELETE", async ({ page }) => {
    const counts = newCounts();
    await mockDashboardData(page, counts);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("[data-slot='card-title']", { hasText: "Alpha Flow" })).toBeVisible();

    await page.context().setOffline(true);

    const card = await openDiagram(page, "Alpha Flow");
    await card.locator("button:has(svg[class*='lucide-trash-2'])").click();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(offlineToast(page)).toBeVisible();
    expect(counts.diagramDelete).toBe(0);
  });

  test("renaming a folder offline shows toast and sends no PUT", async ({ page }) => {
    const counts = newCounts();
    await mockDashboardData(page, counts);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your Diagrams" })).toBeVisible();

    await page.context().setOffline(true);

    const folderCard = await openFolder(page, "Projects");
    await folderCard.locator("button:has(svg[class*='lucide-ellipsis-vertical'])").click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await expect(page.getByRole("heading", { name: "Rename Folder" })).toBeVisible();
    await page.getByPlaceholder("Folder name").fill("Projects Renamed");
    await page.getByRole("button", { name: "Rename" }).click();

    await expect(offlineToast(page)).toBeVisible();
    expect(counts.folderPut).toBe(0);
  });

  test("renaming works again once back online", async ({ page }) => {
    const counts = newCounts();
    await mockDashboardData(page, counts);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("[data-slot='card-title']", { hasText: "Alpha Flow" })).toBeVisible();

    await page.context().setOffline(true);

    const card = await openDiagram(page, "Alpha Flow");
    await card.locator("button:has(svg[class*='lucide-file-pen'])").click();
    await expect(page.getByRole("heading", { name: "Rename Diagram" })).toBeVisible();
    await page.getByPlaceholder("Diagram name").fill("Alpha Renamed");
    await page.getByRole("button", { name: "Rename" }).click();
    await expect(offlineToast(page)).toBeVisible();
    expect(counts.diagramPut).toBe(0);

    await page.context().setOffline(false);

    await page.getByRole("button", { name: "Rename" }).click();
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: "Diagram renamed" }),
    ).toBeVisible();
    expect(counts.diagramPut).toBe(1);
    await expect(
      page.locator("[data-slot='card-title']", { hasText: "Alpha Renamed" }),
    ).toBeVisible();
  });
});
