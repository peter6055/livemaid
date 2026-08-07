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
  const proc = spawn("npx", ["next", "dev", "--hostname", "0.0.0.0", "-p", String(port)], {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_TEST_DIST_DIR: distDir,
    },
  });
  process.on("SIGINT", () => proc.kill("SIGINT"));
  process.on("SIGTERM", () => proc.kill("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
