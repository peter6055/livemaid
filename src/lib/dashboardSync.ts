/**
 * Lightweight cross-tab synchronization for the Dashboard file list.
 *
 * Other tabs (e.g., an editor tab that creates a new diagram) can broadcast a
 * refresh notification. The Dashboard listens and re-fetches diagrams/folders so
 * newly created or edited files appear without requiring a manual reload.
 *
 * Uses BroadcastChannel when available, falling back to a transient localStorage
 * key for older browsers or environments where BroadcastChannel is disabled.
 */

const CHANNEL_NAME = "livemaid-dashboard-sync";
const STORAGE_KEY = "livemaid:refresh-dashboard";
const MESSAGE_TYPE = "refresh-diagrams";

export function broadcastDashboardRefresh() {
  if (typeof window === "undefined") return;

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: MESSAGE_TYPE });
      channel.close();
    }
  } catch {
    // BroadcastChannel may be unavailable in some private modes; fall through.
  }

  try {
    // localStorage events are broadcast to all tabs except the one that wrote it.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ type: MESSAGE_TYPE, timestamp: Date.now() }),
    );
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors (e.g., private mode with storage disabled).
  }
}

export function onDashboardRefresh(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const cleanupFns: Array<() => void> = [];

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === MESSAGE_TYPE) {
          callback();
        }
      };
      cleanupFns.push(() => channel.close());
    }
  } catch {
    // Ignore BroadcastChannel setup failures.
  }

  const storageHandler = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const data = JSON.parse(event.newValue);
      if (data.type === MESSAGE_TYPE) {
        callback();
      }
    } catch {
      // Ignore malformed storage payloads.
    }
  };

  window.addEventListener("storage", storageHandler);
  cleanupFns.push(() => window.removeEventListener("storage", storageHandler));

  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
  };
}
