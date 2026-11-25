---
sidebar_position: 1
---

# Modes: standalone, workspace, and demo

LiveMaid runs in one of three modes. The mode decides whether users sign in, where diagrams are stored, who can see them, and whether writes are persisted. Switching modes never rewrites diagram or folder ownership.

## At a glance

|                            | Standalone (local)            | Workspace                                                                                        | Demo                                 |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ |
| **Sign-in**                | none                          | OIDC via Auth.js                                                                                 | none                                 |
| **Who uses it**            | one local user                | invited members of a workspace                                                                   | anonymous visitors                   |
| **Diagram storage**        | `./data`                      | `./data`, plus MongoDB for users/workspaces/audit                                                | `./demo`                             |
| **Writes**                 | allowed, persisted            | allowed for records you can access, persisted                                                    | rejected with `403`, never persisted |
| **What you can see**       | every diagram and folder      | only your own records, plus standalone-era records for admins (see [Permissions](./permissions)) | everything in `./demo`               |
| **Sessions**               | none                          | JWT cookie, membership re-checked per request                                                    | none                                 |
| **Settings / members UI**  | not available                 | admins only                                                                                      | not available                        |
| **Typical use**            | laptop, single-user self-host | self-hosted team instance                                                                        | public read-only showcase            |
| **Required configuration** | —                             | `WORKSPACES_ENABLED`, `MONGODB_URI`, `AUTH_OIDC_*`                                               | `DEMO_MODE=true`                     |

## How the mode is chosen

- **Demo** wins: `DEMO_MODE=true` short-circuits authentication entirely.
- **Workspace** needs all of `WORKSPACES_ENABLED` (truthy), a MongoDB connection, and the three `AUTH_OIDC_*` values.
- **Standalone** is the fallback, and the default for `npm run dev` and a plain container.

The mode is read at runtime — the dashboard and editor opt out of prerendering — so changing environment variables needs a restart, not a rebuild. The OIDC issuer, client id, and client secret are read at startup only.

:::note

Only one workspace can exist in the current release: an account with no membership cannot create one, and must be invited. See [Permissions](./permissions#roles).

:::

## What each mode does to records

| Created in | `workspaceId`           | `createdBy`        |
| ---------- | ----------------------- | ------------------ |
| Standalone | unset                   | unset              |
| Workspace  | the creator's workspace | the signed-in user |

- Neither field is rewritten by an update, and switching modes never reassigns anything. There is no import step and no ownership transfer.
- Records created in standalone mode have no creator, so after switching to workspace mode they are visible to **admins only** — members never see them through inheritance.
- Demo mode never writes, so it has no ownership to speak of.

## Moving a deployment between modes

1. Stop the app.
2. Change the environment (`WORKSPACES_ENABLED` / `DEMO_MODE` / OIDC + Mongo values).
3. Start the app again.

Nothing needs to be migrated. If you want existing standalone diagrams to be visible to a specific member later, that requires assigning a creator to those records — LiveMaid has no such endpoint today, so they stay admin-only.

## Related

- [Permissions and visibility](./permissions)
- [Environment variables](../deployment/environment-variables)
- [Demo mode](../deployment/demo-mode)
