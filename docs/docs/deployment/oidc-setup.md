# OIDC / OAuth Setup

LiveMaid can run without authentication for personal or trusted local use, or you can enable OIDC-based sign-in to add workspaces, members, and audit logs.

## Two modes

| Mode                 | Auth required | Best for                                                                        |
| -------------------- | ------------- | ------------------------------------------------------------------------------- |
| **Legacy** (default) | No            | Local development, single-user Docker, or trusted networks                      |
| **OIDC**             | Yes           | Teams, shared servers, or any deployment where you need per-user access control |

Legacy mode is active when **any** of the OIDC environment variables are missing. OIDC mode activates only when **all four** are set.

## What you need

Before enabling OIDC, have these ready:

- An OIDC-compatible identity provider (Google Workspace, Okta, Auth0, Keycloak, Authentik, etc.).
- A MongoDB database for users, workspaces, memberships, and audit logs.
- The callback URL your provider will use: `https://your-domain.com/api/auth/callback/oidc`.

## Environment variables

Add these to your `.env` file or Docker Compose environment:

```bash
# Required for OIDC mode
AUTH_SECRET="openssl rand -base64 32"
AUTH_OIDC_ISSUER="https://accounts.google.com"
AUTH_OIDC_CLIENT_ID="your-client-id"
AUTH_OIDC_CLIENT_SECRET="your-client-secret"

# Required for workspaces/users/audit logs
MONGODB_URI="mongodb://localhost:27017/livemaid"

# Optional but recommended
AUDIT_IP_PEPPER="another-random-string-for-ip-hashing"
```

- `AUTH_SECRET` — a random 32-byte string used to sign session tokens.
- `AUTH_OIDC_ISSUER` — the issuer URL from your provider's OIDC discovery document.
- `AUTH_OIDC_CLIENT_ID` and `AUTH_OIDC_CLIENT_SECRET` — from your OIDC app registration.
- `MONGODB_URI` — connection string to a MongoDB deployment.
- `AUDIT_IP_PEPPER` — a secret pepper used when hashing IP addresses in audit logs.

## Provider-specific notes

### Google

- Issuer: `https://accounts.google.com`
- Create credentials in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.
- Authorized redirect URI: `https://your-domain.com/api/auth/callback/oidc`.

### Generic OIDC (Okta, Auth0, Keycloak, Authentik, etc.)

- Use the provider's OIDC discovery issuer URL, e.g. `https://your-org.okta.com`.
- Register the same callback URI.

## First login and legacy adoption

When OIDC mode starts for the first time:

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

Roles are currently **admin** (can invite, remove, and change roles) or **member** (can create and edit diagrams).

## Docker Compose example

```yaml
services:
  livemaid:
    image: ghcr.io/peter6055/livemaid:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - AUTH_SECRET=${AUTH_SECRET}
      - AUTH_OIDC_ISSUER=${AUTH_OIDC_ISSUER}
      - AUTH_OIDC_CLIENT_ID=${AUTH_OIDC_CLIENT_ID}
      - AUTH_OIDC_CLIENT_SECRET=${AUTH_OIDC_CLIENT_SECRET}
      - MONGODB_URI=${MONGODB_URI}
      - AUDIT_IP_PEPPER=${AUDIT_IP_PEPPER}
    restart: unless-stopped
```

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

`DEMO_MODE=true` disables writes regardless of auth mode. You can run OIDC + demo, but since demo mode is read-only, members and workspaces will not be created.

## See also

- [Docker deployment](./docker)
- [Demo mode](./demo-mode)
- [Architecture reference: Authentication & Workspaces](https://github.com/peter6055/livemaid/blob/main/reference/architecture/auth.md)
