"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { updateTask } from "@/client-lib/api-client";
import { formatDuration, type Task } from "@/shared/models/pulse";

interface Props {
  task: Task;
  trigger: React.ReactNode;
}

interface Preset {
  id: string;
  label: string;
  emoji: string;
  build: (t: Task) => string;
}

const PRESETS: Preset[] = [
  {
    id: "outline",
    label: "Create an outline",
    emoji: "🗂️",
    build: (t) =>
      `Create a clear, well-structured outline for this task. Use hierarchical bullet points. Include a short intro, 3-5 main sections with sub-bullets, and a conclusion.\n\nTask: ${t.title}\nCategory: ${t.category}\nNotes: ${t.notes ?? "(none)"}`,
  },
  {
    id: "draft",
    label: "Draft a first pass",
    emoji: "✍️",
    build: (t) =>
      `Write a strong first-draft of this task. Use clear paragraphs and a professional tone. If it is an essay, include an intro, body, and conclusion. If it is a report, use headings. Aim for roughly the scope of a ${formatDuration(t.estimatedMinutes)} task.\n\nTask: ${t.title}\nCategory: ${t.category}\nPriority: ${t.priority}\nNotes: ${t.notes ?? "(none)"}`,
  },
  {
    id: "study",
    label: "Make a study guide",
    emoji: "📚",
    build: (t) =>
      `Create a focused study guide for this task. Include: 1) Key concepts with short definitions, 2) Likely exam questions with brief answers, 3) Mnemonics or memory aids, 4) A 3-step study plan.\n\nTask: ${t.title}\nNotes: ${t.notes ?? "(none)"}`,
  },
  {
    id: "breakdown",
    label: "Break it down",
    emoji: "🧩",
    build: (t) =>
      `Break this task into a sequence of concrete, actionable steps I can complete one at a time. For each step, estimate how many minutes it will take. Keep the total close to ${formatDuration(t.estimatedMinutes)}.\n\nTask: ${t.title}\nNotes: ${t.notes ?? "(none)"}\nExisting subtasks: ${t.subtasks.map((s) => s.title).join(", ") || "(none)"}`,
  },
  {
    id: "brainstorm",
    label: "Brainstorm ideas",
    emoji: "💡",
    build: (t) =>
      `Brainstorm 8-10 creative angles, thesis statements, or approaches I could take for this task. For each, give a one-sentence description of why it works.\n\nTask: ${t.title}\nNotes: ${t.notes ?? "(none)"}`,
  },
  {
    id: "explain",
    label: "Explain it simply",
    emoji: "🧠",
    build: (t) =>
      `Explain the core concepts of this task in plain, simple English as if teaching a beginner. Use analogies and examples. End with 3 quick-check questions to verify understanding.\n\nTask: ${t.title}\nNotes: ${t.notes ?? "(none)"}`,
  },
];

async function callAIAssist(prompt: string): Promise<string> {
  const res = await fetch("/api/ai-assist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `AI assist failed (${res.status})`);
  }
  if (!data.text) throw new Error("AI returned an empty response");
  return data.text;
}

export function AIAssistDialog({ task, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const run = async (finalPrompt: string, presetId: string | null) => {
    setLoading(true);
    setActivePreset(presetId);
    setResult("");
    try {
      const text = await callAIAssist(finalPrompt);
      setResult(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI request failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePreset = (p: Preset) => {
    void run(p.build(task), p.id);
  };

  const handleCustom = () => {
    if (!prompt.trim()) {
      toast.error("Type what you want help with");
      return;
    }
    const fullPrompt = `You are helping me with a task called "${task.title}" in the ${task.category} category.${task.notes ? `\nTask notes: ${task.notes}` : ""}\n\nMy request: ${prompt.trim()}`;
    void run(fullPrompt, null);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const saveToNotes = async () => {
    const combined = task.notes
      ? `${task.notes}\n\n--- AI Assist ---\n${result}`
      : `--- AI Assist ---\n${result}`;
    await updateTask(task.id, { notes: combined });
    toast.success("Added to task notes");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Assist · {task.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Quick actions</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant={activePreset === p.id ? "default" : "outline"}
                  onClick={() => handlePreset(p)}
                  disabled={loading}
                >
                  <span className="mr-1">{p.emoji}</span>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Or ask anything</div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Write a thesis statement about symbolism in The Great Gatsby…"
              rows={2}
              className="resize-none"
            />
            <div className="mt-2 flex justify-end">
              <Button onClick={handleCustom} disabled={loading || !prompt.trim()} size="sm">
                {loading && !activePreset ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Thinking…</>
                ) : (
                  <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Generate</>
                )}
              </Button>
            </div>
          </div>

          {(loading || result) && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI output
                </Badge>
                {result && !loading && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={copy}>
                      {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={saveToNotes}>
                      Save to notes
                    </Button>
                  </div>
                )}
              </div>
              {loading ? (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </div>
              ) : (
                <div className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
                  {result}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
