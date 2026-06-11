"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DuplicatePayload {
  name: string;
  code: string;
  type: string;
  folderId: string | null;
}

function isDuplicatePayload(value: unknown): value is DuplicatePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DuplicatePayload>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.code === "string" &&
    typeof candidate.type === "string" &&
    (typeof candidate.folderId === "string" || candidate.folderId === null)
  );
}

export default function DuplicateDiagramPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const duplicate = async () => {
      const token = searchParams.get("token");
      const storageKey = token ? `livemaid:duplicate:${token}` : "";
      let payload: DuplicatePayload | null = null;

      try {
        if (storageKey) {
          const raw = window.localStorage.getItem(storageKey);
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (isDuplicatePayload(parsed)) payload = parsed;
          }
        }

        if (!payload) {
          const sourceRes = await fetch(`/api/diagrams/${params.id}`);
          if (!sourceRes.ok) throw new Error("Source diagram not found");
          const source = await sourceRes.json();
          payload = {
            name: `${source.name} (Copy)`,
            code: source.code,
            type: source.type,
            folderId: source.folderId ?? null,
          };
        }

        const createRes = await fetch("/api/diagrams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!createRes.ok) throw new Error("Failed to duplicate diagram");
        const newDiagram = await createRes.json();
        if (storageKey) window.localStorage.removeItem(storageKey);
        if (!cancelled) router.replace(`/editor/${newDiagram.id}`);
      } catch {
        if (storageKey) window.localStorage.removeItem(storageKey);
        if (!cancelled) setError("Failed to duplicate diagram.");
      }
    };

    duplicate();

    return () => {
      cancelled = true;
    };
  }, [params.id, router, searchParams]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center text-foreground">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <FileQuestion className="h-8 w-8 text-red-500" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold">Duplicate failed</h1>
          <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        </div>
        <Button onClick={() => router.replace(`/editor/${params.id}`)}>
          Back to source diagram
        </Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <Loader2 className="h-12 w-12 animate-spin text-indigo-500" />
      <p className="text-lg font-medium">Duplicating diagram...</p>
    </main>
  );
}
