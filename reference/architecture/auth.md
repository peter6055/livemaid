# Authentication & Workspaces

This document describes LiveMaid's authentication modes, the workspace data model, and how to run and test the auth features.

## Runtime modes

Auth state is determined by environment variables: `WORKSPACES_ENABLED`, `MONGODB_URI`, and `AUTH_OIDC_*`. `AUTH_SECRET` and `AUDIT_IP_PEPPER` are generated automatically and persisted under `data/.livemaid/`.

Local development uses a single `.env` file (copy from `.env.example`). Do not use `.env.local`.

### No auth / local mode (workspace mode disabled)

Active when `WORKSPACES_ENABLED` is unset/false, `MONGODB_URI` is missing, or any OIDC credential is missing.

Behavior:

- No login required.
- All diagrams/folders in `data/` are globally visible and editable.
- Per-user preferences are stored in MongoDB under the fixed `local` owner; `MONGODB_URI` is required for them (see [`preferences.md`](./preferences.md)).
- New diagrams and folders are created without a `workspaceId`.
- New comments are stored with `authorId: "anonymous"`.
- URLs are flat: `/`, `/editor/{id}`, `/editor/{id}/duplicate`.
- Writes are allowed unless `DEMO_MODE=true`.

### Auth / workspaces mode (workspace mode enabled)

Active when `WORKSPACES_ENABLED` is truthy (`true` / `1` / `yes`) and `MONGODB_URI` plus all three `AUTH_OIDC_*` values are set. Restart the process after changing these.

Behavior:

- Login is mandatory. Unauthenticated requests are redirected to `/login`.
- Auth.js v5 with a generic OIDC provider and JWT sessions.
- Users, workspaces, memberships, and audit logs live in MongoDB.
- Diagrams stay on disk but are scoped by `workspaceId`.
- Comments are attributed to the signed-in user via the session.
- URLs are workspace-scoped: `/workspace/{id}`, `/workspace/{id}/editor/{id}`, etc.
- Roles: **admin** (invite/remove/change roles, settings) vs. **member** (create/edit/delete diagrams).

Disabling workspace mode is an env change (`WORKSPACES_ENABLED=false` or clearing OIDC/Mongo). There is no Settings UI to flip the mode.

## Configuration flow

1. Copy `.env.example` to `.env` (or set the same vars in Compose / the host platform).
2. Set `MONGODB_URI`, `WORKSPACES_ENABLED=true`, and the three `AUTH_OIDC_*` variables.
3. Restart LiveMaid so Auth.js picks up the OIDC provider config.
4. Sign in via `/login`. Only the first account (when no workspace exists yet) gets a default workspace and an admin membership. Every later account must be invited first; an uninvited sign-in is denied with `AccessDenied` on the login page.

## Environment variables

```bash
# Dev settings
ALLOWED_DEV_ORIGINS=
DEMO_MODE=

# System settings
BASE_URL="https://your-domain.com/livemaid"
MONGODB_URI="mongodb://localhost:27017/livemaid"

# Workspace settings
WORKSPACES_ENABLED=true
AUTH_OIDC_ISSUER="https://idp.example.com"
AUTH_OIDC_CLIENT_ID="your-client-id"
AUTH_OIDC_CLIENT_SECRET="your-client-secret"
```

`AUTH_SECRET` and `AUDIT_IP_PEPPER` are generated automatically and persisted under `data/.livemaid/`. OIDC credentials live in the environment — not in MongoDB. Auth.js's `AUTH_URL` is derived as `${BASE_URL}/api/auth`.

## Reverse proxy / sub-path deployment

Next.js `basePath` is derived from the pathname of `BASE_URL` at build time. The reverse proxy must forward the prefix intact: a request to `https://example.com/livemaid/login` must reach the app as `/livemaid/login`. Changing that path requires a rebuild.

Auth.js also uses its own `basePath`, derived from the pathname of `AUTH_URL` (for example `/livemaid/api/auth`). The auth route rewrites requests onto that path when needed so OIDC `redirect_uri` values keep the proxy prefix.

When LiveMaid is served behind a reverse proxy, Auth.js cannot infer the correct public URL from request headers alone. Without `BASE_URL` it may use the internal bind address, producing callback URLs that point at the wrong host.

Set `BASE_URL` to the full public URL including the prefix:

```bash
BASE_URL="https://example.com/livemaid"
```

LiveMaid derives `AUTH_URL` as `${BASE_URL}/api/auth`, so the callback URL to configure in your OIDC provider is:

```
https://example.com/livemaid/api/auth/callback/oidc
```

`trustHost: true` is already set in the Auth.js config, so forwarded headers are trusted when `BASE_URL` is not provided. `BASE_URL` is the safer option for reverse-proxy setups.

## Session revocation

When auth/workspace mode is enabled, every protected request revalidates the session against MongoDB in `src/proxy.ts`. The user must still be active (`users.active !== false`) and still have an active membership in the workspace encoded in the JWT.

