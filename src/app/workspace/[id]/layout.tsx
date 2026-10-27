import { auth, signOut, isAuthEnabled } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: workspaceId } = await params;
  // workspaceId will be used by the workspace shell in Task #51.
  void workspaceId;
  const isDemo = isDemoMode();
  const authEnabled = isAuthEnabled();

  if (!isDemo && authEnabled) {
    const session = await auth();
    if (!session) {
      redirect("/login");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold">LiveMaid</span>
          <span className="text-sm text-muted-foreground">Workspace</span>
        </div>
        {!isDemo && authEnabled && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        )}
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
