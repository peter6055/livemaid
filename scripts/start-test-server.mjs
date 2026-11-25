import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { getRandomPort } from "./get-random-port.mjs";

async function main() {
  const port = await getRandomPort();
  const tmpRoot = join(process.cwd(), "tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const distDir = mkdtempSync(join(tmpRoot, "livemaid-test-next-"));
  const url = `http://localhost:${port}`;
  console.log(`Starting test dev server on ${url}`);
  console.log(`Using distDir: ${distDir}`);
  const start = () =>
    spawn("npx", ["next", "dev", "--hostname", "0.0.0.0", "-p", String(port)], {
      stdio: "inherit",
      shell: true,
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
  // Next 16 stops `next dev` once per distDir to show its agent upgrade reminder.
  // The retry receipt it writes lives inside distDir, so a second start with the
  // same distDir continues normally.
  let stopping = false;
  let retried = false;
  let proc = start();
  proc.on("exit", (code) => {
    if (stopping || retried || code === 0) return;
    retried = true;
    proc = start();
  });
  process.on("SIGINT", () => {
    stopping = true;
    proc.kill("SIGINT");
  });
  process.on("SIGTERM", () => {
    stopping = true;
    proc.kill("SIGTERM");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
