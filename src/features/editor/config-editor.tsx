import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/cupertino/empty";
import { IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import { getGameConfig } from "@/lib/tauri-commands";
import { useUpdateGameConfig } from "@/hooks/use-mutations";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/cupertino/button";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import type { GameBasePath } from "@/lib/core-types";

interface ConfigEditorProps {
  gameBasePath: GameBasePath;
}

export function ConfigEditor({ gameBasePath }: ConfigEditorProps) {
  const mutation = useUpdateGameConfig(gameBasePath);

  const { data: config, isLoading, error } = useQuery({
    queryKey: queryKeys.config.game(gameBasePath),
    queryFn: () => getGameConfig(gameBasePath),
    enabled: !!gameBasePath,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <Empty className="h-full border-0">
        <EmptyMedia>
          <IconAlertTriangle className="size-7 text-destructive" />
        </EmptyMedia>
        <EmptyTitle>Config not found</EmptyTitle>
        <EmptyDescription>Could not read game config.cfg</EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Game Settings
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Modifies config.cfg in the game directory. Changes apply on next game launch.
        </p>
      </div>

        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Developer
          </h3>
          <ItemGroup>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Developer Mode</ItemTitle>
                <ItemDescription>
                  Enables developer features and debug commands
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  checked={config.developer}
                  onCheckedChange={() =>
                    mutation.mutate({
                      key: "g_developer",
                      value: config.developer ? "0" : "1",
                    })
                  }
                  disabled={mutation.isPending}
                />
              </ItemActions>
            </Item>

            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Developer Console</ItemTitle>
                <ItemDescription>
                  Access the in-game developer console with ~ key
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  checked={config.console}
                  onCheckedChange={() =>
                    mutation.mutate({
                      key: "g_console",
                      value: config.console ? "0" : "1",
                    })
                  }
                  disabled={mutation.isPending}
                />
              </ItemActions>
            </Item>
          </ItemGroup>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Save Files
          </h3>
          <ItemGroup>
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Save Format</ItemTitle>
                <ItemDescription>
                  Controls the format the game writes saves in. Encrypted is the game default. Plaintext is human-readable. Editing a save here always writes plaintext, but the game re-encrypts on its next save.
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <NativeSelect
                  value={String(config.save_format)}
                  onChange={(e) =>
                    mutation.mutate({
                      key: "g_save_format",
                      value: e.target.value,
                    })
                  }
                  disabled={mutation.isPending}
                  className="w-44"
                >
                  <option value="0">Encrypted (Default)</option>
                  <option value="2">Plaintext</option>
                </NativeSelect>
              </ItemActions>
            </Item>

            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Open config.cfg</ItemTitle>
                <ItemDescription>
                  Opens the file in your system's default editor for advanced
                  settings not exposed here.
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await openPath(config.config_path);
                    } catch (err) {
                      toast.error(`Could not open config.cfg: ${formatError(err)}`);
                    }
                  }}
                >
                  <IconExternalLink className="size-3.5" />
                  Open
                </Button>
              </ItemActions>
            </Item>
          </ItemGroup>
        </div>
    </div>
  );
}
