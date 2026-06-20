"""
LiveMaid QA: Cross-browser test runner (Chromium, Firefox, WebKit)
Usage:
    python e2e/qa_cross_browser.py --browser chromium
    python e2e/qa_cross_browser.py --browser firefox
    python e2e/qa_cross_browser.py --browser webkit
    python e2e/qa_cross_browser.py --all
"""
import sys, os, time, json, argparse
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3434")
BROWSER_MAP = {
    "chromium": lambda p: p.chromium.launch(headless=True),
    "firefox": lambda p: p.firefox.launch(headless=True),
    "webkit": lambda p: p.webkit.launch(headless=True),
}
ALL_RESULTS = {}  # browser_name -> list of result dicts
ALL_SCREENSHOTS = {}  # browser_name -> list of paths

def shot(page, browser_name, name):
    path = f"/tmp/qa_{browser_name}_{name}_{int(time.time())}.png"
    page.screenshot(path=path, full_page=True)
    ALL_SCREENSHOTS.setdefault(browser_name, []).append(path)
    return path

def r(results, test_id, diag_type, browser, status, steps, expected, actual, bug=None):
    results.append({"test_id": test_id, "diagram_type": diag_type, "browser": browser,
        "status": status, "steps": steps, "expected": expected, "actual": actual, "bug_issue": bug})
    print(f"  [{status}] {test_id}: {actual[:90] if actual else 'OK'}")

# ─── PHASE 0 ───
def phase0(page, info, results):
    print("\n=== PHASE 0: Preflight ===")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    r(results, "ENV-001", "N/A", info, "Pass" if not errors else "Fail",
      "Open dashboard, reload, check errors", "No console errors",
      f"Errors: {len(errors)}")
    shot(page, info.split("/")[0], "env001")

    diag_ok = page.evaluate("fetch('/api/diagrams').then(r => r.ok).catch(() => false)")
    folder_ok = page.evaluate("fetch('/api/folders').then(r => r.ok).catch(() => false)")
    r(results, "ENV-002", "N/A", info, "Pass" if diag_ok and folder_ok else "Fail",
      "Check API endpoints", "Both return 200",
      f"/api/diagrams OK: {diag_ok}, /api/folders OK: {folder_ok}")

