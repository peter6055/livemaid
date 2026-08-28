// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: vi.fn(async () => ({ svg: "<svg/>" })),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/api/storage", () => ({}));

import { toast } from "sonner";
import { useEditorState, type OfflineConflict } from "@/hooks/useEditorState";
import { saveOfflineEdit, getOfflineEdit } from "@/lib/offlineStorage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIAGRAM_ID = "test-diagram";
const STORAGE_URL = `/api/diagrams/${DIAGRAM_ID}`;

type Hook = ReturnType<typeof useEditorState>;

// ── Hand-rolled renderHook harness (no @testing-library/react) ───────────────

let unmountCurrent: (() => void) | null = null;

function renderHook(): { result: { current: Hook } } {
  const result: { current: Hook | null } = { current: null };
  const Probe = () => {
    result.current = useEditorState(DIAGRAM_ID);
    return null;
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(Probe));
  });
  unmountCurrent = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
    unmountCurrent = null;
  };
  return { result: result as { current: Hook } };
}

// ── fetch + connectivity harness ─────────────────────────────────────────────

const net = {
  // fetch-level network cut: requests throw while true (browser status may still say online)
  offline: false,
  // server-responded failure mode for PUT (non-ok status), distinct from a network throw
  failPutStatus: null as number | null,
  serverDoc: null as Record<string, unknown> | null,
  putBodies: [] as Array<{ code: string }>,
};

