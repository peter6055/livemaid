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
