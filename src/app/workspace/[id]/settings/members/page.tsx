"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Member = {
  _id: string;
  userId?: string | null;
  invitedEmail?: string | null;
  role: "admin" | "member";
};

async function fetchSessionUser(): Promise<{ id?: string } | null> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { id?: string } };
    return data.user ?? null;
  } catch {
    return null;
  }
}

export default function WorkspaceMembersPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isAdmin = members.some((m) => m.userId === currentUserId && m.role === "admin");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, user] = await Promise.all([
        fetch(`/api/workspace/${workspaceId}/members`),
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
      const res = await fetch(`/api/workspace/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Failed to invite member");
      }
      toast.success("Member invited");
      setEmail("");
      setRole("member");
      await loadMembers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite member");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!isAdmin) return;
    setRemovingId(memberId);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/members/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove member");
      toast.success("Member removed");
      await loadMembers();
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <main className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Member management</h1>

      {isAdmin && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Invite member</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label htmlFor="invite-email" className="text-sm font-medium">
                  Email
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
              <div className="w-full sm:w-32">
                <label htmlFor="invite-role" className="text-sm font-medium">
                  Role
                </label>
                <Select value={role} onValueChange={(v) => setRole(v as "member" | "admin")}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviting || !email.trim()}>
                Invite
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading members...</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members found.</p>
          ) : (
            <ul className="space-y-3">
              {members.map((member) => (
                <li
                  key={member._id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {member.invitedEmail || member.userId || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={removingId === member._id}
                      onClick={() => handleRemove(member._id)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
