import Dashboard from "@/components/Dashboard";
import { connection } from "next/server";
import { isDemoMode, getDisplayVersion, getRawVersion } from "@/lib/env";

export default async function Home() {
  // Opt out of build-time prerendering so DEMO_MODE is read from the live
  // runtime environment (e.g. Railway service variables) instead of being baked
  // into the static bundle at build time.
  await connection();
  const isDemo = isDemoMode();
  const rawVersion = getRawVersion();
  const displayVersion = getDisplayVersion();
  return <Dashboard isDemo={isDemo} appVersion={displayVersion} rawVersion={rawVersion} />;
}
