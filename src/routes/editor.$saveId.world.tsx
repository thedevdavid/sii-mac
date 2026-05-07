import { createFileRoute } from "@tanstack/react-router";
import { useSavePath } from "@/features/editor/use-save-path";
import { useSaveData } from "@/hooks/use-save";
import { WorldEditor } from "@/features/editor/world-editor";

export const Route = createFileRoute("/editor/$saveId/world")({
  component: WorldTab,
});

function WorldTab() {
  const { saveId } = Route.useParams();
  const savePath = useSavePath(saveId);
  const { data } = useSaveData(savePath ?? undefined);

  if (!savePath || !data) return null;

  return <WorldEditor savePath={savePath} garages={data.garages} />;
}
