import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { PRIORITY_CLASS, PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Project and task status reporting with resource allocation, schedule variance and estimate-versus-actual delivery analysis.",
      },
      { property: "og:title", content: "Reports | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Status, resourcing and schedule-variance reporting across the portfolio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reports,
});

const days = (a?: string | null, b?: string | null) =>
  a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) : null;

function Reports() {
  const { perms } = useCurrentUser();
  const [projectFilter, setProjectFilter] = useState("all");

  const { data } = useQuery({
    queryKey: ["report-data"],
    queryFn: async () => {
      const [projects, tasks, members] = await Promise.all([
        supabase.from("projects").select("*").order("priority"),
        supabase.from("tasks").select("*, projects(key,name)"),
        supabase.from("project_members").select("*, profiles(full_name,email), projects(key,name)"),
      ]);
      return {
        projects: projects.data ?? [],
        tasks: tasks.data ?? [],
        members: members.data ?? [],
      };
    },
  });

  const tasks = useMemo(
    () =>
      (data?.tasks ?? []).filter(
        (t: any) => projectFilter === "all" || t.project_id === projectFilter,
      ),
    [data, projectFilter],
  );

  const allocation = useMemo(() => {
    const map = new Map<string, { name: string; total: number; projects: string[] }>();
    for (const m of data?.members ?? []) {
      const key = m.user_id;
      const entry: { name: string; total: number; projects: string[] } = map.get(key) ?? {
        name: (m as any).profiles?.full_name ?? (m as any).profiles?.email ?? "Unknown",
        total: 0,
        projects: [],
      };
      entry.total += m.allocation_pct;
      entry.projects.push(`${(m as any).projects?.key} (${m.allocation_pct}%)`);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [data]);

  if (!perms.report) {
    return (
      <p className="text-sm text-muted-foreground">
        Reporting is available to project managers, business managers, global project managers and
        administrators.
      </p>
    );
  }

  const totals = {
    open: tasks.filter((t: any) => t.status !== "done").length,
    done: tasks.filter((t: any) => t.status === "done").length,
    slipping: tasks.filter((t: any) => {
      const planned = t.upd_end_date ?? t.est_end_date;
      const actual = t.real_end_date;
      return planned && actual && new Date(actual) > new Date(planned);
    }).length,
    unplanned: tasks.filter((t: any) => !t.est_start_date || !t.est_end_date).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Status, schedule variance and resource allocation across projects.
          </p>
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {(data?.projects ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.key} · {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open tasks", value: totals.open },
          { label: "Completed", value: totals.done },
          { label: "Finished late", value: totals.slipping },
          { label: "Missing estimates", value: totals.unplanned },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-3xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule variance</TabsTrigger>
          <TabsTrigger value="status">Project status</TabsTrigger>
          <TabsTrigger value="resources">Resource allocation</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="surface mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Init. start</TableHead>
                <TableHead>Init. dur</TableHead>
                <TableHead>Init. end</TableHead>
                <TableHead>Upd. start</TableHead>
                <TableHead>Upd. dur</TableHead>
                <TableHead>Upd. end</TableHead>
                <TableHead>Real start</TableHead>
                <TableHead>Real dur</TableHead>
                <TableHead>Real end</TableHead>
                <TableHead>Slip (d)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t: any) => {
                const slip = days(t.upd_end_date ?? t.est_end_date, t.real_end_date);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-64 truncate">
                      <span className="font-mono text-xs text-muted-foreground">
                        {t.projects?.key}-{t.task_number}
                      </span>{" "}
                      {t.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{STATUS_LABELS[t.status]}</Badge>
                    </TableCell>
                    <TableCell>{t.est_start_date ?? "—"}</TableCell>
                    <TableCell>{t.est_duration_days ?? "—"}</TableCell>
                    <TableCell>{t.est_end_date ?? "—"}</TableCell>
                    <TableCell>{t.upd_start_date ?? "—"}</TableCell>
                    <TableCell>{t.upd_duration_days ?? "—"}</TableCell>
                    <TableCell>{t.upd_end_date ?? "—"}</TableCell>
                    <TableCell>{t.real_start_date ?? "—"}</TableCell>
                    <TableCell>{t.real_duration_days ?? "—"}</TableCell>
                    <TableCell>{t.real_end_date ?? "—"}</TableCell>
                    <TableCell
                      className={slip != null && slip > 0 ? "font-semibold text-destructive" : ""}
                    >
                      {slip ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {tasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">
                    No tasks to report on.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="status" className="surface mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Done</TableHead>
                <TableHead>Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.projects ?? []).map((p) => {
                const list = (data?.tasks ?? []).filter((t: any) => t.project_id === p.id);
                const done = list.filter((t: any) => t.status === "done").length;
                const pct = list.length ? Math.round((done / list.length) * 100) : 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <span className="font-mono text-xs text-muted-foreground">{p.key}</span>{" "}
                      {p.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={PRIORITY_CLASS[p.priority]}>
                        {PRIORITY_LABELS[p.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">{p.status.replace("_", " ")}</TableCell>
                    <TableCell>{list.length}</TableCell>
                    <TableCell>{done}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        {pct}%
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="resources" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Allocation per person</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {allocation.length === 0 && (
                <p className="text-sm text-muted-foreground">No project members allocated yet.</p>
              )}
              {allocation.map((a) => (
                <div key={a.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{a.name}</span>
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
                  <p className="text-xs text-muted-foreground">{a.projects.join(" · ")}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Allocation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.members ?? []).map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.profiles?.full_name ?? m.profiles?.email}</TableCell>
                    <TableCell>{m.projects?.key}</TableCell>
                    <TableCell>{ROLE_LABELS[m.project_role as keyof typeof ROLE_LABELS]}</TableCell>
                    <TableCell>{m.allocation_pct}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
