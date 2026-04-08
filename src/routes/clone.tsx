import { createFileRoute } from "@tanstack/react-router";
import { ProfileClone } from "@/features/profiles/profile-clone";
import { useProfileState } from "@/lib/profile-context";
import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { IconHandClick } from "@tabler/icons-react";

export const Route = createFileRoute("/clone")({
  component: ClonePage,
});

function ClonePage() {
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
    <ProfileClone
      profile={selectedProfile}
      installation={selectedInstallation}
    />
  );
}
