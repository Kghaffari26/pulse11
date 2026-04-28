"use client";

import { ExternalLink, Flame } from "lucide-react";
import Link from "next/link";
import { authClient, getAuthActiveOrganization, getAuthClient } from "@/client-lib/auth-client";
import { useProjects } from "@/client-lib/projects-client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Sidebar as SidebarPrimitive,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAV_SECTIONS, SETTINGS_LINK, type NavSection } from "@/config/nav-links";

export function Sidebar() {
  const { data: session } = getAuthClient();
  const { data: activeOrganization } = getAuthActiveOrganization();
  const { state } = useSidebar();
  const { data: projectsData } = useProjects();
  // Empty state for the Projects section — only when the user is signed in
  // and the data has loaded. While loading we render the section without the
  // empty-state line so it doesn't flash on every navigation.
  const hasZeroProjects =
    !!session && Array.isArray(projectsData) && projectsData.filter((p) => !p.archived).length === 0;

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = `${process.env.NEXT_PUBLIC_VYBE_BASE_URL}/login`;
        },
      },
    });
  };

  return (
    <SidebarPrimitive collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-between px-[2px] py-2 gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <SidebarTrigger className="shrink-0" />
            {state === "expanded" && (
              <Link href="/" className="flex items-center gap-2 min-w-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
                  <Flame className="h-3.5 w-3.5" />
                </span>
                <span className="font-semibold tracking-tight text-sidebar-foreground truncate">
                  Pulse
                </span>
              </Link>
            )}
          </div>
          {state === "expanded" && <ThemeToggle />}
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {NAV_SECTIONS.map((section, idx) => (
          <NavSectionGroup
            key={section.label}
            section={section}
            isFirst={idx === 0}
            showProjectsEmptyState={section.kind === "projects" && hasZeroProjects}
          />
        ))}
      </SidebarContent>
      {session && (
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            {/* Settings was previously in the main nav. Moved here so it's
                close to the account controls — a more conventional place for
                a "preferences" link than alongside Tasks/Calendar. */}
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="sm" className="text-sidebar-foreground/80">
                <Link href={SETTINGS_LINK.href}>
                  <SETTINGS_LINK.icon />
                  <span>{SETTINGS_LINK.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="w-full outline-none">
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={session.user.image ?? undefined} />
                      <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-accent-foreground">
                        {session.user.name?.[0]?.toUpperCase() ?? session.user.email?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start text-left text-sm">
                      <span className="font-medium">{session.user.name ?? "User"}</span>
                      <span className="text-xs text-sidebar-foreground/70">{session.user.email}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Organization</p>
                    <p className="text-sm">{activeOrganization?.name ?? "No organization selected"}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => window.open(`${process.env.NEXT_PUBLIC_VYBE_BASE_URL}/organizations`, "_blank")}
                  >
                    Switch organization <ExternalLink className="ml-auto w-4 h-4" />
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => window.open(`${process.env.NEXT_PUBLIC_VYBE_BASE_URL}/apps`, "_blank")}
                  >
                    Manage apps <ExternalLink className="ml-auto w-4 h-4" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={true} className="cursor-pointer" onClick={handleSignOut}>
                    <span className="text-destructive font-semibold">Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </SidebarPrimitive>
  );
}

interface NavSectionGroupProps {
  section: NavSection;
  isFirst: boolean;
  showProjectsEmptyState: boolean;
}

function NavSectionGroup({ section, isFirst, showProjectsEmptyState }: NavSectionGroupProps) {
  return (
    <SidebarGroup className={isFirst ? undefined : "pt-4"}>
      <SidebarGroupLabel className="px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
        {section.label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {section.links.map((link) => (
            <SidebarMenuItem key={link.href}>
              <SidebarMenuButton asChild>
                <Link href={link.href}>
                  <link.icon />
                  <span>{link.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {showProjectsEmptyState && (
            <li className="px-2 pt-1 pl-9 text-xs italic text-sidebar-foreground/50">
              No projects yet
            </li>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
