import { useProfileDetail } from "@/hooks/use-profiles";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/cupertino/scroll-area";
import { Button } from "@/components/cupertino/button";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import { IconDeviceFloppy, IconPencil, IconFolderOpen } from "@tabler/icons-react";
import { revealInFinder } from "@/lib/opener";
import { getSaveType } from "@/lib/save-utils";
import { Link } from "@tanstack/react-router";
import type { ProfileSummary } from "@/features/profiles/types";

interface ProfileSavesProps {
  profile: ProfileSummary;
}

export function ProfileSaves({ profile }: ProfileSavesProps) {
  const { data: detail, isLoading } = useProfileDetail(profile.path);

  if (isLoading) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!detail) return null;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">
          Saves{" "}
          <span className="text-muted-foreground">
            ({detail.saves.length})
          </span>
        </h2>
        {detail.saves.length === 0 ? (
          <Empty>
            <EmptyMedia>
              <IconDeviceFloppy className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No saves found</EmptyTitle>
            <EmptyDescription>
              This profile has no save files.
            </EmptyDescription>
          </Empty>
        ) : (
          <ItemGroup>
            {detail.saves.map((save) => {
              const saveType = getSaveType(save.directory_name);
              return (
                <Item key={save.path} variant="outline">
                  <ItemMedia variant="icon">
                    <IconDeviceFloppy className="size-4 text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{save.name}</ItemTitle>
                    <ItemDescription>
                      {save.last_modified ?? save.directory_name}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant="secondary" className="text-[10px]">
                      {saveType}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <Link
                          to="/editor/$saveId"
                          params={{ saveId: save.directory_name }}
                        />
                      }
                    >
                      <IconPencil className="size-3" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revealInFinder(save.path)}
                    >
                      <IconFolderOpen className="size-3" />
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </div>
    </ScrollArea>
  );
}
