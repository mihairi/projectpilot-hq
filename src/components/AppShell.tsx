import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  FolderKanban,
  Gauge,

  LayoutDashboard,
  LogOut,
  BarChart3,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portal", label: "My portal", icon: UserRound },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/kb", label: "Knowledge base", icon: BookOpen },
] as const;


function Notifications() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
  const unread = (data ?? []).filter((n) => !n.is_read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              className="text-xs text-primary hover:underline"
              onClick={async () => {
                await supabase
                  .from("notifications")
                  .update({ is_read: true })
                  .eq("is_read", false);
                qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >
              Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {(data ?? []).length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          )}
          {(data ?? []).map((n) => (
            <div
              key={n.id}
              className={cn(
                "border-t px-3 py-2 text-sm",
                !n.is_read && "bg-accent/40",
              )}
            >
              <p className="font-medium">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, roles, perms } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ")
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="flex size-7 items-center justify-center rounded bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
            AX
          </div>
          <span className="text-sm font-semibold tracking-tight">Atlas Enterprise</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
                pathname.startsWith(item.to) && "bg-sidebar-accent font-medium",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
          {perms.report && (
            <Link
              to="/manager"
              className={cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
                pathname.startsWith("/manager") && "bg-sidebar-accent font-medium",
              )}
            >
              <Gauge className="size-4" />
              Manager view
            </Link>
          )}
          {perms.manageUsers && (
            <Link
              to="/admin"
              className={cn(
                "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
                pathname.startsWith("/admin") && "bg-sidebar-accent font-medium",
              )}
            >
              <Users className="size-4" />
              User administration
            </Link>
          )}

          <Link
            to="/security"
            className={cn(
              "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
              pathname.startsWith("/security") && "bg-sidebar-accent font-medium",
            )}
          >
            <ShieldCheck className="size-4" />
            Security &amp; 2FA
          </Link>
        </nav>
        <div className="border-t border-sidebar-border p-3 text-[11px] text-sidebar-foreground/70">
          {roles.map((r) => ROLE_LABELS[r]).join(" · ") || "No role assigned"}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex size-7 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
              AX
            </div>
            <span className="text-sm font-semibold">Atlas</span>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            Project, task &amp; knowledge management
          </div>
          <div className="flex items-center gap-1">
            <Notifications />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm">{profile?.full_name}</div>
                  <div className="text-xs font-normal text-muted-foreground">{profile?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/security" })}>
                  <ShieldCheck className="mr-2 size-4" /> Security &amp; 2FA
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
