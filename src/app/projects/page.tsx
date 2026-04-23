"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  deleteProject,
  updateProject,
  useProjects,
} from "@/client-lib/projects-client";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import type { Project } from "@/shared/models/projects";

function extractError(err: unknown): string | null {
  const e = err as { response?: { data?: { error?: string } }; message?: string } | null;
  return e?.response?.data?.error ?? e?.message ?? null;
}

export default function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = useProjects({ includeArchived: true });
  const projects = data ?? [];
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {active.length} active · {archived.length} archived
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Button>
      </header>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3 pt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : active.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No projects yet. Create your first one.
            </Card>
          ) : (
            active.map((p) => <ProjectRow key={p.id} project={p} />)
          )}
        </TabsContent>

        <TabsContent value="archived" className="space-y-3 pt-4">
          {archived.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No archived projects.</Card>
          ) : (
            archived.map((p) => <ProjectRow key={p.id} project={p} />)
          )}
        </TabsContent>
      </Tabs>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const archivedView = project.archived;

  async function toggleArchive() {
    try {
      await updateProject(project.id, { archived: !project.archived });
      toast.success(project.archived ? "Project restored" : "Project archived");
    } catch (err) {
      toast.error(extractError(err) ?? "Could not update project");
    }
  }

  async function handleDelete() {
    try {
      await deleteProject(project.id);
      toast.success("Project deleted");
    } catch (err) {
      toast.error(extractError(err) ?? "Could not delete project");
    }
  }

  return (
    <Card className="flex items-center justify-between gap-4 p-4">
      <Link
        href={`/projects/${project.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
      >
        <span
          aria-hidden
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: project.color ?? "#64748b" }}
        />
        <div className="min-w-0">
          <div className="truncate font-medium">{project.name}</div>
          {project.description && (
            <div className="truncate text-sm text-muted-foreground">{project.description}</div>
          )}
        </div>
      </Link>
      <div className="flex shrink-0 gap-1">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={archivedView ? "Restore" : "Archive"}>
              {archivedView ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{archivedView ? "Restore project?" : "Archive project?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {archivedView
                  ? `"${project.name}" will return to your active list.`
                  : `"${project.name}" will be hidden from the active list. Its tasks are unaffected.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={toggleArchive}>
                {archivedView ? "Restore" : "Archive"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete project?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>{project.name}</strong> along with its notes and files.
                Tasks will lose their project tag but remain.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}
