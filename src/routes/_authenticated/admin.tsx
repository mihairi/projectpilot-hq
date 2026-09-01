import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, Plus, ShieldOff, UserCheck, UserX, QrCode } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { APP_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type AppRole } from "@/lib/roles";
import {
  adminCreateUser,
  adminResetPassword,
  adminResetTwoFactor,
  adminSetAccess,
  adminSetRoles,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "User administration | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Create users, assign or change roles, revoke access for leavers, reset passwords and reissue authenticator 2FA enrolment.",
      },
      { property: "og:title", content: "User administration | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Create users, manage roles, revoke access, reset passwords and 2FA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(
    crypto.getRandomValues(new Uint32Array(16)),
    (n) => chars[n % chars.length],
  ).join("");
}

function AdminPage() {
  const { perms } = useCurrentUser();
  const qc = useQueryClient();
  const createUser = useServerFn(adminCreateUser);
  const setRoles = useServerFn(adminSetRoles);
  const setAccess = useServerFn(adminSetAccess);
  const resetPassword = useServerFn(adminResetPassword);
  const resetTwoFactor = useServerFn(adminResetTwoFactor);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    job_title: "",
    department: "",
    password: randomPassword(),
    roles: ["requester"] as AppRole[],
  });
  const [rolesFor, setRolesFor] = useState<{ id: string; roles: AppRole[]; name: string } | null>(
    null,
  );

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
      }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const create = useMutation({
    mutationFn: () => createUser({ data: form }),
    onSuccess: () => {
      toast.success(`User created. Temporary password: ${form.password}`, { duration: 15000 });
      setOpen(false);
      setForm({
        email: "",
        full_name: "",
        job_title: "",
        department: "",
        password: randomPassword(),
        roles: ["requester"],
      });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRoles = useMutation({
    mutationFn: () => setRoles({ data: { userId: rolesFor!.id, roles: rolesFor!.roles } }),
    onSuccess: () => {
      toast.success("Roles updated");
      setRolesFor(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAccess = useMutation({
    mutationFn: (v: { userId: string; active: boolean }) => setAccess({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.active ? "Access restored" : "Access revoked");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doResetPassword = useMutation({
    mutationFn: async (userId: string) => {
      const password = randomPassword();
      await resetPassword({ data: { userId, password } });
      return password;
    },
    onSuccess: (password) =>
      toast.success(`New temporary password: ${password}`, { duration: 20000 }),
    onError: (e: Error) => toast.error(e.message),
  });

  const doReset2fa = useMutation({
    mutationFn: (userId: string) => resetTwoFactor({ data: { userId } }),
    onSuccess: () =>
      toast.success(
        "2FA reset. The user will be shown a fresh QR code for Microsoft or Google Authenticator at next sign-in.",
        { duration: 10000 },
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!perms.manageUsers) {
    return (
      <p className="text-sm text-muted-foreground">
        User administration is restricted to administrators.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">User administration</h1>
          <p className="text-sm text-muted-foreground">
            Create accounts, assign roles, revoke access for leavers, reset passwords and 2FA.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" /> New user
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                The account is created confirmed. Share the temporary password securely; the user
                sets up their authenticator app at first sign-in.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Username (email)</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Job title</Label>
                <Input
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Temporary password</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForm({ ...form, password: randomPassword() })}
                  >
                    Generate
                  </Button>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Roles</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {APP_ROLES.map((r) => (
                    <label key={r} className="flex items-start gap-2 rounded border p-2 text-sm">
                      <Checkbox
                        checked={form.roles.includes(r)}
                        onCheckedChange={(v) =>
                          setForm({
                            ...form,
                            roles: v ? [...form.roles, r] : form.roles.filter((x) => x !== r),
                          })
                        }
                      />
                      <span>
                        <span className="font-medium">{ROLE_LABELS[r]}</span>
                        <span className="block text-xs text-muted-foreground">
                          {ROLE_DESCRIPTIONS[r]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => create.mutate()}
                disabled={!form.email || !form.full_name || form.roles.length === 0 || create.isPending}
              >
                Create user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(users.data ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {u.department || "—"}
                  {u.job_title && (
                    <div className="text-xs text-muted-foreground">{u.job_title}</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                    {u.roles.length === 0 && (
                      <span className="text-xs text-muted-foreground">none</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {u.is_active ? (
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-destructive/30 text-destructive">
                      Revoked
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRolesFor({ id: u.id, roles: u.roles, name: u.full_name || u.email })
                      }
                    >
                      Roles
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => doResetPassword.mutate(u.id)}
                      title="Reset password"
                    >
                      <KeyRound className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => doReset2fa.mutate(u.id)}
                      title="Reissue 2FA QR code"
                    >
                      <QrCode className="size-4" />
                    </Button>
                    <Button
                      variant={u.is_active ? "outline" : "default"}
                      size="sm"
                      onClick={() => toggleAccess.mutate({ userId: u.id, active: !u.is_active })}
                      title={u.is_active ? "Revoke access" : "Restore access"}
                    >
                      {u.is_active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(users.data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!rolesFor} onOpenChange={(v) => !v && setRolesFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldOff className="size-4" /> Roles for {rolesFor?.name}
            </DialogTitle>
            <DialogDescription>
              Roles decide what the person can see and change across the workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {APP_ROLES.map((r) => (
              <label key={r} className="flex items-start gap-2 rounded border p-2 text-sm">
                <Checkbox
                  checked={rolesFor?.roles.includes(r) ?? false}
                  onCheckedChange={(v) =>
                    setRolesFor((prev) =>
                      prev
                        ? {
                            ...prev,
                            roles: v ? [...prev.roles, r] : prev.roles.filter((x) => x !== r),
                          }
                        : prev,
                    )
                  }
                />
                <span>
                  <span className="font-medium">{ROLE_LABELS[r]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ROLE_DESCRIPTIONS[r]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveRoles.mutate()}
              disabled={!rolesFor?.roles.length || saveRoles.isPending}
            >
              Save roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
