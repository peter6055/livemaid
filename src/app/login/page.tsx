import { isAuthEnabled } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { AlertCircle } from "lucide-react";
import { SignInButton } from "./SignInButton";
import { connection } from "next/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; reason?: string | string[] }>;
}) {
  await connection();
  const authEnabled = await isAuthEnabled();
  const { error, reason } = await searchParams;
  const accessDenied = error === "AccessDenied";
  const sessionExpired = reason === "expired";

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#14102A] lg:flex-row">
      {/* Brand panel */}
      <aside className="relative flex flex-1 flex-col justify-between gap-12 bg-[#1A1033] px-10 py-12 text-[#F4F0FF] lg:min-h-screen lg:px-14 lg:py-12">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-10 w-10 rounded-[11px]" />
          <span className="text-xl font-semibold tracking-tight">LiveMaid</span>
        </div>

        <div className="flex flex-col gap-10">
          {/* Flow illustration */}
          <div
            className="mx-auto flex w-full max-w-[360px] flex-col items-center"
            aria-hidden="true"
          >
            <div className="rounded-xl border border-[#5A44A0] bg-[#2A1B52] px-7 py-3 text-sm font-medium text-[#EDE8FF]">
              Draft
            </div>
            <div className="h-7 w-0.5 bg-[#5A44A0]" />
            <div className="rounded-xl border border-[#5B2FD0] bg-[#5B2FD0] px-7 py-3 text-sm font-semibold text-white">
              Review together
            </div>
            <div className="h-4 w-0.5 bg-[#5A44A0]" />
            <div className="h-0.5 w-[200px] bg-[#5A44A0]" />
            <div className="flex w-[200px] justify-between">
              <div className="h-4 w-0.5 bg-[#5A44A0]" />
              <div className="h-4 w-0.5 bg-[#5A44A0]" />
            </div>
            <div className="flex w-[280px] justify-between">
              <div className="rounded-xl border border-[#5A44A0] bg-[#2A1B52] px-6 py-3 text-sm font-medium text-[#EDE8FF]">
                Share
              </div>
              <div className="rounded-xl border border-[#5A44A0] bg-[#2A1B52] px-6 py-3 text-sm font-medium text-[#EDE8FF]">
                Revise
              </div>
            </div>
          </div>

          <div className="flex max-w-[440px] flex-col gap-3">
            <h2 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
              Diagrams, live in your workspace.
            </h2>
            <p className="text-base leading-relaxed text-[#CFC5EE]">
              Draft, edit and share diagrams with your team in one place.
            </p>
          </div>
        </div>

        <div className="text-[13px] text-[#B8ABDD]">© LiveMaid</div>
      </aside>

      {/* Sign-in panel */}
      <main
        className="relative flex flex-1 flex-col justify-center px-8 py-12 lg:min-h-screen lg:px-8"
        style={{
          backgroundColor: "#FFFFFF",
          backgroundImage:
            "linear-gradient(#F3F1F8 1px, transparent 1px), linear-gradient(90deg, #F3F1F8 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        <section className="mx-auto w-full max-w-[400px] rounded-[20px] border border-[#E6E2F0] bg-white p-10 shadow-[0_1px_2px_rgba(26,16,51,0.04),0_12px_32px_rgba(26,16,51,0.06)]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-[28px] leading-[1.2] font-bold tracking-[-0.02em]">
                Sign in to LiveMaid
              </h1>
              <p className="text-[15px] leading-normal text-[#585270]">
                Continue to your workspace.
              </p>
            </div>

            {sessionExpired && (
              <div className="flex items-start gap-3 rounded-xl border border-[#B9A2FF]/60 bg-[#F4F0FF] px-4 py-3 text-sm text-[#3A2D6B]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Your session has expired. Please sign in again.</p>
              </div>
            )}

            {accessDenied && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  You are not a member of this workspace. Ask an admin to invite your email address,
                  then sign in again.
                </p>
              </div>
            )}

            {authEnabled ? (
              <SignInButton />
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  SSO is not configured. Set WORKSPACES_ENABLED, MONGODB_URI, and AUTH_OIDC_* in the
                  environment.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
