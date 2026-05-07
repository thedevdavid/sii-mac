import { createFileRoute } from "@tanstack/react-router";
import { useSavePath } from "@/features/editor/use-save-path";
import { useSaveData } from "@/hooks/use-save";
import { useProfileState } from "@/lib/profile-context";
import { PlayerEditor } from "@/features/editor/player-editor";

export const Route = createFileRoute("/editor/$saveId/player")({
  component: PlayerTab,
});

function PlayerTab() {
  const { saveId } = Route.useParams();
  const savePath = useSavePath(saveId);
  const { data } = useSaveData(savePath ?? undefined);
  const { selectedInstallation } = useProfileState();

  if (!savePath || !data) return null;

  return (
    <PlayerEditor
      savePath={savePath}
      bank={data.bank}
      player={data.player}
      economy={data.economy}
      game={selectedInstallation?.game ?? "ats"}
    />
  );
}
