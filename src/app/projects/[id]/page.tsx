"use client";

import { use } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProject } from "@/client-lib/projects-client";
import { NotesPanel } from "@/components/projects/notes-panel";
import { FilesPanel } from "@/components/projects/files-panel";
import { ProjectTasksPanel } from "@/components/projects/project-tasks-panel";
import { ChatPanel } from "@/components/projects/chat-panel";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: project, isLoading } = useProject(id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          All projects
        </Link>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !project && (
        <Card className="p-6">
          <p className="text-sm">Project not found.</p>
          <Button asChild variant="link" className="px-0">
            <Link href="/projects">Back to projects</Link>
          </Button>
        </Card>
      )}

      {project && (
        <>
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: project.color ?? "#64748b" }}
              />
              <div>
                <h1 className="text-2xl font-semibold">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-muted-foreground">{project.description}</p>
                )}
              </div>
            </div>
            {project.archived && (
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                Archived
              </span>
            )}
          </header>

          <Tabs defaultValue="notes">
            <TabsList>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
            </TabsList>
            <TabsContent value="notes" className="pt-4">
              <NotesPanel projectId={project.id} />
            </TabsContent>
            <TabsContent value="tasks" className="pt-4">
              <ProjectTasksPanel projectId={project.id} />
            </TabsContent>
            <TabsContent value="files" className="pt-4">
              <FilesPanel projectId={project.id} />
            </TabsContent>
            <TabsContent value="chat" className="pt-4">
              <ChatPanel projectId={project.id} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
