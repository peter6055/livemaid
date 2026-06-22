import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(command) {
  try {
    return execSync(command, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

export function resolveVersion() {
  const envVersion =
    process.env.VERSION || process.env.APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION;
  if (envVersion && envVersion !== "0.0.0") return envVersion.replace(/^v/, "");

  const buildVersionPath = path.resolve(process.cwd(), ".build-version");
  if (fs.existsSync(buildVersionPath)) {
    const buildVersion = fs.readFileSync(buildVersionPath, "utf-8").trim();
    if (buildVersion && buildVersion !== "0.0.0") return buildVersion.replace(/^v/, "");
  }

  const exactTag = run(
    "git describe --tags --exact-match --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || git tag --points-at HEAD --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1",
  );
  if (exactTag) return exactTag.replace(/^v/, "");

  const latestTag = run("git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1");
  if (latestTag) return latestTag.replace(/^v/, "");

  return "0.0.0";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(resolveVersion());
}
