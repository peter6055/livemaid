import { expect, test, type Page } from "@playwright/test";

const now = "2026-07-08T12:00:00.000Z";

const diagrams = [
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
    folderId: "folder-design",
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

const folders = [
  {
    id: "folder-design",
    name: "Design Systems",
    parentId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    starred: false,
    starredAt: null,
  },
];

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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(folders),
    });
  });
}

test.describe("dashboard header", () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardData(page);
  });

  test("shows active dashboard context and grouped desktop controls", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Your Diagrams" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Workspace/ })).toBeVisible();
    await expect(page.getByLabel("Search dashboard")).toHaveAttribute(
      "placeholder",
      "Search workspace",
    );
    await expect(page.getByRole("button", { name: "Sort diagrams" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "New Folder", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Diagram" })).toHaveClass(/bg-\[#7a3dff\]/);

    await page.getByRole("button", { name: "All Files" }).click();
    await expect(page.getByRole("heading", { name: "All Files" })).toBeVisible();
    await expect(page.getByLabel("Search dashboard")).toHaveAttribute(
      "placeholder",
      "Search all files",
    );

    await page.getByRole("button", { name: "Recent" }).click();
    await expect(page.getByRole("heading", { name: "Recent Diagrams" })).toBeVisible();
    await expect(page.getByLabel("Search dashboard")).toHaveAttribute(
      "placeholder",
      "Search recent diagrams",
    );

    await page.getByRole("button", { name: "Starred" }).click();
    await expect(page.getByRole("heading", { name: "Starred Items" })).toBeVisible();
    await expect(page.getByLabel("Search dashboard")).toHaveAttribute(
      "placeholder",
      "Search starred items",
    );
  });

  test("updates title and breadcrumb when a folder is selected", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByText("Design Systems").last().click();

    await expect(page.getByRole("heading", { name: "Design Systems" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Workspace/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Design Systems" }).first()).toBeVisible();
    await expect(page.getByLabel("Search dashboard")).toHaveAttribute(
      "placeholder",
      "Search in Design Systems",
    );
  });

  test("keeps search, view toggle, and creation actions usable on narrow screens", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Your Diagrams" })).toBeVisible();
    await page.getByLabel("Search dashboard").fill("Alpha");
    await expect(page.locator("[data-slot='card-title']", { hasText: "Alpha Flow" })).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "Beta Map" })).toHaveCount(0);
    await expect(page.getByText('1 result for "Alpha"')).toBeVisible();

    await page.getByRole("button", { name: "List view" }).click();
    await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("menuitem", { name: "New Folder" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "New Diagram" })).toBeVisible();
  });

  test("filters folders and diagrams within the active search scope", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByLabel("Search dashboard").fill("Design");
    await expect(page.getByText('1 result for "Design"')).toBeVisible();
    await expect(page.getByText("Folders (1)")).toBeVisible();
    await expect(page.getByText("Design Systems").last()).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "Alpha Flow" })).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Clear search" }).click();
    await page.getByText("Design Systems").last().click();
    await expect(page.getByRole("heading", { name: "Design Systems" })).toBeVisible();
    await expect(page.locator("[data-slot='card-title']", { hasText: "Beta Map" })).toBeVisible();

    await page.getByLabel("Search dashboard").fill("Alpha");
    await expect(page.getByText('0 results for "Alpha"')).toBeVisible();
    await expect(page.getByText('No results found for "Alpha"')).toBeVisible();
  });

  test("supports keyboard focus and clearing shortcuts", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.keyboard.press("/");
    await expect(page.getByLabel("Search dashboard")).toBeFocused();

    await page.keyboard.type("Gamma");
    await expect(page.getByText('1 result for "Gamma"')).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Search dashboard")).toHaveValue("");
    await expect(page.getByText(/result for/)).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Search dashboard")).not.toBeFocused();
  });
});
