---
sidebar_position: 2
---

# Permissions and visibility

In workspace mode every request passes three gates: **signed in**, **member of the workspace you are addressing**, and **owner of the record**. Standalone and demo mode skip them (see [Modes](./modes)).

## Roles

Roles live in the `memberships` collection, one row per user per workspace:

| Role       | Granted by                                                           | Can do                                                                            |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **admin**  | being the first member of a workspace, or being promoted by an admin | everything a member can, plus invite, change roles, deactivate and remove members |
| **member** | invitation                                                           | use the workspace; see and edit only the records they created                     |

- Roles are **per workspace**. There is no global admin.
- The API re-reads the role from MongoDB on every request, so a promotion or demotion applies to API responses immediately.
- Pages under `/workspace/<id>/settings` are gated by the role stored in the session token — a promoted user must sign out and back in before the settings UI opens.
- An admin cannot demote or remove the last remaining admin ("Protected").

## The visibility rule

```ts
if (resource.createdBy === scope.userId) return true; // your own record — both roles
return scope.role === "admin" && !resource.createdBy; // admin: records created in standalone mode
```

| Viewer                    | Standalone mode          | Workspace mode                                                                                         |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Member**                | every diagram and folder | only records with `createdBy` = their user id                                                          |
| **Admin**                 | every diagram and folder | their own records **plus** records with no `createdBy` (created before accounts or in standalone mode) |
| **Another member's work** | —                        | hidden from everyone, **including admins**                                                             |

Two consequences worth internalising:

- Sharing a workspace does **not** share diagrams. Membership only unlocks the workspace itself (members list, settings); the data is per creator.
- An admin sees legacy, creator-less data but not other people's diagrams. There is currently no moderation view and no "assign owner" action.

## Modes and the API

| Mode           | Session  | What the API returns     | Writes                         |
| -------------- | -------- | ------------------------ | ------------------------------ |
| **Standalone** | none     | every diagram and folder | allowed, persisted             |
| **Workspace**  | required | the ownership rule above | allowed for accessible records |
| **Demo**       | none     | everything in `./demo`   | `403`, never persisted         |

Standalone mode never filters and stamps neither `createdBy` nor `workspaceId`, which is why those records become admin-only if the deployment later switches to workspace mode. See [Modes](./modes).

## Status codes

| Situation                                              | Response                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| No session                                             | `401 Unauthorized`                                                            |
| Signed in, but not a member of the addressed workspace | `403 Workspace membership required`                                           |
| Admin-only endpoint, member caller                     | `403 Admin access required`                                                   |
| Record does not exist **or** is not yours              | `404 Diagram not found` / `404 Folder not found` (existence is not disclosed) |
| Write in demo mode                                     | `403` with a demo-mode message                                                |

## Endpoints

"Own" means `createdBy` equals the caller's user id. "Creator-less" means the record has no `createdBy` (created in standalone mode or before accounts existed). "Shared" is not implemented yet.

The admin rule is **own + creator-less + shared**: an admin is not a superuser, so they never see another member's records. A create is the exception to reading the rule as a precondition — a created record always belongs to whoever created it, so `creator-less` and `shared` are not creation modes.

| Endpoint                                                   | Member                                         | Admin                                                           |
| ---------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/diagrams`                                        | own records                                    | own + creator-less records                                      |
| `POST /api/diagrams`                                       | `createdBy` = caller, own workspace            | same — creates an **own** record; no creator-less/shared option |
| `GET /api/diagrams/:id`                                    | own → `200`, otherwise `404`                   | own or creator-less → `200`, otherwise `404`                    |
| `PUT /api/diagrams/:id`                                    | own → `200`, otherwise `404`                   | own or creator-less → `200`, otherwise `404`                    |
| `DELETE /api/diagrams/:id`                                 | own → `204`, otherwise `404`                   | own or creator-less → `204`, otherwise `404`                    |
| `GET/POST/PATCH /api/diagrams/:id/comments`                | own diagram, otherwise `404` (shared: planned) | own or creator-less diagram, otherwise `404`                    |
| `GET /api/folders`                                         | own records                                    | own + creator-less records                                      |
| `POST /api/folders`                                        | `createdBy` = caller, own workspace            | same — creates an **own** record; no creator-less/shared option |
| `GET/PATCH/DELETE /api/folders/:id`                        | own → allowed, otherwise `404`                 | own or creator-less → allowed, otherwise `404`                  |
| `GET /api/workspace/:id/members`                           | member of that workspace → `200`               | member of that workspace → `200`                                |
| `POST/PATCH/DELETE /api/workspace/:id/members[/:memberId]` | `403`                                          | allowed                                                         |

### Planned: diagram sharing

Sharing is not implemented yet. When it ships, the comments endpoints will widen to:

| Caller     | Allowed                                                          |
| ---------- | ---------------------------------------------------------------- |
| **Member** | own **or** a diagram shared with them                            |
| **Admin**  | own **or** shared with them **or** creator-less (standalone-era) |

Viewing, editing, and deleting a diagram keep the stricter own/creator-less rule unless that changes at the same time — sharing grants commenting, not full control.

**Addressing.** List endpoints accept `?workspaceId=` and fall back to the session's workspace; item endpoints always use the session's workspace, so a query string cannot probe another workspace. A caller with no workspace receives an empty list (`{"items":[],"total":0}` for diagrams, `[]` for folders) or `404` on an item.

## Ownership fields

| Field         | Set by                                                       | Mutable?                                                 |
| ------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| `createdBy`   | `POST /api/diagrams`, `POST /api/folders` (from the session) | no — pinned on update; `PUT` payloads cannot reassign it |
| `workspaceId` | same create calls                                            | no — pinned on update                                    |
| `deletedAt`   | delete endpoints (soft delete)                               | reads exclude soft-deleted records                       |

Because ownership is immutable and visibility is derived at request time, promoting a user widens what they see without touching a single file.

## Pages

- `/`, `/workspace/:id`, `/workspace/:id/editor/:diagramId` — require a session; the page shell renders and the data comes from the API, so a diagram you cannot access shows as not found rather than leaking its name.
- `/workspace/:id/settings` and `/workspace/:id/settings/members` — admins only; members are redirected to `/restricted`.
- Deactivating a user or removing their workspace membership revokes an existing session on the next request.

## Related

- [Modes](./modes)
- [Environment variables](../deployment/environment-variables)
