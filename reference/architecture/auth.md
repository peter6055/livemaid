# Authentication & Workspaces

This document describes LiveMaid's authentication modes, the workspace data model, and how to run and test the auth features.

## Two runtime modes

The app runs in one of two mutually exclusive modes depending on whether OIDC environment variables are present.

### Legacy mode (auth disabled)

Triggered when **any** of these is missing:

- `AUTH_SECRET`
- `AUTH_OIDC_ISSUER`
- `AUTH_OIDC_CLIENT_ID`
- `AUTH_OIDC_CLIENT_SECRET`

Behavior:

- No login required.
- No MongoDB required.
- All diagrams/folders in `data/` are globally visible.
- New comments are stored with `authorId: "anonymous"`.
- URLs are flat: `/`, `/editor/{id}`, `/editor/{id}/duplicate`.
- Writes are allowed unless `DEMO_MODE=true`.

This preserves local development, self-hosting, and existing deployments that do not have an OIDC provider.

### OIDC mode (auth enabled)

Triggered when **all four** `AUTH_*` variables are set (plus `MONGODB_URI` for workspaces).

Behavior:

- Login is mandatory. Unauthenticated requests are redirected to `/login`.
- Auth.js v5 with a generic OIDC provider and JWT sessions.
- Users, workspaces, memberships, and audit logs live in MongoDB.
- Diagrams stay on disk but are scoped by `workspaceId`.
- Comments are attributed to the signed-in user via the session.
- URLs are workspace-scoped: `/workspace/{id}`, `/workspace/{id}/editor/{id}`, etc.
- Roles: **admin** (invite/remove/change roles, settings) vs. **member** (create/edit/delete diagrams).

## Environment variables

```bash
# Required for OIDC mode
AUTH_SECRET="openssl rand -base64 32"
AUTH_OIDC_ISSUER="https://your-oidc-issuer.com"
AUTH_OIDC_CLIENT_ID="your-client-id"
AUTH_OIDC_CLIENT_SECRET="your-client-secret"

# Required for workspaces/users/audit logs
MONGODB_URI="mongodb://localhost:27017/livemaid"

# Optional but recommended
AUDIT_IP_PEPPER="random-string-for-ip-hashing"
```

## Data model

MongoDB collections:

- `users` — `{ email, name, image, createdAt, updatedAt }`
- `workspaces` — `{ name, createdBy, createdAt, updatedAt }`
- `memberships` — `{ userId, workspaceId, role, invitedEmail, status, createdAt, updatedAt }`
- `auditLogs` — `{ actorId, workspaceId, action, targetId, metadata, ipHash, createdAt }`
- `migrationMarkers` — tracks one-off legacy adoption

## Legacy-to-OIDC transition

There is no manual migration command. Transition happens automatically on the first OIDC login.

1. Deploy with OIDC vars and `MONGODB_URI` set.
2. The first person logs in via `/login`.
3. The app creates a `users` record, a default workspace, and an `admin` membership.
4. Legacy adoption runs once:
   - Scans `data/*.json` and `data/folders/*.json`.
   - Stamps any record without `workspaceId` with the first admin's workspace id.
   - Writes a marker so adoption never runs again.
5. Subsequent logins:
   - Invited users (pending membership by email) activate their invite.
   - Non-invited users get their own default workspace.

## Demo mode

`DEMO_MODE=true` is orthogonal to auth:

| Mode            | Auth required | Data source                         | Writes          |
| --------------- | ------------- | ----------------------------------- | --------------- |
| Legacy + demo   | No            | `demo/`                             | No-op           |
| Legacy + normal | No            | `data/`                             | Allowed         |
| OIDC + demo     | No            | `demo/`                             | No-op           |
| OIDC + normal   | Yes           | MongoDB workspaces + scoped `data/` | Allowed by role |

## Testing

### Unit / integration

```bash
npm run test -- src/test/auth/
```

### E2E (no real OIDC or MongoDB required)

```bash
AUTH_SECRET=test-secret \
AUTH_OIDC_ISSUER=https://idp.example.com \
AUTH_OIDC_CLIENT_ID=test \
AUTH_OIDC_CLIENT_SECRET=test \
npm run test:e2e -- src/test/e2e/auth-routes.spec.ts src/test/e2e/auth-workspace.spec.ts
```

### Manual end-to-end

1. Start MongoDB locally.
2. Configure OIDC provider with callback `http://localhost:3434/api/auth/callback/oidc`.
3. Run `npm run dev`.
4. Open `http://localhost:3434`, sign in.
5. Visit `/workspace/{id}/settings/members` to invite another user.
6. Have the invited user sign in with the matching email.

## Key files

- `src/lib/auth/config.ts` — Auth.js configuration, JWT/session callbacks.
- `src/lib/auth/workspace.ts` — user/workspace creation, legacy adoption.
- `src/lib/auth/permissions.ts` — role and membership checks.
- `src/lib/auth/invites.ts` — invite/accept/remove/role-change flow.
- `src/lib/auth/audit.ts` — audit log writing and IP hashing.
- `src/lib/db/client.ts` — cached MongoDB client.
- `src/lib/db/collections.ts` — typed collection accessors.
- `src/middleware.ts` — route protection and workspace membership enforcement.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler.
- `src/app/api/workspace/[id]/members/route.ts` — member list + invite.
- `src/app/api/workspace/[id]/members/[memberId]/route.ts` — role change + removal.

## Current limitations

- Single-workspace MVP: the JWT carries one `workspaceId` and one `role`. True multi-workspace switching is a future change.
- First admin owns all legacy data. Ensure the first OIDC login is the intended owner.
- `removeMember` hard-deletes the membership doc because `DbMembership.status` is typed as `"active" | "pending"`. Audit logs retain the history.