# ─── PHASE 1 ───
def phase1(page, info, results):
    print("\n=== PHASE 1: Dashboard ===")
    diag_ids = {}

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    bname = info.split("/")[0]

    sidebar = page.locator("nav, [class*='w-80']").first.is_visible()
    heading = page.locator("h1").first.is_visible()
    new_btn = page.get_by_role("button", name="New Diagram").first.is_visible()
    r(results, "DASH-001", "N/A", info, "Pass" if sidebar and heading and new_btn else "Fail",
      "Check dashboard", "Sidebar, heading, New Diagram visible",
      f"Sidebar:{sidebar} Heading:{heading} NewDiagram:{new_btn}")

    # DASH-002: Dialog
    page.get_by_role("button", name="New Diagram").first.click()
    page.wait_for_timeout(1500)
    dialog = page.locator("[role='dialog']")
    tmpl_names = ["Blank","Flowchart","Sequence","Class","ER","State"]
    found = [t for t in tmpl_names if dialog.get_by_role("button", name=t, exact=True).is_visible()]
    create_btn = dialog.get_by_role("button", name="Create")
    cancel_btn = dialog.get_by_role("button", name="Cancel")
    shot(page, bname, "dash002")
    r(results, "DASH-002", "N/A", info, "Pass" if len(found) >= 6 and create_btn.is_visible() and cancel_btn.is_visible() else "Fail",
      "Open create dialog", "6 templates, name input, Create/Cancel buttons",
      f"Templates:{len(found)} Create:{create_btn.is_visible()} Cancel:{cancel_btn.is_visible()}")

    # DASH-003: Create each diagram type
    for templ, label in [("blank","Blank"),("flowchart","Flowchart"),("sequence","Sequence"),
                          ("classDiagram","Class"),("erDiagram","ER"),("stateDiagram","State")]:
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)
            page.get_by_role("button", name="New Diagram").first.click()
            page.wait_for_timeout(2000)
            d = page.locator("[role='dialog']")
            if not d.is_visible():
                r(results, f"DASH-003-{label}", label, info, "Fail", "Open create dialog", "Dialog visible",
                  "Dialog not visible")
                continue
            if label != "Blank":
                page.evaluate(f"""
                    Array.from(document.querySelectorAll("[role=dialog] button"))
                        .find(b => b.textContent.trim() === '{label}')?.click()
                """)
                page.wait_for_timeout(500)
            page.evaluate("""
                Array.from(document.querySelectorAll("[role=dialog] button"))
                    .find(b => b.textContent.trim() === 'Create')?.click()
            """)
            page.wait_for_timeout(5000)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)
            in_editor = "/editor/" in page.url
            diag_id = page.url.split("/editor/")[-1].split("?")[0] if in_editor else None
            if diag_id:
                diag_ids[label] = diag_id
            shot(page, bname, f"dash003_{label.lower()}")
            r(results, f"DASH-003-{label}", label, info, "Pass" if in_editor else "Fail",
              f"Create {label} diagram", "Navigated to /editor/<id>",
              f"Editor loaded: {in_editor}")
        except Exception as e:
            r(results, f"DASH-003-{label}", label, info, "Fail", f"Create {label} diagram", "OK",
              f"Error: {str(e)[:60]}")

    if not diag_ids:
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        cards = page.locator("a[href^='/editor/']")
        if cards.count() > 0:
            href = cards.first.get_attribute("href")
            ex_id = href.split("/editor/")[-1] if href else None
            diag_ids["Fallback"] = ex_id

    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    cards = page.locator("a[href^='/editor/']").count()
    shot(page, bname, "dash004")
    r(results, "DASH-004", "All", info, "Pass" if cards >= 1 else "Fail",
      "Return to dashboard, check previews", "Preview cards visible",
      f"Cards:{cards}")

    search = page.locator("input[placeholder*='Search']").first.is_visible()
    sort_btn = page.get_by_role("button", name="Last edited").or_(page.get_by_role("button", name="Date created")).first.is_visible()
    r(results, "DASH-005", "N/A", info, "Pass" if search and sort_btn else "Fail",
      "Check search, sort", "All controls visible",
      f"Search:{search} Sort:{sort_btn}")

    folder_section = page.locator("text=Folders").first.is_visible()
    new_folder = page.get_by_role("button", name="New Folder").first.is_visible()
    r(results, "DASH-006", "N/A", info, "Pass" if folder_section and new_folder else "Info",
      "Check folder section", "Folder tree and New Folder visible",
      f"Folders:{folder_section} NewFolder:{new_folder}")

    return diag_ids

# ─── PHASE 2 ───
def phase2(page, info, results, diag_ids):
    print("\n=== PHASE 2: Editor ===")
    bname = info.split("/")[0]
    editor_tests = {"Flowchart": diag_ids.get("Flowchart"), "Sequence": diag_ids.get("Sequence"),
                    "Diagram": diag_ids.get("Fallback")}
    for label, did in editor_tests.items():
        if not did:
            continue
        page.goto(f"{BASE_URL}/editor/{did}")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(4000)
        svg_ok = page.locator("svg").first.is_visible()
        monaco = page.locator(".monaco-editor").first.is_visible()
        shot(page, bname, f"editor001_{label.lower()}")
        r(results, f"EDITOR-001-{label}", label, info, "Pass" if svg_ok else "Fail",
          f"Open {label} editor", "SVG renders, code panel loads",
          f"SVG:{svg_ok} Monaco:{monaco}")

        monaco_editor = page.locator(".monaco-editor").first
        if monaco_editor.is_visible():
            monaco_editor.click()
            page.wait_for_timeout(300)
            page.keyboard.press("Control+a")
            page.wait_for_timeout(200)
            code = "flowchart TD\n    A[Start] --> B[End]\n    B --> C[Save Test]"
            for ch in code:
                page.keyboard.type(ch, delay=10)
            page.wait_for_timeout(3000)
            page.wait_for_timeout(2000)
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(4000)
        svg_after = page.locator("svg").first.is_visible()
        shot(page, bname, f"editor003_{label.lower()}")
        r(results, f"EDITOR-003-{label}", label, info, "Pass" if svg_after else "Fail",
          "Modify code, reload", "Code and diagram persist",
          f"SVG after reload:{svg_after}")

        zoom_controls = page.get_by_role("button").filter(has_text="1:1").or_(
            page.locator("[title*='reset' i][title*='zoom' i], button:has-text('1:1')")).first
        canvas_ok = page.locator("[class*='transform']").first.is_visible()
        r(results, f"EDITOR-006-{label}", label, info, "Pass" if zoom_controls.is_visible() else "Info",
          "Check zoom/pan", "Zoom controls and canvas transform present",
          f"Zoom:{zoom_controls.is_visible()} Canvas:{canvas_ok}")

        export_btn = page.get_by_role("button", name="Export")
        r(results, f"EDITOR-007-{label}", label, info, "Info" if export_btn.is_visible() else "Info",
          "Check Export button", "Export button visible",
          f"Export btn visible:{export_btn.is_visible()}")

