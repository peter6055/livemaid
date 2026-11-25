"use client";

import { useState } from "react";
import { SessionProvider, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { appUrl } from "@/lib/api/url";

const authBasePath = appUrl("/api/auth");
const callbackUrl = appUrl("/");

function SignInButtonInner() {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void signIn("oidc", { callbackUrl }).catch(() => setLoading(false));
      }}
      className="h-[52px] w-full justify-center gap-2.5 rounded-xl border-0 bg-[#5B2FD0] text-base font-semibold text-white hover:bg-[#4A25B0] focus-visible:ring-[#B9A2FF]/50"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
      {loading ? "Signing in…" : "Sign in with SSO"}
    </Button>
  );
}

export function SignInButton() {
  return (
    <SessionProvider basePath={authBasePath} refetchInterval={0} refetchWhenOffline={false}>
      <SignInButtonInner />
    </SessionProvider>
  );
}
