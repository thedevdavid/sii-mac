import { queryKeys } from "@/lib/query-keys";
import React, { useTransition } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { platform } from "@tauri-apps/plugin-os";
import { ModeToggle } from "@/components/mode-toggle";
import { ConfigEditor } from "@/features/editor/config-editor";
import { useProfileState } from "@/lib/profile-context";
import {
  useGameDetection,
} from "@/hooks/use-game-detection";
import { setNativeVibrancy, addCustomGamePath, removeCustomGamePath } from "@/lib/tauri-commands";
import { formatError } from "@/lib/format-error";
import { gameDisplayName, installSourceLabel } from "@/lib/core-types";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Button } from "@/components/cupertino/button";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import { NativeSelect } from "@/components/ui/native-select";
import { useAutoFixMode } from "@/hooks/use-autofix-mode";
import { IconFolderPlus, IconTrash, IconRefresh } from "@tabler/icons-react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const IS_MACOS = platform() === "macos";

function SettingsPage() {
  const { selectedInstallation } = useProfileState();
  const { data: installations } = useGameDetection();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [autoFixMode, setAutoFixMode] = useAutoFixMode();

  const [vibrancyMode, setVibrancyMode] = React.useState<"css" | "native">(
    () =>
      (localStorage.getItem("siimac-vibrancy") as "css" | "native") || "css",
  );
  const isMacOS = IS_MACOS;

  function handleVibrancyChange(mode: "css" | "native") {
    setVibrancyMode(mode);
    localStorage.setItem("siimac-vibrancy", mode);
    setNativeVibrancy(mode === "native").catch((err) => {
      toast.error(`Failed to update window vibrancy: ${formatError(err)}`);
    });
    document.documentElement.classList.toggle(
      "native-vibrancy",
      mode === "native",
    );
  }

  function handleAddDirectory() {
    startTransition(async () => {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select Game Directory",
        });
        if (!selected) return;
        await addCustomGamePath(selected);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.installations.all(),
        });
        toast.success("Game directory added");
      } catch (err) {
        toast.error(`Failed: ${formatError(err)}`);
      }
    });
  }

  function handleRemovePath(path: string) {
    startTransition(async () => {
      try {
        await removeCustomGamePath(path);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.installations.all(),
        });
        toast.success("Directory removed");
      } catch (err) {
        toast.error(`Failed: ${formatError(err)}`);
      }
    });
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        {/* Appearance */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Appearance
          </h3>
          <ItemGroup>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Theme</ItemTitle>
                <ItemDescription>
                  Choose light, dark, or match your system.
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <ModeToggle />
              </ItemActions>
            </Item>

            {isMacOS && (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>Sidebar Translucency</ItemTitle>
                  <ItemDescription>
                    CSS simulates the glass effect. Native uses real macOS
                    vibrancy.
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
                    <button
                      onClick={() => handleVibrancyChange("css")}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                        vibrancyMode === "css"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      CSS
                    </button>
                    <button
                      onClick={() => handleVibrancyChange("native")}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                        vibrancyMode === "native"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      Native
                    </button>
                  </div>
                </ItemActions>
              </Item>
            )}
          </ItemGroup>
        </div>

        {/* Game Directories */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Game Directories
          </h3>
          <p className="text-xs text-muted-foreground">
            Auto-detected and custom game installation paths.
          </p>
          {installations && installations.length > 0 && (
            <ItemGroup>
              {installations.map((inst) => (
                <Item key={inst.base_path} variant="outline">
                  <ItemContent>
                    <ItemTitle>
                      {gameDisplayName(inst.game)}
                      <Badge variant="secondary" className="ml-2">
                        {installSourceLabel(inst.source)}
                      </Badge>
                    </ItemTitle>
                    <ItemDescription className="font-mono">
                      {inst.base_path}
                    </ItemDescription>
                  </ItemContent>
                  {inst.is_custom && (
                    <ItemActions>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemovePath(inst.base_path)}
                        disabled={isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <IconTrash className="size-3.5" />
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              ))}
            </ItemGroup>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddDirectory}
            disabled={isPending}
          >
            <IconFolderPlus className="size-3.5" />
            Add Directory
          </Button>
        </div>

        {/* Mods */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mods
          </h3>
          <ItemGroup>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Auto-fix order behavior</ItemTitle>
                <ItemDescription>
                  Choose whether the playset auto-fix opens a preview dialog or
                  applies the new order immediately.
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <NativeSelect
                  value={autoFixMode}
                  onChange={(e) =>
                    setAutoFixMode(e.target.value as typeof autoFixMode)
                  }
                  className="w-48"
                >
                  <option value="preview">Preview before applying</option>
                  <option value="immediate">Apply immediately</option>
                </NativeSelect>
              </ItemActions>
            </Item>
          </ItemGroup>
        </div>

        {/* Game Config */}
        {selectedInstallation && (
          <ConfigEditor gameBasePath={selectedInstallation.base_path} />
        )}

        {/* Updates */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Updates
          </h3>
          <ItemGroup>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Check for Updates</ItemTitle>
                <ItemDescription>
                  Current version: v1.0.0
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        const update = await check();
                        if (update) {
                          toast.success(`Update available: v${update.version}`, {
                            action: {
                              label: "Install",
                              onClick: async () => {
                                await update.downloadAndInstall();
                                await relaunch();
                              },
                            },
                          });
                        } else {
                          toast.success("You're on the latest version");
                        }
                      } catch (err) {
                        toast.error(`Update check failed: ${formatError(err)}`);
                      }
                    });
                  }}
                >
                  <IconRefresh className="size-3.5" />
                  Check Now
                </Button>
              </ItemActions>
            </Item>
          </ItemGroup>
        </div>
      </div>
    </ScrollArea>
  );
}