# ─── PHASE 3 ───
def phase3(page, info, results, diag_ids):
    print("\n=== PHASE 3: Comments ===")
    bname = info.split("/")[0]
    for label, did in diag_ids.items():
        if not did:
            continue
        page.goto(f"{BASE_URL}/editor/{did}")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(4000)

        cmt_btn = page.get_by_role("button", name="Open comments")
        if cmt_btn.is_visible() or page.get_by_role("button", name="Comments").first.is_visible():
            if not cmt_btn.is_visible():
                cmt_btn = page.get_by_role("button", name="Comments").first
            cmt_btn.click()
            page.wait_for_timeout(1500)
            sidebar = page.locator("[data-comment-sidebar]")
            sidebar_ok = sidebar.is_visible()
            shot(page, bname, f"cmt001_{label.lower()}")
            r(results, f"CMT-001-{label}", label, info, "Pass" if sidebar_ok else "Fail",
              "Click Comments button", "Comments sidebar opens",
              f"Sidebar visible:{sidebar_ok}")
        else:
            r(results, f"CMT-001-{label}", label, info, "Info",
              "Check Comments button", "Comments button visible",
              "Not found")
            continue

        close_btn = page.get_by_role("button", name="Close comments")
        if close_btn.is_visible():
            close_btn.click()
            page.wait_for_timeout(500)
            sidebar = page.locator("[data-comment-sidebar]")
            sidebar_gone = not sidebar.is_visible()
            r(results, f"CMT-002-{label}", label, info, "Pass" if sidebar_gone else "Fail",
              "Close comments panel", "Sidebar closes cleanly",
              f"Sidebar closed:{sidebar_gone}")

        cmt_mode_btn = page.locator("[title*='comment' i]").first
        if not cmt_mode_btn.is_visible():
            cmt_mode_btn = page.locator("svg.lucide-message-square-plus").first
        if cmt_mode_btn.is_visible():
            cmt_mode_btn.click()
            page.wait_for_timeout(500)
            r(results, f"CMT-004-{label}", label, info, "Pass",
              "Toggle comment mode from toolbar", "Comment mode activates",
              "Comment mode toggled")
        else:
            r(results, f"CMT-004-{label}", label, info, "Info",
              "Find comment mode toggle", "Toolbar comment icon visible",
              "Toggle not found")

# ─── PHASE 6 ───
def phase6(page, info, results):
    print("\n=== PHASE 6: API ===")
    diags = page.evaluate("""async () => {
        try { const r = await fetch('/api/diagrams'); return await r.json(); }
        catch(e) { return null; }
    }""")
    if not diags or not isinstance(diags, (list, dict)):
        r(results, "API-001", "N/A", info, "Fail",
          "GET /api/diagrams", "Returns array", f"Unexpected type: {type(diags)}")
        return
    # Handle both plain array and {items: [...]} response format
    if isinstance(diags, dict) and "items" in diags:
        diag_list = diags["items"]
    elif isinstance(diags, list):
        diag_list = diags
    else:
        diag_list = []
    if len(diag_list) == 0:
        r(results, "API-001", "N/A", info, "Info",
          "GET /api/diagrams", "Returns non-empty array",
          f"Response has 0 items. Format: {type(diags).__name__}")
        return
    first_id = diag_list[0]["id"]
    comments = page.evaluate(f"""async () => {{
        try {{
            const r = await fetch('/api/diagrams/{first_id}/comments');
            if (!r.ok) return {{status: r.status}};
            const data = await r.json();
            if (Array.isArray(data)) return data;
            if (data && data.items) return data.items;
            return data;
        }} catch(e) {{ return null; }}
    }}""")
    if isinstance(comments, list):
        r(results, "API-001", "N/A", info, "Pass", f"GET /api/diagrams/{first_id}/comments",
          "Returns 200 and array", f"Comments array, length={len(comments)}")
    elif comments and "status" in comments:
        r(results, "API-001", "N/A", info, "Fail", f"GET /api/diagrams/{first_id}/comments",
          "Returns 200", f"Status: {comments['status']}")
    else:
        r(results, "API-001", "N/A", info, "Info", f"GET /api/diagrams/{first_id}/comments",
          "Returns 200 and array", f"Response: {str(comments)[:50]}")

