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
import { useGameDetection } from "@/hooks/use-game-detection";
import { useProfiles } from "@/hooks/use-profiles";
import { gameShortName, gameDisplayName } from "@/lib/types";
import type { GameInstallation, ProfileSummary } from "@/lib/types";
import {
  Truck,
  LayoutDashboard,
  Save,
  Archive,
  Settings,
  ChevronsUpDown,
  Check,
  Copy,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export type View = "overview" | "saves" | "clone" | "backups" | "settings";

interface AppSidebarProps {
  selectedInstallation: GameInstallation | null;
  onSelectInstallation: (installation: GameInstallation) => void;
  selectedProfile: ProfileSummary | null;
  onSelectProfile: (profile: ProfileSummary | null) => void;
  activeView: View;
  onViewChange: (view: View) => void;
}

export function AppSidebar({
  selectedInstallation,
  onSelectInstallation,
  selectedProfile,
  onSelectProfile,
  activeView,
  onViewChange,
}: AppSidebarProps) {
  const { data: installations, isLoading: detectingGames } =
    useGameDetection();
  const { data: profiles } = useProfiles(
    selectedInstallation?.profiles_path,
  );

  const hasProfile = !!selectedProfile;

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {detectingGames ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger render={() => (<SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent"
                  >
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <Truck className="size-4" />
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
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>)} />
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
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
                                onSelect={() => {
                                  onSelectInstallation(inst);
                                  onSelectProfile(profile);
                                  onViewChange("overview");
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
                                  <Check className="ml-auto size-4" />
                                )}
                              </DropdownMenuItem>
                            ))
                          : (
                              <DropdownMenuItem
                                onSelect={() => {
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
                  isActive={activeView === "overview"}
                  onClick={() => onViewChange("overview")}
                  disabled={!hasProfile}
                >
                  <LayoutDashboard className="size-4" />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeView === "saves"}
                  onClick={() => onViewChange("saves")}
                  disabled={!hasProfile}
                >
                  <Save className="size-4" />
                  <span>Saves</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeView === "clone"}
                  onClick={() => onViewChange("clone")}
                  disabled={!hasProfile}
                >
                  <Copy className="size-4" />
                  <span>Clone Profile</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeView === "backups"}
                  onClick={() => onViewChange("backups")}
                  disabled={!hasProfile}
                >
                  <Archive className="size-4" />
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
                  isActive={activeView === "settings"}
                  onClick={() => onViewChange("settings")}
                >
                  <Settings className="size-4" />
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
