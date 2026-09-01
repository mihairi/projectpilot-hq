import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { PRIORITY_CLASS, PRIORITY_LABELS, PROJECT_STATUSES } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "All enterprise projects with global priority levels, owners, status and delivery dates in a single governed portfolio view.",
      },
      { property: "og:title", content: "Projects | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Portfolio of projects with global priorities, owners and delivery dates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { perms, user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    key: "",
    name: "",
    description: "",
    priority: "3",
    status: "planning",
    start_date: "",
    target_end_date: "",
  });

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("*, project_members(id)")
        .order("priority")
        .order("name");
      return data ?? [];
    },
  });

  const createProject = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          key: form.key.toUpperCase(),
          name: form.name,
          description: form.description || null,
          priority: Number(form.priority),
          status: form.status,
          owner_id: user!.id,
          created_by: user!.id,
          start_date: form.start_date || null,
          target_end_date: form.target_end_date || null,
        })
        .select()
        .single();
      if (error) throw error;
      await supabase
        .from("project_members")
        .insert({ project_id: data.id, user_id: user!.id, project_role: "project_manager" });
      return data;
    },
    onSuccess: () => {
      toast.success("Project created");
      setOpen(false);
      setForm({
        key: "",
        name: "",
        description: "",
        priority: "3",
        status: "planning",
        start_date: "",
        target_end_date: "",
      });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPriority = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: number }) => {
      const { error } = await supabase.from("projects").update({ priority }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Priority updated — project members notified");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Global priority levels P1–P5. Changing a priority notifies every project member.
          </p>
        </div>
        {perms.createProject && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 size-4" /> New project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
                <DialogDescription>You become the project manager and owner.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Key</Label>
                  <Input
                    value={form.key}
                    maxLength={10}
                    placeholder="FIN"
                    onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={form.priority}
                    onValueChange={(v) => setForm({ ...form, priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((p) => (
                        <SelectItem key={p} value={String(p)}>
                          {PRIORITY_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target end date</Label>
                  <Input
                    type="date"
                    value={form.target_end_date}
                    onChange={(e) => setForm({ ...form, target_end_date: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createProject.mutate()}
                  disabled={!form.key || !form.name || createProject.isPending}
                >
                  Create project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Target end</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(projects ?? []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.key}</TableCell>
                <TableCell>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {perms.setGlobalPriority ? (
                    <Select
                      value={String(p.priority)}
                      onValueChange={(v) => setPriority.mutate({ id: p.id, priority: Number(v) })}
                    >
                      <SelectTrigger className="h-8 w-40">
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
                  ) : (
                    <Badge variant="outline" className={PRIORITY_CLASS[p.priority]}>
                      {PRIORITY_LABELS[p.priority]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="capitalize">{p.status.replace("_", " ")}</TableCell>
                <TableCell>{p.project_members?.length ?? 0}</TableCell>
                <TableCell>{p.start_date ?? "—"}</TableCell>
                <TableCell>{p.target_end_date ?? "—"}</TableCell>
              </TableRow>
            ))}
            {(projects ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No projects yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
