---
sidebar_position: 3
---

# Environment Variables

LiveMaid is configured entirely through environment variables. Set them in your Docker Compose file, container orchestrator, or hosting platform (Railway, etc.).

The auth signing secret and the audit IP pepper are generated and persisted automatically, so you do not need to set them.

## Quick reference

| Variable                  | Required      | Description                                                                                                                      |
| ------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | No            | `production` disables dev-only behaviour and warnings. Defaults to development.                                                  |
| `NEXT_PUBLIC_APP_VERSION` | No            | Display version shown in the UI. The build script sets this automatically from the git tag or `VERSION`/`APP_VERSION` build arg. |
| `NEXT_PUBLIC_BASE_PATH`   | No            | Serve the app under a sub-path, e.g. `/livemaid`. Must match your reverse proxy.                                                 |
| `ALLOWED_DEV_ORIGINS`     | No            | Comma-separated list of extra origins allowed by the Next.js dev server.                                                         |
| `MONGODB_URI`             | For auth mode | MongoDB connection string for users, workspaces, memberships, and audit logs.                                                    |
| `AUTH_OIDC_ISSUER`        | For auth mode | OIDC issuer URL from your provider's discovery document.                                                                         |
| `AUTH_OIDC_CLIENT_ID`     | For auth mode | Client ID from your OIDC app registration.                                                                                       |
| `AUTH_OIDC_CLIENT_SECRET` | For auth mode | Client secret from your OIDC app registration.                                                                                   |
| `AUTH_SECRET`             | For auth mode | Signing secret for session tokens. Auto-generated and persisted if not set.                                                      |
| `AUDIT_IP_PEPPER`         | No            | Pepper for hashing IPs in audit logs. Auto-generated and persisted if not set.                                                   |
| `DEMO_MODE`               | No            | Set to `true` to run a read-only demo instance. See [Demo mode](./demo-mode).                                                    |

## General variables

### `NODE_ENV`

Set to `production` for deployed containers. The included `Dockerfile` and `docker-compose.yml` already set this.

### `NEXT_PUBLIC_APP_VERSION`

Version label shown in the settings dialog and footer. The production build (`npm run build`) sets this automatically from:

1. The `VERSION` or `APP_VERSION` build arg.
2. The latest `v*.*.*` git tag.
3. Falls back to `0.0.0`.

You only need to set this manually if you want to override the displayed version.

### `NEXT_PUBLIC_BASE_PATH`

Use this when serving LiveMaid behind a reverse proxy under a sub-path, for example `https://example.com/livemaid/`. Set `NEXT_PUBLIC_BASE_PATH=/livemaid` and ensure your proxy strips that prefix before forwarding to the container.

### `ALLOWED_DEV_ORIGINS`

Dev-only. Comma-separated list of extra origins allowed by the Next.js dev server, useful when developing over Tailscale or similar:

```bash
ALLOWED_DEV_ORIGINS=*.mytail.ts.net,my-machine.mytail.ts.net
```

## Auth / workspace variables

Auth mode is enabled automatically when `MONGODB_URI` and the three OIDC variables below are set. If any are missing, the app runs in no-auth / local mode. The signing secret is generated and persisted automatically.

### `AUTH_OIDC_ISSUER`

Your provider's OIDC issuer URL. This is used to fetch `/.well-known/openid-configuration`.

Examples:

- Google: `https://accounts.google.com`
- Okta: `https://your-org.okta.com`
- Authentik: `https://authentik.example.com/application/o/your-app`
- Generic: `https://idp.example.com`

### `AUTH_OIDC_CLIENT_ID` and `AUTH_OIDC_CLIENT_SECRET`

From your OIDC app registration. Use the provider's client credentials, not end-user credentials.

### `AUTH_SECRET`

A random 32-byte string used to sign session tokens. If you do not set one, LiveMaid generates it on first startup and persists it in `data/.livemaid/auth-secret` so sessions survive container restarts.

You can also generate one manually:

```bash
openssl rand -base64 32
```

### Provider-specific notes

- **Google**: Create credentials in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.
- **Generic OIDC (Okta, Auth0, Keycloak, Authentik, etc.)**: Use the provider's OIDC discovery issuer URL.

In all cases the authorized redirect URI must be:

```text
https://your-domain.com/api/auth/callback/oidc
```

(Adjust the origin to match your deployment.)

## Audit logging

### `AUDIT_IP_PEPPER`

Optional secret used as a pepper when hashing IP addresses before writing audit logs. If unset, LiveMaid generates one on first startup and persists it in `data/.livemaid/audit-ip-pepper` so hashes remain stable across restarts.

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
      - AUTH_SECRET=${AUTH_SECRET:-}
      - AUDIT_IP_PEPPER=${AUDIT_IP_PEPPER:-}
      - NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH:-}
    restart: unless-stopped
```

For a read-only demo instance, see [Demo mode](./demo-mode).
