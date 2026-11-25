"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useTelemetry } from "@/lib/telemetry/telemetryProvider";
import { usePreferences } from "@/lib/preferences/provider";
import { getDisplayVersion, getRawVersion } from "@/lib/env";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { WorkspaceMembersManager } from "@/components/WorkspaceMembersManager";
import { Settings, Briefcase, Users, Copy, Check } from "lucide-react";
import { toast } from "sonner";

type SidebarItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SidebarGroup = {
  label: string;
  items: SidebarItem[];
};

const pageDetails: Record<string, { title: string; subtitle: string }> = {
  preferences: {
    title: "Preferences",
    subtitle: "Personalize LiveMaid and control the data you share.",
  },
  "workspace-general": {
    title: "General",
    subtitle: "View the details used to identify this workspace.",
  },
  "workspace-members": {
    title: "Members",
    subtitle: "Manage who can access this workspace and their roles.",
  },
};

function AppearanceSection() {
  const { setTheme, theme } = useTheme();
  const { update } = usePreferences();

  return (
    <section className="space-y-3" aria-labelledby="appearance-heading">
      <h3 id="appearance-heading" className="text-sm font-semibold text-foreground">
        Appearance
      </h3>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Colour mode</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Choose how LiveMaid looks.</p>
        </div>
        <fieldset className="inline-flex w-fit rounded-lg border border-border bg-background p-0.5">
          <legend className="sr-only">Colour mode</legend>
          {[
            ["system", "System"],
            ["light", "Light"],
            ["dark", "Dark"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="relative cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-primary/10 has-checked:text-primary"
            >
              <input
                type="radio"
                name="settings-theme"
                value={value}
                checked={theme === value}
                onChange={() => {
                  setTheme(value);
                  update("theme", value as "system" | "light" | "dark");
                }}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
    </section>
  );
}

function PrivacySection() {
  const { usageAnalytics, debugReporting, setUsageAnalytics, setDebugReporting } = useTelemetry();

  const handleUsageToggle = (value: boolean) => {
    setUsageAnalytics(value);
    toast.success(value ? "Usage data collection enabled" : "Usage data collection disabled");
  };

  const handleDebugToggle = (value: boolean) => {
    setDebugReporting(value);
    toast.success(value ? "Debug data collection enabled" : "Debug data collection disabled");
  };

  return (
    <section className="space-y-3" aria-labelledby="data-collection-heading">
      <h3 id="data-collection-heading" className="text-sm font-semibold text-foreground">
        Data collection
      </h3>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
        <div className="flex items-center justify-between gap-4 p-3">
          <div className="min-w-0">
            <label htmlFor="usage-data" className="text-sm font-medium">
              Usage data
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Anonymous feature usage and interactions. No diagram content.
            </p>
          </div>
          <Switch
            id="usage-data"
            checked={usageAnalytics}
            onCheckedChange={handleUsageToggle}
            aria-label="Collect usage data"
          />
        </div>
        <div className="flex items-start justify-between gap-4 border-t border-border p-3">
          <div className="min-w-0">
            <label htmlFor="debug-data" className="text-sm font-medium">
              Debug data
            </label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Error reports and parse failures. May contain code snippets.
            </p>
            <p className="mt-2 text-xs text-destructive">
              Error messages may include fragments of diagram code. Only enable if you are
              comfortable sharing this data.
            </p>
          </div>
          <Switch
            id="debug-data"
            checked={debugReporting}
            onCheckedChange={handleDebugToggle}
            aria-label="Collect debug data"
          />
        </div>
      </div>
      <a
        href="https://peter6055.github.io/livemaid/project/collection-notice"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
      >
        View full collection notice
      </a>
    </section>
  );
}

function AboutSection() {
  return (
    <section className="space-y-3" aria-labelledby="about-heading">
      <h3 id="about-heading" className="text-sm font-semibold text-foreground">
        About
      </h3>
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
        <span className="text-sm font-medium">Version</span>
        <span className="font-mono text-xs text-muted-foreground">{getDisplayVersion()}</span>
      </div>
      <a
        href={`https://github.com/peter6055/livemaid/releases/tag/v${getRawVersion()}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
      >
        View Changelog
      </a>
    </section>
  );
}

function PreferencesPanel() {
  return (
    <div className="space-y-5">
      <AppearanceSection />
      <PrivacySection />
      <AboutSection />
    </div>
  );
}

function WorkspaceEmptyPanel() {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
      No workspace is active. Workspace settings appear when auth and workspaces are enabled.
    </div>
  );
}

function WorkspaceGeneralPanel({ workspaceId }: { workspaceId: string }) {
  const [copied, setCopied] = useState(false);

  const copyWorkspaceId = async () => {
    try {
      await navigator.clipboard.writeText(workspaceId);
      setCopied(true);
      toast.success("Workspace ID copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy workspace ID");
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="workspace-details-heading">
      <h3 id="workspace-details-heading" className="text-sm font-semibold text-foreground">
        Workspace details
      </h3>
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="workspace-id" className="text-sm font-medium">
            Workspace ID
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={copyWorkspaceId}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <input
          id="workspace-id"
          readOnly
          value={workspaceId}
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          This ID uniquely identifies the active workspace.
        </p>
      </div>
    </section>
  );
}

function WorkspaceMembersPanel({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceMembersManager workspaceId={workspaceId} />;
}

export function SettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  isAdmin = false,
  defaultTab = "preferences",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
  isAdmin?: boolean;
  defaultTab?: string;
}) {
  const groups: SidebarGroup[] = [
    {
      label: "User",
      items: [{ id: "preferences", label: "Preferences", icon: Settings }],
    },
  ];

  // Workspace settings (general details + members) are admin-only.
  if (workspaceId && isAdmin) {
    groups.push({
      label: "Workspace",
      items: [
        { id: "workspace-general", label: "General", icon: Briefcase },
        { id: "workspace-members", label: "Members", icon: Users },
      ],
    });
  }

  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const activeItem = open && selectedItem === null ? defaultTab : (selectedItem ?? defaultTab);

  const activePage = pageDetails[activeItem] ?? pageDetails.preferences;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setSelectedItem(null);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] p-0 gap-0 overflow-hidden sm:max-w-[920px]">
        <DialogHeader className="border-b border-border px-4 pt-4 pb-3 sm:px-5">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex h-[600px] max-h-[calc(100dvh-5rem)] min-h-0 flex-col sm:flex-row">
          <aside className="shrink-0 border-b border-border bg-muted/20 sm:w-48 sm:border-r sm:border-b-0">
            <nav
              className="flex gap-4 overflow-x-auto px-3 py-3 sm:flex-col sm:gap-5 sm:py-4"
              aria-label="Settings sections"
            >
              {groups.map((group) => (
                <div key={group.label} className="flex shrink-0 items-center gap-1 sm:block">
                  <div className="hidden px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:block">
                    {group.label}
                  </div>
                  <div className="flex gap-1 sm:flex-col sm:gap-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.id === activeItem;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedItem(item.id)}
                          data-active={isActive}
                          aria-current={isActive ? "page" : undefined}
                          className="relative flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary sm:block" />
                          )}
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <header className="mb-5">
              <h2 className="text-lg font-semibold text-foreground">{activePage.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{activePage.subtitle}</p>
            </header>
            {activeItem === "preferences" && <PreferencesPanel />}
            {activeItem === "workspace-general" &&
              (workspaceId ? (
                <WorkspaceGeneralPanel workspaceId={workspaceId} />
              ) : (
                <WorkspaceEmptyPanel />
              ))}
            {activeItem === "workspace-members" &&
              (workspaceId ? (
                <WorkspaceMembersPanel workspaceId={workspaceId} />
              ) : (
                <WorkspaceEmptyPanel />
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
