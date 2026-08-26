import { test, expect } from "@playwright/test";

async function seedMindmap(
  request: import("@playwright/test").APIRequestContext,
  code: string,
): Promise<string> {
  const res = await request.post("/api/diagrams", {
    data: { name: "Mindmap Format", type: "mindmap", code },
  });
  expect(res.ok()).toBeTruthy();
  const doc = await res.json();
  return doc.id as string;
}

function normalizeMonaco(text: string): string[] {
  return text
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l, i, arr) => !(l === "" && (i === 0 || i === arr.length - 1)));
}

test.describe("Mindmap Format action (peter6055/livemaid-project#30)", () => {
  test("Format normalizes ragged mindmap indentation and keeps the diagram rendering", async ({
    page,
    request,
  }) => {
    const id = await seedMindmap(
      request,
      "mindmap\n  id1[Root]\n      id2(Child A)\n                  id3((Grandchild))",
    );
    await page.goto(`/editor/${id}`);
    await page.waitForLoadState("domcontentloaded");
    const svg = page.locator("svg[id^='mermaid-svg']").first();
    await expect(svg).toBeVisible({ timeout: 20000 });
    await expect(svg.locator("span, p, text", { hasText: "Grandchild" }).first()).toBeVisible({
      timeout: 15000,
    });
    await page.screenshot({ path: "test-results/mindmap-format-before.png" });

    const viewLines = page.locator(".monaco-editor .view-lines").first();
    // Monaco renders view-lines lazily — wait until the full source is mounted.
    await expect(viewLines).toContainText("Grandchild", { timeout: 15000 });

    await page.getByRole("button", { name: /format/i }).click();

    // Success toast instead of the old "structural formatting skipped" info toast.
    await expect(page.locator("[data-sonner-toast]").first()).toContainText("Code formatted", {
      timeout: 5000,
    });

    await expect
      .poll(async () => normalizeMonaco(await viewLines.innerText()), { timeout: 10000 })
      .toEqual([
        "mindmap",
        "    id1[Root]",
        "        id2(Child A)",
        "            id3((Grandchild))",
      ]);

    // Canvas re-renders the reformatted source without breaking.
    await expect(svg.locator("span, p, text", { hasText: "Grandchild" }).first()).toBeVisible({
      timeout: 15000,
    });
    await page.screenshot({ path: "test-results/mindmap-format-after.png" });
  });

  test("Format on a canonical mindmap reports Already formatted", async ({ page, request }) => {
    const id = await seedMindmap(request, "mindmap\n    Root\n        A\n");
    await page.goto(`/editor/${id}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("svg[id^='mermaid-svg']").first()).toBeVisible({
      timeout: 20000,
    });

    await page.getByRole("button", { name: /format/i }).click();
    await expect(page.locator("[data-sonner-toast]").first()).toContainText("Already formatted", {
      timeout: 5000,
    });
  });
});