function makeDoc(code: string): Record<string, unknown> {
  return {
    id: DIAGRAM_ID,
    name: "Test",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    code,
    type: "flowchart",
    folderId: null,
    subPages: [],
    comments: [],
    versionHistory: [],
  };
}

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function installFetch(initialCode: string): void {
  net.serverDoc = makeDoc(initialCode);
  net.putBodies = [];
  net.failPutStatus = null;
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (net.offline) throw new TypeError("Failed to fetch");
    if (String(url) !== STORAGE_URL) throw new Error(`unexpected url: ${String(url)}`);
    const method = init?.method ?? "GET";
    if (method === "GET") return makeResponse(net.serverDoc);
    if (method === "PUT") {
      if (net.failPutStatus !== null) {
        return makeResponse({ error: "boom" }, false, net.failPutStatus);
      }
      const body = JSON.parse(String(init?.body)) as { code: string };
      net.putBodies.push(body);
      net.serverDoc = { ...net.serverDoc, code: body.code };
      return makeResponse(net.serverDoc);
    }
    throw new Error(`unexpected method: ${method}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

/** Flips the browser connectivity status (navigator.onLine + online/offline events). */
function setBrowserOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

async function flush(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function loadDoc(): Promise<{ result: { current: Hook } }> {
  const h = renderHook();
  await flush(700); // initial GET + the artificial min-load delay in fetchDoc
  return h;
}

function seedCache(baseCode: string, pendingCode: string): void {
  saveOfflineEdit({ diagramId: DIAGRAM_ID, baseCode, pendingCode, updatedAt: Date.now() });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  net.offline = false;
  net.failPutStatus = null;
  net.serverDoc = null;
  net.putBodies = [];
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => {
  unmountCurrent?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // jsdom's navigator object is shared across tests in this file — drop the stubbed
  // onLine own-property so the next test mounts with the default (online) status.
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  window.localStorage.clear();
});

describe("useEditorState offline editing + sync-on-reconnect", () => {
  it("caches an edit made offline after the debounce, without attempting a PUT", async () => {
    installFetch("SERVER_V1");
    const { result } = await loadDoc();
    expect(result.current.code).toBe("SERVER_V1");

    act(() => {
      setBrowserOnline(false); // user goes offline during the debounce window
    });
    act(() => {
      result.current.handleCodeChange("OFFLINE_V1");
    });
    await flush(1600);

    expect(getOfflineEdit(DIAGRAM_ID)).toEqual({
      diagramId: DIAGRAM_ID,
      baseCode: "SERVER_V1",
      pendingCode: "OFFLINE_V1",
      updatedAt: expect.any(Number),
    });
    expect(result.current.offlinePending).toBe(true);
    expect(result.current.hasUnsavedChangesRef.current).toBe(true);
    expect(net.putBodies).toHaveLength(0);
  });

  it("auto-saves via PUT when online and leaves no cache entry", async () => {
    installFetch("SERVER_V1");
    const { result } = await loadDoc();

    act(() => {
      result.current.handleCodeChange("V2");
    });
    await flush(1600);

    expect(net.putBodies).toEqual([{ code: "V2" }]);
    expect(result.current.doc?.code).toBe("V2");
    expect(getOfflineEdit(DIAGRAM_ID)).toBeNull();
    expect(result.current.offlinePending).toBe(false);
    expect(result.current.hasUnsavedChangesRef.current).toBe(false);
  });

  it("caches locally and stays dirty when the PUT request throws mid-flight", async () => {
    installFetch("SERVER_V1");
    const { result } = await loadDoc();

    act(() => {
      net.offline = true; // browser still reports online; fetch will throw
    });
    act(() => {
      result.current.handleCodeChange("V3");
    });
    await flush(1600);

    expect(net.putBodies).toHaveLength(0);
    expect(getOfflineEdit(DIAGRAM_ID)).toEqual({
      diagramId: DIAGRAM_ID,
      baseCode: "SERVER_V1",
      pendingCode: "V3",
      updatedAt: expect.any(Number),
    });
    expect(result.current.offlinePending).toBe(true);
    expect(result.current.hasUnsavedChangesRef.current).toBe(true);
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Offline: changes saved locally and will sync when reconnected",
    );
  });

  it("restores a cached edit on load and replays it via PUT when back online with unchanged server", async () => {
    installFetch("BASE");
    seedCache("BASE", "PENDING");
    setBrowserOnline(false);
    net.offline = true; // fully offline reload — initial GET throws

    const { result } = await loadDoc();
    expect(result.current.code).toBe("PENDING");
    expect(result.current.offlinePending).toBe(true);
    expect(result.current.hasUnsavedChangesRef.current).toBe(true);

    net.offline = false; // connectivity returns
    act(() => {
      setBrowserOnline(true);
    });
    await flush(200);

    expect(net.putBodies).toEqual([{ code: "PENDING" }]);
    expect(getOfflineEdit(DIAGRAM_ID)).toBeNull();
    expect(result.current.offlinePending).toBe(false);
    expect(result.current.hasUnsavedChangesRef.current).toBe(false);
    expect(result.current.code).toBe("PENDING");
    expect(result.current.doc?.code).toBe("PENDING");
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Back online — your changes are synced");
  });

  it("surfaces a conflict instead of a PUT when the server changed while offline", async () => {
    installFetch("CHANGED_ON_SERVER");
    seedCache("BASE", "PENDING");
    setBrowserOnline(false);
    net.offline = true;

    const { result } = await loadDoc();
    expect(result.current.code).toBe("PENDING");

    net.offline = false;
    act(() => {
      setBrowserOnline(true);
    });
    await flush(200);

    const conflict: OfflineConflict | null = result.current.conflict;
    expect(conflict).toEqual({
      baseCode: "BASE",
      pendingCode: "PENDING",
      serverCode: "CHANGED_ON_SERVER",
    });
    expect(net.putBodies).toHaveLength(0);
    expect(getOfflineEdit(DIAGRAM_ID)).not.toBeNull();
    expect(result.current.syncing).toBe(false);
  });

  it("resolveConflict('mine') pushes the pending code and clears the conflict", async () => {
    installFetch("CHANGED_ON_SERVER");
    seedCache("BASE", "PENDING");
    setBrowserOnline(false);
    net.offline = true;

    const { result } = await loadDoc();

    net.offline = false;
    act(() => {
      setBrowserOnline(true);
    });
    await flush(200);
    expect(result.current.conflict).not.toBeNull();

    act(() => {
      void result.current.resolveConflict("mine");
    });
    await flush(200);

    expect(net.putBodies).toEqual([{ code: "PENDING" }]);
    expect(getOfflineEdit(DIAGRAM_ID)).toBeNull();
    expect(result.current.conflict).toBeNull();
    expect(result.current.offlinePending).toBe(false);
    expect(result.current.hasUnsavedChangesRef.current).toBe(false);
    expect(result.current.doc?.code).toBe("PENDING");
  });

  it("restores the pending code when the initial fetch fails with a cache present", async () => {
    installFetch("SERVER_V1");
    seedCache("BASE", "PENDING");
    setBrowserOnline(false);
    net.offline = true; // initial GET throws

    const { result } = await loadDoc();

    expect(result.current.code).toBe("PENDING");
    expect(result.current.notFound).toBe(false);
    expect(result.current.offlinePending).toBe(true);
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("keeps the dirty flag and shows the plain failure toast when the server responds non-ok", async () => {
    installFetch("SERVER_V1");
    const { result } = await loadDoc();

    net.failPutStatus = 500;
    act(() => {
      result.current.handleCodeChange("V5");
    });
    await flush(1600);

    expect(getOfflineEdit(DIAGRAM_ID)).toBeNull();
    expect(result.current.offlinePending).toBe(false);
    expect(result.current.hasUnsavedChangesRef.current).toBe(true);
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to auto-save");
  });
});
