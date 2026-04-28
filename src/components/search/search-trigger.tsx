"use client";

import { Search } from "lucide-react";
import { useCommandPalette } from "./command-palette";

/**
 * Top-bar search trigger. Renders as a button styled to look like an
 * input — clicking it opens the command palette. The ⌘K hint reinforces
 * the discoverable shortcut.
 *
 * Detects platform from `navigator.platform` so Mac users see ⌘K and
 * everyone else sees Ctrl+K. Falls back to ⌘K during SSR (the most
 * common platform), then re-renders client-side.
 */
export function SearchTrigger() {
  const { setOpen } = useCommandPalette();
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcutLabel = isMac ? "⌘K" : "Ctrl+K";

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex w-64 max-w-xs items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label="Open command palette"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left">Search projects, tasks, notes, files...</span>
      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        {shortcutLabel}
      </kbd>
    </button>
  );
}
