// Offline edit cache for diagram code edits made while the browser is offline.
// Pending edits live in localStorage so they survive page reloads and tab closes.

export interface OfflineEdit {
  diagramId: string;
  baseCode: string; // code at the last known server state (last successful load/save)
  pendingCode: string; // current edited code, not yet synced
  updatedAt: number;
}

const OFFLINE_EDIT_KEY = (id: string) => `livemaid:offline-edit:${id}`;

// Returns true when the edit was persisted to localStorage. When storage is unavailable,
// disabled, or full, it returns false so the caller can retain an in-memory copy that still
// gets replayed on reconnect (it just won't survive a reload).
export function saveOfflineEdit(edit: OfflineEdit): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(OFFLINE_EDIT_KEY(edit.diagramId), JSON.stringify(edit));
    return true;
  } catch {
    return false;
  }
}

export function getOfflineEdit(diagramId: string): OfflineEdit | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OFFLINE_EDIT_KEY(diagramId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineEdit;
    if (
      typeof parsed.diagramId !== "string" ||
      typeof parsed.baseCode !== "string" ||
      typeof parsed.pendingCode !== "string" ||
      typeof parsed.updatedAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearOfflineEdit(diagramId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(OFFLINE_EDIT_KEY(diagramId));
  } catch {
    // ignore
  }
}
