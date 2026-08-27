import { test, expect } from "@playwright/test";

// ER diagram title: toggle + double-click-to-edit via the shared ClassTextEditor.
// Guards peter6055/livemaid-project#29 — Enter must commit the single-line title
// (commitOnEnter) and title-edit interactions must not break entity edit entry.
const SEED_CODE = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
    }
    ORDER {
        int orderNumber
    }`;

let DIAGRAM_ID = "";

test.beforeEach(async ({ request }) => {
  const res = await request.post("/api/diagrams", {
    data: { name: "ER Title", type: "erDiagram", code: SEED_CODE },
  });
  expect(res.ok()).toBeTruthy();
  DIAGRAM_ID = (await res.json()).id;
});

test.afterEach(async ({ request }) => {
  if (DIAGRAM_ID) {
    await request.delete(`/api/diagrams/${DIAGRAM_ID}`);
  }
});

async function openErEditor(page: import("@playwright/test").Page) {
  await page.goto(`/editor/${DIAGRAM_ID}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("svg[id^='mermaid-svg']", { timeout: 45000 });
  await page.waitForTimeout(2500);
  return page.locator("svg[id^='mermaid-svg']");
}

function titleToggle(page: import("@playwright/test").Page) {
  return page.locator('button[aria-label="Toggle diagram title"]');
}

function monaco(page: import("@playwright/test").Page) {
  return page.locator(".monaco-editor").first();
}

/** Open the editor (unless already open), turn the title ON, and wait for the canvas. */
async function enableTitle(page: import("@playwright/test").Page) {
  if ((await page.locator("svg[id^='mermaid-svg']").count()) === 0) {
    await openErEditor(page);
  }
  const toggle = titleToggle(page);
  if ((await toggle.getAttribute("aria-pressed")) === "false") {
    await toggle.click();
    // Wait for the React state to settle so a follow-up click can't read stale state.
    await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  }
  const svg = page.locator("svg[id^='mermaid-svg']");
  await expect(svg.locator("text.erDiagramTitleText")).toHaveText("Diagram Title", {
    timeout: 15000,
  });
  return svg;
}

/**
 * Double-click an element using the app's own timing detection (two mousedowns at
 * nearly the same point within 400 ms — no native dblclick is dispatched because the
 * first click mounts overlays).
 */
async function canvasDoubleClick(
  page: import("@playwright/test").Page,
  el: import("@playwright/test").Locator,
) {
  const box = await el.boundingBox();
  if (!box) throw new Error("Target element has no bounding box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function titleEditor(page: import("@playwright/test").Page) {
  return page.locator("[data-class-text-editor] textarea");
}

async function openTitleEditor(page: import("@playwright/test").Page) {
  const svg = page.locator("svg[id^='mermaid-svg']");
  await canvasDoubleClick(page, svg.locator("text.erDiagramTitleText").first());
  const editor = titleEditor(page);
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

test.describe("ER title toggle", () => {
  test("canvas shows the title with a pointer cursor", async ({ page }) => {
    await enableTitle(page);
    const title = page.locator("svg[id^='mermaid-svg'] text.erDiagramTitleText").first();
    const cursor = await title.evaluate((el) => window.getComputedStyle(el).cursor);
    expect(cursor).toBe("pointer");
  });

  test("toggling on inserts a default frontmatter title rendered on canvas", async ({ page }) => {
    const svg = await openErEditor(page);
    const toggle = titleToggle(page);
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(svg.locator("text.erDiagramTitleText")).toHaveText("Diagram Title", {
      timeout: 15000,
    });
  });

  test("toggling off after confirmation removes the canvas title", async ({ page }) => {
    await enableTitle(page);
    const toggle = titleToggle(page);

    // The confirm is an in-app AlertDialog (not window.confirm).
    await toggle.click();
    const removeTitle = page.getByRole("button", { name: "Remove title" });
    await expect(removeTitle).toBeVisible({ timeout: 10000 });
    await removeTitle.click();

    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(svg.locator("text.erDiagramTitleText")).toHaveCount(0, { timeout: 15000 });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("ER title click-to-edit (#29)", () => {
  test("double-click opens the inline editor seeded with the current title", async ({ page }) => {
    await enableTitle(page);
    const editor = await openTitleEditor(page);
    await expect(editor).toHaveValue("Diagram Title");
  });

  test("Enter commits the renamed title and closes the editor", async ({ page }) => {
    await enableTitle(page);
    const editor = await openTitleEditor(page);

    await editor.fill("Customer Orders Schema");
    await editor.press("Enter");

    // Editor closes…
    await expect(editor).toHaveCount(0, { timeout: 10000 });
    // …and both canvas and source reflect the new title.
    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(svg.locator("text.erDiagramTitleText")).toHaveText("Customer Orders Schema", {
      timeout: 15000,
    });
    await expect(titleToggle(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("Escape cancels the edit and preserves the previous title", async ({ page }) => {
    await enableTitle(page);
    const editor = await openTitleEditor(page);

    await editor.fill("Discarded Title");
    await editor.press("Escape");

    await expect(editor).toHaveCount(0, { timeout: 10000 });
    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(svg.locator("text.erDiagramTitleText")).toHaveText("Diagram Title", {
      timeout: 15000,
    });
  });

  test("committing an empty title removes it entirely", async ({ page }) => {
    await enableTitle(page);
    const editor = await openTitleEditor(page);

    await editor.fill("");
    await editor.press("Enter");

    await expect(titleToggle(page)).toHaveAttribute("aria-pressed", "false", { timeout: 15000 });
    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(svg.locator("text.erDiagramTitleText")).toHaveCount(0, { timeout: 15000 });
  });

  test("title edit is a single undo step", async ({ page }) => {
    await enableTitle(page);
    const editor = await openTitleEditor(page);

    await editor.fill("Undo Me");
    await editor.press("Enter");
    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(svg.locator("text.erDiagramTitleText")).toHaveText("Undo Me", { timeout: 15000 });

    await monaco(page).click();
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(2000);

    await expect(svg.locator("text.erDiagramTitleText")).toHaveText("Diagram Title", {
      timeout: 15000,
    });
  });
});

test.describe("entity edit entry around the title (#29 regression)", () => {
  test("double-clicking an entity still opens its property panel after a title rename", async ({
    page,
  }) => {
    await enableTitle(page);

    // Rename via the inline editor first — this is the flow that used to leave the
    // editor mounted and break the next canvas double-click.
    const editor = await openTitleEditor(page);
    await editor.fill("Renamed Title");
    await editor.press("Enter");
    await expect(editor).toHaveCount(0, { timeout: 10000 });

    const svg = page.locator("svg[id^='mermaid-svg']");
    await expect(svg.locator("text.erDiagramTitleText")).toHaveText("Renamed Title", {
      timeout: 15000,
    });

    // Entity property panel (the ER "edit mode").
    await canvasDoubleClick(page, svg.locator("g.node").first());
    await expect(page.locator("[data-er-property-panel]")).toBeVisible({ timeout: 10000 });
  });

  test("double-clicking an entity works with the title on without any title editing", async ({
    page,
  }) => {
    await enableTitle(page);
    const svg = page.locator("svg[id^='mermaid-svg']");

    await canvasDoubleClick(page, svg.locator("g.node").first());
    await expect(page.locator("[data-er-property-panel]")).toBeVisible({ timeout: 10000 });
  });
});
