import { test, expect, type Page } from "@playwright/test";
import { encode } from "@auth/core/jwt";

const TEST_WORKSPACE_ID = "ws-test-livemaid";
const TEST_USER_ID = "507f1f77bcf86cd799439011";

async function createSessionCookie(): Promise<{ name: string; value: string }> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set in the environment to run authenticated E2E tests");
  }

  const token = await encode({
    secret,
    salt: "next-auth.session-token",
    token: {
      sub: TEST_USER_ID,
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

function makeDiagram(name: string, id = "diag-1") {
  return {
    id,
    name,
    type: "flowchart",
    code: "flowchart TD\nA --> B",
    workspaceId: TEST_WORKSPACE_ID,
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test.describe("workspace client integration", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  test("dashboard loads diagrams for the workspace", async ({ page }) => {
    let requestedWorkspaceId: string | null = null;

    await page.route(/\/api\/diagrams(\?.*)?$/, async (route, request) => {
      const url = new URL(request.url());
      requestedWorkspaceId = url.searchParams.get("workspaceId");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [makeDiagram("Workspace Diagram")],
          total: 1,
        }),
      });
    });

    await page.route(/\/api\/folders(\?.*)?$/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto(`/workspace/${TEST_WORKSPACE_ID}`);
    await expect(page.getByText("Workspace Diagram").first()).toBeVisible();
    expect(requestedWorkspaceId).toBe(TEST_WORKSPACE_ID);
  });

  test("creating a diagram adds it to the workspace", async ({ page }) => {
    let createBody: Record<string, unknown> | null = null;

    await page.route(/\/api\/diagrams(\?.*)?$/, async (route, request) => {
      if (request.method() === "POST") {
        const body = (await request.postDataJSON()) as Record<string, unknown>;
        createBody = body;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "new-diag",
            name: body.name,
            type: body.type,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            workspaceId: TEST_WORKSPACE_ID,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.route(/\/api\/folders(\?.*)?$/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto(`/workspace/${TEST_WORKSPACE_ID}`);
    await page.getByRole("button", { name: "New Diagram" }).click();
    await page.getByLabel("Diagram name").fill("New Workspace Diagram");
    await page.getByRole("button", { name: "Create diagram" }).click();

    await expect.poll(() => createBody).toBeTruthy();
    expect(createBody).toHaveProperty("workspaceId", TEST_WORKSPACE_ID);
  });

  test("comment creation no longer sends authorId", async ({ page }) => {
    const diagramId = "diag-comments";
    let commentBody: Record<string, unknown> | null = null;

    await page.route(`/api/diagrams/${diagramId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeDiagram("Comment Test", diagramId)),
      });
    });

    await page.route(/\/api\/folders(\?.*)?$/, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.route(`/api/diagrams/${diagramId}/comments`, async (route, request) => {
      if (request.method() === "POST") {
        const body = await request.postDataJSON();
        commentBody = body;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "comment-1",
            anchor: body?.anchor,
            messages: [
              {
                id: "m1",
                content: body?.content,
                authorId: TEST_USER_ID,
                timestamp: new Date().toISOString(),
              },
            ],
            resolved: false,
            starred: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto(`/workspace/${TEST_WORKSPACE_ID}/editor/${diagramId}`);
    await expect(page.locator(".mermaid-container")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Comments" }).click();
    await page.getByRole("button", { name: "Add comment" }).click();
    await page.locator(".mermaid-container").click();

    await page.getByPlaceholder("Write the first message...").fill("Test comment");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await expect.poll(() => commentBody).toBeTruthy();
    expect(commentBody).not.toHaveProperty("authorId");
  });

  test("admin can invite a member", async ({ page }) => {
    let inviteBody: Record<string, unknown> | null = null;
    const members: Array<Record<string, unknown>> = [
      {
        _id: "mem-admin-1",
        userId: TEST_USER_ID,
        invitedEmail: null,
        role: "admin",
        status: "active",
      },
    ];

    await page.route("/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: TEST_USER_ID,
            email: "test@example.com",
            name: "Test User",
            workspaceId: TEST_WORKSPACE_ID,
            role: "admin",
          },
        }),
      });
    });

    await page.route(`/api/workspace/${TEST_WORKSPACE_ID}/members`, async (route, request) => {
      if (request.method() === "POST") {
        const body = await request.postDataJSON();
        inviteBody = body as Record<string, unknown>;
        const newMember = {
          _id: "mem-new",
          userId: null,
          invitedEmail: (body as Record<string, unknown>)?.email,
          role: (body as Record<string, unknown>)?.role,
          status: "pending",
        };
        members.push(newMember);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(newMember),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(members),
      });
    });

    await page.goto(`/workspace/${TEST_WORKSPACE_ID}/settings/members`);
    await page.getByLabel("Email").fill("invite@example.com");
    await page.getByRole("combobox", { name: "Role" }).click();
    await page.getByRole("option", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Invite" }).click();

    await expect.poll(() => inviteBody).toBeTruthy();
    expect(inviteBody).toHaveProperty("email", "invite@example.com");
    expect(inviteBody).toHaveProperty("role", "admin");
    await expect(page.getByText("invite@example.com")).toBeVisible();
  });
});
