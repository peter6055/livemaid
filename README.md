# LiveMaid 🧜‍♀️

**The WYSIWYG Mermaid Editor**

LiveMaid is a modern, local web application designed to make creating, editing, and managing [Mermaid](https://mermaid.js.org/) diagrams a breeze. Built with Next.js and React, it provides a seamless visual workspace for developers, architects, and anyone who needs to quickly generate diagrams from code.

## 🎯 Purpose

Writing Mermaid code can sometimes be tedious without immediate visual feedback. The purpose of LiveMaid is to provide a local, fast, and intuitive environment where you can write Mermaid syntax and instantly see the rendered diagrams. It acts as a personal diagram management dashboard, allowing you to organize all your charts, flowcharts, and sequence diagrams in one place without relying on external cloud services.

## ✨ Features

* **Live WYSIWYG Editor:** Instantly preview your Mermaid diagrams as you type.
* **Diagram Management:** Easily create, rename, and delete diagrams from a centralized dashboard.
* **Powered by Monaco:** Enjoy a rich coding experience with the integrated Monaco Editor.
* **Dark Mode Support:** Toggle between light and dark themes for comfortable viewing anytime.
* **Modern Stack:** Built on top of Next.js, React 19, and styled with Tailwind CSS & shadcn/ui.

## 🚀 Getting Started

Follow these instructions to set up the project locally for development.

### Prerequisites

* Node.js (v18 or higher recommended)
* npm (or yarn, pnpm, bun)

### Installation

1. Ensure you are in the project root directory:
   ```bash
   cd livemaid
   ```

2. Install the dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   # or
   bun install
   ```

### Running the Development Server

Start the local development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the dashboard.

The application auto-updates as you edit the files in the `src/` directory.

## 🐳 Deployment (Docker)

LiveMaid is containerized and available on the GitHub Container Registry. Since it uses local file storage, you can easily deploy it on any server (like Ubuntu) using Docker Compose while retaining your data.

### Option 1: Quick Deployment Script (Ubuntu/Linux)

We provide a single bash script that automatically pulls the image, sets up the data directory, and runs docker-compose:

1. Make the script executable:
   ```bash
   chmod +x deploy.sh
   ```
2. Run the deployment script:
   ```bash
   ./deploy.sh
   ```

*(Note: If the image is private, you must run `docker login ghcr.io -u <your_username>` with a Personal Access Token first).*

### Option 2: Manual Docker Compose

1. Create a `docker-compose.yml` file on your server:
   ```yaml
   version: '3.8'

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

## 🛠️ Tech Stack

* [Next.js](https://nextjs.org/)
* [React](https://react.dev/)
* [Mermaid.js](https://mermaid.js.org/)
* [Monaco Editor](https://microsoft.github.io/monaco-editor/)
* [Tailwind CSS](https://tailwindcss.com/)
* [shadcn/ui](https://ui.shadcn.com/)

## 💖 Support the Community

If you plan to use this editor for commercial purposes or in an enterprise environment, we highly encourage you to support the Mermaid community by purchasing a [Mermaid Chart / Mermaid.ai](https://www.mermaidchart.com/) subscription. Your support helps sustain the continued development of the incredible diagramming tool that powers this application!
