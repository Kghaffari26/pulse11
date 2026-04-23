"use client";

import { useRef, useState } from "react";
import { Sparkles, Upload, Image as ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createTask } from "@/client-lib/api-client";
import type { JSONSchema7 } from "json-schema";
import type { AppMode, TaskCategory, TaskPriority } from "@/shared/models/pulse";

interface Props {
  mode: AppMode;
  trigger?: React.ReactNode;
}

const CATEGORIES: TaskCategory[] = ["School", "Work", "Certification", "Personal"];
const PRIORITIES: TaskPriority[] = ["Low", "Medium", "High", "Critical"];

interface ExtractedTask {
  title: string;
  category: TaskCategory;
  deadline: string; // ISO
  estimatedMinutes: number;
  priority: TaskPriority;
  subtasks: string[];
  notes: string;
  reasoning: string;
  confidence: "low" | "medium" | "high";
}

const extractionSchema: JSONSchema7 = {
  type: "object",
  required: ["title", "category", "deadline", "estimatedMinutes", "priority", "subtasks", "notes", "reasoning", "confidence"],
  properties: {
    title: { type: "string", description: "Concise task title (e.g. 'Essay: Renaissance Art')" },
    category: { type: "string", enum: ["School", "Work", "Certification", "Personal"] },
    deadline: { type: "string", description: "ISO 8601 datetime in the user's local timezone. If only a date is given, use 23:59 local time." },
    estimatedMinutes: { type: "integer", minimum: 15, description: "Estimated completion time in minutes based on the assignment scope" },
    priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
    subtasks: { type: "array", items: { type: "string" }, description: "Break the work into 3-6 concrete steps" },
    notes: { type: "string", description: "Short summary of instructions, grading weight, rubric highlights, submission format" },
    reasoning: { type: "string", description: "One-sentence explanation of your priority + time estimate" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

function toDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) throw new Error("bad date");
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

function buildPrompt(content: string, mode: AppMode): string {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isoNow = now.toISOString();
  const localNow = now.toLocaleString("en-US", { timeZone: tz, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `You are an intelligent assistant inside the Pulse productivity app. The user just pasted content from Canvas (the learning management system) or a similar tool describing an assignment / task. Extract a structured task.

Current time: ${localNow} (${isoNow}, timezone ${tz}).
User is currently in "${mode}" mode.

Rules:
- Infer a short, clear title.
- Pick the best category: School / Work / Certification / Personal.
- Parse the due date carefully, including AM/PM and timezone. If only a date, use 23:59 local time. Output the deadline as an ISO 8601 datetime that represents the correct local wall-clock time.
- Estimate realistic completion time in minutes based on scope (page count, reading length, problem count, complexity). Typical heuristics: 1-page essay ~90m, 5-page essay ~6h, lab report ~4h, 20-problem set ~2h, reading chapter ~60m, discussion post ~30m.
- Choose priority from Low/Medium/High/Critical based on stakes (final exam/major paper = Critical, quiz = Medium, discussion = Low, etc.) and urgency.
- Suggest 3-6 concrete subtasks that break the work down.
- Put a concise summary of the instructions, rubric, grading weight, and submission format in "notes".
- Give a one-sentence reasoning and a confidence level.

CONTENT:
"""
${content}
"""`;
}

function extractJson(raw: string): ExtractedTask {
  if (!raw) throw new Error("Empty response from AI");
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("Could not find JSON in AI response");
  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
  return coerceExtracted(parsed);
}

/**
 * Validate + coerce the raw AI JSON into a safe ExtractedTask.
 * Invalid fields fall back to safe defaults rather than throwing, so the user
 * can still review / tweak the result instead of losing their work.
 */
function coerceExtracted(raw: Record<string, unknown>): ExtractedTask {
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "Untitled task";

  const category: TaskCategory = CATEGORIES.includes(raw.category as TaskCategory)
    ? (raw.category as TaskCategory)
    : "School";

  const priority: TaskPriority = PRIORITIES.includes(raw.priority as TaskPriority)
    ? (raw.priority as TaskPriority)
    : "Medium";

  const rawEst = typeof raw.estimatedMinutes === "number" ? raw.estimatedMinutes : Number(raw.estimatedMinutes);
  const estimatedMinutes =
    Number.isFinite(rawEst) && rawEst >= 0 ? Math.max(0, Math.round(rawEst)) : 60;

  let deadlineIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (typeof raw.deadline === "string" && raw.deadline) {
    const d = new Date(raw.deadline);
    if (!isNaN(d.getTime())) deadlineIso = d.toISOString();
  }

  const subtasks = Array.isArray(raw.subtasks)
    ? raw.subtasks.filter((s): s is string => typeof s === "string")
    : [];

  const notes = typeof raw.notes === "string" ? raw.notes : "";
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning : "";
  const confidence: ExtractedTask["confidence"] =
    raw.confidence === "low" || raw.confidence === "medium" || raw.confidence === "high"
      ? raw.confidence
      : "medium";

  return { title, category, deadline: deadlineIso, estimatedMinutes, priority, subtasks, notes, reasoning, confidence };
}

// Downscale + recompress an image data URL so payloads stay small and server-friendly.
async function downscaleDataUrl(dataUrl: string, maxDim = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

async function callSmartImport(body: {
  mode: "text" | "image";
  prompt: string;
  imageBase64?: string;
}): Promise<string> {
  const res = await fetch("/api/smart-import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Smart import failed (${res.status})`);
  }
  if (!data.text) throw new Error("Empty response from AI");
  return data.text;
}

export function SmartImportDialog({ mode, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"text" | "image">("text");
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setImageDataUrl(null);
    setExtracted(null);
    setAnalyzing(false);
    setSubmitting(false);
    setTab("text");
  };

  const handleClose = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const readFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please paste or upload an image");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Image must be under 12MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImageDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          readFile(f);
          setTab("image");
          return;
        }
      }
    }
  };

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const schemaInstruction = `\n\nReturn ONLY a valid minified JSON object (no markdown fences, no prose) matching this schema:\n${JSON.stringify(extractionSchema)}`;

      if (tab === "text") {
        if (!text.trim() || text.trim().length < 15) {
          toast.error("Paste the assignment text first");
          setAnalyzing(false);
          return;
        }
        const raw = await callSmartImport({
          mode: "text",
          prompt: buildPrompt(text, mode) + schemaInstruction,
        });
        setExtracted(extractJson(raw));
      } else {
        if (!imageDataUrl) {
          toast.error("Paste or upload a screenshot first");
          setAnalyzing(false);
          return;
        }
        // Downscale to keep payload small and server-friendly
        const shrunk = await downscaleDataUrl(imageDataUrl);
        const base64 = shrunk.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
        const raw = await callSmartImport({
          mode: "image",
          prompt:
            buildPrompt(
              "(See the attached screenshot of a Canvas assignment. Read every visible word carefully \u2014 title, due date/time, points, instructions, rubric.)",
              mode,
            ) + schemaInstruction,
          imageBase64: base64,
        });
        setExtracted(extractJson(raw));
      }
    } catch (err) {
      console.error("Smart import failed:", err);
      const msg = err instanceof Error ? err.message : "Analysis failed";
      toast.error(msg.length > 160 ? "Couldn't analyze that. Try pasting plain text instead." : msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const confirm = async () => {
    if (!extracted) return;
    if (!extracted.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const deadline = new Date(extracted.deadline);
    if (isNaN(deadline.getTime())) {
      toast.error("Invalid deadline");
      return;
    }
    setSubmitting(true);
    try {
      await createTask({
        title: extracted.title.trim(),
        category: extracted.category,
        deadline: deadline.toISOString(),
        estimatedMinutes: Math.max(15, Math.round(extracted.estimatedMinutes)),
        priority: extracted.priority,
        mode,
        notes: extracted.notes.trim() || undefined,
        subtasks: extracted.subtasks.filter((s) => s.trim()),
      });
      toast.success("Task imported from Canvas");
      handleClose(false);
    } catch {
      toast.error("Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const totalMinutes = extracted ? Math.max(0, Math.round(extracted.estimatedMinutes)) : 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary">
            <Sparkles className="mr-1.5 h-4 w-4" />
            Smart Import
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col overflow-y-auto" onPaste={onPaste}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Import from Canvas
          </DialogTitle>
        </DialogHeader>

        {!extracted ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste the assignment text, or paste / upload a screenshot. Pulse will extract the deadline, estimate how long it&apos;ll take, and suggest subtasks.
            </p>

            <Tabs value={tab} onValueChange={(v) => setTab(v as "text" | "image")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="text">Paste Text</TabsTrigger>
                <TabsTrigger value="image">Screenshot</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-3">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the assignment description, due date, rubric, and any instructions from Canvas\u2026"
                  rows={10}
                  className="resize-none"
                />
                <p className="mt-2 text-xs text-muted-foreground">{text.length} characters</p>
              </TabsContent>

              <TabsContent value="image" className="mt-3">
                {imageDataUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageDataUrl} alt="Pasted screenshot" className="max-h-64 w-full rounded-md border object-contain" />
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2 h-7 w-7"
                      onClick={() => setImageDataUrl(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/30 py-10 text-center text-sm text-muted-foreground transition hover:bg-muted/50"
                  >
                    <ImageIcon className="h-7 w-7 opacity-60" />
                    <span className="font-medium text-foreground">Paste a screenshot</span>
                    <span className="text-xs">Press <kbd className="rounded bg-background px-1.5 py-0.5 font-mono">\u2318/Ctrl + V</kbd> anywhere in this dialog, or click to upload</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs text-primary"><Upload className="h-3 w-3" /> Choose file</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readFile(f);
                    e.target.value = "";
                  }}
                />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="ghost" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={analyze} disabled={analyzing}>
                {analyzing ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Analyzing\u2026</>
                ) : (
                  <><Sparkles className="mr-1.5 h-4 w-4" /> Analyze</>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="capitalize">Confidence: {extracted.confidence}</Badge>
              <span className="text-xs text-muted-foreground">{extracted.reasoning}</span>
            </div>

            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={extracted.title} onChange={(e) => setExtracted({ ...extracted, title: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={extracted.category} onValueChange={(v) => setExtracted({ ...extracted, category: v as TaskCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={extracted.priority} onValueChange={(v) => setExtracted({ ...extracted, priority: v as TaskPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Deadline</Label>
              <Input
                type="datetime-local"
                value={toDatetimeLocal(extracted.deadline)}
                onChange={(e) => {
                  const d = new Date(e.target.value);
                  if (!isNaN(d.getTime())) setExtracted({ ...extracted, deadline: d.toISOString() });
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Estimated time</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={hours}
                  onChange={(e) => {
                    const h = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    setExtracted({ ...extracted, estimatedMinutes: h * 60 + minutes });
                  }}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">hours</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  step={1}
                  value={minutes}
                  onChange={(e) => {
                    const m = Math.min(59, Math.max(0, Math.floor(Number(e.target.value) || 0)));
                    setExtracted({ ...extracted, estimatedMinutes: hours * 60 + m });
                  }}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Subtasks</Label>
              <div className="space-y-1">
                {extracted.subtasks.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={s}
                      onChange={(e) => {
                        const arr = [...extracted.subtasks];
                        arr[i] = e.target.value;
                        setExtracted({ ...extracted, subtasks: arr });
                      }}
                    />
                    <Button size="icon" variant="ghost" onClick={() => setExtracted({ ...extracted, subtasks: extracted.subtasks.filter((_, j) => j !== i) })}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setExtracted({ ...extracted, subtasks: [...extracted.subtasks, ""] })}>
                  + Add subtask
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={extracted.notes}
                onChange={(e) => setExtracted({ ...extracted, notes: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setExtracted(null)}>\u2190 Back</Button>
              <Button onClick={confirm} disabled={submitting}>
                {submitting ? "Creating\u2026" : "Create Task"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
