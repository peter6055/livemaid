import LiveMaidEditor from "@/components/LiveMaidEditor";
import { connection } from "next/server";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  // Read DEMO_MODE at request time (runtime), never baked at build time.
  await connection();
  const { id } = await params;
  const isDemo = process.env.DEMO_MODE === "true";
  return <LiveMaidEditor documentId={id} isDemo={isDemo} />;
}
