import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({ isDemoMode: vi.fn(() => false) }));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  isAuthEnabled: vi.fn(() => false),
  AuthorizationError: class AuthorizationError extends Error {
    constructor(message = "Forbidden") {
      super(message);
      this.name = "AuthorizationError";
    }
  },
}));

vi.mock("@/lib/auth/routeAuth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/routeAuth")>("@/lib/auth/routeAuth");
  return { ...actual, getSessionOrNull: vi.fn(async () => null) };
});

vi.mock("@/lib/preferences/store", () => ({
  LOCAL_PREFERENCE_OWNER: "local",
  preferencesStorageConfigured: vi.fn(() => true),
  readPreferences: vi.fn(async () => ({ preferences: {}, stored: false })),
  resolvePreferenceOwner: (userId?: string | null) => userId ?? "local",
  writePreferences: vi.fn(async () => ({})),
}));

import * as auth from "@/lib/auth";
import * as routeAuth from "@/lib/auth/routeAuth";
import * as env from "@/lib/env";
import * as store from "@/lib/preferences/store";
import { GET, PATCH } from "@/app/api/preferences/route";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/core";

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/preferences", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(env.isDemoMode).mockReturnValue(false);
  vi.mocked(auth.isAuthEnabled).mockResolvedValue(false as never);
  vi.mocked(routeAuth.getSessionOrNull).mockResolvedValue(null);
  vi.mocked(store.preferencesStorageConfigured).mockReturnValue(true);
  vi.mocked(store.readPreferences).mockResolvedValue({
    preferences: PREFERENCE_DEFAULTS,
    stored: false,
  });
  vi.mocked(store.writePreferences).mockResolvedValue(PREFERENCE_DEFAULTS);
});

describe("GET /api/preferences", () => {
  it("reads the standalone owner when auth is disabled", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(store.readPreferences).toHaveBeenCalledWith("local");
  });

  it("reads the signed-in user's document in workspace mode", async () => {
    vi.mocked(auth.isAuthEnabled).mockResolvedValue(true as never);
    vi.mocked(routeAuth.getSessionOrNull).mockResolvedValue({ user: { id: "user-42" } } as never);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(store.readPreferences).toHaveBeenCalledWith("user-42");
  });

  it("rejects an unauthenticated request in workspace mode", async () => {
    vi.mocked(auth.isAuthEnabled).mockResolvedValue(true as never);

    const response = await GET();
    expect(response.status).toBe(401);
    expect(store.readPreferences).not.toHaveBeenCalled();
  });

  it("returns 503 when MongoDB is not configured", async () => {
    vi.mocked(store.preferencesStorageConfigured).mockReturnValue(false);

    const response = await GET();
    expect(response.status).toBe(503);
    expect(store.readPreferences).not.toHaveBeenCalled();
  });

  it("serves defaults in demo mode without touching storage", async () => {
    vi.mocked(env.isDemoMode).mockReturnValue(true);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preferences: PREFERENCE_DEFAULTS, stored: false });
    expect(store.readPreferences).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/preferences", () => {
  it("writes only validated fields for the standalone owner", async () => {
    vi.mocked(store.writePreferences).mockResolvedValue({
      ...PREFERENCE_DEFAULTS,
      theme: "dark",
    });

    const response = await PATCH(
      patchRequest({ theme: "dark", bogus: "x", usageAnalytics: "yes" }),
    );

    expect(response.status).toBe(200);
    expect(store.writePreferences).toHaveBeenCalledWith("local", { theme: "dark" });
  });

  it("rejects a body with no valid fields", async () => {
    const response = await PATCH(patchRequest({ theme: "sepia", nothing: true }));
    expect(response.status).toBe(400);
    expect(store.writePreferences).not.toHaveBeenCalled();
  });

  it("rejects an unparsable body", async () => {
    const response = await PATCH(patchRequest("{not json"));
    expect(response.status).toBe(400);
    expect(store.writePreferences).not.toHaveBeenCalled();
  });

  it("rejects writes in demo mode", async () => {
    vi.mocked(env.isDemoMode).mockReturnValue(true);

    const response = await PATCH(patchRequest({ theme: "dark" }));
    expect(response.status).toBe(403);
    expect(store.writePreferences).not.toHaveBeenCalled();
  });
});
