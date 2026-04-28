import {
  Archive,
  Calendar,
  FolderKanban,
  History,
  LayoutDashboard,
  Link2,
  ListChecks,
  Play,
  Plus,
  Settings,
  Timer,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavSection = {
  /** Header rendered above the section. Required in the new layout so every
   *  group reads as a labeled chunk; previously optional but the Wave 4B-2
   *  redesign removed unlabeled groups. */
  label: string;
  /** Optional kind used for section-specific UI (e.g., projects empty state). */
  kind?: "main" | "agent" | "projects" | "other";
  links: NavLink[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Main",
    kind: "main",
    links: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Calendar", href: "/calendar", icon: Calendar },
      { label: "Tasks", href: "/tasks", icon: ListChecks },
      { label: "Archived", href: "/archived", icon: Archive },
    ],
  },
  {
    label: "Agent",
    kind: "agent",
    links: [
      { label: "Run Task", href: "/agent/run", icon: Play },
      { label: "Activity Log", href: "/agent/log", icon: History },
    ],
  },
  {
    label: "Projects",
    kind: "projects",
    links: [
      { label: "All projects", href: "/projects", icon: FolderKanban },
      { label: "New project", href: "/projects?new=true", icon: Plus },
    ],
  },
  {
    label: "Other",
    kind: "other",
    links: [
      { label: "Focus", href: "/focus", icon: Timer },
      { label: "Quick Links", href: "/quicklinks", icon: Link2 },
    ],
  },
];

/** Settings lives in the sidebar footer (next to the user dropdown), not in
 *  the main nav. Exported here so any caller wanting "the Settings link" has
 *  a single source. */
export const SETTINGS_LINK: NavLink = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
};

/** Flat list retained for any caller still relying on the Wave 4A export.
 *  Includes Settings so legacy callers don't lose access to it. */
export const NAV_LINKS: NavLink[] = [
  ...NAV_SECTIONS.flatMap((s) => s.links),
  SETTINGS_LINK,
];
