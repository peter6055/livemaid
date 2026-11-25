"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { appUrl } from "@/lib/api/url";
import { apiFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

type Member = {
  _id: string;
  userId?: string | null;
  invitedEmail?: string | null;
  role: "admin" | "member";
  status: "active" | "pending";
  email: string | null;
  active: boolean;
};

async function fetchSessionUser(): Promise<{ id?: string } | null> {
  try {
    const res = await apiFetch(appUrl("/api/auth/session"), { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { id?: string } };
    return data.user ?? null;
  } catch {
    return null;
  }
}

function memberLabel(member: Member): string {
  return member.email || member.invitedEmail || "Unknown";
}

function memberInitials(member: Member): string {
  return memberLabel(member)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function WorkspaceMembersManager({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const isAdmin = members.some((m) => m.userId === currentUserId && m.role === "admin");

  const query = search.trim().toLowerCase();
  const filteredMembers = useMemo(
    () =>
      query
        ? members.filter((member) => memberLabel(member).toLowerCase().includes(query))
        : members,
    [members, query],
  );
  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleMembers = filteredMembers.slice(pageStart, pageStart + pageSize);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, user] = await Promise.all([
        apiFetch(appUrl(`/api/workspace/${workspaceId}/members`)),
        fetchSessionUser(),
      ]);
      if (user?.id) setCurrentUserId(user.id);
      if (membersRes.ok) {
        const data = (await membersRes.json()) as Member[];
        setMembers(data);
      } else {
        toast.error("Failed to load members");
      }
    } catch {
      toast.error("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !isAdmin) return;
    setInviting(true);
    try {
      const res = await apiFetch(appUrl(`/api/workspace/${workspaceId}/members`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error || "Failed to invite");
        return;
      }
      setEmail("");
      setRole("member");
      toast.success("Invite sent");
      await loadMembers();
    } catch {
      toast.error("Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!isAdmin) return;
    setRemovingId(memberId);
    try {
      const res = await apiFetch(appUrl(`/api/workspace/${workspaceId}/members/${memberId}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error || "Failed to remove member");
        return;
      }
      toast.success("Member removed");
      await loadMembers();
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  const handleToggleActive = async (member: Member, nextActive: boolean) => {
    if (!isAdmin || !member.userId || member.role === "admin") return;
    setTogglingId(member._id);
    try {
      const res = await apiFetch(appUrl(`/api/workspace/${workspaceId}/members/${member._id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(err?.error || "Failed to update member");
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m._id === member._id ? { ...m, active: nextActive } : m)),
      );
      toast.success(nextActive ? "Member activated" : "Member deactivated");
    } catch {
      toast.error("Failed to update member");
    } finally {
      setTogglingId(null);
    }
  };

  const pendingCount = members.filter((member) => member.status === "pending").length;

  return (
    <section className="space-y-4" aria-label="Workspace members">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {query
              ? `${filteredMembers.length} of ${members.length} members`
              : `${members.length} members`}
          </span>
          {pendingCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                {pendingCount} pending
              </Badge>
            </>
          )}
        </div>
        {!isAdmin && !loading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            View only
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {isAdmin ? (
            <form
              id="invite-member-form"
              onSubmit={handleInvite}
              className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_auto]"
            >
              <div>
                <label htmlFor="invite-email" className="sr-only">
                  Email address
                </label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="invite-role" className="sr-only">
                  Role
                </label>
                <Select value={role} onValueChange={(v) => setRole(v as "member" | "admin")}>
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue>
                      {(value) => <span className="capitalize">{String(value)}</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={inviting || !email.trim()}
                className="bg-indigo-600 px-3 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                <UserPlus className="size-3.5" aria-hidden="true" />
                {inviting ? "Inviting…" : "Invite member"}
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
              Only workspace admins can manage members.
            </div>
          )}

          {members.length > 0 && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search members"
                aria-label="Search members"
                className="pr-9 pl-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <div className="space-y-2">
            {members.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No members yet.
              </div>
            ) : visibleMembers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No members match &ldquo;{search.trim()}&rdquo;.
              </div>
            ) : (
              visibleMembers.map((member) => {
                const label = memberLabel(member);
                const canToggle = isAdmin && !!member.userId && member.role !== "admin";
                const canRemove = isAdmin && member.role !== "admin";
                return (
                  <div
                    key={member._id}
                    data-testid="member-row"
                    className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary ring-1 ring-primary/15"
                      aria-hidden="true"
                    >
                      {memberInitials(member)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{label}</span>
                        {member.status === "pending" && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                            Pending
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="capitalize">{member.role}</span>
                        {member.role === "admin" && (
                          <>
                            <span aria-hidden="true">·</span>
                            <Lock className="size-3" aria-hidden="true" />
                            <span>Protected</span>
                          </>
                        )}
                        {member.status === "active" && member.role !== "admin" && (
                          <span className="sm:hidden">
                            · {member.active ? "Active" : "Inactive"}
                          </span>
                        )}
                      </div>
                    </div>

                    {isAdmin && member.role !== "admin" && (
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {member.status === "pending"
                            ? "Pending"
                            : member.active
                              ? "Active"
                              : "Inactive"}
                        </span>
                        <Switch
                          checked={member.status === "active" && member.active}
                          disabled={!canToggle || togglingId === member._id}
                          onCheckedChange={(checked) => handleToggleActive(member, checked)}
                          aria-busy={togglingId === member._id}
                          aria-label={
                            member.status === "pending"
                              ? `${label} is pending acceptance`
                              : `Active status for ${label}`
                          }
                        />
                        {togglingId === member._id && (
                          <Loader2
                            data-slot="member-toggle-spinner"
                            className="size-3.5 animate-spin text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    )}

                    {canRemove && (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${label}`}
                              aria-busy={removingId === member._id}
                              disabled={removingId === member._id}
                              className="text-muted-foreground hover:text-destructive"
                            />
                          }
                        >
                          {removingId === member._id ? (
                            <Loader2
                              data-slot="member-remove-spinner"
                              className="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          )}
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove member?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes {label} from the workspace. Pending invites are deleted.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={removingId === member._id}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              aria-busy={removingId === member._id}
                              disabled={removingId === member._id}
                              onClick={() => handleRemove(member._id)}
                            >
                              {removingId === member._id && (
                                <Loader2
                                  data-slot="member-remove-spinner"
                                  className="size-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              {removingId === member._id ? "Removing…" : "Remove"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {members.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span id="members-page-size-label">Members per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    aria-labelledby="members-page-size-label"
                    className="w-[4.5rem]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span aria-live="polite">
                  {filteredMembers.length === 0
                    ? "Showing 0 of 0"
                    : `Showing ${pageStart + 1}–${pageStart + visibleMembers.length} of ${filteredMembers.length}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <span>
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
