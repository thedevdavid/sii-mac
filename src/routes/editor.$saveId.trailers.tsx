import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useSavePath } from "@/features/editor/use-save-path";
import { useSaveData } from "@/hooks/use-save";
import { TrailersTable } from "@/features/editor/trailers-table";

export const Route = createFileRoute("/editor/$saveId/trailers")({
  component: TrailersTab,
});

function TrailersTab() {
  const { saveId } = Route.useParams();
  const savePath = useSavePath(saveId);
  const { data } = useSaveData(savePath ?? undefined);

  if (!savePath || !data) return null;

  return (
    <>
      <TrailersTable
        savePath={savePath}
        trailers={data.trailers}
        playerTrailerId={data.player.assigned_trailer_id}
        saveId={saveId}
      />
      <Outlet />
    </>
  );
}
