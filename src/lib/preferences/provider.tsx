"use client";

// Single owner of every user preference: dashboard layout, theme, and telemetry consent.
//
// The stored document (`/api/preferences`, MongoDB) is the source of truth across devices. The
// browser cache in localStorage is the instant value used before the request lands, when the
// database is unreachable, and as the outbox that replays a failed write on the next load.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import { appUrl } from "@/lib/api/url";
import { apiFetch } from "@/lib/api/client";
import {
  mergePreferences,
  normalizePreferences,
  sanitizePreferences,
  PREFERENCE_DEFAULTS,
  type ThemePreference,
  type UserPreferences,
} from "./core";

const CACHE_KEY = "livemaid:preferences";
// Every change is queued here before the debounced PATCH, so a write lost to offline/database-down
// is replayed on the next load instead of being overwritten by the stored value.
// shortcut: the outbox is per browser, not per account; a shared browser with a failed write could
// replay it onto the next signed-in user. Upgrade when shared-browser accounts matter.
const PENDING_KEY = "livemaid:preferences:pending";
const FLUSH_DELAY_MS = 500;

function readCache(): UserPreferences {
  try {
    return normalizePreferences(JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null"));
  } catch {
    return { ...PREFERENCE_DEFAULTS };
  }
}

function writeCache(prefs: UserPreferences): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or disabled: the in-memory state still works for this session.
  }
}

function readPending(): Partial<UserPreferences> {
  try {
    return sanitizePreferences(JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "null"));
  } catch {
    return {};
  }
}

function writePending(patch: Partial<UserPreferences>): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ ...readPending(), ...patch }));
  } catch {
    // Ignore, same as the cache.
  }
}

function clearPending(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Ignore.
  }
}

// next-themes persists the chosen theme under its own `theme` key, before any account exists. On a
// fresh account that value is the user's real preference, not our default of `system`.
function readDeviceTheme(): ThemePreference | undefined {
  try {
    const stored = window.localStorage.getItem("theme");
    return stored === "light" || stored === "dark" || stored === "system" ? stored : undefined;
  } catch {
    return undefined;
  }
}

async function sendPreferences(patch: Partial<UserPreferences>): Promise<boolean> {
  try {
    const response = await apiFetch(appUrl("/api/preferences"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return response.ok;
  } catch {
    return false;
  }
}

interface PreferencesContextValue {
  prefs: UserPreferences;
  /** True once the browser cache has been read; before that `prefs` is the defaults. */
  hydrated: boolean;
  update: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  prefs: PREFERENCE_DEFAULTS,
  hydrated: false,
  update: () => {},
  reset: () => {},
});

export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(PREFERENCE_DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const { theme, setTheme } = useTheme();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverLoadedRef = useRef(false);
  // Keys the user changed in this session. A slower in-flight GET must not roll them back.
  const touchedKeysRef = useRef(new Set<keyof UserPreferences>());

  const scheduleFlush = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = readPending();
    if (Object.keys(patch).length === 0) return;
    if (await sendPreferences(patch)) clearPending();
  }, []);

  // Cache first: renders saved values immediately and keeps working without a database.
  useEffect(() => {
    setPrefs(readCache());
    setHydrated(true);
  }, []);

  // Mirror every change into the cache (after paint; the request is the durable copy).
  useEffect(() => {
    if (hydrated) writeCache(prefs);
  }, [prefs, hydrated]);

  // Then the stored document, which wins over the cache except for this session's own changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await apiFetch(appUrl("/api/preferences")).catch(() => null);
      // No database (503), demo mode, or offline: the cache stays authoritative for this session.
      if (!response?.ok || cancelled) return;
      const data = (await response.json()) as { preferences: UserPreferences; stored: boolean };
      if (cancelled) return;

      const server = normalizePreferences(data.preferences);
      const pending = readPending();
      // A fresh account adopts this browser's values (including the theme, which next-themes
      // already persisted under its own key before this feature existed). An existing account only
      // replays the outbox.
      const cached = mergePreferences(readCache(), pending);
      const seed: Partial<UserPreferences> = data.stored
        ? pending
        : { ...cached, theme: pending.theme ?? readDeviceTheme() ?? cached.theme };
      if (Object.keys(seed).length > 0 && (await sendPreferences(seed))) clearPending();
      if (cancelled) return;

      // Only a stored account preference may override this device; a rejected seed leaves it alone.
      serverLoadedRef.current = data.stored;
      setPrefs((current) => {
        let next = mergePreferences(server, seed);
        for (const key of touchedKeysRef.current) next = { ...next, [key]: current[key] };
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the account theme on a device that has none. One frame may flash (accepted trade-off);
  // a write the user just made is never overridden while its request is still queued.
  useEffect(() => {
    if (!serverLoadedRef.current) return;
    if (typeof theme !== "string" || theme === prefs.theme) return;
    if (Object.keys(readPending()).length > 0) return;
    setTheme(prefs.theme);
  }, [prefs.theme, theme, setTheme]);

  const update = useCallback(
    function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
      touchedKeysRef.current.add(key);
      setPrefs((previous) => ({ ...previous, [key]: value }));
      writePending({ [key]: value });
      if (timerRef.current === null) {
        timerRef.current = setTimeout(() => void scheduleFlush(), FLUSH_DELAY_MS);
      }
    },
    [scheduleFlush],
  );

  const reset = useCallback(() => {
    for (const key of Object.keys(PREFERENCE_DEFAULTS) as (keyof UserPreferences)[]) {
      touchedKeysRef.current.add(key);
    }
    setPrefs(PREFERENCE_DEFAULTS);
    writePending(PREFERENCE_DEFAULTS);
    if (timerRef.current === null) {
      timerRef.current = setTimeout(() => void scheduleFlush(), FLUSH_DELAY_MS);
    }
  }, [scheduleFlush]);

  return (
    <PreferencesContext.Provider value={{ prefs, hydrated, update, reset }}>
      {children}
    </PreferencesContext.Provider>
  );
}
