import { createFileRoute } from "@tanstack/react-router";
import { ProfileSaves } from "@/features/profiles/profile-saves";
import { useProfileState } from "@/lib/profile-context";
import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { IconHandClick } from "@tabler/icons-react";

export const Route = createFileRoute("/saves")({
  component: SavesPage,
});

function SavesPage() {
  const { selectedProfile } = useProfileState();

  if (!selectedProfile) {
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

  return <ProfileSaves profile={selectedProfile} />;
}