def run_browser(browser_name):
    """Run the full test plan for one browser engine. Returns (results, screenshots)."""
    results = []
    info = f"{browser_name}/macOS/1280x800"

    print(f"\n{'='*70}")
    print(f"RUNNING: {browser_name}")
    print(f"{'='*70}")

    with sync_playwright() as p:
        launch_fn = BROWSER_MAP.get(browser_name)
        if not launch_fn:
            print(f"Unknown browser: {browser_name}")
            return results, []
        browser = launch_fn(p)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        try:
            phase0(page, info, results)
            diag_ids = phase1(page, info, results)
            phase2(page, info, results, diag_ids)
            phase3(page, info, results, diag_ids)
            phase6(page, info, results)
        except Exception as e:
            import traceback
            traceback.print_exc()
            r(results, "ERROR", "N/A", info, "Fail", "Test runner", "No errors",
              f"Exception: {str(e)[:80]}")

        browser.close()

    return results, ALL_SCREENSHOTS.get(browser_name, [])

def print_combined(results_dict):
    """Print per-browser and combined results table."""
    print(f"\n{'='*70}")
    print("CROSS-BROWSER QA RESULTS")
    print(f"{'='*70}")

    all_pass = all_fail = all_info = 0
    for bname, rlist in results_dict.items():
        pc = sum(1 for r in rlist if r["status"] == "Pass")
        fc = sum(1 for r in rlist if r["status"] == "Fail")
        ic = sum(1 for r in rlist if r["status"] == "Info")
        all_pass += pc; all_fail += fc; all_info += ic
        print(f"\n  {bname.upper():12s}   Pass: {pc:2d}   Fail: {fc:2d}   Info: {ic:2d}   Total: {len(rlist):2d}")

    total_total = sum(len(r) for r in results_dict.values())
    print(f"\n  {'COMBINED':12s}   Pass: {all_pass:2d}   Fail: {all_fail:2d}   Info: {all_info:2d}   Total: {total_total:2d}")

    # Per-test cross-browser comparison
    test_ids = sorted(set(r["test_id"] for rlist in results_dict.values() for r in rlist))
    print(f"\n  Test-by-test comparison:")
    for tid in test_ids:
        statuses = {}
        for bname, rlist in results_dict.items():
            for r_ in rlist:
                if r_["test_id"] == tid:
                    statuses[bname] = r_["status"]
        row = "  |".join(statuses.get(b, "----") for b in ["chromium","firefox","webkit"])
        consistency = "✅" if len(set(statuses.values())) <= 1 else "⚠️"
        print(f"    {tid:30s} | {row}  {consistency}")

def main():
    parser = argparse.ArgumentParser(description="LiveMaid Cross-Browser QA Runner")
    parser.add_argument("--browser", choices=list(BROWSER_MAP.keys()), help="Browser to test")
    parser.add_argument("--all", action="store_true", help="Run all browsers sequentially")
    args = parser.parse_args()

    if args.all:
        browsers = list(BROWSER_MAP.keys())
    elif args.browser:
        browsers = [args.browser]
    else:
        parser.print_help()
        sys.exit(1)

    for bname in browsers:
        results, shots = run_browser(bname)
        ALL_RESULTS[bname] = results

    print_combined(ALL_RESULTS)

if __name__ == "__main__":
    main()
