import {
  Archive,
  Calendar,
  FolderKanban,
  LayoutDashboard,
  Link2,
  ListChecks,
  Settings,
  Timer,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Focus", href: "/focus", icon: Timer },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Archived", href: "/archived", icon: Archive },
  { label: "Quick Links", href: "/quicklinks", icon: Link2 },
  { label: "Settings", href: "/settings", icon: Settings },
];
