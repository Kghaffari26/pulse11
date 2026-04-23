"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePlus, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { createNote, deleteNote, useProjectNotes } from "@/client-lib/notes-client";
import { NoteEditor } from "./note-editor";

export function NotesPanel({ projectId }: { projectId: string }) {
  const { data: notes, isLoading } = useProjectNotes(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => (notes ?? []).find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  );

  // Auto-select the most recently updated note if nothing chosen.
  useEffect(() => {
    if (!selectedId && notes && notes.length > 0) {
      setSelectedId(notes[0]!.id);
    }
    if (selectedId && notes && !notes.find((n) => n.id === selectedId)) {
      setSelectedId(notes[0]?.id ?? null);
    }
  }, [notes, selectedId]);

  async function handleNewNote() {
    try {
      const note = await createNote(projectId, {
        title: "Untitled",
        contentJson: { type: "doc", content: [{ type: "paragraph" }] },
        contentMarkdown: "",
      });
      setSelectedId(note.id);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? "Could not create note");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNote(projectId, id);
      toast.success("Note deleted");
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? "Could not delete note");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        <Button onClick={handleNewNote} className="w-full" variant="outline">
          <FilePlus className="mr-2 h-4 w-4" />
          New note
        </Button>
        <div className="space-y-1">
          {isLoading && <p className="px-2 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && (notes?.length ?? 0) === 0 && (
            <p className="px-2 text-sm text-muted-foreground">No notes yet.</p>
          )}
          {(notes ?? []).map((n) => {
            const isSelected = n.id === selectedId;
            return (
              <div
                key={n.id}
                className={`group flex items-center gap-1 rounded-md ${
                  isSelected ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(n.id)}
                  className="flex-1 truncate px-2 py-2 text-left text-sm"
                >
                  <div className="truncate font-medium">{n.title || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.updatedAt), { addSuffix: true })}
                  </div>
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete note?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes "{n.title || "Untitled"}".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => handleDelete(n.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            );
          })}
        </div>
      </aside>

      <section>
        {selected ? (
          <NoteEditor note={selected} projectId={projectId} />
        ) : (
          <div className="flex h-[320px] items-center justify-center rounded-md border text-sm text-muted-foreground">
            Select a note or create a new one.
          </div>
        )}
      </section>
    </div>
  );
}
