---
sidebar_position: 2
---

# Demo Mode

Demo mode lets you run a **public, read-only instance** of LiveMaid pre-loaded with sample diagrams. Visitors can freely explore and edit diagrams in-browser, but nothing is ever persisted to disk.

## How it works

- Diagrams are read from the `./demo/` folder instead of `./data/`.
- All write operations (create, save, delete) are silently disabled on both the server and the client.
- A persistent amber banner is displayed on every page informing users they are in demo mode.

## Setup

1. Populate the `./demo/` folder with sample diagram JSON files (same format as `./data/`).

2. Run the demo service defined in the included `docker-compose.yml`:

   ```bash
   docker-compose up -d livemaid-demo
   ```

   This starts the demo instance on port `3001` with `DEMO_MODE=true` and mounts `./demo` as read-only.

   Alternatively, pass the environment variable yourself:

   ```yaml
   services:
     livemaid-demo:
       image: ghcr.io/peter6055/livemaid:latest
       ports:
         - "3001:3000"
       volumes:
         - ./demo:/app/demo:ro
       environment:
         - NODE_ENV=production
         - DEMO_MODE=true
       restart: unless-stopped
   ```

:::note

Only `DEMO_MODE=true` is required. It is read at **runtime** (the dashboard and editor pages opt out of static prerendering via `connection()`), so it works on platforms like Railway that inject env vars at container start. `DEMO_MODE` controls everything: the server-side storage path, the write guards, and — passed down as a prop to the client — the demo banner, the disabled write buttons, and the read-only labels.

:::
