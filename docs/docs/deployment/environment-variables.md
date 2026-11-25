---
sidebar_position: 3
---

# Environment Variables

LiveMaid is configured through environment variables. For local development, copy `.env.example` to `.env` and edit that one file. Do not use `.env.local`. In production, set the same variables in Docker Compose, your orchestrator, or the host platform (Railway, etc.).

Workspace mode is env-only: set the System + Workspace variables below, then restart. There is no Settings UI.

## Quick reference

| Category  | Variable                  | Required            | Description                                                                                          |
| --------- | ------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| Dev       | `ALLOWED_DEV_ORIGINS`     | No                  | Comma-separated list of extra origins allowed by the Next.js dev server.                             |
| Dev       | `DEMO_MODE`               | No                  | Set to `true` for a read-only demo instance. See [Demo mode](./demo-mode).                           |
| System    | `NODE_ENV`                | No                  | `production` disables dev-only behaviour and warnings. Defaults to development.                      |
| System    | `BASE_URL`                | For sub-path setups | Full public URL of the app, including any reverse-proxy prefix, e.g. `https://example.com/livemaid`. |
| System    | `MONGODB_URI`             | For workspace mode  | MongoDB connection string for users, workspaces, memberships, and audit logs.                        |
| Workspace | `WORKSPACES_ENABLED`      | For workspace mode  | Set to `true` / `1` / `yes` (also needs Mongo + OIDC).                                               |
| Workspace | `AUTH_OIDC_ISSUER`        | For workspace mode  | OIDC issuer URL (must expose `/.well-known/openid-configuration`).                                   |
| Workspace | `AUTH_OIDC_CLIENT_ID`     | For workspace mode  | OIDC client ID.                                                                                      |
| Workspace | `AUTH_OIDC_CLIENT_SECRET` | For workspace mode  | OIDC client secret.                                                                                  |

## Local setup

```bash
cp .env.example .env
# edit .env, then restart `npm run dev`
```

Next.js loads `.env` automatically. Keep secrets out of git — `.env` is gitignored.

## Dev settings

### `ALLOWED_DEV_ORIGINS`

Dev-only. Comma-separated list of extra origins allowed by the Next.js dev server, useful when developing over Tailscale or similar:

```bash
ALLOWED_DEV_ORIGINS=*.mytail.ts.net,my-machine.mytail.ts.net
```

### `DEMO_MODE`

Set to `true` to run a read-only demo instance. See [Demo mode](./demo-mode).

## System settings

### `NODE_ENV`

Set to `production` for deployed containers. The included `Dockerfile` and `docker-compose.yml` already set this.

### `BASE_URL`

Set this when LiveMaid is reachable at a public URL that differs from the container's internal address, and in particular when serving behind a reverse proxy under a sub-path, for example `https://example.com/livemaid/`. Set it to the full public URL including the prefix:

```bash
BASE_URL=https://example.com/livemaid
```

LiveMaid uses this value for OIDC callbacks, server-side redirects, and every client-side link. The pathname is also baked into Next.js `basePath` at **build time**, so the reverse proxy must forward the prefix intact (a request to `https://example.com/livemaid/login` must reach the container as `/livemaid/login`). Changing the path requires a rebuild.

Leave `BASE_URL` unset for local development at the root (`http://localhost:3434`).

Auth.js derives its own `basePath` from the pathname of `AUTH_URL` (for example `/livemaid/api/auth`). The auth route rewrites requests onto that path when needed so OIDC `redirect_uri` values keep the proxy prefix.

### `MONGODB_URI`

MongoDB stores users, workspaces, memberships, and audit logs. Required for workspace mode. Without it, LiveMaid runs in no-auth / local mode and stores diagrams on disk only.

```bash
MONGODB_URI=mongodb://mongo:27017/livemaid
```

You can point this at a MongoDB container in the same Compose stack or at an external database. See the [Docker Compose guide](./docker#self-contained-stack-with-mongodb).

## Workspace settings

Enable workspace mode by setting System `MONGODB_URI` plus all Workspace settings, then restarting:

```bash
WORKSPACES_ENABLED=true
AUTH_OIDC_ISSUER=https://idp.example.com
AUTH_OIDC_CLIENT_ID=your-client-id
AUTH_OIDC_CLIENT_SECRET=your-client-secret
```

If any required value is missing or `WORKSPACES_ENABLED` is not truthy, LiveMaid stays in no-auth / local mode. There is no Settings UI.

See [Modes](../access/modes) for how standalone, workspace, and demo differ, and [Permissions](../access/permissions) for who can see which diagrams.

### `WORKSPACES_ENABLED`

Truthy values: `true`, `1`, `yes` (case-insensitive). Without this flag, LiveMaid stays in no-auth / local mode even if Mongo and OIDC are configured.

### `AUTH_OIDC_ISSUER` / `AUTH_OIDC_CLIENT_ID` / `AUTH_OIDC_CLIENT_SECRET`

OIDC credentials for Auth.js. The issuer must expose `/.well-known/openid-configuration`. Read at startup only.

## Docker Compose example

```yaml
services:
  mongo:
    image: mongo:7
    container_name: livemaid-mongo
    volumes:
      - ./mongo-data:/data/db
    restart: unless-stopped

  livemaid:
    image: ghcr.io/peter6055/livemaid:latest
    container_name: livemaid
    ports:
      - "3000:3000"
    depends_on:
      - mongo
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - BASE_URL=${BASE_URL:-}
      - MONGODB_URI=mongodb://mongo:27017/livemaid
      - WORKSPACES_ENABLED=true
      - AUTH_OIDC_ISSUER=https://idp.example.com
      - AUTH_OIDC_CLIENT_ID=your-client-id
      - AUTH_OIDC_CLIENT_SECRET=your-client-secret
    restart: unless-stopped
```

For a read-only demo instance, see [Demo mode](./demo-mode).
