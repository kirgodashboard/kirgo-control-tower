"use client";

import { useState } from "react";
import { UserPlus, Shield, CheckCircle2, AlertCircle, Loader2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useUserRoles, useSaveUserRole } from "@/lib/hooks/use-company";
import {
  ROLE_LABELS, ROLE_COLORS, ROLE_PERMISSIONS,
  type RoleType, type UserRole,
} from "@/types/company";
import { cn } from "@/lib/utils";

const ALL_ROLES: RoleType[] = ["super_admin", "admin", "finance", "operations", "viewer"];

function RoleBadge({ role }: { role: RoleType }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border", ROLE_COLORS[role])}>
      {ROLE_LABELS[role]}
    </span>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const save = useSaveUserRole();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleType>("viewer");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save.mutateAsync({ email, full_name: name, role, is_active: true });
    setDone(true);
    setTimeout(onClose, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-base font-semibold">Invite Team Member</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {done ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-medium">User added</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="team@yourbrand.com"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Alex Kumar"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Role <span className="text-red-400">*</span>
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as RoleType)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              >
                {ALL_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              {role && (
                <ul className="mt-2 space-y-0.5">
                  {ROLE_PERMISSIONS[role].map(p => (
                    <li key={p} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={save.isPending || !email}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Add User
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
            {save.isError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Failed to save
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function UserRow({ user }: { user: UserRole }) {
  const save = useSaveUserRole();

  async function toggleActive() {
    await save.mutateAsync({
      email: user.email,
      full_name: user.full_name ?? "",
      role: user.role,
      is_active: !user.is_active,
    });
  }

  return (
    <tr className="border-b border-border hover:bg-accent/20 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-violet-400">
              {(user.full_name ?? user.email)[0].toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user.full_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <RoleBadge role={user.role as RoleType} />
      </td>
      <td className="py-3 px-4">
        {user.last_seen_at ? (
          <span className="text-xs text-muted-foreground">
            {new Date(user.last_seen_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Never</span>
        )}
      </td>
      <td className="py-3 px-4">
        <button
          onClick={toggleActive}
          disabled={save.isPending}
          className="flex items-center gap-1.5 text-xs transition-colors"
        >
          {user.is_active ? (
            <>
              <ToggleRight className="h-4 w-4 text-emerald-400" />
              <span className="text-emerald-400">Active</span>
            </>
          ) : (
            <>
              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Disabled</span>
            </>
          )}
        </button>
      </td>
    </tr>
  );
}

export default function UsersPage() {
  const { data: users, isLoading } = useUserRoles();
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Users & Roles"
        subtitle="Manage team access and permissions"
      >
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Invite User
        </button>
      </PageHeader>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}

      {/* Users table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Team Members — {users?.length ?? 0}
          </p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">User</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Last Seen</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {users?.map(u => <UserRow key={u.id} user={u} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Permission matrix */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Permission Matrix</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-56">Permission</th>
                {ALL_ROLES.map(r => (
                  <th key={r} className="text-center py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "View dashboards",           roles: ["super_admin","admin","finance","operations","viewer"] },
                { label: "Export data",               roles: ["super_admin","admin","finance"] },
                { label: "Classify expenses",         roles: ["super_admin","admin","finance"] },
                { label: "Manage orders",             roles: ["super_admin","admin","operations"] },
                { label: "Integration config",        roles: ["super_admin","admin"] },
                { label: "Bank feeds & import",       roles: ["super_admin","admin","finance"] },
                { label: "Manage users",              roles: ["super_admin","admin"] },
                { label: "Company settings",          roles: ["super_admin"] },
                { label: "Billing & plan",            roles: ["super_admin"] },
              ].map(row => (
                <tr key={row.label} className="border-b border-border last:border-0 hover:bg-accent/20">
                  <td className="py-2.5 px-4 text-sm text-foreground">{row.label}</td>
                  {ALL_ROLES.map(r => (
                    <td key={r} className="py-2.5 px-3 text-center">
                      {row.roles.includes(r) ? (
                        <span className="text-emerald-400">✓</span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security note */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <Shield className="h-4 w-4 text-violet-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-muted-foreground">
          Role changes take effect immediately. All actions are logged for audit.
          Authentication is handled by Supabase Auth — credentials are never stored in application code.
        </p>
      </div>
    </div>
  );
}
