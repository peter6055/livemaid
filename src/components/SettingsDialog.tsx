"use client";

import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { AuthToggleForm } from "@/components/settings/AuthToggleForm";
import type { Session } from "@/lib/auth";
import {
  User,
  Settings,
  Briefcase,
  Shield,
  Palette,
  Lock,
  Info,
  Users,
  ExternalLink,
  Loader2,
} from "lucide-react";
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

function AppearanceSection() {
  const { setTheme, theme } = useTheme();
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
        <span className="text-sm font-medium">Colour mode</span>
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
  );
}

function PrivacySection() {
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
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Data Collection</h3>
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
          href="https://peter6055.github.io/livemaid/docs/project/collection-notice"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors pt-2"
        >
          View full collection notice
        </a>
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">About</h3>
      <div className="p-4 rounded-lg bg-muted/50 border border-border flex justify-between items-center text-sm">
        <span className="text-sm font-medium text-foreground">Version</span>
        <span className="font-mono text-xs text-foreground">{getDisplayVersion()}</span>
      </div>
      <a
        href={`https://github.com/peter6055/livemaid/releases/tag/v${getRawVersion()}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
      >
        View Changelogs
      </a>
    </div>
  );
}

function ProfilePanel({ session }: { session?: Session | null }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Profile</h3>
        {session?.user ? (
          <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-2">
            {session.user.name && (
              <p className="text-sm">
                <span className="text-muted-foreground">Name:</span> {session.user.name}
              </p>
            )}
            {session.user.email && (
              <p className="text-sm">
                <span className="text-muted-foreground">Email:</span> {session.user.email}
              </p>
            )}
            {session.user.role && (
              <p className="text-sm capitalize">
                <span className="text-muted-foreground">Role:</span> {session.user.role}
              </p>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
            Account creation and profile settings will be available here in the future.
          </div>
        )}
      </div>
    </div>
  );
}

function PreferencesPanel() {
  return (
    <div className="space-y-8">
      <AppearanceSection />
      <PrivacySection />
      <AboutSection />
    </div>
  );
}

function WorkspaceEmptyPanel() {
  return (
    <div className="space-y-8">
      <div className="p-4 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
        No workspace is active. Workspace settings appear when auth and workspaces are enabled.
      </div>
    </div>
  );
}

function WorkspaceGeneralPanel({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">General</h3>
        <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Workspace ID:</span>{" "}
            <span className="font-mono">{workspaceId}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function WorkspaceMembersPanel({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Members</h3>
        <a
          href={`/workspace/${workspaceId}/settings/members`}
          className="inline-flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
        >
          <Users className="w-4 h-4" />
          Manage members
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

function AdminPanel() {
  const [status, setStatus] = useState<{
    authFlagEnabled: boolean;
    oidcConfigured: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/auth-toggle")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load auth status");
        const data = await res.json();
        if (!cancelled) setStatus(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Authentication</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading auth status...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : status ? (
          <AuthToggleForm
            authEnabled={status.authFlagEnabled}
            oidcConfigured={status.oidcConfigured}
          />
        ) : null}
      </div>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  session,
  showAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string;
  session?: Session | null;
  showAdmin: boolean;
}) {
  const groups: SidebarGroup[] = [
    {
      label: "Account",
      items: [
        { id: "profile", label: "Profile", icon: User },
        { id: "preferences", label: "Preferences", icon: Settings },
      ],
    },
    {
      label: "Workspace",
      items: [
        { id: "workspace-general", label: "General", icon: Briefcase },
        { id: "workspace-members", label: "Members", icon: Users },
      ],
    },
  ];

  if (showAdmin) {
    groups.push({
      label: "Admin",
      items: [{ id: "admin-auth", label: "Authentication", icon: Shield }],
    });
  }

  const [activeItem, setActiveItem] = useState("profile");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex h-[640px]">
          {/* Sidebar */}
          <div className="w-56 shrink-0 border-r border-border flex flex-col bg-muted/20">
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.id === activeItem;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveItem(item.id)}
                          data-active={isActive}
                          className="relative flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-left transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
                          )}
                          <Icon className="w-4 h-4 shrink-0" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeItem === "profile" && <ProfilePanel session={session} />}
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
            {activeItem === "admin-auth" && showAdmin && <AdminPanel />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
