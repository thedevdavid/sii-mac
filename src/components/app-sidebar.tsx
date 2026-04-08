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
import { useGameDetection } from "@/hooks/use-game-detection";
import { useProfiles } from "@/hooks/use-profiles";
import { gameShortName, gameDisplayName } from "@/lib/types";
import type { GameInstallation, ProfileSummary } from "@/lib/types";
import {
  IconTruck,
  IconLayoutDashboard,
  IconDeviceFloppy,
  IconArchive,
  IconSettings,
  IconSelector,
  IconCheck,
  IconCopy,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { data: profiles } = useProfiles(
    selectedInstallation?.profiles_path,
  );
  const location = useLocation();

  const hasProfile = !!selectedProfile;

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
                    installations.map((inst, idx) => (
                      <DropdownMenuGroup key={inst.base_path}>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          {gameDisplayName(inst.game)}
                        </DropdownMenuLabel>
                        {profiles &&
                        selectedInstallation?.base_path === inst.base_path
                          ? profiles.map((profile) => (
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
                                {profile.company_name && (
                                  <span className="ml-1 truncate text-xs text-muted-foreground">
                                    — {profile.company_name}
                                  </span>
                                )}
                                {selectedProfile?.path === profile.path && (
                                  <IconCheck className="ml-auto size-4" />
                                )}
                              </DropdownMenuItem>
                            ))
                          : (
                              <DropdownMenuItem
                                onClick={() => {
                                  onSelectInstallation(inst);
                                  onSelectProfile(null);
                                }}
                              >
                                <span className="text-muted-foreground">
                                  Load profiles...
                                </span>
                              </DropdownMenuItem>
                            )}
                        {idx < installations.length - 1 && (
                          <DropdownMenuSeparator />
                        )}
                      </DropdownMenuGroup>
                    ))
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === "/overview"}
                  disabled={!hasProfile}
                  render={<Link to="/overview" />}
                >
                  <IconLayoutDashboard className="size-4" />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === "/saves"}
                  disabled={!hasProfile}
                  render={<Link to="/saves" />}
                >
                  <IconDeviceFloppy className="size-4" />
                  <span>Saves</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === "/clone"}
                  disabled={!hasProfile}
                  render={<Link to="/clone" />}
                >
                  <IconCopy className="size-4" />
                  <span>Clone Profile</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === "/backups"}
                  disabled={!hasProfile}
                  render={<Link to="/backups" />}
                >
                  <IconArchive className="size-4" />
                  <span>Backups</span>
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
          SII Mac v0.1.0
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
