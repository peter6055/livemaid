import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch } from "@/lib/api/client";

const assign = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockReset();
});

function stubBrowser(status: number, pathname = "/livemaid/dashboard") {
  vi.stubGlobal("window", {
    __APP_BASE__: "/livemaid",
    location: { assign, pathname, href: `https://example.test${pathname}` },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status })),
  );
}

describe("apiFetch", () => {
  it("redirects to the login page with a session-expired reason on 401", async () => {
    stubBrowser(401);

    const res = await apiFetch("http://localhost/api/diagrams");

    expect(res.status).toBe(401);
    expect(assign).toHaveBeenCalledWith("/livemaid/login?reason=expired");
  });

  it("navigates once when several requests expire together", async () => {
    stubBrowser(401);

    await Promise.all([
      apiFetch("http://localhost/api/diagrams"),
      apiFetch("http://localhost/api/folders"),
    ]);

    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("does not reload the login page when one of its own requests returns 401", async () => {
    stubBrowser(401, "/livemaid/login");

    const res = await apiFetch("http://localhost/api/preferences");

    expect(res.status).toBe(401);
    expect(assign).not.toHaveBeenCalled();
  });

  it("redirects to the restricted page on 403", async () => {
    stubBrowser(403);

    const res = await apiFetch("http://localhost/api/diagrams");

    expect(res.status).toBe(403);
    expect(assign).toHaveBeenCalledWith("/livemaid/restricted");
  });

  it("does not reload the restricted page on another 403", async () => {
    stubBrowser(403, "/livemaid/restricted");

    const res = await apiFetch("http://localhost/api/diagrams");

    expect(res.status).toBe(403);
    expect(assign).not.toHaveBeenCalled();
  });

  it("leaves other responses untouched and passes init through", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("window", {
      __APP_BASE__: "",
      location: { assign, pathname: "/", href: "https://example.test/" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const init: RequestInit = { method: "POST", body: "{}" };
    const res = await apiFetch("http://localhost/api/diagrams", init);

    expect(res.status).toBe(200);
    expect(assign).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost/api/diagrams", init);
  });
});
