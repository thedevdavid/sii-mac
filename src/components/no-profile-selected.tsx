import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/cupertino/empty";
import { IconHandClick } from "@tabler/icons-react";

export function NoProfileSelected() {
  return (
    <Empty className="h-full border-0">
      <EmptyMedia>
        <IconHandClick className="size-7 text-muted-foreground" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>No profile selected</EmptyTitle>
        <EmptyDescription>
          Use the profile switcher to select a game and profile.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
