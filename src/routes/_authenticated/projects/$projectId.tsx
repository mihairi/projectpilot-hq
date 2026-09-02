import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import {
  APP_ROLES,
  PRIORITY_CLASS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  STATUS_LABELS,
  TASK_STATUSES,
  TASK_TYPES,
} from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project workspace | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Plan tasks, track estimated versus real start, duration and end dates, manage resource allocation and cross-project dependencies.",
      },
      { property: "og:title", content: "Project workspace | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Tasks, estimates versus actuals, resourcing and dependencies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectDetail,
});

const emptyTask = {
  title: "",
  description: "",
  task_type: "task",
  status: "backlog",
  priority: "3",
  assignee_id: "",
  est_start_date: "",
  est_duration_days: "",
  est_end_date: "",
  upd_start_date: "",
  upd_duration_days: "",
  upd_end_date: "",
  real_start_date: "",
  real_duration_days: "",
  real_end_date: "",
};

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { user, perms } = useCurrentUser();
  const qc = useQueryClient();
  const [taskOpen, setTaskOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ ...emptyTask });
  const [memberForm, setMemberForm] = useState({ user_id: "", project_role: "developer", allocation_pct: "100" });
  const [depTarget, setDepTarget] = useState("");

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await supabase.from("projects").select("*").eq("id", projectId).single()).data,
  });

  const people = useQuery({
    queryKey: ["profiles"],
    queryFn: async () =>
      (await supabase.from("profiles").select("*").eq("is_active", true).order("full_name")).data ?? [],
  });

  const members = useQuery({
    queryKey: ["members", projectId],
    queryFn: async () =>
      (await supabase.from("project_members").select("*, profiles(full_name,email)").eq("project_id", projectId))
        .data ?? [],
  });

  const tasks = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: async () =>
      (
        await supabase
          .from("tasks")
          .select("*")
          .eq("project_id", projectId)
          .order("task_number")
      ).data ?? [],
  });

  const allTasks = useQuery({
    queryKey: ["all-tasks"],
    queryFn: async () =>
      (await supabase.from("tasks").select("id,title,task_number,project_id,projects(key,name)")).data ?? [],
  });

  const deps = useQuery({
    queryKey: ["deps", editing?.id],
    enabled: !!editing?.id,
    queryFn: async () =>
      (
        await supabase
          .from("task_dependencies")
          .select("id, depends_on_task_id, tasks!task_dependencies_depends_on_task_id_fkey(title,task_number,project_id,projects(key))")
          .eq("task_id", editing!.id)
      ).data ?? [],
  });

  const g = (k: string) => form[k] ?? "";
  const num = (v: string) => (v === "" ? null : Number(v));
  const str = (v: string) => (v === "" ? null : v);

  const saveTask = useMutation({
    mutationFn: async () => {
      const payload = {
        project_id: projectId,
        title: g("title"),
        description: str(g("description")),
        task_type: g("task_type"),
        status: g("status"),
        priority: Number(g("priority")),
        assignee_id: g("assignee_id") || null,
        reporter_id: editing?.reporter_id ?? user!.id,
        est_start_date: str(g("est_start_date")),
        est_duration_days: num(g("est_duration_days")),
        est_end_date: str(g("est_end_date")),
        upd_start_date: str(g("upd_start_date")),
        upd_duration_days: num(g("upd_duration_days")),
        upd_end_date: str(g("upd_end_date")),
        real_start_date: str(g("real_start_date")),
        real_duration_days: num(g("real_duration_days")),
        real_end_date: str(g("real_end_date")),
      };
      if (editing) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Task updated" : "Task created");
      setTaskOpen(false);
      setEditing(null);
      setForm({ ...emptyTask });
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_members").insert({
        project_id: projectId,
        user_id: memberForm.user_id,
        project_role: memberForm.project_role as any,
        allocation_pct: Number(memberForm.allocation_pct),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member added");
      setMemberForm({ user_id: "", project_role: "developer", allocation_pct: "100" });
      qc.invalidateQueries({ queryKey: ["members", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const addDep = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("task_dependencies")
        .insert({ task_id: editing!.id, depends_on_task_id: depTarget });
      if (error) throw error;
    },
    onSuccess: () => {
      setDepTarget("");
      toast.success("Dependency added");
      qc.invalidateQueries({ queryKey: ["deps", editing?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeDep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_dependencies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deps", editing?.id] }),
  });

  function openTask(task: any | null) {
    setEditing(task);
    setForm(
      task
        ? Object.fromEntries(
            Object.keys(emptyTask).map((k) => [k, task[k] == null ? "" : String(task[k])]),
          )
        : { ...emptyTask },
    );
    setTaskOpen(true);
  }

  const p = project.data;
  const nameOf = (id: string | null) =>
    people.data?.find((x: any) => x.id === id)?.full_name ?? "Unassigned";

  /** Start-date locking rules, mirrored by a database trigger. */
  const todayIso = new Date().toISOString().slice(0, 10);
  function startLock(prefix: "est" | "upd" | "real"): string | null {
    if (!editing) return null;
    const current: string | null = editing[`${prefix}_start_date`] ?? null;
    if (!current) return null;
    if (prefix === "est") {
      return perms.setGlobalPriority
        ? null
        : "Locked once set — only an administrator or global project manager can change it.";
    }
    return current < todayIso ? "Locked — this start date is already in the past." : null;
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{p?.key}</p>
          <h1 className="text-2xl font-semibold">{p?.name}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{p?.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {p && (
            <Badge variant="outline" className={PRIORITY_CLASS[p.priority]}>
              {PRIORITY_LABELS[p.priority]}
            </Badge>
          )}
          <Button onClick={() => openTask(null)}>
            <Plus className="mr-2 size-4" /> New task
          </Button>
        </div>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="team">Team &amp; allocation</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="surface mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prio</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Est. start</TableHead>
                <TableHead>Est. dur</TableHead>
                <TableHead>Est. end</TableHead>
                <TableHead>Real start</TableHead>
                <TableHead>Real dur</TableHead>
                <TableHead>Real end</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tasks.data ?? []).map((t: any) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => openTask(t)}
                >
                  <TableCell className="font-mono text-xs">
                    {p?.key}-{t.task_number}
                  </TableCell>
                  <TableCell className="max-w-64 truncate font-medium">{t.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{STATUS_LABELS[t.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={PRIORITY_CLASS[t.priority]}>
                      P{t.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{nameOf(t.assignee_id)}</TableCell>
                  <TableCell>{t.est_start_date ?? "—"}</TableCell>
                  <TableCell>{t.est_duration_days ?? "—"}</TableCell>
                  <TableCell>{t.est_end_date ?? "—"}</TableCell>
                  <TableCell>{t.real_start_date ?? "—"}</TableCell>
                  <TableCell>{t.real_duration_days ?? "—"}</TableCell>
                  <TableCell>{t.real_end_date ?? "—"}</TableCell>
                </TableRow>
              ))}
              {(tasks.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    No tasks yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="board" className="mt-4">
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
            {TASK_STATUSES.map((s) => (
              <div key={s} className="surface p-2">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABELS[s]} ({(tasks.data ?? []).filter((t: any) => t.status === s).length})
                </p>
                <div className="space-y-2">
                  {(tasks.data ?? [])
                    .filter((t: any) => t.status === s)
                    .map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => openTask(t)}
                        className="w-full rounded border bg-background p-2 text-left text-sm hover:bg-accent/40"
                      >
                        <p className="line-clamp-2 font-medium">{t.title}</p>
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="font-mono">
                            {p?.key}-{t.task_number}
                          </span>
                          <Badge variant="outline" className={PRIORITY_CLASS[t.priority]}>
                            P{t.priority}
                          </Badge>
                        </p>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-4 space-y-4">
          {perms.createProject && (
            <div className="surface flex flex-wrap items-end gap-3 p-4">
              <div className="space-y-2">
                <Label>Person</Label>
                <Select
                  value={memberForm.user_id}
                  onValueChange={(v) => setMemberForm({ ...memberForm, user_id: v })}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select person" />
                  </SelectTrigger>
                  <SelectContent>
                    {(people.data ?? []).map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project role</Label>
                <Select
                  value={memberForm.project_role}
                  onValueChange={(v) => setMemberForm({ ...memberForm, project_role: v })}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_ROLES.filter((r) => r !== "admin").map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Allocation %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-28"
                  value={memberForm.allocation_pct}
                  onChange={(e) => setMemberForm({ ...memberForm, allocation_pct: e.target.value })}
                />
              </div>
              <Button onClick={() => addMember.mutate()} disabled={!memberForm.user_id}>
                Add member
              </Button>
            </div>
          )}
          <div className="surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Project role</TableHead>
                  <TableHead>Allocation</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(members.data ?? []).map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.profiles?.full_name}{" "}
                      <span className="text-xs text-muted-foreground">{m.profiles?.email}</span>
                    </TableCell>
                    <TableCell>{ROLE_LABELS[m.project_role as keyof typeof ROLE_LABELS]}</TableCell>
                    <TableCell>{m.allocation_pct}%</TableCell>
                    <TableCell className="text-right">
                      {perms.createProject && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMember.mutate(m.id)}
                          aria-label="Remove member"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? `${p?.key}-${editing.task_number} · Edit task` : "New task"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label>Title</Label>
              <Input value={g("title")} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={g("description")}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={g("task_type")} onValueChange={(v) => setForm({ ...form, task_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={g("status")} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={g("priority")} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger>
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
            <div className="space-y-2 sm:col-span-3">
              <Label>Assignee</Label>
              <Select
                value={g("assignee_id") || "none"}
                onValueChange={(v) => setForm({ ...form, assignee_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {(people.data ?? []).map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(
              [
                ["Initial estimate", "est"],
                ["Updated plan", "upd"],
                ["Real / actual", "real"],
              ] as const
            ).map(([label, prefix]) => (
              <div key={prefix} className="sm:col-span-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Start date</Label>
                    <Input
                      type="date"
                      value={g(`${prefix}_start_date`)}
                      disabled={!!startLock(prefix)}
                      title={startLock(prefix) ?? undefined}
                      onChange={(e) => setForm({ ...form, [`${prefix}_start_date`]: e.target.value })}
                    />
                    {startLock(prefix) && (
                      <p className="text-[11px] text-muted-foreground">{startLock(prefix)}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Duration (days)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={g(`${prefix}_duration_days`)}
                      onChange={(e) =>
                        setForm({ ...form, [`${prefix}_duration_days`]: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End date</Label>
                    <Input
                      type="date"
                      value={g(`${prefix}_end_date`)}
                      onChange={(e) => setForm({ ...form, [`${prefix}_end_date`]: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}

            {editing && (
              <div className="sm:col-span-3">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Link2 className="size-3.5" /> Dependencies (this task waits for)
                </p>
                <div className="space-y-2">
                  {(deps.data ?? []).map((d: any) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {d.tasks?.projects?.key}-{d.tasks?.task_number}
                        </span>{" "}
                        {d.tasks?.title}
                        {d.tasks?.project_id !== projectId && (
                          <Badge variant="secondary" className="ml-2">
                            cross-project
                          </Badge>
                        )}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => removeDep.mutate(d.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Select value={depTarget} onValueChange={setDepTarget}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a task from this or another project" />
                      </SelectTrigger>
                      <SelectContent>
                        {(allTasks.data ?? [])
                          .filter((t: any) => t.id !== editing.id)
                          .map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.projects?.key}-{t.task_number} · {t.title}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={() => addDep.mutate()} disabled={!depTarget}>
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => saveTask.mutate()} disabled={!g("title") || saveTask.isPending}>
              {editing ? "Save changes" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
