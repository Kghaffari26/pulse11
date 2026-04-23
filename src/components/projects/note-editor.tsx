"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { toast } from "sonner";
import {
  Bold,
  Code,
  Download,
  FileText,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Printer,
  Strikethrough,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { tiptapJsonToMarkdown } from "@/shared/models/notes-serialize";
import { updateNote } from "@/client-lib/notes-client";
import type { Note } from "@/shared/models/notes";

const AUTOSAVE_INTERVAL_MS = 30_000;

interface Props {
  note: Note;
  projectId: string;
}

export function NoteEditor({ note, projectId }: Props) {
  const [title, setTitle] = useState(note.title ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(new Date(note.updatedAt));
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  // Reset dirty flag when switching notes.
  const lastNoteIdRef = useRef(note.id);

  const editor = useEditor({
    extensions: [StarterKit],
    content: note.contentJson ?? "",
    immediatelyRender: false,
    onUpdate: () => {
      dirtyRef.current = true;
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[320px] px-3 py-2 focus:outline-none",
      },
    },
  });

  // When the selected note changes, re-sync the editor content + title.
  useEffect(() => {
    if (!editor) return;
    if (lastNoteIdRef.current !== note.id) {
      lastNoteIdRef.current = note.id;
      setTitle(note.title ?? "");
      setSavedAt(new Date(note.updatedAt));
      dirtyRef.current = false;
      const content = note.contentJson ?? "";
      editor.commands.setContent(content as never, { emitUpdate: false });
    }
  }, [editor, note.id, note.contentJson, note.title, note.updatedAt]);

  const save = useCallback(async () => {
    if (!editor) return;
    if (!dirtyRef.current || savingRef.current) return;
    savingRef.current = true;
    try {
      const json = editor.getJSON() as unknown as Record<string, unknown>;
      const markdown = tiptapJsonToMarkdown(json);
      await updateNote(projectId, note.id, {
        title: title.trim() || null,
        contentJson: json,
        contentMarkdown: markdown,
      });
      dirtyRef.current = false;
      setSavedAt(new Date());
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? "Autosave failed");
    } finally {
      savingRef.current = false;
    }
  }, [editor, note.id, projectId, title]);

  // Periodic autosave — every 30s, only if dirty.
  useEffect(() => {
    const iv = setInterval(() => {
      void save();
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [save]);

  // Flush-on-unmount (e.g., navigating away) — best-effort.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void save();
    };
  }, [save]);

  async function handleBlur() {
    await save();
  }

  function onTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    dirtyRef.current = true;
  }

  function exportMarkdown() {
    if (!editor) return;
    const md = tiptapJsonToMarkdown(editor.getJSON() as unknown as Record<string, unknown>);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title.trim() || "note").replace(/[^a-z0-9-_]+/gi, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!editor) return <div className="text-sm text-muted-foreground">Loading editor…</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={onTitleChange}
          onBlur={handleBlur}
          placeholder="Untitled note"
          className="text-base font-medium"
          aria-label="Note title"
        />
        <Button variant="outline" size="sm" onClick={exportMarkdown}>
          <Download className="mr-2 h-4 w-4" />
          Markdown
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" size="sm" disabled aria-disabled>
                  <Printer className="mr-2 h-4 w-4" />
                  PDF
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Use browser Print → Save as PDF for now.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="rounded-md border">
        <Toolbar editor={editor} />
        <EditorContent editor={editor} onBlur={handleBlur} />
      </div>

      <div className="text-xs text-muted-foreground">
        {savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "Not saved yet"}
        {dirtyRef.current && " · unsaved changes"}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const btn = (active: boolean) =>
    `h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent ${active ? "bg-accent text-accent-foreground" : ""}`;

  return (
    <div className="flex items-center gap-1 border-b px-2 py-1">
      <button
        type="button"
        className={btn(editor.isActive("heading", { level: 1 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        aria-label="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("heading", { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        aria-label="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </button>
      <span className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        className={btn(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("strike"))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-label="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("code"))}
        onClick={() => editor.chain().focus().toggleCode().run()}
        aria-label="Inline code"
      >
        <Code className="h-4 w-4" />
      </button>
      <span className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        className={btn(editor.isActive("bulletList"))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Bullet list"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("orderedList"))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Numbered list"
      >
        <ListOrdered className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={btn(editor.isActive("codeBlock"))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        aria-label="Code block"
      >
        <FileText className="h-4 w-4" />
      </button>
    </div>
  );
}
