import { createFileRoute } from "@tanstack/react-router";
import { ProfileBackups } from "@/features/profiles/profile-backups";
import { useProfileState } from "@/lib/profile-context";
import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { IconHandClick } from "@tabler/icons-react";

export const Route = createFileRoute("/backups")({
  component: BackupsPage,
});

function BackupsPage() {
  const { selectedProfile, selectedInstallation } = useProfileState();

  if (!selectedProfile || !selectedInstallation) {
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

  return (
    <ProfileBackups
      profile={selectedProfile}
      installation={selectedInstallation}
    />
  );
}
