import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useSavePath } from "@/features/editor/use-save-path";
import { useSaveData } from "@/hooks/use-save";
import { TrucksTable } from "@/features/editor/trucks-table";

export const Route = createFileRoute("/editor/$saveId/trucks")({
  component: TrucksTab,
});

function TrucksTab() {
  const { saveId } = Route.useParams();
  const savePath = useSavePath(saveId);
  const { data } = useSaveData(savePath ?? undefined);

  if (!savePath || !data) return null;

  return (
    <>
      <TrucksTable
        savePath={savePath}
        trucks={data.trucks}
        playerTruckId={data.player.assigned_truck_id}
        saveId={saveId}
      />
      {/* The detail Sheet lives inside the $truckId child route — it mounts
          when the route matches and unmounts on close-navigation. */}
      <Outlet />
    </>
  );
}
