// Preference shape, validation, and defaults.
//
// Pure (no I/O) so both the API route and the client provider share one definition of what a valid
// preference document looks like. A value the app does not recognise is dropped, never coerced, so
// an old or hostile payload cannot flip a privacy flag or crash a consumer.

export type ThemePreference = "system" | "light" | "dark";
export type ViewMode = "grid" | "list";
export type SortBy = "edited" | "created" | "name";

export interface UserPreferences {
  viewMode: ViewMode;
  sortBy: SortBy;
  /** Last folder opened in the dashboard. Workspace content: validated against the loaded tree. */
  currentFolderId: string | null;
  theme: ThemePreference;
  /** Consent flag: anonymous usage events. */
  usageAnalytics: boolean;
  /** Consent flag: error reports that may contain diagram code. */
  debugReporting: boolean;
}

export const PREFERENCE_DEFAULTS: UserPreferences = {
  viewMode: "grid",
  sortBy: "edited",
  currentFolderId: null,
  theme: "system",
  usageAnalytics: false,
  debugReporting: false,
};

type Validator<K extends keyof UserPreferences> = (
  value: unknown,
) => UserPreferences[K] | undefined;

const VALIDATORS: { [K in keyof UserPreferences]: Validator<K> } = {
  viewMode: (v) => (v === "grid" || v === "list" ? v : undefined),
  sortBy: (v) => (v === "edited" || v === "created" || v === "name" ? v : undefined),
  currentFolderId: (v) =>
    v === null ? null : typeof v === "string" && v.length > 0 ? v : undefined,
  theme: (v) => (v === "system" || v === "light" || v === "dark" ? v : undefined),
  usageAnalytics: (v) => (typeof v === "boolean" ? v : undefined),
  debugReporting: (v) => (typeof v === "boolean" ? v : undefined),
};

const KEYS = Object.keys(VALIDATORS) as (keyof UserPreferences)[];

/**
 * Keep only known keys with valid values. Unknown keys and invalid values are dropped, which makes
 * this safe for untrusted input (request bodies, localStorage contents, stored documents).
 */
export function sanitizePreferences(raw: unknown): Partial<UserPreferences> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of KEYS) {
    if (!(key in source)) continue;
    const value = VALIDATORS[key](source[key]);
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<UserPreferences>;
}

/** Full preference document: valid stored values over the defaults. */
export function normalizePreferences(raw: unknown): UserPreferences {
  return { ...PREFERENCE_DEFAULTS, ...sanitizePreferences(raw) };
}

export function mergePreferences(
  base: UserPreferences,
  patch: Partial<UserPreferences>,
): UserPreferences {
  return { ...base, ...patch };
}
