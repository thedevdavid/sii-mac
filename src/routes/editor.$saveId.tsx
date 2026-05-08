import { createFileRoute, Outlet } from "@tanstack/react-router";
import { NoProfileSelected } from "@/components/no-profile-selected";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/cupertino/empty";
import { IconAlertTriangle } from "@tabler/icons-react";
import { EditorTabsNav } from "@/features/editor/editor-tabs-nav";
import { SaveRestoreDialog } from "@/features/editor/save-restore-dialog";
import { useSavePath } from "@/features/editor/use-save-path";
import { useSaveData } from "@/hooks/use-save";
import { useProfileState } from "@/lib/profile-context";
import { prettifySaveDir } from "@/lib/save-utils";

export const Route = createFileRoute("/editor/$saveId")({
  component: EditorLayout,
});

function EditorLayout() {
  const { saveId } = Route.useParams();
  const { selectedProfile } = useProfileState();
  const savePath = useSavePath(saveId);
  const { data, isLoading, error } = useSaveData(savePath ?? undefined);

  if (!selectedProfile) {
    return <NoProfileSelected />;
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        <header className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">{prettifySaveDir(saveId)}</h2>
            {data && (
              <span className="text-xs text-muted-foreground">
                ${data.bank.money_account.toLocaleString()} &middot;{" "}
                {data.trucks.length} trucks &middot; {data.trailers.length} trailers
              </span>
            )}
          </div>
          {savePath && <SaveRestoreDialog savePath={savePath} />}
        </header>

        <EditorTabsNav />

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ) : error || !data ? (
          <Empty className="border-0">
            <EmptyMedia>
              <IconAlertTriangle className="size-7 text-destructive" />
            </EmptyMedia>
            <EmptyTitle>Failed to load save</EmptyTitle>
            <EmptyDescription>
              {error instanceof Error ? error.message : "Could not decode game.sii"}
            </EmptyDescription>
          </Empty>
        ) : (
          <Outlet />
        )}
      </div>
    </ScrollArea>
  );
}
