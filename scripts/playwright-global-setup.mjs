import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";

function getRandomPort(min = 20000, max = 30000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default async function globalSetup() {
  const port = getRandomPort();
  const tmpRoot = join(process.cwd(), "tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const distDir = mkdtempSync(join(tmpRoot, "livemaid-test-next-"));
  const baseURL = `http://localhost:${port}`;
  process.env.PLAYWRIGHT_BASE_URL = baseURL;
  process.env.NEXT_TEST_DIST_DIR = distDir;
  console.log(`[globalSetup] Starting test dev server on ${baseURL}`);
  console.log(`[globalSetup] Using distDir: ${distDir}`);

  const proc = spawn("npx", ["next", "dev", "--hostname", "0.0.0.0", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TEST_DIST_DIR: distDir,
    },
  });

  // Wait for the server to be ready.
  await new Promise((resolve, reject) => {
    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
      if (output.includes("Ready in") || output.includes("Local:")) {
        resolve();
      }
    });
    proc.stderr.on("data", (data) => {
      output += data.toString();
    });
    setTimeout(() => reject(new Error(`Server did not start in time. Output:\n${output}`)), 120000);
  });

  // Warm up the key routes so the first test doesn't pay the Next.js dev
  // on-demand compile cost (which can exceed the per-test timeout). The editor
  // and dashboard pull in Monaco/Mermaid and can take 30-60s to compile cold.
  const warmRoutes = ["/", "/api/diagrams", "/editor/warmup"];
  await Promise.all(
    warmRoutes.map(async (path) => {
      try {
        const res = await fetch(`${baseURL}${path}`, {
          signal: AbortSignal.timeout(120000),
        });
        console.log(`[globalSetup] warm-up ${path} -> ${res.status}`);
      } catch (err) {
        console.warn(`[globalSetup] warm-up ${path} failed: ${err.message}`);
      }
    }),
  );

  return async () => {
    proc.kill("SIGTERM");
  };
}
