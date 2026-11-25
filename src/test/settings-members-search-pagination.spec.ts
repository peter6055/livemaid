import { expect, test, type Page } from "@playwright/test";

const workspaceId = "ws-members-pagination";
const adminId = "user-admin";
const MEMBER_COUNT = 12;

function buildMembers() {
  return [
    {
      _id: "member-admin",
      userId: adminId,
      invitedEmail: null,
      role: "admin",
      status: "active",
      email: "admin@example.com",
      active: true,
    },
    ...Array.from({ length: MEMBER_COUNT - 1 }, (_, index) => {
      const n = String(index + 1).padStart(2, "0");
      return {
        _id: `member-${n}`,
        userId: `user-${n}`,
        invitedEmail: null,
        role: "member",
        status: "active",
        email: `member-${n}@example.com`,
        active: true,
      };
    }),
  ];
}

async function mockWorkspace(page: Page) {
  await page.route(/\/api\/diagrams(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });
  await page.route(/\/api\/folders(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: adminId } }),
    });
  });
  await page.route(`**/api/workspace/${workspaceId}/members`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildMembers()),
    });
  });
}

async function openMembers(page: Page) {
  await page.goto(`/workspace/${workspaceId}/settings/members`);
  await expect(page.getByRole("heading", { name: "Member management" })).toBeVisible();
  await expect(page.getByTestId("member-row").first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockWorkspace(page);
});

test("filters the member list by email and resets to the first page", async ({ page }) => {
  await openMembers(page);

  await expect(page.getByText(`${MEMBER_COUNT} members`)).toBeVisible();
  await expect(page.getByTestId("member-row")).toHaveCount(10);

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();

  await page.getByLabel("Search members").fill("member-01");
  await expect(page.getByTestId("member-row")).toHaveCount(1);
  await expect(page.getByTestId("member-row")).toContainText("member-01@example.com");
  await expect(page.getByText(`1 of ${MEMBER_COUNT} members`)).toBeVisible();
  await expect(page.getByText("Page 1 of 1")).toBeVisible();

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByTestId("member-row")).toHaveCount(10);

  await page.getByLabel("Search members").fill("nobody-here");
  await expect(page.getByTestId("member-row")).toHaveCount(0);
  await expect(page.getByText("No members match")).toBeVisible();
  await expect(page.getByText(`0 of ${MEMBER_COUNT} members`)).toBeVisible();
});

test("paginates members and lets the user choose the page size", async ({ page }) => {
  await openMembers(page);

  await expect(page.getByText("Showing 1–10 of 12")).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("member-row")).toHaveCount(2);
  await expect(page.getByTestId("member-row").first()).toContainText("member-10@example.com");
  await expect(page.getByText("Showing 11–12 of 12")).toBeVisible();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();

  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByTestId("member-row")).toHaveCount(10);

  await page.getByRole("combobox", { name: "Members per page" }).click();
  await page.getByRole("option", { name: "50" }).click();

  await expect(page.getByTestId("member-row")).toHaveCount(MEMBER_COUNT);
  await expect(page.getByText("Showing 1–12 of 12")).toBeVisible();
});
