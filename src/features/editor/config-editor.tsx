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
} from "@/components/ui/empty";
import { IconAlertTriangle } from "@tabler/icons-react";
import { getGameConfig } from "@/lib/tauri-commands";
import { useUpdateGameConfig } from "@/hooks/use-mutations";
import { NativeSelect } from "@/components/ui/native-select";
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
                  Plaintext saves are editable with text editors. Binary saves are smaller but encrypted.
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
                  className="w-40"
                >
                  <option value="0">Binary (Default)</option>
                  <option value="2">Plaintext</option>
                </NativeSelect>
              </ItemActions>
            </Item>
          </ItemGroup>
        </div>
    </div>
  );
}
