"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createEvent,
  deleteEvent,
  updateEvent,
  useEventCategories,
} from "@/client-lib/calendar-client";
import type { CalendarEvent } from "@/shared/models/calendar";
import {
  datetimeLocalToIso,
  endOfDay,
  startOfDay,
  toDatetimeLocalValue,
} from "./calendar-utils";

const NO_CATEGORY = "__none__";

export interface EventModalDefaults {
  startTime?: string; // ISO
  endTime?: string; // ISO
  allDay?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Event to edit. If null, modal is in Create mode. */
  event: CalendarEvent | null;
  /** Defaults for create mode. */
  defaults?: EventModalDefaults;
}

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function defaultEnd(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

export function EventModal({ open, onOpenChange, event, defaults }: Props) {
  const { data: categories } = useEventCategories();
  const isEdit = event != null;

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setCategoryId(event.categoryId);
      setAllDay(event.allDay);
      setStartLocal(toDatetimeLocalValue(event.startTime));
      setEndLocal(toDatetimeLocalValue(event.endTime));
      setDescription(event.description ?? "");
    } else {
      setTitle("");
      setCategoryId(null);
      setAllDay(defaults?.allDay ?? false);
      const startIso = defaults?.startTime ?? defaultStart();
      const endIso =
        defaults?.endTime ?? (defaults?.startTime ? addHourIso(defaults.startTime) : defaultEnd());
      setStartLocal(toDatetimeLocalValue(startIso));
      setEndLocal(toDatetimeLocalValue(endIso));
      setDescription("");
    }
  }, [open, event, defaults]);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    let startIso: string;
    let endIso: string;
    if (allDay) {
      // All-day = single day 00:00:00 to 23:59:59 local.
      const day = new Date(startLocal);
      if (isNaN(day.getTime())) {
        toast.error("Start date is required");
        return;
      }
      startIso = startOfDay(day).toISOString();
      endIso = endOfDay(day).toISOString();
    } else {
      const s = new Date(startLocal);
      const e = new Date(endLocal);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        toast.error("Start and end are required");
        return;
      }
      if (e.getTime() < s.getTime()) {
        toast.error("End must be on or after start");
        return;
      }
      startIso = datetimeLocalToIso(startLocal);
      endIso = datetimeLocalToIso(endLocal);
    }

    setSubmitting(true);
    try {
      if (isEdit && event) {
        await updateEvent(event.id, {
          title: title.trim(),
          categoryId,
          description: description.trim() || null,
          startTime: startIso,
          endTime: endIso,
          allDay,
        });
        toast.success("Event updated");
      } else {
        await createEvent({
          title: title.trim(),
          categoryId,
          description: description.trim() || null,
          startTime: startIso,
          endTime: endIso,
          allDay,
        });
        toast.success("Event created");
      }
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save event";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!event) return;
    if (!window.confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    setSubmitting(true);
    try {
      await deleteEvent(event.id);
      toast.success("Event deleted");
      onOpenChange(false);
    } catch {
      toast.error("Failed to delete event");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Study session"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={categoryId ?? NO_CATEGORY}
              onValueChange={(v) => setCategoryId(v === NO_CATEGORY ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full border"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="cursor-pointer" htmlFor="all-day">All-day</Label>
            <Switch id="all-day" checked={allDay} onCheckedChange={setAllDay} />
          </div>

          {allDay ? (
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={startLocal.slice(0, 10)}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartLocal(`${v}T00:00`);
                  setEndLocal(`${v}T23:59`);
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="flex sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={submitting}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function addHourIso(iso: string): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}
