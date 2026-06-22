import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveVersion } from "./resolve-version.mjs";

const version = resolveVersion();
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

console.log(`[build] Baking version "${version}" into NEXT_PUBLIC_APP_VERSION`);

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_APP_VERSION: version,
  },
});

process.exit(result.status ?? 1);
