"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, ShieldCheck } from "lucide-react";

export function AuthToggleForm({
  authEnabled,
  oidcConfigured,
}: {
  authEnabled: boolean;
  oidcConfigured: boolean;
}) {
  const [enabled, setEnabled] = useState(authEnabled);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/auth-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update setting");
      }
      if (data.authEnabled && !data.oidcConfigured) {
        window.location.href = "/admin/setup";
        return;
      }
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  }

  const needsCreds = enabled && !oidcConfigured;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="auth-toggle" className="text-base font-medium">
            Enable auth / workspaces
          </Label>
          {enabled ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>OIDC sign-in required; diagrams scoped to workspaces</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400">
              <Sparkles className="w-4 h-4" />
              <span>Public portal: no login, all diagrams editable</span>
            </div>
          )}
        </div>
        <button
          type="button"
          id="auth-toggle"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          disabled={submitting}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-primary" : "bg-input"
          }`}
        >
          <span
            className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow ring-0 transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {needsCreds && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          OIDC credentials are not configured. After enabling, you will be redirected to the setup
          form to enter them.
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save setting"}
      </Button>
    </form>
  );
}
