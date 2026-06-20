"use client";

import { useState, useEffect, useCallback } from "react";

export interface UserPreferences {
  viewMode: "grid" | "list";
  sortBy: "edited" | "created" | "name";
  currentFolderId: string | null;
}

const STORAGE_KEY = "livemaid:preferences";

const defaults: UserPreferences = {
  viewMode: "grid",
  sortBy: "edited",
  currentFolderId: null,
};

function loadPreferences(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return {
      viewMode:
        parsed.viewMode === "list" || parsed.viewMode === "grid"
          ? parsed.viewMode
          : defaults.viewMode,
      sortBy:
        parsed.sortBy === "edited" || parsed.sortBy === "created" || parsed.sortBy === "name"
          ? parsed.sortBy
          : defaults.sortBy,
      currentFolderId:
        typeof parsed.currentFolderId === "string"
          ? parsed.currentFolderId
          : defaults.currentFolderId,
    };
  } catch {
    return { ...defaults };
  }
}

export function useUserPreferences() {
  const [prefs, setPrefs] = useState<UserPreferences>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(loadPreferences());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs, hydrated]);

  const update = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setPrefs((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reset = useCallback(() => {
    setPrefs({ ...defaults });
  }, []);

  return { prefs, hydrated, update, reset };
}
