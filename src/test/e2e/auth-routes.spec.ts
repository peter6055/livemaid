import { test, expect, type Page } from "@playwright/test";
import { encode } from "@auth/core/jwt";

const TEST_WORKSPACE_ID = "ws-test-livemaid";

async function createSessionCookie(): Promise<{ name: string; value: string }> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set in the environment to run authenticated E2E tests");
  }

  const token = await encode({
    secret,
    salt: "next-auth.session-token",
    token: {
      sub: "test-user-id",
      email: "test@example.com",
      name: "Test User",
      workspaceId: TEST_WORKSPACE_ID,
      role: "admin",
    },
    maxAge: 60 * 60,
  });

  return { name: "next-auth.session-token", value: token };
}

async function signInAsTestUser(page: Page): Promise<void> {
  const cookie = await createSessionCookie();
  await page.context().addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

test.describe("auth routes", () => {
  test("/login renders the SSO button when auth is configured", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in with sso/i })).toBeVisible();
  });

  test("old /editor/{id} redirects to the workspace-scoped editor when authenticated", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto("/editor/abc");
    await page.waitForURL(`**/workspace/${TEST_WORKSPACE_ID}/editor/abc`, { timeout: 10000 });
  });

  test("/workspace/{id} renders the dashboard shell", async ({ page }) => {
    await signInAsTestUser(page);
    await page.goto(`/workspace/${TEST_WORKSPACE_ID}`);
    await expect(page.locator("header").getByText("Workspace")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });
});
