import { createFileRoute } from "@tanstack/react-router";
import { ProfileOverview } from "@/features/profiles/profile-overview";
import { useProfileState } from "@/lib/profile-context";
import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { IconHandClick } from "@tabler/icons-react";

export const Route = createFileRoute("/overview")({
  component: OverviewPage,
});

function OverviewPage() {
  const { selectedProfile, selectedInstallation, setSelectedProfile } =
    useProfileState();

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
    <ProfileOverview
      profile={selectedProfile}
      installation={selectedInstallation}
      onProfileDeleted={() => setSelectedProfile(null)}
    />
  );
}
