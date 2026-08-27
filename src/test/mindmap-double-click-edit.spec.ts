import { test, expect } from "@playwright/test";

async function seedMindmap(
  request: import("@playwright/test").APIRequestContext,
  code: string,
): Promise<string> {
  const res = await request.post("/api/diagrams", {
    data: { name: "Mindmap Double-Click Edit", type: "mindmap", code },
  });
  expect(res.ok()).toBeTruthy();
  const doc = await res.json();
  return doc.id as string;
}

/** Double-click the visual center of a rendered mindmap node label, like a real user. */
async function dblclickLabel(page: import("@playwright/test").Page, text: string) {
  const svg = page.locator("svg[id^='mermaid-svg']").first();
  const label = svg.locator("span, p, text", { hasText: text }).first();
  await expect(label).toBeVisible({ timeout: 15000 });
  const box = await label.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

test.describe("Mindmap double-click inline edit (Issue #138)", () => {
  test("double-click opens inline editor, commit renames preserving shape syntax", async ({
    page,
    request,
  }) => {
    const id = await seedMindmap(
      request,
      `mindmap
  id1[Root]
    id2(Child A)
      id3((Grandchild))`,
    );
    await page.goto(`/editor/${id}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("svg[id^='mermaid-svg']").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);

    await dblclickLabel(page, "Child A");

    const editor = page.locator("[data-inline-editor]").first();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await expect(editor).toContainText("Child A");
    await page.screenshot({ path: "test-results/mindmap-dblclick-editor-open.png" });

    // Rename and commit with Ctrl/Cmd+Enter
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Renamed A");
    await page.keyboard.press("ControlOrMeta+Enter");

    // Editor closes and the canvas re-renders with the new label
    await expect(editor).not.toBeVisible({ timeout: 5000 });
    const svg = page.locator("svg[id^='mermaid-svg']").first();
    await expect(svg.locator("span, p, text", { hasText: "Renamed A" }).first()).toBeVisible({
      timeout: 15000,
    });

    // Source keeps indentation + rounded-shape syntax for the renamed line.
    // Monaco's .view-lines emits non-breaking spaces in innerText — normalize them.
    const monacoText = (
      await page.locator(".monaco-editor .view-lines").first().innerText()
    ).replace(/\u00a0/g, " ");
    expect(monacoText).toContain("(Renamed A)");
    expect(monacoText).not.toContain("Child A");
    await page.screenshot({ path: "test-results/mindmap-dblclick-committed.png" });
  });

  test("Escape cancels without changing the label", async ({ page, request }) => {
    const id = await seedMindmap(
      request,
      `mindmap
  Root
    Child B`,
    );
    await page.goto(`/editor/${id}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("svg[id^='mermaid-svg']").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);

    await dblclickLabel(page, "Child B");
    const editor = page.locator("[data-inline-editor]").first();
    await expect(editor).toBeVisible({ timeout: 5000 });

    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Should Not Persist");
    await page.keyboard.press("Escape");

    await expect(editor).not.toBeVisible({ timeout: 5000 });
    const svg = page.locator("svg[id^='mermaid-svg']").first();
    await expect(svg.locator("span, p, text", { hasText: "Child B" }).first()).toBeVisible({
      timeout: 15000,
    });
    const monacoText = await page.locator(".monaco-editor .view-lines").first().innerText();
    expect(monacoText).not.toContain("Should Not Persist");
  });

  test("single-click still selects and shows the mindmap node toolbar (regression)", async ({
    page,
    request,
  }) => {
    const id = await seedMindmap(
      request,
      `mindmap
  Root
    Child C`,
    );
    await page.goto(`/editor/${id}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("svg[id^='mermaid-svg']").first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);

    const svg = page.locator("svg[id^='mermaid-svg']").first();
    const label = svg.locator("span, p, text", { hasText: "Child C" }).first();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page.locator("[data-mindmap-node-toolbar]").first()).toBeVisible({
      timeout: 5000,
    });
    // No inline editor opened by a single click
    await expect(page.locator("[data-inline-editor]").first()).not.toBeVisible();
    await page.screenshot({ path: "test-results/mindmap-singleclick-toolbar.png" });
  });
});
