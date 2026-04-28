"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderKanban, ListChecks, StickyNote } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useSearch } from "@/client-lib/search-client";
import { cn } from "@/client-lib/utils";

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}
const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

/** Hook used by the top-bar trigger (and any future trigger) to open the palette. */
export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used inside <CommandPaletteProvider>");
  }
  return ctx;
}

/**
 * Mounts the palette UI once at the layout level. Wraps the app so the
 * top-bar search trigger can call useCommandPalette().setOpen(true)
 * without prop-drilling.
 *
 * Keyboard shortcut: Cmd+K (Mac) / Ctrl+K (Windows + Linux). Listener is
 * attached at window level so the shortcut works regardless of which
 * page the user is on.
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        // Skip when the user is in a contentEditable surface (e.g. some rich-
        // text editors). Inputs and textareas without contentEditable are
        // fine — Cmd+K isn't a standard browser shortcut for either.
        const target = e.target as HTMLElement | null;
        if (target?.isContentEditable) return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </CommandPaletteContext.Provider>
  );
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEBOUNCE_MS = 200;

function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  // Reset on close so the next open shows a clean slate.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
    }
  }, [open]);

  // Debounce: avoid hammering the endpoint while the user is typing.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const { data, isLoading } = useSearch(debounced);
  const results = data?.results;

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const showHint = debounced.length < 2;
  const total =
    (results?.projects.length ?? 0) +
    (results?.tasks.length ?? 0) +
    (results?.notes.length ?? 0) +
    (results?.files.length ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        {/* shouldFilter=false: the server already returns the relevant set; cmdk's
            built-in fuzzy filter would reject some live results because our query
            string doesn't match item labels character-for-character. */}
        <Command
          shouldFilter={false}
          className={cn(
            "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
            "[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2",
            "[&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5",
            "[&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5",
          )}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search projects, tasks, notes, files..."
            autoFocus
          />
          <CommandList>
            {showHint ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Type to search</div>
            ) : isLoading && total === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
            ) : total === 0 ? (
              <CommandEmpty>No results found</CommandEmpty>
            ) : (
              <ResultGroups results={results!} onSelect={navigate} />
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

interface ResultGroupsProps {
  results: NonNullable<ReturnType<typeof useSearch>["data"]>["results"];
  onSelect: (href: string) => void;
}

function ResultGroups({ results, onSelect }: ResultGroupsProps) {
  return (
    <>
      {results.projects.length > 0 && (
        <CommandGroup heading="Projects">
          {results.projects.map((p) => (
            <CommandItem
              key={`project-${p.id}`}
              value={`project-${p.id}-${p.name}`}
              onSelect={() => onSelect(`/projects/${p.id}`)}
            >
              <FolderKanban className="mr-2 h-4 w-4 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{p.name}</span>
                {p.description && (
                  <span className="truncate text-xs text-muted-foreground">{p.description}</span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {results.projects.length > 0 && results.tasks.length > 0 && <CommandSeparator />}

      {results.tasks.length > 0 && (
        <CommandGroup heading="Tasks">
          {results.tasks.map((t) => (
            <CommandItem
              key={`task-${t.id}`}
              value={`task-${t.id}-${t.title}`}
              onSelect={() =>
                onSelect(t.projectId ? `/projects/${t.projectId}?tab=tasks&taskId=${t.id}` : "/tasks")
              }
            >
              <ListChecks className="mr-2 h-4 w-4 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{t.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t.projectName ?? "No project"}
                  {t.description ? ` · ${t.description}` : ""}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {(results.projects.length > 0 || results.tasks.length > 0) && results.notes.length > 0 && (
        <CommandSeparator />
      )}

      {results.notes.length > 0 && (
        <CommandGroup heading="Notes">
          {results.notes.map((n) => (
            <CommandItem
              key={`note-${n.id}`}
              value={`note-${n.id}-${n.title ?? ""}`}
              onSelect={() => onSelect(`/projects/${n.projectId}?tab=notes&noteId=${n.id}`)}
            >
              <StickyNote className="mr-2 h-4 w-4 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{n.title?.trim() || "(untitled)"}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {n.projectName}
                  {n.snippet ? ` · ${n.snippet}` : ""}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {(results.projects.length > 0 ||
        results.tasks.length > 0 ||
        results.notes.length > 0) &&
        results.files.length > 0 && <CommandSeparator />}

      {results.files.length > 0 && (
        <CommandGroup heading="Files">
          {results.files.map((f) => (
            <CommandItem
              key={`file-${f.id}`}
              value={`file-${f.id}-${f.filename}`}
              onSelect={() => onSelect(`/projects/${f.projectId}?tab=files`)}
            >
              <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{f.filename}</span>
                <span className="truncate text-xs text-muted-foreground">{f.projectName}</span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  );
}
