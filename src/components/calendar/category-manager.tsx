"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Check, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createCategory,
  deleteCategory,
  updateCategory,
  useEventCategories,
} from "@/client-lib/calendar-client";
import { apiClient } from "@/client-lib/api-client";
import { mutate } from "swr";
import { COLOR_PRESETS } from "@/shared/models/calendar";
import type { EventCategory } from "@/shared/models/calendar";
import { cn } from "@/shared/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function CategoryManager({ open, onOpenChange }: Props) {
  const { data: categories } = useEventCategories();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0]);
  const [creating, setCreating] = useState(false);

  // Pending-delete state: which category is currently confirming deletion.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteCount, setDeleteCount] = useState(0);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const startEdit = (c: EventCategory) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!HEX_RE.test(editColor)) {
      toast.error("Color must be a 6-digit hex");
      return;
    }
    try {
      await updateCategory(editingId, { name: editName.trim(), color: editColor });
      toast.success("Category updated");
      cancelEdit();
    } catch {
      toast.error("Failed to update category");
    }
  };

  const onCreate = async () => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!HEX_RE.test(newColor)) {
      toast.error("Color must be a 6-digit hex");
      return;
    }
    setCreating(true);
    try {
      await createCategory({ name: newName.trim(), color: newColor });
      setNewName("");
      setNewColor(COLOR_PRESETS[0]);
      toast.success("Category created");
    } catch {
      toast.error("Failed to create category");
    } finally {
      setCreating(false);
    }
  };

  const requestDelete = async (c: EventCategory) => {
    // Probe server for event count. A 409 means events are attached; a 200
    // means it was deleted outright (no events). We never destructively call
    // deleteCategory twice.
    try {
      await apiClient.delete(`/event-categories/${c.id}`);
      await mutate("/event-categories");
      await mutate((key) => typeof key === "string" && key.startsWith("/events?"), undefined, { revalidate: true });
      toast.success("Category deleted");
    } catch (err) {
      const res = (err as { response?: { status?: number; data?: { error?: string } } }).response;
      if (res?.status === 409) {
        const msg = res.data?.error ?? "";
        const match = msg.match(/(\d+)\s+event/);
        const count = match ? parseInt(match[1], 10) : 0;
        setDeletingId(c.id);
        setDeleteCount(count);
        setReassignTo("");
        return;
      }
      if (res?.status === 400) {
        toast.error(res.data?.error ?? "Cannot delete");
        return;
      }
      toast.error("Failed to delete");
    }
  };

  const confirmDelete = async (target: string) => {
    if (!deletingId) return;
    setDeleteSubmitting(true);
    try {
      // target === "" means clear; otherwise a UUID of the destination category.
      await deleteCategory(deletingId, target);
      toast.success("Category deleted and events reassigned");
      setDeletingId(null);
      setDeleteCount(0);
      setReassignTo("");
    } catch {
      toast.error("Failed to delete category");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const cancelDelete = () => {
    setDeletingId(null);
    setDeleteCount(0);
    setReassignTo("");
  };

  const otherCategories = (categories ?? []).filter((c) => c.id !== deletingId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {(categories ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          )}
          <ul className="space-y-1.5">
            {(categories ?? []).map((c) => {
              const isEditing = editingId === c.id;
              const isDeleting = deletingId === c.id;
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-md border p-2.5"
                >
                  {isEditing ? (
                    <CategoryEditRow
                      name={editName}
                      color={editColor}
                      onName={setEditName}
                      onColor={setEditColor}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-5 w-5 shrink-0 rounded-full border"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                      {c.isDefault && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          default
                        </span>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => startEdit(c)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {c.isDefault ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/60">
                                <Lock className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Default category cannot be deleted</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => requestDelete(c)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}

                  {isDeleting && (
                    <div className="space-y-2 rounded-md bg-muted/40 p-2.5 text-sm">
                      <p>
                        <span className="font-medium">{deleteCount}</span>{" "}
                        event{deleteCount === 1 ? "" : "s"} use this category. Reassign to:
                      </p>
                      <Select value={reassignTo} onValueChange={setReassignTo}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__clear__">No category</SelectItem>
                          {otherCategories.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              <span className="flex items-center gap-2">
                                <span
                                  className="inline-block h-3 w-3 rounded-full border"
                                  style={{ backgroundColor: o.color }}
                                />
                                {o.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={cancelDelete} disabled={deleteSubmitting}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deleteSubmitting || reassignTo === ""}
                          onClick={() => confirmDelete(reassignTo === "__clear__" ? "" : reassignTo)}
                        >
                          {deleteSubmitting ? "Deleting…" : "Delete + reassign"}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4 space-y-2 rounded-md border border-dashed p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Create new</Label>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              className="flex-1"
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <Button onClick={onCreate} disabled={creating}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryEditRow({
  name,
  color,
  onName,
  onColor,
  onSave,
  onCancel,
}: {
  name: string;
  color: string;
  onName: (v: string) => void;
  onColor: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => onName(e.target.value)}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <ColorPicker value={color} onChange={onColor} />
      <Button variant="ghost" size="icon" onClick={onSave} aria-label="Save">
        <Check className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Choose ${c}`}
          className={cn(
            "h-5 w-5 rounded-full border-2 transition-transform",
            value.toLowerCase() === c.toLowerCase() ? "scale-110 border-foreground" : "border-border hover:scale-105",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 font-mono text-xs"
      />
    </div>
  );
}
