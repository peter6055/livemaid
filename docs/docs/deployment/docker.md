---
sidebar_position: 1
---

# Docker Compose

LiveMaid is containerized and available on the GitHub Container Registry. Since it uses local file storage, you can easily deploy it on any server (like Ubuntu) using Docker Compose while retaining your data.

## Manual Docker Compose

1. Create a `docker-compose.yml` file on your server:

   ```yaml
   services:
     livemaid:
       image: ghcr.io/peter6055/livemaid:latest
       container_name: livemaid
       ports:
         - "3000:3000"
       volumes:
         # Maps local ./data folder to container for persistent diagram storage
         - ./data:/app/data
       environment:
         - NODE_ENV=production
       restart: unless-stopped
   ```

2. Start the container:

   ```bash
   docker-compose up -d
   ```

Your diagrams will be saved permanently in the `./data` folder on your server!

## Self-contained stack with MongoDB

To enable workspace mode (OIDC sign-in, workspaces, members, audit logs), add a MongoDB service and set all five workspace environment variables. Restart after changing them. There is no Settings UI.

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
      - WORKSPACES_ENABLED=true
      - MONGODB_URI=mongodb://mongo:27017/livemaid
      - AUTH_OIDC_ISSUER=https://idp.example.com
      - AUTH_OIDC_CLIENT_ID=your-client-id
      - AUTH_OIDC_CLIENT_SECRET=your-client-secret
    restart: unless-stopped
```

If you prefer an external MongoDB, replace `MONGODB_URI` with your connection string and remove the `mongo` service.

## Environment variables

LiveMaid is configured through environment variables. For local development use a single `.env` (copy from `.env.example`). See the [environment variables reference](./environment-variables) for the full list, including workspace/OIDC vars and the `DEMO_MODE` variable used by the [demo mode](./demo-mode) service.
