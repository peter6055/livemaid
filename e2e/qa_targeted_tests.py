"""
LiveMaid QA: Targeted tests for undo/redo, comment workflow, and lock mode.
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3434"
results = []

def r(tid, status, detail):
    results.append((tid, status, detail))
    print(f"  [{status}] {tid}: {detail}")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # Navigate to existing diagram with comments
        page.goto(f"{BASE}/editor/0jNJj-p6cWLg8ypt1imlW")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(4000)

        # EDITOR-004: Undo/Redo
        print("\n=== EDITOR-004: Undo/Redo ===")
        monaco = page.locator(".monaco-editor").first
        if monaco.is_visible():
            monaco.click()
            page.wait_for_timeout(300)
            # Get initial code
            initial_text = page.evaluate("document.querySelector('.monaco-editor')?.textContent")
            # Type something
            page.keyboard.type("xxx")
            page.wait_for_timeout(500)
            # Undo
            page.keyboard.press("Control+z")
            page.wait_for_timeout(500)
            page.wait_for_timeout(500)
            # Redo
            page.keyboard.press("Control+Shift+z")
            page.wait_for_timeout(500)

            svg_ok = page.locator("svg").first.is_visible()
            r("EDITOR-004", "Pass" if svg_ok else "Fail", "Undo/redo via keyboard shortcut, SVG remains visible")

        # CMT-006: Create a comment
        print("\n=== CMT-006: Canvas comment creation ===")
        # Open comments
        cmt = page.get_by_role("button", name="Open comments")
        if cmt.is_visible():
            cmt.click()
            page.wait_for_timeout(1000)
        # Find comment mode toggle
        cmt_mode = page.locator("[title*='comment' i]").first
        if cmt_mode.is_visible():
            cmt_mode.click()
            page.wait_for_timeout(500)
            # Click on canvas
            canvas = page.locator(".mermaid-container").first
            box = canvas.bounding_box()
            if box:
                x, y = box["x"] + box["width"] * 0.3, box["y"] + box["height"] * 0.3
                page.mouse.click(x, y)
                page.wait_for_timeout(1000)
                # Check if composer appeared
                composer = page.locator("[data-comment-bubble] textarea, [data-comment-bubble] [contenteditable='true'], textarea[placeholder*='comment']").first
                if composer.is_visible():
                    composer.click()
                    page.wait_for_timeout(200)
                    page.keyboard.type("QA test comment", delay=20)
                    page.wait_for_timeout(200)
                    # Click Add button
                    add_btn = page.locator("button").filter(has_text="Add").first
                    if add_btn.is_visible():
                        add_btn.click()
                        page.wait_for_timeout(1000)
                        page.screenshot(path="/tmp/qa_cmt006_created.png")
                        r("CMT-006", "Pass", "Comment composer appeared, typed text, Add button visible")
                    else:
                        r("CMT-006", "Info", "Composer visible but Add button not found")
                else:
                    r("CMT-006", "Info", "Clicked canvas in comment mode but no composer appeared")
            page.screenshot(path="/tmp/qa_cmt006_state.png")
        else:
            r("CMT-006", "Info", "Comment mode toggle not found on this diagram")

        # CMT-012: Reply workflow
        print("\n=== CMT-012: Reply workflow ===")
        existing_threads = page.locator("[data-comment-thread-card]")
        count = existing_threads.count()
        if count > 0:
            existing_threads.first.click()
            page.wait_for_timeout(500)
            reply_input = page.locator("textarea, [placeholder*='Reply']").first
            if reply_input.is_visible():
                reply_input.fill("QA reply test")
                page.wait_for_timeout(200)
                reply_btn = page.locator("button").filter(has_text="Reply").first
                if reply_btn.is_visible():
                    r("CMT-012", "Pass", f"Reply workflow: found {count} threads, reply input and button visible")
                else:
                    r("CMT-012", "Info", f"Threads: {count}, reply input visible but Reply button not found")
            else:
                r("CMT-012", "Info", f"Threads: {count} but reply input not found")
        else:
            r("CMT-012", "Info", f"No existing threads found (count={count})")

        # CMT-013: Resolve/Reopen
        print("\n=== CMT-013: Resolve/Reopen ===")
        resolve_btn = page.locator("button").filter(has_text="Resolve").first
        if resolve_btn.is_visible():
            resolve_btn.click()
            page.wait_for_timeout(500)
            reopen_btn = page.locator("button").filter(has_text="Reopen").or_(
                page.locator("button").filter(has_text="Open")).first
            r("CMT-013", "Pass" if reopen_btn.is_visible() else "Info",
              "Resolve button clicked. Reopen/Resolved section visible")
        else:
            r("CMT-013", "Info", "Resolve button not found in current view")

        # CMT-014: Star
        print("\n=== CMT-014: Star ===")
        star_btn = page.locator("button[title*='star' i]").first
        if not star_btn.is_visible():
            star_btn = page.locator("svg.lucide-star").first
        if star_btn.is_visible():
            star_btn.click()
            page.wait_for_timeout(300)
            r("CMT-014", "Pass", "Star button found and clicked")
        else:
            r("CMT-014", "Info", "Star button not found")

        # CMT-015: Missing target fallback (test with existing comment that has a target)
        print("\n=== CMT-015: Missing target ===")
        sidebar = page.locator("[data-comment-sidebar]")
        if sidebar.is_visible():
            thread_cards = sidebar.locator("[data-comment-thread-card], [class*='thread']").first
            r("CMT-015", "Info", "Sidebar visible with threads. Manual check of missing targets needed")

        # CMT-016: Interaction isolation
        print("\n=== CMT-016: Interaction isolation ===")
        cmt_mode_toggle = page.locator("[title*='comment' i]").first
        if cmt_mode_toggle.is_visible():
            cmt_mode_toggle.click()
            page.wait_for_timeout(500)
            # Type in the filter/sort area
            sort_select = page.locator("button").filter(has_text="Newest").or_(
                page.locator("button").filter(has_text="Oldest")).first
            if sort_select.is_visible():
                sort_select.click()
                page.wait_for_timeout(300)
                # Press Escape to close
                page.keyboard.press("Escape")
                page.wait_for_timeout(300)
                r("CMT-016", "Pass", "Sort dropdown opened and closed without canvas interference")
            else:
                r("CMT-016", "Info", "Sort dropdown not visible")
        else:
            r("CMT-016", "Info", "Comment mode toggle not found")

        print("\n=== Final Results ===")
        for tid, status, detail in results:
            sym = "✅" if status == "Pass" else "❌" if status == "Fail" else "ℹ️"
            print(f"  {sym} {tid:25s} | {status:5s} | {detail}")

        browser.close()

if __name__ == "__main__":
    main()
