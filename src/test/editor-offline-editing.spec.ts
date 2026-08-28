import { test, expect } from "@playwright/test";

// Offline editing with sync-on-reconnect (peter6055/livemaid-project#27).
// Uses the REAL API — no route mocking — because the conflict scenario needs the
// server to change while the browser is offline; the node-side `request` fixture
// bypasses the browser's network emulation.

const SEED_CODE = "graph TD\n  A[Start] --> B[End]";
const OFFLINE_CODE = `${SEED_CODE}\n  B --> C`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "Offline Spec", type: "flowchart", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  // The editor arms a `beforeunload` unsaved-changes guard; auto-accept native
  // dialogs so reloads proceed. Offline-pending edits keep the guard armed.
  page.on("dialog", (d) => d.accept());
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 45000 });
}

async function replaceCode(page: import("@playwright/test").Page, code: string) {
  const monaco = page.locator(".monaco-editor").first();
  await monaco.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
  // Give React state a beat to absorb the edit.
  await page.waitForTimeout(300);
}

function offlineEditCount(page: import("@playwright/test").Page, diagramId: string) {
  return page.evaluate(
    (id) =>
      Object.keys(localStorage).filter((k) => k.startsWith(`livemaid:offline-edit:${id}`)).length,
    diagramId,
  );
}

async function serverCode(request: import("@playwright/test").APIRequestContext, id: string) {
  const res = await request.get(`/api/diagrams/${id}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).code as string;
}

test.describe("offline editing (#27)", () => {
  test("offline edit persists locally and syncs on reconnect", async ({ page, request }) => {
    await openEditor(page);

    await page.context().setOffline(true);
    await expect(page.getByTestId("offline-indicator")).toBeVisible({ timeout: 10000 });

    await replaceCode(page, OFFLINE_CODE);

    // The edit is queued locally, not on the server.
    await expect
      .poll(() => offlineEditCount(page, DIAGRAM_ID), { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: "test-results/offline-editing/01-offline-pending.png" });

    expect(await serverCode(request, DIAGRAM_ID)).toBe(SEED_CODE);

    // Reload with the server unreachable — the pending edit must survive.
    // NOTE: Chromium's setOffline blocks ALL requests including localhost, so a
    // literal reload while offline can never load the dev-server page
    // (net::ERR_INTERNET_DISCONNECTED). Abort only the API while online instead:
    // the same condition the hook must survive (load without the server).
    await page.route(`**/api/diagrams/${DIAGRAM_ID}*`, (route) => route.abort());
    await page.context().setOffline(false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 45000 });
    await expect(page.locator(".monaco-editor").first()).toContainText("B --> C");
    await expect.poll(() => offlineEditCount(page, DIAGRAM_ID), { timeout: 10000 }).toBe(1);
    await page.screenshot({ path: "test-results/offline-editing/02-offline-reload.png" });

    // Reconnect for real: the queued edit syncs automatically. Re-firing the
    // offline→online transition guarantees the reconnect sync runs after the
    // API route above was removed.
    await page.unroute(`**/api/diagrams/${DIAGRAM_ID}*`);
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await expect
      .poll(() => serverCode(request, DIAGRAM_ID), { timeout: 15000 })
      .toContain("B --> C");
    await expect.poll(() => offlineEditCount(page, DIAGRAM_ID), { timeout: 10000 }).toBe(0);
    await expect(page.getByTestId("offline-indicator")).toHaveCount(0);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/offline-editing/03-synced.png" });
  });

  test("conflict modal when server changed while offline", async ({ page, request }) => {
    const MY_CODE = "graph TD\n  A[Offline] --> B[End]";
    const SERVER_CODE = "graph TD\n  A[Server] --> B[End]";
    await openEditor(page);

    await page.context().setOffline(true);
    await replaceCode(page, MY_CODE);
    await expect(page.getByTestId("offline-indicator")).toBeVisible({ timeout: 10000 });
    await expect
      .poll(() => offlineEditCount(page, DIAGRAM_ID), { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    // The server moves on while we are offline (node-side request is unaffected).
    const put = await request.put(`/api/diagrams/${DIAGRAM_ID}`, {
      data: { code: SERVER_CODE },
    });
    expect(put.ok()).toBeTruthy();

    await page.context().setOffline(false);
    await expect(page.getByText("This diagram changed while you were offline")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("conflict-mine")).toContainText("A[Offline]");
    await expect(page.getByTestId("conflict-server")).toContainText("A[Server]");
    await page.screenshot({ path: "test-results/offline-editing/04-conflict-modal.png" });

    await page.getByTestId("conflict-keep-mine").click();
    await expect.poll(() => serverCode(request, DIAGRAM_ID), { timeout: 15000 }).toBe(MY_CODE);
    await expect(page.getByText("This diagram changed while you were offline")).toHaveCount(0);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: "test-results/offline-editing/05-conflict-resolved.png" });
  });

  test("mutations blocked offline with a toast", async ({ page, request }) => {
    await openEditor(page);
    await page.context().setOffline(true);

    // Rename via the header breadcrumb. BreadcrumbPage renders aria-disabled="true"
    // (base-ui "current page" semantics) but is interactive in the app, so force the click.
    await page.locator('header [data-slot="breadcrumb-page"]').click({ force: true });
    const nameInput = page.locator('header input[aria-label="Rename diagram"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Offline Spec Renamed");
    await nameInput.press("Enter");

    await expect(page.getByText("This action requires an internet connection.")).toBeVisible({
      timeout: 10000,
    });
    await page.screenshot({ path: "test-results/offline-editing/06-mutation-blocked.png" });

    // The server never saw the rename.
    const res = await request.get(`/api/diagrams/${DIAGRAM_ID}`);
    expect((await res.json()).name).toBe("Offline Spec");
  });
});
