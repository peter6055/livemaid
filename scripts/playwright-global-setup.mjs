import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { getRandomPort } from "./get-random-port.mjs";

export default async function globalSetup() {
  const port = await getRandomPort();
  const tmpRoot = join(process.cwd(), "tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const distDir = mkdtempSync(join(tmpRoot, "livemaid-test-next-"));
  const baseURL = `http://localhost:${port}`;
  process.env.PLAYWRIGHT_BASE_URL = baseURL;
  process.env.NEXT_TEST_DIST_DIR = distDir;
  console.log(`[globalSetup] Starting test dev server on ${baseURL}`);
  console.log(`[globalSetup] Using distDir: ${distDir}`);

  const spawnServer = () =>
    spawn("npx", ["next", "dev", "--hostname", "0.0.0.0", "-p", String(port)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: "",
        AUTH_URL: "",
        WORKSPACES_ENABLED: "false",
        AUTH_OIDC_ISSUER: "",
        AUTH_OIDC_CLIENT_ID: "",
        AUTH_OIDC_CLIENT_SECRET: "",
        // Never let a local `.env` point the test server at the real database.
        MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/livemaid_test",
        NEXT_TEST_DIST_DIR: distDir,
      },
    });

  const waitForReady = (server) =>
    new Promise((resolve, reject) => {
      let output = "";
      server.stdout.on("data", (data) => {
        output += data.toString();
        if (output.includes("Ready in") || output.includes("Local:")) {
          resolve();
        }
      });
      server.stderr.on("data", (data) => {
        output += data.toString();
      });
      server.on("exit", () => {
        reject(new Error(`Server exited before it was ready. Output:\n${output}`));
      });
      setTimeout(
        () => reject(new Error(`Server did not start in time. Output:\n${output}`)),
        120000,
      );
    });

  let proc = spawnServer();
  await waitForReady(proc);

  // Warm up the key routes so the first test doesn't pay the Next.js dev
  // on-demand compile cost (which can exceed the per-test timeout). The editor
  // and dashboard pull in Monaco/Mermaid and can take 30-60s to compile cold.
  const warmRoutes = ["/", "/api/diagrams", "/editor/warmup"];
  const warmUp = async () => {
    const results = await Promise.all(
      warmRoutes.map(async (path) => {
        try {
          const res = await fetch(`${baseURL}${path}`, {
            signal: AbortSignal.timeout(120000),
          });
          console.log(`[globalSetup] warm-up ${path} -> ${res.status}`);
          return true;
        } catch (err) {
          console.warn(`[globalSetup] warm-up ${path} failed: ${err.message}`);
          return false;
        }
      }),
    );
    return results.every(Boolean);
  };

  // Next 16 stops `next dev` once per distDir to show its agent upgrade reminder.
  // The retry receipt it writes lives inside distDir, so restarting with the same
  // distDir continues normally.
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await warmUp()) break;
    if (attempt === 2) throw new Error("Test dev server is not responding");
    console.log("[globalSetup] Server stopped for the Next.js upgrade reminder; restarting.");
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already dead */
    }
    proc = spawnServer();
    await waitForReady(proc);
  }

  return async () => {
    // Graceful shutdown: try SIGTERM first, then SIGKILL after a short delay.
    try {
      proc.kill("SIGTERM");
      await new Promise((resolve) => {
        const forceKill = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* already dead */
          }
          resolve(undefined);
        }, 5000);
        proc.on("exit", () => {
          clearTimeout(forceKill);
          resolve(undefined);
        });
        proc.on("error", () => {
          clearTimeout(forceKill);
          resolve(undefined);
        });
      });
    } catch {
      // Process already exited.
    }
  };
}
