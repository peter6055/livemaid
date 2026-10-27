import { signIn, isAuthEnabled } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const authEnabled = isAuthEnabled();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-foreground">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">LiveMaid</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
      </div>

      {authEnabled ? (
        <form
          action={async () => {
            "use server";
            await signIn("oidc", { callbackUrl: "/" });
          }}
        >
          <Button type="submit" className="bg-[#7a3dff] hover:bg-[#6b33e6] text-white">
            Sign in with SSO
          </Button>
        </form>
      ) : (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          SSO is not configured. Please set the OIDC environment variables.
        </div>
      )}
    </main>
  );
}
