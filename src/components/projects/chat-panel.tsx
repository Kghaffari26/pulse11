"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  Triangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { AILocked } from "@/components/ai/ai-locked";
import { useProjectChat } from "@/client-lib/chat-client";
import { useProjectFiles } from "@/client-lib/files-client";
import { useProjectNotes } from "@/client-lib/notes-client";
import type { ChatMessage } from "@/shared/models/chat";

interface Props {
  projectId: string;
}

export function ChatPanel({ projectId }: Props) {
  const { messages, isLoading, loadError, pending, sendError, sendMessage, retry, clearChat } =
    useProjectChat(projectId);
  const { data: filesResp } = useProjectFiles(projectId);
  const { data: notes } = useProjectNotes(projectId);

  const [draft, setDraft] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [expandedMsg, setExpandedMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fileCount = filesResp?.files.length ?? 0;
  const noteCount = notes?.length ?? 0;

  // Auto-scroll to the latest message whenever the list changes (or while
  // the assistant is "thinking").
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending, sendError]);

  const lastMessage = messages[messages.length - 1];
  const lastIsAssistantPending = useMemo(
    () => pending !== null && (!lastMessage || lastMessage.role !== "assistant"),
    [pending, lastMessage],
  );

  function handleSubmit() {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    void sendMessage(text);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleClear() {
    try {
      await clearChat();
      toast.success("Chat history cleared");
    } catch {
      toast.error("Failed to clear chat");
    }
  }

  return (
    <div className="flex h-[70vh] flex-col gap-3">
      {/* Header */}
      <div className="rounded-md border bg-card">
        <button
          type="button"
          onClick={() => setShowSources((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            {showSources ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Sparkles className="h-4 w-4 text-primary" />
            {fileCount} {fileCount === 1 ? "file" : "files"}, {noteCount}{" "}
            {noteCount === 1 ? "note" : "notes"} will be referenced
          </span>
          {messages.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear chat
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all chat history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every message in this project&apos;s chat. The files
                    and notes themselves are not affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleClear}
                  >
                    Clear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </button>

        {showSources && (
          <div className="border-t px-3 py-2 text-xs">
            {fileCount === 0 && noteCount === 0 ? (
              <p className="text-muted-foreground">
                No files or notes attached yet. Add some via the Files and Notes tabs.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 font-medium text-muted-foreground">Files</div>
                  {fileCount === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    <ul className="space-y-1">
                      {filesResp?.files.map((f) => (
                        <li key={f.id} className="flex items-center gap-1.5 truncate">
                          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{f.filename}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-1 font-medium text-muted-foreground">Notes</div>
                  {noteCount === 0 ? (
                    <p className="text-muted-foreground">None</p>
                  ) : (
                    <ul className="space-y-1">
                      {notes?.map((n) => (
                        <li key={n.id} className="flex items-center gap-1.5 truncate">
                          <StickyNote className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{n.title || "Untitled"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto rounded-md border bg-background p-3">
        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading conversation…</p>
        )}
        {loadError && (
          <p className="py-8 text-center text-sm text-destructive">
            Couldn&apos;t load chat history: {loadError.message}
          </p>
        )}
        {!isLoading && !loadError && messages.length === 0 && pending === null && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Sparkles className="h-6 w-6 text-primary/60" />
            <p>Ask anything about this project&apos;s files and notes.</p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              expanded={expandedMsg === m.id}
              onToggle={() => setExpandedMsg((curr) => (curr === m.id ? null : m.id))}
            />
          ))}

          {pending && (
            <PendingUserBubble text={pending.userText} />
          )}
          {lastIsAssistantPending && <TypingBubble />}

          {sendError && (
            <ErrorBubble
              message={sendError.message}
              onRetry={() => void retry()}
              hideRetry={sendError.quotaExhausted}
            />
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <AILocked>
        <div className="rounded-md border bg-card p-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your project files and notes…"
            rows={2}
            disabled={pending !== null}
            className="min-h-[60px] resize-none border-0 focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-1 pt-1">
            <p className="text-xs text-muted-foreground">
              Enter to send · Shift+Enter for new line
            </p>
            <Button onClick={handleSubmit} size="sm" disabled={!draft.trim() || pending !== null}>
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
      </AILocked>
    </div>
  );
}

function MessageBubble({
  message,
  expanded,
  onToggle,
}: {
  message: ChatMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isUser = message.role === "user";
  const ctx = message.contextUsed;
  const fileN = ctx?.files.length ?? 0;
  const noteN = ctx?.notes.length ?? 0;
  const hasFooter = !isUser && ctx !== null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "border bg-muted text-foreground"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {hasFooter && (
          <div className="mt-1.5 border-t border-foreground/10 pt-1.5 text-xs">
            <button
              type="button"
              onClick={onToggle}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Used {fileN} {fileN === 1 ? "file" : "files"}, {noteN}{" "}
              {noteN === 1 ? "note" : "notes"}
            </button>
            {expanded && ctx && (
              <ul className="mt-1.5 space-y-0.5 pl-3.5 text-muted-foreground">
                {ctx.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {f.filename}
                    {f.truncated && <span className="ml-1 italic">(truncated)</span>}
                  </li>
                ))}
                {ctx.notes.map((n) => (
                  <li key={n.id} className="flex items-center gap-1">
                    <StickyNote className="h-3 w-3" /> {n.title}
                  </li>
                ))}
                {fileN === 0 && noteN === 0 && (
                  <li className="italic">No project context was attached.</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingUserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end opacity-70">
      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      </div>
    </div>
  );
}

function ErrorBubble({
  message,
  onRetry,
  hideRetry,
}: {
  message: string;
  onRetry: () => void;
  hideRetry: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[85%] flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <div className="flex items-start gap-1.5">
          <Triangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{message}</p>
        </div>
        {!hideRetry && (
          <Button onClick={onRetry} size="sm" variant="outline" className="self-start">
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
