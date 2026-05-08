import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";
import { useGameDetection } from "@/hooks/use-game-detection";
import { useAllProfiles, useProfileDetail } from "@/hooks/use-profiles";
import {
  gameShortName,
  gameDisplayName,
  installSourceLabel,
  type GameInstallation,
} from "@/lib/core-types";
import type { ProfileSummary } from "@/features/profiles/types";
import {
  IconTruck,
  IconLayoutDashboard,
  IconDeviceFloppy,
  IconArchive,
  IconSettings,
  IconSelector,
  IconCheck,
  IconCopy,
  IconPencil,
  IconCloud,
  IconDeviceDesktop,
  IconPuzzle,
  IconArrowsExchange,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";

import type { Icon } from "@tabler/icons-react";

type ProfileNavItem = {
  path:
    | "/overview"
    | "/saves"
    | "/mods"
    | "/clone"
    | "/backups"
    | "/compare";
  label: string;
  icon: Icon;
  needsProfile: boolean;
};

const PROFILE_NAV_ITEMS: readonly ProfileNavItem[] = [
  { path: "/overview", label: "Overview", icon: IconLayoutDashboard, needsProfile: true },
  { path: "/saves", label: "Saves", icon: IconDeviceFloppy, needsProfile: true },
  { path: "/mods", label: "Mods", icon: IconPuzzle, needsProfile: true },
  { path: "/clone", label: "Clone Profile", icon: IconCopy, needsProfile: true },
  { path: "/backups", label: "Backups", icon: IconArchive, needsProfile: true },
  { path: "/compare", label: "Compare", icon: IconArrowsExchange, needsProfile: false },
] as const;

interface AppSidebarProps {
  selectedInstallation: GameInstallation | null;
  onSelectInstallation: (installation: GameInstallation) => void;
  selectedProfile: ProfileSummary | null;
  onSelectProfile: (profile: ProfileSummary | null) => void;
}

export function AppSidebar({
  selectedInstallation,
  onSelectInstallation,
  selectedProfile,
  onSelectProfile,
}: AppSidebarProps) {
  const { data: installations, isLoading: detectingGames } =
    useGameDetection();
  const { profilesByInstallation } = useAllProfiles(installations);
  const { data: profileDetail } = useProfileDetail(selectedProfile?.path);
  const { data: appVersion } = useQuery({
    queryKey: ["app-version"],
    queryFn: getVersion,
    staleTime: Infinity,
  });
  const location = useLocation();

  const hasProfile = !!selectedProfile;
  // Most recent save for direct editor link (saves are sorted by last_modified desc)
  const mostRecentSave = profileDetail?.saves?.[0];

  return (
    <Sidebar>
      <SidebarHeader className="pt-[2.375rem]">
        <SidebarMenu>
          <SidebarMenuItem>
            {detectingGames ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton
                    size="lg"
                    className="data-[popup-open]:bg-sidebar-accent"
                  />}>
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <IconTruck className="size-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {selectedProfile?.name ?? "Select profile"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {selectedInstallation
                          ? gameShortName(selectedInstallation.game)
                          : "No game detected"}
                        {selectedProfile && (
                          selectedProfile.is_steam_cloud
                            ? <><span className="mx-0.5">·</span><IconCloud className="inline size-3" /></>
                            : <><span className="mx-0.5">·</span><IconDeviceDesktop className="inline size-3" /></>
                        )}
                      </span>
                    </div>
                    <IconSelector className="ml-auto size-4" />
                  </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--anchor-width] min-w-56"
                  align="start"
                  sideOffset={4}
                >
                  {installations && installations.length > 0 ? (
                    installations.map((inst, idx) => {
                      const instProfiles =
                        profilesByInstallation.get(inst.base_path) ?? [];
                      return (
                        <DropdownMenuGroup key={inst.base_path}>
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            {gameDisplayName(inst.game)}
                            <span className="ml-1 opacity-60">
                              ({installSourceLabel(inst.source)})
                            </span>
                          </DropdownMenuLabel>
                          {instProfiles.length > 0 ? (
                            instProfiles.map((profile) => (
                              <DropdownMenuItem
                                key={profile.path}
                                onClick={() => {
                                  onSelectInstallation(inst);
                                  onSelectProfile(profile);
                                }}
                              >
                                <span className="truncate">
                                  {profile.name}
                                </span>
                                {profile.is_steam_cloud && (
                                  <IconCloud className="ml-1 size-3 text-muted-foreground" />
                                )}
                                {profile.company_name && (
                                  <span className="ml-1 truncate text-xs text-muted-foreground">
                                    — {profile.company_name}
                                  </span>
                                )}
                                {selectedProfile?.path === profile.path &&
                                  selectedInstallation?.base_path === inst.base_path && (
                                  <IconCheck className="ml-auto size-4" />
                                )}
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <DropdownMenuItem disabled>
                              <span className="text-muted-foreground">
                                No profiles found
                              </span>
                            </DropdownMenuItem>
                          )}
                          {idx < installations.length - 1 && (
                            <DropdownMenuSeparator />
                          )}
                        </DropdownMenuGroup>
                      );
                    })
                  ) : (
                    <DropdownMenuItem disabled>
                      No games detected
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Profile</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PROFILE_NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={location.pathname === item.path}
                    disabled={item.needsProfile && !hasProfile}
                    render={<Link to={item.path} />}
                  >
                    <item.icon className="size-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname.startsWith("/editor/")}
                  disabled={!hasProfile || !mostRecentSave}
                  render={
                    location.pathname.startsWith("/editor/")
                      ? undefined
                      : mostRecentSave
                        ? <Link to="/editor/$saveId" params={{ saveId: mostRecentSave.directory_name }} />
                        : <Link to="/saves" />
                  }
                >
                  <IconPencil className="size-4" />
                  <span>Save Editor</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>App</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === "/settings"}
                  render={<Link to="/settings" />}
                >
                  <IconSettings className="size-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p className="px-4 py-2 text-xs text-muted-foreground">
          SII Mac{appVersion ? ` v${appVersion}` : ""}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
