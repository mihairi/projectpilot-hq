import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PRIORITY_CLASS, STATUS_LABELS, TASK_STATUSES, type TaskStatus } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PlanTask = {
  id: string;
  project_id: string;
  task_number: number | null;
  title: string;
  status: string;
  priority: number;
  assignee_id: string | null;
  est_start_date: string | null;
  est_end_date: string | null;
  upd_start_date: string | null;
  upd_end_date: string | null;
  real_start_date: string | null;
  real_end_date: string | null;
};

export const PLAN_TASK_COLUMNS =
  "id,project_id,task_number,title,status,priority,assignee_id,est_start_date,est_end_date,upd_start_date,upd_end_date,real_start_date,real_end_date";

const BOARD_STATUSES: TaskStatus[] = [...TASK_STATUSES];

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00`);
const startOf = (t: PlanTask) => t.real_start_date ?? t.upd_start_date ?? t.est_start_date;
const endOf = (t: PlanTask) => t.real_end_date ?? t.upd_end_date ?? t.est_end_date;
const baselineStart = (t: PlanTask) => t.est_start_date;
const baselineEnd = (t: PlanTask) => t.est_end_date;

export function PlanningWorkspace({
  projectId,
  projectKey,
  people,
}: {
  projectId: string;
  projectKey: string;
  people: Record<string, string>;
}) {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["plan-tasks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(PLAN_TASK_COLUMNS)
        .eq("project_id", projectId)
        .order("task_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanTask[];
    },
  });

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan-tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not update the task"),
  });

  return (
    <Tabs defaultValue="board" className="space-y-4">
      <TabsList>
        <TabsTrigger value="board">Board</TabsTrigger>
        <TabsTrigger value="gantt">Gantt</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
      </TabsList>

      <TabsContent value="board">
        <BoardView
          tasks={tasks}
          projectId={projectId}
          projectKey={projectKey}
          people={people}
          isLoading={isLoading}
          onMove={(id, status) => move.mutate({ id, status })}
        />
      </TabsContent>
      <TabsContent value="gantt">
        <GanttView tasks={tasks} projectId={projectId} projectKey={projectKey} />
      </TabsContent>
      <TabsContent value="calendar">
        <CalendarView tasks={tasks} projectId={projectId} projectKey={projectKey} />
      </TabsContent>
    </Tabs>
  );
}

function TaskLink({
  projectId,
  children,
  className,
}: {
  projectId: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link to="/projects/$projectId" params={{ projectId }} className={className}>
      {children}
    </Link>
  );
}

function BoardView({
  tasks,
  projectId,
  projectKey,
  people,
  isLoading,
  onMove,
}: {
  tasks: PlanTask[];
  projectId: string;
  projectKey: string;
  people: Record<string, string>;
  isLoading: boolean;
  onMove: (id: string, status: TaskStatus) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading board…</p>;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {BOARD_STATUSES.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(status);
            }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              if (dragId) onMove(dragId, status);
              setDragId(null);
            }}
            className={`flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30 p-2 transition-colors ${
              overCol === status ? "border-primary bg-primary/5" : ""
            }`}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {STATUS_LABELS[status]}
              </span>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`rounded border bg-card p-2 shadow-sm ${dragId === t.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-1">
                    <GripVertical className="mt-0.5 size-3.5 shrink-0 cursor-grab text-muted-foreground" />
                    <TaskLink projectId={projectId} className="min-w-0 text-sm hover:underline">
                      {t.title}
                    </TaskLink>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {projectKey}-{t.task_number}
                    </span>
                    <Badge variant="outline" className={PRIORITY_CLASS[t.priority]}>
                      P{t.priority}
                    </Badge>
                    {endOf(t) && (
                      <span className="text-[11px] text-muted-foreground">
                        {parse(endOf(t)!).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                    {t.assignee_id && people[t.assignee_id] && (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {people[t.assignee_id]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                  Drop tasks here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GanttView({
  tasks,
  projectId,
  projectKey,
}: {
  tasks: PlanTask[];
  projectId: string;
  projectKey: string;
}) {
  const dated = tasks.filter((t) => startOf(t) && endOf(t));

  const range = useMemo(() => {
    if (dated.length === 0) return null;
    const starts = dated.map((t) => parse(baselineStart(t) ?? startOf(t)!).getTime());
    const ends = dated.map((t) => parse(endOf(t)!).getTime());
    const min = new Date(Math.min(...starts) - 2 * DAY);
    const max = new Date(Math.max(...ends) + 2 * DAY);
    const days = Math.max(1, Math.round((max.getTime() - min.getTime()) / DAY));
    return { min, max, days };
  }, [dated]);

  if (!range) {
    return (
      <p className="text-sm text-muted-foreground">
        No tasks with dates yet. Add estimated start and end dates to see the timeline.
      </p>
    );
  }

  const pct = (d: string) =>
    ((parse(d).getTime() - range.min.getTime()) / (range.days * DAY)) * 100;

  const ticks: Date[] = [];
  const cursor = new Date(range.min);
  cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7));
  while (cursor <= range.max) {
    ticks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  const todayPct = pct(iso(new Date()));

  return (
    <Card>
      <CardContent className="space-y-3 overflow-x-auto pt-6">
        <div className="min-w-[720px]">
          <div className="flex">
            <div className="w-56 shrink-0" />
            <div className="relative h-5 flex-1">
              {ticks.map((t) => (
                <span
                  key={t.toISOString()}
                  className="absolute -translate-x-1/2 text-[11px] text-muted-foreground"
                  style={{ left: `${pct(iso(t))}%` }}
                >
                  {t.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
              ))}
            </div>
          </div>

          <div className="relative space-y-1.5 border-t pt-3">
            {todayPct >= 0 && todayPct <= 100 && (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px bg-destructive/70"
                style={{ left: `calc(14rem + ${todayPct}% * (100% - 14rem) / 100%)` }}
              />
            )}
            {dated.map((t) => {
              const bs = baselineStart(t);
              const be = baselineEnd(t);
              const s = startOf(t)!;
              const e = endOf(t)!;
              const late = t.status !== "done" && parse(e).getTime() < Date.now();
              return (
                <div key={t.id} className="flex items-center">
                  <TaskLink
                    projectId={projectId}
                    className="w-56 shrink-0 truncate pr-3 text-xs hover:underline"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {projectKey}-{t.task_number}
                    </span>{" "}
                    {t.title}
                  </TaskLink>
                  <div className="relative h-7 flex-1 rounded bg-muted/40">
                    {bs && be && (
                      <div
                        className="absolute top-1 h-1.5 rounded bg-muted-foreground/30"
                        style={{
                          left: `${pct(bs)}%`,
                          width: `${Math.max(1, pct(be) - pct(bs))}%`,
                        }}
                        title={`Baseline ${bs} → ${be}`}
                      />
                    )}
                    <div
                      className={`absolute top-3 flex h-3.5 items-center rounded px-1 text-[10px] text-primary-foreground ${
                        t.status === "done" ? "bg-success" : late ? "bg-destructive" : "bg-primary"
                      }`}
                      style={{
                        left: `${pct(s)}%`,
                        width: `${Math.max(1.5, pct(e) - pct(s))}%`,
                      }}
                      title={`${STATUS_LABELS[t.status]} · ${s} → ${e}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-4 pt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-6 rounded bg-muted-foreground/30" /> Initial estimate
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-6 rounded bg-primary" /> Current plan / actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-6 rounded bg-destructive" /> Past due
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-6 rounded bg-success" /> Done
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarView({
  tasks,
  projectId,
  projectKey,
}: {
  tasks: PlanTask[];
  projectId: string;
  projectKey: string;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const first = new Date(month);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  const byDay = useMemo(() => {
    const map: Record<string, { task: PlanTask; kind: "start" | "end" }[]> = {};
    for (const t of tasks) {
      const s = startOf(t);
      const e = endOf(t);
      if (s) (map[s] ??= []).push({ task: t, kind: "start" });
      if (e) (map[e] ??= []).push({ task: t, kind: "end" });
    }
    return map;
  }, [tasks]);

  const todayIso = iso(new Date());

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h3>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="outline"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date();
                setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              }}
            >
              Today
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label="Next month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded border bg-border text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-muted/60 px-2 py-1 font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {cells.map((d) => {
            const key = iso(d);
            const entries = byDay[key] ?? [];
            const otherMonth = d.getMonth() !== month.getMonth();
            return (
              <div
                key={key}
                className={`min-h-24 space-y-1 bg-card p-1.5 ${otherMonth ? "opacity-45" : ""}`}
              >
                <span
                  className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] ${
                    key === todayIso ? "bg-primary font-semibold text-primary-foreground" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
                {entries.slice(0, 3).map(({ task, kind }) => (
                  <TaskLink
                    key={`${task.id}-${kind}`}
                    projectId={projectId}
                    className={`block truncate rounded px-1 py-0.5 text-[11px] ${
                      kind === "end"
                        ? task.status === "done"
                          ? "bg-success/15 text-success"
                          : "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                    title={`${projectKey}-${task.task_number} ${task.title} · ${
                      kind === "end" ? "due" : "starts"
                    }`}
                  >
                    {kind === "end" ? "▸ " : "◦ "}
                    {task.title}
                  </TaskLink>
                ))}
                {entries.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{entries.length - 3} more
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
