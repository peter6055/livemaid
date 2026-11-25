import { expect, test, type Page } from "@playwright/test";

const workspaceId = "ws-settings-ui";
const adminId = "user-admin";
const appPath = (path: string) => path;

async function mockDashboard(page: Page) {
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
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Settings");
}

async function mockMembers(page: Page, viewerIsAdmin = true, mutationDelayMs = 0) {
  const members = [
    {
      _id: "member-admin",
      userId: adminId,
      invitedEmail: null,
      role: "admin",
      status: "active",
      email: "admin@example.com",
      active: true,
    },
    {
      _id: "member-active",
      userId: "user-member",
      invitedEmail: null,
      role: "member",
      status: "active",
      email: "member@example.com",
      active: true,
    },
    {
      _id: "member-pending",
      userId: null,
      invitedEmail: "pending@example.com",
      role: "member",
      status: "pending",
      email: null,
      active: true,
    },
  ];
  const mutations: Array<{ method: string; body: unknown; url: string }> = [];

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: viewerIsAdmin ? adminId : "user-member" } }),
    });
  });
  await page.route(`**/api/workspace/${workspaceId}/members`, async (route, request) => {
    if (request.method() === "POST") {
      const body = await request.postDataJSON();
      mutations.push({ method: request.method(), body, url: request.url() });
      members.push({
        _id: "member-invited",
        userId: null,
        invitedEmail: body.email,
        role: body.role,
        status: "pending",
        email: null,
        active: true,
      });
      await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(members),
    });
  });
  await page.route(`**/api/workspace/${workspaceId}/members/*`, async (route, request) => {
    const body = request.postData();
    mutations.push({
      method: request.method(),
      body: body ? JSON.parse(body) : null,
      url: request.url(),
    });
    if (request.method() === "PATCH") {
      const target = members.find((member) => request.url().endsWith(member._id));
      if (target) target.active = (JSON.parse(body || "{}").active as boolean) ?? target.active;
    }
    if (request.method() === "DELETE") {
      const index = members.findIndex((member) => request.url().endsWith(member._id));
      if (index >= 0) members.splice(index, 1);
    }
    if (mutationDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, mutationDelayMs));
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return mutations;
}

test.beforeEach(async ({ page }) => {
  await mockDashboard(page);
});

test("opens settings and switches between preferences and workspace tabs", async ({ page }) => {
  await page.goto(appPath(`/workspace/${workspaceId}`));
  await openSettings(page);

  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preferences" })).toHaveAttribute(
    "data-active",
    "true",
  );

  await page.getByRole("button", { name: "General" }).click();
  await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  await expect(page.getByLabel("Workspace ID")).toHaveValue(workspaceId);
  await page.getByRole("button", { name: "Members" }).click();
  await expect(page.getByRole("button", { name: "Members" })).toHaveAttribute(
    "data-active",
    "true",
  );
});

test("changes theme segments and persists telemetry switches", async ({ page }) => {
  await page.goto(appPath(`/workspace/${workspaceId}`));
  await openSettings(page);

  await page.getByText("Dark", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("class", /dark/);
  await page.getByText("Light", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("class", /light/);

  if (!(await page.getByRole("dialog").count())) await openSettings(page);
  await page.getByRole("switch", { name: "Usage data" }).click();
  await page.getByRole("switch", { name: "Debug data" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("livemaid:preferences") || "{}");
        return { usageAnalytics: raw.usageAnalytics, debugReporting: raw.debugReporting };
      }),
    )
    .toEqual({ usageAnalytics: true, debugReporting: true });
});

test("shows compact member counts, invite controls, status, and row actions", async ({ page }) => {
  const mutations = await mockMembers(page, true, 1_000);
  await page.goto(appPath(`/workspace/${workspaceId}`));
  await openSettings(page);
  await page.getByRole("button", { name: "Members" }).click();

  await expect(page.getByText("3 members")).toBeVisible();
  await expect(page.getByText("1 pending")).toBeVisible();
  await expect(page.getByTestId("member-row")).toHaveCount(3);
  const pendingRow = page.getByTestId("member-row").filter({ hasText: "pending@example.com" });
  await expect(
    pendingRow.getByRole("switch", { name: "pending@example.com is pending acceptance" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite member" })).toBeVisible();

  await page.getByLabel("Email address").fill("new@example.com");
  await page.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Admin" }).click();
  await page.getByRole("button", { name: "Invite member" }).click();
  await expect(page.getByText("new@example.com")).toBeVisible();
  expect(mutations).toContainEqual(
    expect.objectContaining({
      method: "POST",
      body: { email: "new@example.com", role: "admin" },
    }),
  );

  const memberRow = page.getByTestId("member-row").filter({ hasText: "member@example.com" });
  const memberSwitch = memberRow.getByRole("switch", {
    name: "Active status for member@example.com",
  });
  await memberSwitch.click();
  await expect(memberSwitch).toBeDisabled();
  await expect(memberSwitch).toHaveAttribute("aria-busy", "true");
  await expect(memberRow.locator('[data-slot="member-toggle-spinner"]')).toBeVisible();
  await expect(memberRow.getByText("Inactive", { exact: true })).toBeVisible();
  expect(mutations).toContainEqual(
    expect.objectContaining({ method: "PATCH", body: { active: false } }),
  );

  await memberRow.getByRole("button", { name: "Remove member@example.com" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remove member?");
  const backdrop = page.locator('[data-slot="alert-dialog-overlay"]');
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS("backdrop-filter", /blur\([1-9]\d*px\)/);
  await expect(backdrop).toHaveCSS("position", "fixed");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(memberRow).toBeVisible();
  const removeTrigger = memberRow.locator('[data-slot="alert-dialog-trigger"]');
  await removeTrigger.click();
  const confirmRemove = page.locator('[data-slot="alert-dialog-action"]');
  await confirmRemove.click();
  await expect(confirmRemove).toBeDisabled();
  await expect(confirmRemove).toHaveAttribute("aria-busy", "true");
  await expect(confirmRemove.locator('[data-slot="member-remove-spinner"]')).toBeVisible();
  await expect(removeTrigger).toBeDisabled();
  await expect(removeTrigger.locator('[data-slot="member-remove-spinner"]')).toBeVisible();
  await expect(memberRow).toHaveCount(0);
  expect(mutations.filter(({ method }) => method === "DELETE")).toHaveLength(1);
});

test("clearly locks member management for non-admin viewers", async ({ page }) => {
  const mutations = await mockMembers(page, false);
  await page.goto(appPath(`/workspace/${workspaceId}`));
  await openSettings(page);
  await page.getByRole("button", { name: "Members" }).click();

  await expect(page.getByText("Only workspace admins can manage members.")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
