---
sidebar_position: 4
---

# Authentication & Workspaces

LiveMaid can run without authentication for personal or trusted local use, or you can enable OIDC-based sign-in to add workspaces, members, and audit logs.

## Runtime modes

| Mode                  | Auth required | Best for                                                                        |
| --------------------- | ------------- | ------------------------------------------------------------------------------- |
| **No auth / local**   | No            | Local development, single-user Docker, or trusted networks                      |
| **Auth / workspaces** | Yes           | Teams, shared servers, or any deployment where you need per-user access control |

The app is in **no auth / local** mode when any of the required auth environment variables is missing. **Auth / workspaces** mode is active only when `MONGODB_URI` and all three OIDC variables are set.

`AUTH_SECRET` and `AUDIT_IP_PEPPER` are generated and persisted automatically if you do not set them — see the [environment variables reference](./environment-variables).

## What you need

Before enabling auth:

- An OIDC-compatible identity provider (Google Workspace, Okta, Auth0, Keycloak, Authentik, etc.).
- A MongoDB database for users, workspaces, memberships, and audit logs.
- The callback URL your provider will use: `https://your-domain.com/api/auth/callback/oidc`.

## Enabling auth

Set these environment variables:

```bash
MONGODB_URI=mongodb://mongodb.example.com/livemaid
AUTH_OIDC_ISSUER=https://idp.example.com
AUTH_OIDC_CLIENT_ID=your-client-id
AUTH_OIDC_CLIENT_SECRET=your-client-secret
```

Auth mode turns on automatically once the container restarts with all variables present. There is no UI toggle.

## Provider-specific notes

### Google

- Issuer: `https://accounts.google.com`
- Create credentials in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.
- Authorized redirect URI: `https://your-domain.com/api/auth/callback/oidc`.

### Generic OIDC (Okta, Auth0, Keycloak, Authentik, etc.)

- Use the provider's OIDC discovery issuer URL, e.g. `https://your-org.okta.com`.
- Register the same callback URI.

## First login and legacy adoption

When auth mode starts for the first time:

1. The first person to sign in becomes the default workspace's **admin**.
2. Existing diagrams in `data/` are automatically adopted into that workspace.
3. A marker is written so adoption never runs again.

:::caution
Make sure the first OIDC login is the intended owner, because that account will own all legacy diagrams.
:::

## Inviting members

After the first admin is created:

1. Go to `/workspace/{id}/settings/members`.
2. Enter the email address of the person you want to invite.
3. When they sign in with a matching email, their invite is activated automatically.

Roles are **admin** (can invite, remove, and change roles) or **member** (can create and edit diagrams).

## Docker Compose example

```yaml
services:
  livemaid:
    image: ghcr.io/peter6055/livemaid:latest
    container_name: livemaid
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - MONGODB_URI=${MONGODB_URI:-}
      - AUTH_OIDC_ISSUER=${AUTH_OIDC_ISSUER:-}
      - AUTH_OIDC_CLIENT_ID=${AUTH_OIDC_CLIENT_ID:-}
      - AUTH_OIDC_CLIENT_SECRET=${AUTH_OIDC_CLIENT_SECRET:-}
    restart: unless-stopped
```

See the full [environment variables reference](./environment-variables) for optional overrides such as `AUTH_SECRET`, `AUDIT_IP_PEPPER`, and `NEXT_PUBLIC_BASE_PATH`.

## Testing auth locally

### Unit / integration tests

```bash
npm run test -- src/test/auth/
```

### E2E tests (no real OIDC or MongoDB required)

```bash
AUTH_SECRET=test-secret \
AUTH_OIDC_ISSUER=https://idp.example.com \
AUTH_OIDC_CLIENT_ID=test \
AUTH_OIDC_CLIENT_SECRET=test \
npm run test:e2e -- src/test/e2e/auth-routes.spec.ts src/test/e2e/auth-workspace.spec.ts
```

## Relationship with demo mode

`DEMO_MODE=true` disables writes regardless of auth mode. You can run auth + demo, but since demo mode is read-only, members and workspaces will not be created. See [Demo mode](./demo-mode).
