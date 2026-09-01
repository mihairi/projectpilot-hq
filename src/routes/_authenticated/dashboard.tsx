import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { PRIORITY_CLASS, PRIORITY_LABELS, STATUS_LABELS, ROLE_LABELS } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Your portfolio overview: assigned tasks, project priorities and delivery health across the enterprise workspace.",
      },
      { property: "og:title", content: "Dashboard | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Assigned tasks, project priorities and delivery health at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { profile, roles, user } = useCurrentUser();

  const { data } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [projects, myTasks, allTasks] = await Promise.all([
        supabase.from("projects").select("*").order("priority"),
        supabase
          .from("tasks")
          .select("*, projects(key,name)")
          .eq("assignee_id", user!.id)
          .neq("status", "done")
          .order("priority"),
        supabase.from("tasks").select("id,status,real_end_date,upd_end_date,est_end_date"),
      ]);
      return {
        projects: projects.data ?? [],
        myTasks: myTasks.data ?? [],
        allTasks: allTasks.data ?? [],
      };
    },
  });

  const tasks = data?.allTasks ?? [];
  const open = tasks.filter((t) => t.status !== "done").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const late = tasks.filter(
    (t) =>
      t.status !== "done" &&
      (t.upd_end_date ?? t.est_end_date) &&
      new Date((t.upd_end_date ?? t.est_end_date) as string) < new Date(),
  ).length;

  const stats = [
    { label: "Projects", value: data?.projects.length ?? 0 },
    { label: "Open tasks", value: open },
    { label: "Completed", value: done },
    { label: "Overdue", value: late },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {profile?.full_name || "there"}</h1>
        <p className="text-sm text-muted-foreground">
          {roles.map((r) => ROLE_LABELS[r]).join(" · ") || "No role assigned yet"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-3xl font-semibold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My open tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.myTasks ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing assigned to you right now.</p>
            )}
            {(data?.myTasks ?? []).map((t: any) => (
              <Link
                key={t.id}
                to="/projects/$projectId"
                params={{ projectId: t.project_id }}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-accent/40"
              >
                <span className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.projects?.key}-{t.task_number}
                  </span>{" "}
                  {t.title}
                </span>
                <span className="flex shrink-0 gap-2">
                  <Badge variant="outline" className={PRIORITY_CLASS[t.priority]}>
                    P{t.priority}
                  </Badge>
                  <Badge variant="secondary">{STATUS_LABELS[t.status]}</Badge>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portfolio by priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.projects ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No projects created yet.</p>
            )}
            {(data?.projects ?? []).map((p) => (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-accent/40"
              >
                <span className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">{p.key}</span> {p.name}
                </span>
                <Badge variant="outline" className={PRIORITY_CLASS[p.priority]}>
                  {PRIORITY_LABELS[p.priority]}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
