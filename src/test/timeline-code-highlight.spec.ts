import { test, expect } from "@playwright/test";

// Issue #24 (livemaid-project): clicking a timeline element on the canvas must
// highlight the corresponding source line in the code editor, matching every
// other two-way diagram type. Timeline node ids embed their 0-indexed source
// line (`TIMELINE_PERIOD_<line>` / `TIMELINE_EVENT_<line>_<n>`), resolved by
// timelineLinesFromNodeId in the highlightRange memo.
const CODE = [
  "timeline",
  "    title History of Social Media Platform",
  "    2002 : LinkedIn",
  "    2004 : Facebook : Google",
].join("\n");

test.describe("Timeline canvas-to-code highlighting", () => {
  test("clicking a timeline event highlights its source line", async ({ page, request }) => {
    const res = await request.post("/api/diagrams", {
      data: { name: "Timeline Code Highlight", type: "timeline", code: CODE },
    });
    expect(res.ok()).toBeTruthy();
    const doc = await res.json();

    try {
      await page.goto(`/editor/${doc.id}`);
      await page.waitForLoadState("domcontentloaded");
      const svg = page.locator("svg[id^='mermaid-svg']").first();
      await expect(svg).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(2000);

      // Click the "LinkedIn" event node → line index 2 ("2002 : LinkedIn").
      const groups = svg.locator("g.timeline-node");
      const linkedIn = groups.filter({ hasText: "LinkedIn" }).first();
      const box = await linkedIn.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

      // Monaco paints whole-line decorations as overlay rows; assert one exists
      // and sits on the rendered row for source line 2.
      const highlight = page.locator(".canvas-code-highlight-line");
      await expect(highlight).toHaveCount(1);
      const hlTop = await highlight.evaluate((el) => el.getBoundingClientRect().top);
      const rowIndex = await page.evaluate((y) => {
        const lines = Array.from(document.querySelectorAll(".view-lines > .view-line"));
        return lines.findIndex((l) => Math.abs(l.getBoundingClientRect().top - y) < 4);
      }, hlTop);
      expect(rowIndex).toBe(2);

      // Clicking empty canvas clears the highlight cleanly.
      const svgBox = await svg.boundingBox();
      expect(svgBox).not.toBeNull();
      await page.mouse.click(svgBox!.x + svgBox!.width / 2, svgBox!.y + svgBox!.height - 20);
      await expect(highlight).toHaveCount(0);
    } finally {
      await request.delete(`/api/diagrams/${doc.id}`);
    }
  });
});
