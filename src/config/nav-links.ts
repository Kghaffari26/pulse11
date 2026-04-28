import {
  Archive,
  Calendar,
  FolderKanban,
  History,
  LayoutDashboard,
  Link2,
  ListChecks,
  Play,
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
  /** Optional header rendered above the section. Sections without a label
   *  read as a flat group, preserving the original sidebar look. */
  label?: string;
  links: NavLink[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    links: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Projects", href: "/projects", icon: FolderKanban },
    ],
  },
  {
    label: "Agent",
    links: [
      { label: "Run Task", href: "/agent/run", icon: Play },
      { label: "Activity Log", href: "/agent/log", icon: History },
    ],
  },
  {
    links: [
      { label: "Tasks", href: "/tasks", icon: ListChecks },
      { label: "Focus", href: "/focus", icon: Timer },
      { label: "Calendar", href: "/calendar", icon: Calendar },
      { label: "Archived", href: "/archived", icon: Archive },
      { label: "Quick Links", href: "/quicklinks", icon: Link2 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/** Flat list retained for any caller still relying on the Wave 4A export. */
export const NAV_LINKS: NavLink[] = NAV_SECTIONS.flatMap((s) => s.links);
