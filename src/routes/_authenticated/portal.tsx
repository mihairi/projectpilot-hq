import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarClock, FolderKanban, LayoutDashboard } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { PRIORITY_CLASS, PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from "@/lib/roles";
import { PlanningWorkspace } from "@/components/PlanningWorkspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({
    meta: [
      { title: "My project portal | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Your personal landing page: the projects you belong to, your task list with deadlines and a direct link to each project's knowledge base space.",
      },
      { property: "og:title", content: "My project portal | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Your projects, your tasks, your deadlines and the matching knowledge base.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortalPage,
});

type TaskRow = {
  id: string;
  project_id: string;
  task_number: number | null;
  title: string;
  status: string;
  priority: number;
  est_end_date: string | null;
  upd_end_date: string | null;
  real_end_date: string | null;
};

function deadlineOf(t: TaskRow) {
  return t.upd_end_date ?? t.est_end_date ?? null;
}

function daysUntil(date: string) {
  const ms = new Date(date).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

function DeadlineBadge({ task }: { task: TaskRow }) {
  const due = deadlineOf(task);
  if (!due) return <span className="text-xs text-muted-foreground">No deadline</span>;
  const days = daysUntil(due);
  const done = task.status === "done";
  const label = new Date(due).toLocaleDateString();
  const tone = done
    ? "text-muted-foreground"
    : days < 0
      ? "text-destructive font-medium"
      : days <= 3
        ? "text-warning font-medium"
        : "text-muted-foreground";
  return (
    <span className={`whitespace-nowrap text-xs ${tone}`}>
      {label}
      {!done && (days < 0 ? ` · ${Math.abs(days)}d late` : days === 0 ? " · today" : ` · in ${days}d`)}
    </span>
  );
}

function PortalPage() {
  const { user, profile } = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ["portal", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [memberships, ownedProjects, myTasks, spaces, profiles] = await Promise.all([
        supabase.from("project_members").select("project_id, project_role, allocation_pct").eq("user_id", user!.id),
        supabase.from("projects").select("*").eq("owner_id", user!.id),
        supabase
          .from("tasks")
          .select(
            "id,project_id,task_number,title,status,priority,est_end_date,upd_end_date,real_end_date",
          )
          .eq("assignee_id", user!.id),
        supabase.from("kb_spaces").select("id,key,name,project_id"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

      const memberIds = (memberships.data ?? []).map((m) => m.project_id);
      const taskProjectIds = (myTasks.data ?? []).map((t) => t.project_id);
      const ids = Array.from(
        new Set([...memberIds, ...taskProjectIds, ...(ownedProjects.data ?? []).map((p) => p.id)]),
      );

      const projects = ids.length
        ? ((await supabase.from("projects").select("*").in("id", ids)).data ?? [])
        : [];

      const people: Record<string, string> = {};
      for (const p of profiles.data ?? []) people[p.id] = p.full_name || p.email;

      return {
        projects,
        memberships: memberships.data ?? [],
        tasks: (myTasks.data ?? []) as TaskRow[],
        spaces: spaces.data ?? [],
        people,
      };
    },
  });

  const projects = data?.projects ?? [];
  const [planProjectId, setPlanProjectId] = useState<string | null>(null);
  useEffect(() => {
    if (!planProjectId && projects.length > 0) setPlanProjectId(projects[0]!.id);
  }, [planProjectId, projects]);
  const planProject = projects.find((p) => p.id === planProjectId) ?? null;


  const tasks = data?.tasks ?? [];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdue = openTasks.filter((t) => {
    const d = deadlineOf(t);
    return d ? daysUntil(d) < 0 : false;
  });
  const dueSoon = openTasks.filter((t) => {
    const d = deadlineOf(t);
    return d ? daysUntil(d) >= 0 && daysUntil(d) <= 7 : false;
  });

  const upcoming = [...openTasks]
    .filter((t) => deadlineOf(t))
    .sort((a, b) => (deadlineOf(a)! < deadlineOf(b)! ? -1 : 1))
    .slice(0, 8);

  const stats = [
    { label: "My projects", value: data?.projects.length ?? 0 },
    { label: "Open tasks", value: openTasks.length },
    { label: "Due within 7 days", value: dueSoon.length },
    { label: "Overdue", value: overdue.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {profile?.full_name ? `${profile.full_name}'s portal` : "My project portal"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything assigned to you: your projects, your deadlines and the knowledge base that goes
          with each one.
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <LayoutDashboard className="size-4 text-primary" /> Plan your work
          </h2>
          {projects.length > 0 && (
            <Select value={planProjectId ?? undefined} onValueChange={setPlanProjectId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.key} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {planProject ? (
          <PlanningWorkspace
            key={planProject.id}
            projectId={planProject.id}
            projectKey={planProject.key}
            people={data?.people ?? {}}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : "Join a project to start planning."}
          </p>
        )}
      </section>



      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-primary" /> Next deadlines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading…" : "No dated work assigned to you."}
            </p>
          )}
          {upcoming.map((t) => {
            const project = data?.projects.find((p) => p.id === t.project_id);
            return (
              <Link
                key={t.id}
                to="/projects/$projectId"
                params={{ projectId: t.project_id }}
                className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm hover:bg-accent/40"
              >
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs text-muted-foreground">
                    {project?.key}-{t.task_number}
                  </span>{" "}
                  {t.title}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <DeadlineBadge task={t} />
                  <Badge variant="outline" className={PRIORITY_CLASS[t.priority]}>
                    P{t.priority}
                  </Badge>
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">My projects</h2>
        {(data?.projects ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : "You are not a member of any project yet."}
          </p>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          {(data?.projects ?? []).map((p) => {
            const projectTasks = tasks.filter((t) => t.project_id === p.id);
            const projectOpen = projectTasks.filter((t) => t.status !== "done");
            const space = data?.spaces.find((s) => s.project_id === p.id);
            const membership = data?.memberships.find((m) => m.project_id === p.id);
            return (
              <Card key={p.id}>
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                      <FolderKanban className="size-4 shrink-0 text-primary" />
                      <span className="truncate">
                        <span className="font-mono text-xs text-muted-foreground">{p.key}</span>{" "}
                        {p.name}
                      </span>
                    </CardTitle>
                    <Badge variant="outline" className={PRIORITY_CLASS[p.priority]}>
                      {PRIORITY_LABELS[p.priority]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {membership?.project_role
                      ? `Your role: ${ROLE_LABELS[membership.project_role]}`
                      : "Assigned work"}
                    {membership?.allocation_pct ? ` · ${membership.allocation_pct}% allocated` : ""}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {projectOpen.length === 0 && (
                    <p className="text-sm text-muted-foreground">No open tasks for you here.</p>
                  )}
                  {projectOpen.slice(0, 5).map((t) => (
                    <Link
                      key={t.id}
                      to="/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm hover:bg-accent/40"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.key}-{t.task_number}
                        </span>{" "}
                        {t.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <DeadlineBadge task={t} />
                        <Badge variant="secondary">{STATUS_LABELS[t.status]}</Badge>
                      </span>
                    </Link>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/projects/$projectId" params={{ projectId: p.id }}>
                        Open project
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/kb" search={{ space: space?.id }}>
                        <BookOpen className="mr-2 size-4" />
                        {space ? `Knowledge base · ${space.key}` : "Knowledge base"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
