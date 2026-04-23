"use client";

import { useRef, useState } from "react";
import { Download, FileIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  deleteProjectFile,
  uploadProjectFile,
  useProjectFiles,
} from "@/client-lib/files-client";
import {
  FILE_SIZE_MAX,
  USER_QUOTA_MAX,
  formatBytes,
  validateFileSize,
} from "@/shared/models/files";
import type { ProjectFile } from "@/shared/models/files";

interface InFlight {
  id: string;
  filename: string;
  pct: number;
}

export function FilesPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectFiles(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [inFlight, setInFlight] = useState<InFlight[]>([]);

  const files = data?.files ?? [];
  const totalBytes = data?.usage.totalBytes ?? 0;
  const usagePct = Math.min(100, (totalBytes / USER_QUOTA_MAX) * 100);

  async function uploadOne(file: File) {
    const sizeErr = validateFileSize(file.size);
    if (sizeErr) {
      toast.error(sizeErr);
      return;
    }
    const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setInFlight((prev) => [...prev, { id, filename: file.name, pct: 0 }]);
    try {
      await uploadProjectFile(projectId, file, {
        onProgress: (pct) =>
          setInFlight((prev) => prev.map((f) => (f.id === id ? { ...f, pct } : f))),
      });
      toast.success(`${file.name} uploaded`);
    } catch (err) {
      toast.error((err as Error).message ?? "Upload failed");
    } finally {
      setInFlight((prev) => prev.filter((f) => f.id !== id));
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    for (const f of incoming) {
      void uploadOne(f);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    void handleFiles(e.dataTransfer.files);
  }

  async function handleDelete(file: ProjectFile) {
    try {
      await deleteProjectFile(projectId, file.id);
      toast.success(`${file.filename} deleted`);
    } catch (err) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not delete file");
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-10 text-center transition ${
          dragActive ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm">
          Drag files here or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Up to {formatBytes(FILE_SIZE_MAX)} per file · {formatBytes(USER_QUOTA_MAX)} total.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Used {formatBytes(totalBytes)} / {formatBytes(USER_QUOTA_MAX)}
          </span>
          <span>{usagePct.toFixed(1)}%</span>
        </div>
        <Progress value={usagePct} />
      </div>

      {inFlight.length > 0 && (
        <div className="space-y-2">
          {inFlight.map((u) => (
            <div key={u.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{u.filename}</span>
                <span className="text-xs text-muted-foreground">{u.pct}%</span>
              </div>
              <Progress value={u.pct} className="mt-2" />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && files.length === 0 && inFlight.length === 0 && (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        )}
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-md border p-3">
            <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{f.filename}</div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(f.sizeBytes)} · {new Date(f.uploadedAt).toLocaleString()}
              </div>
            </div>
            <Button asChild variant="ghost" size="icon" aria-label="Download">
              <a href={f.blobUrl} target="_blank" rel="noreferrer" download={f.filename}>
                <Download className="h-4 w-4" />
              </a>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete file?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes "{f.filename}" from the project and from blob storage.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => handleDelete(f)}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
      </div>
    </div>
  );
}
