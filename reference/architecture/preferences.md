# User Preferences

Per-user settings (dashboard layout, theme, telemetry consent) are stored in MongoDB and follow the
account across devices and browsers. This is the **only** persistence path that requires MongoDB in
every runtime mode — diagrams remain file-system backed (see [`storage.md`](./storage.md)).

## Data model

One document per owner in the `userPreferences` collection. `_id` is the owner id, so a read is a
point lookup and no secondary index is needed.

```json
{
  "_id": "user-42",
  "viewMode": "grid",
  "sortBy": "edited",
  "currentFolderId": "folder-7",
  "theme": "system",
  "usageAnalytics": true,
  "debugReporting": false,
  "updatedAt": "2026-11-23T05:00:00.000Z"
}
```

| Mode       | Owner (`_id`)                                        |
| ---------- | ---------------------------------------------------- |
| Standalone | `local` — a standalone install has one implicit user |
| Workspace  | The signed-in user's id (`session.user.id`)          |
| Demo       | None — preferences are read-only defaults            |

Preferences are **user-scoped, not workspace-scoped**. `currentFolderId` points at workspace
content, so it is validated against the loaded folder tree on hydrate and falls back to root.

## Layers

| File                               | Responsibility                                                             |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/preferences/core.ts`      | Shape, defaults, validation. Pure — shared by server and client.           |
| `src/lib/preferences/store.ts`     | Mongo reads/writes, owner resolution.                                      |
| `src/app/api/preferences/route.ts` | `GET` / `PATCH`, session-derived owner, demo read-only, 503 without Mongo. |
| `src/lib/preferences/provider.tsx` | Client source of truth: cache, outbox, theme restore, `usePreferences()`.  |

## Validation rules (trust boundary)

- Unknown keys and invalid values are **dropped, never coerced**. `usageAnalytics: "yes"` is not
  `true`; a payload bug must never opt a user into telemetry.
- The owner is always derived from the session on the server — never accepted from the client.
- Demo mode returns defaults on `GET` and rejects `PATCH` with 403.
- Without `MONGODB_URI` the route returns 503; the client then keeps working from its local cache.

## Client synchronization

1. localStorage (`livemaid:preferences`) is read first so the UI paints saved values immediately and
   keeps working offline or without a database.
2. `GET /api/preferences` then overrides the cache, except for writes still queued in the outbox.
3. A change writes the cache, queues itself in `livemaid:preferences:pending`, and debounces a
   `PATCH` (500 ms). A failed request stays queued and is replayed on the next load — a consent
   toggle is never silently lost.
4. `stored: false` means the account has no document yet: the browser's cached values become the
   account's values (one-time migration from the pre-localStorage era).
5. Theme is applied through `next-themes`; the stored value is restored once after hydration, so a
   new device may flash one frame (accepted trade-off — no server-side theme read).

Telemetry consent lives in this document too; `TelemetryProvider` reads it from `usePreferences()`
and re-applies the flags when the stored value arrives.

## Adding a preference

1. Add the field to `UserPreferences`, `PREFERENCE_DEFAULTS`, and `VALIDATORS` in `core.ts`.
2. Consume/update it through `usePreferences()` — never read or write a new localStorage key.
3. Add the control to the relevant UI (dashboard or `SettingsDialog`).
4. Extend `src/test/preferences-core.test.ts` with one valid and one invalid value.
