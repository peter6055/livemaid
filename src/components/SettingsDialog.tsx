"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useTelemetry } from "@/lib/telemetry/telemetryProvider";
import { getDisplayVersion, getRawVersion } from "@/lib/env";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sun, Lock, Info, Palette, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const categories = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "about", label: "About", icon: Info },
] as const;

type CategoryId = (typeof categories)[number]["id"];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`w-8 h-4 rounded-full transition-colors flex items-center relative focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${enabled ? "bg-indigo-500" : "bg-slate-300"}`}
    >
      <div
        className={`w-3 h-3 bg-white rounded-full transition-transform absolute ${enabled ? "left-4" : "left-1"}`}
      />
    </button>
  );
}

function AppearancePanel() {
  const { setTheme, theme } = useTheme();
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Theme</h3>
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-3">
            <Sun className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">Colour mode</span>
          </div>
          <Select value={theme} onValueChange={(v) => v && setTheme(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function PrivacyPanel() {
  const { usageAnalytics, debugReporting, setUsageAnalytics, setDebugReporting } = useTelemetry();

  const handleUsageToggle = (v: boolean) => {
    setUsageAnalytics(v);
    toast.success(v ? "Usage data collection enabled" : "Usage data collection disabled");
  };

  const handleDebugToggle = (v: boolean) => {
    setDebugReporting(v);
    toast.success(v ? "Debug data collection enabled" : "Debug data collection disabled");
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Data Collection</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex-1 mr-4">
              <div className="text-sm font-medium">Usage Data</div>
              <div className="text-xs text-muted-foreground mt-1">
                Anonymous feature usage and interaction patterns. No diagram content.
              </div>
            </div>
            <Toggle enabled={usageAnalytics} onChange={handleUsageToggle} />
          </div>
          <div className="flex items-start justify-between p-4 rounded-lg bg-red-500/3 border border-red-500/50">
            <div className="flex-1 mr-4">
              <div className="text-sm font-medium">Debug Data</div>
              <div className="text-xs text-muted-foreground mt-1">
                Error reports and parse failures. May contain code snippets.
              </div>
              <div className="flex items-start gap-2 mt-2.5">
                <div className="w-1 h-1 rounded-full bg-red-500 mt-1.5 shrink-0" />
                <p className="text-xs text-red-600 dark:text-red-400">
                  Error messages may include fragments of your diagram code. Only enable if you are
                  comfortable sharing this data.
                </p>
              </div>
            </div>
            <Toggle enabled={debugReporting} onChange={handleDebugToggle} />
          </div>

          <a
            href="https://github.com/peter6055/livemaid/blob/main/COLLECTION_NOTICE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors pt-2"
          >
            View full collection notice
          </a>
        </div>
      </div>
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Application</h3>
        <div className="p-4 rounded-lg bg-muted/50 border border-border flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Version</span>
          <span className="font-mono text-xs text-foreground">{getDisplayVersion()}</span>
        </div>
        <a
          href={`https://github.com/peter6055/livemaid/releases/tag/v${getRawVersion()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
        >
          View Changelogs
        </a>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Project</h3>
        <a
          href="https://github.com/peter6055/livemaid"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border text-sm hover:bg-accent/50 transition-colors"
        >
          <span className="flex items-center gap-2.5 text-foreground font-medium">
            <ExternalLink className="w-4 h-4" />
            GitHub
          </span>
          <span className="text-muted-foreground text-xs">peter6055/livemaid</span>
        </a>
      </div>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("appearance");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex h-[640px]">
          {/* Sidebar */}
          <div className="w-56 shrink-0 border-r border-border flex flex-col bg-muted/20">
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
              {categories.map((cat) => {
                const Icon = cat.icon;
                const isActive = cat.id === activeCategory;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    data-active={isActive}
                    className="relative flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-left transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-indigo-500" />
                    )}
                    <Icon className="w-4 h-4 shrink-0" />
                    {cat.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeCategory === "appearance" && <AppearancePanel />}
            {activeCategory === "privacy" && <PrivacyPanel />}
            {activeCategory === "about" && <AboutPanel />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
