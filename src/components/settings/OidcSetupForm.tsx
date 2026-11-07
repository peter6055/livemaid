"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitOidcSetupInline } from "@/app/admin/setup/actions";
import { AlertCircle, CheckCircle2, RefreshCcw } from "lucide-react";

const TEMPLATES = [
  { value: "generic", label: "Generic OIDC" },
  { value: "google", label: "Google" },
  { value: "okta", label: "Okta" },
  { value: "authentik", label: "Authentik" },
];

const TEMPLATE_HINTS: Record<string, string> = {
  google: "https://accounts.google.com",
  okta: "https://your-org.okta.com",
  authentik: "https://authentik.example.com/application/o/your-app",
  generic: "https://idp.example.com",
};

export function OidcSetupForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof submitOidcSetupInline>> | null>(
    null,
  );

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    try {
      const res = await submitOidcSetupInline(formData);
      setResult(res);
      if (res.ok) {
        // Reload so the app picks up the new env vars and reflects auth enabled.
        window.location.reload();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const envBlock =
    result?.ok && result.env
      ? `AUTH_SECRET="${result.env.AUTH_SECRET}"\nAUTH_OIDC_ISSUER="${result.env.AUTH_OIDC_ISSUER}"\nAUTH_OIDC_CLIENT_ID="${result.env.AUTH_OIDC_CLIENT_ID}"\nAUTH_OIDC_CLIENT_SECRET="${result.env.AUTH_OIDC_CLIENT_SECRET}"`
      : "";

  return (
    <form action={handleSubmit} className="space-y-4">
      {result?.ok === false && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Setup failed</p>
            <p className="text-sm opacity-90">{result.error}</p>
          </div>
        </div>
      )}

      {result?.ok && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">
                {result.wroteFile ? "Configuration saved to .env" : "Configuration ready"}
              </p>
              <p className="text-sm opacity-90">
                {result.wroteFile
                  ? "Environment variables were written to .env. Restart the server if it does not reload automatically."
                  : "Could not write .env (read-only filesystem). Copy the variables below into your environment."}
              </p>
            </div>
          </div>

          {!result.wroteFile && (
            <div className="space-y-2">
              <Label>Environment variables</Label>
              <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {envBlock}
              </pre>
            </div>
          )}

          {result.composeSnippet && (
            <div className="space-y-2">
              <Label>Docker Compose snippet</Label>
              <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {result.composeSnippet}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <RefreshCcw className="w-4 h-4 shrink-0" />
            Reloading to apply the new configuration...
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="template">Provider template</Label>
        <select
          id="template"
          name="template"
          className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Example issuers:{" "}
          {Object.entries(TEMPLATE_HINTS)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ")}
          .
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="issuer">OIDC issuer URL</Label>
        <Input
          id="issuer"
          name="issuer"
          type="url"
          placeholder="https://idp.example.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientId">Client ID</Label>
        <Input id="clientId" name="clientId" type="text" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientSecret">Client Secret</Label>
        <Input id="clientSecret" name="clientSecret" type="password" required />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save OIDC configuration"}
      </Button>
    </form>
  );
}
