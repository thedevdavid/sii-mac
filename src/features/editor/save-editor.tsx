import { useSaveData } from "@/hooks/use-save";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/cupertino/tabs";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { IconAlertTriangle } from "@tabler/icons-react";
import { isGarageOwned } from "@/features/editor/types";
import type { SavePath } from "@/lib/core-types";
import { PlayerEditor } from "./player-editor";
import { TrucksTable } from "./trucks-table";
import { TrailersTable } from "./trailers-table";
import { WorldEditor } from "./world-editor";

interface SaveEditorProps {
  savePath: SavePath;
  saveName: string;
  game: "ats" | "ets2";
}

export function SaveEditor({ savePath, saveName, game }: SaveEditorProps) {
  const { data, isLoading, error } = useSaveData(savePath);

  if (isLoading) {
    return (
      <div className="space-y-5 p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Empty className="h-full border-0">
        <EmptyMedia>
          <IconAlertTriangle className="size-7 text-destructive" />
        </EmptyMedia>
        <EmptyTitle>Failed to load save</EmptyTitle>
        <EmptyDescription>
          {error instanceof Error ? error.message : "Could not decode game.sii"}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{saveName}</h2>
          <span className="text-xs text-muted-foreground">
            ${data.bank.money_account.toLocaleString()} &middot;{" "}
            {data.trucks.length} trucks &middot; {data.trailers.length} trailers
          </span>
        </div>

        <Tabs defaultValue="player">
          <TabsList>
            <TabsTrigger value="player">Player</TabsTrigger>
            <TabsTrigger value="trucks">
              Trucks
              <Badge variant="secondary" className="ml-1.5">
                {data.trucks.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="trailers">
              Trailers
              <Badge variant="secondary" className="ml-1.5">
                {data.trailers.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="world">
              World
              <Badge variant="secondary" className="ml-1.5">
                {data.garages.filter((g) => isGarageOwned(g.status)).length}/
                {data.garages.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="player" className="mt-4">
            <PlayerEditor
              savePath={savePath}
              bank={data.bank}
              player={data.player}
              economy={data.economy}
              game={game}
            />
          </TabsContent>

          <TabsContent value="trucks" className="mt-4">
            <TrucksTable
              savePath={savePath}
              trucks={data.trucks}
              playerTruckId={data.player.assigned_truck_id}
            />
          </TabsContent>

          <TabsContent value="trailers" className="mt-4">
            <TrailersTable
              savePath={savePath}
              trailers={data.trailers}
              playerTrailerId={data.player.assigned_trailer_id}
            />
          </TabsContent>

          <TabsContent value="world" className="mt-4">
            <WorldEditor
              savePath={savePath}
              garages={data.garages}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
