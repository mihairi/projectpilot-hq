import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { PRIORITY_CLASS, PRIORITY_LABELS } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/manager")({
  head: () => ({
    meta: [
      { title: "Manager view | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Portfolio deadlines, schedule slip, global priority management and per-person resource allocation for project and business managers.",
      },
      { property: "og:title", content: "Manager view | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Deadlines, priorities and resource allocation across the whole portfolio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ManagerView,
});

const DAY = 86400000;

const daysBetween = (a?: string | null, b?: string | null) =>
  a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY) : null;

const daysFromToday = (d?: string | null) => {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(d).getTime() - today.getTime()) / DAY);
};

type ProjectRow = {
  id: string;
  key: string;
  name: string;
  priority: number;
  status: string;
  owner_id: string | null;
  target_end_date: string | null;
};

function ManagerView() {
  const { perms } = useCurrentUser();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["manager-view"],
    queryFn: async () => {
      const [projects, tasks, members, profiles] = await Promise.all([
        supabase.from("projects").select("*").order("priority"),
        supabase.from("tasks").select("*"),
        supabase.from("project_members").select("*, projects(key,name)"),
        supabase.from("profiles").select("id,full_name,email,job_title"),
      ]);
      return {
        projects: (projects.data ?? []) as ProjectRow[],
        tasks: tasks.data ?? [],
        members: members.data ?? [],
        profiles: profiles.data ?? [],
      };
    },
  });

  const setPriority = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: number }) => {
      const { error } = await supabase.from("projects").update({ priority }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Priority updated — project members have been notified.");
      qc.invalidateQueries({ queryKey: ["manager-view"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update priority."),
  });

  const portfolio = useMemo(() => {
    return (data?.projects ?? []).map((p) => {
      const list = (data?.tasks ?? []).filter((t: any) => t.project_id === p.id);
      const done = list.filter((t: any) => t.status === "done").length;
      const slips = list
        .map((t: any) => daysBetween(t.upd_end_date ?? t.est_end_date, t.real_end_date))
        .filter((n): n is number => n != null && n > 0);
      const overdue = list.filter((t: any) => {
        const due = t.upd_end_date ?? t.est_end_date;
        const d = daysFromToday(due);
        return t.status !== "done" && d != null && d < 0;
      }).length;
      return {
        ...p,
        total: list.length,
        done,
        pct: list.length ? Math.round((done / list.length) * 100) : 0,
        worstSlip: slips.length ? Math.max(...slips) : null,
        overdue,
        toDeadline: daysFromToday(p.target_end_date),
      };
    });
  }, [data]);

  const allocation = useMemo(() => {
    const names = new Map(
      (data?.profiles ?? []).map((p: any) => [p.id, p.full_name || p.email] as const),
    );
    const map = new Map<string, { name: string; total: number; lines: string[] }>();
    for (const m of (data?.members ?? []) as any[]) {
      const entry = map.get(m.user_id) ?? {
        name: names.get(m.user_id) ?? "Unknown user",
        total: 0,
        lines: [] as string[],
      };
      entry.total += m.allocation_pct;
      entry.lines.push(`${m.projects?.key ?? "?"} ${m.allocation_pct}%`);
      map.set(m.user_id, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [data]);

  if (!perms.report) {
    return (
      <p className="text-sm text-muted-foreground">
        The manager view is available to project managers, business managers, global project
        managers and administrators.
      </p>
    );
  }

  const overAllocated = allocation.filter((a) => a.total > 100).length;
  const atRisk = portfolio.filter((p) => p.overdue > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Manager view</h1>
        <p className="text-sm text-muted-foreground">
          Deadlines, slip, global priorities and resource allocation across the portfolio.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Projects", value: portfolio.length },
          { label: "Projects with overdue work", value: atRisk },
          { label: "People allocated", value: allocation.length },
          { label: "Over-allocated people", value: overAllocated },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-3xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portfolio deadlines &amp; slip</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Target end</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Overdue tasks</TableHead>
                <TableHead>Worst slip</TableHead>
                <TableHead>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{p.key}</span> {p.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={PRIORITY_CLASS[p.priority]}>
                      {PRIORITY_LABELS[p.priority]}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{p.status.replace("_", " ")}</TableCell>
                  <TableCell>{p.target_end_date ?? "—"}</TableCell>
                  <TableCell>
                    {p.toDeadline == null ? (
                      "—"
                    ) : p.toDeadline < 0 ? (
                      <span className="font-semibold text-destructive">
                        {Math.abs(p.toDeadline)}d overdue
                      </span>
                    ) : p.toDeadline <= 14 ? (
                      <span className="font-medium text-warning">in {p.toDeadline}d</span>
                    ) : (
                      <span className="text-muted-foreground">in {p.toDeadline}d</span>
                    )}
                  </TableCell>
                  <TableCell className={p.overdue > 0 ? "font-semibold text-destructive" : ""}>
                    {p.overdue}
                  </TableCell>
                  <TableCell className={p.worstSlip ? "font-semibold text-destructive" : ""}>
                    {p.worstSlip != null ? `${p.worstSlip}d` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${p.pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {p.done}/{p.total}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {portfolio.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No projects yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Global priorities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!perms.setGlobalPriority && (
              <p className="text-xs text-muted-foreground">
                Read-only — only global project managers and administrators can change priorities.
              </p>
            )}
            {portfolio.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{p.key}</span>{" "}
                    {p.name}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="size-3" />
                    {p.target_end_date ?? "no target date"}
                  </p>
                </div>
                <Select
                  value={String(p.priority)}
                  disabled={!perms.setGlobalPriority || setPriority.isPending}
                  onValueChange={(v) => setPriority.mutate({ id: p.id, priority: Number(v) })}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {PRIORITY_LABELS[n]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {portfolio.length === 0 && (
              <p className="text-sm text-muted-foreground">No projects to prioritise.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resource allocation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allocation.length === 0 && (
              <p className="text-sm text-muted-foreground">No project members allocated yet.</p>
            )}
            {allocation.map((a) => (
              <div key={a.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 font-medium">
                    {a.total > 100 && <AlertTriangle className="size-3.5 text-destructive" />}
                    {a.name}
                  </span>
                  <span className={a.total > 100 ? "font-semibold text-destructive" : ""}>
                    {a.total}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className={a.total > 100 ? "h-full bg-destructive" : "h-full bg-primary"}
                    style={{ width: `${Math.min(a.total, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{a.lines.join(" · ")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
