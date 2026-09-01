import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/kb")({
  validateSearch: (search: Record<string, unknown>) => ({
    space: typeof search['space'] === "string" ? (search['space'] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Knowledge base | Atlas Enterprise Workspace" },
      {
        name: "description",
        content:
          "Team spaces and living documentation: requirements, runbooks and decisions kept next to the projects they belong to.",
      },
      { property: "og:title", content: "Knowledge base | Atlas Enterprise Workspace" },
      {
        property: "og:description",
        content: "Spaces and pages for requirements, runbooks and decisions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeBase,
});

function renderMarkdown(src: string) {
  return src
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function KnowledgeBase() {
  const { user, perms } = useCurrentUser();
  const qc = useQueryClient();
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", content: "" });
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [newSpace, setNewSpace] = useState({ key: "", name: "", description: "", project_id: "" });

  const spaces = useQuery({
    queryKey: ["kb-spaces"],
    queryFn: async () =>
      (await supabase.from("kb_spaces").select("*").order("name")).data ?? [],
  });

  const projects = useQuery({
    queryKey: ["kb-projects"],
    queryFn: async () => (await supabase.from("projects").select("id,key,name")).data ?? [],
  });

  const pages = useQuery({
    queryKey: ["kb-pages", spaceId],
    enabled: !!spaceId,
    queryFn: async () =>
      (
        await supabase
          .from("kb_pages")
          .select("*")
          .eq("space_id", spaceId!)
          .order("title")
      ).data ?? [],
  });

  useEffect(() => {
    if (!spaceId && spaces.data?.length) setSpaceId(spaces.data[0]!.id);
  }, [spaces.data, spaceId]);

  const page = useMemo(
    () => (pages.data ?? []).find((p) => p.id === pageId) ?? null,
    [pages.data, pageId],
  );

  useEffect(() => {
    if (page) setDraft({ title: page.title, content: page.content });
  }, [page]);

  const filteredPages = (pages.data ?? []).filter(
    (p) =>
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase()),
  );

  const createSpace = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("kb_spaces").insert({
        key: newSpace.key.toUpperCase(),
        name: newSpace.name,
        description: newSpace.description || null,
        project_id: newSpace.project_id || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Space created");
      setSpaceOpen(false);
      setNewSpace({ key: "", name: "", description: "", project_id: "" });
      qc.invalidateQueries({ queryKey: ["kb-spaces"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createPage = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("kb_pages")
        .insert({
          space_id: spaceId!,
          title: "Untitled page",
          content: "# Untitled page\n\nStart writing…",
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["kb-pages", spaceId] });
      setPageId(data.id);
      setEditing(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("kb_pages")
        .update({
          title: draft.title,
          content: draft.content,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pageId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Page saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["kb-pages", spaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("kb_pages").delete().eq("id", pageId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Page deleted");
      setPageId(null);
      qc.invalidateQueries({ queryKey: ["kb-pages", spaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge base</h1>
          <p className="text-sm text-muted-foreground">
            Spaces and pages for requirements, runbooks and decisions.
          </p>
        </div>
        {perms.editKnowledgeBase && (
          <Dialog open={spaceOpen} onOpenChange={setSpaceOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <BookOpen className="mr-2 size-4" /> New space
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create space</DialogTitle>
                <DialogDescription>
                  A space groups related documentation, optionally tied to a project.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Key</Label>
                  <Input
                    value={newSpace.key}
                    maxLength={10}
                    onChange={(e) => setNewSpace({ ...newSpace, key: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={newSpace.name}
                    onChange={(e) => setNewSpace({ ...newSpace, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={newSpace.description}
                    onChange={(e) => setNewSpace({ ...newSpace, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Linked project (optional)</Label>
                  <Select
                    value={newSpace.project_id || "none"}
                    onValueChange={(v) =>
                      setNewSpace({ ...newSpace, project_id: v === "none" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(projects.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.key} · {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createSpace.mutate()}
                  disabled={!newSpace.key || !newSpace.name || createSpace.isPending}
                >
                  Create space
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="surface space-y-4 p-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Space</Label>
            <Select value={spaceId ?? ""} onValueChange={(v) => (setSpaceId(v), setPageId(null))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a space" />
              </SelectTrigger>
              <SelectContent>
                {(spaces.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.key} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search pages"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            {filteredPages.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPageId(p.id);
                  setEditing(false);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                  pageId === p.id ? "bg-accent font-medium" : ""
                }`}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{p.title}</span>
              </button>
            ))}
            {filteredPages.length === 0 && (
              <p className="px-2 py-4 text-sm text-muted-foreground">No pages here yet.</p>
            )}
          </div>

          {perms.editKnowledgeBase && spaceId && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => createPage.mutate()}
              disabled={createPage.isPending}
            >
              <Plus className="mr-2 size-4" /> New page
            </Button>
          )}
        </aside>

        <section className="surface min-h-[60vh] p-6">
          {!page && (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <BookOpen className="mb-3 size-8" />
              <p>Select a page to read it, or create one to start documenting.</p>
            </div>
          )}

          {page && !editing && (
            <article className="space-y-4">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                <div>
                  <h2 className="text-2xl font-semibold">{page.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last updated {new Date(page.updated_at).toLocaleString()}
                  </p>
                </div>
                {perms.editKnowledgeBase && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deletePage.mutate()}
                      disabled={deletePage.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </header>
              <div className="space-y-3 text-sm leading-relaxed">
                {renderMarkdown(page.content).map((block, i) =>
                  block.startsWith("# ") ? (
                    <h3 key={i} className="text-lg font-semibold">
                      {block.slice(2)}
                    </h3>
                  ) : block.startsWith("## ") ? (
                    <h4 key={i} className="font-semibold">
                      {block.slice(3)}
                    </h4>
                  ) : block.startsWith("- ") ? (
                    <ul key={i} className="list-disc space-y-1 pl-5">
                      {block.split("\n").map((line, j) => (
                        <li key={j}>{line.replace(/^-\s*/, "")}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i} className="whitespace-pre-wrap">
                      {block}
                    </p>
                  ),
                )}
              </div>
            </article>
          )}

          {page && editing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="secondary">Editing</Badge>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => savePage.mutate()} disabled={savePage.isPending}>
                    <Save className="mr-2 size-4" /> Save
                  </Button>
                </div>
              </div>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="text-lg font-semibold"
              />
              <Textarea
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                rows={22}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Supports simple formatting: # heading, ## subheading and - bullet lists.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
