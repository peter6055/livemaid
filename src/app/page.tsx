import Dashboard from "@/components/Dashboard";
import { connection } from "next/server";

export default async function Home() {
  // Opt out of build-time prerendering so DEMO_MODE is read from the live
  // runtime environment (e.g. Railway service variables) instead of being baked
  // into the static bundle at build time.
  await connection();
  const isDemo = process.env.DEMO_MODE === "true";
  return <Dashboard isDemo={isDemo} />;
}
