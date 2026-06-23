import Dashboard from "@/components/Dashboard";
import { connection } from "next/server";

function getModeSuffix(): string {
  const mode = process.env.NODE_ENV === "development" ? "Dev" : "Prod";
  const demo = process.env.DEMO_MODE === "true" ? " Demo" : "";
  return `${mode}${demo}`;
}

export default async function Home() {
  // Opt out of build-time prerendering so DEMO_MODE is read from the live
  // runtime environment (e.g. Railway service variables) instead of being baked
  // into the static bundle at build time.
  await connection();
  const isDemo = process.env.DEMO_MODE === "true";
  const rawVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const displayVersion = `${rawVersion} (${getModeSuffix()})`;
  return <Dashboard isDemo={isDemo} appVersion={displayVersion} rawVersion={rawVersion} />;
}
