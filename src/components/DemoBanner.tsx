"use client";

import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2.5 shrink-0">
      <FlaskConical className="w-4 h-4 text-amber-500 shrink-0" />
      <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
        <span className="font-semibold">Demo Mode</span>
        {" — "}
        You are exploring a live demo. All changes you make are temporary and won&apos;t be saved. Feel free to play around!
      </p>
    </div>
  );
}
