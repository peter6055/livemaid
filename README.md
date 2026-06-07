# LiveMaid 🧜‍♀️

> [!WARNING]
> This project began as a side project and is not production-grade. You may encounter bugs or incomplete behavior.

<p align="center">
  <img src="https://github.com/user-attachments/assets/da138123-d78c-4cbf-8536-fe3287926ab9" alt="LiveMaid logo" width="96" height="96" />
</p>

<h1 align="center">LiveMaid</h1>

---

<p align="center"><strong>The WYSIWYG Mermaid Editor</strong></p>

LiveMaid is a modern, local web application designed to make creating, editing, and managing [Mermaid](https://mermaid.js.org/) diagrams a breeze. Built with Next.js and React, it provides a seamless visual workspace for developers, architects, and anyone who needs to quickly generate diagrams from code.

## 🎯 Purpose

Writing Mermaid code can sometimes be tedious without immediate visual feedback. The purpose of LiveMaid is to provide a local, fast, and intuitive environment where you can write Mermaid syntax and instantly see the rendered diagrams. It acts as a personal diagram management dashboard, allowing you to organize all your charts, flowcharts, and sequence diagrams in one place without relying on external cloud services.

## ✨ Features

- **Live WYSIWYG Editor:** Instantly preview your Mermaid diagrams as you type.
- **Diagram Management:** Easily create, rename, and delete diagrams from a centralized dashboard.
- **Powered by Monaco:** Enjoy a rich coding experience with the integrated Monaco Editor.
- **Dark Mode Support:** Toggle between light and dark themes for comfortable viewing anytime.
- **Modern Stack:** Built on top of Next.js, React 19, and styled with Tailwind CSS & shadcn/ui.
- **Demo Mode:** Run a read-only public-facing instance pre-loaded with sample diagrams — changes are never persisted.

## 🐳 Deployment (Docker)

LiveMaid is containerized and available on the GitHub Container Registry. Since it uses local file storage, you can easily deploy it on any server (like Ubuntu) using Docker Compose while retaining your data.

### Manual Docker Compose

1. Create a `docker-compose.yml` file on your server:

   ```yaml
   version: "3.8"

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

### Demo Mode

Demo mode lets you run a **public, read-only instance** of LiveMaid pre-loaded with sample diagrams. Visitors can freely explore and edit diagrams in-browser, but nothing is ever persisted to disk.

**How it works:**

- Diagrams are read from the `./demo/` folder instead of `./data/`.
- All write operations (create, save, delete) are silently disabled on both the server and the client.
- A persistent amber banner is displayed on every page informing users they are in demo mode.

**Setup:**

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

> **Note:** Only `DEMO_MODE=true` is required. It is read at **runtime** (the
> dashboard and editor pages opt out of static prerendering via `connection()`),
> so it works on platforms like Railway that inject env vars at container start.
> `DEMO_MODE` controls everything: the server-side storage path, the write
> guards, and — passed down as a prop to the client — the demo banner, the
> disabled write buttons, and the read-only labels.

## 🛠️ Tech Stack

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Mermaid.js](https://mermaid.js.org/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)

## 🤝 Contributing

Interested in contributing? See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, the branch workflow, commit conventions, PR title rules, and the full CI/CD pipeline overview.

## 💖 Support the Community

If you plan to use this editor for commercial purposes or in an enterprise environment, we highly encourage you to support the Mermaid community by purchasing a [Mermaid Chart / Mermaid.ai](https://www.mermaidchart.com/) subscription. Your support helps sustain the continued development of the incredible diagramming tool that powers this application!
