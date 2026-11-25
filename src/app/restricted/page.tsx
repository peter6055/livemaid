import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export default function RestrictedPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-5">
          <BrandLogo className="w-8 h-8 rounded-lg" />
          <span className="text-base font-semibold tracking-tight">LiveMaid</span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <section className="w-full max-w-[420px] rounded-[20px] border border-[#E6E2F0] bg-white p-10 text-center text-[#14102A] shadow-[0_1px_2px_rgba(26,16,51,0.04),0_12px_32px_rgba(26,16,51,0.06)]">
          <ShieldAlert className="mx-auto h-10 w-10 text-[#5B2FD0]" aria-hidden="true" />
          <h1 className="mt-5 text-[26px] leading-[1.2] font-bold tracking-[-0.02em]">
            Access restricted
          </h1>
          <p className="mt-3 text-[15px] leading-normal text-[#585270]">
            You do not have access to this page, or it no longer exists. Ask a workspace admin to
            grant you access.
          </p>
          <Link
            href="/"
            className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-[#5B2FD0] px-6 text-sm font-semibold text-white hover:bg-[#4A25B0]"
          >
            Back to LiveMaid
          </Link>
        </section>
      </main>
    </div>
  );
}
