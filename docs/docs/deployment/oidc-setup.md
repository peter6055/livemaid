# OIDC / OAuth Setup

LiveMaid can run without authentication for personal or trusted local use, or you can enable OIDC-based sign-in to add workspaces, members, and audit logs. Auth is controlled by a runtime database flag and OIDC credentials.

## Runtime modes

| Mode                  | Auth required | Best for                                                                        |
| --------------------- | ------------- | ------------------------------------------------------------------------------- |
| **Public portal**     | No            | Local development, single-user Docker, or trusted networks                      |
| **Auth / workspaces** | Yes           | Teams, shared servers, or any deployment where you need per-user access control |

The app is in **public portal** mode when the `authEnabled` DB flag is `false` or when OIDC credentials are missing. **Auth / workspaces** mode is active only when the DB flag is `true` **and** all four OIDC environment variables are present.

## What you need

Before enabling auth, have these ready:

- An OIDC-compatible identity provider (Google Workspace, Okta, Auth0, Keycloak, Authentik, etc.).
- A MongoDB database for users, workspaces, memberships, audit logs, and the `appConfig` collection.
- The callback URL your provider will use: `https://your-domain.com/api/auth/callback/oidc`.

## Enabling auth via the UI

1. Start LiveMaid with `MONGODB_URI` set.
2. Open **`/admin/settings`**.
3. Toggle **Enable auth / workspaces** on and save.
4. If OIDC credentials are not configured, you will be redirected to **`/admin/setup`**.
5. In `/admin/setup`, select your provider template and enter the OIDC issuer, client ID, and client secret.
6. Submit the form. LiveMaid validates the provider's discovery document, generates an `AUTH_SECRET` if needed, writes the variables to `.env` when the filesystem is writable, and enables auth immediately.
7. If the filesystem is read-only (common in Docker), the UI shows the environment variables and a Docker Compose snippet to copy instead. Restart the server after updating the environment.

## Disabling auth via the UI

An admin can return to `/admin/settings` and toggle **Enable auth / workspaces** off. The app becomes a public portal again. Existing diagrams keep any `workspaceId` they had; new diagrams are created without one.

## Environment variables (manual fallback)

You can also set these directly in your `.env` file or Docker Compose environment:

```bash
# Required for auth / workspace mode
AUTH_SECRET="openssl rand -base64 32"
AUTH_OIDC_ISSUER="https://accounts.google.com"
AUTH_OIDC_CLIENT_ID="your-client-id"
AUTH_OIDC_CLIENT_SECRET="your-client-secret"

# Required for users, workspaces, memberships, audit logs, and the app config
MONGODB_URI="mongodb://localhost:27017/livemaid"

# Optional but recommended
AUDIT_IP_PEPPER="another-random-string-for-ip-hashing"
```

- `AUTH_SECRET` — a random 32-byte string used to sign session tokens.
- `AUTH_OIDC_ISSUER` — the issuer URL from your provider's OIDC discovery document.
- `AUTH_OIDC_CLIENT_ID` and `AUTH_OIDC_CLIENT_SECRET` — from your OIDC app registration.
- `MONGODB_URI` — connection string to a MongoDB deployment.
- `AUDIT_IP_PEPPER` — a secret pepper used when hashing IP addresses in audit logs.

When the environment variables are present, use `/admin/settings` to turn auth on. The setup UI at `/admin/setup` can also write them for you.

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

`DEMO_MODE=true` disables writes regardless of auth mode. You can run auth + demo, but since demo mode is read-only, members and workspaces will not be created.

## See also

- [Docker deployment](./docker)
- [Demo mode](./demo-mode)
- [Architecture reference: Authentication & Workspaces](https://github.com/peter6055/livemaid/blob/main/reference/architecture/auth.md)