A removed or deactivated user is logged out on their next request: the session cookie is expired and pages redirect to `/login`, while API requests receive `401 Unauthorized`. If MongoDB cannot be reached, the request fails closed with a 503 instead of trusting the stale JWT.

## Data model

MongoDB collections:

- `users` — `{ email, name, image, createdAt, updatedAt }`
- `workspaces` — `{ name, createdBy, createdAt, updatedAt }`
- `memberships` — `{ userId, workspaceId, role, invitedEmail, status, createdAt, updatedAt }`
- `auditLogs` — `{ actorId, workspaceId, action, targetId, metadata, ipHash, createdAt }`

## Standalone ↔ workspace transitions

Changing modes never rewrites diagram or folder ownership.

Every diagram and folder carries the user id that created it (`createdBy`, stamped by the create endpoints). Visibility is per **creator**, not per workspace: sharing a workspace does not share diagrams.

- **Standalone mode:** the single local user can list, read, and write every diagram and folder, regardless of `createdBy`.
- **Every role, workspace mode:** the records they created themselves (`createdBy === session.user.id`). Another member's diagrams stay private even inside the same workspace.
- **Admin, additionally:** records with no creator — data created before accounts existed or while the app ran in standalone mode.
- **Writes:** updates preserve the stored `createdBy` (and `workspaceId`, pinned server-side); edits and mode changes never transfer ownership.
- **Login:** creates or resolves the user/workspace membership only. It does not scan or mutate diagram/folder files.

Comment endpoints use the same ownership rule today. **Planned:** once diagram sharing exists, commenting widens to member = own **or shared with them**, admin = own **or shared with them** **or** creator-less; viewing/editing/deleting stays own/creator-less unless changed deliberately. The seam is the comment block in `src/app/api/diagrams/[id]/comments/route.ts`.

The rule lives in `src/lib/auth/routeAuth.ts` (`getVisibilityScope`, `canAccessResource`, `filterVisibleResources`, `assertDiagramAccess`, `assertFolderAccess`). It is a pure in-memory predicate — listing and reading never query MongoDB for ownership, so `/api/diagrams` and `/api/folders` cost the same whether there are ten records or ten thousand.

Promoting a member to admin widens what they see to include standalone-era data; no migration step rewrites records.

## Demo mode

`DEMO_MODE=true` is orthogonal to auth:

| Mode            | Auth required | Data source                         | Writes          |
| --------------- | ------------- | ----------------------------------- | --------------- |
| Legacy + demo   | No            | `demo/`                             | No-op           |
| Legacy + normal | No            | `data/`                             | Allowed         |
| OIDC + demo     | Yes           | `demo/`                             | No-op           |
| OIDC + normal   | Yes           | MongoDB workspaces + scoped `data/` | Allowed by role |

## Testing

### Unit / integration

```bash
npm run test -- src/test/auth/
```

### Manual end-to-end

1. Copy `.env.example` to `.env`, start MongoDB, and set `WORKSPACES_ENABLED`, `MONGODB_URI`, and `AUTH_OIDC_*`.
2. Run `npm run dev` (restart after any env change).
3. Open `http://localhost:3434/login` and sign in.
4. Visit `/workspace/{id}/settings/members` to invite another user.
5. Have the invited user sign in with the matching email.

## Key files

- `src/lib/auth/config.ts` — Auth.js configuration, JWT/session callbacks.
- `src/lib/auth/appConfig.ts` — env-only workspace/OIDC enablement checks.
- `src/lib/auth/secrets.ts` — auto-generated auth secret and audit pepper.
- `src/instrumentation.ts` — derives `AUTH_URL` from `BASE_URL` at startup.
- `src/lib/auth/workspace.ts` — user/workspace creation, legacy adoption.
- `src/lib/auth/permissions.ts` — role and membership checks.
- `src/lib/auth/invites.ts` — invite/accept/remove/role-change flow.
- `src/lib/auth/audit.ts` — audit log writing and IP hashing.
- `src/lib/db/client.ts` — cached MongoDB client.
- `src/lib/db/collections.ts` — typed collection accessors.
- `src/proxy.ts` — route protection and workspace membership enforcement.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler.
- `src/app/api/workspace/[id]/members/route.ts` — member list + invite.
- `src/app/api/workspace/[id]/members/[memberId]/route.ts` — role change + removal.

## Current limitations

- Single-workspace MVP: the JWT carries one `workspaceId` and one `role`. True multi-workspace switching is a future change.
- Invite-only: a second account can never bootstrap its own workspace. Upgrading from a build that auto-provisioned one workspace per account leaves those workspaces and admin memberships in place; delete them to apply invite-only to the existing accounts.
- First admin owns all legacy data. Ensure the first OIDC login is the intended owner.
- `removeMember` hard-deletes the membership doc because `DbMembership.status` is typed as `"active" | "pending"`. Audit logs retain the history.
