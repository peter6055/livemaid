import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PreferencesProvider } from "@/lib/preferences/provider";
import { TelemetryProvider } from "@/lib/telemetry/telemetryProvider";
import { getTelemetryConfig } from "@/lib/telemetry/config";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "LiveMaid | The WYSIWYG Mermaid Editor",
  description:
    "A fast, local, and visual WYSIWYG editor for Mermaid.js diagrams. Create, edit, and manage your flowcharts and sequence diagrams with a seamless split-screen experience.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // BASE_URL is runtime config, so the layout must render per request instead
  // of baking the value into a prerendered shell.
  await connection();
  const appBase = (process.env.BASE_URL ?? "").replace(/\/$/, "");
  const appBaseScript = `window.__APP_BASE__=${JSON.stringify(appBase).replace(/</g, "\\u003c")}`;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: appBaseScript }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Preferences load before telemetry: consent flags gate every telemetry call. */}
          <PreferencesProvider>
            <TelemetryProvider config={getTelemetryConfig()}>
              {children}
              <Toaster />
            </TelemetryProvider>
          </PreferencesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
