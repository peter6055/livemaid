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

  return async () => {
    proc.kill("SIGTERM");
  };
}
