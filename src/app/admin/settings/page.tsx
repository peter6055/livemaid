import { areOidcCredentialsConfigured, getAppConfigDoc } from "@/lib/auth/appConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { connection } from "next/server";
import { AuthToggleForm } from "./AuthToggleForm";

export default async function AdminSettingsPage() {
  // Opt out of build-time prerendering so the DB config can be read at request time.
  await connection();

  const appConfig = await getAppConfigDoc();
  const oidcConfigured = areOidcCredentialsConfigured();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-background/60">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-2.5">
          <BrandLogo className="w-8 h-8 rounded-lg" />
          <span className="font-semibold text-lg tracking-tight">LiveMaid</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
              <CardDescription>
                Toggle workspaces and OIDC sign-in. When auth is off, LiveMaid is a public portal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium">OIDC status:</span>{" "}
                  {oidcConfigured ? (
                    <span className="text-green-600 dark:text-green-400">Configured</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      Not configured — setup required
                    </span>
                  )}
                </p>
                <p>
                  <span className="font-medium">Auth flag:</span>{" "}
                  {appConfig.authEnabled ? "Enabled" : "Disabled"}
                </p>
              </div>

              <AuthToggleForm authEnabled={appConfig.authEnabled} oidcConfigured={oidcConfigured} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
